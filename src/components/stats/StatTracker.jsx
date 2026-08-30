import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import Tabs from '../Tabs'
import RosterEditor from '../RosterEditor'
import ActionHint from '../ActionHint'
import { STAT_DEFS, STAT_LABEL, tallyFor, teamTally } from '../../lib/stats'
import { exportBoxCsv, exportBoxPdf, exportSeasonPdf } from '../../lib/reports'
import { TEAM_NAME } from '../../state/config'
import { useLandscape } from '../../lib/useLandscape'

// Two-team tracking folds the active team's roster and any imported
// opposing roster into one list, each player tagged with which side they're
// tracked on. Untagged own-roster players default to A, untagged imported
// players default to B, so importing/splitting only ever needs to record
// the exceptions.
function gamePlayers(roster, game) {
  const sides = game.sides || {}
  const own = roster.map((p) => ({ ...p, side: sides[p.id] || 'A', imported: false }))
  const imported = (game.importedPlayers || []).map((p) => ({ ...p, side: sides[p.id] || 'B', imported: true }))
  return own.concat(imported)
}

function sidePts(players, log, side) {
  return teamTally(log.filter((e) => players.find((p) => p.id === e.p)?.side === side)).pts
}

function ScoreBar({ teamAName, teamBName, ptsA, ptsB, style }) {
  return (
    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff', ...style }}>
      {teamAName} <span style={{ color: ACCENT }}>{ptsA}</span>
      {' – '}
      <span style={{ color: ACCENT }}>{ptsB}</span> {teamBName}
    </div>
  )
}

function sortedRoster(roster, onCourt) {
  return roster.slice().sort((a, b) => {
    const ca = onCourt.indexOf(a.id) >= 0 ? 0 : 1
    const cb = onCourt.indexOf(b.id) >= 0 ? 0 : 1
    if (ca !== cb) return ca - cb
    const na = parseInt(a.num, 10)
    const nb = parseInt(b.num, 10)
    if (Number.isNaN(na) && Number.isNaN(nb)) return String(a.num).localeCompare(String(b.num))
    if (Number.isNaN(na)) return 1
    if (Number.isNaN(nb)) return -1
    return na - nb
  })
}

