// Ported from the Claude Design prototype (Taktikboard.dc.html) — pure geometry
// helpers for the tactics board: routes, step timing, ball magnetism and the
// defender auto-follow (with screen collisions).

export const HALF = '0 0 1500 1400'
export const FULL = '0 0 1500 2800'
export const BOFF = { x: 56, y: 44 }

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Point at fraction f (0..1) along a polyline.
export function ptAt(pts, f) {
  if (pts.length < 2) return pts[0]
  const seg = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i], pts[i - 1])
    seg.push(d)
    total += d
  }
  if (!total) return pts[0]
  let target = Math.max(0, Math.min(1, f)) * total
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const r = seg[i] ? target / seg[i] : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r }
    }
    target -= seg[i]
  }
  return pts[pts.length - 1]
}

// An entity (player or ball) has one action ("act") per step: { type, step, pts }.
export function actsOf(ent) {
  if (!ent) return []
  return ent.acts || []
}
export function normEnt(ent) {
  const e = Object.assign({}, ent, { acts: actsOf(ent) })
  delete e.route
  return e
}
export function maxStepOf(list) {
  let m = 1
  list.forEach((e) => actsOf(e).forEach((a) => { if (a.step > m) m = a.step }))
  return m
}
// Position of an entity at the *start* of `step` — i.e. where the previous step's
// action left it, walking back to its base start position.
export function baseAt(ent, step) {
  let pos = { x: ent.x, y: ent.y }
  actsOf(ent)
    .filter((a) => a.step < step && a.pts.length)
    .sort((a, b) => a.step - b.step)
    .forEach((a) => { pos = a.pts[a.pts.length - 1] })
  return pos
}
export function setAct(ent, step, type, p) {
  const e = normEnt(ent)
  return Object.assign({}, e, { acts: e.acts.filter((a) => a.step !== step).concat([{ type, step, pts: [p] }]) })
}

// Cones share the players array — that is what gets them dragging, erasing,
// undo, saving, sharing and device sync for free, since all of those already
// move `players` around wholesale. What they must never share is the ball:
// see movers() and its use in carrierMap.
export const CONE_TEAM = 'cone'
// Its own colour again, not borrowed from a UI accent — the app's second
// accent (which briefly used this same turquoise) has since been removed,
// but the cone marker was never that accent doing a UI job. It's a court
// object's colour, the same way the ball is orange, and stands on its own.
export const CONE_COLOR = '#2fc4b2'

export function isCone(ent) {
  return !!ent && ent.team === CONE_TEAM
}

// Everyone who can hold, receive or carry the ball — i.e. not the furniture.
// The ball is magnetic (carrierMap follows whoever stands nearest), so
// without this a cone dropped beside the ball would take possession of it.
export function movers(players) {
  return players.filter((p) => !isCone(p))
}

// One cone silhouette for all three renderers — the live board, the preview
// and the PDF exporter each draw their own tokens, and a shape defined three
// times is a shape that ends up different three times.
//
// `r` is the player-token radius it stands next to; a cone comes out
// deliberately smaller than that, because it marks a spot on the floor
// rather than standing in for a person. Drawn as a cone with a flared foot
// instead of a plain triangle, which at preview size would read as an
// arrowhead or a direction marker.
export function conePath(cx, cy, r) {
  const h = r * 1.34
  const w = r * 0.70
  const apex = cy - h * 0.58
  const shoulder = cy + h * 0.28
  const foot = cy + h * 0.46
  return [
    'M', cx.toFixed(1), apex.toFixed(1),
    'L', (cx + w * 0.66).toFixed(1), shoulder.toFixed(1),
    'L', (cx + w).toFixed(1), shoulder.toFixed(1),
    'L', (cx + w).toFixed(1), foot.toFixed(1),
    'L', (cx - w).toFixed(1), foot.toFixed(1),
    'L', (cx - w).toFixed(1), shoulder.toFixed(1),
    'L', (cx - w * 0.66).toFixed(1), shoulder.toFixed(1),
    'Z',
  ].join(' ')
}

export function nearestPlayer(players, pt, step, max) {
  let best = null
  let bd = max || 240
  players.forEach((pl) => {
    const d = dist(baseAt(pl, step), pt)
    if (d < bd) { bd = d; best = pl }
  })
  return best
}

