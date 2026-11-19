// Town Requests: the townspeople ask for things. Three are always open.
//   give  - "Biscuit wants 500 🍎": hand over resources (this is what drains big stockpiles)
//   build - "The town wants a level-5 Bakery": derived from the town, nothing is handed over
//   hatch - "The town wants 2 more eggs hatched"
//   land  - "The town wants more room: 9 rows"
// Requests are made from the CURRENT town: how much it earns per second and how much it has in stock, so an
// early town is asked for tens and a rich one for millions, and never for more than it could pay within
// about 20 minutes of income. When one is finished (or skipped) a new one is generated.
//
// Saved: state.requests = { seed, next, done, active: [...] }. The seed + counter make generation repeatable;
// the active list holds the three requests (their rewards are stored, so they don't change under the player).

import { BUILDINGS, CONFIG, RESOURCES, SPECIES } from './data.js';
import { buildCost, eggCost, emit, expandCost, getPet, maxLevelOf, netRates, upgradeCost } from './sim.js';
import { payReward, rewardText } from './quests.js';
import { fmt, mulberry32, nice } from './util.js';

export const ACTIVE_REQUESTS = 3;
const ASK_SECONDS = 300; // a typical "give" asks for about 2-5 minutes of income (or up to 30% of a big stockpile)
const SOON_SECONDS = 1200; // ...and nothing is asked that is further away than 20 minutes of income
const FLOOR = { coins: 20, food: 20, wood: 20 };
const GIVE_WEIGHTS = { coins: 3, wood: 3, food: 2 };

// ---------- generation ----------

const stock = (state, res) => state.resources[res] || 0;
const rate = (rates, res) => Math.max(0, rates[res] || 0);
// The most of `res` the town could have in 20 minutes.
const reach = (state, rates, res) => stock(state, res) + rate(rates, res) * SOON_SECONDS;
const affordSoon = (state, rates, cost) => Object.entries(cost).every(([res, n]) => n <= reach(state, rates, res));
const costValue = (cost) => Object.values(cost).reduce((a, b) => a + b, 0);
const freeTiles = (state) => CONFIG.gridCols * state.rows - state.buildings.length;

// What the town pays for a request worth about `value` coins. Never the resource that was asked for.
// Rewards are measured in minutes of the town's own income (so they stay in proportion as the town grows):
// ask for ten minutes of coins and you get back a bit more than ten minutes of wood.
function makeReward(state, rng, rates, value, asked = null) {
  const roll = rng();
  const minutes = value / Math.max(1, rates[asked || 'coins']) / 60;
  if (roll < 0.08 && minutes >= 6 && state.pets.length < CONFIG.maxPets - 1) {
    return { [state.pets.length < 12 || rng() < 0.5 ? 'basic' : 'golden']: 1 };
  }
  if (roll < 0.5) return { treats: Math.max(2, Math.round(minutes * 60 * 0.5 * Math.max(0.01, rates.treats))) };
  const options = Object.keys(GIVE_WEIGHTS).filter((r) => r !== asked);
  const res = options[Math.floor(rng() * options.length)];
  const ratio = asked ? Math.min(4, Math.max(0.2, Math.max(0.05, rates[res]) / Math.max(0.05, rates[asked]))) : 1;
  return { [res]: Math.max(FLOOR[res], nice(value * 1.2 * ratio)) };
}

function giveRequest(state, rng, rates) {
  const options = {};
  for (const res of Object.keys(GIVE_WEIGHTS)) {
    if (res === 'food' && (state.starving || (rates.food < 0.05 && stock(state, res) < FLOOR.food * 3))) continue;
    const cap = Math.floor(reach(state, rates, res));
    const size = Math.min(cap, Math.max(rate(rates, res) * ASK_SECONDS, stock(state, res) * 0.3, FLOOR[res]));
    const amount = Math.min(cap, nice(size * (0.5 + 0.5 * rng())));
    if (amount >= FLOOR[res]) options[res] = { amount, weight: GIVE_WEIGHTS[res] };
  }
  const keys = Object.keys(options);
  if (!keys.length || !state.pets.length) return null;
  let r = rng() * keys.reduce((a, k) => a + options[k].weight, 0);
  let res = keys[keys.length - 1];
  for (const k of keys) { r -= options[k].weight; if (r < 0) { res = k; break; } }
  const pet = state.pets[Math.floor(rng() * state.pets.length)];
  const { amount } = options[res];
  return { type: 'give', petId: pet.id, res, amount, reward: makeReward(state, rng, rates, amount, res) };
}

function buildRequest(state, rng, rates) {
  const cands = [];
  const owned = new Set(state.buildings.map((b) => b.type));
  for (const type of owned) {
    const best = state.buildings.filter((b) => b.type === type).reduce((a, b) => (b.level > a.level ? b : a));
    if (best.level >= maxLevelOf(best)) continue;
    const cost = upgradeCost(best);
    if (affordSoon(state, rates, cost)) cands.push({ b: type, lv: best.level + 1, cost });
  }
  if (freeTiles(state) > 0) {
    for (const type of Object.keys(BUILDINGS)) {
      if (owned.has(type)) continue;
      const cost = buildCost(state, type);
      if (affordSoon(state, rates, cost)) cands.push({ b: type, lv: 1, cost });
    }
  }
  if (!cands.length) return null;
  const c = cands[Math.floor(rng() * cands.length)];
  return { type: 'build', b: c.b, lv: c.lv, reward: makeReward(state, rng, rates, costValue(c.cost) * 0.25) };
}

