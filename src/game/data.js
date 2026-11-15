// Static game data: rarities, species, traits, buildings, eggs.
// Tweak numbers here to rebalance the game.

export const RESOURCES = {
  coins: { name: 'Coins', emoji: '🪙' },
  food: { name: 'Food', emoji: '🍎' },
  wood: { name: 'Wood', emoji: '🪵' },
  treats: { name: 'Treats', emoji: '🍬' },
};

export const RARITIES = {
  common: { name: 'Common', mul: 1.0, color: '#8d99a6' },
  uncommon: { name: 'Uncommon', mul: 1.3, color: '#43a047' },
  rare: { name: 'Rare', mul: 1.7, color: '#1e88e5' },
  epic: { name: 'Epic', mul: 2.3, color: '#8e24aa' },
  legendary: { name: 'Legendary', mul: 3.2, color: '#fb8c00' },
};

// favJob = the building id this species loves working at (+50% output, +happiness)
export const SPECIES = {
  mouse: { name: 'Mouse', emoji: '🐭', rarity: 'common', favJob: 'farm' },
  bunny: { name: 'Bunny', emoji: '🐰', rarity: 'common', favJob: 'farm' },
  chick: { name: 'Chick', emoji: '🐥', rarity: 'common', favJob: 'farm' },
  hamster: { name: 'Hamster', emoji: '🐹', rarity: 'common', favJob: 'bakery' },
  frog: { name: 'Frog', emoji: '🐸', rarity: 'common', favJob: 'market' },
  dog: { name: 'Dog', emoji: '🐶', rarity: 'uncommon', favJob: 'lumber' },
  cat: { name: 'Cat', emoji: '🐱', rarity: 'uncommon', favJob: 'market' },
  pig: { name: 'Pig', emoji: '🐷', rarity: 'uncommon', favJob: 'bakery' },
  beaver: { name: 'Beaver', emoji: '🦫', rarity: 'uncommon', favJob: 'lumber' },
  hedgehog: { name: 'Hedgehog', emoji: '🦔', rarity: 'uncommon', favJob: 'farm' },
  fox: { name: 'Fox', emoji: '🦊', rarity: 'rare', favJob: 'market' },
  owl: { name: 'Owl', emoji: '🦉', rarity: 'rare', favJob: 'candy' },
  raccoon: { name: 'Raccoon', emoji: '🦝', rarity: 'rare', favJob: 'lumber' },
  koala: { name: 'Koala', emoji: '🐨', rarity: 'rare', favJob: 'bakery' },
  panda: { name: 'Panda', emoji: '🐼', rarity: 'epic', favJob: 'farm' },
  tiger: { name: 'Tiger', emoji: '🐯', rarity: 'epic', favJob: 'lumber' },
  unicorn: { name: 'Unicorn', emoji: '🦄', rarity: 'epic', favJob: 'candy' },
  lion: { name: 'Lion', emoji: '🦁', rarity: 'legendary', favJob: 'market' },
  dragon: { name: 'Dragon', emoji: '🐲', rarity: 'legendary', favJob: 'candy' },
};

// Every pet gets one random trait.
export const TRAITS = {
  hardworking: { name: 'Hard Worker', desc: '+25% output', output: 1.25 },
  sleepy: { name: 'Sleepy', desc: '-15% output, +10 happiness', output: 0.85, happy: 10 },
  cheerful: { name: 'Cheerful', desc: '+15 happiness', happy: 15 },
  bigEater: { name: 'Big Eater', desc: 'Eats 80% more, +10% output', food: 1.8, output: 1.1 },
  nibbler: { name: 'Nibbler', desc: 'Eats 40% less', food: 0.6 },
  quick: { name: 'Quick Learner', desc: '+60% XP', xp: 1.6 },
  homebody: { name: 'Homebody', desc: 'Loves having a home (+15), hates not having one (-20)', homeBonus: 15, homelessPenalty: 20 },
  social: { name: 'Social', desc: '+7% output per coworker (max +21%)', social: 0.07 },
};

