import { useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { parseRosterCsv } from '../lib/rosterCsv'

export default function RosterEditor({ emptyHint, grow = true }) {
  const { state, set, addPlayer, editPlayer, cancelEditPlayer, removePlayer, importRosterPlayers, askConfirm } = useApp()
  const { roster, nameIn, numIn, editId } = state
  const csvFileRef = useRef(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvError, setCsvError] = useState(null)

  const pickCsvFile = () => { setCsvError(null); csvFileRef.current?.click() }
  const onCsvFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const found = parseRosterCsv(await file.text())
      // Re-importing the same list shouldn't double up the squad.
      const have = new Set(roster.map((p) => p.name.trim().toLowerCase()))
      const fresh = found.filter((p) => !have.has(p.name.trim().toLowerCase()))
      if (!fresh.length) setCsvError('Everyone in that file is already on the roster.')
      else setCsvPreview({ players: fresh, skipped: found.length - fresh.length })
    } catch (err) {
      setCsvError(err.message || 'Could not read that file.')
    }
  }
  const confirmCsvImport = () => {
    importRosterPlayers(csvPreview.players)
    setCsvPreview(null)
  }

  return (
    <div style={{ flex: grow ? 1 : 'none', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
        <input
          type="text" value={numIn} onChange={(e) => set({ numIn: e.target.value })} placeholder="#"
          style={{ width: 54, flex: 'none', padding: '10px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, textAlign: 'center', outline: 'none' }}
        />
        <input
          type="text" value={nameIn} onChange={(e) => set({ nameIn: e.target.value })} placeholder="Player name"
          style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        <div onClick={addPlayer} style={{ padding: '10px 14px', borderRadius: 10, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>{editId ? 'Save' : 'Add'}</div>
        {editId && <div onClick={cancelEditPlayer} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>✕</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12 }}>
        <div onClick={pickCsvFile} style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Import CSV</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: csvError ? '#d98a6a' : 'rgba(255,255,255,.35)', lineHeight: 1.4 }}>
          {csvError || 'A list with number and name — any common spreadsheet export works.'}
        </div>
        <input ref={csvFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onCsvFile} style={{ display: 'none' }} />
      </div>
      <div style={{ flex: grow ? 1 : 'none', minHeight: 0, overflowY: grow ? 'auto' : 'visible', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {roster.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 11, background: editId === p.id ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (editId === p.id ? ACCENT : 'rgba(255,255,255,.08)') }}>
            <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.10)', color: '#fff', fontWeight: 700, fontSize: 15 }}>{p.num}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div onClick={() => editPlayer(p)} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✎</div>
            <div onClick={() => askConfirm({ title: 'Remove player', message: `Remove ${p.name}? This can't be undone.`, onConfirm: () => removePlayer(p) })} style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.55)', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</div>
          </div>
        ))}
        {!roster.length && <div style={{ padding: '12px 2px', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{emptyHint}</div>}
      </div>

      {csvPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
          <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Import roster</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 12px', lineHeight: 1.5 }}>
              Found {csvPreview.players.length} {csvPreview.players.length === 1 ? 'player' : 'players'} in this file.
              {csvPreview.skipped > 0 && ` ${csvPreview.skipped} already on the roster and skipped.`}
            </div>
            <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {csvPreview.players.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.05)' }}>
                  <div style={{ width: 24, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700, color: p.num ? ACCENT : 'rgba(255,255,255,.3)' }}>{p.num || '–'}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div onClick={confirmCsvImport} style={{ padding: 11, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Import {csvPreview.players.length}</div>
              <div onClick={() => setCsvPreview(null)} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
