import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { backupText, buildBackup, parseBackup, applyBackup } from '../lib/backup'
import { encodeFrames, collectFrame, decodeFrames } from '../lib/transfer'
import { encodeQr, decodeQrFrame } from '../lib/qr'
import { generateSyncKey, pushToCloud, pullFromCloud, deleteFromCloud, loadSyncKey, saveSyncKey, clearSyncKey } from '../lib/cloudSync'
import { keycap, field, centred } from '../theme'

// How long one QR code stays on screen before the sender cycles to the
// next one. A real camera reads far faster than this — the ceiling here is
// jsQR's own decode cost on the *scanning* side, run on every frame — so
// this just needs to comfortably outlast that, not match camera frame rate.
const FRAME_MS = 380

// Owns the camera for as long as it's mounted: opens it on mount, decodes
// every frame it can and reports each one back (there is no "found it,
// stop" here — the sender may be cycling through several codes, so the
// same scanner instance has to keep reading for as long as pieces are still
// missing), and stops the stream on unmount no matter how that happens (a
// completed scan, a Cancel tap, or the whole modal closing).
function QrScanner({ onFrame }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let stream
    let raf
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = () => {
      if (stopped) return
      const v = videoRef.current
      if (v && v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth) {
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        ctx.drawImage(v, 0, 0)
        const text = decodeQrFrame(ctx.getImageData(0, 0, canvas.width, canvas.height))
        if (text) onFrame(text)
      }
      raf = requestAnimationFrame(tick)
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        videoRef.current.srcObject = s
        videoRef.current.play()
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setError("Couldn't open the camera — check that this site is allowed to use it."))

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <div style={{ fontSize: 12, color: '#d9843c', lineHeight: 1.5, padding: '20px 4px' }}>{error}</div>
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '1' }}>
      {/* playsInline keeps iOS Safari from taking the video fullscreen, which
          would cover the very UI telling the coach what they're pointing
          the camera at. */}
      <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

function QrDisplay({ text }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let cancelled = false
    encodeQr(text).then((url) => { if (!cancelled) setSrc(url) })
    return () => { cancelled = true }
  }, [text])
  if (!src) return <div style={{ aspectRatio: '1', borderRadius: 14, background: 'rgba(255,255,255,.06)' }} />
  return <img src={src} alt="" style={{ width: '100%', display: 'block', borderRadius: 14 }} />
}

const Step = ({ title, children }) => (
  <>
    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', margin: '2px 0 12px', lineHeight: 1.5 }}>{title}</div>
    {children}
  </>
)

const BigButton = (props) => (
  <div {...props} style={{ padding: 11, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginTop: 14, ...props.style }} />
)
const QuietButton = (props) => (
  <div {...props} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center', marginTop: 8, ...props.style }} />
)

