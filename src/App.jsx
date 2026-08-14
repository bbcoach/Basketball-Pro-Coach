import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/store'
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
      <div style={{ fontSize: 40, transform: 'rotate(90deg)' }}>📱</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Please rotate your device</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', maxWidth: 280, lineHeight: 1.5 }}>
        Basketball Pro Coach is designed for portrait mode — that's where all features are available.
      </div>
    </div>
  )
}

// Temporary — remove once the viewport-height investigation is done.
// Reports real measurements from the device so we're not guessing blind.
function DebugBadge() {
  const [info, setInfo] = useState('measuring…')
  useEffect(() => {
    const read = () => {
      const root = document.getElementById('root')
      const frame = root && root.querySelector('[data-app-frame]')
      const r = frame ? frame.getBoundingClientRect() : null
      const cs = getComputedStyle(document.documentElement).getPropertyValue('--app-height')
      setInfo(
        'innerH=' + window.innerHeight +
        ' vv=' + (window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a') +
        ' docClientH=' + document.documentElement.clientHeight +
        ' screenH=' + window.screen.height +
        ' frameH=' + (r ? Math.round(r.height) : 'n/a') +
        ' --app-height=' + (cs || 'unset') +
        ' standalone=' + window.navigator.standalone +
        ' dpr=' + window.devicePixelRatio
      )
    }
    read()
    const t = setTimeout(read, 800)
    window.addEventListener('resize', read)
    return () => { clearTimeout(t); window.removeEventListener('resize', read) }
  }, [])
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, fontSize: 9, lineHeight: 1.4, color: '#5f5', background: 'rgba(0,0,0,.75)', padding: '4px 6px', pointerEvents: 'none', wordBreak: 'break-all' }}>
      {info}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
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
            width: '100%', maxWidth: 480, minHeight: 'var(--app-height, 100dvh)', position: 'relative',
            background: '#0a0a0b', boxShadow: '0 0 60px rgba(0,0,0,.5)', overflow: 'hidden',
          }}
        >
          <Screen />
        </div>
      </div>
      <RotateLock />
      <DebugBadge />
    </AppProvider>
  )
}
