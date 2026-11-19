// Goals ("quests"): a long list of milestones that guide the player and pay out rewards.
// Progress is always computed from the game state, so there is no counter to keep in sync,
// and old saves automatically get credit for what they already did.
// Claimed goals are remembered in state.quests.claimed.
//
// After the hand-written list (LIST) the game never runs out of goals: ENDLESS below describes a few
// kinds of goal ("Earn X coins", "Harvest X food", ...) whose targets and rewards come from a formula,
// tier after tier, forever. Only the claimed tiers are saved, under ids like "coins:3".

import { BUILDINGS, CONFIG, EGGS, RESOURCES, SPECIES } from './data.js';
import { emit, hatch, maxLevelOf } from './sim.js';
import { fmt, nice } from './util.js';
import { bestPairs, couples, friendPairs, maxGeneration } from './social.js';

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
const shinySpecies = (s) => Object.keys(s.shinyFound || {}).length;
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
  ['friend1', '🤝', 'Better together', 'Two pets who share a home or a job become friends. Chemistry matters: check what each trait likes on a pet\'s page.', 1, (s) => friendPairs(s), { coins: 300, treats: 8 }],
  ['pets8', '🐶', 'Small town', 'Have 8 citizens.', 8, pets, { coins: 250, wood: 150, treats: 10 }],
  ['dex4', '📖', 'Collector', 'Discover 4 different species.', 4, found, { treats: 12 }],
  ['earn1k', '🪙', 'Pocket money', 'Earn 1,000 coins in total.', 1000, coinsEarned, { wood: 300, treats: 8 }],
  ['rows7', '🗺️', 'Bigger backyard', 'Expand the town to 7 rows.', 7, (s) => s.rows, { coins: 300, wood: 200 }],
  ['fountain', '⛲', 'Town square', 'Build a Fountain Plaza.', 1, owns('fountain'), { coins: 400, treats: 10 }],
  ['trades', '🧰', 'Jack of all trades', 'Own 5 kinds of workplace: Farm, Grove, Market, Bakery and Treat Factory.', 5, jobTypesOwned, { coins: 600, wood: 400, treats: 12 }],
  ['mood80', '😄', 'Happy town', 'With at least 6 citizens, get the average mood up to 80%.', 80, averageMood, { coins: 400, treats: 10 }],
  ['petlv5', '⭐', 'Rising star', 'Get a pet to level 5.', 5, topPetLevel, { treats: 10 }],
  // ---- chapter 3: thriving ----
  ['best1', '💖', 'Best buddies', 'Get a pair of best friends.', 1, (s) => bestPairs(s), { coins: 1500, treats: 15 }],
  ['pets15', '🏘️', 'Busy streets', 'Have 15 citizens.', 15, pets, { coins: 1500, wood: 1000, basic: 1 }],
  ['dex8', '🔎', 'Pet scout', 'Discover 8 different species.', 8, found, { golden: 1 }],
  ['upgrade4', '🔨', 'Craftsmanship', 'Upgrade any building to level 4.', 4, topBuildingLevel, { coins: 1500, wood: 1000, treats: 15 }],
  ['earn25k', '💰', 'Making bank', 'Earn 25,000 coins in total.', 25000, coinsEarned, { wood: 4000, basic: 1 }],
  ['hatch10', '🐣', 'Egg enthusiast', 'Hatch 10 eggs.', 10, (s) => s.stats.hatched, { coins: 2000, basic: 2 }],
  ['rows9', '🌳', 'Sprawling town', 'Expand the town to 9 rows.', 9, (s) => s.rows, { coins: 3000, wood: 2000 }],
  ['petlv10', '🌟', 'Seasoned worker', 'Get a pet to level 10.', 10, topPetLevel, { golden: 1 }],
  ['strays5', '🧳', 'Open door', 'Welcome 5 stray pets into town.', 5, (s) => s.stats.strays, { coins: 1000, food: 500, basic: 1 }],
  // ---- chapter 4: wonders ----
  ['partner1', '💞', 'Love is in the air', 'Two best friends become partners.', 1, (s) => couples(s), { golden: 1 }],
  ['baby1', '👶', 'A new arrival', 'A couple welcomes a baby. They need a free bed, food and good moods.', 1, (s) => s.stats.born || 0, { golden: 2 }],
  ['pets25', '🌆', 'Real city', 'Have 25 citizens.', 25, pets, { coins: 6000, wood: 4000, golden: 1 }],
  ['dex12', '📚', 'Pet expert', 'Discover 12 different species.', 12, found, { golden: 2 }],
  ['upgrade6', '🏗️', 'Master builder', 'Upgrade any building to level 6.', 6, topBuildingLevel, { coins: 8000, wood: 5000, golden: 1 }],
  ['earn250k', '🏦', 'Tycoon', 'Earn 250,000 coins in total.', 250000, coinsEarned, { wood: 20000, golden: 1 }],
  ['academy', '🎓', 'School is in', 'Build the Pet Academy.', 1, owns('academy'), { coins: 10000, golden: 1 }],
  ['hatchery', '🐣', 'Egg palace', 'Build the Grand Hatchery.', 1, owns('grandhatchery'), { coins: 15000, golden: 2 }],
  ['clock', '🕰️', 'Time well spent', 'Build the Clock Tower.', 1, owns('clocktower'), { coins: 20000, wood: 10000, golden: 2 }],
  ['rows12', '🏞️', 'Frontier', 'Expand the town to 12 rows.', 12, (s) => s.rows, { coins: 12000, wood: 8000 }],
  ['hatch30', '🪺', 'Nest builder', 'Hatch 30 eggs.', 30, (s) => s.stats.hatched, { coins: 10000, food: 5000, golden: 2 }],
  ['shiny1', '✨', 'Something sparkly', 'Hatch a shiny pet. About 1 egg in 30 holds one (a bit better in Golden Eggs).', 1, shinySpecies, { golden: 2 }],
  // ---- chapter 5: legends ----
  ['couples5', '💒', 'Matchmaker', 'Have 5 couples in town.', 5, (s) => couples(s), { coins: 20000, wood: 12000, golden: 3 }],
  ['gen3', '🌳', 'Three generations', 'A grandchild is born: three generations in one family tree.', 3, (s) => maxGeneration(s), { golden: 4 }],
  ['pets50', '🏙️', 'Metropolis', 'Have 50 citizens.', 50, pets, { coins: 40000, wood: 25000, golden: 3 }],
  ['dex16', '🧭', 'Pet master', 'Discover 16 different species.', 16, found, { golden: 3 }],
  ['petlv20', '🎖️', 'Grandmaster', 'Get a pet to level 20.', 20, topPetLevel, { golden: 3 }],
  ['upgrade8', '🔱', 'Skyscraper', 'Upgrade any building to level 8.', 8, topBuildingLevel, { coins: 60000, wood: 40000, golden: 2 }],
  ['wonders3', '🏛️', 'Wonders of Pawville', 'Build all 3 wonders.', 3, wondersBuilt, { coins: 100000, wood: 60000, golden: 3 }],
  ['earn5m', '💎', 'Fortune', 'Earn 5,000,000 coins in total.', 5000000, coinsEarned, { golden: 5 }],
  ['rows16', '🌍', 'Whole valley', 'Expand the town to 16 rows.', 16, (s) => s.rows, { coins: 100000, wood: 60000 }],
  ['shiny2', '🌈', 'Glitter gang', 'Find 2 different shiny species.', 2, shinySpecies, { golden: 3 }],
  ['legend', '🐲', 'Legend has it…', 'Have both a Dragon and a Lion living in town.', 2, legendaries, { golden: 5 }],
  ['dex19', '🏆', 'Gotta find them all', 'Discover all 19 species.', 19, found, { coins: 250000, golden: 5 }],
  ['shiny3', '💫', 'Shiny collector', 'Find 3 different shiny species.', 3, shinySpecies, { coins: 300000, golden: 5 }],
  ['shiny5', '🌠', 'Shiny hunter', 'Find 5 different shiny species. Retire pets to the Meadow to make room for more eggs.', 5, shinySpecies, { coins: 600000, golden: 6 }],
  // ---- chapter 6: the long game ----
  ['gen5', '🏛️', 'Family dynasty', 'Reach the fifth generation of a family.', 5, (s) => maxGeneration(s), { coins: 200000, golden: 6 }],
  ['pets100', '🌇', 'Packed to the rafters', `Have ${CONFIG.maxPets} citizens (the town limit).`, CONFIG.maxPets, pets, { coins: 500000, wood: 300000, golden: 5 }],
  ['upgrade10', '👑', 'Pinnacle', 'Upgrade any building to level 10 (max).', 10, topBuildingLevel, { coins: 400000, wood: 250000, golden: 5 }],
  ['petlv25', '🥇', 'Living legend', 'Get a pet to the max level (25).', 25, topPetLevel, { golden: 5 }],
  ['maxed10', '🏅', 'Perfectionist', 'Get 10 buildings to max level.', 10, maxedBuildings, { coins: 2000000, wood: 1500000, golden: 10 }],
  ['earn100m', '🌈', 'Money tree', 'Earn 100,000,000 coins in total.', 100000000, coinsEarned, { golden: 10 }],
];