export default function DeviceSyncModal() {
  const { closeSync } = useApp()
  const [mode, setMode] = useState('choose')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const [frames, setFrames] = useState(null)
  const [frameIdx, setFrameIdx] = useState(0)
  const [progress, setProgress] = useState({ have: 0, total: null })

  // Cloud sync's own bit of state — a key this device either already has
  // (loaded once, not re-read every render) or doesn't.
  const [cloudKey, setCloudKey] = useState(loadSyncKey)
  const [joinInput, setJoinInput] = useState('')
  const [pulledFromCloud, setPulledFromCloud] = useState(false)

  const collectedRef = useRef({ n: null, chunks: new Map() })
  const doneRef = useRef(false)
  // Both async steps here — preparing the QR frames, and decoding+parsing
  // once a scan completes — are short, but not instant, and a coach hitting
  // Cancel (or Try again right after a failure) doesn't wait for them.
  // Every attempt captures this counter when it starts; bumping it on
  // reset/close means a stale attempt's result can tell it's no longer the
  // one on screen and quietly drop itself, instead of clobbering whatever
  // the coach's next attempt is showing by the time it resolves.
  const attemptRef = useRef(0)

  const reset = () => { attemptRef.current++; setError(''); setPending(null); setFrames(null); setFrameIdx(0); setPulledFromCloud(false); setJoinInput(''); setMode('choose') }
  const close = () => { reset(); closeSync() }
  const fail = (attempt, msg) => { if (attempt !== attemptRef.current) return; setError(msg); setMode('error') }

  // ── sending: prepare the frames, then just cycle through them ──
  const beginSend = async () => {
    const attempt = ++attemptRef.current
    setMode('send-prep')
    try {
      const f = await encodeFrames(backupText())
      if (attempt !== attemptRef.current) return
      setFrames(f)
      setFrameIdx(0)
      setMode('send-showing')
    } catch {
      fail(attempt, "Couldn't prepare the data on this device.")
    }
  }

  useEffect(() => {
    if (mode !== 'send-showing' || !frames || frames.length <= 1) return undefined
    const id = setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), FRAME_MS)
    return () => clearInterval(id)
  }, [mode, frames])

  // ── receiving: scan until every piece has arrived ──
  const beginReceive = () => {
    attemptRef.current++
    collectedRef.current = { n: null, chunks: new Map() }
    doneRef.current = false
    setProgress({ have: 0, total: null })
    setMode('recv-scan')
  }

  const finishReceive = async (base64Text, attempt) => {
    setMode('recv-processing')
    try {
      const json = await decodeFrames(base64Text)
      if (attempt !== attemptRef.current) return
      setPending(parseBackup(json))
      setMode('recv-confirm')
    } catch {
      fail(attempt, "That didn't look like Basketball Pro Coach data.")
    }
  }

  const onFrame = (text) => {
    if (doneRef.current) return
    const result = collectFrame(collectedRef.current, text)
    setProgress({ have: collectedRef.current.chunks.size, total: collectedRef.current.n })
    if (result) { doneRef.current = true; finishReceive(result, attemptRef.current) }
  }

  const confirmRestore = () => {
    applyBackup(pending)
    setMode('recv-done')
    setTimeout(() => window.location.reload(), 500)
  }

  // ── cloud sync: a key this device holds is both the address and the
  // password for one slot in the Worker's KV store. Turning it on, joining
  // an existing one, pushing and pulling are all the same handful of calls
  // in cloudSync.js — this is just the UI wrapped around them, using the
  // exact same confirm-before-overwrite screen (recv-confirm/pending) the
  // QR receive flow already has, since "replace everything on this device"
  // means the same thing regardless of which wire it came in on.
  const openCloud = () => { attemptRef.current++; setError(''); setMode('cloud-menu') }

  const startCloudSync = async () => {
    const attempt = ++attemptRef.current
    setMode('cloud-busy')
    try {
      const key = generateSyncKey()
      await pushToCloud(key, buildBackup())
      if (attempt !== attemptRef.current) return
      saveSyncKey(key)
      setCloudKey(key)
      setMode('cloud-key')
    } catch {
      fail(attempt, "Couldn't reach the cloud sync service — check the connection and try again.")
    }
  }

  const pushNow = async () => {
    const attempt = ++attemptRef.current
    setMode('cloud-busy')
    try {
      await pushToCloud(cloudKey, buildBackup())
      if (attempt !== attemptRef.current) return
      setMode('cloud-push-done')
    } catch {
      fail(attempt, "Couldn't reach the cloud sync service — check the connection and try again.")
    }
  }

  // Only persists the key once a pull off it actually succeeds — a
  // mistyped join shouldn't leave this device pointed at a key that isn't
  // really the one its other devices are using.
  const pullWith = async (key, attempt) => {
    setMode('cloud-busy')
    try {
      const data = await pullFromCloud(key)
      if (attempt !== attemptRef.current) return
      if (data === null) { fail(attempt, "Nothing's been pushed to this sync key yet."); return }
      saveSyncKey(key)
      setCloudKey(key)
      setPending(parseBackup(data))
      setPulledFromCloud(true)
      setMode('recv-confirm')
    } catch {
      fail(attempt, "Couldn't read that — either the sync key's wrong, or the connection dropped.")
    }
  }

  const pullNow = () => pullWith(cloudKey, ++attemptRef.current)

  const joinCloud = () => {
    const key = joinInput.trim()
    if (!key) return
    pullWith(key, ++attemptRef.current)
  }

  const stopCloudSync = (alsoDelete) => async () => {
    const attempt = ++attemptRef.current
    if (alsoDelete) {
      setMode('cloud-busy')
      try { await deleteFromCloud(cloudKey) } catch { /* stopping locally still proceeds either way */ }
      if (attempt !== attemptRef.current) return
    }
    clearSyncKey()
    setCloudKey(null)
    setJoinInput('')
    setMode('cloud-menu')
  }

  const box = (children) => (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Sync devices</div>
        {children}
      </div>
    </div>
  )

  if (mode === 'choose') {
    return box(
      <>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
          Send everything on this device straight to another phone or tablet — one shows a QR code, the other scans it. No cloud, no account, no network needed between them at all. Cloud sync below is the alternative for when the two devices can't be in the same room.
        </div>
        <BigButton onClick={beginSend}>Send to another device</BigButton>
        <BigButton onClick={beginReceive} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Receive from another device</BigButton>
        <BigButton onClick={openCloud} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Cloud sync (optional)</BigButton>
        <QuietButton onClick={close}>Close</QuietButton>
      </>,
    )
  }

  if (mode === 'send-prep') {
    return box(<div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', padding: '24px 4px', textAlign: 'center' }}>Preparing…</div>)
  }

  if (mode === 'send-showing') {
    return box(
      <Step title={frames.length > 1 ? 'Scan this on the other device — it will keep changing, hold both screens steady:' : 'Scan this on the other device:'}>
        <QrDisplay text={frames[frameIdx]} />
        {frames.length > 1 && (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', textAlign: 'center', marginTop: 10 }}>
            Code {frameIdx + 1} of {frames.length}, cycling automatically
          </div>
        )}
        <BigButton onClick={close}>Done</BigButton>
      </Step>,
    )
  }

  if (mode === 'recv-scan') {
    return box(
      <Step title={progress.total ? `Scanning… ${progress.have} of ${progress.total} codes` : 'Point the camera at the code on the other device:'}>
        <QrScanner onFrame={onFrame} />
        <QuietButton onClick={close}>Cancel</QuietButton>
      </Step>,
    )
  }

  if (mode === 'recv-processing') {
    return box(<div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', padding: '24px 4px', textAlign: 'center' }}>Processing…</div>)
  }

  if (mode === 'recv-confirm') {
    return box(
      <>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
          Data from {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : pulledFromCloud ? 'the cloud' : 'the other device'} · {pending.teamCount}{pending.teamCount === 1 ? ' team' : ' teams'}.
          This replaces everything currently on this device — it can't be undone.
        </div>
        <div onClick={confirmRestore} style={{ padding: 11, borderRadius: 12, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Replace everything</div>
        <QuietButton onClick={close}>Cancel</QuietButton>
      </>,
    )
  }

  if (mode === 'recv-done') {
    return box(<div style={{ fontSize: 12.5, color: '#5bbf72', padding: '20px 0', textAlign: 'center' }}>Restored — reloading…</div>)
  }

  if (mode === 'cloud-menu') {
    return box(
      cloudKey ? (
        <>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
            This device syncs with a key it shares with your other devices — no account, and nothing the cloud side can read.
          </div>
          <BigButton onClick={pushNow}>Push this device to the cloud</BigButton>
          <BigButton onClick={pullNow} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Pull from the cloud</BigButton>
          <QuietButton onClick={() => setMode('cloud-key')}>Add another device…</QuietButton>
          <QuietButton onClick={() => setMode('cloud-stop')} style={{ color: '#d9843c' }}>Stop cloud sync</QuietButton>
          <QuietButton onClick={close}>Close</QuietButton>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
            Sync over the internet instead of holding two screens together — a random key, generated on this device, is the only thing that links your devices. Nobody without it, including whoever runs the server, can read what's synced.
          </div>
          <BigButton onClick={startCloudSync}>Turn on cloud sync</BigButton>
          <BigButton onClick={() => setMode('cloud-join')} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>I already have a sync key</BigButton>
          <QuietButton onClick={() => setMode('choose')}>Back</QuietButton>
        </>
      ),
    )
  }

  if (mode === 'cloud-key') {
    return box(
      <Step title="Scan this on your other device (Cloud sync → I already have a sync key), or copy the text below it:">
        <QrDisplay text={cloudKey} />
        <div style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,.6)', background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: '9px 11px', marginTop: 10, wordBreak: 'break-all', userSelect: 'all' }}>
          {cloudKey}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 8, lineHeight: 1.5 }}>
          Anyone with this key can read and overwrite this data — treat it like a password.
        </div>
        <BigButton onClick={() => setMode('cloud-menu')}>Done</BigButton>
      </Step>,
    )
  }

  if (mode === 'cloud-join') {
    return box(
      <Step title="Paste the sync key from your other device:">
        <textarea
          value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder="Sync key" rows={2}
          style={{ width: '100%', ...field(), resize: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        <BigButton onClick={joinCloud} style={joinInput.trim() ? {} : { opacity: 0.5, pointerEvents: 'none' }}>Continue</BigButton>
        <QuietButton onClick={() => setMode('cloud-menu')}>Back</QuietButton>
      </Step>,
    )
  }

  if (mode === 'cloud-stop') {
    return box(
      <>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
          This device stops syncing. Any other device that still has the key keeps working — unless you also delete the data from the cloud, which affects all of them.
        </div>
        <div onClick={stopCloudSync(true)} style={{ ...centred, padding: 11, borderRadius: 12, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Stop and delete the cloud data</div>
        <BigButton onClick={stopCloudSync(false)} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Just stop on this device</BigButton>
        <QuietButton onClick={() => setMode('cloud-menu')}>Cancel</QuietButton>
      </>,
    )
  }

  if (mode === 'cloud-busy') {
    return box(<div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', padding: '24px 4px', textAlign: 'center' }}>Talking to the cloud…</div>)
  }

  if (mode === 'cloud-push-done') {
    return box(
      <>
        <div style={{ fontSize: 12.5, color: '#5bbf72', padding: '20px 0', textAlign: 'center' }}>Pushed — your other devices can now pull this.</div>
        <BigButton onClick={() => setMode('cloud-menu')}>Done</BigButton>
      </>,
    )
  }

  // mode === 'error'
  return box(
    <>
      <div style={{ fontSize: 12.5, color: '#d9843c', margin: '6px 0 16px', lineHeight: 1.5 }}>{error}</div>
      <BigButton onClick={reset}>Try again</BigButton>
      <QuietButton onClick={close}>Close</QuietButton>
    </>,
  )
}
