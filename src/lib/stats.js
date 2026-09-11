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

// The opponent's basket is not a player stat — nobody on the roster did it,
// and it carries no rebound, assist or foul with it. It still lives in the
// same log as everything else, because that is what makes Undo work
// chronologically across both teams: a coach who taps the wrong thing presses
// Undo once and the last thing that happened goes away, whichever side it
// belonged to.
//
// The keys are deliberately their own rather than reused shooting keys.
// teamTally() sums every entry whose key it recognises *regardless of whose
// entry it is*, and the games list calls it on a whole game log — so scoring
// the opponent as 'fg2m' would quietly add their points to your team's
// totals there.
export const OPP_ID = '__opp'
export const OPP_DEFS = [
  { k: 'opp1', label: '+1', v: 1 },
  { k: 'opp2', label: '+2', v: 2 },
  { k: 'opp3', label: '+3', v: 3 },
]
const OPP_VALUE = {}
OPP_DEFS.forEach((o) => { OPP_VALUE[o.k] = o.v })

export const STAT_LABEL = {}
STAT_DEFS.forEach((s) => { STAT_LABEL[s.k] = s.label + ' ' + s.sub })
OPP_DEFS.forEach((o) => { STAT_LABEL[o.k] = 'opponent ' + o.v + (o.v === 1 ? ' point' : ' points') })

export function oppPts(log) {
  let n = 0
  log.forEach((e) => { if (e.p === OPP_ID) n += OPP_VALUE[e.k] || 0 })
  return n
}

// A result only exists once the opponent's score has actually been entered.
// Without this guard a game where the coach tracked their own players but
// never touched the opponent counter would read as a shutout win, which is
// worse than showing nothing — so an untracked game stays untracked.
// Free play has no opponent, and a two-team game already has a real A–B
// score of its own.
export function gameScore(game) {
  if (!game || game.twoTeam || game.type === 'practice') return null
  if (!game.log.some((e) => e.p === OPP_ID)) return null
  const us = teamTally(game.log).pts
  const them = oppPts(game.log)
  return { us, them, outcome: us > them ? 'W' : us < them ? 'L' : 'T' }
}

export function seasonRecord(games) {
  const r = { w: 0, l: 0, t: 0, tracked: 0 }
  games.forEach((g) => {
    const s = gameScore(g)
    if (!s) return
    r.tracked++
    if (s.outcome === 'W') r.w++
    else if (s.outcome === 'L') r.l++
    else r.t++
  })
  return r
}

export function tallyFor(log, id, q) {
  const t = { fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
  log.forEach((e) => { if (e.p === id && t[e.k] !== undefined && (!q || q === 'all' || (e.q || 1) === q)) t[e.k]++ })
  t.pts = t.fg2m * 2 + t.fg3m * 3 + t.ftm
  t.fga = t.fg2m + t.fg2a + t.fg3m + t.fg3a
  t.fgm = t.fg2m + t.fg3m
  return t
}

export function teamTally(log) {
  const t = { fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
  log.forEach((e) => { if (t[e.k] !== undefined) t[e.k]++ })
  t.pts = t.fg2m * 2 + t.fg3m * 3 + t.ftm
  t.fga = t.fg2m + t.fg2a + t.fg3m + t.fg3a
  t.fgm = t.fg2m + t.fg3m
  return t
}
