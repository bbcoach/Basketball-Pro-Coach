// A newer version of the app, found in the background.
//
// The service worker downloads it and then waits (see registerType: 'prompt'
// in vite.config.js) instead of swapping itself in under a running app —
// a restart in the middle of a drill or a drawn play would lose the moment.
// main.jsx tells this module when one is waiting; the banner offers the
// restart, and applyUpdate() does it: the waiting worker takes over and the
// page reloads on it.
let ready = false
let apply = null
const listeners = new Set()

export function setUpdateApplier(fn) { apply = fn }
export function markUpdateReady() {
  ready = true
  listeners.forEach((cb) => cb())
}
export const isUpdateReady = () => ready
export function applyUpdate() { if (apply) apply(true) }
export function subscribeUpdate(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