// Who's holding the ball at the start of each step (magnetic ball): follows the
// nearest player until a pass hands it off, or a shot releases it.
export function carrierMap(allPlayers, ball, n) {
  // Cones are dropped here once, at the top, rather than at each of the
  // nearestPlayer calls below — they are on the court but they cannot hold,
  // receive or hand off a ball, and this is the only place in the app that
  // decides who does.
  const players = movers(allPlayers)
  const out = {}
  let c = nearestPlayer(players, { x: ball.x, y: ball.y }, 1, 240)
  for (let k = 1; k <= n; k++) {
    out[k] = c
    const act = actsOf(ball).find((a) => a.step === k && a.pts.length)
    if (act) {
      c = act.type === 'shot' ? null : nearestPlayer(players, act.pts[act.pts.length - 1], k + 1, 300)
      continue
    }
    if (!c) continue
    // A handoff is drawn on a player, not the ball, and works in either
    // direction — whoever moves is the one it's drawn on.
    //
    // Carrier hands it over: they physically walk the ball across (it rides
    // along for free, the same way it does during a dribble) and possession
    // passes to whoever's nearest where that route ends. The carrier is
    // excluded from that search — they end up sitting right on top of their
    // own endpoint, so without this they'd always be "nearest" to themselves
    // and never hand off to anyone.
    const given = actsOf(c).find((a) => a.step === k && a.type === 'handoff' && a.pts.length)
    if (given) {
      const others = players.filter((p) => p.id !== c.id)
      c = nearestPlayer(others, given.pts[given.pts.length - 1], k + 1, 300)
      continue
    }
    // Team-mate collects it: they run at the carrier and take the ball off
    // them. Their route has to actually finish near where the carrier ends
    // up this step, and if several run at the carrier the closest one gets it.
    const carrierAt = baseAt(c, k + 1)
    let taker = null
    let bestD = 300
    players.forEach((p) => {
      if (p.id === c.id) return
      const a = actsOf(p).find((z) => z.step === k && z.type === 'handoff' && z.pts.length)
      if (!a) return
      const d = dist(a.pts[a.pts.length - 1], carrierAt)
      if (d < bestD) { bestD = d; taker = p }
    })
    if (taker) c = taker
  }
  return out
}

export function stepAtTime(t, n) {
  return Math.min(n, Math.floor(Math.max(0, Math.min(0.999999, t)) * n) + 1)
}

function easeInOut(fr) {
  return fr < 0.5 ? 2 * fr * fr : 1 - Math.pow(-2 * fr + 2, 2) / 2
}

export function posAtTime(ent, t, n) {
  const x = Math.max(0, Math.min(0.999999, t)) * n
  const k = Math.floor(x) + 1
  const fr = x - (k - 1)
  const base = baseAt(ent, k)
  const a = actsOf(ent).find((z) => z.step === k && z.pts.length)
  if (!a) return base
  const e = easeInOut(fr)
  return ptAt([base].concat(a.pts), e)
}

// The classic basketball seams for a ball of radius r centred on (cx, cy):
// the equator and meridian, plus the two side seams curving in towards the
// middle. Shared so the live board, the thumbnails and the PDF export all
// draw the same ball.
// The ball is the one object on the board where roundness reads as quality,
// and it was a flat orange disc. These are the stops for a sphere lit from
// the same side the court's tokens are — defined here so the live board, the
// preview and the PDF exporter can't end up with three different balls, the
// way the cone nearly did.
//
// A specular dot is deliberately not part of this: at the ball's real size
// (radius ~26 of a 1500-unit court, so a dozen screen pixels on a phone) it
// lands on two pixels and reads as a stray speck. The gradient alone carries
// the roundness, and it survives being small.
export const BALL_SPHERE = [
  { offset: '0%', color: '#f7a860' },
  { offset: '42%', color: '#e2762b' },
  { offset: '100%', color: '#8f3f10' },
]
export const BALL_SPHERE_CENTER = { cx: 0.34, cy: 0.3, r: 0.78 }

