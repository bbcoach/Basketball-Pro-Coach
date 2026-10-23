import { useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { keycap } from '../theme'

// Brings players over from another team's roster, so somebody who plays in
// more than one age group is entered once and not again for every team.
// Players already here (the same name) are shown but can't be picked.
export default function RosterCopyModal({ onClose }) {
  const { state, copyRosterPlayers } = useApp()
  const others = state.teams.filter((t) => t.id !== state.activeTeamId)
  const [teamId, setTeamId] = useState(others.length === 1 ? others[0].id : null)
  const [picked, setPicked] = useState(() => new Set())
  const team = others.find((t) => t.id === teamId)
  const have = new Set(state.roster.map((p) => p.name.trim().toLowerCase()))
  const here = new Set(state.roster.map((p) => String(p.num)).filter(Boolean))
  const canPick = (team ? team.roster : []).filter((p) => !have.has(p.name.trim().toLowerCase()))

  const chooseTeam = (id) => { setTeamId(id); setPicked(new Set()) }
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allPicked = canPick.length > 0 && canPick.every((p) => picked.has(p.id))
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(canPick.map((p) => p.id)))
  const confirm = () => {
    copyRosterPlayers(canPick.filter((p) => picked.has(p.id)))
    onClose()
  }

  const chip = (on) => ({ padding: '6px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none', background: on ? ACCENT : 'rgba(255,255,255,.07)', color: on ? '#101012' : 'rgba(255,255,255,.7)' })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Copy from team</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 12px', lineHeight: 1.5 }}>
          Pick players from another team. They keep their number, contact details and photo; games and attendance stay with the other team.
        </div>
        {others.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
            {others.map((t) => <div key={t.id} onClick={() => chooseTeam(t.id)} style={chip(t.id === teamId)}>{t.name}</div>)}
          </div>
        )}
        {team && (
          <>
            {canPick.length > 0 && (
              <div onClick={toggleAll} style={{ fontSize: 11.5, fontWeight: 600, color: ACCENT, cursor: 'pointer', paddingBottom: 8 }}>{allPicked ? 'Select none' : 'Select all'}</div>
            )}
            <div style={{ maxHeight: 230, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {team.roster.map((p) => {
                const taken = have.has(p.name.trim().toLowerCase())
                const clash = !taken && p.num && here.has(String(p.num))
                const on = picked.has(p.id)
                return (
                  <div key={p.id} onClick={() => !taken && toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: on ? 'rgba(232,177,60,.14)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (on ? ACCENT : 'transparent'), opacity: taken ? 0.4 : 1, cursor: taken ? 'default' : 'pointer' }}>
                    <div style={{ width: 18, height: 18, flex: 'none', borderRadius: 5, border: '1.5px solid ' + (on ? ACCENT : 'rgba(255,255,255,.3)'), background: on ? ACCENT : 'transparent', color: '#101012', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</div>
                    <div style={{ width: 24, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700, color: p.num ? ACCENT : 'rgba(255,255,255,.3)' }}>{p.num || '–'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      {taken && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>Already on this roster</div>}
                      {clash && <div style={{ fontSize: 10.5, color: '#d98a6a', marginTop: 1 }}>Number {p.num} is taken here — will be left blank</div>}
                    </div>
                  </div>
                )
              })}
              {!team.roster.length && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', padding: '4px 2px' }}>This team has no players yet.</div>}
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={picked.size ? confirm : undefined} style={{ padding: 11, borderRadius: 12, ...(picked.size ? keycap() : { background: 'rgba(255,255,255,.07)' }), color: picked.size ? '#101012' : 'rgba(255,255,255,.35)', fontSize: 13, fontWeight: 700, cursor: picked.size ? 'pointer' : 'default', textAlign: 'center' }}>
            {picked.size ? 'Copy ' + picked.size + (picked.size === 1 ? ' player' : ' players') : team ? 'Pick players to copy' : 'Pick a team'}
          </div>
          <div onClick={onClose} style={{ padding: 10, borderRadius: 12, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}
