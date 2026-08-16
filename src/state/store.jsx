import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  actsOf, baseAt, makeBoard, maxStepOf, normEnt, setAct, startState, stepAtTime,
} from '../lib/board-geometry'
import { HINTS } from '../lib/content'
import { exportClip, exportStill } from '../lib/export'

const LS = {
  plays: 'tb.plays.v1',
  roster: 'tb.roster.v1',
  game: 'tb.game.v1',
  games: 'tb.games.v1',
  drills: 'tb.drills.v1',
  plans: 'tb.plans.v1',
  sessions: 'tb.sessions.v1',
  teams: 'tb.teams.v1',
  activeTeam: 'tb.activeTeam.v1',
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore quota errors */ }
}

function initialState() {
  const s0 = startState()
  return {
    screen: 'home', // 'home' | 'board' | 'stats' | 'attend' | 'practice' | 'teams' | 'schedule'
    boardMenu: false, loadOpen: false, infoPage: null, backupOpen: false,

    // board
    view: 'half', tool: 'move', playing: false, t: 0, speed: 1, step: 1, steps: 1,
    players: s0.players, ball: s0.ball, sel: null, seq: 6,
    hint: 'Step 1 — drag players, pick a tool, draw the path',
    autoDef: true, timeout: false,
    currentId: null, playName: 'Untitled play',
    sheetOpen: false, saveOpen: false, renameId: null, nameDraft: '',
    formOpen: false, shareOpen: false, exporting: false,
    shareStatus: 'Sends the current play to your team',
    plays: [],

    // teams (each team owns its own roster, games and attendance sessions)
    teams: [], activeTeamId: null, teamsDetail: false, teamRemoveAsk: null,

    // stat tracker (roster is shared with attendance, scoped to the active team)
    statsTab: 'games', roster: [], selPlayer: null, nameIn: '', numIn: '', editId: null,
    games: [], activeGameId: null, resetAsk: false,

    // coaches (scoped to the active team, tracked mainly for attendance/pay)
    coaches: [], coachNameIn: '', coachEditId: null,

    // training attendance
    attendTab: 'sessions', sessions: [], openSession: null,

    // schedule — lets a coach plan ahead: schedule a future training or
    // game (written into the sections above), or note a team event (its
    // own scoped entity, since nothing else in the app models those)
    events: [], evKind: 'training', evTitleIn: '', evDateIn: '', evTimeIn: '', evHome: '', evLocationIn: '', evEditId: null,

    // practice
    practiceTab: 'plans', drills: [], plans: [], openPlan: null, activePlan: null,
    dName: '', dMin: '', dDesc: '', dPlayId: null, dEdit: null,
    runPlanId: null, runIdx: 0, runLeft: 0, runPaused: false,
  }
}

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [state, setState] = useState(initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))

  const history = useRef([])
  const drag = useRef(null)
  const svgRef = useRef(null)
  const contentRef = useRef(null)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const runTimerRef = useRef(0)

  // ── load persisted data once ──────────────────────────────
  useEffect(() => {
    const plays = loadJson(LS.plays, [])
    const drills = loadJson(LS.drills, [])
    const plans = loadJson(LS.plans, [])

    let teams = loadJson(LS.teams, [])
    if (!teams.length) {
      // migrate the pre-teams flat roster/games/sessions into a single default team
      const roster = loadJson(LS.roster, [])
      const coaches = [] // coaches are new — no pre-teams data to migrate
      const events = [] // events are new — no pre-teams data to migrate
      let games = loadJson(LS.games, [])
      if (!games.length) {
        // migrate the even older single-game record (pre-dates per-game history) too
        const legacy = loadJson(LS.game, null)
        if (legacy && legacy.log && legacy.log.length) {
          games = [{
            id: 'gm' + Date.now(), date: new Date().toISOString().slice(0, 10), type: 'game',
            opponent: legacy.opponent || '', log: legacy.log, onCourt: legacy.onCourt || [],
          }]
        }
      }
      const sessions = loadJson(LS.sessions, [])
      teams = [{ id: 'tm' + Date.now(), name: 'My Team', roster, coaches, games, sessions, events }]
      saveJson(LS.teams, teams)
    }
    // teams saved before coaches/events existed won't have those fields yet
    if (teams.some((t) => !t.coaches || !t.events)) {
      teams = teams.map((t) => ({ ...t, coaches: t.coaches || [], events: t.events || [] }))
      saveJson(LS.teams, teams)
    }
    let activeTeamId = loadJson(LS.activeTeam, null)
    if (!activeTeamId || !teams.some((t) => t.id === activeTeamId)) {
      activeTeamId = teams[0].id
      saveJson(LS.activeTeam, activeTeamId)
    }
    const active = teams.find((t) => t.id === activeTeamId)
    set({
      plays, drills, plans, teams, activeTeamId,
      roster: active.roster, coaches: active.coaches, games: active.games, sessions: active.sessions, events: active.events,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── persisted collection setters ──────────────────────────
  // roster/games/sessions live inside the active team's record; the flat
  // state.roster/games/sessions are a mirror of whichever team is active, so
  // every existing screen keeps reading/writing them without knowing teams exist.
  const persistTeamField = (field, fn) => setState((s) => {
    const value = typeof fn === 'function' ? fn(s[field]) : fn
    const teams = s.teams.map((t) => (t.id === s.activeTeamId ? { ...t, [field]: value } : t))
    saveJson(LS.teams, teams)
    return { ...s, teams, [field]: value }
  })
  const persistRoster = (fn) => persistTeamField('roster', fn)
  const persistCoaches = (fn) => persistTeamField('coaches', fn)
  const persistGames = (fn) => persistTeamField('games', fn)
  const persistSessions = (fn) => persistTeamField('sessions', fn)
  const persistEvents = (fn) => persistTeamField('events', fn)
  const persistDrills = (fn) => setState((s) => {
    const drills = typeof fn === 'function' ? fn(s.drills) : fn
    saveJson(LS.drills, drills)
    return { ...s, drills }
  })
  const persistPlans = (fn) => setState((s) => {
    const plans = typeof fn === 'function' ? fn(s.plans) : fn
    saveJson(LS.plans, plans)
    return { ...s, plans }
  })
  const persistPlays = (fn) => setState((s) => {
    const plays = typeof fn === 'function' ? fn(s.plays) : fn
    saveJson(LS.plays, plays)
    return { ...s, plays }
  })

  // ── board helpers ──────────────────────────────────────────
  const nSteps = () => makeBoard(stateRef.current).nSteps()

  const snapshot = () => {
    const s = stateRef.current
    history.current.push(JSON.stringify({ players: s.players, ball: s.ball, steps: s.steps, step: s.step }))
    if (history.current.length > 40) history.current.shift()
  }

  const pt = (e) => {
    const svg = svgRef.current
    const content = contentRef.current
    if (!svg || !content) return { x: 0, y: 0 }
    const p = svg.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    // Read the CTM off the content group, not the outer <svg> — in the
    // Tactics Board's landscape layout that group carries the on-screen
    // rotation, so its CTM maps screen taps straight back to the same
    // logical (portrait-authored) coordinates the rest of the app uses,
    // with no orientation-specific math anywhere else.
    const m = content.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const q = p.matrixTransform(m.inverse())
    return { x: q.x, y: q.y }
  }

  const onDown = (e) => {
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
    const p = pt(e)
    const s = stateRef.current
    const tool = s.tool
    if (tool === 'addOff' || tool === 'addDef') {
      snapshot()
      const off = tool === 'addOff'
      const n = s.players.filter((x) => x.team === (off ? 'off' : 'def')).length + 1
      set((st) => ({
        players: st.players.concat([{ id: 'p' + st.seq, team: off ? 'off' : 'def', label: off ? String(n) : 'X' + n, x: p.x, y: p.y, acts: [] }]),
        seq: st.seq + 1, tool: 'move', playing: false,
      }))
      return
    }
    const board = makeBoard(s)
    const id = board.hit(p, s.t)
    if (tool === 'erase') {
      if (!id) return
      snapshot()
      const k = s.step
      const strip = (e2) => {
        const e3 = normEnt(e2)
        const cur = e3.acts.filter((a) => a.step === k)
        return { ...e3, acts: cur.length ? e3.acts.filter((a) => a.step !== k) : e3.acts.slice(0, -1) }
      }
      if (id === 'ball') { set((st) => ({ ball: strip(st.ball) })); return }
      const ent = board.entity(id)
      if (ent && actsOf(ent).length) set((st) => ({ players: st.players.map((x) => (x.id === id ? strip(x) : x)) }))
      else set((st) => ({ players: st.players.filter((x) => x.id !== id) }))
      return
    }
    if (!id) { set({ sel: null }); return }
    if (tool === 'move') { snapshot(); drag.current = { id }; set({ sel: id, playing: false, t: 0, step: 1 }); return }
    const k = s.step
    const t0 = (k - 1) / nSteps()
    if (tool === 'pass' || tool === 'shot') {
      snapshot()
      drag.current = { id: 'ball', draw: tool, step: k }
      set((st) => ({ ball: setAct(st.ball, k, tool, p), sel: 'ball', playing: false, t: t0 }))
      return
    }
    if (id === 'ball') return
    snapshot()
    drag.current = { id, draw: tool, step: k }
    set((st) => ({ players: st.players.map((x) => (x.id === id ? setAct(x, k, tool, p) : x)), sel: id, playing: false, t: t0 }))
  }

  const onMove = (e) => {
    if (!drag.current) return
    const p = pt(e)
    const d = drag.current
    if (!d.draw) {
      if (d.id === 'ball') set((s) => ({ ball: { ...s.ball, x: p.x, y: p.y } }))
      else set((s) => ({ players: s.players.map((x) => (x.id === d.id ? { ...x, x: p.x, y: p.y } : x)) }))
      return
    }
    const push = (ent) => {
      const acts = actsOf(ent)
      const i = acts.findIndex((a) => a.step === d.step)
      if (i < 0) return ent
      const a = acts[i]
      if (Math.hypot(a.pts[a.pts.length - 1].x - p.x, a.pts[a.pts.length - 1].y - p.y) < 26) return ent
      const na = acts.slice()
      na[i] = { ...a, pts: a.pts.concat([p]) }
      return { ...ent, acts: na }
    }
    if (d.id === 'ball') set((s) => ({ ball: push(s.ball) }))
    else set((s) => ({ players: s.players.map((x) => (x.id === d.id ? push(x) : x)) }))
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.draw) {
      const s = stateRef.current
      const board = makeBoard(s)
      const ent = board.entity(d.id)
      const a = ent && actsOf(ent).find((z) => z.step === d.step)
      if (a) {
        const startPos = d.id === 'ball' ? board.ballStart(a.step) : baseAt(ent, a.step)
        const last = a.pts[a.pts.length - 1]
        const tiny = Math.hypot(startPos.x - last.x, startPos.y - last.y) < 45
        if (tiny) {
          const strip = (e2) => ({ ...normEnt(e2), acts: actsOf(e2).filter((z) => z.step !== d.step) })
          if (d.id === 'ball') set((st) => ({ ball: strip(st.ball) }))
          else set((st) => ({ players: st.players.map((x) => (x.id === d.id ? strip(x) : x)) }))
        } else {
          set((st) => ({ steps: Math.max(st.steps, d.step) }))
        }
      }
    }
  }

  // ── playback ────────────────────────────────────────────────
  const tick = (now) => {
    if (!stateRef.current.playing) return
    const dt = (now - (lastRef.current || now)) / 1000
    lastRef.current = now
    const n = nSteps()
    set((s) => {
      let t = s.t + dt * (0.42 / n) * s.speed
      if (t >= 1) t -= 1
      return { t }
    })
    rafRef.current = requestAnimationFrame(tick)
  }
  const togglePlay = () => {
    const playing = !stateRef.current.playing
    if (!playing) set({ step: stepAtTime(stateRef.current.t, nSteps()), playing })
    else set({ playing })
    cancelAnimationFrame(rafRef.current)
    lastRef.current = 0
    if (playing) rafRef.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); clearInterval(runTimerRef.current) }, [])

  const setView = (view) => { set({ view, playing: false, t: 0 }); cancelAnimationFrame(rafRef.current) }

  const addStep = () => {
    const n2 = nSteps() + 1
    set({ steps: n2, step: n2, t: (n2 - 1) / n2, playing: false, hint: 'Step ' + n2 + ' starts where step ' + (n2 - 1) + ' ended' })
  }
  const delStep = () => {
    const n = nSteps()
    if (n < 2) return
    snapshot()
    const drop = (e2) => ({ ...normEnt(e2), acts: actsOf(e2).filter((a) => a.step !== n) })
    const n2 = n - 1
    set((s) => ({ players: s.players.map(drop), ball: drop(s.ball), steps: n2, step: Math.min(s.step, n2), t: (Math.min(s.step, n2) - 1) / n2, playing: false }))
  }
  const gotoStep = (nn) => set({ step: nn, t: (nn - 1) / nSteps(), playing: false, hint: 'Step ' + nn + ' — draw the actions of this step' })

  const undo = () => {
    const prev = history.current.pop()
    if (!prev) return
    const o = JSON.parse(prev)
    set({ players: o.players, ball: o.ball, steps: o.steps || 1, step: o.step || 1, t: 0, playing: false })
  }
  const clearRoutes = () => {
    snapshot()
    set((s) => ({ players: s.players.map((p) => ({ ...normEnt(p), acts: [] })), ball: { ...normEnt(s.ball), acts: [] }, t: 0, steps: 1, step: 1, playing: false }))
  }
  const resetAll = () => {
    snapshot()
    const s0 = startState()
    set({ players: s0.players, ball: s0.ball, t: 0, steps: 1, step: 1, playing: false, sel: null, currentId: null, playName: 'Untitled play' })
  }

  const setTool = (id) => set({ tool: id, hint: HINTS[id] })

  const toggleAutoDef = () => set((s) => ({ autoDef: !s.autoDef, hint: s.autoDef ? 'Defenders stay put unless you draw their path' : 'Defenders now shadow their nearest attacker' }))

  const applyFormation = (fm) => {
    snapshot()
    set((s) => {
      const keep = s.players.filter((p) => (fm.side === 'off' ? p.team === 'def' : p.team === 'off'))
      // Fullcourt isn't a separately scaled coordinate space — Court.jsx always
      // draws the full 2800-tall court and just crops to the top half for
      // 'half' view, so the near basket sits at the same small-y region (and
      // startState()'s players use the same convention) in both views. No
      // view-dependent transform needed: formation coords apply as authored.
      const made = fm.pos.map((c, i) => ({
        id: fm.side + 'f' + i, team: fm.side, label: fm.side === 'off' ? String(i + 1) : 'X' + (i + 1),
        x: c[0], y: c[1], acts: [],
      }))
      const ballTo = fm.side === 'off' ? made[0] : null
      return {
        players: fm.side === 'off' ? made.concat(keep) : keep.concat(made),
        ball: ballTo ? { x: ballTo.x + 56, y: ballTo.y + 44, acts: [] } : { ...normEnt(s.ball), acts: [] },
        formOpen: false, t: 0, step: 1, steps: 1, playing: false, sel: null, tool: 'move',
        hint: fm.name + ' set — drag anyone to fine-tune',
      }
    })
  }

  // ── plays (save / load) ────────────────────────────────────
  const fileBase = () => (stateRef.current.playName || 'play').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

  const openSave = () => set((s) => ({ saveOpen: true, renameId: null, playing: false, nameDraft: s.playName === 'Untitled play' ? '' : s.playName }))
  const closeSave = () => set({ saveOpen: false, renameId: null })
  const openSheet = () => set((s) => ({ sheetOpen: true, playing: false, nameDraft: s.playName === 'Untitled play' ? '' : s.playName }))
  const closeSheet = () => set({ sheetOpen: false })
  const renamePlay = (p) => set({ saveOpen: true, sheetOpen: false, renameId: p.id, nameDraft: p.name })

  const savePlay = () => {
    const s = stateRef.current
    const name = (s.nameDraft || '').trim() || ('Play ' + (s.plays.length + 1))
    if (s.renameId) {
      persistPlays((ps) => ps.map((x) => (x.id === s.renameId ? { ...x, name } : x)))
      set((st) => ({ saveOpen: false, renameId: null, playName: st.currentId === s.renameId ? name : st.playName }))
      return
    }
    const n = nSteps()
    const snap = { view: s.view, steps: n, players: JSON.parse(JSON.stringify(s.players.map(normEnt))), ball: JSON.parse(JSON.stringify(normEnt(s.ball))) }
    const existing = s.plays.find((p) => p.name.toLowerCase() === name.toLowerCase())
    const id = existing ? existing.id : 'pl' + Date.now()
    const entry = { id, name, ts: Date.now(), ...snap }
    persistPlays((ps) => (ps.some((x) => x.id === id) ? ps.map((x) => (x.id === id ? entry : x)) : [entry].concat(ps)))
    set({ currentId: id, playName: name, sheetOpen: false, saveOpen: false, renameId: null, hint: 'Saved as “' + name + '”' })
  }
  // "open" — from the home screen's Load list: fresh board, undo history cleared.
  const openPlayFromHome = (p) => {
    history.current = []
    const d = JSON.parse(JSON.stringify(p))
    set({
      screen: 'board', boardMenu: false, loadOpen: false,
      view: d.view, players: d.players.map(normEnt), ball: normEnt(d.ball),
      steps: d.steps || maxStepOf(d.players.concat([d.ball])), step: 1, currentId: p.id, playName: p.name,
      t: 0, playing: false, sel: null, tool: 'move',
    })
  }
  // "load" — from the in-board "My plays" sheet: swaps the board, keeps undo history.
  const loadPlayFromSheet = (p) => {
    snapshot()
    const d = JSON.parse(JSON.stringify(p))
    set({
      view: d.view, players: d.players.map(normEnt), ball: normEnt(d.ball),
      steps: d.steps || maxStepOf(d.players.concat([d.ball])), step: 1, currentId: p.id, playName: p.name,
      sheetOpen: false, t: 0, playing: false, sel: null,
    })
  }
  const removePlay = (p) => {
    persistPlays((ps) => ps.filter((x) => x.id !== p.id))
    if (stateRef.current.currentId === p.id) set({ currentId: null })
  }
  const startNewPlay = () => {
    const s0 = startState()
    history.current = []
    set({
      screen: 'board', boardMenu: false, loadOpen: false, view: 'half', players: s0.players, ball: s0.ball,
      t: 0, steps: 1, step: 1, playing: false, sel: null, tool: 'move', currentId: null, playName: 'Untitled play',
    })
  }
  const goHome = () => set({ screen: 'home', boardMenu: true, loadOpen: false, playing: false })
  const toggleBoardMenu = () => set((s) => ({ boardMenu: !s.boardMenu }))
  const toggleLoad = () => set((s) => ({ loadOpen: !s.loadOpen }))

  // ── formations / share modals ──────────────────────────────
  const openFormations = () => set({ formOpen: true, playing: false })
  const closeFormations = () => set({ formOpen: false })
  const openShare = () => set((s) => ({ shareOpen: true, playing: false, shareStatus: 'Step ' + s.step + ' of ' + nSteps() + ' · ' + (s.view === 'half' ? 'Halfcourt' : 'Fullcourt') }))
  const closeShareModal = () => set({ shareOpen: false })
  const doExportPng = () => exportStill(svgRef, contentRef, stateRef, set)
  const doExportVideo = () => exportClip(svgRef, contentRef, stateRef, set)

  const enterTimeout = () => set({ timeout: true, playing: false })
  const exitTimeout = () => set({ timeout: false })

  // ── navigation ──────────────────────────────────────────────
  const openStats = () => set({ screen: 'stats', playing: false })
  const closeStats = () => set({ screen: 'home', activeGameId: null, statsTab: 'games' })
  const openAttend = () => set({ screen: 'attend' })
  const closeAttend = () => set({ screen: 'home', openSession: null })
  const openPractice = () => set({ screen: 'practice' })
  const closePractice = () => set({ screen: 'home', openPlan: null })
  const openTeams = () => set({ screen: 'teams', teamsDetail: false })
  const closeTeams = () => set({ screen: 'home', teamsDetail: false })
  const openSchedule = () => set({ screen: 'schedule' })
  const closeSchedule = () => set({ screen: 'home' })
  const goToSession = (id) => set({ screen: 'attend', openSession: id })
  const goToGame = (id) => set({ screen: 'stats', activeGameId: id, statsTab: 'live', selPlayer: null })
  const openInfo = (page) => set({ infoPage: page })
  const closeInfo = () => set({ infoPage: null })
  const openBackup = () => set({ backupOpen: true })
  const closeBackup = () => set({ backupOpen: false })

  // ── teams ───────────────────────────────────────────────────
  // Switching teams re-points the flat roster/games/sessions mirror at the
  // newly active team and drops any in-progress game/session view, since
  // those ids belonged to the previous team's data.
  const switchTeam = (id) => {
    const s = stateRef.current
    const t = s.teams.find((x) => x.id === id)
    if (!t) return
    saveJson(LS.activeTeam, id)
    set({
      activeTeamId: id, roster: t.roster, coaches: t.coaches, games: t.games, sessions: t.sessions, events: t.events,
      activeGameId: null, statsTab: 'games', openSession: null, selPlayer: null, editId: null, nameIn: '', numIn: '',
      coachEditId: null, coachNameIn: '', evEditId: null, evTitleIn: '', evDateIn: '', evTimeIn: '', evHome: '', evLocationIn: '',
    })
  }
  const selectTeam = (id) => { switchTeam(id); set({ teamsDetail: true }) }
  const backToTeamsList = () => set({ teamsDetail: false })
  const newTeam = () => {
    const s = stateRef.current
    const id = 'tm' + Date.now()
    const entry = { id, name: 'New team ' + (s.teams.length + 1), roster: [], coaches: [], games: [], sessions: [], events: [] }
    const teams = s.teams.concat([entry])
    saveJson(LS.teams, teams)
    saveJson(LS.activeTeam, id)
    set({
      teams, activeTeamId: id, roster: [], coaches: [], games: [], sessions: [], events: [],
      activeGameId: null, statsTab: 'games', openSession: null, teamsDetail: true,
    })
  }
  const renameTeam = (v) => {
    const s = stateRef.current
    const teams = s.teams.map((t) => (t.id === s.activeTeamId ? { ...t, name: v } : t))
    saveJson(LS.teams, teams)
    set({ teams })
  }
  const askRemoveTeam = (id) => set({ teamRemoveAsk: id })
  const closeRemoveTeam = () => set({ teamRemoveAsk: null })
  const confirmRemoveTeam = () => {
    const s = stateRef.current
    const id = s.teamRemoveAsk
    if (!id || s.teams.length <= 1) { set({ teamRemoveAsk: null }); return }
    const teams = s.teams.filter((t) => t.id !== id)
    saveJson(LS.teams, teams)
    if (s.activeTeamId === id) {
      const next = teams[0]
      saveJson(LS.activeTeam, next.id)
      set({
        teams, activeTeamId: next.id, roster: next.roster, coaches: next.coaches, games: next.games, sessions: next.sessions, events: next.events,
        activeGameId: null, statsTab: 'games', openSession: null, teamsDetail: false, teamRemoveAsk: null,
      })
    } else {
      set({ teams, teamRemoveAsk: null })
    }
  }

  // ── stat tracker ────────────────────────────────────────────
  const addPlayer = () => {
    const s = stateRef.current
    const name = (s.nameIn || '').trim()
    if (!name) return
    const num = (s.numIn || '').trim() || String(s.roster.length + 1)
    if (s.editId) persistRoster((r) => r.map((x) => (x.id === s.editId ? { ...x, name, num } : x)))
    else persistRoster((r) => r.concat([{ id: 'rp' + Date.now(), name, num }]))
    set({ nameIn: '', numIn: '', editId: null })
  }
  const editPlayer = (p) => set({ editId: p.id, nameIn: p.name, numIn: p.num })
  const cancelEditPlayer = () => set({ editId: null, nameIn: '', numIn: '' })
  const removePlayer = (p) => {
    persistRoster((r) => r.filter((x) => x.id !== p.id))
    if (stateRef.current.editId === p.id) set({ editId: null, nameIn: '', numIn: '' })
  }

  // ── coaches ─────────────────────────────────────────────────
  const addCoach = () => {
    const s = stateRef.current
    const name = (s.coachNameIn || '').trim()
    if (!name) return
    if (s.coachEditId) persistCoaches((c) => c.map((x) => (x.id === s.coachEditId ? { ...x, name } : x)))
    else persistCoaches((c) => c.concat([{ id: 'co' + Date.now(), name }]))
    set({ coachNameIn: '', coachEditId: null })
  }
  const editCoach = (c) => set({ coachEditId: c.id, coachNameIn: c.name })
  const cancelEditCoach = () => set({ coachEditId: null, coachNameIn: '' })
  const removeCoach = (c) => {
    persistCoaches((cs) => cs.filter((x) => x.id !== c.id))
    if (stateRef.current.coachEditId === c.id) set({ coachEditId: null, coachNameIn: '' })
  }

  const selectStatPlayer = (p) => set((s) => ({ selPlayer: s.selPlayer === p.id ? null : p.id }))
  const logStat = (key) => {
    const s = stateRef.current
    if (!s.activeGameId) return
    if (!s.selPlayer) { set({ statsTab: s.roster.length ? 'live' : 'roster' }); return }
    const game = s.games.find((g) => g.id === s.activeGameId)
    if (!game || game.onCourt.indexOf(s.selPlayer) < 0) return
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, log: x.log.concat([{ p: s.selPlayer, k: key, ts: Date.now() }]) } : x)))
  }
  const undoStat = () => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, log: x.log.slice(0, -1) } : x)))
  }
  const toggleCourt = (p) => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => {
      if (x.id !== s.activeGameId) return x
      const onCourt = x.onCourt.indexOf(p.id) >= 0 ? x.onCourt.filter((y) => y !== p.id) : x.onCourt.concat([p.id])
      return { ...x, onCourt }
    }))
  }
  const askReset = () => set({ resetAsk: true })
  const closeReset = () => set({ resetAsk: false })
  const resetGame = () => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, log: [] } : x)))
    set({ resetAsk: false, selPlayer: null, statsTab: 'live' })
  }
  const resetRoster = () => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, log: [] } : x)))
    persistRoster(() => [])
    set({ resetAsk: false, selPlayer: null, editId: null, nameIn: '', numIn: '', statsTab: 'roster' })
  }

  // ── games ───────────────────────────────────────────────────
  const newGame = (type) => {
    const id = 'gm' + Date.now()
    const entry = { id, date: new Date().toISOString().slice(0, 10), type, opponent: '', time: '', home: '', location: '', log: [], onCourt: [] }
    persistGames((gs) => [entry].concat(gs).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    set({ activeGameId: id, statsTab: 'live', selPlayer: null })
  }
  const removeGame = (g) => {
    persistGames((gs) => gs.filter((x) => x.id !== g.id))
    if (stateRef.current.activeGameId === g.id) set({ activeGameId: null })
  }
  const openGame = (id) => set({ activeGameId: id, statsTab: 'live', selPlayer: null })
  const backToGames = () => set({ activeGameId: null, statsTab: 'games', selPlayer: null })
  const setGameDate = (v) => {
    if (!v) return
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, date: v } : x))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')))
  }
  const setGameOpponent = (v) => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, opponent: v } : x)))
  }
  const setGameTime = (v) => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, time: v } : x)))
  }
  const setGameHome = (v) => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, home: v } : x)))
  }
  const setGameLocation = (v) => {
    const s = stateRef.current
    persistGames((gs) => gs.map((x) => (x.id === s.activeGameId ? { ...x, location: v } : x)))
  }

  // ── attendance ──────────────────────────────────────────────
  const newSession = () => {
    const id = 'ses' + Date.now()
    const d = new Date()
    const entry = { id, date: d.toISOString().slice(0, 10), time: '', label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), marks: {}, coachMarks: {} }
    persistSessions((ss) => [entry].concat(ss).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    set({ openSession: id })
  }
  const removeSession = (s) => persistSessions((ss) => ss.filter((x) => x.id !== s.id))
  const openSession = (id) => set({ openSession: id })
  const backToSessions = () => set({ openSession: null })
  const setSessionDate = (v) => {
    if (!v) return
    const s = stateRef.current
    const d = new Date(v + 'T12:00:00')
    persistSessions((ss) => ss.map((x) => (x.id === s.openSession ? { ...x, date: v, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) } : x))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')))
  }
  const setSessionTime = (v) => {
    const s = stateRef.current
    persistSessions((ss) => ss.map((x) => (x.id === s.openSession ? { ...x, time: v } : x)))
  }
  const setSessionPlan = (planId) => {
    const s = stateRef.current
    persistSessions((ss) => ss.map((x) => (x.id === s.openSession ? { ...x, planId } : x)))
  }
  const markAttendance = (playerId, val) => {
    const s = stateRef.current
    persistSessions((ss) => ss.map((x) => {
      if (x.id !== s.openSession) return x
      const m = { ...x.marks }
      if (m[playerId] === val) delete m[playerId]
      else m[playerId] = val
      return { ...x, marks: m }
    }))
  }
  const markCoachAttendance = (coachId, val) => {
    const s = stateRef.current
    persistSessions((ss) => ss.map((x) => {
      if (x.id !== s.openSession) return x
      const m = { ...(x.coachMarks || {}) }
      if (m[coachId] === val) delete m[coachId]
      else m[coachId] = val
      return { ...x, coachMarks: m }
    }))
  }

  // ── schedule ────────────────────────────────────────────────
  const sortEvents = (es) => es.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
  const scheduleSession = (date, time) => {
    const id = 'ses' + Date.now()
    const d = new Date(date + 'T12:00:00')
    const entry = { id, date, time: time || '', label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), marks: {}, coachMarks: {} }
    persistSessions((ss) => [entry].concat(ss).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
  }
  const scheduleGame = (date, opponent, time, home, location) => {
    const id = 'gm' + Date.now()
    const entry = { id, date, type: 'game', opponent: opponent || '', time: time || '', home: home || '', location: location || '', log: [], onCourt: [] }
    persistGames((gs) => [entry].concat(gs).sort((a, b) => (b.date || '').localeCompare(a.date || '')))
  }
  // The add form doubles as training/game/event creation — which one it
  // writes to depends on evKind, except while editing (evEditId set),
  // which is always an event: trainings/games are edited on their own
  // screens, not from here.
  const addScheduleItem = () => {
    const s = stateRef.current
    const date = s.evDateIn || ''
    if (!date) return
    const time = s.evTimeIn || ''
    if (!s.evEditId && s.evKind === 'training') { scheduleSession(date, time); set({ evDateIn: '', evTimeIn: '' }); return }
    if (!s.evEditId && s.evKind === 'game') {
      scheduleGame(date, (s.evTitleIn || '').trim(), time, s.evHome, (s.evLocationIn || '').trim())
      set({ evTitleIn: '', evDateIn: '', evTimeIn: '', evHome: '', evLocationIn: '' })
      return
    }
    const title = (s.evTitleIn || '').trim()
    if (!title) return
    if (s.evEditId) persistEvents((es) => sortEvents(es.map((x) => (x.id === s.evEditId ? { ...x, title, date, time } : x))))
    else persistEvents((es) => sortEvents(es.concat([{ id: 'ev' + Date.now(), title, date, time }])))
    set({ evTitleIn: '', evDateIn: '', evTimeIn: '', evEditId: null })
  }
  // Imported .ics entries always become events — they carry no attendance
  // marks or stat log, so a real training/game is never the right shape.
  const importIcsEvents = (parsedItems) => {
    const stamp = Date.now()
    const entries = parsedItems.map((it, i) => ({ id: 'ev' + stamp + '_' + i, title: it.title, date: it.date, time: it.time || '' }))
    persistEvents((es) => sortEvents(es.concat(entries)))
  }
  const editEvent = (e) => set({ evEditId: e.id, evTitleIn: e.title, evDateIn: e.date, evTimeIn: e.time || '', evKind: 'event' })
  const cancelEditEvent = () => set({ evEditId: null, evTitleIn: '', evDateIn: '', evTimeIn: '' })
  const removeEvent = (e) => {
    persistEvents((es) => es.filter((x) => x.id !== e.id))
    if (stateRef.current.evEditId === e.id) set({ evEditId: null, evTitleIn: '', evDateIn: '', evTimeIn: '' })
  }

  // ── practice ────────────────────────────────────────────────
  const planDrills = (plan) => {
    if (!plan) return []
    const s = stateRef.current
    return (plan.items || []).map((id) => s.drills.find((d) => d.id === id)).filter(Boolean)
  }
  const newPlan = () => {
    const id = 'pn' + Date.now()
    const d = new Date()
    persistPlans((ps) => [{ id, name: 'Session ' + d.toLocaleDateString(), items: [] }].concat(ps))
    set({ openPlan: id, activePlan: id })
  }
  const setActivePlan = (id) => set({ activePlan: id, practiceTab: 'drills' })
  const openPlan = (id) => set({ openPlan: id, activePlan: id })
  const backToPlans = () => set({ openPlan: null })
  const removePlan = (id) => persistPlans((ps) => ps.filter((x) => x.id !== id))
  const setPlanName = (v) => {
    const s = stateRef.current
    persistPlans((ps) => ps.map((x) => (x.id === s.openPlan ? { ...x, name: v } : x)))
  }
  const movePlanItem = (planId, i, to) => persistPlans((ps) => ps.map((x) => {
    if (x.id !== planId) return x
    const items = (x.items || []).slice()
    if (to < 0 || to >= items.length) return x
    const tmp = items[i]; items[i] = items[to]; items[to] = tmp
    return { ...x, items }
  }))
  const removePlanItem = (planId, i) => persistPlans((ps) => ps.map((x) => (x.id === planId ? { ...x, items: (x.items || []).filter((_, j) => j !== i) } : x)))
  const addDrillToPlan = (planId, drillId) => {
    if (!planId) {
      const id = 'pn' + Date.now()
      persistPlans((ps) => [{ id, name: 'Session ' + new Date().toLocaleDateString(), items: [drillId] }].concat(ps))
      set({ activePlan: id })
      return
    }
    persistPlans((ps) => ps.map((x) => (x.id === planId ? { ...x, items: (x.items || []).concat([drillId]) } : x)))
  }
  const addDrill = () => {
    const s = stateRef.current
    const name = (s.dName || '').trim()
    if (!name) return
    const min = parseInt(s.dMin, 10) || 10
    const desc = (s.dDesc || '').trim()
    const playId = s.dPlayId || null
    if (s.dEdit) persistDrills((ds) => ds.map((x) => (x.id === s.dEdit ? { ...x, name, min, desc, playId } : x)))
    else persistDrills((ds) => ds.concat([{ id: 'dr' + Date.now(), name, min, desc, playId }]))
    set({ dName: '', dMin: '', dDesc: '', dPlayId: null, dEdit: null })
  }
  const editDrill = (d) => set({ dEdit: d.id, dName: d.name, dMin: String(d.min || ''), dDesc: d.desc || '', dPlayId: d.playId || null })
  const cancelDrill = () => set({ dEdit: null, dName: '', dMin: '', dDesc: '', dPlayId: null })
  const removeDrill = (d) => {
    persistDrills((ds) => ds.filter((x) => x.id !== d.id))
    persistPlans((ps) => ps.map((x) => ({ ...x, items: (x.items || []).filter((id) => id !== d.id) })))
  }
  const addExampleDrills = () => persistDrills((ds) => ds.concat([
    { id: 'dr' + Date.now(), name: 'Warm-up & mobility', min: 10 },
    { id: 'dr' + (Date.now() + 1), name: 'Two-ball handling', min: 10 },
    { id: 'dr' + (Date.now() + 2), name: 'Spot shooting', min: 15 },
    { id: 'dr' + (Date.now() + 3), name: '3 on 2 transition', min: 15 },
  ]))

  const startRun = (planId) => {
    const plan = stateRef.current.plans.find((p) => p.id === planId)
    const list = planDrills(plan)
    if (!list.length) return
    clearInterval(runTimerRef.current)
    set({ runPlanId: planId, runIdx: 0, runLeft: (list[0].min || 5) * 60, runPaused: false })
    runTimerRef.current = setInterval(() => {
      if (stateRef.current.runPaused) return
      set((s) => ({ runLeft: Math.max(0, s.runLeft - 1) }))
    }, 1000)
  }
  const stopRun = () => { clearInterval(runTimerRef.current); set({ runPlanId: null, runIdx: 0, runLeft: 0, runPaused: false }) }
  const gotoDrill = (i) => {
    const s = stateRef.current
    const plan = s.plans.find((p) => p.id === s.runPlanId)
    const list = planDrills(plan)
    if (i >= list.length) { stopRun(); return }
    set({ runIdx: i, runLeft: (list[i].min || 5) * 60, runPaused: false })
  }
  const toggleRunPause = () => set((s) => ({ runPaused: !s.runPaused }))
  const runPlanCmd = (id) => {
    const s = stateRef.current
    const p = s.plans.find((x) => x.id === id)
    if (!p || !(p.items || []).length) { set({ practiceTab: 'drills', activePlan: id }); return }
    startRun(id)
  }

  const api = useMemo(() => ({
    set, svgRef, contentRef,
    nSteps,
    onDown, onMove, onUp,
    togglePlay, setView, addStep, delStep, gotoStep,
    undo, clearRoutes, resetAll, setTool, toggleAutoDef, applyFormation,
    openSave, closeSave, openSheet, closeSheet, renamePlay, savePlay,
    openPlayFromHome, loadPlayFromSheet, removePlay, startNewPlay, goHome, toggleBoardMenu, toggleLoad,
    openFormations, closeFormations, openShare, closeShareModal, doExportPng, doExportVideo,
    enterTimeout, exitTimeout,
    openStats, closeStats, openAttend, closeAttend, openPractice, closePractice, openTeams, closeTeams, openInfo, closeInfo,
    openSchedule, closeSchedule, goToSession, goToGame, openBackup, closeBackup,
    switchTeam, selectTeam, backToTeamsList, newTeam, renameTeam, askRemoveTeam, closeRemoveTeam, confirmRemoveTeam,
    persistRoster, persistCoaches, persistDrills, persistPlans, persistSessions, persistGames, persistPlays, persistEvents,
    addPlayer, editPlayer, cancelEditPlayer, removePlayer, selectStatPlayer, logStat, undoStat, toggleCourt,
    addCoach, editCoach, cancelEditCoach, removeCoach,
    addScheduleItem, editEvent, cancelEditEvent, removeEvent, importIcsEvents,
    askReset, closeReset, resetGame, resetRoster,
    newGame, removeGame, openGame, backToGames, setGameDate, setGameOpponent, setGameTime, setGameHome, setGameLocation,
    newSession, removeSession, openSession, backToSessions, setSessionDate, setSessionTime, setSessionPlan, markAttendance, markCoachAttendance,
    planDrills, newPlan, setActivePlan, openPlan, backToPlans, removePlan, setPlanName,
    movePlanItem, removePlanItem, addDrillToPlan, addDrill, editDrill, cancelDrill, removeDrill, addExampleDrills,
    startRun, stopRun, gotoDrill, toggleRunPause, runPlanCmd,
    fileBase,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const value = useMemo(() => ({ state, ...api }), [state, api])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
