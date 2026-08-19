import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base so the build works when hosted at a sub-path, e.g. a
  // GitHub Pages project site at https://<user>.github.io/<repo>/.
  base: './',
  plugins: [
    react(),
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
