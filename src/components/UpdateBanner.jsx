import { useEffect, useState } from 'react'
import { ACCENT } from '../state/config'
import { keycap } from '../theme'
import { applyUpdate, isUpdateReady, subscribeUpdate } from '../lib/appUpdate'

// "A new version is ready" — shown the moment the service worker has one
// waiting, whichever screen the coach is on. Updating restarts the app; Later
// hides the bar until the next one turns up (or the app is opened again).
export default function UpdateBanner() {
  const [ready, setReady] = useState(isUpdateReady())
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => subscribeUpdate(() => { setReady(isUpdateReady()); setHidden(false) }), [])
  if (!ready || hidden) return null
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, top: 'calc(var(--safe-top, 0px) + 8px)', zIndex: 998, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div role="status" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: '#1c1c1f', border: '1px solid rgba(232,177,60,.4)', boxShadow: '0 10px 30px rgba(0,0,0,.55)', color: '#fff', maxWidth: 440, width: '100%' }}>
        <div style={{ fontSize: 17, lineHeight: 1, flex: 'none', color: ACCENT }}>⟳</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>
          New version ready
          <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.55)' }}>Updating restarts the app.</div>
        </div>
        <div
          onClick={() => { if (busy) return; setBusy(true); applyUpdate() }}
          style={{ flex: 'none', padding: '8px 12px', borderRadius: 9, ...keycap(), color: '#101012', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Updating…' : 'Update'}
        </div>
        {!busy && (
          <div onClick={() => setHidden(true)} style={{ flex: 'none', padding: '8px 6px', color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Later
          </div>
        )}
      </div>
    </div>
  )
}
