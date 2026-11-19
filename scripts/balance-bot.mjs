// Balance check: a greedy "active player" bot plays the sim and prints a snapshot at each game day given.
// Usage: node scripts/balance-bot.mjs [day ...]     (default: 5 20 50 100 200 350 547)
// Look for: stockpiles that grow while nothing is left to buy (= not enough sinks), or progress
// that stalls early. One game day is 90 seconds. A perfect player should take ~1000 days to max out.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sim = await import(pathToFileURL(root + '/src/game/sim.js'));
const st = await import(pathToFileURL(root + '/src/game/state.js'));
const data = await import(pathToFileURL(root + '/src/game/data.js'));
const { BUILDINGS, CONFIG, EGGS } = data;
let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const s = st.createNewGame(rng);
const checkpoints = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [5, 20, 50, 100, 200, 350, 547];
const DAY = CONFIG.dayLength;
const freeTile = () => { for (let y = 0; y < s.rows; y++) for (let x = 0; x < CONFIG.gridCols; x++) if (!sim.buildingAt(s, x, y)) return { x, y }; return null; };
const jobTypes = ['farm', 'lumber', 'market', 'bakery', 'candy'];
const cnt = (t) => s.buildings.filter((b) => b.type === t).length;
const slotsOf = (t) => s.buildings.filter((b) => b.type === t).reduce((a, b) => a + sim.jobSlots(b), 0);
const afford = (c) => sim.canAfford(s, c);
// does buying keep a reserve? only spend when stock after purchase >= reserve
function tryBuild(type) {
  if (!BUILDINGS[type]) return false;
  if (BUILDINGS[type].unique && cnt(type)) return false;
  const t = freeTile(); if (!t) return false;
  if (!afford(sim.buildCost(s, type))) return false;
  return sim.build(s, type, t.x, t.y).ok;
}
function tryUpgrade(b) {
  const max = BUILDINGS[b.type].maxLevel ?? CONFIG.maxBuildingLevel;
  if (b.level >= max) return false;
  if (!afford(sim.upgradeCost(b))) return false;
  return sim.upgrade(s, b.id).ok;
}
function cheapestUpgrade(types) {
  let best = null, bc = Infinity;
  for (const b of s.buildings) {
    if (types && !types.includes(b.type)) continue;
    const max = BUILDINGS[b.type].maxLevel ?? CONFIG.maxBuildingLevel;
    if (b.level >= max) continue;
    const c = Object.values(sim.upgradeCost(b)).reduce((a, v) => a + v, 0);
    if (c < bc) { bc = c; best = b; }
  }
  return best;
}
function step() {
  const net = sim.netRates(s);
  // 1 food safety
  if (net.food < 0.05 + s.pets.length * 0.01) { if (tryBuild('farm')) return; const u = cheapestUpgrade(['farm']); if (u && tryUpgrade(u)) return; }
  // 2 housing
  if (sim.freeHomeSlots(s) <= 0) {
    for (const t of ['townhouse', 'cottage', 'hut']) if (tryBuild(t)) return;
    const u = cheapestUpgrade(['townhouse', 'cottage', 'hut']); if (u && tryUpgrade(u)) return;
  }
  // treats: one candy factory per ~8 pets, and a bakery per ~10
  if (s.pets.length >= 4 && cnt('candy') < 1 + s.pets.length / 8 && tryBuild('candy')) return;
  if (s.pets.length >= 5 && cnt('bakery') < 1 + s.pets.length / 10 && tryBuild('bakery')) return;
  // 3 hatch with spare treats / coin eggs
  for (const e of ['golden', 'basic', 'nest']) {
    if (!EGGS[e]) continue;
    const cost = sim.eggCost ? sim.eggCost(s, e) : EGGS[e].cost;
    if (sim.freeHomeSlots(s) > 0 && afford(cost)) { if (sim.hatch(s, e, rng).ok) return; }
  }
  // 4 jobs for everybody
  const totalSlots = jobTypes.reduce((a, t) => a + slotsOf(t), 0);
  if (totalSlots < s.pets.length) {
    const order = ['candy', 'bakery', 'market', 'lumber', 'farm'];
    // keep a balanced mix: pick the type with the fewest slots (candy/bakery/market preferred)
    const want = order.sort((a, b) => slotsOf(a) - slotsOf(b))[0];
    if (tryBuild(want)) return; const u = cheapestUpgrade([want]); if (u && tryUpgrade(u)) return;
    for (const t of order) if (tryBuild(t)) return;
  }
  // 5 decor + wonders
  for (const t of ['garden', 'fountain']) if (cnt(t) < 1 && tryBuild(t)) return;
  for (const t of ['academy', 'clocktower', 'grandhatchery']) if (BUILDINGS[t] && !cnt(t) && tryBuild(t)) return;
  // 6 land
  if (!freeTile() && s.rows < CONFIG.maxRows && afford(sim.expandCost(s))) { sim.expandLand(s); return; }
  // 7 wonders upgrades first, then anything
  const w = s.buildings.filter((b) => BUILDINGS[b.type].type === 'wonder');
  for (const b of w) if (tryUpgrade(b)) return;
  const u = cheapestUpgrade(); if (u && tryUpgrade(u)) return;
  // 8 more buildings of productive types
  const spare = s.rows * CONFIG.gridCols - s.buildings.length;
  if (spare > 3) for (const t of ['bakery', 'market', 'candy', 'farm', 'lumber']) if (cnt(t) < 3 + s.pets.length / 6 && tryBuild(t)) return;
  // 9 extra homes to attract strays
  if (sim.freeHomeSlots(s) < 2 && (tryBuild('townhouse') || tryBuild('cottage'))) return;
}
let next = 0;
const rows = [];
let t = 0;
while (next < checkpoints.length) {
  for (let i = 0; i < 15; i++) sim.tick(s, 1, rng);
  t += 15;
  for (let k = 0; k < 6; k++) step();
  if (s.time / DAY >= checkpoints[next]) {
    const lv = s.buildings.reduce((a, b) => a + b.level, 0);
    const net = sim.netRates(s);
    rows.push(`day ${String(checkpoints[next]).padStart(3)} | pets ${String(s.pets.length).padStart(3)} bld ${String(s.buildings.length).padStart(3)} lvls ${String(lv).padStart(4)} rows ${s.rows} | coins ${Math.round(s.resources.coins)} wood ${Math.round(s.resources.wood)} food ${Math.round(s.resources.food)} treats ${Math.round(s.resources.treats)} | net c ${net.coins.toFixed(1)} w ${net.wood.toFixed(1)} f ${net.food.toFixed(1)} t ${net.treats.toFixed(2)} | hatched ${s.stats.hatched} strays ${s.stats.strays} | earned ${Math.round(s.stats.coinsEarned)} disc ${Object.keys(s.discovered).length}`);
    next++;
  }
}
console.log(rows.join('\n'));
