import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, saveGame, loadGame, SAVE_VERSION } from '../src/game/state.js';
import {
  build, upgrade, demolish, hatch, tick, simulate, assignHome, assignJob, freeHomeSlots,
  targetHappiness, netRates, workersOf, residentsOf, getBuilding, expandLand, upgradeCost, eggCost, production, workerMul,
  retirePet, recallPet, createPet, makeShiny,
} from '../src/game/sim.js';
import { CONFIG, BUILDINGS, EGGS, SPECIES } from '../src/game/data.js';
import {
  QUESTS, ENDLESS, endlessQuest, currentEndless, questSummary, claimable, claimQuest, claimAll, questProgress, upcoming,
} from '../src/game/quests.js';
import {
  ensureRequests, completeRequest, skipRequest, readyRequests, requestStatus, requestText,
} from '../src/game/requests.js';
import { featuredSpecies, featuredEndsAt, featuredChance, WEEK_MS } from '../src/game/featured.js';
import { fmt, nice } from '../src/game/util.js';

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

// ---------- endless goals ----------

test('endless goals: the 100th tier of every kind is sane, and targets and rewards keep growing', () => {
  for (const k of ENDLESS) {
    let prev = null;
    for (let t = 1; t <= 100; t++) {
      const q = endlessQuest(k.kind, t);
      assert.equal(q.id, `${k.kind}:${t}`);
      assert.ok(Number.isFinite(q.goal) && q.goal > 0, `${q.id} goal`);
      assert.ok(q.title.length > 0 && q.desc.length > 0, `${q.id} text`);
      for (const [key, v] of Object.entries(q.reward)) {
        assert.ok(Number.isFinite(v) && v > 0, `${q.id} reward ${key}`);
        assert.ok(key in EGGS || key in { coins: 1, food: 1, wood: 1, treats: 1 }, `${q.id}: bad reward key ${key}`);
      }
      if (prev) {
        assert.ok(q.goal > prev.goal, `${q.id} goal grows`);
        for (const [key, v] of Object.entries(prev.reward)) {
          if (key in EGGS) assert.ok(q.reward[key] >= v && q.reward[key] <= 12, `${q.id} egg reward is capped`);
          else assert.ok(q.reward[key] > v, `${q.id} ${key} reward grows`);
        }
      }
      prev = q;
    }
  }
  assert.ok(endlessQuest('coins', 2).goal >= 3.5 * endlessQuest('coins', 1).goal, 'coin targets grow about 4x per tier');
});

test('endless goals unlock after their hand-written lead-in, pay once, and only claimed tiers are saved', () => {
  const s = createNewGame(seeded());
  s.stats.coinsEarned = 5e8;
  assert.ok(!claimable(s).some((q) => q.id === 'coins:1'), 'locked until earn100m is claimed');
  assert.equal(claimQuest(s, 'coins:1').ok, false);
  s.quests.claimed.earn100m = true;
  assert.ok(claimable(s).some((q) => q.id === 'coins:1'));
  const before = s.resources.coins;
  assert.ok(claimQuest(s, 'coins:1', seeded(3)).ok);
  assert.equal(s.resources.coins, before + endlessQuest('coins', 1).reward.coins);
  assert.equal(claimQuest(s, 'coins:1').ok, false, 'already claimed');
  assert.equal(claimQuest(s, 'coins:3').ok, false, 'tier 3 is not the current tier');
  assert.deepEqual(currentEndless(s).map((q) => q.id), ['coins:2']);
  assert.ok(Object.keys(s.quests.claimed).every((id) => s.quests.claimed[id] === true));
  assert.ok(!claimQuest(s, 'nonsense:1').ok);
});

test('claim-all keeps going through endless tiers that were already complete', () => {
  const s = createNewGame(seeded());
  s.quests.claimed.earn100m = true;
  s.stats.coinsEarned = 9e10; // tiers 1-4 (4e8, 1.6e9, 6.4e9, 2.6e10); tier 5 needs 1e11
  const { quests } = claimAll(s, seeded(2));
  assert.ok(quests.filter((q) => q.kind === 'coins').length === 4);
  assert.ok(s.quests.claimed['coins:4'] && !s.quests.claimed['coins:5']);
  assert.equal(currentEndless(s).find((q) => q.kind === 'coins').id, 'coins:5');
});

