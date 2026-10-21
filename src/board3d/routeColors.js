// Colours of the paths in the 3D view, one per kind of action. Kept to the
// brand's own two hues and its neutrals, so the board stays calm: the brand
// gold and its complement, a strong blue, each in two tones, plus white and
// silver. Gold side — the pass (the brand gold itself) and the dribble (a
// deeper orange, like the ball). Blue side — the cut (a strong blue) and the
// handoff (the same blue, light). White for the screen, silver for the shot.
// Saturated rather than pastel, since they have to stand out on light wood
// and on the grey key alike; the line shapes (wavy, dashed, dotted, a bar
// across a screen) tell the kinds apart as well.
export const ROUTE_COLORS = {
  pass: 0xe8b13c,
  dribble: 0xef6a22,
  cut: 0x3f7cf4,
  handoff: 0x7cc4ff,
  screen: 0xf4f4f4,
  shot: 0xb9bcc6,
}
export const ROUTE_ORDER = ['pass', 'dribble', 'cut', 'handoff', 'screen', 'shot']
export const ROUTE_LABELS = { cut: 'Cut', dribble: 'Dribble', pass: 'Pass', handoff: 'Handoff', screen: 'Screen', shot: 'Shot' }
export const routeCss = (type) => '#' + (ROUTE_COLORS[type] ?? 0xffffff).toString(16).padStart(6, '0')
