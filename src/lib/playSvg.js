import {
  HALF, FULL, actsOf, baseAt, dist, makeBoard, poly, wavy,
} from './board-geometry'
import { ACCENT, SHOW_NUMBERS } from '../state/config'

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

// Same court background PlayPreview.jsx draws for its live-app thumbnails —
// duplicated here rather than shared because this one has to come out as a
// plain string (for a print/PDF document), not JSX.
const COURT_BG = `<rect x="0" y="0" width="1500" height="2800" rx="14" fill="#8a5e34" />
  <g fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.85">
    <rect x="14" y="14" width="1472" height="2772" rx="8" />
    <path d="M14 1400 H1486" />
    <circle cx="750" cy="1400" r="180" />
    <rect x="505" y="14" width="490" height="566" />
    <circle cx="750" cy="580" r="180" />
    <circle cx="750" cy="157.5" r="22.5" />
    <path d="M625 157.5 A125 125 0 0 0 875 157.5" />
    <rect x="505" y="2220" width="490" height="566" />
    <circle cx="750" cy="2220" r="180" />
    <circle cx="750" cy="2642.5" r="22.5" />
    <path d="M625 2642.5 A125 125 0 0 1 875 2642.5" />
  </g>`

// One step of a play as a self-contained SVG: token positions at the start
// of that step, plus only that step's drawn routes — unlike PlayPreview's
// whole-play overlay, this is meant to be read on its own as one tile in a
// step-by-step handout, so a play with many steps stays legible instead of
// piling every route onto a single cluttered image.
function stepSvg(play, board, cmap, stepIndex) {
  const players = play.players || []
  const ball = play.ball || { x: 750, y: 1300, acts: [] }
  const view = play.view === 'full' ? 'full' : 'half'
  const vb = view === 'half' ? HALF : FULL

  const tokens = players.map((pl) => {
    const p = baseAt(pl, stepIndex)
    const off = pl.team === 'off'
    return {
      x: p.x, y: p.y, r: 54, fill: off ? ACCENT : '#121316',
      stroke: off ? 'rgba(0,0,0,.35)' : '#ffffff', tc: off ? '#101012' : '#ffffff',
      label: SHOW_NUMBERS ? pl.label : '',
    }
  })
  const bp = board.ballStart(stepIndex, cmap)
  tokens.push({ x: bp.x, y: bp.y, r: 26, fill: '#e2762b', stroke: 'rgba(0,0,0,.45)', tc: '', label: '' })

  const routes = []
  const caps = []
  const all = players.concat([Object.assign({ id: 'ball' }, ball)])
  all.forEach((ent) => {
    actsOf(ent).forEach((act) => {
      if (act.step !== stepIndex || !act.pts.length) return
      const start = ent.id === 'ball' ? board.ballStart(act.step, cmap) : baseAt(ent, act.step)
      const pts = [start].concat(act.pts)
      if (pts.length < 2) return
      const ty = act.type
      routes.push({
        d: ty === 'dribble' ? wavy(pts) : poly(pts),
        dash: ty === 'pass' ? '34 26' : ty === 'shot' ? '6 26' : 'none',
        marker: ty === 'screen' ? 'none' : 'url(#step-arw)',
      })
      if (ty === 'screen') {
        const a = pts[pts.length - 2]
        const b = pts[pts.length - 1]
        const len = dist(a, b) || 1
        const nx = -(b.y - a.y) / len
        const ny = (b.x - a.x) / len
        caps.push(`<path d="M${(b.x - nx * 46).toFixed(1)} ${(b.y - ny * 46).toFixed(1)} L${(b.x + nx * 46).toFixed(1)} ${(b.y + ny * 46).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" />`)
      }
    })
  })

  const routesSvg = routes.map((r) => `<path d="${r.d}" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${r.dash}" marker-end="${r.marker}" opacity="0.92" />`).join('')
  const tokensSvg = tokens.map((tk) => `<circle cx="${tk.x.toFixed(1)}" cy="${tk.y.toFixed(1)}" r="${tk.r}" fill="${tk.fill}" stroke="${tk.stroke}" stroke-width="6" />${tk.label ? `<text x="${tk.x.toFixed(1)}" y="${tk.y.toFixed(1)}" dominant-baseline="central" text-anchor="middle" fill="${tk.tc}" font-size="${tk.r * 0.96}" font-weight="700" font-family="'Barlow Condensed', sans-serif">${esc(tk.label)}</text>` : ''}`).join('')

  return `<svg viewBox="${vb}" style="width:100%;height:100%;display:block">
    <defs><marker id="step-arw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 z" fill="#ffffff" /></marker></defs>
    ${COURT_BG}
    ${routesSvg}
    ${caps.join('')}
    ${tokensSvg}
  </svg>`
}

// Renders every step of a play as an array of SVG markup strings, one per
// step — the building blocks for a step-by-step handout.
export function playStepSvgs(play) {
  const totalSteps = play.steps || 1
  const board = makeBoard({ players: play.players || [], ball: play.ball || { x: 750, y: 1300, acts: [] }, steps: totalSteps, autoDef: false })
  const cmap = board.carriers()
  const svgs = []
  for (let s = 1; s <= totalSteps; s++) svgs.push(stepSvg(play, board, cmap, s))
  return svgs
}
