import { ACCENT } from '../state/config'

// A gray sentence explaining what's missing is easy to read past — this
// pairs it with a button that jumps straight to the fix, so a first-time
// coach lands somewhere useful instead of an apparently-empty screen.
export default function ActionHint({ text, actionLabel, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.75)', lineHeight: 1.4 }}>{text}</div>
      <div onClick={onAction} style={{ flex: 'none', padding: '8px 12px', borderRadius: 9, background: ACCENT, color: '#101012', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{actionLabel}</div>
    </div>
  )
}
