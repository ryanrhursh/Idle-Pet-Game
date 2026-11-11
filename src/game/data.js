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
    capacity: 5, capacityPerLevel: 2,
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
    produces: { wood: 0.3 },
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
    produces: { treats: 0.04 },
    cost: { wood: 80, coins: 120 },
    desc: 'Makes treats, used to hatch eggs.',
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

export const EGGS = {
  basic: {
    name: 'Pet Egg', emoji: '🥚', cost: { treats: 10 },
    weights: { common: 65, uncommon: 28, rare: 6, epic: 1, legendary: 0 },
  },
  golden: {
    name: 'Golden Egg', emoji: '🌟', cost: { treats: 40 },
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

export const CONFIG = {
  gridCols: 8,
  startRows: 6,
  maxRows: 10,
  expandCost: (rows) => ({ coins: Math.round(150 * Math.pow(2, rows - 6)), wood: Math.round(100 * Math.pow(2, rows - 6)) }),
  maxBuildingLevel: 5,
  upgradeCostMul: 1.8,
  dupCostMul: 1.15,
  refundRatio: 0.5,
  levelOutputBonus: 0.08, // +8% per pet level above 1
  favJobBonus: 0.5, // +50% at favourite job
  collectionBonus: 0.03, // +3% all output per species discovered
  maxPetLevel: 20,
  foodPerPet: 0.08, // per second
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
