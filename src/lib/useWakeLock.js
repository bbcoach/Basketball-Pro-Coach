import { useEffect } from 'react'

// Keeps the device from dimming and locking itself on the screens meant to
// be *watched* rather than tapped — live stat tracking, a running drill
// timer, a play propped up in full screen during a timeout. All three go
// minutes at a time without a touch, which is exactly when a tablet decides
// nobody is there and locks itself mid-game.
//
// Deliberately not app-wide: holding a wake lock while someone is browsing
// their play library at home is just battery drain with nothing to show for
// it. Callers pass `active` so the lock exists only for as long as the
// situation actually calls for it.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined

    let sentinel = null
    let cancelled = false

    const acquire = async () => {
      // The browser rejects the request outright while the page is hidden,
      // which is a normal thing to hit on the way back from a locked
      // screen, not a failure worth reporting anywhere.
      if (document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        sentinel = lock
        // The browser hands the lock back on its own whenever the document
        // stops being visible; nothing tells us except this event, and
        // without clearing the reference here the re-acquire below would
        // see a stale sentinel and decide there was nothing to do.
        lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null })
      } catch {
        // Denied, unsupported in this context, or the page lost visibility
        // mid-request. Nothing to recover — the screen just behaves as it
        // did before this feature existed.
      }
    }

    // Coming back to the app (tab switch, unlocking the device by hand)
    // needs the lock asked for again — a released one never revives itself,
    // so without this the screen quietly starts sleeping again from the
    // first interruption onward.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (sentinel) { sentinel.release().catch(() => {}); sentinel = null }
    }
  }, [active])
}
