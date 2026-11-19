// HTML overlay: resource HUD, bottom tab bar, slide-up sheets, toasts, modals.
// Views are re-rendered from state; buttons carry data-act attributes that
// are dispatched to the action handlers passed in from main.js.

import { BUILDINGS, CONFIG, EGGS, RARITIES, RESOURCES, SOCIAL, SPECIES, TRAITS, xpForLevel } from '../game/data.js';
import {
  buildCost, buildingAt, canAfford, collectionMul, eggCost, expandCost, getBuilding, getPet, happinessFactors,
  homeCapacity, jobSlots, maxLevelOf, netRates, outputMul, residentsOf, totalHousing, upgradeCost, workersOf, workerMul,
  buildingRateMul,
} from '../game/sim.js';
import { QUESTS, claimable, questProgress, questSummary, rewardText, upcoming } from '../game/quests.js';
import { readyRequests, requestIcon, requestStatus, requestText } from '../game/requests.js';
import { featuredChance, featuredEndsAt, featuredSpecies } from '../game/featured.js';
import { fmt } from '../game/util.js';
import {
  bestPairs, couples, familyTree, findAnyPet, likesText, maxGeneration, relationshipsOf,
} from '../game/social.js';
import { daylight } from '../render/stage.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export { fmt };

function fmtRate(n) {
  if (Math.abs(n) < 0.005) return '';
  const s = Math.abs(n) < 0.1 ? Math.abs(n).toFixed(2) : fmt(Math.abs(n));
  return `${n > 0 ? '+' : '−'}${s}/s`;
}

