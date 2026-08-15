import { useApp } from '../state/store'
import { INFO } from '../lib/content'
import { COND } from '../theme'
import Logo from './Logo'

export default function InfoOverlay() {
  const { state, closeInfo } = useApp()
  const info = INFO[state.infoPage]
  if (!info) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 98, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div onClick={closeInfo} style={{ cursor: 'pointer' }}>
            <Logo size={30} iconSize={22} />
          </div>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 22, lineHeight: 1.04, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{info.title}</div>
        </div>
        <div onClick={closeInfo} style={{ padding: '7px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Close</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {info.blocks.map((b, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {b[0] && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: '#e8b13c' }}>{b[0]}</div>}
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.72)' }}>{b[1]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
