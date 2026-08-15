import { useApp } from '../state/store'
import { ACCENT, TEAM_NAME, DONATE_URL } from '../state/config'
import { COND } from '../theme'
import Logo from './Logo'
import { maxStepOf } from '../lib/board-geometry'

function playMeta(p) {
  const steps = p.steps || maxStepOf(p.players.concat([p.ball]))
  return (p.view === 'half' ? 'Halfcourt' : 'Fullcourt') + ' · ' + p.players.length + ' players · ' + (steps === 1 ? '1 step' : steps + ' steps')
}

export default function Home() {
  const { state, toggleBoardMenu, startNewPlay, toggleLoad, openPlayFromHome, removePlay, openStats, openPractice, openAttend, openTeams, openSchedule, openInfo } = useApp()
  const { plays, boardMenu, loadOpen, roster, sessions, drills, plans, games, events, teams, activeTeamId } = state
  const activeTeam = teams.find((t) => t.id === activeTeamId)

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = sessions.filter((s) => s.date >= today).length
    + games.filter((g) => g.type === 'game' && g.date >= today).length
    + events.filter((e) => e.date >= today).length

  const cardStyle = { display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', cursor: 'pointer' }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 70% at 50% 0%,#1d1d21 0%,#0d0d0f 60%,#08080a 100%)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '54px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 26 }}>
          <Logo size={52} iconSize={38} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 26, lineHeight: 1.02, letterSpacing: '.4px', color: '#fff', textTransform: 'uppercase' }}>{TEAM_NAME}</div>
            <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 700, fontSize: 26, lineHeight: 1.02, letterSpacing: '.4px', textTransform: 'uppercase', color: ACCENT }}>OVERVIEW</div>
          </div>
        </div>

        <div
          onClick={toggleBoardMenu}
          style={{ ...cardStyle, background: boardMenu ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.06)', border: boardMenu ? '1px solid rgba(255,255,255,.2)' : '1px solid rgba(255,255,255,.1)', marginBottom: 10 }}
        >
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>⌗</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>Tactics board</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.62 }}>Draw and animate your plays</div>
          </div>
        </div>

        {boardMenu && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 12px', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
            <div onClick={startNewPlay} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12, background: ACCENT, color: '#101012', cursor: 'pointer' }}>
              <div style={{ fontSize: 19, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>＋</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Create new play</div>
            </div>
            <div onClick={toggleLoad} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', color: '#fff', cursor: 'pointer' }}>
              <div style={{ fontSize: 16, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>▤</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Load play</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{plays.length ? plays.length + (plays.length === 1 ? ' saved play' : ' saved plays') : 'Nothing saved yet'}</div>
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>{loadOpen ? '▾' : '▸'}</div>
            </div>
            {loadOpen && (
              <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plays.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <div onClick={() => openPlayFromHome(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{playMeta(p)}</div>
                    </div>
                    <div onClick={() => removePlay(p)} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer' }}>✕</div>
                  </div>
                ))}
                {!plays.length && (
                  <div style={{ padding: '10px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No saved plays yet — create one and save it from the board.</div>
                )}
              </div>
            )}
          </div>
        )}

        <div onClick={openTeams} style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>☰</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>My roster</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>
              {activeTeam ? activeTeam.name + ' · ' + activeTeam.roster.length + (activeTeam.roster.length === 1 ? ' player' : ' players') + ((activeTeam.coaches || []).length ? ' · ' + activeTeam.coaches.length + (activeTeam.coaches.length === 1 ? ' coach' : ' coaches') : '') + (teams.length > 1 ? ' · ' + teams.length + ' teams' : '') : 'Set up your team roster'}
            </div>
          </div>
        </div>

        <div onClick={openSchedule} style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>▦</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>My schedule</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>{upcoming ? upcoming + (upcoming === 1 ? ' upcoming item' : ' upcoming items') : 'Trainings, games and team events'}</div>
          </div>
        </div>

        <div onClick={openStats} style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>▥</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>Track stats</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>{roster.length ? roster.length + ' players · ' + games.length + (games.length === 1 ? ' game' : ' games') + ' tracked' : 'Set up your roster, then track a game'}</div>
          </div>
        </div>

        <div onClick={openPractice} style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>⏱</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>Practice</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>{plans.length || drills.length ? drills.length + (drills.length === 1 ? ' drill' : ' drills') + ' · ' + plans.length + (plans.length === 1 ? ' plan' : ' plans') : 'Build your own drills and sessions'}</div>
          </div>
        </div>

        <div onClick={openAttend} style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 700, fontFamily: COND }}>☑</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2px' }}>Training Attendance</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>{sessions.length ? sessions.length + (sessions.length === 1 ? ' session' : ' sessions') + ' tracked' : 'Track who showed up'}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: ACCENT, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          <span style={{ fontSize: 14 }}>♡</span>
          <span>Support this project</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <div onClick={() => openInfo('about')} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.42)', cursor: 'pointer' }}>About</div>
          <div onClick={() => openInfo('imprint')} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.42)', cursor: 'pointer' }}>Legal notice</div>
          <div onClick={() => openInfo('privacy')} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.42)', cursor: 'pointer' }}>Privacy</div>
        </div>
      </div>
    </div>
  )
}
