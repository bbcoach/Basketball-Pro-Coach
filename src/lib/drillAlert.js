// A short buzzer-style beep + vibration for when a drill's timer runs out —
// synthesized with the Web Audio API rather than shipping an audio file, so
// it works fully offline like the rest of this PWA. iOS Safari (and most
// browsers) won't let an AudioContext produce sound until it's been
// created/resumed from a real user gesture, so unlockDrillAlert() is called
// from the "Start" tap that kicks off a run — well before the timer ever
// needs to actually play anything.
let ctx = null

export function unlockDrillAlert() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* Web Audio unsupported — playDrillAlert() below just no-ops */ }
}

export function playDrillAlert() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  if (!ctx) return
  const now = ctx.currentTime
  // Two short beeps read more like a buzzer than one plain tone.
  ;[0, 0.22].forEach((offset) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + offset)
    osc.stop(now + offset + 0.2)
  })
}
