import { useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import ScreenHeader from './ScreenHeader'
import { downloadIcs, parseIcs } from '../lib/ics'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const KIND_META = {
  training: { icon: '☑', color: '#5bbf72', label: 'Training' },
  game: { icon: '▥', color: '#e8b13c', label: 'Game' },
  event: { icon: '▦', color: '#7fb2e0', label: 'Event' },
}

const KINDS = ['training', 'game', 'event']

export default function Schedule() {
  const {
    state, set, closeSchedule, goToSession, goToGame,
    addScheduleItem, editEvent, cancelEditEvent, removeEvent, importIcsEvents,
  } = useApp()
  const { sessions, games, events, evKind, evTitleIn, evDateIn, evTimeIn, evHome, evLocationIn, evEditId } = state
  const [showPast, setShowPast] = useState(false)
  const [icsPreview, setIcsPreview] = useState(null)
  const [icsStatus, setIcsStatus] = useState(null)
  const icsFileRef = useRef(null)
  const today = todayStr()

  const upcoming = []
  const past = []
  const push = (isPast, item) => (isPast ? past : upcoming).push(item)
  sessions.forEach((s) => {
    push(s.date < today, { id: 'training-' + s.id, kind: 'training', date: s.date, time: s.time || '', title: s.label || s.date, location: '', description: 'Training', onOpen: () => goToSession(s.id) })
  })
  games.forEach((g) => {
    if (g.type !== 'game') return
    const homeAway = g.home === 'home' ? 'Home' : g.home === 'away' ? 'Away' : ''
    const sub = [homeAway, g.location].filter(Boolean).join(' · ')
    const description = [homeAway ? homeAway + ' game' : 'Game', g.opponent ? 'vs ' + g.opponent : ''].filter(Boolean).join(' — ')
    push(g.date < today, { id: 'game-' + g.id, kind: 'game', date: g.date, time: g.time || '', title: g.opponent ? 'vs ' + g.opponent : 'Game', sub, location: g.location || '', description, onOpen: () => goToGame(g.id) })
  })
  events.forEach((e) => {
    push(e.date < today, { id: 'event-' + e.id, kind: 'event', date: e.date, time: e.time || '', title: e.title, sub: e.location || '', location: e.location || '', description: '', raw: e })
  })
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
  past.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''))

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
      <ScreenHeader title="My schedule" line={upcoming.length ? upcoming.length + ' upcoming' : undefined} onClose={closeSchedule} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
          <div onClick={exportIcs} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>Export .ics</div>
          <div onClick={pickIcsFile} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>Import .ics</div>
          <input ref={icsFileRef} type="file" accept=".ics,text/calendar" onChange={onIcsFile} style={{ display: 'none' }} />
        </div>
        {icsStatus && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', textAlign: 'center', paddingBottom: 10 }}>{icsStatus}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
            {evEditId ? 'Edit event' : 'Schedule ' + (evKind === 'event' ? 'an event' : 'a ' + KIND_META[evKind].label.toLowerCase())}
          </div>
          {!evEditId && (
            <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
              {KINDS.map((k) => (
                <div
                  key={k} onClick={() => set({ evKind: k })}
                  style={{ flex: 1, textAlign: 'center', padding: '7px 6px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: evKind === k ? ACCENT : 'rgba(255,255,255,.06)', color: evKind === k ? '#101012' : 'rgba(255,255,255,.6)' }}
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
              style={{ padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
            />
          )}
          {(evKind === 'game' || evKind === 'event') && (
            <div style={{ display: 'flex', gap: 6 }}>
              {evKind === 'game' && (
                <>
                  <div
                    onClick={() => set({ evHome: evHome === 'home' ? '' : 'home' })}
                    style={{ flex: 'none', padding: '10px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'home' ? ACCENT : 'rgba(255,255,255,.06)', color: evHome === 'home' ? '#101012' : 'rgba(255,255,255,.6)' }}
                  >
                    Home
                  </div>
                  <div
                    onClick={() => set({ evHome: evHome === 'away' ? '' : 'away' })}
                    style={{ flex: 'none', padding: '10px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: evHome === 'away' ? ACCENT : 'rgba(255,255,255,.06)', color: evHome === 'away' ? '#101012' : 'rgba(255,255,255,.6)' }}
                  >
                    Away
                  </div>
                </>
              )}
              <input
                type="text" value={evLocationIn} onChange={(e) => set({ evLocationIn: e.target.value })} placeholder="Location (optional)"
                style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date" value={evDateIn} onChange={(e) => set({ evDateIn: e.target.value })}
              style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
            />
            <input
              type="time" value={evTimeIn} onChange={(e) => set({ evTimeIn: e.target.value })}
              style={{ flex: 'none', width: 104, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
            />
            <div onClick={addScheduleItem} style={{ padding: '10px 14px', borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{evEditId ? 'Save' : 'Add'}</div>
            {evEditId && <div onClick={cancelEditEvent} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
          {upcoming.map((it) => (
            <ScheduleRow key={it.id} it={it} editEvent={editEvent} removeEvent={removeEvent} />
          ))}
          {!upcoming.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>Nothing coming up — schedule a training, add a game, or note a team event above.</div>}
        </div>

        <div onClick={() => setShowPast((v) => !v)} style={{ padding: '6px 2px', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.45)', cursor: 'pointer', textAlign: 'center' }}>
          {showPast ? 'Hide past events' : 'Show past events'}
        </div>

        {showPast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, paddingBottom: 16, opacity: 0.7 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>Past</div>
            {past.map((it) => (
              <ScheduleRow key={it.id} it={it} editEvent={editEvent} removeEvent={removeEvent} />
            ))}
            {!past.length && <div style={{ padding: '2px 2px 4px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No past trainings, games or events yet.</div>}
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
              <div onClick={confirmIcsImport} style={{ padding: 11, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Import {icsPreview.length}</div>
              <div onClick={() => setIcsPreview(null)} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ it, editEvent, removeEvent }) {
  const meta = KIND_META[it.kind]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)', color: meta.color, fontSize: 15, fontWeight: 700 }}>{meta.icon}</div>
      <div onClick={it.onOpen} style={{ flex: 1, minWidth: 0, cursor: it.onOpen ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{meta.label} · {fmtDate(it.date)}{it.time ? ' · ' + it.time : ''}{it.sub ? ' · ' + it.sub : ''}</div>
      </div>
      {it.kind === 'event' && (
        <>
          <div onClick={() => editEvent(it.raw)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
          <div onClick={() => removeEvent(it.raw)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
        </>
      )}
    </div>
  )
}
