import { useApp } from '../state/store'
import { ACCENT } from '../state/config'

export default function Toast() {
  const { state } = useApp()
  const toast = state.toast
  if (!toast) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', justifyContent: 'center', zIndex: 999, pointerEvents: 'none' }}>
      <div
        key={toast.id}
        className="toast-pop"
        style={{ padding: '10px 18px', borderRadius: 99, background: '#1c1c1f', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 10px 30px rgba(0,0,0,.5)', color: '#fff', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <span style={{ color: ACCENT, fontSize: 13 }}>✓</span>
        {toast.text}
      </div>
    </div>
  )
}
