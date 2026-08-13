# Basketball Pro Coach

A tactics board, stat tracker, practice planner and training-attendance app for basketball coaches. Built with React + Vite, installable as a PWA. Everything is stored locally on your device — no accounts, no tracking.

## Get it live on GitHub Pages (no command line needed)

1. Go to your repo on github.com: `github.com/bbcoach/Basketball-Pro-Coach`
2. Click **Add file → Upload files**.
3. Drag the **contents** of this folder in (all the files and folders you see here — `src`, `public`, `.github`, `index.html`, `package.json`, etc.) — not this folder itself, its contents.
4. Scroll down and click **Commit changes**.
5. Go to **Settings → Pages** (left sidebar, under "Code and automation").
6. Under **Build and deployment → Source**, choose **GitHub Actions**.
7. Go to the **Actions** tab — a workflow called "Deploy to GitHub Pages" should already be running (it started automatically from your upload). Wait for it to finish (green check, ~1 minute).
8. Back in **Settings → Pages**, you'll see your live URL — something like `https://bbcoach.github.io/Basketball-Pro-Coach/`. Open that on your phone.
9. In your phone's browser, use **Share → Add to Home Screen** (iPhone/Safari) or the **⋮ menu → Install app** (Android/Chrome) to install it like a real app.

Every time you (or Claude) push new changes to the `main` branch, it rebuilds and redeploys automatically — no extra steps.

## Local development

```
npm install
npm run dev       # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Project layout

- `src/state/store.jsx` — all app state and actions (board, plays, roster, stats, attendance, practice)
- `src/lib/board-geometry.js` — court/route/animation math (steps, easing, ball magnetism, defender follow)
- `src/components/board/` — Tactics Board screen (court SVG, tools, modals)
- `src/components/stats/`, `src/components/attendance/`, `src/components/practice/` — the other three modules
- `src/state/config.js` — team name, accent color, donate link
