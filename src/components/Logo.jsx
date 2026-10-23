import { useId } from 'react'
import { raised } from '../theme'

// A gold-shaded sphere with a soft rim-light halo, replacing the old flat
// ring-and-arrow line art — picked from a round of design exploration as
// "still unmistakably a basketball, but less like a default icon-font glyph
// and more like a rendered object." Gradient ids are per-instance (useId)
// since the badge can appear more than once on screen at a time (e.g. the
// landscape board header still shows the compact Header's badge alongside
// nothing else today, but nested modals/overlays have in the past).
// Ten taps on the logo in a row (each within 1.5 s of the one before) set off
// the hidden slam dunk — see DunkEgg in App.jsx. `egg` turns the tap counting
// on, for the places where a tap on the logo does nothing else.
let eggTaps = 0
let eggLast = 0
function eggTap() {
  const now = Date.now()
  eggTaps = now - eggLast > 1500 ? 1 : eggTaps + 1
  eggLast = now
  if (eggTaps >= 10) { eggTaps = 0; window.dispatchEvent(new Event('bpc-dunk')) }
}

export default function Logo({ size = 26, iconSize = 19, egg = false }) {
  const uid = useId()
  const sphereId = 'logo-sphere-' + uid
  const haloId = 'logo-halo-' + uid
  return (
    <div
      onClick={egg ? eggTap : undefined}
      style={{
        width: size, height: size, flex: 'none', borderRadius: size * 0.3,
        ...(egg ? { cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' } : {}),
        ...raised(.06, .1),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg viewBox="0 0 48 48" style={{ width: iconSize, height: iconSize, display: 'block', overflow: 'visible' }} aria-hidden="true">
        <defs>
          <radialGradient id={sphereId} cx="31%" cy="27%" r="82%">
            <stop offset="0%" stopColor="#ffe9b0" />
            <stop offset="38%" stopColor="#d49a2e" />
            <stop offset="100%" stopColor="#201405" />
          </radialGradient>
          {/* A true ring, not a glow: fully transparent from the ball's own
              edge (65%) out to 76% — a visible gap of dark badge showing
              through — then a sharp rise to a bright band peaking at 86%,
              fading out by the outer edge. A gradient that starts brightening
              right at 0% reads as a soft bloom; this one reads as a distinct
              halo sitting apart from the ball. */}
          <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <stop offset="65%" stopColor="#e8b13c" stopOpacity="0" />
            <stop offset="76%" stopColor="#e8b13c" stopOpacity="0" />
            <stop offset="86%" stopColor="#e8b13c" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#e8b13c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill={'url(#' + haloId + ')'} />
        <circle cx="24" cy="24" r="15" fill={'url(#' + sphereId + ')'} />
        <path d="M9 24H39M24 9V39M14 12.5C21 18 21 30 14 35.5M34 12.5C27 18 27 30 34 35.5" fill="none" stroke="#140d03" strokeWidth="1.3" opacity="0.6" />
      </svg>
    </div>
  )
}
