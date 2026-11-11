# Pawville: session handoff

Claude Code loads this file into every new session. **Keep it current:** at the end of each session, update "Status" and "Next up" and add a line to "Session log". Keep the file short, because every session loads it.

## Working with the owner
- The owner is new to coding. **Always end with a numbered "What you need to do" list**, giving exact clicks/commands and what success looks like.
- They want to save usage. Work happens in **separate sessions of one or two tasks each**, so stay focused on the task you were given. Read only the files you need; this file says where things are.
- Shell commands go in their own `bash` code blocks, one command per block.
- The owner plays locally on a Mac (`npm run dev`, from `~/Idle-Pet-Game`) and on the live site.

## Project
3D idle city-builder: the pets you collect are the citizens. Each pet needs a home, a job and food.
- **Live:** https://ryanrhursh.github.io/Idle-Pet-Game/. `.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`.
- **Stack:** Vite 7 + Three.js (no framework), plain JS ES modules, installable PWA (offline via `public/sw.js`). Node 20.19+.
- **Commands:** `npm run dev` · `npm test` (node:test, 12 tests) · `npm run build`
- **Players:** Windows, Mac, iOS, Android, all through the browser/PWA. Later this can be wrapped with Capacitor (app stores) or Tauri (desktop).

## Code map
| File | What's in it |
| --- | --- |
| `src/game/data.js` | All balance numbers: species (19), rarities, traits, buildings, eggs, `CONFIG` |
| `src/game/sim.js` | Pure rules: build/upgrade/demolish, assign home/job, happiness, `production()`, `tick()`, `simulate()` |
| `src/game/state.js` | `createNewGame`, save/load (localStorage key `pawville-save-v1`, `SAVE_VERSION`), offline progress |
| `src/render/stage.js` | Renderer, camera + OrbitControls (touch: 1-finger pan, 2-finger zoom/rotate), lights, day/night, view inset for panels |
| `src/render/models.js` | Procedural low-poly buildings (`BUILDERS`) and pets (`LOOKS` per species), `portrait()` renders UI thumbnails |
| `src/render/world.js` | Syncs state to the 3D scene, pet commuting (work by day, home at night), popups/smoke, tap picking |
| `src/ui/ui.js` | HTML overlay: HUD, tabs, sheets (build/building/pets/pet/hatch/dex/menu), toasts, modals |
| `src/main.js` | Wiring: actions map, tap handling, main loop, autosave, welcome/offline modals |
| `tests/sim.test.js` | Game-logic tests |

## Conventions
- Game logic stays renderer-free (it runs in Node tests). The UI calls sim functions through `actions` in `main.js`.
- **Adding a building:** add an entry to `BUILDINGS` in `data.js` and a builder in `models.js` `BUILDERS`. **Adding a species:** add to `SPECIES` in `data.js` and `LOOKS` in `models.js`.
- Changing the save shape: bump `SAVE_VERSION` (old saves reset) or add a migration in `loadGame`.
- Original game: original names and art only, no copying existing games.
- Before pushing: run `npm test` and `npm run build`. For visual changes, screenshot with the preinstalled Playwright (headless Chromium needs `--enable-unsafe-swiftshader --use-angle=swiftshader`).
- Git: work on the session's `claude/...` branch, starting from the latest `main`, then open a PR to `main`. Merging deploys the game.

## Status
- v0.1 is live: core loop, 3D town, day/night, strays, eggs, Petdex, autosave + 8h offline progress, PWA.
- Tested in headless Chromium (desktop + iPhone/Pixel emulation). The owner plays on an iPhone (iOS 26) as a home-screen web app.
- iOS 26 home-screen app: the page still draws under the status bar (the `default` status-bar meta seems to be ignored), and iOS blurs about 48pt below it. `--hud-top` in `style.css` lowers the HUD by an extra 48px whenever there's a top safe area. Green page background hides the bottom gap. Headless Chromium can't reproduce iOS home-screen mode, so check these on the owner's phone.
- Known design choices you may want to revisit: production keeps running at night while pets sleep; a new game has no coin income until a Market is built (the welcome tip says so).

## Next up (ideas; the owner picks)
- More playtest feedback from the owner's iPhone
- Sound effects + music
- Quests/goals to guide early game
- Pet friendships / likes & dislikes; decorating home interiors
- Performance check on low-end phones (shadow quality setting?)

## Session log
- **2026-11-10/11:** Built v0.1 (PR #1, merged), set up GitHub Pages and fixed offline caching. Live deploy verified (HTTP 200). Added this file.
- **2026-11-11:** iPhone home-screen app: status bar blurred the HUD and left a blue gap at the bottom. Switched the status bar style to `default`, made the page background grass green, bumped the SW cache to v3 (PR #3). Bottom gap fixed; top blur remained, so the HUD now sits below it on notch phones.
