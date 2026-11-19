// Pet relationships. Nothing here needs the player: pets bond on their own.
//
//  * Bonds: pets who share a home or a job grow closer (or clash) depending on CHEMISTRY (trait likes and
//    clashes, same species). Bonds run -100..100 and are stored on each pet: pet.bonds = { otherId: value }.
//    Pets who are apart drift back towards 0. Levels: friend 25, best friend 60, partner 75, rival -40.
//  * Effects: friends and best friends cheer each other up and help at work; rivals sharing a home or a
//    workplace get grumpy and slow each other down. (The effects are cached per pet in sim's socialCache.)
//  * Partners: two grown-up best friends who aren't related pair off (pet.partnerId).
//  * Families: partners who have a free bed, food and good moods have babies now and then. A baby has a
//    species and trait from its parents, is a kid for a few days (no job, half the food, small in 3D), and
//    carries pet.parents and pet.gen so the whole family tree can be shown.
//
// Importing this file registers the social update on sim's tick, so the game, the offline catch-up and the
// balance bot all get it. Retired pets (the Meadow) keep their bonds and family.

import { CONFIG, SOCIAL, TRAITS } from './data.js';
import {
  autoAssignPet, createPet, emit, freeHomeSlots, getBuilding, homeCapacity, makeShiny, petLabel, residentsOf,
  socialCache, tickHooks,
} from './sim.js';

// ---------- lookups ----------

export const everyone = (state) => [...state.pets, ...(state.meadow || [])];
export const findAnyPet = (state, id) => state.pets.find((p) => p.id === id) || (state.meadow || []).find((p) => p.id === id) || null;
export const bondBetween = (a, b) => (a.bonds && a.bonds[b.id]) || 0;

// Parent and child, or siblings. (Partners must not be related.)
export function related(a, b) {
  const pa = a.parents || [], pb = b.parents || [];
  return pa.includes(b.id) || pb.includes(a.id) || pa.some((x) => pb.includes(x));
}

export function childrenOf(state, pet) {
  return everyone(state).filter((p) => (p.parents || []).includes(pet.id));
}

// ---------- chemistry ----------

// -2 .. 3. Traits that like each other, friendly traits and a shared species all help.
export function chemistry(a, b) {
  const ta = TRAITS[a.trait], tb = TRAITS[b.trait];
  let c = 0;
  const view = (t, other) => { if ((t.likes || []).includes(other)) c++; if ((t.clash || []).includes(other)) c--; };
  view(ta, b.trait);
  view(tb, a.trait);
  if (ta.warm || tb.warm) c++;
  if (a.species === b.species) c++;
  return Math.max(-2, Math.min(3, c));
}

// For the UI: "Likes Hard Worker, Quick Learner · Clashes with Sleepy".
export function likesText(traitId) {
  const t = TRAITS[traitId];
  const names = (ids) => (ids || []).map((id) => TRAITS[id].name).join(', ');
  return { likes: names(t.likes), clash: names(t.clash), warm: !!t.warm };
}

export function bondLevel(v) {
  if (v >= SOCIAL.best) return 'best';
  if (v >= SOCIAL.friend) return 'friend';
  if (v <= SOCIAL.rival) return 'rival';
  return 'know';
}

// ---------- bonds ----------

function setBond(a, b, v) {
  v = Math.max(-100, Math.min(100, Math.round(v * 10) / 10));
  a.bonds = a.bonds || {};
  b.bonds = b.bonds || {};
  if (Math.abs(v) < 0.5) { delete a.bonds[b.id]; delete b.bonds[a.id]; }
  else { a.bonds[b.id] = v; b.bonds[a.id] = v; }
}

// Keep each pet's list short: the 12 strongest bonds (positive or negative).
function trim(pet) {
  const keys = Object.keys(pet.bonds || {});
  if (keys.length <= 12) return;
  keys.sort((x, y) => Math.abs(pet.bonds[y]) - Math.abs(pet.bonds[x]));
  for (const k of keys.slice(12)) delete pet.bonds[k];
}

// Log a line without a toast (small social news).
function note(state, msg, kind = 'info') {
  state.log.unshift({ msg, kind, t: state.time });
  if (state.log.length > 50) state.log.length = 50;
}

