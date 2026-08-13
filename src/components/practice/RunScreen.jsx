import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import { COND } from '../../theme'

export default function RunScreen() {
  const { state, planDrills, toggleRunPause, gotoDrill, stopRun } = useApp()
  const { plans, runPlanId, runIdx, runLeft, runPaused } = state
  if (!runPlanId) return null
  const plan = plans.find((x) => x.id === runPlanId)
  const list = planDrills(plan)
  const cur = list[runIdx]
  const next = list[runIdx + 1]
  const m = Math.floor(runLeft / 60)
  const sec = runLeft % 60
  const clock = m + ':' + (sec < 10 ? '0' + sec : sec)
  const clockColor = runLeft === 0 ? '#c0392b' : runLeft <= 30 ? ACCENT : '#fff'

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: '#08080a', display: 'flex', flexDirection: 'column', padding: '60px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: ACCENT }}>{plan ? plan.name + ' · ' + (runIdx + 1) + '/' + list.length : ''}</div>
        <div onClick={stopRun} style={{ padding: '7px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Exit</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 30, lineHeight: 1.05, color: '#fff', textTransform: 'uppercase' }}>{cur ? cur.name : ''}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,.5)', letterSpacing: '.4px', textTransform: 'uppercase' }}>{cur ? (cur.min || 0) + ' min' : ''}</div>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 74, lineHeight: 1, color: clockColor, marginTop: 6 }}>{clock}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)' }}>{next ? 'Next: ' + next.name + ' · ' + (next.min || 0) + ' min' : 'Last drill of the session'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div onClick={toggleRunPause} style={{ flex: 1, textAlign: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{runPaused ? 'Resume' : 'Pause'}</div>
        <div onClick={() => gotoDrill(runIdx + 1)} style={{ flex: 1, textAlign: 'center', padding: 14, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Next drill</div>
      </div>
    </div>
  )
}
