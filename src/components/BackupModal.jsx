import { useRef, useState } from 'react'
import { useApp } from '../state/store'
import { ACCENT } from '../state/config'
import { downloadBackup, parseBackup, applyBackup } from '../lib/backup'

export default function BackupModal() {
  const { state, closeBackup } = useApp()
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null)
  const [status, setStatus] = useState(null)

  if (!state.backupOpen) return null

  const close = () => { setPending(null); setStatus(null); closeBackup() }

  const doExport = () => {
    try {
      downloadBackup()
      setStatus({ ok: true, text: 'Backup file saved.' })
    } catch {
      setStatus({ ok: false, text: 'Could not create the backup file.' })
    }
  }

  const pickFile = () => { setStatus(null); fileRef.current?.click() }

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      setPending(parseBackup(text))
    } catch (err) {
      setStatus({ ok: false, text: err.message })
    }
  }

  const confirmRestore = () => {
    applyBackup(pending)
    setStatus({ ok: true, text: 'Restored — reloading…' })
    setTimeout(() => window.location.reload(), 500)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(6,6,8,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#141417', border: '1px solid rgba(255,255,255,.11)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>Backup</div>

        {pending ? (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
              Backup from {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : 'an unknown date'} · {pending.teamCount}{pending.teamCount === 1 ? ' team' : ' teams'}.
              This replaces everything currently on this device — it can't be undone.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div onClick={confirmRestore} style={{ padding: 11, borderRadius: 11, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Replace everything</div>
              <div onClick={() => setPending(null)} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Cancel</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '6px 0 16px', lineHeight: 1.5 }}>
              Everything lives only on this device. Save a backup file now and then, so a lost phone or a cleared browser doesn't mean starting over.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div onClick={doExport} style={{ padding: 11, borderRadius: 11, background: ACCENT, color: '#101012', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Save backup file</div>
              <div onClick={pickFile} style={{ padding: 11, borderRadius: 11, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Restore from file…</div>
              <input ref={fileRef} type="file" accept="application/json" onChange={onFile} style={{ display: 'none' }} />
              {status && <div style={{ fontSize: 11.5, color: status.ok ? '#5bbf72' : '#d9843c', textAlign: 'center', lineHeight: 1.4, padding: '2px 4px' }}>{status.text}</div>}
              <div onClick={close} style={{ padding: 10, borderRadius: 11, color: 'rgba(255,255,255,.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Close</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
