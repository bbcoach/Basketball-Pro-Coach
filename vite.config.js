import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Content-Security-Policy as a <meta> tag — GitHub Pages can't send
// custom response headers. Build-only: the dev server's React Fast
// Refresh preamble is an inline script this policy would block.
//
// - style-src 'unsafe-inline': the print reports are HTML strings with
//   <style> blocks and style="" attributes, written into a same-origin
//   iframe that inherits this policy. (React's own inline styles go
//   through the CSSOM, which CSP doesn't restrict.) Google Fonts is for
//   those same reports; the app itself self-hosts its fonts.
// - img-src data: blob:: QR codes and resized roster photos are data:
//   URLs; video-export frames are drawn from blob: SVG images.
// - worker-src blob:: Mediabunny spins up a helper Worker from a blob:
//   URL; 'self' covers the service worker.
// - connect-src: the sync / league-schedule Worker is the only remote
//   endpoint the app ever calls.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://basketball-pro-coach-sync.ralph-arnold.workers.dev",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function cspMeta() {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  // Relative base so the build works when hosted at a sub-path, e.g. a
  // GitHub Pages project site at https://<user>.github.io/<repo>/.
  base: './',
  build: {
    // The 3D view (three.js, ~150 kB gzipped) is its own chunk, fetched only when
    // someone opens it — so it is allowed to be bigger than the default warning.
    chunkSizeWarningLimit: 650,
  },
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      // 'prompt': a new build waits until the coach taps Update in the
      // "New version ready" bar (see main.jsx, UpdateBanner) rather than
      // restarting the app under them.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Basketball Pro Coach',
        short_name: 'Pro Coach',
        description: 'Tactics board, stat tracker, practice planner and attendance for basketball coaches.',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The new worker waits (no skipWaiting) until the Update button sends
        // it the skip-waiting message the generated worker listens for; once
        // it is active it takes over every open page.
        clientsClaim: true,
      },
    }),
  ],
})
