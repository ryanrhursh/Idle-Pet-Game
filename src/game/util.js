// Small pure helpers shared by the game logic and the UI (no renderer, no DOM).

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// Compact number for the UI: 1234 -> "1234", 12345 -> "12.3K", 4e12 -> "4.0T", 1e40 -> "1.0e40".
export function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e6) {
    let v = n / 1e6;
    let i = 2;
    while (Math.abs(v) >= 1000 && i < SUFFIX.length - 1) { v /= 1000; i++; }
    if (Math.abs(v) >= 1000) return n.toExponential(1).replace('e+', 'e');
    return v.toFixed(1) + SUFFIX[i];
  }
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.floor(n).toString();
  if (a >= 10) return n.toFixed(0);
  return n.toFixed(1).replace(/\.0$/, '');
}

// Round to 2 significant digits so generated targets and rewards read as "nice" numbers (4,000,000 not 3,987,211).
export function nice(x) {
  if (!(x >= 100)) return Math.max(0, Math.round(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

// Small seedable random generator, so things like Town Requests can be repeated from a saved seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