export function ballSeams(cx, cy, r) {
  const q = r * 0.72
  const n = (v) => v.toFixed(1)
  return `M${n(cx - r)} ${n(cy)} H${n(cx + r)}`
    + ` M${n(cx)} ${n(cy - r)} V${n(cy + r)}`
    + ` M${n(cx - q)} ${n(cy - q)} Q${n(cx)} ${n(cy)} ${n(cx - q)} ${n(cy + q)}`
    + ` M${n(cx + q)} ${n(cy - q)} Q${n(cx)} ${n(cy)} ${n(cx + q)} ${n(cy + q)}`
}

export function poly(pts) {
  return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
}

function perpDist(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (!len2) return dist(p, a)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

// Ramer–Douglas–Peucker: drops points that already sit close to the
// straight line between their neighbors. On its own this is a poor fit for
// hand tremor: RDP only ever removes the single worst-offending point per
// pass, and a shaky stroke spreads its wobble fairly evenly across *every*
// point rather than concentrating it in one spot — so it ends up peeling
// off one point at a time instead of collapsing the noise. Run it after
// smoothJitter() (below), once the points already lie close to a clean
// curve, and it does what it's actually good at: dropping the
// now-redundant points a smooth curve doesn't need. Endpoints are never
// touched either way, so where a route starts and ends (a player, a pass
// target, the hoop) is unaffected.
export function simplifyPath(pts, epsilon = 14) {
  if (pts.length < 3) return pts
  let maxD = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > epsilon) {
    const left = simplifyPath(pts.slice(0, idx + 1), epsilon)
    const right = simplifyPath(pts.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[pts.length - 1]]
}

// A few passes of 1-2-1 weighted averaging with each point's neighbors —
// the actual fix for tremor, since it evens out small back-and-forth
// wobble everywhere along the stroke rather than hunting for one worst
// point. Endpoints are excluded from the averaging (kept exactly as
// recorded) for the same reason simplifyPath leaves them alone.
function smoothJitter(pts, passes = 3) {
  if (pts.length < 3) return pts
  let cur = pts
  for (let pass = 0; pass < passes; pass++) {
    const next = [cur[0]]
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1]
      const b = cur[i]
      const c = cur[i + 1]
      next.push({ x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 })
    }
    next.push(cur[cur.length - 1])
    cur = next
  }
  return cur
}

// Cleans up a freehand-drawn route once the stroke is finished: smooth
// away tremor first, then simplify the now-clean curve down to the points
// that actually matter.
export function cleanFreehandPath(pts) {
  return simplifyPath(smoothJitter(pts))
}

// Draws a smooth curve through the points instead of straight segments
// between them, using each point as the control for a quadratic curve to
// the midpoint of itself and the next — a standard trick for turning a
// simplified polyline's remaining corners into one continuous line.
export function smoothPoly(pts) {
  if (pts.length < 3) return poly(pts)
  let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ' Q' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1)
  }
  const last = pts[pts.length - 1]
  d += ' L' + last.x.toFixed(1) + ' ' + last.y.toFixed(1)
  return d
}

// Resample a polyline and offset it perpendicular with a sine wave (dribble path).
// A dribble is a squiggle drawn *along* a path, not a path of its own. The
// old wave had a 148-unit wavelength for 34 units of peak-to-peak throw —
// each half-wave a 74-unit sweep across a 1500-unit court, which is a real
// detour rather than a texture. It read as a slalom, and on a freehand path
// it merged with the path's own curvature until the two were inseparable.
//
// Tight and shallow instead: a ~1:2.3 throw-to-wavelength ratio at a fifth
// of the old amplitude, so the line keeps its direction and the squiggle is
// something laid on top of it.
const WAVE_AMP = 10
const WAVE_LEN = 46
const WAVE_STEP = 4
// The wave used to run right up to the end point, leaving the last sample
// off the line and the closing segment pointing wherever that happened to
// be — measured at -25° on a path travelling at -90°, i.e. an arrowhead 65°
// off the actual direction of travel. Fading the throw out over the last
// stretch and then finishing with a guaranteed straight run brings that to
// exactly -90°.
const WAVE_TAPER = 24
const WAVE_RUNOUT = 12