export const QUESTS = LIST.map(([id, icon, title, desc, goal, progress, reward]) => ({ id, icon, title, desc, goal, progress, reward }));
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// ---------- endless goals ----------
// tier t = 1, 2, 3, ... Each kind has a goal formula, a reward formula and a hand-written goal that must be
// claimed first (so the endless ones take over from the list chapter by chapter). Targets grow geometrically.
// Only measures that can keep growing are used: the town is capped at 100 citizens, 19 species, 16 rows
// and building level 10, so goals about those can't go on forever (Town Requests cover them instead).

const grow = (base, mul, t) => nice(base * Math.pow(mul, t - 1));
const eggs = (start, cap) => (t) => Math.min(cap, start + t);
const dayNumber = (s) => Math.floor(s.time / CONFIG.dayLength) + 1;

export const ENDLESS = [
  {
    kind: 'coins', icon: '🪙', after: 'earn100m', progress: coinsEarned,
    names: ['Gold rush', 'Coin cascade', 'Treasure vault', 'Dragon hoard', 'Money mountain', 'Golden age'],
    goal: (t) => grow(4e8, 4, t),
    desc: (g) => `Earn ${fmt(g)} coins in total.`,
    reward: (t, g) => ({ coins: nice(g * 0.015), wood: nice(g * 0.01), golden: eggs(4, 10)(t) }),
  },
  {
    kind: 'wood', icon: '🪵', after: 'earn250k', progress: (s) => s.stats.woodEarned || 0,
    names: ['Timber tycoon', 'Lumberjack legend', 'Forest baron', 'Sawdust storm', 'Great grove'],
    goal: (t) => grow(2e5, 4, t),
    desc: (g) => `Chop ${fmt(g)} wood in total.`,
    reward: (t, g) => ({ coins: nice(g * 0.1), wood: nice(g * 0.05), golden: eggs(1, 8)(t) }),
  },
  {
    kind: 'food', icon: '🍎', after: 'pets15', progress: (s) => s.stats.foodEarned || 0,
    names: ['Harvest festival', 'Berry bonanza', 'Bountiful barns', 'Feast of Pawville', 'Never hungry'],
    goal: (t) => grow(3e5, 4, t),
    desc: (g) => `Harvest ${fmt(g)} food in total.`,
    reward: (t, g) => ({ coins: nice(g * 0.1), food: nice(g * 0.05), golden: eggs(1, 8)(t) }),
  },
  {
    kind: 'treats', icon: '🍬', after: 'hatch10', progress: (s) => s.stats.treatsEarned || 0,
    names: ['Sweet streak', 'Candy cascade', 'Sugar rush', 'Confection kingdom', 'Treat tornado'],
    goal: (t) => grow(500, 3, t),
    desc: (g) => `Make ${fmt(g)} treats in total.`,
    reward: (t, g) => ({ treats: nice(g * 0.2), golden: eggs(1, 8)(t) }),
  },
  {
    kind: 'hatched', icon: '🐣', after: 'hatch30', progress: (s) => s.stats.hatched,
    names: ['Egg factory', 'Hatchery boss', 'Nest empire', 'Eggs everywhere'],
    goal: (t) => grow(60, 1.5, t),
    desc: (g) => `Hatch ${fmt(g)} eggs in total. Each egg costs more, and the Meadow frees room for the pets.`,
    reward: (t, g) => ({ coins: nice(g * 300), food: nice(g * 150), golden: eggs(1, 8)(t) }),
  },
  {
    kind: 'shinies', icon: '🌟', after: 'shiny3', progress: (s) => s.stats.shinies || 0,
    names: ['Glitter rush', 'Sparkle storm', 'Shiny shower', 'Starlight stable'],
    goal: (t) => grow(4, 1.7, t),
    desc: (g) => `Hatch ${fmt(g)} shiny pets in total (they can be the same species).`,
    reward: (t, g) => ({ coins: nice(g * 20000), treats: nice(g * 50), golden: eggs(2, 8)(t) }),
  },
  {
    kind: 'born', icon: '👶', after: 'baby1', progress: (s) => s.stats.born || 0,
    names: ['Baby boom', 'Crowded cradles', 'Nursery town', 'Pitter-patter'],
    goal: (t) => grow(5, 2, t),
    desc: (g) => `Welcome ${fmt(g)} babies in total.`,
    reward: (t, g) => ({ treats: nice(g * 20), coins: nice(g * 30000), golden: eggs(1, 8)(t) }),
  },
  {
    kind: 'gens', icon: '🌳', after: 'gen5', progress: (s) => maxGeneration(s),
    names: ['Roots and branches', 'Ancient lineage', 'Family forest', 'Legacy'],
    goal: (t) => 5 + 2 * t,
    desc: (g) => `Raise a family ${fmt(g)} generations deep.`,
    reward: (t, g) => ({ coins: g * 50000, treats: g * 40, golden: eggs(2, 8)(t) }), // linear goal, so no rounding (it would make neighbouring tiers equal)
  },
  {
    kind: 'requests', icon: '📮', after: 'pets8', progress: (s) => (s.requests ? s.requests.done : 0),
    names: ['Helping paw', 'Good neighbour', 'Pillar of the town', 'Town hero', 'Beloved mayor'],
    goal: (t) => grow(10, 2.5, t),
    desc: (g) => `Finish ${fmt(g)} Town Requests.`,
    reward: (t, g) => ({ treats: nice(g * 10), coins: nice(g * 4000), golden: eggs(0, 8)(t) }),
  },
  {
    kind: 'days', icon: '📅', after: 'pets25', progress: dayNumber,
    names: ['Town elder', 'Old Pawville', 'Timeless town', 'Evergreen village'],
    goal: (t) => grow(1000, 1.5, t),
    desc: (g) => `Keep the town going until day ${fmt(g)}.`,
    reward: (t, g) => ({ coins: nice(g * 2000), wood: nice(g * 1000), golden: eggs(1, 6)(t) }),
  },
];
const KIND = Object.fromEntries(ENDLESS.map((k) => [k.kind, k]));

