import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { backupText, parseBackup, applyBackup } from '../lib/backup'
import { encodeFrames, collectFrame, decodeFrames } from '../lib/transfer'
import { encodeQr, decodeQrFrame } from '../lib/qr'

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
  <div {...props} style={{ padding: 11, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginTop: 14, ...props.style }} />
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

  const reset = () => { attemptRef.current++; setError(''); setPending(null); setFrames(null); setFrameIdx(0); setMode('choose') }
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
          Send everything on this device straight to another phone or tablet — one shows a QR code, the other scans it. No cloud, no account, no network needed between them at all.
        </div>
        <BigButton onClick={beginSend}>Send to another device</BigButton>
        <BigButton onClick={beginReceive} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Receive from another device</BigButton>
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
          Data from {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : 'the other device'} · {pending.teamCount}{pending.teamCount === 1 ? ' team' : ' teams'}.
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

  // mode === 'error'
  return box(
    <>
      <div style={{ fontSize: 12.5, color: '#d9843c', margin: '6px 0 16px', lineHeight: 1.5 }}>{error}</div>
      <BigButton onClick={reset}>Try again</BigButton>
      <QuietButton onClick={close}>Close</QuietButton>
    </>,
  )
}
