import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import Tabs from '../Tabs'
import RosterEditor from '../RosterEditor'

function SessionsTab() {
  const { state, newSession, openSession, removeSession } = useApp()
  const { sessions, plans } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div onClick={newSession} style={{ padding: 12, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 10 }}>＋ New session</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sessions.map((s) => {
          const vals = Object.keys(s.marks || {}).map((k) => s.marks[k])
          const inn = vals.filter((v) => v === 'in').length
          const out = vals.filter((v) => v === 'out').length
          const injured = vals.filter((v) => v === 'inj').length
          const plan = s.planId && plans.find((x) => x.id === s.planId)
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: state.openSession === s.id ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (state.openSession === s.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)') }}>
              <div onClick={() => openSession(s.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{s.label || s.date}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{inn} present · {out} out{injured ? ' · ' + injured + ' injured' : ''}{plan ? ' · ' + plan.name : ''}</div>
              </div>
              <div onClick={() => removeSession(s)} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!sessions.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No sessions yet — start one before practice and tick everyone off.</div>}
      </div>
    </div>
  )
}

function SessionOpen() {
  const { state, backToSessions, setSessionDate, setSessionPlan, markAttendance } = useApp()
  const { sessions, openSession: openId, roster, plans } = state
  const session = sessions.find((x) => x.id === openId)
  if (!session) return null

  const picks = [{ id: null, name: '—' }].concat(plans)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 10 }}>
        <input
          type="date" value={session.date} onChange={(e) => setSessionDate(e.target.value)}
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
        />
        <div onClick={backToSessions} style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Back</div>
      </div>
      <div className="scrollx" style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 10 }}>
        <div style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', alignSelf: 'center', paddingRight: 2 }}>Trained</div>
        {picks.map((pl) => {
          const on = (session.planId || null) === pl.id
          return (
            <div
              key={pl.id ?? 'none'} onClick={() => setSessionPlan(pl.id)}
              style={{ flex: 'none', padding: '7px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? ACCENT : 'rgba(255,255,255,.05)', color: on ? '#101012' : 'rgba(255,255,255,.6)', border: '1px solid ' + (on ? ACCENT : 'rgba(255,255,255,.09)') }}
            >
              {pl.name}
            </div>
          )
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {roster.map((p) => {
          const cur = (session.marks || {})[p.id] || null
          const opt = (val, label, color) => (
            <div
              key={val} onClick={() => markAttendance(p.id, val)}
              style={{ padding: '6px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 'none', background: cur === val ? color : 'rgba(255,255,255,.05)', color: cur === val ? '#101012' : 'rgba(255,255,255,.62)', border: '1px solid ' + (cur === val ? color : 'rgba(255,255,255,.09)') }}
            >
              {label}
            </div>
          )
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 11, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.10)', color: '#fff', fontWeight: 700, fontSize: 14 }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              {opt('in', 'IN', '#5bbf72')}
              {opt('out', 'OUT', '#c8d1d8')}
              {opt('inj', 'INJ', '#d9843c')}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryTab() {
  const { state } = useApp()
  const { roster, sessions } = state
  const today = new Date().toISOString().slice(0, 10)
  const pastSessions = sessions.filter((s) => s.date <= today)
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 18px' }}>
      {roster.map((p) => {
        const total = pastSessions.length
        const inn = pastSessions.filter((s) => (s.marks || {})[p.id] === 'in').length
        const injured = pastSessions.filter((s) => (s.marks || {})[p.id] === 'inj').length
        const pct = total ? Math.round((inn / total) * 100) : 0
        const pctColor = !total ? 'rgba(255,255,255,.35)' : pct >= 80 ? '#5bbf72' : pct >= 55 ? ACCENT : '#d9843c'
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 11, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.10)', color: '#fff', fontWeight: 700, fontSize: 14 }}>{p.num}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{inn} of {total} sessions{injured ? ' · ' + injured + ' injured' : ''}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: pctColor, flex: 'none' }}>{total ? pct + '%' : '–'}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Attendance() {
  const { state, set, closeAttend } = useApp()
  const { attendTab, openSession, roster, sessions, teams, activeTeamId } = state
  const teamName = teams.find((t) => t.id === activeTeamId)?.name
  const line = (teamName ? teamName + ' · ' : '') + roster.length + ' players · ' + sessions.length + ' sessions'

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="Attendance" line={line} onClose={closeAttend} />
      <Tabs tabs={[['sessions', 'Sessions'], ['roster', 'Roster'], ['summary', 'Summary']]} active={attendTab} onChange={(k) => set({ attendTab: k, openSession: null })} />
      {attendTab === 'sessions' && (openSession ? <SessionOpen /> : <SessionsTab />)}
      {attendTab === 'roster' && <RosterEditor emptyHint="The roster is shared with the stat tracker — add each player once." />}
      {attendTab === 'summary' && <SummaryTab />}
    </div>
  )
}
