// Pulls a league's schedule from a federation's own public site, via the
// same Worker that hosts cloud sync (see cloudSync.js) — reused here purely
// for its deploy pipeline, this route shares no data or code path with sync.
// The Worker does the actual fetch server-side, sidestepping the browser's
// CORS block on a cross-origin request straight to e.g. basketball-bund.net.
const WORKER_URL = 'https://basketball-pro-coach-sync.ralph-arnold.workers.dev'

// One entry per adapter in worker/src/schedules/. idHint is shown next to
// the input so a coach knows what to paste — a bare id for a source keyed
// by league (Germany), or a whole team-page link for one keyed by team
// (France, whose schedule pages have no single "league id" to speak of).
export const SOURCES = [
  { id: 'germany', label: 'Germany — basketball-bund.net', idHint: 'The number after "liga_id=" in your league’s URL on basketball-bund.net' },
  { id: 'france', label: 'France — competitions.ffbb.com', idHint: 'Paste the link to your team’s page on competitions.ffbb.com (find it under Compétitions → your région → comité → club → équipe)' },
  { id: 'norway', label: 'Norway — basket.no', idHint: 'The number after "tournamentId=" in your league’s URL on kamper.basket.no' },
]

// A pasted id may be the bare thing the Worker wants (Germany's liga_id) or
// a full page URL copied straight out of the address bar (France's team
// link) — stripping a leading origin here means the Worker only ever has to
// deal with the latter as its own adapter's concern, not the routing.
function cleanId(id) {
  return id.trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+/, '')
}

// { leagueName, teams: [name,...], games: [{ matchNo, date, time, home, away, venue }] }
export async function fetchSchedule(source, id) {
  const res = await fetch(`${WORKER_URL}/schedule/${source}/${cleanId(id)}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body && body.error) || 'Could not load that schedule.')
  return body
}

// Narrows a fetched schedule down to one team's games and reshapes them into
// what importScheduleGames() expects — the same shape the manual "Add a
// game" form produces, plus an importId so re-importing later only adds
// what's new.
export function gamesForTeam(schedule, teamName) {
  return schedule.games
    .filter((g) => g.home === teamName || g.away === teamName)
    .map((g) => ({
      importId: `${schedule.source}:${schedule.id}:${g.matchNo}`,
      date: g.date,
      time: g.time || '',
      opponent: g.home === teamName ? g.away : g.home,
      home: g.home === teamName ? 'home' : 'away',
      location: g.venue || '',
    }))
}