// type: home | job | decor
// cost: base cost of the first building of this kind. Each extra copy costs 15% more.
// Upgrade cost = cost * UPGRADE_COST_MUL^level.
export const BUILDINGS = {
  hut: {
    name: 'Cozy Hut', emoji: '🛖', type: 'home',
    capacity: 1, capacityPerLevel: 1,
    cost: { wood: 12 },
    desc: 'A small, cheap home.',
  },
  cottage: {
    name: 'Cottage', emoji: '🏠', type: 'home',
    capacity: 2, capacityPerLevel: 1,
    cost: { wood: 30, coins: 15 },
    desc: 'A comfy home for a couple of pets.',
  },
  townhouse: {
    name: 'Townhouses', emoji: '🏘️', type: 'home',
    capacity: 5, capacityPerLevel: 1,
    cost: { wood: 160, coins: 140 },
    desc: 'Lots of room for a growing town.',
  },
  farm: {
    name: 'Berry Farm', emoji: '🌾', type: 'job',
    slots: 2, slotsPerLevel: 1,
    produces: { food: 0.5 },
    cost: { wood: 15 },
    desc: 'Workers grow food. Every pet needs to eat!',
  },
  lumber: {
    name: 'Lumber Grove', emoji: '🌲', type: 'job',
    slots: 2, slotsPerLevel: 1,
    produces: { wood: 0.9 },
    cost: { coins: 20 },
    desc: 'Workers chop wood for building.',
  },
  market: {
    name: 'Market Stall', emoji: '🏪', type: 'job',
    slots: 2, slotsPerLevel: 1,
    produces: { coins: 0.4 },
    cost: { wood: 30 },
    desc: 'Workers sell trinkets for coins.',
  },
  bakery: {
    name: 'Bakery', emoji: '🥐', type: 'job',
    slots: 2, slotsPerLevel: 1,
    produces: { coins: 1.1 },
    consumes: { food: 0.3 },
    cost: { wood: 60, coins: 50 },
    desc: 'Turns food into lots of coins.',
  },
  candy: {
    name: 'Treat Factory', emoji: '🏭', type: 'job',
    slots: 2, slotsPerLevel: 1,
    produces: { treats: 0.05 },
    consumes: { food: 0.35 },
    cost: { wood: 80, coins: 120 },
    desc: 'Turns surplus food into treats for hatching eggs.',
  },
  garden: {
    name: 'Flower Garden', emoji: '🌷', type: 'decor',
    happiness: 3, happinessPerLevel: 2,
    cost: { wood: 20, coins: 20 },
    desc: 'Pretty flowers make every pet happier.',
  },
  fountain: {
    name: 'Fountain Plaza', emoji: '⛲', type: 'decor',
    happiness: 7, happinessPerLevel: 3,
    cost: { wood: 70, coins: 90 },
    desc: 'A town landmark. Big happiness boost.',
  },
};

// Egg prices also rise with town size (see townCostMul in sim.js).
export const EGGS = {
  basic: {
    name: 'Pet Egg', emoji: '🥚', cost: { treats: 10, coins: 30 },
    weights: { common: 65, uncommon: 28, rare: 6, epic: 1, legendary: 0 },
  },
  golden: {
    name: 'Golden Egg', emoji: '🌟', cost: { treats: 40, coins: 250 },
    weights: { common: 0, uncommon: 45, rare: 38, epic: 14, legendary: 3 },
  },
};

export const STRAY_WEIGHTS = { common: 75, uncommon: 22, rare: 3, epic: 0, legendary: 0 };

export const PET_NAMES = [
  'Biscuit', 'Mochi', 'Pip', 'Waffles', 'Pebble', 'Clover', 'Nugget', 'Pickles',
  'Sprout', 'Bean', 'Toffee', 'Maple', 'Juniper', 'Noodle', 'Peanut', 'Sunny',
  'Button', 'Olive', 'Pudding', 'Ziggy', 'Marble', 'Hazel', 'Cocoa', 'Dumpling',
  'Fig', 'Tofu', 'Basil', 'Pumpkin', 'Wren', 'Echo', 'Kiwi', 'Muffin', 'Rusty',
  'Sage', 'Taco', 'Poppy', 'Ginger', 'Bramble', 'Scout', 'Lulu', 'Ember', 'Moss',
];

