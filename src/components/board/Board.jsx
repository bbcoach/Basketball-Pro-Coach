import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../state/store'
import { ACCENT, TEAM_NAME } from '../../state/config'
import { COND } from '../../theme'
import { useLandscape } from '../../lib/useLandscape'
import Logo from '../Logo'
import Court from './Court'
import SaveModal from './modals/SaveModal'
import PlaysSheet from './modals/PlaysSheet'
import FormationsModal from './modals/FormationsModal'
import ShareModal from './modals/ShareModal'

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
  ['shot', '◎︎', 'Shot'],
  ['addOff', '＋︎', 'Offense'],
  ['addDef', '✕︎', 'Defense'],
  ['erase', '⌫︎', 'Erase'],
]

// Full screen is otherwise read-only (step through, play/pause) — these are
// the drawing tools a coach still needs to sketch an adjustment on the spot
// while the team is watching the big screen, without the full toolbar.
const FULLSCREEN_TOOL_IDS = ['move', 'cut', 'dribble', 'screen', 'pass']

function Header({ compact }) {
  const { state, setView, goHome } = useApp()
  const { view, playName } = state
  const seg = (active, label, onClick) => (
    <div
      onClick={onClick}
      style={{
        flex: compact ? 1 : 'none', textAlign: compact ? 'center' : 'left',
        padding: compact ? '6px 4px' : '7px 11px', borderRadius: 8, fontSize: compact ? 11 : 12, fontWeight: 600, cursor: 'pointer',
        background: active ? 'rgba(255,255,255,.14)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,.5)',
      }}
    >
      {label}
    </div>
  )

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '2px 0 8px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <div onClick={goHome} style={{ cursor: 'pointer' }}>
            <Logo size={20} iconSize={15} />
          </div>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 700, fontSize: 15, lineHeight: 1.1, letterSpacing: '.3px', textTransform: 'uppercase', color: ACCENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            Tactics Board
          </div>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.07)', borderRadius: 9, padding: 3, gap: 2 }}>
          {seg(view === 'half', 'Halfcourt', () => setView('half'))}
          {seg(view === 'full', 'Fullcourt', () => setView('full'))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 16px 8px', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div onClick={goHome} style={{ cursor: 'pointer' }}>
          <Logo size={26} iconSize={19} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 22, lineHeight: 1.06, letterSpacing: '.4px', color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TEAM_NAME}</div>
          <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 700, fontSize: 22, lineHeight: 1.06, letterSpacing: '.4px', textTransform: 'uppercase', color: ACCENT }}>Tactics Board</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.45)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playName}</div>
        </div>
      </div>
      <div style={{ display: 'flex', background: 'rgba(255,255,255,.07)', borderRadius: 10, padding: 3, gap: 2, flex: 'none' }}>
        {seg(view === 'half', 'Halfcourt', () => setView('half'))}
        {seg(view === 'full', 'Fullcourt', () => setView('full'))}
      </div>
    </div>
  )
}

function PlaybackBar() {
  const { state, set, togglePlay } = useApp()
  const { t, playing, speed } = state
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 16px 2px' }}>
      <div
        onClick={togglePlay}
        style={{ width: 42, height: 42, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: ACCENT, color: '#101012', fontSize: 17, fontWeight: 700 }}
      >
        {playing ? '❙❙' : '▶'}
      </div>
      <input type="range" min="0" max="1" step="0.002" value={t} onChange={(e) => set({ t: parseFloat(e.target.value), playing: false })} style={{ flex: 1 }} />
      <div
        onClick={() => set((s) => ({ speed: s.speed === 1 ? 1.5 : s.speed === 1.5 ? 0.5 : 1 }))}
        style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flex: 'none', minWidth: 32, textAlign: 'center' }}
      >
        {speed}×
      </div>
    </div>
  )
}

