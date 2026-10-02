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
  actsOf, ballSeams, baseAt, dist, makeBoard, smoothPoly, wavy, isCone, conePath, CONE_COLOR,
  BALL_SPHERE, BALL_SPHERE_CENTER, stepAtTime,
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
  players.forEach((pl) => {
    const p = board.entPos(pl, t, nSteps, marks)
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

  const routes = []
  const caps = []
  const badges = []
  const all = players.concat([Object.assign({ id: 'ball' }, ball)])
  all.forEach((ent) => {
    actsOf(ent).forEach((act) => {
      if (act.step !== editStep || !act.pts.length) return
      const start = ent.id === 'ball' ? board.ballStart(act.step, cmap) : baseAt(ent, act.step)
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

// Renders a play (the same { view, steps, players, ball, autoDef } shape
// doExportSteps() already builds from the live board) to an MP4 Blob.
// Resolves to the finished file; throws if this browser can't encode video
// at all, which a caller can show as a plain message rather than a half
// -finished download.
export async function renderPlayVideo(play, { fps = 30, onProgress } = {}) {
  const totalSteps = Math.max(1, play.steps || 1)
  const board = makeBoard({ players: play.players || [], ball: play.ball || { x: 750, y: 1300, acts: [] }, steps: totalSteps, autoDef: play.autoDef !== false, defenseDelay: play.defenseDelay })
  const cmap = board.carriers()
  const vbW = 1500
  const vbH = play.view === 'full' ? 2800 : 1400

  // A fixed, generous pace per step rather than the live board's own
  // (adjustable) playback speed — an exported video has to stand on its own
  // without a coach there to hit play/pause, and this keeps a many-step
  // play's export time bounded instead of however long a slow playback
  // speed would take.
  const SECS_PER_STEP = 1.1
  const totalFrames = Math.max(1, Math.round(totalSteps * SECS_PER_STEP * fps))

  const outW = 720
  const outH = Math.round((outW * (vbH / vbW)) / 2) * 2 // even height — codecs expect it

  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9'], { width: outW, height: outH, frameRate: fps })
  if (!codec) throw new Error("This device can't encode video in the browser.")

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const canvasSource = new CanvasSource(canvas, { codec, quality: new Quality('high') })
  output.addVideoTrack(canvasSource)
  await output.start()

  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(0.999999, i / totalFrames)
    const svg = frameSvg(play, board, cmap, t, vbW, vbH)
    // eslint-disable-next-line no-await-in-loop
    const img = await svgToImage(svg)
    ctx.clearRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    // eslint-disable-next-line no-await-in-loop
    await canvasSource.add(i / fps, 1 / fps)
    if (onProgress) onProgress((i + 1) / totalFrames)
  }
  await output.finalize()

  return new Blob([output.target.buffer], { type: 'video/mp4' })
}
