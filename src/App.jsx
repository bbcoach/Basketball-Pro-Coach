import { useState } from 'react'
import { AppProvider, useApp } from './state/store'
import { useLandscape } from './lib/useLandscape'
import Home from './components/Home'
import Board from './components/board/Board'
import StatTracker from './components/stats/StatTracker'
import Attendance from './components/attendance/Attendance'
import Practice from './components/practice/Practice'
import Teams from './components/teams/Teams'
import InfoOverlay from './components/InfoOverlay'
import RunScreen from './components/practice/RunScreen'

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
      {state.infoPage && <InfoOverlay />}
      <RunScreen />
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
      <svg width="100" height="130" viewBox="0 0 100 130">
        <rect x="30" y="4" width="40" height="24" rx="2" fill="rgba(255,255,255,.9)" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
        <g transform="translate(50,30)">
          <g className={dunking ? 'rl-rim-shake' : undefined}>
            <g className={dunking ? 'rl-net-flex' : undefined}>
              <path d="M-16 1 L-11.4 20 M-10.7 1.4 L-7.8 20.4 M-5.3 1.7 L-4.3 20.6 M0 1.8 L0 20.6 M5.3 1.7 L4.3 20.6 M10.7 1.4 L7.8 20.4 M16 1 L11.4 20" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" fill="none" />
            </g>
            <ellipse cx="0" cy="0" rx="16" ry="4" fill="none" stroke="#e2762b" strokeWidth="4" />
          </g>
        </g>
        {dunking && <text x="50" y="16" textAnchor="middle" className="rl-dunk-text" fontSize="9.5" fontWeight="800" letterSpacing=".5" fill="#e8b13c" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>SLAM DUNK!</text>}
        <g transform="translate(50,100)" onClick={onBallTap} style={{ cursor: 'pointer' }}>
          <circle r="30" fill="transparent" />
          <g
            className={dunking ? 'rl-dunk' : 'rl-spin'}
            onAnimationEnd={() => { if (dunking) setDunking(false) }}
          >
            <circle cx="0" cy="0" r="22" fill="#e2762b" stroke="rgba(0,0,0,.45)" strokeWidth="2" />
            <path d="M-22 0 H22 M0 -22 V22 M-15.5 -15.5 Q0 0 -15.5 15.5 M15.5 -15.5 Q0 0 15.5 15.5" stroke="rgba(0,0,0,.45)" strokeWidth="2" fill="none" />
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
  // The Tactics Board gets a landscape layout (useful held sideways, e.g.
  // on a tablet, to walk players through a play) — every other screen
  // keeps the fixed phone-width portrait column and the rotate-lock
  // prompt. The board's own layout replaces the lock, on any device.
  const wide = state.screen === 'board' && landscape
  const showRotateLock = state.screen !== 'board'
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
