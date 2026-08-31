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
export function carrierMap(players, ball, n) {
  const out = {}
  let c = nearestPlayer(players, { x: ball.x, y: ball.y }, 1, 240)
  for (let k = 1; k <= n; k++) {
    out[k] = c
    const act = actsOf(ball).find((a) => a.step === k && a.pts.length)
    if (act) c = act.type === 'shot' ? null : nearestPlayer(players, act.pts[act.pts.length - 1], k + 1, 300)
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
export function wavy(pts) {
  const out = []
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = dist(a, b)
    if (!len) continue
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    for (let s = 0; s < len; s += 9) {
      const r = s / len
      const k = acc + s
      const amp = 17 * Math.sin(k / 26)
      out.push({ x: a.x + (b.x - a.x) * r + nx * amp, y: a.y + (b.y - a.y) * r + ny * amp })
    }
    acc += len
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

  // Defender track: mirrors his man's movement across ALL steps, keeps his own
  // drawn paths where they exist, and gets stuck on screens for the rest of that step.
  const entPos = (ent, t, n, marksMap) => {
    if (ent.team !== 'def' || !state.autoDef) return posAtTime(ent, t, n)
    const manId = (marksMap || marks())[ent.id]
    const man = manId && state.players.find((p) => p.id === manId)
    if (!man) return posAtTime(ent, t, n)

    const SUB = 24
    const total = Math.max(0, Math.min(0.999999, t)) * n
    const steps = Math.ceil(total * SUB)
    let pos = { x: ent.x, y: ent.y }
    let prevMan = { x: man.x, y: man.y }
    for (let i = 1; i <= steps; i++) {
      const u = Math.min(total, i / SUB)
      const k = Math.floor(u) + 1
      const tt = u / n
      const own = actsOf(ent).find((a) => a.step === k && a.pts.length)
      const mp = posAtTime(man, tt, n)
      if (own) { pos = posAtTime(ent, tt, n); prevMan = mp; continue }
      const cand = { x: pos.x + (mp.x - prevMan.x), y: pos.y + (mp.y - prevMan.y) }
      let hitScreen = null
      state.players.forEach((sp) => {
        if (sp.id === ent.id || sp.team === 'def') return
        if (!actsOf(sp).some((a) => a.type === 'screen' && a.step <= k && a.pts.length)) return
        const spp = posAtTime(sp, tt, n)
        if (dist(cand, spp) < 118 && (!hitScreen || dist(cand, spp) < dist(cand, hitScreen))) hitScreen = spp
      })
      if (!hitScreen) pos = cand
      else {
        const vx = cand.x - pos.x
        const vy = cand.y - pos.y
        const nx = cand.x - hitScreen.x
        const ny = cand.y - hitScreen.y
        const nl = Math.hypot(nx, ny) || 1
        const ux = nx / nl
        const uy = ny / nl
        const along = vx * -uy + vy * ux
        pos = { x: pos.x + -uy * along * 0.45, y: pos.y + ux * along * 0.45 }
      }
      prevMan = mp
    }
    return pos
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
