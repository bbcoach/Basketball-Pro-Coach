// Free drawing and text on the board ("notes"): zones, arrows, lines and
// labels that belong to a play but are not a player, a ball or a route.
//
// A note is plain data, so it is saved, shared and exported with the play:
//   { id, step, kind, color, w, size, pts, text }
//   step  0 = every step, n = only step n
//   kind  'path' (freehand) | 'line' | 'arrow' | 'oval' | 'box' | 'text'
//   w     1 thin, 2 thick            (shapes)
//   size  1 small, 2 medium, 3 title (text)
//   text  a label may be long: one that does not fit a single line shows as a
//         one-line tile with a chevron and unfolds on a tap (open: true keeps
//         it unfolded); the note being edited is always unfolded
//   pts   path: many points; line / arrow / oval / box: two (start, end or
//         opposite corners); text: one (the middle of the label)
//
// Everything that draws a note — the 2D court, the PDF handout, the 3D floor —
// goes through noteElements(), so they cannot drift apart.
import { cleanFreehandPath, smoothPoly } from './board-geometry'

export const NOTE_COLORS = ['#ffffff', '#f5b82e', '#ff5d4a', '#35c6ff', '#5ad17a']
export const NOTE_SHAPES = [
  ['path', '✎︎', 'Free'],
  ['line', '╱︎', 'Line'],
  ['arrow', '➚︎', 'Arrow'],
  ['oval', '◯︎', 'Circle'],
  ['box', '▢︎', 'Box'],
]
const KINDS = ['path', 'line', 'arrow', 'oval', 'box', 'text']
export const NOTE_MAX = 80
export const TEXT_MAX = 400
const TEXT_LINES = 22 // most lines a label opens to
const WRAP = 11 // how wide a label gets, in font sizes, before its text wraps
export const DEFAULT_NOTE_STYLE = { color: '#35c6ff', w: 2, shape: 'path', size: 2, all: false }
export const TEXT_SIZES = [0, 54, 74, 104] // font size in court units, by `size`
export const SHAPE_W = [0, 9, 17] // line width in court units, by `w`
const COURT_W = 1500

const num = (v, lo, hi, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}

// Whatever came out of storage, a share code or an older version: only
// well-formed notes get through, bounded in number and size.
export function normNotes(list) {
  if (!Array.isArray(list)) return []
  const out = []
  list.forEach((n, i) => {
    if (!n || typeof n !== 'object' || !KINDS.includes(n.kind) || !Array.isArray(n.pts) || !n.pts.length) return
    const pts = n.pts.slice(0, 400).map((p) => ({ x: num(p && p.x, -200, COURT_W + 200, 0), y: num(p && p.y, -200, 3000, 0) }))
    const two = ['line', 'arrow', 'oval', 'box'].includes(n.kind)
    if (two && pts.length < 2) return
    const color = NOTE_COLORS.includes(n.color) ? n.color : NOTE_COLORS[1]
    const note = {
      id: typeof n.id === 'string' && n.id ? n.id.slice(0, 24) : 'n' + (i + 1),
      step: Math.round(num(n.step, 0, 99, 0)),
      kind: n.kind,
      color,
      pts: n.kind === 'text' ? pts.slice(0, 1) : two ? pts.slice(0, 2) : pts,
    }
    if (n.kind === 'text') {
      note.text = String(n.text == null ? '' : n.text).slice(0, TEXT_MAX)
      note.size = Math.round(num(n.size, 1, 3, 2))
      if (n.open) note.open = true
      if (!note.text.trim()) return
    } else {
      note.w = Math.round(num(n.w, 1, 2, 2))
    }
    out.push(note)
  })
  return out.slice(0, NOTE_MAX)
}

export const noteVisible = (n, step) => n.step === 0 || n.step === step
// Unfolded: kept open, being edited (sel), or printed (sel '*')
const isOpen = (n, sel) => sel === '*' || !!n.open || n.id === sel

