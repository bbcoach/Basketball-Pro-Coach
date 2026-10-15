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
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Basketball Pro Coach',
        short_name: 'Pro Coach',
        description: 'Tactics board, stat tracker, practice planner and attendance for basketball coaches.',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'portrait',
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
        // vite-plugin-pwa only turns these on by itself when it also injects
        // the register script (injectRegister: 'auto' | null). We register
        // manually in main.jsx instead, so without this a new service
        // worker installs but sits in "waiting" forever — nothing ever
        // sends it the skip-waiting message our own registerType
        // 'autoUpdate' client code expects to be unnecessary, so a device
        // can stay on a stale build until every open tab/app instance for
        // the origin is fully gone.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
