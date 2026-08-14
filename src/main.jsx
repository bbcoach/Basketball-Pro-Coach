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
function setAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight
  document.documentElement.style.setProperty('--app-height', h + 'px')
}
setAppHeight()
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
