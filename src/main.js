import './style.css';
import { BUILDINGS, CONFIG, SPECIES } from './game/data.js';
import { loadGame, saveGame, resetGame } from './game/state.js';
import {
  assignHome, assignJob, autoAssignAll, build, buildingAt, demolish, expandLand, getBuilding,
  getPet, hatch, recallPet, retirePet, simulate, tick, upgrade,
} from './game/sim.js';
import { setActive, setAudioSettings, setNight, sfx, unlock } from './audio.js';
import { Stage, daylight } from './render/stage.js';
import { World } from './render/world.js';
import { buildBuilding, buildPet, portrait } from './render/models.js';
import { claimAll, claimQuest, claimable } from './game/quests.js';
import { completeRequest, ensureRequests, readyRequests, requestText, skipRequest } from './game/requests.js';
import { UI } from './ui/ui.js';

let { state, offline } = loadGame();

const stage = new Stage(document.getElementById('viewport'));
const world = new World(stage);
world.sync(state);

const petImg = (species, shiny = false) => portrait(stage.renderer, `pet:${species}${shiny ? ':shiny' : ''}`, () => buildPet(species, shiny));
const buildingImg = (type) => portrait(stage.renderer, `b:${type}`, () => buildBuilding(type, 1, { pips: false }));

let placing = null; // building type waiting for a tile tap
let selectedTile = null;

function changed() {
  world.sync(state);
  ui.refresh(true);
  ui.renderHud();
}

function result(r) {
  if (r && !r.ok && r.msg) { ui.toast(r.msg, 'bad'); sfx('bad'); }
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
      if (r.ok) { sfx('build'); ui.open('building', { id: r.building.id }); }
      return;
    }
    placing = type;
    ui.close();
    ui.showBanner(`<span>Tap an empty tile to place <b>${BUILDINGS[type].emoji} ${BUILDINGS[type].name}</b></span><button class="btn small" data-act="cancelPlace">Cancel</button>`);
  },
  cancelPlace: () => stopPlacing(),
  expand: () => {
    const r = result(expandLand(state));
    if (r.ok) { sfx('expand'); world.focusTile(3.5, state.rows - 1); }
  },
  upgrade: ({ id }) => {
    const r = result(upgrade(state, +id));
    if (r.ok) sfx('upgrade');
  },
  demolish: ({ id }) => {
    const b = getBuilding(state, +id);
    ui.confirm(`<h2>Demolish ${BUILDINGS[b.type].name}?</h2><p>Residents and workers will be moved out. You get half the base cost back.</p>`, 'confirmDemolish', { id });
  },
  confirmDemolish: ({ id }) => {
    ui.closeModal();
    result(demolish(state, +id));
    sfx('demolish');
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
  openTree: ({ id }) => {
    ui.open('tree', { id: +id });
    if (getPet(state, +id)) world.selectedPetId = +id;
  },
  retire: ({ id }) => {
    const p = getPet(state, +id);
    if (!p) return;
    ui.confirm(`<h2>Send ${p.name} to the Meadow?</h2><p>${p.name} leaves town and frees a spot. They keep their level${p.shiny ? ' and shine' : ''}, the Petdex remembers them, and you can bring them back later while there's room.</p>`, 'confirmRetire', { id });
  },
  confirmRetire: ({ id }) => {
    ui.closeModal();
    const r = result(retirePet(state, +id));
    if (!r.ok) return;
    sfx('chime');
    world.selectedPetId = null;
    ui.petFilter = 'all';
    ui.open('pets');
  },
  recall: ({ id }) => {
    const r = result(recallPet(state, +id));
    if (r.ok) sfx('good');
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
    sfx('hatch', r.shiny ? 'legendary' : SPECIES[r.pet.species].rarity);
    ui.showHatch(r.pet, r.isNew, r.isNewShiny);
  },
  claimQuest: ({ id }) => {
    const r = claimQuest(state, id);
    if (!r.ok) return result(r);
    showRewards(r.hatched);
  },
  claimAll: () => {
    const r = claimAll(state);
    if (r.quests.length) showRewards(r.hatched);
  },
  claimRequest: ({ id }) => {
    const r = completeRequest(state, +id);
    if (!r.ok) return result(r);
    showRewards(r.hatched);
  },
  skipRequest: ({ id }) => {
    const r = skipRequest(state, +id);
    if (r.ok) ui.toast('Request swapped for a new one.', 'info');
    result(r);
  },
  toggleAuto: (_, el) => { state.settings.autoAssign = el.checked; },
  toggleSfx: (_, el) => { state.settings.sfx = el.checked; setAudioSettings(state.settings); sfx('chime'); },
  toggleMusic: (_, el) => { state.settings.music = el.checked; setAudioSettings(state.settings); },
  saveNow: () => { saveGame(state); ui.toast('Saved!', 'good'); },
  reset: () => ui.confirm('<h2>Start over?</h2><p>This erases your town and all your pets.</p>', 'confirmReset'),
  confirmReset: () => {
    state = resetGame();
    announced.clear();
    announcedRequests.clear();
    setAudioSettings(state.settings);
    ui.closeModal();
    ui.close();
    changed();
    saveGame(state);
  },
};