test('once the list is done, "up next" is all endless goals, closest to done first', () => {
  const s = createNewGame(seeded());
  for (const q of QUESTS) s.quests.claimed[q.id] = true;
  const summary = questSummary(s);
  assert.equal(summary.done, QUESTS.length);
  assert.equal(summary.endless, 0);
  s.stats.woodEarned = 1e5; // half of wood:1
  const up = upcoming(s, 4);
  assert.equal(up.length, 4);
  assert.ok(up.every((q) => q.endless));
  assert.equal(up[0].id, 'wood:1');
  assert.equal(questProgress(s, up[0]), 1e5, 'progress is read from the game state');
});

test('lifetime counters feed the endless goals', () => {
  const s = createNewGame(seeded());
  simulate(s, 300, seeded(4));
  assert.ok(s.stats.woodEarned > 0 && s.stats.foodEarned > 0);
  assert.ok(s.stats.coinsEarned >= 0);
});

test('big numbers and nice rounding', () => {
  assert.equal(fmt(4e12), '4.0T');
  assert.equal(fmt(2.5e6), '2.5M');
  assert.equal(fmt(1234), '1234');
  assert.equal(fmt(1.6e68), '1.6e68');
  assert.equal(fmt(Infinity), '0');
  assert.equal(nice(3987211), 4000000);
  assert.equal(nice(7), 7);
});

// ---------- town requests ----------

const KEY = 'pawville-save-v1';

test('a new town has three valid requests, sized to what it can afford soon', () => {
  const s = createNewGame(seeded());
  assert.equal(s.requests.active.length, 3);
  assert.equal(new Set(s.requests.active.map((r) => r.id)).size, 3);
  const rates = netRates(s);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    s.requests.seed = seed; s.requests.next = 0; s.requests.active = [];
    ensureRequests(s);
    assert.equal(s.requests.active.length, 3, `seed ${seed}`);
    for (const r of s.requests.active) {
      assert.ok(requestText(s, r).length > 0);
      assert.ok(Object.keys(r.reward).length > 0);
      assert.equal(requestStatus(s, r).ready, false, 'a new request is never already done');
      if (r.type === 'give') assert.ok(r.amount <= s.resources[r.res] + Math.max(0, rates[r.res]) * 1200 + 1, 'affordable within ~20 minutes');
    }
  }
});

test('in a rich town, give requests are big enough to drain the stockpile', () => {
  const s = createNewGame(seeded(4));
  s.resources = { coins: 5e7, food: 5e7, wood: 5e7, treats: 5e5 };
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    s.requests.seed = seed; s.requests.next = 0; s.requests.active = [];
    ensureRequests(s);
    for (const r of s.requests.active) {
      if (r.type !== 'give') continue;
      seen++;
      assert.ok(r.amount <= s.resources[r.res]);
      assert.ok(r.amount >= 0.1 * s.resources[r.res], `${r.res} ask ${r.amount} is trivial next to the stock`);
    }
  }
  assert.ok(seen > 10);
});

test('requests are repeatable from the saved seed', () => {
  const a = createNewGame(seeded());
  const b = createNewGame(seeded());
  b.requests = { seed: a.requests.seed, next: 0, done: 0, active: [] };
  ensureRequests(b);
  assert.deepEqual(b.requests.active, a.requests.active);
});

