/* ATLAS SYNDICATE v6 — config.js
   Every tunable number, the palette and all game data tables (resources, buildings, upgrades, events,
   factions, difficulty). Classic script: everything hangs off the single global namespace AS. */
(function (AS) {
  'use strict';

  AS.VERSION = '6.0.0';
  AS.SAVE_VERSION = 6;

  AS.CONFIG = {
    view: { minW: 400, minH: 225 },
    sim: { step: 0.1, maxFrameDt: 0.05, maxStepsPerFrame: 40, maxUrlSpeed: 20, hudSpeeds: [1, 2, 3] },
    camera: { zooms: [1, 2, 3], margin: 60, tipDelay: 0.3, glide: 6 },

    game: {
      length: 1800,          // 30:00 timer; most systems wins when it runs out
      protect: 240,          // 0:00-4:00: nobody may attack anybody
      cycle: 10,             // production, salaries, rations and upkeep settle every cycle (seconds)
      leaderShare: 0.35,     // a coalition forms against anyone holding this share of the galaxy
      endgame: 1080,         // from 18:00 rival capitals become everybody's priority
      histEvery: 10,
    },
    coalition: { duration: 300, cooldown: 30, strikeFirst: 30, strikeEvery: 30, breakShare: 0.27 },

    galaxy: { arms: 6, perArm: 3, core: 6, armR0: 86, armDR: 52, twist: 0.42, squash: 0.58, coreR: 38 },

    /* the planet cross-section: w x h underground cells below a strip of surface slots */
    ground: { w: 32, h: 16, hardCost: [1, 2, 4], drillCost: 2 },

    econ: {
      start: { credits: 650, alloy: 100, fuel: 40, food: 80 },
      levy: 5,               // credits per owned system per cycle
      extractRate: 1.6,      // raw units per cycle from a drilled deposit (+0.07 per row of depth)
      depthRate: 0.07,
      procCap: 4,            // raw units a processor can take per cycle
      bonus: 1.5,            // processor on a matching planet type
      mint: 6,               // credits per gold unit
      pathCap: 6,            // units per cycle, each direction
      basePathways: 2, maxPathways: 6,
      popMax: 20, popFood: 0.05, popMult: 0.015,
    },
    dur: { decay: 1.0, autoRepairAt: 50, repairFrac: 0.4, battleDmg: 3, raidDmg: 10 },
    army: {
      recruitCost: 8, salary: 0.5, salaryScale: 100, rations: 0.15,
      trainTime: 2.0, batch: 5, maxQueue: 25, speed: 7,
      startSoldiers: 12, startVet: 0.2, startPlatforms: 2,
      vetPerCycle: 0.004, vetPerBattle: 0.15, vetBonus: 0.5,
      desertFrac: 0.1, hungerMult: 0.75,
      laneFuel: 2, fuelPer10: 2,      // fuel per lane = 2 + 2 per 10 strength sent
    },
    equip: { shipCost: [90, 40], shipPower: 5, shipFuel: 1, platCost: [100, 50], platformPower: 10, maxPlatforms: 6 },
    combat: { round: 0.8, k: 0.15, defBonus: 1.2, capitalBonus: 1.15, raidRounds: 3, raidLoot: 25, retreatLoss: 0.1, maxRounds: 30 },
    buy: { base: 480, growth: 1.25, perGarrison: 8 },
    neutral: { core: [30, 48], arm: [[16, 24], [9, 14]], vet: 0.3 },
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

  /* ---------- resources: raw deposit -> processed stock ---------- */
  AS.RES_KEYS = ['metal', 'gold', 'ice', 'fuel'];
  AS.RES = {
    fuel:  { name: 'FUEL',  raw: 'CRUDE', out: 'fuel',    outName: 'FUEL',    col: 1,  hi: 10, mark: 18, ext: 'pump',     proc: 'refinery', planets: ['gas', 'cinder'],
      use: 'FUEL MOVES ARMIES (EVERY LANE COSTS FUEL) AND KEEPS WARSHIPS RUNNING.' },
    ice:   { name: 'ICE',   raw: 'ICE',   out: 'food',    outName: 'FOOD',    col: 25, hi: 31, mark: 26, ext: 'icedrill', proc: 'water',    planets: ['ice', 'ice2'],
      use: 'WATER AND FOOD: SOLDIER RATIONS AND POPULATION GROWTH.' },
    metal: { name: 'METAL', raw: 'ORE',   out: 'alloy',   outName: 'ALLOY',   col: 10, hi: 6,  mark: 11, ext: 'mine',     proc: 'smelter',  planets: ['rust', 'cinder'],
      use: 'ALLOY: BUILDINGS, REPAIRS, WARSHIPS AND PLATFORMS.' },
    gold:  { name: 'GOLD',  raw: 'GOLD',  out: 'credits', outName: 'CREDITS', col: 13, hi: 14, mark: 13, ext: 'goldmine', proc: 'mint',     planets: ['dwarf', 'terran'],
      use: 'CREDITS: SALARIES, RECRUITS, PATHWAYS, UPGRADES, BUYING SYSTEMS.' },
  };
  AS.STOCK_KEYS = ['credits', 'alloy', 'fuel', 'food'];
  AS.STOCK = { credits: { name: 'CREDITS', col: 13 }, alloy: { name: 'ALLOY', col: 6 }, fuel: { name: 'FUEL', col: 18 }, food: { name: 'FOOD', col: 22 } };

  /* ---------- buildings: exactly two per resource ---------- */
  AS.BLD = {
    mine:     { name: 'MINE',        res: 'metal', role: 'ext',  cost: [60, 0],   art: 'mine' },
    smelter:  { name: 'SMELTER',     res: 'metal', role: 'proc', cost: [85, 0],  art: 'smelter' },
    goldmine: { name: 'GOLD MINE',   res: 'gold',  role: 'ext',  cost: [60, 15], art: 'mine' },
    mint:     { name: 'MINT',        res: 'gold',  role: 'proc', cost: [80, 20], art: 'depot' },
    icedrill: { name: 'ICE DRILL',   res: 'ice',   role: 'ext',  cost: [50, 15],  art: 'drill' },
    water:    { name: 'WATER PLANT', res: 'ice',   role: 'proc', cost: [70, 20], art: 'agri' },
    pump:     { name: 'FUEL PUMP',   res: 'fuel',  role: 'ext',  cost: [50, 15],  art: 'skimmer' },
    refinery: { name: 'REFINERY',    res: 'fuel',  role: 'proc', cost: [70, 20], art: 'fab' },
  };
  // the mine and smelter cost no alloy, so alloy production can always be restarted
  AS.BLD_KEYS = ['mine', 'smelter', 'goldmine', 'mint', 'icedrill', 'water', 'pump', 'refinery'];
  AS.COSTS = { conveyor: [10, 0], pathway: [60, 20] };

  /* ---------- the upgrade shop: four tracks, bought in order, prices rise along each track ---------- */
  AS.UPGRADES = {
    ext: { name: 'EXTRACTION', col: 11, items: [
      { key: 'bits',   name: 'DIAMOND BITS',       desc: 'DRILLING COSTS 30% LESS.' },
      { key: 'rigs',   name: 'HIGH-PRESSURE RIGS', desc: 'EXTRACTORS +25% OUTPUT.' },
      { key: 'shafts', name: 'REINFORCED SHAFTS',  desc: 'EXTRACTORS AND DRILLS WEAR 50% SLOWER.' },
      { key: 'deep',   name: 'DEEP-CORE RIGS',     desc: 'EXTRACTORS +25% OUTPUT.' },
      { key: 'survey', name: 'SURFACE SURVEY',     desc: '+1 BUILDING SLOT ON EVERY PLANET.' },
    ] },
    proc: { name: 'PROCESSING', col: 13, items: [
      { key: 'hoppers', name: 'LARGER HOPPERS',  desc: 'PROCESSORS TAKE 30% MORE INPUT.' },
      { key: 'alloyx',  name: 'CLEAN SMELTING',  desc: 'SMELTERS MAKE 25% MORE ALLOY.' },
      { key: 'minting', name: 'FINE MINTING',    desc: 'MINTS PAY 8 CREDITS PER GOLD INSTEAD OF 6.' },
      { key: 'hydro',   name: 'HYDROPONICS',     desc: 'WATER PLANTS MAKE 40% MORE FOOD.' },
      { key: 'crack',   name: 'CRACKING TOWERS', desc: 'REFINERIES MAKE 40% MORE FUEL.' },
    ] },
    log: { name: 'LOGISTICS', col: 26, items: [
      { key: 'wide',   name: 'WIDE PATHWAYS',    desc: 'PATHWAYS CARRY 50% MORE.' },
      { key: 'path1',  name: 'EXTRA PATHWAY',    desc: '+1 PATHWAY IN EVERY SYSTEM.' },
      { key: 'belts',  name: 'STEEL CONVEYORS',  desc: 'CONVEYORS AND PATHWAYS WEAR 50% SLOWER.' },
      { key: 'path2',  name: 'SECOND PATHWAY',   desc: '+1 PATHWAY IN EVERY SYSTEM.' },
      { key: 'drives', name: 'EFFICIENT DRIVES', desc: 'ARMIES USE 40% LESS FUEL.' },
    ] },
    mil: { name: 'MILITARY', col: 17, items: [
      { key: 'wages',   name: 'DRILL INSTRUCTORS', desc: 'SOLDIER SALARIES -20%.' },
      { key: 'kitchen', name: 'FIELD KITCHENS',    desc: 'SOLDIER RATIONS -40%.' },
      { key: 'grid',    name: 'PLATFORM GRID',     desc: 'DEFENCE PLATFORMS +50% STRENGTH.' },
      { key: 'guns',    name: 'HEAVY GUNS',        desc: 'WARSHIPS +50% STRENGTH.' },
      { key: 'cadre',   name: 'VETERAN CADRE',     desc: 'VETERANS UP TO +100% STRENGTH INSTEAD OF +50%.' },
    ] },
  };
  AS.UPG_TRACKS = ['ext', 'proc', 'log', 'mil'];
  AS.upgPrice = level => [Math.round(150 * Math.pow(1.6, level)), Math.round(20 * Math.pow(1.6, level))];

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
    mercs:  { name: 'MERCENARY SURPLUS', dur: 90,  w: 0.9, salary: 0.5, train: 3 },
    lane:   { name: 'LANE COLLAPSE',     dur: 120, w: 0.9 },
    pirate: { name: 'PIRATE SURGE',      dur: 0,   w: 0.8, mult: 1.5, add: 5 },
  };
  AS.EVENT_KEYS = Object.keys(AS.EVENTS);

  /* ---------- difficulty: full, fair economies everywhere; Easy rivals play worse, Hard rivals play faster ---------- */
  AS.DIFFICULTY = {
    easy:   { name: 'EASY',   think: 15.0, odds: 0.24, sources: 1, pick: 0.9,  focus: 0.45, react: 0.5, repairAt: 30, income: 1.0, acts: 1, aggr: 0.45,
      desc: 'RIVALS THINK SLOWLY, PICK WORSE TARGETS AND TAKE FEWER RISKS.' },
    normal: { name: 'NORMAL', think: 6.0, odds: 0.06,  sources: 2, pick: 0.35, focus: 0.85, react: 0.85, repairAt: 35, income: 1.0, acts: 2, aggr: 0.75,
      desc: 'RIVALS PLAY THE SAME RULES AS YOU, AT A FAIR PACE.' },
    hard:   { name: 'HARD',   think: 2.5, odds: -0.05, sources: 3, pick: 0.0,  focus: 1.15, react: 1.3, repairAt: 45, income: 1.15,
      desc: 'FAST, COORDINATED RIVALS. THEY EARN +15% CREDITS (STATED BONUS).' },
  };
  AS.DIFF_KEYS = ['easy', 'normal', 'hard'];

  /* ---------- achievements (stored locally) ---------- */
  AS.ACHIEVEMENTS = [
    { id: 'alloy',     name: 'FIRST ALLOY',      desc: 'Smelt your first alloy.' },
    { id: 'gold',      name: 'STRIKE GOLD',      desc: 'Mint credits from gold.' },
    { id: 'port',      name: 'ROUTED',           desc: 'Process a resource on another planet through a port.' },
    { id: 'conquer',   name: 'FIRST CONQUEST',   desc: 'Capture a system by force.' },
    { id: 'buyer',     name: 'PEACEFUL TERMS',   desc: 'Buy a neutral system.' },
    { id: 'hold',      name: 'HELD THE LINE',    desc: 'Win a defensive battle against a rival.' },
    { id: 'capital',   name: 'DECAPITATION',     desc: 'Capture a rival capital.' },
    { id: 'coalition', name: 'COALITION',        desc: 'Fight in a coalition against a leader.' },
    { id: 'shop',      name: 'TOP OF THE TRACK', desc: 'Buy all five upgrades of one track.' },
    { id: 'eight',     name: 'EIGHT SYSTEMS',    desc: 'Hold 8 systems at once.' },
    { id: 'army100',   name: 'STANDING ARMY',    desc: 'Field 100 soldiers.' },
    { id: 'win',       name: 'GALAXY TAKEN',     desc: 'Win a game.' },
    { id: 'winhard',   name: 'HARD TERMS',       desc: 'Win on Hard.' },
    { id: 'sweep',     name: 'CLEAN SWEEP',      desc: 'Eliminate every rival.' },
  ];
})(globalThis.AS = globalThis.AS || {});
