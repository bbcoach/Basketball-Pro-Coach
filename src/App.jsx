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
      <svg width="72" height="72" viewBox="0 0 72 72">
        <g transform="translate(36,36)" className="rl-spin">
          <circle cx="0" cy="0" r="30" fill="#e2762b" stroke="rgba(0,0,0,.45)" strokeWidth="2" />
          <path d="M-30 0 H30 M0 -30 V30 M-21 -21 Q0 0 -21 21 M21 -21 Q0 0 21 21" stroke="rgba(0,0,0,.45)" strokeWidth="2" fill="none" />
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
