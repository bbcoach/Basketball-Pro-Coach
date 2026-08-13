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

function svgBlobUrl(svgEl) {
  const c = svgEl.cloneNode(true)
  c.removeAttribute('style')
  const s = new XMLSerializer().serializeToString(c)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
}

async function drawFrame(svgRef, view, ctx, w, h) {
  const url = svgBlobUrl(svgRef.current)
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

export async function exportStill(svgRef, stateRef, set) {
  try {
    set({ shareStatus: 'Rendering image…', exporting: true })
    await nextFrame()
    const s = stateRef.current
    const [w, h] = canvasSize(s.view)
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    await drawFrame(svgRef, s.view, cv.getContext('2d'), w, h)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    set({ exporting: false })
    const file = fileBase(s) + '.png'
    await shareOrDownload(blob, file, s.playName, set, 'Image saved')
  } catch {
    set({ exporting: false, shareStatus: 'Could not render the image' })
  }
}

export async function exportClip(svgRef, stateRef, set) {
  if (!window.MediaRecorder) { set({ shareStatus: 'Video recording is not supported here' }); return }
  try {
    const s0 = stateRef.current
    const [w, h] = canvasSize(s0.view)
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')
    const stream = cv.captureStream(20)
    const cands = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    const type = cands.find((c) => MediaRecorder.isTypeSupported(c)) || ''

    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5000000 } : { videoBitsPerSecond: 5000000 })
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
      await drawFrame(svgRef, s0.view, ctx, w, h)
    }
    rec.stop()
    await done
    set({ t: t0, playing: wasPlaying, exporting: false })
    const mime = (rec.mimeType || type || 'video/mp4').split(';')[0]
    const blob = new Blob(parts, { type: mime })
    const file = fileBase(s0) + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm')
    await shareOrDownload(blob, file, s0.playName, set, 'Video saved')
  } catch {
    set({ exporting: false, shareStatus: 'Could not record the animation' })
  }
}
