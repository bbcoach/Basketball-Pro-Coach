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
