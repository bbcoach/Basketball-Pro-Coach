import { useMemo } from 'react'
import { useApp } from '../../state/store'
import { SHOW_NUMBERS } from '../../state/config'
import { actsOf, ballSeams, baseAt, dist, makeBoard, smoothPoly, stepAtTime, wavy, isCone, conePath } from '../../lib/board-geometry'
import { useLandscape } from '../../lib/useLandscape'
import { COMIC_INK, COMIC_PAPER_HI, COMIC_RED, COMIC_GOLD } from '../../theme'

const COURT_W = 1500
// A realistic ball orange reads as "the ball" at a glance even once every
// other token on the floor has moved to the comic palette's red/gold —
// recoloring it to match would make it just another token.
const BALL_FILL = '#e2762b'

export default function Court() {
  const { state, svgRef, contentRef, onDown, onMove, onUp } = useApp()
  const { players, ball, t, step, playing, sel, view } = state
  const landscape = useLandscape()

  const board = useMemo(() => makeBoard(state), [state])
  const nSteps = board.nSteps()

  const { tokens, routes, caps, badges } = useMemo(() => {
    const liveStep = stepAtTime(t, nSteps)
    const editStep = playing ? liveStep : step
    const marks = board.marks()
    // Full screen used to draw tokens 37% larger (74 vs 54) on top of the
    // court already filling the whole physical screen instead of a small
    // embedded pane — the two compounded into tokens that felt oversized up
    // close. One consistent size now; full screen still enlarges everything
    // relative to a normal phone view simply by giving the court the whole
    // screen.
    const TR = 54

    const tks = []
    players.forEach((pl) => {
      const p = board.entPos(pl, t, nSteps, marks)
      if (isCone(pl)) {
        // Smaller than a player token on purpose — it marks a spot on the
        // floor, it doesn't stand in for a person.
        tks.push({
          key: pl.id, x: p.x, y: p.y, r: TR * 0.74, cone: true, label: '',
          fill: COMIC_GOLD,
          stroke: sel === pl.id ? COMIC_RED : COMIC_INK,
          sw: sel === pl.id ? 9 : 6,
        })
        return
      }
      const off = pl.team === 'off'
      tks.push({
        key: pl.id, x: p.x, y: p.y, r: TR, fs: TR * 0.9,
        fill: off ? COMIC_GOLD : COMIC_INK,
        stroke: sel === pl.id ? COMIC_RED : off ? COMIC_INK : COMIC_PAPER_HI,
        sw: sel === pl.id ? 10 : 7,
        tc: off ? COMIC_INK : COMIC_PAPER_HI,
        label: SHOW_NUMBERS ? pl.label : '',
      })
    })
    const bp = board.ballPos(t)
    tks.push({ key: 'ball', x: bp.x, y: bp.y, r: TR * 0.48, fs: 26, fill: BALL_FILL, stroke: COMIC_INK, sw: 5, tc: '#7a3a10', label: '', ball: true })

    const rts = []
    const cps = []
    const bdg = []
    const cmap = board.carriers()
    const all = players.concat([Object.assign({ id: 'ball' }, ball)])
    all.forEach((ent) => {
      actsOf(ent).forEach((act) => {
        if (!act.pts.length) return
        const start = ent.id === 'ball' ? board.ballStart(act.step, cmap) : baseAt(ent, act.step)
        const pts = [start].concat(act.pts)
        if (pts.length < 2) return
        if (act.step !== editStep) return
        const ty = act.type
        const op = act.step === editStep ? 0.97 : 0.5
        rts.push({
          key: ent.id + '-' + act.step, d: ty === 'dribble' ? wavy(pts) : smoothPoly(pts),
          dash: ty === 'pass' ? '34 26' : ty === 'shot' ? '6 26' : ty === 'handoff' ? '2 12 22 12' : 'none',
          marker: ty === 'screen' ? 'none' : 'url(#carw)', op,
        })
        const a = pts[pts.length - 2]
        const b = pts[pts.length - 1]
        const len = dist(a, b) || 1
        if (ty === 'screen') {
          const nx = -(b.y - a.y) / len
          const ny = (b.x - a.x) / len
          cps.push({ key: ent.id + '-' + act.step, d: 'M' + (b.x - nx * 46) + ' ' + (b.y - ny * 46) + ' L' + (b.x + nx * 46) + ' ' + (b.y + ny * 46), op })
        }
        const bx = b.x + ((b.x - a.x) / len) * 52
        const by = b.y + ((b.y - a.y) / len) * 52
        bdg.push({ key: ent.id + '-' + act.step, x: bx, y: by, n: String(act.step), op })
      })
    })
    return { tokens: tks, routes: rts, caps: cps, badges: bdg }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, ball, t, step, playing, sel, nSteps])

  const courtH = view === 'half' ? 1400 : 2800
  // In landscape the <g> below carries a 90° rotation so the (portrait-authored)
  // court fills a wide screen properly — the viewBox is swapped to match, but
  // every coordinate everywhere else in the app (state, hit-testing, formations,
  // exports) stays in the original portrait space untouched.
  const displayViewBox = landscape ? '0 0 ' + courtH + ' ' + COURT_W : '0 0 ' + COURT_W + ' ' + courtH
  const rotate = landscape ? 'matrix(0,-1,1,0,0,' + COURT_W + ')' : undefined
  // Text glyphs need to be counter-rotated back upright — everything else
  // (paths, arrows, tokens) should rotate with the field.
  const labelRotate = (x, y) => (landscape ? 'rotate(90 ' + x + ' ' + y + ')' : undefined)
  // The comic token shadow is a flat ink offset (the same "sticker" motif
  // every comic card in the app uses), not a soft cast blob — so unlike the
  // old dark-mode board, it doesn't need to track a light source. Kept as a
  // fixed down-right offset instead of landscape-flipping with the court.
  const shadow = { dx: 0.1, dy: 0.1 }

  return (
    <svg
      viewBox={displayViewBox} preserveAspectRatio="xMidYMid meet" ref={svgRef}
      style={{
        position: 'absolute', left: 9, top: 9, width: 'calc(100% - 18px)', height: 'calc(100% - 18px)', touchAction: 'none', cursor: 'crosshair',
        // Without this, dragging with a mouse/trackpad (as opposed to a
        // finger) can kick off the browser's native text selection instead
        // of — or in addition to — the custom drag gesture, highlighting
        // player number labels and sometimes dropping the drawn path.
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
    >
      <defs>
        <pattern id="cwood" width="216" height="2800" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="216" height="2800" fill="#e7c78a" />
          <rect x="0" y="0" width="54" height="2800" fill="#dcb876" />
          <rect x="108" y="0" width="54" height="2800" fill="#efd49c" />
          <rect x="162" y="0" width="54" height="2800" fill="#d6ad6c" />
          <rect x="53" y="0" width="3" height="2800" fill="rgba(90,55,20,.25)" />
          <rect x="107" y="0" width="3" height="2800" fill="rgba(90,55,20,.2)" />
          <rect x="161" y="0" width="3" height="2800" fill="rgba(90,55,20,.25)" />
        </pattern>
        {/* The same halftone-dot ground every Retro Comic card sits on,
            tiled over the wood instead of the old dark board's soft
            corner-to-corner sheen. */}
        <pattern id="chalf" width="13" height="13" patternUnits="userSpaceOnUse">
          <circle cx="6.5" cy="6.5" r="1.3" fill={COMIC_INK} opacity="0.12" />
        </pattern>
        <marker id="carw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M1 1 L11 6 L1 11 z" fill={COMIC_INK} />
        </marker>
      </defs>

      <g ref={contentRef} transform={rotate}>
        <rect x="0" y="0" width="1500" height="2800" rx="14" fill="url(#cwood)" />
        <rect x="0" y="0" width="1500" height="2800" rx="14" fill="url(#chalf)" />
        <rect x="505" y="0" width="490" height="580" fill="rgba(255,255,255,.14)" />
        <rect x="505" y="2220" width="490" height="580" fill="rgba(255,255,255,.14)" />

        <g fill="none" stroke={COMIC_INK} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round">
          <rect x="14" y="14" width="1472" height="2772" rx="8" />
          <path d="M14 1400 H1486" />
          <circle cx="750" cy="1400" r="180" />

          <rect x="505" y="14" width="490" height="566" />
          <circle cx="750" cy="580" r="180" />
          <path d="M660 120 H840" strokeWidth="22" />
          <circle cx="750" cy="157.5" r="22.5" strokeWidth="11" />
          <path d="M625 157.5 A125 125 0 0 0 875 157.5" strokeWidth="12" />
          <path d="M90 14 V299" />
          <path d="M1410 14 V299" />
          <path d="M90 299 A675 675 0 0 0 1410 299" />

          <rect x="505" y="2220" width="490" height="566" />
          <circle cx="750" cy="2220" r="180" />
          <path d="M660 2680 H840" strokeWidth="22" />
          <circle cx="750" cy="2642.5" r="22.5" strokeWidth="11" />
          <path d="M625 2642.5 A125 125 0 0 1 875 2642.5" strokeWidth="12" />
          <path d="M90 2786 V2501" />
          <path d="M1410 2786 V2501" />
          <path d="M90 2501 A675 675 0 0 1 1410 2501" />
        </g>

        {routes.map((r) => (
          <path key={r.key} d={r.d} fill="none" stroke={COMIC_INK} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.dash} markerEnd={r.marker} opacity={r.op} />
        ))}
        {caps.map((c) => (
          <path key={c.key} d={c.d} fill="none" stroke={COMIC_INK} strokeWidth="12" strokeLinecap="round" opacity={c.op} />
        ))}
        {badges.map((b) => (
          <circle key={b.key} cx={b.x} cy={b.y} r="30" fill={COMIC_GOLD} stroke={COMIC_INK} strokeWidth="6" opacity={b.op} />
        ))}
        <g pointerEvents="none">
          {badges.map((b) => (
            <text key={b.key} x={b.x} y={b.y} dominantBaseline="central" transform={labelRotate(b.x, b.y)} fill={COMIC_INK} fontSize={34} fontWeight={800} opacity={b.op} fontFamily="'Bangers', cursive" textAnchor="middle">{b.n}</text>
          ))}
        </g>

        {tokens.map((tk) => (
          <g key={tk.key}>
            {tk.cone ? (
              <>
                {/* A cone stands on the floor rather than lying on it, so its
                    shadow is a flat pool at the foot instead of the discs'
                    offset copy of themselves. */}
                <ellipse cx={tk.x + shadow.dx * tk.r * 1.6} cy={tk.y + tk.r * 0.62} rx={tk.r * 1.05} ry={tk.r * 0.42} fill={COMIC_INK} opacity="0.18" />
                <path d={conePath(tk.x, tk.y, tk.r)} fill={tk.fill} stroke={tk.stroke} strokeWidth={tk.sw} strokeLinejoin="round" />
              </>
            ) : (
              <>
                {/* The flat ink "sticker" offset every comic card uses,
                    translated to a round token: a solid ink disc sitting
                    behind and down-right of the real one. */}
                <circle cx={tk.x + shadow.dx * tk.r * 2.2} cy={tk.y + shadow.dy * tk.r * 2.2} r={tk.r} fill={COMIC_INK} opacity="0.9" />
                <circle cx={tk.x} cy={tk.y} r={tk.r} fill={tk.fill} />
                <circle cx={tk.x} cy={tk.y} r={tk.r} fill="none" stroke={tk.stroke} strokeWidth={tk.sw} />
                {tk.ball && <path d={ballSeams(tk.x, tk.y, tk.r)} fill="none" stroke={tk.stroke} strokeWidth={tk.sw * 0.7} strokeLinecap="round" />}
              </>
            )}
          </g>
        ))}
        <g pointerEvents="none">
          {tokens.map((tk) => (tk.label ? (
            <text key={tk.key} x={tk.x} y={tk.y} dominantBaseline="central" transform={labelRotate(tk.x, tk.y)} fill={tk.tc} fontSize={tk.fs} fontWeight={800} fontFamily="'Bangers', cursive" textAnchor="middle">{tk.label}</text>
          ) : null))}
        </g>
      </g>
    </svg>
  )
}
