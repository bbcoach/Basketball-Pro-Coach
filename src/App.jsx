import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AppProvider, useApp } from './state/store'
import { useLandscape } from './lib/useLandscape'
import { ACCENT, COND } from './theme'
import Home from './components/Home'
import Board from './components/board/Board'
import StatTracker from './components/stats/StatTracker'
import Attendance from './components/attendance/Attendance'
import Practice from './components/practice/Practice'
import Teams from './components/teams/Teams'
import Schedule from './components/Schedule'
import InfoOverlay from './components/InfoOverlay'
import BackupModal from './components/BackupModal'
import RunScreen from './components/practice/RunScreen'
import ConfirmModal from './components/ConfirmModal'
import Toast from './components/Toast'
import UpdateBanner from './components/UpdateBanner'
import ShareCodeModal from './components/ShareCodeModal'
import ImportModal from './components/ImportModal'

// QR encode/decode alone are ~60KB gzipped — a real cost for a feature only
// two devices in the same room, once in a while, ever open. Loaded on
// demand so every other visit to the app never fetches it at all.
const DeviceSyncModal = lazy(() => import('./components/DeviceSyncModal'))

// Shown the instant "Sync devices" is tapped, while that chunk is still
// downloading — matches DeviceSyncModal's own backdrop exactly so there's
// no visible swap once it takes over, just the dim-then-pop-in a coach
// already gets from every other modal in the app. Without this, a slow
// connection means tapping the link does nothing at all until the chunk
// arrives, which reads as a broken tap rather than a loading one.
function SyncLoadingFallback() {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)' }} />
}

function Screen() {
  const { state } = useApp()
  return (
    <>
      {state.screen === 'home' && <Home />}
      {state.screen === 'board' && <Board />}
      {state.screen === 'stats' && <StatTracker />}
      {state.screen === 'attend' && <Attendance />}
      {state.screen === 'practice' && <Practice />}
      {state.screen === 'teams' && <Teams />}
      {state.screen === 'schedule' && <Schedule />}
      {state.infoPage && <InfoOverlay />}
      <BackupModal />
      {state.syncOpen && (
        <Suspense fallback={<SyncLoadingFallback />}>
          <DeviceSyncModal />
        </Suspense>
      )}
      <RunScreen />
      <ConfirmModal />
      <Toast />
      <UpdateBanner />
      <ShareCodeModal />
      <ImportModal />
    </>
  )
}

// A jagged star polygon — the near "explosion" shape sitting right behind
// the comic lettering, like the white burst panel in a comic-book title.
function starPolygon(points, rOuter, rInner) {
  const pts = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    pts.push((Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1))
  }
  return pts.join(' ')
}
// The long alternating dark/gold rays radiating out to the edges.
function burstSpikes(count, rOuter, rInner) {
  const spikes = []
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2
    const a1 = ((i + 0.5) / count) * Math.PI * 2
    const a2 = ((i + 1) / count) * Math.PI * 2
    const p0 = { x: Math.cos(a0) * rInner, y: Math.sin(a0) * rInner }
    const p1 = { x: Math.cos(a1) * rOuter, y: Math.sin(a1) * rOuter }
    const p2 = { x: Math.cos(a2) * rInner, y: Math.sin(a2) * rInner }
    spikes.push(p0.x.toFixed(1) + ',' + p0.y.toFixed(1) + ' ' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1))
  }
  return spikes
}
const SPARKLES = [
  { x: -168, y: -120, s: 1, delay: 0 },
  { x: 172, y: -96, s: 0.7, delay: 0.08 },
  { x: -150, y: 108, s: 0.8, delay: 0.16 },
  { x: 168, y: 128, s: 1.1, delay: 0.04 },
  { x: 0, y: -178, s: 0.65, delay: 0.12 },
  { x: -8, y: 190, s: 0.85, delay: 0.2 },
]
const SPARK_PATH = 'M0 -17 L4.5 -4.5 L17 0 L4.5 4.5 L0 17 L-4.5 4.5 L-17 0 L-4.5 -4.5 Z'

// The full-screen comic-book celebration — takes over the whole frame (not
// just the little mascot) so the hidden 10-tap easter egg actually feels
// like a payoff, in the app's own gold/near-black palette rather than the
// reference image's purple.
function DunkBurst() {
  const spikes = useMemo(() => burstSpikes(14, 210, 44), [])
  const star = useMemo(() => starPolygon(11, 152, 96), [])
  return (
    <div className="rl-burst-wrap" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <svg viewBox="-220 -220 440 440" style={{ width: '94vmin', maxWidth: 460, height: '94vmin', maxHeight: 460, overflow: 'visible' }}>
        <defs>
          <pattern id="rlDots" width="13" height="13" patternUnits="userSpaceOnUse">
            <circle cx="6.5" cy="6.5" r="2" fill="#171722" opacity=".4" />
          </pattern>
          <clipPath id="rlStarClip"><polygon points={star} /></clipPath>
        </defs>
        <g className="rl-burst-spin">
          {spikes.map((pts, i) => <polygon key={i} points={pts} fill={i % 2 === 0 ? ACCENT : '#20202c'} />)}
        </g>
        <polygon className="rl-burst-pop" points={star} fill="#fbf1d8" stroke="#171722" strokeWidth="7" />
        <rect className="rl-burst-pop" x="-160" y="-160" width="320" height="320" fill="url(#rlDots)" clipPath="url(#rlStarClip)" opacity="0.55" />
        {SPARKLES.map((sp, i) => (
          <g key={i} transform={`translate(${sp.x},${sp.y}) scale(${sp.s})`}>
            <path className="rl-sparkle" style={{ animationDelay: sp.delay + 's' }} d={SPARK_PATH} fill="#fff" />
          </g>
        ))}
        <text className="rl-comic-text-1" x="0" y="-16" textAnchor="middle" fontFamily={COND} fontStyle="italic" fontWeight="800" fontSize="76" fill={ACCENT} stroke="#171722" strokeWidth="7" paintOrder="stroke" style={{ transformOrigin: '0px -16px', '--rl-tilt': '-4deg' }}>SLAM</text>
        <text className="rl-comic-text-2" x="4" y="70" textAnchor="middle" fontFamily={COND} fontStyle="italic" fontWeight="800" fontSize="76" fill={ACCENT} stroke="#171722" strokeWidth="7" paintOrder="stroke" style={{ transformOrigin: '4px 70px', animationDelay: '.1s', '--rl-tilt': '3deg' }}>DUNK!</text>
      </svg>
    </div>
  )
}

