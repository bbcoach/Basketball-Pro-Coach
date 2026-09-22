// competitions.ffbb.com is a Next.js app, but each team's own page — the
// same URL a coach would land on by browsing Compétitions → their région →
// comité → club → équipe, or by searching their club's name — is
// server-rendered per request, no login and no client-side fetch needed to
// see the schedule. Unlike Germany's one-table-per-league page, this page is
// already scoped to a single team, so there's no separate "which team is
// mine" filtering step at the data level (see the teams/ambiguity handling
// in parse() below for the one edge case where that still isn't obvious).
export const label = 'France — competitions.ffbb.com'

// e.g. ligues/sud/comites/0013/clubs/sud0013092/equipes/200000005353447 —
// this is also happily what a coach gets by just copying the address bar,
// full URL and all, so accepting either shape here means one idHint covers
// both "paste the link" and "paste just the path".
const PATH_RE = /^ligues\/[a-z0-9]{2,12}\/comites\/[a-z0-9]{2,12}\/clubs\/[a-z0-9]{2,24}\/equipes\/\d{6,20}$/i

function normalizePath(id) {
  let path = typeof id === 'string' ? id.trim() : ''
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch { /* leave as-is — validId rejects whatever this becomes */ }
  }
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

export function validId(id) {
  return PATH_RE.test(normalizePath(id))
}

export function buildUrl(id) {
  return `https://competitions.ffbb.com/${normalizePath(id)}`
}

// The match list itself doesn't live in the plain HTML — it travels inside
// a React Server Components payload, a JSON array embedded in one of the
// page's `self.__next_f.push([...])` calls, escaped one level deeper than
// the surrounding HTML (every real quote shows up as \" in the raw
// response). Unescaping the whole page once turns that back into ordinary,
// searchable JSON text.
function unescapeRsc(html) {
  // A Private Use Area code point stands in for a literal backslash while
  // \" is being turned into " below — one that will never itself appear in
  // the page, unlike a control character, which oxlint's no-control-regex
  // rule (rightly) doesn't want matched literally.
  const placeholder = ''
  return html.replace(/\\\\/g, placeholder).replace(/\\"/g, '"').split(placeholder).join('\\')
}

// Standard bracket-matching, just quote-aware so a "]" inside a venue name
// or similar doesn't end the array early.
function balancedArray(text, openIdx) {
  let depth = 0
  let inStr = false
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') { i++; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) return text.slice(openIdx, i + 1) }
  }
  return null
}

export function parse(html) {
  const text = unescapeRsc(html)
  // Anchoring on this field name first, then walking back to the nearest
  // "data":[ before it, finds the right array regardless of how many other
  // unrelated ones the page also happens to embed.
  const anchor = text.indexOf('"date_rencontre"')
  if (anchor === -1) return { leagueName: null, teams: [], games: [] }
  const dataKeyIdx = text.lastIndexOf('"data":[', anchor)
  if (dataKeyIdx === -1) throw new Error('could not locate schedule data')
  const arrText = balancedArray(text, dataKeyIdx + '"data":'.length)
  if (!arrText) throw new Error('could not parse schedule data')
  const entries = JSON.parse(arrText)

  // nomEquipe1/nomEquipe2 are always home/away, not "me/opponent" — the one
  // name common to every single fixture here is this page's own team. With
  // only one game played so far that's trivially true of both sides, so
  // this falls back to offering both as candidates, reusing the same
  // team-picker step Germany's whole-league adapter needs anyway.
  const nameCounts = new Map()
  for (const e of entries) {
    nameCounts.set(e.nomEquipe1, (nameCounts.get(e.nomEquipe1) || 0) + 1)
    nameCounts.set(e.nomEquipe2, (nameCounts.get(e.nomEquipe2) || 0) + 1)
  }
  const alwaysPresent = Array.from(nameCounts.entries()).filter(([, n]) => n === entries.length).map(([name]) => name)
  const teams = alwaysPresent.length === 1 ? alwaysPresent : Array.from(nameCounts.keys())

  const games = entries.map((e) => ({
    matchNo: e.numero,
    date: e.date_rencontre.slice(0, 10),
    time: e.date_rencontre.slice(11, 16),
    home: e.nomEquipe1,
    away: e.nomEquipe2,
    venue: (e.salle && e.salle.libelle) || null,
  }))

  return { leagueName: alwaysPresent.length === 1 ? alwaysPresent[0] : null, teams, games }
}
