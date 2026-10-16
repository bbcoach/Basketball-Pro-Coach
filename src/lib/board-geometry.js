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

// How long one step takes at the board's 1× playback speed. The live board
// and the video export both read it, so an exported clip runs at the pace
// the coach saw while drawing the play.
export const STEP_SECS = 1 / 0.42

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

// ── no overlapping players ─────────────────────────────────────────────
//
// Player tokens have a 54-unit radius; two centres closer than SEP_MIN
// would draw one token on top of the other. That happened all the time:
// auto-defenders shadowing through a teammate, two cutters whose routes
// cross, a path ending on someone's spot, a token dropped onto another.
//
// separate() pushes overlapping pairs apart until none overlap. Who gives
// way is decided by `tier`: the lower tier moves the whole distance, equal
// tiers split it. Offense outranks defense, so the drawn plays stay exactly
// as drawn and the auto-defense bends around them; two offense players
// whose routes cross each step aside by half. A few relaxation passes
// settle chains (A pushes B into C). Cones aren't passed in at all — they
// mark spots on the floor, and a drill dribbling tight past them is the
// point of the drill.
//
// Pure function of positions, so the same t always gives the same layout
// and an animation stays smooth as tokens slide past each other.
export const SEP_MIN = 2 * 54 + 6
const SEP_PASSES = 10

