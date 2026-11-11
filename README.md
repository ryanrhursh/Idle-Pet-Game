# Pawville 🐾

A cozy **3D idle city-builder** where the pets you collect *are* the citizens.
Every pet needs a home, a job and food. In return they work, level up and make your town grow.

Runs in any modern browser on **Windows, Mac, iOS and Android**. It can be installed as an app (PWA) and played offline.

**Play it:** https://ryanrhursh.github.io/Idle-Pet-Game/ (updates automatically whenever `main` changes)

## Play / develop

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL. `--host` is on, so the **Network** URL also works from a phone on the same Wi-Fi.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` (static files, host anywhere) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the game-logic tests (Node's built-in test runner) |

## How it plays

- **Citizens:** 19 species across 5 rarities (Common to Legendary). Each pet has a random **trait** (Hard Worker, Sleepy, Big Eater, Social, …) and a **dream job** where it works 50% faster.
- **Homes:** huts, cottages and townhouses. Homeless pets sleep outside and get unhappy.
- **Jobs:** Berry Farm 🍎, Lumber Grove 🪵, Market Stall 🪙, Bakery (turns food into coins), Treat Factory 🍬.
- **Decor:** gardens and fountains raise everyone's happiness. Happier pets work faster (0.5× to 1.5×).
- **Day/night:** pets walk to work in the morning and go home at night. You can see them commute in 3D.
- **Collecting:** free beds attract stray pets over time. Spend treats on eggs for rarer pets. Each species you discover adds +3% to all production (Petdex).
- **Growth:** pets level up while working, buildings upgrade to level 5, and the town can expand to more land.
- **Idle:** progress is saved automatically and simulated while you're away (up to 8 hours).

Controls: drag to pan, pinch or scroll to zoom, two-finger twist or right-drag to rotate, tap to inspect or build.

## Project layout

```
src/
  game/        pure game logic, no rendering (runs in Node for tests)
    data.js    species, traits, buildings, eggs, balance numbers  ← tweak here
    sim.js     rules: building, assigning, happiness, production, tick
    state.js   new game, save/load, offline progress
  render/      Three.js
    stage.js   renderer, camera controls, lights, day/night sky
    models.js  procedural low-poly buildings + pets, UI portraits
    world.js   keeps the 3D scene in sync with game state, pet movement, tap picking
  ui/ui.js     HTML overlay: HUD, panels, toasts, modals
  main.js      wires it all together + main loop
public/        PWA manifest, service worker, icons
tests/         game-logic tests
```

All 3D models are generated from code (no asset files), so the game loads quickly on phones.

## Shipping to each platform

- **Web (all platforms):** already automatic. `.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. You can also upload `dist/` to any other static host (Netlify, itch.io as an HTML5 game). Players can use *Install app* (desktop Chrome/Edge) or *Add to Home Screen* (iOS Safari / Android Chrome).
- **App stores (iOS / Android):** wrap `dist/` with [Capacitor](https://capacitorjs.com).
- **Desktop installers / Steam (Windows / Mac):** wrap `dist/` with [Tauri](https://tauri.app) or [Electron](https://www.electronjs.org).

The `base: './'` setting in `vite.config.js` keeps all paths relative so the same build works in every wrapper.