// Goals that guide the player. Shown in order, three at a time; each is claimed
// for a reward once done. `check` types are evaluated in quests.js.
//   building {building,n} · kind {kind,n} (home/job/decor) · buildings {n} · pets {n}
//   employed {n} · species {n} · rarity {rarity,n} (pets of that rarity or better)
//   hatched {n} · level {level,n} (buildings at that level) · petLevel {n} · rows {n}
//   happy {n} (pets at 80%+ mood) · coins {n} (total coins earned)
export const QUESTS = [
  // --- chapter 1: getting going ---
  { id: 'market', title: 'Open for business', hint: 'Then tap it and hire a pet to work there, or it earns nothing.', check: { type: 'building', building: 'market', n: 1 }, reward: { coins: 30, wood: 20 } },
  { id: 'beds2', title: 'Room to grow', hint: 'Free beds attract stray pets, so more homes means more citizens.', check: { type: 'kind', kind: 'home', n: 2 }, reward: { wood: 40 } },
  { id: 'egg1', title: 'Something is hatching', hint: 'Open the Hatch tab. Eggs cost treats and coins.', check: { type: 'hatched', n: 1 }, reward: { coins: 40, treats: 4 } },
  { id: 'pets4', title: 'Four friends', check: { type: 'pets', n: 4 }, reward: { wood: 50, coins: 40 } },
  { id: 'bakery', title: 'Fresh from the oven', hint: 'Bakeries make lots of coins from food. Give them workers!', check: { type: 'building', building: 'bakery', n: 1 }, reward: { coins: 60 } },
  { id: 'candy', title: 'Sweet tooth', hint: 'Hire a pet to work there. It turns spare food into treats.', check: { type: 'building', building: 'candy', n: 1 }, reward: { treats: 12, wood: 40 } },
  { id: 'lvl2', title: 'Level up!', hint: 'Tap a building and press Upgrade for more jobs, beds and output.', check: { type: 'level', level: 2, n: 1 }, reward: { wood: 60, coins: 60 } },
  { id: 'pets6', title: 'Half a dozen', check: { type: 'pets', n: 6 }, reward: { coins: 100, treats: 10 } },
  { id: 'garden', title: 'Stop and smell the flowers', check: { type: 'building', building: 'garden', n: 1 }, reward: { coins: 60, wood: 40 } },
  // --- chapter 2: a real town ---
  { id: 'pets8', title: 'Neighbourhood', check: { type: 'pets', n: 8 }, reward: { coins: 150, treats: 12 } },
  { id: 'egg5', title: 'Egg collector', check: { type: 'hatched', n: 5 }, reward: { treats: 20 } },
  { id: 'species4', title: 'Variety pack', check: { type: 'species', n: 4 }, reward: { coins: 200, wood: 100 } },
  { id: 'build10', title: 'Town planner', check: { type: 'buildings', n: 10 }, reward: { wood: 250, coins: 200 } },
  { id: 'lvl3x2', title: 'Well kept', check: { type: 'level', level: 3, n: 2 }, reward: { coins: 300, wood: 150 } },
  { id: 'fountain', title: 'Centre of town', check: { type: 'building', building: 'fountain', n: 1 }, reward: { coins: 300, treats: 10 } },
  { id: 'rows7', title: 'Room to breathe', check: { type: 'rows', n: 7 }, reward: { treats: 15, wood: 150 } },
  { id: 'pets10', title: 'Double digits', check: { type: 'pets', n: 10 }, reward: { coins: 400, treats: 15 } },
  { id: 'employed8', title: 'Full employment', check: { type: 'employed', n: 8 }, reward: { coins: 400, wood: 250 } },
  { id: 'petlv5', title: 'Teacher\'s pet', hint: 'Pets level up by working. You can also feed them spare food.', check: { type: 'petLevel', n: 5 }, reward: { treats: 15, coins: 300 } },
  { id: 'rare1', title: 'Something special', check: { type: 'rarity', rarity: 'rare', n: 1 }, reward: { treats: 25, coins: 500 } },
  // --- chapter 3: a thriving town ---
  { id: 'species7', title: 'Naturalist', check: { type: 'species', n: 7 }, reward: { treats: 25, coins: 800 } },
  { id: 'happy5', title: 'Happy place', check: { type: 'happy', n: 5 }, reward: { treats: 20, coins: 800 } },
  { id: 'pets14', title: 'Bustling', check: { type: 'pets', n: 14 }, reward: { coins: 1500, treats: 25 } },
  { id: 'lvl5', title: 'Five stars', check: { type: 'level', level: 5, n: 1 }, reward: { coins: 2500, wood: 1000 } },
  { id: 'build16', title: 'City limits', check: { type: 'buildings', n: 16 }, reward: { coins: 3000, wood: 1500 } },
  { id: 'egg15', title: 'Hatchery boss', check: { type: 'hatched', n: 15 }, reward: { treats: 50 } },
  { id: 'petlv12', title: 'Seasoned citizens', check: { type: 'petLevel', n: 12 }, reward: { treats: 40, coins: 3000 } },
  { id: 'rows9', title: 'Urban sprawl', check: { type: 'rows', n: 9 }, reward: { treats: 40, wood: 3000 } },
  { id: 'epic1', title: 'Truly epic', check: { type: 'rarity', rarity: 'epic', n: 1 }, reward: { treats: 60, coins: 5000 } },
  { id: 'coins25k', title: 'Coin collector', check: { type: 'coins', n: 25000 }, reward: { treats: 40, wood: 4000 } },
  // --- chapter 4: legend of Pawville ---
  { id: 'species11', title: 'Zoologist', check: { type: 'species', n: 11 }, reward: { treats: 70, coins: 8000 } },
  { id: 'pets20', title: 'Metropolis', check: { type: 'pets', n: 20 }, reward: { coins: 15000, treats: 80 } },
  { id: 'lvl8', title: 'Eight stars', check: { type: 'level', level: 8, n: 1 }, reward: { coins: 40000, wood: 20000 } },
  { id: 'legend1', title: 'A legend arrives', check: { type: 'rarity', rarity: 'legendary', n: 1 }, reward: { treats: 150, coins: 30000 } },
  { id: 'petlv20', title: 'Wise old pets', check: { type: 'petLevel', n: 20 }, reward: { treats: 100, coins: 30000 } },
  { id: 'rows12', title: 'Wall to wall', check: { type: 'rows', n: 12 }, reward: { treats: 100, wood: 30000 } },
  { id: 'coins500k', title: 'Tycoon', check: { type: 'coins', n: 500000 }, reward: { treats: 150, wood: 80000 } },
  { id: 'species19', title: 'Gotta hug them all', check: { type: 'species', n: 19 }, reward: { treats: 300, coins: 200000 } },
  { id: 'lvl8x5', title: 'Five-star town', check: { type: 'level', level: 8, n: 5 }, reward: { treats: 300, coins: 400000 } },
  { id: 'petlv30', title: 'Peak performance', check: { type: 'petLevel', n: 30 }, reward: { treats: 400, coins: 500000 } },
];

