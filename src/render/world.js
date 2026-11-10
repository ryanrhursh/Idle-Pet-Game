// Mirrors the game state in 3D: tiles, buildings, pets walking between
// home and work, floating production pop-ups, and tap picking.

import * as THREE from 'three';
import { BUILDINGS, CONFIG, RARITIES, SPECIES, RESOURCES } from '../game/data.js';
import { getBuilding, workersOf } from '../game/sim.js';
import { buildBuilding, buildPet, buildScenicTree, mat, windowMat } from './models.js';
import { daylight } from './stage.js';

const COLS = CONFIG.gridCols;
const PET_SPEED = 0.9; // units per second

export function tileToWorld(x, y) {
  return new THREE.Vector3(x - COLS / 2 + 0.5, 0, y - CONFIG.startRows / 2 + 0.5);
}

function emojiTexture(text, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.font = `${size * 0.6}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textTexture(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(40,30,60,0.8)';
  ctx.strokeText(text, 64, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// small deterministic RNG for scenery
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.tiles = new THREE.Group();
    this.root.add(this.tiles);
    this.rows = 0;
    this.buildingObjs = new Map(); // id -> { obj, key }
    this.petObjs = new Map(); // id -> visual
    this.popups = [];
    this.puffs = [];
    this.popupTimers = new Map();
    this.selectedPetId = null;
    this.placing = false;

    this.addScenery();

    // selection marker for tiles
    this.tileMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.48, 4, 1, Math.PI / 4),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.tileMarker.rotation.x = -Math.PI / 2;
    this.tileMarker.scale.setScalar(1.41);
    this.tileMarker.visible = false;
    this.root.add(this.tileMarker);

    // bouncing arrow over the selected pet
    this.petMarker = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), mat('#ffd23f', { emissive: '#ffb300', emissiveIntensity: 0.6 }));
    this.petMarker.rotation.x = Math.PI;
    this.petMarker.visible = false;
    this.root.add(this.petMarker);

    this.zzzTex = textTexture('z z', '#cfd8ff');
    this.resTex = {};
    for (const k of Object.keys(RESOURCES)) this.resTex[k] = emojiTexture(RESOURCES[k].emoji);
    this.hitGeo = new THREE.SphereGeometry(0.28, 6, 4);
    this.hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.puffGeo = new THREE.SphereGeometry(0.06, 6, 4);
    this.raycaster = new THREE.Raycaster();
  }

  addScenery() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), mat('#7cc66b'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.root.add(ground);
    // forest ring outside the largest possible town
    const rng = mulberry(42);
    const minX = -COLS / 2 - 0.8, maxX = COLS / 2 + 0.8;
    const minZ = -CONFIG.startRows / 2 - 0.8, maxZ = CONFIG.maxRows - CONFIG.startRows / 2 + 0.8;
    const greens = ['#3f9e4d', '#2f8a42', '#4cae5a', '#358f46'];
    for (let i = 0; i < 160; i++) {
      const x = (rng() - 0.5) * 34, z = (rng() - 0.5) * 30 + 2;
      if (x > minX - 0.5 && x < maxX + 0.5 && z > minZ - 0.5 && z < maxZ + 0.5) continue;
      const t = buildScenicTree(1.2 + rng() * 1.6, greens[i % greens.length]);
      t.position.set(x, -0.05, z);
      t.rotation.y = rng() * 6;
      this.root.add(t);
    }
  }

  rebuildTiles(rows) {
    this.rows = rows;
    this.tiles.clear();
    const geo = new THREE.BoxGeometry(0.96, 0.08, 0.96);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = new THREE.Mesh(geo, mat((x + y) % 2 ? '#a8de8a' : '#9fd681'));
        const p = tileToWorld(x, y);
        t.position.set(p.x, -0.04, p.z);
        t.receiveShadow = true;
        t.userData.tile = { x, y };
        this.tiles.add(t);
      }
    }
    const a = tileToWorld(0, 0), b = tileToWorld(COLS - 1, rows - 1);
    this.stage.setPanBounds(a.x, a.z, b.x, b.z);
  }

  // ---------- state sync ----------

  sync(state) {
    if (state.rows !== this.rows) this.rebuildTiles(state.rows);

    const seen = new Set();
    for (const b of state.buildings) {
      seen.add(b.id);
      const key = `${b.type}:${b.level}`;
      let entry = this.buildingObjs.get(b.id);
      if (!entry || entry.key !== key) {
        if (entry) this.root.remove(entry.obj);
        const obj = buildBuilding(b.type, b.level);
        const p = tileToWorld(b.x, b.y);
        obj.position.copy(p);
        obj.userData.buildingId = b.id;
        obj.scale.multiplyScalar(entry ? 1 : 0.01); // pop in when newly built
        this.root.add(obj);
        entry = { obj, key, grow: entry ? 1 : 0.01, baseScale: 1 + 0.05 * (b.level - 1) };
        if (entry.grow === 1) obj.scale.setScalar(entry.baseScale);
        this.buildingObjs.set(b.id, entry);
      }
    }
    for (const [id, entry] of this.buildingObjs) {
      if (!seen.has(id)) { this.root.remove(entry.obj); this.buildingObjs.delete(id); }
    }

    const petSeen = new Set();
    for (const pet of state.pets) {
      petSeen.add(pet.id);
      if (!this.petObjs.has(pet.id)) this.addPet(state, pet);
    }
    for (const [id, v] of this.petObjs) {
      if (!petSeen.has(id)) { this.root.remove(v.obj); this.petObjs.delete(id); }
    }
  }

  addPet(state, pet) {
    const obj = buildPet(pet.species);
    const rarity = SPECIES[pet.species].rarity;
    if (rarity !== 'common') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.13, 0.17, 20),
        new THREE.MeshBasicMaterial({ color: RARITIES[rarity].color, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      obj.add(ring);
    }
    const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
    hit.position.y = 0.15;
    hit.userData.petId = pet.id;
    obj.add(hit);
    const zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zzzTex, transparent: true, depthWrite: false }));
    zzz.scale.set(0.3, 0.15, 1);
    zzz.position.set(0.1, 0.45, 0);
    zzz.visible = false;
    obj.add(zzz);
    this.root.add(obj);
    const v = {
      obj, zzz, petId: pet.id, seed: pet.id * 1.37,
      pos: new THREE.Vector3(), target: new THREE.Vector3(), moving: false,
      wanderTimer: 0, wanderSpot: null, sleepSpot: null, mode: 'idle', placed: false,
    };
    this.petObjs.set(pet.id, v);
    return v;
  }

  // ---------- per-frame animation ----------

  // Where should this pet be right now? Returns { pos, mode } with mode in
  // work | wander | home | sleep.
  petGoal(state, pet, v, isWork, dt) {
    const rng = Math.random;
    if (isWork && pet.jobId != null) {
      const b = getBuilding(state, pet.jobId);
      if (b) {
        const ws = workersOf(state, b.id);
        const i = ws.findIndex((p) => p.id === pet.id);
        const a = Math.PI / 2 + (i - (ws.length - 1) / 2) * 0.55;
        const p = tileToWorld(b.x, b.y);
        return { pos: new THREE.Vector3(p.x + Math.cos(a) * 0.42, 0, p.z + Math.sin(a) * 0.42), mode: 'work' };
      }
    }
    if (!isWork && pet.homeId != null) {
      const b = getBuilding(state, pet.homeId);
      if (b) {
        const p = tileToWorld(b.x, b.y);
        return { pos: new THREE.Vector3(p.x, 0, p.z + 0.3), mode: 'home' };
      }
    }
    if (!isWork) {
      if (!v.sleepSpot) {
        // homeless pets curl up along the edge of town
        const x = Math.floor(rng() * COLS);
        const p = tileToWorld(x, -1);
        v.sleepSpot = new THREE.Vector3(p.x + (rng() - 0.5) * 0.5, 0, p.z + 0.35);
      }
      return { pos: v.sleepSpot, mode: 'sleep' };
    }
    v.wanderTimer -= dt;
    if (!v.wanderSpot || v.wanderTimer <= 0) {
      const p = tileToWorld(Math.floor(rng() * COLS), Math.floor(rng() * state.rows));
      v.wanderSpot = new THREE.Vector3(p.x + (rng() - 0.5) * 0.6, 0, p.z + 0.4);
      v.wanderTimer = 5 + rng() * 6;
    }
    return { pos: v.wanderSpot, mode: 'wander' };
  }

  update(state, dt, t) {
    const phase = (state.time % CONFIG.dayLength) / CONFIG.dayLength;
    const isWork = phase >= CONFIG.workStart && phase < CONFIG.workEnd;
    const night = 1 - daylight(phase);
    windowMat.emissiveIntensity = night * 1.2;

    // buildings pop in
    for (const e of this.buildingObjs.values()) {
      if (e.grow < 1) {
        e.grow = Math.min(1, e.grow + dt * 3);
        const k = e.grow;
        const overshoot = 1 + Math.sin(k * Math.PI) * 0.15;
        e.obj.scale.setScalar(e.baseScale * k * overshoot);
      }
    }

    for (const pet of state.pets) {
      const v = this.petObjs.get(pet.id);
      if (!v) continue;
      const goal = this.petGoal(state, pet, v, isWork, dt);
      if (!v.placed) {
        v.pos.copy(goal.pos);
        v.placed = true;
      }
      const to = goal.pos.clone().sub(v.pos);
      const dist = to.length();
      const parts = v.obj.userData.parts;
      if (dist > 0.03) {
        v.obj.visible = true;
        const step = Math.min(dist, PET_SPEED * dt);
        v.pos.addScaledVector(to.normalize(), step);
        const targetYaw = Math.atan2(to.x, to.z);
        v.obj.rotation.y += angleDelta(v.obj.rotation.y, targetYaw) * Math.min(1, dt * 10);
        v.obj.rotation.z = 0;
        const hop = Math.abs(Math.sin(t * 12 + v.seed));
        parts.bodyG.position.y = hop * 0.05;
        parts.legs.forEach((leg, i) => { leg.position.y = 0.03 + (i % 2 === 0 ? hop : 1 - hop) * 0.02; });
        v.zzz.visible = false;
        v.mode = 'walk';
      } else {
        v.mode = goal.mode;
        parts.bodyG.position.y = 0;
        if (goal.mode === 'home') {
          v.obj.visible = false; // tucked in for the night
        } else if (goal.mode === 'sleep') {
          v.obj.visible = true;
          v.obj.rotation.z = Math.PI / 2.4;
          v.zzz.visible = true;
          v.zzz.position.y = 0.45 + Math.sin(t * 2 + v.seed) * 0.03;
        } else {
          v.obj.visible = true;
          v.obj.rotation.z = 0;
          v.zzz.visible = false;
          if (goal.mode === 'work') {
            // face the building and do a little working bounce
            const b = getBuilding(state, pet.jobId);
            if (b) {
              const p = tileToWorld(b.x, b.y);
              const yaw = Math.atan2(p.x - v.pos.x, p.z - v.pos.z);
              v.obj.rotation.y += angleDelta(v.obj.rotation.y, yaw) * Math.min(1, dt * 6);
            }
            parts.bodyG.position.y = Math.max(0, Math.sin(t * 6 + v.seed)) * 0.025;
            parts.headG.rotation.x = Math.sin(t * 6 + v.seed) * 0.15;
          } else {
            parts.headG.rotation.y = Math.sin(t * 0.8 + v.seed) * 0.5;
          }
        }
      }
      if (parts.tail) parts.tail.rotation.y = Math.sin(t * 5 + v.seed) * 0.4;
      v.obj.position.copy(v.pos);
    }

    // selection markers
    const sel = this.selectedPetId != null ? this.petObjs.get(this.selectedPetId) : null;
    if (sel && sel.obj.visible) {
      this.petMarker.visible = true;
      this.petMarker.position.set(sel.pos.x, 0.6 + Math.sin(t * 4) * 0.05, sel.pos.z);
      this.petMarker.rotation.y = t * 2;
    } else this.petMarker.visible = false;
    if (this.tileMarker.visible) this.tileMarker.material.opacity = 0.6 + Math.sin(t * 5) * 0.3;

    this.updateEffects(state, dt, isWork);
  }

  updateEffects(state, dt, isWork) {
    // floating "+resource" icons over staffed workplaces
    for (const b of state.buildings) {
      const def = BUILDINGS[b.type];
      if (def.type !== 'job') continue;
      const staffed = workersOf(state, b.id).some((p) => {
        const v = this.petObjs.get(p.id);
        return v && v.mode === 'work';
      });
      if (!staffed || !isWork) continue;
      let timer = (this.popupTimers.get(b.id) ?? Math.random() * 3) - dt;
      if (timer <= 0) {
        timer = 3 + Math.random() * 2;
        const res = Object.keys(def.produces)[0];
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.resTex[res], transparent: true, depthWrite: false }));
        const p = tileToWorld(b.x, b.y);
        s.position.set(p.x, 0.7, p.z);
        s.scale.setScalar(0.32);
        s.userData.life = 0;
        this.root.add(s);
        this.popups.push(s);
        if (b.type === 'bakery' || b.type === 'candy') this.spawnPuff(b);
      }
      this.popupTimers.set(b.id, timer);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const s = this.popups[i];
      s.userData.life += dt;
      s.position.y += dt * 0.35;
      s.material.opacity = 1 - s.userData.life / 1.6;
      if (s.userData.life > 1.6) {
        this.root.remove(s);
        s.material.dispose();
        this.popups.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.userData.life += dt;
      p.position.y += dt * 0.25;
      p.position.x += dt * 0.08;
      p.scale.setScalar(1 + p.userData.life * 1.5);
      p.material.opacity = 0.7 * (1 - p.userData.life / 2.5);
      if (p.userData.life > 2.5) {
        this.root.remove(p);
        p.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  spawnPuff(b) {
    const p = new THREE.Mesh(this.puffGeo, new THREE.MeshLambertMaterial({ color: '#f2f2f2', transparent: true, opacity: 0.7, depthWrite: false }));
    const w = tileToWorld(b.x, b.y);
    const off = b.type === 'bakery' ? [-0.18, 0.7, -0.08] : [0.2, 0.86, -0.12];
    p.position.set(w.x + off[0], off[1], w.z + off[2]);
    p.userData.life = 0;
    this.root.add(p);
    this.puffs.push(p);
  }

  // ---------- selection & picking ----------

  selectTile(tile) {
    if (!tile) { this.tileMarker.visible = false; return; }
    const p = tileToWorld(tile.x, tile.y);
    this.tileMarker.position.set(p.x, 0.012, p.z);
    this.tileMarker.material.color.set(tile.color || '#ffffff');
    this.tileMarker.visible = true;
  }

  focusPet(petId) {
    const v = this.petObjs.get(petId);
    if (v) this.stage.focus(v.pos.x, v.pos.z);
  }

  focusTile(x, y) {
    const p = tileToWorld(x, y);
    this.stage.focus(p.x, p.z);
  }

  // ndc: {x, y} in -1..1. Returns { petId } or { tile: {x, y} } or null.
  pick(ndc) {
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const petHits = [];
    for (const v of this.petObjs.values()) if (v.obj.visible) petHits.push(v.obj.children.find((c) => c.userData.petId != null));
    const hp = this.raycaster.intersectObjects(petHits, false)[0];
    if (hp) return { petId: hp.object.userData.petId };
    const ht = this.raycaster.intersectObjects(this.tiles.children, false)[0];
    // buildings stick up above the tiles: a roof in front of a tile wins
    const objs = [...this.buildingObjs.values()].map((e) => e.obj);
    const hb = this.raycaster.intersectObjects(objs, true)[0];
    if (hb && (!ht || hb.distance < ht.distance)) {
      let o = hb.object;
      while (o && o.userData.buildingId == null) o = o.parent;
      if (o) return { buildingId: o.userData.buildingId };
    }
    if (ht) return { tile: ht.object.userData.tile };
    return null;
  }
}

function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
