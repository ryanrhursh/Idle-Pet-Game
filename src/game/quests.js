// Goals ("quests"): a long list of milestones that guide the player and pay out rewards.
// Progress is always computed from the game state, so there is no counter to keep in sync,
// and old saves automatically get credit for what they already did.
// Claimed goals are remembered in state.quests.claimed.

import { BUILDINGS, CONFIG, EGGS, RESOURCES, SPECIES } from './data.js';
import { emit, hatch, maxLevelOf } from './sim.js';

const coinsEarned = (s) => s.stats.coinsEarned;
const owns = (type) => (s) => s.buildings.filter((b) => b.type === type).length;
const pets = (s) => s.pets.length;
const found = (s) => Object.keys(s.discovered).length;
const topBuildingLevel = (s) => s.buildings.reduce((m, b) => Math.max(m, b.level), 0);
const topPetLevel = (s) => s.pets.reduce((m, p) => Math.max(m, p.level), 0);
const homesBuilt = (s) => s.buildings.filter((b) => BUILDINGS[b.type].type === 'home').length;
const jobTypesOwned = (s) => new Set(s.buildings.filter((b) => BUILDINGS[b.type].type === 'job').map((b) => b.type)).size;
const wondersBuilt = (s) => s.buildings.filter((b) => BUILDINGS[b.type].type === 'wonder').length;
// only counts once the town has a few citizens (the two starters are happy from day 1)
const averageMood = (s) => (s.pets.length >= 6 ? s.pets.reduce((a, p) => a + p.happiness, 0) / s.pets.length : 0);
const maxedBuildings = (s) => s.buildings.filter((b) => b.level >= maxLevelOf(b)).length;
const legendaries = (s) => new Set(s.pets.filter((p) => SPECIES[p.species].rarity === 'legendary').map((p) => p.species)).size;

