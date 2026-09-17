import { useApp } from '../state/store'
import { raised, keycap, chipSurface, field, centred, ACCENT2 } from '../theme'
import CoachDetail from './CoachDetail'

export default function CoachesEditor({ emptyHint }) {
  const { state, set, addCoach, editCoach, cancelEditCoach, removeCoach, openCoachDetail, askConfirm } = useApp()
  const { coaches, coachNameIn, coachEditId } = state

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', padding: '14px 18px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', paddingBottom: 8 }}>Coaches</div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
        <input
          type="text" value={coachNameIn} onChange={(e) => set({ coachNameIn: e.target.value })} placeholder="Coach name"
          style={{ flex: 1, minWidth: 0, ...field() }}
        />
        <div onClick={addCoach} style={{ ...centred, padding: '10px 14px', borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{coachEditId ? 'Save' : 'Add'}</div>
        {coachEditId && <div onClick={cancelEditCoach} style={{ ...centred, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 10 }}>
        {coaches.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 12, ...raised(.05, .08), background: coachEditId === c.id ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (coachEditId === c.id ? ACCENT2 : 'rgba(255,255,255,.08)') }}>
            {/* Same split as the roster row: this opens the profile (contact
                details, a photo), the pencil still just renames. */}
            <div onClick={() => openCoachDetail(c)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chipSurface(.10), color: '#fff', fontWeight: 700, fontSize: 13 }}>{(c.name || '?').trim().charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ flex: 'none', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>›</div>
            </div>
            <div onClick={() => editCoach(c)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
            <div onClick={() => askConfirm({ title: 'Remove coach', message: `Remove ${c.name}? This can't be undone.`, onConfirm: () => removeCoach(c) })} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
          </div>
        ))}
        {!coaches.length && <div style={{ padding: '2px 2px 4px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{emptyHint}</div>}
      </div>
      <CoachDetail />
    </div>
  )
}