// The goal for one tier of one kind (tier 1, 2, 3, ...). Built on demand: nothing is stored.
export function endlessQuest(kind, tier) {
  const k = KIND[kind];
  const goal = k.goal(tier);
  const cycle = Math.floor((tier - 1) / k.names.length);
  return {
    id: `${kind}:${tier}`, kind, tier, endless: true, icon: k.icon,
    title: `${k.names[(tier - 1) % k.names.length]}${cycle ? ` ${cycle + 1}` : ''} #${tier}`,
    desc: k.desc(goal), goal, progress: k.progress, reward: k.reward(tier, goal),
  };
}

function questById(id) {
  if (BY_ID[id]) return BY_ID[id];
  const m = /^([a-z]+):(\d+)$/.exec(id);
  return m && KIND[m[1]] && +m[2] >= 1 ? endlessQuest(m[1], +m[2]) : null;
}

export function isClaimed(state, id) {
  return !!(state.quests && state.quests.claimed[id]);
}

// The next unclaimed tier of each kind whose hand-written lead-in has been claimed.
export function currentEndless(state) {
  const out = [];
  for (const k of ENDLESS) {
    if (!isClaimed(state, k.after)) continue;
    let t = 1;
    while (isClaimed(state, `${k.kind}:${t}`)) t++;
    out.push(endlessQuest(k.kind, t));
  }
  return out;
}

