// Procedural low-poly models for buildings and pets. No external assets:
// everything is built from primitives so it loads instantly on any device.

import * as THREE from 'three';

// ---------- shared materials / geometry ----------

const matCache = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return matCache.get(key);
}

// Windows glow at night: the world updates emissiveIntensity on this one material.
export const windowMat = new THREE.MeshLambertMaterial({ color: '#ffe9a8', emissive: '#ffc95c', emissiveIntensity: 0 });

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sphere = (r, ws = 10, hs = 8) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cyl = (rt, rb, h, s = 10) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t) => geo(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 6, 12));
const capsule = (r, l) => geo(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));

// A gable roof: triangular prism, `w` wide (x), `h` tall, `d` deep (z), base at y=0.
function gable(w, h, d) {
  return geo(`g${w},${h},${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  });
}

function m(geometry, material, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(geometry, typeof material === 'string' ? mat(material) : material);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  if (opts.s) Array.isArray(opts.s) ? mesh.scale.set(...opts.s) : mesh.scale.setScalar(opts.s);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  return mesh;
}

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

// ---------- buildings ----------

function tree(x, z, scale = 1, color = '#3f9e4d') {
  return group(
    m(cyl(0.035, 0.045, 0.16, 6), '#7a5230', x, 0.08 * scale, z, { s: scale }),
    m(cone(0.14, 0.3, 7), color, x, 0.3 * scale, z, { s: scale }),
    m(cone(0.1, 0.22, 7), color, x, 0.44 * scale, z, { s: scale }),
  );
}

function door(z, x = 0, color = '#7a4a2a') {
  return m(box(0.12, 0.2, 0.02), color, x, 0.1, z);
}

function windowPane(x, y, z, ry = 0) {
  return m(box(0.09, 0.09, 0.015), windowMat, x, y, z, { ry, shadow: false });
}

const BUILDERS = {
  hut() {
    return group(
      m(cyl(0.26, 0.28, 0.26, 9), '#c99a63', 0, 0.13, 0),
      m(cone(0.38, 0.32, 9), '#e9c46a', 0, 0.42, 0),
      door(0.27),
      windowPane(0.18, 0.15, 0.19, Math.PI / 4),
    );
  },
  cottage() {
    return group(
      m(box(0.56, 0.36, 0.46), '#f7ead2', 0, 0.18, 0),
      m(gable(0.66, 0.26, 0.54), '#d9534f', 0, 0.36, 0),
      m(box(0.08, 0.16, 0.08), '#9a6b4f', 0.16, 0.52, -0.08),
      door(0.235),
      windowPane(-0.17, 0.2, 0.235),
      windowPane(0.17, 0.2, 0.235),
    );
  },
  townhouse() {
    const g = new THREE.Group();
    const colors = ['#9ec5e8', '#f2c57c', '#c3a6e0'];
    const heights = [0.55, 0.7, 0.5];
    for (let i = 0; i < 3; i++) {
      const x = -0.27 + i * 0.27;
      const h = heights[i];
      g.add(m(box(0.25, h, 0.5), colors[i], x, h / 2, 0));
      g.add(m(gable(0.29, 0.14, 0.54), '#6d6875', x, h, 0));
      g.add(door(0.255, x));
      for (let row = 0.32; row < h - 0.05; row += 0.18) g.add(windowPane(x, row, 0.255));
    }
    return g;
  },
  farm() {
    const g = group(m(box(0.88, 0.05, 0.88), '#8d5a3b', 0, 0.025, 0, { shadow: false }));
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        const x = c * 0.27, z = r * 0.27;
        g.add(m(sphere(0.09, 7, 5), '#4caf50', x, 0.1, z, { s: [1, 0.8, 1] }));
        g.add(m(sphere(0.025, 5, 4), '#e53950', x + 0.05, 0.14, z + 0.05));
        g.add(m(sphere(0.025, 5, 4), '#e53950', x - 0.04, 0.15, z - 0.02));
      }
    }
    // little scarecrow-ish post
    g.add(m(cyl(0.015, 0.015, 0.3, 5), '#7a5230', 0.38, 0.15, 0.38));
    g.add(m(box(0.18, 0.02, 0.02), '#7a5230', 0.38, 0.24, 0.38));
    return g;
  },
  lumber() {
    return group(
      tree(-0.25, -0.22, 1.1), tree(0.22, -0.28, 0.95, '#2f8a42'), tree(-0.28, 0.2, 0.85, '#358f46'),
      m(cyl(0.07, 0.08, 0.06, 8), '#a4723f', 0.15, 0.03, 0.12),
      m(cyl(0.04, 0.04, 0.32, 7), '#9c6a3a', 0.2, 0.05, 0.3, { rz: Math.PI / 2 }),
      m(cyl(0.04, 0.04, 0.32, 7), '#8f5f33', 0.2, 0.05, 0.38, { rz: Math.PI / 2 }),
      m(cyl(0.04, 0.04, 0.32, 7), '#9c6a3a', 0.2, 0.12, 0.34, { rz: Math.PI / 2 }),
    );
  },
  market() {
    const g = group(
      m(box(0.6, 0.18, 0.3), '#b5835a', 0, 0.09, 0.05),
      m(box(0.08, 0.08, 0.08), '#e76f51', -0.15, 0.22, 0.05),
      m(box(0.08, 0.08, 0.08), '#2a9d8f', 0, 0.22, 0.05),
      m(sphere(0.045, 7, 5), '#f4a261', 0.15, 0.22, 0.05),
      m(box(0.16, 0.12, 0.16), '#c8965f', 0.3, 0.06, -0.3),
      m(box(0.12, 0.1, 0.12), '#c8965f', 0.36, 0.17, -0.28),
    );
    for (const [x, z] of [[-0.3, -0.12], [0.3, -0.12], [-0.3, 0.2], [0.3, 0.2]]) g.add(m(cyl(0.015, 0.015, 0.46, 5), '#7a5230', x, 0.23, z));
    for (let i = 0; i < 6; i++) {
      g.add(m(box(0.11, 0.025, 0.42), i % 2 ? '#ffffff' : '#e63946', -0.275 + i * 0.11, 0.47, 0.04, { rx: 0.25 }));
    }
    return g;
  },
  bakery() {
    return group(
      m(box(0.6, 0.4, 0.5), '#f3d5b5', 0, 0.2, 0),
      m(gable(0.7, 0.24, 0.58), '#8d5b4c', 0, 0.4, 0),
      m(cyl(0.05, 0.06, 0.22, 8), '#a39e93', -0.18, 0.56, -0.08),
      door(0.255),
      windowPane(-0.18, 0.2, 0.255),
      windowPane(0.18, 0.2, 0.255),
      m(cyl(0.08, 0.08, 0.02, 12), '#ffd166', 0, 0.36, 0.27, { rx: Math.PI / 2 }),
      m(torus(0.04, 0.018), '#c77d3a', 0, 0.36, 0.285),
    );
  },
  candy() {
    return group(
      m(box(0.66, 0.42, 0.52), '#ffc2d9', 0, 0.21, 0),
      m(box(0.7, 0.06, 0.56), '#9b5de5', 0, 0.45, 0),
      m(cyl(0.07, 0.09, 0.42, 8), '#c9184a', 0.2, 0.62, -0.12),
      m(cyl(0.075, 0.075, 0.04, 8), '#ffffff', 0.2, 0.7, -0.12),
      m(sphere(0.1, 10, 8), '#ff5d8f', -0.16, 0.6, 0.06),
      m(cone(0.05, 0.08, 6), '#ffd6e5', -0.29, 0.6, 0.06, { rz: Math.PI / 2 }),
      m(cone(0.05, 0.08, 6), '#ffd6e5', -0.03, 0.6, 0.06, { rz: -Math.PI / 2 }),
      door(0.265),
      windowPane(0.18, 0.22, 0.265),
      windowPane(-0.18, 0.22, 0.265),
    );
  },
  garden() {
    const g = group(m(box(0.86, 0.04, 0.86), '#6fcf6b', 0, 0.02, 0, { shadow: false }));
    const colors = ['#ff6b9a', '#ffd23f', '#a06cd5', '#ff8c42', '#ffffff', '#4cc9f0'];
    let i = 0;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if ((r + c) % 2) continue;
        const x = c * 0.16 + (r % 2) * 0.03, z = r * 0.16;
        g.add(m(cyl(0.008, 0.008, 0.1, 4), '#2d6a4f', x, 0.09, z, { shadow: false }));
        g.add(m(sphere(0.035, 6, 4), colors[i++ % colors.length], x, 0.15, z));
      }
    }
    g.add(m(box(0.3, 0.03, 0.08), '#a0785a', 0, 0.12, -0.36));
    g.add(m(box(0.02, 0.1, 0.06), '#7a5230', -0.12, 0.06, -0.36));
    g.add(m(box(0.02, 0.1, 0.06), '#7a5230', 0.12, 0.06, -0.36));
    return g;
  },
  fountain() {
    return group(
      m(box(0.86, 0.04, 0.86), '#d8d2c4', 0, 0.02, 0, { shadow: false }),
      m(cyl(0.36, 0.38, 0.1, 14), '#bfb8aa', 0, 0.09, 0),
      m(cyl(0.32, 0.32, 0.02, 14), mat('#5ec8f2', { emissive: '#1d6f99', emissiveIntensity: 0.25 }), 0, 0.14, 0, { shadow: false }),
      m(cyl(0.05, 0.07, 0.3, 8), '#bfb8aa', 0, 0.25, 0),
      m(cyl(0.15, 0.06, 0.05, 12), '#bfb8aa', 0, 0.4, 0),
      m(sphere(0.06, 8, 6), mat('#8fe3ff', { emissive: '#3aa7d8', emissiveIntensity: 0.4 }), 0, 0.46, 0),
    );
  },
};

const PIP_GEO = new THREE.OctahedronGeometry(0.035);
const PIP_MAT = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#b8860b', emissiveIntensity: 0.4 });

export function buildBuilding(type, level = 1, { pips = true } = {}) {
  const g = BUILDERS[type]();
  g.scale.setScalar(1 + 0.05 * (level - 1));
  // gold pips along the front-left show the building's level
  for (let i = 0; pips && i < level; i++) {
    const pip = new THREE.Mesh(PIP_GEO, PIP_MAT);
    pip.position.set(-0.42 + i * 0.08, 0.05, 0.42);
    g.add(pip);
  }
  return g;
}

export function buildScenicTree(scale, color) {
  return tree(0, 0, scale, color);
}

// ---------- pets ----------

const LOOKS = {
  mouse: { fur: '#b9b4c4', belly: '#ece6f2', ears: 'round', earSize: 1.5, inner: '#ffb3c8', tail: 'thin', nose: '#ff8fb1' },
  bunny: { fur: '#f4efe9', ears: 'long', inner: '#ffc2d1', tail: 'puff', nose: '#ff9fb8' },
  chick: { fur: '#ffd93b', ears: 'none', beak: '#ff9a2e', wings: true, tail: 'none', feet: '#ff9a2e', headSize: 0.85 },
  hamster: { fur: '#e8a963', belly: '#fff2dc', ears: 'round', earSize: 0.8, tail: 'none', chubby: true, nose: '#ff9fb8' },
  frog: { fur: '#6cc04a', belly: '#d8f0a0', ears: 'none', frogEyes: true, tail: 'none', chubby: true },
  dog: { fur: '#c98b4f', belly: '#f3dcc0', ears: 'floppy', earColor: '#8a5a2e', tail: 'long', nose: '#2b2b2b' },
  cat: { fur: '#f0a04b', belly: '#fff1dd', ears: 'pointy', inner: '#ffb3c8', tail: 'long', nose: '#ff8fb1' },
  pig: { fur: '#ffb3c1', ears: 'pointy', earSize: 0.8, snout: '#ff8fa3', tail: 'curly', chubby: true },
  beaver: { fur: '#8b5a33', belly: '#c49a6c', ears: 'round', earSize: 0.7, tail: 'flat', tailColor: '#4a3326', teeth: true, nose: '#2b2b2b' },
  hedgehog: { fur: '#9b7653', face: '#f1d9b5', ears: 'round', earSize: 0.7, spikes: '#6b4f36', tail: 'none', nose: '#2b2b2b' },
  fox: { fur: '#ef7a2c', belly: '#ffffff', ears: 'pointy', earColor: '#3a2a20', tail: 'bushy', tailTip: '#ffffff', nose: '#2b2b2b' },
  owl: { fur: '#8c6b4a', belly: '#e9d6b8', ears: 'tufts', beak: '#f2b134', wings: true, bigEyes: true, tail: 'none', feet: '#f2b134' },
  raccoon: { fur: '#8f8f97', belly: '#d6d6dc', mask: '#2e2e33', ears: 'pointy', tail: 'bushy', tailTip: '#2e2e33', nose: '#2b2b2b' },
  koala: { fur: '#a7a9b0', belly: '#e5e5ea', ears: 'round', earSize: 1.7, inner: '#e5e5ea', bigNose: '#3a3a40', tail: 'none' },
  panda: { fur: '#fafafa', ears: 'round', earColor: '#222222', patches: '#222222', limbs: '#222222', tail: 'puff', chubby: true, nose: '#222222' },
  tiger: { fur: '#f39233', belly: '#fff5e6', ears: 'round', stripes: '#2b2b2b', tail: 'long', nose: '#ff8fb1' },
  unicorn: { fur: '#ffffff', ears: 'pointy', horn: '#ffd54f', mane: '#c58cff', tail: 'long', tailColor: '#c58cff', size: 1.1 },
  lion: { fur: '#e8b04f', belly: '#fff0cc', ears: 'round', mane: '#a8642a', tail: 'long', tailTip: '#a8642a', size: 1.2, nose: '#5a3a2a' },
  dragon: { fur: '#5bbf7a', belly: '#f5e7a1', ears: 'none', horns: '#fff4d6', wings: true, wingColor: '#3f8f5a', spikes: '#3f8f5a', tail: 'long', size: 1.25 },
};

// Returns a THREE.Group facing +z, ~0.35 units tall, feet at y=0.
// userData.parts holds bits the animator wiggles.
export function buildPet(speciesId) {
  const L = LOOKS[speciesId];
  const root = new THREE.Group();
  const bodyG = new THREE.Group(); // bobs while walking
  root.add(bodyG);
  const fur = L.fur;
  const chub = L.chubby ? 1.15 : 1;

  // body
  const body = m(sphere(0.11), fur, 0, 0.13, -0.02, { s: [1 * chub, 0.95, 1.2] });
  bodyG.add(body);
  if (L.belly) bodyG.add(m(sphere(0.085), L.belly, 0, 0.12, 0.05, { s: [0.9 * chub, 0.9, 0.7] }));
  if (L.stripes) for (const z of [-0.08, -0.02, 0.04]) bodyG.add(m(box(0.23 * chub, 0.03, 0.025), L.stripes, 0, 0.2, z, { s: [1, 1, 1] }));
  if (L.spikes) {
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      bodyG.add(m(cone(0.03, 0.08, 5), L.spikes, Math.sin(a) * 0.08, 0.2 + Math.cos(a) * 0.02, -0.06 + (i % 2) * 0.05, { rz: -a * 0.9, rx: -0.4 }));
    }
  }

  // legs
  const legC = L.limbs || L.feet || fur;
  const legs = [];
  for (const [x, z] of [[-0.06, 0.07], [0.06, 0.07], [-0.06, -0.09], [0.06, -0.09]]) {
    const leg = m(cyl(0.028, 0.03, 0.06, 6), legC, x * chub, 0.03, z);
    root.add(leg);
    legs.push(leg);
  }

  // head
  const headG = new THREE.Group();
  headG.position.set(0, 0.27, 0.09);
  bodyG.add(headG);
  const hs = L.headSize || 1;
  headG.add(m(sphere(0.1 * hs), L.face || fur, 0, 0, 0, { s: [1.05, 0.95, 1] }));
  const eyeY = 0.02, eyeZ = 0.085 * hs;
  if (L.frogEyes) {
    for (const x of [-0.05, 0.05]) {
      headG.add(m(sphere(0.035, 8, 6), '#ffffff', x, 0.07, 0.04));
      headG.add(m(sphere(0.018, 6, 4), '#1d1d1d', x, 0.08, 0.07, { shadow: false }));
    }
  } else {
    const er = L.bigEyes ? 0.03 : 0.017;
    for (const x of [-0.042, 0.042]) {
      if (L.bigEyes) headG.add(m(sphere(0.04, 8, 6), '#fff6e0', x, eyeY, eyeZ - 0.01, { s: [1, 1, 0.5], shadow: false }));
      headG.add(m(sphere(er, 6, 4), '#1d1d1d', x, eyeY, eyeZ, { shadow: false }));
      headG.add(m(sphere(er * 0.35, 4, 3), '#ffffff', x + 0.007, eyeY + 0.008, eyeZ + er * 0.8, { shadow: false }));
    }
  }
  if (L.mask) headG.add(m(box(0.15, 0.04, 0.03), L.mask, 0, eyeY, eyeZ - 0.012, { shadow: false }));
  if (L.patches) for (const x of [-0.042, 0.042]) headG.add(m(sphere(0.03, 6, 4), L.patches, x, eyeY, eyeZ - 0.012, { s: [1, 1.2, 0.5], shadow: false }));
  if (L.nose) headG.add(m(sphere(0.014, 5, 4), L.nose, 0, -0.015, 0.1 * hs, { shadow: false }));
  if (L.bigNose) headG.add(m(sphere(0.03, 6, 5), L.bigNose, 0, -0.01, 0.095, { s: [0.9, 1.1, 0.7] }));
  if (L.snout) {
    headG.add(m(cyl(0.035, 0.035, 0.03, 8), L.snout, 0, -0.02, 0.1, { rx: Math.PI / 2 }));
    for (const x of [-0.012, 0.012]) headG.add(m(sphere(0.007, 4, 3), '#c45c72', x, -0.02, 0.117, { shadow: false }));
  }
  if (L.beak) headG.add(m(cone(0.025, 0.05, 5), L.beak, 0, -0.015, 0.11, { rx: Math.PI / 2 }));
  if (L.teeth) headG.add(m(box(0.025, 0.025, 0.01), '#ffffff', 0, -0.05, 0.088, { shadow: false }));
  // blush
  if (!L.frogEyes && !L.beak) for (const x of [-0.065, 0.065]) headG.add(m(sphere(0.014, 5, 3), mat('#ff9fb3', { transparent: true, opacity: 0.6 }), x, -0.02, 0.07, { s: [1, 0.6, 0.4], shadow: false }));

  // ears
  const es = L.earSize || 1;
  const ec = L.earColor || fur;
  if (L.ears === 'round') {
    for (const x of [-0.065, 0.065]) {
      headG.add(m(sphere(0.035 * es, 7, 5), ec, x * (1 + (es - 1) * 0.3), 0.075, -0.01, { s: [1, 1, 0.45] }));
      if (L.inner) headG.add(m(sphere(0.022 * es, 6, 4), L.inner, x * (1 + (es - 1) * 0.3), 0.075, 0.004, { s: [1, 1, 0.3], shadow: false }));
    }
  } else if (L.ears === 'long') {
    for (const x of [-0.035, 0.035]) {
      headG.add(m(capsule(0.025, 0.12), ec, x, 0.16, -0.02, { rz: x * 2, s: [1, 1, 0.6] }));
      if (L.inner) headG.add(m(capsule(0.014, 0.09), L.inner, x, 0.16, -0.005, { rz: x * 2, s: [1, 1, 0.4], shadow: false }));
    }
  } else if (L.ears === 'pointy') {
    for (const x of [-0.055, 0.055]) headG.add(m(cone(0.035 * es, 0.07 * es, 4), ec, x, 0.09, 0, { rz: -x * 3 }));
  } else if (L.ears === 'floppy') {
    for (const x of [-0.09, 0.09]) headG.add(m(sphere(0.04, 7, 5), ec, x, -0.005, -0.01, { s: [0.45, 1.3, 0.8], rz: x * 2 }));
  } else if (L.ears === 'tufts') {
    for (const x of [-0.06, 0.06]) headG.add(m(cone(0.02, 0.06, 4), fur, x, 0.09, 0.01, { rz: -x * 6 }));
  }
  if (L.horn) headG.add(m(cone(0.018, 0.1, 6), mat(L.horn, { emissive: '#a07800', emissiveIntensity: 0.3 }), 0, 0.11, 0.04, { rx: 0.4 }));
  if (L.horns) for (const x of [-0.045, 0.045]) headG.add(m(cone(0.015, 0.07, 5), L.horns, x, 0.09, -0.03, { rx: -0.5, rz: -x * 4 }));
  if (L.mane) {
    if (L.horn) {
      for (let i = 0; i < 4; i++) bodyG.add(m(sphere(0.03, 6, 4), L.mane, 0, 0.3 - i * 0.03, 0.04 - i * 0.04));
    } else {
      headG.add(m(torus(0.09, 0.04), L.mane, 0, 0, -0.03));
    }
  }

  // wings
  if (L.wings) {
    const wc = L.wingColor || fur;
    for (const x of [-1, 1]) {
      const w = m(sphere(0.06, 6, 4), wc, x * 0.11 * chub, 0.15, -0.03, { s: [0.3, 0.8, 1.2], rz: x * 0.3 });
      bodyG.add(w);
    }
  }

  // tail
  const tc = L.tailColor || fur;
  let tail = null;
  if (L.tail === 'puff') tail = m(sphere(0.04, 6, 5), L.limbs ? fur : tc, 0, 0.14, -0.15);
  else if (L.tail === 'thin') tail = m(cyl(0.008, 0.012, 0.18, 4), L.inner || tc, 0, 0.12, -0.2, { rx: -1.1 });
  else if (L.tail === 'long') {
    tail = new THREE.Group();
    tail.position.set(0, 0.14, -0.14);
    tail.add(m(cyl(0.018, 0.022, 0.16, 5), tc, 0, 0.06, -0.03, { rx: -0.5 }));
    if (L.tailTip) tail.add(m(sphere(0.028, 5, 4), L.tailTip, 0, 0.13, -0.07));
  } else if (L.tail === 'bushy') {
    tail = new THREE.Group();
    tail.position.set(0, 0.14, -0.14);
    tail.add(m(sphere(0.06, 7, 5), tc, 0, 0.05, -0.05, { s: [0.8, 0.8, 1.6], rx: -0.6 }));
    if (L.tailTip) tail.add(m(sphere(0.035, 6, 4), L.tailTip, 0, 0.1, -0.12));
  } else if (L.tail === 'curly') tail = m(torus(0.025, 0.008), tc, 0, 0.15, -0.15, { ry: Math.PI / 2 });
  else if (L.tail === 'flat') tail = m(box(0.08, 0.02, 0.14), tc, 0, 0.04, -0.2, { rx: 0.2 });
  if (tail) bodyG.add(tail);

  root.scale.setScalar(L.size || 1);
  root.userData.parts = { bodyG, headG, legs, tail };
  return root;
}

// ---------- portraits ----------
// Render a model once into an offscreen target and turn it into an <img> URL.
// Reuses the main renderer so mobile browsers only need one WebGL context.

const portraitCache = new Map();
let pScene, pCam, pTarget;

export function portrait(renderer, key, makeModel, size = 128) {
  if (portraitCache.has(key)) return portraitCache.get(key);
  if (!pScene) {
    pScene = new THREE.Scene();
    pScene.add(new THREE.HemisphereLight('#ffffff', '#8a7f72', 2.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.6);
    d.position.set(1, 2, 2);
    pScene.add(d);
    pCam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
    pTarget = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    pTarget.texture.colorSpace = THREE.SRGBColorSpace;
  }
  const model = makeModel();
  pScene.add(model);
  const bbox = new THREE.Box3().setFromObject(model);
  const center = bbox.getCenter(new THREE.Vector3());
  const radius = bbox.getSize(new THREE.Vector3()).length() / 2;
  const dist = radius / Math.sin((pCam.fov * Math.PI) / 360) * 0.95;
  pCam.position.set(center.x + dist * 0.45, center.y + dist * 0.35, center.z + dist * 0.82);
  pCam.lookAt(center);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setRenderTarget(pTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(pScene, pCam);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(pTarget, 0, 0, size, size, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  pScene.remove(model);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    // WebGL rows are bottom-up
    img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  portraitCache.set(key, url);
  return url;
}