// The drawn width of a label: measured when there is a canvas to measure
// with (a phone's real font), estimated otherwise (tests, print).
let measureCtx
const widths = new Map()
function textWidth(text, fs) {
  const key = fs + '|' + text
  if (widths.has(key)) return widths.get(key)
  let w = text.length * fs * 0.47
  try {
    if (typeof document !== 'undefined') {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
      measureCtx.font = `700 ${fs}px 'Barlow Condensed', sans-serif`
      const m = measureCtx.measureText(text).width
      if (m > 0) w = m
    }
  } catch { /* keep the estimate */ }
  if (widths.size > 300) widths.clear()
  widths.set(key, w)
  return w
}

// Breaks a label's text into lines no wider than `maxW`: at line breaks and
// spaces, and in the middle of a word only when one alone is too long.
function wrapLines(text, fs, maxW) {
  const out = []
  const push = (line) => { if (out.length < TEXT_LINES) out.push(line) }
  String(text).replace(/\s+$/, '').split('\n').forEach((para) => {
    if (!para.trim()) { push(''); return }
    let line = ''
    para.split(' ').forEach((word) => {
      while (textWidth(word, fs) > maxW) {
        let cut = word.length - 1
        while (cut > 1 && textWidth(word.slice(0, cut), fs) > maxW) cut--
        if (line) { push(line); line = '' }
        push(word.slice(0, cut)); word = word.slice(cut)
      }
      const trial = line ? line + ' ' + word : word
      if (!line || textWidth(trial, fs) <= maxW) line = trial
      else { push(line); line = word }
    })
    push(line)
  })
  return out.length ? out : ['']
}

// The box of a text label: centred on its point; an unfolded one grows
// downward from where the folded tile sits.
export function textBox(n, sel) {
  const fs = TEXT_SIZES[n.size] || TEXT_SIZES[2]
  const maxW = fs * WRAP
  const full = wrapLines(n.text || ' ', fs, maxW)
  const collapsible = full.length > 1
  const open = collapsible && isOpen(n, sel)
  let lines = full
  if (collapsible && !open) {
    let first = full[0]
    while (first.length > 1 && textWidth(first + '…', fs) > maxW - fs * 0.5) first = first.slice(0, -1)
    lines = [first.replace(/\s+$/, '') + '…']
  }
  const lineH = fs * 1.2; const padY = fs * 0.17; const padL = fs * 0.55
  const padR = fs * 0.35 + (collapsible ? fs * 0.85 : 0)
  const w = Math.min(1400, Math.max(...lines.map((l) => textWidth(l, fs))) + padL + padR)
  const h1 = lineH + padY * 2
  const h = lines.length * lineH + padY * 2
  const c = n.pts[0]
  return { x: c.x - w / 2, y: c.y - h1 / 2, w, h, fs, lines, collapsible, open, lineH, padY, padL }
}

// A tap on the chevron of a folded or unfolded label (not on the rest of it)
export function chevHit(n, p, sel) {
  if (n.kind !== 'text') return false
  const b = textBox(n, sel)
  if (!b.collapsible) return false
  return p.x >= b.x + b.w - b.fs * 1.35 && p.x <= b.x + b.w + 12 && p.y >= b.y - 8 && p.y <= b.y + b.lineH + b.padY * 2 + 12
}

export function noteBBox(n, sel) {
  if (n.kind === 'text') {
    const b = textBox(n, sel)
    return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }
  }
  const pad = (SHAPE_W[n.w] || 17) / 2 + 6
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  n.pts.forEach((p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) })
  if (n.kind === 'oval' || n.kind === 'box') { const m = ovalOrBox(n); x0 = m.x - m.rx; x1 = m.x + m.rx; y0 = m.y - m.ry; y1 = m.y + m.ry }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

function ovalOrBox(n) {
  const a = n.pts[0]; const b = n.pts[1] || a
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rx: Math.max(24, Math.abs(a.x - b.x) / 2), ry: Math.max(24, Math.abs(a.y - b.y) / 2) }
}

