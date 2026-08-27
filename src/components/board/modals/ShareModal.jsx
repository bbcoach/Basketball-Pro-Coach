import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'

export default function ShareModal() {
  const { state, closeShareModal, doExportPng, doExportSteps } = useApp()
  if (!state.shareOpen) return null
  const { shareStatus, exporting } = state
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: 'rgba(6,6,8,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 330, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Share play</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 14px' }}>{shareStatus}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: exporting ? 0.6 : 1, pointerEvents: exporting ? 'none' : 'auto' }}>
          <div onClick={doExportSteps} style={{ padding: 12, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Step by step (PDF)</div>
          <div onClick={doExportPng} style={{ padding: 12, borderRadius: 11, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Still image (PNG)</div>
          <div onClick={closeShareModal} style={{ padding: 10, borderRadius: 11, background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}
