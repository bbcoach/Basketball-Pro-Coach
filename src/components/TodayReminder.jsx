import { useEffect, useRef, useState } from 'react'
import { ACCENT } from '../state/config'
import { COND, keycap, haloRing } from '../theme'

// Today's appointments, as a notification over the overview: slides in from
// the top, shows the next one with what you would do about it, and puts
// itself away after a few seconds. The ✕ (or a swipe up) says "enough for
// today"; otherwise it comes back the next time the app is opened. "+N more"
// opens the whole day.
const KEY = 'tb.todayReminder.v1'
const SHOW_MS = 9000
let seenOn = '' // the day it has been shown on during this launch

const ICON = (import.meta.env.BASE_URL || '/') + 'icons/icon-192.png'
const GLYPH = { training: '☑︎', game: '▥', event: '▦' }

function startsText(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || '')
  if (!m) return ''
  const now = new Date()
  const diff = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - (now.getHours() * 60 + now.getMinutes())
  if (diff > 60) return 'starts in ' + Math.floor(diff / 60) + ' h' + (diff % 60 ? ' ' + (diff % 60) + ' min' : '')
  if (diff > 1) return 'starts in ' + diff + ' min'
  if (diff >= -1) return 'starting now'
  return 'started ' + (-diff) + ' min ago'
}

const kindName = (it) => (it.kind === 'training' ? 'Training' + (it.title && it.title !== 'Training' ? ' · ' + it.title : '') : it.title)

