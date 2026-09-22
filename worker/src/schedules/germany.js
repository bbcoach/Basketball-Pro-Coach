// basketball-bund.net's public print view: plain server-rendered JSP, one
// <tr> per game with a fixed 7-cell layout (Nr, Spieltag, Datum, Heim, Gast,
// Spielhalle, Schiedsrichter). No login, no JavaScript rendering — this is
// the one page under this domain robots.txt doesn't disallow (it blocks the
// league-search pages, not the schedule itself once you already have a
// liga_id).
export const label = 'Germany — basketball-bund.net'

export function validId(id) {
  return /^\d{1,10}$/.test(id)
}

export function buildUrl(id) {
  return `https://www.basketball-bund.net/public/spielplan_list.jsp?print=1&viewDescKey=sport.dbb.liga.SpielplanViewPublic%2Findex.jsp_&liga_id=${id}`
}

function stripTags(html) {
  return html
    .replace(/<STRIKE>/gi, '').replace(/<\/STRIKE>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const ROW_RE = /<tr>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<td class="sportItem(?:Even|Odd)"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g

const TITLE_RE = /class="sportViewTitle">([\s\S]*?)<\/td>/

const DATE_TIME_RE = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?/

export function parse(html) {
  const titleMatch = TITLE_RE.exec(html)
  const leagueName = titleMatch ? stripTags(titleMatch[1]) : null

  const games = []
  const teams = new Set()
  let m
  while ((m = ROW_RE.exec(html))) {
    const [, nr, , dateCell, homeCell, awayCell, venueCell] = m
    // A struck-through row is a game the federation itself has cancelled or
    // moved off this slot — importing it would just clutter the schedule
    // with a fixture that no longer happens at this date/time.
    if (/<STRIKE>/i.test(dateCell)) continue

    const dateText = stripTags(dateCell)
    const dt = DATE_TIME_RE.exec(dateText)
    if (!dt) continue
    const [, dd, mo, yyyy, time] = dt

    const home = stripTags(homeCell)
    const away = stripTags(awayCell)
    if (!home || !away) continue
    teams.add(home)
    teams.add(away)

    games.push({
      matchNo: nr,
      date: `${yyyy}-${mo}-${dd}`,
      time: time || null,
      home,
      away,
      venue: stripTags(venueCell) || null,
    })
  }

  return { leagueName, teams: Array.from(teams).sort(), games }
}