test('finishing a give request takes the resources, pays the reward and brings a new request', () => {
  const s = rich(createNewGame(seeded()));
  const id = 900;
  s.requests.active = [{ id, type: 'give', petId: s.pets[0].id, res: 'wood', amount: 500, reward: { treats: 7 } }, ...s.requests.active.slice(0, 2)];
  const wood = s.resources.wood, treats = s.resources.treats;
  const r = completeRequest(s, id, seeded(2));
  assert.ok(r.ok);
  assert.equal(s.resources.wood, wood - 500);
  assert.equal(s.resources.treats, treats + 7);
  assert.equal(s.requests.done, 1);
  assert.equal(s.requests.active.length, 3, 'replaced by a new one');
  assert.ok(!s.requests.active.some((q) => q.id === id));
  assert.equal(completeRequest(s, id).ok, false, 'can not be finished twice');
  s.requests.active.unshift({ id: 901, type: 'give', petId: s.pets[0].id, res: 'coins', amount: 1e12, reward: { treats: 1 } });
  const coins = s.resources.coins;
  assert.equal(completeRequest(s, 901).ok, false, 'not enough coins');
  assert.equal(s.resources.coins, coins);
});

test('build, hatch and land requests finish when the town gets there, and free eggs can be the reward', () => {
  const s = createNewGame(seeded());
  s.resources.wood = 500; s.resources.treats = 100;
  s.requests.active = [
    { id: 1, type: 'build', b: 'market', lv: 1, reward: { coins: 5 } },
    { id: 2, type: 'hatch', n: 1, from: s.stats.hatched, reward: { basic: 1 } },
    { id: 3, type: 'land', rows: s.rows + 1, reward: { food: 9 } },
  ];
  assert.deepEqual(readyRequests(s), []);
  build(s, 'market', 0, 0);
  hatch(s, 'basic', seeded(3));
  s.resources = { coins: 1e6, food: 1e6, wood: 1e6, treats: 100 };
  expandLand(s);
  assert.deepEqual(readyRequests(s).map((r) => r.id), [1, 2, 3]);
  const pets = s.pets.length;
  const r = completeRequest(s, 2, seeded(5));
  assert.ok(r.ok && r.hatched.length === 1, 'the free egg hatched');
  assert.equal(s.pets.length, pets + 1);
  assert.ok(completeRequest(s, 1).ok && completeRequest(s, 3).ok);
  assert.equal(s.requests.done, 3);
});

test('requests never run dry: skipping always leaves three different open requests', () => {
  const s = createNewGame(seeded(9));
  for (let i = 0; i < 120; i++) {
    const victim = s.requests.active[i % s.requests.active.length];
    assert.ok(skipRequest(s, victim.id).ok);
    assert.equal(s.requests.active.length, 3);
    assert.equal(new Set(s.requests.active.map((r) => r.id)).size, 3);
    if (i % 10 === 0) simulate(s, 200, seeded(i + 1));
  }
  assert.equal(s.requests.done, 0, 'skipping does not count as finishing');
});

test('requests survive save and load', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  saveGame(s, store);
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.deepEqual(state.requests, s.requests);
});

test('old saves without requests, shiny records or the new counters load and keep working', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  saveGame(s, store);
  const raw = JSON.parse(store.getItem(KEY));
  delete raw.requests;
  delete raw.shinyFound;
  raw.stats = { hatched: 3, strays: 2, coinsEarned: 100 }; // v0.3 shape
  store.setItem(KEY, JSON.stringify(raw));
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.equal(state.version, SAVE_VERSION, 'no save-version bump');
  assert.deepEqual(state.shinyFound, {});
  assert.equal(state.requests.active.length, 3, 'old towns get their first requests on load');
  assert.equal(state.requests.done, 0);
  assert.equal(state.stats.woodEarned, 0);
  assert.ok(!state.pets.some((p) => p.shiny), 'old pets are not shiny');
  simulate(state, 200, seeded(2));
  state.resources.treats = 200;
  assert.ok(hatch(state, 'basic', seeded(8)).ok);
  assert.ok(state.stats.woodEarned > 0);
  assert.ok(Object.values(production(state).prod).every(Number.isFinite));
  // and an old save with a damaged requests field still loads
  raw.requests = 'garbage';
  store.setItem(KEY, JSON.stringify(raw));
  assert.equal(loadGame(store, s.savedAt + 1000).state.requests.active.length, 3);
});

// ---------- shiny pets ----------

