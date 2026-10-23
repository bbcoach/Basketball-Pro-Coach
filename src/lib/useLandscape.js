import { useEffect, useState } from 'react'

// Shared orientation signal — used by the few screens (Tactics Board, Stat
// Tracker) that reflow into a landscape layout; the rest keep their column.
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
