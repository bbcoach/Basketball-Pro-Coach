// Moving data to another device without a server: two phones (or a phone and
// a tablet) sitting in the same room agree directly with each other over
// WebRTC, and the coach's data — roster, plays, games, everything — goes
// straight from one device to the other over that connection. Nothing is
// ever written to a server anywhere; there is no server in this feature at
// all, not even a free one, unlike a normal WebRTC app that leans on one to
// introduce the two sides to each other.
//
// That introduction step (the "signaling") is the part every WebRTC how-to
// assumes a server does for you. Doing it without one means the two
// browsers have to hand a small text blob to each other by some other
// means — here, one device shows it as a QR code and the other scans it,
// twice (once each direction: an "offer" from the side sending data, an
// "answer" back from the side receiving it).
//
// The one thing that makes that practical is skipping ICE servers (STUN)
// entirely: with none configured, a browser only gathers its own
// local-network address as a candidate instead of also asking a STUN
// server to find its public one. Fewer candidates means a much smaller
// blob — small enough to fit one clean, reliably-scannable QR code instead
// of needing several. The trade-off is honest and narrow: this only works
// when both devices can already reach each other directly, i.e. the same
// Wi-Fi or one hotspotting to the other — exactly the "phone and tablet,
// same gym" case this exists for, not two devices on different networks.
const RTC_CONFIG = { iceServers: [] }

// Vanilla (non-trickle) ICE: wait for gathering to finish so every
// candidate the browser is going to find is already folded into
// `pc.localDescription` by the time it's read, instead of arriving one at a
// time over a channel that doesn't exist here. On a LAN this normally
// settles in well under a second — the timeout is a ceiling for a device
// with no usable network interface at all, not the expected path.
const GATHER_TIMEOUT_MS = 4000

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve() }
    const check = () => { if (pc.iceGatheringState === 'complete') done() }
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(done, GATHER_TIMEOUT_MS)
  })
}

// The side sending data starts the handshake: create the connection, open a
// data channel on it (the receiving side never calls createDataChannel
// itself — it just receives this one via `ondatachannel`), and produce the
// offer to show as a QR code.
export async function startSend() {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = pc.createDataChannel('sync')
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)
  return { pc, channel, offerText: JSON.stringify(pc.localDescription.toJSON()) }
}

// The receiving side scans that QR code and answers it.
export async function respondToOffer(offerText) {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channelPromise = new Promise((resolve) => { pc.ondatachannel = (e) => resolve(e.channel) })
  await pc.setRemoteDescription(JSON.parse(offerText))
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await waitForIceGathering(pc)
  return { pc, channelPromise, answerText: JSON.stringify(pc.localDescription.toJSON()) }
}

// The sender scans the answer QR back and the connection completes — from
// here on the two devices talk directly, no more QR codes.
export function finishSend(pc, answerText) {
  return pc.setRemoteDescription(JSON.parse(answerText))
}

// `channel.onopen` is a one-shot property handler, not an event bus — if the
// channel has already flipped to 'open' by the time a caller gets around to
// setting it (entirely possible once the handshake is already this far
// along), the assignment is silently too late and nothing ever calls back.
// Checking the current state first closes that race.
export function waitForOpen(channel) {
  if (channel.readyState === 'open') return Promise.resolve()
  return new Promise((resolve) => { channel.onopen = resolve })
}

// Chunked so a large multi-season backup can't run into a data channel
// message-size ceiling some browser enforces — everything here targets a
// same-room Wi-Fi link, so latency is a non-issue and there's no reason to
// push chunks any bigger than this.
const CHUNK_SIZE = 12000
// A born-empty buffer needs no backpressure; only wait once there's real
// backlog, so small backups (almost every one) send in one uninterrupted
// burst instead of pointlessly yielding after every chunk.
const BUFFERED_AMOUNT_HIGH = 262144
const BUFFERED_AMOUNT_LOW = 131072

function waitForBufferedAmountLow(channel) {
  if (channel.bufferedAmount < BUFFERED_AMOUNT_HIGH) return Promise.resolve()
  return new Promise((resolve) => {
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW
    channel.addEventListener('bufferedamountlow', function handler() {
      channel.removeEventListener('bufferedamountlow', handler)
      resolve()
    })
  })
}

// The channel only carries strings, so the first message is a small header
// announcing how many chunks follow — the receiver needs that to know when
// it has everything, since nothing here signals "end of message" on its own.
export async function sendPayload(channel, text) {
  const total = Math.max(1, Math.ceil(text.length / CHUNK_SIZE))
  channel.send(JSON.stringify({ n: total }))
  for (let i = 0; i < total; i++) {
    await waitForBufferedAmountLow(channel)
    channel.send(text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
  }
}

// Calls `onDone(text)` once every announced chunk has arrived.
export function receivePayload(channel, onDone) {
  let expected = null
  let chunks = []
  channel.onmessage = (e) => {
    if (expected === null) {
      expected = JSON.parse(e.data).n
      chunks = []
      return
    }
    chunks.push(e.data)
    if (chunks.length >= expected) onDone(chunks.join(''))
  }
}
