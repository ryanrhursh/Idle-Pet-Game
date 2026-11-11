// Renderer, camera, controls, lights and the day/night sky.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SKY_DAY = new THREE.Color('#9ad7ff');
const SKY_DUSK = new THREE.Color('#f6a46c');
const SKY_NIGHT = new THREE.Color('#141a38');
const tmpColor = new THREE.Color();

// 0 = night, 1 = full day, for a day phase in [0, 1).
export function daylight(phase) {
  if (phase < 0.08) return phase / 0.08;
  if (phase < 0.68) return 1;
  if (phase < 0.78) return 1 - (phase - 0.68) / 0.1;
  return 0;
}

export class Stage {
  constructor(container) {
    this.container = container;
    const isMobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 2.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = SKY_DAY.clone();
    this.scene.fog = new THREE.Fog(SKY_DAY.clone(), 22, 45);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 7.5, 8);
    this.inset = { x: 0, y: 0 }; // px the view is shifted to dodge open panels
    this.insetGoal = { x: 0, y: 0 };

    const c = (this.controls = new OrbitControls(this.camera, this.renderer.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    c.minDistance = 4;
    c.maxDistance = 20;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = 1.2;
    c.screenSpacePanning = false; // pan across the ground, not up into the sky
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.panBounds = new THREE.Box3(new THREE.Vector3(-5, 0, -4), new THREE.Vector3(5, 0, 6));
    this.focusGoal = null;

    // lights
    this.hemi = new THREE.HemisphereLight('#ffffff', '#5a7d4a', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#9fb4ff', 0);
    this.moon.position.set(-6, 10, -4);
    this.scene.add(this.moon);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const r = 40;
      pts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.25, transparent: true, opacity: 0, fog: false });
    this.scene.add(new THREE.Points(starGeo, this.starMat));

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // portrait phones: pull back so the whole town fits
    this.camera.fov = w < h ? 55 : 40;
    this.applyInset();
    this.camera.updateProjectionMatrix();
  }

  // Keep the town centred in the part of the screen not covered by UI panels.
  setInset(right, bottom) {
    this.insetGoal = { x: right / 2, y: bottom / 2 };
  }

  applyInset() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    if (this.inset.x || this.inset.y) this.camera.setViewOffset(w, h, this.inset.x, this.inset.y, w, h);
    else this.camera.clearViewOffset();
  }

  setPanBounds(minX, minZ, maxX, maxZ) {
    this.panBounds.min.set(minX, 0, minZ);
    this.panBounds.max.set(maxX, 0, maxZ);
  }

  focus(x, z) {
    this.focusGoal = new THREE.Vector3(x, 0, z);
  }

  setDayPhase(phase) {
    const d = daylight(phase);
    // sun sweeps from east to west during the day
    const a = Math.PI * Math.min(1, phase / 0.78);
    this.sun.position.set(Math.cos(a) * 12, 4 + Math.sin(a) * 12, 6);
    this.sun.intensity = 2.4 * d;
    this.hemi.intensity = 0.45 + 1.2 * d;
    this.moon.intensity = 0.6 * (1 - d);
    const dusk = Math.max(0, 1 - Math.abs(d - 0.5) * 2.2) * (d < 1 && d > 0 ? 1 : 0);
    tmpColor.copy(SKY_NIGHT).lerp(SKY_DAY, d).lerp(SKY_DUSK, dusk * 0.6);
    this.scene.background.copy(tmpColor);
    this.scene.fog.color.copy(tmpColor);
    this.starMat.opacity = Math.max(0, 1 - d * 1.5);
    return d;
  }

  update() {
    const c = this.controls;
    const dx = this.insetGoal.x - this.inset.x, dy = this.insetGoal.y - this.inset.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) {
      this.inset.x += dx * 0.2;
      this.inset.y += dy * 0.2;
      this.applyInset();
    } else if (dx || dy) {
      this.inset = { ...this.insetGoal };
      this.applyInset();
    }
    if (this.focusGoal) {
      const delta = this.focusGoal.clone().sub(c.target).multiplyScalar(0.12);
      c.target.add(delta);
      this.camera.position.add(delta);
      if (delta.lengthSq() < 1e-6) this.focusGoal = null;
    }
    c.update();
    // keep the camera over the town
    const clamped = c.target.clone().clamp(this.panBounds.min, this.panBounds.max);
    if (!clamped.equals(c.target)) {
      const shift = clamped.sub(c.target);
      c.target.add(shift);
      this.camera.position.add(shift);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