test('shiny pets: rolled on hatch, recorded in the Petdex, and 15% better workers', () => {
  const s = createNewGame(seeded());
  s.resources.treats = 1000;
  const sparkly = hatch(s, 'basic', () => 0, false, Date.UTC(2025, 0, 6));
  assert.ok(sparkly.ok && sparkly.shiny && sparkly.isNewShiny && sparkly.pet.shiny);
  assert.ok(s.shinyFound[sparkly.pet.species]);
  assert.ok(s.log[0].msg.includes('shiny'));
  const again = hatch(s, 'basic', () => 0, false, Date.UTC(2025, 0, 6));
  assert.ok(again.shiny && !again.isNewShiny, 'second shiny of a species is not "new"');
  const plain = hatch(s, 'basic', () => 0.999999);
  assert.ok(plain.ok && !plain.shiny && !plain.pet.shiny);
  const pet = s.pets[0];
  const base = workerMul(s, pet);
  pet.shiny = true;
  assert.ok(Math.abs(workerMul(s, pet) / base - (1 + CONFIG.shinyBonus)) < 1e-9);
  assert.ok(claimable(s).some((q) => q.id === 'shiny1'), 'the first shiny goal completes');
});

test('shiny odds are about 3%, a bit higher from Golden Eggs', () => {
  const rate = (egg, seed) => {
    const s = createNewGame(seeded());
    const rng = seeded(seed);
    let n = 0;
    for (let i = 0; i < 4000; i++) { s.pets.length = 0; if (hatch(s, egg, rng, true).shiny) n++; }
    return n / 4000;
  };
  const basic = rate('basic', 11), golden = rate('golden', 12);
  assert.ok(basic > 0.02 && basic < 0.042, `basic ${basic}`);
  assert.ok(golden > 0.036 && golden < 0.066, `golden ${golden}`);
  assert.ok(golden > basic);
});

// ---------- weekly featured egg ----------

test('the featured species is chosen from the date: same all week, every species gets a turn', () => {
  const monday = Date.UTC(2025, 0, 6, 12); // a Monday
  const f = featuredSpecies(monday);
  assert.ok(f in SPECIES);
  assert.equal(featuredSpecies(monday + 6 * 24 * 3600e3), f, 'unchanged until the week ends');
  assert.notEqual(featuredSpecies(monday + WEEK_MS), f);
  assert.equal(featuredSpecies(monday), f, 'pure: same date, same answer');
  const ends = featuredEndsAt(monday);
  assert.ok(ends > monday && ends - monday <= WEEK_MS);
  assert.equal(new Date(ends).getUTCDay(), 1, 'weeks turn over on Monday (UTC)');
  assert.equal(new Date(ends).getUTCHours(), 0);
  const epoch = Date.UTC(2024, 0, 1);
  const cycle = new Set(Object.keys(SPECIES).map((_, w) => featuredSpecies(epoch + w * WEEK_MS + 1000)));
  assert.equal(cycle.size, Object.keys(SPECIES).length, 'a full cycle features each species once');
});

test('the featured species is boosted inside its own rarity, and only where the egg can make it', () => {
  const epoch = Date.UTC(2024, 0, 1);
  let rareWeek = null, legendWeek = null;
  for (let w = 0; w < 40; w++) {
    const t = epoch + w * WEEK_MS + 1000;
    const rar = SPECIES[featuredSpecies(t)].rarity;
    if (rar === 'rare' && rareWeek == null) rareWeek = t;
    if (rar === 'legendary' && legendWeek == null) legendWeek = t;
  }
  assert.ok(rareWeek && legendWeek);
  assert.equal(featuredChance('basic', legendWeek), 0, 'Pet Eggs have no legendaries');
  assert.ok(featuredChance('golden', legendWeek) > 0);
  const id = featuredSpecies(rareWeek);
  const p = featuredChance('golden', rareWeek);
  const baseline = EGGS.golden.weights.rare / 100 / Object.values(SPECIES).filter((x) => x.rarity === 'rare').length;
  assert.ok(p > 2 * baseline, 'much better than an ordinary rare');
  const s = createNewGame(seeded());
  const rng = seeded(21);
  let hits = 0;
  for (let i = 0; i < 4000; i++) { s.pets.length = 0; if (hatch(s, 'golden', rng, true, rareWeek).pet.species === id) hits++; }
  assert.ok(Math.abs(hits / 4000 - p) < 0.035, `observed ${hits / 4000} vs expected ${p}`);
});

