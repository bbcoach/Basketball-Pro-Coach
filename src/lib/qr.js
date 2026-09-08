import QRCode from 'qrcode'
import jsQR from 'jsqr'

// 'L' (lowest) error correction, on purpose: it's the setting that packs the
// most data per module, and the offer/answer text this exists for (a few
// hundred bytes, see deviceSync.js) is already small enough that a lower
// tolerance for a smudged screen isn't the trade-off it would be for, say,
// a printed poster QR code seen from across a room. Read once, at arm's
// length, off another phone's own screen — that's the target, not a photo
// of a wall.
export function encodeQr(text) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'L', margin: 2, width: 320 })
}

// Decodes a QR code from one video frame. Returns the decoded text, or null
// if this particular frame didn't have a readable code in it — the caller
// is expected to keep calling this on a loop across frames until it does,
// which is also why this doesn't own the camera or the loop itself: keeping
// it a pure function of one frame's pixels makes it trivial to test without
// a camera at all.
export function decodeQrFrame(imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  return code ? code.data : null
}
