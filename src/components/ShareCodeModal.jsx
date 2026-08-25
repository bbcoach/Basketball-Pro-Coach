import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { COND } from '../theme'
import { download } from '../lib/download'

export default function ShareCodeModal() {
  const { state, closeShareCode, showToast } = useApp()
  const shareCode = state.shareCode
  if (!shareCode) return null
  const { title, code } = shareCode

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      showToast('Code copied')
    } catch {
      showToast('Could not copy — select the code manually')
    }
  }
  const saveFile = () => {
    const slug = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/(^-|-$)/g, '') || 'share'
    download(new Blob([code], { type: 'text/plain' }), slug + '.bpc.txt')
    showToast('File saved')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(6,6,8,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontFamily: COND, fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Share “{title}”</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 12px' }}>Send this code to another coach — they paste it into "Import" on their device.</div>
        <textarea
          readOnly value={code} rows={4} onFocus={(e) => e.target.select()}
          style={{ width: '100%', padding: '10px 11px', marginBottom: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)', fontSize: 11, fontFamily: 'monospace', outline: 'none', resize: 'none' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={copy} style={{ padding: 12, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Copy code</div>
          <div onClick={saveFile} style={{ padding: 12, borderRadius: 11, background: 'rgba(255,255,255,.09)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Save as file</div>
          <div onClick={closeShareCode} style={{ padding: 10, borderRadius: 11, background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Close</div>
        </div>
      </div>
    </div>
  )
}