// [id, icon, title, description, goal, progress(state), reward]
// reward keys: coins | food | wood | treats, or an egg id (basic | golden | nest) for a free egg.
const LIST = [
  // ---- chapter 1: settling in ----
  ['market', '🏪', 'Market day', 'Build a Market Stall so the town can earn coins.', 1, owns('market'), { coins: 40, wood: 40 }],
  ['homes2', '🏠', 'Room to grow', 'Have 2 homes. Free beds attract stray pets.', 2, homesBuilt, { wood: 50 }],
  ['pets4', '🐾', 'Four friends', 'Have 4 citizens.', 4, pets, { coins: 60, food: 40 }],
  ['candy', '🏭', 'Sweet tooth', 'Build a Treat Factory. Treats hatch eggs!', 1, owns('candy'), { treats: 10 }],
  ['hatch1', '🥚', 'First hatch', 'Hatch an egg in the Hatch tab.', 1, (s) => s.stats.hatched, { coins: 100, treats: 5 }],
  ['bakery', '🥐', 'Fresh bread', 'Build a Bakery. It turns food into lots of coins.', 1, owns('bakery'), { coins: 150, wood: 80 }],
  ['garden', '🌷', 'Pretty town', 'Build a Flower Garden to cheer everyone up.', 1, owns('garden'), { wood: 120, treats: 5 }],
  ['upgrade2', '⬆️', 'Level up!', 'Upgrade any building to level 2.', 2, topBuildingLevel, { coins: 150, treats: 8 }],
  // ---- chapter 2: growing ----
  ['pets8', '🐶', 'Small town', 'Have 8 citizens.', 8, pets, { coins: 250, wood: 150, treats: 10 }],
  ['dex4', '📖', 'Collector', 'Discover 4 different species.', 4, found, { treats: 12 }],
  ['earn1k', '🪙', 'Pocket money', 'Earn 1,000 coins in total.', 1000, coinsEarned, { wood: 300, treats: 8 }],
  ['rows7', '🗺️', 'Bigger backyard', 'Expand the town to 7 rows.', 7, (s) => s.rows, { coins: 300, wood: 200 }],
  ['fountain', '⛲', 'Town square', 'Build a Fountain Plaza.', 1, owns('fountain'), { coins: 400, treats: 10 }],
  ['trades', '🧰', 'Jack of all trades', 'Own 5 kinds of workplace: Farm, Grove, Market, Bakery and Treat Factory.', 5, jobTypesOwned, { coins: 600, wood: 400, treats: 12 }],
  ['mood80', '😄', 'Happy town', 'With at least 6 citizens, get the average mood up to 80%.', 80, averageMood, { coins: 400, treats: 10 }],
  ['petlv5', '⭐', 'Rising star', 'Get a pet to level 5.', 5, topPetLevel, { treats: 10 }],
  // ---- chapter 3: thriving ----
  ['pets15', '🏘️', 'Busy streets', 'Have 15 citizens.', 15, pets, { coins: 1500, wood: 1000, basic: 1 }],
  ['dex8', '🔎', 'Pet scout', 'Discover 8 different species.', 8, found, { golden: 1 }],
  ['upgrade4', '🔨', 'Craftsmanship', 'Upgrade any building to level 4.', 4, topBuildingLevel, { coins: 1500, wood: 1000, treats: 15 }],
  ['earn25k', '💰', 'Making bank', 'Earn 25,000 coins in total.', 25000, coinsEarned, { wood: 4000, basic: 1 }],
  ['hatch10', '🐣', 'Egg enthusiast', 'Hatch 10 eggs.', 10, (s) => s.stats.hatched, { coins: 2000, basic: 2 }],
  ['rows9', '🌳', 'Sprawling town', 'Expand the town to 9 rows.', 9, (s) => s.rows, { coins: 3000, wood: 2000 }],
  ['petlv10', '🌟', 'Seasoned worker', 'Get a pet to level 10.', 10, topPetLevel, { golden: 1 }],
  ['strays5', '🧳', 'Open door', 'Welcome 5 stray pets into town.', 5, (s) => s.stats.strays, { coins: 1000, food: 500, basic: 1 }],
  // ---- chapter 4: wonders ----
  ['pets25', '🌆', 'Real city', 'Have 25 citizens.', 25, pets, { coins: 6000, wood: 4000, golden: 1 }],
  ['dex12', '📚', 'Pet expert', 'Discover 12 different species.', 12, found, { golden: 2 }],
  ['upgrade6', '🏗️', 'Master builder', 'Upgrade any building to level 6.', 6, topBuildingLevel, { coins: 8000, wood: 5000, golden: 1 }],
  ['earn250k', '🏦', 'Tycoon', 'Earn 250,000 coins in total.', 250000, coinsEarned, { wood: 20000, golden: 1 }],
  ['academy', '🎓', 'School is in', 'Build the Pet Academy.', 1, owns('academy'), { coins: 10000, golden: 1 }],
  ['hatchery', '🐣', 'Egg palace', 'Build the Grand Hatchery.', 1, owns('grandhatchery'), { coins: 15000, golden: 2 }],
  ['clock', '🕰️', 'Time well spent', 'Build the Clock Tower.', 1, owns('clocktower'), { coins: 20000, wood: 10000, golden: 2 }],
  ['rows12', '🏞️', 'Frontier', 'Expand the town to 12 rows.', 12, (s) => s.rows, { coins: 12000, wood: 8000 }],
  ['hatch30', '🪺', 'Nest builder', 'Hatch 30 eggs.', 30, (s) => s.stats.hatched, { coins: 10000, food: 5000, golden: 2 }],
  // ---- chapter 5: legends ----
  ['pets50', '🏙️', 'Metropolis', 'Have 50 citizens.', 50, pets, { coins: 40000, wood: 25000, golden: 3 }],
  ['dex16', '🧭', 'Pet master', 'Discover 16 different species.', 16, found, { golden: 3 }],
  ['petlv20', '🎖️', 'Grandmaster', 'Get a pet to level 20.', 20, topPetLevel, { golden: 3 }],
  ['upgrade8', '🔱', 'Skyscraper', 'Upgrade any building to level 8.', 8, topBuildingLevel, { coins: 60000, wood: 40000, golden: 2 }],
  ['wonders3', '🏛️', 'Wonders of Pawville', 'Build all 3 wonders.', 3, wondersBuilt, { coins: 100000, wood: 60000, golden: 3 }],
  ['earn5m', '💎', 'Fortune', 'Earn 5,000,000 coins in total.', 5000000, coinsEarned, { golden: 5 }],
  ['rows16', '🌍', 'Whole valley', 'Expand the town to 16 rows.', 16, (s) => s.rows, { coins: 100000, wood: 60000 }],
  ['legend', '🐲', 'Legend has it…', 'Have both a Dragon and a Lion living in town.', 2, legendaries, { golden: 5 }],
  ['dex19', '🏆', 'Gotta find them all', 'Discover all 19 species.', 19, found, { coins: 250000, golden: 5 }],
  // ---- chapter 6: the long game ----
  ['pets100', '🌇', 'Packed to the rafters', `Have ${CONFIG.maxPets} citizens (the town limit).`, CONFIG.maxPets, pets, { coins: 500000, wood: 300000, golden: 5 }],
  ['upgrade10', '👑', 'Pinnacle', 'Upgrade any building to level 10 (max).', 10, topBuildingLevel, { coins: 400000, wood: 250000, golden: 5 }],
  ['petlv25', '🥇', 'Living legend', 'Get a pet to the max level (25).', 25, topPetLevel, { golden: 5 }],
  ['maxed10', '🏅', 'Perfectionist', 'Get 10 buildings to max level.', 10, maxedBuildings, { coins: 2000000, wood: 1500000, golden: 10 }],
  ['earn100m', '🌈', 'Money tree', 'Earn 100,000,000 coins in total.', 100000000, coinsEarned, { golden: 10 }],
];

