import { useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import ScreenHeader from './ScreenHeader'
import Tabs from './Tabs'
import { downloadIcs, parseIcs } from '../lib/ics'
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
    addScheduleItem, editEvent, cancelEditEvent, removeEvent, importIcsEvents,
  } = useApp()
  const { teams, evKind, evTitleIn, evDateIn, evTimeIn, evHome, evLocationIn, evEditId } = state
  const [showPast, setShowPast] = useState(false)
  const [kindFilter, setKindFilter] = useState('all')
  const [icsPreview, setIcsPreview] = useState(null)
  const [icsStatus, setIcsStatus] = useState(null)
  const icsFileRef = useRef(null)
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
                  style={{ flex: 'none', padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: evKind === k ? ACCENT : 'rgba(255,255,255,.07)', color: evKind === k ? '#101012' : 'rgba(255,255,255,.62)' }}
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
                    style={{ ...centred, flex: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'home' ? ACCENT : 'rgba(255,255,255,.06)', color: evHome === 'home' ? '#101012' : 'rgba(255,255,255,.6)' }}
                  >
                    Home
                  </div>
                  <div
                    onClick={() => set({ evHome: evHome === 'away' ? '' : 'away' })}
                    style={{ ...centred, flex: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'away' ? ACCENT : 'rgba(255,255,255,.06)', color: evHome === 'away' ? '#101012' : 'rgba(255,255,255,.6)' }}
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
