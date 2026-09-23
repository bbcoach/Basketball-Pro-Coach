// The entire cloud-sync backend. On purpose, it knows nothing about
// basketball, teams, players, or the app's own data shapes — it stores and
// returns opaque bytes under a key, nothing else. The app encrypts on one
// device and decrypts on another; this Worker only ever sees ciphertext, so
// there's nothing here worth reading even if the key namespace leaked.
//
// The key IS the secret. There are no accounts, no passwords, no user
// database — knowing the sync key is both necessary and sufficient to read
// or overwrite that key's blob, the same trust model as a strong password
// shared between a coach's own devices. That's why MIN_KEY_LEN exists: it's
// the one thing standing between this and a key being guessable at all.
//
// The /schedule/<source>/<id> route below is a separate, unrelated feature
// bolted onto the same Worker purely to reuse its deploy pipeline: it fetches
// a public league-schedule page server-side (sidestepping the browser's own
// CORS block) and hands back parsed JSON. It touches no KV storage and knows
// nothing about sync keys.
import { SOURCES } from './schedules/index.js'

const MIN_KEY_LEN = 24
const MAX_KEY_LEN = 128
// A season's worth of games, plays and a full roster with photos comfortably
// fits in a few hundred KB even before compression; this is headroom, not a
// target, and it exists so a stray bug on the client can't turn one team
// into a multi-megabyte KV write.
const MAX_BODY_BYTES = 2 * 1024 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // A day is plenty for a browser's own preflight cache and keeps repeat
  // syncs from paying the OPTIONS round trip every time.
  'Access-Control-Max-Age': '86400',
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function validKey(key) {
  return typeof key === 'string' && key.length >= MIN_KEY_LEN && key.length <= MAX_KEY_LEN && /^[A-Za-z0-9_-]+$/.test(key)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

    const url = new URL(request.url)

    if (url.pathname.startsWith('/schedule/')) return handleSchedule(url, request)

    // Path is just "/<key>" — nothing here needed a router.
    const key = decodeURIComponent(url.pathname.replace(/^\//, ''))

    if (url.pathname === '/' || !key) return json(200, { ok: true, service: 'basketball-pro-coach-sync' })
    if (!validKey(key)) return json(400, { error: 'bad key' })

    if (request.method === 'GET') {
      const value = await env.SYNC_KV.get(key, 'arrayBuffer')
      if (value === null) return json(404, { error: 'not found' })
      return new Response(value, { headers: { 'Content-Type': 'application/octet-stream', ...CORS_HEADERS } })
    }

    if (request.method === 'PUT') {
      const len = Number(request.headers.get('Content-Length') || 0)
      if (len > MAX_BODY_BYTES) return json(413, { error: 'too large' })
      const body = await request.arrayBuffer()
      if (body.byteLength === 0) return json(400, { error: 'empty body' })
      if (body.byteLength > MAX_BODY_BYTES) return json(413, { error: 'too large' })
      await env.SYNC_KV.put(key, body)
      return json(200, { ok: true, bytes: body.byteLength })
    }

    // Lets a coach make a key's data unreachable on request — the nearest
    // thing to "delete my data" this service can offer, since it never
    // collected anything else (no email, no account) to delete in the
    // first place.
    if (request.method === 'DELETE') {
      await env.SYNC_KV.delete(key)
      return json(200, { ok: true })
    }

    return json(405, { error: 'method not allowed' })
  },
}

// GET /schedule/<source>/<id> -> { source, id, leagueName, teams, games }.
// `id` is everything after the source segment, slashes and all — Germany's
// is a bare liga_id, but France's identifies a team by a whole
// region/comité/club/équipe path, which needs those slashes intact rather
// than being cut off at the first one.
// Each adapter's own validId() gate matters here specifically: `id` ends up
// inside a URL this Worker fetches server-side, so it's the one input on
// this route that isn't just echoed back — it has to be checked before it's
// anywhere near a fetch() call.
async function handleSchedule(url) {
  const rest = url.pathname.slice('/schedule/'.length)
  const slash = rest.indexOf('/')
  const source = slash === -1 ? rest : rest.slice(0, slash)
  const id = slash === -1 ? '' : rest.slice(slash + 1)
  const adapter = SOURCES[source]
  if (!adapter) return json(404, { error: 'unknown source', sources: Object.keys(SOURCES) })
  if (!adapter.validId(id)) return json(400, { error: 'bad id for this source' })

  let res
  try {
    res = await fetch(adapter.buildUrl(id), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BasketballProCoachSync/1.0)' },
      // The schedule for a given league barely changes minute to minute —
      // caching at Cloudflare's edge means a coach re-opening the import
      // screen a few times doesn't turn into repeat load on someone else's
      // server.
      cf: { cacheTtl: 1800, cacheEverything: true },
    })
  } catch {
    return json(502, { error: 'could not reach the source site' })
  }
  if (!res.ok) return json(502, { error: 'source site returned ' + res.status })

  let parsed
  try {
    // Response.text() always decodes as UTF-8 regardless of what the
    // server's own Content-Type charset says — fine for the sources that
    // actually are UTF-8, but it would silently mangle Denmark's æ/ø/å,
    // whose pages declare windows-1252. Adapters that need something other
    // than UTF-8 say so via their own `encoding` export.
    const buf = await res.arrayBuffer()
    const text = new TextDecoder(adapter.encoding || 'utf-8').decode(buf)
    parsed = adapter.parse(text)
  } catch {
    return json(502, { error: "could not read that source's schedule — its page layout may have changed" })
  }
  return json(200, { source, id, ...parsed })
}
