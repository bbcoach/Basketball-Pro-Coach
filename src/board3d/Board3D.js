import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { makeBoard, stepAtTime, actsOf, baseAt, isCone, isBall, STEP_SECS } from '../lib/board-geometry'
import { COND } from '../theme'

// The 3D view of the tactics board: the same play, seen from the court.
// View only — editing stays in the 2D top view. It reads the board the way
// the 2D court does (makeBoard: paths, carriers, marks), plays the motion
// out once into a baked timeline, and then only has to draw frames of it.
//
//   const view = await createBoard3D(containerElement)
//   view.setBoard(state)          // players, ball, steps … (re-bakes)
//   view.setCourtView('half' | 'full')
//   view.setPaths(true | false)   // the step's routes drawn on the floor
//   view.setCamera('court' | 'pov', playerId)
//   view.render(t)                // t in 0…1 along the play; drawn soon
//   view.dispose()
export async function createBoard3D(container) {
// The app's display face (Barlow Condensed, bold italic) has to be loaded
// before any text is painted into a texture, or the canvas falls back.
try { await document.fonts.load(`italic 800 64px ${COND}`) } catch { /* the texture just falls back to a system face */ }

// What the view is showing right now: set by setBoard().
let play = { ball: { acts: [] }, players: [] }
let courtView = 'half' // 'half' | 'full', as on the 2D board
let board = null
let N = 1
let MARKS = {}
let CARRIERS = {}

// Court units are centimetres: 1500 × 2800 = 15 m × 28 m.
const toX = (x) => (x - 750) / 100
const toZ = (y) => y / 100
const HOOP = new THREE.Vector3(0, 3.05, 1.575)
const HOOP2 = new THREE.Vector3(0, 3.05, 28 - 1.575)
// the basket a player at depth z is playing towards
const hoopAt = (z) => (z < 14 ? HOOP : HOOP2)
const GOLD = 0xe8b13c
const easeInOut = (f) => (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2)

// ── renderer / scene ───────────────────────────────────────────────────
let W = Math.max(1, container.clientWidth)
let H = Math.max(1, container.clientHeight)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H, false)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
container.appendChild(renderer.domElement)

// ── outlines, drawn once on the finished picture ───────────────────────
// Players, ball, hoops and boards are also drawn into a depth-only mask
// (layer 1); wherever that depth jumps, a dark line goes on the picture.
// Done in screen space, the line is the same width near and far, on every
// outlined object alike — and it replaces the per-player outline shells.
const maskRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) })
const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false })
// The nets' strands (layer 3), drawn on their own into a coverage mask —
// depth-tested against the outlined things, so a player in front of the net
// still hides it — so the outline pass knows not to draw a line over them.
const NET_LAYER = 3
const netRT = new THREE.WebGLRenderTarget(1, 1)
netRT.depthTexture = maskRT.depthTexture
const netCovMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false })
const OutlineShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tNet: { value: null }, resolution: { value: new THREE.Vector2() }, px: { value: 1.6 }, near: { value: 0.05 }, far: { value: 160 }, ink: { value: new THREE.Color(0x08080a) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNet; uniform vec2 resolution; uniform float px; uniform float near; uniform float far; uniform vec3 ink;
    varying vec2 vUv;
    float lin(float d) { return (near * far) / (far - d * (far - near)); }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float zc = lin(texture2D(tDepth, vUv).r);
      vec2 o = px / resolution;
      float e = 0.0;
      // a neighbour clearly NEARER than this pixel puts the line here — so
      // the line sits just outside each silhouette, one line wide
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        float zn = lin(texture2D(tDepth, vUv + o * vec2(cos(a), sin(a))).r);
        float thr = 0.03 * zn + 0.06;
        e = max(e, smoothstep(thr, thr * 1.8, zc - zn));
      }
      // close to the lens: soften (disc of 8 taps, wider the nearer it is)
      float nearF = 1.6;
      if (zc < nearF) {
        float rr = px * 3.5 * (1.0 - zc / nearF);
        vec4 acc = col;
        for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398 + 0.39; acc += texture2D(tDiffuse, vUv + rr / resolution * vec2(cos(a), sin(a))); }
        col = acc / 9.0;
        e *= zc / nearF;
      }
      // the net's strands sit in front of whatever line is behind them
      e *= 1.0 - texture2D(tNet, vUv).r;
      gl_FragColor = vec4(mix(col.rgb, ink, e * 0.9), col.a);
    }`,
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
const renderPass = new RenderPass(null, null)
const outlinePass = new ShaderPass(OutlineShader)
// ── soft background ────────────────────────────────────────────────────
// The stands, the crowd and the hall above (layer 2) are drawn on their
// own, at half resolution, blurred, and a little dimmed — like a camera
// focused on the court — and the sharp court, players, ball, hoops and
// boards go on top. BG_BLUR is the blur radius in screen pixels.
const BG_LAYER = 2
const BG_BLUR = 6
const BG_DIM = 0.42
const bgRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
const blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
const blurMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
    void main() {
      // 13-tap gaussian along dir (one texel step × spread)
      float w[7]; w[0] = 0.1974; w[1] = 0.1747; w[2] = 0.1210; w[3] = 0.0656; w[4] = 0.0279; w[5] = 0.0093; w[6] = 0.0024;
      vec4 c = texture2D(t, vUv) * w[0];
      for (int i = 1; i < 7; i++) { c += texture2D(t, vUv + dir * float(i)) * w[i]; c += texture2D(t, vUv - dir * float(i)) * w[i]; }
      gl_FragColor = c;
    }`,
})
const blurQuad = new FullScreenQuad(blurMat)
const CompositeShader = {
  uniforms: { tDiffuse: { value: null }, tBg: { value: null }, dim: { value: BG_DIM } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBg; uniform float dim; varying vec2 vUv;
    void main() {
      vec4 fg = texture2D(tDiffuse, vUv);
      vec3 bg = texture2D(tBg, vUv).rgb * dim;
      gl_FragColor = vec4(fg.rgb + bg * (1.0 - fg.a), 1.0);
    }`,
}
const compositePass = new ShaderPass(CompositeShader)
// FXAA last, on the finished picture: smooths the stair-steps on lines and
// outlines in the distance
const fxaaPass = new ShaderPass(FXAAShader)
composer.addPass(renderPass); composer.addPass(compositePass); composer.addPass(outlinePass); composer.addPass(new OutputPass()); composer.addPass(fxaaPass)
renderer.setClearColor(0x000000, 0)
function sizeComposer() {
  const pr = renderer.getPixelRatio()
  composer.setPixelRatio(pr); composer.setSize(W, H)
  maskRT.setSize(Math.round(W * pr), Math.round(H * pr))
  netRT.setSize(Math.round(W * pr), Math.round(H * pr))
  outlinePass.uniforms.resolution.value.set(W * pr, H * pr)
  // the line is 2.4 px on a picture about 1130 px across the diagonal; on a
  // phone, where everything is smaller, it shrinks with it (never below half)
  outlinePass.uniforms.px.value = 2.4 * Math.max(0.5, Math.min(1, Math.hypot(W, H) / 1130)) * pr
  fxaaPass.material.uniforms.resolution.value.set(1 / (W * pr), 1 / (H * pr))
  const bw = Math.max(1, Math.round((W * pr) / 2)); const bh = Math.max(1, Math.round((H * pr) / 2))
  bgRT.setSize(bw, bh); blurRT.setSize(bw, bh)
  bgTexel.set(1 / bw, 1 / bh)
}
const bgTexel = new THREE.Vector2()
renderer.shadowMap.autoUpdate = false
function renderFrame() {
  const bg = scene.background
  // 0) the background layer, then blurred (horizontal, vertical)
  camera.layers.set(BG_LAYER)
  renderer.setRenderTarget(bgRT); renderer.setClearColor(bg || 0x000000, 1); renderer.clear(); scene.background = bg; renderer.render(scene, camera)
  renderer.setClearColor(0x000000, 0)
  const spread = BG_BLUR / 2 / 3 // half-res texels, gaussian sigma ≈ 3 taps
  blurMat.uniforms.t.value = bgRT.texture; blurMat.uniforms.dir.value.set(bgTexel.x * spread, 0)
  renderer.setRenderTarget(blurRT); blurQuad.render(renderer)
  blurMat.uniforms.t.value = blurRT.texture; blurMat.uniforms.dir.value.set(0, bgTexel.y * spread)
  renderer.setRenderTarget(bgRT); blurQuad.render(renderer)
  compositePass.uniforms.tBg.value = bgRT.texture
  // 1) depth of the outlined things only — no shadows, no background
  scene.background = null; scene.overrideMaterial = maskMat; camera.layers.set(1)
  renderer.setRenderTarget(maskRT); renderer.clear(); renderer.render(scene, camera)
  // net coverage, on top of that depth
  renderer.autoClear = false
  renderer.setRenderTarget(netRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false)
  scene.overrideMaterial = netCovMat; camera.layers.set(NET_LAYER); renderer.render(scene, camera)
  renderer.autoClear = true
  scene.background = bg; scene.overrideMaterial = null; camera.layers.set(0)
  renderer.setRenderTarget(null)
  outlinePass.uniforms.tNet.value = netRT.texture
  // 2) the picture (shadows once per frame), 3) lines, 4) tone + colour
  outlinePass.uniforms.tDepth.value = maskRT.depthTexture
  renderPass.scene = scene; renderPass.camera = camera
  // the sharp layer is drawn over transparency; the composite puts it on
  // top of the soft background
  scene.background = null
  // shadows are drawn from what the main camera sees, so they're updated
  // in this pass, where the players are
  renderer.shadowMap.needsUpdate = true
  composer.render()
  scene.background = bg
}

const scene = new THREE.Scene()
// ── look ───────────────────────────────────────────────────────────────
// A lit court in a darker hall. Light comes from above (a warm key) and
// from the far end (a cool back light) instead of evenly from everywhere —
// that gives the players shape and lifts them off the floor and the
// stands. Colours: a light maple court with navy paint, a navy surround,
// navy seats and a crowd in muted blues and greys, so the gold team, the
// floor and the stands no longer melt into one beige.
const ENV_TOON = true
const ENV_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([112, 166, 214, 255]), 4, 1, THREE.RedFormat)
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true
  return t
})()
const envMat = (o) => (ENV_TOON ? new THREE.MeshToonMaterial({ gradientMap: ENV_RAMP, ...o }) : new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }))
const HALL = 0x0e0e10 // the hall's deep blue-grey, in the distance and the haze
scene.background = new THREE.Color(HALL)
scene.fog = new THREE.Fog(HALL, 34, 95)
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 160)
// A tall, narrow picture (a phone held upright) would see only a sliver of
// the court with a 50° lens; widen it as the picture narrows.
function fitLens() {
  const a = W / H
  const fov = a < 1 ? Math.min(72, 50 / Math.max(0.6, a)) : 50
  camera.aspect = a
  if (camera.fov !== fov) camera.fov = fov
  camera.updateProjectionMatrix()
}
fitLens()
sizeComposer()
renderer.toneMappingExposure = 1.08

// fill: weak — cool from above, a warm bounce off the wood
scene.add(new THREE.HemisphereLight(0xf0f0f5, 0x7a5a3a, 0.62))
// key: warm, high over the court, casting the shadows
const sun = new THREE.DirectionalLight(0xfff0d8, 2.5)
sun.position.set(-2, 28, 11)
sun.target.position.set(0, 0, 9)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 16, bottom: -16, near: 1, far: 60 })
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.035 // keeps round heads and limbs free of self-shadow streaks
sun.shadow.radius = 1.5
scene.add(sun, sun.target)
// back light: cool, from the far end and above
const back = new THREE.DirectionalLight(0xeef0f5, 1.25)
back.position.set(6, 14, -18); back.target.position.set(0, 0, 10)
scene.add(back, back.target)
// warm pools over each half
for (const z of [6, 22]) { const s = new THREE.PointLight(0xffe2b8, 12, 24); s.position.set(0, 9, z); scene.add(s) }

// ── floor + court lines ────────────────────────────────────────────────
function courtTexture() {
  const S = 0.6
  const c = document.createElement('canvas')
  c.width = 1500 * S; c.height = 2800 * S
  const g = c.getContext('2d')
  g.scale(S, S)
  const rnd = (() => { let s = 11; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  // light maple planks, each with a little grain and the odd end joint
  const tones = ['#e6c89b', '#e1c193', '#e9cda2', '#dcbb8b', '#e4c597']
  for (let x = 0, i = 0; x < 1500; x += 38, i++) {
    g.fillStyle = tones[(i * 7) % tones.length]; g.fillRect(x, 0, 38, 2800)
    for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(140,90,40,${0.03 + rnd() * 0.05})`; g.fillRect(x + 3 + rnd() * 32, rnd() * 2800, 1 + rnd() * 1.5, 120 + rnd() * 500) }
    for (let y = rnd() * 400; y < 2800; y += 260 + rnd() * 420) { g.fillStyle = 'rgba(80,50,20,.12)'; g.fillRect(x, y, 38, 1.5) }
    g.fillStyle = 'rgba(70,45,20,.09)'; g.fillRect(x, 0, 1.5, 2800)
  }
  // painted keys and centre circle, a mid charcoal
  g.fillStyle = '#54545c'
  g.fillRect(505, 14, 490, 566); g.fillRect(505, 2220, 490, 566)
  g.beginPath(); g.arc(750, 1400, 180, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(255,255,255,.96)'; g.lineWidth = 9; g.lineCap = 'round'
  const half = (m) => {
    const Y = (y) => (m ? 2800 - y : y)
    g.strokeRect(505, Math.min(Y(14), Y(580)), 490, 566)
    g.beginPath(); g.arc(750, Y(580), 180, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.moveTo(90, Y(14)); g.lineTo(90, Y(299)); g.moveTo(1410, Y(14)); g.lineTo(1410, Y(299)); g.stroke()
    const a = Math.atan2(141.5, 660)
    g.beginPath(); if (m) g.arc(750, Y(157.5), 675, Math.PI + a, -a); else g.arc(750, Y(157.5), 675, a, Math.PI - a); g.stroke()
    g.beginPath(); if (m) g.arc(750, Y(157.5), 125, Math.PI, 0); else g.arc(750, Y(157.5), 125, 0, Math.PI); g.stroke()
  }
  g.strokeRect(14, 14, 1472, 2772)
  g.beginPath(); g.moveTo(14, 1400); g.lineTo(1486, 1400); g.stroke()
  g.beginPath(); g.arc(750, 1400, 180, 0, Math.PI * 2); g.stroke()
  half(false); half(true)
  // a soft falloff of light towards the sidelines and baselines, as under
  // real arena lights — the middle of the court reads as the brightest place
  const fall = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(40,30,20,.22)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); return gr }
  g.fillStyle = fall(0, 0, 260, 0); g.fillRect(0, 0, 260, 2800)
  g.fillStyle = fall(1500, 0, 1240, 0); g.fillRect(1240, 0, 260, 2800)
  g.fillStyle = fall(0, 0, 0, 300); g.fillRect(0, 0, 1500, 300)
  g.fillStyle = fall(0, 2800, 0, 2500); g.fillRect(0, 2500, 1500, 300)
  // a gold ring inside the centre circle
  g.strokeStyle = '#e8b13c'; g.lineWidth = 10; g.beginPath(); g.arc(750, 1400, 140, 0, Math.PI * 2); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
