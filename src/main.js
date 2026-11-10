import './style.css';
import { BUILDINGS, CONFIG, SPECIES } from './game/data.js';
import { loadGame, saveGame, resetGame } from './game/state.js';
import {
  assignHome, assignJob, autoAssignAll, build, buildingAt, demolish, expandLand, getBuilding,
  getPet, hatch, simulate, tick, upgrade,
} from './game/sim.js';
import { Stage } from './render/stage.js';
import { World } from './render/world.js';
import { buildBuilding, buildPet, portrait } from './render/models.js';
import { UI } from './ui/ui.js';

let { state, offline } = loadGame();

const stage = new Stage(document.getElementById('viewport'));
const world = new World(stage);
world.sync(state);

const petImg = (species) => portrait(stage.renderer, `pet:${species}`, () => buildPet(species));
const buildingImg = (type) => portrait(stage.renderer, `b:${type}`, () => buildBuilding(type, 1, { pips: false }));

let placing = null; // building type waiting for a tile tap
let selectedTile = null;

function changed() {
  world.sync(state);
  ui.refresh(true);
  ui.renderHud();
}

function result(r) {
  if (r && !r.ok && r.msg) ui.toast(r.msg, 'bad');
  changed();
  return r;
}

function clearSelection() {
  selectedTile = null;
  world.selectTile(null);
  world.selectedPetId = null;
}

function stopPlacing() {
  placing = null;
  ui.hideBanner();
  world.selectTile(null);
}

function layoutChanged() {
  const sheet = document.getElementById('sheet');
  if (sheet.hidden) return stage.setInset(0, 0);
  if (innerWidth >= 900) stage.setInset(sheet.offsetWidth + 12, 0);
  else stage.setInset(0, sheet.offsetHeight - 70);
}

const actions = {
  tab: ({ tab }) => ui.open(tab),
  layoutChanged,
  closeModal: () => ui.closeModal(),
  sheetClosed: () => { clearSelection(); layoutChanged(); },

  pickBuilding: ({ type }) => {
    if (selectedTile && !buildingAt(state, selectedTile.x, selectedTile.y)) {
      const r = result(build(state, type, selectedTile.x, selectedTile.y));
      if (r.ok) { ui.open('building', { id: r.building.id }); }
      return;
    }
    placing = type;
    ui.close();
    ui.showBanner(`<span>Tap an empty tile to place <b>${BUILDINGS[type].emoji} ${BUILDINGS[type].name}</b></span><button class="btn small" data-act="cancelPlace">Cancel</button>`);
  },
  cancelPlace: () => stopPlacing(),
  expand: () => {
    const r = result(expandLand(state));
    if (r.ok) world.focusTile(3.5, state.rows - 1);
  },
  upgrade: ({ id }) => result(upgrade(state, +id)),
  demolish: ({ id }) => {
    const b = getBuilding(state, +id);
    ui.confirm(`<h2>Demolish ${BUILDINGS[b.type].name}?</h2><p>Residents and workers will be moved out. You get half the base cost back.</p>`, 'confirmDemolish', { id });
  },
  confirmDemolish: ({ id }) => {
    ui.closeModal();
    result(demolish(state, +id));
    ui.close();
  },
  evict: ({ id }) => result(assignHome(state, +id, null)),
  fire: ({ id }) => result(assignJob(state, +id, null)),
  moveIn: ({ building, value }) => value && result(assignHome(state, +value, +building)),
  hire: ({ building, value }) => value && result(assignJob(state, +value, +building)),
  setHome: ({ id, value }) => result(assignHome(state, +id, value ? +value : null)),
  setJob: ({ id, value }) => result(assignJob(state, +id, value ? +value : null)),
  autoAssign: () => {
    autoAssignAll(state);
    ui.toast('Everyone who could be placed has a home and a job.', 'good');
    changed();
  },
  petFilter: ({ f }) => { ui.petFilter = f; ui.refresh(true); },
  openPet: ({ id }) => {
    world.selectedPetId = +id;
    ui.open('pet', { id: +id });
  },
  openPetModal: ({ id }) => { ui.closeModal(); actions.openPet({ id }); actions.findPet({ id }); },
  findPet: ({ id }) => {
    world.selectedPetId = +id;
    world.focusPet(+id);
  },
  rename: ({ id }) => {
    const p = getPet(state, +id);
    const name = prompt('New name:', p.name);
    if (name && name.trim()) {
      p.name = name.trim().slice(0, 20);
      changed();
    }
  },
  hatch: ({ egg }) => {
    const r = hatch(state, egg);
    if (!r.ok) return result(r);
    state.events = []; // the reveal modal replaces the toast
    changed();
    ui.showHatch(r.pet, r.isNew);
  },
  toggleAuto: (_, el) => { state.settings.autoAssign = el.checked; },
  saveNow: () => { saveGame(state); ui.toast('Saved!', 'good'); },
  reset: () => ui.confirm('<h2>Start over?</h2><p>This erases your town and all your pets.</p>', 'confirmReset'),
  confirmReset: () => {
    state = resetGame();
    ui.closeModal();
    ui.close();
    changed();
    saveGame(state);
  },
};

