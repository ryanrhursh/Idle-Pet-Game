// Sound effects and background music, all synthesized with the Web Audio API.
// There are no audio files: every sound is a few oscillators, so it loads instantly,
// works offline and is entirely original.
//
// Browsers (especially iOS) only allow audio after a tap, so nothing starts until
// unlock() has been called from a user gesture. Every function is safe to call before that
// (it just does nothing), and none of them ever throws.

let ctx = null;
let master = null, sfxBus = null, musicBus = null, echo = null;
let noiseBuf = null;
let settings = { sfx: true, music: true };
let night = false;
let musicTimer = null;
let nextBeat = 0;
let beatIndex = 0;

const SFX_VOLUME = 0.32;
const MUSIC_VOLUME = 0.16;
const BEAT = 0.8; // seconds per beat (75 bpm)

// C major pentatonic, so any random note sounds nice over any chord.
const SCALE = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// slow chord loop: C, Am, F, G (root MIDI note; each chord is root + major/minor third + fifth)
const CHORDS = [[48, 4], [45, 3], [41, 4], [43, 4]];

function ready() {
  return ctx && ctx.state === 'running';
}

function build() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  // a soft feedback echo gives the music some space
  echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  echo.connect(fb);
  fb.connect(echo);
  echo.connect(wet);
  wet.connect(musicBus);
  // one second of white noise, reused for thuds and whooshes
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// Call from a tap/click/key handler. Creates the audio engine the first time.
export function unlock() {
  try {
    if (!ctx) build();
    if (ctx && ctx.state !== 'running') ctx.resume().then(applyMusic).catch(() => {});
    else applyMusic();
  } catch { /* audio is a nice-to-have */ }
}

// Stop the sound when the app is in the background; pick it up again when it comes back.
export function setActive(active) {
  try {
    if (!ctx) return;
    if (active) ctx.resume().then(applyMusic).catch(() => {});
    else ctx.suspend().catch(() => {});
  } catch { /* ignore */ }
}

export function setAudioSettings(s) {
  settings = { sfx: s.sfx !== false, music: s.music !== false };
  applyMusic();
}

export function setNight(isNight) {
  night = !!isNight;
}

// ---------- building blocks ----------

// One note: oscillator with a quick attack and an exponential fade out.
function tone(freq, start, dur, { type = 'sine', gain = 0.5, to = freq, bus = sfxBus, attack = 0.008, send = 0 } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(bus);
  if (send) {
    const s = ctx.createGain();
    s.gain.value = send;
    g.connect(s);
    s.connect(echo);
  }
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// A burst of filtered noise (thuds, whooshes).
function noise(start, dur, { freq = 800, to = freq, gain = 0.4, q = 0.8 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, start);
  f.frequency.exponentialRampToValueAtTime(to, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(start);
  src.stop(start + dur + 0.05);
}

const arp = (notes, t, step, opts) => notes.forEach((n, i) => tone(midi(n), t + i * step, 0.35, opts));

// ---------- sound effects ----------

const SOUNDS = {
  tap: (t) => tone(880, t, 0.06, { type: 'triangle', gain: 0.18, to: 660 }),
  good: (t) => arp([72, 76], t, 0.07, { type: 'triangle', gain: 0.25 }),
  chime: (t) => arp([72, 76, 79], t, 0.08, { type: 'triangle', gain: 0.3 }),
  bad: (t) => arp([55, 50], t, 0.12, { type: 'triangle', gain: 0.3 }),
  build: (t) => {
    noise(t, 0.12, { freq: 900, to: 150, gain: 0.5 });
    tone(130, t, 0.18, { gain: 0.6, to: 55 });
    tone(midi(67), t + 0.1, 0.25, { type: 'triangle', gain: 0.25 });
    tone(midi(72), t + 0.18, 0.3, { type: 'triangle', gain: 0.25 });
  },
  upgrade: (t) => arp([60, 64, 67, 72, 76], t, 0.06, { type: 'triangle', gain: 0.28 }),
  demolish: (t) => {
    noise(t, 0.45, { freq: 1800, to: 120, gain: 0.7 });
    tone(110, t, 0.35, { gain: 0.5, to: 40 });
  },
  coin: (t) => {
    tone(midi(83), t, 0.09, { type: 'square', gain: 0.12 });
    tone(midi(88), t + 0.08, 0.4, { type: 'square', gain: 0.12 });
  },
  expand: (t) => {
    noise(t, 0.35, { freq: 300, to: 2400, gain: 0.25 });
    arp([55, 62, 67, 74], t + 0.1, 0.09, { type: 'triangle', gain: 0.28 });
  },
  hatch: (t, rarity = 'common') => {
    // a wobbling shell crack, then a sparkle run that gets longer for rarer pets
    noise(t, 0.05, { freq: 3000, to: 800, gain: 0.5 });
    noise(t + 0.12, 0.05, { freq: 3000, to: 800, gain: 0.5 });
    const run = { common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 8 }[rarity] || 3;
    const notes = [];
    for (let i = 0; i < run; i++) notes.push(72 + SCALE[i % 5] + 12 * Math.floor(i / 5));
    arp(notes, t + 0.3, 0.075, { type: 'triangle', gain: 0.3, send: 0.25 });
    const end = t + 0.3 + run * 0.075;
    for (const n of [72, 76, 79]) tone(midi(n + (rarity === 'legendary' ? 12 : 0)), end, 0.9, { type: 'sine', gain: 0.22, send: 0.3 });
  },
};

export function sfx(name, arg) {
  try {
    if (!settings.sfx || !ready() || !SOUNDS[name]) return;
    SOUNDS[name](ctx.currentTime + 0.01, arg);
  } catch { /* ignore */ }
}

// ---------- music ----------

// Plays a chord pad plus a few random plucks per bar, scheduled a little ahead of time.
function scheduleBeat(t, beat) {
  const bar = Math.floor(beat / 4) % CHORDS.length;
  const inBar = beat % 4;
  const [root, third] = CHORDS[bar];
  if (inBar === 0) {
    for (const n of [root, root + third, root + 7]) tone(midi(n + (night ? 0 : 12)), t, BEAT * 4.2, { type: 'sine', gain: 0.22, attack: 0.6, bus: musicBus });
    tone(midi(root - 12), t, BEAT * 2, { type: 'sine', gain: 0.25, attack: 0.05, bus: musicBus });
  }
  // plucks on the beat and the off-beat; fewer and lower at night
  for (const off of [0, 0.5]) {
    if (Math.random() > (night ? 0.3 : 0.55)) continue;
    const note = 72 + SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0) - (night ? 12 : 0);
    tone(midi(note), t + off * BEAT, 1.4, { type: 'triangle', gain: 0.2, bus: musicBus, send: 0.6 });
  }
}

function tickMusic() {
  if (!ready()) return;
  while (nextBeat < ctx.currentTime + 1.2) {
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05; // fell behind (tab was asleep)
    scheduleBeat(nextBeat, beatIndex++);
    nextBeat += BEAT;
  }
}

function applyMusic() {
  if (!ctx || !musicBus) return;
  const on = settings.music && ready();
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, t, 0.6);
  if (on && !musicTimer) {
    nextBeat = ctx.currentTime + 0.1;
    musicTimer = setInterval(tickMusic, 250);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
