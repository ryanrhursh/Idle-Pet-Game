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
- **Commands:** `npm run dev` · `npm test` (node:test, 46 tests) · `node scripts/balance-bot.mjs 10 100 400` (economy check) · `npm run build`
- **Players:** Windows, Mac, iOS, Android, all through the browser/PWA. Later this can be wrapped with Capacitor (app stores) or Tauri (desktop).

## Code map
| File | What's in it |
| --- | --- |
| `src/game/data.js` | All balance numbers: species (19), rarities, traits, buildings, eggs, `CONFIG` (incl. shiny chance/bonus, featured boost) |
| `src/game/sim.js` | Pure rules: build/upgrade/demolish, assign home/job, happiness, `production()`, `tick()`, `simulate()`, `eggCost()`, wonder bonuses, `hatch()` (shiny roll + featured species), `retirePet`/`recallPet` (the Meadow) |
| `src/game/quests.js` | The 51 hand-written goals (`QUESTS`) plus endless goals (`ENDLESS`: coins, wood, food, treats, hatched, shinies, requests, days; tier n target/reward by formula, ids like `coins:3`), `claimQuest`/`claimAll`/`payReward`. Progress is derived from state; only `state.quests.claimed` is saved |
| `src/game/requests.js` | Town Requests: 3 open at a time (give / build / hatch / land), generated from the town's income and stock with a saved seed. `state.requests = {seed, next, done, active}`. `ensureRequests` refills; `completeRequest`, `skipRequest` |
| `src/game/featured.js` | Weekly featured egg: species chosen from the UTC date (no server), `featuredChance()` for the UI |
| `src/game/util.js` | `fmt` (big numbers), `nice` (2-digit rounding), `mulberry32` (seedable RNG) |
| `src/game/state.js` | `createNewGame` (also `meadow: []`, retired pet records), save/load (localStorage key `pawville-save-v1`, `SAVE_VERSION`), offline progress |
| `src/render/stage.js` | Renderer, camera + OrbitControls (touch: 1-finger pan, 2-finger zoom/rotate), lights, day/night, view inset for panels |
| `src/render/models.js` | Procedural low-poly buildings (`BUILDERS`) and pets (`LOOKS` per species), `portrait()` renders UI thumbnails |
| `src/render/world.js` | Syncs state to the 3D scene, pet commuting (work by day, home at night), popups/smoke, tap picking |
| `src/ui/ui.js` | HTML overlay: HUD, tabs, sheets (build/building/pets/pet/hatch/dex/menu), toasts, modals |
| `src/audio.js` | Sound effects + generative music, all synthesized with Web Audio (no audio files). `unlock()` on first tap, `sfx(name)`, `setAudioSettings`, `setNight`. Never throws |
| `src/main.js` | Wiring: actions map, tap handling, main loop, autosave, welcome/offline modals |
| `tests/sim.test.js` | Game-logic tests |
| `scripts/balance-bot.mjs` | Greedy bot that plays the sim and prints snapshots, for tuning costs/income |

