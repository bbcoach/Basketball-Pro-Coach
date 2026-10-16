import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import {COND, keycap, sunken} from '../../theme'
import { useLandscape } from '../../lib/useLandscape'
import { useWakeLock } from '../../lib/useWakeLock'
import ScreenHeader from '../ScreenHeader'
import Court from './Court'
import SaveModal from './modals/SaveModal'
import PlaysSheet from './modals/PlaysSheet'
import ShareModal from './modals/ShareModal'
import ScrollX from '../ScrollX'

// The ︎ (text variation selector) after each icon forces plain
// glyph rendering instead of a platform color-emoji fallback — without it,
// a symbol missing from the Barlow Condensed font (e.g. the Cut arrow) can
// fall back to an emoji glyph whose painted shape doesn't sit centered in
// its own box the way a text glyph does, even though the box itself is.
const TOOLS = [
  ['move', '✥︎', 'Move'],
  ['cut', '↗︎', 'Cut'],
  ['dribble', '∿︎', 'Dribble'],
  ['screen', '⊤︎', 'Screen'],
  ['pass', '⇢︎', 'Pass'],
  ['handoff', '⇄︎', 'Handoff'],
  ['shot', '◎︎', 'Shot'],
  ['addOff', '＋︎', 'Offense'],
  ['addDef', '✕︎', 'Defense'],
  ['addCone', '▲︎', 'Cone'],
  ['addBall', '●︎', 'Ball'],
  ['erase', '⌫︎', 'Erase'],
]
// The normal toolbar shows the tools that draw a play; the ones that put
// things on the court (or take them off) sit behind one "Add" tile. Twelve
// tiles in a scrolling strip meant the last few were always out of sight.
const DRAW_TOOLS = TOOLS.slice(0, 7)
const PLAYER_TOOLS = TOOLS.slice(7)

// Full screen gets every tool the normal toolbar has — a coach sketching an
// adjustment while the team watches the big screen shouldn't have to drop out
// of full screen to reach Shot or a cone. Twelve tiles won't fit a phone, so
// the strip scrolls, capped at five clear ones plus the sliver of a sixth
// showing through the edge fade.
//
// That sliver is the whole reason the cap isn't a round number of tiles. Cut
// to exactly N tiles, the last one sits fully inside the mask and reads as a
// washed-out button — a rendering fault, not an invitation. Cut mid-tile and
// the fade does what it is for: a piece of something, cropped, which is what
// "there is more this way" actually looks like.
//
// So the cap is five tiles, the five gaps that follow them, and one fade
// width. FS_FADE_* mirror the mask widths in index.css — change them there
// and the strip stops cutting where the fade starts.
//
// On a tablet none of this would bind on its own: the bar would simply show
// all twelve, which is why the tiles carry an explicit size and the cap is
// derived from it rather than left to whatever fits.
const FS_MAX_VISIBLE = 5
const FS_GAP = 4
const FS_TILE_W = 52
const FS_TILE_H = 30
const FS_FADE_X = 34
const FS_FADE_Y = 28
const fsCap = (tile, fade) => FS_MAX_VISIBLE * tile + FS_MAX_VISIBLE * FS_GAP + fade

function Header({ compact }) {
  const { state, goHome } = useApp()
  const { playName } = state
  // Same two-line header as every other screen: brand, title, then the
  // play's name, with Menu on the right.
  // In the landscape side panel it sits flush with the controls below it.
  return <ScreenHeader title="Tactics Board" line={playName} onClose={goHome} style={compact ? { padding: '0 4px 6px' } : undefined} />
}

