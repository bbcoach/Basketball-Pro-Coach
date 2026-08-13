import { tallyFor } from './stats'
import { download } from './download'

export function exportBoxCsv(roster, log) {
  const head = ['Number', 'Player', 'PTS', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']
  const rows = roster.map((p) => {
    const t = tallyFor(log, p.id)
    return [p.num, p.name, t.pts, t.fgm, t.fga, t.fg3m, t.fg3m + t.fg3a, t.ftm, t.ftm + t.fta, t.reb, t.ast, t.stl, t.blk, t.tov, t.pf]
  })
  const csv = [head].concat(rows).map((r) => r.join(',')).join('\n')
  download(new Blob([csv], { type: 'text/csv' }), 'boxscore.csv')
}

export function exportBoxPdf(roster, log, teamName) {
  const head = ['#', 'Player', 'PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']
  const tot = { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
  const rows = roster.map((p) => {
    const t = tallyFor(log, p.id)
    Object.keys(tot).forEach((k) => { tot[k] += t[k] || 0 })
    return [p.num, p.name, t.pts, t.fgm + '/' + t.fga, t.fg3m + '/' + (t.fg3m + t.fg3a), t.ftm + '/' + (t.ftm + t.fta), t.reb, t.ast, t.stl, t.blk, t.tov, t.pf]
  })
  const totRow = ['', 'Team', tot.pts, tot.fgm + '/' + tot.fga, tot.fg3m + '/' + (tot.fg3m + tot.fg3a), tot.ftm + '/' + (tot.ftm + tot.fta), tot.reb, tot.ast, tot.stl, tot.blk, tot.tov, tot.pf]
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const tr = (cells, tag, cls) => "<tr class='" + (cls || '') + "'>" + cells.map((c) => '<' + tag + '>' + esc(c) + '</' + tag + '>').join('') + '</tr>'
  const date = new Date().toLocaleDateString()
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>Box score</title><style>" +
    '@page{size:A4 landscape;margin:16mm}body{font-family:\'Helvetica Neue\',Arial,sans-serif;color:#111;margin:0}' +
    'h1{font-size:20px;margin:0 0 2px;letter-spacing:.4px}h2{font-size:12px;font-weight:500;color:#666;margin:0 0 18px}' +
    'table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:7px 8px;text-align:center;border-bottom:1px solid #e3e3e3}' +
    "th{font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:#777}th:nth-child(2),td:nth-child(2){text-align:left}" +
    'tr.total td{font-weight:700;border-top:2px solid #111;border-bottom:none}' +
    'footer{margin-top:22px;font-size:10px;color:#999}</style></head><body>' +
    '<h1>' + esc(teamName || 'Team') + ' — Box score</h1><h2>' + esc(date) + ' · ' + log.length + ' logged actions</h2>' +
    '<table><thead>' + tr(head, 'th') + '</thead><tbody>' + rows.map((r) => tr(r, 'td')).join('') +
    tr(totRow, 'td', 'total') + '</tbody></table><footer>Basketball Pro Coach</footer></body></html>'
  const w = window.open('', '_blank')
  if (w) {
    w.document.open(); w.document.write(html); w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch { /* ignore */ } }, 350)
  } else {
    download(new Blob([html], { type: 'text/html' }), 'boxscore.html')
  }
}
