// A picked player photo gets downscaled and re-encoded before it ever
// touches state. Everything in this app lives in localStorage — there is no
// backend to offload full-resolution phone photos to — and a roster of
// twenty untouched camera shots would eat the whole quota on its own. At
// 240px on the long edge and JPEG quality .72 a headshot lands around
// 10–20KB, so even a large squad costs a few hundred KB total.
const MAX_DIM = 240
const QUALITY = 0.72

export function readPlayerPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo.")) }
    img.src = url
  })
}
