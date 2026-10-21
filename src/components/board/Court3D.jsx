import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../state/store'
import { actsOf, stepAtTime } from '../../lib/board-geometry'
import { ROUTE_ORDER, ROUTE_LABELS, routeCss } from '../../board3d/routeColors'

// The 3D view of the board. It shows the same play the 2D court does, driven
// by the same time (state.t): playing, scrubbing and the step chips all work
// as they do on the top view. View only — editing happens in 2D.
//
// The 3D code and three.js are fetched the first time this opens, so the rest
// of the app never pays for them.
export default function Court3D() {
  const { state } = useApp()
  const host = useRef(null)
  const view = useRef(null)
  const latest = useRef(state)
  latest.current = state
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let alive = true
    let ctl = null
    let ro = null
    import('../../board3d/Board3D')
      .then(({ createBoard3D }) => createBoard3D(host.current))
      .then((c) => {
        if (!alive) { c.dispose(); return }
        ctl = c
        view.current = c
        const s = latest.current
        c.setBoard(s)
        c.setCamera(s.cam3d, s.povId)
        c.setPaths(s.paths3d)
        c.render(s.t)
        ro = new ResizeObserver(() => c.resize())
        ro.observe(host.current)
        setStatus('ready')
      })
      .catch(() => { if (alive) setStatus('error') })
    return () => {
      alive = false
      if (ro) ro.disconnect()
      view.current = null
      if (ctl) ctl.dispose()
    }
  }, [])

  // a different play, or edits to it (done in 2D, seen here next time)
  useEffect(() => { if (view.current) view.current.setBoard(state) }, [state.players, state.ball, state.steps, state.autoDef, state.helpDef, state.defenseDelay]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.current) view.current.setCourtView(state.view) }, [state.view])
  useEffect(() => { if (view.current) view.current.setCamera(state.cam3d, state.povId) }, [state.cam3d, state.povId])
  useEffect(() => { if (view.current) view.current.setPaths(state.paths3d) }, [state.paths3d])
  useEffect(() => { if (view.current) view.current.render(state.t) }, [state.t, status])

  // which kinds of action are drawn on the floor in this step, for the key
  const ents = state.players.concat([state.ball])
  const nSteps = ents.reduce((m, e) => actsOf(e).reduce((mm, a) => (a.pts.length ? Math.max(mm, a.step) : mm), m), Math.max(1, state.steps))
  const step = stepAtTime(state.t, nSteps)
  const present = new Set()
  ents.forEach((e) => actsOf(e).forEach((a) => { if (a.step === step && a.pts.length) present.add(a.type) }))
  const kinds = state.paths3d ? ROUTE_ORDER.filter((k) => present.has(k)) : []

  const note = status === 'loading' ? 'Loading 3D…' : status === 'error' ? "3D view isn't available on this device" : null
  return (
    <div ref={host} style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, borderRadius: 10, overflow: 'hidden', background: '#0e0e10' }}>
      {status === 'ready' && kinds.length > 0 && (
        <div style={{ position: 'absolute', left: 8, top: 8, right: 8, display: 'flex', flexWrap: 'wrap', gap: 5, pointerEvents: 'none' }}>
          {kinds.map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 6px', borderRadius: 99, background: 'rgba(10,10,12,.72)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.2px' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: routeCss(k), flex: 'none' }} />{ROUTE_LABELS[k]}
            </div>
          ))}
        </div>
      )}
      {note && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 600 }}>{note}</div>
      )}
    </div>
  )
}
