import { useState } from 'react'
import { AppProvider, useApp } from './state/store'
import { useLandscape } from './lib/useLandscape'
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
      <RunScreen />
      <ConfirmModal />
      <Toast />
    </>
  )
}

// Tap the ball 10 times for a hidden slam-dunk animation through the hoop.
function RotateLock() {
  const [taps, setTaps] = useState(0)
  const [dunking, setDunking] = useState(false)

  const onBallTap = () => {
    if (dunking) return
    const n = taps + 1
    if (n >= 10) { setTaps(0); setDunking(true) } else setTaps(n)
  }

  return (
    <div
      className="rotate-lock"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0b',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
      }}
    >
      {/* Fixed 72×72 footprint — identical to the plain idle ball, so the
          rest state stays perfectly centered. The hoop only exists while
          dunking and is drawn above the box; overflow:visible lets it (and
          the rising ball) show without changing the box's layout size. */}
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ overflow: 'visible' }}>
        {dunking && (
          <>
            <text x="36" y="-40" textAnchor="middle" className="rl-dunk-text" fontSize="9.5" fontWeight="800" letterSpacing=".5" fill="#e8b13c" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>SLAM DUNK!</text>
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
          </>
        )}
        <g transform="translate(36,36)" onClick={onBallTap} style={{ cursor: 'pointer' }}>
          <circle r="34" fill="transparent" />
          <g
            className={dunking ? 'rl-dunk' : 'rl-spin'}
            onAnimationEnd={() => { if (dunking) setDunking(false) }}
          >
            <circle cx="0" cy="0" r="30" fill="#e2762b" stroke="rgba(0,0,0,.45)" strokeWidth="2" />
            <path d="M-30 0 H30 M0 -30 V30 M-21 -21 Q0 0 -21 21 M21 -21 Q0 0 21 21" stroke="rgba(0,0,0,.45)" strokeWidth="2" fill="none" />
          </g>
        </g>
      </svg>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Please rotate your device</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', maxWidth: 280, lineHeight: 1.5 }}>
        Basketball Pro Coach is designed for portrait mode — that's where all features are available.
      </div>
    </div>
  )
}

function AppShell() {
  const { state } = useApp()
  const landscape = useLandscape()
  // The Tactics Board and Stat Tracker get a landscape layout (useful held
  // sideways, e.g. on a tablet, to walk players through a play, or to see
  // both sides of a two-team game side by side without scrolling) — every
  // other screen keeps the fixed phone-width portrait column and the
  // rotate-lock prompt. Each screen's own layout replaces the lock.
  const landscapeScreens = state.screen === 'board' || state.screen === 'stats'
  const wide = landscapeScreens && landscape
  const showRotateLock = !landscapeScreens
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
          style={{
            width: '100%', maxWidth: wide ? 'none' : 480, minHeight: 'var(--app-height, 100dvh)', position: 'relative',
            background: '#0a0a0b', boxShadow: wide ? 'none' : '0 0 60px rgba(0,0,0,.5)', overflow: 'hidden',
          }}
        >
          <Screen />
        </div>
      </div>
      {showRotateLock && <RotateLock />}
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
