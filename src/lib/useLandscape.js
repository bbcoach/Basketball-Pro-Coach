import { useEffect, useState } from 'react'

// Shared orientation signal — used to let the Tactics Board (and only the
// Tactics Board) reflow into a landscape layout instead of showing the
// rotate-lock prompt the rest of the app uses.
export function useLandscape() {
  const [landscape, setLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => setLandscape(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return landscape
}
