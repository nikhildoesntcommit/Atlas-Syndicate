/* ATLAS SYNDICATE v4 — config.js
   Every tunable number, the palette and all game data tables.
   Classic script: everything hangs off the single global namespace AS. */
(function (AS) {
  'use strict';

  AS.VERSION = '4.0.0';

  AS.CONFIG = {
    view: { minW: 480, minH: 270, scales: { large: [480, 270], medium: [640, 360], small: [800, 450] } },
    sim: { step: 1 / 20, maxFrameDt: 0.05, maxStepsPerFrame: 600, maxUrlSpeed: 20, hudSpeeds: [1, 2, 3] },

    map: {
      cx: 240, cy: 110,           // star position in world space
      tilt: 0.38,                 // orbital plane squash (oblique 3/4 view)
      refRadius: 82, primePeriod: 600,
      innerR: 30, outerR: 212,
      beltGap: 0.5,               // decorative asteroid belt sits between two orbits
    },
    camera: { zooms: [1, 2, 3, 4], panSpeed: 170, margin: 120, tipDelay: 0.3, glide: 6 },

    economy: {
      startCredits: 1500,
      claimBase: 400, claimPerColony: 190,
      routeBase: 50, routePerDist: 0.6, routeRefund: 0.5, demolishRefund: 0.4,
      freighterCost: 280, freighterCostStep: 35,
      debtInterest: 0.004,
      claimYield: 20,             // units of the main resource a new claim starts with
    },
    build: { time: 6, slow: { fab: 10, habitat: 8, depot: 5 } },
    fleet: {
      start: 3, capacity: 20, speed: 11,
      dockTime: 1.0, unloadTime: 0.7, recheck: 1.0,
      minLoadFrac: 0.3, patience: 6,
      upkeep: 0.3, costPerDist: 0.06,
    },
    colony: {
      foodPer: 0.035, growth: 0.08, decline: 0.05, taxPer: 0.1,
      outpostPop: 6, outpostCap: 8, primeCap: 20, outpostFood: 30,
      storage: 60, primeStorage: 150, depotStorage: 80, reclaimDelay: 60,
      primeStart: { pop: 24, stock: { food: 140, ice: 20, ore: 10 } },
    },
    logistics: { bufferSeconds: 45 },
    market: { sellRate: 3, sellRatePerQ: 0.45, saturation: 140, saturationPerQ: 0.14, satDecay: 45 },
    contracts: {
      first: 75, intervalStart: 85, intervalMin: 40, intervalDecPerMin: 1.6,
      maxActive: 3, deadline: 160, offerTime: 40,
      outputSeconds: 75, outputGrowthPerMin: 0.03, minQty: 10, minRate: 0.05,
      rewardMult: 1.9, rewardBase: 120, confWin: 6, confFail: 8, fulfilRate: 12,
    },
    board: {
      start: 100, quarterSeconds: 180, firstTarget: 650, targetGrowth: 1.24, targetGrowthLate: 1.12, lateFrom: 6,
      missScale: 35, missMax: 30, hitBonus: 6,
      starveDrain: 0.08, debtDrain: 0.05, debtDrainPer1k: 0.06, debtDrainMax: 0.3, colonyLostPenalty: 20,
    },
    discovery: { startKnownR: 112 },
    // a run is a campaign across three star systems; each jump gate warps you to the next, harder one
    campaign: {
      systems: [
        { name: 'SYSTEM 1', unlock: 330, minWorlds: 3, target: 1.0, waves: [80, 170, 260, 350] },
        { name: 'SYSTEM 2', unlock: 210, minWorlds: 3, target: 1.15, waves: [50, 120, 190, 260, 330] },
        { name: 'SYSTEM 3', unlock: 210, minWorlds: 3, target: 1.3, waves: [50, 120, 190, 260, 330] },
      ],
      warpDelay: 6, warpConf: 25, capitalNames: ['ATLAS PRIME', 'ATLAS II', 'ATLAS III'],
    },
    abilities: { boost: { dur: 15, cooldown: 70, mult: 2 }, deflect: { base: 120, perQ: 30 } },
    autoAssignEvery: 1,
    events: {
      startAt: 200, firstJitter: 30, intervalMax: 78, intervalMin: 30, intervalDecPerMin: 1.8, warn: 8,
      sevPerQuarter: 0.08,
      storm: { w: 1, dur: 25 },
      flare: { w: 0.45, dur: 12, minQ: 3 },
      cargo: { w: 0.9 },
      swing: { w: 1, dur: 60, min: 0.45, max: 1.9 },
      spike: { w: 0.7, dur: 45, mult: 2 },
      breakdown: { w: 0.8, dur: 30 },
      meteor: { w: 0.5, minQ: 2, dur: 40, stockLoss: 0.3 },
      fuel: { w: 0.55, dur: 45, mult: 2.5 },
      boom: { w: 0.7, dur: 60, mult: 1.8 },
      immigrants: { w: 0.6, n: 6 },
      blight: { w: 0.5, dur: 35 },
    },
    mega: {
      name: 'JUMP GATE', storage: 400, payFrac: 0.9,
      stageConf: 12, stageGrant: 1200, freeFreighters: 3,
      bonus: 20000, timeBonusPerSec: 15, timeBonusBy: 2400,
      stages: [{ name: 'FRAME' }, { name: 'RING' }, { name: 'IGNITION' }],
      // each system's gate asks for what you can make by then: basics, then gas, then parts
      reqBySystem: [
        [{ ore: 40 }, { ice: 40, alloy: 8 }, { food: 40 }],
        [{ ore: 60 }, { gas: 25, alloy: 10 }, { food: 45, ice: 30 }],
        [{ ore: 70, alloy: 10 }, { gas: 25, parts: 5 }, { food: 45, parts: 5 }],
      ],
    },
    score: { perSecond: 3, perContract: 250, perPeakPop: 10, perStage: 2000, perSystem: 8000 },
    history: { every: 10 },
    selftest: { minutes: 45, seed: 20261117 },
    save: { every: 10 },
  };

  /* ---------- 32-colour industrial palette (unchanged from v3) ---------- */
  AS.PALETTE = [
    '#0d0e10', '#17191c', '#23262a', '#33373c', '#4a4f55', '#676c71', '#8d9195', '#c9c6bb', //  0- 7 soot → steel → dirty cream
    '#2a1d16', '#4a2f20', '#74452a', '#a3612f', '#c98a3e', '#e0b85a', '#f0dfa0', '#3b1a17', //  8-15 umber, rust, ochre, hazard, lamp, oxblood
    '#6e2a20', '#a8402c', '#d06a3a', '#1d2a2a', '#2f4542', '#4f6a60', '#7f9a88', '#1e2433', // 16-23 brick, signal red, orange, slate, verdigris, navy
    '#33405a', '#5b6e8a', '#9fb0c0', '#2e2a1e', '#4f4a2c', '#7d7444', '#b0a46a', '#e8e2cf', // 24-31 blue steel, frost, olive, khaki, sand, bone
  ];
  AS.PAL_KEYS = '0123456789abcdefghijklmnopqrstuv';
  AS.PAL_RGB = AS.PALETTE.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

  /* ---------- goods ---------- */
  AS.GOOD_KEYS = ['ore', 'ice', 'gas', 'alloy', 'food', 'parts'];
  AS.GOODS = {
    ore:   { name: 'ORE',   col: 11, price: 3,  help: 'RAW ORE. SMELTERS TURN 2 ORE INTO 1 ALLOY.' },
    ice:   { name: 'ICE',   col: 26, price: 2,  help: 'RAW ICE. AGRI DOMES TURN IT INTO FOOD.' },
    gas:   { name: 'GAS',   col: 30, price: 4,  help: 'RAW GAS. FABRICATORS NEED IT FOR PARTS.' },
    alloy: { name: 'ALLOY', col: 6,  price: 14, help: 'REFINED METAL. SELLS WELL AND FEEDS FABRICATORS.' },
    food:  { name: 'FOOD',  col: 22, price: 5,  help: 'COLONISTS EAT IT. NO FOOD MEANS A SHRINKING COLONY.' },
    parts: { name: 'PARTS', col: 13, price: 40, help: 'MACHINE PARTS. THE MOST VALUABLE GOOD.' },
  };

  /* ---------- facilities ---------- */
  AS.FAC = {
    mine:    { name: 'ORE MINE',    short: 'MINE',  cost: 260, upkeep: 0.40, deposit: 'ore', extract: { good: 'ore', rate: 0.55 } },
    drill:   { name: 'ICE DRILL',   short: 'DRILL', cost: 260, upkeep: 0.40, deposit: 'ice', extract: { good: 'ice', rate: 0.55 } },
    skimmer: { name: 'GAS SKIMMER', short: 'SKIM',  cost: 320, upkeep: 0.45, deposit: 'gas', extract: { good: 'gas', rate: 0.6 } },
    agri:    { name: 'AGRI DOME',   short: 'AGRI',  cost: 300, upkeep: 0.35, time: 2.0, recipe: { in: { ice: 1 }, out: { food: 2 } } },
    smelter: { name: 'SMELTER',     short: 'SMELT', cost: 380, upkeep: 0.50, time: 2.2, recipe: { in: { ore: 2 }, out: { alloy: 1 } }, industry: true },
    fab:     { name: 'FABRICATOR',  short: 'FAB',   cost: 600, upkeep: 0.70, time: 3.0, recipe: { in: { alloy: 1, gas: 1 }, out: { parts: 1 } }, industry: true },
    habitat: { name: 'HABITAT',     short: 'HAB',   cost: 300, upkeep: 0.25, housing: 12 },
    depot:   { name: 'DEPOT',       short: 'DEPOT', cost: 220, upkeep: 0.20, storage: 80 },
  };
  AS.FAC_KEYS = Object.keys(AS.FAC);
  AS.FAC_DESC = {
    mine: 'DIGS ORE', drill: 'DRILLS ICE', skimmer: 'SKIMS GAS', agri: 'ICE > FOOD',
    smelter: '2 ORE > ALLOY', fab: 'ALLOY+GAS > PARTS', habitat: '+12 COLONISTS', depot: '+80 STORAGE',
  };
  AS.FAC_HELP = {
    mine: 'ORE MINE: DIGS ORE. RICHER DEPOSITS DIG FASTER.',
    drill: 'ICE DRILL: DRILLS ICE. AN AGRI DOME TURNS ICE INTO FOOD.',
    skimmer: 'GAS SKIMMER: COLLECTS GAS. NEEDED FOR PARTS.',
    agri: 'AGRI DOME: 1 ICE > 2 FOOD. ONE DOME FEEDS ABOUT 28 COLONISTS.',
    smelter: 'SMELTER: 2 ORE > 1 ALLOY. ORE CAN BE SHIPPED IN FROM OTHER WORLDS.',
    fab: 'FABRICATOR: ALLOY + GAS > PARTS, THE MOST VALUABLE GOOD.',
    habitat: 'HABITAT: ROOM FOR 12 MORE COLONISTS. COLONISTS PAY TAX AND EAT FOOD.',
    depot: 'DEPOT: +80 STORAGE FOR EVERY GOOD ON THIS WORLD.',
  };
  AS.STATUS_HELP = {
    ok: 'WORKING.', starved: 'IDLE - NEEDS INPUT GOODS DELIVERED HERE.', full: 'STORAGE FULL - SHIP THE OUTPUT AWAY WITH A ROUTE.',
    broken: 'STOPPED BY AN EVENT - RESTARTS BY ITSELF.', build: 'UNDER CONSTRUCTION.',
  };

  /* ---------- world types & traits ---------- */
  AS.TYPE_DEFS = {
    rust:   { size: [4, 6],  slots: [4, 5], dep: R => ({ ore: R(1.2, 1.6) }),                              blurb: 'ROCKY WORLD - ORE' },
    cinder: { size: [3, 5],  slots: [3, 4], dep: R => ({ ore: R(0.8, 1.2), gas: R(0.3, 0.6) }),          blurb: 'VOLCANIC WORLD - ORE, GAS' },
    ice:    { size: [5, 7],  slots: [4, 5], dep: R => ({ ice: R(1.2, 1.6) }),                              blurb: 'ICE WORLD - ICE' },
    ice2:   { size: [3, 5],  slots: [3, 4], dep: R => ({ ice: R(0.9, 1.3), ore: R(0.2, 0.5) }),           blurb: 'ICY MOON - ICE, ORE' },
    gas:    { size: [8, 11], slots: [3, 3], dep: R => ({ gas: R(1.3, 1.8) }),                              blurb: 'GAS GIANT - GAS' },
    belt:   { size: [5, 5],  slots: [4, 4], dep: R => ({ ore: R(1.0, 1.4), ice: R(0.3, 0.6) }),           blurb: 'ASTEROID STATION - ORE, ICE' },
    dwarf:  { size: [3, 4],  slots: [3, 4], dep: R => ({ ore: R(0.5, 0.9), ice: R(0.5, 0.9), gas: R(0, 0.35) }), blurb: 'DWARF WORLD - MIXED' },
  };
  AS.NAME_POOLS = {
    rust: ['FERRUM', 'ANVIL', 'MARROW', 'HEMATITE', 'IRONSIDE', 'GRIST', 'RUSTWATER', 'SLAG'],
    cinder: ['CINDER', 'BRIMSTONE', 'ASHFALL', 'KILN', 'CLINKER', 'SCORIA'],
    ice: ['GLACIES', 'HOARFROST', 'RIME', 'WHITEOUT', 'COLDHARBOUR', 'SLEET'],
    ice2: ['TETHYS', 'PALLOR', 'FROSTMOOR', 'VESPER', 'CALLOW', 'FLOE'],
    gas: ['JOVAN', 'TALLOW', 'MERIDIAN', 'BELLOWS', 'OSSIA', 'HALCYON'],
    belt: ['KESSLER BELT', 'GALLOWAY BELT', 'DREDGE BELT', 'TIPHEAP BELT'],
    dwarf: ['NYX', 'SABLE', 'VANTA', 'ORRIN', 'HOLLOW', 'PELL', 'THRACE', 'CAIRN'],
  };
  AS.SYSTEM_NAMES = ['ATLAS', 'VARGA', 'ORPHEON', 'KESTREL', 'HALBERD', 'MORROW', 'GANTRY', 'CRUCIBLE', 'TANNER', 'BULWARK', 'COKER', 'FOUNDRY'];

  AS.TRAITS = {
    rich:      { name: 'RICH SEAM',      short: 'RICH', icon: '+', desc: '+50% EXTRACTION HERE.', p: 0.22 },
    unstable:  { name: 'UNSTABLE ORBIT', short: 'UNST', icon: '!', desc: 'BREAKDOWNS 3X MORE LIKELY HERE. CLAIM COSTS 30% LESS.', p: 0.14 },
    radiation: { name: 'RADIATION',      short: 'RAD',  icon: '*', desc: 'HABITATS HOLD 40% FEWER COLONISTS. EXTRACTION +25%.', p: 0.14 },
    lowgrav:   { name: 'LOW GRAVITY',    short: 'LOWG', icon: '^', desc: 'TRIPS TO OR FROM HERE COST 60% LESS.', p: 0.15 },
    wide:      { name: 'WIDE PLAIN',     short: 'WIDE', icon: '#', desc: '+1 BUILD SLOT.', p: 0.15 },
    fertile:   { name: 'FERTILE',        short: 'FERT', icon: '&', desc: 'AGRI DOMES HERE MAKE 50% MORE FOOD.', p: 0.16 },
    geo:       { name: 'GEOTHERMAL',     short: 'GEO',  icon: '=', desc: 'FACILITY UPKEEP HERE IS HALVED.', p: 0.12 },
  };
  AS.TRAIT_KEYS = Object.keys(AS.TRAITS);

  /* ---------- Board perks (chosen at each quarterly review) ---------- */
  AS.PERKS = {
    bulk:      { name: 'Bulk Holds',           desc: '+40% freighter cargo.' },
    drives:    { name: 'Fast Drives',          desc: '+25% freighter speed.' },
    express:   { name: 'Express Lanes',        desc: '-40% running cost per trip.' },
    hydro:     { name: 'Hydroponics',          desc: '+50% Agri Dome output.' },
    deep:      { name: 'Deep Drilling',        desc: '+30% output at every mine, drill and skimmer.' },
    trade:     { name: 'Trade License',        desc: '+20% sale prices at Atlas Prime.' },
    rings:     { name: 'Habitat Rings',        desc: '+50% room in every Habitat.' },
    favour:    { name: 'Board Favour',         desc: '+15 Board confidence now.' },
    grant:     { name: 'Grant',                desc: '+1200 credits now, +300 per quarter played.' },
    fleet:     { name: 'Fleet Expansion',      desc: '+2 freighters, free.' },
    bonded:    { name: 'Bonded Warehouses',    desc: '+50% storage on every world.' },
    automat:   { name: 'Automated Lines',      desc: 'Smelters and Fabricators work 40% faster.' },
    taxes:     { name: 'Tax Reform',           desc: '+25% tax from colonists.' },
    hulls:     { name: 'Reinforced Hulls',     desc: 'Freighters never lose cargo to events.' },
    integrate: { name: 'Vertical Integration', desc: 'Fabricators on a world with a Smelter work 50% faster.' },
    cluster:   { name: 'Industrial Cluster',   desc: '+12% extraction per other extractor of the same type on that world.' },
    hub:       { name: 'Hub Network',          desc: '+4% freighter cargo per route Atlas Prime has had (most ever, max +60%).' },
    insure:    { name: 'Insurance',            desc: 'Every harmful event pays you 150 credits per quarter played.' },
    momentum:  { name: 'Momentum',             desc: '+6% sale prices for each target met in a row.' },
    overtime:  { name: 'Overtime',             desc: 'Last 45 s of a quarter, target not met yet: all output +50%.' },
    leanup:    { name: 'Lean Upkeep',          desc: '-25% facility upkeep.' },
    gatefund:  { name: 'Gate Fund',            desc: 'Megaproject deliveries pay double.' },
    survey:    { name: 'Deep Survey',          desc: 'Find the next unknown world now. Claims cost 20% less.' },
  };
  AS.PERK_KEYS = Object.keys(AS.PERKS);

  /* ---------- charters (run modifiers chosen before a run) ---------- */
  AS.CHARTERS = {
    standard:  { name: 'Standard Charter',  desc: 'No special terms. The baseline.',                                  score: 1.0 },
    lean:      { name: 'Lean Operation',    desc: '+600 starting credits. All upkeep costs 30% more.',                score: 1.05 },
    frontier:  { name: 'Frontier Rush',     desc: 'Claims cost 40% less. Board targets are 15% higher.',              score: 1.15 },
    volatile:  { name: 'Volatile Markets',  desc: 'Price swings twice as common and harsher. Contracts pay 40% more.', score: 1.1 },
    hazard:    { name: 'Hazard Lanes',      desc: 'Cargo losses and storms 3x as common. +2 starting freighters.',     score: 1.05 },
    veins:     { name: 'Rich Veins',        desc: '+30% extraction. Colonists eat 25% more.',                         score: 1.0 },
    austerity: { name: 'Austerity Board',   desc: 'Board starts at 75 confidence. Every review offers 4 perks.',       score: 1.2 },
    taxed:     { name: 'Heavy Tax',         desc: '+30% tax. Starving colonies cost twice the confidence.',            score: 1.1 },
  };
  AS.CHARTER_KEYS = Object.keys(AS.CHARTERS);

  /* ---------- events: plain mechanical banners ---------- */
  AS.EVENT_NAMES = {
    storm: 'SOLAR STORM', flare: 'SOLAR FLARE', cargo: 'CARGO LOSS', swing: 'PRICE SWING', spike: 'DEMAND SPIKE',
    breakdown: 'BREAKDOWN', meteor: 'METEOR STRIKE', fuel: 'FUEL SHORTAGE', boom: 'RICH SEAM', immigrants: 'IMMIGRATION',
    blight: 'CROP BLIGHT',
  };
  AS.HARMFUL = { storm: 1, flare: 1, cargo: 1, breakdown: 1, meteor: 1, fuel: 1, blight: 1 };

  /* ---------- achievements (stored locally) ---------- */
  AS.ACHIEVEMENTS = [
    { id: 'first',    name: 'FIRST SALE',        desc: 'Deliver goods to Atlas Prime.' },
    { id: 'five',     name: 'FIVE WORLDS',       desc: 'Own 5 worlds at once.' },
    { id: 'eight',    name: 'SPRAWL',            desc: 'Own 8 worlds at once.' },
    { id: 'pop100',   name: 'CROWDED',           desc: 'Reach 100 colonists.' },
    { id: 'parts',    name: 'PRECISION WORK',    desc: 'Sell 100 parts in one run.' },
    { id: 'fleet20',  name: 'FLEET OF TWENTY',   desc: 'Own 20 freighters.' },
    { id: 'streak5',  name: 'ON TARGET',         desc: 'Meet 5 quarterly targets in a row.' },
    { id: 'contr10',  name: 'CONTRACTOR',        desc: 'Complete 10 contracts in one run.' },
    { id: 'rich',     name: 'HIGH ROLLER',       desc: 'Earn 100,000 credits in one run.' },
    { id: 'comeback', name: 'COMEBACK',          desc: 'Climb from below 20 confidence to above 60.' },
    { id: 'megaup',   name: 'MEGAPROJECT',       desc: 'Unlock a jump gate.' },
    { id: 'warp',     name: 'FIRST JUMP',        desc: 'Open a jump gate and warp to a new system.' },
    { id: 'megadone', name: 'ALL GATES OPEN',    desc: 'Finish all three star systems.' },
    { id: 'speed',    name: 'FAST TRACK',        desc: 'Finish all three systems before 35:00.' },
    { id: 'hard',     name: 'HARD TERMS',        desc: 'Finish all three systems on a x1.15+ charter.' },
    { id: 'shield',   name: 'SHIELDS UP',        desc: 'Deflect 3 meteors in one run.' },
    { id: 'clean',    name: 'CLEAN SHEET',       desc: 'Reach 15:00 with no lost world and no failed contract.' },
    { id: 'daily',    name: 'DAILY SHIFT',       desc: 'Finish a run of the Daily System.' },
  ];

  AS.RANKS = [[90000, 'CHAIRMAN'], [60000, 'MAGNATE'], [40000, 'EXECUTIVE'], [25000, 'DIRECTOR'], [14000, 'MANAGER'], [7000, 'SUPERVISOR'], [0, 'TRAINEE']];
})(globalThis.AS = globalThis.AS || {});
