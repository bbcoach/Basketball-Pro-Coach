import { useApp } from '../state/store'
import { ACCENT } from '../state/config'

export default function RosterEditor({ emptyHint, grow = true }) {
  const { state, set, addPlayer, editPlayer, cancelEditPlayer, removePlayer } = useApp()
  const { roster, nameIn, numIn, editId } = state

  return (
    <div style={{ flex: grow ? 1 : 'none', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
        <input
          type="text" value={numIn} onChange={(e) => set({ numIn: e.target.value })} placeholder="#"
          style={{ width: 54, flex: 'none', padding: '10px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, textAlign: 'center', outline: 'none' }}
        />
        <input
          type="text" value={nameIn} onChange={(e) => set({ nameIn: e.target.value })} placeholder="Player name"
          style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        <div onClick={addPlayer} style={{ padding: '10px 14px', borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{editId ? 'Save' : 'Add'}</div>
        {editId && <div onClick={cancelEditPlayer} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
      </div>
      <div style={{ flex: grow ? 1 : 'none', minHeight: 0, overflowY: grow ? 'auto' : 'visible', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {roster.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 11, background: editId === p.id ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (editId === p.id ? ACCENT : 'rgba(255,255,255,.08)') }}>
            <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.10)', color: '#fff', fontWeight: 700, fontSize: 15 }}>{p.num}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div onClick={() => editPlayer(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
            <div onClick={() => removePlayer(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
          </div>
        ))}
        {!roster.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{emptyHint}</div>}
      </div>
    </div>
  )
}
