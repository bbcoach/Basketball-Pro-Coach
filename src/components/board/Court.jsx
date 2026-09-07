import { useMemo } from 'react'
import { useApp } from '../../state/store'
import { ACCENT, SHOW_NUMBERS } from '../../state/config'
import { actsOf, ballSeams, baseAt, dist, makeBoard, smoothPoly, stepAtTime, wavy } from '../../lib/board-geometry'
import { useLandscape } from '../../lib/useLandscape'

const COURT_W = 1500

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
      const off = pl.team === 'off'
      tks.push({
        key: pl.id, x: p.x, y: p.y, r: TR, rHalo: TR + 6, fs: TR * 0.96,
        fill: off ? ACCENT : '#121316',
        stroke: sel === pl.id ? '#ffffff' : off ? 'rgba(0,0,0,.35)' : '#ffffff',
        sw: sel === pl.id ? 8 : 6,
        tc: off ? '#101012' : '#ffffff',
        label: SHOW_NUMBERS ? pl.label : '',
      })
    })
    const bp = board.ballPos(t)
    tks.push({ key: 'ball', x: bp.x, y: bp.y, r: TR * 0.48, rHalo: TR * 0.55, fs: 26, fill: '#e2762b', stroke: 'rgba(0,0,0,.62)', sw: 4, tc: '#7a3a10', label: '', ball: true })

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
          marker: ty === 'screen' ? 'none' : 'url(#arw)', op,
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
  // The light should always come from the same corner of the *screen*. In
  // landscape the whole court is drawn rotated, so the offset has to be
  // rotated with it to end up pointing the same way for the viewer.
  const shadow = landscape ? { dx: -0.12, dy: 0.12 } : { dx: 0.12, dy: 0.12 }
  // The tokens were flat discs sitting under a cast shadow, which is the one
  // combination that reads as "sticker", not "object". A single sheen laid
  // over the fill turns them into pieces lying on the floor. Its centre is
  // derived from the shadow vector rather than hard-coded, so the highlight
  // is always on the side the light comes from — including in landscape,
  // where the whole court is drawn rotated and a fixed top-left highlight
  // would end up lit from a different corner than the shadows.
  const light = { cx: 0.5 - shadow.dx * 1.45, cy: 0.5 - shadow.dy * 1.45 }

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
        <pattern id="wood" width="216" height="2800" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="216" height="2800" fill="#dcae72" />
          <rect x="0" y="0" width="54" height="2800" fill="#d5a465" />
          <rect x="108" y="0" width="54" height="2800" fill="#e4bb82" />
          <rect x="162" y="0" width="54" height="2800" fill="#cf9c5c" />
          <rect x="53" y="0" width="2" height="2800" fill="rgba(90,55,20,.22)" />
          <rect x="107" y="0" width="2" height="2800" fill="rgba(90,55,20,.18)" />
          <rect x="161" y="0" width="2" height="2800" fill="rgba(90,55,20,.22)" />
        </pattern>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.00" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
        <marker id="arw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M1 1 L11 6 L1 11 z" fill="#ffffff" />
        </marker>
        {/* Soft-edged blob used as each token's cast shadow. A gradient
            rather than an SVG blur filter on purpose: the tokens are
            re-rendered on every animation frame during playback, and a
            filter would be re-rasterized each time. */}
        <radialGradient id="tokshadow">
          <stop offset="62%" stopColor="#000" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {/* Laid over every token's own fill, so one definition works for the
            yellow attackers, the near-black defenders and the orange ball
            alike — it only lightens one side and deepens the other. Like the
            shadow above, a gradient rather than a filter: tokens re-render on
            every animation frame. */}
        <radialGradient id="toklight" cx={light.cx} cy={light.cy} r="0.75">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.20" />
        </radialGradient>
      </defs>

      <g ref={contentRef} transform={rotate}>
        <rect x="0" y="0" width="1500" height="2800" rx="14" fill="url(#wood)" />
        <rect x="0" y="0" width="1500" height="2800" rx="14" fill="url(#sheen)" />
        <rect x="505" y="0" width="490" height="580" fill="rgba(255,255,255,.10)" />
        <rect x="505" y="2220" width="490" height="580" fill="rgba(255,255,255,.10)" />

        {/* A center-court mark, the way a real hardwood floor has one inlaid
            at half-court — full-court view only, since that's the one place
            the whole center circle is actually on screen (half-court crops
            it in half at the baseline, which would look like a rendering
            bug rather than a logo). Kept to a bare ball-and-seams motif, no
            flourish, and low opacity: this needs to read as something the
            floor has always had, not as UI competing with the tokens and
            routes drawn on top of it a moment later. */}
        {view === 'full' && (
          <g transform="translate(750 1400) scale(8.6) translate(-21 -27)" opacity="0.18" stroke={ACCENT} fill="none" strokeWidth="1.7">
            <circle cx="21" cy="27" r="15" />
            <path d="M6 27 H36" />
            <path d="M21 12 V42" />
            <path d="M10.5 16.5 C17 22 17 32 10.5 37.5" />
            <path d="M31.5 16.5 C25 22 25 32 31.5 37.5" />
          </g>
        )}

        <g fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity="0.94">
          <rect x="14" y="14" width="1472" height="2772" rx="8" />
          <path d="M14 1400 H1486" />
          <circle cx="750" cy="1400" r="180" />

          <rect x="505" y="14" width="490" height="566" />
          <circle cx="750" cy="580" r="180" />
          <path d="M660 120 H840" strokeWidth="13" />
          <circle cx="750" cy="157.5" r="22.5" />
          <path d="M625 157.5 A125 125 0 0 0 875 157.5" />
          <path d="M90 14 V299" />
          <path d="M1410 14 V299" />
          <path d="M90 299 A675 675 0 0 0 1410 299" />

          <rect x="505" y="2220" width="490" height="566" />
          <circle cx="750" cy="2220" r="180" />
          <path d="M660 2680 H840" strokeWidth="13" />
          <circle cx="750" cy="2642.5" r="22.5" />
          <path d="M625 2642.5 A125 125 0 0 1 875 2642.5" />
          <path d="M90 2786 V2501" />
          <path d="M1410 2786 V2501" />
          <path d="M90 2501 A675 675 0 0 1 1410 2501" />
        </g>

        {routes.map((r) => (
          <path key={r.key} d={r.d} fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.dash} markerEnd={r.marker} opacity={r.op} />
        ))}
        {caps.map((c) => (
          <path key={c.key} d={c.d} fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" opacity={c.op} />
        ))}
        {badges.map((b) => (
          <circle key={b.key} cx={b.x} cy={b.y} r="30" fill="rgba(10,10,12,.82)" stroke="#ffffff" strokeWidth="4" opacity={b.op} />
        ))}
        <g pointerEvents="none">
          {badges.map((b) => (
            <text key={b.key} x={b.x} y={b.y} dominantBaseline="central" transform={labelRotate(b.x, b.y)} fill="#fff" fontSize={34} fontWeight={700} opacity={b.op} fontFamily="'Barlow Condensed', sans-serif" textAnchor="middle">{b.n}</text>
          ))}
        </g>

        {tokens.map((tk) => (
          <g key={tk.key}>
            <circle cx={tk.x + shadow.dx * tk.r} cy={tk.y + shadow.dy * tk.r} r={tk.r * 1.34} fill="url(#tokshadow)" />
            <circle cx={tk.x} cy={tk.y} r={tk.r} fill={tk.fill} />
            {/* Inset by half the stroke so the sheen stops at the inner edge
                of the ring instead of washing over it. Drawn before the ring
                and the seams so neither gets dimmed by it. */}
            <circle cx={tk.x} cy={tk.y} r={tk.r - tk.sw / 2} fill="url(#toklight)" />
            <circle cx={tk.x} cy={tk.y} r={tk.r} fill="none" stroke={tk.stroke} strokeWidth={tk.sw} />
            {tk.ball && <path d={ballSeams(tk.x, tk.y, tk.r)} fill="none" stroke={tk.stroke} strokeWidth={tk.sw * 0.8} strokeLinecap="round" />}
          </g>
        ))}
        <g pointerEvents="none">
          {tokens.map((tk) => (tk.label ? (
            <text key={tk.key} x={tk.x} y={tk.y} dominantBaseline="central" transform={labelRotate(tk.x, tk.y)} fill={tk.tc} fontSize={tk.fs} fontWeight={700} fontFamily="'Barlow Condensed', sans-serif" textAnchor="middle">{tk.label}</text>
          ) : null))}
        </g>
      </g>
    </svg>
  )
}
