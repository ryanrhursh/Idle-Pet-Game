// HTML overlay: resource HUD, bottom tab bar, slide-up sheets, toasts, modals.
// Views are re-rendered from state; buttons carry data-act attributes that
// are dispatched to the action handlers passed in from main.js.

import { BUILDINGS, CONFIG, EGGS, RARITIES, RESOURCES, SPECIES, TRAITS, xpForLevel } from '../game/data.js';
import {
  buildCost, buildingAt, canAfford, collectionMul, expandCost, getBuilding, getPet, happinessFactors,
  homeCapacity, jobSlots, netRates, residentsOf, totalHousing, upgradeCost, workersOf, workerMul,
  buildingRateMul,
} from '../game/sim.js';
import { daylight } from '../render/stage.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.floor(n).toString();
  if (a >= 10) return n.toFixed(0);
  return n.toFixed(1).replace(/\.0$/, '');
}

function fmtRate(n) {
  if (Math.abs(n) < 0.005) return '';
  const s = Math.abs(n) < 0.1 ? Math.abs(n).toFixed(2) : fmt(Math.abs(n));
  return `${n > 0 ? '+' : '−'}${s}/s`;
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
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
    for (const root of [this.sheetBody, this.modal, this.banner, this.hud]) {
      root.addEventListener('click', dispatch);
      root.addEventListener('change', dispatch);
    }
    this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.closeModal(); });
  }

  // ---------- sheets ----------

  open(view, params = {}) {
    this.view = view;
    this.params = params;
    this.sheet.hidden = false;
    this.sheet.classList.remove('closing');
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === view || (view === 'pet' && b.dataset.tab === 'pets') || (view === 'building' && b.dataset.tab === 'build')));
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
      hatch: () => this.viewHatch(s),
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
    const groups = { home: 'Homes', job: 'Workplaces', decor: 'Decorations' };
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
        body += `<button class="card build-card" data-act="pickBuilding" data-type="${id}" ${ok ? '' : 'disabled'}>
          <img src="${this.buildingImg(id)}" alt="">
          <div><b>${def.name}</b><small>${def.desc}</small><small class="stat">${stat}</small><div class="costs">${this.costHtml(s, cost)}</div></div>
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
      const mul = workerMul(s, p) * buildingRateMul(b) * collectionMul(s);
      for (const [r, v] of Object.entries(def.produces)) out[r] = (out[r] || 0) + v * mul;
    }
    return out;
  }

  petRow(s, p, extra = '') {
    const sp = SPECIES[p.species];
    return `<div class="pet-row" data-act="openPet" data-id="${p.id}">
      <img src="${this.petImg(p.species)}" alt="">
      <div class="grow"><b>${esc(p.name)}</b> <small style="color:${RARITIES[sp.rarity].color}">${sp.name} · Lv ${p.level}</small></div>
      <span class="mood">${mood(p.happiness)}</span>${extra}
    </div>`;
  }

  viewBuilding(s) {
    const b = getBuilding(s, this.params.id);
    if (!b) return null;
    const def = BUILDINGS[b.type];
    let body = `<div class="hero"><img src="${this.buildingImg(b.type)}" alt=""><div><p>${def.desc}</p><p class="stars">${'★'.repeat(b.level)}${'☆'.repeat(CONFIG.maxBuildingLevel - b.level)}</p></div></div>`;
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
    } else {
      const h = def.happiness + def.happinessPerLevel * (b.level - 1);
      body += `<p class="output">💖 +${h} happiness for every pet in town (decor total caps at +40).</p>`;
    }
    body += `<div class="row">`;
    if (b.level < CONFIG.maxBuildingLevel) {
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
    let pets = [...s.pets];
    if (f === 'homeless') pets = pets.filter((p) => p.homeId == null);
    if (f === 'jobless') pets = pets.filter((p) => p.jobId == null);
    pets.sort((a, b) => RARITY_ORDER.indexOf(SPECIES[a.species].rarity) - RARITY_ORDER.indexOf(SPECIES[b.species].rarity) || b.level - a.level);
    let body = `<div class="row">
      <button class="chip ${f === 'all' ? 'on' : ''}" data-act="petFilter" data-f="all">All ${s.pets.length}</button>
      <button class="chip ${f === 'homeless' ? 'on' : ''}" data-act="petFilter" data-f="homeless">🏚️ Homeless ${homeless}</button>
      <button class="chip ${f === 'jobless' ? 'on' : ''}" data-act="petFilter" data-f="jobless">💤 Jobless ${jobless}</button>
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
    const homeOpts = homes.map((b) => {
      const full = residentsOf(s, b.id).length >= homeCapacity(b) && p.homeId !== b.id;
      return `<option value="${b.id}" ${p.homeId === b.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${BUILDINGS[b.type].emoji} ${BUILDINGS[b.type].name} (${residentsOf(s, b.id).length}/${homeCapacity(b)})</option>`;
    }).join('');
    const jobOpts = jobs.map((b) => {
      const full = workersOf(s, b.id).length >= jobSlots(b) && p.jobId !== b.id;
      return `<option value="${b.id}" ${p.jobId === b.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${b.type === sp.favJob ? '⭐ ' : ''}${BUILDINGS[b.type].emoji} ${BUILDINGS[b.type].name} (${workersOf(s, b.id).length}/${jobSlots(b)})</option>`;
    }).join('');
    const body = `
      <div class="hero"><img class="big" src="${this.petImg(p.species)}" alt="">
        <div>
          <p><b style="color:${rar.color}">${rar.name}</b> ${sp.name}</p>
          <p>Level ${p.level}${p.level < CONFIG.maxPetLevel ? ` <span class="bar"><i style="width:${Math.min(100, (p.xp / need) * 100)}%"></i></span>` : ' (max)'}</p>
          <p>Trait: <b>${trait.name}</b> <small>${trait.desc}</small></p>
          <p>Dream job: ${fav.emoji} ${fav.name}</p>
        </div>
      </div>
      <h3>${mood(p.happiness)} Happiness ${Math.round(p.happiness)}%</h3>
      <div class="bar wide"><i style="width:${p.happiness}%"></i></div>
      <ul class="factors">${factors}</ul>
      <p class="hint">Happier pets work faster (up to 1.5×).</p>
      <label>Home <select data-act="setHome" data-id="${p.id}"><option value="">🏚️ No home</option>${homeOpts}</select></label>
      <label>Job <select data-act="setJob" data-id="${p.id}"><option value="">💤 No job</option>${jobOpts}</select></label>
      <div class="row">
        <button class="btn" data-act="rename" data-id="${p.id}">✏️ Rename</button>
        <button class="btn" data-act="findPet" data-id="${p.id}">📍 Find in town</button>
        <button class="btn" data-act="tab" data-tab="pets">← All pets</button>
      </div>`;
    return { title: esc(p.name), body };
  }

  viewHatch(s) {
    let body = `<p class="hint">Make 🍬 treats at a Treat Factory, then hatch eggs to find new citizens. Every new species discovered boosts all production by ${Math.round(CONFIG.collectionBonus * 100)}%.</p><div class="cards">`;
    for (const [id, egg] of Object.entries(EGGS)) {
      const total = Object.values(egg.weights).reduce((a, b) => a + b, 0);
      const odds = RARITY_ORDER.slice().reverse().filter((r) => egg.weights[r]).map((r) => `<span style="color:${RARITIES[r].color}">${RARITIES[r].name} ${Math.round((egg.weights[r] / total) * 100)}%</span>`).join(' · ');
      body += `<div class="card egg-card"><div class="egg">${egg.emoji}</div><div><b>${egg.name}</b><small>${odds}</small>
        <button class="btn primary" data-act="hatch" data-egg="${id}" ${canAfford(s, egg.cost) ? '' : 'disabled'}>Hatch ${this.costHtml(s, egg.cost)}</button></div></div>`;
    }
    body += `</div>`;
    const free = totalHousing(s) - s.pets.filter((p) => p.homeId != null).length;
    if (free <= 0) body += `<p class="warn">⚠️ No free beds. New pets will be homeless until you build more homes.</p>`;
    return { title: '🥚 Hatchery', body };
  }

  viewDex(s) {
    const found = Object.keys(s.discovered).length;
    const total = Object.keys(SPECIES).length;
    let body = `<p class="hint">${found}/${total} species found · production bonus +${Math.round((collectionMul(s) - 1) * 100)}%</p><div class="dex">`;
    for (const r of RARITY_ORDER.slice().reverse()) {
      for (const [id, sp] of Object.entries(SPECIES)) {
        if (sp.rarity !== r) continue;
        const owned = s.pets.filter((p) => p.species === id).length;
        body += s.discovered[id]
          ? `<div class="dex-cell" style="--rc:${RARITIES[r].color}"><img src="${this.petImg(id)}" alt=""><b>${sp.name}</b><small>${owned ? `×${owned}` : 'moved away'}</small></div>`
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
        <li>Happy pets work harder: add gardens and fountains.</li>
        <li>The town keeps working while you're away (up to ${CONFIG.maxOfflineSeconds / 3600}h).</li>
        <li>Controls: drag to move the camera, pinch or scroll to zoom, two-finger twist or right-drag to rotate. Tap things to inspect them.</li>
      </ul>
      <h3>Stats</h3>
      <ul class="factors">
        <li><span>Day</span><b>${days}</b></li>
        <li><span>Citizens</span><b>${s.pets.length}</b></li>
        <li><span>Eggs hatched</span><b>${s.stats.hatched}</b></li>
        <li><span>Strays adopted</span><b>${s.stats.strays}</b></li>
        <li><span>Coins earned</span><b>${fmt(s.stats.coinsEarned)}</b></li>
      </ul>
      <label class="check"><input type="checkbox" data-act="toggleAuto" ${s.settings.autoAssign ? 'checked' : ''}> Auto-assign new pets to homes & jobs</label>
      <div class="row">
        <button class="btn" data-act="saveNow">💾 Save now</button>
        <button class="btn danger" data-act="reset">🔄 Start over</button>
      </div>
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

  showHatch(pet, isNew) {
    const sp = SPECIES[pet.species];
    const rar = RARITIES[sp.rarity];
    this.showModal(`<div class="reveal" style="--rc:${rar.color}">
      <img class="big spin" src="${this.petImg(pet.species)}" alt="">
      <h2>${esc(pet.name)}</h2>
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
