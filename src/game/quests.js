// Goals and the "town advisor". Pure functions over the game state, no rendering.
// Quest definitions live in data.js; this file works out progress, hands out
// rewards, and spots the situations that leave players stuck.

import { BUILDINGS, CONFIG, QUESTS, RARITIES, RESOURCES, SPECIES } from './data.js';
import {
  canAfford, eggCost, emit, expandCost, feedCost, freeHomeSlots, netRates, upgradeCost, workersOf, jobSlots,
} from './sim.js';

const RARITY_RANK = Object.keys(RARITIES); // common .. legendary, in order
export const VISIBLE_QUESTS = 3;

export function ensureQuestState(state) {
  state.quests = { claimed: {}, seen: {}, ...state.quests };
  return state.quests;
}

// ---------- progress ----------

export function questProgress(state, quest) {
  const c = quest.check;
  let cur = 0;
  switch (c.type) {
    case 'building': cur = state.buildings.filter((b) => b.type === c.building).length; break;
    case 'kind': cur = state.buildings.filter((b) => BUILDINGS[b.type].type === c.kind).length; break;
    case 'buildings': cur = state.buildings.length; break;
    case 'pets': cur = state.pets.length; break;
    case 'employed': cur = state.pets.filter((p) => p.jobId != null).length; break;
    case 'species': cur = Object.keys(state.discovered).length; break;
    case 'rarity': {
      const min = RARITY_RANK.indexOf(c.rarity);
      cur = state.pets.filter((p) => RARITY_RANK.indexOf(SPECIES[p.species].rarity) >= min).length;
      break;
    }
    case 'hatched': cur = state.stats.hatched; break;
    case 'level': cur = state.buildings.filter((b) => b.level >= c.level).length; break;
    case 'petLevel': cur = state.pets.reduce((m, p) => Math.max(m, p.level), 0); break;
    case 'rows': cur = state.rows; break;
    case 'happy': cur = state.pets.filter((p) => p.happiness >= 80).length; break;
    case 'coins': cur = state.stats.coinsEarned; break;
    default: cur = 0;
  }
  const goal = c.n;
  return { cur: Math.min(cur, goal), goal, done: cur >= goal };
}

export function describeQuest(quest) {
  const c = quest.check;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  switch (c.type) {
    case 'building': return c.n === 1 ? `Build a ${BUILDINGS[c.building].name}` : `Own ${c.n} × ${BUILDINGS[c.building].name}`;
    case 'kind': return `Own ${c.n} ${{ home: 'homes', job: 'workplaces', decor: 'decorations' }[c.kind]}`;
    case 'buildings': return `Have ${c.n} buildings in town`;
    case 'pets': return `Have ${c.n} citizens`;
    case 'employed': return `Have ${c.n} pets with a job`;
    case 'species': return `Discover ${c.n} species`;
    case 'rarity': return `Own ${c.n === 1 ? 'a' : c.n} ${RARITIES[c.rarity].name.toLowerCase()} (or better) pet${c.n === 1 ? '' : 's'}`;
    case 'hatched': return `Hatch ${plural(c.n, 'egg', 'eggs')}`;
    case 'level': return c.n === 1 ? `Upgrade a building to level ${c.level}` : `Get ${c.n} buildings to level ${c.level}`;
    case 'petLevel': return `Raise a pet to level ${c.n}`;
    case 'rows': return `Expand your town to ${c.n} rows`;
    case 'happy': return `Have ${c.n} pets at 80%+ happiness`;
    case 'coins': return `Earn ${c.n.toLocaleString('en-US')} coins in total`;
    default: return quest.title;
  }
}

export function rewardText(reward) {
  return Object.entries(reward).map(([r, n]) => `${RESOURCES[r].emoji}${n.toLocaleString('en-US')}`).join(' ');
}

// ---------- the quest list ----------

export const isClaimed = (state, q) => !!state.quests?.claimed?.[q.id];

// The next few unclaimed goals, in order.
export function activeQuests(state, n = VISIBLE_QUESTS) {
  return QUESTS.filter((q) => !isClaimed(state, q)).slice(0, n);
}

export function questTotals(state) {
  return { claimed: QUESTS.filter((q) => isClaimed(state, q)).length, total: QUESTS.length };
}

export const claimableQuests = (state) => activeQuests(state).filter((q) => questProgress(state, q).done);

