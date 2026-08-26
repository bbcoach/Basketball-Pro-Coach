// A tiny built-in library of classic, universally-taught sets — a starting
// point for a new team's playbook. Adding one copies it into "My plays"
// under a fresh id, so it's immediately yours to rename and rework; these
// entries themselves are never edited or removed by the app.
export const STARTER_PLAYS = [
  {
    id: 'sp-pnr', name: 'High ball screen', desc: 'On-ball screen for the point guard, who drives off it toward the paint.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1050, acts: [{ type: 'dribble', step: 2, pts: [{ x: 560, y: 820 }, { x: 480, y: 600 }, { x: 560, y: 420 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 170, y: 950, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1330, y: 950, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 280, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 950, y: 620, acts: [{ type: 'screen', step: 1, pts: [{ x: 760, y: 880 }] }] },
    ],
    ball: { x: 800, y: 1100, acts: [] },
  },
  {
    id: 'sp-giveandgo', name: 'Give and go', desc: 'Pass to the wing, then cut hard to the rim looking for the return pass.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1050, acts: [{ type: 'cut', step: 2, pts: [{ x: 450, y: 700 }, { x: 600, y: 420 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 250, y: 850, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1250, y: 850, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 950, y: 400, acts: [] },
    ],
    ball: { x: 800, y: 1100, acts: [{ type: 'pass', step: 1, pts: [{ x: 250, y: 850 }] }] },
  },
  {
    id: 'sp-horns-backdoor', name: 'Horns backdoor', desc: 'Entry pass to the elbow; the corner reads a tight closeout and cuts backdoor.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1180, acts: [] },
      { id: 'o2', team: 'off', label: '2', x: 110, y: 760, acts: [{ type: 'cut', step: 2, pts: [{ x: 300, y: 500 }, { x: 560, y: 250 }] }] },
      { id: 'o3', team: 'off', label: '3', x: 1390, y: 760, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 520, y: 560, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 980, y: 560, acts: [] },
    ],
    ball: { x: 800, y: 1230, acts: [{ type: 'pass', step: 1, pts: [{ x: 520, y: 560 }] }] },
  },
  // 5-out motion: all five offensive players start beyond the arc (no post
  // player) and read off ball movement — these four cover its core reads.
  {
    id: 'sp-5out-drivekick', name: '5-out: drive and kick', desc: 'Drive downhill from the top to draw help, then kick out to the open corner.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1220, acts: [{ type: 'dribble', step: 1, pts: [{ x: 680, y: 850 }, { x: 620, y: 600 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 130, y: 900, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1370, y: 900, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 1200, y: 350, acts: [] },
    ],
    ball: { x: 800, y: 1270, acts: [{ type: 'pass', step: 2, pts: [{ x: 300, y: 350 }] }] },
  },
  {
    id: 'sp-5out-drivefill', name: '5-out: drive and fill', desc: 'Drive the middle; the weak-side corner relocates up top to keep the spacing even.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1220, acts: [{ type: 'dribble', step: 1, pts: [{ x: 700, y: 900 }, { x: 650, y: 650 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 130, y: 900, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1370, y: 900, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [{ type: 'cut', step: 2, pts: [{ x: 500, y: 700 }, { x: 750, y: 1100 }] }] },
      { id: 'o5', team: 'off', label: '5', x: 1200, y: 350, acts: [] },
    ],
    ball: { x: 800, y: 1270, acts: [] },
  },
  {
    id: 'sp-5out-screenaway', name: '5-out: screen away', desc: 'The weak corner screens away for the wing, who cuts hard to the rim.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1220, acts: [] },
      { id: 'o2', team: 'off', label: '2', x: 130, y: 900, acts: [] },
      { id: 'o3', team: 'off', label: '3', x: 1370, y: 900, acts: [{ type: 'cut', step: 2, pts: [{ x: 1180, y: 650 }, { x: 820, y: 300 }] }] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 1200, y: 350, acts: [{ type: 'screen', step: 1, pts: [{ x: 1150, y: 620 }] }] },
    ],
    ball: { x: 800, y: 1270, acts: [] },
  },
  {
    id: 'sp-5out-dho', name: '5-out: dribble hand-off', desc: 'The point dribbles at the wing, hands off, and the wing drives to the rim.',
    view: 'half', steps: 2,
    players: [
      { id: 'o1', team: 'off', label: '1', x: 750, y: 1220, acts: [{ type: 'dribble', step: 1, pts: [{ x: 450, y: 1000 }, { x: 280, y: 880 }] }] },
      { id: 'o2', team: 'off', label: '2', x: 130, y: 900, acts: [{ type: 'cut', step: 2, pts: [{ x: 350, y: 700 }, { x: 550, y: 400 }] }] },
      { id: 'o3', team: 'off', label: '3', x: 1370, y: 900, acts: [] },
      { id: 'o4', team: 'off', label: '4', x: 300, y: 350, acts: [] },
      { id: 'o5', team: 'off', label: '5', x: 1200, y: 350, acts: [] },
    ],
    ball: { x: 800, y: 1270, acts: [] },
  },
]
