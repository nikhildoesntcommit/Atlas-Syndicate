/* ATLAS SYNDICATE v7 — config.js
   Every tunable number, the palette and all game data tables (resources, buildings, upgrades, events,
   factions, difficulty). Classic script: everything hangs off the single global namespace AS. */
(function (AS) {
  'use strict';

  AS.VERSION = '7.0.0';
  AS.SAVE_VERSION = 7;

  AS.CONFIG = {
    view: { minW: 400, minH: 225 },
    sim: { step: 0.1, maxFrameDt: 0.05, maxStepsPerFrame: 40, maxUrlSpeed: 20, hudSpeeds: [1, 2, 3] },
    camera: { zooms: [1, 2, 3], margin: 60, tipDelay: 0.3, glide: 6 },

    game: {
      length: 1800,          // 30:00 timer; most systems wins when it runs out
      protect: 240,          // 0:00-4:00: nobody may attack anybody
      cycle: 10,             // production, food and fuel settle every cycle (seconds)
      leaderShare: 0.35,     // a coalition forms against anyone holding this share of the galaxy
      endgame: 1080,         // from 18:00 rivals go for each other's capitals
      histEvery: 10,
    },
    coalition: { duration: 300, cooldown: 30, strikeFirst: 30, strikeEvery: 30, breakShare: 0.27 },

    galaxy: { arms: 6, perArm: 3, core: 6, armR0: 86, armDR: 52, twist: 0.42, squash: 0.58, coreR: 38 },

    /* the planet cross-section: w x h underground cells below a strip of surface slots */
    ground: { w: 32, h: 16, hardCost: [1, 2, 4], drillCost: 2 },

    econ: {
      start: { money: 600, gold: 0, water: 20, food: 40, fuel: 30 },
      levy: 5,               // money per owned system per cycle (taxes)
      extractRate: 1.6,      // raw units per cycle from a drilled deposit (+0.07 per row of depth)
      depthRate: 0.07,
      procCap: 4,            // raw units a processor can take per cycle
      bonus: 1.5,            // processor or farm on a matching planet type
      pathCap: 6,            // units per cycle, each direction
      maxPathways: 3,        // pathways per system
      crew: 2,               // workers per building (they arrive with it)
      eat: 0.2,              // food each worker eats per cycle
      regrow: 2,             // workers per system who come back each cycle while everyone is fed
      starve: 0.5,           // share of the unfed workers who die
    },
    /* machinery upgrades: every building goes up to level 3; each level adds 50% throughput */
    upgrade: { max: 3, boost: 0.5, price: [1.0, 2.0] },
    army: { speed: 7 },
    buy: { base: 400, growth: 1.25, perPower: 6 },
    neutral: { core: [55, 80], arm: [[30, 42], [18, 26]] },
    events: { first: 270, every: 240, jitter: 30, warn: 60 },
    history: { every: 10 },
    selftest: { seed: 20261122 },
    save: { every: 10 },
  };

  /* ---------- 32-colour industrial palette (unchanged since v3) ---------- */
  AS.PALETTE = [
    '#0d0e10', '#17191c', '#23262a', '#33373c', '#4a4f55', '#676c71', '#8d9195', '#c9c6bb', //  0- 7 soot → steel → dirty cream
    '#2a1d16', '#4a2f20', '#74452a', '#a3612f', '#c98a3e', '#e0b85a', '#f0dfa0', '#3b1a17', //  8-15 umber, rust, ochre, hazard, lamp, oxblood
    '#6e2a20', '#a8402c', '#d06a3a', '#1d2a2a', '#2f4542', '#4f6a60', '#7f9a88', '#1e2433', // 16-23 brick, signal red, orange, slate, verdigris, navy
    '#33405a', '#5b6e8a', '#9fb0c0', '#2e2a1e', '#4f4a2c', '#7d7444', '#b0a46a', '#e8e2cf', // 24-31 blue steel, frost, olive, khaki, sand, bone
  ];
  AS.PAL_KEYS = '0123456789abcdefghijklmnopqrstuv';
  AS.PAL_RGB = AS.PALETTE.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

  /* ---------- raw deposits underground ---------- */
  AS.RES_KEYS = ['gold', 'ice', 'fuel'];
  AS.RES = {
    gold: { name: 'GOLD',  raw: 'GOLD',  out: 'gold',  col: 13, mark: 13, ext: 'goldmine', proc: null,       planets: [],
      use: 'GOLD: SELL IT ON THE MARKET FOR MONEY.' },
    ice:  { name: 'ICE',   raw: 'ICE',   out: 'water', col: 25, mark: 26, ext: 'icedrill', proc: 'water',    planets: ['ice', 'ice2'],
      use: 'ICE: A WATER PLANT MELTS IT INTO WATER, WHICH FARMS TURN INTO FOOD.' },
    fuel: { name: 'CRUDE', raw: 'CRUDE', out: 'fuel',  col: 1,  mark: 18, ext: 'pump',     proc: 'refinery', planets: ['gas', 'cinder'],
      use: 'CRUDE: A REFINERY TURNS IT INTO FUEL FOR YOUR MILITARY.' },
  };
  /* ---------- the stockpile (top bar) ---------- */
  AS.STOCK_KEYS = ['money', 'gold', 'water', 'food', 'fuel'];
  AS.STOCK = {
    money: { name: 'MONEY', col: 31, price: 0,
      use: 'BUYS BUILDINGS, DRILLING, UPGRADES, MILITARY AND SYSTEMS. EARNED BY SELLING ON THE MARKET, PLUS 5 TAX PER SYSTEM EVERY CYCLE.' },
    gold:  { name: 'GOLD',  col: 13, price: 5,  use: 'MINED BY GOLD MINES. SELL IT ON THE MARKET FOR MONEY.' },
    water: { name: 'WATER', col: 26, price: 2,  use: 'MADE BY WATER PLANTS FROM ICE. GREENHOUSES AND LIVESTOCK FARMS DRINK IT.' },
    food:  { name: 'FOOD',  col: 22, price: 3,  use: 'MADE BY FARMS FROM WATER. YOUR WORKERS EAT IT; WITHOUT IT THEY STARVE AND MACHINES STOP.' },
    fuel:  { name: 'FUEL',  col: 18, price: 4,  use: 'MADE BY REFINERIES FROM CRUDE. YOUR MILITARY BURNS IT; SHORT OF FUEL, IT FIGHTS AT THAT SHARE OF ITS POWER.' },
  };
  AS.MARKET_KEYS = ['gold', 'water', 'food', 'fuel'];

  /* ---------- buildings ----------
     ext:  extractor, drilled down to a deposit. The gold mine delivers straight to your stock; the ice
           drill and fuel pump need a conveyor to their processor (or to a port).
     proc: processor, takes raw from conveyors: water plant (1 ice -> 2 water), refinery (1 crude -> 1 fuel).
     farm: takes water from your stock and grows food. No conveyor needed. */
  AS.BLD = {
    goldmine:  { name: 'GOLD MINE',      short: 'GOLD MINE',  res: 'gold', role: 'ext',  cost: 90,  art: 'mine',
      does: 'DRILL TO GOLD. GOLD GOES STRAIGHT TO YOUR STOCK.' },
    icedrill:  { name: 'ICE DRILL',      short: 'ICE DRILL',  res: 'ice',  role: 'ext',  cost: 60,  art: 'drill',
      does: 'DRILL TO ICE, THEN CONVEYOR TO A WATER PLANT.' },
    water:     { name: 'WATER PLANT',    short: 'WATER PLANT', res: 'ice', role: 'proc', cost: 80,  art: 'tank', yield: 2,
      does: 'MELTS ICE: 1 ICE = 2 WATER.' },
    greenhouse:{ name: 'GREENHOUSE',     short: 'GREENHOUSE', res: 'food', role: 'farm', cost: 60,  art: 'agri', water: 2, food: 4,
      does: 'DRINKS 2 WATER, GROWS 4 FOOD PER CYCLE.' },
    livestock: { name: 'LIVESTOCK FARM', short: 'LIVESTOCK',  res: 'food', role: 'farm', cost: 110, art: 'barn', water: 4, food: 9,
      does: 'DRINKS 4 WATER, RAISES 9 FOOD PER CYCLE.' },
    pump:      { name: 'FUEL PUMP',      short: 'FUEL PUMP',  res: 'fuel', role: 'ext',  cost: 60,  art: 'skimmer',
      does: 'DRILL TO CRUDE, THEN CONVEYOR TO A REFINERY.' },
    refinery:  { name: 'REFINERY',       short: 'REFINERY',   res: 'fuel', role: 'proc', cost: 90,  art: 'fab', yield: 1,
      does: 'REFINES CRUDE: 1 CRUDE = 1 FUEL.' },
  };
  AS.BLD_KEYS = ['goldmine', 'icedrill', 'water', 'greenhouse', 'livestock', 'pump', 'refinery'];
  AS.FARM_PLANETS = ['terran'];
  AS.COSTS = { conveyor: 10, pathway: 80 };
  AS.upgPrice = (kind, lvl) => Math.round(AS.BLD[kind].cost * AS.CONFIG.upgrade.price[Math.max(0, Math.min(1, lvl - 1))]);

  /* ---------- the military shop: power adds up; the bigger side wins and keeps the difference ---------- */
  AS.UNITS = {
    ship:      { name: 'SPACE SHIP',            short: 'SHIPS',      power: 1,  cost: 15,  fuel: 0.02, icon: 'ship',
      desc: 'POWER 1. CHEAP, FUEL-LIGHT, FINE-GRAINED.' },
    destroyer: { name: 'DESTROYER',             short: 'DESTROYERS', power: 5,  cost: 70,  fuel: 0.15, icon: 'destroyer',
      desc: 'POWER 5. GOOD VALUE, MODEST FUEL.' },
    cannon:    { name: 'ORBITAL STRIKE CANNON', short: 'CANNONS',    power: 10, cost: 130, fuel: 0.4,  icon: 'cannon',
      desc: 'POWER 10. CHEAPEST PER POWER, HEAVIEST ON FUEL.' },
  };
  AS.UNIT_KEYS = ['ship', 'destroyer', 'cannon'];

  /* ---------- factions: slot 0 is the player ---------- */
  AS.FACTIONS = [
    { name: 'ATLAS SYNDICATE', short: 'ATLAS', pers: 'player',        col: 13, dark: 11, deep: 9,  icon: 'atlas' },
    { name: 'HALBERD',         short: 'HALBERD', pers: 'warlord',     col: 17, dark: 16, deep: 15, icon: 'warlord' },
    { name: 'GILT',            short: 'GILT', pers: 'merchant',       col: 31, dark: 6,  deep: 3,  icon: 'merchant' },
    { name: 'BASTION',         short: 'BASTION', pers: 'turtle',      col: 22, dark: 21, deep: 20, icon: 'turtle' },
    { name: 'JACKAL',          short: 'JACKAL', pers: 'opportunist',  col: 26, dark: 25, deep: 24, icon: 'opportunist' },
    { name: 'CINDER',          short: 'CINDER', pers: 'raider',       col: 18, dark: 10, deep: 9,  icon: 'raider' },
  ];
  AS.NEUTRAL = { name: 'INDEPENDENT', col: 6, dark: 4, deep: 3, icon: 'neutral' };
  AS.PERS_NAMES = { player: 'PLAYER', warlord: 'WARLORD', merchant: 'MERCHANT', turtle: 'TURTLE', opportunist: 'OPPORTUNIST', raider: 'RAIDER', balanced: 'BALANCED' };
  AS.PERS_DESC = {
    warlord: 'AGGRESSIVE. ROLLS OVER WEAKER NEIGHBOURS, THEN HITS THE STRONGEST WHEN THE ODDS ARE GOOD.',
    merchant: 'BIG ECONOMY, BUYS SYSTEMS. FIGHTS WHEN ATTACKED OR WHEN ODDS ARE OVERWHELMING. HITS HARD LATE.',
    turtle: 'FORTIFIES CHOKEPOINTS. RARELY EXPANDS. PUNISHES OVEREXTENDED ATTACKERS.',
    opportunist: 'ATTACKS WHOEVER JUST LOST A BATTLE OR LEFT A SYSTEM LIGHTLY DEFENDED.',
    raider: 'FAST STRIKES ON BORDER SYSTEMS. WRECKS BUILDINGS, THEN RETREATS.',
  };

  AS.SYSTEM_NAMES = ['KESSA', 'VARGA', 'ORPHEON', 'KESTREL', 'MORROW', 'GANTRY', 'CRUCIBLE', 'TANNER', 'COKER', 'FOUNDRY', 'ANVIL', 'MARROW',
    'HEMATITE', 'GRIST', 'SLAG', 'KILN', 'RIME', 'SLEET', 'TALLOW', 'MERIDIAN', 'BELLOWS', 'OSSIA', 'NYX', 'SABLE', 'VANTA', 'ORRIN', 'PELL',
    'THRACE', 'CAIRN', 'DREDGE', 'GALLOWAY', 'HALCYON', 'SCORIA', 'ASHFALL', 'FERRUM', 'CLINKER', 'TETHYS', 'VESPER', 'FLOE', 'JOVAN'];
  AS.PLANET_SUFFIX = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  /* ---------- galaxy events (announced 60 s ahead) ---------- */
  AS.EVENTS = {
    storm:  { name: 'SOLAR STORM',       dur: 60,  w: 1.0 },
    boom:   { name: 'GOLD RUSH',         dur: 90,  w: 1.0, value: 1.5 },
    mercs:  { name: 'ARMS SURPLUS',      dur: 90,  w: 0.9, price: 0.7 },
    lane:   { name: 'LANE COLLAPSE',     dur: 120, w: 0.9 },
    pirate: { name: 'PIRATE SURGE',      dur: 0,   w: 0.8, mult: 1.5, add: 8 },
  };
  AS.EVENT_KEYS = Object.keys(AS.EVENTS);

  /* ---------- difficulty: full, fair economies everywhere; Easy rivals play worse, Hard rivals play faster ---------- */
  AS.DIFFICULTY = {
    easy:   { name: 'EASY',   think: 15.0, margin: 0.6,  sources: 1, pick: 0.9,  focus: 0.45, react: 0.5, income: 1.0, acts: 1, aggr: 0.45,
      desc: 'RIVALS THINK SLOWLY, PICK WORSE TARGETS AND ONLY ATTACK WITH A BIG EDGE.' },
    normal: { name: 'NORMAL', think: 6.0,  margin: 0.25, sources: 2, pick: 0.35, focus: 0.85, react: 0.85, income: 1.0, acts: 2, aggr: 0.75,
      desc: 'RIVALS PLAY THE SAME RULES AS YOU, AT A FAIR PACE.' },
    hard:   { name: 'HARD',   think: 2.5,  margin: 0.1,  sources: 3, pick: 0.0,  focus: 1.15, react: 1.3, income: 1.15, acts: 3, aggr: 1.0,
      desc: 'FAST, COORDINATED RIVALS. THEIR EXTRACTORS DIG 15% MORE (STATED BONUS).' },
  };
  AS.DIFF_KEYS = ['easy', 'normal', 'hard'];

  /* ---------- achievements (stored locally) ---------- */
  AS.ACHIEVEMENTS = [
    { id: 'gold',      name: 'STRIKE GOLD',      desc: 'Sell gold on the market.' },
    { id: 'water',     name: 'FIRST WATER',      desc: 'Melt ice into water.' },
    { id: 'farm',      name: 'WELL FED',         desc: 'Feed your workers from your own farms.' },
    { id: 'port',      name: 'ROUTED',           desc: 'Process a resource on another planet through a port.' },
    { id: 'upgrade',   name: 'TOP SPEC',         desc: 'Upgrade a building to level 3.' },
    { id: 'conquer',   name: 'FIRST CONQUEST',   desc: 'Capture a system by force.' },
    { id: 'buyer',     name: 'PEACEFUL TERMS',   desc: 'Buy a neutral system.' },
    { id: 'hold',      name: 'HELD THE LINE',    desc: 'Beat an attack on one of your systems.' },
    { id: 'capital',   name: 'DECAPITATION',     desc: 'Capture a rival capital.' },
    { id: 'coalition', name: 'COALITION',        desc: 'Fight in a coalition against a leader.' },
    { id: 'eight',     name: 'EIGHT SYSTEMS',    desc: 'Hold 8 systems at once.' },
    { id: 'power200',  name: 'ARMADA',           desc: 'Reach a military power of 200.' },
    { id: 'win',       name: 'GALAXY TAKEN',     desc: 'Win a game.' },
    { id: 'winhard',   name: 'HARD TERMS',       desc: 'Win on Hard.' },
    { id: 'sweep',     name: 'CLEAN SWEEP',      desc: 'Eliminate every rival.' },
  ];
})(globalThis.AS = globalThis.AS || {});