export const QUESTS = LIST.map(([id, icon, title, desc, goal, progress, reward]) => ({ id, icon, title, desc, goal, progress, reward }));
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function isClaimed(state, id) {
  return !!(state.quests && state.quests.claimed[id]);
}

export function questProgress(state, q) {
  return Math.min(q.goal, q.progress(state));
}

export function isComplete(state, q) {
  return q.progress(state) >= q.goal;
}

export function claimable(state) {
  return QUESTS.filter((q) => !isClaimed(state, q.id) && isComplete(state, q));
}

// The next goals to work on: unclaimed, not yet complete, in list order.
export function upcoming(state, n = 3) {
  return QUESTS.filter((q) => !isClaimed(state, q.id) && !isComplete(state, q)).slice(0, n);
}

export function questSummary(state) {
  const done = QUESTS.filter((q) => isClaimed(state, q.id)).length;
  return { done, total: QUESTS.length, ready: claimable(state).length };
}

export function rewardText(reward) {
  return Object.entries(reward).map(([k, n]) => (EGGS[k] ? `${EGGS[k].emoji}×${n} free` : `${RESOURCES[k].emoji}${n.toLocaleString('en-US')}`)).join(' ');
}

// Pays the reward. Returns the pets that hatched from free-egg rewards (so the UI can show them).
export function claimQuest(state, id, rng = Math.random) {
  const q = BY_ID[id];
  if (!q) return { ok: false, msg: 'No such goal.' };
  if (isClaimed(state, id)) return { ok: false, msg: 'Already claimed.' };
  if (!isComplete(state, q)) return { ok: false, msg: 'Not finished yet.' };
  state.quests = state.quests || { claimed: {} };
  state.quests.claimed[id] = true;
  const hatched = [];
  for (const [key, amt] of Object.entries(q.reward)) {
    if (EGGS[key]) {
      for (let i = 0; i < amt; i++) {
        const r = hatch(state, key, rng, true);
        if (r.ok) hatched.push(r);
        else state.resources.treats += EGGS[key].cost.treats || 20; // town is full: pay out treats instead
      }
    } else state.resources[key] = (state.resources[key] || 0) + amt;
  }
  emit(state, `🎁 Goal complete: ${q.title}! ${rewardText(q.reward)}`, 'great');
  return { ok: true, quest: q, hatched };
}

export function claimAll(state, rng = Math.random) {
  const quests = [], hatched = [];
  for (const q of claimable(state)) {
    const r = claimQuest(state, q.id, rng);
    if (r.ok) { quests.push(q); hatched.push(...r.hatched); }
  }
  return { quests, hatched };
}
