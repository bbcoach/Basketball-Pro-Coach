// Turns the backup text into a short sequence of QR codes one device shows
// and the other just scans — no pairing dance, no network of any kind
// between the two devices at all. Simpler than the WebRTC approach this
// replaced (which needed both sides to scan a code from the other, and only
// worked when the two devices could reach each other over Wi-Fi) at the
// cost of the receiving device needing a moment with its camera held up,
// for anything past a fresh, empty team.
//
// gzip first because a season's worth of games and plays is mostly the same
// few field names and small numbers repeated hundreds of times — exactly
// what compression is good at. Measured on a realistic 22-game, 15-play
// season: 79KB of JSON down to about 12KB, roughly 20 QR frames instead of
// well over 100.
async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function bytesToBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// Frames are a plain "i/n/chunk" string rather than JSON — every byte spent
// on punctuation is a byte the QR code doesn't have for actual data, and at
// this size that's the difference between one frame and two.
const CHUNK_CHARS = 800

export async function encodeFrames(text) {
  const b64 = bytesToBase64(await gzip(text))
  const n = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS))
  const frames = []
  for (let i = 0; i < n; i++) frames.push(i + '/' + n + '/' + b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS))
  return frames
}

// Feed it every frame decoded off the camera, in whatever order and with
// whatever repeats a real scan produces (the sender just loops its frames
// on a timer — it has no idea what's already been seen). Returns the
// reassembled text once every index 0..n-1 has turned up, null otherwise.
export function collectFrame(collected, frameText) {
  const m = /^(\d+)\/(\d+)\/([\s\S]*)$/.exec(frameText)
  if (!m) return null
  const i = Number(m[1])
  const n = Number(m[2])
  // A previous, unrelated transfer's leftover frame count wouldn't just
  // silently merge into this one and produce a corrupt result.
  if (collected.n != null && collected.n !== n) collected.chunks.clear()
  collected.n = n
  collected.chunks.set(i, m[3])
  if (collected.chunks.size < n) return null
  let combined = ''
  for (let i2 = 0; i2 < n; i2++) combined += collected.chunks.get(i2)
  return combined
}

export async function decodeFrames(base64Text) {
  return gunzip(base64ToBytes(base64Text))
}