// A hidden slam-dunk celebration: tap the logo on the overview (or in the
// info sheet) ten times in a row and the ball dunks through a hoop with a
// comic-book "SLAM DUNK!" behind it. Logo.jsx counts the taps and fires
// 'bpc-dunk'; this listens and plays the animation over whatever is on screen.
function DunkEgg() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const h = () => setOn(true)
    window.addEventListener('bpc-dunk', h)
    return () => window.removeEventListener('bpc-dunk', h)
  }, [])
  // gone after the animation (a timer, not its end event: with reduced motion
  // there is no animation to end)
  useEffect(() => {
    if (!on) return undefined
    const id = setTimeout(() => setOn(false), 2000)
    return () => clearTimeout(id)
  }, [on])
  if (!on) return null
  return (
    <div
      className="rl-screen-shake"
      onClick={() => setOn(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,10,11,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <DunkBurst />
      {/* The hoop is drawn above the 72×72 box; overflow:visible lets it (and
          the rising ball) show without changing the box's layout size. */}
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ overflow: 'visible' }}>
        <g transform="translate(36,-6)">
            <rect x="-24" y="-30" width="48" height="26" rx="1.5" fill="rgba(235,235,240,.92)" stroke="rgba(0,0,0,.3)" strokeWidth="1.3" />
            <rect x="-11" y="-16" width="22" height="13" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="1" />
            <g className="rl-rim-shake">
              <path d="M-9 -4 L-15 0 M9 -4 L15 0" stroke="rgba(0,0,0,.3)" strokeWidth="1.3" fill="none" />
              <g className="rl-net-flex">
                <path
                  d="M-15 1 L-3 22 M-10 1.3 L-2 22.3 M-5 1.6 L-1 22.6 M0 1.8 L0 22.8 M5 1.6 L1 22.6 M10 1.3 L2 22.3 M15 1 L3 22
                     M-12 8 L-7 10 L-2 8 L2 10 L7 8 L12 10 M-7 15 L-3 17 L0 15 L3 17 L7 15"
                  stroke="rgba(255,255,255,.5)" strokeWidth="1.1" fill="none"
                />
              </g>
              <ellipse cx="0" cy="0" rx="15" ry="3.6" fill="none" stroke="#b9481f" strokeWidth="3.4" />
              <path d="M-15 0 A15 3.6 0 0 0 15 0" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
            </g>
          </g>
        <g transform="translate(36,36)">
          <circle r="34" fill="transparent" />
          <g
            className="rl-dunk"
          >
            <circle cx="0" cy="0" r="30" fill="#e2762b" stroke="rgba(0,0,0,.45)" strokeWidth="2" />
            <path d="M-30 0 H30 M0 -30 V30 M-21 -21 Q0 0 -21 21 M21 -21 Q0 0 21 21" stroke="rgba(0,0,0,.45)" strokeWidth="2" fill="none" />
          </g>
        </g>
      </svg>
    </div>
  )
}

function AppShell() {
  const { state } = useApp()
  const landscape = useLandscape()
  // The Tactics Board and Stat Tracker get a landscape layout (useful held
  // sideways, e.g. on a tablet, to walk players through a play, or to see
  // both sides of a two-team game side by side without scrolling) — every
  // other screen keeps its column, centred, and scrolls inside it.
  const landscapeScreens = state.screen === 'board' || state.screen === 'stats'
  const wide = landscapeScreens && landscape
  return (
    <>
      <div
        style={{
          minHeight: 'var(--app-height, 100dvh)',
          background: 'radial-gradient(120% 90% at 50% 0%,#1d1d21 0%,#0d0d0f 60%,#08080a 100%)',
          display: 'flex', justifyContent: 'center',
        }}
      >
        <div
          data-app-frame
          data-wide={wide ? 'true' : 'false'}
          style={{
            width: '100%', minHeight: 'var(--app-height, 100dvh)', position: 'relative',
            background: '#0a0a0b', boxShadow: wide ? 'none' : '0 0 60px rgba(0,0,0,.5)', overflow: 'hidden',
          }}
        >
          <Screen />
        </div>
      </div>
      <DunkEgg />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
