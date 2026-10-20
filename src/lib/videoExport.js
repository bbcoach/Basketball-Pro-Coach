// Animated MP4 export for a play — the second attempt at this (see git
// history for #67/#68): the first tried canvas.captureStream() +
// MediaRecorder and kept failing unpredictably on Safari no matter how the
// recording was shaped, so it was pulled entirely. This one never touches
// either API. Instead, every frame is built the same way the PDF export
// already builds one still per step (a plain SVG string, from the same pure
// geometry helpers Court.jsx itself calls) and fed to WebCodecs' own
// VideoEncoder — via the Mediabunny library, which wraps VideoEncoder +
// muxing behind a plain "draw a canvas, call .add()" API — one frame at a
// time. No capture of a live, already-animating surface, so there's no
// captureStream() timing to go wrong.
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, getFirstEncodableVideoCodec } from 'mediabunny'
import {
  actsOf, ballSeams, baseAt, dist, makeBoard, smoothPoly, wavy, isCone, isBall, conePath, CONE_COLOR,
  BALL_SPHERE, BALL_SPHERE_CENTER, stepAtTime, STEP_SECS,
} from './board-geometry'
import { ACCENT, SHOW_NUMBERS } from '../state/config'

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

// Same light/shadow convention playSvg.js's step tiles use: a video is
// always rendered upright, so there's no landscape rotation to account for
// the way Court.jsx's live view has to.
const SHADOW = { dx: 0.12, dy: 0.12 }
const LIGHT = { cx: 0.5 - SHADOW.dx * 1.45, cy: 0.5 - SHADOW.dy * 1.45 }

// Mirrors Court.jsx's own court background (wood pattern, sheen, backboard
// highlights, all court lines for both baskets) as a plain string — for the
// same reason playSvg.js duplicates its own simpler version: this has to
// render standalone, off-screen, independent of whatever's on the live
// board while an export is running.
function courtBg(vbW, vbH) {
  return `<pattern id="vwood" width="216" height="${vbH}" patternUnits="userSpaceOnUse">
      <rect width="216" height="${vbH}" fill="#dcae72" />
      <rect width="54" height="${vbH}" fill="#d5a465" />
      <rect x="108" width="54" height="${vbH}" fill="#e4bb82" />
      <rect x="162" width="54" height="${vbH}" fill="#cf9c5c" />
      <rect x="53" width="2" height="${vbH}" fill="rgba(90,55,20,.22)" />
      <rect x="107" width="2" height="${vbH}" fill="rgba(90,55,20,.18)" />
      <rect x="161" width="2" height="${vbH}" fill="rgba(90,55,20,.22)" />
    </pattern>
    <linearGradient id="vsheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.10" />
      <stop offset="45%" stop-color="#fff" stop-opacity="0.00" />
      <stop offset="100%" stop-color="#000" stop-opacity="0.12" />
    </linearGradient>
    <rect x="0" y="0" width="${vbW}" height="${vbH}" rx="14" fill="url(#vwood)" />
    <rect x="0" y="0" width="${vbW}" height="${vbH}" rx="14" fill="url(#vsheen)" />
    <rect x="505" y="0" width="490" height="580" fill="rgba(255,255,255,.10)" />
    <rect x="505" y="2220" width="490" height="580" fill="rgba(255,255,255,.10)" />
    <g fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.94">
      <rect x="14" y="14" width="1472" height="2772" rx="8" />
      <path d="M14 1400 H1486" />
      <circle cx="750" cy="1400" r="180" />
      <rect x="505" y="14" width="490" height="566" />
      <circle cx="750" cy="580" r="180" />
      <path d="M660 120 H840" stroke-width="13" />
      <circle cx="750" cy="157.5" r="22.5" />
      <path d="M625 157.5 A125 125 0 0 0 875 157.5" />
      <path d="M90 14 V299" />
      <path d="M1410 14 V299" />
      <path d="M90 299 A675 675 0 0 0 1410 299" />
      <rect x="505" y="2220" width="490" height="566" />
      <circle cx="750" cy="2220" r="180" />
      <path d="M660 2680 H840" stroke-width="13" />
      <circle cx="750" cy="2642.5" r="22.5" />
      <path d="M625 2642.5 A125 125 0 0 1 875 2642.5" />
      <path d="M90 2786 V2501" />
      <path d="M1410 2786 V2501" />
      <path d="M90 2501 A675 675 0 0 1 1410 2501" />
    </g>`
}

