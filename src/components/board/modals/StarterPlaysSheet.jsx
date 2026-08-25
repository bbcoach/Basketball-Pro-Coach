import { useApp } from '../../../state/store'
import { COND } from '../../../theme'
import { STARTER_PLAYS } from '../../../data/starterPlays'
import PlayPreview from '../../practice/PlayPreview'

export default function StarterPlaysSheet() {
  const { state, closeStarterPlays, addStarterPlay } = useApp()
  if (!state.starterPlaysOpen) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: 'rgba(9,9,11,.96)', display: 'flex', flexDirection: 'column', padding: '60px 20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 4 }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 20, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Starter plays</div>
        <div onClick={closeStarterPlays} style={{ padding: '7px 13px', borderRadius: 9, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', paddingBottom: 12 }}>A few classic sets to get a new playbook started — tap one to add your own editable copy.</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STARTER_PLAYS.map((sp) => (
          <div key={sp.id} onClick={() => addStarterPlay(sp)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', cursor: 'pointer' }}>
            <div style={{ width: 50, height: 92, flex: 'none', borderRadius: 9, overflow: 'hidden', background: '#8a5e34' }}>
              <PlayPreview play={sp} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{sp.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', lineHeight: 1.4 }}>{sp.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