function hatchRequest(state, rng, rates) {
  const unit = eggCost(state, 'basic').treats;
  const room = CONFIG.maxPets - state.pets.length;
  const most = Math.min(5, room - 1, Math.floor(reach(state, rates, 'treats') / unit));
  if (most < 1) return null;
  const n = 1 + Math.floor(rng() * most);
  return { type: 'hatch', n, from: state.stats.hatched, reward: makeReward(state, rng, rates, n * unit * Math.max(15, rates.coins / Math.max(0.01, rates.treats)) * 0.25) };
}

function landRequest(state, rng, rates) {
  if (state.rows >= CONFIG.maxRows) return null;
  const cost = expandCost(state);
  if (!affordSoon(state, rates, cost)) return null;
  return { type: 'land', rows: state.rows + 1, reward: makeReward(state, rng, rates, costValue(cost) * 0.25) };
}

const MAKERS = { give: [50, giveRequest], build: [25, buildRequest], hatch: [12, hatchRequest], land: [10, landRequest] };

const signature = (req) => (req.type === 'give' ? `give:${req.res}` : req.type === 'build' ? `build:${req.b}` : req.type);

// Is this request still something that can be done?
function stillValid(state, req) {
  if (req.type === 'build') return !!BUILDINGS[req.b];
  if (req.type === 'hatch') return state.pets.length + req.n < CONFIG.maxPets;
  if (req.type === 'land') return req.rows <= CONFIG.maxRows; // stays open (and claimable) once the town has grown that far
  return !!RESOURCES[req.res];
}

function generate(state, R) {
  const rng = mulberry32((R.seed + Math.imul(R.next, 0x9e3779b1)) >>> 0);
  const id = ++R.next;
  const rates = netRates(state);
  const taken = new Set(R.active.map(signature));
  // try the kinds in a random order (weighted), skipping repeats of what is already open
  const kinds = Object.keys(MAKERS);
  const order = [];
  while (kinds.length) {
    let r = rng() * kinds.reduce((a, k) => a + MAKERS[k][0], 0);
    let i = 0;
    for (; i < kinds.length - 1; i++) { r -= MAKERS[kinds[i]][0]; if (r < 0) break; }
    order.push(kinds.splice(i, 1)[0]);
  }
  let fallback = null;
  for (const kind of order) {
    const req = MAKERS[kind][1](state, rng, rates);
    if (!req) continue;
    req.id = id;
    if (!taken.has(signature(req))) return req;
    fallback = fallback || req;
  }
  return fallback;
}

// Makes sure there are three valid requests open. Safe to call any time outside the tick; old saves get theirs here.
export function ensureRequests(state, count = ACTIVE_REQUESTS) {
  const R = state.requests;
  R.active = R.active.filter((req) => stillValid(state, req));
  for (let tries = 0; R.active.length < count && tries < count * 4; tries++) {
    const req = generate(state, R);
    if (req) R.active.push(req);
  }
  return R.active;
}

export function newRequests() {
  return { seed: (Math.random() * 4294967296) >>> 0, next: 0, done: 0, active: [] };
}

// ---------- status / text ----------

// { ready, have, need } where ready means the player can finish it right now.
export function requestStatus(state, req) {
  let have, need;
  if (req.type === 'give') { have = stock(state, req.res); need = req.amount; }
  else if (req.type === 'build') {
    have = state.buildings.filter((b) => b.type === req.b).reduce((m, b) => Math.max(m, b.level), 0);
    need = req.lv;
  } else if (req.type === 'hatch') { have = Math.min(req.n, state.stats.hatched - req.from); need = req.n; }
  else { have = state.rows; need = req.rows; }
  return { ready: have >= need, have: Math.min(have, need), need };
}

export function requestIcon(state, req) {
  if (req.type === 'give') { const p = getPet(state, req.petId); return p ? SPECIES[p.species].emoji : '🐾'; }
  if (req.type === 'build') return BUILDINGS[req.b].emoji;
  return req.type === 'hatch' ? '🥚' : '🗺️';
}

export function requestText(state, req) {
  if (req.type === 'give') {
    const p = getPet(state, req.petId);
    return `${p ? p.name : 'A neighbour'} wants ${fmt(req.amount)} ${RESOURCES[req.res].emoji}`;
  }
  if (req.type === 'build') {
    const def = BUILDINGS[req.b];
    return req.lv > 1 ? `The town wants a level-${req.lv} ${def.name}` : `The town wants a ${def.name}`;
  }
  if (req.type === 'hatch') return `The town wants ${req.n} more egg${req.n > 1 ? 's' : ''} hatched`;
  return `The town wants more room: ${req.rows} rows`;
}

// Requests that are finished by building/hatching/expanding (the player has nothing to hand over).
export function readyRequests(state) {
  return state.requests.active.filter((r) => r.type !== 'give' && requestStatus(state, r).ready);
}

// ---------- finishing ----------

export function completeRequest(state, id, rng = Math.random) {
  const req = state.requests.active.find((r) => r.id === id);
  if (!req) return { ok: false, msg: 'That request is gone.' };
  if (!requestStatus(state, req).ready) return { ok: false, msg: req.type === 'give' ? 'Not enough yet.' : 'Not finished yet.' };
  const text = requestText(state, req);
  if (req.type === 'give') state.resources[req.res] -= req.amount;
  state.requests.active = state.requests.active.filter((r) => r !== req);
  state.requests.done++;
  const hatched = payReward(state, req.reward, rng);
  emit(state, `🎁 Request done: ${text}! ${rewardText(req.reward)}`, 'great');
  ensureRequests(state);
  return { ok: true, request: req, hatched };
}

// Swap a request you don't fancy for a new one. Free, but it doesn't count as finished.
export function skipRequest(state, id) {
  const R = state.requests;
  if (!R.active.some((r) => r.id === id)) return { ok: false, msg: 'That request is gone.' };
  R.active = R.active.filter((r) => r.id !== id);
  ensureRequests(state);
  return { ok: true };
}
