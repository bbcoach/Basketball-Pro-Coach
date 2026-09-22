import { useRef, useState } from 'react'
import { ACCENT } from '../state/config'
import { useApp } from '../state/store'
import ScreenHeader from './ScreenHeader'
import Tabs from './Tabs'
import { downloadIcs, parseIcs } from '../lib/ics'
import { fetchSchedule, gamesForTeam, SOURCES } from '../lib/scheduleImport'
import { fmtDate } from '../lib/dates'
import { raised, keycap, field, centred } from '../theme'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const KIND_META = {
  training: { icon: '☑', color: '#5bbf72', label: 'Training' },
  game: { icon: '▥', color: '#e8b13c', label: 'Game' },
  event: { icon: '▦', color: '#7fb2e0', label: 'Event' },
}

const KINDS = ['training', 'game', 'event']

// A coach with several teams needs to tell entries apart at a glance — a
// small color per team, cycling if there are more teams than colors.
const TEAM_COLORS = ['#e8b13c', '#7fb2e0', '#5bbf72', '#c98bd6', '#e0806f', '#7ec8c0']
function teamColor(teams, teamId) {
  const idx = teams.findIndex((t) => t.id === teamId)
  return TEAM_COLORS[idx % TEAM_COLORS.length]
}

export default function Schedule() {
  const {
    state, set, closeSchedule, goToSession, goToGame,
    addScheduleItem, editEvent, cancelEditEvent, removeEvent, importIcsEvents, importScheduleGames,
  } = useApp()
  const { teams, evKind, evTitleIn, evDateIn, evTimeIn, evHome, evLocationIn, evEditId } = state
  const [showPast, setShowPast] = useState(false)
  const [kindFilter, setKindFilter] = useState('all')
  const [icsPreview, setIcsPreview] = useState(null)
  const [icsStatus, setIcsStatus] = useState(null)
  const icsFileRef = useRef(null)

  // League import walks through: pick a source + paste its league id, fetch
  // and parse it (leagueSchedule), pick which of the teams found is this
  // one (leagueTeam), then preview+confirm the resulting games.
  const [leagueOpen, setLeagueOpen] = useState(false)
  const [leagueSource, setLeagueSource] = useState(SOURCES[0].id)
  const [leagueIdIn, setLeagueIdIn] = useState('')
  const [leagueBusy, setLeagueBusy] = useState(false)
  const [leagueError, setLeagueError] = useState(null)
  const [leagueSchedule, setLeagueSchedule] = useState(null)
  const [leagueTeam, setLeagueTeam] = useState(null)
  const closeLeagueImport = () => {
    setLeagueOpen(false); setLeagueIdIn(''); setLeagueBusy(false); setLeagueError(null); setLeagueSchedule(null); setLeagueTeam(null)
  }
  const lookupLeague = async () => {
    const id = leagueIdIn.trim()
    if (!id) return
    setLeagueBusy(true); setLeagueError(null)
    try {
      setLeagueSchedule(await fetchSchedule(leagueSource, id))
    } catch (err) {
      setLeagueError(err.message || 'Could not load that schedule.')
    } finally {
      setLeagueBusy(false)
    }
  }
  const leaguePreview = leagueSchedule && leagueTeam ? gamesForTeam(leagueSchedule, leagueTeam) : null
  const confirmLeagueImport = () => {
    importScheduleGames(leaguePreview)
    closeLeagueImport()
  }
  const today = todayStr()
  const multiTeam = teams.length > 1

  // Schedule shows every team at once, not just the active one — a coach
  // running two teams needs one combined view of what's coming up, not a
  // reason to flip between teams just to check for clashes.
  const upcoming = []
  const past = []
  const push = (isPast, item) => (isPast ? past : upcoming).push(item)
  teams.forEach((team) => {
    const teamTag = multiTeam ? { teamId: team.id, teamName: team.name, teamColor: teamColor(teams, team.id) } : null
    ;(team.sessions || []).forEach((s) => {
      push(s.date < today, { id: 'training-' + s.id, kind: 'training', date: s.date, time: s.time || '', title: s.label || s.date, location: '', description: 'Training', ...teamTag, onOpen: () => goToSession(s.id, team.id) })
    })
    ;(team.games || []).forEach((g) => {
      if (g.type !== 'game') return
      const homeAway = g.home === 'home' ? 'Home' : g.home === 'away' ? 'Away' : ''
      const sub = [homeAway, g.location].filter(Boolean).join(' · ')
      const description = [homeAway ? homeAway + ' game' : 'Game', g.opponent ? 'vs ' + g.opponent : ''].filter(Boolean).join(' — ')
      push(g.date < today, { id: 'game-' + g.id, kind: 'game', date: g.date, time: g.time || '', title: g.opponent ? 'vs ' + g.opponent : 'Game', sub, location: g.location || '', description, ...teamTag, onOpen: () => goToGame(g.id, team.id) })
    })
    ;(team.events || []).forEach((e) => {
      push(e.date < today, { id: 'event-' + e.id, kind: 'event', date: e.date, time: e.time || '', title: e.title, sub: e.location || '', location: e.location || '', description: '', ...teamTag, raw: e })
    })
  })
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
  past.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''))

  // Filtering happens after the lists are built, not while building them, so
  // the .ics export and the "N upcoming" total keep meaning the whole
  // schedule rather than whatever subset is on screen.
  const matchesFilter = (it) => kindFilter === 'all' || it.kind === kindFilter
  const upcomingShown = upcoming.filter(matchesFilter)
  const pastShown = past.filter(matchesFilter)
  const filtered = kindFilter !== 'all'

  const exportIcs = () => downloadIcs(upcoming, 'my-schedule-' + today + '.ics')
  const pickIcsFile = () => { setIcsStatus(null); icsFileRef.current?.click() }
  const onIcsFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const found = parseIcs(text)
      if (!found.length) setIcsStatus('No events found in that file.')
      else setIcsPreview(found)
    } catch {
      setIcsStatus('Could not read that file.')
    }
  }
  const confirmIcsImport = () => {
    importIcsEvents(icsPreview)
    setIcsStatus(icsPreview.length + (icsPreview.length === 1 ? ' event imported.' : ' events imported.'))
    setIcsPreview(null)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="My schedule" line={upcoming.length ? (filtered ? upcomingShown.length + ' of ' + upcoming.length + ' upcoming' : upcoming.length + ' upcoming') : undefined} onClose={closeSchedule} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
          <div onClick={exportIcs} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>Export .ics</div>
          <div onClick={pickIcsFile} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>Import .ics</div>
          <input ref={icsFileRef} type="file" accept=".ics,text/calendar" onChange={onIcsFile} style={{ display: 'none' }} />
          <div onClick={() => setLeagueOpen(true)} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>Import league</div>
        </div>
        {icsStatus && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', textAlign: 'center', paddingBottom: 10 }}>{icsStatus}</div>}

        {/* Walled off as its own card: the type buttons below used to sit
            loose above the list, in the same full-width three-equal-segments
            shape Tabs uses for real filtering, and got read as a filter for
            the list rather than a setting for this form. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, marginBottom: 14, borderRadius: 16, ...raised(.04, .09) }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
            {evEditId ? 'Edit event' : 'Schedule ' + (evKind === 'event' ? 'an event' : 'a ' + KIND_META[evKind].label.toLowerCase())}
          </div>
          {!evEditId && (
            // Left-aligned, pill-shaped, only as wide as their labels, behind
            // a "Type" caption — everything the filter strip is not, so the
            // two can't be mistaken for each other.
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.38)' }}>Type</span>
              {KINDS.map((k) => (
                <div
                  key={k} onClick={() => set({ evKind: k })}
                  style={{ flex: 'none', padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: evKind === k ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)', color: evKind === k ? '#fff' : 'rgba(255,255,255,.62)', border: '1px solid ' + (evKind === k ? ACCENT : 'transparent') }}
                >
                  {KIND_META[k].label}
                </div>
              ))}
            </div>
          )}
          {evKind !== 'training' && (
            <input
              type="text" value={evTitleIn} onChange={(e) => set({ evTitleIn: e.target.value })}
              placeholder={evKind === 'game' ? 'Opponent (optional)' : 'e.g. Season tournament'}
              style={{ ...field() }}
            />
          )}
          {(evKind === 'game' || evKind === 'event') && (
            <div style={{ display: 'flex', gap: 6 }}>
              {evKind === 'game' && (
                <>
                  <div
                    onClick={() => set({ evHome: evHome === 'home' ? '' : 'home' })}
                    style={{ ...centred, flex: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'home' ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.06)', color: evHome === 'home' ? '#fff' : 'rgba(255,255,255,.6)', border: '1px solid ' + (evHome === 'home' ? ACCENT : 'transparent') }}
                  >
                    Home
                  </div>
                  <div
                    onClick={() => set({ evHome: evHome === 'away' ? '' : 'away' })}
                    style={{ ...centred, flex: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'away' ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.06)', color: evHome === 'away' ? '#fff' : 'rgba(255,255,255,.6)', border: '1px solid ' + (evHome === 'away' ? ACCENT : 'transparent') }}
                  >
                    Away
                  </div>
                </>
              )}
              <input
                type="text" value={evLocationIn} onChange={(e) => set({ evLocationIn: e.target.value })} placeholder="Location (optional)"
                style={{ flex: 1, minWidth: 0, ...field() }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date" value={evDateIn} onChange={(e) => set({ evDateIn: e.target.value })}
              style={{ flex: 1, minWidth: 0, ...field() }}
            />
            <input
              type="time" value={evTimeIn} onChange={(e) => set({ evTimeIn: e.target.value })}
              style={{ flex: 'none', width: 104, ...field() }}
            />
            <div onClick={addScheduleItem} style={{ ...centred, padding: '10px 14px', borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{evEditId ? 'Save' : 'Add'}</div>
            {evEditId && <div onClick={cancelEditEvent} style={{ ...centred, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
          </div>
        </div>

        {/* The real filter — deliberately in the app's established Tabs shape,
            which everywhere else means "narrow the list below this". Only
            offered once there is more than one entry to narrow. */}
        {(upcoming.length + past.length) > 1 && (
          <Tabs
            style={{ margin: '0 0 10px' }}
            active={kindFilter}
            onChange={setKindFilter}
            tabs={[['all', 'All'], ['training', 'Trainings'], ['game', 'Games'], ['event', 'Events']]}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
          {upcomingShown.map((it) => (
            <ScheduleRow key={it.id} it={it} editEvent={editEvent} removeEvent={removeEvent} />
          ))}
          {!upcomingShown.length && (
            <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
              {/* Two different situations that must not share a message: an
                  empty schedule, and a schedule with nothing of this one kind. */}
              {upcoming.length
                ? 'Nothing coming up in this category — ' + upcoming.length + ' other ' + (upcoming.length === 1 ? 'entry' : 'entries') + ' under “All”.'
                : 'Nothing coming up — schedule a training, add a game, or note a team event above.'}
            </div>
          )}
        </div>

        <div onClick={() => setShowPast((v) => !v)} style={{ padding: '6px 2px', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.45)', cursor: 'pointer', textAlign: 'center' }}>
          {showPast ? 'Hide past events' : 'Show past events'}
        </div>

        {showPast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, paddingBottom: 16, opacity: 0.7 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>Past</div>
            {pastShown.map((it) => (
              <ScheduleRow key={it.id} it={it} editEvent={editEvent} removeEvent={removeEvent} />
            ))}
            {!pastShown.length && <div style={{ padding: '2px 2px 4px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{past.length ? 'Nothing past in this category.' : 'No past trainings, games or events yet.'}</div>}
          </div>
        )}
      </div>

      {icsPreview && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
          <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Import .ics</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
              Found {icsPreview.length} {icsPreview.length === 1 ? 'event' : 'events'} in this file. They'll be added to My Schedule as events.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div onClick={confirmIcsImport} style={{ padding: 11, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Import {icsPreview.length}</div>
              <div onClick={() => setIcsPreview(null)} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
            </div>
          </div>
        </div>
      )}

      {leagueOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
          <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Import league schedule</div>

            {!leagueSchedule && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>
                  Pulls games straight from the federation's own public schedule — nothing is uploaded, this just reads a page they already publish.
                </div>
                <select
                  value={leagueSource} onChange={(e) => setLeagueSource(e.target.value)}
                  style={{ width: '100%', marginBottom: 8, ...field() }}
                >
                  {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input
                  type="text" value={leagueIdIn} onChange={(e) => setLeagueIdIn(e.target.value)}
                  placeholder="League id or team link" style={{ width: '100%', ...field() }}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', margin: '6px 0 0', lineHeight: 1.5 }}>
                  {SOURCES.find((s) => s.id === leagueSource)?.idHint}
                </div>
                {leagueError && <div style={{ fontSize: 12, color: '#d9843c', margin: '10px 0 0', lineHeight: 1.5 }}>{leagueError}</div>}
                <div
                  onClick={leagueBusy ? undefined : lookupLeague}
                  style={{ padding: 11, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginTop: 14, opacity: leagueBusy || !leagueIdIn.trim() ? 0.5 : 1, pointerEvents: leagueBusy || !leagueIdIn.trim() ? 'none' : 'auto' }}
                >
                  {leagueBusy ? 'Looking up…' : 'Look up'}
                </div>
                <div onClick={closeLeagueImport} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center', marginTop: 8 }}>Cancel</div>
              </>
            )}

            {leagueSchedule && !leagueTeam && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>
                  {leagueSchedule.leagueName || 'Found this league.'} Which of these is your team?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {leagueSchedule.teams.map((t) => (
                    <div key={t} onClick={() => setLeagueTeam(t)} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{t}</div>
                  ))}
                </div>
                <div onClick={closeLeagueImport} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center', marginTop: 8 }}>Cancel</div>
              </>
            )}

            {leaguePreview && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
                  {leaguePreview.length
                    ? `Found ${leaguePreview.length} ${leaguePreview.length === 1 ? 'game' : 'games'} for ${leagueTeam}. These are added to My Schedule — importing again later only adds new ones.`
                    : `No games found for ${leagueTeam} in this league.`}
                </div>
                {leaguePreview.length > 0 && (
                  <div onClick={confirmLeagueImport} style={{ padding: 11, borderRadius: 12, ...keycap(), color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Import {leaguePreview.length}</div>
                )}
                <div onClick={closeLeagueImport} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center', marginTop: 8 }}>{leaguePreview.length ? 'Cancel' : 'Close'}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ it, editEvent, removeEvent }) {
  const { askConfirm } = useApp()
  const meta = KIND_META[it.kind]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, ...raised(.05, .08) }}>
      <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)', color: meta.color, fontSize: 15, fontWeight: 700 }}>{meta.icon}</div>
      <div onClick={it.onOpen} style={{ flex: 1, minWidth: 0, cursor: it.onOpen ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {it.teamName && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: it.teamColor, flex: 'none' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.teamName ? it.teamName + ' · ' : ''}{meta.label} · {fmtDate(it.date)}{it.time ? ' · ' + it.time : ''}{it.sub ? ' · ' + it.sub : ''}</span>
        </div>
      </div>
      {it.kind === 'event' && (
        <>
          <div onClick={() => editEvent(it.raw, it.teamId)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
          <div onClick={() => askConfirm({ title: 'Delete event', message: `Delete "${it.title}"? This can't be undone.`, onConfirm: () => removeEvent(it.raw, it.teamId) })} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
        </>
      )}
    </div>
  )
}
