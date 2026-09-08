import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { backupText, parseBackup, applyBackup } from '../lib/backup'
import { startSend, respondToOffer, finishSend, sendPayload, receivePayload, waitForOpen } from '../lib/deviceSync'
import { encodeQr, decodeQrFrame } from '../lib/qr'

// How long to wait for a step that depends on the *other* device doing
// something (scanning a code, being on the same Wi-Fi at all) before giving
// up and showing a way back out, rather than a spinner that never resolves.
const CONNECT_TIMEOUT_MS = 25000

// Owns the camera for as long as it's mounted: opens it on mount, scans
// every frame for a QR code, and stops the stream on unmount no matter how
// that happens (a decode, a Cancel tap, or the whole modal closing) — a
// camera left running after the user has moved on is the kind of bug that's
// invisible in a code review and glaring on an actual phone.
function QrScanner({ onDecode }) {
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
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const text = decodeQrFrame(frame)
        if (text) { stopped = true; onDecode(text); return }
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
  const pcRef = useRef(null)
  const dataRef = useRef(null) // { offerText | answerText } to display as QR
  // The handshake steps below hold open a chain of awaits — a camera
  // permission prompt, up to CONNECT_TIMEOUT_MS of waiting for the other
  // device — that can easily outlive the attempt it belongs to, whether
  // because the coach hit Cancel (unmounting this component) or hit "Try
  // again" (restarting in place, no unmount at all). Every attempt captures
  // the current generation when it starts; bumping it on reset/close/unmount
  // means a stale chain's callback can tell it no longer owns the screen and
  // quietly stop, instead of a late "Couldn't connect" clobbering whatever
  // the coach's new attempt is showing by then.
  const genRef = useRef(0)

  useEffect(() => () => { genRef.current++; pcRef.current?.close(); pcRef.current = null }, [])

  const reset = () => { genRef.current++; pcRef.current?.close(); pcRef.current = null; dataRef.current = null; setError(''); setPending(null); setMode('choose') }
  const fail = (gen, msg) => { if (gen !== genRef.current) return; pcRef.current?.close(); pcRef.current = null; setError(msg); setMode('error') }
  const close = () => { reset(); closeSync() }

  // ── sending ──────────────────────────────────────────────
  const beginSend = async () => {
    const gen = genRef.current
    setMode('send-offer')
    try {
      const { pc, channel, offerText } = await startSend()
      if (gen !== genRef.current) { pc.close(); return }
      pcRef.current = pc
      dataRef.current = { channel, offerText }
      setMode('send-offer-ready')
    } catch {
      fail(gen, "Couldn't start the connection on this device.")
    }
  }

  const onScannedAnswer = async (answerText) => {
    const gen = genRef.current
    const pc = pcRef.current
    const { channel } = dataRef.current
    setMode('send-connecting')
    try {
      await finishSend(pc, answerText)
      await Promise.race([
        waitForOpen(channel),
        new Promise((_, reject) => setTimeout(() => reject(), CONNECT_TIMEOUT_MS)),
      ])
      if (gen !== genRef.current) return
      setMode('send-transfer')
      await sendPayload(channel, backupText())
      if (gen !== genRef.current) return
      setMode('send-done')
    } catch {
      fail(gen, "Couldn't connect — make sure both devices are on the same Wi-Fi and try again.")
    }
  }

  // ── receiving ────────────────────────────────────────────
  const beginReceive = () => setMode('recv-scan')

  const onScannedOffer = async (offerText) => {
    const gen = genRef.current
    setMode('recv-connecting')
    try {
      const { pc, channelPromise, answerText } = await respondToOffer(offerText)
      if (gen !== genRef.current) { pc.close(); return }
      pcRef.current = pc
      dataRef.current = { answerText }
      setMode('recv-answer-ready')
      const channel = await Promise.race([
        channelPromise,
        new Promise((_, reject) => setTimeout(() => reject(), CONNECT_TIMEOUT_MS)),
      ])
      if (gen !== genRef.current) return
      receivePayload(channel, (text) => {
        if (gen !== genRef.current) return
        try {
          setPending(parseBackup(text))
          setMode('recv-confirm')
        } catch {
          fail(gen, "That didn't look like Basketball Pro Coach data.")
        }
      })
    } catch {
      fail(gen, "Couldn't connect — make sure both devices are on the same Wi-Fi and try again.")
    }
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
          Send everything on this device straight to another phone or tablet — no cloud, no account. Both devices need to be on the same Wi-Fi (or one hotspotting to the other), close enough to scan each other's screen.
        </div>
        <BigButton onClick={beginSend}>Send to another device</BigButton>
        <BigButton onClick={beginReceive} style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>Receive from another device</BigButton>
        <QuietButton onClick={close}>Close</QuietButton>
      </>,
    )
  }

  if (mode === 'send-offer' || mode === 'send-offer-ready') {
    return box(
      <Step title="On the other device, choose “Receive from another device” and scan this:">
        {mode === 'send-offer-ready' ? <QrDisplay text={dataRef.current.offerText} /> : <div style={{ aspectRatio: '1', borderRadius: 14, background: 'rgba(255,255,255,.06)' }} />}
        <BigButton onClick={() => setMode('send-scan')} style={mode !== 'send-offer-ready' ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>It showed me a code back →</BigButton>
        <QuietButton onClick={close}>Cancel</QuietButton>
      </Step>,
    )
  }

  if (mode === 'send-scan') {
    return box(
      <Step title="Now scan the code the other device is showing:">
        <QrScanner onDecode={onScannedAnswer} />
        <QuietButton onClick={close}>Cancel</QuietButton>
      </Step>,
    )
  }

  if (mode === 'send-connecting' || mode === 'send-transfer') {
    return box(
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', padding: '24px 4px', textAlign: 'center' }}>
        {mode === 'send-connecting' ? 'Connecting…' : 'Sending…'}
      </div>,
    )
  }

  if (mode === 'send-done') {
    return box(
      <>
        <div style={{ fontSize: 12.5, color: '#5bbf72', padding: '10px 0 4px', lineHeight: 1.5 }}>Sent. The other device now has everything from this one.</div>
        <BigButton onClick={close}>Done</BigButton>
      </>,
    )
  }

  if (mode === 'recv-scan') {
    return box(
      <Step title="Scan the code the other device is showing:">
        <QrScanner onDecode={onScannedOffer} />
        <QuietButton onClick={close}>Cancel</QuietButton>
      </Step>,
    )
  }

  if (mode === 'recv-connecting' || (mode === 'recv-answer-ready' && !dataRef.current)) {
    return box(<div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', padding: '24px 4px', textAlign: 'center' }}>Connecting…</div>)
  }

  if (mode === 'recv-answer-ready') {
    return box(
      <Step title="Show this back to the other device:">
        <QrDisplay text={dataRef.current.answerText} />
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', textAlign: 'center', marginTop: 12 }}>Waiting to receive…</div>
        <QuietButton onClick={close}>Cancel</QuietButton>
      </Step>,
    )
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
