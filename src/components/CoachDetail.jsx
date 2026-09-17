import { useRef } from 'react'
import { useApp } from '../state/store'
import { raised, field, chipSurface } from '../theme'
import { readPlayerPhoto } from '../lib/photo'

const sectionLabel = (text) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>{text}</div>
)

// PlayerDetail's sheet, minus what only makes sense for a player: no birth
// date, no parent/guardian section. A coach is an adult on the team's own
// staff, not someone with a jersey number to scan a roster by, so there's
// nothing here to keep off the CoachesEditor row itself either — the photo
// question that led to keeping the number in the player row doesn't apply.
export default function CoachDetail() {
  const { state, updateCoach, closeCoachDetail, showToast } = useApp()
  const coach = state.coaches.find((c) => c.id === state.coachDetailId)
  const photoRef = useRef(null)
  if (!coach) return null

  const set = (patch) => updateCoach(coach.id, patch)
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
  const initial = (coach.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 98, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 18px 46px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16 }}>
        <div
          onClick={pickPhoto}
          style={{ width: 54, height: 54, flex: 'none', borderRadius: 99, overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(coach.photo ? {} : chipSurface(.10)) }}
        >
          {coach.photo
            ? <img src={coach.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{initial}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coach.name}</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
            <span onClick={pickPhoto} style={{ cursor: 'pointer' }}>{coach.photo ? 'Change photo' : 'Add photo'}</span>
            {coach.photo && <> · <span onClick={() => set({ photo: '' })} style={{ cursor: 'pointer' }}>Remove</span></>}
          </div>
        </div>
        <div onClick={closeCoachDetail} style={{ flex: 'none', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <input ref={photoRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: 'none' }} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        <div style={{ padding: 12, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8, ...raised(.04, .09) }}>
          {sectionLabel('Contact')}
          <input type="tel" value={coach.phone || ''} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone" style={{ ...field() }} />
          <input type="email" value={coach.email || ''} onChange={(e) => set({ email: e.target.value })} placeholder="Email" style={{ ...field() }} />
          <textarea value={coach.address || ''} onChange={(e) => set({ address: e.target.value })} placeholder="Address" rows={2} style={{ ...field(), resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      </div>
    </div>
  )
}
