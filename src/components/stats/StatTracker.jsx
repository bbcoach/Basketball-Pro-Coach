import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import Tabs from '../Tabs'
import RosterEditor from '../RosterEditor'
import { STAT_DEFS, STAT_LABEL, tallyFor } from '../../lib/stats'
import { exportBoxCsv, exportBoxPdf } from '../../lib/reports'
import { TEAM_NAME } from '../../state/config'

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

function LiveTab() {
  const { state, selectStatPlayer, toggleCourt, logStat, undoStat } = useApp()
  const { roster, onCourt, selPlayer, log } = state
  const rows = sortedRoster(roster, onCourt)
  const promptOpen = !(selPlayer && onCourt.indexOf(selPlayer) >= 0)

  let lastAction
  if (!selPlayer) lastAction = roster.length ? 'Select a player, then tap a stat' : 'Add players under “Roster” first'
  else if (onCourt.indexOf(selPlayer) < 0) {
    const bp = roster.find((x) => x.id === selPlayer)
    lastAction = (bp ? '#' + bp.num + ' ' + bp.name : 'This player') + ' is on the bench — tap the OFF badge to sub him in'
  } else {
    const e = log[log.length - 1]
    if (!e) lastAction = 'Tap a stat to log it'
    else { const p = roster.find((x) => x.id === e.p); lastAction = 'Last: ' + (p ? '#' + p.num + ' ' + p.name : 'player') + ' — ' + STAT_LABEL[e.k] }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, padding: '0 18px 10px' }}>
        {rows.map((p) => {
          const t = tallyFor(log, p.id)
          const on = selPlayer === p.id
          const court = onCourt.indexOf(p.id) >= 0
          return (
            <div
              key={p.id}
              onClick={() => selectStatPlayer(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 11, cursor: 'pointer', background: on ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (on ? ACCENT : 'rgba(255,255,255,.08)') }}
            >
              <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? ACCENT : 'rgba(255,255,255,.10)', color: on ? '#101012' : '#fff', fontWeight: 700, fontSize: 15 }}>{p.num}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: court ? '#fff' : 'rgba(255,255,255,.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', flex: 'none' }}>{t.pts} PTS · {t.reb} REB · {t.ast} AST</div>
              <div
                onClick={(e) => { e.stopPropagation(); toggleCourt(p) }}
                style={{ padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700, letterSpacing: '.4px', cursor: 'pointer', flex: 'none', background: court ? '#5bbf72' : 'rgba(255,255,255,.05)', color: court ? '#101012' : 'rgba(255,255,255,.5)', border: '1px solid ' + (court ? '#5bbf72' : 'rgba(255,255,255,.1)') }}
              >
                {court ? 'ON' : 'OFF'}
              </div>
            </div>
          )
        })}
        {!roster.length && <div style={{ padding: '10px 2px', fontSize: 12, color: 'rgba(255,255,255,.42)', lineHeight: 1.5 }}>No players yet — add your roster under “Roster”.</div>}
      </div>

      {promptOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 18px 8px', padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize: 13, lineHeight: 1 }}>☝</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>{!selPlayer ? 'Select a player above to start logging' : 'On the bench — tap the OFF badge in his row to sub him in'}</div>
        </div>
      )}

      <div style={{ flex: 'none', padding: '2px 18px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {STAT_DEFS.map((sd) => {
            const enabled = selPlayer && onCourt.indexOf(selPlayer) >= 0
            return (
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
            )
          })}
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0' }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: selPlayer ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastAction}</div>
        <div onClick={undoStat} style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Undo</div>
      </div>
    </div>
  )
}

const BOX_HEAD = ['PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']

function BoxTab() {
  const { state, askReset } = useApp()
  const { roster, log } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div className="scrollx" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ minWidth: 520, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', padding: '0 6px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
            <div style={{ width: 150, flex: 'none' }}>Player</div>
            {BOX_HEAD.map((h) => <div key={h} style={{ width: 46, flex: 'none', textAlign: 'center' }}>{h}</div>)}
          </div>
          {roster.map((p) => {
            const t = tallyFor(log, p.id)
            const cells = [
              [String(t.pts), true], [t.fgm + '/' + t.fga, false], [t.fg3m + '/' + (t.fg3m + t.fg3a), false],
              [t.ftm + '/' + (t.ftm + t.fta), false], [String(t.reb), false], [String(t.ast), false],
              [String(t.stl), false], [String(t.blk), false], [String(t.tov), false], [String(t.pf), false],
            ]
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 6px', borderRadius: 9, background: 'rgba(255,255,255,.05)', fontSize: 12, color: '#fff' }}>
                <div style={{ width: 150, flex: 'none', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'rgba(255,255,255,.5)', width: 20, flex: 'none' }}>{p.num}</div>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                </div>
                {cells.map((c, i) => <div key={i} style={{ width: 46, flex: 'none', textAlign: 'center', color: c[1] ? ACCENT : 'rgba(255,255,255,.85)', fontWeight: c[1] ? 700 : 500 }}>{c[0]}</div>)}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 12 }}>
        <div onClick={() => exportBoxPdf(roster, log, TEAM_NAME)} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>PDF</div>
        <div onClick={() => exportBoxCsv(roster, log)} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>CSV</div>
        <div onClick={askReset} style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset</div>
      </div>
    </div>
  )
}

function ResetModal() {
  const { state, closeReset, resetGame, resetRoster } = useApp()
  if (!state.resetAsk) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 320, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Reset game</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>{state.log.length} logged actions for {state.roster.length} players. This cannot be undone.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={resetGame} style={{ padding: 11, borderRadius: 11, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Clear all stats</div>
          <div onClick={resetRoster} style={{ padding: 11, borderRadius: 11, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Clear stats and roster</div>
          <div onClick={closeReset} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}

export default function StatTracker() {
  const { state, set, closeStats } = useApp()
  const { roster, log, statsTab } = state
  const gameLine = (roster.length ? roster.length + ' players' : 'No roster yet') + ' · ' + log.length + ' actions logged'

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="Stat tracker" line={gameLine} onClose={closeStats} />
      <Tabs tabs={[['live', 'Live'], ['roster', 'Roster'], ['box', 'Box score']]} active={statsTab} onChange={(k) => set({ statsTab: k })} />
      {statsTab === 'live' && <LiveTab />}
      {statsTab === 'roster' && <RosterEditor emptyHint="Add every player once — the roster stays on this device for all games." />}
      {statsTab === 'box' && <BoxTab />}
      <ResetModal />
    </div>
  )
}