// Play, the steps and the scrubber share one row: the step chips sit where
// the eye already is when scrubbing, and the row they used to fill is gone.
function PlaybackBar() {
  const { state, set, togglePlay, gotoStep, addStep, nSteps } = useApp()
  const { t, playing, speed, step } = state
  const landscape = useLandscape()
  const n = nSteps()
  const editStep = playing ? Math.min(n, Math.floor(Math.max(0, Math.min(0.999999, t)) * n) + 1) : step
  const chip = (active) => ({
    minWidth: 26, height: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.72)', border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.09)'),
  })
  return (
    <div style={{ display: 'flex', flexWrap: landscape ? 'wrap' : 'nowrap', alignItems: 'center', gap: 8, padding: landscape ? '6px 4px' : '10px 16px 6px' }}>
      <div
        onClick={togglePlay}
        style={{ width: 42, height: 42, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...keycap(), color: '#101012', fontSize: 17, fontWeight: 700 }}
      >
        {playing ? '❙❙' : '▶'}
      </div>
      <div style={landscape ? { display: 'flex', gap: 4, flexWrap: 'wrap', order: 3, width: '100%', justifyContent: 'center' } : { display: 'flex', gap: 4, flex: 'none', maxWidth: '45%', overflowX: 'auto' }} className={landscape ? undefined : 'scrollx'}>
        {Array.from({ length: n }, (_, i) => i + 1).map((nn) => (
          <div key={nn} onClick={() => gotoStep(nn)} style={chip(nn === editStep)}>{nn}</div>
        ))}
        <div onClick={addStep} style={{ ...chip(false), color: 'rgba(255,255,255,.78)' }}>＋</div>
      </div>
      <input type="range" min="0" max="1" step="0.002" value={t} onChange={(e) => set({ t: parseFloat(e.target.value), playing: false })} style={{ flex: 1, minWidth: 50 }} />
      <div
        onClick={() => set((s) => ({ speed: s.speed === 1 ? 1.5 : s.speed === 1.5 ? 0.5 : 1 }))}
        style={{ padding: '7px 8px', borderRadius: 8, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flex: 'none', minWidth: 32, textAlign: 'center' }}
      >
        {speed}×
      </div>
    </div>
  )
}

function ToolsRow() {
  const { state, setTool } = useApp()
  const landscape = useLandscape()
  const [open, setOpen] = useState(false)
  const playerTool = PLAYER_TOOLS.find(([id]) => id === state.tool)
  const tile = (active) => ({
    flex: '1 1 0', minWidth: 0, minHeight: landscape ? 44 : 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '7px 2px', borderRadius: 12, cursor: 'pointer',
    border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.09)'), background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.78)',
  })
  const icon = { fontSize: 15, lineHeight: '15px', height: 15, fontWeight: 700, fontFamily: COND }
  const label = { fontSize: 10, lineHeight: '13px', fontWeight: 600, letterSpacing: '-.1px', whiteSpace: 'nowrap' }
  const rowStyle = landscape ? { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 } : { display: 'flex', gap: 5 }
  return (
    <div style={{ position: 'relative', padding: landscape ? '2px 4px 8px' : '2px 12px 8px' }}>
      {open && (
        <div style={{ position: 'absolute', left: landscape ? 4 : 12, right: landscape ? 4 : 12, bottom: '100%', marginBottom: 4, zIndex: 20, ...rowStyle, gap: 6, padding: 8, borderRadius: 16, background: '#17171b', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 12px 30px rgba(0,0,0,.6)' }}>
          {PLAYER_TOOLS.map(([id, ic, lb]) => (
            <div key={id} onClick={() => { setTool(id); setOpen(false) }} style={tile(state.tool === id)}>
              <div style={icon}>{ic}</div><div style={label}>{lb}</div>
            </div>
          ))}
        </div>
      )}
      <div style={rowStyle}>
        {DRAW_TOOLS.map(([id, ic, lb]) => (
          <div key={id} onClick={() => { setTool(id); setOpen(false) }} style={tile(state.tool === id)}>
            <div style={icon}>{ic}</div><div style={label}>{lb}</div>
          </div>
        ))}
        <div onClick={() => setOpen((v) => !v)} style={tile(!!playerTool || open)}>
          <div style={icon}>{playerTool ? playerTool[1] : '＋︎'}</div><div style={label}>{playerTool ? playerTool[2] : 'Add'}</div>
        </div>
      </div>
    </div>
  )
}

function FooterButtons() {
  const { undo, openSave, openShare } = useApp()
  const landscape = useLandscape()
  const [more, setMore] = useState(false)
  const btn = { flex: 1, textAlign: 'center', padding: landscape ? '8px 6px' : '10px 6px', borderRadius: 12, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.85)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <>
      <div style={landscape ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '2px 4px 0' } : { display: 'flex', gap: 6, padding: '2px 12px 0' }}>
        <div onClick={undo} style={btn}>↶ Undo</div>
        <div onClick={openSave} style={btn}>Save</div>
        <div onClick={openShare} style={btn}>Share</div>
        <div onClick={() => setMore(true)} style={btn}>⋯ More</div>
      </div>
      {more && <MoreSheet onClose={() => setMore(false)} />}
    </>
  )
}