const ui = new UI({ getState: () => state, actions, petImg, buildingImg });
new ResizeObserver(layoutChanged).observe(document.getElementById('sheet'));

// ---------- tapping the 3D town ----------

const canvas = stage.renderer.domElement;
let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, multi: !e.isPrimary };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary || down.multi) { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 500;
  down = null;
  if (moved > 10 || !quick) return; // it was a drag, not a tap
  const rect = canvas.getBoundingClientRect();
  const ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
  onTap(world.pick(ndc));
});

function onTap(hit) {
  if (!hit) return;
  if (placing) {
    const tile = hit.tile;
    if (!tile || buildingAt(state, tile.x, tile.y)) { ui.toast('Pick an empty tile.', 'bad'); return; }
    const type = placing;
    const r = result(build(state, type, tile.x, tile.y));
    if (r.ok) {
      stopPlacing();
      ui.open('building', { id: r.building.id });
    }
    return;
  }
  if (hit.petId != null) {
    actions.openPet({ id: hit.petId });
    return;
  }
  let b = hit.buildingId != null ? getBuilding(state, hit.buildingId) : buildingAt(state, hit.tile.x, hit.tile.y);
  world.selectedPetId = null;
  if (b) {
    selectedTile = { x: b.x, y: b.y };
    world.selectTile({ ...selectedTile, color: '#ffd23f' });
    ui.open('building', { id: b.id });
  } else {
    selectedTile = hit.tile;
    world.selectTile({ ...selectedTile, color: '#ffffff' });
    ui.open('build', { tile: hit.tile });
  }
}

// keyboard niceties on desktop
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!ui.modal.hidden) ui.closeModal();
    else if (placing) stopPlacing();
    else ui.close();
  }
});

// ---------- main loop ----------

let last = performance.now();
let lastWall = Date.now();
let hudTimer = 0, sheetTimer = 0, saveTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  const wall = Date.now();
  const wallDt = (wall - lastWall) / 1000;
  lastWall = wall;
  if (wallDt > 5) {
    // the tab was in the background: catch up quickly, like offline progress
    simulate(state, wallDt, Math.random, wallDt > 3600 ? 5 : 1);
    state.events = [];
    dt = 0;
    changed();
  }
  dt = Math.min(dt, 0.25);

  tick(state, dt);
  if (state.events.length) {
    for (const ev of state.events) ui.toast(ev.msg, ev.kind);
    state.events = [];
    world.sync(state);
    ui.refresh();
  }

  hudTimer += dt; sheetTimer += dt; saveTimer += dt;
  if (hudTimer > 0.25) { hudTimer = 0; ui.renderHud(); }
  if (sheetTimer > 1) { sheetTimer = 0; ui.refresh(); }
  if (saveTimer > 10) { saveTimer = 0; saveGame(state); }

  stage.setDayPhase((state.time % CONFIG.dayLength) / CONFIG.dayLength);
  world.update(state, dt, now / 1000);
  stage.update();
}

addEventListener('visibilitychange', () => { if (document.hidden) saveGame(state); });
addEventListener('pagehide', () => saveGame(state));

ui.renderHud();
if (offline) ui.showOffline(offline);
else if (!state.stats.coinsEarned) {
  ui.showModal(`<h2>Welcome to Pawville!</h2>
    <p>Your pets are the citizens of this little town. Give them homes, jobs and food, and more will come.</p>
    <p>${SPECIES.bunny.emoji} and ${SPECIES.beaver.emoji} are already settling in.</p>
    <p class="hint">Tip: build a 🏪 Market Stall to start earning coins. Tap an empty tile to build, tap a pet to meet them.</p>
    <button class="btn primary wide" data-act="closeModal">Let's go!</button>`);
}
requestAnimationFrame(frame);

// offline support / installable app
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