function segDist(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function noteHits(n, p, sel) {
  if (n.kind === 'text') { const b = noteBBox(n, sel); return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 }
  const slack = Math.max(34, (SHAPE_W[n.w] || 17) * 2)
  if (n.kind === 'oval') { const m = ovalOrBox(n); return ((p.x - m.x) / (m.rx + slack)) ** 2 + ((p.y - m.y) / (m.ry + slack)) ** 2 <= 1 }
  if (n.kind === 'box') { const m = ovalOrBox(n); return Math.abs(p.x - m.x) <= m.rx + slack && Math.abs(p.y - m.y) <= m.ry + slack }
  for (let i = 1; i < n.pts.length; i++) if (segDist(p, n.pts[i - 1], n.pts[i]) <= slack) return true
  return n.pts.length === 1 && Math.hypot(p.x - n.pts[0].x, p.y - n.pts[0].y) <= slack
}

// The topmost note under a point among those showing in this step.
export function hitNote(notes, p, step, sel) {
  for (let i = notes.length - 1; i >= 0; i--) if (noteVisible(notes[i], step) && noteHits(notes[i], p, sel)) return notes[i].id
  return null
}

export const moveNote = (n, dx, dy) => ({ ...n, pts: n.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) })

// A finished freehand stroke: the wobble of a finger smoothed out.
export function finishPath(pts) {
  const cleaned = pts.length > 2 ? cleanFreehandPath(pts) : pts
  return cleaned.length ? cleaned : pts
}

// How long a stroke has to be to count as drawn rather than tapped.
export function noteLength(n) {
  if (n.kind === 'text') return 99
  let l = 0
  for (let i = 1; i < n.pts.length; i++) l += Math.hypot(n.pts[i].x - n.pts[i - 1].x, n.pts[i].y - n.pts[i - 1].y)
  return l
}

const f1 = (v) => (Math.round(v * 10) / 10)

// The drawing of one note as plain elements:
//   { t: 'path',    d, stroke, sw, dash?, fill? }
//   { t: 'poly',    d, fill }                  (an arrow head: filled path)
//   { t: 'ellipse', cx, cy, rx, ry, stroke, sw, dash?, fill? }
//   { t: 'rect',    x, y, w, h, rx, stroke, sw, dash?, fill? }
//   { t: 'tag',     x, y, w, h, fs, lines, lineH, padY, padL, chev, color }   (a label)
// The dark under-stroke is what lets a line read on both light wood and the
// white court markings.
export function noteElements(n, sel) {
  const els = []
  const col = n.color
  if (n.kind === 'text') {
    const b = textBox(n, sel)
    els.push({ t: 'tag', x: f1(b.x), y: f1(b.y), w: f1(b.w), h: f1(b.h), fs: b.fs, lines: b.lines, lineH: b.lineH, padY: b.padY, padL: b.padL, chev: b.collapsible ? (b.open ? 'up' : 'down') : null, color: col, cx: n.pts[0].x, cy: n.pts[0].y })
    return els
  }
  const sw = SHAPE_W[n.w] || 17
  const under = 'rgba(0,0,0,.26)'
  const stroke = (d, extra) => {
    els.push({ t: 'path', d, stroke: under, sw: sw + 9, ...extra })
    els.push({ t: 'path', d, stroke: col, sw, ...extra })
  }
  if (n.kind === 'path') {
    stroke(n.pts.length === 1 ? 'M' + f1(n.pts[0].x) + ' ' + f1(n.pts[0].y) + ' l0.1 0' : smoothPoly(n.pts))
  } else if (n.kind === 'line') {
    stroke('M' + f1(n.pts[0].x) + ' ' + f1(n.pts[0].y) + ' L' + f1(n.pts[1].x) + ' ' + f1(n.pts[1].y))
  } else if (n.kind === 'arrow') {
    const a = n.pts[0]; const b = n.pts[1]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len
    const hl = Math.min(len * 0.7, 30 + sw * 3.2); const hw = hl * 0.62
    const bx = b.x - ux * hl * 0.55; const by = b.y - uy * hl * 0.55
    stroke('M' + f1(a.x) + ' ' + f1(a.y) + ' L' + f1(bx) + ' ' + f1(by))
    const head = 'M' + f1(b.x) + ' ' + f1(b.y) + ' L' + f1(b.x - ux * hl - uy * hw) + ' ' + f1(b.y - uy * hl + ux * hw) + ' L' + f1(b.x - ux * hl * 0.62) + ' ' + f1(b.y - uy * hl * 0.62) + ' L' + f1(b.x - ux * hl + uy * hw) + ' ' + f1(b.y - uy * hl - ux * hw) + ' Z'
    els.push({ t: 'poly', d: head, fill: under, stroke: under, sw: 9 })
    els.push({ t: 'poly', d: head, fill: col, stroke: col, sw: 2 })
  } else {
    const m = ovalOrBox(n)
    const dash = (sw * 3.6).toFixed(0) + ' ' + (sw * 2.2).toFixed(0)
    const fill = hexA(col, 0.16)
    if (n.kind === 'oval') {
      els.push({ t: 'ellipse', cx: f1(m.x), cy: f1(m.y), rx: f1(m.rx), ry: f1(m.ry), stroke: under, sw: sw + 9, dash, fill })
      els.push({ t: 'ellipse', cx: f1(m.x), cy: f1(m.y), rx: f1(m.rx), ry: f1(m.ry), stroke: col, sw, dash })
    } else {
      els.push({ t: 'rect', x: f1(m.x - m.rx), y: f1(m.y - m.ry), w: f1(m.rx * 2), h: f1(m.ry * 2), rx: 14, stroke: under, sw: sw + 9, dash, fill })
      els.push({ t: 'rect', x: f1(m.x - m.rx), y: f1(m.y - m.ry), w: f1(m.rx * 2), h: f1(m.ry * 2), rx: 14, stroke: col, sw, dash })
    }
  }
  return els
}

