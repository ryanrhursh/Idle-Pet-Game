// The weekly featured egg. One species gets a big boost in egg odds for a whole week.
// It is worked out from the date alone (UTC weeks, Monday to Monday), so it needs no server
// and everybody sees the same species at the same time.

import { CONFIG, EGGS, SPECIES } from './data.js';
import { mulberry32 } from './util.js';

export const WEEK_MS = 7 * 24 * 3600 * 1000;
const EPOCH = Date.UTC(2024, 0, 1); // a Monday

export function weekIndex(now = Date.now()) {
  return Math.floor((now - EPOCH) / WEEK_MS);
}

// Every species gets its turn once per cycle of 19 weeks, in a shuffled order that changes each cycle.
export function featuredSpecies(now = Date.now()) {
  const w = weekIndex(now);
  const ids = Object.keys(SPECIES);
  const n = ids.length;
  const rng = mulberry32(Math.floor(w / n) * 7919 + 12345);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids[((w % n) + n) % n];
}

// When the current featured species changes (ms since 1970).
export function featuredEndsAt(now = Date.now()) {
  return EPOCH + (weekIndex(now) + 1) * WEEK_MS;
}

// Chance (0..1) that one hatch of this egg gives the featured species.
// The boost works inside the species' own rarity, so a legendary can't come out of an egg that has no legendaries.
export function featuredChance(eggId, now = Date.now()) {
  const id = featuredSpecies(now);
  const rarity = SPECIES[id].rarity;
  const weights = EGGS[eggId].weights;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const pool = Object.values(SPECIES).filter((s) => s.rarity === rarity).length;
  const share = CONFIG.featuredBoost / (pool - 1 + CONFIG.featuredBoost);
  return ((weights[rarity] || 0) / total) * share;
}
