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

export default function App() {
  return (
    <AppProvider>
      <div
        style={{
          minHeight: '100dvh',
          background: 'radial-gradient(120% 90% at 50% 0%,#1d1d21 0%,#0d0d0f 60%,#08080a 100%)',
          display: 'flex', justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 480, minHeight: '100dvh', position: 'relative',
            background: '#0a0a0b', boxShadow: '0 0 60px rgba(0,0,0,.5)', overflow: 'hidden',
          }}
        >
          <Screen />
        </div>
      </div>
    </AppProvider>
  )
}
