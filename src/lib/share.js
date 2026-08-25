// Coach-to-coach sharing of a single play or drill — no accounts, no server:
// the whole thing is serialized into one opaque text code a coach can paste
// into any messenger or save as a file, and another coach pastes back in to
// import. Base64 (not raw JSON) on purpose: several chat apps auto-convert
// straight quotes to smart quotes on paste, which would silently corrupt a
// raw JSON string — base64's alphabet has no character autocorrect touches.
const TAG = 'BPC1'

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)))
}
function b64DecodeUtf8(str) {
  return decodeURIComponent(escape(atob(str)))
}

export function encodePlayShare(play) {
  const payload = { name: play.name, view: play.view, steps: play.steps, players: play.players, ball: play.ball }
  return `${TAG}:play:${b64EncodeUtf8(JSON.stringify(payload))}`
}

export function encodeDrillShare(drill, plays) {
  const linked = drill.playId && plays.find((p) => p.id === drill.playId)
  const payload = {
    name: drill.name, min: drill.min, desc: drill.desc, category: drill.category,
    play: linked ? { name: linked.name, view: linked.view, steps: linked.steps, players: linked.players, ball: linked.ball } : null,
  }
  return `${TAG}:drill:${b64EncodeUtf8(JSON.stringify(payload))}`
}

export function decodeShare(code) {
  const m = /^BPC1:(play|drill):([A-Za-z0-9+/=]+)$/.exec((code || '').trim())
  if (!m) throw new Error('This does not look like a Basketball Pro Coach share code.')
  let payload
  try {
    payload = JSON.parse(b64DecodeUtf8(m[2]))
  } catch {
    throw new Error('This code is corrupted or incomplete.')
  }
  const kind = m[1]
  if (kind === 'play' && !Array.isArray(payload.players)) throw new Error('Invalid play data.')
  if (kind === 'drill' && !payload.name) throw new Error('Invalid drill data.')
  return { kind, payload }
}
