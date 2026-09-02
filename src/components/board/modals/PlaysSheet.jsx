import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'
import { maxStepOf } from '../../../lib/board-geometry'
import { kindOf, KIND_LABEL } from '../../../lib/playKind'

function playMeta(p) {
  const steps = p.steps || maxStepOf(p.players.concat([p.ball]))
  return (p.view === 'half' ? 'Halfcourt' : 'Fullcourt') + ' · ' + p.players.length + ' players · ' + (steps === 1 ? '1 step' : steps + ' steps')
}

export default function PlaysSheet() {
  const { state, set, closeSheet, savePlay, loadPlayFromSheet, renamePlay, removePlay, askConfirm, sharePlay, openImport } = useApp()
  if (!state.sheetOpen) return null
  const { plays, nameDraft, currentId, kindDraft, libFilter } = state

  const shown = libFilter === 'all' ? plays : plays.filter((p) => kindOf(p) === libFilter)
  const count = (k) => plays.filter((p) => kindOf(p) === k).length

  const tab = (id, label) => {
    const active = libFilter === id
    return (
      <div
        onClick={() => set({ libFilter: id })}
        style={{
          flex: 1, textAlign: 'center', padding: '7px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: active ? 'rgba(255,255,255,.14)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,.5)',
        }}
      >
        {label}
      </div>
    )
  }
  const seg = (id, label) => {
    const active = kindDraft === id
    return (
      <div
        onClick={() => set({ kindDraft: id })}
        style={{
          padding: '9px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          background: active ? 'rgba(232,177,60,.18)' : 'rgba(255,255,255,.06)', color: active ? ACCENT : 'rgba(255,255,255,.55)',
          border: '1px solid ' + (active ? 'rgba(232,177,60,.5)' : 'rgba(255,255,255,.1)'),
        }}
      >
        {label}
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(9,9,11,.96)', display: 'flex', flexDirection: 'column', padding: '60px 20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 10 }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 20, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>My library</div>
        <div onClick={closeSheet} style={{ padding: '7px 13px', borderRadius: 9, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
        <div onClick={openImport} style={{ flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Import</div>
      </div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
        <input
          type="text" value={nameDraft} onChange={(e) => set({ nameDraft: e.target.value })} placeholder={kindDraft === 'drill' ? 'Drill name' : 'Play name'}
          style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        {seg('play', 'Play')}
        {seg('drill', 'Drill')}
        <div onClick={savePlay} style={{ padding: '9px 14px', borderRadius: 9, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save</div>
      </div>
      <div style={{ display: 'flex', background: 'rgba(255,255,255,.06)', borderRadius: 9, padding: 3, gap: 2, marginBottom: 10 }}>
        {tab('all', 'All ' + plays.length)}
        {tab('play', 'Plays ' + count('play'))}
        {tab('drill', 'Drills ' + count('drill'))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, background: p.id === currentId ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (p.id === currentId ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)') }}>
            <div onClick={() => loadPlayFromSheet(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <div style={{ flex: 'none', padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', background: kindOf(p) === 'drill' ? 'rgba(255,255,255,.12)' : 'rgba(232,177,60,.2)', color: kindOf(p) === 'drill' ? 'rgba(255,255,255,.7)' : ACCENT }}>{KIND_LABEL[kindOf(p)]}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{playMeta(p)}</div>
            </div>
            <div onClick={() => sharePlay(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}>⇪</div>
            <div onClick={() => renamePlay(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}>✎</div>
            <div onClick={() => askConfirm({ title: 'Delete play', message: `Delete "${p.name}"? This can't be undone.`, onConfirm: () => removePlay(p) })} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}>✕</div>
          </div>
        ))}
        {!shown.length && (
          <div style={{ padding: '16px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
            {plays.length
              ? `Nothing filed under ${libFilter === 'drill' ? 'Drills' : 'Plays'} yet.`
              : 'Nothing saved yet — arrange the court, draw the paths, then name it and hit Save.'}
          </div>
        )}
      </div>
    </div>
  )
}