export const CONFIG = {
  gridCols: 8,
  startRows: 6,
  maxRows: 12,
  expandCost: (rows) => ({ coins: Math.round(150 * Math.pow(2, rows - 6)), wood: Math.round(100 * Math.pow(2, rows - 6)) }),
  maxBuildingLevel: 8,
  upgradeCostMul: 2.2,
  upgradeCoinRatio: 2.5, // upgrades cost this many coins per wood
  dupCostMul: 1.15,
  townInflation: 1.09, // every pet beyond freePets makes ALL costs (build, upgrade, land, eggs) 9% pricier
  freePets: 4,
  strayGrowth: 0.25, // stray arrivals slow down by 25% per pet
  refundRatio: 0.5,
  levelOutputBonus: 0.05, // +5% per pet level above 1
  favJobBonus: 0.5, // +50% at favourite job
  collectionBonus: 0.03, // +3% all output per species discovered
  maxPetLevel: 30,
  feedFoodPerXp: 1, // feeding a pet turns food into XP at this rate
  townIncome: { coins: 0.25, wood: 0.15 }, // per second, always on: the economy can never fully stall
  foodPerPet: 0.1, // per second
  happinessSpeed: 2, // points per second toward target
  dayLength: 90, // seconds per in-game day
  workStart: 0.1, // fraction of the day when pets go to work
  workEnd: 0.65, // fraction of the day when pets go home
  strayMin: 60,
  strayMax: 120,
  maxOfflineSeconds: 8 * 3600,
};

export function xpForLevel(level) {
  return Math.floor(20 * Math.pow(level, 1.6));
}
