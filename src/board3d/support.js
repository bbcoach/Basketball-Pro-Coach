// Whether this device can draw the 3D view at all (it needs WebGL 2). Kept
// apart from the 3D code itself so asking costs nothing: that code, and the
// three.js library with it, is only fetched when someone opens the 3D view.
let known
export function webgl3dSupported() {
  if (known !== undefined) return known
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    known = !!gl
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    known = false
  }
  return known
}
