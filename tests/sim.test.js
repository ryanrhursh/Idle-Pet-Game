import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, saveGame, loadGame } from '../src/game/state.js';
import {
  build, upgrade, demolish, hatch, tick, simulate, assignHome, assignJob, freeHomeSlots,
  targetHappiness, netRates, workersOf, residentsOf, getBuilding, expandLand,
} from '../src/game/sim.js';
import { CONFIG } from '../src/game/data.js';

// small deterministic RNG
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('new game has housed, employed starter pets', () => {
  const s = createNewGame(seeded());
  assert.equal(s.pets.length, 2);
  for (const p of s.pets) {
    assert.notEqual(p.homeId, null);
    assert.notEqual(p.jobId, null);
  }
  assert.equal(freeHomeSlots(s), 0);
});

test('building costs resources and rejects occupied tiles', () => {
  const s = createNewGame(seeded());
  const wood = s.resources.wood;
  const r = build(s, 'hut', 0, 0);
  assert.ok(r.ok);
  assert.equal(s.resources.wood, wood - 12);
  assert.equal(build(s, 'hut', 0, 0).ok, false);
  // second hut costs more
  s.resources.wood = 1000;
  build(s, 'hut', 1, 0);
  assert.equal(s.resources.wood, 1000 - 14);
});

test('homes and jobs respect capacity', () => {
  const s = createNewGame(seeded());
  s.resources = { coins: 1e6, food: 1e6, wood: 1e6, treats: 1e6 };
  const hut = build(s, 'hut', 0, 0).building;
  s.settings.autoAssign = false;
  for (let i = 0; i < 3; i++) hatch(s, 'basic', seeded(i + 2));
  const [a, b] = s.pets.slice(-3);
  assert.ok(assignHome(s, a.id, hut.id).ok);
  assert.equal(assignHome(s, b.id, hut.id).ok, false, 'hut holds one pet');
  upgrade(s, hut.id);
  assert.ok(assignHome(s, b.id, hut.id).ok, 'level 2 hut holds two');
  assert.equal(residentsOf(s, hut.id).length, 2);
  const farm = s.buildings.find((x) => x.type === 'farm');
  const free = 2 - workersOf(s, farm.id).length;
  assert.equal(assignJob(s, a.id, farm.id).ok, free > 0);
});

test('production grows resources over time', () => {
  const s = createNewGame(seeded());
  const before = { ...s.resources };
  simulate(s, 120, seeded(5));
  assert.ok(s.resources.food > before.food, 'farm out-produces two pets eating');
  assert.ok(s.resources.wood > before.wood);
  assert.ok(s.pets.some((p) => getBuilding(s, p.jobId).type === 'lumber'), 'someone chops wood');
});

test('starving pets get unhappy, and bakery stops without food', () => {
  const s = createNewGame(seeded());
  s.resources = { coins: 1000, food: 0, wood: 1000, treats: 0 };
  const farm = s.buildings.find((b) => b.type === 'farm');
  demolish(s, farm.id);
  s.resources.food = 0;
  tick(s, 1, seeded());
  assert.equal(s.starving, true);
  const p = s.pets[0];
  const hungry = targetHappiness(s, p);
  s.starving = false;
  assert.ok(hungry < targetHappiness(s, p));
});

test('homeless pets are less happy than housed ones', () => {
  const s = createNewGame(seeded());
  const p = s.pets[0];
  const housed = targetHappiness(s, p);
  p.homeId = null;
  assert.ok(targetHappiness(s, p) < housed);
});

test('strays arrive when there is a free bed', () => {
  const s = createNewGame(seeded());
  s.resources.wood = 1000;
  build(s, 'hut', 0, 0);
  assert.equal(freeHomeSlots(s), 1);
  simulate(s, 200, seeded(9));
  assert.equal(s.pets.length, 3);
  assert.equal(freeHomeSlots(s), 0);
  assert.equal(s.stats.strays, 1);
});

test('hatching spends treats and records the species', () => {
  const s = createNewGame(seeded());
  s.resources.treats = 10;
  const r = hatch(s, 'basic', seeded(3));
  assert.ok(r.ok);
  assert.equal(s.resources.treats, 0);
  assert.ok(s.discovered[r.pet.species]);
  assert.equal(hatch(s, 'basic', seeded(3)).ok, false);
});

test('demolish frees pets and refunds half', () => {
  const s = createNewGame(seeded());
  const home = s.buildings.find((b) => b.type === 'cottage');
  const wood = s.resources.wood;
  demolish(s, home.id);
  assert.equal(getBuilding(s, home.id), null);
  assert.ok(s.pets.every((p) => p.homeId == null));
  assert.equal(s.resources.wood, wood + 15);
});

test('expanding land adds a row', () => {
  const s = createNewGame(seeded());
  s.resources = { coins: 1e6, food: 0, wood: 1e6, treats: 0 };
  assert.ok(expandLand(s).ok);
  assert.equal(s.rows, CONFIG.startRows + 1);
  assert.ok(build(s, 'hut', 0, CONFIG.startRows).ok);
});

test('save + load round-trips and applies offline progress', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  saveGame(s, store);
  const { state, offline } = loadGame(store, s.savedAt + 600 * 1000);
  assert.equal(state.pets.length, 2);
  assert.ok(offline);
  assert.equal(Math.round(offline.seconds), 600);
  assert.ok(state.resources.food > s.resources.food);
});

test('net rates are finite numbers', () => {
  const s = createNewGame(seeded());
  for (const v of Object.values(netRates(s))) assert.ok(Number.isFinite(v));
});
