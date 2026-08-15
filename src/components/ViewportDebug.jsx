import { useEffect, useState } from 'react'

// TEMPORARY — diagnostic readout for the cold-launch viewport height bug,
// where the app frame comes up ~60px short until the device is rotated.
// Remove this component (and its use in Home) once that's pinned down.

const BUILD = 'dbg2'

// env() values are only readable through a real element's computed style.
let probe
function insets() {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return [parseInt(cs.paddingTop, 10) || 0, parseInt(cs.paddingBottom, 10) || 0]
}

function read() {
  const [top, bottom] = insets()
  const frame = document.querySelector('[data-app-frame]')
  const standalone =
    window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return [
    'ih ' + Math.round(window.innerHeight),
    'vv ' + Math.round((window.visualViewport && window.visualViewport.height) || 0),
    'ch ' + Math.round(document.documentElement.clientHeight),
    'sh ' + Math.round(window.screen.height),
    'ah ' + (document.documentElement.style.getPropertyValue('--app-height') || '?'),
    'fr ' + Math.round(frame ? frame.getBoundingClientRect().height : 0),
    'sat ' + top,
    'sab ' + bottom,
    'sa ' + (standalone ? 1 : 0),
    BUILD,
  ].join(' · ')
}

export default function ViewportDebug() {
  const [line, setLine] = useState(read)

  useEffect(() => {
    const update = () => setLine(read())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update)
    const timer = setInterval(update, 500)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', update)
      clearInterval(timer)
    }
  }, [])

  return (
    <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, lineHeight: 1.5, textAlign: 'center', color: 'rgba(255,255,255,.38)', wordBreak: 'break-word' }}>
      {line}
    </div>
  )
}
