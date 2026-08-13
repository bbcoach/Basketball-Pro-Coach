import { useApp } from '../../../state/store'
import { ACCENT } from '../../../state/config'
import { COND } from '../../../theme'

export default function SaveModal() {
  const { state, set, closeSave, savePlay } = useApp()
  if (!state.saveOpen) return null
  const { renameId, nameDraft } = state
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 95, background: 'rgba(6,6,8,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 330, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{renameId ? 'Rename play' : 'Save play'}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 12px' }}>{renameId ? 'Give this play a new name' : 'Stored in your library on this device'}</div>
        <input
          type="text" value={nameDraft} onChange={(e) => set({ nameDraft: e.target.value })} placeholder="e.g. Horns Flare" autoFocus
          style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div onClick={closeSave} style={{ flex: 1, textAlign: 'center', padding: '11px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.8)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</div>
          <div onClick={savePlay} style={{ flex: 1, textAlign: 'center', padding: '11px 12px', borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</div>
        </div>
      </div>
    </div>
  )
}
