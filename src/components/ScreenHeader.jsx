import { COND } from '../theme'
import Logo from './Logo'

// The app name used to sit above the title on every single inner screen, in
// accent, on its own line — competing with the one word the coach actually
// came looking for ("STAT TRACKER") and costing a line of height on a phone
// six screens over. The logo beside it already says which app this is, so
// the name belongs on the home screen and nowhere else. The title takes the
// space it frees, at the same 26px the home screen uses.
export default function ScreenHeader({ title, line, onClose, closeLabel = 'Menu' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 18px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div onClick={onClose} style={{ cursor: 'pointer' }}>
          <Logo size={30} iconSize={22} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 26, lineHeight: 1.02, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{title}</div>
          {line && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>}
        </div>
      </div>
      <div onClick={onClose} style={{ padding: '7px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>{closeLabel}</div>
    </div>
  )
}
