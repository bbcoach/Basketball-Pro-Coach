import { tallyFor } from './stats'
import { download } from './download'
import { ACCENT } from '../state/config'
import { playStepSvgs } from './playSvg'
import { HALF, FULL } from './board-geometry'

function gameSlug(game) {
  if (!game) return 'boxscore'
  const opp = game.type === 'practice' ? 'freeplay' : (game.opponent || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return (game.date || 'boxscore') + '-' + opp
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

// Shared print-report styling so every PDF export (box score, attendance, …)
// reads as the same document family instead of drifting apart one export at
// a time. Not bled to the physical page edge — a print/@page margin trick
// that isn't honored the same way in a plain on-screen preview once broke
// the attendance report's header this way, so exports stay in normal flow.
function reportStyles(pageSize) {
  return `
    @page{size:${pageSize};margin:18mm 16mm}
    *{box-sizing:border-box}
    body{font-family:'Barlow',Arial,sans-serif;color:#171717;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .topbar{height:5px;background:${ACCENT};border-radius:99px;margin:0 0 20px}
    header{display:flex;align-items:center;gap:12px;margin-bottom:22px}
    .logo{width:38px;height:38px;flex:none;border-radius:11px;border:1.5px solid ${ACCENT};display:flex;align-items:center;justify-content:center}
    h1{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:800;font-size:23px;letter-spacing:.3px;text-transform:uppercase;margin:0;line-height:1.05}
    h2{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:700;font-size:15px;letter-spacing:.3px;text-transform:uppercase;color:${ACCENT};margin:1px 0 0}
    .meta{margin-left:auto;text-align:right;font-size:11px;color:#888;line-height:1.6}
    .meta .headline{font-size:12.5px;font-weight:700;color:#333}
    h3{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#555;margin:26px 0 8px}
    table{border-collapse:collapse;width:100%;font-size:12.5px}
    th{font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#999;text-align:left;padding:0 8px 6px;border-bottom:2px solid #222}
    td{padding:8px;border-bottom:1px solid #ececec;vertical-align:middle}
    footer{margin-top:26px;padding-top:10px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:9.5px;color:#aaa}
    footer b{color:#777;font-family:'Barlow Condensed',sans-serif;font-style:italic;letter-spacing:.3px}
  `
}

function reportHead(title) {
  return `<meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700&family=Barlow+Condensed:ital,wght@0,700;1,800&display=swap" rel="stylesheet">`
}

function reportHeader({ title, subtitle, metaLines }) {
  const meta = metaLines.filter(Boolean).map((l, i) => (i === 0 ? `<span class="headline">${esc(l)}</span>` : esc(l))).join('<br>')
  return `<div class="topbar"></div>
    <header>
      <div class="logo"><svg width="20" height="20" viewBox="0 0 48 48"><circle cx="21" cy="27" r="15" fill="none" stroke="${ACCENT}" stroke-width="3.2"/><path d="M6 27 H36" stroke="${ACCENT}" stroke-width="2" opacity=".9"/><path d="M21 12 V42" stroke="${ACCENT}" stroke-width="2" opacity=".9"/></svg></div>
      <div>
        <h1>${esc(title)}</h1>
        <h2>${esc(subtitle)}</h2>
      </div>
      <div class="meta">${meta}</div>
    </header>`
}

function reportFooter() {
  return '<footer><span><b>Basketball Pro Coach</b></span><span>basketballprocoach.com</span></footer>'
}

function openReportWindow(html, fallbackName) {
  const w = window.open('', '_blank')
  if (w) {
    w.document.open(); w.document.write(html); w.document.close()
    const doPrint = () => { try { w.focus(); w.print() } catch { /* ignore */ } }
    if (w.document.fonts && w.document.fonts.ready) {
      w.document.fonts.ready.then(doPrint).catch(doPrint)
    } else {
      setTimeout(doPrint, 500)
    }
  } else {
    download(new Blob([html], { type: 'text/html' }), fallbackName)
  }
}

// `players` is either a plain roster array, or one already tagged with a
// `side` ('A'/'B') for a two-team game — box score / CSV export split into
// per-side tables whenever `game.twoTeam` is set, and treat everything as
// one team otherwise (an untagged player has no `.side`, which just never
// matches 'A'/'B' and falls through to the single-table path unaffected).
function boxRows(players, log) {
  const tot = { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
  const rows = players.map((p) => {
    const t = tallyFor(log, p.id)
    Object.keys(tot).forEach((k) => { tot[k] += t[k] || 0 })
    return { num: p.num, name: p.name, cells: [t.pts, t.fgm + '/' + t.fga, t.fg3m + '/' + (t.fg3m + t.fg3a), t.ftm + '/' + (t.ftm + t.fta), t.reb, t.ast, t.stl, t.blk, t.tov, t.pf] }
  })
  return { rows, totRow: { num: '', name: 'Team', cells: [tot.pts, tot.fgm + '/' + tot.fga, tot.fg3m + '/' + (tot.fg3m + tot.fg3a), tot.ftm + '/' + (tot.ftm + tot.fta), tot.reb, tot.ast, tot.stl, tot.blk, tot.tov, tot.pf] }, pts: tot.pts }
}

export function exportBoxCsv(players, log, game) {
  const head = ['Number', 'Player', 'PTS', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']
  const rowsFor = (list) => list.map((p) => {
    const t = tallyFor(log, p.id)
    return [p.num, p.name, t.pts, t.fgm, t.fga, t.fg3m, t.fg3m + t.fg3a, t.ftm, t.ftm + t.fta, t.reb, t.ast, t.stl, t.blk, t.tov, t.pf]
  })
  const rows = game && game.twoTeam
    ? [[game.teamAName || 'Team A']].concat(rowsFor(players.filter((p) => p.side === 'A')), [[game.teamBName || 'Team B']], rowsFor(players.filter((p) => p.side === 'B')))
    : rowsFor(players)
  const csv = [head].concat(rows).map((r) => r.join(',')).join('\n')
  download(new Blob([csv], { type: 'text/csv' }), gameSlug(game) + '.csv')
}

function boxTableHtml(head, tr, players, log, title) {
  const { rows, totRow } = boxRows(players, log)
  const heading = title ? `<h3>${esc(title)}</h3>` : ''
  return heading + '<table><thead>' + tr(head, 'th') + '</thead><tbody>' +
    rows.map((r) => tr([r.num, r.name].concat(r.cells), 'td')).join('') +
    tr([totRow.num, totRow.name].concat(totRow.cells), 'td', 'total') + '</tbody></table>'
}

export function exportBoxPdf(players, log, teamName, game) {
  const head = ['#', 'Player', 'PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']
  const tr = (cells, tag, cls) => "<tr class='" + (cls || '') + "'>" + cells.map((c) => '<' + tag + '>' + esc(c) + '</' + tag + '>').join('') + '</tr>'
  const date = game ? new Date(game.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const opponent = game ? (game.type === 'practice' ? 'Free play' : (game.opponent ? 'vs ' + game.opponent : 'Game')) : ''

  let tablesHtml
  let metaLines
  if (game && game.twoTeam) {
    const teamAName = game.teamAName || 'Team A'
    const teamBName = game.teamBName || 'Team B'
    const ptsA = boxRows(players.filter((p) => p.side === 'A'), log).pts
    const ptsB = boxRows(players.filter((p) => p.side === 'B'), log).pts
    tablesHtml = boxTableHtml(head, tr, players.filter((p) => p.side === 'A'), log, teamAName) +
      boxTableHtml(head, tr, players.filter((p) => p.side === 'B'), log, teamBName)
    metaLines = [date, `${teamAName} ${ptsA} – ${ptsB} ${teamBName}`]
  } else {
    tablesHtml = boxTableHtml(head, tr, players, log)
    metaLines = [date, opponent, log.length + ' logged actions']
  }

  const html = `<!doctype html><html><head>${reportHead('Box score')}<style>
      ${reportStyles('A4 landscape')}
      table{font-size:12px}
      th,td{text-align:center}
      th:nth-child(2),td:nth-child(2){text-align:left}
      tr.total td{font-weight:700;border-top:2px solid #111;border-bottom:none;background:rgba(232,177,60,.1)}
    </style></head><body>
    ${reportHeader({ title: teamName || 'Basketball Pro Coach', subtitle: 'Box score', metaLines })}
    ${tablesHtml}
    ${reportFooter()}
    </body></html>`

  openReportWindow(html, gameSlug(game) + '.html')
}

// Free play games are just practice reps, not part of the season record —
// excluded here so a coach's per-game averages aren't diluted by scrimmages.
export function exportSeasonPdf(roster, allGames, teamName) {
  const games = allGames.filter((g) => g.type !== 'practice')
  const log = games.flatMap((g) => g.log)
  const head = ['#', 'Player', 'GP', 'PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']
  const tr = (cells, tag, cls) => "<tr class='" + (cls || '') + "'>" + cells.map((c) => '<' + tag + '>' + esc(c) + '</' + tag + '>').join('') + '</tr>'
  const avg = (v, gp) => (gp ? (v / gp).toFixed(1) : '0.0')

  const rows = roster
    .map((p) => {
      const t = tallyFor(log, p.id)
      const gp = games.filter((g) => g.log.some((e) => e.p === p.id)).length
      return { p, t, gp }
    })
    .sort((a, b) => b.t.pts - a.t.pts)

  const body = rows.map(({ p, t, gp }, i) => tr([
    i + 1, p.name, gp,
    avg(t.pts, gp), t.fgm + '/' + t.fga, t.fg3m + '/' + (t.fg3m + t.fg3a), t.ftm + '/' + (t.ftm + t.fta),
    avg(t.reb, gp), avg(t.ast, gp), avg(t.stl, gp), avg(t.blk, gp), avg(t.tov, gp), avg(t.pf, gp),
  ], 'td')).join('')

  const now = new Date()
  const generatedDate = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const html = `<!doctype html><html><head>${reportHead('Season stats')}<style>
      ${reportStyles('A4 landscape')}
      table{font-size:12px}
      th,td{text-align:center}
      th:nth-child(2),td:nth-child(2){text-align:left}
    </style></head><body>
    ${reportHeader({ title: teamName || 'Basketball Pro Coach', subtitle: 'Season stats', metaLines: [generatedDate, games.length + ' game' + (games.length === 1 ? '' : 's') + ' tracked', 'Averages per game played'] })}
    <table><thead>${tr(head, 'th')}</thead><tbody>${body || '<tr><td colspan="13" style="color:#aaa;padding:10px 8px">No games tracked yet.</td></tr>'}</tbody></table>
    ${reportFooter()}
    </body></html>`

  openReportWindow(html, 'season-stats.html')
}

function pctColorFor(pct, hasData) {
  if (!hasData) return '#aaa'
  if (pct >= 80) return '#4da864'
  if (pct >= 55) return '#b8860f'
  return '#c1662e'
}

export function exportAttendancePdf(roster, coaches, sessions, teamName) {
  const today = new Date().toISOString().slice(0, 10)
  const pastSessions = sessions.filter((s) => s.date <= today)
  const total = pastSessions.length

  const playerRows = roster
    .map((p) => {
      const inn = pastSessions.filter((s) => (s.marks || {})[p.id] === 'in').length
      const injured = pastSessions.filter((s) => (s.marks || {})[p.id] === 'inj').length
      const pct = total ? Math.round((inn / total) * 100) : 0
      return { p, inn, injured, pct }
    })
    .sort((a, b) => b.pct - a.pct || b.inn - a.inn)

  const coachRows = coaches
    .map((c) => ({ c, inn: pastSessions.filter((s) => (s.coachMarks || {})[c.id] === 'in').length }))
    .sort((a, b) => b.inn - a.inn)

  const bar = (pct, color) =>
    `<div class="bar"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>`

  const playerHtml = playerRows.map(({ p, inn, injured, pct }, i) => {
    const color = pctColorFor(pct, !!total)
    return `<tr>
      <td class="rank">${i + 1}</td>
      <td class="num">${esc(p.num)}</td>
      <td class="name">${esc(p.name)}</td>
      <td class="sessions">${inn} / ${total}${injured ? `<span class="inj"> · ${injured} inj.</span>` : ''}</td>
      <td class="pctcell">${bar(pct, color)}<span class="pct" style="color:${color}">${total ? pct + '%' : '–'}</span></td>
    </tr>`
  }).join('')

  const coachHtml = coachRows.map(({ c, inn }) => `<tr>
      <td class="name" colspan="3">${esc(c.name)}</td>
      <td class="sessions" colspan="2">${inn} / ${total}</td>
    </tr>`).join('')

  const now = new Date()
  const generatedDate = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const generatedTime = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const html = `<!doctype html><html><head>${reportHead('Training attendance')}<style>
      ${reportStyles('A4 portrait')}
      td.rank{width:22px;color:#bbb;font-weight:700;font-size:11px}
      td.num{width:30px;color:#888;font-weight:700}
      td.name{font-weight:600}
      td.sessions{color:#555;white-space:nowrap}
      .inj{color:#c1662e}
      td.pctcell{display:flex;align-items:center;gap:9px;min-width:140px}
      .bar{flex:1;height:6px;border-radius:99px;background:#eee;overflow:hidden}
      .bar-fill{height:100%;border-radius:99px}
      .pct{flex:none;width:38px;text-align:right;font-weight:700;font-size:12.5px}
    </style></head><body>
    ${reportHeader({ title: teamName || 'Basketball Pro Coach', subtitle: 'Training attendance', metaLines: [generatedDate, generatedTime + ' · ' + total + ' session' + (total === 1 ? '' : 's') + ' counted'] })}
    <h3>Players — by attendance</h3>
    <table><thead><tr><th></th><th>#</th><th>Player</th><th>Sessions</th><th>Attendance</th></tr></thead>
      <tbody>${playerHtml || '<tr><td colspan="5" style="color:#aaa;padding:10px 8px">No players on the roster yet.</td></tr>'}</tbody>
    </table>
    ${coaches.length ? `<h3>Coaches</h3><table><tbody>${coachHtml}</tbody></table>` : ''}
    ${reportFooter()}
    </body></html>`

  openReportWindow(html, 'attendance-summary.html')
}

// A single still image showing every step of a play at once gets unreadable
// fast — this prints one clean tile per step instead, so a long, many-step
// play stays legible as a handout. Also sidesteps the whole canvas/video
// export pipeline entirely (no MediaRecorder involved).
export function exportPlayStepsPdf(play) {
  const svgs = playStepSvgs(play)
  // The court's ratio is baked in as a padding-top percentage (padding
  // percentages resolve against the container's *width*, so this yields an
  // exact height) rather than the `aspect-ratio` property — Mobile Safari's
  // print/PDF pipeline has been seen ignoring `aspect-ratio` and falling
  // back to some other height for the tile, squashing the court. The
  // padding trick is old enough that every print engine sizes it correctly
  // no matter how it handles the newer property. Half and full court have
  // different ratios (1500×1400 vs 1500×2800), so this has to match
  // whichever the play actually uses, not one fixed number for both.
  const vb = play.view === 'full' ? FULL : HALF
  const [, , vbW, vbH] = vb.split(' ').map(Number)
  const padTop = ((vbH / vbW) * 100).toFixed(3) + '%'
  const tileHtml = (svg, i) => `<div class="tile"><div class="tile-head">Step ${i + 1}</div><div class="tile-court-wrap" style="padding-top:${padTop}"><div class="tile-court">${svg}</div></div></div>`

  // A DIN A4 sheet only has room for so much — rather than let the browser's
  // print engine reflow tiles across pages on its own (which is what used
  // to happen here, and which print/PDF pipelines have proven unreliable
  // about, especially on mobile), lay out fixed 3×3 pages of tiles
  // ourselves and force a hard page break between them. Every page then
  // prints as one predictable A4 sheet instead of an arbitrary, engine-
  // dependent split.
  const COLS = 3
  // A full-court tile is roughly twice as tall as a half-court one (the
  // court itself is twice as long), so 3 rows of them doesn't actually fit
  // on one A4 sheet the way 3 rows of half-court tiles does — cap it at 2
  // rows instead so a full-court page still comes out as one clean sheet.
  const ROWS_PER_PAGE = play.view === 'full' ? 2 : 3
  const PAGE_SIZE = COLS * ROWS_PER_PAGE
  const pages = []
  for (let i = 0; i < svgs.length; i += PAGE_SIZE) pages.push(svgs.slice(i, i + PAGE_SIZE))
  const pagesHtml = pages.map((pageSvgs, p) => {
    const offset = p * PAGE_SIZE
    // Only non-last pages force a break — the footer follows right after
    // this markup as a sibling, not inside the last .page div, so a plain
    // `.page:last-child` selector would never match (the footer is always
    // the actual last child) and every page would break, leaving a stray
    // blank page at the end.
    const cls = p < pages.length - 1 ? 'page page-break' : 'page'
    return `<div class="${cls}"><div class="tiles">${pageSvgs.map((svg, i) => tileHtml(svg, offset + i)).join('')}</div></div>`
  }).join('')

  const now = new Date()
  const generatedDate = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const html = `<!doctype html><html><head>${reportHead(play.name || 'Play')}<style>
      ${reportStyles('A4 portrait')}
      .page-break{page-break-after:always}
      .tiles{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:14px}
      .tile{border:1px solid #eee;border-radius:10px;overflow:hidden;break-inside:avoid}
      .tile-head{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#fff;background:${ACCENT};padding:5px 9px}
      .tile-court-wrap{position:relative;width:100%}
      .tile-court{position:absolute;inset:0;background:#8a5e34}
    </style></head><body>
    ${reportHeader({ title: play.name || 'Untitled play', subtitle: 'Play — step by step', metaLines: [generatedDate, svgs.length + ' step' + (svgs.length === 1 ? '' : 's')] })}
    ${pagesHtml}
    ${reportFooter()}
    </body></html>`

  openReportWindow(html, (play.name || 'play').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-steps.html')
}
