/* ATLAS SYNDICATE v5 — config.js
   Every tunable number, the palette and all game data tables (corporations, cards, events, factions).
   Classic script: everything hangs off the single global namespace AS. */
(function (AS) {
  'use strict';

  AS.VERSION = '5.0.0';

  AS.CONFIG = {
    view: { minW: 480, minH: 270, scales: { large: [480, 270], medium: [640, 360], small: [800, 450] } },
    sim: { step: 0.1, maxFrameDt: 0.05, maxStepsPerFrame: 40, maxUrlSpeed: 20, hudSpeeds: [1, 2, 3] },
    camera: { zooms: [1, 2, 3], margin: 60, tipDelay: 0.3, glide: 6 },

    game: {
      length: 1800,          // 30:00 timer; most systems wins when it runs out
      protect: 240,          // 0:00-4:00: nobody may attack anybody
      cycle: 10,             // credits, salaries and repairs settle every cycle (seconds)
      cardEvery: 180,        // a card draft every 3 minutes
      leaderShare: 0.35,     // leader pressure kicks in at this share of the galaxy
      histEvery: 10,
    },

    galaxy: { arms: 5, perArm: 4, core: 4, armR0: 72, armDR: 42, twist: 0.5, squash: 0.58, coreR: 30 },

    econ: {
      startCredits: 450,
      extractorCost: 100, lineCost: 50, freighterCost: 60, stationCost: 200,
      perRich: 2,            // an extractor makes richness x 2 units per cycle
      pairValue: 8,          // credits per ORE+ENERGY pair the factory processes
      surplusValue: 1,       // unpaired units sell for this
      popBase: 3, popPerFood: 3, popMax: 30, popMult: 0.05,   // output x (1 + pop x 0.05)
      baseLines: 2, linesAtPop: [12, 22], maxLines: 6,
      startFreighters: 2, maxFreighters: 8,
    },
    dur: {
      decay: 1.2,            // buildings lose this much durability per cycle
      equipDecay: 0.5,       // warships and platforms per cycle
      repairFrac: 0.45,      // full repair costs 45% of the purchase price
      autoRepairAt: 50,      // auto-repair fixes anything below this at the next cycle
      battleDmg: 3, raidDmg: 9,
    },
    army: {
      salary: 0.8, salaryScale: 100,   // salary per soldier per cycle x (1 + army / 100)
      trainTime: 2.0, batch: 5, maxQueue: 25,
      speed: 7,              // galaxy units per second along a lane
      startSoldiers: 12, startVet: 0.2, startPlatforms: 2,
      vetPerCycle: 0.004, vetPerBattle: 0.15, vetBonus: 0.5,
      desertFrac: 0.1,
    },
    equip: { shipCost: 120, shipPower: 5, platformCost: 150, platformPower: 10, maxPlatforms: 6 },
    combat: { round: 0.8, k: 0.15, defBonus: 1.2, capitalBonus: 1.6, raidRounds: 3, raidLoot: 25, retreatLoss: 0.1, maxRounds: 30 },
    buy: { base: 480, growth: 1.25, perGarrison: 8 },   // price = 480 x 1.25^systems owned + 8 per defender
    neutral: { core: [34, 56], arm: [[18, 26], [11, 17], [6, 11], [4, 8]], vet: 0.3 },
    events: { first: 270, every: 240, jitter: 30, warn: 60 },
    history: { every: 10 },
    selftest: { seed: 20261121 },
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

  /* ---------- resources ---------- */
  AS.RES_KEYS = ['ore', 'energy', 'food'];
  AS.RES = {
    ore:    { name: 'ORE',    col: 11, kinds: ['rust', 'cinder', 'dwarf'], help: 'ORE + ENERGY AT THE FACTORY MAKE CREDITS.' },
    energy: { name: 'ENERGY', col: 26, kinds: ['gas', 'ice'],             help: 'ENERGY + ORE AT THE FACTORY MAKE CREDITS.' },
    food:   { name: 'FOOD',   col: 22, kinds: ['terran', 'ice2'],         help: 'FOOD GROWS POPULATION. POPULATION MULTIPLIES OUTPUT.' },
  };

  /* ---------- factions: slot 0 is the player ---------- */
  AS.FACTIONS = [
    { name: 'ATLAS SYNDICATE', short: 'ATLAS', pers: 'player',      col: 13, dark: 11, deep: 9,  icon: 'atlas' },
    { name: 'HALBERD',         short: 'HALBERD', pers: 'warlord',   col: 17, dark: 16, deep: 15, icon: 'warlord' },
    { name: 'GILT',            short: 'GILT',  pers: 'merchant',    col: 31, dark: 6,  deep: 3,  icon: 'merchant' },
    { name: 'BASTION',         short: 'BASTION', pers: 'turtle',    col: 22, dark: 21, deep: 20, icon: 'turtle' },
    { name: 'JACKAL',          short: 'JACKAL', pers: 'opportunist', col: 26, dark: 25, deep: 24, icon: 'opportunist' },
    { name: 'CINDER',          short: 'CINDER', pers: 'raider',     col: 18, dark: 10, deep: 9,  icon: 'raider' },
  ];
  AS.NEUTRAL = { name: 'INDEPENDENT', col: 6, dark: 4, deep: 3, icon: 'neutral' };
  AS.PERS_NAMES = { player: 'PLAYER', warlord: 'WARLORD', merchant: 'MERCHANT', turtle: 'TURTLE', opportunist: 'OPPORTUNIST', raider: 'RAIDER', balanced: 'BALANCED' };
  AS.PERS_DESC = {
    warlord: 'AGGRESSIVE. ATTACKS ITS STRONGEST NEIGHBOUR. SPENDS HEAVILY ON SOLDIERS.',
    merchant: 'BIG ECONOMY, BUYS SYSTEMS. FIGHTS WHEN ATTACKED OR WHEN ODDS ARE OVERWHELMING. HITS HARD LATE.',
    turtle: 'FORTIFIES CHOKEPOINTS. RARELY EXPANDS. PUNISHES OVEREXTENDED ATTACKERS.',
    opportunist: 'ATTACKS WHOEVER JUST LOST A BATTLE OR LEFT A SYSTEM LIGHTLY DEFENDED.',
    raider: 'FAST STRIKES ON BORDER SYSTEMS. WRECKS BUILDINGS, THEN RETREATS.',
  };

  AS.SYSTEM_NAMES = ['KESSA', 'VARGA', 'ORPHEON', 'KESTREL', 'MORROW', 'GANTRY', 'CRUCIBLE', 'TANNER', 'COKER', 'FOUNDRY', 'ANVIL', 'MARROW',
    'HEMATITE', 'GRIST', 'SLAG', 'KILN', 'RIME', 'SLEET', 'TALLOW', 'MERIDIAN', 'BELLOWS', 'OSSIA', 'NYX', 'SABLE', 'VANTA', 'ORRIN', 'PELL',
    'THRACE', 'CAIRN', 'DREDGE', 'GALLOWAY', 'HALCYON', 'SCORIA', 'ASHFALL', 'FERRUM', 'CLINKER', 'TETHYS', 'VESPER', 'FLOE', 'JOVAN'];

  /* ---------- corporations: one strong, simple ability each ---------- */
  AS.CORPS = {
    halden:  { name: 'HALDEN ARMS',     desc: 'SOLDIER SALARIES -30%.' },
    swift:   { name: 'SWIFT HAULAGE',   desc: 'FREIGHTERS 50% FASTER: EACH ONE SERVES 1.5 STOPS.' },
    krone:   { name: 'KRONE SUPPLY',    desc: 'ALL PURCHASES COST 20% LESS.' },
    duramax: { name: 'DURAMAX',         desc: 'BUILDINGS AND EQUIPMENT LOSE DURABILITY 50% SLOWER.' },
    salvage: { name: 'SALVAGE CO',      desc: 'CAPTURED SYSTEMS KEEP ALL BUILDINGS, AT 50% DURABILITY.' },
    fortis:  { name: 'FORTIS DEFENCE',  desc: 'YOUR SYSTEMS DEFEND WITH +20% STRENGTH.' },
    rapid:   { name: 'RAPID TRANSIT',   desc: 'ARMIES MOVE 40% FASTER ALONG LANES.' },
    drill:   { name: 'DRILL MASTERS',   desc: 'SOLDIERS TRAIN TWICE AS FAST AND START AS VETERANS.' },
  };
  AS.CORP_KEYS = Object.keys(AS.CORPS);

  /* ---------- upgrade cards (Turmoil-style draft): exact effects in plain numbers ---------- */
  AS.CARDS = {
    // economy
    deepcore:  { cat: 'econ', name: 'DEEP CORE DRILLS',  desc: 'EXTRACTORS MAKE 15% MORE.' },
    foundry:   { cat: 'econ', name: 'AUTOMATED FOUNDRY', desc: 'FACTORY CREDITS +12%.' },
    hydro:     { cat: 'econ', name: 'HYDROPONICS',       desc: 'EACH FOOD SUPPORTS 30% MORE POPULATION.' },
    trade:     { cat: 'econ', name: 'TRADE CHARTER',     desc: 'SURPLUS UNITS SELL FOR 2 CR INSTEAD OF 1.' },
    bulk:      { cat: 'econ', name: 'BULK CONTRACTS',    desc: 'SYSTEMS WITH 4+ EXTRACTORS EARN +10% CREDITS.' },
    taxes:     { cat: 'econ', name: 'TAX OFFICE',        desc: '+1 CR PER CYCLE FOR EVERY 4 POPULATION.' },
    leanfix:   { cat: 'econ', name: 'LEAN REPAIRS',      desc: 'REPAIRS COST 40% LESS.' },
    bonds:     { cat: 'econ', name: 'WAR BONDS',         desc: '+600 CREDITS NOW.', stack: true },
    // military
    sergeants: { cat: 'mil', name: 'DRILL SERGEANTS',   desc: 'SOLDIERS TRAIN TWICE AS FAST.' },
    cadre:     { cat: 'mil', name: 'VETERAN CADRE',     desc: 'VETERANS GAIN DOUBLE STRENGTH: UP TO +100% INSTEAD OF +50%.' },
    wages:     { cat: 'mil', name: 'LOW WAGES',         desc: 'SOLDIER SALARIES -20%.' },
    shock:     { cat: 'mil', name: 'SHOCK TROOPS',      desc: 'YOUR ATTACKING ARMIES +15% STRENGTH.' },
    warfound:  { cat: 'mil', name: 'WAR FOUNDRIES',     desc: 'WARSHIPS COST 30% LESS.' },
    guns:      { cat: 'mil', name: 'HEAVY GUNS',        desc: 'WARSHIPS +50% STRENGTH.' },
    medics:    { cat: 'mil', name: 'FIELD MEDICS',      desc: '25% OF SOLDIERS LOST IN A BATTLE YOU WIN RETURN.' },
    hardened:  { cat: 'mil', name: 'BATTLE HARDENED',   desc: 'SOLDIERS GAIN DOUBLE VETERANCY FROM BATTLES.' },
    mercs:     { cat: 'mil', name: 'MERCENARY COMPANY', desc: '+15 SOLDIERS AT YOUR CAPITAL NOW.', stack: true },
    // logistics
    extraline: { cat: 'log', name: 'EXTRA LINE',        desc: '+1 SUPPLY LINE IN EVERY SYSTEM.' },
    fastfr:    { cat: 'log', name: 'FAST FREIGHTERS',   desc: 'EACH FREIGHTER SERVES +0.5 STOPS.' },
    drives:    { cat: 'log', name: 'HYPERLANE DRIVES',  desc: 'ARMIES MOVE 30% FASTER.' },
    hulls:     { cat: 'log', name: 'CHEAP HULLS',       desc: 'LINES AND FREIGHTERS COST 40% LESS.' },
    tough:     { cat: 'log', name: 'HARDENED LINES',    desc: 'LINES AND FREIGHTERS LOSE DURABILITY 50% SLOWER.' },
    interior:  { cat: 'log', name: 'INTERIOR LINES',    desc: 'ARMIES MOVING BETWEEN YOUR OWN SYSTEMS ARE 50% FASTER.' },
    // defence
    fortress:  { cat: 'def', name: 'FORTRESS DOCTRINE', desc: 'DEFENDER BONUS +15%: 1.35X INSTEAD OF 1.2X.' },
    grid:      { cat: 'def', name: 'PLATFORM GRID',     desc: 'DEFENCE PLATFORMS +50% STRENGTH.' },
    cheapplat: { cat: 'def', name: 'PREFAB PLATFORMS',  desc: 'DEFENCE PLATFORMS COST 40% LESS.' },
    militia:   { cat: 'def', name: 'MILITIA',           desc: 'EVERY SYSTEM YOU OWN DEFENDS WITH +5 STRENGTH.' },
    radar:     { cat: 'def', name: 'EARLY WARNING',     desc: 'SEE EXACT ARMIES TWO LANES AWAY, NOT ONE.' },
    armour:    { cat: 'def', name: 'ARMOURED STATIONS', desc: 'BUILDINGS TAKE 50% LESS BATTLE AND RAID DAMAGE.' },
    guard:     { cat: 'def', name: 'CAPITAL GUARD',     desc: 'YOUR CAPITAL DEFENDS WITH +40% STRENGTH.' },
  };
  AS.CARD_KEYS = Object.keys(AS.CARDS);
  AS.CARD_CATS = { econ: ['ECONOMY', 13], mil: ['MILITARY', 17], log: ['LOGISTICS', 26], def: ['DEFENCE', 22] };

  /* ---------- galaxy events (announced 60 s ahead) ---------- */
  AS.EVENTS = {
    storm:  { name: 'SOLAR STORM',        dur: 60,  w: 1.0 },
    boom:   { name: 'MARKET BOOM',        dur: 90,  w: 1.0, value: 5 },
    mercs:  { name: 'MERCENARY SURPLUS',  dur: 90,  w: 0.9, salary: 0.5, train: 3 },
    lane:   { name: 'LANE COLLAPSE',      dur: 120, w: 0.9 },
    pirate: { name: 'PIRATE SURGE',       dur: 0,   w: 0.8, mult: 1.5, add: 5 },
  };
  AS.EVENT_KEYS = Object.keys(AS.EVENTS);

  /* ---------- difficulty ---------- */
  AS.DIFFICULTY = {
    easy:   { name: 'EASY',   think: 9.0, odds: 0.2,   sources: 1, focus: 0.3, army: 0.7, aggr: 0.5, noise: 0.35, econ: 0.45, income: 1.0,  repairAt: 15, react: 0.5,
      desc: 'RIVALS REACT SLOWLY, BUILD LESS AND ONLY TAKE SAFE FIGHTS.' },
    normal: { name: 'NORMAL', think: 4.0, odds: 0.0,   sources: 2, focus: 1.0, army: 1.0, aggr: 1.0, noise: 0.15, econ: 1.0, income: 1.0,  repairAt: 30, react: 1.0,
      desc: 'RIVALS PLAY THE SAME RULES AS YOU, AT A FAIR PACE.' },
    hard:   { name: 'HARD',   think: 2.5, odds: -0.05, sources: 3, focus: 1.15, army: 1.0, aggr: 1.1, noise: 0.05, econ: 1.0, income: 1.15, repairAt: 40, react: 1.3,
      desc: 'FAST, COORDINATED RIVALS. THEY EARN +15% CREDITS (STATED BONUS).' },
  };
  AS.DIFF_KEYS = ['easy', 'normal', 'hard'];

  /* ---------- achievements (stored locally) ---------- */
  AS.ACHIEVEMENTS = [
    { id: 'chain',    name: 'FIRST CHAIN',     desc: 'Complete an ORE + ENERGY chain.' },
    { id: 'conquer',  name: 'FIRST CONQUEST',  desc: 'Capture a system by force.' },
    { id: 'buyer',    name: 'PEACEFUL TERMS',  desc: 'Buy a neutral system.' },
    { id: 'hold',     name: 'HELD THE LINE',   desc: 'Win a defensive battle against a rival.' },
    { id: 'raid',     name: 'HIT AND RUN',     desc: 'Complete a raid.' },
    { id: 'capital',  name: 'DECAPITATION',    desc: 'Capture a rival capital.' },
    { id: 'eight',    name: 'EIGHT SYSTEMS',   desc: 'Hold 8 systems at once.' },
    { id: 'twelve',   name: 'HALF THE GALAXY', desc: 'Hold 12 systems at once.' },
    { id: 'army100',  name: 'STANDING ARMY',   desc: 'Field 100 soldiers.' },
    { id: 'vet',      name: 'OLD GUARD',       desc: 'Have a garrison at full veterancy.' },
    { id: 'win',      name: 'GALAXY TAKEN',    desc: 'Win a game.' },
    { id: 'winhard',  name: 'HARD TERMS',      desc: 'Win on Hard.' },
    { id: 'sweep',    name: 'CLEAN SWEEP',     desc: 'Eliminate every rival.' },
    { id: 'nodesert', name: 'PAID IN FULL',    desc: 'Finish a game without a single desertion.' },
  ];
})(globalThis.AS = globalThis.AS || {});