## Conventions
- **Design rule: no ending, no resets.** Pawville is one town that goes on forever with endless content. Never add prestige, "new town" resets or anything that wipes progress. Prefer systems that keep generating new goals and rewards (formulas, not longer lists).
- Game logic stays renderer-free (it runs in Node tests). The UI calls sim functions through `actions` in `main.js`.
- **Adding a building:** add an entry to `BUILDINGS` in `data.js` and a builder in `models.js` `BUILDERS`. **Adding a species:** add to `SPECIES` in `data.js` and `LOOKS` in `models.js`.
- **Adding a goal:** add a row to `LIST` in `quests.js` (reward keys: coins/food/wood/treats, or an egg id for a free egg). **Adding an endless goal kind:** add an `ENDLESS` entry (`after` = the hand-written goal that unlocks it); it needs a counter that can grow forever (the 100-pet, 19-species, 16-row and level-10 caps can't back one). **Adding a wonder:** `BUILDINGS` entry with `type: 'wonder'`, `unique`, `effect`, `perLevel`, plus a `BUILDERS` model, plus a case in `wonderBonus` users in `sim.js`.
- Changing the save shape: add a default in `loadGame` (as done for `requests`, `shinyFound`, new `stats`) or bump `SAVE_VERSION` (old saves reset) or add a migration in `loadGame`.
- Original game: original names and art only, no copying existing games.
- Before pushing: run `npm test` and `npm run build`. For visual changes, screenshot with the preinstalled Playwright (headless Chromium needs `--enable-unsafe-swiftshader --use-angle=swiftshader`).
- Git: work on the session's `claude/...` branch, starting from the latest `main`, then open a PR to `main`. Merging deploys the game.

## Status
- v0.2: goals + balance pass. 🎯 Goals tab (47 goals, 6 chapters, "next goal" pill under the HUD, badge on the tab, free-egg rewards). Old saves keep working (migration in `loadGame`, no `SAVE_VERSION` bump) and get credit for what they already did.
- Balance (the owner hit Day 547 with 88K coins and nothing to buy; the old economy was fully maxed by day ~80). Now: building max level 10 (upgrade cost x2.5 per level, `upgradeCostBase/Mul` in `CONFIG`), duplicates +25% each, land up to 16 rows (x1.9 per row), 3 wonders (Clock Tower +10% output/level, Pet Academy +50% XP/level, Grand Hatchery -8% egg price/level; unique, max Lv 5), Nest Egg (5000 coins + 3000 food), every egg hatched makes the next +6%, Treat Factory eats food and makes 0.015 treats/s, strays slow down as the town grows (`strayCrowding`), pet level cap 25, town limit 100 pets (`maxPets`, protects phone performance). A perfect bot needs ~1000 game days (~25h) to max out; `scripts/balance-bot.mjs` reproduces that.
- Sound (v0.3): synthesized SFX (tap, build, upgrade, demolish, coin, expand, hatch by rarity, good/great/bad toasts) + a soft pentatonic music loop that thins out at night. Menu has 🔊/🎵 toggles (`settings.sfx`/`music`, default on, old saves get the defaults). Verified in headless Chromium (silent before first tap, audible after, music off = silent). Not verified on the owner's iPhone: iOS mutes Web Audio when the silent switch is on. Also fixed the "Happy town" goal completing on day 1.
- iOS 26 home-screen app: the page still draws under the status bar (the `default` status-bar meta seems to be ignored), and iOS blurs about 48pt below it. `--hud-top` in `style.css` lowers the HUD by an extra 24px whenever there's a top safe area (the owner found 48 too low). iOS also reports the screen short by the status-bar height, so `#viewport` is `100% + safe-top` tall to cover the bottom strip. Headless Chromium can't reproduce iOS home-screen mode, so check these on the owner's phone. The new goal pill sits under the HUD via `--hud-h` (set from JS), also unverified on the phone.
- Known design choices you may want to revisit: production keeps running at night while pets sleep; a new game has no coin income until a Market is built (the first goal says so). Late game still plateaus once everything is maxed (see "Next up").

- v0.4: **Endless goals** (after each chapter's hand-written goal, a formula keeps making tiers: coins x4 per tier, wood x4, food x4, treats x3, requests x2.5, days x1.5; shown as ♾️ in Goals and the pill; hand-written goals come first, endless ones closest to done follow). **Town Requests** (Goals tab, 3 open, give/build/hatch/land, sized to 2-5 min of income or 30% of stock and never beyond ~20 min of income; rewards are measured in minutes of income so they stay in proportion; ↻ swaps one). Balance bot A/B: requests speed up the first ~30 days about 1.5x (the bot serves every request instantly), converge by day 100, and drain the late stockpile (day 300: 1.4M coins vs 22M without). **Shiny pets** (3%, Golden Egg 5%; tinted in 3D/portraits, ✨ in lists, +15% output, Petdex "shiny found" via `state.shinyFound`; goals shiny1/2/3). **Weekly featured egg** (Hatch tab, ×8 inside its rarity; legendary weeks only help Golden/Nest Eggs). Old saves migrate in `loadGame` (no version bump). Not checked on the owner's phone: how the Goals tab feels with the 1s refresh (taps now wait while a finger is down).
- v0.5: **Meadow.** A pet's page has "Send to the Meadow" (confirm dialog): the pet leaves town, freeing a slot under the 100-citizen limit, but keeps level/name/shininess in `state.meadow` and the Petdex keeps the species. Pets tab has a 🌼 Meadow filter listing them with "Bring back" (only while the town has room). Petdex cells show 🌼 counts. Because slots can now be freed, eggs hatched and shinies hatched became endless goal kinds (`hatched` x1.5 from 60, `shinies` x1.7 from 4; `stats.shinies` counts shiny hatches) and goal `shiny5` was added. Old saves get `meadow: []` and a shiny count in `loadGame`. Remaining limiters: egg price +6% per egg hatched, and 19 species / 16 rows / building level 10 (still no endless goals about those).

## Next up (ideas; the owner picks)
- Meadow polish: retire several pets at once (e.g. all jobless commons), show Meadow pets in 3D, Meadow-based goals
- Owner playtest of requests (are asks too big/small? rewards?), endless goal pacing, shiny odds and the featured-egg boost; tune `requests.js`/`ENDLESS`
- Seasonal events (no resets, see the design rule)
- Owner feedback on the sound (volume, which sounds are annoying, music style)
- Pet friendships / likes & dislikes; decorating home interiors
- Performance check on low-end phones (shadow quality setting?)

## Session log
- **2026-11-10/11:** Built v0.1 (PR #1, merged), set up GitHub Pages and fixed offline caching. Live deploy verified (HTTP 200). Added this file.
- **2026-11-11:** iPhone home-screen app: status bar blurred the HUD and left a blue gap at the bottom. Switched the status bar style to `default`, made the page background grass green, bumped the SW cache to v3 (PR #3). Bottom gap fixed; top blur remained, so the HUD now sits below it on notch phones (PR #4).
- **2026-11-12:** HUD extra offset 48→24px per the owner; extended the 3D view by the safe-top height to cover the bottom strip (which had shown plain green).
- **2026-11-18:** Added the Goals system and a balance pass (see Status). Built a balance bot (`scripts/balance-bot.mjs`) to measure the economy. Bumped the SW cache to v4. PR to `main`; the owner merges to deploy.
- **2026-11-19:** Added sound effects and music (`src/audio.js`), menu toggles, fixed the day-1 "Happy town" goal. SW cache v5. PR to `main`.
- **2026-11-19 (2):** Added endless goals, Town Requests, shiny pets and the weekly featured egg (see Status). New files `requests.js`, `featured.js`, `util.js`; 42 tests; bot reports requests. SW cache v6. PR to `main`.
- **2026-11-19 (3):** Added the Meadow (retire/bring back pets), endless `hatched`/`shinies` goals, goal `shiny5`; 46 tests. Built on top of the open v0.4 PR (same branch). 
