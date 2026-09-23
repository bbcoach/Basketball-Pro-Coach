// Norway is the rare case with no scraping involved at all: basket.no's own
// results app (kamper.basket.no) is a client-side SPA that calls a plain,
// unauthenticated JSON API for its data — same one a browser would hit, just
// called directly instead of through a page render. sportId 199 (basketball)
// is baked into the tournament itself, not something this endpoint needs
// telling separately.
export const label = 'Norway — basket.no'

export function validId(id) {
  return /^\d{1,12}$/.test(id)
}

export function buildUrl(id) {
  return `https://sf14-terminlister-prod-app.azurewebsites.net/ta/TournamentMatches/?tournamentId=${id}`
}

function formatTime(hhmm) {
  if (hhmm === null || hhmm === undefined) return null
  const s = String(hhmm).padStart(4, '0')
  return `${s.slice(0, 2)}:${s.slice(2)}`
}

export function parse(jsonText) {
  const data = JSON.parse(jsonText)
  const matches = Array.isArray(data.matches) ? data.matches : []

  const teams = new Set()
  const games = matches.map((m) => {
    teams.add(m.hometeam)
    teams.add(m.awayteam)
    return {
      matchNo: m.matchNo,
      date: (m.matchDate || '').slice(0, 10),
      time: formatTime(m.matchStartTime),
      home: m.hometeam,
      away: m.awayteam,
      venue: m.activityAreaName || null,
    }
  })

  return { leagueName: (matches[0] && matches[0].tournamentName) || null, teams: Array.from(teams).sort(), games }
}
