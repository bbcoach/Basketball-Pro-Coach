import { useApp } from '../state/store'

export default function ConfirmModal() {
  const { state, closeConfirm, runConfirm } = useApp()
  const ask = state.confirmAsk
  if (!ask) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 320, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{ask.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>{ask.message}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={runConfirm} style={{ padding: 11, borderRadius: 11, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>{ask.confirmLabel || 'Delete'}</div>
          <div onClick={closeConfirm} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}