export function questProgress(state, q) {
  return Math.min(q.goal, q.progress(state));
}

export function isComplete(state, q) {
  return q.progress(state) >= q.goal;
}

export function claimable(state) {
  return [...QUESTS, ...currentEndless(state)].filter((q) => !isClaimed(state, q.id) && isComplete(state, q));
}

// The next goals to work on. Hand-written goals come first, in list order; endless goals follow, the
// ones closest to done first. With room for several, the endless ones get at least two places.
export function upcoming(state, n = 3) {
  const hand = QUESTS.filter((q) => !isClaimed(state, q.id) && !isComplete(state, q));
  const frac = (q) => q.progress(state) / q.goal;
  const endless = currentEndless(state).filter((q) => !isComplete(state, q)).sort((a, b) => frac(b) - frac(a));
  const handSlots = Math.max(n - Math.min(2, endless.length), 1);
  return [...hand.slice(0, handSlots), ...endless, ...hand.slice(handSlots)].slice(0, n);
}

export function questSummary(state) {
  const claimed = Object.keys((state.quests && state.quests.claimed) || {});
  const endless = claimed.filter((id) => id.includes(':')).length;
  return { done: claimed.length - endless, total: QUESTS.length, endless, ready: claimable(state).length };
}

const amount = (n) => (n >= 1e4 ? fmt(n) : n.toLocaleString('en-US'));