function StepBar() {
  const { state, gotoStep, addStep, delStep, nSteps } = useApp()
  const { step, playing, t } = state
  const n = nSteps()
  const editStep = playing ? Math.min(n, Math.floor(Math.max(0, Math.min(0.999999, t)) * n) + 1) : step
  const chipStyle = (active) => ({
    minWidth: 27, padding: '5px 6px', borderRadius: 8, textAlign: 'center', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.72)', border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.09)'),
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center', padding: '4px 12px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginRight: 2 }}>Step</div>
      {Array.from({ length: n }, (_, i) => i + 1).map((nn) => (
        <div key={nn} onClick={() => gotoStep(nn)} style={chipStyle(nn === editStep)}>{nn}</div>
      ))}
      <div onClick={addStep} style={{ ...chipStyle(false), color: 'rgba(255,255,255,.78)' }}>＋</div>
      <div onClick={delStep} style={{ ...chipStyle(false), color: 'rgba(255,255,255,.5)' }}>−</div>
    </div>
  )
}

function ToolsRow() {
  const { state, setTool } = useApp()
  return (
    <div className="scrollx" style={{ display: 'flex', gap: 6, overflowX: 'auto', touchAction: 'pan-x', padding: '4px 12px 8px' }}>
      {TOOLS.map(([id, icon, label]) => {
        const active = state.tool === id
        return (
          <div
            key={id} onClick={() => setTool(id)}
            style={{ flex: 'none', width: 'auto', minHeight: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '7px 10px', borderRadius: 11, overflow: 'hidden', cursor: 'pointer', border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.09)'), background: active ? ACCENT : 'rgba(255,255,255,.06)', color: active ? '#101012' : 'rgba(255,255,255,.78)' }}
          >
            <div style={{ fontSize: 15, lineHeight: '15px', height: 15, fontWeight: 700, fontFamily: COND }}>{icon}</div>
            <div style={{ fontSize: 10.5, lineHeight: '13px', fontWeight: 600, letterSpacing: '.2px', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

function FooterButtons() {
  const app = useApp()
  const { state, goHome, openSave, openSheet, enterFullScreen, toggleAutoDef, openFormations, openShare, undo, clearRoutes, resetAll, askConfirm } = app
  const askClearRoutes = () => askConfirm({ title: 'Clear paths', message: 'Clear all drawn paths for this play? Player and ball positions stay put. This can\'t be undone.', onConfirm: clearRoutes })
  const askResetAll = () => askConfirm({ title: 'Reset board', message: 'Reset the board to its starting layout? This clears positions and paths and can\'t be undone.', onConfirm: resetAll })
  const btn = (label, onClick, active) => (
    <div onClick={onClick} style={{ padding: '6px 9px', borderRadius: 8, background: active ? ACCENT : 'rgba(255,255,255,.07)', color: active ? '#101012' : 'rgba(255,255,255,.8)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</div>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 14px 0' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', letterSpacing: '.2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{state.hint}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', flex: '0 1 auto' }}>
        {btn('Menu', goHome)}
        {btn('Save', openSave)}
        <div onClick={openSheet} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Plays</div>
        {btn('Full screen', enterFullScreen)}
        {btn('D follows', toggleAutoDef, state.autoDef)}
        {btn('Setup', openFormations)}
        {btn('Share', openShare)}
        {btn('Undo', undo)}
        {btn('Clear paths', askClearRoutes)}
        {btn('Reset', askResetAll)}
      </div>
    </div>
  )
}

// Full screen strips away everything but the court so a coach can prop the
// device up during a timeout — but that shouldn't mean losing the ability
// to step through the play; these mirror the step controls from StepBar in
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
// play. Dragging the grip handle repositions the whole bar freely; the
// chosen spot is remembered per orientation (portrait/landscape lay out
// completely differently, so a spot picked in one rarely makes sense in
// the other) and restored next time full screen opens.
function FullScreenTools() {
  const { state, setTool, undo } = useApp()
  const landscape = useLandscape()
  const tools = TOOLS.filter(([id]) => FULLSCREEN_TOOL_IDS.includes(id))
  const storageKey = 'tb.fsToolsPos.' + (landscape ? 'landscape' : 'portrait') + '.v1'
  const barRef = useRef(null)
  const dragRef = useRef(null)
  const [pos, setPos] = useState(() => loadToolBarPos(storageKey))
  const [dragging, setDragging] = useState(false)

  useEffect(() => { setPos(loadToolBarPos(storageKey)) }, [storageKey])

  const onHandleDown = (e) => {
    e.preventDefault()
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top }
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
      setPos((p) => {
        try { localStorage.setItem(storageKey, JSON.stringify(p)) } catch { /* ignore quota errors */ }
        return p
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const wrapStyle = {
    position: 'absolute', zIndex: 60, display: 'flex', gap: 6, overflowY: 'auto',
    ...defaultToolBarStyle(landscape),
    ...(pos ? { top: pos.y, left: pos.x, right: 'auto', bottom: 'auto', flexDirection: landscape ? 'column' : 'row' } : null),
    alignItems: landscape && !pos ? 'stretch' : 'center', justifyContent: 'center',
    opacity: dragging ? 0.85 : 1,
  }

  return (
    <div ref={barRef} style={wrapStyle}>
      <div
        onPointerDown={onHandleDown}
        style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, borderRadius: 8, background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', fontSize: 14, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        ⠿
      </div>
      {tools.map(([id, icon, label]) => {
        const active = state.tool === id
        const row = landscape
        return (
          <div
            key={id} onClick={() => setTool(id)}
            style={{
              flex: 'none', display: 'flex', flexDirection: row ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: row ? 6 : 2,
              padding: row ? '8px 12px' : '7px 11px', borderRadius: 11, cursor: 'pointer',
              background: active ? ACCENT : 'rgba(255,255,255,.16)', color: active ? '#101012' : '#fff',
            }}
          >
            <div style={{ fontSize: 15, lineHeight: '15px', height: 15, fontWeight: 700, fontFamily: COND }}>{icon}</div>
            <div style={{ fontSize: row ? 11 : 10, lineHeight: '12px', fontWeight: 600, letterSpacing: '.2px', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        )
      })}
      <div
        onClick={undo}
        style={{
          flex: 'none', display: 'flex', flexDirection: landscape ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: landscape ? 6 : 2,
          padding: landscape ? '8px 12px' : '7px 11px', borderRadius: 11, cursor: 'pointer',
          background: 'rgba(255,255,255,.16)', color: '#fff',
        }}
      >
        <div style={{ fontSize: 15, lineHeight: '15px', height: 15, fontWeight: 700, fontFamily: COND }}>↺︎</div>
        <div style={{ fontSize: landscape ? 11 : 10, lineHeight: '12px', fontWeight: 600, letterSpacing: '.2px', whiteSpace: 'nowrap' }}>Undo</div>
      </div>
    </div>
  )
}

export default function Board() {
  const { state, exitFullScreen, togglePlay } = useApp()
  const { fullScreen, playing } = state
  const landscape = useLandscape()

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: landscape ? 'row' : 'column', background: '#0b0b0d', padding: fullScreen ? 0 : landscape ? 14 : '52px 0 30px 0', overflow: 'hidden' }}>
      {fullScreen && (
        <>
          <div onClick={exitFullScreen} style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top, 0px))', right: 16, zIndex: 60, padding: '10px 15px', borderRadius: 10, background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Exit full screen</div>
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
      </div>

      {!fullScreen && (
        <div
          className={landscape ? 'scrollx' : undefined}
          style={landscape
            ? { display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 250px', marginLeft: 12, overflowY: 'auto' }
            : { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, flex: 'none' }}
        >
          {landscape && <Header compact />}
          <PlaybackBar />
          <StepBar />
          <ToolsRow />
          <FooterButtons />
        </div>
      )}

      <SaveModal />
      <PlaysSheet />
      <FormationsModal />
      <ShareModal />
    </div>
  )
}
