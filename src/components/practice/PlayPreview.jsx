import { useMemo } from 'react'
import { ACCENT, SHOW_NUMBERS } from '../../state/config'
import {
  HALF, FULL, actsOf, baseAt, dist, makeBoard, poly, wavy,
} from '../../lib/board-geometry'

// Static, read-only diagram of a saved play — start positions plus every
// drawn route overlaid (like the export view), no animation or interaction.
// Kept independent from Court.jsx (which is tied to the live editing
// context) so linking a play to a drill can't affect the board editor.
export default function PlayPreview({ play }) {
  const view = play.view === 'full' ? 'full' : 'half'

  const board = useMemo(() => makeBoard({
    players: play.players || [], ball: play.ball || { x: 750, y: 1300, acts: [] }, steps: play.steps || 1,
  }), [play])

  const { tokens, routes, caps } = useMemo(() => {
    const players = play.players || []
    const ball = play.ball || { x: 750, y: 1300, acts: [] }
    const marks = board.marks()
    const tks = []
    players.forEach((pl) => {
      const p = board.entPos(pl, 0, board.nSteps(), marks)
      const off = pl.team === 'off'
      tks.push({
        key: pl.id, x: p.x, y: p.y, r: 54, fill: off ? ACCENT : '#121316',
        stroke: off ? 'rgba(0,0,0,.35)' : '#ffffff', tc: off ? '#101012' : '#ffffff',
        label: SHOW_NUMBERS ? pl.label : '',
      })
    })
    const bp = board.ballPos(0)
    tks.push({ key: 'ball', x: bp.x, y: bp.y, r: 26, fill: '#e2762b', stroke: 'rgba(0,0,0,.45)', tc: '', label: '' })

    const rts = []
    const cps = []
    const cmap = board.carriers()
    const all = players.concat([Object.assign({ id: 'ball' }, ball)])
    all.forEach((ent) => {
      actsOf(ent).forEach((act) => {
        if (!act.pts.length) return
        const start = ent.id === 'ball' ? board.ballStart(act.step, cmap) : baseAt(ent, act.step)
        const pts = [start].concat(act.pts)
        if (pts.length < 2) return
        const ty = act.type
        rts.push({
          key: ent.id + '-' + act.step, d: ty === 'dribble' ? wavy(pts) : poly(pts),
          dash: ty === 'pass' ? '34 26' : ty === 'shot' ? '6 26' : 'none',
          marker: ty === 'screen' ? 'none' : 'url(#pv-arw)',
        })
        if (ty === 'screen') {
          const a = pts[pts.length - 2]
          const b = pts[pts.length - 1]
          const len = dist(a, b) || 1
          const nx = -(b.y - a.y) / len
          const ny = (b.x - a.x) / len
          cps.push({ key: ent.id + '-' + act.step, d: 'M' + (b.x - nx * 46) + ' ' + (b.y - ny * 46) + ' L' + (b.x + nx * 46) + ' ' + (b.y + ny * 46) })
        }
      })
    })
    return { tokens: tks, routes: rts, caps: cps }
  }, [play, board])

  return (
    <svg viewBox={view === 'half' ? HALF : FULL} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8 }}>
      <defs>
        <marker id="pv-arw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M1 1 L11 6 L1 11 z" fill="#ffffff" />
        </marker>
      </defs>
      <rect x="0" y="0" width="1500" height="2800" rx="14" fill="#8a5e34" />
      <g fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity="0.85">
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
      </g>
      {routes.map((r) => (
        <path key={r.key} d={r.d} fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.dash} markerEnd={r.marker} opacity="0.9" />
      ))}
      {caps.map((c) => (
        <path key={c.key} d={c.d} fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" opacity="0.9" />
      ))}
      {tokens.map((tk) => (
        <g key={tk.key}>
          <circle cx={tk.x} cy={tk.y} r={tk.r} fill={tk.fill} stroke={tk.stroke} strokeWidth="6" />
          {tk.label && <text x={tk.x} y={tk.y} dominantBaseline="central" textAnchor="middle" fill={tk.tc} fontSize={tk.r * 0.96} fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">{tk.label}</text>}
        </g>
      ))}
    </svg>
  )
}
