/* ATLAS SYNDICATE v4 — sim/world.js
   System generation, run creation and the shared state helpers every other sim file uses.
   The simulation is pure: no DOM, no Math.random, identical in the browser and in Node. */
(function (AS) {
  'use strict';

  const S = AS.S = AS.S || {};
  const U = AS.U, C = AS.CONFIG, TAU = U.TAU;

  /* ---------- lookups ---------- */
  S.getBody = (run, id) => run.bodyMap.get(id) || null;
  S.getRoute = (run, id) => run.routeMap.get(id) || null;
  S.prime = run => run.primeRef || (run.primeRef = run.bodies.find(b => b.prime));
  S.site = run => run.bodies.find(b => b.site) || null;
  S.colonies = run => run.bodies.filter(b => b.claimed && !b.site);
  S.known = run => run.bodies.filter(b => b.found);
  S.planeDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  S.has = (b, t) => !!(b && b.traits && b.traits.indexOf(t) >= 0);

  S.systemName = function (seed) {
    const r = U.rng((seed ^ 0xa5a5a5a5) >>> 0);
    return AS.SYSTEM_NAMES[Math.floor(r() * AS.SYSTEM_NAMES.length)] + '-' + (100 + Math.floor(r() * 900));
  };
  /** The three charters offered for a seed (always includes Standard). */
  S.charterOffers = function (seed) {
    const r = U.rng((seed ^ 0x1234567) >>> 0);
    const rest = U.shuffle(r, AS.CHARTER_KEYS.filter(k => k !== 'standard'));
    return ['standard', rest[0], rest[1]];
  };

  /* ---------- system generator: its own PRNG stream, so the map never depends on play ---------- */
  function newBody(run, o) {
    const b = Object.assign({
      id: run.nextId++, key: '', kind: 'dwarf', r: 50, prime: false, site: false, name: '?', size: 4, slotsN: 3,
      dep: {}, traits: [], blurb: '', phase: 0, omega: 0, spin: 0.2, x: 0, z: 0, sx: 0, sy: 0,
      found: false, foundAt: 0, discoverAt: 0, claimed: false, pop: 0, starving: false, boomT: 0, blightT: 0, lostAt: -999,
      stock: {}, keep: {}, want: {}, need: {}, incoming: {}, hold: {}, fac: [],
    }, o);
    for (const g of AS.GOOD_KEYS) { b.stock[g] = 0; b.keep[g] = 0; b.want[g] = 0; b.need[g] = 0; b.incoming[g] = 0; b.hold[g] = 0; }
    b.fac = new Array(b.slotsN).fill(null);
    run.bodies.push(b);
    run.bodyMap.set(b.id, b);
    return b;
  }

  S.generateSystem = function (run) {
    const M = C.map;
    const rng = U.rng((run.seed ^ 0x5bd1e995) >>> 0);
    const R = (a, b) => a + rng() * (b - a);
    const nOther = 10 + (rng() < 0.5 ? 1 : 0);
    const types = ['ice', 'rust', 'gas', 'ice2'];
    const pool = ['rust', 'cinder', 'ice', 'ice2', 'gas', 'belt', 'dwarf', 'dwarf', 'ice2', 'rust', 'cinder'];
    let gas = 1, belt = 0, guard = 0;
    while (types.length < nOther && guard++ < 300) {
      const t = pool[Math.floor(rng() * pool.length)];
      if ((t === 'gas' && gas >= 3) || (t === 'belt' && belt >= 1)) continue;
      if (t === 'gas') gas++;
      if (t === 'belt') belt++;
      types.push(t);
    }
    const pref = { cinder: 0, rust: 1, dwarf: 2, belt: 2.5, ice2: 2.6, ice: 3, gas: 4.5 };
    const ordered = types.map(t => ({ t, k: pref[t] + rng() * 2.6 })).sort((a, b) => a.k - b.k).map(o => o.t);
    const N = nOther + 1;
    const primeIdx = 2 + (rng() < 0.5 ? 1 : 0);
    const radii = [];
    for (let i = 0; i < N; i++) radii.push(Math.round(M.innerR + i * (M.outerR - M.innerR) / (N - 1) + R(-3, 3)));
    // slot kinds by orbit index (prime excluded)
    const slots = [];
    for (let i = 0, oi = 0; i < N; i++) slots.push(i === primeIdx ? 'terran' : ordered[oi++]);
    const knownIdx = [];
    for (let i = 0; i < N; i++) if (radii[i] <= C.discovery.startKnownR) knownIdx.push(i);
    const swapInto = (pred, target) => {
      if (target < 0 || target >= N || target === primeIdx) return;
      let j = -1;
      for (let i = 0; i < N; i++) if (i !== primeIdx && pred(slots[i]) && knownIdx.indexOf(i) < 0) { j = i; break; }
      if (j >= 0) { const t = slots[j]; slots[j] = slots[target]; slots[target] = t; }
    };
    const lastKnown = knownIdx.filter(i => i !== primeIdx).pop();
    // a starting-area ice world and ore world, and a gas giant as the first discovery
    if (!knownIdx.some(i => i !== primeIdx && (slots[i] === 'ice' || slots[i] === 'ice2'))) swapInto(t => t === 'ice' || t === 'ice2', lastKnown);
    if (!knownIdx.some(i => i !== primeIdx && (slots[i] === 'rust' || slots[i] === 'cinder' || slots[i] === 'belt'))) {
      const tgt = knownIdx.find(i => i !== primeIdx && slots[i] !== 'ice' && slots[i] !== 'ice2');
      swapInto(t => t === 'rust' || t === 'cinder', tgt === undefined ? knownIdx[0] : tgt);
    }
    const firstUnknown = knownIdx.length ? Math.max(...knownIdx) + 1 : 1;
    if (slots[firstUnknown] !== 'gas') {
      let j = -1;
      for (let i = firstUnknown + 1; i < N; i++) if (slots[i] === 'gas') { j = i; break; }
      if (j >= 0) { const t = slots[j]; slots[j] = slots[firstUnknown]; slots[firstUnknown] = t; }
    }
    const used = new Set();
    const nameFor = t => {
      const p = AS.NAME_POOLS[t].filter(n => !used.has(n));
      const n = p.length ? p[Math.floor(rng() * p.length)] : t.toUpperCase() + '-' + used.size;
      used.add(n);
      return n;
    };
    const w0 = TAU / M.primePeriod;
    const waves = C.discovery.waves;
    let unknownN = 0;
    for (let i = 0; i < N; i++) {
      const isPrime = i === primeIdx, kind = slots[i], T = AS.TYPE_DEFS[kind];
      const r = radii[i];
      const known = isPrime || r <= C.discovery.startKnownR;
      let discoverAt = 0;
      if (!known) {
        // waves of 1-2 worlds, in order of distance from the star
        const wi = Math.min(waves.length - 1, Math.floor(unknownN * waves.length / Math.max(1, N - knownIdx.length)));
        discoverAt = waves[wi] + (unknownN % 2) * 25;
        unknownN++;
      }
      const b = newBody(run, {
        key: 'w' + run.seed + '_' + i, kind, r, prime: isPrime,
        name: isPrime ? 'ATLAS PRIME' : nameFor(kind),
        size: isPrime ? 7 : Math.round(R(T.size[0], T.size[1])),
        slotsN: isPrime ? 6 : Math.round(R(T.slots[0], T.slots[1])),
        dep: isPrime ? { ore: 0.7, ice: 1.1 } : T.dep(R),
        blurb: isPrime ? 'CAPITAL - SELLS EVERYTHING DELIVERED' : T.blurb,
        phase: rng() * TAU, omega: w0 * Math.pow(M.refRadius / r, 1.5),
        spin: (0.25 + rng() * 0.5) * (rng() < 0.15 ? -1 : 1),
        found: known, foundAt: 0, discoverAt,
      });
      for (const g of Object.keys(b.dep)) { b.dep[g] = Math.round(b.dep[g] * 10) / 10; if (b.dep[g] < 0.15) delete b.dep[g]; }
      if (!isPrime) {
        for (const tk of AS.TRAIT_KEYS) {
          if (b.traits.length >= 2) break;
          const T2 = AS.TRAITS[tk];
          if (tk === 'fertile' && !(b.dep.ice > 0)) continue;
          if (rng() < T2.p) b.traits.push(tk);
        }
        if (S.has(b, 'wide')) { b.slotsN++; b.fac.push(null); }
      }
    }
    // decorative drifting asteroid belt (at the belt station if there is one)
    const bs = run.bodies.find(b => b.kind === 'belt');
    run.beltR = bs ? bs.r : Math.round((radii[Math.min(N - 2, primeIdx + 3)] + radii[Math.min(N - 1, primeIdx + 4)]) / 2);
    // megaproject site: a structure on Atlas Prime's orbit, 60 degrees ahead (hidden until unlocked)
    const P = S.prime(run);
    newBody(run, {
      key: 'site' + run.seed, kind: 'gate', r: P.r, site: true, name: C.mega.name, size: 9, slotsN: 0,
      phase: P.phase + TAU / 6, omega: P.omega, blurb: 'MEGAPROJECT SITE', found: false, claimed: false,
    });
  };

  S.createRun = function (seed, charterKey) {
    seed = (seed >>> 0) || 1;
    const ch = AS.CHARTERS[charterKey] ? charterKey : 'standard';
    const rngState = { a: seed };
    const run = {
      v: 4, seed, charter: ch, sysName: S.systemName(seed), rngState, rng: U.rngFrom(rngState), t: 0, steps: 0,
      credits: C.economy.startCredits, conf: C.board.start,
      bodies: [], bodyMap: new Map(), routes: [], routeMap: new Map(), freighters: [], nextId: 1, primeRef: null,
      market: {}, contracts: [], nextContract: C.contracts.first, contractsDone: 0, contractsFailed: 0,
      quarter: 0, nextQuarter: C.board.quarterSeconds, target: C.board.firstTarget, qIncome: 0,
      totalIncome: 0, incomeRate: 0, expenseRate: 0, frameIncome: 0, frameExpense: 0, tripSpend: 0,
      perks: {}, shop: null, over: false, won: false, overReason: '', fx: [], banner: null,
      nextEvent: 0, pending: [], fx2: {}, flareT: 0, fuelT: 0,
      freightersBought: 0, peakPop: 0, eventsFired: 0, routesBuilt: 0, facilitiesBuilt: 0, coloniesLost: 0,
      lastReview: null, saleAcc: 0, saleTimer: 0, payTimer: 0, lastEvent: '', streak: 0, bestStreak: 0,
      minConf: 100, comeback: false, daily: false,
      mega: { state: 'locked', stage: 0, done: {}, unlockedAt: 0, completedAt: 0, delivered: 0, stageAt: [] },
      hist: [], histT: 0, log: [],
      stats: { sold: {}, delivered: 0, maxColonies: 1, maxFleet: 0, megaPaid: 0 },
      mods: {
        cap: 1, speed: 1, tripCost: 1, agri: 1, extract: 1, trade: 1, housing: 1, storage: 1, industry: 1, tax: 1,
        upkeep: 1, facUpkeep: 1, food: 1, claim: 1, hulls: false, swingFreq: 1, swingPow: 1, contractPay: 1, starveMult: 1,
        perkChoices: 3, hazardMult: 1, targetMult: 1,
      },
    };
    const M = run.mods;
    switch (ch) {
      case 'lean': run.credits += 600; M.upkeep = 1.3; break;
      case 'frontier': M.claim = 0.6; M.targetMult = 1.15; break;
      case 'volatile': M.swingFreq = 2; M.swingPow = 1.4; M.contractPay = 1.4; break;
      case 'hazard': M.hazardMult = 3; break;
      case 'veins': M.extract = 1.3; M.food = 1.25; break;
      case 'austerity': run.conf = 75; M.perkChoices = 4; break;
      case 'taxed': M.tax = 1.3; M.starveMult = 2; break;
    }
    run.target = Math.round(C.board.firstTarget * M.targetMult);
    for (const g of AS.GOOD_KEYS) {
      run.market[g] = { sat: 0, swing: 1, swingT: 0, spike: 1, spikeT: 0, price: AS.GOODS[g].price, prev: AS.GOODS[g].price, trend: 0 };
      run.stats.sold[g] = 0;
      run.mega.done[g] = 0;
    }
    run.nextEvent = C.events.startAt + run.rng() * C.events.firstJitter;
    S.generateSystem(run);
    S.updatePositions(run);
    const P = S.prime(run);
    const st = C.colony.primeStart;
    P.claimed = true; P.pop = st.pop;
    for (const g of Object.keys(st.stock)) P.stock[g] = st.stock[g];
    ['mine', 'drill', 'agri', 'smelter', 'habitat'].forEach((t, i) => { P.fac[i] = S.newFacility(t, 0); });
    for (let i = 0; i < C.fleet.start + (ch === 'hazard' ? 2 : 0); i++) S.addFreighter(run);
    S.computeLogistics(run);
    S.record(run);
    run.fx.length = 0;
    return run;
  };

  S.newFacility = (type, buildTime) => ({ type, prog: 0, busy: false, status: buildTime > 0 ? 'build' : 'ok', broken: 0, build: buildTime || 0, buildT: buildTime || 0 });
  S.buildTime = type => (C.build.slow[type] || C.build.time);
  S.addFreighter = function (run) {
    const f = { id: run.nextId++, route: null, state: 'idle', at: 0, from: 0, to: 0, prog: 0, dist: 1, timer: 0, wait: 0, cargo: {}, load: 0 };
    run.freighters.push(f);
    run.stats.maxFleet = Math.max(run.stats.maxFleet || 0, run.freighters.length);
    return f;
  };
  S.updatePositions = function (run) {
    const M = C.map;
    for (const b of run.bodies) {
      const a = b.phase + b.omega * run.t;
      b.x = b.r * Math.cos(a); b.z = b.r * Math.sin(a);
      b.sx = M.cx + b.x; b.sy = M.cy + b.z * M.tilt;
    }
  };

  /* ---------- derived quantities (traits and perks fold in here) ---------- */
  S.countFac = (b, type) => { let n = 0; for (const f of b.fac) if (f && f.type === type && f.build <= 0) n++; return n; };
  S.storageCap = function (run, b) {
    if (b.site) return C.mega.storage;
    let s = b.prime ? C.colony.primeStorage : C.colony.storage;
    for (const f of b.fac) if (f && f.type === 'depot' && f.build <= 0) s += C.colony.depotStorage;
    return Math.round(s * run.mods.storage);
  };
  S.housing = function (run, b) {
    let h = b.prime ? C.colony.primeCap : C.colony.outpostCap;
    const rad = S.has(b, 'radiation') ? 0.6 : 1;
    for (const f of b.fac) if (f && AS.FAC[f.type].housing && f.build <= 0) h += AS.FAC[f.type].housing * run.mods.housing * rad;
    return Math.round(h);
  };
  S.claimCost = (run, b) => Math.round((C.economy.claimBase + C.economy.claimPerColony * (S.colonies(run).length - 1)) * run.mods.claim * (S.has(b, 'unstable') ? 0.7 : 1));
  S.routeCost = (a, b) => Math.round(C.economy.routeBase + C.economy.routePerDist * S.planeDist(a, b));
  S.tripCost = function (run, dist, A, B) {
    let c = dist * C.fleet.costPerDist * run.mods.tripCost;
    if (S.has(A, 'lowgrav') || S.has(B, 'lowgrav')) c *= 0.4;
    if (run.fuelT > 0) c *= C.events.fuel.mult;
    return c;
  };
  S.freighterCost = run => C.economy.freighterCost + C.economy.freighterCostStep * run.freightersBought;
  S.primeRoutes = function (run) { const P = S.prime(run); let n = 0; for (const r of run.routes) if (r.a === P.id || r.b === P.id) n++; return n; };
  /** Cargo per freighter. Hub Network counts the most routes Prime ever had, so capacity never shrinks under a loaded freighter. */
  S.capacity = function (run) {
    if (!run.perks.hub) return Math.round(C.fleet.capacity * run.mods.cap);
    const cur = S.primeRoutes(run);
    if (cur > (run.stats.maxPrimeRoutes || 0)) run.stats.maxPrimeRoutes = cur;
    return Math.round(C.fleet.capacity * (run.mods.cap + Math.min(0.6, 0.04 * run.perks.hub * run.stats.maxPrimeRoutes)));
  };
  S.routeBetween = function (run, a, b) {
    for (const r of run.routes) if ((r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id)) return r;
    return null;
  };
  S.neighbors = function (run, b) {
    const out = [];
    for (const r of run.routes) { if (r.a === b.id) out.push(S.getBody(run, r.b)); else if (r.b === b.id) out.push(S.getBody(run, r.a)); }
    return out.filter(Boolean);
  };
  S.sellRate = (run, g) => (C.market.sellRate + C.market.sellRatePerQ * run.quarter) * (run.market[g].spikeT > 0 ? 2 : 1);
  S.marketPrice = function (run, g) {
    const m = run.market[g];
    const depth = C.market.saturation * (1 + C.market.saturationPerQ * run.quarter);
    const mom = run.perks.momentum ? 1 + 0.06 * run.perks.momentum * run.streak : 1;
    return U.fin(AS.GOODS[g].price * m.swing * m.spike * run.mods.trade * mom / (1 + m.sat / depth), AS.GOODS[g].price);
  };
  S.idleFreighters = run => run.freighters.filter(f => !f.route);
  S.routeFreighters = (run, r) => run.freighters.filter(f => f.route === r.id);
  S.totalPop = function (run) { let p = 0; for (const b of run.bodies) if (b.claimed) p += b.pop; return p; };
  S.facUpkeep = (run, b, f) => AS.FAC[f.type].upkeep * (S.has(b, 'geo') ? 0.5 : 1) * run.mods.facUpkeep;
  S.upkeepRate = function (run) {
    let u = run.freighters.length * C.fleet.upkeep;
    for (const b of run.bodies) if (b.claimed) for (const f of b.fac) if (f && f.build <= 0) u += S.facUpkeep(run, b, f);
    return u * run.mods.upkeep;
  };
  S.foodRate = (run, b) => b.pop * C.colony.foodPer * run.mods.food;
  S.overtime = run => !!run.perks.overtime && run.nextQuarter - run.t < 45 && run.qIncome < run.target;
  S.extractRate = function (run, b, f) {
    const F = AS.FAC[f.type];
    if (!F.extract) return 0;
    let r = F.extract.rate * (b.dep[F.deposit] || 0) * run.mods.extract;
    if (S.has(b, 'rich')) r *= 1.5;
    if (S.has(b, 'radiation')) r *= 1.25;
    if (b.boomT > 0) r *= C.events.boom.mult;
    if (run.perks.cluster) r *= 1 + 0.12 * run.perks.cluster * Math.max(0, S.countFac(b, f.type) - 1);
    if (S.overtime(run)) r *= 1.5;
    return r;
  };
  /** Speed multiplier for a recipe facility (1 = nominal). */
  S.recipeSpeed = function (run, b, f) {
    const F = AS.FAC[f.type];
    let s = 1;
    if (f.type === 'agri') { s *= run.mods.agri * (S.has(b, 'fertile') ? 1.5 : 1); if (b.blightT > 0) s = 0; }
    if (F.industry) s *= run.mods.industry;
    if (f.type === 'fab' && run.perks.integrate && S.countFac(b, 'smelter') > 0) s *= 1.5;
    if (S.overtime(run)) s *= 1.5;
    return s;
  };

  /** Theoretical output per second of a good across all worlds (working facilities only). */
  S.productionRate = function (run, g) {
    let r = 0;
    for (const b of run.bodies) {
      if (!b.claimed) continue;
      for (const f of b.fac) {
        if (!f || f.build > 0 || (f.status !== 'ok' && f.status !== 'full')) continue;
        const F = AS.FAC[f.type];
        if (F.extract && F.extract.good === g) r += S.extractRate(run, b, f);
        else if (F.recipe && F.recipe.out[g]) r += F.recipe.out[g] / F.time * S.recipeSpeed(run, b, f);
      }
    }
    return r;
  };

  S.logMoment = function (run, text, k) {
    run.log.push({ t: Math.round(run.t), text, k: k || 'info' });
    if (run.log.length > 120) run.log.splice(0, run.log.length - 120);
  };
  S.record = function (run) {
    run.hist.push([Math.round(run.t), Math.round(run.credits), Math.round(S.totalPop(run)), Math.round(run.conf), Math.round(run.incomeRate * 10) / 10]);
    if (run.hist.length > 600) run.hist = run.hist.filter((_, i) => i % 2 === 0);
  };
})(globalThis.AS = globalThis.AS || {});
