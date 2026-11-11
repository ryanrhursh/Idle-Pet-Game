// New-game setup plus save/load. Saves go to localStorage, which works the
// same in desktop and mobile browsers and in installed PWAs.

import { CONFIG } from './data.js';
import { createPet, autoAssignAll, simulate } from './sim.js';

const SAVE_KEY = 'pawville-save-v1';
export const SAVE_VERSION = 1;

export function createNewGame(rng = Math.random) {
  const state = {
    version: SAVE_VERSION,
    time: CONFIG.dayLength * 0.15, // start in the morning
    resources: { coins: 40, food: 25, wood: 40, treats: 10 },
    rows: CONFIG.startRows,
    buildings: [],
    pets: [],
    nextId: 1,
    discovered: {},
    strayTimer: 30,
    starving: false,
    settings: { autoAssign: true },
    stats: { hatched: 0, strays: 0, coinsEarned: 0 },
    log: [],
    events: [],
    savedAt: Date.now(),
  };
  // starter town: one home, one farm, one lumber grove, two pets
  state.buildings.push({ id: state.nextId++, type: 'cottage', x: 3, y: 2, level: 1 });
  state.buildings.push({ id: state.nextId++, type: 'farm', x: 2, y: 3, level: 1 });
  state.buildings.push({ id: state.nextId++, type: 'lumber', x: 4, y: 3, level: 1 });
  createPet(state, 'bunny', rng);
  createPet(state, 'beaver', rng);
  autoAssignAll(state);
  return state;
}

export function saveGame(state, storage = globalThis.localStorage) {
  state.savedAt = Date.now();
  const { events, ...persist } = state;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(persist));
    return true;
  } catch {
    return false; // private mode / storage full: keep playing without saving
  }
}

// Returns { state, offline } where offline is a summary of progress made
// while the game was closed (or null for a brand new game).
export function loadGame(storage = globalThis.localStorage, now = Date.now()) {
  let raw = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
  if (!raw) return { state: createNewGame(), offline: null };
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { state: createNewGame(), offline: null };
  }
  if (state.version !== SAVE_VERSION) return { state: createNewGame(), offline: null };
  state.events = [];
  state.settings = { autoAssign: true, ...state.settings };
  const away = Math.max(0, (now - (state.savedAt || now)) / 1000);
  let offline = null;
  if (away > 30) {
    // Step size grows with time away so very long absences stay quick to compute.
    const step = away > 3600 ? 5 : 1;
    const seconds = Math.min(away, CONFIG.maxOfflineSeconds);
    const delta = simulate(state, seconds, Math.random, step);
    state.events = []; // don't toast every offline event
    offline = { seconds, capped: away > CONFIG.maxOfflineSeconds, delta };
  }
  return { state, offline };
}

export function resetGame(storage = globalThis.localStorage) {
  try { storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  return createNewGame();
}
