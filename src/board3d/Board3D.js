import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { makeBoard, stepAtTime, stepSecs, actsOf, baseAt, isCone, isBall, STEP_SECS } from '../lib/board-geometry'
import { COND } from '../theme'
import { ROUTE_COLORS } from './routeColors'

// The 3D view of the tactics board: the same play, seen from the court.
// View only — editing stays in the 2D top view. It reads the board the way
// the 2D court does (makeBoard: paths, carriers, marks), plays the motion
// out once into a baked timeline, and then only has to draw frames of it.
//
//   const view = await createBoard3D(containerElement)
//   view.setBoard(state)          // players, ball, steps … (re-bakes)
//   view.setCourtView('half' | 'full')
//   view.setPaths(true | false)   // the step's routes drawn on the floor
//   view.setQuality('high' | 'medium' | 'low' | 'export')
//   view.setCamera('court' | 'pov' | 'free' | 'overview', playerId)
//   view.renderNow(t)             // draws that frame right now (video export)
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
let STEPD = [STEP_SECS] // how long each step takes, in seconds (long paths stretch it)

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
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tNet: { value: null }, resolution: { value: new THREE.Vector2() }, px: { value: 1.6 }, taps: { value: 8 }, near: { value: 0.05 }, far: { value: 160 }, ink: { value: new THREE.Color(0x08080a) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNet; uniform vec2 resolution; uniform float px; uniform float taps; uniform float near; uniform float far; uniform vec3 ink;
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
        if (float(i) >= taps) break;
        float a = float(i) * 6.283185 / taps;
        float zn = lin(texture2D(tDepth, vUv + o * vec2(cos(a), sin(a))).r);
        float thr = 0.03 * zn + 0.06;
        e = max(e, smoothstep(thr, thr * 1.8, zc - zn));
      }
      // close to the lens: soften (disc of 8 taps, wider the nearer it is)
      float nearF = 1.6;
      if (zc < nearF) {
        float rr = px * 3.5 * (1.0 - zc / nearF);
        vec4 acc = col;
        for (int i = 0; i < 8; i++) { if (float(i) >= taps) break; float a = float(i) * 6.283185 / taps + 0.39; acc += texture2D(tDiffuse, vUv + rr / resolution * vec2(cos(a), sin(a))); }
        col = acc / (taps + 1.0);
        e *= zc / nearF;
      }
      // the net's strands sit in front of whatever line is behind them
      e *= 1.0 - texture2D(tNet, vUv).r;
      gl_FragColor = vec4(mix(col.rgb, ink, e * 0.9), col.a);
    }`,
}
// what the quality level switches (see QUALITY further down): the soft
// background's resolution and blur, whether the nets get their own pass
const qual = { bgScale: 0.5, bgBlur: true, nets: true, reflectScale: 0.5 }
// the glossy floor's mirror (see below), sized with the picture
let reflector = null
// the scoreboard over centre court (left out of the video, where it only gets in the way)
let scoreboard = null
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
// A light colour grade on the linear picture, before tone mapping, like a
// broadcast: shadows a touch cool, highlights a touch warm, slightly more
// contrast and colour, and the corners drawn in a little.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, aspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float aspect; varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.01, 0.94), smoothstep(0.04, 0.9, l));
      c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(1.07));
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, 1.07);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - 0.3 * smoothstep(0.42, 1.0, length(d) * 1.25);
      gl_FragColor = vec4(c, t.a);
    }`,
}
const gradePass = new ShaderPass(GradeShader)
// FXAA last, on the finished picture: smooths the stair-steps on lines and
// outlines in the distance
const fxaaPass = new ShaderPass(FXAAShader)
composer.addPass(renderPass); composer.addPass(compositePass); composer.addPass(outlinePass); composer.addPass(gradePass); composer.addPass(new OutputPass()); composer.addPass(fxaaPass)
renderer.setClearColor(0x000000, 0)
function sizeComposer() {
  const pr = renderer.getPixelRatio()
  composer.setPixelRatio(pr); composer.setSize(W, H)
  maskRT.setSize(Math.round(W * pr), Math.round(H * pr))
  netRT.setSize(Math.round(W * pr), Math.round(H * pr))
  outlinePass.uniforms.resolution.value.set(W * pr, H * pr)
  gradePass.uniforms.aspect.value = W / H
  // the line is 2.4 px on a picture about 1130 px across the diagonal; on a
  // phone, where everything is smaller, it shrinks with it (never below half)
  outlinePass.uniforms.px.value = 2.4 * Math.max(0.5, Math.min(1, Math.hypot(W, H) / 1130)) * pr
  fxaaPass.material.uniforms.resolution.value.set(1 / (W * pr), 1 / (H * pr))
  const bw = Math.max(1, Math.round(W * pr * qual.bgScale)); const bh = Math.max(1, Math.round(H * pr * qual.bgScale))
  bgRT.setSize(bw, bh); blurRT.setSize(bw, bh)
  bgTexel.set(1 / bw, 1 / bh)
  if (reflector) {
    const rw = Math.max(1, Math.round(W * pr * qual.reflectScale)); const rh = Math.max(1, Math.round(H * pr * qual.reflectScale))
    reflector.getRenderTarget().setSize(rw, rh)
    reflector.material.uniforms.texel.value.set(1 / rw, 1 / rh)
  }
}
const bgTexel = new THREE.Vector2()
renderer.shadowMap.autoUpdate = false
function renderFrame() {
  const bg = scene.background
  // 0) the background layer, then blurred (horizontal, vertical)
  camera.layers.set(BG_LAYER)
  renderer.setRenderTarget(bgRT); renderer.setClearColor(bg || 0x000000, 1); renderer.clear(); scene.background = bg; renderer.render(scene, camera)
  renderer.setClearColor(0x000000, 0)
  // (the low level skips the blur: a small picture stretched up is soft anyway)
  if (qual.bgBlur) {
    const spread = BG_BLUR / 2 / 3 // half-res texels, gaussian sigma ≈ 3 taps
    blurMat.uniforms.t.value = bgRT.texture; blurMat.uniforms.dir.value.set(bgTexel.x * spread, 0)
    renderer.setRenderTarget(blurRT); blurQuad.render(renderer)
    blurMat.uniforms.t.value = blurRT.texture; blurMat.uniforms.dir.value.set(0, bgTexel.y * spread)
    renderer.setRenderTarget(bgRT); blurQuad.render(renderer)
  }
  compositePass.uniforms.tBg.value = bgRT.texture
  // 1) depth of the outlined things only — no shadows, no background
  scene.background = null; scene.overrideMaterial = maskMat; camera.layers.set(1)
  renderer.setRenderTarget(maskRT); renderer.clear(); renderer.render(scene, camera)
  // net coverage, on top of that depth
  if (qual.nets) {
    renderer.autoClear = false
    renderer.setRenderTarget(netRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false)
    scene.overrideMaterial = netCovMat; camera.layers.set(NET_LAYER); renderer.render(scene, camera)
    renderer.autoClear = true
  }
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
let lensPov = false
let lensOver = false
// Where the overview camera (the video) stands and what it looks at: high
// behind the half-court line (behind the baseline on a full court). A wide
// picture can come in closer and lower than a tall one. `dist` is the way
// from the lens to the point it looks at, for the lens below.
function overviewRig(full, wide) {
  if (wide) return full ? { y: 14, z: 39, tz: 12, dist: 30.4, minFov: 40 } : { y: 10, z: 22, tz: 4.5, dist: 19, minFov: 30 }
  return full ? { y: 11.5, z: 35.5, tz: 12, dist: 26.2, minFov: 40 } : { y: 10.5, z: 23, tz: 5.5, dist: 20.4, minFov: 40 }
}
function fitLens() {
  const a = W / H
  if (lensOver) {
    // wide enough that the whole width of the court is in the picture,
    // whatever shape the picture is
    const rig = overviewRig(courtView === 'full', a >= 1)
    const fov = Math.max(rig.minFov, Math.min(90, (2 * Math.atan(8.4 / rig.dist / a) * 180) / Math.PI))
    camera.aspect = a
    if (camera.fov !== fov) camera.fov = fov
    camera.updateProjectionMatrix()
    return
  }
  // through his own eyes the lens is wider, to take in the hands as well
  const fov = lensPov ? (a < 1 ? 100 : 80) : a < 1 ? Math.min(72, 50 / Math.max(0.6, a)) : 50
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
const spots = []
for (const z of [6, 22]) { const s = new THREE.PointLight(0xffe2b8, 12, 24); s.position.set(0, 9, z); scene.add(s); spots.push(s) }

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
// ── the glossy floor ───────────────────────────────────────────────────
// A varnished court mirrors the players, the ball and the hoops a little,
// most of all where you look across it at a low angle. The scene is drawn
// once more from under the floor (small, and only on the top level),
// smeared along the way you look, and laid over the wood as a see-through
// layer that gets stronger the shallower the view.
const ReflectShader = {
  name: 'FloorMirror',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, strength: { value: 1 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texel; uniform float strength; uniform vec3 color; varying vec4 vUv; varying vec3 vWorld;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      vec4 acc = vec4(0.0); float tw = 0.0;
      for (int i = -4; i <= 4; i++) {
        float f = float(i); float w = exp(-f * f / 9.0);
        acc += texture2D(tDiffuse, uv + vec2(f * 0.3, f * 1.8) * texel) * w; tw += w;
      }
      acc /= tw;
      vec3 v = normalize(cameraPosition - vWorld);
      float fr = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
      gl_FragColor = vec4(acc.rgb, acc.a * strength * mix(0.09, 0.5, fr));
    }`,
}
reflector = new Reflector(new THREE.PlaneGeometry(15, 28), { shader: ReflectShader, textureWidth: 256, textureHeight: 256, multisample: 0, clipBias: 0.003 })
reflector.rotation.x = -Math.PI / 2
reflector.position.set(0, 0.003, 14)
Object.assign(reflector.material, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
reflector.renderOrder = 0.5
reflector.visible = false
scene.add(reflector)
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
  // the lettering has the same vertical gold gradient as the app's title:
  // pale at the top, gold in the middle, deep amber at the foot
  const tg = g.createLinearGradient(0, 28, 0, 76); tg.addColorStop(0, '#fff1c9'); tg.addColorStop(0.46, '#e8b13c'); tg.addColorStop(1, '#9a6614')
  g.fillStyle = tg; g.font = `italic 800 64px ${COND}`; g.letterSpacing = '1px'; g.textAlign = 'center'; g.textBaseline = 'middle'
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

  // ── between the boards and the stands ───────────────────────────────
  // The strip round the court used to be bare dark floor. Now: a darker
  // painted run-off with the same planks, a soft gold glow along the foot of
  // the boards, a low wall in front of the stands, the team benches with
  // their coaches behind the boards and the scorer's table on the other side.
  // All of it is sharp (not part of the soft background).
  const skins = [0x8d5524, 0xc68642, 0x5c3a21, 0xe0ac69, 0xa0662f, 0xf1c27d]
  const hairs = [0x1a120c, 0x2b1d14, 0x0e0b09, 0x4a3020]
  const paint = (g, hex) => {
    g.deleteAttribute('uv'); const c = new THREE.Color(hex); const n = g.attributes.position.count; const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g
  }
  const bx = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex)
  const sp = (r, x, y, z, hex, sy = 1) => paint(new THREE.SphereGeometry(r, 10, 8).scale(1, sy, 1).translate(x, y, z), hex)
  const parts = [] // everything with people and furniture, one mesh
  const put = (geos, yaw, x, z) => { geos.forEach((g) => parts.push(g.rotateY(yaw).translate(x, 0, z))) }
  let seed = 5; const rn = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const pick = (arr) => arr[Math.floor(rn() * arr.length)]
  // one person, facing +z (turned by put()): sitting, standing or crouching with a camera
  const faceOf = (y, z, skin, hair) => [sp(0.115, 0, y, z, skin), sp(0.12, 0, y + 0.035, z - 0.02, hair, 0.78)]
  const sitting = (shirt, shorts, shoe, skin, hair) => [
    bx(0.36, 0.15, 0.4, 0, 0.5, 0.12, shorts),
    ...[-1, 1].flatMap((k) => [bx(0.12, 0.42, 0.12, k * 0.09, 0.24, 0.31, skin), bx(0.13, 0.07, 0.22, k * 0.09, 0.04, 0.36, shoe), bx(0.09, 0.09, 0.3, k * 0.24, 0.66, 0.16, skin), bx(0.1, 0.42, 0.1, k * 0.25, 0.8, 0.02, shirt)]),
    bx(0.38, 0.5, 0.24, 0, 0.84, 0, shirt), ...faceOf(1.2, 0.03, skin, hair),
  ]
  const standing = (shirt, pants, skin, hair, vest) => [
    ...[-1, 1].flatMap((k) => [bx(0.13, 0.82, 0.14, k * 0.09, 0.41, 0, pants), bx(0.1, 0.56, 0.1, k * 0.26, 1.08, 0, shirt)]),
    bx(0.4, 0.62, 0.25, 0, 1.12, 0, vest || shirt), ...faceOf(1.58, 0.01, skin, hair),
  ]
  const GOLDK = 0xd9ad4a; const DARKK = 0x1c1d22
  // benches behind the right-hand board: gold team, then the dark team
  const bench = (zc, len, kit, shorts, shoe, n) => {
    parts.push(bx(0.5, 0.06, len, 10.0, 0.45, zc, 0x2b2b30), bx(0.06, 0.45, len, 10.28, 0.7, zc, 0x232328))
    for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) parts.push(bx(0.4, 0.45, 0.06, 10.0, 0.22, zc + dz, 0x232328))
    for (let i = 0; i < n; i++) put(sitting(kit, shorts, shoe, pick(skins), pick(hairs)), -Math.PI / 2, 10.0, zc - len / 2 + 0.45 + i * ((len - 0.9) / (n - 1)))
  }
  bench(10, 4.8, GOLDK, GOLDK, 0xf4f4f4, 6)
  bench(18, 4.8, DARKK, DARKK, 0xf4f4f4, 6)
  put(standing(0x2a2a32, 0x1a1a1f, pick(skins), hairs[2]), -Math.PI / 2, 9.6, 8.9)
  put(standing(0x2a2a32, 0x1a1a1f, pick(skins), hairs[0]), -Math.PI / 2, 9.6, 19.2)
  // the scorer's table opposite, with the officials behind it
  parts.push(bx(0.6, 1.0, 4.4, -9.85, 0.5, 14, 0x24242a), bx(0.04, 0.12, 4.4, -9.53, 0.8, 14, 0xe8b13c), bx(0.7, 0.04, 4.5, -9.85, 1.02, 14, 0x3a3a40))
  for (const z of [12.4, 13.5, 14.5, 15.6]) put(sitting(pick([0x9a9aa1, 0xcacacd, 0x5e5e66]), 0x1a1a1f, 0x15151a, pick(skins), pick(hairs)), Math.PI / 2, -10.3, z)
  const stuff = new THREE.Mesh(mergeGeometries(parts), envMat({ color: 0xffffff, vertexColors: true }))
  stuff.castShadow = true; stuff.layers.enable(1); scene.add(stuff)
  // the laptops on the table
  const lap = new THREE.Mesh(mergeGeometries([12.7, 13.8, 14.8].map((z) => new THREE.BoxGeometry(0.03, 0.2, 0.32).rotateZ(0.25).translate(-9.7, 1.14, z))), new THREE.MeshBasicMaterial({ color: 0xb8dcff }))
  scene.add(lap)
  // a low wall in front of the stands
  const wallM = envMat({ color: 0x1e1e24 })
  const lowWall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), wallM); m.position.set(x, 0.4, z); scene.add(m) }
  lowWall(0.18, 34.6, -10.5, 14); lowWall(0.18, 34.6, 10.5, 14); lowWall(21.2, 0.18, 0, -4.6); lowWall(21.2, 0.18, 0, 32.6)
  // the painted run-off: dark planks, and a thin gold line round the court
  const runoff = (() => {
    const W2 = 21; const L2 = 37; const PX = 56
    const c = document.createElement('canvas'); c.width = W2 * PX; c.height = L2 * PX
    const g = c.getContext('2d')
    const tones = ['#38332e', '#3b3631', '#35302b', '#3e3934', '#37322d']
    for (let x = 0, i = 0; x < c.width; x += 44, i++) { g.fillStyle = tones[(i * 7) % tones.length]; g.fillRect(x, 0, 44, c.height); g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(x, 0, 2, c.height) }
    const X = (m) => (m + W2 / 2) * PX; const Z = (m) => (m + 4.5) * PX
    g.strokeStyle = 'rgba(232,177,60,.8)'; g.lineWidth = 4
    g.strokeRect(X(-7.85), Z(-0.35), 15.7 * PX, 28.7 * PX)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W2, L2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }))
    m.rotation.x = -Math.PI / 2; m.position.set(0, -0.003, 14); m.receiveShadow = true
    return m
  })()
  scene.add(runoff)
  // a soft gold glow on the floor along the foot of every board
  const glowStrip = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 64
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(232,177,60,.55)'); gr.addColorStop(1, 'rgba(232,177,60,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64)
    return new THREE.CanvasTexture(c)
  })()
  const strip = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: glowStrip, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, ry, 0); m.position.set(x, 0.006, z); scene.add(m)
  }
  strip(34, -8.78, 14, Math.PI / 2); strip(34, 8.78, 14, -Math.PI / 2); strip(18.4, 0, -2.95, 0); strip(18.4, 0, 30.95, Math.PI)

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
  sb.position.set(0, 11.5, 14); scene.add(sb); scoreboard = sb
  // everything added since the stands began is soft background
  scene.children.filter((o) => !beforeBg.has(o)).forEach((o) => o.traverse((c) => c.layers.set(BG_LAYER)))
  // the lights light both layers
  scene.traverse((o) => { if (o.isLight) o.layers.enable(BG_LAYER) })
}

// ── light beams ────────────────────────────────────────────────────────
// A faint cone of light under each lamp, as in the haze of a hall: brighter
// near the lamp, fading towards the floor and at its edges. Top level only.
const beams = (() => {
  const H = 15.1; const geos = []
  for (const z of [1, 7.5, 14, 20.5, 27]) for (const x of [-7, -3.5, 3.5, 7]) geos.push(new THREE.ConeGeometry(2.5, H, 24, 1, true).translate(x, H / 2, z))
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
    fragmentShader: `varying vec3 vW; varying vec3 vN;
      void main() {
        float ax = clamp(vW.y / 15.1, 0.0, 1.0);
        float edge = pow(abs(dot(normalize(cameraPosition - vW), normalize(vN))), 1.8);
        float a = edge * (0.004 + 0.018 * ax * ax);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.64), a);
      }`,
  }))
  m.frustumCulled = false; m.renderOrder = 2; m.visible = false
  scene.add(m)
  return m
})()

// ── contact shadows ────────────────────────────────────────────────────
// A soft dark patch right under each player and a smaller, darker one
// under each foot that's on the floor — what makes a figure stand ON the
// court rather than hover over it. The ball gets one that shrinks and
// fades as it rises. All of it one instanced mesh.
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(0,0,0,.8)'); r.addColorStop(0.22, 'rgba(0,0,0,.52)'); r.addColorStop(0.55, 'rgba(0,0,0,.16)'); r.addColorStop(1, 'rgba(0,0,0,0)')
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
  off: { kit: GOLD, trim: 0x15151a, shoe: 0x15151a, sole: 0xf4f4f4, sock: 0xf4f4f4, band: 0x15151a, skin: SKIN, hair: HAIR },
  def: { kit: 0x1c1d22, trim: 0xf2f2f2, shoe: 0xf2f2f2, sole: 0x15151a, sock: 0xf4f4f4, band: 0xf2f2f2, skin: SKIN, hair: HAIR },
}
const HAIRSTYLES = ['band', 'short', 'bun', 'afro', 'buzz']
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
  const hair = style.hair || HAIRSTYLES[idx % HAIRSTYLES.length]
  const skinC = pal.skin[idx % pal.skin.length]; const hairC = pal.hair[idx % pal.hair.length]
  // collected pieces: outlined (the body) and detail (the face) separately
  const outlined = []; const detail = []; const armGeos = []
  const col = new THREE.Color()
  // blend (optional): [other bone, weight(y)] — shares each vertex with a
  // second joint by its height, so a piece can bend smoothly between two
  // cloth: how free a vertex is to swing and flutter (0 = fixed to the body,
  // 1 = a loose hem), with the axis it hangs round — see the body material
  let loose = null
  const put = (list, geo, color, bone, matrix, blend) => {
    const g = geo.clone(); g.deleteAttribute('uv')
    g.applyMatrix4(matrix)
    const n = g.attributes.position.count
    const ls = new Float32Array(n * 3)
    if (loose) for (let i = 0; i < n; i++) { ls[i * 3] = loose(g.attributes.position.getY(i)); ls[i * 3 + 1] = TOY_REST[TBI[bone]].x }
    g.setAttribute('loose', new THREE.BufferAttribute(ls, 3))
    g.translate(TOY_REST[TBI[bone]].x, TOY_REST[TBI[bone]].y, 0)
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
    // the arms again on their own, for the first-person view
    if (list === outlined && /^(sh|el)[LR]$/.test(bone)) armGeos.push(g)
  }
  const M = (x = 0, y = 0, z = 0, rot = null, scl = null) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))), new THREE.Vector3(...(scl || [1, 1, 1])))
  const add = (geo, color, bone, x, y, z, rot, scl, blend) => put(outlined, geo, color, bone, M(x, y, z, rot, scl), blend)
  // torso: a tank top turned on a lathe — a hem that falls a little loose
  // over the shorts, waist, chest, then in to the shoulders. The hem moves
  // with the hips (like the shorts under it, so they never cut through it),
  // the chest with the spine, the belly blends between the two.
  const prof = [[0.0, -0.078], [0.101, -0.078], [0.1045, -0.0755], [0.1055, -0.07], [0.105, -0.063], [0.1, -0.02], [0.108, 0.07], [0.112, 0.15], [0.1, 0.22], [0.07, 0.262], [0.0, 0.265]].map(([r, y]) => new THREE.Vector2(r, y))
  const smooth = (a, b, v) => { const h = Math.min(1, Math.max(0, (v - a) / (b - a))); return h * h * (3 - 2 * h) }
  loose = (y) => 1 - smooth(-0.078, 0.05, y)
  add(new THREE.LatheGeometry(prof, 40), pal.kit, 'spine', 0, 0, 0, null, [1, 1, 0.7], ['pelvis', (y) => 1 - smooth(0.4, 0.5, y)])
  loose = null
  add(new THREE.CylinderGeometry(0.036, 0.04, 0.06, 10, 1, true), skinC, 'head', 0, 0.01, 0)
  // shorts: hip piece (its waistband under the vest's hem) plus a tube per
  // leg, white hem at the bottom
  add(new THREE.CylinderGeometry(0.09, 0.106, 0.085, 40), pal.kit, 'pelvis', 0, -0.0075, 0, null, [1, 1, 0.7])
  // trim on the jersey: round the neck, the arm holes and the hem
  add(new THREE.TorusGeometry(0.056, 0.0065, 6, 28).rotateX(Math.PI / 2), pal.trim, 'spine', 0, 0.262, 0, null, [1, 1, 0.8])
  loose = () => 1
  add(new THREE.TorusGeometry(0.1035, 0.0048, 6, 44).rotateX(Math.PI / 2), pal.trim, 'pelvis', 0, -0.019, 0, null, [1, 1, 0.7])
  loose = null
  for (const sd of [-1, 1]) add(new THREE.TorusGeometry(0.047, 0.0058, 6, 24).rotateY(Math.PI / 2), pal.trim, 'chest', sd * 0.1, 0.048, 0, null, [1, 1, 0.8])
  for (const S of ['L', 'R']) {
    loose = (y) => 1 - smooth(-0.116, -0.01, y)
    add(new THREE.CylinderGeometry(0.06, 0.063, 0.125, 14, 1, true), pal.kit, 'hip' + S, 0, -0.055, 0)
    loose = () => 1
    add(new THREE.TorusGeometry(0.0625, 0.0065, 4, 16), pal.trim, 'hip' + S, 0, -0.116, 0, [Math.PI / 2, 0, 0])
    loose = null
    add(new THREE.CapsuleGeometry(0.041, 0.13, 2, 10), skinC, 'hip' + S, 0, -0.085, 0)
    add(new THREE.SphereGeometry(0.0395, 20, 14), skinC, 'knee' + S)
    add(new THREE.CapsuleGeometry(0.036, 0.12, 2, 10), skinC, 'knee' + S, 0, -0.075, 0)
    // sock: its own tube, a touch wider than the shin, so the edge is a clean line
    add(new THREE.CylinderGeometry(0.0405, 0.039, 0.07, 12, 1, true), pal.sock, 'knee' + S, 0, -0.123, 0)
    add(new THREE.CapsuleGeometry(0.039, 0.075, 3, 10), pal.shoe, 'ankle' + S, 0, -0.012, 0.022, [Math.PI / 2, 0, 0], [1.22, 1, 0.95])
    // a thick sole in the other colour, and a lace panel on top
    add(new THREE.CapsuleGeometry(0.04, 0.078, 3, 10), pal.sole, 'ankle' + S, 0, -0.04, 0.022, [Math.PI / 2, 0, 0], [1.27, 1.04, 0.3])
    add(new THREE.SphereGeometry(0.02, 12, 8), pal.sole, 'ankle' + S, 0, 0.019, 0.047, null, [1.15, 0.5, 1.5])
    // calf and thigh give the leg some shape
    add(new THREE.SphereGeometry(0.034, 14, 10), skinC, 'knee' + S, 0, -0.07, -0.012, null, [1, 1.5, 1.05])
    add(new THREE.SphereGeometry(0.043, 14, 10), skinC, 'hip' + S, 0, -0.05, 0.004, null, [1.04, 1.45, 1.05])
  }
  // arms along x (T-pose), bending at the elbow
  for (const [side, S] of [[-1, 'L'], [1, 'R']]) {
    // tapered: fuller at the shoulder, slimmer to the elbow and wrist
    // (a cylinder's top end turns to face along +x·side with this roll)
    const roll = [0, 0, -side * Math.PI / 2]
    // Each joint is a finely rounded ball exactly as wide as the tube that
    // ends in it, riding on the limb that turns about it — so the tube's rim
    // always sits on the ball's surface and the outline stays one clean curve.
    add(new THREE.SphereGeometry(0.0435, 28, 18), skinC, 'sh' + S)
    add(new THREE.CylinderGeometry(0.0335, 0.0435, 0.188, 28, 1, true), skinC, 'sh' + S, side * 0.094, 0, 0, roll)
    add(new THREE.SphereGeometry(0.0345, 24, 16), skinC, 'el' + S)
    add(new THREE.CylinderGeometry(0.0255, 0.0345, 0.15, 24, 1, true), skinC, 'el' + S, side * 0.075, 0, 0, roll)
    add(new THREE.SphereGeometry(0.0258, 18, 12), skinC, 'el' + S, side * 0.15, 0, 0)
    // a hand: flat palm, fingers together, and a thumb
    add(new THREE.SphereGeometry(0.034, 12, 8), skinC, 'el' + S, side * 0.181, -0.002, 0, null, [1.12, 0.62, 0.92])
    add(new THREE.SphereGeometry(0.0135, 8, 6), skinC, 'el' + S, side * 0.166, 0.004, 0.027, null, [1.5, 1, 1])
    // four fingers (index to little) fanned a little, slightly curled down
    ;[[0.026, 0.017, 0.0], [0.034, 0.006, 0.0], [0.03, -0.005, 0.0], [0.023, -0.016, 0.0]].forEach(([len, zz]) => {
      add(new THREE.CapsuleGeometry(0.0072, len, 2, 6), skinC, 'el' + S, side * (0.207 + len / 2), -0.004, zz, [0, side * (zz - 0.0005) * 1.6, Math.PI / 2 - side * 0.12])
    })
  }
  // head and hair
  const HC = 0.14; const HR = 0.14
  add(new THREE.SphereGeometry(HR, 32, 22), skinC, 'head', 0, HC, 0)
  for (const sd of [-1, 1]) add(new THREE.SphereGeometry(0.03, 12, 8), skinC, 'head', sd * 0.134, HC - 0.004, -0.004, null, [0.4, 1.05, 0.75])
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
  if (hair === 'afro') add(new THREE.SphereGeometry(0.165, 28, 18), hairC, 'head', 0, HC + 0.03, -0.04)
  if (hair === 'buzz') add(skullLayer(0, Math.PI * 0.4, (u) => 0.0035 * (1 - smooth(0.75, 1, u))), hairC, 'head', 0, HC, 0, [-0.3, 0, 0])
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
    if (!style.liveEyes) put(detail, new THREE.CapsuleGeometry(1, 3, 2, 6), INK, 'head', onHead(side * 0.074, (off ? 0.058 : 0.05) + FACE.browUp + (FACE.eyeY - 0.04) * 0.6, 0.002, Math.PI / 2 + side * FACE.browTilt, FACE.browW, 0.009, 0.006))
  }
  put(detail, new THREE.SphereGeometry(1, 8, 6), skinC, 'head', onHead(0, -0.042, -0.006, 0, 0.017, 0.015, 0.016))
  if (!style.liveEyes) put(detail, new THREE.TorusGeometry(1, 0.22, 5, 12, Math.PI * FACE.mouthArc), INK, 'head', onHead(0, off ? -0.088 : -0.094, 0, Math.PI + Math.PI * (1 - FACE.mouthArc) / 2, FACE.mouthW, 0.022, 0.012))

  // joints and the rig
  const root = new THREE.Group()
  const SC = 1.9 * (style.height || 1)
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
  // the hems of the vest and the shorts swing: trailing behind a push, rising
  // as he lands, fluttering at speed (values come from simulate(), see `cloth`)
  const cloth = { uLag: { value: new THREE.Vector3() }, uFl: { value: 0 }, uPh: { value: 0 } }
  bodyM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cloth)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 loose; uniform vec3 uLag; uniform float uFl; uniform float uPh;').replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 rad = vec3( position.x - loose.y, 0.0, position.z ); rad /= max( length( rad ), 1e-4 );
        transformed += loose.x * ( uLag + rad * ( sin( uPh * 2.0 + atan( rad.x, rad.z ) * 3.0 ) * uFl ) ); }`)
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
  // just the arms, for when the camera is his own eyes (see view())
  const fpArms = new THREE.SkinnedMesh(mergeGeometries(armGeos), bodyM)
  fpArms.castShadow = true; fpArms.frustumCulled = false; fpArms.visible = false
  rig.add(fpArms); fpArms.bind(skeleton)
  fpArms.layers.enable(1)
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
  const decal = new THREE.Mesh(mergeGeometries([fr, bk]), decalM)
  bones[TBI.spine].add(decal)
  const B = (n) => bones[TBI[n]]
  const legs = {}; const arms = {}
  for (const [side, S] of [[-1, 'L'], [1, 'R']]) {
    const soleMark = new THREE.Object3D(); soleMark.position.set(0, -0.049, 0.022); B('ankle' + S).add(soleMark)
    legs[side] = { hp: B('hip' + S), kn: B('knee' + S), ft: B('ankle' + S), soleMark }
    const hand = new THREE.Object3D(); hand.position.set(side * 0.178, 0, 0); B('el' + S).add(hand)
    arms[side] = { sh: B('sh' + S), el: B('el' + S), hand }
  }
  scene.add(root)
  return { root, bones, skinC, hips: B('pelvis'), torso: B('spine'), chest: B('chest'), head: B('head'), arms, legs, eyeY: FACE.eyeY, face: FACE, mats: [bodyM, decalM], cloth, bodyMesh: body, fpArms, decal, preMesh: pre, scale: SC, pelvisY: 0.4, ath: true, body: style.height ? Object.fromEntries(Object.entries(TOY_BODY).map(([k, v]) => [k, v * style.height])) : TOY_BODY }
}