// ---------- the Meadow ----------

test('retiring a pet frees its home and job and a town slot, and keeps the Petdex', () => {
  const s = createNewGame(seeded());
  const pet = s.pets[0];
  const id = pet.id, species = pet.species;
  makeShiny(s, pet);
  const before = production(s).prod.food + production(s).prod.wood;
  const r = retirePet(s, id);
  assert.ok(r.ok);
  assert.ok(!s.pets.some((p) => p.id === id));
  assert.equal(s.meadow.length, 1);
  assert.equal(s.meadow[0].homeId, null);
  assert.equal(s.meadow[0].jobId, null);
  assert.ok(s.discovered[species], 'the species stays discovered');
  assert.ok(s.shinyFound[species], 'the shiny entry stays');
  assert.ok(s.meadow[0].shiny, 'and the pet is still shiny');
  assert.ok(production(s).prod.food + production(s).prod.wood < before, 'it no longer works');
  assert.equal(retirePet(s, 99999).ok, false);
});

test('a full town can retire pets to hatch more, and bring them back only while there is room', () => {
  const s = rich(createNewGame(seeded()));
  while (s.pets.length < CONFIG.maxPets) createPet(s, 'mouse', seeded(s.pets.length + 1));
  assert.equal(hatch(s, 'basic', seeded(2)).ok, false, 'town is full');
  const id = s.pets[5].id;
  assert.ok(retirePet(s, id).ok);
  assert.equal(s.pets.length, CONFIG.maxPets - 1);
  assert.ok(hatch(s, 'basic', seeded(3)).ok, 'the freed slot can hold a new pet');
  assert.equal(s.pets.length, CONFIG.maxPets);
  const blocked = recallPet(s, id);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.msg.includes('full'));
  assert.equal(s.meadow.length, 1, 'still in the Meadow');
  retirePet(s, s.pets[7].id);
  assert.ok(recallPet(s, id).ok);
  assert.equal(s.meadow.length, 1);
  assert.ok(s.pets.some((p) => p.id === id));
  assert.equal(recallPet(s, id).ok, false, 'not in the Meadow any more');
});

test('the Meadow is saved, and old saves without one still load', () => {
  const store = memoryStorage();
  const s = createNewGame(seeded());
  makeShiny(s, s.pets[1]);
  const keep = s.pets[0].id;
  retirePet(s, keep);
  saveGame(s, store);
  assert.deepEqual(loadGame(store, s.savedAt + 1000).state.meadow, s.meadow);
  const raw = JSON.parse(store.getItem(KEY));
  delete raw.meadow;
  delete raw.stats.shinies; // saves from before shinies were counted
  store.setItem(KEY, JSON.stringify(raw));
  const { state } = loadGame(store, s.savedAt + 1000);
  assert.deepEqual(state.meadow, []);
  assert.equal(state.stats.shinies, 1, 'shinies already in town are counted');
  assert.equal(state.version, SAVE_VERSION);
});

test('hatching a shiny counts towards the endless shiny goals, and requests can name a retired pet', () => {
  const s = createNewGame(seeded());
  s.resources.treats = 500;
  hatch(s, 'basic', () => 0);
  hatch(s, 'basic', () => 0.999999);
  assert.equal(s.stats.shinies, 1);
  const pet = s.pets[0];
  s.requests.active = [{ id: 50, type: 'give', petId: pet.id, res: 'wood', amount: 20, reward: { treats: 2 } }];
  retirePet(s, pet.id);
  assert.ok(requestText(s, s.requests.active[0]).startsWith(pet.name), 'the name still shows');
  s.quests.claimed.hatch30 = true;
  s.quests.claimed.shiny3 = true;
  const kinds = currentEndless(s).map((q) => q.id);
  assert.ok(kinds.includes('hatched:1') && kinds.includes('shinies:1'));
  assert.equal(endlessQuest('hatched', 1).goal, 60);
});
