/* ATLAS SYNDICATE v7 — sim/economy.js
   The economy, in one loop:
     ICE  -> ice drill -> conveyor -> water plant -> WATER -> greenhouse / livestock farm -> FOOD -> workers
     CRUDE -> fuel pump -> conveyor -> refinery -> FUEL -> the military (it fights at the share of fuel it gets)
     GOLD -> gold mine -> GOLD -> sold on the market -> MONEY -> buildings, upgrades, military, systems
   Every building needs workers. Workers arrive with the building and eat food every cycle; if the food
   runs out some of them die, and buildings without a full crew stop until workers come back.
   Machinery never wears out: instead every building can be upgraded twice (+50% throughput per level).
   S.sysFlow() is the one place that decides what flows where, and why not: the renderer, the AI, the
   forecast and the cycle all read it, so what the screen shows is exactly what the simulation does. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, E = C.econ;

  /* ---------- modifiers (the only one left is Hard's stated rival bonus) ---------- */
  S.recomputeMods = function (run, f) {
    const m = { extract: 1 };
    if (f.id !== 0) m.extract = AS.DIFFICULTY[run.diff].income;
    f.mods = m;
    return m;
  };

  /* ---------- helpers ---------- */
  S.fac = (run, id) => run.factions[id];
  S.ownSystems = (run, fid) => run.systems.filter(s => s.owner === fid);
  S.ownCount = function (run, fid) { let n = 0; for (const s of run.systems) if (s.owner === fid) n++; return n; };
  S.canPay = (f, c) => f.money >= (c || 0) - 1e-9;
  function pay(f, c) { c = c || 0; if (!S.canPay(f, c)) return false; f.money -= c; f.stats.spent += c; return true; }
  S.pay = pay;
  const short = c => ({ ok: false, reason: 'cost', cost: c });
  S.bldCost = kind => AS.BLD[kind].cost;
  S.pathwaySlots = () => E.maxPathways;
  S.pathwayById = (sys, id) => sys.pathways.find(p => p.id === id) || null;
  S.portsOf = (sys, pi) => sys.pathways.filter(p => p.a === pi || p.b === pi);
  S.otherPlanet = (pw, pi) => (pw.a === pi ? pw.b : pw.a);
  S.stormed = function (run, sys) {
    for (const e of run.events.active) if (e.type === 'storm' && (e.region === 'core' ? sys.region === 'core' : sys.arm === e.arm)) return true;
    return false;
  };
  /** Throughput multiplier of a building's level: 1, 1.5, 2. */
  S.lvlMult = b => 1 + C.upgrade.boost * ((b.lvl || 1) - 1);
  S.extRate = (f, dep, b) => (E.extractRate + E.depthRate * dep.depth) * (f ? f.mods.extract : 1) * (b ? S.lvlMult(b) : 1);
  /** +50% for a processor or farm on a planet that suits it. */
  S.procBonus = function (p, kind) {
    const B = AS.BLD[kind];
    if (B.role === 'farm') return AS.FARM_PLANETS.indexOf(p.kind) >= 0 ? E.bonus : 1;
    if (B.role === 'proc') return AS.RES[B.res].planets.indexOf(p.kind) >= 0 ? E.bonus : 1;
    return 1;
  };
  S.crewNeed = function (sys) { let n = 0; for (const p of sys.planets) n += p.blds.length; return n * E.crew; };
  S.workers = function (run, fid) { let n = 0; for (const s of run.systems) if (s.owner === fid) n += s.workers; return n; };

  /* ---------- the flow solver ---------- */
  /** What every building, conveyor, port and pathway in a system does this cycle, and why. Pure. */
  S.sysFlow = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const storm = S.stormed(run, sys);
    const out = { gold: 0, water: 0, food: 0, fuel: 0 }, B = {}, P = {}, ports = {};
    const capLeft = {}, pathLeft = {};
    const pathCap = E.pathCap;
    const portKey = (pi, pw) => pi + ':' + pw;
    // crews: food production is staffed first, then everything else in build order
    const all = [];
    sys.planets.forEach(p => { for (const b of p.blds) all.push(b); });
    const prio = b => { const R = AS.BLD[b.kind]; return R.role === 'farm' ? 0 : R.res === 'ice' ? 1 : 2; };
    const staffed = {};
    let avail = sys.workers;
    for (const b of all.slice().sort((a, c) => prio(a) - prio(c) || a.id - c.id)) if (avail >= E.crew) { staffed[b.id] = true; avail -= E.crew; }
    for (const pw of sys.pathways) P[pw.id] = { ab: 0, ba: 0, ok: !storm, cap: pathCap, res: {} };
    sys.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const R = AS.BLD[b.kind];
        B[b.id] = { pi, rate: 0, potential: 0, input: 0, output: 0, water: 0, status: 'ok', reason: 'WORKING', role: R.role, res: R.res, staffed: !!staffed[b.id] };
        if (R.role === 'proc') capLeft[b.id] = staffed[b.id] ? E.procCap * S.lvlMult(b) : 0;
      }
      for (const pw of S.portsOf(sys, pi)) ports[portKey(pi, pw.id)] = { out: 0, in: 0, outRes: null, inRes: null };
    });
    const NOCREW = 'STOPPED: NO WORKERS. FEED THEM AND THEY COME BACK';
    // extractors, in id order, claim processor capacity
    const exts = [];
    sys.planets.forEach((p, pi) => { for (const b of p.blds) if (AS.BLD[b.kind].role === 'ext') exts.push([p, pi, b]); });
    exts.sort((a, b) => a[2].id - b[2].id);
    for (const [p, pi, b] of exts) {
      const st = B[b.id], res = st.res, R = AS.RES[res];
      const bad = (s, r) => { st.status = s; st.reason = r; };
      if (!st.staffed) { bad('nocrew', NOCREW); continue; }
      if (!b.drill) { bad('idle', 'IDLE: DRAG DOWN FROM IT TO A ' + R.name + ' DEPOSIT'); continue; }
      const dep = p.deposits[b.drill.dep];
      if (!dep || dep.amount <= 0) { bad('empty', 'DEPOSIT EMPTY: DEMOLISH IT OR DRILL ELSEWHERE'); continue; }
      const potential = Math.min(dep.amount, S.extRate(f, dep, b));
      st.potential = potential; st.dep = dep.id;
      if (!R.proc) {   // the gold mine: straight to the stockpile
        st.rate = potential; st.output = potential;
        out.gold += potential;
        continue;
      }
      if (!b.out) { bad('blocked', 'BLOCKED: DRAG IT ONTO A ' + AS.BLD[R.proc].name + ' OR A PORT'); continue; }
      let q = null, qp = null, pw = null, dir = null;
      if (b.out.b !== undefined) { q = S.bldById(p, b.out.b); qp = p; }
      else {
        pw = S.pathwayById(sys, b.out.p);
        if (!pw) { bad('blocked', 'BLOCKED: DRAG IT ONTO A ' + AS.BLD[R.proc].name); continue; }
        const oi = S.otherPlanet(pw, pi);
        dir = pw.a === pi ? 'ab' : 'ba';
        if (!P[pw.id].ok) { bad('idle', 'IDLE: SOLAR STORM ON THE PATHWAY'); continue; }
        const link = sys.planets[oi].portIn[pw.id];
        if (!link) { bad('blocked', 'BLOCKED: ON ' + sys.planets[oi].name + ' DRAG THE PORT ONTO A ' + AS.BLD[R.proc].name); continue; }
        qp = sys.planets[oi]; q = S.bldById(qp, link.b);
      }
      if (!q || AS.BLD[q.kind].res !== res || AS.BLD[q.kind].role !== 'proc') { bad('blocked', 'BLOCKED: DRAG IT ONTO A ' + AS.BLD[R.proc].name); continue; }
      if (!B[q.id].staffed) { bad('idle', 'IDLE: THE ' + AS.BLD[q.kind].name + ' HAS NO WORKERS'); continue; }
      let flow = Math.min(potential, capLeft[q.id]);
      let limit = flow < potential - 1e-9 ? 'PROCESSOR FULL (UPGRADE IT)' : '';
      if (pw) {
        const k = pw.id + dir, left = pathLeft[k] === undefined ? pathCap : pathLeft[k];
        if (left < flow) { flow = left; limit = 'PATHWAY FULL'; }
        pathLeft[k] = left - flow;
        P[pw.id][dir] += flow;
        P[pw.id].res[dir] = res;
        const po = ports[portKey(pi, pw.id)], pin = ports[portKey(S.otherPlanet(pw, pi), pw.id)];
        po.out += flow; po.outRes = res; pin.in += flow; pin.inRes = res;
      }
      capLeft[q.id] -= flow;
      st.rate = flow;
      B[q.id].input += flow;
      if (flow <= 1e-9) bad('idle', 'IDLE: ' + (limit || 'PROCESSOR FULL (UPGRADE IT)'));
      else if (limit) st.reason = 'WORKING: ' + limit;
      st.dest = q.id; st.destPlanet = sys.planets.indexOf(qp); st.via = pw ? pw.id : null;
    }
    // processors and farms
    let farmWater = 0, farmFood = 0;
    const frac = f ? f.farmFrac : 1;
    sys.planets.forEach(p => {
      for (const b of p.blds) {
        const st = B[b.id], R = AS.BLD[b.kind];
        if (st.role === 'proc') {
          if (!st.staffed) { st.status = 'nocrew'; st.reason = NOCREW; continue; }
          if (st.input <= 1e-9) { st.status = 'idle'; st.reason = 'IDLE: NOTHING ARRIVES. DRAG AN ' + AS.BLD[AS.RES[st.res].ext].name + ' ONTO IT'; continue; }
          const v = st.input * R.yield * S.procBonus(p, b.kind);
          st.output = v; st.rate = st.input;
          out[AS.RES[st.res].out] += v;
        } else if (st.role === 'farm') {
          if (!st.staffed) { st.status = 'nocrew'; st.reason = NOCREW; continue; }
          const w = R.water * S.lvlMult(b), fd = R.food * S.lvlMult(b) * S.procBonus(p, b.kind);
          st.water = w; st.potential = fd; st.output = fd * frac; st.rate = w * frac;
          farmWater += w; farmFood += fd;
          if (frac <= 1e-6) { st.status = 'idle'; st.reason = 'IDLE: NO WATER. BUILD AN ICE DRILL AND A WATER PLANT, OR BUY WATER'; }
          else if (frac < 0.999) st.reason = 'WORKING AT ' + Math.round(frac * 100) + '%: SHORT OF WATER';
        }
      }
    });
    out.food = farmFood * frac;
    return { B, P, ports, out, storm, farmWater, farmFood, crewNeed: all.length * E.crew };
  };

  /* ---------- military power ---------- */
  S.rawPower = u => (u ? (u.ship || 0) * AS.UNITS.ship.power + (u.destroyer || 0) * AS.UNITS.destroyer.power + (u.cannon || 0) * AS.UNITS.cannon.power : 0);
  S.unitCount = u => (u ? (u.ship || 0) + (u.destroyer || 0) + (u.cannon || 0) : 0);
  S.fuelEff = (run, owner) => (owner >= 0 ? run.factions[owner].fuelEff : 1);
  /** Power of a system's garrison (independents need no fuel). */
  S.sysPower = (run, s) => S.rawPower(s.gar) * S.fuelEff(run, s.owner);
  S.armyPower = (run, a) => S.rawPower(a.units) * S.fuelEff(run, a.owner);
  /** Everything a faction has: garrisons plus armies on the move. */
  S.militaryUnits = function (run, fid) {
    const u = { ship: 0, destroyer: 0, cannon: 0 };
    const add = g => { for (const k of AS.UNIT_KEYS) u[k] += g[k] || 0; };
    for (const s of run.systems) if (s.owner === fid) add(s.gar);
    for (const a of run.armies) if (a.owner === fid) add(a.units);
    return u;
  };
  S.militaryPower = (run, fid) => S.rawPower(S.militaryUnits(run, fid)) * S.fuelEff(run, fid);
  S.fuelNeed = function (run, fid) { const u = S.militaryUnits(run, fid); let n = 0; for (const k of AS.UNIT_KEYS) n += u[k] * AS.UNITS[k].fuel; return n; };
  /** The survivors of a stack that has `power` raw power left: keep the biggest units first.
   *  (Greedy from the biggest unit down is optimal for unit sizes 10, 5 and 1.) */
  S.survivors = function (u, power) {
    let left = Math.floor(Math.max(0, power) + 1e-6);
    const out = { ship: 0, destroyer: 0, cannon: 0 };
    for (const k of ['cannon', 'destroyer', 'ship']) { const n = Math.min(u[k] || 0, Math.floor(left / AS.UNITS[k].power)); out[k] = n; left -= n * AS.UNITS[k].power; }
    return out;
  };
  /** Use newly arrived fuel to bring a fleet that ran short back to full power. */
  S.refuel = function (f) {
    if (f.fuelEff >= 1 || !(f.fuelNeed > 0)) return;
    const missing = f.fuelNeed * (1 - f.fuelEff), take = Math.min(f.fuel, missing);
    f.fuel -= take; f.stats.fuelUsed += take;
    f.fuelEff = Math.min(1, f.fuelEff + take / f.fuelNeed);
  };

  /** Next cycle for every stock: what comes in, what goes out, and when anything runs dry. */
  S.forecast = function (run, f) {
    const inc = { money: 0, gold: 0, water: 0, food: 0, fuel: 0 };
    let sys = 0, farmW = 0, farmF = 0;
    for (const s of run.systems) {
      if (s.owner !== f.id) continue;
      sys++;
      const fl = S.sysFlow(run, s);
      inc.gold += fl.out.gold; inc.water += fl.out.water; inc.fuel += fl.out.fuel;
      farmW += fl.farmWater; farmF += fl.farmFood;
    }
    inc.money = E.levy * sys;
    const frac = farmW > 0 ? Math.min(1, (f.water + inc.water) / farmW) : 1;
    inc.food = farmF * frac;
    const workers = S.workers(run, f.id), fuelNeed = S.fuelNeed(run, f.id);
    const outc = { money: 0, gold: 0, water: farmW * frac, food: workers * E.eat, fuel: fuelNeed };
    const res = {}, warn = [];
    for (const k of AS.STOCK_KEYS) {
      const net = inc[k] - outc[k];
      res[k] = { in: Math.round(inc[k] * 10) / 10, out: Math.round(outc[k] * 10) / 10, net: Math.round(net * 10) / 10 };
      if (net < -1e-6 && (k === 'food' || k === 'fuel' || k === 'water')) {
        const cyc = Math.floor(Math.max(0, f[k]) / -net);
        if (cyc <= 3) warn.push({ res: k, cycles: cyc });
      }
    }
    if (farmW > 0 && frac < 1 && !warn.some(w => w.res === 'water')) warn.push({ res: 'water', cycles: 0 });
    res.warn = warn;
    res.workers = workers; res.farmFrac = frac; res.fuelNeed = Math.round(fuelNeed * 100) / 100; res.farmWater = farmW; res.farmFood = farmF;
    res.net = res.money.net;
    return res;
  };

  /* ---------- the cycle ---------- */
  S.cycle = function (run) {
    run.cycleN++;
    for (const f of run.factions) {
      if (!f.alive) continue;
      const got = { money: 0, gold: 0, water: 0, food: 0, fuel: 0 };
      let sys = 0, farmW = 0, farmF = 0;
      const own = [];
      for (const s of run.systems) {
        if (s.owner !== f.id) continue;
        sys++; own.push(s);
        const fl = S.sysFlow(run, s);
        s.flow = { t: run.t, out: fl.out };
        // deplete the deposits by what was actually extracted
        s.planets.forEach(p => { for (const b of p.blds) { const st = fl.B[b.id]; if (st.role === 'ext' && st.rate > 0) { const d = p.deposits[b.drill.dep]; d.amount = Math.max(0, d.amount - st.rate); } } });
        got.gold += fl.out.gold; got.water += fl.out.water; got.fuel += fl.out.fuel;
        farmW += fl.farmWater; farmF += fl.farmFood;
        if (fl.out.gold + fl.out.water + fl.out.fuel + fl.out.food > 0.5) run.fx.push({ type: 'yield', sys: s.id, owner: f.id, out: fl.out });
      }
      got.money = E.levy * sys;
      f.money += got.money; f.gold += got.gold; f.water += got.water; f.fuel += got.fuel;
      // farms drink water and grow food
      const frac = farmW > 0 ? Math.min(1, f.water / farmW) : 1;
      f.water = Math.max(0, f.water - farmW * frac);
      got.food = farmF * frac;
      f.food += got.food;
      if (farmW > 0 && frac < 1 && f.farmFrac >= 1) run.fx.push({ type: 'nowater', owner: f.id });
      f.farmFrac = frac;
      // workers eat; unfed workers die, fed ones come back
      const workers = own.reduce((a, s) => a + s.workers, 0), eat = workers * E.eat;
      let fed = 1;
      if (f.food >= eat) f.food -= eat;
      else { fed = eat > 0 ? f.food / eat : 1; f.food = 0; }
      if (fed < 1) {
        let lost = 0;
        for (const s of own) { const k = Math.min(s.workers, Math.ceil(s.workers * (1 - fed) * E.starve)); s.workers -= k; lost += k; }
        f.hungry++; f.stats.starved += lost;
        if (lost) { run.fx.push({ type: 'starve', owner: f.id, n: lost }); S.logMoment(run, f.short + ': ' + lost + ' WORKERS STARVED', f.id === 0 ? 'bad' : 'info', f.id); }
      } else {
        f.hungry = 0;
        for (const s of own) s.workers = Math.min(S.crewNeed(s), s.workers + E.regrow);
      }
      // the military burns fuel and fights at the share of it that it gets
      const need = S.fuelNeed(run, f.id), effBefore = f.fuelEff;
      if (need <= 1e-9) f.fuelEff = 1;
      else if (f.fuel >= need) { f.fuel -= need; f.fuelEff = 1; f.stats.fuelUsed += need; }
      else { f.fuelEff = f.fuel / need; f.stats.fuelUsed += f.fuel; f.fuel = 0; }
      f.fuelNeed = need;
      if (f.fuelEff < 1 && effBefore >= 1) run.fx.push({ type: 'lowfuel', owner: f.id, eff: f.fuelEff });
      f.stats.income += got.money; f.stats.goldMade += got.gold; f.stats.waterMade += got.water; f.stats.foodMade += got.food; f.stats.fuelMade += got.fuel;
      f.stats.foodUsed += eat * fed + 0; f.stats.waterUsed += farmW * frac;
      f.lastCycle = { income: Math.round(got.money), got, eat, fed, fuelNeed: need, farmFrac: frac };
    }
  };

  /* ---------- market: fixed prices, buy and sell at the same price ---------- */
  S.price = function (run, res) {
    let p = AS.STOCK[res] ? AS.STOCK[res].price : 0;
    if (res === 'gold') for (const e of run.events.active) if (e.type === 'boom') p *= AS.EVENTS.boom.value;
    return p;
  };
  /** qty > 0 buys, qty < 0 sells (whole units). */
  S.trade = function (run, fid, res, qty) {
    const f = run.factions[fid];
    if (AS.MARKET_KEYS.indexOf(res) < 0 || !Number.isFinite(qty)) return { ok: false, reason: 'invalid' };
    qty = Math.trunc(qty);
    if (!qty) return { ok: false, reason: 'invalid' };
    const price = S.price(run, res);
    if (qty > 0) {
      const c = Math.ceil(qty * price);
      if (!pay(f, c)) return short(c);
      f[res] += qty;
      if (res === 'fuel') S.refuel(f);
      run.fx.push({ type: 'trade', owner: fid, res, qty });
      return { ok: true, qty, money: -c };
    }
    const n = Math.min(-qty, Math.floor(f[res] + 1e-9));
    if (n <= 0) return { ok: false, reason: 'nothing' };
    const v = n * price;
    f[res] -= n; f.money += v; f.stats.sold += v;
    run.fx.push({ type: 'trade', owner: fid, res, qty: -n });
    return { ok: true, qty: -n, money: v };
  };

  /* ---------- building actions (validated; return {ok, reason}) ---------- */
  function ownSys(run, fid, sysId) { const s = run.systems[sysId]; return s && s.owner === fid ? s : null; }
  function ownPlanet(run, fid, sysId, pi) { const s = ownSys(run, fid, sysId); return s && s.planets[pi] ? [s, s.planets[pi]] : [null, null]; }

  S.placeBuilding = function (run, fid, sysId, pi, slot, kind) {
    const f = run.factions[fid], [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p) return { ok: false, reason: 'notyours' };
    if (!AS.BLD[kind]) return { ok: false, reason: 'invalid' };
    if (!(slot >= 0 && slot < S.slotCount(p, f)) || slot !== Math.floor(slot)) return { ok: false, reason: 'slot' };
    if (S.bldAt(p, slot)) return { ok: false, reason: 'slotused' };
    const c = S.bldCost(kind);
    if (!pay(f, c)) return short(c);
    const b = { id: run.nextId++, slot, kind, lvl: 1, drill: null, out: null };
    p.blds.push(b);
    s.workers += E.crew;   // the crew arrives with the building
    run.fx.push({ type: 'build', sys: sysId, owner: fid, planet: pi, bld: b.id, kind });
    return { ok: true, bld: b, cost: c };
  };
  S.drill = function (run, fid, sysId, pi, bldId, path) {
    const f = run.factions[fid], [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p) return { ok: false, reason: 'notyours' };
    const b = S.bldById(p, bldId);
    if (!b) return { ok: false, reason: 'invalid' };
    if (b.drill) return { ok: false, reason: 'drilled' };
    const chk = S.checkDrill(f, p, b, path);
    if (!chk.ok) return chk;
    const c = chk.cost;
    if (!pay(f, c)) return short(c);
    b.drill = { path: path.slice(), dep: chk.dep.id, price: chk.cost };
    run.fx.push({ type: 'drill', sys: sysId, owner: fid, planet: pi, bld: b.id });
    void s;
    return { ok: true, cost: c, dep: chk.dep };
  };
  /** Conveyor. from: {b} extractor or {p} port; to: {b} processor or {p} port. */
  S.connect = function (run, fid, sysId, pi, from, to) {
    const f = run.factions[fid], [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p || !from || !to) return { ok: false, reason: 'notyours' };
    const c = AS.COSTS.conveyor;
    if (from.b !== undefined) {
      const b = S.bldById(p, from.b);
      if (!b || AS.BLD[b.kind].role !== 'ext') return { ok: false, reason: 'fromext' };
      if (!AS.RES[AS.BLD[b.kind].res].proc) return { ok: false, reason: 'direct' };
      if (b.out) return { ok: false, reason: 'connected' };
      if (to.b !== undefined) {
        const q = S.bldById(p, to.b);
        if (!q || AS.BLD[q.kind].role !== 'proc') return { ok: false, reason: 'toproc' };
        if (AS.BLD[q.kind].res !== AS.BLD[b.kind].res) return { ok: false, reason: 'wrongres' };
        if (!pay(f, c)) return short(c);
        b.out = { b: q.id };
      } else if (to.p !== undefined) {
        const pw = S.pathwayById(s, to.p);
        if (!pw || (pw.a !== pi && pw.b !== pi)) return { ok: false, reason: 'noport' };
        if (!pay(f, c)) return short(c);
        b.out = { p: pw.id };
      } else return { ok: false, reason: 'invalid' };
      run.fx.push({ type: 'conveyor', sys: sysId, owner: fid, planet: pi, bld: b.id });
      return { ok: true, cost: c };
    }
    if (from.p !== undefined && to.b !== undefined) {
      const pw = S.pathwayById(s, from.p);
      if (!pw || (pw.a !== pi && pw.b !== pi)) return { ok: false, reason: 'noport' };
      const q = S.bldById(p, to.b);
      if (!q || AS.BLD[q.kind].role !== 'proc') return { ok: false, reason: 'toproc' };
      if (p.portIn[pw.id]) return { ok: false, reason: 'connected' };
      if (!pay(f, c)) return short(c);
      p.portIn[pw.id] = { b: q.id };
      run.fx.push({ type: 'conveyor', sys: sysId, owner: fid, planet: pi, port: pw.id });
      return { ok: true, cost: c };
    }
    return { ok: false, reason: 'invalid' };
  };
  /** Remove the conveyor leaving an extractor, or the one leaving a port. */
  S.disconnect = function (run, fid, sysId, pi, from) {
    const [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p || !from) return { ok: false, reason: 'notyours' };
    if (from.b !== undefined) { const b = S.bldById(p, from.b); if (!b || !b.out) return { ok: false, reason: 'invalid' }; b.out = null; return { ok: true }; }
    if (from.p !== undefined) { if (!p.portIn[from.p]) return { ok: false, reason: 'invalid' }; delete p.portIn[from.p]; return { ok: true }; }
    void s;
    return { ok: false, reason: 'invalid' };
  };
  S.demolish = function (run, fid, sysId, pi, bldId) {
    const f = run.factions[fid], [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p) return { ok: false, reason: 'notyours' };
    const b = S.bldById(p, bldId);
    if (!b) return { ok: false, reason: 'invalid' };
    p.blds = p.blds.filter(x => x !== b);
    for (const x of p.blds) if (x.out && x.out.b === b.id) x.out = null;
    for (const k in p.portIn) if (p.portIn[k].b === b.id) delete p.portIn[k];
    s.workers = Math.min(s.workers, S.crewNeed(s));   // its crew leaves with it
    const back = Math.round(AS.BLD[b.kind].cost * 0.4);
    f.money += back;
    run.fx.push({ type: 'demolish', sys: sysId, owner: fid, planet: pi });
    return { ok: true, refund: back };
  };
  /** Machinery upgrade: level 2 and 3, +50% throughput each. */
  S.upgradeBuilding = function (run, fid, sysId, pi, bldId) {
    const f = run.factions[fid], [s, p] = ownPlanet(run, fid, sysId, pi);
    if (!p) return { ok: false, reason: 'notyours' };
    const b = S.bldById(p, bldId);
    if (!b) return { ok: false, reason: 'invalid' };
    if ((b.lvl || 1) >= C.upgrade.max) return { ok: false, reason: 'maxed' };
    const c = AS.upgPrice(b.kind, b.lvl || 1);
    if (!pay(f, c)) return short(c);
    b.lvl = (b.lvl || 1) + 1;
    f.stats.upgrades++;
    run.fx.push({ type: 'upgrade', sys: sysId, owner: fid, planet: pi, bld: b.id, lvl: b.lvl });
    void s;
    return { ok: true, cost: c, lvl: b.lvl };
  };
  S.openPathway = function (run, fid, sysId, a, b) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (a === b || !s.planets[a] || !s.planets[b]) return { ok: false, reason: 'invalid' };
    if (s.pathways.some(pw => (pw.a === a && pw.b === b) || (pw.a === b && pw.b === a))) return { ok: false, reason: 'linked' };
    if (s.pathways.length >= S.pathwaySlots(run, s)) return { ok: false, reason: 'pathways' };
    const c = AS.COSTS.pathway;
    if (!pay(f, c)) return short(c);
    const pw = { id: run.nextId++, a, b };
    s.pathways.push(pw);
    run.fx.push({ type: 'pathway', sys: sysId, owner: fid, pw: pw.id });
    return { ok: true, pathway: pw, cost: c };
  };
  S.closePathway = function (run, fid, sysId, pwId) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    const pw = s && S.pathwayById(s, pwId);
    if (!pw) return { ok: false, reason: 'invalid' };
    s.pathways = s.pathways.filter(x => x !== pw);
    for (const p of s.planets) {
      for (const b of p.blds) if (b.out && b.out.p === pw.id) b.out = null;
      delete p.portIn[pw.id];
    }
    f.money += Math.round(AS.COSTS.pathway * 0.5);
    return { ok: true };
  };

  /* ---------- the military shop ---------- */
  S.unitCost = function (run, kind) {
    let c = AS.UNITS[kind].cost;
    for (const e of run.events.active) if (e.type === 'mercs') c *= AS.EVENTS.mercs.price;
    return Math.round(c);
  };
  S.buyUnits = function (run, fid, sysId, kind, n) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (!AS.UNITS[kind]) return { ok: false, reason: 'invalid' };
    n = Math.trunc(U.fin(n, 1));
    if (!(n >= 1 && n <= 50)) return { ok: false, reason: 'invalid' };
    const c = S.unitCost(run, kind) * n;
    if (!pay(f, c)) return short(c);
    s.gar[kind] += n;
    f.stats.military += c;
    run.fx.push({ type: 'unit', sys: sysId, owner: fid, kind, n });
    return { ok: true, n, cost: c };
  };
  S.buyPrice = function (run, f, sys) { return Math.round(C.buy.base * Math.pow(C.buy.growth, S.ownCount(run, f.id)) + C.buy.perPower * S.rawPower(sys.gar)); };
  S.buySystem = function (run, fid, sysId) {
    const f = run.factions[fid], s = run.systems[sysId];
    if (!s || s.owner !== -1) return { ok: false, reason: 'notneutral' };
    if (!S.neighbours(run, sysId).some(n => run.systems[n].owner === fid)) return { ok: false, reason: 'notadjacent' };
    if (run.coalition && run.coalition.target === fid && run.t < run.coalition.until) return { ok: false, reason: 'sanction' };
    const c = S.buyPrice(run, f, s);
    if (!pay(f, c)) return short(c);
    s.owner = fid; s.gar = { ship: 0, destroyer: 0, cannon: 0 }; s.lastCaptured = run.t;
    f.stats.bought++;
    run.fx.push({ type: 'bought', sys: sysId, owner: fid });
    S.logMoment(run, f.short + ' BOUGHT ' + s.name, fid === 0 ? 'good' : 'info', fid);
    return { ok: true, cost: c };
  };
})(globalThis.AS = globalThis.AS || {});