let figures = {}
const freshState = (i) => ({ prev: null, phase: (i * 1.7) % 6, yaw: Math.PI, s: 0, ampF: 0, ampL: 0, ampT: 0, headYaw: 0, lift: 0, stance: null, lock: null, pspd: null, accS: 0, bank: 0, ex0: 0, ex1: 0, ex2: 0, offX: 0, offZ: 0, runW: 0, closeW: 0, leadSide: 1, dribHand: -1, dribArm: -1, xoT: -1, xoFrom: -1, xoCool: 0, yRate: 0, latV: 0, dribOn: false, pv: null, clothLag: null, clothFl: 0, latS: 0, shieldW: null })
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
let brows = null; let mouths = null; let grins = null
const eyeGeo = { pupil: new THREE.SphereGeometry(1, 8, 6), shine: new THREE.SphereGeometry(1, 6, 4), lid: new THREE.SphereGeometry(1, 10, 6) }
// brows, the smile and an open mouth are live too, so the face can work:
// brows down and a grimace in a sprint, steady eyes on a shot, a grin after
// it drops
const faceGeo = { brow: new THREE.CapsuleGeometry(1, 3, 2, 6), mouth: new THREE.TorusGeometry(1, 0.22, 5, 12, Math.PI * 0.8), grin: new THREE.SphereGeometry(1, 10, 6) }
// The face parts are separate meshes from the body (they follow the ball,
// blink and make faces). When a player is faded out right in front of the
// lens they fade with him — one opacity per instance — instead of vanishing
// and leaving staring white ovals with no pupils.
function fadeable(mat) {
  mat.transparent = true; mat.depthWrite = false
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float fade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;')
  }
  mat.customProgramCacheKey = () => 'face-fade'
  return mat
}
const faceMat = fadeable(new THREE.MeshBasicMaterial({ color: INK }))
const eyeMat = { pupil: fadeable(new THREE.MeshBasicMaterial({ color: INK })), shine: fadeable(new THREE.MeshBasicMaterial({ color: 0xffffff })), lid: fadeable(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_RAMP })) }
// Guards are a little smaller, bigs a little taller: by shirt number 1 to 5
// (any other label keeps the standard height)
const HEIGHTS = { 1: 0.95, 2: 0.98, 3: 1.02, 4: 1.05, 5: 1.08 }
const heightOf = (p) => HEIGHTS[parseInt(String(p.label).replace(/\D/g, ''), 10)] || 1
function buildFigures(list) {
  EYE_FIGS.forEach(disposeFigure)
  ;[pupils, shines, lids, brows, mouths, grins].forEach((m) => { if (m) { scene.remove(m); m.geometry.dispose(); m.dispose() } })
  figures = {}
  list.forEach((p, i) => { figures[p.id] = { ...makeToyHuman(p, i % 5, { liveEyes: true, height: heightOf(p) }), p, ...freshState(i) } })
  EYE_FIGS = Object.values(figures)
  const EYES = Math.max(1, EYE_FIGS.length * 2)
  pupils = new THREE.InstancedMesh(eyeGeo.pupil, eyeMat.pupil, EYES)
  shines = new THREE.InstancedMesh(eyeGeo.shine, eyeMat.shine, EYES)
  lids = new THREE.InstancedMesh(eyeGeo.lid, eyeMat.lid, EYES)
  brows = new THREE.InstancedMesh(faceGeo.brow, faceMat, EYES)
  mouths = new THREE.InstancedMesh(faceGeo.mouth, faceMat, Math.max(1, EYE_FIGS.length))
  grins = new THREE.InstancedMesh(faceGeo.grin, faceMat, Math.max(1, EYE_FIGS.length))
  ;[pupils, shines, lids, brows].forEach((m, k) => { m.frustumCulled = false; m.count = EYE_FIGS.length * 2; m.renderOrder = 100 + k; scene.add(m) })
  ;[mouths, grins].forEach((m, k) => { m.frustumCulled = false; m.count = EYE_FIGS.length; m.renderOrder = 100 + k; scene.add(m) })
  ;[pupils, shines, lids, brows, mouths, grins].forEach((m) => { m.geometry = m.geometry.clone(); m.geometry.setAttribute('fade', new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count).fill(1), 1)) })
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
      // brow: lower and turned in when working hard or concentrating, up and
      // open when pleased
      const E = f.exx || [0, 0, 0]; const FC = f.face; const off = f.p.team === 'off'
      const grim = Math.max(E[1], E[0] * 0.7)
      const by = (off ? 0.058 : 0.05) + FC.browUp + (FC.eyeY - 0.04) * 0.6 - 0.013 * grim + 0.012 * E[2]
      brows.setMatrixAt(n, m.multiplyMatrices(f.head.matrixWorld, faceMatrix(side * 0.074, by, 0.002, Math.PI / 2 + side * (FC.browTilt - 0.42 * grim + 0.22 * E[2]), FC.browW, 0.009, 0.006)))
      if (f.fp) { pupils.setMatrixAt(n, ZERO); shines.setMatrixAt(n, ZERO); lids.setMatrixAt(n, ZERO); brows.setMatrixAt(n, ZERO) }
      // the whites fade with him; the dark parts (pupils, brows, mouth) stay a
      // good deal stronger than that, so on a see-through face the eyes keep
      // their pupils instead of turning into blank white ovals
      const fd = f.op ?? 1; const ink = Math.min(1, 0.2 + fd * 2.2)
      shines.geometry.attributes.fade.array[n] = fd; lids.geometry.attributes.fade.array[n] = fd
      pupils.geometry.attributes.fade.array[n] = ink; brows.geometry.attributes.fade.array[n] = ink
    })
    {
      const E = f.exx || [0, 0, 0]; const FC = f.face; const off = f.p.team === 'off'
      const hide = f.fp
      mouths.geometry.attributes.fade.array[i] = Math.min(1, 0.2 + (f.op ?? 1) * 2.2); grins.geometry.attributes.fade.array[i] = mouths.geometry.attributes.fade.array[i]
      const my = off ? -0.088 : -0.094
      const arc = 0.8
      // the smile: deeper when pleased, flat when concentrating
      const depth = 0.022 * (1 + 0.9 * E[2] - 0.55 * E[1] - 0.3 * E[0])
      mouths.setMatrixAt(i, hide || E[0] > 0.45 ? ZERO : m.multiplyMatrices(f.head.matrixWorld, faceMatrix(0, my, 0, Math.PI + Math.PI * (1 - arc) / 2, FC.mouthW * (1 + 0.35 * E[2]), depth, 0.012)))
      // an open mouth: breathing hard, or a broad grin
      const open = Math.max(0, E[0] - 0.2) * 1.25 + Math.max(0, E[2] - 0.55) * 1.4
      grins.setMatrixAt(i, hide || open < 0.05 ? ZERO : m.multiplyMatrices(f.head.matrixWorld, faceMatrix(0, my - 0.004, 0.004, 0, FC.mouthW * (0.62 + 0.25 * Math.min(1, open)), 0.006 + 0.016 * Math.min(1, open), 0.008)))
    }
  })
  ;[pupils, shines, lids, brows, mouths, grins].forEach((mm) => { mm.instanceMatrix.needsUpdate = true; mm.geometry.attributes.fade.needsUpdate = true })
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
    L.hp.rotation.x = -(defense ? 0.6 : 0.05 + 0.2 * ready) + sw * ampF
    L.hp.rotation.z = (defense ? side * 0.2 : 0) + Math.sin(ph) * ampL
    // the trailing leg folds up well behind on a run, the planted one keeps a little give
    // (in a defensive slide the feet stay low and close to the floor — a shuffle, not a run)
    L.kn.rotation.x = (defense ? 1.05 : 0.1 + 0.38 * ready) + 0.18 * Math.min(1, Math.abs(ampF) * 1.5) + Math.max(0, -Math.cos(ph) * side) * (defense ? 0.5 : 1.7) * Math.min(1, amp * 1.6)
    L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x)
    L.ft.rotation.z = -L.hp.rotation.z
    const A = arms[side]
    // T-pose → arms down (z), then swing (x). The elbow bends about its y
    // axis; for the forearm to come FORWARD that's +angle on the right side
    // of the body (−x) and −angle on the left, i.e. −side × angle.
    // The arm swings forward freely but back only a little: further and the
    // elbow ends up behind the torso, the arm looking pulled out of the
    // shoulder (+x rotation is backwards).
    const swing = -sw * 0.8 * Math.abs(ampF)
    A.sh.rotation.set(defense ? -0.35 : Math.min(swing, 0.2), 0, -side * (defense ? 0.95 : 1.3 - 0.15 * lean))
    A.el.rotation.set(0, -side * (defense ? 1.05 : 0.25 + 0.9 * lean), 0)
  }
  if (defense) {
    // an active stance: the hand on the ball's side up in front, the other out
    // to the side and low, both open and never quite still — and after a
    // close-out both hands go up
    for (const side of [-1, 1]) {
      const A = arms[side]; const lead = side === f.leadSide
      const wig = Math.sin(f.dribbleT * 0.33 + side * 1.7) * 0.07
      const w = f.closeW
      A.sh.rotation.set((lead ? -1.45 : -0.3) + wig + (-2.55 - (lead ? -1.45 : -0.3)) * w, 0, -side * ((lead ? 0.78 : 1.22) + (0.42 - (lead ? 0.78 : 1.22)) * w))
      A.el.rotation.set(0, -side * ((lead ? 0.75 : 0.5) + (0.2 - (lead ? 0.75 : 0.5)) * w), 0)
    }
  }
  if (hold === 'dribble') torso.rotation.x += 0.08 // a dribbler keeps low over the ball
  if (hold === 'hold') {
    for (const side of [-1, 1]) { arms[side].sh.rotation.set(-1.05, 0, -side * 1.0); arms[side].el.rotation.set(0, -side * 1.15, 0) }
  } else if (hold === 'dribble') {
    // the dribbling hand (right or left, see simulate) low and out in front;
    // the other arm up as a guard between the ball and the defender
    const d = f.dribArm
    arms[d].sh.rotation.set(-0.35, 0, -d * (1.25 - 0.08 * Math.cos(2 * f.dribbleT))); arms[d].el.rotation.set(0, d * 0.35, 0)
    arms[-d].sh.rotation.set(-0.4 + 0.05 * Math.sin(f.dribbleT * 0.5), 0, d * 1.05); arms[-d].el.rotation.set(0, d * 0.55, 0)
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
// A layup. The shooting hand (right = -1, left = +1) under and behind the ball,
// the other hand on its side, until the ball is let go — then the shooting arm
// reaches on up towards the glass.
function layGrip(f, p, hand) {
  const sx = sideOf(f); const fw = fwdOf(f); const d = BALL_R + bodyOf(f).handR * 0.8
  reach(f, hand, p.clone().addScaledVector(fw.clone().multiplyScalar(-0.55).add(new THREE.Vector3(0, -0.83, 0)).normalize(), d), new THREE.Vector3(0, -1, 0).addScaledVector(fw, 0.35).addScaledVector(sx, hand * 0.25))
  reach(f, -hand, p.clone().addScaledVector(sx, -hand * d), new THREE.Vector3(0, -0.5, 0).addScaledVector(sx, -hand).addScaledVector(fw, 0.3))
}
function layFollow(f, p, hand, u) {
  const sx = sideOf(f); const fw = fwdOf(f); const d = BALL_R + bodyOf(f).handR * 0.8
  const S = f.arms[hand].sh.getWorldPosition(new V3())
  const up = S.addScaledVector(fw.clone().multiplyScalar(0.3).add(new V3(0, 0.95, 0)).normalize(), 0.7)
  const hold = p.clone().addScaledVector(fw.clone().multiplyScalar(-0.55).add(new V3(0, -0.83, 0)).normalize(), d)
  reach(f, hand, hold.lerp(up, Math.min(1, u / 0.25)), new V3(0, -1, 0).addScaledVector(fw, 0.35).addScaledVector(sx, hand * 0.25))
  // the other arm comes down and in
  const guide = p.clone().addScaledVector(sx, -hand * d)
  guide.lerp(f.arms[-hand].sh.getWorldPosition(new V3()).add(new V3(0, -0.25, 0).addScaledVector(fw, 0.25)), Math.min(1, u / 0.3))
  reach(f, -hand, guide, new V3(0, -0.8, 0).addScaledVector(sx, -hand * 0.6))
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
// the camera: 'court' (low, behind the play), 'pov' (through a player's eyes)
// or 'free' (orbiting the ball: drag to turn, pinch or wheel to zoom)
const cam = { mode: 'court', povId: null }
const free = { yaw: 0, pitch: 0.42, dist: 11 }
let freeFocus = null
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

// What kind of shot a shot step is, worked out from the play alone (so it is
// the same on every frame of the step):
//   layup — he runs at the basket (within 3.2 m, at pace, heading for it, in
//           this step or arriving from the one before), or is within 2 m of
//           it: two steps, off one foot, the ball laid up on the glass or
//           over the rim, with the hand on his side
//   free  — standing still on the free-throw line with nobody near him
//   jump  — everything else, and any shot not aimed at the basket
// `lay` carries the timing (as fractions of the step) and the hand.
function planShot(f, k, act) {
  const end = act.pts[act.pts.length - 1]
  const hp0 = hoopAt(toZ(end.y))
  if (Math.hypot(toX(end.x) - hp0.x, toZ(end.y) - hp0.z) >= 1.3) return { kind: 'jump' }
  const secs = STEPD[k - 1] || STEP_SECS
  const at = (r) => { const q = board.entPos(f.p, (k - 1 + r) / N, N, MARKS); return { x: toX(q.x), z: toZ(q.y) } }
  const a = at(0.5); const b = at(0.7)
  const hp = hoopAt(b.z)
  const dist = Math.hypot(hp.x - b.x, hp.z - b.z)
  const mx = b.x - a.x; const mz = b.z - a.z; const ml = Math.hypot(mx, mz)
  const speed = ml / (0.2 * secs)
  const towards = ml > 1e-6 ? (mx * (hp.x - b.x) + mz * (hp.z - b.z)) / (ml * (dist || 1)) : 0
  // the defender nearest to him
  let nearD = Infinity; let defSide = 0
  Object.values(figures).forEach((o) => {
    if (o.p.team === f.p.team || isCone(o.p) || isBall(o.p)) return
    const d = Math.hypot(o.root.position.x - b.x, o.root.position.z - b.z)
    if (d < nearD) { nearD = d; defSide = (o.root.position.x - b.x) * (hp.z < b.z ? 1 : -1) }
  })
  // he may also arrive on the run: moving at pace towards the basket at the end
  // of the step before, then taking the shot from where he stopped
  let arriving = false
  if (k > 1 && dist <= 3.2) {
    const prev = STEPD[k - 2] || STEP_SECS
    const at2 = (r) => { const q = board.entPos(f.p, (k - 2 + r) / N, N, MARKS); return { x: toX(q.x), z: toZ(q.y) } }
    // (sampled before the very end, where the walk eases to a stop)
    const c = at2(0.5); const d = at2(0.8)
    const pl = Math.hypot(d.x - c.x, d.z - c.z)
    const hd = Math.hypot(hp.x - d.x, hp.z - d.z) || 1
    arriving = pl > 1e-6 && pl / (0.3 * prev) >= 1.2 && ((d.x - c.x) * (hp.x - d.x) + (d.z - c.z) * (hp.z - d.z)) / (pl * hd) >= 0.3
  }
  if (dist < 2 || (dist <= 3.2 && ((speed >= 1.2 && towards >= 0.3) || arriving))) {
    const du = Math.max(0.12, Math.min(0.3, 0.6 / secs))
    const t0 = Math.min(0.62, 0.9 - du)
    // right hand from the right of the court, left from the left; with a
    // defender close, the hand away from him
    const side = (b.x - hp.x) * (hp.z < b.z ? 1 : -1)
    let hand = side > 0.4 ? -1 : side < -0.4 ? 1 : -1
    if (nearD < 2.2 && Math.abs(defSide) > 0.3) hand = defSide > 0 ? 1 : -1
    const off = b.x - hp.x
    return { kind: 'layup', lay: { t0, du, gather: t0 - 0.14, rel: t0 + 0.55 * du, hand, bank: Math.abs(off) > 0.8, bankX: hp.x + Math.sign(off) * 0.28, dir: hp.z < 14 ? 1 : -1 } }
  }
  if (speed < 0.3 && Math.abs(dist - 4.2) < 0.6 && Math.abs(b.x - hp.x) < 1 && nearD > 1.8) return { kind: 'free' }
  return { kind: 'jump' }
}

// What kind of pass a pass step is, worked out from the play alone:
//   long     — over 13 m: a one-handed throw from beside the head
//   bounce   — a defender beside the lane (and not far): it goes in off the
//              floor, under his hands
//   chest    — everything else (a defender right in the lane is passed over
//              on a higher arc)
function planPass(passer, k) {
  const rc = CARRIERS[k + 1] && figures[CARRIERS[k + 1].id]
  if (!rc || rc === passer) return { kind: 'chest' }
  const at = (f, r) => { const q = board.entPos(f.p, (k - 1 + r) / N, N, MARKS); return { x: toX(q.x), z: toZ(q.y) } }
  const a = at(passer, 0.25); const b = at(rc, 0.95)
  const dx = b.x - a.x; const dz = b.z - a.z; const d = Math.hypot(dx, dz)
  if (d < 2.4) return { kind: 'chest' }
  let lane = Infinity
  Object.values(figures).forEach((o) => {
    if (o.p.team === passer.p.team || isCone(o.p) || isBall(o.p)) return
    for (const r of [0.25, 0.5]) {
      const q = at(o, r)
      const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / (d * d)
      if (t > 0.08 && t < 0.97) lane = Math.min(lane, Math.hypot(q.x - (a.x + t * dx), q.z - (a.z + t * dz)))
    }
  })
  if (d > 13) return { kind: 'long' }
  // a step to the side of the lane, under his hands (right in it, over him)
  if (lane >= 0.5 && lane < 1.1 && d <= 9) return { kind: 'bounce' }
  return { kind: 'chest' }
}
// A ball can't be held out behind a man's back: the direction a pass leaves
// in is at most about 70° off the way he faces (the body twists the rest of
// the way, see passTwist in simulate()), so the arms never fold round behind him.
const PASS_ARC = 1.25
function angTo(f, dir) {
  let rel = Math.atan2(dir.x, dir.z) - f.yaw
  while (rel > Math.PI) rel -= 2 * Math.PI
  while (rel < -Math.PI) rel += 2 * Math.PI
  return rel
}
function passDir(f, dir) {
  const rel = angTo(f, dir)
  if (Math.abs(rel) <= PASS_ARC) return dir.clone().setY(0).normalize()
  const a = f.yaw + Math.sign(rel) * PASS_ARC
  return new V3(Math.sin(a), 0, Math.cos(a))
}
// Where the ball is when a pass is let go (and held before it)
function passGather(f, kind, dir) {
  if (kind === 'long') return headCentre(f).addScaledVector(sideOf(f), -0.27).addScaledVector(fwdOf(f), 0.02).add(new V3(0, 0.12, 0))
  const c = chestPoint(f, dir)
  if (kind === 'bounce') c.y -= 0.3
  return c
}

function simulate(t, dt) {
  const k = stepAtTime(t, N)
  const fr = Math.max(0, Math.min(0.999999, t)) * N - (k - 1)
  const act = actsOf(play.ball).find((a) => a.step === k && a.pts.length)
  const shooter = act && act.type === 'shot' && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const plan = shooter ? planShot(shooter, k, act) : { kind: 'jump' }
  const lay = plan.kind === 'layup' ? plan.lay : null
  // on the run in to a layup he still carries (dribbles) the ball, up to the gather
  const carrier = (!act || (lay && fr < lay.gather)) && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const dribbling = carrier && actsOf(carrier.p).some((a) => a.step === k && a.type === 'dribble' && a.pts.length)
  const bp = board.ballPos(t)
  const ballXZ = new THREE.Vector3(toX(bp.x), 0, toZ(bp.y))
  // jump shot: the shooter sinks into his knees while bringing the ball up,
  // then jumps; his defender jumps a beat later with a hand up
  const G_SHOT = 0.22
  const contester = shooter && plan.kind !== 'free' && Object.values(figures).find((f) => MARKS[f.p.id] === shooter.p.id)
  const uShot = !shooter ? -1 : lay ? (fr - (lay.rel - 0.12)) / 0.5 : (fr - G_SHOT) / (1 - G_SHOT)
  // handoff: the carrier holds the ball out to a team-mate coming by, who takes it
  const giver = !act && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const taker = giver && CARRIERS[k + 1] && CARRIERS[k + 1].id !== giver.p.id ? figures[CARRIERS[k + 1].id] : null
  const handoff = taker && [giver, taker].some((q) => actsOf(q.p).some((a) => a.step === k && a.type === 'handoff' && a.pts.length)) ? { giver, taker } : null
  const passerFig = act && act.type !== 'shot' && CARRIERS[k] ? figures[CARRIERS[k].id] : null
  const passKind = passerFig ? planPass(passerFig, k).kind : 'chest'
  // a pass to somebody off to the side or behind: the shoulders twist round to him
  let passTwist = 0
  if (passerFig) {
    const rcF = CARRIERS[k + 1] && figures[CARRIERS[k + 1].id]
    if (rcF && rcF !== passerFig) {
      const rel = angTo(passerFig, rcF.root.position.clone().sub(passerFig.root.position))
      passTwist = Math.sign(rel) * Math.min(0.7, Math.max(0, Math.abs(rel) - 0.5) * 0.55) * Math.sin(Math.PI * clampN((fr - 0.04) / 0.6, 0, 1))
    }
  }
  const lunge = passerFig && fr > 0.1 && fr < 0.6 ? Math.sin((Math.PI * (fr - 0.1)) / 0.5) : 0

  // Bodies don't pass through each other. The board lets two tokens sit on
  // the same spot (a screener on top of the defender he screens, a defender
  // right on his man); here each pair that comes closer than a body's width
  // is eased apart — a little more for opponents than for team-mates — and
  // eased back as they part again, so it never jumps.
  const bodies = Object.values(figures).map((f) => { const q = board.entPos(f.p, t, N, MARKS); return { f, x: toX(q.x), z: toZ(q.y) } })
  const push = bodies.map(() => [0, 0])
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]; const b = bodies[j]
      const ax = a.x + push[i][0]; const az = a.z + push[i][1]; const bx = b.x + push[j][0]; const bz = b.z + push[j][1]
      const need = a.f.p.team === b.f.p.team ? 0.58 : 0.72
      let dx = bx - ax; let dz = bz - az; let d = Math.hypot(dx, dz)
      if (d >= need) continue
      if (d < 1e-4) { dx = Math.cos(i * 2.4 + j); dz = Math.sin(i * 2.4 + j); d = 1 } // exactly on top: any direction, but the same one every frame
      const m = ((need - Math.hypot(bx - ax, bz - az)) / 2) / d
      push[i][0] -= dx * m; push[i][1] -= dz * m; push[j][0] += dx * m; push[j][1] += dz * m
    }
  }
  bodies.forEach((bd, i) => {
    const tx = Math.max(-0.6, Math.min(0.6, push[i][0])); const tz = Math.max(-0.6, Math.min(0.6, push[i][1]))
    bd.f.offX += (tx - bd.f.offX) * 0.3; bd.f.offZ += (tz - bd.f.offZ) * 0.3
  })

  // players: position, speed, facing, pose
  Object.values(figures).forEach((f) => {
    const bd = bodies.find((q) => q.f === f)
    const x = bd.x + f.offX; const z = bd.z + f.offZ
    let vx = 0; let vz = 0
    if (f.prev) { vx = (x - f.prev.x) / dt; vz = (z - f.prev.z) / dt }
    f.prev = { x, z }
    const speed = Math.hypot(vx, vz)
    f.spd = speed
    f.s += (Math.min(1, speed / 3.2) - f.s) * 0.25
    f.root.position.set(x, 0, z)
    const isDef = f.p.team === 'def'
    // A defender who covers a long way straight at the ball (a close-out)
    // runs upright and facing where he's going; only when he arrives does he
    // drop into the stance, hands up. Anything shorter is a slide: low, facing
    // the ball, feet shuffling.
    {
      const bx = ball.position.x - x; const bz = ball.position.z - z; const bl = Math.hypot(bx, bz) || 1
      const toward = (vx * bx + vz * bz) / bl
      const runT = isDef && speed > (f.runW > 0.5 ? 1.6 : 2.4) && toward > 0.75 * speed && bl > 1.4 ? 1 : 0
      f.runW += (runT - f.runW) * 0.25
      const sdot = (bx * Math.cos(f.yaw) - bz * Math.sin(f.yaw)) / bl // + = ball on his left
      if (Math.abs(sdot) > 0.25) f.leadSide = sdot > 0 ? 1 : -1
    }
    const running = f.runW > 0.5
    // hands up for a moment after the close-out, then back to the stance
    f.closeW = running ? 1 : f.closeW * 0.96
    const defense = isDef && !running
    const hold = carrier === f ? (dribbling ? 'dribble' : 'hold') : null
    let want
    if ((!isDef || running) && speed > 0.6) want = Math.atan2(vx, vz)
    else if (hold) { const hp = hoopAt(z); want = Math.atan2(hp.x - x, hp.z - z) }
    else if (f === shooter) { const hp = hoopAt(z); want = Math.atan2(hp.x - x, hp.z - z) }
    else want = Math.atan2(ball.position.x - x, ball.position.z - z)
    const yaw0 = f.yaw
    f.yaw = angLerp(f.yaw, want, f.prev ? 0.16 : 1)
    f.root.rotation.y = f.yaw
    let yd = f.yaw - yaw0
    while (yd > Math.PI) yd -= 2 * Math.PI
    while (yd < -Math.PI) yd += 2 * Math.PI
    const yawRate = f.prev ? Math.abs(yd) / dt : 0
    f.yRate = yawRate
    f.yDir = Math.sign(yd)
    // his sideways speed as seen facing the basket (right is positive): moving
    // right across the court is a right-hand dribble, left a left-hand one
    {
      const hp = hoopAt(z); const hl = Math.hypot(hp.x - x, hp.z - z) || 1
      const dx = (hp.x - x) / hl; const dz = (hp.z - z) / hl
      f.latV += ((vx * -dz + vz * dx) - f.latV) * 0.12
    }
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
    // the first steps out of a standing start are short and driven (the
    // body low, leaning in), then the stride opens up
    const startW = Math.max(0, Math.min(1, f.accS / 4.5)) * (1 - Math.max(0, Math.min(1, (speed - 1.8) / 2.6)))
    pose(f, (f.ampF + f.ampT) * (1 - 0.3 * startW), f.ampL, f.s, defense, hold)
    // Weight follows the movement: forward into a sprint, back and into the
    // knees braking to a stop, and banking into a turn like a runner on a
    // curve (his upper body leans to the inside, the head stays level).
    {
      const acc = f.pspd == null ? 0 : (speed - f.pspd) / dt
      f.pspd = speed
      f.accS += (Math.max(-9, Math.min(9, acc)) - f.accS) * 0.12
      const run = Math.min(1, speed / 2.5)
      const lean = Math.max(-0.14, Math.min(0.16, f.accS * 0.022)) * (0.4 + 0.6 * run) + 0.1 * startW
      f.torso.rotation.x += lean
      // the head stays level and steady while the body leans and twists
      f.head.rotation.x -= lean * 0.85
      f.head.rotation.y *= 0.45
      // driving off: down through the knees; running: the hips rise and fall
      // with every stride, lowest as the foot is under him
      const bobAmt = Math.min(1, speed / 3) * (defense ? 0.5 : 1)
      const dip = Math.min(1, 0.6 * startW * (defense ? 0.35 : 1) + 0.55 * bobAmt * (0.5 + 0.5 * Math.cos(2 * f.phase)))
      if (dip > 0.01) for (const sd of [-1, 1]) { const L = f.legs[sd]; L.hp.rotation.x -= 0.09 * dip; L.kn.rotation.x += 0.2 * dip; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) }
      const brake = Math.max(0, -f.accS - 1.5) / 6 * Math.min(1, f.pspd / 1 + 0.4)
      if (brake > 0.02) {
        const bb = Math.min(1, brake)
        for (const sd of [-1, 1]) { const L = f.legs[sd]; L.hp.rotation.x -= 0.22 * bb; L.kn.rotation.x += 0.42 * bb; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) }
      }
      const rate = f.prev ? yd / dt : 0
      const bankWant = -Math.max(-0.26, Math.min(0.26, 0.42 * Math.atan((rate * speed) / 9.8))) * run
      f.bank += (bankWant - f.bank) * 0.15
      f.torso.rotation.z = f.bank
      f.head.rotation.z = -f.bank * 0.7
      // Weight over the planted foot: the pelvis shifts towards the leg he
      // stands on and tilts down on the swinging side, the shoulders stay
      // level above it; a sideways push (a slide, a cut) leans him into it.
      const latNow = vx * Math.cos(f.yaw) - vz * Math.sin(f.yaw)
      f.latS = (f.latS || 0) + (latNow - (f.latS || 0)) * 0.2
      const sw1 = Math.sin(f.phase) * Math.min(1, speed / 2.4)
      const push = Math.max(-1, Math.min(1, f.latS / 2.2)) * (defense ? 1 : 0.5)
      f.hips.position.x = 0.02 * sw1 * (defense ? 0.6 : 1) + 0.03 * push
      f.hips.rotation.z = 0.035 * sw1
      f.torso.rotation.z += -0.03 * sw1 - 0.13 * push
      f.head.rotation.z += 0.03 * sw1 + 0.12 * push
      // a dribbler turns the shoulder away from the ball towards a defender
      if (hold === 'dribble') {
        const sh = f.dribArm * 0.16 * (f.shieldW == null ? 0.35 : f.shieldW)
        f.torso.rotation.y += sh; f.head.rotation.y -= sh * 0.8
      }
      // the face: effort in a sprint, concentration on a shot, a grin once it drops
      const exT = Math.max(0, Math.min(1, (speed - 2.8) / 3))
      let foT = 0
      if (f === shooter && fr < 0.75) foT = 1
      else if (f === contester && uShot > -0.3 && uShot < 0.5) foT = 0.9
      else if (f === passerFig && fr < 0.5) foT = 0.5
      const joyT = shooter && !defense && uShot > 0.62 ? (f === shooter ? 1 : 0.7) : 0
      f.ex0 += (exT - f.ex0) * 0.15; f.ex1 += (foT - f.ex1) * 0.15; f.ex2 += (joyT - f.ex2) * 0.15
    }
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
    if (f === passerFig && passTwist) { f.torso.rotation.y += passTwist; f.head.rotation.y -= passTwist * 0.7 }
    // stepping into a pass: lead foot forward, weight over it
    if (f === passerFig && lunge > 0) {
      const Lf = f.legs[1]; const Lb = f.legs[-1]
      // a bounce pass is thrown from down low, a long one takes a bigger step
      const LK = passKind === 'long' ? 1.4 : 1
      Lf.hp.rotation.x -= 0.5 * lunge * LK; Lf.kn.rotation.x += (0.25 + (passKind === 'bounce' ? 0.3 : 0)) * lunge * LK
      Lb.hp.rotation.x += 0.28 * lunge * LK; Lb.kn.rotation.x += (0.12 + (passKind === 'bounce' ? 0.2 : 0)) * lunge * LK
      for (const L of [Lf, Lb]) L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x)
      f.torso.rotation.x += (0.18 + (passKind === 'bounce' ? 0.12 : 0)) * lunge
    }
    // sink into the knees (shooter gathering, defender loading to jump)
    let dip = 0; let lift = 0
    // landing: down through the knees to soak it up
    const landing = (u) => (u >= 0 && u < 0.2 ? 0.85 * Math.sin((Math.PI * u) / 0.2) : 0)
    let layU = -1
    if (f === shooter && lay) {
      // a layup: load the last step, spring off one foot, soak up the landing
      layU = (fr - lay.t0) / lay.du
      const load = fr > lay.gather && fr < lay.t0 ? 0.5 * Math.sin((Math.PI / 2) * ((fr - lay.gather) / (lay.t0 - lay.gather))) : 0
      lift = layU > 0 && layU < 1 ? 0.55 * Math.sin(Math.PI * layU) : 0
      dip = Math.max(load, landing((fr - (lay.t0 + lay.du)) * 1.2))
    } else if (f === shooter) {
      // a free throw is a quiet bend of the knees and hardly a jump
      const calm = plan.kind === 'free' ? 0.12 : 1
      dip = Math.max(landing(uShot - 0.42), fr < G_SHOT ? Math.sin((Math.PI / 2) * (fr / G_SHOT)) : uShot < 0.08 ? 1 - uShot / 0.08 : 0) * (plan.kind === 'free' ? 0.65 : 1)
      lift = (uShot > 0 && uShot < 0.42 ? 0.3 * Math.sin((Math.PI * uShot) / 0.42) : 0) * calm
    }
    if (f === contester) { const uc = uShot - 0.06; dip = Math.max(landing(uc - 0.4), uShot > -0.3 && uc < 0.05 ? 0.7 : 0); lift = uc > 0 && uc < 0.4 ? 0.2 * Math.sin((Math.PI * uc) / 0.4) : 0 }
    if (dip) for (const sd of [-1, 1]) { const L = f.legs[sd]; L.hp.rotation.x -= 0.55 * dip; L.kn.rotation.x += 1.05 * dip; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) }
    if (lift) for (const sd of [-1, 1]) { const L = f.legs[sd]; L.kn.rotation.x *= 0.4; L.ft.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) + 0.5 } // legs straighten, toes point
    if (lay && f === shooter && layU > 0 && layU < 1) {
      // the knee on the shooting side is driven up, the other leg pushes off
      const w = Math.sin(Math.PI * Math.min(1, layU * 1.15))
      const Lk = f.legs[lay.hand]
      Lk.hp.rotation.x = -1.15 * w; Lk.kn.rotation.x = 1.25 * w; Lk.ft.rotation.x = -(Lk.hp.rotation.x + Lk.kn.rotation.x) + 0.2
      f.torso.rotation.x += 0.12 * w
    }
    if (lay && f === shooter && fr > lay.t0 - 0.06 && fr < lay.rel + 0.1) f.head.rotation.x -= 0.45 * Math.sin(Math.PI * Math.min(1, (fr - (lay.t0 - 0.06)) / (lay.rel + 0.16 - lay.t0)))
    plantFeet(f)
    lockStance(f, lift)
    f.lift = lift
    f.root.position.y = lift
    // the cloth: the hems trail behind an acceleration (sideways, forwards,
    // up and down), stream back at speed and flutter with the stride
    {
      const ax = f.pv ? (vx - f.pv.x) / dt : 0; const az = f.pv ? (vz - f.pv.z) / dt : 0
      const vy = f.pv ? (lift - f.pv.y) / dt : 0
      f.pv = { x: vx, z: vz, y: lift }
      const aL = ax * Math.cos(f.yaw) - az * Math.sin(f.yaw); const aF = ax * Math.sin(f.yaw) + az * Math.cos(f.yaw)
      const c = f.clothLag || (f.clothLag = new THREE.Vector3())
      c.x += (clampN(-aL * 0.0016, -0.016, 0.016) - c.x) * 0.22
      c.y += (clampN(-vy * 0.0035, -0.02, 0.02) - c.y) * 0.22
      c.z += (clampN(-aF * 0.0016 - 0.006 * Math.min(1, speed / 4), -0.022, 0.022) - c.z) * 0.22
      f.clothFl = Math.min(1, speed / 4) * 0.0045
    }
    // the head turns to follow the ball (as far as a neck turns)
    // — except the passer, who looks at the man he is passing to, and the
    // receiver, who looks back at him, before the ball is even on its way
    let gx = ball.position.x; let gz = ball.position.z
    if (passerFig && fr < 0.55 && CARRIERS[k + 1]) {
      const rcv = figures[CARRIERS[k + 1].id]
      if (f === passerFig && rcv && rcv !== f) { gx = rcv.root.position.x; gz = rcv.root.position.z }
      else if (f === rcv && f !== passerFig) { gx = passerFig.root.position.x; gz = passerFig.root.position.z }
    }
    let ha = Math.atan2(gx - x, gz - z) - f.yaw
    while (ha > Math.PI) ha -= 2 * Math.PI
    while (ha < -Math.PI) ha += 2 * Math.PI
    f.headYaw = (f.headYaw || 0) + (Math.max(-1.1, Math.min(1.1, ha)) * 0.85 - (f.headYaw || 0)) * 0.25
    f.head.rotation.y += f.headYaw
  })

  // ball: held at the chest, dribbled at the right hand, passed chest to
  // chest (gathered up to the chest first if it was being dribbled), shot
  // from above the head.
  const reaches = []
  Object.values(figures).forEach((o) => { o._dribNow = false })
  let catching = null
  Object.values(figures).forEach((f) => { if (f.screenW > 0.01) reaches.push([f, null, 'cross', f.screenW]) })
  let squash = 1
  // the very first frame: the ball is already in the first carrier's hands,
  // not on the floor where the board puts it (it would be gathered up from there)
  if (!held && !flight) {
    const c0 = CARRIERS[k] && figures[CARRIERS[k].id]
    if (c0) ball.position.copy(chestPoint(c0))
  }
  if (carrier) {
    flight = null
    let want
    if (dribbling) {
      // waist-high dribble out in front of the right hip: four bounces a
      // step, at the top of one when the step starts and ends; the hand
      // rides on top of the ball while it's up and waits there for it
      // Which hand. With a defender close, the hand furthest from him, so the
      // body is between him and the ball. Otherwise by direction, facing the
      // basket: dribbling to the right (or coming at the basket from the right
      // side) is the right hand, to the left the left hand. A change of hand
      // while he is dribbling is a crossover: the ball goes low across the
      // front of the body. Picking the ball up to dribble is no change: the
      // hand is simply chosen.
      let want_h = carrier.dribHand
      let pull = 0
      Object.values(figures).forEach((o) => {
        if (o.p.team === carrier.p.team || isCone(o.p) || isBall(o.p)) return
        const dv = o.root.position.clone().sub(carrier.root.position).setY(0)
        const dd = dv.length()
        if (dd > 3 || dd < 0.01 || dv.dot(fwdOf(carrier)) < -0.5 * dd) return
        const lat = dv.dot(sideOf(carrier))
        if (Math.abs(lat) > 0.45 && Math.abs(lat) / dd > pull) { pull = Math.abs(lat) / dd; want_h = lat > 0 ? -1 : 1 }
      })
      if (pull === 0) {
        const cp = carrier.root.position
        const hp = hoopAt(cp.z)
        const hl = Math.hypot(hp.x - cp.x, hp.z - cp.z) || 1
        const rx = -(hp.z - cp.z) / hl; const rz = (hp.x - cp.x) / hl // his right, facing the basket
        // which side of the court he is on, facing the basket (right is positive)
        const side = (cp.x - hp.x) * (hp.z < cp.z ? 1 : -1)
        // how far this dribble takes him sideways, as planned: used to pick the
        // hand the moment he starts, before he has any speed
        let plan = 0
        const da = actsOf(carrier.p).find((a) => a.step === k && a.type === 'dribble' && a.pts.length)
        if (da) { const e = da.pts[da.pts.length - 1]; plan = (toX(e.x) - cp.x) * rx + (toZ(e.y) - cp.z) * rz }
        const lat = carrier.dribOn ? carrier.latV : plan * 0.5
        if (lat > 0.9) want_h = -1
        else if (lat < -0.9) want_h = 1
        else if (Math.abs(side) > 1) want_h = side > 0 ? -1 : 1
      }
      carrier._dribNow = true
      carrier.shieldW = pull > 0 ? 1 : 0.35
      carrier.xoCool = Math.max(0, carrier.xoCool - dt)
      if (!carrier.dribOn) {
        // just started dribbling: the hand is simply chosen, no crossover
        carrier.dribHand = want_h; carrier.dribArm = want_h; carrier.xoT = -1; carrier.xoCool = 1
      }
      if (carrier.xoT >= 0) { carrier.xoT += dt / 0.5; if (carrier.xoT >= 1) { carrier.xoT = -1; carrier.dribArm = carrier.dribHand } }
      if (carrier.xoT < 0 && carrier.xoCool <= 0 && carrier.spd > 0.6 && want_h !== carrier.dribHand) {
        carrier.xoFrom = carrier.dribHand; carrier.dribHand = want_h; carrier.xoT = 0; carrier.xoCool = 1.6
      }
      // the arm follows the ball: it lets go of it half way across
      carrier.dribArm = carrier.xoT >= 0 && carrier.xoT < 0.5 ? carrier.xoFrom : carrier.dribHand
      const xu = carrier.xoT >= 0 ? carrier.xoT : 1
      const sm = xu * xu * (3 - 2 * xu)
      const lateral = (carrier.xoT >= 0 ? carrier.xoFrom : carrier.dribHand) * 0.26 + (carrier.dribHand * 0.26 - (carrier.xoT >= 0 ? carrier.xoFrom : carrier.dribHand) * 0.26) * sm
      const top = carrier.root.position.clone().addScaledVector(fwdOf(carrier), 0.32 + (carrier.xoT >= 0 ? 0.12 * Math.sin(Math.PI * xu) : 0)).addScaledVector(sideOf(carrier), lateral)
      const TOP = 0.86
      // each bounce: pushed down out of the hand, speeding up under gravity
      // to the floor, slowing again on the way back up into the hand
      // four bounces to a normal step, more in a long one, so it stays a dribble
      const bounces = Math.max(2, Math.round((4 * STEPD[k - 1]) / STEP_SECS))
      const ph = (fr * bounces) % 1; const half = ph < 0.5 ? ph * 2 : (1 - ph) * 2
      const drop = 0.3 * half + 0.7 * half * half
      // a slight squash as it hits the floor
      squash = half > 0.93 ? 1 - 0.14 * (half - 0.93) / 0.07 : 1
      want = top.setY(TOP - (TOP - BALL_R * squash) * drop)
      // across the body the ball is low and quick: down to the floor in the middle
      if (carrier.xoT >= 0) want.y = BALL_R + (TOP - BALL_R) * Math.pow(Math.abs(2 * xu - 1), 1.5)
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
    if (!held || held.key !== modeKey) held = { key: modeKey, from: ball.position.clone(), fr0: held ? fr : -1 }
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
      if (lay && passer) {
        // The ball comes up from the gather to the shooting hand at full stretch,
        // is let go at the top of the jump, and is laid onto the glass (from an
        // angle) or over the rim (from straight in front), then drops through.
        const top = headCentre(passer).addScaledVector(fwdOf(passer), 0.3).addScaledVector(sideOf(passer), lay.hand * 0.22).add(new THREE.Vector3(0, 0.5, 0))
        if (fr < lay.rel) {
          const g = Math.max(0, Math.min(1, (fr - lay.gather) / (lay.rel - lay.gather)))
          ball.position.copy(gatherPath(passer, flight.gatherFrom, top, easeInOut(g)))
          reaches.push([passer, ball.position.clone(), 'layGrip', lay.hand])
        } else {
          if (!flight.release) flight.release = top.clone()
          const from = flight.release
          const ur = Math.max(0, Math.min(1, (fr - lay.rel) / (0.97 - lay.rel)))
          if (ur < 0.74) {
            const e2 = ur / 0.74
            if (lay.bank) {
              // to the glass first (its upper corner, on his side), then down to the rim
              const glass = new THREE.Vector3(lay.bankX, 3.38, hp.z - lay.dir * 0.375 + lay.dir * 0.02 + lay.dir * BALL_R)
              if (e2 < 0.55) { const a = e2 / 0.55; ball.position.copy(from.clone().lerp(glass, a)); ball.position.y += 0.25 * a * (1 - a) * 4 * 0.5 }
              else { const a = (e2 - 0.55) / 0.45; ball.position.copy(glass.clone().lerp(rimP, a)); ball.position.y -= 0.1 * a * (1 - a) * 4 * 0.4 }
            } else {
              ball.position.copy(from.clone().lerp(rimP, e2))
              ball.position.y = from.y + (rimP.y - from.y) * e2 + 4 * 0.5 * e2 * (1 - e2)
            }
          } else {
            const g = (ur - 0.74) / 0.26
            ball.position.copy(rimP).setY(rimP.y - (rimP.y - BALL_R) * g * g)
          }
          reaches.push([passer, from, 'layFollow', { hand: lay.hand, u: ur * 3 }])
        }
      } else if (passer && fr < G) {
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
      const pk = passer ? planPass(passer, k).kind : 'chest'
      const G = pk === 'long' ? 0.26 : pk === 'bounce' ? 0.2 : 0.18
      // with nobody to pass to (a pass drawn to an empty spot) he throws towards the spot
      const toRc = passer ? (rc ? rc.root.position.clone() : new THREE.Vector3(toX(end.x), 0, toZ(end.y))).sub(passer.root.position) : null
      const toRcH = passer ? passDir(passer, toRc) : null
      // caught with the arms out a little towards the pass; the next step
      // starts by pulling it in to the chest
      const toPasser = rc && passer ? passer.root.position.clone().sub(rc.root.position).setY(0).normalize() : null
      // A pass from behind him (into his run) isn't taken behind his back: it
      // is led out in front of him, to the side the passer is on, the way
      // you'd take it running — the less the passer is in front of him, the
      // more so.
      let catchDir = toPasser
      if (rc && toPasser) {
        const ahead = toPasser.dot(fwdOf(rc))
        const w = clampN((0.5 - ahead) / 0.6, 0, 1)
        if (w > 0) {
          const lead = fwdOf(rc).addScaledVector(sideOf(rc), (toPasser.dot(sideOf(rc)) < 0 ? -1 : 1) * 0.7).normalize()
          catchDir = toPasser.clone().lerp(lead, w).normalize()
        }
      }
      const catchPt = rc ? chestPoint(rc, catchDir).addScaledVector(catchDir || new THREE.Vector3(), 0.14) : new THREE.Vector3(toX(end.x), 1.2, toZ(end.y))
      // a bounce pass is taken low, at the waist
      if (pk === 'bounce' && rc) catchPt.y -= 0.3
      if (passer && fr < G) {
        // gather: the ball comes up into both hands at the chest (beside the
        // head for a long throw, down low for a bounce)
        const g = easeInOut(fr / G)
        ball.position.copy(gatherPath(passer, flight.gatherFrom, passGather(passer, pk, toRcH), g))
        reaches.push([passer, ball.position.clone(), pk === 'long' ? 'shoot' : 'hold'])
      } else {
        if (!flight.release) {
          flight.release = passer ? passGather(passer, pk, toRcH) : flight.gatherFrom.clone()
          flight.h = clearance(flight.release, catchPt, [passer, rc])
          if (pk === 'long') flight.h = Math.max(flight.h, 0.7 + 0.07 * flight.release.distanceTo(catchPt))
        }
        const u = passer ? (fr - G) / (1 - G) : fr
        const e = 1 - Math.pow(1 - u, pk === 'long' ? 1.15 : pk === 'bounce' ? 1.25 : 1.5) // fast off the hands, slowing a touch
        ball.position.copy(flight.release.clone().lerp(catchPt, e))
        if (pk === 'bounce') {
          // down to the floor two thirds of the way, and up into the hands
          const EF = 0.62; const rel = flight.release
          if (e < EF) { const s2 = 1 - e / EF; ball.position.y = BALL_R + (rel.y - BALL_R) * s2 * s2 }
          else { const s2 = (e - EF) / (1 - EF); ball.position.y = BALL_R + (catchPt.y - BALL_R) * (1 - (1 - s2) * (1 - s2)) }
          const dEF = Math.abs(e - EF)
          if (dEF < 0.03) squash = 1 - 0.14 * (1 - dEF / 0.03)
        } else ball.position.y += 4 * flight.h * e * (1 - e)
        // A soft catch: the hands meet the ball a little out in front and give
        // with it, drawing it in towards the chest, rather than stopping it
        // dead where it arrived.
        if (rc && passer && rc !== passer && toPasser && e > 0.82) {
          const gv = Math.sin(Math.PI * Math.min(1, (e - 0.82) / 0.18) * 0.5)
          ball.position.addScaledVector(toPasser, -0.2 * gv)
          ball.position.y -= 0.05 * gv
        }
        // the receiver shows a target: the hand nearer the passer comes up
        // before the ball is thrown
        if (rc && passer && rc !== passer && e < 0.5) {
          const wT = Math.max(0, Math.min(1, fr / 0.15)) * (1 - Math.max(0, Math.min(1, (e - 0.25) / 0.25)))
          if (wT > 0.02) {
            const sd = toPasser.dot(sideOf(rc)) > 0 ? 1 : -1
            const tgt = chestPoint(rc, toPasser).addScaledVector(toPasser, 0.28 * wT).add(new THREE.Vector3(0, 0.3 * wT, 0))
            reaches.push([rc, tgt, 'target', sd])
          }
        }
        // arms follow through, then the receiver's come up to meet it
        if (passer && u < 0.35) {
          const uu = u / 0.35; const fd = toRcH
          if (pk === 'long') reaches.push([passer, flight.release.clone(), 'shotFollow', u])
          else if (pk === 'bounce') reaches.push([passer, flight.release.clone().addScaledVector(fd, 0.28 * uu).add(new THREE.Vector3(0, -0.08 * uu, 0)), 'follow'])
          else reaches.push([passer, chestPoint(passer, toRcH).addScaledVector(fd, 0.25 * uu), 'follow'])
        }
        if (rc && e > 0.5) reaches.push([rc, e > 0.8 ? ball.position.clone() : ball.position.clone().lerp(catchPt, 0.5), e > 0.97 ? 'hold' : 'catch'])
        if (rc && rc !== passer) catching = { f: rc, w: Math.max(0, Math.min(1, (e - 0.78) / 0.22)) }
      }
    }
  } else {
    ball.position.set(ballXZ.x, BALL_R, ballXZ.z)
  }
  Object.values(figures).forEach((o) => { o.dribOn = o._dribNow })
  reaches.forEach(([f, p, kind, u]) => {
    if (kind === 'shoot') shootGrip(f, p)
    else if (kind === 'shotFollow') shotFollow(f, p, u)
    else if (kind === 'layGrip') layGrip(f, p, u)
    else if (kind === 'layFollow') layFollow(f, p, u.hand, u.u)
    else if (kind === 'cross') crossArms(f, u)
    else if (kind === 'dribble') {
      const hy = Math.max(ball.position.y, 0.62) + BALL_R + bodyOf(f).handR * 0.8
      reach(f, f.dribArm, ball.position.clone().setY(hy), new THREE.Vector3(0, -1, 0).addScaledVector(sideOf(f), f.dribArm * 0.4).addScaledVector(fwdOf(f), -0.15))
    } else if (kind === 'target') reach(f, u, p, new THREE.Vector3(0, -0.5, 0).addScaledVector(sideOf(f), u * 0.6))
    else if (kind === 'contest') reach(f, f.contestSide || 1, p, new THREE.Vector3(0, -0.3, 0).addScaledVector(sideOf(f), f.contestSide || 1))
    else holdBall(f, p)
  })
  // taking a pass in stride: the chest gives back as the ball arrives (the
  // legs are left alone: the feet are already planted)
  if (catching && catching.w > 0.01) {
    const c = catching.f; const w = Math.sin(Math.PI * catching.w)
    c.torso.rotation.x -= 0.1 * w
    c.head.rotation.x += 0.07 * w
  }
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
    // (small steps of its own: a long step has more time per sample than the spring's integration can take)
    const h = Math.min(dt, 0.04)
    nt.vs += ((inside ? 140 * (1 - nt.swish) : -55 * nt.swish) - 7 * nt.vs) * h
    nt.swish += nt.vs * h
    // swing: kicked along by the ball, then a few dying swings
    if (inside) { nt.vx += mv.x * 2.2; nt.vz += mv.z * 2.2 }
    nt.vx += (-48 * nt.sx - 3.2 * nt.vx) * h; nt.sx += nt.vx * h
    nt.vz += (-48 * nt.sz - 3.2 * nt.vz) * h; nt.sz += nt.vz * h
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
const _zero3 = new THREE.Vector3()
let SAMPLES = 1
let FIGS = []
const PER_FIG = 7 + 15 * 7 + 3 + 5 // root, 15 bones, expression (effort, focus, joy), cloth (lag x y z, flutter, stride)
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
  for (let i = 0; i < SAMPLES; i++) {
    const ts = Math.min(0.999999, i / (SAMPLES - 1))
    // the samples are an equal share of each step; a longer step is more time per sample
    simulate(ts, STEPD[stepAtTime(ts, N) - 1] / SPS)
    let o = i * FIGS.length * PER_FIG
    FIGS.forEach((f) => {
      f.root.position.toArray(figs, o); f.root.quaternion.toArray(figs, o + 3); o += 7
      f.bones.forEach((b) => { b.position.toArray(figs, o); b.quaternion.toArray(figs, o + 3); o += 7 })
      figs[o] = f.ex0; figs[o + 1] = f.ex1; figs[o + 2] = f.ex2; o += 3
      const cl = f.clothLag || _zero3
      figs[o] = cl.x; figs[o + 1] = cl.y; figs[o + 2] = cl.z; figs[o + 3] = f.clothFl || 0; figs[o + 4] = f.phase; o += 5
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
    f.exx = [0, 1, 2].map((k) => figs[o0 + k] * (1 - a) + figs[o1 + k] * a)
    o0 += 3; o1 += 3
    const mixc = (k) => figs[o0 + k] * (1 - a) + figs[o1 + k] * a
    f.cloth.uLag.value.set(mixc(0), mixc(1), mixc(2)); f.cloth.uFl.value = mixc(3); f.cloth.uPh.value = mixc(4)
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
  const pov = cam.mode === 'pov'
  const over = cam.mode === 'overview'
  if (pov !== lensPov || over !== lensOver || over) { lensPov = pov; lensOver = over; fitLens() }
  // first person: of his own body only the arms are drawn — the hands that
  // hold the ball are what you'd see looking down
  Object.values(figures).forEach((f) => {
    f.fp = cam.mode === 'pov' && f.p.id === povId
    f.bodyMesh.visible = !f.fp; f.fpArms.visible = f.fp; f.decal.visible = !f.fp
  })
  extras.forEach(({ ent, mesh }) => { const p = board.entPos(ent, t, N, MARKS); mesh.position.set(toX(p.x), isBall(ent) ? BALL_R : 0, toZ(p.y)) })
  scene.updateMatrixWorld()
  updateBlobs()
  // camera
  if (cam.mode === 'free') {
    // the point it turns about follows the ball, easing after it
    const tgt = new THREE.Vector3(ball.position.x, 1.0, ball.position.z)
    if (freeFocus) freeFocus.lerp(tgt, 0.12); else freeFocus = tgt
    const cp = Math.cos(free.pitch)
    camera.position.set(
      Math.max(-14, Math.min(14, freeFocus.x + free.dist * cp * Math.sin(free.yaw))),
      Math.max(0.35, freeFocus.y + free.dist * Math.sin(free.pitch)),
      Math.max(-6, Math.min(34, freeFocus.z + free.dist * cp * Math.cos(free.yaw))),
    )
    look = freeFocus.clone()
  } else if (cam.mode === 'pov' && figures[povId]) {
    const me = figures[povId]
    // at his eyes, a little in front of the face
    const eye = headCentre(me).addScaledVector(fwdOf(me), 0.04)
    const hasBall = carrier === me
    const target = hasBall ? hoopAt(me.root.position.z).clone().setY(2.2) : ball.position.clone().setY(Math.max(1.2, ball.position.y))
    // holding the ball he looks down towards it, so his hands are in the
    // picture, but keeps the basket in view while it's far enough away
    if (hasBall) {
      const hd = Math.hypot(target.x - eye.x, target.z - eye.z) || 1
      const pitch = clampN(Math.atan2(target.y - eye.y, hd) - 0.5, -0.55, 0.05)
      target.y = eye.y + hd * Math.tan(pitch)
    }
    camera.position.copy(eye)
    look = look ? look.lerp(target, 0.08) : target
  } else if (cam.mode === 'overview') {
    // for the video: high behind the half-court line (behind the baseline on a
    // full court), looking down the court — everyone in view, nobody hidden
    // behind anybody, the paths readable. It drifts a little with the ball.
    const full = courtView === 'full'
    const rig = overviewRig(full, W >= H)
    camera.position.set(ball.position.x * 0.12, rig.y, rig.z)
    const target = new THREE.Vector3(ball.position.x * 0.3, 0, rig.tz)
    look = look ? look.lerp(target, 0.06) : target
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
    const op = f.fp ? 1 : Math.max(0.1, Math.min(1, (d - 1.2) / 2.4))
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
  if (showPaths) updateRouteProgress(kStep)
  const holder = holderAt(t)
  carrierRing.visible = !!holder && !holder.fp
  if (holder) carrierRing.position.set(holder.root.position.x, 0.014, holder.root.position.z)
  renderFrame()
}
let camPosZ = null

// ── the free camera: turn, zoom, reset ─────────────────────────────────
const clampN = (v, a, b) => Math.max(a, Math.min(b, v))
// start from where the camera is now (so switching to it doesn't jump), or
// from a good default
function initFree(reset) {
  freeFocus = null
  if (reset) { Object.assign(free, { yaw: 0, pitch: 0.42, dist: 11 }); return }
  const off = camera.position.clone().sub(new THREE.Vector3(ball.position.x, 1.0, ball.position.z))
  const d = off.length() || 11
  free.dist = clampN(d, 4, 24)
  free.yaw = Math.atan2(off.x, off.z)
  free.pitch = clampN(Math.asin(clampN(off.y / d, -1, 1)), 0.05, 1.45)
}
const dom = renderer.domElement
const pointers = new Map()
let pinch = 0
let lastTap = { t: 0, x: 0, y: 0 }
const pinchDist = () => { if (pointers.size !== 2) return 0; const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) }
const redraw = () => { dirty = true; schedule() }
dom.addEventListener('pointerdown', (e) => {
  if (cam.mode !== 'free') return
  pointers.set(e.pointerId, [e.clientX, e.clientY]); dom.setPointerCapture(e.pointerId); pinch = pinchDist()
})
dom.addEventListener('pointermove', (e) => {
  if (cam.mode !== 'free' || !pointers.has(e.pointerId)) return
  const p = pointers.get(e.pointerId)
  if (pointers.size === 1) {
    free.yaw -= (e.clientX - p[0]) * 0.008
    free.pitch = clampN(free.pitch + (e.clientY - p[1]) * 0.006, 0.05, 1.45)
  }
  pointers.set(e.pointerId, [e.clientX, e.clientY])
  if (pointers.size === 2) { const d = pinchDist(); if (pinch > 0 && d > 0) free.dist = clampN((free.dist * pinch) / d, 4, 24); pinch = d }
  redraw()
})
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return
  const p = pointers.get(e.pointerId)
  pointers.delete(e.pointerId)
  pinch = pinchDist()
  // a quick second tap in the same place puts the view back
  if (e.type === 'pointerup' && cam.mode === 'free' && Math.hypot(e.clientX - p[0], e.clientY - p[1]) < 8) {
    const now = performance.now()
    if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { initFree(true); redraw(); lastTap = { t: 0, x: 0, y: 0 } } else lastTap = { t: now, x: e.clientX, y: e.clientY }
  }
}
dom.addEventListener('pointerup', endPointer)
dom.addEventListener('pointercancel', endPointer)
dom.addEventListener('wheel', (e) => {
  if (cam.mode !== 'free') return
  e.preventDefault()
  free.dist = clampN(free.dist * Math.exp(e.deltaY * 0.001), 4, 24)
  redraw()
}, { passive: false })
const frame = (t) => { applyBaked(t); view(t) }

// ── paths on the floor ────────────────────────────────────────────────
// What the 2D court draws for the step being played, laid on the floor: each
// action's route (a wavy line for a dribble, dashes for a pass, dots for a
// shot, a long-short dash for a handoff, a bar across the end of a screen),
// in a colour per kind of action, with a dark edge and a soft glow, so it reads
// on light wood and on the painted key alike. One group per step; only the current step's is shown.
let routeGroups = []
let showPaths = true
// each kind of action has its own colour (see routeColors.js): a line, and a
// faint glow of the same colour round it, over one shared dark edge
const routeMats = {}
// How far along each route its mover has got (metres), by route number: the
// part of the line behind him is drawn the same colour but faded, like a
// trail already covered. Every route material shares this one array.
const ROUTES_MAX = 40
const routeProg = { value: new Float32Array(ROUTES_MAX) }
function passed(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uProg = routeProg
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float arc; attribute float rid; varying float vArc; varying float vRid;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvArc = arc; vRid = rid;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uProg[' + ROUTES_MAX + ']; varying float vArc; varying float vRid;').replace('#include <color_fragment>', '#include <color_fragment>\n{ float pr = uProg[int(vRid + 0.5)]; diffuseColor.a *= mix(0.3, 1.0, smoothstep(pr - 0.4, pr, vArc)); }')
  }
  mat.customProgramCacheKey = () => 'route-passed'
  return mat
}
const matsFor = (type) => routeMats[type] || (routeMats[type] = {
  ink: passed(new THREE.MeshBasicMaterial({ color: ROUTE_COLORS[type] ?? 0xffffff, transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
  glow: passed(new THREE.MeshBasicMaterial({ color: ROUTE_COLORS[type] ?? 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })),
})
const edgeMat = passed(new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
// Laid as thin tubes, not flat ribbons: a flat line seen from a low camera
// shrinks to almost nothing, a tube looks the same thickness from anywhere.
const ROUTE_Y = 0.05
const ROUTE_R = 0.08 // the line's radius, metres
const EDGE = 0.04 // the dark edge round it
const GLOW = 0.085 // and a soft glow outside that
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
// a tube of radius r along a polyline (world x/z), six-sided, with rounded
// ends where asked (a hemisphere of a few rings). Every vertex also records
// how far along its route it lies (arc, metres) and which route it belongs to
// (rid), for the fade of the part already covered.
const TUBE_SIDES = 6
const CAP_RINGS = 3
let curRid = 0
const pushV = (arr, arc, ...v) => { arr.push(...v); arr.arc.push(arc); arr.rid.push(curRid) }
function addTube(arr, line, r, base = 0, capStart = false, capEnd = false) {
  const n = line.length
  const cum = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z))
  const tan = (i) => {
    const a = line[Math.max(0, i - 1)]; const b = line[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x; const dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1
    return [dx / l, dz / l]
  }
  // a ring about centre c, with the tube's side and the given radius, pushed
  // `along` the tube's direction
  const ringAt = (c, [tx, tz], rr, along) => {
    const sx = -tz; const sz = tx
    const out = []
    for (let k = 0; k < TUBE_SIDES; k++) {
      const th = (k / TUBE_SIDES) * Math.PI * 2
      out.push([c.x + tx * along + sx * Math.cos(th) * rr, ROUTE_Y + Math.sin(th) * rr, c.z + tz * along + sz * Math.cos(th) * rr])
    }
    return out
  }
  const band = (p, q, ap, aq) => {
    for (let k = 0; k < TUBE_SIDES; k++) {
      const k2 = (k + 1) % TUBE_SIDES
      pushV(arr, ap, ...p[k]); pushV(arr, ap, ...p[k2]); pushV(arr, aq, ...q[k]); pushV(arr, ap, ...p[k2]); pushV(arr, aq, ...q[k2]); pushV(arr, aq, ...q[k])
    }
  }
  if (capStart && n > 1) {
    const T = tan(0); const T0 = [T[0], T[1]]
    let prev = null
    for (let j = 0; j <= CAP_RINGS; j++) {
      const ph = (Math.PI / 2) * (1 - j / CAP_RINGS) // tip → full ring
      const ring = ringAt(line[0], T0, r * Math.cos(ph), -r * Math.sin(ph))
      if (prev) band(prev, ring, base, base)
      prev = ring
    }
  }
  let prev = ringAt(line[0], tan(0), r, 0)
  for (let i = 1; i < n; i++) {
    const cur = ringAt(line[i], tan(i), r, 0)
    band(prev, cur, base + cum[i - 1], base + cum[i])
    prev = cur
  }
  if (capEnd && n > 1) {
    const T = tan(n - 1)
    let p2 = prev
    for (let j = 1; j <= CAP_RINGS; j++) {
      const ph = (Math.PI / 2) * (j / CAP_RINGS)
      const ring = ringAt(line[n - 1], T, r * Math.cos(ph), r * Math.sin(ph))
      band(p2, ring, base + cum[n - 1], base + cum[n - 1])
      p2 = ring
    }
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
  if (!dash) { addTube(arr, line, hw, 0, true, false); return }
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z))
  const total = cum[cum.length - 1]
  const period = dash.reduce((n, v) => n + v, 0)
  for (let s = 0; s < total;) {
    let on = true
    for (const v of dash) {
      if (on) addTube(arr, slice(line, cum, s, Math.min(total, s + v)), hw, s, true, true)
      s += v; on = !on
      if (s >= total) break
    }
    if (period <= 0) break
  }
}
function addArrow(arr, line, hw, arcEnd) {
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
  for (let k = 0; k < 8; k++) { pushV(arr, arcEnd, ...tip); pushV(arr, arcEnd, ...rim[k]); pushV(arr, arcEnd, ...rim[(k + 1) % 8]) }
}
const toLine = (pts) => pts.map((p) => ({ x: toX(p.x), z: toZ(p.y) }))
// A route starts a little way ahead of its mover, not under his feet
const ROUTE_GAP = 0.6
let routeInfos = [] // per step: [{ line, cum, at: () => position of the mover, rid }]
const newArr = () => { const a = []; a.arc = []; a.rid = []; return a }
const arcsOf = (line) => { const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)); return cum }
function buildRoutes() {
  routeGroups.forEach((g) => { scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose() }) })
  routeGroups = []; routeInfos = []
  const cmap = CARRIERS
  const all = play.players.filter((p) => !isCone(p)).concat([Object.assign({ id: 'ball' }, play.ball)])
  const moverOf = (ent) => () => (ent.id === 'ball' ? ball.position : figures[ent.id] ? figures[ent.id].root.position : (extras.find((x) => x.ent.id === ent.id) || {}).mesh?.position)
  for (let k = 1; k <= N; k++) {
    const edge = newArr()
    const ink = {}; const glow = {} // by kind of action
    const infos = []
    curRid = 0
    all.forEach((ent) => {
      actsOf(ent).forEach((act) => {
        if (act.step !== k || !act.pts.length) return
        const start = ent.id === 'ball' ? board.ballStart(k, cmap) : isBall(ent) ? board.ballStart(k, null, ent) : baseAt(ent, k)
        const pts = [start].concat(act.pts)
        if (pts.length < 2) return
        const ty = act.type in ROUTE_COLORS ? act.type : 'pass'
        const inkA = ink[ty] || (ink[ty] = newArr()); const glowA = glow[ty] || (glow[ty] = newArr())
        let line = toLine(ty === 'dribble' ? waveSample(pts) : curveSample(pts))
        const cum0 = arcsOf(line)
        const total0 = cum0[cum0.length - 1]
        // start a little ahead of the mover (less on a very short route)
        if (total0 > 0.3) line = slice(line, cum0, Math.min(ROUTE_GAP, total0 * 0.35), total0)
        const cum = arcsOf(line); const total = cum[cum.length - 1]
        curRid = Math.min(infos.length, ROUTES_MAX - 1)
        infos.push({ line, cum, at: moverOf(ent), rid: curRid })
        const dash = ty === 'pass' ? [0.34, 0.26] : ty === 'shot' ? [0.06, 0.26] : ty === 'handoff' ? [0.02, 0.12, 0.22, 0.12] : null
        for (const [arr, hw] of [[glowA, ROUTE_R + EDGE + GLOW], [edge, ROUTE_R + EDGE], [inkA, ROUTE_R]]) {
          addStroke(arr, line, hw, dash)
          if (ty !== 'screen') addArrow(arr, line, hw, total + 0.1)
        }
        if (ty === 'screen') {
          const a = pts[pts.length - 2]; const b = pts[pts.length - 1]
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const nx = -(b.y - a.y) / l; const ny = (b.x - a.x) / l
          const bar = toLine([{ x: b.x - nx * 46, y: b.y - ny * 46 }, { x: b.x + nx * 46, y: b.y + ny * 46 }])
          addTube(glowA, bar, ROUTE_R + EDGE + GLOW, total + 0.1, true, true); addTube(edge, bar, ROUTE_R + EDGE, total + 0.1, true, true); addTube(inkA, bar, ROUTE_R, total + 0.1, true, true)
        }
      })
    })
    const g = new THREE.Group()
    const layers = [[edge, edgeMat, 2]]
    Object.keys(ink).forEach((ty) => { layers.push([glow[ty], matsFor(ty).glow, 1], [ink[ty], matsFor(ty).ink, 3]) })
    layers.forEach(([arr, mat, order]) => {
      if (!arr.length) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
      geo.setAttribute('arc', new THREE.BufferAttribute(new Float32Array(arr.arc), 1))
      geo.setAttribute('rid', new THREE.BufferAttribute(new Float32Array(arr.rid), 1))
      const m = new THREE.Mesh(geo, mat)
      m.renderOrder = order; m.frustumCulled = false
      g.add(m)
    })
    g.visible = false
    scene.add(g)
    routeGroups.push(g)
    routeInfos.push(infos)
  }
}
// How far along its route each mover is now, from where he stands: the point
// of the line nearest to him
function updateRouteProgress(kStep) {
  const infos = routeInfos[kStep - 1]
  if (!infos) return
  routeProg.value.fill(0)
  infos.forEach(({ line, cum, at, rid }) => {
    const m = at(); if (!m) return
    let best = Infinity; let arc = 0
    for (let i = 1; i < line.length; i++) {
      const ax = line[i - 1].x; const az = line[i - 1].z; const dx = line[i].x - ax; const dz = line[i].z - az
      const l2 = dx * dx + dz * dz || 1e-9
      const u = Math.max(0, Math.min(1, ((m.x - ax) * dx + (m.z - az) * dz) / l2))
      const d = Math.hypot(m.x - (ax + dx * u), m.z - (az + dz * u))
      if (d < best) { best = d; arc = cum[i - 1] + (cum[i] - cum[i - 1]) * u }
    }
    routeProg.value[rid] = arc
  })
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
  else if (act.type === 'shot') { const pl = CARRIERS[k] && figures[CARRIERS[k].id] ? planShot(figures[CARRIERS[k].id], k, act) : null; who = fr < (pl && pl.kind === 'layup' ? pl.lay.rel : 0.3) ? CARRIERS[k] : null }
  else who = fr < 0.5 ? CARRIERS[k] : CARRIERS[k + 1]
  return who ? figures[who.id] || null : null
}