export default function TodayReminder({ items, today, plans, multiTeam, runPlan, openSchedule }) {
  const [phase, setPhase] = useState('idle') // idle · in · out · done
  const [showAll, setShowAll] = useState(false)
  const timer = useRef(null)
  const touchY = useRef(null)

  const leave = () => {
    clearTimeout(timer.current)
    setShowAll(false)
    setPhase('out')
    setTimeout(() => setPhase('done'), 260)
  }
  const dismissForDay = () => { try { localStorage.setItem(KEY, today) } catch { /* private mode */ } leave() }

  // The teams are read from storage after the first render, so the items
  // arrive a moment after mounting — start when they do.
  useEffect(() => {
    if (phase !== 'idle' || !items.length || seenOn === today) return
    let dismissed = false
    try { dismissed = localStorage.getItem(KEY) === today } catch { /* private mode */ }
    seenOn = today
    if (dismissed) { setPhase('done'); return }
    setPhase('in')
    timer.current = setTimeout(leave, SHOW_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, phase, today])
  useEffect(() => () => clearTimeout(timer.current), [])

  if ((phase !== 'in' && phase !== 'out') || !items.length) return null
  const it = items[0]
  const more = items.length - 1
  const plan = it.kind === 'training' && it.planId ? plans.find((p) => p.id === it.planId) : null
  const canRun = plan && (plan.items || []).length > 0
  const go = (fn) => { leave(); fn() }
  const sub = [startsText(it.time) || 'today', multiTeam ? it.teamName : '', it.sub].filter(Boolean).join(' · ')
  const mainLabel = it.kind === 'training' ? 'Attendance' : it.kind === 'game' ? 'Track stats' : 'Schedule'
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <div style={{ position: 'absolute', left: 12, right: 12, top: 'calc(var(--safe-top, 0px) + 10px)', zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div
          role="status"
          className={phase === 'out' ? 'remind-out' : 'remind-in'}
          onTouchStart={(e) => { touchY.current = e.touches[0].clientY }}
          onTouchMove={(e) => { if (touchY.current != null && e.touches[0].clientY - touchY.current < -28) { touchY.current = null; dismissForDay() } }}
          style={{ pointerEvents: 'auto', width: '100%', maxWidth: 440, borderRadius: 26, padding: '12px 14px', background: 'rgba(34,34,38,.94)', border: '1px solid rgba(255,255,255,.13)', boxShadow: '0 20px 44px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07)', backdropFilter: 'blur(22px) saturate(1.2)', WebkitBackdropFilter: 'blur(22px) saturate(1.2)', color: '#fff' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '.4px', color: 'rgba(255,255,255,.55)' }}>
            <img src={ICON} alt="" width={24} height={24} style={{ borderRadius: 7, flex: 'none' }} />
            <div style={{ flex: 1, textTransform: 'uppercase', fontWeight: 600 }}>Pro Coach · Today</div>
            {it.time && <div style={{ fontWeight: 600 }}>{it.time}</div>}
            <div onClick={dismissForDay} aria-label="Dismiss" style={{ width: 26, height: 26, margin: '-4px -6px -4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'rgba(255,255,255,.5)', cursor: 'pointer' }}>✕</div>
          </div>
          <div onClick={() => go(it.open)} style={{ cursor: 'pointer' }}>
            <div style={{ fontWeight: 700, fontSize: 16.5, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kindName(it)}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.62)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11, alignItems: 'center' }}>
            {canRun
              ? <div onClick={() => go(() => runPlan(plan.id))} style={{ padding: '7px 13px', borderRadius: 99, ...keycap(), color: '#101012', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>▶ Start plan</div>
              : <div onClick={() => go(it.open)} style={{ padding: '7px 13px', borderRadius: 99, ...keycap(), color: '#101012', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{mainLabel}</div>}
            {canRun && <div onClick={() => go(it.open)} style={{ padding: '7px 13px', borderRadius: 99, background: 'rgba(255,255,255,.1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{mainLabel}</div>}
            <div style={{ flex: 1 }} />
            {more > 0 && <div onClick={() => { clearTimeout(timer.current); setShowAll(true) }} style={{ padding: '7px 4px', fontSize: 11.5, fontWeight: 600, color: ACCENT, cursor: 'pointer' }}>+{more} more today</div>}
          </div>
        </div>
      </div>

      {showAll && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 61, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', background: 'radial-gradient(90% 60% at 50% 50%, rgba(0,0,0,.5), rgba(0,0,0,.74))' }} onClick={leave}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 28, padding: '20px 16px 14px', background: 'rgba(34,34,38,.97)', border: '1px solid rgba(255,255,255,.13)', boxShadow: '0 20px 44px rgba(0,0,0,.6)', position: 'relative', overflow: 'hidden', color: '#fff' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 90, background: 'radial-gradient(70% 100% at 50% 0%, rgba(232,177,60,.22), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <img src={ICON} alt="" width={52} height={52} style={{ borderRadius: 14, boxShadow: '0 8px 20px rgba(0,0,0,.55)' }} />
              <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 25, letterSpacing: '.5px', textTransform: 'uppercase', lineHeight: 1, marginTop: 6 }}>Today</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.62)', marginTop: 3 }}>{day} · {items.length} on the schedule</div>
            </div>
            <div style={{ position: 'relative', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((x) => {
                const p = x.kind === 'training' && x.planId ? plans.find((q) => q.id === x.planId) : null
                return (
                  <div key={x.key} onClick={() => go(x.open)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 16, background: 'rgba(255,255,255,.07)', cursor: 'pointer' }}>
                    <div style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 35% 30%, #2a2a2e, #141417)', boxShadow: haloRing(), color: ACCENT, fontSize: 15 }}>{GLYPH[x.kind]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kindName(x)}</div>
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[x.time, multiTeam ? x.teamName : '', x.sub].filter(Boolean).join(' · ')}</div>
                    </div>
                    {p && (p.items || []).length > 0
                      ? <div onClick={(e) => { e.stopPropagation(); go(() => runPlan(p.id)) }} style={{ padding: '7px 12px', borderRadius: 99, ...keycap(), color: '#101012', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>▶ Plan</div>
                      : <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 18, paddingRight: 2 }}>›</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <div onClick={dismissForDay} style={{ flex: 1, padding: '11px 16px', borderRadius: 13, textAlign: 'center', fontWeight: 700, fontSize: 14, background: 'rgba(255,255,255,.09)', color: 'rgba(255,255,255,.85)', cursor: 'pointer' }}>Not now</div>
              <div onClick={() => go(openSchedule)} style={{ flex: 1.3, padding: '11px 16px', borderRadius: 13, textAlign: 'center', fontWeight: 700, fontSize: 14, ...keycap(), color: '#101012', cursor: 'pointer' }}>Open schedule</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
