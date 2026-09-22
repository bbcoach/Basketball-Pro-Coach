// Pulls a league's schedule from a federation's own public site, via the
// same Worker that hosts cloud sync (see cloudSync.js) — reused here purely
// for its deploy pipeline, this route shares no data or code path with sync.
// The Worker does the actual fetch server-side, sidestepping the browser's
// CORS block on a cross-origin request straight to e.g. basketball-bund.net.
const WORKER_URL = 'https://basketball-pro-coach-sync.ralph-arnold.workers.dev'

// One source shipped so far — see worker/src/schedules/ for how to add
// another. idHint is shown next to the input so a coach knows what to paste.
export const SOURCES = [
  { id: 'germany', label: 'Germany — basketball-bund.net', idHint: 'The number after "liga_id=" in your league’s URL on basketball-bund.net' },
]

// { leagueName, teams: [name,...], games: [{ matchNo, date, time, home, away, venue }] }
export async function fetchSchedule(source, id) {
  const res = await fetch(`${WORKER_URL}/schedule/${source}/${encodeURIComponent(id)}`)
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
