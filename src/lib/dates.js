// One date format for the whole app.
//
// There used to be two byte-identical copies of this function — fmtGameDate
// in StatTracker and fmtDate in Schedule — and the attendance list used
// neither, printing the raw ISO string instead. So the same training could
// read "Tue, 10 Mar" on one screen and "2026-03-10" on the next.
//
// The noon anchor is not cosmetic: `new Date('2026-03-10')` is parsed as UTC
// midnight, which in any timezone behind UTC lands on the 9th. Anchoring at
// midday keeps the date the user typed.
export function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  } catch {
    return iso
  }
}

// "1 game" / "2 games". Twenty-three places already spelled this out inline
// and five did not, which is why the app greeted a new user with "1 games
// tracked" and "3 drills · 1 session plans".
export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many || one + 's')
}