// ---------- the update ----------

function socialTick(state, dt, rng) {
  state.socialClock = (state.socialClock || 0) + dt;
  if (state.socialClock < SOCIAL.step) return;
  const span = state.socialClock;
  state.socialClock = 0;
  socialStep(state, span, rng);
}
tickHooks.push(socialTick);

export function socialStep(state, span, rng = Math.random) {
  const town = state.pets;
  const inTown = new Map(town.map((p) => [p.id, p]));
  const all = new Map(everyone(state).map((p) => [p.id, p]));
  const touched = new Set();
  let announced = 0;

  // 1. pets who share a home or a job grow closer, or clash
  const groups = new Map();
  for (const p of town) {
    for (const key of [p.homeId != null && `h${p.homeId}`, p.jobId != null && `j${p.jobId}`]) {
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
  }
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        touched.add(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
        const c = chemistry(a, b);
        let rate = c >= 0 ? SOCIAL.rate * (c + 1) : SOCIAL.rate * c;
        const kin = related(a, b);
        if (kin) rate = Math.max(rate, SOCIAL.rate * 2); // family stays close
        const before = bondBetween(a, b);
        // chemistry sets how far a bond can grow: 0-1 = friends, 2 = best friends and partner material, 3 = soulmates
        if (rate > 0 && !kin && before >= Math.min(100, 35 + 20 * c)) continue;
        setBond(a, b, before + rate * span);
        const after = bondBetween(a, b);
        if (before < SOCIAL.friend && after >= SOCIAL.friend) note(state, `🤝 ${petLabel(a)} and ${petLabel(b)} became friends.`, 'good');
        if (before < SOCIAL.best && after >= SOCIAL.best && announced++ < 2) emit(state, `💖 ${petLabel(a)} and ${petLabel(b)} are best friends now!`, 'good');
        if (before > SOCIAL.rival && after <= SOCIAL.rival) note(state, `💢 ${petLabel(a)} and ${petLabel(b)} can't stand each other. Try different homes or jobs.`, 'bad');
      }
    }
  }

  // 2. pets who are apart drift back towards 0 (partners and family keep their bond)
  for (const a of town) {
    for (const [key, v] of Object.entries(a.bonds || {})) {
      const b = all.get(+key);
      if (!b) { delete a.bonds[key]; continue; }
      if (inTown.has(b.id) && a.id > b.id) continue; // handled from the other side
      if (touched.has(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`)) continue;
      if (a.partnerId === b.id) continue;
      let nv = v > 0 ? Math.max(0, v - SOCIAL.decay * span) : Math.min(0, v + SOCIAL.decay * span);
      if (related(a, b)) nv = Math.max(nv, 30);
      setBond(a, b, nv);
    }
    trim(a);
  }

  // 3. best friends who are grown up and not related pair off
  const pairs = [];
  for (const a of town) {
    if (a.kid || a.partnerId != null) continue;
    for (const [key, v] of Object.entries(a.bonds || {})) {
      const b = inTown.get(+key);
      if (b && a.id < b.id && v >= SOCIAL.partner && !b.kid && b.partnerId == null && !related(a, b)) pairs.push([v, a, b]);
    }
  }
  pairs.sort((x, y) => y[0] - x[0]);
  for (const [, a, b] of pairs) {
    if (a.partnerId != null || b.partnerId != null) continue;
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.partnerSince = b.partnerSince = state.time;
    emit(state, `💞 ${petLabel(a)} and ${petLabel(b)} became partners!`, 'great');
  }

  // 4. kids grow up
  for (const p of town) {
    if (p.kid && state.time - (p.born || 0) >= SOCIAL.kidSeconds) {
      p.kid = false;
      if (state.settings.autoAssign) autoAssignPet(state, p);
      emit(state, `🎓 ${petLabel(p)} grew up and can work now!`, 'good');
    }
  }

  // 5. couples have babies
  for (const a of [...town]) {
    const b = a.partnerId != null && a.id < a.partnerId ? inTown.get(a.partnerId) : null;
    if (!b || a.kid || b.kid) continue;
    maybeBirth(state, a, b, rng);
  }

  recompute(state);
}

function maybeBirth(state, a, b, rng) {
  // the first baby comes a few days after a couple forms, later ones after the longer cooldown
  const first = a.lastBirth == null && b.lastBirth == null;
  const last = Math.max(a.lastBirth ?? a.partnerSince ?? 0, b.lastBirth ?? b.partnerSince ?? 0);
  if (state.time - last < (first ? SOCIAL.kidSeconds : SOCIAL.birthCooldown)) return false;
  if (state.pets.length >= CONFIG.maxPets || freeHomeSlots(state) <= 0 || state.starving) return false;
  if (a.happiness < 55 || b.happiness < 55) return false;
  if (childrenOf(state, a).filter((k) => (k.parents || []).includes(b.id)).length >= SOCIAL.maxKids) return false;
  if (rng() >= SOCIAL.birthChance) return false;
  return !!haveBaby(state, a, b, rng);
}

// A baby for two pets. The species comes from one parent, the trait from either or at random, and a shiny
// parent makes a shiny baby much more likely. Returns the new pet.
export function haveBaby(state, a, b, rng = Math.random) {
  const species = rng() < 0.5 ? a.species : b.species;
  const { pet: kid } = createPet(state, species, rng);
  const roll = rng();
  if (roll < 0.35) kid.trait = a.trait;
  else if (roll < 0.7) kid.trait = b.trait;
  kid.kid = true;
  kid.born = state.time;
  kid.parents = [a.id, b.id];
  kid.gen = Math.max(a.gen || 1, b.gen || 1) + 1;
  const shinyChance = a.shiny || b.shiny ? 0.12 : CONFIG.shinyChance / 3;
  if (rng() < shinyChance) makeShiny(state, kid);
  a.lastBirth = b.lastBirth = state.time;
  state.stats.born = (state.stats.born || 0) + 1;
  // a bed with the parents if there is one
  for (const parent of [a, b]) {
    const home = parent.homeId != null ? getBuilding(state, parent.homeId) : null;
    if (kid.homeId == null && home && residentsOf(state, home.id).length < homeCapacity(home)) kid.homeId = home.id;
  }
  if (kid.homeId == null && state.settings.autoAssign) autoAssignPet(state, kid);
  // family bonds
  setBond(kid, a, 60);
  setBond(kid, b, 60);
  for (const sib of childrenOf(state, a)) if (sib.id !== kid.id && (sib.parents || []).includes(b.id)) setBond(kid, sib, 40);
  emit(state, `👶 ${petLabel(a)} and ${petLabel(b)} welcomed a baby ${kid.shiny ? 'shiny ' : ''}${petLabel(kid)}!`, 'great');
  return kid;
}

// Work out each town pet's mood and output effects from its bonds.
function recompute(state) {
  const inTown = new Map(state.pets.map((p) => [p.id, p]));
  for (const pet of state.pets) {
    let friends = 0, best = 0, friendsWork = 0, bestWork = 0, rivalsWork = 0, rivalsHome = 0, family = 0, partner = false;
    for (const [key, v] of Object.entries(pet.bonds || {})) {
      const o = inTown.get(+key);
      if (!o) continue;
      const level = bondLevel(v);
      const sameJob = pet.jobId != null && o.jobId === pet.jobId;
      const sameHome = pet.homeId != null && o.homeId === pet.homeId;
      if (level === 'best') { best++; if (sameJob) bestWork++; }
      else if (level === 'friend') { friends++; if (sameJob) friendsWork++; }
      else if (level === 'rival') { if (sameJob) rivalsWork++; if (sameHome) rivalsHome++; }
      if (sameHome && related(pet, o)) family++;
      if (pet.partnerId === o.id) partner = true;
    }
    const mood = [];
    if (friends) mood.push(['Friends in town', Math.min(3, friends)]);
    if (best) mood.push(['Best friends in town', Math.min(6, 2 * best)]);
    if (partner) mood.push(['Partner in town', 4]);
    if (family) mood.push(['Family at home', 3]);
    if (rivalsHome) mood.push(['Rival at home', -Math.min(12, 6 * rivalsHome)]);
    if (rivalsWork) mood.push(['Rival at work', -Math.min(6, 3 * rivalsWork)]);
    const work = SOCIAL.workPerFriend * Math.min(3, friendsWork) + SOCIAL.workPerBest * Math.min(3, bestWork) + SOCIAL.workPerRival * Math.min(3, rivalsWork);
    socialCache.set(pet, { workMul: Math.max(0.75, Math.min(1.25, 1 + work)), mood, friendsWork: friendsWork + bestWork, rivalsWork });
  }
}

// ---------- reading relationships (UI, goals, the 3D town) ----------

// Everyone this pet has a bond with, grouped. Each entry: { pet, value, inTown }.
export function relationshipsOf(state, pet) {
  const out = { partner: null, best: [], friends: [], rivals: [], parents: [], children: [], siblings: [] };
  const inTown = new Set(state.pets.map((p) => p.id));
  const entry = (p, value = bondBetween(pet, p)) => ({ pet: p, value, inTown: inTown.has(p.id) });
  if (pet.partnerId != null) { const p = findAnyPet(state, pet.partnerId); if (p) out.partner = entry(p); }
  for (const id of pet.parents || []) { const p = findAnyPet(state, id); if (p) out.parents.push(entry(p)); }
  out.children = childrenOf(state, pet).map((p) => entry(p));
  out.siblings = everyone(state).filter((p) => p.id !== pet.id && (p.parents || []).some((x) => (pet.parents || []).includes(x))).map((p) => entry(p));
  // friends and rivals are everyone else this pet has a bond with (each pet is listed once, under its closest tie)
  const listed = new Set([out.partner, ...out.parents, ...out.children, ...out.siblings].filter(Boolean).map((e) => e.pet.id));
  for (const [key, v] of Object.entries(pet.bonds || {})) {
    if (listed.has(+key)) continue;
    const o = findAnyPet(state, +key);
    if (!o) continue;
    const level = bondLevel(v);
    if (level === 'best') out.best.push(entry(o, v));
    else if (level === 'friend') out.friends.push(entry(o, v));
    else if (level === 'rival') out.rivals.push(entry(o, v));
  }
  const byValue = (x, y) => Math.abs(y.value) - Math.abs(x.value);
  out.best.sort(byValue); out.friends.sort(byValue); out.rivals.sort(byValue);
  return out;
}

// A family tree around a pet: grandparents, parents, the pet and partner, and all descendants.
export function familyTree(state, pet, depth = 4) {
  const parents = (pet.parents || []).map((id) => findAnyPet(state, id)).filter(Boolean);
  const grandparents = parents.flatMap((p) => (p.parents || []).map((id) => findAnyPet(state, id)).filter(Boolean));
  const branch = (p, d) => ({ pet: p, children: d > 0 ? childrenOf(state, p).map((c) => branch(c, d - 1)) : [] });
  return {
    grandparents, parents,
    partner: pet.partnerId != null ? findAnyPet(state, pet.partnerId) : null,
    descendants: childrenOf(state, pet).map((c) => branch(c, depth - 1)),
  };
}

// Who a pet would like to spend the evening with: its parent (kids), partner, or closest friend. Must be in town.
export function companionOf(state, pet) {
  const inTown = (id) => (id != null ? state.pets.find((p) => p.id === id) : null);
  if (pet.kid) { for (const id of pet.parents || []) { if (inTown(id)) return { id, kind: 'family' }; } }
  if (inTown(pet.partnerId)) return { id: pet.partnerId, kind: 'partner' };
  let best = null;
  for (const [key, v] of Object.entries(pet.bonds || {})) {
    if (v >= SOCIAL.friend && inTown(+key) && (!best || v > best.v)) best = { id: +key, kind: 'friend', v };
  }
  return best ? { id: best.id, kind: 'friend' } : null;
}

// Counts for goals and stats (town and Meadow together).
export function friendPairs(state, min = SOCIAL.friend) {
  let n = 0;
  for (const a of everyone(state)) for (const [key, v] of Object.entries(a.bonds || {})) if (a.id < +key && v >= min) n++;
  return n;
}
export const bestPairs = (state) => friendPairs(state, SOCIAL.best);
export const couples = (state) => everyone(state).filter((p) => p.partnerId != null && p.id < p.partnerId).length;
export const maxGeneration = (state) => everyone(state).reduce((m, p) => Math.max(m, p.gen || 1), 1);
