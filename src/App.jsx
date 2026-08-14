import { AppProvider, useApp } from './state/store'
import { useLandscape } from './lib/useLandscape'
import Home from './components/Home'
import Board from './components/board/Board'
import StatTracker from './components/stats/StatTracker'
import Attendance from './components/attendance/Attendance'
import Practice from './components/practice/Practice'
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
      {state.infoPage && <InfoOverlay />}
      <RunScreen />
    </>
  )
}

function RotateLock() {
  return (
    <div
      className="rotate-lock"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0b',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
      }}
    >
      <svg width="160" height="120" viewBox="0 0 160 120" className="rl-scene">
        <line x1="20" y1="100" x2="140" y2="100" stroke="rgba(255,255,255,.18)" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(60,100)">
          <g className="rl-player" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none">
            <line x1="0" y1="0" x2="-7" y2="-26" />
            <line x1="0" y1="0" x2="7" y2="-26" />
            <line x1="0" y1="-26" x2="0" y2="-52" />
            <line x1="0" y1="-46" x2="-11" y2="-36" />
            <line x1="0" y1="-46" x2="13" y2="-59" />
            <circle cx="0" cy="-60" r="8" fill="#fff" stroke="none" />
          </g>
          <text className="rl-impact" x="-6" y="-64" fontSize="20" textAnchor="middle">💥</text>
        </g>
        <g transform="translate(73,42)">
          <g className="rl-ball">
            <circle cx="0" cy="0" r="9" fill="#e2762b" stroke="rgba(0,0,0,.45)" strokeWidth="1.5" />
            <path d="M-9 0 H9 M0 -9 V9 M-6.5 -6.5 Q0 0 -6.5 6.5 M6.5 -6.5 Q0 0 6.5 6.5" stroke="rgba(0,0,0,.45)" strokeWidth="1.2" fill="none" />
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