export function wavy(pts) {
  const total = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)
  const out = []
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = dist(a, b)
    if (!len) continue
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    for (let s = 0; s < len; s += WAVE_STEP) {
      const r = s / len
      const k = acc + s
      const fade = Math.max(0, Math.min(1, k / WAVE_TAPER, (total - k) / WAVE_TAPER))
      const amp = WAVE_AMP * fade * Math.sin((k / WAVE_LEN) * Math.PI * 2)
      out.push({ x: a.x + (b.x - a.x) * r + nx * amp, y: a.y + (b.y - a.y) * r + ny * amp })
    }
    acc += len
  }
  // The straight finish the arrowhead takes its angle from.
  if (pts.length > 1) {
    const last = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    const l = dist(prev, last)
    if (l) {
      const run = Math.min(WAVE_RUNOUT, l)
      out.push({ x: last.x - ((last.x - prev.x) / l) * run, y: last.y - ((last.y - prev.y) / l) * run })
    }
  }
  out.push(pts[pts.length - 1])
  return out.length > 1 ? poly(out) : poly(pts)
}

export function startState() {
  return {
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1180, acts: [] },
      { id: 'o2', team: 'off', label: '2', x: 200, y: 800, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1300, y: 800, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 430, y: 330, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 1070, y: 330, acts: [] },
    ],
    ball: { x: 800, y: 1230, acts: [] },
  }
}

