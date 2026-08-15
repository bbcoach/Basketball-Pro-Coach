import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/700-italic.css'
import '@fontsource/barlow-condensed/800-italic.css'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// iOS keeps a standalone (Home Screen) PWA's process suspended instead of
// reloading it when it's reopened, so the browser's normal "a fresh page
// load checks for a new service worker" update path doesn't reliably fire —
// a device can stay on a stale build indefinitely. Force a real update
// check (registration.update()) whenever the app returns to the
// foreground; registerType 'autoUpdate' already reloads the page
// automatically once a newer service worker activates.
let swRegistration
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    swRegistration = registration
  },
})
const checkForUpdate = () => swRegistration && swRegistration.update()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate()
})
window.addEventListener('focus', checkForUpdate)

// iOS misreports 100dvh in a standalone (Home Screen) PWA — it can settle on
// a value noticeably shorter than the real visible viewport. Measure the
// actual height with JS and expose it as a CSS var so layout can use that
// instead, with 100dvh only as a fallback before this runs.

// env() values are only readable through a real element's computed style.
let insetProbe
function safeAreaTop() {
  if (!insetProbe) {
    insetProbe = document.createElement('div')
    insetProbe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top)'
    document.body.appendChild(insetProbe)
  }
  return parseInt(getComputedStyle(insetProbe).paddingTop, 10) || 0
}

// In an iOS Home Screen PWA with viewport-fit=cover the page paints from the
// very top of the screen, but innerHeight and visualViewport.height both
// intermittently report a height short by exactly the status-bar strip
// (measured on device: 793 instead of 852, with a 59px top inset), leaving a
// black gap along the bottom. Which of the two states you get is a coin flip
// — a rotation flips it either way — and while it's wrong, *every* one of
// those properties is wrong, so no amount of re-measuring or picking the
// largest of them recovers the real height.
//
// The layout viewport is the stable one: documentElement.clientHeight reads
// 793 in both states, i.e. it consistently excludes the status-bar strip. So
// clientHeight plus the top inset is the full paintable height, in either
// state. This correction is confined to iOS standalone (navigator.standalone
// is iOS-only) because elsewhere — Android edge-to-edge in particular — the
// layout viewport already includes the inset and adding it would overshoot.
function measureAppHeight() {
  const visual = (window.visualViewport && window.visualViewport.height) || 0
  const layout = document.documentElement.clientHeight || 0
  const reported = Math.max(visual, layout, window.innerHeight || 0)
  if (window.navigator.standalone !== true) return reported
  return Math.max(reported, layout + safeAreaTop())
}
function setAppHeight() {
  const h = measureAppHeight()
  if (!h) return
  const next = h + 'px'
  // Writing unconditionally would re-trigger the ResizeObserver below.
  if (document.documentElement.style.getPropertyValue('--app-height') === next) return
  document.documentElement.style.setProperty('--app-height', next)
}
setAppHeight()
// Re-measure shortly after launch, in case the viewport is still settling.
requestAnimationFrame(() => requestAnimationFrame(setAppHeight))
setTimeout(setAppHeight, 300)
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight)
// A ResizeObserver catches viewport changes that never fire a window resize
// event.
if (window.ResizeObserver) new ResizeObserver(setAppHeight).observe(document.documentElement)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
