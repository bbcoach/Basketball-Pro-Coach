// Chrome/Edge/Android fire `beforeinstallprompt` once the page qualifies as
// installable — capturing it as early as possible (this module is imported
// from main.jsx before React even mounts) means a banner can later offer a
// real one-tap install instead of "go find your browser's menu yourself".
// Safari never fires this event at all; iOS/iPadOS only support installing
// via the manual Share > Add to Home Screen flow, so that path just gets
// instructions instead of a button.
let deferredPrompt = null
let installed = isStandalone()
const listeners = new Set()

function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true
  } catch {
    return false
  }
}

export function isIOS() {
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports as a Mac in the UA string — touch points is what
  // actually tells it apart from a real desktop Mac.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

function notify() {
  listeners.forEach((cb) => cb())
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  notify()
})
window.addEventListener('appinstalled', () => {
  installed = true
  deferredPrompt = null
  notify()
})

export function subscribeInstallPrompt(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function canPromptInstall() {
  return !installed && !!deferredPrompt
}

export async function promptInstall() {
  if (!deferredPrompt) return
  const prompt = deferredPrompt
  deferredPrompt = null
  prompt.prompt()
  try { await prompt.userChoice } catch { /* ignore */ }
  notify()
}

const SNOOZE_KEY = 'tb.installSnooze.v1'
const REMINDER_INTERVAL_DAYS = 21

export function snoozeInstallHint() {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch { /* ignore quota errors */ }
}

export function shouldShowInstallHint() {
  if (installed) return false
  if (!canPromptInstall() && !isIOS()) return false
  try {
    const snoozed = Number(localStorage.getItem(SNOOZE_KEY)) || 0
    if (!snoozed) return true
    return Date.now() - snoozed > REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return true
  }
}