export function claimQuest(state, id) {
  ensureQuestState(state);
  const quest = QUESTS.find((q) => q.id === id);
  if (!quest) return { ok: false, msg: 'No such goal.' };
  if (isClaimed(state, quest)) return { ok: false, msg: 'Already claimed.' };
  if (!questProgress(state, quest).done) return { ok: false, msg: 'Not finished yet.' };
  state.quests.claimed[id] = true;
  for (const [res, amt] of Object.entries(quest.reward)) state.resources[res] = (state.resources[res] || 0) + amt;
  emit(state, `🎯 Goal complete: ${quest.title}! ${rewardText(quest.reward)}`, 'great');
  return { ok: true, quest };
}

// Claim everything that is finished (claiming can reveal the next goal, which
// may already be done, e.g. for a veteran save), up to a safety limit.
export function claimAll(state) {
  const claimed = [];
  for (let i = 0; i < QUESTS.length; i++) {
    const q = claimableQuests(state)[0];
    if (!q) break;
    claimQuest(state, q.id);
    claimed.push(q);
  }
  return claimed;
}

// Goals that became finished since we last looked (used for a "goal complete" toast).
export function newlyFinished(state) {
  ensureQuestState(state);
  const fresh = claimableQuests(state).filter((q) => !state.quests.seen[q.id]);
  for (const q of fresh) state.quests.seen[q.id] = true;
  return fresh;
}

// ---------- the advisor ----------
// Plain-language nudges about what is holding the town back right now.

export function advice(state) {
  const tips = [];
  const net = netRates(state);
  const pets = state.pets;
  const has = (type) => state.buildings.some((b) => b.type === type);
  const add = (icon, text, tab) => tips.push({ icon, text, tab });

  if (state.starving) add('🍎', 'Your pets are hungry! Put more pets to work at a Berry Farm.', 'pets');
  if (pets.length && net.coins < 0.5) add('🪙', 'Almost no coin income. Put a pet to work at a Market Stall or Bakery.', 'build');
  if (pets.length && net.wood < 0.3) add('🪵', 'Almost no wood income. Put a pet to work at the Lumber Grove.', 'build');

  const homeless = pets.filter((p) => p.homeId == null).length;
  if (homeless) add('🏚️', `${homeless} pet${homeless === 1 ? ' has' : 's have'} no home. Build or upgrade a home so they are happy and productive.`, 'build');
  else if (freeHomeSlots(state) <= 0) add('🛏️', 'No free beds. Stray pets only move in when there is an empty bed, so build or upgrade a home.', 'build');

  const openJobs = state.buildings.reduce((n, b) => n + Math.max(0, jobSlots(b) - workersOf(state, b.id).length), 0);
  const jobless = pets.filter((p) => p.jobId == null).length;
  if (jobless && openJobs === 0) add('💤', `${jobless} pet${jobless === 1 ? ' has' : 's have'} no job. Build or upgrade a workplace.`, 'build');
  else if (jobless) add('💤', `${jobless} pet${jobless === 1 ? ' is' : 's are'} jobless but there are open jobs. Tap "Auto-assign" in the Pets tab.`, 'pets');

  if (!has('candy')) add('🍬', 'Build a Treat Factory to turn spare food into treats for hatching eggs.', 'build');
  else if (!state.buildings.some((b) => b.type === 'candy' && workersOf(state, b.id).length)) add('🍬', 'Your Treat Factory has no workers, so no treats are being made.', 'pets');

  if (canAfford(state, eggCost(state, 'basic'))) add('🥚', 'You can afford an egg! New pets mean more output and new species.', 'hatch');

  const ups = state.buildings.filter((b) => b.level < CONFIG.maxBuildingLevel && canAfford(state, upgradeCost(state, b)));
  if (ups.length) add('⬆️', `You can afford ${ups.length} building upgrade${ups.length === 1 ? '' : 's'}: more beds, jobs and output.`, 'build');
  if (state.rows < CONFIG.maxRows && canAfford(state, expandCost(state))) add('🗺️', 'You can afford more land. Expand the town to fit more buildings.', 'build');
  const cheapestFeed = pets.map(feedCost).filter((c) => c != null).sort((a, b) => a - b)[0];
  if (cheapestFeed != null && state.resources.food >= Math.max(cheapestFeed, 200)) add('🍎', 'Spare food? Feed your pets (Pets tab → Feed all) to level them up instantly.', 'pets');

  return tips;
}
