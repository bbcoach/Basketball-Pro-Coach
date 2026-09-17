import { useState } from 'react'
import ScrollX from '../ScrollX'
import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import Tabs from '../Tabs'
import RosterEditor from '../RosterEditor'
import CoachesEditor from '../CoachesEditor'
import ActionHint from '../ActionHint'
import { exportAttendancePdf, exportPersonAttendancePdf } from '../../lib/reports'
import { fmtDate, plural } from '../../lib/dates'
import { personAttendance, personLabel, markMeta } from '../../lib/attendance'
import { raised, keycap, chipSurface, field } from '../../theme'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function TimingBadge({ date }) {
  const today = todayStr()
  if (date > today) return <div style={{ flex: 'none', padding: '2px 7px', borderRadius: 99, background: 'rgba(127,178,224,.16)', color: '#7fb2e0', fontSize: 9.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>Upcoming</div>
  // The padlock used to be the 🔒 emoji — the only colour glyph in an
  // otherwise monochrome interface, and rendered differently on every
  // platform. Drawn as a small inline SVG it simply inherits the badge's own
  // muted colour, like every other mark in the app.
  if (date < today) {
    return (
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.45)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>
        <svg width="8" height="9" viewBox="0 0 8 9" fill="none" style={{ flex: 'none' }} aria-hidden="true">
          <path d="M2 4V2.6a2 2 0 0 1 4 0V4" stroke="currentColor" strokeWidth="1.1" />
          <rect x="0.9" y="4" width="6.2" height="4.4" rx="1" fill="currentColor" />
        </svg>
        Past
      </div>
    )
  }
  return <div style={{ flex: 'none', padding: '2px 7px', borderRadius: 99, background: 'rgba(91,191,114,.16)', color: '#5bbf72', fontSize: 9.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>Today</div>
}

function SessionsTab() {
  const { state, newSession, openSession, removeSession, askConfirm } = useApp()
  const { sessions, plans } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div onClick={newSession} style={{ padding: 12, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 10 }}>＋ New session</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sessions.map((s) => {
          const vals = Object.keys(s.marks || {}).map((k) => s.marks[k])
          const inn = vals.filter((v) => v === 'in').length
          const out = vals.filter((v) => v === 'out').length
          const injured = vals.filter((v) => v === 'inj').length
          const plan = s.planId && plans.find((x) => x.id === s.planId)
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, ...raised(.05, .08), background: state.openSession === s.id ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (state.openSession === s.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)') }}>
              <div onClick={() => openSession(s.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label || fmtDate(s.date)}{s.time ? ' · ' + s.time : ''}</div>
                  <TimingBadge date={s.date} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{inn} present · {out} out{injured ? ' · ' + injured + ' injured' : ''}{plan ? ' · ' + plan.name : ''}</div>
              </div>
              <div onClick={() => askConfirm({ title: 'Delete session', message: `Delete ${s.label || fmtDate(s.date)}? Attendance marks for this session will be lost.`, onConfirm: () => removeSession(s) })} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!sessions.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No sessions yet — start one before practice and tick everyone off.</div>}
      </div>
    </div>
  )
}

function SessionOpen() {
  const { state, set, backToSessions, setSessionDate, setSessionTime, setSessionPlan, markAttendance, markCoachAttendance, askConfirm } = useApp()
  const { sessions, openSession: openId, roster, coaches, plans } = state
  const session = sessions.find((x) => x.id === openId)
  const [unlockedId, setUnlockedId] = useState(null)
  if (!session) return null

  const isPast = session.date < todayStr()
  const locked = isPast && unlockedId !== session.id

  const askUnlock = () => askConfirm({
    title: 'Edit past session',
    message: 'This session is in the past. Unlock it to change attendance marks?',
    confirmLabel: 'Unlock',
    onConfirm: () => setUnlockedId(session.id),
  })
  const markPlayer = (playerId, val) => (locked ? askUnlock() : markAttendance(playerId, val))
  const markCoach = (coachId, val) => (locked ? askUnlock() : markCoachAttendance(coachId, val))

  const picks = [{ id: null, name: '—' }].concat(plans)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <input
          type="date" value={session.date} onChange={(e) => setSessionDate(e.target.value)}
          style={{ flex: 1, minWidth: 0, ...field() }}
        />
        <input
          type="time" value={session.time || ''} onChange={(e) => setSessionTime(e.target.value)}
          style={{ flex: 'none', width: 96, ...field() }}
        />
        <div onClick={backToSessions} style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Back</div>
      </div>
      {isPast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 10, borderRadius: 12, background: locked ? 'rgba(217,132,60,.12)' : 'rgba(91,191,114,.12)', border: '1px solid ' + (locked ? 'rgba(217,132,60,.3)' : 'rgba(91,191,114,.3)') }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: locked ? '#d9843c' : '#5bbf72' }}>{locked ? '🔒 Past session — attendance marks are locked' : 'Unlocked — attendance marks can be edited'}</div>
          {locked && <div onClick={askUnlock} style={{ flex: 'none', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Unlock</div>}
        </div>
      )}
      <ScrollX style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 10 }}>
        <div style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', alignSelf: 'center', paddingRight: 2 }}>Trained</div>
        {picks.map((pl) => {
          const on = (session.planId || null) === pl.id
          return (
            <div
              key={pl.id ?? 'none'} onClick={() => setSessionPlan(pl.id)}
              style={{ flex: 'none', padding: '7px 10px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)', color: on ? '#fff' : 'rgba(255,255,255,.6)', border: '1px solid ' + (on ? ACCENT : 'rgba(255,255,255,.09)') }}
            >
              {pl.name}
            </div>
          )
        })}
      </ScrollX>
      {/* Rendered outside the flex:1/overflow:auto region below — that region
          can get squeezed to a sliver on a short screen (e.g. Safari's URL
          bar eating viewport height), clipping this hint instead of showing it. */}
      {!roster.length && <ActionHint text="No players yet." actionLabel="Add roster" onAction={() => set({ attendTab: 'roster' })} />}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {roster.map((p) => {
          const cur = (session.marks || {})[p.id] || null
          const opt = (val, label, color) => (
            <div
              key={val} onClick={() => markPlayer(p.id, val)}
              style={{ padding: '6px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 'none', opacity: locked ? 0.5 : 1, background: cur === val ? color : 'rgba(255,255,255,.05)', color: cur === val ? '#101012' : 'rgba(255,255,255,.62)', border: '1px solid ' + (cur === val ? color : 'rgba(255,255,255,.09)') }}
            >
              {label}
            </div>
          )
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, ...raised(.05, .08) }}>
              <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chipSurface(.10), color: '#fff', fontWeight: 700, fontSize: 14 }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              {opt('in', 'IN', '#5bbf72')}
              {opt('out', 'OUT', '#c8d1d8')}
              {opt('inj', 'INJ', '#d9843c')}
            </div>
          )
        })}
      </div>
      {!!coaches.length && (
        <div style={{ flex: 'none', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', paddingBottom: 6 }}>Coaches</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {coaches.map((c) => {
              const cur = (session.coachMarks || {})[c.id] || null
              const opt = (val, label, color) => (
                <div
                  key={val} onClick={() => markCoach(c.id, val)}
                  style={{ padding: '6px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 'none', opacity: locked ? 0.5 : 1, background: cur === val ? color : 'rgba(255,255,255,.05)', color: cur === val ? '#101012' : 'rgba(255,255,255,.62)', border: '1px solid ' + (cur === val ? color : 'rgba(255,255,255,.09)') }}
                >
                  {label}
                </div>
              )
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, ...raised(.05, .08) }}>
                  <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chipSurface(.10), color: '#fff', fontWeight: 700, fontSize: 13 }}>{(c.name || '?').trim().charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  {opt('in', 'IN', '#5bbf72')}
                  {opt('out', 'OUT', '#c8d1d8')}
                </div>
              )
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// One person's session-by-session record, opened by tapping their row in the
// Summary list. Lists every past session and not just the attended ones:
// whenever a coach opens this, the sessions someone *missed* are usually the
// actual question, and a list of only the ones they made cannot answer it.
function PersonDetail({ person, kind, onBack }) {
  const { state, showToast } = useApp()
  const { sessions, plans, teams, activeTeamId } = state
  const teamName = teams.find((t) => t.id === activeTeamId)?.name
  const { rows, counts } = personAttendance(person, kind, sessions, todayStr(), plans)
  const isCoach = kind === 'coach'
  const pctColor = !counts.total ? 'rgba(255,255,255,.35)' : counts.pct >= 80 ? '#5bbf72' : counts.pct >= 55 ? ACCENT : '#d9843c'

  const chip = (label, n, color) => (
    <div key={label} style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 5, padding: '5px 10px', borderRadius: 99, background: 'rgba(255,255,255,.06)' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{n}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,.45)' }}>{label}</span>
    </div>
  )

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{personLabel(person, kind)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
            {counts.in} of {plural(counts.total, 'session')} · <span style={{ color: pctColor, fontWeight: 700 }}>{counts.total ? counts.pct + '%' : '–'}</span>
          </div>
        </div>
        <div onClick={onBack} style={{ flex: 'none', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Back</div>
      </div>

      <ScrollX style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {chip(isCoach ? 'attended' : 'present', counts.in, '#5bbf72')}
        {!isCoach && counts.inj > 0 && chip('injured', counts.inj, '#d9843c')}
        {chip('absent', counts.out, '#c8d1d8')}
        {/* Only when there are any: a nought next to "not recorded" invites
            the question of what it means, for no information. */}
        {counts.none > 0 && chip('not recorded', counts.none, 'rgba(255,255,255,.5)')}
      </ScrollX>

      <div
        onClick={() => { exportPersonAttendancePdf(person, kind, sessions, teamName, plans); showToast('Opening PDF…') }}
        style={{ padding: 11, borderRadius: 12, ...raised(.07, .1), color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}
      >
        Export PDF
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 8 }}>
        {rows.map((r) => {
          const m = markMeta(r.mark)
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, ...raised(.05, .08) }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{fmtDate(r.date)}{r.time ? ' · ' + r.time : ''}</div>
                {r.planName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.planName}</div>}
              </div>
              <div style={{ flex: 'none', padding: '5px 9px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px', color: r.mark ? '#101012' : 'rgba(255,255,255,.5)', background: r.mark ? m.color : 'rgba(255,255,255,.06)' }}>
                {m.short}
              </div>
            </div>
          )
        })}
        {!rows.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No past sessions yet — attendance shows up here once a session's date has passed.</div>}
      </div>
    </div>
  )
}

