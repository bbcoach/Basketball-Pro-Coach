import { ACCENT, TEAM_NAME } from '../state/config'
import { COND } from '../theme'
import Logo from './Logo'

export default function ScreenHeader({ title, line, onClose, closeLabel = 'Menu' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 18px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Logo size={30} iconSize={22} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 15, lineHeight: 1.04, color: ACCENT, textTransform: 'uppercase', letterSpacing: '.5px' }}>{TEAM_NAME}</div>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 22, lineHeight: 1.04, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 1 }}>{title}</div>
          {line && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>}
        </div>
      </div>
      <div onClick={onClose} style={{ padding: '7px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>{closeLabel}</div>
    </div>
  )
}
