import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { TEAM_NAME, DONATE_URL } from '../state/config'
import { COMIC_INK, COMIC_PAPER, COMIC_PAPER_HI, COMIC_RED, COMIC_GOLD, COMIC_DISPLAY, COMIC_SANS, comicCard, comicHalftoneBg } from '../theme'
import { maxStepOf } from '../lib/board-geometry'
import { shouldShowBackupReminder, snoozeBackupReminder } from '../lib/backup'
import { kindOf, KIND_LABEL } from '../lib/playKind'
import { canPromptInstall, promptInstall, shouldShowInstallHint, snoozeInstallHint, subscribeInstallPrompt } from '../lib/installPrompt'
import { plural } from '../lib/dates'

function playMeta(p) {
  const steps = p.steps || maxStepOf(p.players.concat([p.ball]))
  return (p.view === 'half' ? 'Halfcourt' : 'Fullcourt') + ' · ' + plural(p.players.length, 'player') + ' · ' + (steps === 1 ? '1 step' : steps + ' steps')
}

// The basketball badge every comic card family uses — same silhouette as
// the app's regular Logo, redrawn in ink-on-circle instead of Logo's own
// raised() dark badge, which wouldn't read against paper.
function ComicBall({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="14" fill={COMIC_RED} stroke={COMIC_INK} strokeWidth="2.4" />
      <path d="M3 17H31M17 3V31M7 7Q17 17 7 27M27 7Q17 17 27 27" stroke={COMIC_INK} strokeWidth="2.4" fill="none" />
    </svg>
  )
}

const tagStyle = { padding: '3px 9px', borderRadius: 999, background: COMIC_GOLD, border: `2px solid ${COMIC_INK}`, fontSize: 9.5, fontWeight: 800, color: COMIC_INK, flex: 'none' }

