// Cloud sync, opt-in and end-to-end encrypted: one Worker + KV pair that
// stores nothing its operator (or Cloudflare, or anyone reading its logs)
// can turn back into a team. A single random "sync key" — generated once on
// a device, then shared with a coach's other devices the same way a strong
// password would be — does two independent jobs via HKDF:
//
//   "lookup" half -> which KV entry to touch. This travels in the URL, so
//   the Worker (and its access logs) does see it.
//   "encrypt" half -> the AES-GCM key. Never leaves this file, never
//   crosses the network in any form.
//
// The two are derived with different HKDF labels specifically so that
// seeing one (the lookup key, in a URL) doesn't hand you the other — that's
// what "domain separation" buys here. The Worker ends up storing a location
// for fifty-odd KB of noise; only a device holding the sync key can turn
// that noise back into a roster.
//
// Not wired into the UI yet — this is the primitive the actual "Sync now"
// button will call once the sync model (manual vs automatic, last-write-
// wins vs merge) is decided.

// Filled in once the Worker is deployed and its workers.dev address known.
const WORKER_URL = 'REPLACE_WITH_WORKER_URL'

const ENC = new TextEncoder()
const DEC = new TextDecoder()
const SALT = ENC.encode('basketball-pro-coach-sync')

function bytesToBase64Url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// One random key, generated client-side, shown to the coach once (as text
// or a QR code) to carry over to their other devices — never sent anywhere
// as-is; everything below only ever derives from it.
export function generateSyncKey() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(20)))
}

async function hkdf(masterKey, label, lengthBytes) {
  const baseKey = await crypto.subtle.importKey('raw', ENC.encode(masterKey), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: ENC.encode(label) },
    baseKey,
    lengthBytes * 8,
  )
  return new Uint8Array(bits)
}

// 24 raw bytes -> 32 base64url characters: comfortably inside the Worker's
// 24–128 accepted key length, and matches its [A-Za-z0-9_-]+ check exactly.
async function lookupKeyFor(masterKey) {
  return bytesToBase64Url(await hkdf(masterKey, 'lookup', 24))
}

async function aesKeyFor(masterKey) {
  return crypto.subtle.importKey('raw', await hkdf(masterKey, 'encrypt', 32), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// Output is IV || ciphertext as one buffer — the IV isn't secret, it just
// has to never repeat under the same key, so it travels alongside rather
// than needing its own channel.
export async function encryptForCloud(masterKey, data) {
  const key = await aesKeyFor(masterKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(JSON.stringify(data)))
  const out = new Uint8Array(iv.length + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), iv.length)
  return out
}

export async function decryptFromCloud(masterKey, bytes) {
  const key = await aesKeyFor(masterKey)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
  return JSON.parse(DEC.decode(plaintext))
}

export async function pushToCloud(masterKey, data) {
  const res = await fetch(`${WORKER_URL}/${await lookupKeyFor(masterKey)}`, {
    method: 'PUT',
    body: await encryptForCloud(masterKey, data),
  })
  if (!res.ok) throw new Error('Sync upload failed (' + res.status + ')')
}

// null means "nothing synced yet for this key" (a fresh key, or a first
// device that hasn't pushed) rather than an error — callers shouldn't have
// to tell those apart from a thrown exception.
export async function pullFromCloud(masterKey) {
  const res = await fetch(`${WORKER_URL}/${await lookupKeyFor(masterKey)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Sync download failed (' + res.status + ')')
  return decryptFromCloud(masterKey, new Uint8Array(await res.arrayBuffer()))
}

export async function deleteFromCloud(masterKey) {
  await fetch(`${WORKER_URL}/${await lookupKeyFor(masterKey)}`, { method: 'DELETE' })
}
