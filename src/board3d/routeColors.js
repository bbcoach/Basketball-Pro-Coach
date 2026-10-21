// Colours of the paths in the 3D view, one per kind of action. Built round
// the brand: the gold stays the brand's own (the pass — the ball's way), its
// complement, a strong blue, is the cut, and the other hues sit between at
// the same saturation and weight so they read as one set rather than a
// rainbow: a warm red for the dribble, violet for the handoff, green for the
// screen, white for the shot. Saturated rather than pastel, since they have
// to stand out on light wood and on the grey key alike.
export const ROUTE_COLORS = {
  cut: 0x3f7cf4,
  dribble: 0xf2503a,
  pass: 0xe8b13c,
  handoff: 0xb05df0,
  screen: 0x22c070,
  shot: 0xf4f4f4,
}
export const ROUTE_ORDER = ['cut', 'dribble', 'pass', 'handoff', 'screen', 'shot']
export const ROUTE_LABELS = { cut: 'Cut', dribble: 'Dribble', pass: 'Pass', handoff: 'Handoff', screen: 'Screen', shot: 'Shot' }
export const routeCss = (type) => '#' + (ROUTE_COLORS[type] ?? 0xffffff).toString(16).padStart(6, '0')
