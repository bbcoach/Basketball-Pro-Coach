import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { COND } from '../theme'

export default function ImportModal() {
  const { state, closeImport, setImportText, submitImport } = useApp()
  if (!state.importOpen) return null
  const { importText, importErr } = state

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImportText(String(reader.result || ''))
    reader.readAsText(file)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(6,6,8,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Import</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 12px' }}>Paste a play or drill code from another coach, or open the file they sent you.</div>
        <textarea
          value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="BPC1:play:… or BPC1:drill:…" rows={4}
          style={{ width: '100%', padding: '10px 11px', marginBottom: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none', resize: 'none' }}
        />
        {!!importErr && <div style={{ fontSize: 11.5, color: '#e2762b', marginBottom: 8 }}>{importErr}</div>}
        <label style={{ display: 'block', padding: '10px 12px', marginBottom: 10, borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
          Choose a file…
          <input type="file" accept=".txt" onChange={onFile} style={{ display: 'none' }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={submitImport} style={{ padding: 12, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Import</div>
          <div onClick={closeImport} style={{ padding: 10, borderRadius: 11, background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
        </div>
      </div>
    </div>
  )
}
