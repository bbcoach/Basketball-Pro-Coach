export const ACCENT = '#e8b13c'

// ── second accent ───────────────────────────────────────────────────────
// Gold was carrying six different jobs: the brand, "press this", "this is
// switched on", "this is us on the court", the numbers, and the toast tick.
// Two of those sit side by side constantly — a gold primary button next to
// a gold selected pill — so the colour stopped telling you which was which.
// This one takes only "switched on": selected tools, active filters, the
// team you're in, the row you're editing. Gold keeps the rest.
//
// It's a ring, not a fill. A solid turquoise tile reads as its own hot
// patch of colour next to the app's dark, low-saturation surfaces — eleven
// of them lit up across the board's tool strip was the complaint. A border
// on the same dark tile the rest of the row already uses says "chosen"
// without turning into one. Every selected state below follows that: a
// pale wash a shade lighter than its own unselected state, a turquoise
// ring, white ink throughout — nothing sits on a turquoise field, so
// there's no dark ink to keep readable on it.
export const ACCENT2 = '#2fc4b2'
export const COND = "'Barlow Condensed', sans-serif"
export const SANS = 'Barlow, system-ui, sans-serif'

export const card = {
  bg: 'rgba(255,255,255,.06)',
  border: 'rgba(255,255,255,.1)',
}

// ── depth ───────────────────────────────────────────────────────────────
//
// The board already had a light model — token shadows, a sheen whose centre
// is derived from the shadow vector, a court frame lit along its top edge —
// and it stopped at the court's boundary. Everything else was one flat
// translucent wash on dark: 191 hardcoded fills, box-shadow used in eight
// places and all of them modals. So the app read as a sheet with one lit
// patch in the middle.
//
// These carry that same model outward: one light, from above, so a card, a
// number chip and a player token all agree about where it comes from.
//
// Every value lives here rather than at the call sites, which is the point
// as much as the look is. Tuning the whole app's depth is now editing this
// block, not hunting 191 literals — and "a bit less" is a request that
// used to mean a refactor.
const HI = 'rgba(255,255,255,.12)' // the lit top edge
const GRAD = 'rgba(255,255,255,.065)' // fades down the face
const DROP = '0 2px 7px rgba(0,0,0,.55)'

// A surface that stands above the page: cards, list rows, buttons.
// `a` keeps each call site's own fill, since the app deliberately uses a
// range of them for hierarchy — depth is added on top, it doesn't flatten
// that back out.
export function raised(a = 0.06, borderA = 0.1) {
  return {
    background: `rgba(255,255,255,${a})`,
    backgroundImage: `linear-gradient(${GRAD}, rgba(255,255,255,0))`,
    border: `1px solid rgba(255,255,255,${borderA})`,
    boxShadow: `inset 0 1px 0 ${HI}, ${DROP}`,
  }
}

// Same, for the many places that carry no border of their own.
export function raisedBare(a = 0.06) {
  return {
    background: `rgba(255,255,255,${a})`,
    backgroundImage: `linear-gradient(${GRAD}, rgba(255,255,255,0))`,
    boxShadow: `inset 0 1px 0 ${HI}, ${DROP}`,
  }
}

// The other half of a depth system: not everything sticks out. Text fields
// and the tab track are things you fill or things that hold something, so
// they sink instead — which is what makes the raised things read as raised.
export function sunken(a = 0.06) {
  return {
    background: `rgba(255,255,255,${a})`,
    boxShadow: 'inset 0 2px 5px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.05)',
  }
}

// The one definition of a form field. The fill and shadow were the easy
// part; the reason this exists is the box model. Every input in the app was
// styled at its own call site, so the vertical padding had drifted four ways
// — 8, 9 and 10px, plus two narrow variants — and My Schedule happened to
// hold the tallest of them. Nobody could see that while the fields were a
// flat wash; a recessed well has visible walls, and then a 42pt-tall empty
// box next to a 36pt button reads as a mistake, because it is one.
//
// A shallower inset than `sunken` on purpose: a tab track is wide enough to
// carry a 5px shadow, a one-line field is not — there, the same shadow eats
// the top of the text.
export function field() {
  return {
    padding: '8px 11px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.06)',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,.38), inset 0 -1px 0 rgba(255,255,255,.05)',
    color: '#fff',
    fontSize: 13,
    outline: 'none',
  }
}

// An action button that shares a row with fields. The row stretches its
// children to the tallest one — which is what makes the button line up with
// the fields — so the button has to centre its own label, or the label stays
// where the padding put it and the extra height all lands underneath.
export const centred = { display: 'flex', alignItems: 'center', justifyContent: 'center' }

// Number chips and initials, borrowing the board's token treatment so the
// two halves of the app speak the same language. The sheen sits up and to
// the left of centre, the same side the court's light comes from.
export function chipSurface(a = 0.1) {
  return {
    background: `rgba(255,255,255,${a})`,
    backgroundImage: 'radial-gradient(at 34% 28%, rgba(255,255,255,.26), rgba(0,0,0,.22))',
    boxShadow: `inset 0 1px 0 ${HI}, 0 2px 5px rgba(0,0,0,.55)`,
  }
}

// Primary actions as physical keys: lighter at the top, darker at the
// bottom, with a dark bottom edge doing the work a moulded keycap's would.
export function keycap(bg = ACCENT) {
  return {
    background: bg,
    backgroundImage: 'linear-gradient(rgba(255,255,255,.26), rgba(0,0,0,.16))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.34), 0 2px 7px rgba(0,0,0,.55)',
  }
}