const court = new THREE.Mesh(new THREE.PlaneGeometry(15, 28), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.82, metalness: 0 }))
court.rotation.x = -Math.PI / 2
court.position.set(0, 0, 14)
court.receiveShadow = true
scene.add(court)
// navy surround: the court reads as a lit stage
const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 70), envMat({ color: 0x161618 }))
apron.rotation.x = -Math.PI / 2
apron.position.set(0, -0.01, 14)
apron.receiveShadow = true
scene.add(apron)

function ledTexture(w) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96
  const g = c.getContext('2d')
  const bg = g.createLinearGradient(0, 0, 0, 96); bg.addColorStop(0, '#28282d'); bg.addColorStop(1, '#1b1b1f')
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 96)
  // same face, weight and slant as the app's titles
  g.fillStyle = '#e8b13c'; g.font = `italic 800 64px ${COND}`; g.letterSpacing = '1px'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('BASKETBALLPROCOACH.COM', 512, 52, 940)
  g.fillStyle = 'rgba(232,177,60,.35)'; g.fillRect(0, 0, 1024, 5); g.fillRect(0, 91, 1024, 5)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(w / 7, 1)
  t.anisotropy = 8 // sharp at a glancing angle, no shimmer in the distance
  return t
}

{
  // ── LED boards right round the court ─────────────────────────────────
  const board = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, 0.12), [envMat({ color: 0x222226 }), envMat({ color: 0x222226 }), envMat({ color: 0x222226 }), envMat({ color: 0x222226 }), new THREE.MeshBasicMaterial({ map: ledTexture(w) }), envMat({ color: 0x222226 })])
    m.position.set(x, 0.425, z); m.rotation.y = ry; m.layers.enable(1); scene.add(m)
  }
  board(34, -9.2, 14, Math.PI / 2); board(34, 9.2, 14, -Math.PI / 2)
  board(18.4, 0, -3.4, 0); board(18.4, 0, 31.4, Math.PI)

  const beforeBg = new Set(scene.children)
  // ── bleachers with a crowd ───────────────────────────────────────────
  // Stepped rows on all four sides in navy; every seat gets a spectator (or
  // stays empty now and then) in muted blues, greys and white, with some
  // home gold — and all of it a little hazed into the hall, so it stays
  // backdrop and the players in front read first.
  const ROWS = 12; const DEPTH = 0.85; const RISE = 0.42
  const stepM = envMat({ color: 0x3a3a40 })
  const seatCols = [0x2a2a2f, 0x323238]
  const haze = new THREE.Color(HALL)
  const crowd = []
  const stepGeos = []; const seatGeos = []
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  const stand = (cx, cz, along, len, out) => {
    for (let r = 0; r < ROWS; r++) {
      const d = 1.2 + r * DEPTH
      const h = 0.55 + r * RISE
      const px = cx + out.x * (d + DEPTH / 2); const pz = cz + out.z * (d + DEPTH / 2)
      stepGeos.push(new THREE.BoxGeometry(Math.abs(along.x) * len + Math.abs(out.x) * DEPTH, h, Math.abs(along.z) * len + Math.abs(out.z) * DEPTH).translate(px, h / 2, pz))
      const sg = new THREE.BoxGeometry(Math.abs(along.x) * len + Math.abs(out.x) * 0.5, 0.08, Math.abs(along.z) * len + Math.abs(out.z) * 0.5).translate(px + out.x * 0.12, h + 0.04, pz + out.z * 0.12)
      const sc = new THREE.Color(seatCols[r % 2]).lerp(haze, 0.15)
      sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 3).map((_, j) => [sc.r, sc.g, sc.b][j % 3]), 3))
      seatGeos.push(sg)
      for (let u = -len / 2 + 0.35; u < len / 2; u += 0.58) {
        if (rnd() < 0.2) continue
        crowd.push({ x: px + along.x * u + out.x * 0.1, y: h + 0.08, z: pz + along.z * u + out.z * 0.1, face: Math.atan2(-out.x, -out.z), row: r })
      }
    }
  }
  stand(-9.6, 14, { x: 0, z: 1 }, 34, { x: -1, z: 0 })
  stand(9.6, 14, { x: 0, z: 1 }, 34, { x: 1, z: 0 })
  stand(0, -3.8, { x: 1, z: 0 }, 19.2, { x: 0, z: -1 })
  stand(0, 31.8, { x: 1, z: 0 }, 19.2, { x: 0, z: 1 })
  const steps = new THREE.Mesh(mergeGeometries(stepGeos), stepM); steps.receiveShadow = true; scene.add(steps)
  scene.add(new THREE.Mesh(mergeGeometries(seatGeos), envMat({ color: 0xffffff, vertexColors: true })))
  const SHIRTS = [0x2e2e33, 0x3d3d43, 0x5e5e66, 0x85858c, 0xcacacd, 0xe8e9ec, 0x4f4f56, 0x9a9aa1, 0xc99a3a, 0xd9ad4a, 0xd9ad4a]
  const HEADS = [0x8d5524, 0xc68642, 0x5c3a21, 0xe0ac69, 0xf1c27d, 0xa0662f]
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 6, 1, true), envMat({ color: 0xffffff }), crowd.length)
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), envMat({ color: 0xffffff }), crowd.length)
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const col = new THREE.Color()
  crowd.forEach((c, i) => {
    const lift = rnd() * 0.08
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.face)
    const sz = 0.9 + rnd() * 0.2
    m4.compose(new THREE.Vector3(c.x, c.y + 0.36 * sz + lift, c.z), q, new THREE.Vector3(sz, sz, sz)); body.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(c.x, c.y + 0.82 * sz + lift, c.z), q, new THREE.Vector3(sz, sz, sz)); head.setMatrixAt(i, m4)
    // further back rows sink a little further into the hall
    const h = 0.58 + c.row * 0.025
    body.setColorAt(i, col.setHex(SHIRTS[Math.floor(rnd() * SHIRTS.length)]).lerp(haze, h))
    head.setColorAt(i, col.setHex(HEADS[Math.floor(rnd() * HEADS.length)]).lerp(haze, h))
  })
  scene.add(body, head)

  // ── the hall above: dark walls, a roof, trusses with lights ───────────
  const wallTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 512
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#0c0c0e'); grd.addColorStop(0.6, '#17171a'); grd.addColorStop(1, '#242428')
    g.fillStyle = grd; g.fillRect(0, 0, 64, 512)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  })()
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 22, 64, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, fog: false }))
  wall.position.set(0, 11, 14); wall.scale.set(1, 1, 1.5); scene.add(wall)
  const roof = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, fog: false }))
  roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1.5, 1); roof.position.set(0, 21.9, 14); scene.add(roof)
  // trusses over the court, lights hanging under them
  const beamGeos = []
  for (const z of [1, 7.5, 14, 20.5, 27]) beamGeos.push(new THREE.BoxGeometry(24, 0.35, 0.35).translate(0, 15.5, z))
  for (const x of [-9, 0, 9]) beamGeos.push(new THREE.BoxGeometry(0.35, 0.35, 34).translate(x, 15.5, 14))
  scene.add(new THREE.Mesh(mergeGeometries(beamGeos), envMat({ color: 0x232326 })))
  const lampPos = []
  for (const z of [1, 7.5, 14, 20.5, 27]) for (const x of [-7, -3.5, 3.5, 7]) lampPos.push(new THREE.Vector3(x, 15.15, z))
  const lampGeos = lampPos.map((p) => new THREE.BoxGeometry(0.8, 0.18, 0.8).translate(p.x, p.y, p.z))
  scene.add(new THREE.Mesh(mergeGeometries(lampGeos), new THREE.MeshBasicMaterial({ color: 0xfff3d6 })))
  // a soft glow round each lamp
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64
    const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,240,210,1)'); r.addColorStop(0.25, 'rgba(255,230,190,.45)'); r.addColorStop(1, 'rgba(255,220,170,0)')
    g.fillStyle = r; g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const glow = new THREE.Points(new THREE.BufferGeometry().setFromPoints(lampPos.map((p) => p.clone().setY(15.05))), new THREE.PointsMaterial({ map: glowTex, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
  scene.add(glow)
  // scoreboard over centre court
  const sb = new THREE.Group()
  sb.add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 3.6), envMat({ color: 0x2a2a2e })))
  const screen = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256
    const g = c.getContext('2d'); g.fillStyle = '#0d0d10'; g.fillRect(0, 0, 512, 256)
    g.fillStyle = '#e8b13c'; g.font = 'italic 800 64px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('PRO COACH', 256, 110)
    g.fillStyle = '#ffffff'; g.font = '700 46px Arial, sans-serif'; g.fillText('HOME  ·  AWAY', 256, 190)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t })
  })()
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.7), screen)
    const a = (i * Math.PI) / 2
    s.position.set(Math.sin(a) * 1.81, 0, Math.cos(a) * 1.81); s.rotation.y = a; sb.add(s)
  }
  sb.position.set(0, 11.5, 14); scene.add(sb)
  // everything added since the stands began is soft background
  scene.children.filter((o) => !beforeBg.has(o)).forEach((o) => o.traverse((c) => c.layers.set(BG_LAYER)))
  // the lights light both layers
  scene.traverse((o) => { if (o.isLight) o.layers.enable(BG_LAYER) })
}

// ── contact shadows ────────────────────────────────────────────────────
// A soft dark patch right under each player and a smaller, darker one
// under each foot that's on the floor — what makes a figure stand ON the
// court rather than hover over it. The ball gets one that shrinks and
// fades as it rises. All of it one instanced mesh.
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.55, 'rgba(0,0,0,.22)'); r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()
const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x0a0a0c }), 64)
blobs.frustumCulled = false; blobs.renderOrder = 1
scene.add(blobs)

// ── hoops ──────────────────────────────────────────────────────────────
// Glass board with an aluminium frame and painted border + shooter's
// square, a padded bottom edge, an orange rim on its mounting bracket, a
// diamond-mesh net (it swishes when the ball drops through) and a padded
// stanchion behind the baseline with its arm out to the board.
const nets = []
// Glass board in a slim frame with the painted border and shooter's square,
// an orange rim on its bracket, a diamond-mesh net, and a padded stanchion
// in the team navy. Built from
// boxes merged into a few meshes (colour per vertex), drawn in the same
// toon look as everything else — and outlined, so it reads at a glance.
const LINE_LAYER = 1
function coloured(geo, color) {
  const c = new THREE.Color(color); const n = geo.attributes.position.count
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, j) => [c.r, c.g, c.b][j % 3]), 3))
  if (geo.index) geo = geo.toNonIndexed()
  geo.deleteAttribute('uv')
  return geo
}
function hoop(z, dir) {
  const solid = []; const rimParts = []
  const B = (list, w, h, d, color, x, y, zz, rx = 0) => list.push(coloured(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, zz), color))
  const zb = z - dir * 0.375 // front face of the board
  const fz = zb - dir * 0.0125
  const FRAME = 0x2a2a2e; const NAVYP = 0x1c1c20; const STEEL = 0x3c3c42; const WHITE = 0xf4f4f4; const ORANGE = 0xe2541b
  // frame round the glass
  B(solid, 1.84, 0.04, 0.05, FRAME, 0, 3.425 + 0.535, fz); B(solid, 1.84, 0.04, 0.05, FRAME, 0, 3.425 - 0.535, fz)
  B(solid, 0.04, 1.1, 0.05, FRAME, -0.92, 3.425, fz); B(solid, 0.04, 1.1, 0.05, FRAME, 0.92, 3.425, fz)
  // painted border, 5 cm in, and the shooter's square (59 × 45 cm, its
  // bottom line level with the rim)
  const pz = zb + dir * 0.003
  const L = (w, h, x, y) => B(solid, w, h, 0.004, WHITE, x, y, pz)
  L(1.7, 0.05, 0, 3.895); L(1.7, 0.05, 0, 2.955); L(0.05, 0.99, -0.825, 3.425); L(0.05, 0.99, 0.825, 3.425)
  const sqB = 3.07
  L(0.59, 0.05, 0, sqB + 0.025); L(0.59, 0.05, 0, sqB + 0.425); L(0.05, 0.45, -0.27, sqB + 0.225); L(0.05, 0.45, 0.27, sqB + 0.225)
  // edge padding along the bottom
  B(solid, 1.9, 0.08, 0.09, NAVYP, 0, 2.88, fz)
  // stanchion: padded base, padded post, one arm and a brace to the board
  const baseZ = -dir * 2.05 + (dir < 0 ? 28 : 0)
  B(solid, 1.25, 0.9, 1.9, NAVYP, 0, 0.45, baseZ)
  const postZ = baseZ + dir * 0.55
  B(solid, 0.36, 1.6, 0.36, NAVYP, 0, 0.9 + 0.8, postZ)
  B(solid, 0.18, 1.55, 0.18, STEEL, 0, 2.5 + 0.775, postZ)
  const backZ = zb - dir * 0.04
  const arm = (y0, y1, t) => {
    const len = Math.hypot(backZ - postZ, y1 - y0)
    B(solid, t, t, len, STEEL, 0, (y0 + y1) / 2, (postZ + backZ) / 2, -Math.atan2(y1 - y0, (backZ - postZ)))
  }
  arm(4.0, 3.55, 0.13); arm(3.05, 3.32, 0.08)
  // rim and bracket
  rimParts.push(coloured(new THREE.TorusGeometry(0.2325, 0.011, 10, 40).rotateX(Math.PI / 2).translate(0, 3.05, z), ORANGE))
  B(rimParts, 0.26, 0.2, 0.02, ORANGE, 0, 3.0, zb + dir * 0.01)
  B(rimParts, 0.16, 0.014, 0.15, ORANGE, 0, 3.045, zb + dir * 0.085)
  const mk = (list, mat) => { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = true; m.layers.enable(LINE_LAYER); scene.add(m); return m }
  mk(solid, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ENV_RAMP }))
  mk(rimParts, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ENV_RAMP }))
  // glass: a faint blue tint, light passing straight through
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xdde3e8, transparent: true, opacity: 0.16, depthWrite: false }))
  glass.position.set(0, 3.425, fz); scene.add(glass)
  // net: 12 hooks, 6 rows of diamonds, tapering from the rim
  const HOOKS = 12; const ROWS = 6
  const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 }), HOOKS * ROWS * 2)
  inst.layers.enable(NET_LAYER)
  scene.add(inst)
  const net = { inst, z, HOOKS, ROWS, swish: 0, vs: 0, sx: 0, vx: 0, sz: 0, vz: 0 }
  nets.push(net)
  updateNet(net)
}
function updateNet(net) {
  const { inst, z, HOOKS, ROWS } = net
  const swish = Math.max(0, net.swish)
  const pt = (i, j) => {
    const f = j / ROWS
    const bulge = swish * Math.sin(Math.PI * Math.min(1, f * 1.2)) * 0.07
    const r = 0.229 - 0.085 * f + bulge
    const a = ((i + (j % 2) * 0.5) / HOOKS) * Math.PI * 2
    // the lower rows swing furthest; the hooks on the rim stay put
    const sw = Math.pow(f, 1.4) * 0.16
    return new THREE.Vector3(Math.sin(a) * r + net.sx * sw, 3.04 - f * (0.44 + swish * 0.12), z + Math.cos(a) * r + net.sz * sw)
  }
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const sc = new THREE.Vector3()
  let n = 0
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < HOOKS; i++) {
    const p0 = pt(i, j)
    const nbs = j % 2 === 0 ? [i, i - 1] : [i, i + 1]
    for (const ii of nbs) {
      const p1 = pt((ii + HOOKS) % HOOKS, j + 1)
      const d = p1.clone().sub(p0)
      q.setFromUnitVectors(up, d.clone().normalize())
      m.compose(p0.clone().add(p1).multiplyScalar(0.5), q, sc.set(1, d.length(), 1))
      inst.setMatrixAt(n++, m)
    }
  }
  inst.instanceMatrix.needsUpdate = true
}
hoop(1.575, 1)
hoop(28 - 1.575, -1)