// Board runtime: bundles the derived helpers that need access to full board
// state (players/ball/autoDef) so they can be reused by both the live board
// and the frame-by-frame exporter.
export function makeBoard(state) {
  const nSteps = () => Math.max(1, state.steps, maxStepOf(state.players.concat([state.ball])))

  const carriers = () => carrierMap(state.players, state.ball, nSteps())

  const ballStart = (k, cmap) => {
    const c = (cmap || carriers())[k]
    if (c) { const p = baseAt(c, k); return { x: p.x + BOFF.x, y: p.y + BOFF.y } }
    return baseAt(state.ball, k)
  }

  const ballPos = (t) => {
    const n = nSteps()
    const k = stepAtTime(t, n)
    const cmap = carriers()
    const fr = Math.max(0, Math.min(0.999999, t)) * n - (k - 1)
    const act = actsOf(state.ball).find((a) => a.step === k && a.pts.length)
    if (act) {
      const e = easeInOut(fr)
      return ptAt([ballStart(k, cmap)].concat(act.pts), e)
    }
    const c = cmap[k]
    if (c) { const p = posAtTime(c, t, n); return { x: p.x + BOFF.x, y: p.y + BOFF.y } }
    return baseAt(state.ball, k)
  }

  const marks = () => {
    const out = {}
    const offs = state.players.filter((p) => p.team === 'off')
    state.players.filter((p) => p.team === 'def').forEach((d) => {
      let best = null
      let bd = 1e9
      offs.forEach((o) => { const dd = dist(o, d); if (dd < bd) { bd = dd; best = o } })
      if (best && bd < 700) out[d.id] = best.id
    })
    return out
  }

  // Where a half-court view's near hoop sits — see playSvg.js's own rim
  // circle, which the live board, the preview and the PDF export all crop
  // to the same top region.
  const HOOP = { x: 750, y: 157.5 }

  // How far off-ball a defender sags toward the rim, scaled by how far his
  // own man is from the ball: the "ball-you-man" line every coach teaches —
  // tight within about one pass, sagging further into help the longer that
  // pass would be. Since the ball rides with whoever's holding it, a man who
  // *has* the ball is automatically at distance ~0 and this reduces to the
  // old tight mirror with no special-casing needed for "who's on-ball".
  const HELP_ON_DIST = 260
  const HELP_MAX_DIST = 900
  const HELP_MAX_SAG = 130
  const helpAdjustedMan = (manPos, ballPt) => {
    const manToBall = dist(manPos, ballPt)
    const blend = Math.max(0, Math.min(1, (manToBall - HELP_ON_DIST) / (HELP_MAX_DIST - HELP_ON_DIST)))
    if (!blend) return manPos
    const dx = HOOP.x - manPos.x
    const dy = HOOP.y - manPos.y
    const dl = Math.hypot(dx, dy) || 1
    const sag = HELP_MAX_SAG * blend
    return { x: manPos.x + (dx / dl) * sag, y: manPos.y + (dy / dl) * sag }
  }

  // How much of the gap to the ideal shadowing position a defender closes
  // per SUB-th of a step. Below 1 so a burst of speed from his man opens a
  // visible step of separation that closes back down once the man slows —
  // a defender reacting a beat late rather than moving in perfect lockstep.
  const REACT_EASE = 0.4

  // Defender track: mirrors his man's movement across ALL steps (adjusted
  // for help positioning), trails that ideal spot by a reaction lag, keeps
  // his own drawn paths where they exist, and gets stuck on screens for the
  // rest of that step.
  const entPos = (ent, t, n, marksMap) => {
    if (ent.team !== 'def' || !state.autoDef) return posAtTime(ent, t, n)
    const manId = (marksMap || marks())[ent.id]
    const man = manId && state.players.find((p) => p.id === manId)
    if (!man) return posAtTime(ent, t, n)

    const SUB = 24
    const total = Math.max(0, Math.min(0.999999, t)) * n
    const steps = Math.ceil(total * SUB)
    // idealPos is where perfect man-to-man shadowing (with help positioning
    // and screen collisions) says the defender should be; renderPos is what
    // actually gets drawn, trailing idealPos by the reaction lag above.
    let idealPos = { x: ent.x, y: ent.y }
    let renderPos = { x: ent.x, y: ent.y }
    let prevMan = helpAdjustedMan({ x: man.x, y: man.y }, ballPos(0))
    for (let i = 1; i <= steps; i++) {
      const u = Math.min(total, i / SUB)
      const k = Math.floor(u) + 1
      const tt = u / n
      const own = actsOf(ent).find((a) => a.step === k && a.pts.length)
      const mp = helpAdjustedMan(posAtTime(man, tt, n), ballPos(tt))
      if (own) { idealPos = posAtTime(ent, tt, n); renderPos = idealPos; prevMan = mp; continue }
      const cand = { x: idealPos.x + (mp.x - prevMan.x), y: idealPos.y + (mp.y - prevMan.y) }
      let hitScreen = null
      state.players.forEach((sp) => {
        if (sp.id === ent.id || sp.team === 'def') return
        if (!actsOf(sp).some((a) => a.type === 'screen' && a.step <= k && a.pts.length)) return
        const spp = posAtTime(sp, tt, n)
        if (dist(cand, spp) < 118 && (!hitScreen || dist(cand, spp) < dist(cand, hitScreen))) hitScreen = spp
      })
      if (!hitScreen) idealPos = cand
      else {
        const vx = cand.x - idealPos.x
        const vy = cand.y - idealPos.y
        const nx = cand.x - hitScreen.x
        const ny = cand.y - hitScreen.y
        const nl = Math.hypot(nx, ny) || 1
        const ux = nx / nl
        const uy = ny / nl
        const along = vx * -uy + vy * ux
        idealPos = { x: idealPos.x + -uy * along * 0.45, y: idealPos.y + ux * along * 0.45 }
      }
      renderPos = { x: renderPos.x + (idealPos.x - renderPos.x) * REACT_EASE, y: renderPos.y + (idealPos.y - renderPos.y) * REACT_EASE }
      prevMan = mp
    }
    return renderPos
  }

  const hit = (p, t) => {
    const n = nSteps()
    let best = null
    let bd = 110
    const mk = marks()
    state.players.forEach((pl) => { const d = dist(entPos(pl, t, n, mk), p); if (d < bd) { bd = d; best = pl.id } })
    // The ball only wins a tap that's ambiguous between it and a player when
    // it's the closer of the two — otherwise a player standing near the ball
    // (the starting ball carrier, most commonly) can never be tapped on the
    // half of their token nearest the ball.
    const ballD = dist(ballPos(t), p)
    if (ballD < 70 && ballD < bd) return 'ball'
    return best
  }

  const entity = (id) => (id === 'ball' ? state.ball : state.players.find((p) => p.id === id))

  return { nSteps, carriers, ballStart, ballPos, marks, entPos, hit, entity }
}
