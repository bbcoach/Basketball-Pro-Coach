import { useApp } from '../../state/store'
import { ACCENT } from '../../state/config'
import ScreenHeader from '../ScreenHeader'
import RosterEditor from '../RosterEditor'

function TeamsList() {
  const { state, selectTeam, newTeam, askRemoveTeam } = useApp()
  const { teams, activeTeamId } = state
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div onClick={newTeam} style={{ padding: 12, borderRadius: 12, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginBottom: 10 }}>＋ New team</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teams.map((t) => {
          const active = t.id === activeTeamId
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, background: active ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (active ? ACCENT : 'rgba(255,255,255,.08)') }}>
              <div onClick={() => selectTeam(t.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  {active && <div style={{ padding: '2px 7px', borderRadius: 99, background: ACCENT, color: '#101012', fontSize: 9.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', flex: 'none' }}>Active</div>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{t.roster.length} players · {t.games.length} games · {t.sessions.length} sessions</div>
              </div>
              {teams.length > 1 && <div onClick={() => askRemoveTeam(t.id)} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamDetail() {
  const { state, backToTeamsList, renameTeam } = useApp()
  const { teams, activeTeamId } = state
  const team = teams.find((t) => t.id === activeTeamId)
  if (!team) return null
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
        <input
          type="text" value={team.name} onChange={(e) => renameTeam(e.target.value)} placeholder="Team name"
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
        />
        <div onClick={backToTeamsList} style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Back</div>
      </div>
      <RosterEditor emptyHint="Add every player on this team once — the roster is shared with the stat tracker and attendance for this team." />
    </div>
  )
}

function RemoveTeamModal() {
  const { state, closeRemoveTeam, confirmRemoveTeam } = useApp()
  const team = state.teams.find((t) => t.id === state.teamRemoveAsk)
  if (!team) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 320, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Delete team</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 14px', lineHeight: 1.5 }}>
          “{team.name}” has {team.roster.length} players, {team.games.length} games and {team.sessions.length} attendance sessions. Deleting it removes all of that. This cannot be undone.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={confirmRemoveTeam} style={{ padding: 11, borderRadius: 11, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Delete team</div>
          <div onClick={closeRemoveTeam} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}

export default function Teams() {
  const { state, closeTeams } = useApp()
  const { teams, teamsDetail } = state
  const line = teams.length + (teams.length === 1 ? ' team' : ' teams')

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: '#0b0b0d', display: 'flex', flexDirection: 'column', padding: '56px 0 46px' }}>
      <ScreenHeader title="My roster" line={line} onClose={closeTeams} />
      {teamsDetail ? <TeamDetail /> : <TeamsList />}
      <RemoveTeamModal />
    </div>
  )
}