// After claiming goal rewards: if free eggs hatched, show the newest pet; otherwise the toast is enough.
function showRewards(hatched) {
  if (hatched.length) {
    const goalToasts = state.events.filter((e) => e.msg.startsWith('🎁'));
    state.events = goalToasts;
    changed();
    const last = hatched[hatched.length - 1];
    sfx('hatch', last.shiny ? 'legendary' : SPECIES[last.pet.species].rarity);
    ui.showHatch(last.pet, last.isNew, last.isNewShiny);
    if (hatched.length > 1) ui.toast(`${hatched.length} eggs hatched! See them in Pets.`, 'great');
  } else {
    sfx('coin');
    changed();
  }
}

const ui = new UI({ getState: () => state, actions, petImg, buildingImg });
// Audio can only start after a tap (browser rule). Every tap on a button also makes a soft click.
setAudioSettings(state.settings);
for (const type of ['pointerdown', 'keydown']) addEventListener(type, unlock, { passive: true });
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-act], select');
  if (el && !el.disabled) sfx('tap');
});
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
      sfx('build');
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
const announced = new Set(claimable(state).map((q) => q.id)); // goals we've already told the player about
const announcedRequests = new Set(readyRequests(state).map((r) => r.id)); // same for finished Town Requests

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
    const kinds = state.events.map((e) => e.kind);
    sfx(kinds.includes('bad') ? 'bad' : kinds.includes('great') ? 'chime' : 'good');
    state.events = [];
    world.sync(state);
    ui.refresh();
  }

  hudTimer += dt; sheetTimer += dt; saveTimer += dt;
  if (hudTimer > 0.25) { hudTimer = 0; ui.renderHud(); }
  if (sheetTimer > 1) {
    sheetTimer = 0;
    for (const q of claimable(state)) {
      if (announced.has(q.id)) continue;
      announced.add(q.id);
      ui.toast(`🎯 Goal complete: ${q.title}! Claim it in Goals.`, 'great');
      sfx('chime');
    }
    for (const r of readyRequests(state)) {
      if (announcedRequests.has(r.id)) continue;
      announcedRequests.add(r.id);
      ui.toast(`📮 ${requestText(state, r)}: done! Claim it in Goals.`, 'great');
      sfx('chime');
    }
    if (state.requests.active.length < 3) ensureRequests(state); // refill if nothing could be asked earlier
    setNight(daylight((state.time % CONFIG.dayLength) / CONFIG.dayLength) < 0.5);
    ui.refresh();
  }
  if (saveTimer > 10) { saveTimer = 0; saveGame(state); }

  stage.setDayPhase((state.time % CONFIG.dayLength) / CONFIG.dayLength);
  world.update(state, dt, now / 1000);
  stage.update();
}

addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame(state);
  setActive(!document.hidden);
});
addEventListener('pagehide', () => saveGame(state));

ui.renderHud();
if (offline) ui.showOffline(offline);
else if (!state.stats.coinsEarned) {
  ui.showModal(`<h2>Welcome to Pawville!</h2>
    <p>Your pets are the citizens of this little town. Give them homes, jobs and food, and more will come.</p>
    <p>${SPECIES.bunny.emoji} and ${SPECIES.beaver.emoji} are already settling in.</p>
    <p class="hint">Tip: build a 🏪 Market Stall to start earning coins. Tap an empty tile to build, tap a pet to meet them. The 🎯 Goals tab tells you what to do next.</p>
    <button class="btn primary wide" data-act="closeModal">Let's go!</button>`);
}
requestAnimationFrame(frame);

// offline support / installable app
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