// ── playback in the app ────────────────────────────────────────────────
// At most 30 frames a second (plenty for a tactics replay, and it halves
// the battery drain of 60) and nothing drawn at all while nothing changes.
//
// Three quality levels, chosen by hand (an old tablet and a new phone can't
// be told apart from the code, and a guess either way is wrong for someone):
//   high   — full resolution, soft shadows, 4× smoothing, the blurred hall
//   medium — a little less of everything
//   low    — for old devices: smaller picture, no shadows, no smoothing, the
//            hall as a small stretched picture instead of a blurred one, the
//            warm pools of light left out, fewer samples for the outlines
const dpr = window.devicePixelRatio || 1
const QUALITY = {
  high: { pr: Math.min(dpr, 2), shadows: true, map: 2048, msaa: 4, bgScale: 0.5, bgBlur: true, taps: 8, spots: true, nets: true, grade: true, reflect: 0.5 },
  medium: { pr: Math.min(dpr, 1.5), shadows: true, map: 1024, msaa: 2, bgScale: 0.5, bgBlur: true, taps: 8, spots: false, nets: true, grade: true, reflect: 0 },
  // for the video export: everything on, at the video's own size (no extra pixel density)
  export: { pr: 1, shadows: true, map: 2048, msaa: 4, bgScale: 0.5, bgBlur: true, taps: 8, spots: true, nets: true, grade: true, reflect: 0.5, noScoreboard: true },
  low: { pr: 1, shadows: false, map: 512, msaa: 0, bgScale: 0.25, bgBlur: false, taps: 4, spots: false, nets: false, grade: false, reflect: 0 },
}
let quality = 'medium'
function applyQuality(q) {
  const Q = QUALITY[q] || QUALITY.medium
  quality = QUALITY[q] ? q : 'medium'
  qual.bgScale = Q.bgScale; qual.bgBlur = Q.bgBlur; qual.nets = Q.nets
  outlinePass.uniforms.taps.value = Q.taps
  spots.forEach((l) => { l.visible = Q.spots })
  gradePass.enabled = Q.grade
  if (scoreboard) scoreboard.visible = !Q.noScoreboard
  qual.reflectScale = Q.reflect || 0.5; reflector.visible = Q.reflect > 0; beams.visible = Q.reflect > 0
  // smoothing: the picture is drawn into these two, so they carry the samples
  ;[composer.renderTarget1, composer.renderTarget2].forEach((rt) => { if (rt.samples !== Q.msaa) { rt.samples = Q.msaa; rt.dispose() } })
  renderer.setPixelRatio(Q.pr)
  sizeComposer()
  renderer.shadowMap.enabled = Q.shadows
  sun.shadow.mapSize.set(Q.map, Q.map)
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null }
  // a net pass left out must not leave an old picture of the nets behind
  if (!Q.nets) { renderer.setRenderTarget(netRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.setRenderTarget(null) }
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true }) })
}
applyQuality(quality)