// One frame at continuous time t (0..1 across the whole play) — the video
// equivalent of playSvg.js's stepSvg(), but driven by board.entPos()/
// ballPos() for live, interpolated positions (including auto-defense lag
// and help-sag) instead of a step's fixed start position.
function frameSvg(play, board, cmap, t, vbW, vbH) {
  const nSteps = play.steps || 1
  const editStep = stepAtTime(t, nSteps)
  const players = play.players || []
  const ball = play.ball || { x: 750, y: 1300, acts: [] }
  const marks = board.marks()
  const TR = 54

  const tokens = []
  const ballTokens = []
  players.forEach((pl) => {
    const p = board.entPos(pl, t, nSteps, marks)
    if (isBall(pl)) {
      ballTokens.push({ x: p.x, y: p.y, r: TR * 0.48, fill: 'url(#vballsphere)', stroke: 'rgba(0,0,0,.62)', ball: true })
      return
    }
    if (isCone(pl)) {
      tokens.push({ x: p.x, y: p.y, r: TR * 0.74, cone: true, fill: CONE_COLOR, stroke: 'rgba(0,0,0,.42)' })
      return
    }
    const off = pl.team === 'off'
    tokens.push({
      x: p.x, y: p.y, r: TR, fill: off ? ACCENT : '#121316', stroke: off ? 'rgba(0,0,0,.35)' : '#ffffff',
      tc: off ? '#101012' : '#ffffff', label: SHOW_NUMBERS ? pl.label : '',
    })
  })
  const bp = board.ballPos(t)
  tokens.push({ x: bp.x, y: bp.y, r: TR * 0.48, fill: 'url(#vballsphere)', stroke: 'rgba(0,0,0,.62)', ball: true })
  tokens.push(...ballTokens)

  const routes = []
  const caps = []
  const badges = []
  const all = players.concat([Object.assign({ id: 'ball' }, ball)])
  all.forEach((ent) => {
    actsOf(ent).forEach((act) => {
      if (act.step !== editStep || !act.pts.length) return
      const start = ent.id === 'ball' ? board.ballStart(act.step, cmap) : isBall(ent) ? board.ballStart(act.step, null, ent) : baseAt(ent, act.step)
      const pts = [start].concat(act.pts)
      if (pts.length < 2) return
      const ty = act.type
      routes.push({
        d: ty === 'dribble' ? wavy(pts) : smoothPoly(pts),
        dash: ty === 'pass' ? '34 26' : ty === 'shot' ? '6 26' : ty === 'handoff' ? '2 12 22 12' : 'none',
        marker: ty === 'screen' ? 'none' : 'url(#varw)',
      })
      const a = pts[pts.length - 2]
      const b = pts[pts.length - 1]
      const len = dist(a, b) || 1
      if (ty === 'screen') {
        const nx = -(b.y - a.y) / len
        const ny = (b.x - a.x) / len
        caps.push(`<path d="M${(b.x - nx * 46).toFixed(1)} ${(b.y - ny * 46).toFixed(1)} L${(b.x + nx * 46).toFixed(1)} ${(b.y + ny * 46).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" />`)
      }
      const bx = b.x + ((b.x - a.x) / len) * 52
      const by = b.y + ((b.y - a.y) / len) * 52
      badges.push({ x: bx, y: by, n: String(act.step) })
    })
  })

  const routesSvg = routes.map((r) => `<path d="${r.d}" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${r.dash}" marker-end="${r.marker}" opacity="0.97" />`).join('')
  const badgesSvg = badges.map((b) => `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="30" fill="rgba(10,10,12,.82)" stroke="#ffffff" stroke-width="4" /><text x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" dominant-baseline="central" text-anchor="middle" fill="#fff" font-size="34" font-weight="700" font-family="'Barlow Condensed', sans-serif">${esc(b.n)}</text>`).join('')
  const tokensSvg = tokens.map((tk) => {
    if (tk.cone) {
      return `<ellipse cx="${(tk.x + SHADOW.dx * tk.r * 1.6).toFixed(1)}" cy="${(tk.y + tk.r * 0.62).toFixed(1)}" rx="${(tk.r * 1.05).toFixed(1)}" ry="${(tk.r * 0.42).toFixed(1)}" fill="url(#vtokshadow)" /><path d="${conePath(tk.x, tk.y, tk.r)}" fill="${tk.fill}" stroke="${tk.stroke}" stroke-width="5" stroke-linejoin="round" />`
    }
    const light = tk.ball ? '' : `<circle cx="${tk.x.toFixed(1)}" cy="${tk.y.toFixed(1)}" r="${(tk.r - 3).toFixed(1)}" fill="url(#vtoklight)" />`
    const seams = tk.ball ? `<path d="${ballSeams(tk.x, tk.y, tk.r)}" fill="none" stroke="${tk.stroke}" stroke-width="3.2" stroke-linecap="round" />` : ''
    const label = tk.label ? `<text x="${tk.x.toFixed(1)}" y="${tk.y.toFixed(1)}" dominant-baseline="central" text-anchor="middle" fill="${tk.tc}" font-size="${(tk.r * 0.96).toFixed(1)}" font-weight="700" font-family="'Barlow Condensed', sans-serif">${esc(tk.label)}</text>` : ''
    return `<circle cx="${(tk.x + SHADOW.dx * tk.r).toFixed(1)}" cy="${(tk.y + SHADOW.dy * tk.r).toFixed(1)}" r="${(tk.r * 1.34).toFixed(1)}" fill="url(#vtokshadow)" /><circle cx="${tk.x.toFixed(1)}" cy="${tk.y.toFixed(1)}" r="${tk.r}" fill="${tk.fill}" />${light}<circle cx="${tk.x.toFixed(1)}" cy="${tk.y.toFixed(1)}" r="${tk.r}" fill="none" stroke="${tk.stroke}" stroke-width="${tk.ball ? 4 : 6}" />${seams}${label}`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="0 0 ${vbW} ${vbH}">
    <defs>
      <marker id="varw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 z" fill="#ffffff" /></marker>
      <radialGradient id="vtokshadow"><stop offset="62%" stop-color="#000" stop-opacity="0.34" /><stop offset="100%" stop-color="#000" stop-opacity="0" /></radialGradient>
      <radialGradient id="vballsphere" cx="${BALL_SPHERE_CENTER.cx}" cy="${BALL_SPHERE_CENTER.cy}" r="${BALL_SPHERE_CENTER.r}">${BALL_SPHERE.map((st) => `<stop offset="${st.offset}" stop-color="${st.color}" />`).join('')}</radialGradient>
      <radialGradient id="vtoklight" cx="${LIGHT.cx}" cy="${LIGHT.cy}" r="0.75"><stop offset="0%" stop-color="#fff" stop-opacity="0.26" /><stop offset="55%" stop-color="#fff" stop-opacity="0.04" /><stop offset="100%" stop-color="#000" stop-opacity="0.20" /></radialGradient>
    </defs>
    ${courtBg(vbW, vbH)}
    ${routesSvg}
    ${caps.join('')}
    ${badgesSvg}
    ${tokensSvg}
  </svg>`
}

// createImageBitmap() on an SVG blob is unreliable across browsers (some
// builds flatly refuse to decode any SVG through it, even trivial ones), so
// this goes through a plain <img> instead — decoding SVGs that way is the
// one path every engine supports — and lets drawImage() do the resize.
function svgToImage(svgMarkup) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render a video frame.')) }
    img.src = url
  })
}


// ── branding ───────────────────────────────────────────────────────────
//
// A shared clip travels without the app around it, so it carries its own
// signature: a small link badge on every frame, and a short end card. Both
// are drawn on the canvas after the court rather than inside the frame SVG,
// because an SVG decoded through <img> can't see the page's web fonts —
// the canvas can, so the wordmark comes out in Barlow Condensed like the app.

const SITE = 'basketballprocoach.com'
const COND_FONT = "'Barlow Condensed', sans-serif"
// Logo.jsx's mark as a standalone SVG: same sphere, same halo ring.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="s" cx="31%" cy="27%" r="82%"><stop offset="0%" stop-color="#ffe9b0"/><stop offset="38%" stop-color="#d49a2e"/><stop offset="100%" stop-color="#201405"/></radialGradient>
    <radialGradient id="h" cx="50%" cy="50%" r="50%"><stop offset="65%" stop-color="${ACCENT}" stop-opacity="0"/><stop offset="76%" stop-color="${ACCENT}" stop-opacity="0"/><stop offset="86%" stop-color="${ACCENT}" stop-opacity=".85"/><stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="24" cy="24" r="23" fill="url(#h)"/><circle cx="24" cy="24" r="15" fill="url(#s)"/>
  <path d="M9 24H39M24 9V39M14 12.5C21 18 21 30 14 35.5M34 12.5C27 18 27 30 34 35.5" fill="none" stroke="#140d03" stroke-width="1.6" opacity=".6"/>
</svg>`

// theme.js's goldText gradient, for canvas text.
function goldFill(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, '#fff1c9')
  g.addColorStop(0.46, ACCENT)
  g.addColorStop(1, '#9a6614')
  return g
}

function pill(ctx, x, y, w, h) {
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Bottom-right corner: in a half-court view that's the open floor by the
// sideline at half court, the spot a play is least likely to use.
function drawBadge(ctx, mark, W, H) {
  ctx.font = `600 17px ${COND_FONT}`
  const tw = ctx.measureText(SITE).width
  const bw = 50 + tw + 14
  const bh = 40
  const x = W - bw - 16
  const y = H - bh - 16
  ctx.fillStyle = 'rgba(10,10,12,.74)'
  pill(ctx, x, y, bw, bh)
  ctx.fill()
  ctx.strokeStyle = 'rgba(232,177,60,.45)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.drawImage(mark, x + 8, y + 4, 32, 32)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.fillText(SITE, x + 50, y + bh / 2 + 1)
}

// Shown after the final positions have held, so it never covers the play.
function drawEndCard(ctx, mark, W, H, alpha) {
  const cy = H / 2
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(10,10,12,.97)'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(mark, W / 2 - 70, cy - 150, 140, 140)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic 800 46px ${COND_FONT}`
  ctx.fillStyle = '#fff'
  ctx.fillText('BASKETBALL PRO COACH', W / 2, cy + 30)
  ctx.font = `600 18px ${COND_FONT}`
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  ctx.fillText('DRAW · ANIMATE · SHARE YOUR PLAYS', W / 2, cy + 72)
  ctx.font = `700 28px ${COND_FONT}`
  ctx.fillStyle = goldFill(ctx, cy + 100, cy + 140)
  ctx.fillText(SITE, W / 2, cy + 120)
  ctx.restore()
}

// Renders a play (the same { view, steps, players, ball, autoDef } shape
// doExportSteps() already builds from the live board) to an MP4 Blob.
// Resolves to the finished file; throws if this browser can't encode video
// at all, which a caller can show as a plain message rather than a half
// -finished download.
export async function renderPlayVideo(play, { fps = 30, speed = 1, onProgress } = {}) {
  const totalSteps = Math.max(1, play.steps || 1)
  const board = makeBoard({ players: play.players || [], ball: play.ball || { x: 750, y: 1300, acts: [] }, steps: totalSteps, autoDef: play.autoDef !== false, helpDef: !!play.helpDef, defenseDelay: play.defenseDelay })
  const cmap = board.carriers()
  const vbW = 1500
  const vbH = play.view === 'full' ? 2800 : 1400

  // The board's own pace at the speed its toggle is set to, so a coach who
  // slowed a play down to 0.5× to explain it gets a 0.5× clip — what you
  // watch is what you export. This used to be a separate 1.1s per step, less
  // than half the board's 1×, and the clips came out looking fast-forwarded.
  //
  // Plus a still at each end: the opening frame shows step 1's routes before
  // anything moves, so a viewer can read the plan first, and the closing
  // frame holds the final positions instead of the clip cutting off the
  // moment the last player arrives. Then the end card fades in on top.
  const HOLD_START = 0.8
  const HOLD_END = 1.5
  const END_CARD = 2.2
  const END_FADE = 0.4
  const leadFrames = Math.round(HOLD_START * fps)
  const moveFrames = Math.max(1, Math.round((totalSteps * STEP_SECS * fps) / speed))
  const endStart = leadFrames + moveFrames + Math.round(HOLD_END * fps)
  const totalFrames = endStart + Math.round(END_CARD * fps)

  const outW = 720
  const outH = Math.round((outW * (vbH / vbW)) / 2) * 2 // even height — codecs expect it

  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9'], { width: outW, height: outH, frameRate: fps })
  if (!codec) throw new Error("This device can't encode video in the browser.")

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  // The fonts are bundled but load lazily, on first use in the page; the
  // canvas would silently fall back to sans-serif if they weren't in yet.
  await Promise.all([`italic 800 46px ${COND_FONT}`, `600 18px ${COND_FONT}`, `700 28px ${COND_FONT}`]
    .map((f) => document.fonts.load(f).catch(() => {})))
  const mark = await svgToImage(MARK)

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const canvasSource = new CanvasSource(canvas, { codec, quality: new Quality('high') })
  output.addVideoTrack(canvasSource)
  await output.start()

  let img = null
  let lastT = -1
  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(0.999999, Math.max(0, (i - leadFrames) / moveFrames))
    // The stills at either end repeat one t, so their frame is built once.
    if (t !== lastT) {
      // eslint-disable-next-line no-await-in-loop
      img = await svgToImage(frameSvg(play, board, cmap, t, vbW, vbH))
      lastT = t
    }
    ctx.clearRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    drawBadge(ctx, mark, outW, outH)
    if (i >= endStart) drawEndCard(ctx, mark, outW, outH, Math.min(1, (i - endStart) / (END_FADE * fps)))
    // eslint-disable-next-line no-await-in-loop
    await canvasSource.add(i / fps, 1 / fps)
    if (onProgress) onProgress((i + 1) / totalFrames)
  }
  await output.finalize()

  return new Blob([output.target.buffer], { type: 'video/mp4' })
}
