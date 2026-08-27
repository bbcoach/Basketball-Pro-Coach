import { HALF, FULL } from './board-geometry'
import { download } from './download'

function nextFrame() {
  return new Promise((r) => {
    let done = false
    const fin = () => { if (!done) { done = true; r() } }
    requestAnimationFrame(() => requestAnimationFrame(fin))
    setTimeout(fin, 60)
  })
}

function canvasSize(view) {
  const vb = (view === 'half' ? HALF : FULL).split(' ').map(Number)
  const w = 1000
  return [w, Math.round((w * vb[3]) / vb[2])]
}

function svgBlobUrl(svgEl, contentEl, view) {
  // Build a fresh, always-portrait SVG from the defs + content elements
  // instead of cloning the live <svg> wholesale — in the Tactics Board's
  // landscape layout the live one carries an on-screen rotation transform
  // and a swapped viewBox, and exports should stay in the play's natural
  // (portrait-authored) orientation regardless of how the device is held.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', view === 'half' ? HALF : FULL)
  const defs = svgEl.querySelector('defs')
  if (defs) svg.appendChild(defs.cloneNode(true))
  const content = contentEl.cloneNode(true)
  content.removeAttribute('transform')
  svg.appendChild(content)
  const s = new XMLSerializer().serializeToString(svg)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
}

async function drawFrame(svgRef, contentRef, view, ctx, w, h) {
  const url = svgBlobUrl(svgRef.current, contentRef.current, view)
  await new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => { ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); res() }
    img.onerror = rej
    img.src = url
  })
}

function fileBase(state) {
  return (state.playName || 'play').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

async function shareOrDownload(blob, file, title, set, savedLabel) {
  if (navigator.canShare && window.File) {
    const fl = new File([blob], file, { type: blob.type })
    if (navigator.canShare({ files: [fl] })) {
      await navigator.share({ files: [fl], title })
      set({ shareOpen: false, shareStatus: 'Shared' })
      return
    }
  }
  download(blob, file)
  set({ shareOpen: false, shareStatus: savedLabel, hint: savedLabel + ' as ' + file })
}

export async function exportStill(svgRef, contentRef, stateRef, set) {
  try {
    set({ shareStatus: 'Rendering image…', exporting: true })
    await nextFrame()
    const s = stateRef.current
    const [w, h] = canvasSize(s.view)
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    await drawFrame(svgRef, contentRef, s.view, cv.getContext('2d'), w, h)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    set({ exporting: false })
    const file = fileBase(s) + '.png'
    await shareOrDownload(blob, file, s.playName, set, 'Image saved')
  } catch {
    set({ exporting: false, shareStatus: 'Could not render the image' })
  }
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS 13+ reports as Mac
}

function isStandaloneOnIOS() {
  // display-mode:standalone alone isn't enough — Android/Chrome PWAs match it
  // too, and MediaRecorder on a canvas stream works fine there. The capture
  // restriction is specific to iOS Safari's standalone (Home Screen) mode.
  return isIOSDevice() && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches)
}

export async function exportClip(svgRef, contentRef, stateRef, set) {
  if (!window.MediaRecorder) { set({ shareStatus: 'Video recording is not supported here' }); return }
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    set({ shareStatus: 'Video recording is not supported here' })
    return
  }
  // iOS blocks MediaRecorder on a canvas stream when the app is installed to
  // the Home Screen (standalone display mode) — it works fine in a regular
  // Safari tab, so don't waste an attempt on a failure we can predict.
  if (isStandaloneOnIOS()) {
    set({ shareStatus: 'Video export needs Safari — open this app in a browser tab to record a video, or use Still image here' })
    return
  }

  const s0 = stateRef.current
  const [w, h] = canvasSize(s0.view)
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')

  let stream
  let type
  let rec
  try {
    stream = cv.captureStream(20)
    if (!stream.getVideoTracks().length) throw new Error('no video track from captureStream')
    const cands = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    type = cands.find((c) => MediaRecorder.isTypeSupported(c)) || ''
    rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5000000 } : { videoBitsPerSecond: 5000000 })
  } catch (err) {
    set({ shareStatus: 'Video recording is not supported here' + (err && err.message ? ' (' + err.message + ')' : '') })
    return
  }

  try {
    const parts = []
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
    const done = new Promise((r) => { rec.onstop = r })
    const wasPlaying = s0.playing
    const t0 = s0.t
    set({ playing: false, exporting: true })
    rec.start()
    const fps = 20
    const secPerStep = 1 / 0.42 / s0.speed
    const nStepsNow = Math.max(1, s0.steps)
    const frames = Math.round(fps * secPerStep * nStepsNow)
    for (let i = 0; i <= frames; i++) {
      set({ t: i / frames, shareStatus: 'Recording at ' + s0.speed + '× … ' + Math.round((i / frames) * 100) + '%' })
      await nextFrame()
      await drawFrame(svgRef, contentRef, s0.view, ctx, w, h)
    }
    rec.stop()
    await done
    set({ t: t0, playing: wasPlaying, exporting: false })
    if (!parts.length) throw new Error('recording produced no data')
    const mime = (rec.mimeType || type || 'video/mp4').split(';')[0]
    const blob = new Blob(parts, { type: mime })
    const file = fileBase(s0) + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm')
    await shareOrDownload(blob, file, s0.playName, set, 'Video saved')
  } catch (err) {
    // Safari's captureStream()+MediaRecorder combo has been unreliable for
    // years — both APIs individually feature-detect as present, but
    // starting the recorder throws this exact permission-flavored error
    // even though no permission prompt was ever involved. It's a platform
    // limitation, not something an app-level retry or config fixes, so
    // give a clear way forward instead of surfacing the raw DOMException.
    const blockedBySafari = err && (err.name === 'NotAllowedError' || /not allowed/i.test(err.message || ''))
    set({
      exporting: false,
      shareStatus: blockedBySafari
        ? "Safari doesn't support recording this animation — use Still image instead"
        : 'Could not record the animation' + (err && err.message ? ' (' + err.message + ')' : ''),
    })
  }
}