let target = 0; let dirty = false; let raf = 0; let lastDraw = 0; let disposed = false
function schedule() { if (!raf && !disposed) raf = requestAnimationFrame(tick) }
function tick(ts) {
  raf = 0
  if (!dirty || !BAKED) return
  if (ts - lastDraw < 1000 / 30 - 2) { schedule(); return }
  lastDraw = ts; dirty = false
  frame(target)
}

let figKey = null
return {
  // The board to show: the same state object the 2D court draws.
  setBoard(s) {
    play = s
    courtView = s.view || 'half'
    board = makeBoard(s)
    N = board.nSteps(); MARKS = board.marks(); CARRIERS = board.carriers()
    STEPD = Array.from({ length: N }, (_, i) => stepSecs(s.players, i + 1))
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
  // 'high' | 'medium' | 'low'
  setQuality(q) { if (q !== quality && QUALITY[q]) { applyQuality(q); dirty = true; schedule() } },
  setPaths(on) { showPaths = !!on; dirty = true; schedule() },
  setCourtView(v) { if (v !== courtView) { courtView = v; camPosZ = null; look = null; dirty = true; schedule() } },
  setCamera(mode, povId) {
    if (mode === 'free' && cam.mode !== 'free') initFree(false)
    cam.mode = mode; cam.povId = povId || null; look = null
    dom.style.touchAction = mode === 'free' ? 'none' : 'auto'
    dom.style.cursor = mode === 'free' ? 'grab' : 'default'
    dirty = true; schedule()
  },
  render(t) { target = Math.max(0, Math.min(1, t)); dirty = true; schedule() },
  // draws the frame straight away and hands back the canvas, for the video export
  renderNow(t) { target = Math.max(0, Math.min(1, t)); dirty = false; frame(target); return renderer.domElement },
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
    ;[maskRT, netRT, bgRT, blurRT, reflector.getRenderTarget()].forEach((rt) => rt.dispose())
    composer.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  },
}
}
