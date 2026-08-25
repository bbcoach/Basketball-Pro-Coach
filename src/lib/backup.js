// Everything the app persists lives in these localStorage keys — see
// state/store.jsx's LS map. A backup is just a snapshot of all of them,
// downloaded as a JSON file the coach can keep somewhere safe and restore
// from later, since the app itself has no server and no sync.
const LS_KEYS = ['tb.plays.v1', 'tb.drills.v1', 'tb.plans.v1', 'tb.teams.v1', 'tb.activeTeam.v1']
const LAST_BACKUP_KEY = 'tb.lastBackup.v1'
const SNOOZE_KEY = 'tb.backupSnooze.v1'
const REMINDER_INTERVAL_DAYS = 14

function buildBackup() {
  const data = {}
  for (const k of LS_KEYS) {
    const raw = localStorage.getItem(k)
    if (raw == null) continue
    try { data[k] = JSON.parse(raw) } catch { /* skip a corrupt entry rather than fail the whole backup */ }
  }
  return { app: 'basketball-pro-coach', version: 1, exportedAt: new Date().toISOString(), data }
}

export function downloadBackup() {
  const backup = buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'basketball-pro-coach-backup-' + new Date().toISOString().slice(0, 10) + '.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())) } catch { /* ignore quota errors */ }
}

// A lost phone or a cleared browser means starting over, since the app has
// no server and no sync — this is the reminder that nudges a coach who's
// never backed up (or hasn't in a while) before that actually happens.
export function snoozeBackupReminder() {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch { /* ignore quota errors */ }
}

export function shouldShowBackupReminder(hasData) {
  if (!hasData) return false
  try {
    const last = Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0
    const snoozed = Number(localStorage.getItem(SNOOZE_KEY)) || 0
    const since = Math.max(last, snoozed)
    if (!since) return true
    return Date.now() - since > REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

// Parses and validates a backup file without touching localStorage, so the
// caller can show the coach what they're about to restore and let them
// back out before anything is overwritten.
export function parseBackup(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error("That file isn't valid JSON.") }
  const data = parsed && parsed.data
  const keys = data && typeof data === 'object' ? Object.keys(data).filter((k) => LS_KEYS.includes(k)) : []
  if (!keys.length) throw new Error("That doesn't look like a Basketball Pro Coach backup file.")
  const teams = Array.isArray(data['tb.teams.v1']) ? data['tb.teams.v1'] : []
  return { exportedAt: parsed.exportedAt || null, data, keys, teamCount: teams.length }
}

export function applyBackup(parsed) {
  parsed.keys.forEach((k) => localStorage.setItem(k, JSON.stringify(parsed.data[k])))
}