export default function Home() {
  const { state, toggleBoardMenu, startNewPlay, toggleLoad, openPlayFromHome, removePlay, openStats, openPractice, openAttend, openTeams, openSchedule, openInfo, openBackup, openSync, askConfirm } = useApp()
  const { plays, boardMenu, loadOpen, roster, sessions, drills, plans, games, events, teams, activeTeamId } = state
  const activeTeam = teams.find((t) => t.id === activeTeamId)

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = sessions.filter((s) => s.date >= today).length
    + games.filter((g) => g.type === 'game' && g.date >= today).length
    + events.filter((e) => e.date >= today).length

  const hasData = teams.some((t) => (t.roster || []).length || (t.games || []).length || (t.sessions || []).length) || plays.length > 0 || drills.length > 0
  // Teams load from localStorage in an effect after the first render, so
  // hasData starts false on every mount — a useState initializer would
  // capture that and never reconsider once the real data arrives.
  const [showBackupReminder, setShowBackupReminder] = useState(false)
  useEffect(() => { setShowBackupReminder(shouldShowBackupReminder(hasData)) }, [hasData])

  // `beforeinstallprompt` can fire at any point after mount (or never, on
  // Safari) — subscribe rather than checking once, so the hint appears the
  // moment the browser decides the app is installable.
  const [homeFilter, setHomeFilter] = useState('all')
  const nPlays = plays.filter((p) => kindOf(p) === 'play').length
  const nDrills = plays.filter((p) => kindOf(p) === 'drill').length
  const shownPlays = homeFilter === 'all' ? plays : plays.filter((p) => kindOf(p) === homeFilter)

  const [showInstallHint, setShowInstallHint] = useState(false)
  useEffect(() => {
    setShowInstallHint(shouldShowInstallHint())
    return subscribeInstallPrompt(() => setShowInstallHint(shouldShowInstallHint()))
  }, [])

  const cardStyle = { display: 'flex', alignItems: 'center', gap: 14, padding: 15, borderRadius: 16, ...comicCard(), color: COMIC_INK, cursor: 'pointer' }
  const iconBadge = (bg) => ({ width: 36, height: 36, flex: 'none', borderRadius: 11, background: bg, border: `2.5px solid ${COMIC_INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: COMIC_INK })

  return (
    <div style={{ position: 'absolute', inset: 0, background: COMIC_PAPER, display: 'flex', flexDirection: 'column', fontFamily: COMIC_SANS }}>
      <div style={{ ...comicHalftoneBg, position: 'absolute', inset: 0, opacity: 0.09, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', padding: '46px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: COMIC_PAPER_HI, border: `2.5px solid ${COMIC_INK}`, boxShadow: `3px 3px 0 ${COMIC_INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ComicBall size={28} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ fontFamily: COMIC_DISPLAY, fontSize: 24, lineHeight: 1.02, letterSpacing: '.02em', color: COMIC_INK, transform: 'rotate(-1.2deg)', transformOrigin: 'left' }}>{TEAM_NAME}</div>
            <div style={{ fontFamily: COMIC_DISPLAY, fontSize: 16, lineHeight: 1.1, letterSpacing: '.06em', color: COMIC_RED }}>OVERVIEW</div>
          </div>
        </div>

        {showBackupReminder && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, ...comicCard(COMIC_PAPER), marginBottom: 12 }}>
            <div style={{ fontSize: 18, lineHeight: 1, flex: 'none' }}>💾</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: COMIC_INK, lineHeight: 1.4 }}>
              Everything lives only on this device. Worth a quick backup?
            </div>
            <div
              onClick={() => { setShowBackupReminder(false); openBackup() }}
              style={{ flex: 'none', padding: '7px 11px', borderRadius: 999, background: COMIC_RED, border: `2px solid ${COMIC_INK}`, color: COMIC_PAPER_HI, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
            >
              Back up
            </div>
            <div
              onClick={() => { snoozeBackupReminder(); setShowBackupReminder(false) }}
              style={{ flex: 'none', padding: '7px 9px', borderRadius: 8, color: '#5a5a52', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Not now
            </div>
          </div>
        )}

        {showInstallHint && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, ...comicCard(), marginBottom: 12 }}>
            <div style={{ fontSize: 18, lineHeight: 1, flex: 'none' }}>📲</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: COMIC_INK, lineHeight: 1.4 }}>
              {canPromptInstall()
                ? 'Install this app for quicker access from your home screen.'
                : <>Add this app to your home screen: tap <b>Share</b>, then <b>Add to Home Screen</b>.</>}
            </div>
            {canPromptInstall() && (
              <div
                onClick={() => promptInstall()}
                style={{ flex: 'none', padding: '7px 11px', borderRadius: 999, background: COMIC_GOLD, border: `2px solid ${COMIC_INK}`, color: COMIC_INK, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Install
              </div>
            )}
            <div
              onClick={() => { snoozeInstallHint(); setShowInstallHint(false) }}
              style={{ flex: 'none', padding: '7px 9px', borderRadius: 8, color: '#5a5a52', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
            >
              {canPromptInstall() ? 'Not now' : 'Got it'}
            </div>
          </div>
        )}

        <div
          onClick={toggleBoardMenu}
          style={{ ...cardStyle, background: boardMenu ? COMIC_GOLD : COMIC_PAPER_HI, marginBottom: 9 }}
        >
          <div style={iconBadge(boardMenu ? COMIC_PAPER_HI : COMIC_GOLD)}>#</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Tactics board</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.68 }}>Draw and animate your plays</div>
          </div>
        </div>

        {boardMenu && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 12px', padding: 12, borderRadius: 16, ...comicCard(COMIC_PAPER) }}>
            <div onClick={startNewPlay} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12, background: COMIC_RED, border: `2.5px solid ${COMIC_INK}`, color: COMIC_PAPER_HI, cursor: 'pointer' }}>
              <div style={{ fontSize: 18, lineHeight: 1, fontWeight: 800 }}>+</div>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Create new play</div>
            </div>
            <div onClick={toggleLoad} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12, ...comicCard(COMIC_PAPER_HI), color: COMIC_INK, cursor: 'pointer' }}>
              <div style={{ fontSize: 16, lineHeight: 1, fontWeight: 800 }}>▤</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Load from library</div>
                <div style={{ fontSize: 11, color: '#6b6b63' }}>{plays.length ? nPlays + (nPlays === 1 ? ' play' : ' plays') + ' · ' + nDrills + (nDrills === 1 ? ' drill' : ' drills') : 'Nothing saved yet'}</div>
              </div>
              <div style={{ fontSize: 14, color: '#6b6b63' }}>{loadOpen ? '▾' : '▸'}</div>
            </div>
            {loadOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plays.length > 0 && (
                  <div style={{ display: 'flex', background: COMIC_PAPER_HI, border: `2px solid ${COMIC_INK}`, borderRadius: 12, padding: 3, gap: 2 }}>
                    {[['all', 'All'], ['play', 'Plays'], ['drill', 'Drills']].map(([id, label]) => (
                      <div
                        key={id} onClick={() => setHomeFilter(id)}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', background: homeFilter === id ? COMIC_GOLD : 'transparent', color: COMIC_INK }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {shownPlays.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, ...comicCard(COMIC_PAPER_HI) }}>
                      <div onClick={() => openPlayFromHome(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <div style={tagStyle}>{KIND_LABEL[kindOf(p)]}</div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: COMIC_INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b6b63' }}>{playMeta(p)}</div>
                      </div>
                      <div onClick={() => askConfirm({ title: 'Delete ' + KIND_LABEL[kindOf(p)].toLowerCase(), message: `Delete "${p.name}"? This can't be undone.`, onConfirm: () => removePlay(p) })} style={{ padding: '7px 10px', borderRadius: 8, background: COMIC_PAPER, border: `2px solid ${COMIC_INK}`, color: COMIC_INK, fontSize: 12, cursor: 'pointer' }}>✕</div>
                    </div>
                  ))}
                  {!shownPlays.length && (
                    <div style={{ padding: '10px 2px', fontSize: 12, fontWeight: 600, color: '#6b6b63', lineHeight: 1.5 }}>
                      {plays.length ? `Nothing filed under ${homeFilter === 'drill' ? 'Drills' : 'Plays'} yet.` : 'Nothing saved yet — create one and save it from the board.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div onClick={openTeams} style={{ ...cardStyle, marginTop: 9 }}>
          <div style={iconBadge(COMIC_GOLD)}>☰</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>My roster</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6b63' }}>
              {activeTeam ? activeTeam.name + ' · ' + activeTeam.roster.length + (activeTeam.roster.length === 1 ? ' player' : ' players') + ((activeTeam.coaches || []).length ? ' · ' + activeTeam.coaches.length + (activeTeam.coaches.length === 1 ? ' coach' : ' coaches') : '') + (teams.length > 1 ? ' · ' + teams.length + ' teams' : '') : 'Set up your team roster'}
            </div>
          </div>
        </div>

        <div onClick={openSchedule} style={{ ...cardStyle, marginTop: 9 }}>
          <div style={iconBadge(COMIC_GOLD)}>▦</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>My schedule</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6b63' }}>{upcoming ? upcoming + (upcoming === 1 ? ' upcoming item' : ' upcoming items') : 'Trainings, games and team events'}</div>
          </div>
        </div>

        <div onClick={openStats} style={{ ...cardStyle, marginTop: 9 }}>
          <div style={iconBadge(COMIC_GOLD)}>▥</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Track stats</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6b63' }}>{roster.length ? plural(roster.length, 'player') + ' · ' + plural(games.length, 'game') + ' tracked' : 'Set up your roster, then track a game'}</div>
          </div>
        </div>

        <div onClick={openPractice} style={{ ...cardStyle, marginTop: 9 }}>
          <div style={iconBadge(COMIC_GOLD)}>⏱</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Practice</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6b63' }}>{plans.length || drills.length ? drills.length + (drills.length === 1 ? ' drill' : ' drills') + ' · ' + plans.length + (plans.length === 1 ? ' plan' : ' plans') : 'Build your own drills and sessions'}</div>
          </div>
        </div>

        <div onClick={openAttend} style={{ ...cardStyle, marginTop: 9 }}>
          <div style={iconBadge(COMIC_GOLD)}>☑</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Training Attendance</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6b63' }}>{sessions.length ? sessions.length + (sessions.length === 1 ? ' session' : ' sessions') + ' tracked' : 'Track who showed up'}</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', padding: '18px 20px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 999, background: COMIC_RED, border: `2.5px solid ${COMIC_INK}`, boxShadow: `4px 4px 0 ${COMIC_INK}`, color: COMIC_PAPER_HI, fontFamily: COMIC_DISPLAY, fontSize: 15.5, letterSpacing: '.02em', textDecoration: 'none' }}>
          <span>♡</span>
          <span>Support this project</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div onClick={() => openInfo('about')} style={{ fontSize: 11, fontWeight: 700, color: '#6b6b63', cursor: 'pointer' }}>About</div>
          <div onClick={() => openInfo('imprint')} style={{ fontSize: 11, fontWeight: 700, color: '#6b6b63', cursor: 'pointer' }}>Legal notice</div>
          <div onClick={() => openInfo('privacy')} style={{ fontSize: 11, fontWeight: 700, color: '#6b6b63', cursor: 'pointer' }}>Privacy</div>
          <div onClick={openBackup} style={{ fontSize: 11, fontWeight: 700, color: '#6b6b63', cursor: 'pointer' }}>Backup</div>
          <div onClick={openSync} style={{ fontSize: 11, fontWeight: 700, color: '#6b6b63', cursor: 'pointer' }}>Sync devices</div>
        </div>
      </div>
    </div>
  )
}