export function rewardText(reward) {
  return Object.entries(reward).map(([k, n]) => (EGGS[k] ? `${EGGS[k].emoji}×${n} free` : `${RESOURCES[k].emoji}${amount(n)}`)).join(' ');
}

// Pays a reward (resources, or free eggs that hatch at once). Returns the hatches, so the UI can show them.
export function payReward(state, reward, rng = Math.random) {
  const hatched = [];
  for (const [key, amt] of Object.entries(reward)) {
    if (EGGS[key]) {
      for (let i = 0; i < amt; i++) {
        const r = hatch(state, key, rng, true);
        if (r.ok) hatched.push(r);
        else state.resources.treats += EGGS[key].cost.treats || 20; // town is full: pay out treats instead
      }
    } else state.resources[key] = (state.resources[key] || 0) + amt;
  }
  return hatched;
}

export function claimQuest(state, id, rng = Math.random) {
  const q = questById(id);
  if (!q) return { ok: false, msg: 'No such goal.' };
  if (isClaimed(state, id)) return { ok: false, msg: 'Already claimed.' };
  if (q.endless && !currentEndless(state).some((c) => c.id === id)) return { ok: false, msg: 'Not unlocked yet.' };
  if (!isComplete(state, q)) return { ok: false, msg: 'Not finished yet.' };
  state.quests = state.quests || { claimed: {} };
  state.quests.claimed[id] = true;
  const hatched = payReward(state, q.reward, rng);
  emit(state, `🎁 Goal complete: ${q.title}! ${rewardText(q.reward)}`, 'great');
  return { ok: true, quest: q, hatched };
}

// Claims everything that is ready. A finished endless tier unlocks the next one, which may be done too, so keep going.
export function claimAll(state, rng = Math.random) {
  const quests = [], hatched = [];
  for (let round = 0; round < 500; round++) {
    const ready = claimable(state);
    if (!ready.length) break;
    for (const q of ready) {
      const r = claimQuest(state, q.id, rng);
      if (r.ok) { quests.push(q); hatched.push(...r.hatched); }
    }
  }
  return { quests, hatched };
}
