import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import Tabs from '../Tabs'

function planMeta(app, p, active) {
  const list = app.planDrills(p)
  const total = list.reduce((a, d) => a + (parseInt(d.min, 10) || 0), 0)
  return list.length + (list.length === 1 ? ' drill · ' : ' drills · ') + total + ' min' + (active ? ' · active' : '')
}

function PlansList() {
  const app = useApp()
  const { state, newPlan, setActivePlan, openPlan, runPlanCmd, removePlan } = app
  const { plans } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div onClick={newPlan} style={{ padding: 12, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 10 }}>＋ New session plan</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {plans.map((p) => {
          const active = (state.activePlan || (plans[0] && plans[0].id)) === p.id
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div onClick={() => openPlan(p.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{planMeta(app, p, active)}</div>
              </div>
              <div onClick={() => setActivePlan(p.id)} style={{ padding: '7px 10px', borderRadius: 9, background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.6)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }}>{active ? 'ACTIVE' : 'USE'}</div>
              <div onClick={() => runPlanCmd(p.id)} style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.10)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>▶</div>
              <div onClick={() => removePlan(p.id)} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.5)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!plans.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No plans yet — create one and fill it with your own drills.</div>}
      </div>
    </div>
  )
}

function PlanOpen() {
  const app = useApp()
  const { state, setPlanName, runPlanCmd, backToPlans, movePlanItem, removePlanItem, addDrillToPlan } = app
  const { plans, openPlan: openId, drills } = state
  const plan = plans.find((x) => x.id === openId)
  if (!plan) return null
  const items = plan.items || []
  const list = app.planDrills(plan)
  const total = list.reduce((a, d) => a + (parseInt(d.min, 10) || 0), 0)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
        <input
          type="text" value={plan.name} onChange={(e) => setPlanName(e.target.value)} placeholder="Session name"
          style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        <div onClick={() => runPlanCmd(plan.id)} style={{ padding: '9px 12px', borderRadius: 9, background: ACCENT, color: '#101012', fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>Start</div>
        <div onClick={backToPlans} style={{ padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Back</div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', paddingBottom: 8 }}>{list.length} {list.length === 1 ? 'drill' : 'drills'} · {total} min total</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((id, i) => {
          const d = drills.find((x) => x.id === id) || { name: 'Removed drill', min: 0 }
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderRadius: 11, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ width: 22, flex: 'none', fontWeight: 700, color: 'rgba(255,255,255,.45)', fontSize: 14 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{d.min || 0} min</div>
              </div>
              <div onClick={() => movePlanItem(plan.id, i, i - 1)} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', fontSize: 11, cursor: 'pointer', flex: 'none' }}>↑</div>
              <div onClick={() => movePlanItem(plan.id, i, i + 1)} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', fontSize: 11, cursor: 'pointer', flex: 'none' }}>↓</div>
              <div onClick={() => removePlanItem(plan.id, i)} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', fontSize: 11, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!items.length && <div style={{ padding: '10px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>Empty — pick drills below to build the session.</div>}
      </div>
      <div style={{ flex: 'none', paddingTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', paddingBottom: 6 }}>Tap a drill to add it to this session</div>
        <div className="scrollx" style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
          {drills.map((d) => (
            <div key={d.id} onClick={() => addDrillToPlan(plan.id, d.id)} style={{ flex: 'none', padding: '8px 11px', borderRadius: 9, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ {d.name} · {d.min || 0}′</div>
          ))}
          {!drills.length && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>Add drills under the “Drills” tab first.</div>}
        </div>
      </div>
    </div>
  )
}

function DrillsTab() {
  const app = useApp()
  const { state, set, addDrill, editDrill, cancelDrill, removeDrill, addExampleDrills, openPlan } = app
  const { drills, plans, activePlan, openPlan: openId, dName, dMin, dEdit } = state
  const target = plans.find((x) => x.id === activePlan) || plans.find((x) => x.id === openId) || plans[0]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 10, borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: ACCENT }}>Adding to</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{target ? target.name : 'New session (created on first drill)'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{target ? `${app.planDrills(target).length} drills · ${app.planDrills(target).reduce((a, d) => a + (parseInt(d.min, 10) || 0), 0)} min` : 'Tap a drill below to start a session plan'}</div>
        </div>
        <div onClick={() => { set({ practiceTab: 'plans' }); openPlan(target ? target.id : (plans[0] && plans[0].id) || null) }} style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.10)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{plans.length ? 'Open' : 'Plans'}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 8 }}>
        <input type="text" value={dName} onChange={(e) => set({ dName: e.target.value })} placeholder="Drill name" style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }} />
        <input type="text" value={dMin} onChange={(e) => set({ dMin: e.target.value })} placeholder="min" style={{ width: 58, flex: 'none', padding: '10px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, textAlign: 'center', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
        <div onClick={addDrill} style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{dEdit ? 'Save drill' : 'Add drill'}</div>
        {dEdit && <div onClick={cancelDrill} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {drills.map((d) => {
          const inPlan = target ? (target.items || []).filter((id) => id === d.id).length : 0
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderRadius: 11, background: dEdit === d.id ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (dEdit === d.id ? ACCENT : 'rgba(255,255,255,.08)') }}>
              <div onClick={() => app.addDrillToPlan(target ? target.id : null, d.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{d.min || 0} min{inPlan ? ' · in this session ×' + inPlan : ''}</div>
              </div>
              <div onClick={() => app.addDrillToPlan(target ? target.id : null, d.id)} style={{ padding: '7px 11px', borderRadius: 9, background: inPlan ? 'rgba(255,255,255,.10)' : ACCENT, color: inPlan ? '#fff' : '#101012', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }}>{inPlan ? '＋ again' : '＋ Add'}</div>
              <div onClick={() => editDrill(d)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
              <div onClick={() => removeDrill(d)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!drills.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 2px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>Your drills, your words — nothing is preset. Add what you actually run in the gym.</div>
            <div onClick={addExampleDrills} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.75)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Insert 4 editable examples</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Practice() {
  const { state, set, closePractice } = useApp()
  const { practiceTab, openPlan: openId, drills, plans } = state
  const line = drills.length + ' drills · ' + plans.length + ' session plans'

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="Practice" line={line} onClose={closePractice} />
      <Tabs tabs={[['plans', 'Session plans'], ['drills', 'Drills']]} active={practiceTab} onChange={(k) => set({ practiceTab: k, openPlan: null })} />
      {practiceTab === 'plans' && (openId ? <PlanOpen /> : <PlansList />)}
      {practiceTab === 'drills' && <DrillsTab />}
    </div>
  )
}
