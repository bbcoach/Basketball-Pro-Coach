import { useRef } from 'react'
import { useApp } from '../state/store'
import { raised, field, chipSurface } from '../theme'
import { readPlayerPhoto } from '../lib/photo'

const sectionLabel = (text) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>{text}</div>
)

// Everything a roster row's number and name don't have room for. Reached by
// tapping the row itself rather than the pencil — the pencil still does the
// quick rename/renumber it always has, this is the rest: birth date, contact
// details, a parent or guardian's for a youth player, a photo. A full-screen
// sheet rather than another modal card, because a form this long in a
// 320px-wide dialog would need its own scrollbar inside a scrollbar.
//
// `position: fixed` rather than `absolute`, matching RosterEditor's own CSV
// preview: RosterEditor is embedded in three different screens and this has
// to cover the viewport regardless of which one it's sitting inside.
//
// Padding is the same 56px top / 46px bottom every other full-screen sheet
// in the app uses (Attendance, Schedule, Teams, the stat tracker) rather
// than an env(safe-area-inset-*) guess of its own — that guess is exactly
// what went wrong for the board's full-screen exit button, since a headless
// check can't tell the difference between a real notch and zero.
export default function PlayerDetail() {
  const { state, updatePlayer, closePlayerDetail, showToast } = useApp()
  const player = state.roster.find((p) => p.id === state.playerDetailId)
  const photoRef = useRef(null)
  if (!player) return null

  const set = (patch) => updatePlayer(player.id, patch)
  const pickPhoto = () => photoRef.current?.click()
  const onPhotoFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      set({ photo: await readPlayerPhoto(file) })
    } catch (err) {
      showToast(err.message || "Couldn't read that photo.")
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 98, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 18px 46px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16 }}>
        <div
          onClick={pickPhoto}
          style={{ width: 54, height: 54, flex: 'none', borderRadius: 99, overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(player.photo ? {} : chipSurface(.10)) }}
        >
          {player.photo
            ? <img src={player.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{player.num || '–'}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.num ? '#' + player.num + ' ' : ''}{player.name}</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
            <span onClick={pickPhoto} style={{ cursor: 'pointer' }}>{player.photo ? 'Change photo' : 'Add photo'}</span>
            {player.photo && <> · <span onClick={() => set({ photo: '' })} style={{ cursor: 'pointer' }}>Remove</span></>}
          </div>
        </div>
        <div onClick={closePlayerDetail} style={{ flex: 'none', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <input ref={photoRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: 'none' }} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        <div style={{ padding: 12, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8, ...raised(.04, .09) }}>
          {sectionLabel('Date of birth')}
          <input type="date" value={player.dob || ''} onChange={(e) => set({ dob: e.target.value })} style={{ ...field() }} />
        </div>

        <div style={{ padding: 12, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8, ...raised(.04, .09) }}>
          {sectionLabel('Contact')}
          <input type="tel" value={player.phone || ''} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone" style={{ ...field() }} />
          <input type="email" value={player.email || ''} onChange={(e) => set({ email: e.target.value })} placeholder="Email" style={{ ...field() }} />
          <textarea value={player.address || ''} onChange={(e) => set({ address: e.target.value })} placeholder="Address" rows={2} style={{ ...field(), resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ padding: 12, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8, ...raised(.04, .09) }}>
          {sectionLabel('Parent / guardian (for youth players)')}
          <input type="text" value={player.parentName || ''} onChange={(e) => set({ parentName: e.target.value })} placeholder="Name" style={{ ...field() }} />
          <input type="tel" value={player.parentPhone || ''} onChange={(e) => set({ parentPhone: e.target.value })} placeholder="Phone" style={{ ...field() }} />
          <input type="email" value={player.parentEmail || ''} onChange={(e) => set({ parentEmail: e.target.value })} placeholder="Email" style={{ ...field() }} />
        </div>
      </div>
    </div>
  )
}
