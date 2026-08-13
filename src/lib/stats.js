export const STAT_DEFS = [
  { k: 'fg2m', label: '2 PT', sub: 'made', pos: true },
  { k: 'fg2a', label: '2 PT', sub: 'miss' },
  { k: 'fg3m', label: '3 PT', sub: 'made', pos: true },
  { k: 'fg3a', label: '3 PT', sub: 'miss' },
  { k: 'ftm', label: 'FT', sub: 'made', pos: true },
  { k: 'fta', label: 'FT', sub: 'miss' },
  { k: 'reb', label: 'REB', sub: 'rebound' },
  { k: 'ast', label: 'AST', sub: 'assist' },
  { k: 'stl', label: 'STL', sub: 'steal' },
  { k: 'blk', label: 'BLK', sub: 'block' },
  { k: 'tov', label: 'TO', sub: 'turnover' },
  { k: 'pf', label: 'FOUL', sub: 'personal' },
]

export const STAT_LABEL = {}
STAT_DEFS.forEach((s) => { STAT_LABEL[s.k] = s.label + ' ' + s.sub })

export function tallyFor(log, id, q) {
  const t = { fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
  log.forEach((e) => { if (e.p === id && t[e.k] !== undefined && (!q || q === 'all' || (e.q || 1) === q)) t[e.k]++ })
  t.pts = t.fg2m * 2 + t.fg3m * 3 + t.ftm
  t.fga = t.fg2m + t.fg2a + t.fg3m + t.fg3a
  t.fgm = t.fg2m + t.fg3m
  return t
}
