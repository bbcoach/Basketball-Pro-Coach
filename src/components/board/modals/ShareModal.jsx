import { useApp } from '../../../state/store'
import {COND, keycap} from '../../../theme'
import { webgl3dSupported } from '../../../board3d/support'

export default function ShareModal() {
  const { state, closeShareModal, doExportSteps, doExportVideo, doExportVideo3d, shareCurrentPlay } = useApp()
  if (!state.shareOpen) return null
  const { shareStatus, videoExporting } = state
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: 'rgba(6,6,8,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 330, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Share play</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 14px' }}>{shareStatus}</div>
        {videoExporting ? (
          <>
            <div style={{ padding: '18px 0 4px', textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>Takes a few seconds — safe to close this and keep editing.</div>
            <div onClick={closeShareModal} style={{ padding: 10, borderRadius: 12, background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Close</div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div onClick={doExportSteps} style={{ padding: 12, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Step by step (PDF)</div>
            <div onClick={doExportVideo} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Animation (video)</div>
            {webgl3dSupported() && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={() => doExportVideo3d(false)} style={{ flex: 1, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>3D video<div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>Upright · phone</div></div>
                <div onClick={() => doExportVideo3d(true)} style={{ flex: 1, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>3D video<div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>Wide · screen</div></div>
              </div>
            )}
            <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '4px 0 2px' }} />
            <div onClick={shareCurrentPlay} style={{ padding: '11px 12px', borderRadius: 12, background: 'rgba(232,177,60,.14)', border: '1px solid rgba(232,177,60,.35)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
              For other coaches (file / code)
              <div style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>They import it in their own app and can edit it</div>
            </div>
            <div onClick={closeShareModal} style={{ padding: 10, borderRadius: 12, background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
          </div>
        )}
      </div>
    </div>
  )
}
