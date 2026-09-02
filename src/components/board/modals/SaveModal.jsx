import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'

export default function SaveModal() {
  const { state, set, closeSave, savePlay } = useApp()
  if (!state.saveOpen) return null
  const { renameId, nameDraft, kindDraft } = state
  const seg = (id, label, sub) => {
    const active = kindDraft === id
    return (
      <div
        onClick={() => set({ kindDraft: id })}
        style={{
          flex: 1, textAlign: 'center', padding: '9px 6px', borderRadius: 9, cursor: 'pointer',
          background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.7)',
          border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.1)'),
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 10, fontWeight: 500, opacity: active ? 0.65 : 0.5, marginTop: 1 }}>{sub}</div>
      </div>
    )
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 95, background: 'rgba(6,6,8,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 330, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{renameId ? 'Rename' : 'Save to library'}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 12px' }}>{renameId ? 'Rename it, or file it somewhere else' : 'Stored in your library on this device'}</div>
        <input
          type="text" value={nameDraft} onChange={(e) => set({ nameDraft: e.target.value })} placeholder={kindDraft === 'drill' ? 'e.g. 3-man weave' : 'e.g. Horns Flare'} autoFocus
          style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {seg('play', 'Play', 'For the game')}
          {seg('drill', 'Drill', 'For practice')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div onClick={closeSave} style={{ flex: 1, textAlign: 'center', padding: '11px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.8)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</div>
          <div onClick={savePlay} style={{ flex: 1, textAlign: 'center', padding: '11px 12px', borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</div>
        </div>
      </div>
    </div>
  )
}