function SummaryTab() {
  const { state, showToast } = useApp()
  const { roster, coaches, sessions, teams, activeTeamId } = state
  // View-only navigation, so it lives here rather than in the store — and it
  // resets on its own when the tab is switched away and back.
  const [sel, setSel] = useState(null)
  const teamName = teams.find((t) => t.id === activeTeamId)?.name
  const pastSessions = sessions.filter((s) => s.date <= todayStr())
  const total = pastSessions.length

  if (sel) {
    const list = sel.kind === 'coach' ? coaches : roster
    const person = list.find((x) => x.id === sel.id)
    // Gone from the roster while the detail was open — fall back rather than
    // render a blank sheet.
    if (person) return <PersonDetail person={person} kind={sel.kind} onBack={() => setSel(null)} />
  }

  const ranked = roster
    .map((p) => {
      const inn = pastSessions.filter((s) => (s.marks || {})[p.id] === 'in').length
      const injured = pastSessions.filter((s) => (s.marks || {})[p.id] === 'inj').length
      const pct = total ? Math.round((inn / total) * 100) : 0
      return { p, inn, injured, pct }
    })
    .sort((a, b) => b.pct - a.pct || b.inn - a.inn)
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 18px' }}>
      {!!roster.length && (
        <div
          onClick={() => { exportAttendancePdf(roster, coaches, sessions, teamName); showToast('Opening PDF…') }}
          style={{ padding: 11, borderRadius: 12, ...raised(.07, .1), color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 4 }}
        >
          Export PDF
        </div>
      )}
      {ranked.map(({ p, inn, injured, pct }) => {
        const pctColor = !total ? 'rgba(255,255,255,.35)' : pct >= 80 ? '#5bbf72' : pct >= 55 ? ACCENT : '#d9843c'
        return (
          <div key={p.id} onClick={() => setSel({ id: p.id, kind: 'player' })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', ...raised(.05, .08) }}>
            <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chipSurface(.10), color: '#fff', fontWeight: 700, fontSize: 14 }}>{p.num}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{inn} of {total} sessions{injured ? ' · ' + injured + ' injured' : ''}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: pctColor, flex: 'none' }}>{total ? pct + '%' : '–'}</div>
            <div style={{ flex: 'none', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>›</div>
          </div>
        )
      })}
      {!!coaches.length && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', paddingTop: 10 }}>Coaches</div>
          {coaches.map((c) => {
            const inn = pastSessions.filter((s) => (s.coachMarks || {})[c.id] === 'in').length
            return (
              <div key={c.id} onClick={() => setSel({ id: c.id, kind: 'coach' })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', ...raised(.05, .08) }}>
                <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chipSurface(.10), color: '#fff', fontWeight: 700, fontSize: 13 }}>{(c.name || '?').trim().charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>of {total} sessions</div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: ACCENT, flex: 'none' }}>{inn}</div>
                <div style={{ flex: 'none', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>›</div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default function Attendance() {
  const { state, set, closeAttend } = useApp()
  const { attendTab, openSession, roster, sessions, teams, activeTeamId } = state
  const teamName = teams.find((t) => t.id === activeTeamId)?.name
  const line = (teamName ? teamName + ' · ' : '') + plural(roster.length, 'player') + ' · ' + plural(sessions.length, 'session')

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="Attendance" line={line} onClose={closeAttend} />
      <Tabs tabs={[['sessions', 'Sessions'], ['roster', 'Roster'], ['summary', 'Summary']]} active={attendTab} onChange={(k) => set({ attendTab: k, openSession: null })} />
      {attendTab === 'sessions' && (openSession ? <SessionOpen /> : <SessionsTab />)}
      {attendTab === 'roster' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <RosterEditor grow={false} emptyHint="The roster is shared with the stat tracker — add each player once." />
          <CoachesEditor emptyHint="Add your coaches to track their training attendance." />
        </div>
      )}
      {attendTab === 'summary' && <SummaryTab />}
    </div>
  )
}