export function hexA(hex, a) {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The same elements as SVG markup, for the printed step-by-step handout.
export const chevPath = (e) => {
  const sz = e.fs * 0.26; const cx = e.x + e.w - e.fs * 0.55; const cy = e.y + e.padY + e.lineH / 2
  const d = e.chev === 'up' ? -1 : 1
  return `M${f1(cx - sz)} ${f1(cy - d * sz * 0.55)} L${f1(cx + sz)} ${f1(cy - d * sz * 0.55)} L${f1(cx)} ${f1(cy + d * sz * 0.75)} Z`
}

export function notesSvg(notes, step) {
  return (notes || []).filter((n) => noteVisible(n, step)).map((n) => noteElements(n, '*').map((e) => {
    const dash = e.dash ? ` stroke-dasharray="${e.dash}"` : ''
    if (e.t === 'path') return `<path d="${e.d}" fill="none" stroke="${e.stroke}" stroke-width="${e.sw}" stroke-linecap="round" stroke-linejoin="round"${dash} />`
    if (e.t === 'poly') return `<path d="${e.d}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.sw}" stroke-linejoin="round" />`
    if (e.t === 'ellipse') return `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${e.fill || 'none'}" stroke="${e.stroke}" stroke-width="${e.sw}"${dash} />`
    if (e.t === 'rect') return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.rx}" fill="${e.fill || 'none'}" stroke="${e.stroke}" stroke-width="${e.sw}"${dash} />`
    const lines = e.lines.map((l, i) => `<text x="${f1(e.x + e.padL)}" y="${f1(e.y + e.padY + e.lineH * (i + 0.5))}" dominant-baseline="central" fill="#fff" font-size="${e.fs}" font-weight="700" font-family="'Barlow Condensed', sans-serif">${esc(l)}</text>`).join('')
    return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${f1(e.fs * 0.3)}" fill="rgba(12,12,14,.92)" /><rect x="${e.x}" y="${e.y}" width="${f1(e.fs * 0.2)}" height="${e.h}" rx="${f1(e.fs * 0.1)}" fill="${e.color}" />${lines}`
  }).join('')).join('')
}
