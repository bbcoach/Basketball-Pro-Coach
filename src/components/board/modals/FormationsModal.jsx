import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'
import { FORMATIONS } from '../../../lib/formations'

export default function FormationsModal() {
  const { state, closeFormations, applyFormation } = useApp()
  if (!state.formOpen) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: 'rgba(6,6,8,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
      <div style={{ width: '100%', maxWidth: 340, maxHeight: '100%', overflowY: 'auto', background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Formations</div>
          <div onClick={closeFormations} style={{ padding: '6px 11px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Close</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FORMATIONS.map((fm) => (
            <div key={fm.id} onClick={() => applyFormation(fm)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: fm.side === 'off' ? ACCENT : '#c8d1d8', color: '#101012', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: COND, fontWeight: 700, fontSize: 13 }}>{fm.tag}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{fm.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{fm.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
