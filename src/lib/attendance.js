// One source of truth for "how did this person's attendance actually go",
// shared by the on-screen detail and by its PDF. Two implementations of the
// same count would eventually disagree, and a printed sheet that contradicts
// the screen is worse than no sheet.

export const ATT_MARKS = {
  in: { label: 'Present', short: 'IN', color: '#5bbf72' },
  out: { label: 'Absent', short: 'OUT', color: '#c8d1d8' },
  inj: { label: 'Injured', short: 'INJ', color: '#d9843c' },
}
// A session where nobody recorded this person at all — not the same thing as
// an absence, and counted separately so the numbers still add up to the
// total instead of quietly turning "unknown" into "missed".
export const ATT_UNRECORDED = { label: 'Not recorded', short: '—', color: 'rgba(255,255,255,.35)' }

export function markMeta(mark) {
  return ATT_MARKS[mark] || ATT_UNRECORDED
}

// Every past session, newest first — the order the rest of the app already
// uses for anything in the past, and the one that answers "was he there last
// time?" without scrolling.
//
// Deliberately every session, not only the attended ones: the sessions
// someone missed are the actual subject whenever this list gets opened, and
// a list of only the ones they made would give a coach no way to see it.
export function personAttendance(person, kind, sessions, today, plans) {
  const key = kind === 'coach' ? 'coachMarks' : 'marks'
  const planName = (id) => (id ? (plans || []).find((p) => p.id === id)?.name || null : null)

  const rows = (sessions || [])
    .filter((s) => s.date <= today)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''))
    .map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time || '',
      planName: planName(s.planId),
      mark: (s[key] || {})[person.id] || null,
    }))

  const counts = { total: rows.length, in: 0, out: 0, inj: 0, none: 0 }
  rows.forEach((r) => { counts[r.mark || 'none'] += 1 })
  // Out of every past session, not out of the ones that happen to be marked:
  // a coach comparing two players needs the same denominator for both.
  counts.pct = counts.total ? Math.round((counts.in / counts.total) * 100) : 0
  return { rows, counts }
}

export function personLabel(person, kind) {
  if (kind === 'coach') return person.name || 'Coach'
  return (person.num || person.num === 0 ? '#' + person.num + ' ' : '') + (person.name || 'Player')
}
