/* ATLAS SYNDICATE v6 — sim/economy.js
   The hands-on economy. On each planet: extractors drill down to deposits; conveyors carry raw resource
   to a processor on the same planet, or to a port; pathways between planets carry it to the matching
   port on the other planet, where a conveyor feeds a processor there. Processed output (alloy, fuel,
   food, credits) goes into the empire stockpile. Everything wears out and needs credits + alloy to fix.
   S.sysFlow() is the one place that decides what flows where, and why not: the renderer, the AI, the
   forecast and the cycle all read it, so what the screen shows is exactly what the simulation does. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, E = C.econ;

  /* ---------- modifiers from the upgrade shop (+ the stated Hard bonus) ---------- */
  S.recomputeMods = function (run, f) {
    const u = f.up, m = {
      drill: 1, extract: 1, extWear: 1, slots: 0, procCap: 1, alloy: 1, mint: E.mint, food: 1, fuel: 1,
      path: 1, pathways: 0, beltWear: 1, armyFuel: 1, salary: 1, rations: 1, platPower: 1, shipPower: 1, vetBonus: C.army.vetBonus,
      defBonus: C.combat.defBonus, def: 1, attack: 1, income: 1, speed: 1, interior: 1, capital: 1, sight: 1, militia: 0, armour: 1, medics: 0, vetGain: 1,
    };
    if (u.ext >= 1) m.drill = 0.7;
    if (u.ext >= 2) m.extract *= 1.25;
    if (u.ext >= 3) m.extWear = 0.5;
    if (u.ext >= 4) m.extract *= 1.25;
    if (u.ext >= 5) m.slots = 1;
    if (u.proc >= 1) m.procCap = 1.3;
    if (u.proc >= 2) m.alloy = 1.25;
    if (u.proc >= 3) m.mint = 8;
    if (u.proc >= 4) m.food = 1.4;
    if (u.proc >= 5) m.fuel = 1.4;
    if (u.log >= 1) m.path = 1.5;
    if (u.log >= 2) m.pathways += 1;
    if (u.log >= 3) m.beltWear = 0.5;
    if (u.log >= 4) m.pathways += 1;
    if (u.log >= 5) m.armyFuel = 0.6;
    if (u.mil >= 1) m.salary = 0.8;
    if (u.mil >= 2) m.rations = 0.6;
    if (u.mil >= 3) m.platPower = 1.5;
    if (u.mil >= 4) m.shipPower = 1.5;
    if (u.mil >= 5) m.vetBonus = 1.0;
    if (f.id !== 0) m.income = AS.DIFFICULTY[run.diff].income;   // Hard only: the stated rival bonus
    f.mods = m;
    return m;
  };
  S.baseMods = () => S.recomputeMods({ diff: 'normal' }, { id: 0, up: { ext: 0, proc: 0, log: 0, mil: 0 } });

  /* ---------- helpers ---------- */
  S.fac = (run, id) => run.factions[id];
  S.ownSystems = (run, fid) => run.systems.filter(s => s.owner === fid);
  S.ownCount = function (run, fid) { let n = 0; for (const s of run.systems) if (s.owner === fid) n++; return n; };
  S.canPay = (f, c) => f.credits >= (c[0] || 0) && f.alloy >= (c[1] || 0);
  function pay(f, c) { if (!S.canPay(f, c)) return false; f.credits -= c[0] || 0; f.alloy -= c[1] || 0; f.stats.spent += c[0] || 0; f.stats.alloyUsed = (f.stats.alloyUsed || 0) + (c[1] || 0); return true; }
  S.pay = pay;
  const short = c => ({ ok: false, reason: 'cost', cost: c });
  S.bldCost = (f, kind) => AS.BLD[kind].cost.slice();
  S.pathwaySlots = function (run, sys) { const f = sys.owner >= 0 ? run.factions[sys.owner] : null; return Math.min(E.maxPathways, E.basePathways + (f ? f.mods.pathways : 0)); };
  S.pathwayById = (sys, id) => sys.pathways.find(p => p.id === id) || null;
  S.portsOf = (sys, pi) => sys.pathways.filter(p => p.a === pi || p.b === pi);
  S.otherPlanet = (pw, pi) => (pw.a === pi ? pw.b : pw.a);
  S.stormed = function (run, sys) {
    for (const e of run.events.active) if (e.type === 'storm' && (e.region === 'core' ? sys.region === 'core' : sys.arm === e.arm)) return true;
    return false;
  };
  S.extRate = (f, dep) => (E.extractRate + E.depthRate * dep.depth) * (f ? f.mods.extract : 1);
  S.procBonus = (p, kind) => (AS.RES[AS.BLD[kind].res].planets.indexOf(p.kind) >= 0 ? E.bonus : 1);
  S.convert = function (run, f, res, units) {
    const m = f ? f.mods : null;
    switch (res) {
      case 'metal': return units * (m ? m.alloy : 1);
      case 'gold': { let v = units * (m ? m.mint : E.mint); for (const e of run.events.active) if (e.type === 'boom') v *= AS.EVENTS.boom.value; return v; }
      case 'ice': return units * (m ? m.food : 1);
      case 'fuel': return units * (m ? m.fuel : 1);
    }
    return 0;
  };

  /* ---------- the flow solver ---------- */
  /** What every building, conveyor, port and pathway in a system does this cycle, and why. Pure. */
  S.sysFlow = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const popMult = 1 + Math.min(E.popMax, sys.pop) * E.popMult;
    const storm = S.stormed(run, sys);
    const out = { credits: 0, alloy: 0, fuel: 0, food: 0 }, B = {}, P = {}, ports = {};
    const capLeft = {}, pathLeft = {};
    const procCap = E.procCap * (f ? f.mods.procCap : 1), pathCap = E.pathCap * (f ? f.mods.path : 1);
    const portKey = (pi, pw) => pi + ':' + pw;
    for (const pw of sys.pathways) P[pw.id] = { ab: 0, ba: 0, ok: pw.dur > 0 && !storm, cap: pathCap, res: {} };
    sys.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const R = AS.BLD[b.kind];
        B[b.id] = { pi, rate: 0, potential: 0, input: 0, output: 0, status: 'ok', reason: 'WORKING', role: R.role, res: R.res, outRate: 0 };
        if (R.role === 'proc') capLeft[b.id] = b.dur > 0 ? procCap : 0;
      }
      for (const pw of S.portsOf(sys, pi)) ports[portKey(pi, pw.id)] = { out: 0, in: 0, outRes: null, inRes: null };
    });
    // extractors, in id order, claim processor capacity
    const exts = [];
    sys.planets.forEach((p, pi) => { for (const b of p.blds) if (AS.BLD[b.kind].role === 'ext') exts.push([p, pi, b]); });
    exts.sort((a, b) => a[2].id - b[2].id);
    for (const [p, pi, b] of exts) {
      const st = B[b.id], res = st.res;
      const bad = (s, r) => { st.status = s; st.reason = r; };
      if (b.dur <= 0) { bad('broken', 'BROKEN: REPAIR'); continue; }
      if (!b.drill) { bad('idle', 'IDLE: NO DRILL TO A DEPOSIT'); continue; }
      if (b.drill.dur <= 0) { bad('broken', 'BROKEN DRILL: REPAIR'); continue; }
      const dep = p.deposits[b.drill.dep];
      if (!dep || dep.amount <= 0) { bad('empty', 'DEPOSIT EMPTY'); continue; }
      const potential = Math.min(dep.amount, S.extRate(f, dep) * popMult);
      st.potential = potential;
      if (!b.out) { bad('blocked', 'BLOCKED: NO PROCESSOR CONNECTED'); continue; }
      if (b.out.dur <= 0) { bad('broken', 'BROKEN CONVEYOR: REPAIR'); continue; }
      let q = null, qp = null, pw = null, dir = null;
      if (b.out.b !== undefined) { q = S.bldById(p, b.out.b); qp = p; }
      else {
        pw = S.pathwayById(sys, b.out.p);
        if (!pw) { bad('blocked', 'BLOCKED: NO PROCESSOR CONNECTED'); continue; }
        const oi = S.otherPlanet(pw, pi);
        dir = pw.a === pi ? 'ab' : 'ba';
        if (!P[pw.id].ok) { bad('idle', storm ? 'IDLE: SOLAR STORM ON THE PATHWAY' : 'IDLE: PATHWAY BROKEN'); continue; }
        const link = sys.planets[oi].portIn[pw.id];
        if (!link) { bad('blocked', 'BLOCKED: NO PROCESSOR CONNECTED AT ' + sys.planets[oi].name); continue; }
        if (link.dur <= 0) { bad('broken', 'BROKEN CONVEYOR AT ' + sys.planets[oi].name); continue; }
        qp = sys.planets[oi]; q = S.bldById(qp, link.b);
      }
      if (!q || AS.BLD[q.kind].res !== res || AS.BLD[q.kind].role !== 'proc') { bad('blocked', 'BLOCKED: NO PROCESSOR CONNECTED'); continue; }
      if (q.dur <= 0) { bad('idle', 'IDLE: ' + AS.BLD[q.kind].name + ' IS BROKEN'); continue; }
      let flow = Math.min(potential, capLeft[q.id]);
      let limit = flow < potential - 1e-9 ? 'PROCESSOR FULL' : '';
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
      st.rate = flow; st.outRate = flow;
      B[q.id].input += flow;
      if (flow <= 1e-9) bad('idle', 'IDLE: ' + (limit || 'PROCESSOR FULL'));
      else if (limit) st.reason = 'WORKING: ' + limit;
      st.dest = q.id; st.destPlanet = sys.planets.indexOf(qp); st.via = pw ? pw.id : null; st.dep = dep.id;
    }
    // processors
    sys.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const st = B[b.id];
        if (st.role !== 'proc') continue;
        if (b.dur <= 0) { st.status = 'broken'; st.reason = 'BROKEN: REPAIR'; continue; }
        if (st.input <= 1e-9) { st.status = 'idle'; st.reason = 'IDLE: NO INPUT'; continue; }
        const v = S.convert(run, f, st.res, st.input) * S.procBonus(p, b.kind);
        st.output = v; st.rate = st.input;
        out[AS.RES[st.res].out] += v;
      }
    });
    return { B, P, ports, out, popMult, storm };
  };

  /* ---------- durability ---------- */
  /** Everything in a system that can be repaired, with its repair price [credits, alloy]. */
  S.repairList = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null, out = [];
    const frac = d => (100 - U.clamp(d, 0, 100)) / 100 * C.dur.repairFrac;
    const cost = (base, d) => [Math.ceil(base[0] * frac(d)), Math.ceil(base[1] * frac(d))];
    sys.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const base = AS.BLD[b.kind].cost;
        if (b.dur < 100) out.push({ kind: 'bld', pi, id: b.id, dur: b.dur, cost: cost(base, b.dur) });
        if (b.drill && b.drill.dur < 100) out.push({ kind: 'drill', pi, id: b.id, dur: b.drill.dur, cost: cost([Math.max(10, b.drill.price), 4], b.drill.dur) });
        if (b.out && b.out.dur < 100) out.push({ kind: 'conv', pi, id: b.id, dur: b.out.dur, cost: cost([AS.COSTS.conveyor[0], 2], b.out.dur) });
      }
      for (const k in p.portIn) { const l = p.portIn[k]; if (l.dur < 100) out.push({ kind: 'portconv', pi, id: +k, dur: l.dur, cost: cost([AS.COSTS.conveyor[0], 2], l.dur) }); }
    });
    for (const pw of sys.pathways) if (pw.dur < 100) out.push({ kind: 'pathway', pi: -1, id: pw.id, dur: pw.dur, cost: cost(AS.COSTS.pathway, pw.dur) });
    if (sys.plat.n && sys.plat.dur < 100) out.push({ kind: 'plat', pi: -1, id: -1, dur: sys.plat.dur, cost: cost([C.equip.platCost[0] * sys.plat.n, C.equip.platCost[1] * sys.plat.n], sys.plat.dur) });
    if (sys.gar.ships && sys.gar.sdur < 100) out.push({ kind: 'ships', pi: -1, id: -1, dur: sys.gar.sdur, cost: cost([C.equip.shipCost[0] * sys.gar.ships, C.equip.shipCost[1] * sys.gar.ships], sys.gar.sdur) });
    void f;
    return out;
  };
  S.setRepaired = function (sys, r) {
    const p = r.pi >= 0 ? sys.planets[r.pi] : null;
    const b = p ? S.bldById(p, r.id) : null;
    switch (r.kind) {
      case 'bld': if (b) b.dur = 100; break;
      case 'drill': if (b && b.drill) b.drill.dur = 100; break;
      case 'conv': if (b && b.out) b.out.dur = 100; break;
      case 'portconv': if (p && p.portIn[r.id]) p.portIn[r.id].dur = 100; break;
      case 'pathway': { const pw = S.pathwayById(sys, r.id); if (pw) pw.dur = 100; break; }
      case 'plat': sys.plat.dur = 100; break;
      case 'ships': sys.gar.sdur = 100; break;
    }
  };
  /** Battle or raid damage to everything built in a system. */
  S.damageBuildings = function (run, sys, amount, raid) {
    if (amount <= 0) return;
    const r = () => 0.6 + run.rng() * 0.8;
    for (const p of sys.planets) {
      for (const b of p.blds) {
        b.dur = Math.max(0, b.dur - amount * r());
        if (b.drill) b.drill.dur = Math.max(0, b.drill.dur - amount * 0.5 * r());
        if (b.out) b.out.dur = Math.max(0, b.out.dur - amount * (raid ? 1.4 : 0.8) * r());
      }
      for (const k in p.portIn) p.portIn[k].dur = Math.max(0, p.portIn[k].dur - amount * 0.8 * r());
    }
    for (const pw of sys.pathways) pw.dur = Math.max(0, pw.dur - amount * (raid ? 1.5 : 0.8) * r());
  };
  S.wreckForCapture = function (sys) {
    for (const p of sys.planets) {
      for (const b of p.blds) { b.dur = 0; if (b.drill) b.drill.dur = Math.min(b.drill.dur, 40); if (b.out) b.out.dur = 0; }
      for (const k in p.portIn) p.portIn[k].dur = 0;
    }
    for (const pw of sys.pathways) pw.dur = 0;
  };

  /* ---------- soldiers & salaries ---------- */
  S.soldiers = function (run, fid) {
    let n = 0;
    for (const s of run.systems) if (s.owner === fid) n += s.gar.n;
    for (const a of run.armies) if (a.owner === fid) n += a.n;
    for (const b of run.battles) if (b.att.owner === fid) n += b.att.n;
    return n;
  };
  S.ships = function (run, fid) {
    let n = 0;
    for (const s of run.systems) if (s.owner === fid) n += s.gar.ships;
    for (const a of run.armies) if (a.owner === fid) n += a.ships;
    for (const b of run.battles) if (b.att.owner === fid) n += b.att.ships;
    return n;
  };
  S.eventMod = function (run, key) {
    for (const e of run.events.active) if (e.type === 'mercs') return key === 'salary' ? AS.EVENTS.mercs.salary : AS.EVENTS.mercs.train;
    return 1;
  };
  S.salaryFor = function (run, f, n) { return n * C.army.salary * f.mods.salary * S.eventMod(run, 'salary') * (1 + n / C.army.salaryScale); };
  S.salary = function (run, f) { return S.salaryFor(run, f, S.soldiers(run, f.id)); };
  S.rations = (run, f, n) => n * C.army.rations * f.mods.rations;
  S.armyFuel = function (run, f, strength, lanes) { return Math.ceil((C.army.laneFuel + Math.floor(strength / 10) * C.army.fuelPer10) * lanes * f.mods.armyFuel); };

  /** Next cycle for every stock: what comes in, what goes out, and when anything runs dry. */
  S.forecast = function (run, f) {
    const inc = { credits: 0, alloy: 0, fuel: 0, food: 0 };
    let pop = 0, sys = 0, repairs = [0, 0];
    for (const s of run.systems) {
      if (s.owner !== f.id) continue;
      sys++;
      const fl = S.sysFlow(run, s);
      for (const k in inc) inc[k] += fl.out[k];
      pop += s.pop;
      if (f.autoRepair) for (const r of S.repairList(run, s)) if (r.dur < C.dur.autoRepairAt) { repairs[0] += r.cost[0]; repairs[1] += r.cost[1]; }
    }
    inc.credits = (inc.credits + C.econ.levy * sys) * f.mods.income;
    const n = S.soldiers(run, f.id);
    const outc = { credits: S.salaryFor(run, f, n) + repairs[0], alloy: repairs[1], fuel: S.ships(run, f.id) * C.equip.shipFuel, food: S.rations(run, f, n) + pop * E.popFood };
    const res = {}, warn = [];
    for (const k of AS.STOCK_KEYS) {
      const net = inc[k] - outc[k];
      res[k] = { in: Math.round(inc[k] * 10) / 10, out: Math.round(outc[k] * 10) / 10, net: Math.round(net * 10) / 10 };
      const have = f[k];
      if (net < 0) { const cyc = Math.floor(Math.max(0, have) / -net); if (cyc <= 3) warn.push({ res: k, cycles: cyc }); }
    }
    res.warn = warn;
    res.salary = Math.round(S.salaryFor(run, f, n));
    res.net = res.credits.net;
    return res;
  };

  /* ---------- the cycle ---------- */
  S.cycle = function (run) {
    run.cycleN++;
    for (const f of run.factions) {
      if (!f.alive) continue;
      const got = { credits: 0, alloy: 0, fuel: 0, food: 0 };
      let pop = 0, sys = 0;
      for (const s of run.systems) {
        if (s.owner !== f.id) continue;
        sys++;
        const fl = S.sysFlow(run, s);
        s.flow = { t: run.t, out: fl.out };
        // deplete the deposits by what was actually extracted
        s.planets.forEach(p => { for (const b of p.blds) { const st = fl.B[b.id]; if (st.role === 'ext' && st.rate > 0) { const d = p.deposits[b.drill.dep]; d.amount = Math.max(0, d.amount - st.rate); } } });
        for (const k in got) got[k] += fl.out[k];
        if (fl.out.credits + fl.out.alloy + fl.out.fuel + fl.out.food > 0.5) run.fx.push({ type: 'yield', sys: s.id, owner: f.id, out: fl.out });
        // population grows while the empire has food
        if (f.food > 0 && s.pop < E.popMax) s.pop++;
        else if (f.food <= 0 && s.pop > 0) s.pop--;
        pop += s.pop;
      }
      const n = S.soldiers(run, f.id);
      got.credits = (got.credits + E.levy * sys) * f.mods.income;
      const salary = S.salaryFor(run, f, n), rations = S.rations(run, f, n) + pop * E.popFood, shipFuel = S.ships(run, f.id) * C.equip.shipFuel;
      f.credits += got.credits - salary;
      f.alloy += got.alloy;
      f.fuel += got.fuel - shipFuel;
      f.food += got.food - rations;
      f.stats.income += got.credits; f.stats.salary += salary; f.stats.alloyMade += got.alloy; f.stats.fuelMade += got.fuel; f.stats.foodMade += got.food;
      f.stats.fuelUsed += shipFuel; f.stats.foodUsed += rations;
      f.lastCycle = { income: Math.round(got.credits), salary: Math.round(salary), got };
      // food: hungry soldiers fight at 75%; three hungry cycles in a row and they start to desert
      if (f.food < 0) { f.food = 0; f.hungry++; if (f.hungry === 1) run.fx.push({ type: 'hungry', owner: f.id }); if (f.hungry >= 3) S.desert(run, f, 'HUNGER'); } else f.hungry = 0;
      // fuel: without it warships go dark and armies cannot move
      if (f.fuel < 0) { f.fuel = 0; if (!f.noFuel) run.fx.push({ type: 'nofuel', owner: f.id }); f.noFuel = true; } else f.noFuel = f.fuel < 1 && shipFuel > 0;
      // auto-repair (the player's default; the AI decides repairs itself)
      if (f.autoRepair) {
        const list = [];
        for (const s of run.systems) if (s.owner === f.id) for (const r of S.repairList(run, s)) if (r.dur < C.dur.autoRepairAt) list.push([s, r]);
        list.sort((a, b) => a[1].dur - b[1].dur);
        for (const [s, r] of list) { if (!S.canPay(f, r.cost)) continue; pay(f, r.cost); f.stats.repairs += r.cost[0]; S.setRepaired(s, r); }
      }
      // credits: one warning, then desertion every cycle the books stay negative
      if (f.credits < 0 && (got.credits < salary || f.broke === 0)) {
        f.broke++;
        if (f.broke === 1) run.fx.push({ type: 'bankrupt', owner: f.id });
        else S.desert(run, f, 'PAY');
      } else if (f.credits >= 0) f.broke = 0;
    }
    // wear
    for (const s of run.systems) {
      if (s.owner < 0) continue;
      const m = run.factions[s.owner].mods, d = C.dur.decay;
      for (const p of s.planets) {
        for (const b of p.blds) {
          const ext = AS.BLD[b.kind].role === 'ext';
          b.dur = Math.max(0, b.dur - d * (ext ? m.extWear : 1));
          if (b.drill) b.drill.dur = Math.max(0, b.drill.dur - d * 0.6 * m.extWear);
          if (b.out) b.out.dur = Math.max(0, b.out.dur - d * 0.8 * m.beltWear);
        }
        for (const k in p.portIn) p.portIn[k].dur = Math.max(0, p.portIn[k].dur - d * 0.8 * m.beltWear);
      }
      for (const pw of s.pathways) pw.dur = Math.max(0, pw.dur - d * 0.8 * m.beltWear);
      if (s.plat.n) s.plat.dur = Math.max(0, s.plat.dur - 0.5);
      if (s.gar.ships) s.gar.sdur = Math.max(0, s.gar.sdur - 0.5);
      if (s.gar.n) s.gar.vet = Math.min(1, s.gar.vet + C.army.vetPerCycle);
    }
    for (const a of run.armies) a.vet = Math.min(1, a.vet + C.army.vetPerCycle);
  };
  S.desert = function (run, f, why) {
    let lost = 0;
    for (const s of run.systems) if (s.owner === f.id && s.gar.n > 0) { const k = Math.max(1, Math.ceil(s.gar.n * C.army.desertFrac)); s.gar.n -= k; lost += k; }
    for (const a of run.armies) if (a.owner === f.id && a.n > 1) { const k = Math.ceil(a.n * C.army.desertFrac); a.n -= k; lost += k; }
    f.stats.deserted += lost;
    if (lost) run.fx.push({ type: 'desert', owner: f.id, n: lost, why });
    S.logMoment(run, f.short + ': ' + lost + ' SOLDIERS DESERTED (' + (why === 'HUNGER' ? 'NO FOOD' : 'NO PAY') + ')', f.id === 0 ? 'bad' : 'info', f.id);
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
    const c = S.bldCost(f, kind);
    if (!pay(f, c)) return short(c);
    const b = { id: run.nextId++, slot, kind, dur: 100, drill: null, out: null };
    p.blds.push(b);
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
    const c = [chk.cost, 0];
    if (!pay(f, c)) return short(c);
    b.drill = { path: path.slice(), dep: chk.dep.id, dur: 100, price: chk.cost };
    run.fx.push({ type: 'drill', sys: sysId, owner: fid, planet: pi, bld: b.id });
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
      if (b.out) return { ok: false, reason: 'connected' };
      if (to.b !== undefined) {
        const q = S.bldById(p, to.b);
        if (!q || AS.BLD[q.kind].role !== 'proc') return { ok: false, reason: 'toproc' };
        if (AS.BLD[q.kind].res !== AS.BLD[b.kind].res) return { ok: false, reason: 'wrongres' };
        if (!pay(f, c)) return short(c);
        b.out = { b: q.id, dur: 100 };
      } else if (to.p !== undefined) {
        const pw = S.pathwayById(s, to.p);
        if (!pw || (pw.a !== pi && pw.b !== pi)) return { ok: false, reason: 'noport' };
        if (!pay(f, c)) return short(c);
        b.out = { p: pw.id, dur: 100 };
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
      p.portIn[pw.id] = { b: q.id, dur: 100 };
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
    const back = Math.round(AS.BLD[b.kind].cost[0] * 0.4);
    f.credits += back;
    run.fx.push({ type: 'demolish', sys: sysId, owner: fid, planet: pi });
    void s;
    return { ok: true, refund: back };
  };
  S.openPathway = function (run, fid, sysId, a, b) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (a === b || !s.planets[a] || !s.planets[b]) return { ok: false, reason: 'invalid' };
    if (s.pathways.some(pw => (pw.a === a && pw.b === b) || (pw.a === b && pw.b === a))) return { ok: false, reason: 'linked' };
    if (s.pathways.length >= S.pathwaySlots(run, s)) return { ok: false, reason: 'pathways' };
    const c = AS.COSTS.pathway;
    if (!pay(f, c)) return short(c);
    const pw = { id: run.nextId++, a, b, dur: 100 };
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
    f.credits += Math.round(AS.COSTS.pathway[0] * 0.5);
    return { ok: true };
  };
  /** Repair one thing (kind/pi/id as in S.repairList), or with kind 'all' everything affordable in the system. */
  S.repair = function (run, fid, sysId, kind, pi, id) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const list = S.repairList(run, s).filter(r => kind === 'all' || (r.kind === kind && r.pi === pi && r.id === id)).sort((a, b) => a.dur - b.dur);
    if (!list.length) return { ok: false, reason: 'fine' };
    let n = 0, spent = [0, 0];
    for (const r of list) {
      if (!S.canPay(f, r.cost)) continue;
      pay(f, r.cost); spent[0] += r.cost[0]; spent[1] += r.cost[1]; n++;
      S.setRepaired(s, r);
    }
    if (!n) return short(list[0].cost);
    f.stats.repairs += spent[0];
    run.fx.push({ type: 'repair', sys: sysId, owner: fid, planet: pi, bld: id });
    return { ok: true, cost: spent, n };
  };

  /* ---------- military purchases ---------- */
  S.recruit = function (run, fid, sysId, n) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    n = Math.max(1, Math.min(n || C.army.batch, C.army.maxQueue - s.train.q));
    if (s.train.q >= C.army.maxQueue) return { ok: false, reason: 'queue' };
    const c = [Math.round(C.army.recruitCost * n * S.eventMod(run, 'salary')), 0];
    if (!pay(f, c)) return short(c);
    s.train.q += n;
    run.fx.push({ type: 'recruit', sys: sysId, owner: fid, n });
    return { ok: true, n, cost: c };
  };
  S.cancelRecruit = function (run, fid, sysId) {
    const s = ownSys(run, fid, sysId);
    if (!s || s.train.q <= 0) return { ok: false, reason: 'queue' };
    s.train.q = 0; s.train.prog = 0;
    return { ok: true };
  };
  S.buyShip = function (run, fid, sysId) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const c = C.equip.shipCost;
    if (!pay(f, c)) return short(c);
    s.gar.sdur = s.gar.ships ? (s.gar.sdur * s.gar.ships + 100) / (s.gar.ships + 1) : 100;
    s.gar.ships++;
    run.fx.push({ type: 'ship', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.buyPlatform = function (run, fid, sysId) {
    const f = run.factions[fid], s = ownSys(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (s.plat.n >= C.equip.maxPlatforms) return { ok: false, reason: 'maxplat' };
    const c = C.equip.platCost;
    if (!pay(f, c)) return short(c);
    s.plat.dur = s.plat.n ? (s.plat.dur * s.plat.n + 100) / (s.plat.n + 1) : 100;
    s.plat.n++;
    run.fx.push({ type: 'plat', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.buyPrice = function (run, f, sys) { return Math.round(C.buy.base * Math.pow(C.buy.growth, S.ownCount(run, f.id)) + C.buy.perGarrison * sys.gar.n); };
  S.buySystem = function (run, fid, sysId) {
    const f = run.factions[fid], s = run.systems[sysId];
    if (!s || s.owner !== -1) return { ok: false, reason: 'notneutral' };
    if (s.battle) return { ok: false, reason: 'battle' };
    if (!S.neighbours(run, sysId).some(n => run.systems[n].owner === fid)) return { ok: false, reason: 'notadjacent' };
    if (run.coalition && run.coalition.target === fid && run.t < run.coalition.until) return { ok: false, reason: 'sanction' };
    const c = [S.buyPrice(run, f, s), 0];
    if (!pay(f, c)) return short(c);
    s.owner = fid; s.gar.n = 0; s.gar.vet = 0; s.gar.ships = 0; s.train.q = 0; s.lastCaptured = run.t;
    f.stats.bought++;
    run.fx.push({ type: 'bought', sys: sysId, owner: fid });
    S.logMoment(run, f.short + ' BOUGHT ' + s.name, fid === 0 ? 'good' : 'info', fid);
    return { ok: true, cost: c };
  };
  S.stepTraining = function (run, dt) {
    for (const s of run.systems) {
      if (s.owner < 0 || s.train.q <= 0) continue;
      s.train.prog += dt * S.eventMod(run, 'train');
      while (s.train.prog >= C.army.trainTime && s.train.q > 0) {
        s.train.prog -= C.army.trainTime;
        s.train.q--;
        const g = s.gar;
        g.vet = U.safeDiv(g.vet * g.n, g.n + 1, 0);
        g.n++;
      }
      if (s.train.q <= 0) s.train.prog = 0;
    }
  };
})(globalThis.AS = globalThis.AS || {});
