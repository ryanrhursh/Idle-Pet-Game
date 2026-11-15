import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, saveGame, loadGame } from '../src/game/state.js';
import {
  build, upgrade, demolish, hatch, tick, simulate, assignHome, assignJob, freeHomeSlots,
  targetHappiness, netRates, workersOf, residentsOf, getBuilding, expandLand, buildCost, upgradeCost,
  eggCost, feedPet, feedAll, feedCost, createPet,
} from '../src/game/sim.js';
import {
  activeQuests, advice, claimAll, claimQuest, claimableQuests, newlyFinished, questProgress, questTotals,
} from '../src/game/quests.js';
import { BUILDINGS, CONFIG, QUESTS, RESOURCES } from '../src/game/data.js';

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

// ---------- goals, feeding and the balance pass ----------

test('goals: progress, claim once, reward paid', () => {
  const s = createNewGame(seeded());
  assert.equal(activeQuests(s).length, 3);
  assert.equal(activeQuests(s)[0].id, 'market');
  assert.equal(claimQuest(s, 'market').ok, false, 'not finished yet');
  s.resources.wood = 100;
  build(s, 'market', 0, 0);
  const q = QUESTS.find((x) => x.id === 'market');
  assert.ok(questProgress(s, q).done);
  const coins = s.resources.coins;
  assert.ok(claimQuest(s, 'market').ok);
  assert.equal(s.resources.coins, coins + q.reward.coins);
  assert.equal(claimQuest(s, 'market').ok, false, 'cannot claim twice');
  assert.notEqual(activeQuests(s)[0].id, 'market', 'next goal unlocks');
});

test('goals: newlyFinished notifies once; claimAll sweeps a veteran save', () => {
  const s = createNewGame(seeded());
  s.resources = { coins: 1e6, food: 0, wood: 1e6, treats: 0 };
  build(s, 'market', 0, 0);
  assert.equal(newlyFinished(s).length, 1);
  assert.equal(newlyFinished(s).length, 0);
  // a big town finishes many goals at once
  s.settings.autoAssign = false;
  let x = 1;
  for (const t of ['hut', 'bakery', 'candy', 'garden']) build(s, t, x++, 1);
  for (let i = 0; i < 6; i++) createPet(s, 'mouse', seeded(i + 1));
  const before = questTotals(s).claimed;
  const done = claimAll(s);
  assert.ok(done.length >= 4, `claimed ${done.length}`);
  assert.equal(questTotals(s).claimed, before + done.length);
  assert.equal(claimableQuests(s).length, 0);
});

test('goals: every quest definition is valid', () => {
  const ids = new Set();
  const types = ['building', 'kind', 'buildings', 'pets', 'employed', 'species', 'rarity', 'hatched', 'level', 'petLevel', 'rows', 'happy', 'coins'];
  for (const q of QUESTS) {
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    assert.ok(types.includes(q.check.type), `${q.id}: unknown check type`);
    assert.ok(q.check.n > 0);
    if (q.check.building) assert.ok(BUILDINGS[q.check.building], `${q.id}: unknown building`);
    assert.ok(Object.keys(q.reward).length && Object.keys(q.reward).every((r) => RESOURCES[r]), `${q.id}: bad reward`);
    if (q.check.type === 'rows') assert.ok(q.check.n <= CONFIG.maxRows);
    if (q.check.type === 'level') assert.ok(q.check.level <= CONFIG.maxBuildingLevel);
    if (q.check.type === 'petLevel') assert.ok(q.check.n <= CONFIG.maxPetLevel);
  }
});

test('old saves without goals still load, with an empty goal list', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  delete s.quests;
  saveGame(s, store);
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.deepEqual(state.quests.claimed, {});
  assert.equal(activeQuests(state)[0].id, 'market');
});

test('advisor spots the situations that strand players', () => {
  const s = createNewGame(seeded());
  assert.ok(advice(s).some((t) => /No free beds/.test(t.text)), 'full starter town has no beds');
  assert.ok(advice(s).some((t) => /Treat Factory/.test(t.text)));
  s.starving = true;
  assert.ok(advice(s)[0].text.includes('hungry'));
  // pets with no coin income at all get told to staff a coin building
  const t = createNewGame(seeded());
  for (const p of t.pets) assignJob(t, p.id, null);
  assert.ok(advice(t).some((x) => /coin income/.test(x.text)));
});

test('the economy cannot stall completely: baseline income always flows', () => {
  const s = createNewGame(seeded());
  for (const p of s.pets) assignJob(s, p.id, null);
  s.resources = { coins: 0, food: 100, wood: 0, treats: 0 };
  simulate(s, 600, seeded(2));
  assert.ok(s.resources.coins > 100, 'trickle of coins');
  assert.ok(s.resources.wood > 50, 'trickle of wood');
});

test('everything costs more as the town grows', () => {
  const s = createNewGame(seeded());
  const hut = buildCost(s, 'hut').wood;
  const egg = eggCost(s, 'basic');
  const b = s.buildings[0];
  const up = upgradeCost(s, b);
  assert.ok(egg.coins > 0 && egg.treats > 0, 'eggs cost treats and coins');
  assert.ok(up.wood > 0 && up.coins > 0, 'upgrades always cost both wood and coins');
  for (let i = 0; i < 10; i++) createPet(s, 'mouse', seeded(i + 1));
  assert.ok(buildCost(s, 'hut').wood > hut);
  assert.ok(eggCost(s, 'basic').treats > egg.treats);
  assert.ok(upgradeCost(s, b).coins > up.coins);
});

test('feeding turns food into levels and stops at max level', () => {
  const s = createNewGame(seeded());
  const p = s.pets[0];
  s.resources.food = 0;
  assert.equal(feedPet(s, p.id).ok, false, 'no food');
  const cost = feedCost(p);
  s.resources.food = cost + 5;
  assert.ok(feedPet(s, p.id).ok);
  assert.equal(p.level, 2);
  assert.equal(s.resources.food, 5);
  s.resources.food = 1e9;
  const r = feedAll(s);
  assert.ok(r.ok && r.fed === 2);
  p.level = CONFIG.maxPetLevel;
  assert.equal(feedCost(p), null);
  assert.equal(feedPet(s, p.id).ok, false);
});

test('town can grow to the new maximum size and buildings reach the new max level', () => {
  const s = createNewGame(seeded());
  s.resources = { coins: 1e12, food: 0, wood: 1e12, treats: 0 };
  while (s.rows < CONFIG.maxRows) assert.ok(expandLand(s).ok);
  assert.equal(expandLand(s).ok, false);
  const b = s.buildings[0];
  while (b.level < CONFIG.maxBuildingLevel) assert.ok(upgrade(s, b.id).ok);
  assert.equal(upgrade(s, b.id).ok, false);
});
