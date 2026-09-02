// A coach draws two different things on the board: set plays to run in a
// game, and drills to run in practice. They're stored in the same library,
// told apart by this field. Entries saved before the distinction existed
// have no `kind` at all, so anything that isn't explicitly a drill counts
// as a play.
export function kindOf(p) {
  return p && p.kind === 'drill' ? 'drill' : 'play'
}

export const KIND_LABEL = { play: 'Play', drill: 'Drill' }
