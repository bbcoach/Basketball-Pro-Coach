// Roster CSV import. Coaches export their squad from all sorts of places —
// a club's member list, a spreadsheet they keep themselves, a league portal
// — so this parser tries hard to make sense of whatever lands in the file
// rather than insisting on one exact format. It copes with comma, semicolon
// (what German Excel writes by default) and tab separators, with or without
// a header row, and with the number and name columns in either order.

const NUM_HEADS = ['nummer', 'nr', 'nr.', 'no', 'no.', 'num', 'number', '#', 'trikot', 'trikotnummer', 'rückennummer', 'ruckennummer', 'jersey']
const NAME_HEADS = ['name', 'spieler', 'spielername', 'player', 'playername', 'full name', 'fullname']
const FIRST_HEADS = ['vorname', 'first', 'firstname', 'first name', 'given name']
const LAST_HEADS = ['nachname', 'familienname', 'last', 'lastname', 'last name', 'surname']

function splitLine(line, delim) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      // "" inside a quoted field is a literal quote.
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

// Whichever separator appears most often outside quotes wins.
function pickDelimiter(line) {
  let best = ','
  let bestCount = 0
  for (const d of [';', ',', '\t']) {
    const count = splitLine(line, d).length - 1
    if (count > bestCount) { best = d; bestCount = count }
  }
  return best
}

const looksNumeric = (v) => /^\d{1,3}$/.test(v)

function headerIndex(cells, names) {
  return cells.findIndex((c) => names.includes(c.toLowerCase().replace(/\.$/, '')))
}

// Without a header we have to guess: the column where most values look like
// a jersey number is the number, and the wordiest of the rest is the name.
function inferColumns(rows) {
  const width = Math.max(...rows.map((r) => r.length))
  let numIdx = -1
  let bestNumeric = 0
  for (let i = 0; i < width; i++) {
    const vals = rows.map((r) => r[i] || '').filter(Boolean)
    if (!vals.length) continue
    const share = vals.filter(looksNumeric).length / vals.length
    if (share > 0.6 && share > bestNumeric) { bestNumeric = share; numIdx = i }
  }
  const textCols = []
  for (let i = 0; i < width; i++) {
    if (i === numIdx) continue
    const vals = rows.map((r) => r[i] || '').filter(Boolean)
    if (!vals.length) continue
    const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length
    textCols.push({ i, avg })
  }
  textCols.sort((a, b) => b.avg - a.avg)
  // Two text columns and no number column reads as first name / last name.
  if (numIdx < 0 && textCols.length >= 2) {
    const [a, b] = [textCols[0].i, textCols[1].i].sort((x, y) => x - y)
    return { numIdx: -1, nameIdx: -1, firstIdx: a, lastIdx: b }
  }
  return { numIdx, nameIdx: textCols.length ? textCols[0].i : -1, firstIdx: -1, lastIdx: -1 }
}

export function parseRosterCsv(text) {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) throw new Error('That file is empty.')

  const delim = pickDelimiter(lines[0])
  const rows = lines.map((l) => splitLine(l, delim))

  const head = rows[0].map((c) => c.toLowerCase().replace(/\.$/, ''))
  const isHeader = head.some((c) => NUM_HEADS.includes(c) || NAME_HEADS.includes(c) || FIRST_HEADS.includes(c) || LAST_HEADS.includes(c))

  let cols
  let body
  if (isHeader) {
    cols = {
      numIdx: headerIndex(rows[0], NUM_HEADS),
      nameIdx: headerIndex(rows[0], NAME_HEADS),
      firstIdx: headerIndex(rows[0], FIRST_HEADS),
      lastIdx: headerIndex(rows[0], LAST_HEADS),
    }
    body = rows.slice(1)
    // A lone "Name" header next to a "Vorname" column is the last name.
    if (cols.firstIdx >= 0 && cols.nameIdx >= 0 && cols.lastIdx < 0) { cols.lastIdx = cols.nameIdx; cols.nameIdx = -1 }
    if (!body.length) throw new Error('That file has a header but no players.')
    if (cols.nameIdx < 0 && cols.firstIdx < 0 && cols.lastIdx < 0) cols = { ...cols, ...inferColumns(body) }
  } else {
    body = rows
    cols = inferColumns(body)
  }

  const players = []
  const seen = new Set()
  body.forEach((r) => {
    const name = cols.nameIdx >= 0
      ? (r[cols.nameIdx] || '').trim()
      : [r[cols.firstIdx] || '', r[cols.lastIdx] || ''].map((v) => v.trim()).filter(Boolean).join(' ')
    if (!name) return
    const num = cols.numIdx >= 0 ? (r[cols.numIdx] || '').trim() : ''
    const key = name.toLowerCase() + '|' + num
    if (seen.has(key)) return
    seen.add(key)
    players.push({ name, num })
  })

  if (!players.length) throw new Error("Couldn't find any player names in that file.")
  return players
}