export function separate(items) {
  const pts = items.map((it) => ({ x: it.x, y: it.y }))
  for (let pass = 0; pass < SEP_PASSES; pass++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = pts[i]
        const b = pts[j]
        const d = Math.hypot(b.x - a.x, b.y - a.y)
        if (d >= SEP_MIN - 0.01) continue
        // Push along the line between them as they stood a moment ago
        // (`prev`), not as they stand now. Mid-push, a fast cutter can be
        // shoved past the centre of the player he's colliding with; the
        // current line would then point the other way and throw each of
        // them out on the far side in one frame. The previous line keeps
        // everyone on the side he was on.
        let dx = b.x - a.x
        let dy = b.y - a.y
        const pa = items[i].prev
        const pb = items[j].prev
        if (pa && pb && Math.hypot(pb.x - pa.x, pb.y - pa.y) > 1) { dx = pb.x - pa.x; dy = pb.y - pa.y }
        const dl = Math.hypot(dx, dy)
        // Exactly on top of each other: no direction to push along, so pick
        // a fixed one rather than a random one — the layout must not jitter
        // from frame to frame.
        if (dl < 0.001) { dx = 1; dy = 0 } else { dx /= dl; dy /= dl }
        // How far apart they are along that line, which is what has to grow
        // to SEP_MIN.
        const along = (b.x - a.x) * dx + (b.y - a.y) * dy
        const side = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx)
        if (Math.hypot(along, side) >= SEP_MIN - 0.01) continue
        const over = Math.sqrt(Math.max(0, SEP_MIN * SEP_MIN - side * side)) - along
        const ti = items[i].tier
        const tj = items[j].tier
        const wi = ti < tj ? 1 : ti > tj ? 0 : 0.5
        // Pushing straight apart would hold two players running at each
        // other nose to nose for good, until their tracks had crossed and
        // they swapped sides in a single frame. While they're closing in,
        // they step around instead: sideways, the way their paths are
        // already veering past each other (or to a fixed side when they're
        // dead head-on), so they slide past and carry on.
        let sx = 0
        let sy = 0
        const vi = items[i].vel
        const vj = items[j].vel
        // Once per call, not once per relaxation pass: the passes only
        // settle the pushes, and repeating the sidestep in each of them would
        // swing a player all the way round the other in a single frame.
        if (pass === 0 && vi && vj) {
          const vx = vj.x - vi.x
          const vy = vj.y - vi.y
          if (vx * dx + vy * dy < -0.001) {
            const turn = vx * dy - vy * dx > 0 ? -1 : 1
            sx = -dy * turn * over
            sy = dx * turn * over
          }
        }
        a.x -= (dx * over + sx) * wi
        a.y -= (dy * over + sy) * wi
        b.x += (dx * over + sx) * (1 - wi)
        b.y += (dy * over + sy) * (1 - wi)
        moved = true
      }
    }
    if (!moved) break
  }
  const out = {}
  items.forEach((it, i) => { out[it.id] = pts[i] })
  return out
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

  // The board's state never changes underneath one makeBoard() — a new
  // state gets a new board — so anything derived from it is computed once.
  let cmapCache = null
  const carriers = () => cmapCache || (cmapCache = carrierMap(state.players, state.ball, nSteps()))

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

  let marksCache = null
  const marks = () => {
    if (marksCache) return marksCache
    const out = {}
    const offs = state.players.filter((p) => p.team === 'off')
    state.players.filter((p) => p.team === 'def').forEach((d) => {
      let best = null
      let bd = 1e9
      offs.forEach((o) => { const dd = dist(o, d); if (dd < bd) { bd = dd; best = o } })
      if (best && bd < 700) out[d.id] = best.id
    })
    marksCache = out
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

  // The reaction lag, as a share of each step: a defender starts moving
  // that late into the step and still arrives when it ends. state
  // .defenseDelay (0 = tight, 1 = loose) is the coach-facing slider.
  //
  // This used to be an exponential chase — each tick closed a fixed share
  // of the gap to the ideal spot — which never actually closes the gap. At
  // the loose end a defender was still ~150px out when the step ended and
  // kept sliding through the next step, or through the video's final hold,
  // while his man stood still. Lagging in *time* instead gets the same
  // reacting-a-beat-late look, but every step ends with the defense set.
  const MAX_LAG = 0.4
  const delay = Math.max(0, Math.min(1, state.defenseDelay ?? 0.6))
  const lag = delay * MAX_LAG

  // Where the defender is `fr` (0..1) into a step: his ideal track replayed
  // from `lag` onward, compressed into the rest of the step. The ideal track
  // follows his man, who eases in and out of every step, so the defender
  // also starts and stops at rest — the compression only shows as him
  // moving a bit quicker than his man to make up the late start.
  const lagged = (fr) => (fr <= lag ? 0 : (fr - lag) / (1 - lag))

  // Defender track: mirrors his man's movement across ALL steps (adjusted
  // for help positioning), keeps his own drawn paths where they exist, and
  // gets stuck on screens for the rest of that step. Simulated once per
  // board, SUB samples per step, rather than from scratch on every call —
  // entPos() is asked for every defender on every animation frame, and the
  // collision layout below asks for every sample along the way.
  const SUB = 24
  const idealTracks = {}
  const idealTrack = (ent, man) => {
    if (idealTracks[ent.id]) return idealTracks[ent.id]
    const n = nSteps()
    let idealPos = { x: ent.x, y: ent.y }
    let prevMan = helpAdjustedMan({ x: man.x, y: man.y }, ballPos(0))
    const track = [idealPos]
    for (let i = 1; i <= n * SUB; i++) {
      const u = Math.min(i / SUB, n * 0.999999)
      const k = Math.floor(u) + 1
      const tt = u / n
      const own = actsOf(ent).find((a) => a.step === k && a.pts.length)
      const mp = helpAdjustedMan(posAtTime(man, tt, n), ballPos(tt))
      if (own) { idealPos = posAtTime(ent, tt, n); prevMan = mp; track.push(idealPos); continue }
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
      prevMan = mp
      track.push(idealPos)
    }
    idealTracks[ent.id] = track
    return track
  }

  const entPos = (ent, t, n, marksMap) => {
    if (ent.team !== 'def' || !state.autoDef) return posAtTime(ent, t, n)
    const manId = (marksMap || marks())[ent.id]
    const man = manId && state.players.find((p) => p.id === manId)
    if (!man) return posAtTime(ent, t, n)

    const now = Math.max(0, Math.min(0.999999, t)) * n
    const k0 = Math.floor(now)
    // A path the coach drew for him this step is played as drawn, on time —
    // the lag is for reacting to his man, not for following instructions.
    if (actsOf(ent).some((a) => a.step === k0 + 1 && a.pts.length)) return posAtTime(ent, t, n)
    // What gets drawn is the ideal track at the lagged time, not at `t`.
    const track = idealTrack(ent, man)
    const f = (k0 + lagged(now - k0)) * SUB
    const i = Math.min(track.length - 1, Math.floor(f))
    const a = track[i]
    const b = track[Math.min(track.length - 1, i + 1)]
    const r = f - i
    return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r }
  }

  // Every token's position at time t, as drawn: entPos() for each player,
  // kept apart from everyone else (see separate()).
  //
  // Pushing apart one frame at a time, from nothing, isn't enough: when two
  // routes cross, the push direction flips the instant their centres pass
  // and both tokens teleport to the other side. So the layout is walked
  // forward from the start of the play, LSUB samples per step, and each
  // player carries his offset from his own track from one sample to the
  // next — whichever side he stepped around someone on, he stays on until
  // he's clear. The offset then fades (OFFSET_FADE per sample) so he drifts
  // back onto the route he was drawn on (about a third of a step to settle
  // halfway). Frames in between interpolate the
  // offsets and get one plain separate() pass to tidy up.
  //
  // `yieldId` is a player who gives way to everyone — the one being
  // dragged, so it slides around the others instead of shoving them off
  // their spots.
  const LSUB = 48
  const OFFSET_FADE = 0.9
  const sims = {}
  const sim = (yieldId) => {
    const key = yieldId || ''
    if (!sims[key]) {
      const people = state.players.filter((pl) => !isCone(pl))
      const tiers = people.map((pl) => (pl.id === yieldId ? -1 : pl.team === 'off' ? 1 : 0))
      sims[key] = { people, tiers, offs: [], raws: [], last: null }
    }
    return sims[key]
  }
  const rawAt = (people, t) => {
    const n = nSteps()
    const mk = marks()
    return people.map((pl) => entPos(pl, t, n, mk))
  }
  // Offsets at sample g, computing (and keeping) every sample up to it.
  const offsetsAt = (sm, g) => {
    const total = nSteps() * LSUB
    while (sm.offs.length <= g && sm.offs.length <= total) {
      const i = sm.offs.length
      const raw = rawAt(sm.people, i / total)
      const prev = i ? sm.offs[i - 1] : null
      const prevRaw = sm.last
      // The fade quickens towards each step's end and reaches zero on it, so
      // nobody is still drifting back onto his route once the step is over
      // — the same "everyone set when the step ends" rule as the defense
      // lag. Two players still in contact there just get pushed apart again.
      const rem = (LSUB - (i % LSUB)) % LSUB
      const fade = Math.min(OFFSET_FADE, (rem / (rem + 1)) ** 3)
      const items = sm.people.map((pl, j) => ({
        id: j,
        x: raw[j].x + (prev ? prev[j].x * fade : 0),
        y: raw[j].y + (prev ? prev[j].y * fade : 0),
        tier: sm.tiers[j],
        vel: prevRaw ? { x: raw[j].x - prevRaw[j].x, y: raw[j].y - prevRaw[j].y } : null,
        prev: prev ? { x: prevRaw[j].x + prev[j].x, y: prevRaw[j].y + prev[j].y } : null,
      }))
      sm.last = raw
      sm.raws.push(raw)
      const out = separate(items)
      sm.offs.push(sm.people.map((pl, j) => ({ x: out[j].x - raw[j].x, y: out[j].y - raw[j].y })))
    }
    return sm.offs[Math.min(g, sm.offs.length - 1)]
  }

  const layout = (t, marksMap, yieldId) => {
    const n = nSteps()
    const tc = Math.max(0, Math.min(0.999999, t))
    const sm = sim(yieldId)
    const raw = rawAt(sm.people, tc)
    const f = tc * n * LSUB
    const g = Math.floor(f)
    const o0 = offsetsAt(sm, g)
    const o1 = offsetsAt(sm, g + 1)
    const r = f - g
    const r0 = sm.raws[Math.min(g, sm.raws.length - 1)]
    const items = sm.people.map((pl, j) => ({
      id: pl.id,
      x: raw[j].x + o0[j].x + (o1[j].x - o0[j].x) * r,
      y: raw[j].y + o0[j].y + (o1[j].y - o0[j].y) * r,
      tier: sm.tiers[j],
      prev: { x: r0[j].x + o0[j].x, y: r0[j].y + o0[j].y },
    }))
    const pos = separate(items)
    const rawById = {}
    sm.people.forEach((pl, j) => { rawById[pl.id] = raw[j] })
    state.players.forEach((pl) => { if (!pos[pl.id]) pos[pl.id] = entPos(pl, tc, n, marksMap || marks()) })

    let ball = ballPos(tc)
    const k = stepAtTime(tc, n)
    const c = carriers()[k]
    if (c && rawById[c.id]) {
      const dx = pos[c.id].x - rawById[c.id].x
      const dy = pos[c.id].y - rawById[c.id].y
      if (dx || dy) {
        // In flight, the throw starts from where the carrier was drawn and
        // the carrier's offset fades out as the ball travels.
        const act = actsOf(state.ball).find((a) => a.step === k && a.pts.length)
        const fr = tc * n - (k - 1)
        const w = act ? 1 - easeInOut(fr) : 1
        ball = { x: ball.x + dx * w, y: ball.y + dy * w }
      }
    }
    return { pos, ball }
  }

  const hit = (p, t) => {
    let best = null
    let bd = 110
    const { pos, ball } = layout(t)
    state.players.forEach((pl) => { const d = dist(pos[pl.id], p); if (d < bd) { bd = d; best = pl.id } })
    // The ball only wins a tap that's ambiguous between it and a player when
    // it's the closer of the two — otherwise a player standing near the ball
    // (the starting ball carrier, most commonly) can never be tapped on the
    // half of their token nearest the ball.
    const ballD = dist(ball, p)
    if (ballD < 70 && ballD < bd) return 'ball'
    return best
  }

  const entity = (id) => (id === 'ball' ? state.ball : state.players.find((p) => p.id === id))

  return { nSteps, carriers, ballStart, ballPos, marks, entPos, layout, hit, entity }
}