function fmtGameDate(v) {
  try { return new Date(v + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return v }
}

function gameTitle(g) {
  if (g.type === 'practice') return 'Free play'
  return g.opponent ? 'vs ' + g.opponent : 'New game'
}

function GamesTab() {
  const { state, newGame, openGame, removeGame, askConfirm } = useApp()
  const { games } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div onClick={() => newGame('game')} style={{ flex: 1, padding: 12, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>＋ New game</div>
        <div onClick={() => newGame('practice')} style={{ flex: 1, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>＋ Free play</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {games.map((g) => {
          const t = teamTally(g.log)
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div onClick={() => openGame(g.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{gameTitle(g)}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{fmtGameDate(g.date)}{g.time ? ' · ' + g.time : ''} · {t.pts} pts · {g.log.length} logged</div>
              </div>
              <div onClick={() => askConfirm({ title: 'Delete game', message: `Delete ${gameTitle(g)} (${fmtGameDate(g.date)})? ${g.log.length} logged actions will be lost.`, onConfirm: () => removeGame(g) })} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
            </div>
          )
        })}
        {!games.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>No games yet — start a new game or free play above. Past games stay here so you can pull them up again later.</div>}
      </div>
    </div>
  )
}

function NoActiveGame() {
  const { set } = useApp()
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 30px' }}>
      <ActionHint text="No game selected yet." actionLabel="Go to Games" onAction={() => set({ statsTab: 'games' })} />
    </div>
  )
}

function TwoTeamToggle({ game }) {
  const { set, toggleTwoTeam } = useApp()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
      <div
        onClick={toggleTwoTeam}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: game.twoTeam ? ACCENT : 'rgba(255,255,255,.06)', color: game.twoTeam ? '#101012' : 'rgba(255,255,255,.6)' }}
      >
        <span style={{ fontSize: 12 }}>{game.twoTeam ? '☑' : '☐'}</span> Track two teams
      </div>
      {game.twoTeam && (
        <div onClick={() => set({ twoTeamModalOpen: true })} style={{ padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
          Manage teams →
        </div>
      )}
    </div>
  )
}

// Landscape trades width for height, and height is scarce on a phone turned
// sideways — the full editor's three stacked rows would eat most of it, so
// this condenses date/opponent/home-away/location to a read-only summary
// line (still editable by rotating back to portrait) and keeps only the
// two-team controls interactive, since those are what landscape is for.
function GameMetaSummary({ game, score }) {
  const isGame = game.type === 'game'
  const summary = fmtGameDate(game.date) + (game.time ? ' · ' + game.time : '') +
    (isGame ? ' · ' + (game.opponent ? 'vs ' + game.opponent : 'Opponent TBD') + (game.home ? ' · ' + (game.home === 'home' ? 'Home' : 'Away') : '') : ' · Free play')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 10px' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</div>
      {score && <div style={{ flex: 'none', fontSize: 13, fontWeight: 700, color: ACCENT, whiteSpace: 'nowrap' }}>{score}</div>}
      <TwoTeamToggle game={game} />
    </div>
  )
}

function GameMetaEditor({ game }) {
  const { setGameDate, setGameOpponent, setGameTime, setGameHome, setGameLocation } = useApp()
  const isGame = game.type === 'game'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 18px 10px' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="date" value={game.date} onChange={(e) => setGameDate(e.target.value)}
          style={{ flex: 'none', width: 118, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
        />
        <input
          type="time" value={game.time || ''} onChange={(e) => setGameTime(e.target.value)}
          style={{ flex: 'none', width: 92, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
        />
        {isGame ? (
          <input
            type="text" value={game.opponent} onChange={(e) => setGameOpponent(e.target.value)} placeholder="Opponent name"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 4px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.5)' }}>Free play</div>
        )}
      </div>
      {isGame && (
        <div style={{ display: 'flex', gap: 6 }}>
          <div
            onClick={() => setGameHome(game.home === 'home' ? '' : 'home')}
            style={{ flex: 'none', padding: '8px 11px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: game.home === 'home' ? ACCENT : 'rgba(255,255,255,.06)', color: game.home === 'home' ? '#101012' : 'rgba(255,255,255,.6)' }}
          >
            Home
          </div>
          <div
            onClick={() => setGameHome(game.home === 'away' ? '' : 'away')}
            style={{ flex: 'none', padding: '8px 11px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: game.home === 'away' ? ACCENT : 'rgba(255,255,255,.06)', color: game.home === 'away' ? '#101012' : 'rgba(255,255,255,.6)' }}
          >
            Away
          </div>
          <input
            type="text" value={game.location || ''} onChange={(e) => setGameLocation(e.target.value)} placeholder="Location (optional)"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
          />
        </div>
      )}
      <TwoTeamToggle game={game} />
    </div>
  )
}

function PlayerRow({ p, log, onCourt, selPlayer, selectStatPlayer, toggleCourt, compact }) {
  const t = tallyFor(log, p.id)
  const on = selPlayer === p.id
  const court = onCourt.indexOf(p.id) >= 0
  return (
    <div
      onClick={() => selectStatPlayer(p)}
      style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10, padding: compact ? '7px 9px' : '8px 10px', borderRadius: 11, cursor: 'pointer', background: on ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (on ? ACCENT : 'rgba(255,255,255,.08)') }}
    >
      <div style={{ width: compact ? 26 : 30, height: compact ? 26 : 30, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? ACCENT : 'rgba(255,255,255,.10)', color: on ? '#101012' : '#fff', fontWeight: 700, fontSize: compact ? 13 : 15 }}>{p.num}</div>
      {/* The full "PTS · REB · AST" line is dropped here rather than shrunk,
          since it's fixed-width and would otherwise win the space against
          the name (flex:1, minWidth:0) — exactly what made names unreadably
          truncated in the two-column landscape layout this is used for. */}
      <div style={{ flex: 1, minWidth: 0, fontSize: compact ? 12.5 : 13, fontWeight: 600, color: court ? '#fff' : 'rgba(255,255,255,.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
      {compact
        ? <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, flex: 'none' }}>{t.pts}</div>
        : <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', flex: 'none' }}>{t.pts} PTS · {t.reb} REB · {t.ast} AST</div>}
      <div
        onClick={(e) => { e.stopPropagation(); toggleCourt(p) }}
        style={{ padding: compact ? '4px 7px' : '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700, letterSpacing: '.4px', cursor: 'pointer', flex: 'none', background: court ? '#5bbf72' : 'rgba(255,255,255,.05)', color: court ? '#101012' : 'rgba(255,255,255,.5)', border: '1px solid ' + (court ? '#5bbf72' : 'rgba(255,255,255,.1)') }}
      >
        {court ? 'ON' : 'OFF'}
      </div>
    </div>
  )
}

function PlayerColumn({ title, players, onCourt, style, ...rowProps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {title && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>{title}</div>}
      {sortedRoster(players, onCourt).map((p) => <PlayerRow key={p.id} p={p} onCourt={onCourt} {...rowProps} />)}
    </div>
  )
}

function PromptHint({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
      <div style={{ fontSize: 13, lineHeight: 1 }}>☝</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>{text}</div>
    </div>
  )
}

function StatPad({ selPlayer, onCourt, logStat, columns = 3 }) {
  const enabled = selPlayer && onCourt.indexOf(selPlayer) >= 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns},1fr)`, gap: 6 }}>
      {STAT_DEFS.map((sd) => (
        <div
          key={sd.k}
          onClick={() => logStat(sd.k)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '11px 4px', borderRadius: 12, cursor: 'pointer',
            background: enabled ? (sd.pos ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.045)') : 'rgba(255,255,255,.05)',
            border: '1px solid ' + (enabled && sd.pos ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.09)'),
            color: enabled ? '#fff' : 'rgba(255,255,255,.62)',
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '.2px' }}>{sd.label}</div>
          <div style={{ fontSize: 9.5, fontWeight: 600, opacity: enabled ? 0.6 : 0.75, textTransform: 'uppercase', letterSpacing: '.6px' }}>{sd.sub}</div>
        </div>
      ))}
    </div>
  )
}

function LastActionBar({ lastAction, selPlayer, undoStat }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: selPlayer ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastAction}</div>
      <div onClick={undoStat} style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Undo</div>
    </div>
  )
}

function LiveTab({ game }) {
  const { state, set, selectStatPlayer, toggleCourt, logStat, undoStat } = useApp()
  const { roster, selPlayer } = state
  const { log, onCourt } = game
  const landscape = useLandscape()
  const players = gamePlayers(roster, game)
  const promptOpen = !(selPlayer && onCourt.indexOf(selPlayer) >= 0)
  const promptText = !selPlayer ? 'Select a player above to start logging' : 'On the bench — tap the OFF badge in his row to sub him in'

  let lastAction
  if (!selPlayer) lastAction = players.length ? 'Select a player, then tap a stat' : 'Add players under “Roster” first'
  else if (onCourt.indexOf(selPlayer) < 0) {
    const bp = players.find((x) => x.id === selPlayer)
    lastAction = (bp ? '#' + bp.num + ' ' + bp.name : 'This player') + ' is on the bench — tap the OFF badge to sub him in'
  } else {
    const e = log[log.length - 1]
    if (!e) lastAction = 'Tap a stat to log it'
    else { const p = players.find((x) => x.id === e.p); lastAction = 'Last: ' + (p ? '#' + p.num + ' ' + p.name : 'player') + ' — ' + STAT_LABEL[e.k] }
  }

  const rowProps = { log, selPlayer, selectStatPlayer, toggleCourt, compact: landscape }
  const padProps = { selPlayer, onCourt, logStat }
  const scoreText = game.twoTeam ? sidePts(players, log, 'A') + ' – ' + sidePts(players, log, 'B') : null

  if (landscape) {
    // A landscape phone has width to spare, so the stat grid belongs in a
    // side column, not a full-width bar — the latter looked fine on a
    // short/narrow phone but ate exactly the height the player lists need
    // on a bigger or taller landscape screen, leaving them barely visible.
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <GameMetaSummary game={game} score={scoreText} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10, padding: '0 18px 10px' }}>
          {game.twoTeam ? (
            <>
              <PlayerColumn title={game.teamAName || 'Team A'} players={players.filter((p) => p.side === 'A')} onCourt={onCourt} style={{ flex: 1, minWidth: 0, overflowY: 'auto' }} {...rowProps} />
              <PlayerColumn title={game.teamBName || 'Team B'} players={players.filter((p) => p.side === 'B')} onCourt={onCourt} style={{ flex: 1, minWidth: 0, overflowY: 'auto' }} {...rowProps} />
            </>
          ) : (
            <PlayerColumn players={players} onCourt={onCourt} style={{ flex: 1, minWidth: 0, overflowY: 'auto' }} {...rowProps} />
          )}
          {!players.length && <div style={{ padding: '10px 2px' }}><ActionHint text="No players yet." actionLabel="Add roster" onAction={() => set({ statsTab: 'roster' })} /></div>}
          <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {promptOpen ? <div style={{ flex: 1, minWidth: 0 }}><PromptHint text={promptText} /></div> : <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'rgba(255,255,255,.45)', overflow: 'hidden' }}>{lastAction}</div>}
            </div>
            <StatPad {...padProps} columns={4} />
            <div onClick={undoStat} style={{ flex: 'none', padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Undo</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <GameMetaEditor game={game} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, padding: '0 18px 10px' }}>
        {game.twoTeam ? (
          <>
            <ScoreBar teamAName={game.teamAName || 'Team A'} teamBName={game.teamBName || 'Team B'} ptsA={sidePts(players, log, 'A')} ptsB={sidePts(players, log, 'B')} style={{ padding: '0 0 6px' }} />
            <PlayerColumn title={game.teamAName || 'Team A'} players={players.filter((p) => p.side === 'A')} onCourt={onCourt} {...rowProps} />
            <PlayerColumn title={game.teamBName || 'Team B'} players={players.filter((p) => p.side === 'B')} onCourt={onCourt} style={{ marginTop: 6 }} {...rowProps} />
          </>
        ) : (
          <PlayerColumn players={players} onCourt={onCourt} {...rowProps} />
        )}
        {!players.length && <div style={{ padding: '10px 2px' }}><ActionHint text="No players yet." actionLabel="Add roster" onAction={() => set({ statsTab: 'roster' })} /></div>}
      </div>

      {promptOpen && <div style={{ margin: '0 18px 8px' }}><PromptHint text={promptText} /></div>}

      <div style={{ flex: 'none', padding: '2px 18px 0' }}>
        <StatPad {...padProps} />
      </div>

      <div style={{ flex: 'none', padding: '12px 18px 0' }}>
        <LastActionBar lastAction={lastAction} selPlayer={selPlayer} undoStat={undoStat} />
      </div>
    </div>
  )
}

const BOX_HEAD = ['PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']

function BoxTable({ players, log, title }) {
  return (
    <div style={{ minWidth: 150 + BOX_HEAD.length * 46, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: title ? 14 : 0 }}>
      {title && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', padding: '0 6px 4px' }}>{title}</div>}
      <div style={{ display: 'flex', padding: '0 6px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
        <div style={{ width: 150, flex: 'none' }}>Player</div>
        {BOX_HEAD.map((h) => <div key={h} style={{ width: 46, flex: 'none', textAlign: 'center' }}>{h}</div>)}
      </div>
      {players.map((p) => {
        const t = tallyFor(log, p.id)
        const cells = [
          String(t.pts), t.fgm + '/' + t.fga, t.fg3m + '/' + (t.fg3m + t.fg3a),
          t.ftm + '/' + (t.ftm + t.fta), String(t.reb), String(t.ast),
          String(t.stl), String(t.blk), String(t.tov), String(t.pf),
        ]
        const cellStyle = (i) => (i === 0
          ? { width: 46, flex: 'none', textAlign: 'center', color: ACCENT, fontWeight: 700 }
          : { width: 46, flex: 'none', textAlign: 'center', color: 'rgba(255,255,255,.85)', fontWeight: 500 })
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 6px', borderRadius: 9, background: 'rgba(255,255,255,.05)', fontSize: 12, color: '#fff' }}>
            <div style={{ width: 150, flex: 'none', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'rgba(255,255,255,.5)', width: 20, flex: 'none' }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            </div>
            {cells.map((c, i) => <div key={i} style={cellStyle(i)}>{c}</div>)}
          </div>
        )
      })}
      {!players.length && <div style={{ padding: '8px 6px', fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>No players.</div>}
    </div>
  )
}

function BoxTab({ game }) {
  const { state, set, askReset, showToast } = useApp()
  const { roster } = state
  const { log } = game
  const players = gamePlayers(roster, game)
  const teamAName = game.teamAName || 'Team A'
  const teamBName = game.teamBName || 'Team B'

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      {game.twoTeam && (
        <ScoreBar teamAName={teamAName} teamBName={teamBName} ptsA={sidePts(players, log, 'A')} ptsB={sidePts(players, log, 'B')} style={{ padding: '0 0 10px' }} />
      )}
      <div className="scrollx" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {!players.length ? (
          <ActionHint text="No players yet." actionLabel="Add roster" onAction={() => set({ statsTab: 'roster' })} />
        ) : game.twoTeam ? (
          <>
            <BoxTable players={players.filter((p) => p.side === 'A')} log={log} title={teamAName} />
            <BoxTable players={players.filter((p) => p.side === 'B')} log={log} title={teamBName} />
          </>
        ) : (
          <BoxTable players={players} log={log} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 12 }}>
        <div onClick={() => { exportBoxPdf(players, log, TEAM_NAME, game); showToast('Opening PDF…') }} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>PDF</div>
        <div onClick={() => { exportBoxCsv(players, log, game); showToast('CSV downloaded') }} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>CSV</div>
        <div onClick={askReset} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset</div>
      </div>
    </div>
  )
}

// Per-game box scores are useful in the moment, but a coach also needs to
// see how a player is trending across the whole season — so this pools
// every tracked game's log into one combined log and reuses the exact same
// `tallyFor` aggregation the single-game box score uses (it's log-array
// agnostic), then divides by games-played to get per-game averages.
function SeasonTable({ rows }) {
  return (
    <div style={{ minWidth: 176 + 46 + BOX_HEAD.length * 46, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', padding: '0 6px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
        <div style={{ width: 176, flex: 'none' }}>Player</div>
        <div style={{ width: 46, flex: 'none', textAlign: 'center' }}>GP</div>
        {BOX_HEAD.map((h) => <div key={h} style={{ width: 46, flex: 'none', textAlign: 'center' }}>{h}</div>)}
      </div>
      {rows.map(({ p, t, gp }, i) => {
        const avg = (v) => (gp ? (v / gp).toFixed(1) : '0.0')
        const cells = [
          avg(t.pts), t.fgm + '/' + t.fga, t.fg3m + '/' + (t.fg3m + t.fg3a),
          t.ftm + '/' + (t.ftm + t.fta), avg(t.reb), avg(t.ast),
          avg(t.stl), avg(t.blk), avg(t.tov), avg(t.pf),
        ]
        const cellStyle = (i2) => (i2 === 0
          ? { width: 46, flex: 'none', textAlign: 'center', color: ACCENT, fontWeight: 700 }
          : { width: 46, flex: 'none', textAlign: 'center', color: 'rgba(255,255,255,.85)', fontWeight: 500 })
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 6px', borderRadius: 9, background: 'rgba(255,255,255,.05)', fontSize: 12, color: '#fff' }}>
            <div style={{ width: 176, flex: 'none', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <div style={{ width: 16, flex: 'none', fontWeight: 700, color: 'rgba(255,255,255,.3)' }}>{i + 1}</div>
              <div style={{ fontWeight: 700, color: 'rgba(255,255,255,.5)', width: 20, flex: 'none' }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            </div>
            <div style={{ width: 46, flex: 'none', textAlign: 'center', color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{gp}</div>
            {cells.map((c, i2) => <div key={i2} style={cellStyle(i2)}>{c}</div>)}
          </div>
        )
      })}
    </div>
  )
}

function SeasonTab() {
  const { state, set, showToast } = useApp()
  const { roster, games } = state
  const log = games.flatMap((g) => g.log)
  const rows = roster
    .map((p) => {
      const t = tallyFor(log, p.id)
      const gp = games.filter((g) => g.log.some((e) => e.p === p.id)).length
      return { p, t, gp }
    })
    .sort((a, b) => b.t.pts - a.t.pts)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)', padding: '0 6px 10px' }}>
        {games.length} game{games.length === 1 ? '' : 's'} tracked · averages per game played
      </div>
      <div className="scrollx" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {roster.length
          ? <SeasonTable rows={rows} />
          : <ActionHint text="No players yet." actionLabel="Add roster" onAction={() => set({ statsTab: 'roster' })} />}
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 12 }}>
        <div onClick={() => { exportSeasonPdf(roster, games, TEAM_NAME); showToast('Opening PDF…') }} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>PDF</div>
      </div>
    </div>
  )
}

function ResetModal() {
  const { state, closeReset, resetGame, resetRoster } = useApp()
  if (!state.resetAsk) return null
  const game = state.games.find((g) => g.id === state.activeGameId)
  const logLen = game ? game.log.length : 0
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 320, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Reset game</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>{logLen} logged actions for {state.roster.length} players. This cannot be undone.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={resetGame} style={{ padding: 11, borderRadius: 11, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Clear all stats</div>
          <div onClick={resetRoster} style={{ padding: 11, borderRadius: 11, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Clear stats and roster</div>
          <div onClick={closeReset} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}

function TwoTeamModal() {
  const {
    state, set, setTeamAName, setTeamBName, setPlayerSide, openImportSheet, closeImportSheet, importTeamRoster, removeImportedPlayer, askConfirm,
  } = useApp()
  const { roster, games, activeGameId, teams, activeTeamId, importSheetOpen } = state
  const game = games.find((g) => g.id === activeGameId)
  if (!state.twoTeamModalOpen || !game) return null

  const players = gamePlayers(roster, game)
  const otherTeams = teams.filter((t) => t.id !== activeTeamId)
  const activeTeamName = teams.find((t) => t.id === activeTeamId)?.name

  const sidePill = (p, side) => (
    <div
      key={side} onClick={() => setPlayerSide(p.id, side)}
      style={{ padding: '5px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: p.side === side ? ACCENT : 'rgba(255,255,255,.06)', color: p.side === side ? '#101012' : 'rgba(255,255,255,.55)' }}
    >
      {side}
    </div>
  )

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.9)', display: 'flex', flexDirection: 'column', padding: '60px 20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 14 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 20, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Two teams</div>
        <div onClick={() => set({ twoTeamModalOpen: false, importSheetOpen: false })} style={{ padding: '7px 13px', borderRadius: 9, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text" value={game.teamAName || ''} onChange={(e) => setTeamAName(e.target.value)} placeholder={activeTeamName || 'Team A'}
            style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
          />
          <input
            type="text" value={game.teamBName || ''} onChange={(e) => setTeamBName(e.target.value)} placeholder="Opponent"
            style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div>
          <div onClick={openImportSheet} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            ⇩ Import another team's roster
          </div>
          {importSheetOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: 10, borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
              {otherTeams.map((t) => (
                <div
                  key={t.id} onClick={() => importTeamRoster(t.id)}
                  style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t.name} · {t.roster.length} players
                </div>
              ))}
              {!otherTeams.length && <div style={{ padding: '4px 2px', fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>No other teams to import from — add one under “My roster”.</div>}
              <div onClick={closeImportSheet} style={{ padding: '7px 2px', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.5)', cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>Assign players</div>
          {players.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 11, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ width: 26, height: 26, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.10)', color: '#fff', fontWeight: 700, fontSize: 12 }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{p.imported ? <span style={{ color: 'rgba(255,255,255,.4)', fontWeight: 500 }}> · imported</span> : ''}</div>
              {sidePill(p, 'A')}
              {sidePill(p, 'B')}
              {p.imported && (
                <div
                  onClick={() => askConfirm({ title: 'Remove player', message: `Remove ${p.name} from this game?`, onConfirm: () => removeImportedPlayer(p.id) })}
                  style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 11, cursor: 'pointer' }}
                >
                  ✕
                </div>
              )}
            </div>
          ))}
          {!players.length && <div style={{ padding: '10px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)' }}>No players yet — add your roster or import another team's.</div>}
        </div>
      </div>
    </div>
  )
}

export default function StatTracker() {
  const { state, set, closeStats } = useApp()
  const { roster, games, activeGameId, statsTab, teams, activeTeamId } = state
  const game = games.find((g) => g.id === activeGameId)
  const teamName = teams.find((t) => t.id === activeTeamId)?.name
  const gameLine = (teamName ? teamName + ' · ' : '') + (game
    ? gameTitle(game) + ' · ' + fmtGameDate(game.date)
    : (roster.length ? roster.length + ' players · ' + games.length + (games.length === 1 ? ' game' : ' games') : 'Set up your roster, then track a game'))
  // Landscape is mainly for the Live tab's two-team layout, where every
  // pixel of height matters — the portrait top/bottom padding below is
  // sized to clear a notch that, rotated, is no longer at the top anyway.
  // It moves to one of the *sides* instead, covering content flush against
  // that edge — every inner element already adds its own 18px of breathing
  // room on top of this, so the safe-area inset alone is all that's needed
  // here (whichever side actually has the cutout; the other resolves to 0).
  const landscape = useLandscape()

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: landscape ? '16px env(safe-area-inset-right, 0px) 10px env(safe-area-inset-left, 0px)' : '56px 0 46px' }}>
      <ScreenHeader title="Stat tracker" line={gameLine} onClose={closeStats} />
      <Tabs tabs={[['games', 'Games'], ['live', 'Live'], ['roster', 'Roster'], ['box', 'Box score'], ['season', 'Season']]} active={statsTab} onChange={(k) => set({ statsTab: k })} />
      {statsTab === 'games' && <GamesTab />}
      {statsTab === 'live' && (game ? <LiveTab game={game} /> : <NoActiveGame />)}
      {statsTab === 'roster' && <RosterEditor emptyHint="Add every player once — the roster stays on this device for all games." />}
      {statsTab === 'box' && (game ? <BoxTab game={game} /> : <NoActiveGame />)}
      {statsTab === 'season' && <SeasonTab />}
      <ResetModal />
      <TwoTeamModal />
    </div>
  )
}
