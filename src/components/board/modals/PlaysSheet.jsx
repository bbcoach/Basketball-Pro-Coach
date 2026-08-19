import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'
import { maxStepOf } from '../../../lib/board-geometry'

function playMeta(p) {
  const steps = p.steps || maxStepOf(p.players.concat([p.ball]))
  return (p.view === 'half' ? 'Halfcourt' : 'Fullcourt') + ' · ' + p.players.length + ' players · ' + (steps === 1 ? '1 step' : steps + ' steps')
}

export default function PlaysSheet() {
  const { state, set, closeSheet, savePlay, loadPlayFromSheet, renamePlay, removePlay, askConfirm } = useApp()
  if (!state.sheetOpen) return null
  const { plays, nameDraft, currentId } = state

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(9,9,11,.96)', display: 'flex', flexDirection: 'column', padding: '60px 20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 10 }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 20, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>My plays</div>
        <div onClick={closeSheet} style={{ padding: '7px 13px', borderRadius: 9, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
        <input
          type="text" value={nameDraft} onChange={(e) => set({ nameDraft: e.target.value })} placeholder="Play name"
          style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        <div onClick={savePlay} style={{ padding: '9px 14px', borderRadius: 9, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {plays.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, background: p.id === currentId ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (p.id === currentId ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)') }}>
            <div onClick={() => loadPlayFromSheet(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{playMeta(p)}</div>
            </div>
            <div onClick={() => renamePlay(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}>✎</div>
            <div onClick={() => askConfirm({ title: 'Delete play', message: `Delete "${p.name}"? This can't be undone.`, onConfirm: () => removePlay(p) })} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}>✕</div>
          </div>
        ))}
        {!plays.length && (
          <div style={{ padding: '16px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No saved plays yet — arrange the court, draw the paths, then name it and hit Save.</div>
        )}
      </div>
    </div>
  )
}
