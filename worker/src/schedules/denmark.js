// resultater.basket.dk's "print" view of a team's schedule — plain,
// server-rendered ASP.NET, one <tr> per game in a fixed 11-cell layout
// (Kampnr., Runde, Dag, Dato, Kl., Hjemmehold, Udehold, Spillested, Bane,
// Resultat, and a trailing status cell that carries things like "ANN" for a
// game the federation has annulled/moved off this slot).
//
// The page declares itself windows-1252 (its own <meta charset>, and the
// same encoding via the Content-Type header) rather than UTF-8 — real for
// Danish æ/ø/å in venue and team names — so this is the one adapter so far
// that needs index.js to decode the response with something other than the
// default.
export const label = 'Denmark — resultater.basket.dk'
export const encoding = 'windows-1252'

export function validId(id) {
  return /^\d{1,10}$/.test(id)
}

export function buildUrl(id) {
  return `https://resultater.basket.dk/tms/Turneringer-og-resultater/Print-Hold-Kampprogram.aspx?HoldId=${id}&HjemmeKampe=1&UdeKampe=1&type=3`
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

const ROW_RE = /<tr><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g

const DATE_RE = /^(\d{2})-(\d{2})-(\d{2})$/
const TITLE_RE = /class="headline2">([\s\S]*?)<\/div>/

export function parse(html) {
  const titleMatch = TITLE_RE.exec(html)
  const leagueName = titleMatch ? stripTags(titleMatch[1]) : null

  const teams = new Set()
  const games = []
  let m
  while ((m = ROW_RE.exec(html))) {
    const dato = stripTags(m[4])
    const dm = DATE_RE.exec(dato)
    if (!dm) continue // header row, or anything else that isn't a real fixture
    const [, dd, mo, yy] = dm

    // A non-empty trailing status ("ANN" and friends) means the federation
    // itself pulled this game off this date — same reasoning as skipping a
    // struck-through row on basketball-bund.net.
    if (stripTags(m[11])) continue

    const home = stripTags(m[6])
    const away = stripTags(m[7])
    if (!home || !away) continue
    teams.add(home)
    teams.add(away)

    const kl = stripTags(m[5])
    games.push({
      matchNo: stripTags(m[1]),
      date: `20${yy}-${mo}-${dd}`,
      time: /^\d{2}:\d{2}$/.test(kl) ? kl : null,
      home,
      away,
      venue: stripTags(m[8]) || null,
    })
  }

  return { leagueName, teams: Array.from(teams).sort(), games }
}