// Everything that isn't part of drawing or showing a play, in one place.
function MoreSheet({ onClose }) {
  const { state, set, setView, openSheet, enterFullScreen, toggleAutoDef, delStep, nSteps, clearRoutes, resetAll, askConfirm } = useApp()
  const run = (fn) => () => { onClose(); fn() }
  const askClearRoutes = () => askConfirm({ title: 'Clear paths', message: 'Clear all drawn paths for this play? Player and ball positions stay put. This can\'t be undone.', onConfirm: clearRoutes })
  const askResetAll = () => askConfirm({ title: 'Reset board', message: 'Reset the board to its starting layout? This clears positions and paths and can\'t be undone.', onConfirm: resetAll })
  const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }
  const cap = { fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', padding: '10px 4px 2px' }
  const seg = (active, label, onClick) => (
    <div onClick={onClick} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(255,255,255,.14)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,.5)' }}>{label}</div>
  )
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '85%', overflowY: 'auto', background: '#141417', borderRadius: '22px 22px 0 0', border: '1px solid rgba(255,255,255,.1)', padding: '10px 14px calc(var(--safe-bottom) + 10px)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)', alignSelf: 'center', margin: '2px 0 6px' }} />
        <div onClick={run(openSheet)} style={row}><span style={{ width: 20, textAlign: 'center' }}>▤</span>My plays &amp; drills</div>
        <div onClick={run(enterFullScreen)} style={row}><span style={{ width: 20, textAlign: 'center' }}>⤢</span>Full screen</div>
        <div style={cap}>Court</div>
        <div style={{ display: 'flex', ...sunken(.07), borderRadius: 12, padding: 3, gap: 2 }}>
          {seg(state.view === 'half', 'Halfcourt', () => setView('half'))}
          {seg(state.view === 'full', 'Fullcourt', () => setView('full'))}
        </div>
        <div style={cap}>Defense</div>
        <div onClick={toggleAutoDef} style={{ ...row, justifyContent: 'space-between' }}>
          <span>Defenders follow their man</span>
          <span style={{ width: 42, height: 24, borderRadius: 99, background: state.autoDef ? ACCENT : 'rgba(255,255,255,.15)', position: 'relative', flex: 'none' }}>
            <span style={{ position: 'absolute', top: 3, left: state.autoDef ? 21 : 3, width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
          </span>
        </div>
        {state.autoDef && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>Tight</span>
            <input type="range" min="0" max="1" step="0.05" value={state.defenseDelay} onChange={(e) => set({ defenseDelay: parseFloat(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>Loose</span>
          </div>
        )}
        <div style={cap}>Edit</div>
        {nSteps() > 1 && <div onClick={run(delStep)} style={row}><span style={{ width: 20, textAlign: 'center' }}>−</span>Delete last step</div>}
        <div onClick={run(askClearRoutes)} style={row}><span style={{ width: 20, textAlign: 'center' }}>⌫</span>Clear paths</div>
        <div onClick={run(askResetAll)} style={{ ...row, color: '#e0806f' }}><span style={{ width: 20, textAlign: 'center' }}>↺</span>Reset board</div>
      </div>
    </div>
  )
}

// Full screen strips away everything but the court so a coach can prop the
// device up during a timeout — but that shouldn't mean losing the ability
// to step through the play; these mirror the step chips of the playback row in
// a compact, presentation-friendly form.
function FullScreenControls() {
  const { state, gotoStep, addStep, nSteps } = useApp()
  const { step, playing, t } = state
  const n = nSteps()
  const editStep = playing ? Math.min(n, Math.floor(Math.max(0, Math.min(0.999999, t)) * n) + 1) : step
  const circleBtn = (disabled) => ({
    width: 44, height: 44, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,.16)', color: disabled ? 'rgba(255,255,255,.3)' : '#fff', fontSize: 19, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  })
  return (
    <div style={{ position: 'absolute', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', left: 16, zIndex: 60, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div onClick={() => editStep > 1 && gotoStep(editStep - 1)} style={circleBtn(editStep <= 1)}>‹</div>
      <div style={{ padding: '8px 4px', borderRadius: 99, background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 12.5, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>{editStep} / {n}</div>
      <div onClick={() => editStep < n && gotoStep(editStep + 1)} style={circleBtn(editStep >= n)}>›</div>
      <div onClick={addStep} style={{ ...circleBtn(false), width: 38, height: 38, fontSize: 17 }}>＋</div>
    </div>
  )
}

function loadToolBarPos(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// The grip alone is easy to miss on a busy court background, so the bar also
// says so in words — once. Shown until a coach has actually moved it, then
// never again.
const HINT_KEY = 'tb.fsToolsHint.v1'
function loadToolBarHintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return true
  }
}

// The default (undragged) placement — a row near the top in portrait, a
// column in the landscape side margin — same spot as before this became
// draggable.
function defaultToolBarStyle(landscape) {
  return landscape
    ? { top: 'calc(64px + env(safe-area-inset-top, 0px))', bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))', right: 16, left: 'auto', flexDirection: 'column' }
    : { top: 'calc(70px + env(safe-area-inset-top, 0px))', left: 16, right: 16, flexDirection: 'row' }
}

// A coach may want the tool bar somewhere the default spot doesn't suit —
// off to one side, closer to the players, out of the way of a specific
// play. Either the grip handle or a press-and-hold anywhere on the bar
// picks it up; the chosen spot is remembered per orientation (portrait/
// landscape lay out completely differently, so a spot picked in one rarely
// makes sense in the other) and restored next time full screen opens.
const HOLD_MS = 300
function FullScreenTools() {
  const { state, setTool, undo } = useApp()
  const landscape = useLandscape()
  const tools = TOOLS
  const storageKey = 'tb.fsToolsPos.' + (landscape ? 'landscape' : 'portrait') + '.v1'
  const barRef = useRef(null)
  const dragRef = useRef(null)
  const holdRef = useRef(null)
  const pressRef = useRef(null)
  // Set once a drag has happened, so the click that lands right after it
  // doesn't also switch tools; cleared on the next press.
  const draggedRef = useRef(false)
  const [pos, setPos] = useState(() => loadToolBarPos(storageKey))
  const [dragging, setDragging] = useState(false)
  const [hintSeen, setHintSeen] = useState(() => loadToolBarHintSeen())

  useEffect(() => { setPos(loadToolBarPos(storageKey)) }, [storageKey])

  const beginDrag = (clientX, clientY) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    dragRef.current = { startX: clientX, startY: clientY, originX: rect.left, originY: rect.top }
    draggedRef.current = true
    setDragging(true)

    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      const bw = bar.offsetWidth
      const bh = bar.offsetHeight
      const nx = Math.max(4, Math.min(window.innerWidth - bw - 4, d.originX + (ev.clientX - d.startX)))
      const ny = Math.max(4, Math.min(window.innerHeight - bh - 4, d.originY + (ev.clientY - d.startY)))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragRef.current = null
      setDragging(false)
      setHintSeen(true)
      try { localStorage.setItem(HINT_KEY, '1') } catch { /* ignore quota errors */ }
      setPos((p) => {
        try { localStorage.setItem(storageKey, JSON.stringify(p)) } catch { /* ignore quota errors */ }
        return p
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const clearHold = () => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
    pressRef.current = null
  }

  const onHandleDown = (e) => {
    e.preventDefault()
    // The grip is the explicit affordance — no hold needed, and the bar's
    // own press-and-hold shouldn't arm on top of it.
    e.stopPropagation()
    beginDrag(e.clientX, e.clientY)
  }

  // Press and hold anywhere on the bar picks it up too, so the natural
  // "just grab the thing" instinct works without having to spot the grip.
  // A short tap still selects a tool, and sliding a finger before the hold
  // completes cancels it (that's a scroll, not a deliberate hold).
  const onBarDown = (e) => {
    draggedRef.current = false
    if (dragRef.current) return
    pressRef.current = { x: e.clientX, y: e.clientY }
    holdRef.current = setTimeout(() => {
      holdRef.current = null
      const p = pressRef.current
      if (!p) return
      if (navigator.vibrate) navigator.vibrate(20)
      beginDrag(p.x, p.y)
    }, HOLD_MS)
  }
  const onBarMove = (e) => {
    const p = pressRef.current
    if (!holdRef.current || !p) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) clearHold()
  }

  const onToolClick = (fn) => {
    if (draggedRef.current) { draggedRef.current = false; return }
    fn()
  }

  const showHint = !hintSeen && !pos

  // The bar itself no longer scrolls — only the strip inside it does. The
  // grip has to stay put, and with a dozen tiles it used to scroll out of
  // reach along with everything else.
  const wrapStyle = {
    position: 'absolute', zIndex: 60, display: 'flex', gap: FS_GAP,
    ...defaultToolBarStyle(landscape),
    ...(pos ? { top: pos.y, left: pos.x, right: 'auto', bottom: 'auto', flexDirection: landscape ? 'column' : 'row' } : null),
    alignItems: 'center', justifyContent: 'center',
    opacity: dragging ? 0.85 : 1,
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
  }

  // touchAction has to follow the scroll axis. It was hard-coded to 'pan-x'
  // for both orientations, which silently blocked the landscape column's
  // vertical scroll — invisible while six tools always fitted, not any more.
  const stripStyle = {
    display: 'flex', gap: FS_GAP,
    // Shrinks below the cap when the screen is narrower than seven tiles —
    // without this the strip held its capped width, pushed the grip off the
    // left edge of a phone and overflowed the bar in both directions.
    flex: '0 1 auto', minWidth: 0, minHeight: 0,
    flexDirection: landscape ? 'column' : 'row',
    alignItems: landscape ? 'stretch' : 'center',
    ...(landscape
      ? { maxHeight: fsCap(FS_TILE_H, FS_FADE_Y), overflowY: 'auto', overflowX: 'hidden' }
      : { maxWidth: fsCap(FS_TILE_W, FS_FADE_X), overflowX: 'auto', overflowY: 'hidden' }),
    // A press-and-hold would otherwise raise the text-selection callout on
    // touch, and scrolling would fight the drag once it has started.
    touchAction: dragging ? 'none' : landscape ? 'pan-y' : 'pan-x',
  }

  const tileStyle = (active) => ({
    flex: 'none', boxSizing: 'border-box',
    display: 'flex', flexDirection: landscape ? 'row' : 'column',
    alignItems: 'center', justifyContent: 'center', gap: landscape ? 5 : 1,
    ...(landscape ? { height: FS_TILE_H, padding: '0 9px' } : { width: FS_TILE_W, padding: '5px 2px' }),
    borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
    background: active ? ACCENT : 'rgba(255,255,255,.16)', color: active ? '#101012' : '#fff',
  })

  return (
    <div
      ref={barRef} style={wrapStyle}
      onPointerDown={onBarDown} onPointerMove={onBarMove}
      onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
    >
      <div
        onPointerDown={onHandleDown}
        style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: landscape ? 'auto' : 18, height: landscape ? 18 : 'auto', alignSelf: 'stretch', borderRadius: 8, background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        ⠿
      </div>
      {showHint && (
        <div style={{ flex: 'none', padding: '4px 6px', borderRadius: 8, ...keycap(), color: '#101012', fontSize: 8, fontWeight: 700, letterSpacing: '.2px', whiteSpace: 'nowrap' }}>
          Hold to move
        </div>
      )}
      <ScrollX axis={landscape ? 'y' : 'x'} style={stripStyle}>
        {tools.map(([id, icon, label]) => {
          const active = state.tool === id
          const row = landscape
          return (
            <div key={id} onClick={() => onToolClick(() => setTool(id))} style={tileStyle(active)}>
              <div style={{ fontSize: 12.5, lineHeight: '13px', height: 13, fontWeight: 700, fontFamily: COND }}>{icon}</div>
              <div style={{ fontSize: row ? 9.5 : 8.5, lineHeight: '10px', fontWeight: 600, letterSpacing: '.1px', whiteSpace: 'nowrap' }}>{label}</div>
            </div>
          )
        })}
        <div onClick={() => onToolClick(undo)} style={tileStyle(false)}>
          <div style={{ fontSize: 12.5, lineHeight: '13px', height: 13, fontWeight: 700, fontFamily: COND }}>↺︎</div>
          <div style={{ fontSize: landscape ? 9.5 : 8.5, lineHeight: '10px', fontWeight: 600, letterSpacing: '.1px', whiteSpace: 'nowrap' }}>Undo</div>
        </div>
      </ScrollX>
    </div>
  )
}

// Enter and exit full screen are the same pair of arrows, pointing out and
// pointing in — drawn rather than typed, so both render the same on every
// platform and font.
function FsIcon({ exit, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {exit
        ? <><path d="M4 14h6v6M20 10h-6V4" /><path d="M14 10l7-7M3 21l7-7" /></>
        : <><path d="M15 3h6v6M9 21H3v-6" /><path d="M21 3l-7 7M3 21l7-7" /></>}
    </svg>
  )
}

export default function Board() {
  const { state, exitFullScreen, togglePlay, enterFullScreen } = useApp()
  const { fullScreen, playing, hint, boardNotice } = state
  // The hint used to hold a line of its own under the toolbar for good. Now
  // it shows over the court for a moment whenever it changes, then fades.
  const [hintOn, setHintOn] = useState(false)
  useEffect(() => {
    if (!hint) return undefined
    setHintOn(true)
    const id = setTimeout(() => setHintOn(false), 2600)
    return () => clearTimeout(id)
  }, [hint])

  const landscape = useLandscape()
  // Full screen exists to be propped up and looked at during a timeout —
  // the one place in the app where nobody is touching the device on
  // purpose, and the worst possible moment for it to lock itself.
  useWakeLock(fullScreen)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: landscape ? 'row' : 'column', background: '#0b0b0d', padding: fullScreen ? 0 : landscape ? 14 : 'var(--safe-top) 0 calc(var(--safe-bottom) - 4px) 0', overflow: 'hidden' }}>
      {fullScreen && (
        <>
          <div onClick={exitFullScreen} title="Exit full screen" aria-label="Exit full screen" role="button" style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top, 0px))', right: 14, zIndex: 60, width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,12,.62)', color: '#fff', cursor: 'pointer' }}><FsIcon exit size={20} /></div>
          <FullScreenTools />
          <FullScreenControls />
          <div
            onClick={togglePlay}
            style={{
              position: 'absolute', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', right: 16,
              zIndex: 60, width: 46, height: 46, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {playing ? '❙❙' : '▶'}
          </div>
        </>
      )}
      {!fullScreen && !landscape && <Header />}

      <div style={{ display: 'flex', flex: '1 1 0', alignSelf: 'stretch', position: 'relative', overflow: 'hidden', margin: landscape ? 0 : '0 12px', borderRadius: 18, background: '#08080a', border: '1px solid rgba(255,255,255,.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07),0 8px 24px rgba(0,0,0,.5)', padding: 9 }}>
        <Court />
        {!fullScreen && (
          <div onClick={enterFullScreen} title="Full screen" aria-label="Full screen" role="button" style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,12,.62)', color: '#fff', cursor: 'pointer' }}><FsIcon /></div>
        )}
        {boardNotice && (
          // The outer box only centres; toast-pop animates transform, which
          // would otherwise wipe out a translateX(-50%) centring.
          <div style={{ position: 'absolute', left: 0, right: 0, top: fullScreen ? 'calc(110px + env(safe-area-inset-top, 0px))' : 16, zIndex: 61, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div key={boardNotice.id} className="toast-pop" style={{ maxWidth: '90%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 14, background: 'rgba(14,14,16,.94)', border: '1.5px solid ' + ACCENT, boxShadow: '0 10px 30px rgba(0,0,0,.6), 0 0 24px rgba(232,177,60,.25)', color: '#fff', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>
            <span style={{ width: 18, height: 18, flex: 'none', borderRadius: '50%', border: '1.5px solid ' + ACCENT, color: ACCENT, fontSize: 11, fontWeight: 800, lineHeight: '15px', textAlign: 'center' }}>i</span>
            <span>{boardNotice.text}</span>
          </div>
          </div>
        )}
        {!fullScreen && hint && (
          <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', maxWidth: '86%', padding: '8px 14px', borderRadius: 99, background: 'rgba(10,10,12,.78)', color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none', opacity: hintOn ? 1 : 0, transition: 'opacity .4s' }}>{hint}</div>
        )}
      </div>

      {!fullScreen && (
        <div
          className={landscape ? 'scrollx' : undefined}
          style={landscape
            ? { display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 280px', marginLeft: 12, overflowY: 'auto' }
            : { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, flex: 'none' }}
        >
          {landscape && <Header compact />}
          <PlaybackBar />
          <ToolsRow />
          <FooterButtons />
        </div>
      )}

      <SaveModal />
      <PlaysSheet />
      <ShareModal />
    </div>
  )
}
