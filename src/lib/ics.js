// Minimal iCalendar (RFC 5545) read/write for My Schedule. No external
// library — VEVENT is a simple enough format that a small hand-rolled
// serializer/parser covers the common case (the flat lists most club/league
// calendar exports actually produce), without pulling in recurrence rules
// or full timezone handling neither this app nor its data model has any use
// for. Times without a 'Z' suffix or a recognized TZID are treated as plain
// local wall-clock time — correct for the common case of a single-timezone
// team, not a general-purpose ICS timezone converter.

function pad2(n) { return String(n).padStart(2, '0') }

function addMinutes(date, time, minutes) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = (time || '00:00').split(':').map(Number)
  const dt = new Date(y, mo - 1, d, h, mi)
  dt.setMinutes(dt.getMinutes() + minutes)
  return dt
}
function addDays(date, days) {
  const [y, mo, d] = date.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() + days)
  return dt
}
function fmtDateOnly(dt) {
  return '' + dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate())
}
function fmtDateTime(dt) {
  return fmtDateOnly(dt) + 'T' + pad2(dt.getHours()) + pad2(dt.getMinutes()) + '00'
}
function fmtStamp() {
  const dt = new Date()
  return dt.getUTCFullYear() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate()) + 'T' + pad2(dt.getUTCHours()) + pad2(dt.getUTCMinutes()) + pad2(dt.getUTCSeconds()) + 'Z'
}
function escapeText(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
// RFC 5545 requires folding lines over 75 octets, continued with CRLF + a
// leading space. Our fields are short in practice, but a stray long
// location/title shouldn't produce an invalid file.
function foldLine(line) {
  if (line.length <= 74) return line
  const parts = []
  let rest = line
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74))
    rest = ' ' + rest.slice(74)
  }
  parts.push(rest)
  return parts.join('\r\n')
}

const DEFAULT_DURATION_MIN = { training: 90, game: 120, event: 60 }

export function buildIcs(items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Basketball Pro Coach//Schedule//EN', 'CALSCALE:GREGORIAN']
  items.forEach((it) => {
    lines.push('BEGIN:VEVENT')
    lines.push('UID:' + it.id + '@basketball-pro-coach')
    lines.push('DTSTAMP:' + fmtStamp())
    if (it.time) {
      lines.push('DTSTART:' + fmtDateTime(addMinutes(it.date, it.time, 0)))
      lines.push('DTEND:' + fmtDateTime(addMinutes(it.date, it.time, DEFAULT_DURATION_MIN[it.kind] || 60)))
    } else {
      // All-day events use an exclusive end date (the day after).
      lines.push('DTSTART;VALUE=DATE:' + fmtDateOnly(addDays(it.date, 0)))
      lines.push('DTEND;VALUE=DATE:' + fmtDateOnly(addDays(it.date, 1)))
    }
    lines.push('SUMMARY:' + escapeText(it.title))
    if (it.location) lines.push('LOCATION:' + escapeText(it.location))
    if (it.description) lines.push('DESCRIPTION:' + escapeText(it.description))
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function downloadIcs(items, filename) {
  const blob = new Blob([buildIcs(items)], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function unescapeText(v) {
  return String(v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// Continuation lines start with a space or tab and are joined to the
// previous line with the fold marker removed.
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseDtValue(raw) {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, , z] = m
  if (h == null) return { date: y + '-' + mo + '-' + d, time: '' }
  if (z) {
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
    return { date: dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()), time: pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) }
  }
  return { date: y + '-' + mo + '-' + d, time: h + ':' + mi }
}

// Parses VEVENTs into { title, date, time, location } — deliberately not
// tagged with a kind (training/game/event): an imported calendar entry has
// no attendance marks or stat log behind it, so it only maps cleanly onto
// this app's generic "event", never a real training or game.
export function parseIcs(text) {
  const lines = unfold(text).split(/\r\n|\n|\r/)
  const events = []
  let cur = null
  for (const raw of lines) {
    if (!raw) continue
    if (raw === 'BEGIN:VEVENT') { cur = {}; continue }
    if (raw === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue }
    if (!cur) continue
    const idx = raw.indexOf(':')
    if (idx < 0) continue
    const name = raw.slice(0, idx).split(';')[0].toUpperCase()
    const value = raw.slice(idx + 1)
    if (name === 'SUMMARY') cur.title = unescapeText(value)
    else if (name === 'LOCATION') cur.location = unescapeText(value)
    else if (name === 'DTSTART') cur.start = parseDtValue(value)
  }
  return events
    .filter((e) => e.start && e.start.date)
    .map((e) => ({ title: (e.title || '').trim() || 'Imported event', date: e.start.date, time: e.start.time || '', location: e.location || '' }))
}