// "2d 5h" / "5h 12m" for the featured-egg countdown.
function fmtLeft(ms) {
  const m = Math.max(1, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

// What a wonder does at a given level, e.g. "+20% all production".
function wonderText(def, level) {
  const pct = Math.round(def.perLevel * level * 100);
  if (def.effect === 'output') return `+${pct}% all production`;
  if (def.effect === 'xp') return `+${pct}% pet XP`;
  return `−${pct}% egg prices`;
}

function mood(h) {
  return h >= 80 ? '😄' : h >= 60 ? '🙂' : h >= 40 ? '😐' : h >= 20 ? '🙁' : '😢';
}

export class UI {
  constructor({ getState, actions, petImg, buildingImg }) {
    this.getState = getState;
    this.actions = actions;
    this.petImg = petImg;
    this.buildingImg = buildingImg;
    this.view = null;
    this.params = {};
    this.petFilter = 'all';

    this.hud = $('#hud');
    this.goal = $('#goal');
    this.goalHtml = '';
    this.sheet = $('#sheet');
    this.sheetTitle = $('#sheet-title');
    this.sheetBody = $('#sheet-body');
    this.toasts = $('#toasts');
    this.banner = $('#banner');
    this.modal = $('#modal');

    $('#sheet-close').addEventListener('click', () => this.close());
    $('#tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (this.view === tab) this.close();
      else this.open(tab);
    });
    const dispatch = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (e.type === 'click' && el.tagName === 'SELECT') return;
      const fn = this.actions[el.dataset.act];
      if (fn) fn({ ...el.dataset, value: el.value }, el);
    };
    for (const root of [this.sheetBody, this.modal, this.banner, this.hud, this.goal]) {
      root.addEventListener('click', dispatch);
      root.addEventListener('change', dispatch);
    }
    this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.closeModal(); });
    // The open sheet refreshes about once a second. A refresh between press and release would swallow the tap,
    // so refreshes wait while a finger is down (with a time limit in case the release never arrives).
    this.pressedAt = 0;
    this.sheetBody.addEventListener('pointerdown', () => { this.pressedAt = performance.now(); });
    for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => { this.pressedAt = 0; });
  }

  // ---------- sheets ----------

  open(view, params = {}) {
    this.view = view;
    this.params = params;
    this.sheet.hidden = false;
    this.sheet.classList.remove('closing');
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === view || ((view === 'pet' || view === 'tree') && b.dataset.tab === 'pets') || (view === 'building' && b.dataset.tab === 'build')));
    this.sheetBody.scrollTop = 0;
    this.render();
  }

  close() {
    this.view = null;
    this.sheet.hidden = true;
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.remove('active'));
    this.actions.sheetClosed?.();
  }

  // Re-render the open sheet, unless the player is mid-way through using a control.
  refresh(force = false) {
    if (!this.view) return;
    if (!force && this.pressedAt && performance.now() - this.pressedAt < 1500) return;
    const a = document.activeElement;
    if (!force && a && this.sheet.contains(a) && (a.tagName === 'SELECT' || a.tagName === 'INPUT')) return;
    this.render();
  }

  render() {
    const s = this.getState();
    const views = {
      build: () => this.viewBuild(s),
      building: () => this.viewBuilding(s),
      pets: () => this.viewPets(s),
      pet: () => this.viewPet(s),
      tree: () => this.viewTree(s),
      hatch: () => this.viewHatch(s),
      goals: () => this.viewGoals(s),
      dex: () => this.viewDex(s),
      menu: () => this.viewMenu(s),
    };
    const out = views[this.view]?.();
    if (!out) { this.close(); return; }
    this.sheetTitle.innerHTML = out.title;
    const scroll = this.sheetBody.scrollTop;
    this.sheetBody.innerHTML = out.body;
    this.sheetBody.scrollTop = scroll;
  }

  costHtml(s, cost) {
    return Object.entries(cost).map(([r, n]) => `<span class="cost ${s.resources[r] >= n ? '' : 'short'}">${RESOURCES[r].emoji}${fmt(n)}</span>`).join('');
  }

  viewBuild(s) {
    const tile = this.params.tile;
    const groups = { home: 'Homes', job: 'Workplaces', decor: 'Decorations', wonder: 'Wonders' };
    let body = tile
      ? `<p class="hint">Building on the highlighted tile.</p>`
      : `<p class="hint">Pick a building, then tap an empty tile in town.</p>`;
    for (const [type, label] of Object.entries(groups)) {
      body += `<h3>${label}</h3><div class="cards">`;
      for (const [id, def] of Object.entries(BUILDINGS)) {
        if (def.type !== type) continue;
        const cost = buildCost(s, id);
        const ok = canAfford(s, cost);
        let stat = '';
        if (def.type === 'home') stat = `🛏️ ${def.capacity} beds`;
        if (def.type === 'job') {
          stat = `👷 ${def.slots} jobs · ` + Object.entries(def.produces).map(([r, v]) => `${RESOURCES[r].emoji}${v}/s`).join(' ');
          if (def.consumes) stat += ' · uses ' + Object.entries(def.consumes).map(([r, v]) => `${RESOURCES[r].emoji}${v}/s`).join(' ');
        }
        if (def.type === 'decor') stat = `💖 +${def.happiness} happiness`;
        if (def.type === 'wonder') stat = `✨ ${wonderText(def, 1)} per level (max Lv ${def.maxLevel})`;
        const built = def.unique && s.buildings.some((b) => b.type === id);
        body += `<button class="card build-card" data-act="pickBuilding" data-type="${id}" ${ok && !built ? '' : 'disabled'}>
          <img src="${this.buildingImg(id)}" alt="">
          <div><b>${def.name}</b><small>${def.desc}</small><small class="stat">${stat}</small><div class="costs">${built ? '<span class="cost">✅ Built</span>' : this.costHtml(s, cost)}</div></div>
        </button>`;
      }
      body += `</div>`;
    }
    if (s.rows < CONFIG.maxRows) {
      const cost = expandCost(s);
      body += `<h3>Land</h3><button class="btn wide" data-act="expand" ${canAfford(s, cost) ? '' : 'disabled'}>🗺️ Expand town (+1 row) ${this.costHtml(s, cost)}</button>`;
    }
    return { title: '🏗️ Build', body };
  }

  buildingOutput(s, b) {
    const def = BUILDINGS[b.type];
    const out = {};
    for (const p of workersOf(s, b.id)) {
      const mul = workerMul(s, p) * buildingRateMul(b) * outputMul(s);
      for (const [r, v] of Object.entries(def.produces)) out[r] = (out[r] || 0) + v * mul;
    }
    return out;
  }

  petRow(s, p, extra = '') {
    const sp = SPECIES[p.species];
    return `<div class="pet-row" data-act="openPet" data-id="${p.id}">
      <img src="${this.petImg(p.species, p.shiny)}" alt="">
      <div class="grow"><b>${p.shiny ? '✨ ' : ''}${esc(p.name)}${p.kid ? ' 👶' : ''}${p.partnerId != null ? ' 💞' : ''}</b> <small style="color:${RARITIES[sp.rarity].color}">${sp.name} · Lv ${p.level}</small></div>
      <span class="mood">${mood(p.happiness)}</span>${extra}
    </div>`;
  }

  viewBuilding(s) {
    const b = getBuilding(s, this.params.id);
    if (!b) return null;
    const def = BUILDINGS[b.type];
    let body = `<div class="hero"><img src="${this.buildingImg(b.type)}" alt=""><div><p>${def.desc}</p><p class="stars">${'★'.repeat(b.level)}${'☆'.repeat(maxLevelOf(b) - b.level)}</p></div></div>`;
    if (def.type === 'home') {
      const res = residentsOf(s, b.id);
      body += `<h3>Residents ${res.length}/${homeCapacity(b)}</h3>`;
      body += res.map((p) => this.petRow(s, p, `<button class="btn small" data-act="evict" data-id="${p.id}">Move out</button>`)).join('') || '<p class="hint">Nobody lives here yet.</p>';
      const homeless = s.pets.filter((p) => p.homeId == null);
      if (res.length < homeCapacity(b) && homeless.length) {
        body += `<select data-act="moveIn" data-building="${b.id}"><option value="">+ Move a homeless pet in…</option>${homeless.map((p) => `<option value="${p.id}">${SPECIES[p.species].emoji} ${esc(p.name)}</option>`).join('')}</select>`;
      }
    } else if (def.type === 'job') {
      const ws = workersOf(s, b.id);
      const out = this.buildingOutput(s, b);
      body += `<p class="output">Producing ${Object.entries(out).map(([r, v]) => `${RESOURCES[r].emoji} ${v.toFixed(2)}/s`).join(' ') || 'nothing (no workers)'}</p>`;
      body += `<h3>Workers ${ws.length}/${jobSlots(b)}</h3>`;
      body += ws.map((p) => this.petRow(s, p, `${SPECIES[p.species].favJob === b.type ? '<span title="Dream job">⭐</span>' : ''}<button class="btn small" data-act="fire" data-id="${p.id}">Remove</button>`)).join('') || '<p class="hint">No workers yet.</p>';
      if (ws.length < jobSlots(b)) {
        const cands = s.pets.filter((p) => p.jobId !== b.id).sort((a, c) => (SPECIES[c.species].favJob === b.type) - (SPECIES[a.species].favJob === b.type) || (a.jobId != null) - (c.jobId != null));
        if (cands.length) {
          body += `<select data-act="hire" data-building="${b.id}"><option value="">+ Hire a pet…</option>${cands.map((p) => `<option value="${p.id}">${SPECIES[p.species].favJob === b.type ? '⭐ ' : ''}${SPECIES[p.species].emoji} ${esc(p.name)}${p.jobId != null ? ' (has a job)' : ''}</option>`).join('')}</select>`;
        }
      }
      const fans = Object.values(SPECIES).filter((sp) => sp.favJob === b.type).map((sp) => sp.emoji).join(' ');
      body += `<p class="hint">⭐ Dream job for: ${fans}. Those pets work 50% faster and are happier here.</p>`;
    } else if (def.type === 'wonder') {
      body += `<p class="output">✨ ${wonderText(def, b.level)}</p>`;
      if (b.level < maxLevelOf(b)) body += `<p class="hint">Next level: ${wonderText(def, b.level + 1)}</p>`;
    } else {
      const h = def.happiness + def.happinessPerLevel * (b.level - 1);
      body += `<p class="output">💖 +${h} happiness for every pet in town (decor total caps at +40).</p>`;
    }
    body += `<div class="row">`;
    if (b.level < maxLevelOf(b)) {
      const cost = upgradeCost(b);
      body += `<button class="btn primary" data-act="upgrade" data-id="${b.id}" ${canAfford(s, cost) ? '' : 'disabled'}>⬆️ Upgrade ${this.costHtml(s, cost)}</button>`;
    } else body += `<span class="hint">Max level!</span>`;
    body += `<button class="btn danger" data-act="demolish" data-id="${b.id}">🧨 Demolish</button></div>`;
    return { title: `${def.name} <small>Lv ${b.level}</small>`, body };
  }

  viewPets(s) {
    const homeless = s.pets.filter((p) => p.homeId == null).length;
    const jobless = s.pets.filter((p) => p.jobId == null).length;
    const f = this.petFilter;
    const meadow = s.meadow || [];
    const chips = `<button class="chip ${f === 'meadow' ? 'on' : ''}" data-act="petFilter" data-f="meadow">🌼 Meadow ${meadow.length}</button>`;
    if (f === 'meadow') {
      const full = s.pets.length >= CONFIG.maxPets;
      let body = `<div class="row"><button class="chip" data-act="petFilter" data-f="all">← Town ${s.pets.length}/${CONFIG.maxPets}</button>${chips}</div>
        <p class="hint">🌼 Pets in the Meadow live happily out of town. They keep their level and shininess, and the Petdex remembers them. Bring one back whenever the town has room.</p>`;
      if (full && meadow.length) body += `<p class="warn">The town is full. Send someone to the Meadow first.</p>`;
      body += [...meadow].reverse().map((p) => {
        const sp = SPECIES[p.species];
        return `<div class="pet-row static">
          <img src="${this.petImg(p.species, p.shiny)}" alt="">
          <div class="grow"><b>${p.shiny ? '✨ ' : ''}${esc(p.name)}</b> <small style="color:${RARITIES[sp.rarity].color}">${sp.name} · Lv ${p.level}</small></div>
          <button class="btn small" data-act="recall" data-id="${p.id}" ${full ? 'disabled' : ''}>Bring back</button>
        </div>`;
      }).join('') || '<p class="hint">Nobody is in the Meadow yet. Open a pet and tap "Send to the Meadow" to make room in town.</p>';
      return { title: '🌼 Meadow', body };
    }
    let pets = [...s.pets];
    if (f === 'homeless') pets = pets.filter((p) => p.homeId == null);
    if (f === 'jobless') pets = pets.filter((p) => p.jobId == null);
    pets.sort((a, b) => RARITY_ORDER.indexOf(SPECIES[a.species].rarity) - RARITY_ORDER.indexOf(SPECIES[b.species].rarity) || b.level - a.level);
    let body = `<div class="row">
      <button class="chip ${f === 'all' ? 'on' : ''}" data-act="petFilter" data-f="all">All ${s.pets.length}</button>
      <button class="chip ${f === 'homeless' ? 'on' : ''}" data-act="petFilter" data-f="homeless">🏚️ Homeless ${homeless}</button>
      <button class="chip ${f === 'jobless' ? 'on' : ''}" data-act="petFilter" data-f="jobless">💤 Jobless ${jobless}</button>
      ${chips}
    </div>
    <p class="hint">🛏️ ${s.pets.filter((p) => p.homeId != null).length}/${totalHousing(s)} beds used. Free beds attract strays.</p>
    <div class="row"><button class="btn primary" data-act="autoAssign">✨ Auto-assign homes & jobs</button></div>`;
    body += pets.map((p) => {
      const home = p.homeId != null ? '🏠' : '🏚️';
      const job = p.jobId != null ? BUILDINGS[getBuilding(s, p.jobId).type].emoji : '💤';
      return this.petRow(s, p, `<span class="status">${home}${job}</span>`);
    }).join('') || '<p class="hint">No pets match.</p>';
    return { title: '🐾 Citizens', body };
  }

  // "💞 Relationships": partner, family, friends and rivals. Pets in town can be opened with a tap.
  relationshipsHtml(s, p) {
    const r = relationshipsOf(s, p);
    const row = (e, label, icon) => `<div class="rel ${e.inTown ? '' : 'away'}" ${e.inTown ? `data-act="openPet" data-id="${e.pet.id}"` : ''}>
      <img src="${this.petImg(e.pet.species, e.pet.shiny)}" alt="">
      <div class="grow"><b>${e.pet.shiny ? '✨ ' : ''}${esc(e.pet.name)}${e.pet.kid ? ' 👶' : ''}</b><small>${label}${e.inTown ? '' : ' · 🌼 in the Meadow'}</small></div>
      <span>${icon}</span></div>`;
    const some = (list, label, icon, max = 4) => list.slice(0, max).map((e) => row(e, label, icon)).join('') + (list.length > max ? `<p class="hint">+${list.length - max} more ${label.toLowerCase()}s</p>` : '');
    let rows = '';
    if (r.partner) rows += row(r.partner, 'Partner', '💞');
    rows += some(r.parents, 'Parent', '🧡') + some(r.children, 'Child', '🧡') + some(r.siblings, 'Sibling', '🧡');
    rows += some(r.best, 'Best friend', '💖') + some(r.friends, 'Friend', '💛') + some(r.rivals, 'Rival', '💢');
    if (!rows) return `<h3>💞 Relationships</h3><p class="hint">No close bonds yet. Pets who share a home or a workplace get to know each other, faster when their traits match.</p>`;
    const rivalHint = r.rivals.some((e) => e.inTown) ? '<p class="hint">💢 Rivals sharing a home or job make each other grumpy. Move one of them to a different home or job.</p>' : '';
    return `<h3>💞 Relationships</h3><div class="rels">${rows}</div>${rivalHint}`;
  }

  viewTree(s) {
    const p = findAnyPet(s, this.params.id);
    if (!p) return null;
    const t = familyTree(s, p);
    const inTown = (q) => s.pets.some((x) => x.id === q.id);
    const cell = (q, cls = '') => `<button class="tcell ${cls}" data-act="openTree" data-id="${q.id}">
      <img src="${this.petImg(q.species, q.shiny)}" alt=""><b>${q.shiny ? '✨ ' : ''}${esc(q.name)}${q.kid ? ' 👶' : ''}</b><small>Gen ${q.gen || 1}${inTown(q) ? '' : ' · 🌼'}</small></button>`;
    const row = (title, list) => (list.length ? `<h3>${title}</h3><div class="trow">${list.map((q) => cell(q)).join('')}</div>` : '');
    let body = `<p class="hint">Tap anyone to see their branch.</p>` + row('Grandparents', t.grandparents) + row('Parents', t.parents);
    body += `<h3>${esc(p.name)}</h3><div class="trow">${cell(p, 'me')}${t.partner ? `<span class="heart">💞</span>${cell(t.partner)}` : ''}</div>`;
    const branch = (n) => `<li>${cell(n.pet)}${n.children.length ? `<ul>${n.children.map(branch).join('')}</ul>` : ''}</li>`;
    body += t.descendants.length
      ? `<h3>Children and grandchildren</h3><ul class="tree">${t.descendants.map(branch).join('')}</ul>`
      : `<p class="hint">No children yet. Partners with a free bed, enough food and good moods start families.</p>`;
    body += `<div class="row">${inTown(p) ? `<button class="btn" data-act="openPet" data-id="${p.id}">← ${esc(p.name)}</button>` : `<button class="btn" data-act="tab" data-tab="pets">← Pets</button>`}</div>`;
    return { title: `🌳 ${esc(p.name)}'s family`, body };
  }

  viewPet(s) {
    const p = getPet(s, this.params.id);
    if (!p) return null;
    const sp = SPECIES[p.species];
    const trait = TRAITS[p.trait];
    const rar = RARITIES[sp.rarity];
    const fav = BUILDINGS[sp.favJob];
    const need = xpForLevel(p.level);
    const factors = happinessFactors(s, p).map(([k, v]) => `<li><span>${k}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v}</b></li>`).join('');
    const homes = s.buildings.filter((b) => BUILDINGS[b.type].type === 'home');
    const jobs = s.buildings.filter((b) => BUILDINGS[b.type].type === 'job');
    const likes = likesText(p.trait);
    const homeOpts = homes.map((b) => {
      const full = residentsOf(s, b.id).length >= homeCapacity(b) && p.homeId !== b.id;
      return `<option value="${b.id}" ${p.homeId === b.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${BUILDINGS[b.type].emoji} ${BUILDINGS[b.type].name} (${residentsOf(s, b.id).length}/${homeCapacity(b)})</option>`;
    }).join('');
    const jobOpts = jobs.map((b) => {
      const full = workersOf(s, b.id).length >= jobSlots(b) && p.jobId !== b.id;
      return `<option value="${b.id}" ${p.jobId === b.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${b.type === sp.favJob ? '⭐ ' : ''}${BUILDINGS[b.type].emoji} ${BUILDINGS[b.type].name} (${workersOf(s, b.id).length}/${jobSlots(b)})</option>`;
    }).join('');
    const body = `
      <div class="hero"><img class="big" src="${this.petImg(p.species, p.shiny)}" alt="">
        <div>
          <p><b style="color:${rar.color}">${rar.name}</b> ${sp.name}</p>
          ${p.shiny ? `<p class="shiny-tag">✨ <b>Shiny!</b> <small>+${Math.round(CONFIG.shinyBonus * 100)}% output</small></p>` : ''}
          <p>Level ${p.level}${p.level < CONFIG.maxPetLevel ? ` <span class="bar"><i style="width:${Math.min(100, (p.xp / need) * 100)}%"></i></span>` : ' (max)'}</p>
          <p>Trait: <b>${trait.name}</b> <small>${trait.desc}</small></p>
          <p>Dream job: ${fav.emoji} ${fav.name}</p>
          ${p.kid ? `<p>👶 <b>Kid</b> <small>grows up in ${fmtDuration(Math.max(1, SOCIAL.kidSeconds - (s.time - (p.born || 0))))} of game time and can't work yet</small></p>` : ''}
          ${(p.gen || 1) > 1 ? `<p><small>Generation ${p.gen}</small></p>` : ''}
        </div>
      </div>
      <p class="likes">💕 Gets on with: ${likes.warm ? 'everyone' : ''}${likes.warm && likes.likes ? ', especially ' : ''}${likes.likes || (likes.warm ? '' : 'nobody in particular')}${likes.clash ? ` · 💢 Clashes with: ${likes.clash}` : ''}</p>
      <h3>${mood(p.happiness)} Happiness ${Math.round(p.happiness)}%</h3>
      <div class="bar wide"><i style="width:${p.happiness}%"></i></div>
      <ul class="factors">${factors}</ul>
      <p class="hint">Happier pets work faster (up to 1.5×).</p>
      ${this.relationshipsHtml(s, p)}
      <label>Home <select data-act="setHome" data-id="${p.id}"><option value="">🏚️ No home</option>${homeOpts}</select></label>
      <label>Job <select data-act="setJob" data-id="${p.id}"><option value="">💤 No job</option>${jobOpts}</select></label>
      <div class="row">
        <button class="btn" data-act="rename" data-id="${p.id}">✏️ Rename</button>
        <button class="btn" data-act="findPet" data-id="${p.id}">📍 Find in town</button>
        <button class="btn" data-act="openTree" data-id="${p.id}">🌳 Family tree</button>
        <button class="btn" data-act="retire" data-id="${p.id}">🌼 Send to the Meadow</button>
        <button class="btn" data-act="tab" data-tab="pets">← All pets</button>
      </div>`;
    return { title: esc(p.name), body };
  }

  // The weekly featured egg: which species is boosted, how much, and how long it lasts.
  featuredCard(s) {
    const now = Date.now();
    const id = featuredSpecies(now);
    const sp = SPECIES[id];
    const rar = RARITIES[sp.rarity];
    const odds = Object.entries(EGGS).map(([eid, egg]) => {
      const p = featuredChance(eid, now);
      return `${egg.emoji} ${p > 0 ? `${(p * 100).toFixed(1)}%` : '—'}`;
    }).join(' · ');
    return `<div class="featured" style="--rc:${rar.color}">
      <img src="${this.petImg(id)}" alt="">
      <div><small class="kicker">⭐ Featured this week</small>
        <b>${sp.name} <small style="color:${rar.color}">${rar.name}</small></b>
        <small>×${CONFIG.featuredBoost} more likely among ${rar.name} pets${s.discovered[id] ? '' : ' · not found yet!'}</small>
        <small>Chance per egg: ${odds}</small>
        <small class="left">⏳ ${fmtLeft(featuredEndsAt(now) - now)} left</small></div>
    </div>`;
  }

  viewHatch(s) {
    let body = this.featuredCard(s) + `<p class="hint">Make 🍬 treats at a Treat Factory (it eats food), then hatch eggs to find new citizens. Every new species discovered boosts all production by ${Math.round(CONFIG.collectionBonus * 100)}%.</p>
      <p class="hint">Each egg you hatch makes the next one ${Math.round((EGGS.basic.costScale - 1) * 100)}% pricier. Stockpiling coins and food? Nest Eggs turn them into pets.</p><div class="cards">`;
    for (const [id, egg] of Object.entries(EGGS)) {
      const cost = eggCost(s, id);
      const total = Object.values(egg.weights).reduce((a, b) => a + b, 0);
      const odds = RARITY_ORDER.slice().reverse().filter((r) => egg.weights[r]).map((r) => `<span style="color:${RARITIES[r].color}">${RARITIES[r].name} ${Math.round((egg.weights[r] / total) * 100)}%</span>`).join(' · ');
      body += `<div class="card egg-card"><div class="egg">${egg.emoji}</div><div><b>${egg.name}</b><small>${odds}</small>
        <button class="btn primary" data-act="hatch" data-egg="${id}" ${canAfford(s, cost) ? '' : 'disabled'}>Hatch ${this.costHtml(s, cost)}</button></div></div>`;
    }
    body += `</div>`;
    const free = totalHousing(s) - s.pets.filter((p) => p.homeId != null).length;
    if (s.pets.length >= CONFIG.maxPets) body += `<p class="warn">🏙️ The town is full (${CONFIG.maxPets} citizens). Send pets to the 🌼 Meadow (Pets tab) to make room.</p>`;
    else if (free <= 0) body += `<p class="warn">⚠️ No free beds. New pets will be homeless until you build more homes.</p>`;
    return { title: '🥚 Hatchery', body };
  }

  requestRow(s, r) {
    const st = requestStatus(s, r);
    const pct = Math.round((st.have / st.need) * 100);
    return `<div class="quest request ${st.ready ? 'ready' : ''}">
      <div class="q-icon">${requestIcon(s, r)}</div>
      <div class="grow"><b>${esc(requestText(s, r))}</b>
        <span class="bar wide"><i style="width:${pct}%"></i></span><small>${fmt(st.have)} / ${fmt(st.need)}</small>
        <small class="reward">Reward: ${rewardText(r.reward)}</small></div>
      <div class="req-btns">
        <button class="btn primary small" data-act="claimRequest" data-id="${r.id}" ${st.ready ? '' : 'disabled'}>${r.type === 'give' ? 'Give' : 'Claim'}</button>
        <button class="chip" data-act="skipRequest" data-id="${r.id}" title="Swap for a different request" aria-label="Swap for a different request">↻</button>
      </div>
    </div>`;
  }

  viewGoals(s) {
    const sum = questSummary(s);
    const ready = claimable(s);
    const next = upcoming(s, 4);
    const row = (q, state) => {
      const cur = questProgress(s, q);
      const pct = Math.round((cur / q.goal) * 100);
      return `<div class="quest ${state}">
        <div class="q-icon">${q.icon}</div>
        <div class="grow"><b>${q.title}${q.endless ? ' <span class="tag" title="Endless goal: a new one appears after each">♾️</span>' : ''}</b><small>${q.desc}</small>
          ${state === 'ready' ? '' : `<span class="bar wide"><i style="width:${pct}%"></i></span><small>${fmt(cur)} / ${fmt(q.goal)}</small>`}
          <small class="reward">Reward: ${rewardText(q.reward)}</small></div>
        ${state === 'ready' ? `<button class="btn primary small" data-act="claimQuest" data-id="${q.id}">Claim</button>` : ''}
      </div>`;
    };
    let body = `<p class="hint">🎯 ${sum.done} of ${sum.total} goals done${sum.endless ? ` · ♾️ ${sum.endless} endless goal${sum.endless > 1 ? 's' : ''}` : ''}. Finish goals to earn coins, wood, treats and free eggs.</p>`;
    if (ready.length > 1) body += `<div class="row"><button class="btn primary wide" data-act="claimAll">🎁 Claim all (${ready.length})</button></div>`;
    if (ready.length) body += `<h3>Ready to claim</h3>` + ready.map((q) => row(q, 'ready')).join('');
    body += `<h3>📮 Town requests <small class="hint">${s.requests.done} finished</small></h3>`;
    body += s.requests.active.map((r) => this.requestRow(s, r)).join('') || '<p class="hint">Nobody needs anything right now.</p>';
    body += `<p class="hint">Neighbours ask for what the town can afford soon. A new request appears when you finish or swap one (↻).</p>`;
    if (next.length) body += `<h3>Up next</h3>` + next.map((q) => row(q, 'todo')).join('');
    else if (!ready.length) body += `<p class="hint">🏆 Nothing left to do right now. Legend!</p>`;
    const left = QUESTS.filter((q) => !(s.quests.claimed[q.id]) && q.progress(s) < q.goal).length - next.filter((q) => !q.endless).length;
    if (left > 0) body += `<p class="hint">…and ${left} more goals to discover.</p>`;
    return { title: '🎯 Goals', body };
  }

  viewDex(s) {
    const found = Object.keys(s.discovered).length;
    const total = Object.keys(SPECIES).length;
    const shinies = Object.keys(s.shinyFound || {}).length;
    let body = `<p class="hint">${found}/${total} species found · ✨ ${shinies}/${total} shiny found · production bonus +${Math.round((collectionMul(s) - 1) * 100)}%</p>
      <p class="hint">Shiny pets work ${Math.round(CONFIG.shinyBonus * 100)}% faster. About 1 egg in 30 holds one.</p><div class="dex">`;
    for (const r of RARITY_ORDER.slice().reverse()) {
      for (const [id, sp] of Object.entries(SPECIES)) {
        if (sp.rarity !== r) continue;
        const owned = s.pets.filter((p) => p.species === id).length;
        const inMeadow = (s.meadow || []).filter((p) => p.species === id).length;
        body += s.discovered[id]
          ? `<div class="dex-cell" style="--rc:${RARITIES[r].color}"><div class="dex-imgs"><img src="${this.petImg(id)}" alt="">${s.shinyFound && s.shinyFound[id] ? `<img class="mini" src="${this.petImg(id, true)}" alt="shiny">` : ''}</div><b>${sp.name}</b><small>${owned ? `×${owned}` : ''}${inMeadow ? `${owned ? ' · ' : ''}🌼${inMeadow}` : owned ? '' : 'moved away'}</small><small class="sh">${s.shinyFound && s.shinyFound[id] ? '✨ shiny found' : '✨ ?'}</small></div>`
          : `<div class="dex-cell unknown" style="--rc:${RARITIES[r].color}"><div class="q">?</div><b>???</b><small>${RARITIES[r].name}</small></div>`;
      }
    }
    body += `</div>`;
    return { title: '📖 Petdex', body };
  }

  viewMenu(s) {
    const days = Math.floor(s.time / CONFIG.dayLength) + 1;
    const body = `
      <h3>How to play</h3>
      <ul class="howto">
        <li>Your pets are the citizens. Each one needs a <b>home</b> 🏠, a <b>job</b> 🌾 and <b>food</b> 🍎.</li>
        <li>By day pets walk to work; at night they go home to sleep. Homeless pets sleep outside and get grumpy.</li>
        <li>Each species has a ⭐ dream job where it works 50% faster.</li>
        <li>Free beds attract stray pets. Treats 🍬 hatch eggs for rarer pets.</li>
        <li>Check the 🎯 Goals tab for what to do next. Finishing goals pays rewards.</li>
        <li>Neighbours post 📮 <b>Town requests</b> in the Goals tab: hand over what they ask for, or build, hatch or expand, to earn rewards. Swap any you don't like with ↻.</li>
        <li>Pets who share a home or a job become friends or rivals on their own (check what each trait likes on a pet's page). Best friends can become 💞 partners and have 👶 babies, who grow into workers. See every pet's 🌳 family tree.</li>
        <li>Town full? Open a pet and tap <b>Send to the Meadow</b>: it frees a spot, and you can bring the pet back later while there's room.</li>
        <li>About 1 egg in 30 hatches a ✨ <b>shiny</b> pet (+15% output). Each week one species is the ⭐ featured egg in the Hatch tab.</li>
        <li>Spend big on upgrades, more land and one-of-a-kind wonders. They boost the whole town.</li>
        <li>Happy pets work harder: add gardens and fountains.</li>
        <li>The town keeps working while you're away (up to ${CONFIG.maxOfflineSeconds / 3600}h).</li>
        <li>Controls: drag to move the camera, pinch or scroll to zoom, two-finger twist or right-drag to rotate. Tap things to inspect them.</li>
      </ul>
      <h3>Stats</h3>
      <ul class="factors">
        <li><span>Day</span><b>${days}</b></li>
        <li><span>Citizens</span><b>${s.pets.length}</b></li>
        <li><span>Goals done</span><b>${questSummary(s).done}/${QUESTS.length}${questSummary(s).endless ? ` +${questSummary(s).endless}♾️` : ''}</b></li>
        <li><span>Best-friend pairs / couples</span><b>${bestPairs(s)} / ${couples(s)}</b></li>
        <li><span>Babies born · deepest generation</span><b>${s.stats.born || 0} · ${maxGeneration(s)}</b></li>
        <li><span>Pets in the Meadow</span><b>${(s.meadow || []).length}</b></li>
        <li><span>Town requests done</span><b>${s.requests.done}</b></li>
        <li><span>Shiny species found</span><b>${Object.keys(s.shinyFound || {}).length}/${Object.keys(SPECIES).length}</b></li>
        <li><span>Eggs hatched</span><b>${s.stats.hatched}</b></li>
        <li><span>Strays adopted</span><b>${s.stats.strays}</b></li>
        <li><span>Coins earned</span><b>${fmt(s.stats.coinsEarned)}</b></li>
      </ul>
      <label class="check"><input type="checkbox" data-act="toggleAuto" ${s.settings.autoAssign ? 'checked' : ''}> Auto-assign new pets to homes & jobs</label>
      <label class="check"><input type="checkbox" data-act="toggleSfx" ${s.settings.sfx ? 'checked' : ''}> 🔊 Sound effects</label>
      <label class="check"><input type="checkbox" data-act="toggleMusic" ${s.settings.music ? 'checked' : ''}> 🎵 Music</label>
      <div class="row">
        <button class="btn" data-act="saveNow">💾 Save now</button>
        <button class="btn danger" data-act="reset">🔄 Start over</button>
      </div>
      <p class="hint">No sound on iPhone? Flip the silent switch on the side of the phone and turn the volume up.</p>
      <p class="hint">Saves automatically on this device. Install it from your browser's menu ("Add to Home Screen" / "Install app") to play like a native app, even offline.</p>`;
    return { title: '⚙️ Menu', body };
  }

  // ---------- HUD ----------

  renderHud() {
    const s = this.getState();
    const rates = netRates(s);
    const phase = (s.time % CONFIG.dayLength) / CONFIG.dayLength;
    const hours = (6 + phase * 24) % 24;
    const hh = Math.floor(hours), mm = Math.floor(((hours - hh) * 60) / 10) * 10;
    const day = Math.floor(s.time / CONFIG.dayLength) + 1;
    const isDay = daylight(phase) > 0.5;
    const working = phase >= CONFIG.workStart && phase < CONFIG.workEnd;
    let html = '';
    for (const [k, r] of Object.entries(RESOURCES)) {
      const rate = rates[k];
      const warn = k === 'food' && (s.starving || (rate < 0 && s.resources.food < 20));
      html += `<div class="res ${warn ? 'warn' : ''}" title="${r.name}"><span>${r.emoji}</span><b>${fmt(s.resources[k])}</b><small class="${rate < 0 ? 'neg' : 'pos'}">${fmtRate(rate)}</small></div>`;
    }
    html += `<div class="res clock" title="${working ? 'Work time' : 'Rest time'}"><span>${isDay ? '☀️' : '🌙'}</span><b>Day ${day}</b><small>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</small></div>`;
    this.hud.innerHTML = html;
    this.renderGoal(s);
  }

  // The little "next goal" pill under the resource bar. Only touched when its text changes,
  // so a tap on it is never lost to a re-render.
  renderGoal(s) {
    const count = claimable(s).length + readyRequests(s).length;
    const next = upcoming(s, 1)[0];
    let html = '';
    if (count) html = `<button class="goal-pill ready" data-act="tab" data-tab="goals">🎁 ${count} reward${count > 1 ? 's' : ''} ready!</button>`;
    else if (next) html = `<button class="goal-pill" data-act="tab" data-tab="goals">${next.icon} ${next.title} <small>${fmt(questProgress(s, next))}/${fmt(next.goal)}</small></button>`;
    const dot = $('#tabs [data-tab=goals] .dot');
    if (dot) dot.hidden = !count;
    if (html !== this.goalHtml) {
      this.goalHtml = html;
      this.goal.innerHTML = html;
      this.goal.hidden = !html;
    }
    const h = this.hud.offsetHeight;
    if (h !== this.hudHeight) {
      this.hudHeight = h;
      document.documentElement.style.setProperty('--hud-h', `${h}px`);
    }
  }

  // ---------- toasts / banner / modal ----------

  toast(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  showBanner(html) {
    this.banner.innerHTML = html;
    this.banner.hidden = false;
  }

  hideBanner() {
    this.banner.hidden = true;
  }

  showModal(html) {
    this.modal.innerHTML = `<div class="modal-card">${html}</div>`;
    this.modal.hidden = false;
  }

  closeModal() {
    this.modal.hidden = true;
  }

  showOffline(offline) {
    const lines = Object.entries(offline.delta)
      .filter(([k, v]) => k !== 'pets' && Math.abs(v) >= 0.5)
      .map(([k, v]) => `<li><span>${RESOURCES[k].emoji} ${RESOURCES[k].name}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${fmt(v)}</b></li>`).join('');
    const pets = offline.delta.pets > 0 ? `<li><span>🐾 New citizens</span><b class="pos">+${offline.delta.pets}</b></li>` : '';
    this.showModal(`<h2>Welcome back!</h2><p>Your town kept busy for ${fmtDuration(offline.seconds)}${offline.capped ? ' (max)' : ''}.</p><ul class="factors">${lines}${pets}</ul><button class="btn primary wide" data-act="closeModal">Yay!</button>`);
  }

  showHatch(pet, isNew, isNewShiny = false) {
    const sp = SPECIES[pet.species];
    const rar = RARITIES[sp.rarity];
    this.showModal(`<div class="reveal" style="--rc:${pet.shiny ? '#ffd23f' : rar.color}">
      ${pet.shiny ? `<p class="shiny-banner">✨ SHINY! ✨${isNewShiny ? '<br><small>A new shiny for your Petdex!</small>' : ''}</p>` : ''}
      <img class="big spin" src="${this.petImg(pet.species, pet.shiny)}" alt="">
      <h2>${pet.shiny ? '✨ ' : ''}${esc(pet.name)}</h2>
      <p><b style="color:${rar.color}">${rar.name}</b> ${sp.name}${isNew ? ' · <b class="new">NEW!</b>' : ''}</p>
      <p><small>${TRAITS[pet.trait].name}: ${TRAITS[pet.trait].desc}</small></p>
      <div class="row center"><button class="btn primary" data-act="closeModal">Welcome!</button><button class="btn" data-act="openPetModal" data-id="${pet.id}">View</button></div>
    </div>`);
  }

  confirm(html, act, data = {}) {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    this.showModal(`${html}<div class="row center"><button class="btn danger" data-act="${act}" ${attrs}>Yes</button><button class="btn" data-act="closeModal">Cancel</button></div>`);
  }

  tileInfo(s, tile) {
    return buildingAt(s, tile.x, tile.y);
  }
}