const SKIN = [0x8d5524, 0xc68642, 0x5c3a21, 0xe0ac69, 0xa0662f, 0xf1c27d]
const HAIR = [0x1a120c, 0x2b1d14, 0x0e0b09, 0x4a3020, 0x161210, 0x6b4a2b]
function numberDecal(label, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200
  const g = c.getContext('2d')
  g.fillStyle = fg; g.font = 'italic 800 170px "Arial Narrow", Arial, sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label.replace(/^D/, ''), 128, 108)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
// ── toon look ──────────────────────────────────────────────────────────
const TOON = true
const TOON_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([86, 146, 204, 255]), 4, 1, THREE.RedFormat)
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true
  return t
})()
// Four-step toon for the players. Each light just adds its smooth share
// (this ramp is a plain gradient); then, per pixel, the total light on the
// surface — sun, fill, sky, shadow, however many there are — is snapped to
// one of four tones. Thresholds t1..t3 and the four levels are in units of
// "how much of the bare colour comes through".
const SOFT_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 255]), 2, 1, THREE.RedFormat)
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true
  return t
})()
const TOON_STEPS = { t: [0.26, 0.42, 0.58], l: [0.28, 0.50, 0.72, 0.94] }
const fourSteps = `
      float lumD = max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.01 );
      float Lf = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) ) / lumD;
      float qs = Lf < ${TOON_STEPS.t[0].toFixed(3)} ? ${TOON_STEPS.l[0].toFixed(3)} : Lf < ${TOON_STEPS.t[1].toFixed(3)} ? ${TOON_STEPS.l[1].toFixed(3)} : Lf < ${TOON_STEPS.t[2].toFixed(3)} ? ${TOON_STEPS.l[2].toFixed(3)} : ${TOON_STEPS.l[3].toFixed(3)};
      outgoingLight = diffuseColor.rgb * qs;
`
// ── "toy" figure: smooth shapes on real joints, drawn in one piece ──────
// Modelled on the reference lineup: a fitted tank top, shorts with a white
// hem, a crisp white sock above a rounded shoe, one of four heads — bald
// with a headband, short hair or a top bun — and a simple face.
// Every shape is placed on its joint and then all of them are merged into
// a single mesh, rigidly skinned to the joints (each vertex follows exactly
// one joint), with its colour stored per vertex. So a whole player is one
// draw call, plus one for the outline and one for the shirt number —
// instead of some eighty separate pieces. Units: the figure is 1 tall.
const TOY_PALETTES = {
  off: { kit: GOLD, trim: 0x15151a, shoe: 0x15151a, sock: 0xf4f4f4, band: 0x15151a, skin: SKIN, hair: HAIR },
  def: { kit: 0x1c1d22, trim: 0xf2f2f2, shoe: 0xf2f2f2, sock: 0xf4f4f4, band: 0xf2f2f2, skin: SKIN, hair: HAIR },
}
const HAIRSTYLES = ['band', 'short', 'bun']
const TOY_BODY = { depth: 0.145, width: 0.213, torsoBot: 0.72, legD: 0.1, legW: 0.2, headR: 0.266, headUp: 0.14, handR: 0.068 }
const TOY_BONES = [
  ['root', -1, 0, 0], ['pelvis', 0, 0, 0.4], ['spine', 1, 0, 0.46], ['chest', 2, 0, 0.62], ['head', 3, 0, 0.72],
  ['hipL', 1, -0.056, 0.375], ['kneeL', 5, -0.056, 0.215], ['ankleL', 6, -0.056, 0.055],
  ['hipR', 1, 0.056, 0.375], ['kneeR', 8, 0.056, 0.215], ['ankleR', 9, 0.056, 0.055],
  ['shL', 3, -0.112, 0.672], ['elL', 11, -0.3, 0.672], ['shR', 3, 0.112, 0.672], ['elR', 13, 0.3, 0.672],
]
const TBI = Object.fromEntries(TOY_BONES.map((b, i) => [b[0], i]))
const TOY_REST = TOY_BONES.map(([, , x, y]) => new THREE.Vector3(x, y, 0))
const INK = 0x141016
const TOY_HC = 0.14; const TOY_HR = 0.14; const TOY_HF = TOY_HR / 0.21
// A face feature set onto the curve of the head (head-joint space): dx, dy
// across the face, lift off the skin, rz its tilt, sx/sy/sz its size.
function faceMatrix(dx, dy, lift, rz, sx, sy, sz) {
  dx *= TOY_HF; dy *= TOY_HF; lift *= TOY_HF
  const n = new THREE.Vector3(dx, dy, Math.sqrt(Math.max(0, TOY_HR * TOY_HR - dx * dx - dy * dy))).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz))
  return new THREE.Matrix4().compose(new THREE.Vector3(0, TOY_HC, 0).addScaledVector(n, TOY_HR + lift), q, new THREE.Vector3(sx * TOY_HF, sy * TOY_HF, sz * TOY_HF))
}
function makeToyHuman(p, idx, style = {}) {
  const off = p.team === 'off'
  const pal = TOY_PALETTES[style.palette || (off ? 'off' : 'def')]
  const hair = (style.hair && style.hair !== 'afro' ? style.hair : null) || HAIRSTYLES[idx % HAIRSTYLES.length]
  const skinC = pal.skin[idx % pal.skin.length]; const hairC = pal.hair[idx % pal.hair.length]
  // collected pieces: outlined (the body) and detail (the face) separately
  const outlined = []; const detail = []
  const col = new THREE.Color()
  // blend (optional): [other bone, weight(y)] — shares each vertex with a
  // second joint by its height, so a piece can bend smoothly between two
  const put = (list, geo, color, bone, matrix, blend) => {
    const g = geo.clone(); g.deleteAttribute('uv')
    g.applyMatrix4(matrix); g.translate(TOY_REST[TBI[bone]].x, TOY_REST[TBI[bone]].y, 0)
    const n = g.attributes.position.count
    col.setHex(color)
    const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3)
    const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const w = blend ? blend[1](g.attributes.position.getY(i)) : 0
      si[i * 4] = TBI[bone]; sw[i * 4] = 1 - w
      if (w > 0) { si[i * 4 + 1] = TBI[blend[0]]; sw[i * 4 + 1] = w }
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
    list.push(g)
  }
  const M = (x = 0, y = 0, z = 0, rot = null, scl = null) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))), new THREE.Vector3(...(scl || [1, 1, 1])))
  const add = (geo, color, bone, x, y, z, rot, scl, blend) => put(outlined, geo, color, bone, M(x, y, z, rot, scl), blend)
  // torso: a tank top turned on a lathe — a hem that falls a little loose
  // over the shorts, waist, chest, then in to the shoulders. The hem moves
  // with the hips (like the shorts under it, so they never cut through it),
  // the chest with the spine, the belly blends between the two.
  const prof = [[0.0, -0.078], [0.101, -0.078], [0.1045, -0.0755], [0.1055, -0.07], [0.105, -0.063], [0.1, -0.02], [0.108, 0.07], [0.112, 0.15], [0.1, 0.22], [0.07, 0.262], [0.0, 0.265]].map(([r, y]) => new THREE.Vector2(r, y))
  const smooth = (a, b, v) => { const h = Math.min(1, Math.max(0, (v - a) / (b - a))); return h * h * (3 - 2 * h) }
  add(new THREE.LatheGeometry(prof, 40), pal.kit, 'spine', 0, 0, 0, null, [1, 1, 0.7], ['pelvis', (y) => 1 - smooth(0.4, 0.5, y)])
  add(new THREE.CylinderGeometry(0.036, 0.04, 0.06, 10, 1, true), skinC, 'head', 0, 0.01, 0)
  // shorts: hip piece (its waistband under the vest's hem) plus a tube per
  // leg, white hem at the bottom
  add(new THREE.CylinderGeometry(0.09, 0.106, 0.085, 40), pal.kit, 'pelvis', 0, -0.0075, 0, null, [1, 1, 0.7])
  for (const S of ['L', 'R']) {
    add(new THREE.CylinderGeometry(0.06, 0.063, 0.125, 14, 1, true), pal.kit, 'hip' + S, 0, -0.055, 0)
    add(new THREE.TorusGeometry(0.0625, 0.0065, 4, 16), pal.trim, 'hip' + S, 0, -0.116, 0, [Math.PI / 2, 0, 0])
    add(new THREE.CapsuleGeometry(0.041, 0.13, 2, 10), skinC, 'hip' + S, 0, -0.085, 0)
    add(new THREE.SphereGeometry(0.0395, 20, 14), skinC, 'knee' + S)
    add(new THREE.CapsuleGeometry(0.036, 0.12, 2, 10), skinC, 'knee' + S, 0, -0.075, 0)
    // sock: its own tube, a touch wider than the shin, so the edge is a clean line
    add(new THREE.CylinderGeometry(0.0405, 0.039, 0.07, 12, 1, true), pal.sock, 'knee' + S, 0, -0.123, 0)
    add(new THREE.CapsuleGeometry(0.039, 0.075, 3, 10), pal.shoe, 'ankle' + S, 0, -0.012, 0.022, [Math.PI / 2, 0, 0], [1.22, 1, 0.95])
  }
  // arms along x (T-pose), bending at the elbow
  for (const [side, S] of [[-1, 'L'], [1, 'R']]) {
    // tapered: fuller at the shoulder, slimmer to the elbow and wrist
    // (a cylinder's top end turns to face along +x·side with this roll)
    const roll = [0, 0, -side * Math.PI / 2]
    // Each joint is a finely rounded ball exactly as wide as the tube that
    // ends in it, riding on the limb that turns about it — so the tube's rim
    // always sits on the ball's surface and the outline stays one clean curve.
    add(new THREE.SphereGeometry(0.0364, 28, 18), skinC, 'sh' + S)
    add(new THREE.CylinderGeometry(0.0285, 0.036, 0.188, 28, 1, true), skinC, 'sh' + S, side * 0.094, 0, 0, roll)
    add(new THREE.SphereGeometry(0.0289, 24, 16), skinC, 'el' + S)
    add(new THREE.CylinderGeometry(0.0215, 0.0285, 0.15, 24, 1, true), skinC, 'el' + S, side * 0.075, 0, 0, roll)
    add(new THREE.SphereGeometry(0.0218, 18, 12), skinC, 'el' + S, side * 0.15, 0, 0)
    // a hand: flat palm, fingers together, and a thumb
    add(new THREE.SphereGeometry(0.034, 12, 8), skinC, 'el' + S, side * 0.181, -0.002, 0, null, [1.12, 0.62, 0.92])
    add(new THREE.SphereGeometry(0.0135, 8, 6), skinC, 'el' + S, side * 0.166, 0.004, 0.027, null, [1.5, 1, 1])
  }
  // head and hair
  const HC = 0.14; const HR = 0.14
  add(new THREE.SphereGeometry(HR, 32, 22), skinC, 'head', 0, HC, 0)
  // Hair and headband lie on the skull: a thin layer round the head's own
  // centre, from polar angle `from` to `to` (about the layer's tilted axis),
  // as thick as thick(0…1) says. At its edges it thins to almost nothing and
  // tucks under the skin, so it is flush with the head all the way round.
  const skullLayer = (from, to, thick) => {
    const pts = []; const at = (th, r) => pts.push(new THREE.Vector2(Math.sin(th) * r, Math.cos(th) * r))
    at(to, HR * 0.96)
    for (let i = 32; i >= 0; i--) { const u = i / 32; at(from + (to - from) * u, HR + 0.0012 + thick(u)) }
    if (from > 0) at(from, HR * 0.96)
    return new THREE.LatheGeometry(pts, 48)
  }
  // headband: a flat strip with rounded edges, a little higher at the back
  if (hair === 'band') add(skullLayer(1.0, 1.32, (u) => 0.0085 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, 4)))), pal.band, 'head', 0, HC, 0, [-0.16, 0, 0])
  // short hair: a cap tilted back, down to the hairline
  if (hair === 'short' || hair === 'bun') add(skullLayer(0, Math.PI * 0.42, (u) => 0.0062 * (1 - smooth(0.78, 1, u))), hairC, 'head', 0, HC, 0, [-0.32, 0, 0])
  if (hair === 'bun') add(new THREE.SphereGeometry(0.045, 24, 16), hairC, 'head', 0, HC + HR + 0.022, -0.022)
  // face: eyes with pupils and a catch-light, brows, nose, mouth — set onto
  // the curve of the head. Attackers get relaxed brows and a smile,
  // defenders brows angled down to the middle.
  const onHead = faceMatrix
  // three faces per team, so a lineup isn't ten copies of one: eye size,
  // brow height / angle / weight, and the mouth all vary a little
  const v = idx % 3
  const FACE = {
    eyeX: [0.031, 0.033, 0.03][v], eyeY: [0.04, 0.046, 0.033][v],
    browUp: [0, 0.008, -0.004][v], browW: [0.008, 0.0068, 0.0105][v],
    browTilt: off ? [0.12, 0.28, -0.04][v] : [-0.38, -0.24, -0.52][v],
    mouthArc: off ? [0.8, 0.95, 0.6][v] : [0.55, 0.3, 0.45][v],
    mouthW: off ? [0.028, 0.034, 0.022][v] : [0.028, 0.03, 0.024][v],
  }
  for (const side of [-1, 1]) {
    put(detail, new THREE.SphereGeometry(1, 10, 6), 0xffffff, 'head', onHead(side * 0.072, -0.005, -0.004, 0, FACE.eyeX, FACE.eyeY, 0.012))
    // pupils and catch-lights are drawn live (they follow the ball) for the
    // players on court; still pictures bake them in
    if (!style.liveEyes) {
      put(detail, new THREE.SphereGeometry(1, 8, 6), INK, 'head', onHead(side * 0.068, -0.012, 0.004, 0, 0.019, 0.024, 0.008))
      put(detail, new THREE.SphereGeometry(1, 6, 4), 0xffffff, 'head', onHead(side * 0.062, -0.002, 0.011, 0, 0.006, 0.006, 0.003))
    }
    put(detail, new THREE.CapsuleGeometry(1, 3, 2, 6), INK, 'head', onHead(side * 0.074, (off ? 0.058 : 0.05) + FACE.browUp + (FACE.eyeY - 0.04) * 0.6, 0.002, Math.PI / 2 + side * FACE.browTilt, FACE.browW, 0.009, 0.006))
  }
  put(detail, new THREE.SphereGeometry(1, 8, 6), skinC, 'head', onHead(0, -0.042, -0.006, 0, 0.017, 0.015, 0.016))
  put(detail, new THREE.TorusGeometry(1, 0.22, 5, 12, Math.PI * FACE.mouthArc), INK, 'head', onHead(0, off ? -0.088 : -0.094, 0, Math.PI + Math.PI * (1 - FACE.mouthArc) / 2, FACE.mouthW, 0.022, 0.012))

  // joints and the rig
  const root = new THREE.Group()
  const SC = 1.9
  const rig = new THREE.Group(); rig.scale.setScalar(SC); root.add(rig)
  const bones = TOY_BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b })
  TOY_BONES.forEach(([, parent], i) => {
    bones[i].position.copy(TOY_REST[i]).sub(parent < 0 ? new THREE.Vector3() : TOY_REST[parent])
    ;(parent >= 0 ? bones[parent] : rig).add(bones[i])
  })
  rig.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  const bodyM = TOON ? new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: SOFT_RAMP, vertexColors: true }) : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.65 })
  // a cool rim of light round the silhouette, from any camera angle — it
  // lifts the player off whatever is behind him
  bodyM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', TOON ? fourSteps + `
      #include <opaque_fragment>
      float rimD = 1.0 - max( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0 );
      gl_FragColor.rgb += vec3( 0.9, 0.9, 0.95 ) * smoothstep( 0.62, 0.82, rimD ) * 0.11;` : `#include <opaque_fragment>
      float rimD = 1.0 - max( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0 );
      gl_FragColor.rgb += vec3( 0.9, 0.9, 0.95 ) * smoothstep( 0.62, 0.82, rimD ) * 0.11;`)
  }
  bodyM.customProgramCacheKey = () => 'figure-rim-4step' + JSON.stringify(TOON_STEPS)
  const body = new THREE.SkinnedMesh(mergeGeometries(outlined.concat(detail)), bodyM)
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false
  rig.add(body); body.bind(skeleton)
  body.layers.enable(1) // outlined (screen-space pass, see renderFrame)
  // Depth pre-pass for when he is faded out in front of the lens: drawn just
  // before the see-through body, it lays down the depth of his front-most
  // surface only, so the body is then drawn exactly once per pixel — no
  // doubled-up patches where an arm meets the shoulder or an eye sits on
  // the head. Hidden (and free) while he's fully opaque.
  const pre = new THREE.SkinnedMesh(body.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true }))
  pre.frustumCulled = false; pre.visible = false
  rig.add(pre); pre.bind(skeleton)
  // number on the tank top, front and back — one mesh
  const decalM = new THREE.MeshStandardMaterial({ map: numberDecal(p.label, off ? '#101012' : '#ffffff'), transparent: true, roughness: 0.6 })
  const fr = new THREE.PlaneGeometry(0.12, 0.094).translate(0, 0.1, 0.0798)
  const bk = new THREE.PlaneGeometry(0.14, 0.11).rotateY(Math.PI).translate(0, 0.13, -0.0798)
  bones[TBI.spine].add(new THREE.Mesh(mergeGeometries([fr, bk]), decalM))
  const B = (n) => bones[TBI[n]]
  const legs = {}; const arms = {}
  for (const [side, S] of [[-1, 'L'], [1, 'R']]) {
    const soleMark = new THREE.Object3D(); soleMark.position.set(0, -0.049, 0.022); B('ankle' + S).add(soleMark)
    legs[side] = { hp: B('hip' + S), kn: B('knee' + S), ft: B('ankle' + S), soleMark }
    const hand = new THREE.Object3D(); hand.position.set(side * 0.178, 0, 0); B('el' + S).add(hand)
    arms[side] = { sh: B('sh' + S), el: B('el' + S), hand }
  }
  scene.add(root)
  return { root, bones, skinC, hips: B('pelvis'), torso: B('spine'), chest: B('chest'), head: B('head'), arms, legs, eyeY: FACE.eyeY, mats: [bodyM, decalM], bodyMesh: body, preMesh: pre, scale: SC, pelvisY: 0.4, ath: true, body: TOY_BODY }
}

let figures = {}
const freshState = (i) => ({ prev: null, phase: (i * 1.7) % 6, yaw: Math.PI, s: 0, ampF: 0, ampL: 0, ampT: 0, headYaw: 0, lift: 0, stance: null, lock: null })
function disposeFigure(f) {
  scene.remove(f.root)
  f.root.traverse((o) => {
    if (!o.isMesh) return
    o.geometry.dispose()
    ;[].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
  })
}

// ── live eyes: pupils that follow the ball, and the odd blink ──────────
// All pupils are one instanced mesh, likewise the catch-lights and the
// eyelids, so the whole lot costs three draw calls.
let EYE_FIGS = []
let pupils = null; let shines = null; let lids = null
const eyeGeo = { pupil: new THREE.SphereGeometry(1, 8, 6), shine: new THREE.SphereGeometry(1, 6, 4), lid: new THREE.SphereGeometry(1, 10, 6) }
const eyeMat = { pupil: new THREE.MeshBasicMaterial({ color: INK }), shine: new THREE.MeshBasicMaterial({ color: 0xffffff }), lid: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_RAMP }) }
function buildFigures(list) {
  EYE_FIGS.forEach(disposeFigure)
  ;[pupils, shines, lids].forEach((m) => { if (m) { scene.remove(m); m.dispose() } })
  figures = {}
  list.forEach((p, i) => { figures[p.id] = { ...makeToyHuman(p, i % 5, { liveEyes: true }), p, ...freshState(i) } })
  EYE_FIGS = Object.values(figures)
  const EYES = Math.max(1, EYE_FIGS.length * 2)
  pupils = new THREE.InstancedMesh(eyeGeo.pupil, eyeMat.pupil, EYES)
  shines = new THREE.InstancedMesh(eyeGeo.shine, eyeMat.shine, EYES)
  lids = new THREE.InstancedMesh(eyeGeo.lid, eyeMat.lid, EYES)
  ;[pupils, shines, lids].forEach((m) => { m.frustumCulled = false; m.count = EYE_FIGS.length * 2; scene.add(m) })
  EYE_FIGS.forEach((f, i) => { const c = new THREE.Color(f.skinC); lids.setColorAt(i * 2, c); lids.setColorAt(i * 2 + 1, c) })
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
function updateEyes(t) {
  if (!EYE_FIGS.length) return
  const secs = t * N * STEP_SECS
  const m = new THREE.Matrix4()
  EYE_FIGS.forEach((f, i) => {
    // where the ball is, seen from his head, steers both pupils
    const L = f.head.worldToLocal(ball.position.clone()).sub(new THREE.Vector3(0, TOY_HC, 0)).normalize()
    const ox = Math.max(-1, Math.min(1, L.x * 1.4)) * 0.011; const oy = Math.max(-1, Math.min(1, L.y * 1.4)) * 0.009
    // a blink every 3–5 seconds, each player on his own rhythm
    const period = 3 + ((i * 0.61) % 2); const at = (secs + i * 1.37) % period
    const b = at < 0.16 ? Math.sin((Math.PI * at) / 0.16) : 0
    ;[-1, 1].forEach((side, j) => {
      const n = i * 2 + j
      pupils.setMatrixAt(n, m.multiplyMatrices(f.head.matrixWorld, faceMatrix(side * 0.068 + ox, -0.012 + oy, 0.004, 0, 0.019, 0.024, 0.008)))
      shines.setMatrixAt(n, m.multiplyMatrices(f.head.matrixWorld, faceMatrix(side * 0.062 + ox, -0.002 + oy, 0.011, 0, 0.006, 0.006, 0.003)))
      const ey = f.eyeY || 0.04
      lids.setMatrixAt(n, b > 0.02 ? m.multiplyMatrices(f.head.matrixWorld, faceMatrix(side * 0.072, -0.005 + (ey + 0.002) * (1 - b), 0.0, 0, 0.034, (ey + 0.003) * b + 0.001, 0.015)) : ZERO)
      if (!f.root.visible || (f.op ?? 1) < 0.99) { pupils.setMatrixAt(n, ZERO); shines.setMatrixAt(n, ZERO); lids.setMatrixAt(n, ZERO) }
    })
  })
  pupils.instanceMatrix.needsUpdate = true; shines.instanceMatrix.needsUpdate = true; lids.instanceMatrix.needsUpdate = true
}

// Cones and spare balls from the drawing board: they stand where they were
// put (and follow a drawn path, if they have one).
let extras = []
const coneGeo = new THREE.ConeGeometry(0.15, 0.34, 20).translate(0, 0.17, 0)
const coneM = new THREE.MeshToonMaterial({ color: 0xe8702a, gradientMap: TOON_RAMP })
function buildExtras(list) {
  extras.forEach(({ mesh }) => scene.remove(mesh))
  extras = list.filter((p) => isCone(p) || isBall(p)).map((ent) => {
    const mesh = isCone(ent) ? new THREE.Mesh(coneGeo, coneM) : new THREE.Mesh(ball.geometry, ball.material)
    mesh.castShadow = true; mesh.layers.enable(1)
    scene.add(mesh)
    return { ent, mesh }
  })
}

// Pose for one frame. side −1 is the player's RIGHT (x < 0 when he faces
// +z). ampF / ampL: forward and sideways stride amplitude. Height is not
// set here — plantFeet() puts the lower sole exactly on the floor.
function pose(f, ampF, ampL, lean, defense, hold) {
  const { torso, head, arms, legs } = f
  const ph = f.phase
  const amp = Math.abs(ampF) + Math.abs(ampL)
  const ready = f.ath && !defense ? 1 : 0 // athletic: knees soft, weight forward
  torso.rotation.x = (defense ? 0.3 : 0.05 + 0.1 * ready) + 0.2 * lean
  head.rotation.x = -torso.rotation.x * 0.7
  // running: the hips turn with the leading leg, the shoulders the other
  // way with the arms — the twist that makes a run look like a run
  const tw = Math.sin(ph) * Math.max(0, Math.abs(ampF) - 0.05)
  f.hips.rotation.y = 0.22 * tw
  torso.rotation.y = -0.5 * tw
  head.rotation.y = 0.28 * tw
  for (const side of [-1, 1]) {
    const sw = Math.sin(ph) * side
    const L = legs[side]
    L.hp.rotation.x = -(defense ? 0.5 : 0.05 + 0.2 * ready) + sw * ampF
    L.hp.rotation.z = (defense ? side * 0.12 : 0) + Math.sin(ph) * ampL
    // the trailing leg folds up well behind on a run, the planted one keeps a little give
    L.kn.rotation.x = (defense ? 0.9 : 0.1 + 0.38 * ready) + 0.18 * Math.min(1, Math.abs(ampF) * 1.5) + Math.max(0, -Math.cos(ph) * side) * 1.7 * Math.min(1, amp * 1.6)
    L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x)
    L.ft.rotation.z = -L.hp.rotation.z
    const A = arms[side]
    // T-pose → arms down (z), then swing (x). The elbow bends about its y
    // axis; for the forearm to come FORWARD that's +angle on the right side
    // of the body (−x) and −angle on the left, i.e. −side × angle.
    A.sh.rotation.set(defense ? -0.35 : -sw * 0.8 * Math.abs(ampF), 0, -side * (defense ? 0.95 : 1.3 - 0.15 * lean))
    A.el.rotation.set(0, -side * (defense ? 1.05 : 0.25 + 0.9 * lean), 0)
  }
  if (hold === 'hold') {
    for (const side of [-1, 1]) { arms[side].sh.rotation.set(-1.05, 0, -side * 1.0); arms[side].el.rotation.set(0, -side * 1.15, 0) }
  } else if (hold === 'dribble') {
    arms[-1].sh.rotation.set(-0.35, 0, 1.25 - 0.08 * Math.cos(2 * f.dribbleT)); arms[-1].el.rotation.set(0, -0.35, 0)
  }
}
// ── foot locking ───────────────────────────────────────────────────────
// The standing foot stays exactly where it was put down — the hip and knee
// are solved to reach it (the same exact two-joint solution as the arms,
// with the knee pointing forwards) — until the other foot takes over. So
// feet don't skate when a player turns on the spot or runs; if a stride
// would over-stretch the leg, the foot is simply re-planted.
function legIK(f, side, ankleTarget) {
  const L = f.legs[side]
  const H = L.hp.getWorldPosition(new V3())
  const L1 = L.kn.position.length() * f.scale; const L2 = L.ft.position.length() * f.scale
  const toT = ankleTarget.clone().sub(H); const dist = toT.length()
  if (dist > L1 + L2 - 0.004 || dist < 0.05) return false
  const dir = toT.clone().normalize()
  const a1 = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, L1 * L1 - a1 * a1))
  const fw = fwdOf(f)
  let pp = fw.clone().sub(dir.clone().multiplyScalar(fw.dot(dir)))
  if (pp.lengthSq() < 1e-8) pp = fw.clone()
  pp.normalize()
  const K = H.clone().addScaledVector(dir, a1).addScaledVector(pp, h)
  const u = K.clone().sub(H).normalize(); const v = ankleTarget.clone().sub(K).normalize()
  let w = v.clone().sub(u.clone().multiplyScalar(v.dot(u)))
  if (w.lengthSq() < 1e-8) w = pp.clone().negate()
  w.normalize()
  // thigh frame: leg axis (−y) → u, knee bend direction (−z) → w
  _m.makeBasis(new V3().crossVectors(u, w), u.clone().negate(), w.clone().negate())
  L.hp.quaternion.copy(L.hp.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromRotationMatrix(_m)))
  L.kn.rotation.set(Math.acos(Math.max(-1, Math.min(1, u.dot(v)))), 0, 0)
  L.hp.updateMatrixWorld(true)
  // foot flat on the floor, pointing the way he faces
  L.ft.quaternion.copy(L.kn.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.root.quaternion))
  L.hp.updateMatrixWorld(true)
  return true
}
function lockStance(f, lift) {
  if (lift > 0.001) { f.stance = null; f.lock = null; return }
  const soles = [-1, 1].map((sd) => f.legs[sd].soleMark.getWorldPosition(new V3()))
  const side = soles[0].y <= soles[1].y ? -1 : 1
  const sole = side === -1 ? soles[0] : soles[1]
  if (f.stance !== side || !f.lock) { f.stance = side; f.lock = sole.clone().setY(0); return }
  // ankle above the sole with the foot flat (the sole mark sits 0.049 below
  // and 0.022 in front of the ankle joint)
  const off = new V3(0, 0.049, -0.022).multiplyScalar(f.scale).applyQuaternion(f.root.quaternion)
  if (legIK(f, side, f.lock.clone().add(off))) return
  // Out of reach (he has moved on further than one stride): drag the foot
  // only as far as a straight leg needs — never a jump to a new spot.
  const L = f.legs[side]
  const H = L.hp.getWorldPosition(new V3())
  const reach = (L.kn.position.length() + L.ft.position.length()) * f.scale - 0.006
  const ankle = f.lock.clone().add(off)
  const dy = H.y - ankle.y
  if (dy >= reach) { f.lock = sole.clone().setY(0); return }
  const dh = Math.sqrt(reach * reach - dy * dy)
  const hor = new V3(ankle.x - H.x, 0, ankle.z - H.z)
  if (hor.lengthSq() < 1e-8) { f.lock = sole.clone().setY(0); return }
  hor.setLength(dh)
  const near = new V3(H.x + hor.x, ankle.y, H.z + hor.z)
  f.lock = near.clone().sub(off).setY(0)
  if (!legIK(f, side, near)) f.lock = sole.clone().setY(0)
}

// Whichever foot is lower is the one standing: lift or lower the hips so
// its sole sits exactly on the floor — no sinking in, no hovering.
const _v = new THREE.Vector3()
function plantFeet(f) {
  f.hips.position.y = f.pelvisY
  f.root.updateMatrixWorld(true)
  const low = Math.min(...[-1, 1].map((side) => f.legs[side].soleMark.getWorldPosition(_v).y))
  f.hips.position.y -= (low - f.root.position.y) / f.scale
  f.root.updateMatrixWorld(true)
}

// ── ball ───────────────────────────────────────────────────────────────
// A real ball's seams, worked out on the sphere itself: the equator, one
// full meridian, and the two curved seams (circles round the side axis),
// plus the pebbled leather as fine dark dots.
function ballTexture() {
  const W2 = 512; const H2 = 256
  const c = document.createElement('canvas'); c.width = W2; c.height = H2
  const g = c.getContext('2d'); const img = g.createImageData(W2, H2)
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let r = 0; r < H2; r++) {
    const th = (Math.PI * (r + 0.5)) / H2
    for (let q = 0; q < W2; q++) {
      const ph = (2 * Math.PI * (q + 0.5)) / W2
      const x = -Math.cos(ph) * Math.sin(th); const y = Math.cos(th); const z = Math.sin(ph) * Math.sin(th)
      const d = Math.min(Math.abs(y), Math.abs(z), Math.abs(Math.abs(x) - 0.7))
      const seam = d < 0.022 ? 1 : d < 0.034 ? (0.034 - d) / 0.012 : 0
      const peb = rnd() < 0.22 ? 0.82 : 1
      const o = (r * W2 + q) * 4
      img.data[o] = (214 * peb) * (1 - seam) + 30 * seam
      img.data[o + 1] = (102 * peb) * (1 - seam) + 16 * seam
      img.data[o + 2] = (36 * peb) * (1 - seam) + 8 * seam
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t
}
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.72 }))
ball.castShadow = true
ball.layers.enable(1)
scene.add(ball)

// ── ball handling: chest height, arms that reach, no ball inside a body ─
const BALL_R = 0.12
const fwdOf = (f) => new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw))
const sideOf = (f) => new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)) // his local +x
// Ball held in front of the chest, a hand's width clear of the shirt: the
// shirt is ~0.23 m in front of his spine, the ball's radius 0.12.
function chestPoint(f, dir) {
  const c = f.chest.getWorldPosition(new THREE.Vector3())
  const d = (dir || fwdOf(f)).clone().setY(0).normalize()
  // a couple of centimetres clear of the shirt, wherever he holds it: the
  // body is wider than it is deep, so towards the side it sits further out
  const b = bodyOf(f); const rel = Math.atan2(d.x, d.z) - f.yaw
  const r = 1 / Math.hypot(Math.cos(rel) / (b.depth + BALL_R + 0.025), Math.sin(rel) / (b.width + BALL_R + 0.025))
  return c.addScaledVector(d, r).add(new THREE.Vector3(0, 0.1, 0))
}
// The set point of a jump shot: in front of the forehead, a little towards
// the shooting (right) side — where both hands can hold it with the arms in
// front of the face, never through the head.
const shotPoint = (f) => headCentre(f).addScaledVector(fwdOf(f), 0.45).addScaledVector(sideOf(f), -0.12).add(new THREE.Vector3(0, 0.08, 0))
// Two-bone reach, solved exactly: from the shoulder, the target and the
// two arm lengths the elbow's position follows directly (law of cosines),
// with the elbow pointing towards a "pole" — down and outwards for holding
// a ball, under the ball for a shot. The shoulder joint is then turned so
// the upper arm points at the elbow, and the elbow bends by exactly the
// angle that puts the hand on the target.
const V3 = THREE.Vector3
const _m = new THREE.Matrix4()
function reach(f, side, target, pole) {
  const A = f.arms[side]
  A.sh.rotation.set(0, 0, 0); A.el.rotation.set(0, 0, 0)
  A.sh.parent.updateMatrixWorld(true); A.sh.updateMatrixWorld(true)
  const S = A.sh.getWorldPosition(new V3()); const Ew = A.el.getWorldPosition(new V3()); const Hw = A.hand.getWorldPosition(new V3())
  const L1 = S.distanceTo(Ew); const L2 = Ew.distanceTo(Hw)
  const toT = target.clone().sub(S)
  const dir = toT.clone().normalize()
  const d = Math.min(Math.max(toT.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3)
  const a1 = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, L1 * L1 - a1 * a1))
  const P = (pole || new V3(0, -1, 0).addScaledVector(sideOf(f), side * 0.5).addScaledVector(fwdOf(f), -0.2)).clone()
  let pp = P.sub(dir.clone().multiplyScalar(P.dot(dir)))
  if (pp.lengthSq() < 1e-8) pp = new V3(0, -1, 0)
  pp.normalize()
  const E = S.clone().addScaledVector(dir, a1).addScaledVector(pp, h)
  const T = S.clone().addScaledVector(dir, d)
  const u = E.clone().sub(S).normalize(); const v = T.clone().sub(E).normalize()
  let w = v.clone().sub(u.clone().multiplyScalar(v.dot(u)))
  if (w.lengthSq() < 1e-8) w = pp.clone().negate()
  w.normalize()
  // shoulder frame: arm axis (side·x) → u, bend direction (−side·z) → w
  const ex = u.clone().multiplyScalar(side); const ez = w.clone().multiplyScalar(-side); const ey = new V3().crossVectors(ez, ex)
  _m.makeBasis(ex, ey, ez)
  const qW = new THREE.Quaternion().setFromRotationMatrix(_m)
  const qP = A.sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
  A.sh.quaternion.copy(qP.multiply(qW))
  A.el.rotation.set(0, Math.acos(Math.max(-1, Math.min(1, u.dot(v)))), 0)
  A.sh.updateMatrixWorld(true)
  armOffHead(f, side)
  return A.hand.getWorldPosition(new V3()).distanceTo(target)
}
// The deepest point (and how deep, > 0 = inside) where an arm — upper arm,
// forearm, hand, each with its thickness — meets its own head.
function armInHead(f, side) {
  const A = f.arms[side]; const sc = f.scale
  const S = A.sh.getWorldPosition(new V3()); const E = A.el.getWorldPosition(new V3()); const Hd = A.hand.getWorldPosition(new V3())
  const H = headCentre(f); const R = bodyOf(f).headR + 0.01
  let best = { pen: -1e9, p: null }
  const seg = (a, b, r0, r1) => {
    for (let i = 0; i <= 10; i++) {
      const q = a.clone().lerp(b, i / 10); const pen = R + (r0 + (r1 - r0) * i / 10) * sc - q.distanceTo(H)
      if (pen > best.pen) best = { pen, p: q }
    }
  }
  seg(S, E, 0.036, 0.0285); seg(E, Hd, 0.0285, 0.034)
  return { ...best, S, H }
}
// Should an arm still meet the head, the shoulder turns it away — just far
// enough, about the axis that moves the deepest point straight off the head.
const _q = new THREE.Quaternion()
function armOffHead(f, side) {
  const A = f.arms[side]
  for (let it = 0; it < 4; it++) {
    const { pen, p, S, H } = armInHead(f, side)
    if (pen <= 0) return
    const r = p.clone().sub(S); const axis = new V3().crossVectors(r, H.clone().sub(S))
    if (axis.lengthSq() < 1e-10) axis.copy(fwdOf(f))
    _q.setFromAxisAngle(axis.normalize(), -(pen / Math.max(r.length(), 0.05)) * 1.15)
    const qW = A.sh.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q)
    A.sh.quaternion.copy(A.sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qW))
    A.sh.updateMatrixWorld(true)
  }
}
// Bringing the ball up (from a dribble to the chest, or from the chest to
// the shooting pocket) while he may be turning at the same time: move it
// around him, not through him — angle, distance and height are blended
// separately about his own axis, and the distance never drops below the
// body's radius plus the ball's.
function gatherPath(f, from, to, g) {
  const c = f.root.position
  const pol = (v) => ({ a: Math.atan2(v.x - c.x, v.z - c.z), r: Math.hypot(v.x - c.x, v.z - c.z), y: v.y })
  const A = pol(from); const B = pol(to)
  let da = B.a - A.a
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI
  const a = A.a + da * g
  // never closer than his body's outline in that direction, plus the ball
  const b = bodyOf(f); const rel = a - f.yaw
  const rim = 1 / Math.hypot(Math.cos(rel) / (b.depth + BALL_R + 0.015), Math.sin(rel) / (b.width + BALL_R + 0.015))
  const r = Math.max(rim, A.r + (B.r - A.r) * g)
  const pt = new THREE.Vector3(c.x + Math.sin(a) * r, A.y + (B.y - A.y) * g, c.z + Math.cos(a) * r)
  // …and round his head: out sideways from it, never through his face
  const hc = headCentre(f); const R = b.headR + BALL_R + 0.02
  const dy = pt.y - hc.y
  if (Math.abs(dy) < R) {
    const need = Math.sqrt(R * R - dy * dy)
    const dx = pt.x - hc.x; const dz = pt.z - hc.z; const dh = Math.hypot(dx, dz) || 1e-6
    if (dh < need) { pt.x = hc.x + (dx / dh) * need; pt.z = hc.z + (dz / dh) * need }
  }
  return pt
}
// Hands on the ball: palms on its sides, a little behind its centre —
// the hand's centre one ball-radius plus most of a hand-radius out, so the
// palm touches the leather rather than floating off it or sinking in.
function holdBall(f, p) {
  const sx = sideOf(f); const fw = fwdOf(f)
  const d = BALL_R + bodyOf(f).handR * 0.8
  for (const side of [-1, 1]) {
    const dir = sx.clone().multiplyScalar(side * 0.93).addScaledVector(fw, -0.37).normalize()
    reach(f, side, p.clone().addScaledVector(dir, d))
  }
}
// Shooting grip: the shooting hand (right) under and behind the ball, the
// guide hand on its side.
function shootGrip(f, p) {
  const sx = sideOf(f); const fw = fwdOf(f); const d = BALL_R + bodyOf(f).handR * 0.8
  reach(f, -1, p.clone().addScaledVector(fw.clone().multiplyScalar(-0.55).add(new THREE.Vector3(0, -0.83, 0)).normalize(), d), new THREE.Vector3(0, -1, 0).addScaledVector(fw, 0.35).addScaledVector(sx, -0.25))
  // guide hand on the side of the ball, elbow out
  reach(f, 1, p.clone().addScaledVector(sx, d), new THREE.Vector3(0, -0.5, 0).addScaledVector(sx, 1).addScaledVector(fw, 0.3))
}
// After the release: the shooting arm reaches on up towards the rim, the
// guide hand stays where the ball was.
function shotFollow(f, p, u) {
  const sx = sideOf(f); const fw = fwdOf(f); const d = BALL_R + bodyOf(f).handR * 0.8
  const S = f.arms[-1].sh.getWorldPosition(new V3())
  const up = S.addScaledVector(fw.clone().multiplyScalar(0.55).add(new V3(0, 0.8, 0)).addScaledVector(sx, -0.22).normalize(), 0.68)
  const hold = p.clone().addScaledVector(fw.clone().multiplyScalar(-0.55).add(new V3(0, -0.83, 0)).normalize(), d)
  reach(f, -1, hold.lerp(up, Math.min(1, u / 0.12)), new V3(0, -1, 0).addScaledVector(fw, 0.35).addScaledVector(sx, -0.25))
  reach(f, 1, p.clone().addScaledVector(sx, d), new V3(0, -0.5, 0).addScaledVector(sx, 1).addScaledVector(fw, 0.3))
}
// Height a pass has to reach to clear everybody standing in its lane.
function clearance(a, b, skip) {
  let need = 0
  const d = a.distanceTo(b)
  for (let i = 1; i < 20; i++) {
    const u = i / 20
    const q = a.clone().lerp(b, u)
    Object.values(figures).forEach((f) => {
      if (skip.includes(f)) return
      // defenders step into the lane while the ball is in the air: leave room
      if (Math.hypot(q.x - f.root.position.x, q.z - f.root.position.z) > 0.32 + BALL_R + 0.3) return
      const top = f.head.getWorldPosition(new THREE.Vector3()).y + 0.35 + BALL_R
      if (q.y < top) need = Math.max(need, (top - q.y) / (4 * u * (1 - u)))
    })
  }
  return Math.min(need, 2.4) + 0.04 * Math.sqrt(d)
}

// ── body shape (metres) for contact checks ─────────────────────────────
// Torso: an ellipse round the chest axis (depth front-back, width side to
// side) between hips and shoulders. Head: a sphere. Legs: a narrow ellipse
// below the shorts. Taken from the toy figure's measurements.
const bodyOf = (f) => f.body || { depth: 0.29, width: 0.29, torsoBot: 0.6, legD: 0.17, legW: 0.17, headR: 0.3, headUp: 0.2, handR: 0.072 }
const headCentre = (f) => f.head.localToWorld(new THREE.Vector3(0, bodyOf(f).headUp, 0))
// Signed clearance between the ball's surface and his body (< 0 = inside),
// plus the direction to push it out along.
function bodyGap(f, p) {
  const b = bodyOf(f)
  const hc = headCentre(f)
  const toH = p.clone().sub(hc)
  const headGap = toH.length() - b.headR - BALL_R
  let best = { gap: headGap, push: toH.normalize(), part: 'head' }
  const ax = (p.y > b.torsoBot ? f.chest : f.root).getWorldPosition(new THREE.Vector3())
  const top = hc.y - b.headR * 0.6
  if (p.y < top + BALL_R) {
    const [a, w] = p.y > b.torsoBot ? [b.depth, b.width] : [b.legD, b.legW]
    const d = new THREE.Vector3(p.x - ax.x, 0, p.z - ax.z)
    const u = d.dot(fwdOf(f)); const v = d.dot(sideOf(f))
    const A = a + BALL_R; const W = w + BALL_R
    const kk = Math.hypot(u / A, v / W)
    const gap = (kk - 1) * Math.min(A, W)
    if (gap < best.gap) best = { gap, push: d.lengthSq() > 1e-8 ? d.normalize() : fwdOf(f), part: p.y > b.torsoBot ? 'torso' : 'legs', kk, ax }
  }
  return best
}
function keepOutOfBodies(p) {
  Object.values(figures).forEach((f) => {
    if (!f.root.visible) return
    const g = bodyGap(f, p)
    if (g.gap >= 0) return
    if (g.part === 'head') p.copy(headCentre(f).addScaledVector(g.push, bodyOf(f).headR + BALL_R))
    else { const s = 1 / g.kk; p.x = g.ax.x + (p.x - g.ax.x) * s; p.z = g.ax.z + (p.z - g.ax.z) * s }
  })
  return p
}
// For checking.

// ── per-frame update ───────────────────────────────────────────────────
let look = null
// the camera: 'court' (low, behind the play) or 'pov' (through a player's eyes)
const cam = { mode: 'court', povId: null }
let flight = null
let held = null
let lastBall = null
const angLerp = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f }

// ── screens and handoffs ───────────────────────────────────────────────
const sstep = (a, b, v) => { const h = Math.min(1, Math.max(0, (v - a) / (b - a))); return h * h * (3 - 2 * h) }
// How far into "setting a screen" a player is, 0…1: the arms fold as he
// arrives and slows, he stands set, and lets go as he moves on (or, with
// nothing to do next, once the step after is over).
function screenWeight(p, k, fr) {
  const acts = actsOf(p).filter((a) => a.pts.length)
  const s = Math.max(0, ...acts.filter((a) => a.type === 'screen' && a.step <= k).map((a) => a.step))
  if (!s || k > s + 1) return 0
  if (k === s) return sstep(0.3, 0.7, fr)
  return acts.some((a) => a.step === k) ? 1 - sstep(0.05, 0.3, fr) : 1 - sstep(0.7, 1, fr)
}
// Arms folded across the chest, one forearm in front of the other, elbows
// out and down — each hand towards the opposite upper arm.
// An arm as the three things the shoulder and elbow are driven by: the
// upper arm's direction u, the way the elbow folds w (⟂ u), and the angle.
function armShape(A) {
  const S = A.sh.getWorldPosition(new V3()); const E = A.el.getWorldPosition(new V3()); const H = A.hand.getWorldPosition(new V3())
  const u = E.clone().sub(S).normalize(); const v = H.clone().sub(E).normalize()
  const w = v.clone().sub(u.clone().multiplyScalar(v.dot(u)))
  return { u, w: w.lengthSq() < 1e-4 ? null : w.normalize(), ang: Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) }
}
function crossArms(f, w) {
  f.root.updateMatrixWorld(true)
  const b = bodyOf(f); const c = f.chest.getWorldPosition(new V3())
  const fw = fwdOf(f); const sx = sideOf(f); const e = sstep(0, 1, w)
  for (const side of [-1, 1]) {
    const A = f.arms[side]
    const dep = b.depth + (side === -1 ? 0.04 : 0.115)
    const tgt = c.clone().addScaledVector(fw, dep).addScaledVector(sx, -side * 0.12).add(new V3(0, -0.07, 0))
    const pole = new V3(0, -1, 0).addScaledVector(fw, 0.45).addScaledVector(sx, side * 0.3)
    // solve the folded pose in full, then blend from wherever the arm was:
    // direction, fold direction and angle each on their own, so the elbow
    // never swings through the wrong way on the way across
    const a0 = armShape(A)
    reach(f, side, tgt, pole)
    const a1 = armShape(A)
    const u = a0.u.clone().lerp(a1.u, e).normalize()
    let wv = (a0.w || a1.w).clone().lerp(a1.w || a0.w, e)
    wv.sub(u.clone().multiplyScalar(wv.dot(u)))
    if (wv.lengthSq() < 1e-6) wv = (a1.w || a0.w).clone()
    wv.normalize()
    const ex = u.clone().multiplyScalar(side); const ez = wv.clone().multiplyScalar(-side); const ey = new V3().crossVectors(ez, ex)
    _m.makeBasis(ex, ey, ez)
    const qW = new THREE.Quaternion().setFromRotationMatrix(_m)
    A.sh.quaternion.copy(A.sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qW))
    A.el.rotation.set(0, a0.ang + (a1.ang - a0.ang) * e, 0)
    A.sh.updateMatrixWorld(true)
  }
}

function simulate(t, dt) {
  const k = stepAtTime(t, N)
  const fr = Math.max(0, Math.min(0.999999, t)) * N - (k - 1)
  const act = actsOf(play.ball).find((a) => a.step === k && a.pts.length)
  const carrier = !act && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const dribbling = carrier && actsOf(carrier.p).some((a) => a.step === k && a.type === 'dribble' && a.pts.length)
  const bp = board.ballPos(t)
  const ballXZ = new THREE.Vector3(toX(bp.x), 0, toZ(bp.y))
  // jump shot: the shooter sinks into his knees while bringing the ball up,
  // then jumps; his defender jumps a beat later with a hand up
  const G_SHOT = 0.22
  const shooter = act && act.type === 'shot' && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const contester = shooter && Object.values(figures).find((f) => MARKS[f.p.id] === shooter.p.id)
  const uShot = shooter ? (fr - G_SHOT) / (1 - G_SHOT) : -1
  // handoff: the carrier holds the ball out to a team-mate coming by, who takes it
  const giver = !act && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const taker = giver && CARRIERS[k + 1] && CARRIERS[k + 1].id !== giver.p.id ? figures[CARRIERS[k + 1].id] : null
  const handoff = taker && [giver, taker].some((q) => actsOf(q.p).some((a) => a.step === k && a.type === 'handoff' && a.pts.length)) ? { giver, taker } : null
  const passerFig = act && act.type !== 'shot' && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const lunge = passerFig && fr > 0.1 && fr < 0.6 ? Math.sin((Math.PI * (fr - 0.1)) / 0.5) : 0

  // players: position, speed, facing, pose
  Object.values(figures).forEach((f) => {
    const p = board.entPos(f.p, t, N, MARKS)
    const x = toX(p.x); const z = toZ(p.y)
    let vx = 0; let vz = 0
    if (f.prev) { vx = (x - f.prev.x) / dt; vz = (z - f.prev.z) / dt }
    f.prev = { x, z }
    const speed = Math.hypot(vx, vz)
    f.spd = speed
    f.s += (Math.min(1, speed / 3.2) - f.s) * 0.25
    f.root.position.set(x, 0, z)
    const defense = f.p.team === 'def'
    const hold = carrier === f ? (dribbling ? 'dribble' : 'hold') : null
    let want
    if (!defense && speed > 0.6) want = Math.atan2(vx, vz)
    else if (hold) { const hp = hoopAt(z); want = Math.atan2(hp.x - x, hp.z - z) }
    else want = Math.atan2(ball.position.x - x, ball.position.z - z)
    const yaw0 = f.yaw
    f.yaw = angLerp(f.yaw, want, f.prev ? 0.16 : 1)
    f.root.rotation.y = f.yaw
    let yd = f.yaw - yaw0
    while (yd > Math.PI) yd -= 2 * Math.PI
    while (yd < -Math.PI) yd += 2 * Math.PI
    const yawRate = f.prev ? Math.abs(yd) / dt : 0
    f.dribbleT = t * N * 2.4 * Math.PI * 2
    // Speed in his own frame: forward strides, sideways shuffles.
    const fwd = vx * Math.sin(f.yaw) + vz * Math.cos(f.yaw)
    const lat = vx * Math.cos(f.yaw) - vz * Math.sin(f.yaw)
    const tf = Math.sign(fwd) * 0.75 * Math.min(1, Math.abs(fwd) / 3.2)
    const tl = -Math.sign(lat) * 0.32 * Math.min(1, Math.abs(lat) / 2.4)
    f.ampF = (f.ampF || 0) + (tf - (f.ampF || 0)) * 0.3
    f.ampL = (f.ampL || 0) + (tl - (f.ampL || 0)) * 0.3
    // Cadence matched to speed, so the standing foot doesn't skate:
    // the foot sweeps ≈ leg length × amplitude per radian of the cycle.
    const sweep = 0.85 * Math.max(0.16, Math.abs(f.ampF) + Math.abs(f.ampL))
    // turning on the spot: small steps round instead of the feet
    // sliding over the floor as the body turns above them
    const turn = speed < 1 ? Math.min(1, yawRate / 3.5) : 0
    f.ampT = (f.ampT || 0) + (0.3 * turn - (f.ampT || 0)) * 0.3
    f.phase += Math.min(14, Math.max(speed / sweep, yawRate * 1.8 * turn)) * dt
    pose(f, f.ampF + f.ampT, f.ampL, f.s, defense, hold)
    // setting a screen: feet wide, knees soft, upright — and still
    f.screenW = hold ? 0 : screenWeight(f.p, k, fr)
    if (f.screenW > 0.01) {
      const w = f.screenW
      f.torso.rotation.x += (0.08 - f.torso.rotation.x) * w
      f.head.rotation.x = -f.torso.rotation.x * 0.7
      for (const sd of [-1, 1]) {
        const L = f.legs[sd]
        L.hp.rotation.x += (-0.3 - L.hp.rotation.x) * w
        L.hp.rotation.z += (sd * 0.2 - L.hp.rotation.z) * w
        L.kn.rotation.x += (0.62 - L.kn.rotation.x) * w
        L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x)
        L.ft.rotation.z = -L.hp.rotation.z
      }
    }
    // stepping into a pass: lead foot forward, weight over it
    if (f === passerFig && lunge > 0) {
      const Lf = f.legs[1]; const Lb = f.legs[-1]
      Lf.hp.rotation.x -= 0.5 * lunge; Lf.kn.rotation.x += 0.25 * lunge
      Lb.hp.rotation.x += 0.28 * lunge; Lb.kn.rotation.x += 0.12 * lunge
      for (const L of [Lf, Lb]) L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x)
      f.torso.rotation.x += 0.18 * lunge
    }
    // sink into the knees (shooter gathering, defender loading to jump)
    let dip = 0; let lift = 0
    if (f === shooter) { dip = fr < G_SHOT ? Math.sin((Math.PI / 2) * (fr / G_SHOT)) : uShot < 0.08 ? 1 - uShot / 0.08 : 0; lift = uShot > 0 && uShot < 0.42 ? 0.3 * Math.sin((Math.PI * uShot) / 0.42) : 0 }
    if (f === contester) { const uc = uShot - 0.06; dip = uShot > -0.3 && uc < 0.05 ? 0.7 : 0; lift = uc > 0 && uc < 0.4 ? 0.2 * Math.sin((Math.PI * uc) / 0.4) : 0 }
    if (dip) for (const sd of [-1, 1]) { const L = f.legs[sd]; L.hp.rotation.x -= 0.55 * dip; L.kn.rotation.x += 1.05 * dip; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) }
    if (lift) for (const sd of [-1, 1]) { const L = f.legs[sd]; L.kn.rotation.x *= 0.4; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) + 0.5 } // legs straighten, toes point
    plantFeet(f)
    lockStance(f, lift)
    f.lift = lift
    f.root.position.y = lift
    // the head turns to follow the ball (as far as a neck turns)
    let ha = Math.atan2(ball.position.x - x, ball.position.z - z) - f.yaw
    while (ha > Math.PI) ha -= 2 * Math.PI
    while (ha < -Math.PI) ha += 2 * Math.PI
    f.headYaw = (f.headYaw || 0) + (Math.max(-1.1, Math.min(1.1, ha)) * 0.85 - (f.headYaw || 0)) * 0.25
    f.head.rotation.y += f.headYaw
  })

  // ball: held at the chest, dribbled at the right hand, passed chest to
  // chest (gathered up to the chest first if it was being dribbled), shot
  // from above the head.
  const reaches = []
  Object.values(figures).forEach((f) => { if (f.screenW > 0.01) reaches.push([f, null, 'cross', f.screenW]) })
  let squash = 1
  if (carrier) {
    flight = null
    let want
    if (dribbling) {
      // waist-high dribble out in front of the right hip: four bounces a
      // step, at the top of one when the step starts and ends; the hand
      // rides on top of the ball while it's up and waits there for it
      const top = carrier.root.position.clone().addScaledVector(fwdOf(carrier), 0.32).addScaledVector(sideOf(carrier), -0.26)
      const TOP = 0.86
      // each bounce: pushed down out of the hand, speeding up under gravity
      // to the floor, slowing again on the way back up into the hand
      const ph = (fr * 4) % 1; const half = ph < 0.5 ? ph * 2 : (1 - ph) * 2
      const drop = 0.3 * half + 0.7 * half * half
      // a slight squash as it hits the floor
      squash = half > 0.93 ? 1 - 0.14 * (half - 0.93) / 0.07 : 1
      want = top.setY(TOP - (TOP - BALL_R * squash) * drop)
      reaches.push([carrier, want.clone(), 'dribble'])
    } else {
      want = chestPoint(carrier)
      // handoff: the ball is held out towards the team-mate, who comes
      // into it and takes it from there — it meets him halfway, then is
      // drawn in to his chest
      if (handoff && carrier === handoff.giver && fr > 0.5) {
        const dGT = handoff.taker.root.position.clone().sub(carrier.root.position).setY(0).normalize()
        const gP = chestPoint(carrier, dGT); const rP = chestPoint(handoff.taker, dGT.clone().negate())
        const meet = gP.clone().lerp(rP, 0.5); meet.y = Math.min(gP.y, rP.y) - 0.04
        want = gP.lerp(meet, sstep(0.5, 0.8, fr)).lerp(rP, sstep(0.82, 1, fr))
      }
    }
    // Changing from holding to dribbling (or back) eases over rather than
    // jumping between the chest and the hand.
    const modeKey = k + (dribbling ? 'd' : 'h') + carrier.p.id
    if (!held || held.key !== modeKey) held = { key: modeKey, from: ball.position.clone(), fr0: fr }
    const bl = Math.min(1, (fr - held.fr0) / 0.16)
    ball.position.copy(bl < 1 ? gatherPath(carrier, held.from, want, easeInOut(bl)) : want)
    // the giver lets go just before the end, the taker's hands come to the ball
    if (!dribbling && !(handoff && fr > 0.9)) reaches.push([carrier, ball.position.clone(), 'hold'])
    if (handoff && carrier === handoff.giver && fr > 0.5 && handoff.taker.root.position.distanceTo(ball.position) < 1.7) reaches.push([handoff.taker, ball.position.clone(), 'catch'])
  } else if (act) {
    const passer = CARRIERS[k] && figures[CARRIERS[k].id]
    const end = act.pts[act.pts.length - 1]
    if (!flight || flight.k !== k) flight = { k, gatherFrom: ball.position.clone(), release: null, h: 0 }
    if (act.type === 'shot') {
      const G = 0.22
      // a shot at the basket drops through it; one drawn elsewhere goes where it points
      const ex = toX(end.x); const ez = toZ(end.y); const hp = hoopAt(ez)
      const rimP = Math.hypot(ex - hp.x, ez - hp.z) < 1.3 ? new THREE.Vector3(hp.x, 3.12, hp.z) : new THREE.Vector3(ex, 3.12, ez)
      if (passer && fr < G) {
        const g = easeInOut(fr / G)
        ball.position.copy(gatherPath(passer, flight.gatherFrom, shotPoint(passer), g))
        reaches.push([passer, ball.position.clone(), 'shoot'])
      } else {
        if (!flight.release) flight.release = passer ? shotPoint(passer) : flight.gatherFrom.clone()
        const from = flight.release
        const u = passer ? (fr - G) / (1 - G) : fr
        if (u < 0.74) {
          const e2 = u / 0.74
          ball.position.copy(from.clone().lerp(rimP, e2))
          ball.position.y = from.y + (rimP.y - from.y) * e2 + 4 * 1.2 * e2 * (1 - e2)
        } else {
          const g = (u - 0.74) / 0.26
          ball.position.copy(rimP).setY(rimP.y - (rimP.y - BALL_R) * g * g)
        }
        // follow-through: arms stay up after the release
        if (passer && u < 0.5) reaches.push([passer, shotPoint(passer), 'shotFollow', u])
      }
      if (contester && uShot > -0.4 && uShot < 0.5) {
        // hand up towards the ball, on the side it's on
        const toB0 = ball.position.clone().sub(contester.chest.getWorldPosition(new THREE.Vector3()))
        contester.contestSide = toB0.dot(sideOf(contester)) >= 0 ? 1 : -1
        // reaching up from his own shoulder, so the arm goes up beside the head
        const sh = contester.arms[contester.contestSide].sh.getWorldPosition(new THREE.Vector3())
        const toB = ball.position.clone().sub(sh)
        reaches.push([contester, sh.addScaledVector(toB.setY(Math.max(toB.y, 0.9)).normalize(), 0.95), 'contest'])
      }
    } else {
      const rc = CARRIERS[k + 1] && figures[CARRIERS[k + 1].id]
      const G = 0.18
      const toRc = rc && passer ? rc.root.position.clone().sub(passer.root.position) : null
      // caught with the arms out a little towards the pass; the next step
      // starts by pulling it in to the chest
      const toPasser = rc && passer ? passer.root.position.clone().sub(rc.root.position).setY(0).normalize() : null
      const catchPt = rc ? chestPoint(rc, toPasser).addScaledVector(toPasser || new THREE.Vector3(), 0.14) : new THREE.Vector3(toX(end.x), 1.2, toZ(end.y))
      if (passer && fr < G) {
        // gather: the ball comes up into both hands at the chest
        const g = easeInOut(fr / G)
        ball.position.copy(gatherPath(passer, flight.gatherFrom, chestPoint(passer, toRc), g))
        reaches.push([passer, ball.position.clone(), 'hold'])
      } else {
        if (!flight.release) {
          flight.release = passer ? chestPoint(passer, toRc) : flight.gatherFrom.clone()
          flight.h = clearance(flight.release, catchPt, [passer, rc])
        }
        const u = passer ? (fr - G) / (1 - G) : fr
        const e = 1 - Math.pow(1 - u, 1.5) // fast off the hands, slowing a touch
        ball.position.copy(flight.release.clone().lerp(catchPt, e))
        ball.position.y += 4 * flight.h * e * (1 - e)
        // arms follow through, then the receiver's come up to meet it
        if (passer && u < 0.35) reaches.push([passer, chestPoint(passer, toRc).addScaledVector(toRc.clone().setY(0).normalize(), 0.25 * (u / 0.35)), 'follow'])
        if (rc && e > 0.5) reaches.push([rc, e > 0.8 ? ball.position.clone() : ball.position.clone().lerp(catchPt, 0.5), e > 0.97 ? 'hold' : 'catch'])
      }
    }
  } else {
    ball.position.set(ballXZ.x, BALL_R, ballXZ.z)
  }
  reaches.forEach(([f, p, kind, u]) => {
    if (kind === 'shoot') shootGrip(f, p)
    else if (kind === 'shotFollow') shotFollow(f, p, u)
    else if (kind === 'cross') crossArms(f, u)
    else if (kind === 'dribble') {
      const hy = Math.max(ball.position.y, 0.62) + BALL_R + bodyOf(f).handR * 0.8
      reach(f, -1, ball.position.clone().setY(hy), new THREE.Vector3(0, -1, 0).addScaledVector(sideOf(f), -0.4).addScaledVector(fwdOf(f), -0.15))
    } else if (kind === 'contest') reach(f, f.contestSide || 1, p, new THREE.Vector3(0, -0.3, 0).addScaledVector(sideOf(f), f.contestSide || 1))
    else holdBall(f, p)
  })
  keepOutOfBodies(ball.position)
  ball.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5)
  // spin: backspin on a shot (about two turns a second) and on a pass, a
  // slow roll while dribbled, rolling if it's loose, none in the hands
  const mv = ball.position.clone().sub(lastBall || ball.position).setY(0)
  lastBall = ball.position.clone()
  let axis = null; let rate = 0
  if (act && mv.lengthSq() > 1e-8) { axis = new THREE.Vector3().crossVectors(mv.clone().normalize(), new THREE.Vector3(0, 1, 0)); rate = act.type === 'shot' ? 13.8 : 9.4 }
  else if (dribbling) { axis = sideOf(carrier); rate = 3 }
  else if (!carrier && mv.length() / dt > 0.05) { axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), mv.clone().normalize()); rate = mv.length() / dt / BALL_R }
  if (axis) ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), rate * dt))
  nets.forEach((nt) => {
    const inside = Math.hypot(ball.position.x, ball.position.z - nt.z) < 0.25 && ball.position.y < 3.08 && ball.position.y > 2.45
    // stretch: pulled open while the ball is in it, springs back after
    nt.vs += ((inside ? 140 * (1 - nt.swish) : -55 * nt.swish) - 7 * nt.vs) * dt
    nt.swish += nt.vs * dt
    // swing: kicked along by the ball, then a few dying swings
    if (inside) { nt.vx += (mv.x / dt) * 2.2 * dt; nt.vz += (mv.z / dt) * 2.2 * dt }
    nt.vx += (-48 * nt.sx - 3.2 * nt.vx) * dt; nt.sx += nt.vx * dt
    nt.vz += (-48 * nt.sz - 3.2 * nt.vz) * dt; nt.sz += nt.vz * dt
    nt.sx = Math.max(-1.2, Math.min(1.2, nt.sx)); nt.sz = Math.max(-1.2, Math.min(1.2, nt.sz))
    updateNet(nt)
  })
}

// ── baked timeline ─────────────────────────────────────────────────────
// The motion above is simulated once, front to back, when the 3D view
// opens (or the play changes): every joint of every player, the ball and the nets, sampled
// SPS times per step. Playback then only reads (and blends between two
// neighbouring samples) — so jumping to any step or scrubbing backwards
// shows exactly what straight playback shows, each frame costs next to
// nothing, and an exported video would match the screen frame for frame.
const SPS = 60
let SAMPLES = 1
let FIGS = []
const PER_FIG = 7 + 15 * 7
const PER_BALL = 10
let BAKED = null
function bake() {
  const t0 = performance.now()
  SAMPLES = N * SPS + 1
  FIGS.forEach((f, i) => Object.assign(f, freshState(i)))
  flight = null; held = null; lastBall = null; ball.quaternion.identity()
  // the ball starts where the board puts it (not at the origin, from where it
  // would be seen flying in to the first carrier)
  const b0 = board.ballPos(0)
  ball.position.set(toX(b0.x), BALL_R, toZ(b0.y))
  nets.forEach((nt) => { Object.assign(nt, { swish: 0, vs: 0, sx: 0, vx: 0, sz: 0, vz: 0 }); updateNet(nt) })
  const figs = new Float32Array(SAMPLES * FIGS.length * PER_FIG)
  const balls = new Float32Array(SAMPLES * PER_BALL)
  const swish = new Float32Array(SAMPLES * nets.length * 3)
  const dt = STEP_SECS / SPS
  for (let i = 0; i < SAMPLES; i++) {
    simulate(Math.min(0.999999, i / (SAMPLES - 1)), dt)
    let o = i * FIGS.length * PER_FIG
    FIGS.forEach((f) => {
      f.root.position.toArray(figs, o); f.root.quaternion.toArray(figs, o + 3); o += 7
      f.bones.forEach((b) => { b.position.toArray(figs, o); b.quaternion.toArray(figs, o + 3); o += 7 })
    })
    ball.position.toArray(balls, i * PER_BALL); ball.quaternion.toArray(balls, i * PER_BALL + 3); ball.scale.toArray(balls, i * PER_BALL + 7)
    nets.forEach((nt, j) => { const o = (i * nets.length + j) * 3; swish[o] = nt.swish; swish[o + 1] = nt.sx; swish[o + 2] = nt.sz })
  }
  BAKED = { figs, balls, swish, ms: performance.now() - t0 }
}
const _qa = new THREE.Quaternion(); const _qb = new THREE.Quaternion(); const _va = new THREE.Vector3(); const _vb = new THREE.Vector3()
function applyBaked(t) {
  const u = Math.max(0, Math.min(1, t)) * (SAMPLES - 1)
  const i0 = Math.min(SAMPLES - 2, Math.floor(u)); const a = u - i0
  const { figs, balls, swish } = BAKED
  const blend = (arr, o0, o1, obj) => {
    obj.position.lerpVectors(_va.fromArray(arr, o0), _vb.fromArray(arr, o1), a)
    obj.quaternion.slerpQuaternions(_qa.fromArray(arr, o0 + 3), _qb.fromArray(arr, o1 + 3), a)
  }
  const stride = FIGS.length * PER_FIG
  FIGS.forEach((f, fi) => {
    let o0 = i0 * stride + fi * PER_FIG; let o1 = o0 + stride
    blend(figs, o0, o1, f.root); o0 += 7; o1 += 7
    // his facing, for anything that asks which way he looks (cameras)
    f.yaw = 2 * Math.atan2(f.root.quaternion.y, f.root.quaternion.w)
    f.bones.forEach((b) => { blend(figs, o0, o1, b); o0 += 7; o1 += 7 })
  })
  blend(balls, i0 * PER_BALL, (i0 + 1) * PER_BALL, ball)
  ball.scale.lerpVectors(_va.fromArray(balls, i0 * PER_BALL + 7), _vb.fromArray(balls, (i0 + 1) * PER_BALL + 7), a)
  nets.forEach((nt, j) => {
    const o0 = (i0 * nets.length + j) * 3; const o1 = ((i0 + 1) * nets.length + j) * 3
    const v = [0, 1, 2].map((k) => swish[o0 + k] * (1 - a) + swish[o1 + k] * a)
    if (Math.abs(v[0] - nt.swish) + Math.abs(v[1] - nt.sx) + Math.abs(v[2] - nt.sz) > 0.002) { nt.swish = v[0]; nt.sx = v[1]; nt.sz = v[2]; updateNet(nt) }
  })
}

function updateBlobs() {
  const m = new THREE.Matrix4(); let n = 0
  const put = (x, z, size) => { blobs.setMatrixAt(n++, m.makeScale(size, 1, size).setPosition(x, 0.006 + n * 0.0001, z)) }
  Object.values(figures).forEach((f) => {
    if (!f.root.visible) return
    const up = f.root.position.y
    put(f.root.position.x, f.root.position.z, Math.max(0.3, 0.95 - up * 1.6))
    ;[-1, 1].forEach((sd) => {
      const s = f.legs[sd].soleMark.getWorldPosition(new THREE.Vector3())
      if (s.y < 0.06) put(s.x, s.z, 0.34 * (1 - s.y / 0.06))
    })
  })
  const by = ball.position.y
  put(ball.position.x, ball.position.z, Math.max(0.12, 0.42 - by * 0.09))
  blobs.count = n
  blobs.instanceMatrix.needsUpdate = true
}

// ── view: camera, fading anyone right in front of the lens, draw ───────
function view(t) {
  const k = stepAtTime(t, N)
  const act = actsOf(play.ball).find((a) => a.step === k && a.pts.length)
  const carrier = !act && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const povId = figures[cam.povId] ? cam.povId : (EYE_FIGS.find((f) => f.p.team === 'off') || EYE_FIGS[0] || { p: {} }).p.id
  Object.values(figures).forEach((f) => { f.root.visible = !(cam.mode === 'pov' && f.p.id === povId) })
  extras.forEach(({ ent, mesh }) => { const p = board.entPos(ent, t, N, MARKS); mesh.position.set(toX(p.x), isBall(ent) ? BALL_R : 0, toZ(p.y)) })
  scene.updateMatrixWorld()
  updateBlobs()
  // camera
  if (cam.mode === 'pov' && figures[povId]) {
    const me = figures[povId]
    const eye = me.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0))
    const hasBall = carrier === me
    const target = hasBall ? hoopAt(me.root.position.z).clone().setY(2.2) : ball.position.clone().setY(Math.max(1.2, ball.position.y))
    const dir = target.clone().sub(eye).setY(0).normalize()
    camera.position.copy(eye.addScaledVector(dir, -0.35))
    look = look ? look.lerp(target, 0.08) : target
  } else {
    // low, on the court behind the play, looking at where the ball is. On a
    // full court the camera takes the half the ball is in.
    const far = courtView === 'full' && ball.position.z > 14
    const bz = far ? 28 - ball.position.z : ball.position.z
    const camZ = far ? 28 - 18.6 : 18.6
    camera.position.set(0, 1.9, camPosZ === null ? camZ : (camPosZ += (camZ - camPosZ) * 0.08))
    camPosZ = camera.position.z
    const tz = Math.min(9, bz) * 0.5 + 1.5
    // a tall picture tips down a little, so the court fills it rather than the dark hall above
    const lookY = 1.25 - (W < H ? 5.5 * (1 - W / H) : 0)
    const target = new THREE.Vector3(ball.position.x * 0.35, lookY, far ? 28 - tz : tz)
    look = look ? look.lerp(target, 0.06) : target
  }
  camera.lookAt(look)
  Object.values(figures).forEach((f) => {
    const d = Math.hypot(f.root.position.x - camera.position.x, f.root.position.z - camera.position.z)
    // fades out from about 3.6 m in to 1.2 m, and down to only a hint of
    // him right in front of the lens
    const op = Math.max(0.1, Math.min(1, (d - 1.2) / 2.4))
    f.mats.forEach((m) => { const tr = op < 0.99 || m.map != null; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true } m.opacity = op; m.depthWrite = op > 0.99 || m.map != null })
    // a faded player (right in front of the lens) gets no outline and no
    // eyes — on a see-through body those would float in the air
    f.op = op
    f.root.traverse((c) => { if (c.isSkinnedMesh) { if (op < 0.99) c.layers.disable(1); else c.layers.enable(1) } })
    const faded = op < 0.99
    f.preMesh.visible = faded
    // pre-pass right before the body, after everything opaque; one pair
    // per player so overlapping faded players each stay even
    const ro = 10 + EYE_FIGS.indexOf(f) * 2
    f.preMesh.renderOrder = ro; f.bodyMesh.renderOrder = faded ? ro + 1 : 0
    // shirt numbers after the body, on top of it
    f.root.traverse((c) => { if (c.isMesh && c.material === f.mats[1]) c.renderOrder = faded ? ro + 1.5 : 0 })
  })
  updateEyes(t)
  const kStep = stepAtTime(t, N)
  routeGroups.forEach((g, i) => { g.visible = showPaths && i === kStep - 1 })
  const holder = holderAt(t)
  carrierRing.visible = !!holder && holder.root.visible
  if (holder) carrierRing.position.set(holder.root.position.x, 0.014, holder.root.position.z)
  renderFrame()
}
let camPosZ = null
const frame = (t) => { applyBaked(t); view(t) }

// ── paths on the floor ────────────────────────────────────────────────
// What the 2D court draws for the step being played, laid on the floor: each
// action's route (a wavy line for a dribble, dashes for a pass, dots for a
// shot, a long-short dash for a handoff, a bar across the end of a screen),
// white with a dark edge so it reads on light wood and on the painted key
// alike. One group per step; only the current step's is shown.
let routeGroups = []
let showPaths = true
const inkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
const edgeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
// Laid as thin tubes, not flat ribbons: a flat line seen from a low camera
// shrinks to almost nothing, a tube looks the same thickness from anywhere.
const ROUTE_Y = 0.05
const ROUTE_R = 0.065 // the line's radius, metres
const EDGE = 0.035 // the dark edge round it
// the 2D board's own curve: a quadratic through each point to the next midpoint
function curveSample(pts) {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  let a = pts[0]
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]; const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }
    for (let j = 1; j <= 10; j++) { const u = j / 10; out.push({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * m.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * m.y }) }
    a = m
  }
  out.push(pts[pts.length - 1])
  return out
}
// a squiggle laid along the path (court units, as the 2D board's wavy())
function waveSample(pts) {
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
  const total = pts.slice(1).reduce((n, p, i) => n + d(pts[i], p), 0)
  const out = []
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i]; const len = d(a, b)
    if (!len) continue
    const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len
    for (let u = 0; u < len; u += 4) {
      const k = acc + u
      const fade = Math.max(0, Math.min(1, k / 24, (total - k) / 24))
      const amp = 10 * fade * Math.sin((k / 46) * Math.PI * 2)
      out.push({ x: a.x + (b.x - a.x) * (u / len) + nx * amp, y: a.y + (b.y - a.y) * (u / len) + ny * amp })
    }
    acc += len
  }
  out.push(pts[pts.length - 1])
  return out
}
// a tube of radius r along a polyline (world x/z), six-sided
const TUBE_SIDES = 6
function addTube(arr, line, r) {
  const ring = (i) => {
    const a = line[Math.max(0, i - 1)]; const b = line[Math.min(line.length - 1, i + 1)]
    const dx = b.x - a.x; const dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1
    const sx = -dz / l; const sz = dx / l
    const out = []
    for (let k = 0; k < TUBE_SIDES; k++) {
      const th = (k / TUBE_SIDES) * Math.PI * 2
      out.push([line[i].x + sx * Math.cos(th) * r, ROUTE_Y + Math.sin(th) * r, line[i].z + sz * Math.cos(th) * r])
    }
    return out
  }
  let prev = ring(0)
  for (let i = 1; i < line.length; i++) {
    const cur = ring(i)
    for (let k = 0; k < TUBE_SIDES; k++) {
      const k2 = (k + 1) % TUBE_SIDES
      arr.push(...prev[k], ...prev[k2], ...cur[k], ...prev[k2], ...cur[k2], ...cur[k])
    }
    prev = cur
  }
}
// the part of a polyline between arc lengths s0 and s1
function slice(line, cum, s0, s1) {
  const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return { x: line[i - 1].x + (line[i].x - line[i - 1].x) * u, z: line[i - 1].z + (line[i].z - line[i - 1].z) * u } }
  const out = [at(s0)]
  for (let i = 1; i < line.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(line[i])
  out.push(at(s1))
  return out
}
function addStroke(arr, line, hw, dash) {
  if (line.length < 2) return
  if (!dash) { addTube(arr, line, hw); return }
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z))
  const total = cum[cum.length - 1]
  const period = dash.reduce((n, v) => n + v, 0)
  for (let s = 0; s < total;) {
    let on = true
    for (const v of dash) {
      if (on) addTube(arr, slice(line, cum, s, Math.min(total, s + v)), hw)
      s += v; on = !on
      if (s >= total) break
    }
    if (period <= 0) break
  }
}
function addArrow(arr, line, hw) {
  const a = line[line.length - 2]; const b = line[line.length - 1]
  const l = Math.hypot(b.x - a.x, b.z - a.z)
  if (l < 1e-6) return
  const dx = (b.x - a.x) / l; const dz = (b.z - a.z) / l
  const grow = hw - ROUTE_R
  const tip = [b.x + dx * (0.2 + grow), ROUTE_Y, b.z + dz * (0.2 + grow)]
  const base = { x: b.x - dx * 0.16, z: b.z - dz * 0.16 }
  const rr = 0.13 + grow
  const sx = -dz; const sz = dx
  const rim = []
  for (let k = 0; k < 8; k++) { const th = (k / 8) * Math.PI * 2; rim.push([base.x + sx * Math.cos(th) * rr, ROUTE_Y + Math.sin(th) * rr, base.z + sz * Math.cos(th) * rr]) }
  for (let k = 0; k < 8; k++) arr.push(...tip, ...rim[k], ...rim[(k + 1) % 8])
}
const toLine = (pts) => pts.map((p) => ({ x: toX(p.x), z: toZ(p.y) }))
function buildRoutes() {
  routeGroups.forEach((g) => { scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose() }) })
  routeGroups = []
  const cmap = CARRIERS
  const all = play.players.filter((p) => !isCone(p)).concat([Object.assign({ id: 'ball' }, play.ball)])
  for (let k = 1; k <= N; k++) {
    const ink = []; const edge = []
    all.forEach((ent) => {
      actsOf(ent).forEach((act) => {
        if (act.step !== k || !act.pts.length) return
        const start = ent.id === 'ball' ? board.ballStart(k, cmap) : isBall(ent) ? board.ballStart(k, null, ent) : baseAt(ent, k)
        const pts = [start].concat(act.pts)
        if (pts.length < 2) return
        const ty = act.type
        const line = toLine(ty === 'dribble' ? waveSample(pts) : curveSample(pts))
        const dash = ty === 'pass' ? [0.34, 0.26] : ty === 'shot' ? [0.06, 0.26] : ty === 'handoff' ? [0.02, 0.12, 0.22, 0.12] : null
        for (const [arr, hw] of [[edge, ROUTE_R + EDGE], [ink, ROUTE_R]]) {
          addStroke(arr, line, hw, dash)
          if (ty !== 'screen') addArrow(arr, line, hw)
        }
        if (ty === 'screen') {
          const a = pts[pts.length - 2]; const b = pts[pts.length - 1]
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const nx = -(b.y - a.y) / l; const ny = (b.x - a.x) / l
          const bar = toLine([{ x: b.x - nx * 46, y: b.y - ny * 46 }, { x: b.x + nx * 46, y: b.y + ny * 46 }])
          addTube(edge, bar, ROUTE_R + EDGE); addTube(ink, bar, ROUTE_R)
        }
      })
    })
    const g = new THREE.Group()
    ;[[edge, edgeMat, 2], [ink, inkMat, 3]].forEach(([arr, mat, order]) => {
      if (!arr.length) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
      const m = new THREE.Mesh(geo, mat)
      m.renderOrder = order; m.frustumCulled = false
      g.add(m)
    })
    g.visible = false
    scene.add(g)
    routeGroups.push(g)
  }
}

// ── who has the ball: a ring on the floor ──────────────────────────────
const ringGeo = new THREE.RingGeometry(0.52, 0.62, 48).rotateX(-Math.PI / 2)
const discGeo = new THREE.CircleGeometry(0.52, 48).rotateX(-Math.PI / 2)
const carrierRing = new THREE.Group()
carrierRing.add(new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.2, depthWrite: false })))
carrierRing.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.95, depthWrite: false })))
carrierRing.children.forEach((m) => { m.renderOrder = 3; m.frustumCulled = false })
carrierRing.visible = false
scene.add(carrierRing)
// the holder: whoever carries it; on a pass, the passer until half way, then
// the one it is going to; on a shot, the shooter until it has left his hands
function holderAt(t) {
  const k = stepAtTime(t, N)
  const fr = Math.max(0, Math.min(0.999999, t)) * N - (k - 1)
  const act = actsOf(play.ball).find((a) => a.step === k && a.pts.length)
  let who = null
  if (!act) who = CARRIERS[k]
  else if (act.type === 'shot') who = fr < 0.3 ? CARRIERS[k] : null
  else who = fr < 0.5 ? CARRIERS[k] : CARRIERS[k + 1]
  return who ? figures[who.id] || null : null
}

// ── playback in the app ────────────────────────────────────────────────
// At most 30 frames a second (plenty for a tactics replay, and it halves
// the battery drain of 60), nothing drawn at all while nothing changes,
// and three quality levels — stepping down by itself if drawing keeps
// taking longer than a frame on this device.
const QUALITY = {
  high: { pr: Math.min(window.devicePixelRatio || 1, 2), shadows: true, map: 2048 },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, map: 1024 },
  low: { pr: 1, shadows: false, map: 512 },
}
let quality = (navigator.maxTouchPoints || 0) > 0 ? 'medium' : 'high'
function setQuality(q) {
  const Q = QUALITY[q]
  quality = q
  renderer.setPixelRatio(Q.pr)
  sizeComposer()
  renderer.shadowMap.enabled = Q.shadows
  sun.shadow.mapSize.set(Q.map, Q.map)
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null }
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true }) })
}
setQuality(quality)

let target = 0; let dirty = false; let raf = 0; let lastDraw = 0; let slow = 0; let disposed = false
function schedule() { if (!raf && !disposed) raf = requestAnimationFrame(tick) }
function tick(ts) {
  raf = 0
  if (!dirty || !BAKED) return
  if (ts - lastDraw < 1000 / 30 - 2) { schedule(); return }
  lastDraw = ts; dirty = false
  const c0 = performance.now()
  frame(target)
  slow = performance.now() - c0 > 30 ? slow + 1 : Math.max(0, slow - 1)
  if (slow > 20 && quality !== 'low') { setQuality(quality === 'high' ? 'medium' : 'low'); slow = 0 }
}

let figKey = null
return {
  // The board to show: the same state object the 2D court draws.
  setBoard(s) {
    play = s
    courtView = s.view || 'half'
    board = makeBoard(s)
    N = board.nSteps(); MARKS = board.marks(); CARRIERS = board.carriers()
    const people = s.players.filter((p) => p.team === 'off' || p.team === 'def')
    const key = people.map((p) => p.id + ':' + p.team + ':' + p.label).join('|')
    if (key !== figKey) { buildFigures(people); figKey = key }
    buildExtras(s.players)
    FIGS = Object.values(figures)
    bake()
    buildRoutes()
    camPosZ = null; look = null
    dirty = true; schedule()
  },
  setPaths(on) { showPaths = !!on; dirty = true; schedule() },
  setCourtView(v) { if (v !== courtView) { courtView = v; camPosZ = null; look = null; dirty = true; schedule() } },
  setCamera(mode, povId) { cam.mode = mode; cam.povId = povId || null; look = null; dirty = true; schedule() },
  render(t) { target = Math.max(0, Math.min(1, t)); dirty = true; schedule() },
  resize() {
    const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight)
    if (w === W && h === H) return
    W = w; H = h
    renderer.setSize(W, H, false); fitLens(); sizeComposer()
    dirty = true; schedule()
  },
  // the people on the board, for choosing whose eyes to look through
  players() { return EYE_FIGS.map((f) => f.p) },
  dispose() {
    disposed = true
    cancelAnimationFrame(raf)
    EYE_FIGS.forEach(disposeFigure)
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) [].concat(o.material).forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose() }); m.dispose() })
    })
    ;[maskRT, netRT, bgRT, blurRT].forEach((rt) => rt.dispose())
    composer.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  },
}
}
