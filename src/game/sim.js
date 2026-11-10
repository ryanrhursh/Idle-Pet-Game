// Core game rules. Pure functions over a plain `state` object, so it can run
// in the browser and in Node tests. `rng` is injectable for deterministic tests.

import {
  RARITIES, SPECIES, TRAITS, BUILDINGS, EGGS, STRAY_WEIGHTS, PET_NAMES, CONFIG, xpForLevel,
} from './data.js';

// ---------- helpers ----------

export function pickWeighted(weights, rng = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function pickOne(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

export function emit(state, msg, kind = 'info') {
  state.events = state.events || [];
  state.events.push({ msg, kind });
  state.log.unshift({ msg, kind, t: state.time });
  if (state.log.length > 50) state.log.length = 50;
}

export function canAfford(state, cost) {
  return Object.entries(cost).every(([res, amt]) => (state.resources[res] || 0) >= amt);
}

function pay(state, cost) {
  for (const [res, amt] of Object.entries(cost)) state.resources[res] -= amt;
}

function scaleCost(cost, mul) {
  const out = {};
  for (const [res, amt] of Object.entries(cost)) out[res] = Math.ceil(amt * mul);
  return out;
}

// ---------- lookups ----------

export const getBuilding = (state, id) => state.buildings.find((b) => b.id === id) || null;
export const getPet = (state, id) => state.pets.find((p) => p.id === id) || null;
export const buildingAt = (state, x, y) => state.buildings.find((b) => b.x === x && b.y === y) || null;
export const residentsOf = (state, bId) => state.pets.filter((p) => p.homeId === bId);
export const workersOf = (state, bId) => state.pets.filter((p) => p.jobId === bId);

export function homeCapacity(b) {
  const def = BUILDINGS[b.type];
  return def.type === 'home' ? def.capacity + def.capacityPerLevel * (b.level - 1) : 0;
}

export function jobSlots(b) {
  const def = BUILDINGS[b.type];
  return def.type === 'job' ? def.slots + def.slotsPerLevel * (b.level - 1) : 0;
}

export function totalHousing(state) {
  return state.buildings.reduce((s, b) => s + homeCapacity(b), 0);
}

export function freeHomeSlots(state) {
  return totalHousing(state) - state.pets.filter((p) => p.homeId != null).length;
}

export function buildCost(state, type) {
  const count = state.buildings.filter((b) => b.type === type).length;
  return scaleCost(BUILDINGS[type].cost, Math.pow(CONFIG.dupCostMul, count));
}

export function upgradeCost(b) {
  return scaleCost(BUILDINGS[b.type].cost, Math.pow(CONFIG.upgradeCostMul, b.level));
}

export function expandCost(state) {
  return CONFIG.expandCost(state.rows);
}

// ---------- pets ----------

export function createPet(state, speciesId, rng = Math.random) {
  const pet = {
    id: state.nextId++,
    name: pickOne(PET_NAMES, rng),
    species: speciesId,
    trait: pickOne(Object.keys(TRAITS), rng),
    level: 1,
    xp: 0,
    happiness: 60,
    homeId: null,
    jobId: null,
    joined: state.time,
  };
  state.pets.push(pet);
  const isNew = !state.discovered[speciesId];
  state.discovered[speciesId] = true;
  return { pet, isNew };
}

export function randomSpecies(rarity, rng = Math.random) {
  const pool = Object.keys(SPECIES).filter((id) => SPECIES[id].rarity === rarity);
  return pickOne(pool, rng);
}

export function petLabel(pet) {
  return `${SPECIES[pet.species].emoji} ${pet.name}`;
}

export function hatch(state, eggId, rng = Math.random) {
  const egg = EGGS[eggId];
  if (!canAfford(state, egg.cost)) return { ok: false, msg: 'Not enough treats.' };
  pay(state, egg.cost);
  const rarity = pickWeighted(egg.weights, rng);
  const { pet, isNew } = createPet(state, randomSpecies(rarity, rng), rng);
  state.stats.hatched++;
  if (state.settings.autoAssign) autoAssignPet(state, pet);
  const sp = SPECIES[pet.species];
  emit(state, `${sp.emoji} ${pet.name} the ${RARITIES[rarity].name} ${sp.name} hatched!${isNew ? ' (New species!)' : ''}`, rarity === 'common' ? 'good' : 'great');
  return { ok: true, pet, isNew };
}

// ---------- assignment ----------

export function assignHome(state, petId, bId) {
  const pet = getPet(state, petId);
  if (!pet) return { ok: false, msg: 'No such pet.' };
  if (bId == null) { pet.homeId = null; return { ok: true }; }
  const b = getBuilding(state, bId);
  if (!b || BUILDINGS[b.type].type !== 'home') return { ok: false, msg: 'That is not a home.' };
  if (pet.homeId === bId) return { ok: true };
  if (residentsOf(state, bId).length >= homeCapacity(b)) return { ok: false, msg: 'That home is full.' };
  pet.homeId = bId;
  return { ok: true };
}

export function assignJob(state, petId, bId) {
  const pet = getPet(state, petId);
  if (!pet) return { ok: false, msg: 'No such pet.' };
  if (bId == null) { pet.jobId = null; return { ok: true }; }
  const b = getBuilding(state, bId);
  if (!b || BUILDINGS[b.type].type !== 'job') return { ok: false, msg: 'That is not a workplace.' };
  if (pet.jobId === bId) return { ok: true };
  if (workersOf(state, bId).length >= jobSlots(b)) return { ok: false, msg: 'No open jobs there.' };
  pet.jobId = bId;
  return { ok: true };
}

function openHomes(state) {
  return state.buildings.filter((b) => residentsOf(state, b.id).length < homeCapacity(b));
}

function openJobs(state) {
  return state.buildings.filter((b) => workersOf(state, b.id).length < jobSlots(b));
}

export function autoAssignPet(state, pet) {
  if (pet.homeId == null) {
    const home = openHomes(state)[0];
    if (home) pet.homeId = home.id;
  }
  if (pet.jobId == null) {
    const jobs = openJobs(state);
    const fav = jobs.find((b) => b.type === SPECIES[pet.species].favJob);
    const job = fav || jobs[0];
    if (job) pet.jobId = job.id;
  }
}

// Fill homes and jobs for every pet that lacks one. Favourite jobs first,
// highest rarity pets get first pick.
export function autoAssignAll(state) {
  const order = [...state.pets].sort((a, b) => RARITIES[SPECIES[b.species].rarity].mul - RARITIES[SPECIES[a.species].rarity].mul);
  // pass 1: favourite jobs only
  for (const pet of order) {
    if (pet.homeId == null) {
      const home = openHomes(state)[0];
      if (home) pet.homeId = home.id;
    }
    if (pet.jobId == null) {
      const fav = openJobs(state).find((b) => b.type === SPECIES[pet.species].favJob);
      if (fav) pet.jobId = fav.id;
    }
  }
  // pass 2: anything open
  for (const pet of order) autoAssignPet(state, pet);
}

// ---------- building ----------

export function build(state, type, x, y) {
  const def = BUILDINGS[type];
  if (!def) return { ok: false, msg: 'Unknown building.' };
  if (x < 0 || y < 0 || x >= CONFIG.gridCols || y >= state.rows) return { ok: false, msg: 'Out of bounds.' };
  if (buildingAt(state, x, y)) return { ok: false, msg: 'That tile is taken.' };
  const cost = buildCost(state, type);
  if (!canAfford(state, cost)) return { ok: false, msg: 'Not enough resources.' };
  pay(state, cost);
  const b = { id: state.nextId++, type, x, y, level: 1 };
  state.buildings.push(b);
  if (state.settings.autoAssign) autoAssignAll(state);
  emit(state, `Built a ${def.emoji} ${def.name}.`);
  return { ok: true, building: b };
}

export function upgrade(state, bId) {
  const b = getBuilding(state, bId);
  if (!b) return { ok: false, msg: 'No such building.' };
  if (b.level >= CONFIG.maxBuildingLevel) return { ok: false, msg: 'Already max level.' };
  const cost = upgradeCost(b);
  if (!canAfford(state, cost)) return { ok: false, msg: 'Not enough resources.' };
  pay(state, cost);
  b.level++;
  if (state.settings.autoAssign) autoAssignAll(state);
  emit(state, `Upgraded ${BUILDINGS[b.type].emoji} ${BUILDINGS[b.type].name} to level ${b.level}.`);
  return { ok: true };
}

export function demolish(state, bId) {
  const b = getBuilding(state, bId);
  if (!b) return { ok: false, msg: 'No such building.' };
  for (const p of state.pets) {
    if (p.homeId === bId) p.homeId = null;
    if (p.jobId === bId) p.jobId = null;
  }
  // refund half of the base build cost
  const refund = scaleCost(BUILDINGS[b.type].cost, CONFIG.refundRatio);
  for (const [res, amt] of Object.entries(refund)) state.resources[res] += amt;
  state.buildings = state.buildings.filter((x) => x.id !== bId);
  if (state.settings.autoAssign) autoAssignAll(state);
  emit(state, `Demolished ${BUILDINGS[b.type].name}.`);
  return { ok: true };
}

export function expandLand(state) {
  if (state.rows >= CONFIG.maxRows) return { ok: false, msg: 'Town is at max size.' };
  const cost = expandCost(state);
  if (!canAfford(state, cost)) return { ok: false, msg: 'Not enough resources.' };
  pay(state, cost);
  state.rows++;
  emit(state, 'Your town grew! New land is available.', 'good');
  return { ok: true };
}

// ---------- economy ----------

export function decorHappiness(state) {
  let total = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (def.type === 'decor') total += def.happiness + def.happinessPerLevel * (b.level - 1);
  }
  return Math.min(40, total);
}

export function collectionMul(state) {
  return 1 + CONFIG.collectionBonus * Object.keys(state.discovered).length;
}

// Breakdown of what affects this pet's mood. Used by the UI too.
export function happinessFactors(state, pet) {
  const trait = TRAITS[pet.trait];
  const f = [];
  if (pet.homeId != null) f.push(['Has a home', 20 + (trait.homeBonus || 0)]);
  else f.push(['Homeless', -20 - (trait.homelessPenalty || 0)]);
  const job = pet.jobId != null ? getBuilding(state, pet.jobId) : null;
  if (job) {
    if (job.type === SPECIES[pet.species].favJob) f.push(['Dream job', 15]);
    else f.push(['Employed', 5]);
  } else f.push(['Bored (no job)', -5]);
  const decor = decorHappiness(state);
  if (decor) f.push(['Town decor', decor]);
  if (state.starving) f.push(['Hungry!', -35]);
  if (trait.happy) f.push([trait.name, trait.happy]);
  return f;
}

export function targetHappiness(state, pet) {
  const sum = happinessFactors(state, pet).reduce((s, [, v]) => s + v, 50);
  return Math.max(0, Math.min(100, sum));
}

// Multiplier applied to a working pet's output (everything except the building rate).
export function workerMul(state, pet) {
  const job = getBuilding(state, pet.jobId);
  if (!job) return 0;
  const trait = TRAITS[pet.trait];
  let m = RARITIES[SPECIES[pet.species].rarity].mul;
  m *= 1 + CONFIG.levelOutputBonus * (pet.level - 1);
  if (job.type === SPECIES[pet.species].favJob) m *= 1 + CONFIG.favJobBonus;
  m *= 0.5 + pet.happiness / 100; // 0.5x when miserable .. 1.5x when ecstatic
  m *= trait.output || 1;
  if (trait.social) {
    const coworkers = workersOf(state, job.id).length - 1;
    m *= 1 + Math.min(3, coworkers) * trait.social;
  }
  return m;
}

export function buildingRateMul(b) {
  return 1 + 0.25 * (b.level - 1);
}

// Per-second production/consumption at current happiness levels.
// bakery-style consumption is reported separately because it is throttled by food supply.
export function production(state) {
  const prod = { coins: 0, food: 0, wood: 0, treats: 0 };
  const convProd = { coins: 0, food: 0, wood: 0, treats: 0 }; // output that needs inputs
  const convCons = { coins: 0, food: 0, wood: 0, treats: 0 };
  const cmul = collectionMul(state);
  for (const pet of state.pets) {
    if (pet.jobId == null) continue;
    const b = getBuilding(state, pet.jobId);
    if (!b) continue;
    const def = BUILDINGS[b.type];
    const m = workerMul(state, pet) * buildingRateMul(b);
    const target = def.consumes ? convProd : prod;
    for (const [res, rate] of Object.entries(def.produces)) target[res] += rate * m * cmul;
    if (def.consumes) for (const [res, rate] of Object.entries(def.consumes)) convCons[res] += rate * m;
  }
  let eat = 0;
  for (const pet of state.pets) eat += CONFIG.foodPerPet * (TRAITS[pet.trait].food || 1);
  return { prod, convProd, convCons, eat };
}

// Net rates for display, assuming converters run at full speed when food allows.
export function netRates(state) {
  const { prod, convProd, convCons, eat } = production(state);
  const net = {};
  for (const res of Object.keys(prod)) net[res] = prod[res] + convProd[res] - convCons[res];
  net.food -= eat;
  return net;
}

// ---------- the tick ----------

export function tick(state, dt, rng = Math.random) {
  state.time += dt;

  // mood drifts toward its target
  for (const pet of state.pets) {
    const target = targetHappiness(state, pet);
    const step = CONFIG.happinessSpeed * dt;
    if (Math.abs(target - pet.happiness) <= step) pet.happiness = target;
    else pet.happiness += Math.sign(target - pet.happiness) * step;
  }

  const { prod, convProd, convCons, eat } = production(state);
  const r = state.resources;

  // food: pets eat first, converters (bakery) get what is left
  let food = r.food + prod.food * dt - eat * dt;
  const wasStarving = state.starving;
  let convEff = 1;
  if (food < 0) {
    food = 0;
    state.starving = true;
    convEff = 0;
  } else {
    state.starving = false;
    const need = convCons.food * dt;
    if (need > 0) convEff = Math.min(1, food / need);
    food -= need * convEff;
  }
  r.food = food;
  if (state.starving && !wasStarving) emit(state, 'Your pets are hungry! Build or staff more farms.', 'bad');

  for (const res of ['coins', 'wood', 'treats']) {
    const gain = (prod[res] + convProd[res] * convEff) * dt;
    r[res] += gain;
    if (res === 'coins') state.stats.coinsEarned += gain;
  }

  // workers gain experience
  for (const pet of state.pets) {
    if (pet.jobId == null || pet.level >= CONFIG.maxPetLevel) continue;
    pet.xp += dt * (TRAITS[pet.trait].xp || 1);
    while (pet.level < CONFIG.maxPetLevel && pet.xp >= xpForLevel(pet.level)) {
      pet.xp -= xpForLevel(pet.level);
      pet.level++;
      if (pet.level % 5 === 0) emit(state, `${petLabel(pet)} reached level ${pet.level}!`, 'good');
    }
  }

  // strays wander in when there's a free bed
  if (freeHomeSlots(state) > 0) {
    state.strayTimer -= dt;
    if (state.strayTimer <= 0) {
      const rarity = pickWeighted(STRAY_WEIGHTS, rng);
      const { pet, isNew } = createPet(state, randomSpecies(rarity, rng), rng);
      state.stats.strays++;
      if (state.settings.autoAssign) autoAssignPet(state, pet);
      const sp = SPECIES[pet.species];
      emit(state, `A stray ${sp.name}, ${sp.emoji} ${pet.name}, moved into town!${isNew ? ' (New species!)' : ''}`, 'good');
      state.strayTimer = CONFIG.strayMin + rng() * (CONFIG.strayMax - CONFIG.strayMin);
    }
  }
}

// Run many ticks (offline progress). Returns resource deltas and pet count change.
export function simulate(state, seconds, rng = Math.random, step = 1) {
  const before = { ...state.resources, pets: state.pets.length };
  let left = Math.min(seconds, CONFIG.maxOfflineSeconds);
  while (left > 0) {
    const dt = Math.min(step, left);
    tick(state, dt, rng);
    left -= dt;
  }
  const delta = {};
  for (const k of Object.keys(state.resources)) delta[k] = state.resources[k] - before[k];
  delta.pets = state.pets.length - before.pets;
  return delta;
}
