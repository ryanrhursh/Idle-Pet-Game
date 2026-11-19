import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, saveGame, loadGame } from '../src/game/state.js';
import {
  build, upgrade, demolish, hatch, tick, simulate, assignHome, assignJob, freeHomeSlots,
  targetHappiness, netRates, workersOf, residentsOf, getBuilding, expandLand, upgradeCost, eggCost, production,
} from '../src/game/sim.js';
import { CONFIG, BUILDINGS } from '../src/game/data.js';
import { QUESTS, claimable, claimQuest, claimAll, questProgress, upcoming } from '../src/game/quests.js';

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
  assert.equal(s.resources.wood, 1000 - 15);
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

// ---------- balance pass: wonders, egg prices, upgrades ----------

const rich = (s) => { s.resources = { coins: 1e9, food: 1e9, wood: 1e9, treats: 1e9 }; return s; };

test('upgrade costs climb steeply and buildings go up to level 10', () => {
  const s = rich(createNewGame(seeded()));
  const farm = s.buildings.find((b) => b.type === 'farm');
  const costs = [];
  while (farm.level < CONFIG.maxBuildingLevel) { costs.push(upgradeCost(farm).wood); assert.ok(upgrade(s, farm.id).ok); }
  assert.equal(farm.level, 10);
  assert.equal(upgrade(s, farm.id).ok, false, 'max level');
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1] * 2, 'each level costs over 2x the last');
});

test('wonders are one-of-a-kind and boost the whole town', () => {
  const s = rich(createNewGame(seeded()));
  const before = production(s).prod.food;
  const tower = build(s, 'clocktower', 0, 0).building;
  assert.equal(build(s, 'clocktower', 1, 0).ok, false, 'only one Clock Tower');
  const lv1 = production(s).prod.food;
  assert.ok(Math.abs(lv1 / before - 1.1) < 1e-9, 'level 1 = +10% output');
  upgrade(s, tower.id);
  assert.ok(Math.abs(production(s).prod.food / before - 1.2) < 1e-9, 'level 2 = +20%');
  while (tower.level < BUILDINGS.clocktower.maxLevel) upgrade(s, tower.id);
  assert.equal(upgrade(s, tower.id).ok, false, 'wonders stop at their own max level');
});

test('Pet Academy speeds up pet XP', () => {
  const a = rich(createNewGame(seeded())), b = rich(createNewGame(seeded()));
  build(b, 'academy', 0, 0);
  tick(a, 10, seeded()); tick(b, 10, seeded());
  const gain = (s) => s.pets.reduce((t, p) => t + p.xp, 0);
  assert.ok(gain(b) > gain(a) * 1.4);
});

test('every egg makes the next one pricier; Grand Hatchery gives a discount', () => {
  const s = rich(createNewGame(seeded()));
  const c0 = eggCost(s, 'basic').treats;
  assert.equal(c0, 10);
  hatch(s, 'basic', seeded(2));
  hatch(s, 'golden', seeded(3));
  const c2 = eggCost(s, 'basic').treats;
  assert.equal(c2, Math.ceil(10 * 1.06 ** 2));
  build(s, 'grandhatchery', 0, 0);
  assert.ok(eggCost(s, 'basic').treats < c2);
  // coin-only egg: pays coins + food, no treats
  s.resources = { coins: 1e6, food: 1e6, wood: 0, treats: 0 };
  assert.ok(hatch(s, 'nest', seeded(4)).ok);
  assert.ok(s.resources.coins < 1e6 && s.resources.food < 1e6);
});

test('the town has a population limit', () => {
  const s = rich(createNewGame(seeded()));
  s.settings.autoAssign = false;
  while (s.pets.length < CONFIG.maxPets) assert.ok(hatch(s, 'basic', seeded(s.pets.length + 5), true).ok);
  assert.equal(hatch(s, 'basic', seeded(1)).ok, false);
  assert.equal(s.stats.hatched, 0, 'free hatches are not counted as bought eggs');
  const before = s.pets.length;
  s.strayTimer = 0;
  tick(s, 1, seeded());
  assert.equal(s.pets.length, before, 'no strays when full');
});

