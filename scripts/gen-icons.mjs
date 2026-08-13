import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const ACCENT = '#e8b13c'

function iconSvg(size, pad) {
  const s = size
  const inner = s - pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#0a0a0b"/>
  <g transform="translate(${pad},${pad})">
    <g transform="translate(${inner * 0.02},0) scale(${inner / 48})">
      <circle cx="21" cy="27" r="15" fill="none" stroke="${ACCENT}" stroke-width="2.6"/>
      <path d="M6 27 H36" fill="none" stroke="${ACCENT}" stroke-width="1.7" opacity="0.9"/>
      <path d="M21 12 V42" fill="none" stroke="${ACCENT}" stroke-width="1.7" opacity="0.9"/>
      <path d="M10.5 16.5 C17 22 17 32 10.5 37.5" fill="none" stroke="${ACCENT}" stroke-width="1.7" opacity="0.9"/>
      <path d="M31.5 16.5 C25 22 25 32 31.5 37.5" fill="none" stroke="${ACCENT}" stroke-width="1.7" opacity="0.9"/>
      <path d="M30 19 C36 15 38 11 39.5 7.5" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 3.4"/>
      <path d="M43 4 L34.5 7 L39.5 12 Z" fill="#ffffff" transform="rotate(-18 39 8)"/>
    </g>
  </g>
</svg>`
}

const browser = await chromium.launch()
const page = await browser.newPage()

mkdirSync('public/icons', { recursive: true })

for (const [size, pad, name] of [[192, 24, 'icon-192.png'], [512, 64, 'icon-512.png']]) {
  const svg = iconSvg(size, pad)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`)
  const buf = await page.locator('svg').screenshot()
  writeFileSync(`public/icons/${name}`, buf)
  console.log('wrote', name)
}

// favicon (simple, no bg padding needed as small)
writeFileSync('public/favicon.svg', iconSvg(48, 0))

await browser.close()
