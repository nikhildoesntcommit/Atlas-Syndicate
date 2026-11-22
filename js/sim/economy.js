/* ATLAS SYNDICATE v5 — sim/economy.js
   Each owned system runs its own small economy: extractors on planets, supply lines with freighters,
   a factory at the station. Only completed chains pay. Credits are shared across the empire and settle
   once per cycle: income - salaries - repairs. Also: durability, modifiers and every purchase. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, E = C.econ;

  /* ---------- modifiers: corporation + cards (+ the stated Hard bonus) ---------- */
  S.baseMods = () => ({
    salary: 1, train: 1, vetStart: 0, cost: 1, decay: 1, lineDecay: 1, salvage: false, def: 1, speed: 1, interior: 1,
    reach: 1, extract: 1, factory: 1, hydro: 1, surplus: 1, bulk: false, tax: 0, repair: 1, vetBonus: C.army.vetBonus,
    attack: 1, shipCost: 1, shipPower: 1, medics: 0, vetGain: 1, lineCost: 1, extraLines: 0, defBonus: C.combat.defBonus,
    platPower: 1, platCost: 1, militia: 0, sight: 1, armour: 1, capital: 1, income: 1,
  });
  S.recomputeMods = function (run, f) {
    const m = S.baseMods();
    switch (f.corp) {
      case 'halden': m.salary *= 0.7; break;
      case 'swift': m.reach += 0.5; break;
      case 'krone': m.cost *= 0.8; break;
      case 'duramax': m.decay *= 0.5; break;
      case 'salvage': m.salvage = true; break;
      case 'fortis': m.def *= 1.2; break;
      case 'rapid': m.speed *= 1.4; break;
      case 'drill': m.train *= 2; m.vetStart = 0.35; break;
    }
    for (const k of f.cards) {
      switch (k) {
        case 'deepcore': m.extract *= 1.15; break;
        case 'foundry': m.factory *= 1.12; break;
        case 'hydro': m.hydro *= 1.3; break;
        case 'trade': m.surplus = 2; break;
        case 'bulk': m.bulk = true; break;
        case 'taxes': m.tax = 0.25; break;
        case 'leanfix': m.repair *= 0.6; break;
        case 'sergeants': m.train *= 2; break;
        case 'cadre': m.vetBonus = 1.0; break;
        case 'wages': m.salary *= 0.8; break;
        case 'shock': m.attack *= 1.15; break;
        case 'warfound': m.shipCost *= 0.7; break;
        case 'guns': m.shipPower *= 1.5; break;
        case 'medics': m.medics = 0.25; break;
        case 'hardened': m.vetGain *= 2; break;
        case 'extraline': m.extraLines += 1; break;
        case 'fastfr': m.reach += 0.5; break;
        case 'drives': m.speed *= 1.3; break;
        case 'hulls': m.lineCost *= 0.6; break;
        case 'tough': m.lineDecay *= 0.5; break;
        case 'interior': m.interior *= 1.5; break;
        case 'fortress': m.defBonus += 0.15; break;
        case 'grid': m.platPower *= 1.5; break;
        case 'cheapplat': m.platCost *= 0.6; break;
        case 'militia': m.militia = 5; break;
        case 'radar': m.sight = 2; break;
        case 'armour': m.armour *= 0.5; break;
        case 'guard': m.capital *= 1.4; break;
      }
    }
    if (f.id !== 0) m.income *= AS.DIFFICULTY[run.diff].income;   // Hard only: the stated rival bonus
    f.mods = m;
    return m;
  };

  /* ---------- prices ---------- */
  S.price = function (run, f, what) {
    const m = f.mods, k = m.cost;
    switch (what) {
      case 'ext': return Math.round(E.extractorCost * k);
      case 'line': return Math.round(E.lineCost * k * m.lineCost);
      case 'freighter': return Math.round(E.freighterCost * k * m.lineCost);
      case 'ship': return Math.round(C.equip.shipCost * k * m.shipCost);
      case 'plat': return Math.round(C.equip.platformCost * k * m.platCost);
      case 'station': return Math.round(E.stationCost * k);
    }
    return 0;
  };
  S.buyPrice = function (run, f, sys) {
    const owned = S.ownCount(run, f.id);
    return Math.round((C.buy.base * Math.pow(C.buy.growth, owned) + C.buy.perGarrison * sys.gar.n) * f.mods.cost);
  };

  /* ---------- helpers ---------- */
  S.fac = (run, id) => run.factions[id];
  S.ownSystems = (run, fid) => run.systems.filter(s => s.owner === fid);
  S.ownCount = function (run, fid) { let n = 0; for (const s of run.systems) if (s.owner === fid) n++; return n; };
  S.lineSlots = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    let n = E.baseLines + (f ? f.mods.extraLines : 0);
    for (const p of E.linesAtPop) if (sys.pop >= p) n++;
    return Math.min(E.maxLines, n);
  };
  S.freeFreighters = function (sys) { let used = 0; for (const l of sys.lines) used += l.fr; return Math.max(0, sys.freighters - used); };
  S.stormed = function (run, sys) {
    for (const e of run.events.active) if (e.type === 'storm' && (e.region === 'core' ? sys.region === 'core' : sys.arm === e.arm)) return true;
    return false;
  };
  S.lineEff = function (run, sys, l, f) {
    if (l.dur <= 0 || sys.fdur <= 0 || l.fr <= 0 || l.stops.length < 2) return 0;
    if (S.stormed(run, sys)) return 0;
    const reach = f ? f.mods.reach : 1;
    return Math.min(1, l.fr * reach / Math.max(1, l.stops.length - 1));
  };

  /** What a system produces this cycle and why. Pure: does not change state. */
  S.sysYield = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const m = f ? f.mods : S.baseMods();
    const L = sys.lines, n = L.length;
    const eff = L.map(l => S.lineEff(run, sys, l, f));
    const best = L.map((l, i) => (l.stops.indexOf(-1) >= 0 ? eff[i] : 0));
    for (let pass = 0; pass < n; pass++) {            // transfers: a line feeds the station through another line it touches
      let changed = false;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j || best[j] <= 0) continue;
        if (!L[i].stops.some(s => s >= 0 && L[j].stops.indexOf(s) >= 0)) continue;
        const v = Math.min(eff[i], best[j]);
        if (v > best[i] + 1e-9) { best[i] = v; changed = true; }
      }
      if (!changed) break;
    }
    const units = { ore: 0, energy: 0, food: 0 }, per = [];
    const warn = [];
    let extractors = 0;
    sys.planets.forEach((p, pi) => {
      let frac = 0;
      for (let i = 0; i < n; i++) if (L[i].stops.indexOf(pi) >= 0) frac = Math.max(frac, best[i]);
      let u = 0;
      if (p.ext) {
        extractors++;
        if (p.ext.dur > 0) u = p.rich * E.perRich * m.extract * frac;
        if (p.ext.dur > 0 && frac <= 0) warn.push(['unlinked', pi]);
        if (p.ext.dur <= 0) warn.push(['broken', pi]);
      }
      per.push({ u, frac });
      units[p.type] += u;
    });
    const station = sys.station.dur > 0;
    const pairs = station ? Math.min(units.ore, units.energy) : 0;
    const popMult = 1 + sys.pop * E.popMult;
    const foodForMax = (E.popMax - E.popBase) / (E.popPerFood * m.hydro);
    const foodSurplus = Math.max(0, units.food - foodForMax);
    let boom = null;
    for (const e of run.events.active) if (e.type === 'boom') boom = e.res;
    const sv = r => (boom === r ? AS.EVENTS.boom.value : m.surplus * E.surplusValue);
    const surplus = station ? (units.ore - pairs) * sv('ore') + (units.energy - pairs) * sv('energy') + foodSurplus * sv('food') : 0;
    let credits = pairs * E.pairValue * popMult * m.factory * (m.bulk && extractors >= 4 ? 1.1 : 1) + surplus;
    if (station && m.tax) credits += Math.floor(sys.pop * m.tax);
    credits *= m.income;
    const popCap = Math.min(E.popMax, Math.round(E.popBase + units.food * E.popPerFood * m.hydro));
    if (!station) warn.push(['station', -1]);
    else if (units.ore > 0 && units.energy <= 0) warn.push(['noenergy', -1]);
    else if (units.energy > 0 && units.ore <= 0) warn.push(['noore', -1]);
    if (sys.pop > popCap) warn.push(['nofood', -1]);
    L.forEach((l, i) => { if (l.dur <= 0) warn.push(['linebroken', i]); else if (eff[i] > 0 && eff[i] < 1) warn.push(['slow', i]); else if (l.fr <= 0) warn.push(['nofr', i]); });
    if (sys.fdur <= 0 && sys.freighters > 0) warn.push(['fleet', -1]);
    if (S.stormed(run, sys)) warn.push(['storm', -1]);
    return { units, pairs, credits: U.fin(credits), surplus, popCap, popMult, per, eff, best, warn, extractors, station };
  };

  /* ---------- buildings & durability ---------- */
  /** Everything in a system that has durability, with what a full repair would cost. */
  S.buildings = function (run, sys) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const pr = w => (f ? S.price(run, f, w) : 0);
    const out = [{ kind: 'station', idx: -1, dur: sys.station.dur, price: pr('station') }];
    sys.planets.forEach((p, i) => { if (p.ext) out.push({ kind: 'ext', idx: i, dur: p.ext.dur, price: pr('ext') }); });
    sys.lines.forEach((l, i) => out.push({ kind: 'line', idx: i, dur: l.dur, price: pr('line') }));
    if (sys.freighters > 0) out.push({ kind: 'fleet', idx: -1, dur: sys.fdur, price: pr('freighter') * sys.freighters });
    if (sys.plat.n > 0) out.push({ kind: 'plat', idx: -1, dur: sys.plat.dur, price: pr('plat') * sys.plat.n });
    if (sys.gar.ships > 0) out.push({ kind: 'ships', idx: -1, dur: sys.gar.sdur, price: pr('ship') * sys.gar.ships });
    return out;
  };
  S.repairCost = function (run, f, b) { return Math.ceil(b.price * C.dur.repairFrac * (100 - U.clamp(b.dur, 0, 100)) / 100 * f.mods.repair); };
  S.setDur = function (sys, kind, idx, v) {
    v = U.clamp(v, 0, 100);
    switch (kind) {
      case 'station': sys.station.dur = v; break;
      case 'ext': if (sys.planets[idx] && sys.planets[idx].ext) sys.planets[idx].ext.dur = v; break;
      case 'line': if (sys.lines[idx]) sys.lines[idx].dur = v; break;
      case 'fleet': sys.fdur = v; break;
      case 'plat': sys.plat.dur = v; break;
      case 'ships': sys.gar.sdur = v; break;
    }
  };
  /** Battle or raid damage to the buildings of a system. */
  S.damageBuildings = function (run, sys, amount, raid) {
    const f = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const a = amount * (f ? f.mods.armour : 1);
    if (a <= 0) return;
    sys.station.dur = Math.max(0, sys.station.dur - a * (raid ? 0.8 : 0.6));
    for (const p of sys.planets) if (p.ext) p.ext.dur = Math.max(0, p.ext.dur - a * (0.6 + run.rng() * 0.8));
    for (const l of sys.lines) l.dur = Math.max(0, l.dur - a * (raid ? 1.5 : 1) * (0.6 + run.rng() * 0.8));
    if (sys.freighters) sys.fdur = Math.max(0, sys.fdur - a * (raid ? 1.5 : 1));
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

  /** Next cycle's settlement, shown at all times: income - salaries - repairs. */
  S.forecast = function (run, f) {
    let income = 0, repairs = 0;
    for (const s of run.systems) {
      if (s.owner !== f.id) continue;
      income += S.sysYield(run, s).credits;
      if (f.autoRepair) for (const b of S.buildings(run, s)) if (b.dur < C.dur.autoRepairAt) repairs += S.repairCost(run, f, b);
    }
    const salary = S.salary(run, f);
    return { income: Math.round(income), salary: Math.round(salary), repairs: Math.round(repairs), net: Math.round(income - salary - repairs) };
  };

  /* ---------- the cycle: settle credits, grow population, wear buildings ---------- */
  S.cycle = function (run) {
    run.cycleN++;
    for (const f of run.factions) {
      if (!f.alive) continue;
      let income = 0;
      for (const s of run.systems) {
        if (s.owner !== f.id) continue;
        const y = S.sysYield(run, s);
        income += y.credits;
        s.lastYield = { credits: Math.round(y.credits), per: y.per.map(p => Math.round(p.u * 10) / 10), t: run.t };
        // population drifts toward what the food supports
        const d = y.popCap - s.pop;
        if (d !== 0) s.pop += Math.sign(d) * (Math.abs(d) > 6 ? 2 : 1);
        s.pop = U.clamp(s.pop, 0, E.popMax);
        if (y.credits >= 1) run.fx.push({ type: 'yield', sys: s.id, owner: f.id, v: Math.round(y.credits) });
      }
      const salary = S.salary(run, f);
      income = Math.round(income);
      f.credits += income - Math.round(salary);
      f.stats.income += income; f.stats.salary += Math.round(salary);
      f.lastCycle = { income, salary: Math.round(salary), repairs: 0 };
      // auto-repair (the player's default; AIs decide repairs themselves through actions)
      if (f.autoRepair) {
        const list = [];
        for (const s of run.systems) if (s.owner === f.id) for (const b of S.buildings(run, s)) if (b.dur < C.dur.autoRepairAt) list.push([s, b]);
        list.sort((p, q) => p[1].dur - q[1].dur);
        for (const [s, b] of list) {
          const c = S.repairCost(run, f, b);
          if (c <= 0 || f.credits < c) continue;
          f.credits -= c; f.stats.repairs += c; f.lastCycle.repairs += c;
          S.setDur(s, b.kind, b.idx, 100);
        }
      }
      // bankruptcy: one warning, then desertion every cycle until the books are back above zero
      // desertion only while the books are negative AND this cycle's settlement did not cover salaries
      if (f.credits < 0 && (income < Math.round(salary) || f.broke === 0)) {
        f.broke++;
        if (f.broke === 1) run.fx.push({ type: 'bankrupt', owner: f.id });
        else S.desert(run, f);
      } else f.broke = 0;
    }
    // wear: everything owned slowly loses durability; garrisons slowly gain veterancy
    for (const s of run.systems) {
      if (s.owner < 0) continue;
      const m = run.factions[s.owner].mods, d = C.dur.decay * m.decay, dl = d * m.lineDecay, de = C.dur.equipDecay * m.decay;
      s.station.dur = Math.max(0, s.station.dur - d);
      for (const p of s.planets) if (p.ext) p.ext.dur = Math.max(0, p.ext.dur - d);
      for (const l of s.lines) l.dur = Math.max(0, l.dur - dl);
      if (s.freighters) s.fdur = Math.max(0, s.fdur - dl);
      if (s.plat.n) s.plat.dur = Math.max(0, s.plat.dur - de);
      if (s.gar.ships) s.gar.sdur = Math.max(0, s.gar.sdur - de);
      if (s.gar.n) s.gar.vet = Math.min(1, s.gar.vet + C.army.vetPerCycle);
    }
    for (const a of run.armies) { a.vet = Math.min(1, a.vet + C.army.vetPerCycle); }
  };
  S.desert = function (run, f) {
    let lost = 0;
    for (const s of run.systems) if (s.owner === f.id && s.gar.n > 0) { const k = Math.max(1, Math.ceil(s.gar.n * C.army.desertFrac)); s.gar.n -= k; lost += k; }
    for (const a of run.armies) if (a.owner === f.id && a.n > 1) { const k = Math.ceil(a.n * C.army.desertFrac); a.n -= k; lost += k; }
    f.stats.deserted += lost;
    if (lost) run.fx.push({ type: 'desert', owner: f.id, n: lost });
    S.logMoment(run, f.short + ': ' + lost + ' SOLDIERS DESERTED', f.id === 0 ? 'bad' : 'info', f.id);
  };

  /* ---------- purchases (validated; return {ok, reason}) ---------- */
  function own(run, fid, sysId) {
    const s = run.systems[sysId];
    return s && s.owner === fid ? s : null;
  }
  function pay(f, c) { if (f.credits < c) return false; f.credits -= c; f.stats.spent += c; return true; }

  S.buildExtractor = function (run, fid, sysId, pi) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const p = s.planets[pi];
    if (!p) return { ok: false, reason: 'invalid' };
    if (p.ext) return { ok: false, reason: 'built' };
    const c = S.price(run, f, 'ext');
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    p.ext = { dur: 100 };
    run.fx.push({ type: 'build', sys: sysId, owner: fid, planet: pi });
    return { ok: true, cost: c };
  };
  /** Drag from node a to node b (node -1 is the station). Extends a line that ends at a, else draws a new line. */
  S.drawLine = function (run, fid, sysId, a, b) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const valid = n => n === -1 || (n >= 0 && n < s.planets.length);
    if (!valid(a) || !valid(b) || a === b) return { ok: false, reason: 'invalid' };
    if (s.lines.some(l => { const i = l.stops.indexOf(a), j = l.stops.indexOf(b); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; })) return { ok: false, reason: 'linked' };
    // extend: a line whose end is a and which does not already visit b
    // from the station, a free line slot means a new line; otherwise extend the line that ends at a
    const fromStationNew = a === -1 && s.lines.length < S.lineSlots(run, s);
    const ext = fromStationNew ? null : s.lines.find(l => (l.stops[l.stops.length - 1] === a || l.stops[0] === a) && l.stops.indexOf(b) < 0);
    if (ext) {
      if (ext.stops.length >= 5) return { ok: false, reason: 'long' };
      if (ext.stops[ext.stops.length - 1] === a) ext.stops.push(b); else ext.stops.unshift(b);
      run.fx.push({ type: 'line', sys: sysId, owner: fid, line: ext.id });
      return { ok: true, line: ext, extended: true, cost: 0 };
    }
    if (s.lines.length >= S.lineSlots(run, s)) return { ok: false, reason: 'slots' };
    const c = S.price(run, f, 'line');
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    const l = { id: s.nextLine++, stops: [a, b], fr: 0, dur: 100 };
    s.lines.push(l);
    if (S.freeFreighters(s) > 0) l.fr = 1;
    run.fx.push({ type: 'line', sys: sysId, owner: fid, line: l.id });
    return { ok: true, line: l, cost: c };
  };
  S.lineById = (s, id) => s.lines.find(l => l.id === id) || null;
  S.removeLine = function (run, fid, sysId, lineId) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    const l = s && S.lineById(s, lineId);
    if (!l) return { ok: false, reason: 'invalid' };
    s.lines = s.lines.filter(x => x !== l);
    const back = Math.round(S.price(run, f, 'line') * 0.5);
    f.credits += back;
    run.fx.push({ type: 'unline', sys: sysId, owner: fid });
    return { ok: true, refund: back };
  };
  /** Trim the last stop off a line (a line needs at least two stops). */
  S.trimLine = function (run, fid, sysId, lineId) {
    const s = own(run, fid, sysId), l = s && S.lineById(s, lineId);
    if (!l) return { ok: false, reason: 'invalid' };
    if (l.stops.length <= 2) return S.removeLine(run, fid, sysId, lineId);
    l.stops.pop();
    return { ok: true };
  };
  S.lineFreighter = function (run, fid, sysId, lineId, d) {
    const f = run.factions[fid], s = own(run, fid, sysId), l = s && S.lineById(s, lineId);
    if (!l) return { ok: false, reason: 'invalid' };
    if (d > 0) {
      if (S.freeFreighters(s) <= 0) {
        const r = S.buyFreighter(run, fid, sysId, true);
        if (!r.ok) return r;
      }
      l.fr++;
      return { ok: true };
    }
    if (l.fr <= 0) return { ok: false, reason: 'none' };
    l.fr--;
    return { ok: true };
  };
  S.buyFreighter = function (run, fid, sysId, noAssign) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (s.freighters >= E.maxFreighters) return { ok: false, reason: 'maxfr' };
    const c = S.price(run, f, 'freighter');
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    s.fdur = s.freighters ? (s.fdur * s.freighters + 100) / (s.freighters + 1) : 100;
    s.freighters++;
    if (!noAssign) {   // joins the line that needs it most
      let best = null, need = 0;
      for (const l of s.lines) { const n = (l.stops.length - 1) / f.mods.reach - l.fr; if (n > need) { need = n; best = l; } }
      if (best) best.fr++;
    }
    run.fx.push({ type: 'buy', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.repair = function (run, fid, sysId, kind, idx) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const b = S.buildings(run, s).find(x => x.kind === kind && x.idx === idx);
    if (!b) return { ok: false, reason: 'invalid' };
    const c = S.repairCost(run, f, b);
    if (c <= 0) return { ok: false, reason: 'fine' };
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    f.stats.repairs += c;
    S.setDur(s, kind, idx, 100);
    run.fx.push({ type: 'repair', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.repairAllCost = function (run, f, s) { let c = 0; for (const b of S.buildings(run, s)) c += S.repairCost(run, f, b); return c; };
  S.repairAll = function (run, fid, sysId) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const list = S.buildings(run, s).filter(b => b.dur < 100).sort((p, q) => p.dur - q.dur);
    if (!list.length) return { ok: false, reason: 'fine' };
    let spent = 0, n = 0;
    for (const b of list) {
      const c = S.repairCost(run, f, b);
      if (c <= 0 || f.credits < c) continue;
      f.credits -= c; spent += c; n++;
      S.setDur(s, b.kind, b.idx, 100);
    }
    if (!n) return { ok: false, reason: 'credits', cost: S.repairCost(run, f, list[0]) };
    f.stats.repairs += spent; f.stats.spent += spent;
    run.fx.push({ type: 'repair', sys: sysId, owner: fid });
    return { ok: true, cost: spent, n };
  };
  S.buyShip = function (run, fid, sysId) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    const c = S.price(run, f, 'ship');
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    s.gar.sdur = s.gar.ships ? (s.gar.sdur * s.gar.ships + 100) / (s.gar.ships + 1) : 100;
    s.gar.ships++;
    run.fx.push({ type: 'ship', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.buyPlatform = function (run, fid, sysId) {
    const f = run.factions[fid], s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    if (s.plat.n >= C.equip.maxPlatforms) return { ok: false, reason: 'maxplat' };
    const c = S.price(run, f, 'plat');
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    s.plat.dur = s.plat.n ? (s.plat.dur * s.plat.n + 100) / (s.plat.n + 1) : 100;
    s.plat.n++;
    run.fx.push({ type: 'plat', sys: sysId, owner: fid });
    return { ok: true, cost: c };
  };
  S.recruit = function (run, fid, sysId, n) {
    const s = own(run, fid, sysId);
    if (!s) return { ok: false, reason: 'notyours' };
    n = Math.max(1, Math.min(n || C.army.batch, C.army.maxQueue - s.train.q));
    if (n <= 0 || s.train.q >= C.army.maxQueue) return { ok: false, reason: 'queue' };
    s.train.q += n;
    run.fx.push({ type: 'recruit', sys: sysId, owner: fid, n });
    return { ok: true, n };
  };
  S.cancelRecruit = function (run, fid, sysId) {
    const s = own(run, fid, sysId);
    if (!s || s.train.q <= 0) return { ok: false, reason: 'queue' };
    s.train.q = 0; s.train.prog = 0;
    return { ok: true };
  };
  S.buySystem = function (run, fid, sysId) {
    const f = run.factions[fid], s = run.systems[sysId];
    if (!s || s.owner !== -1) return { ok: false, reason: 'notneutral' };
    if (s.battle) return { ok: false, reason: 'battle' };
    if (!S.neighbours(run, sysId).some(n => run.systems[n].owner === fid)) return { ok: false, reason: 'notadjacent' };
    const c = S.buyPrice(run, f, s);
    if (!pay(f, c)) return { ok: false, reason: 'credits', cost: c };
    s.owner = fid;
    s.gar.n = 0; s.gar.vet = 0; s.gar.ships = 0; s.train.q = 0;
    s.lastCaptured = run.t;
    f.stats.bought++;
    run.fx.push({ type: 'bought', sys: sysId, owner: fid });
    S.logMoment(run, f.short + ' BOUGHT ' + s.name, fid === 0 ? 'good' : 'info', fid);
    return { ok: true, cost: c };
  };

  /** Soldiers in training join the garrison one at a time. */
  S.stepTraining = function (run, dt) {
    for (const s of run.systems) {
      if (s.owner < 0 || s.train.q <= 0) continue;
      const f = run.factions[s.owner];
      s.train.prog += dt * f.mods.train * S.eventMod(run, 'train');
      while (s.train.prog >= C.army.trainTime && s.train.q > 0) {
        s.train.prog -= C.army.trainTime;
        s.train.q--;
        const g = s.gar;
        g.vet = U.safeDiv(g.vet * g.n + f.mods.vetStart, g.n + 1, 0);
        g.n++;
      }
      if (s.train.q <= 0) s.train.prog = 0;
    }
  };
})(globalThis.AS = globalThis.AS || {});