test('Treat Factory needs food to make treats', () => {
  const s = rich(createNewGame(seeded()));
  s.resources = { coins: 1e6, food: 0, wood: 1e6, treats: 0 };
  s.pets.forEach((p) => { p.jobId = null; });
  const f = build(s, 'candy', 0, 0).building;
  s.pets.forEach((p) => assignJob(s, p.id, f.id));
  const farm = s.buildings.find((b) => b.type === 'farm');
  demolish(s, farm.id); // no food income
  s.resources.food = 0;
  tick(s, 5, seeded());
  assert.equal(s.resources.treats, 0);
  s.resources.food = 100;
  tick(s, 5, seeded());
  assert.ok(s.resources.treats > 0);
});

test('crowded towns attract strays more slowly', () => {
  const small = createNewGame(seeded()), big = createNewGame(seeded());
  big.settings.autoAssign = false;
  rich(big);
  for (let i = 0; i < 30; i++) hatch(big, 'basic', seeded(i + 9), true);
  small.strayTimer = big.strayTimer = 0;
  build(small, 'hut', 0, 0); rich(big); build(big, 'townhouse', 0, 0); upgrade(big, big.buildings.at(-1).id);
  small.resources.wood = 1000;
  build(small, 'hut', 1, 0);
  tick(small, 1, () => 0.5); tick(big, 1, () => 0.5);
  assert.ok(big.strayTimer > small.strayTimer * 2);
});

// ---------- goals ----------

test('goals start unfinished, then complete and pay out exactly once', () => {
  const s = createNewGame(seeded());
  assert.equal(claimable(s).length, 0, 'a brand-new town has nothing to claim yet');
  simulate(s, 120, seeded(5)); // moods settle
  assert.equal(claimable(s).length, 0, 'still nothing after the starter pets settle in');
  assert.equal(upcoming(s, 1)[0].id, 'market');
  s.resources.wood = 100;
  build(s, 'market', 0, 0);
  assert.deepEqual(claimable(s).map((q) => q.id), ['market']);
  assert.equal(claimQuest(s, 'hatch1').ok, false, 'not finished yet');
  const coins = s.resources.coins;
  const r = claimQuest(s, 'market');
  assert.ok(r.ok);
  assert.equal(s.resources.coins, coins + 40);
  assert.equal(claimQuest(s, 'market').ok, false, 'already claimed');
  assert.equal(claimable(s).length, 0);
});

test('goal rewards can be free eggs, and claim-all collects everything', () => {
  const s = rich(createNewGame(seeded()));
  for (let i = 0; i < 15; i++) hatch(s, 'basic', seeded(i + 20));
  const hatchedBefore = s.stats.hatched;
  const pets = s.pets.length;
  const { quests, hatched } = claimAll(s, seeded(8));
  assert.ok(quests.length >= 3);
  assert.ok(hatched.length >= 1, 'pets15 pays a free egg');
  assert.equal(s.pets.length, pets + hatched.length);
  assert.equal(s.stats.hatched, hatchedBefore, 'free eggs do not raise egg prices');
  assert.equal(claimable(s).length, 0);
});

test('goal ids are unique and progress is capped at the goal', () => {
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, QUESTS.length);
  const s = rich(createNewGame(seeded()));
  for (const q of QUESTS) {
    const p = questProgress(s, q);
    assert.ok(p >= 0 && p <= q.goal, q.id);
    for (const k of Object.keys(q.reward)) assert.ok(k in s.resources || k in { basic: 1, golden: 1, nest: 1 }, `${q.id}: bad reward ${k}`);
  }
});

test('old saves without goals or egg stats still load, and get credit for past progress', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  s.stats = { hatched: 3, strays: 6, coinsEarned: 5000 }; // v0.1 shape
  delete s.quests;
  saveGame(s, store);
  const raw = JSON.parse(store.getItem('pawville-save-v1'));
  delete raw.quests;
  store.setItem('pawville-save-v1', JSON.stringify(raw));
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.deepEqual(state.quests, { claimed: {} });
  const ready = claimable(state).map((q) => q.id);
  assert.ok(ready.includes('earn1k') && ready.includes('hatch1'));
});

test('sound settings default to on, also for older saves', () => {
  assert.equal(createNewGame(seeded()).settings.sfx, true);
  const store = memoryStorage();
  const s = createNewGame(seeded());
  saveGame(s, store);
  const raw = JSON.parse(store.getItem('pawville-save-v1'));
  raw.settings = { autoAssign: false }; // v0.1 shape
  store.setItem('pawville-save-v1', JSON.stringify(raw));
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.deepEqual(state.settings, { autoAssign: false, sfx: true, music: true });
});
