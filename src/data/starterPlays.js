// A tiny built-in library of classic, universally-taught sets — a starting
// point for a new team's playbook. Adding one copies it into "My plays"
// under a fresh id, so it's immediately yours to rename and rework; these
// entries themselves are never edited or removed by the app.
export const STARTER_PLAYS = [
  {
    id: 'sp-pnr', name: 'High ball screen', desc: 'On-ball screen for the point guard, who drives off it toward the paint.',
    view: 'half', steps: 1,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1050, acts: [{ type: 'dribble', step: 1, pts: [{ x: 560, y: 820 }, { x: 480, y: 600 }, { x: 560, y: 420 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 170, y: 950, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1330, y: 950, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 280, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 950, y: 620, acts: [{ type: 'screen', step: 1, pts: [{ x: 760, y: 880 }] }] },
    ],
    ball: { x: 800, y: 1100, acts: [] },
  },
  {
    id: 'sp-giveandgo', name: 'Give and go', desc: 'Pass to the wing, then cut hard to the rim looking for the return pass.',
    view: 'half', steps: 1,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1050, acts: [{ type: 'cut', step: 1, pts: [{ x: 450, y: 700 }, { x: 600, y: 420 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 250, y: 850, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1250, y: 850, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 950, y: 400, acts: [] },
    ],
    ball: { x: 800, y: 1100, acts: [{ type: 'pass', step: 1, pts: [{ x: 250, y: 850 }] }] },
  },
  {
    id: 'sp-horns-backdoor', name: 'Horns backdoor', desc: 'Entry pass to the elbow; the corner reads a tight closeout and cuts backdoor.',
    view: 'half', steps: 1,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1180, acts: [] },
      { id: 'o2', team: 'off', label: '2', x: 110, y: 760, acts: [{ type: 'cut', step: 1, pts: [{ x: 300, y: 500 }, { x: 560, y: 250 }] }] },
      { id: 'o3', team: 'off', label: '3', x: 1390, y: 760, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 520, y: 560, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 980, y: 560, acts: [] },
    ],
    ball: { x: 800, y: 1230, acts: [{ type: 'pass', step: 1, pts: [{ x: 520, y: 560 }] }] },
  },
]
