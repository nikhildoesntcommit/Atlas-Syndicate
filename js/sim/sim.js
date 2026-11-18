/* ATLAS SYNDICATE v4 — sim/sim.js
   The fixed-step simulation, scoring, save/load and invariant checks. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  S.step = function (run, dt) {
    if (run.over || run.shop) return;
    dt = U.clamp(U.fin(dt, 0), 0, 0.25);
    run.t += dt;
    run.steps++;
    run.frameIncome = 0; run.frameExpense = 0;
    S.updatePositions(run);
    S.updateMarket(run, dt);
    for (const b of run.bodies) if (b.claimed && !b.site) S.updateColony(run, b, dt);
    S.computeLogistics(run);
    S.updateFreighters(run, dt);
    S.updateSite(run);
    if (run.over) return;
    S.updateExchange(run, dt);
    S.updateFinance(run, dt);
    for (const r of run.routes) if (r.halted > 0) r.halted = Math.max(0, r.halted - dt);
    if (run.banner) { run.banner.t -= dt; if (run.banner.t <= 0) run.banner = null; }
    const k = Math.min(1, dt / 6);
    run.incomeRate += (run.frameIncome / dt - run.incomeRate) * k;
    run.expenseRate += (run.frameExpense / dt - run.expenseRate) * k;
    run.peakPop = Math.max(run.peakPop, S.totalPop(run));
    run.conf = U.clamp(U.fin(run.conf, 0), 0, 100);
    run.minConf = Math.min(run.minConf, run.conf);
    if (run.minConf < 20 && run.conf > 60) run.comeback = true;
    run.histT += dt;
    if (run.histT >= C.history.every) { run.histT -= C.history.every; S.record(run); }
    if (run.conf <= 0) {
      run.over = true; run.overReason = run.overReason || 'BOARD CONFIDENCE REACHED ZERO';
      S.logMoment(run, 'BOARD CONFIDENCE REACHED ZERO', 'bad');
      S.record(run);
      return;
    }
    S.director(run);
    if (run.over) S.record(run);
  };

  S.computeScore = function (run) {
    const SC = C.score, M = C.mega;
    const revenue = Math.round(U.fin(run.totalIncome));
    const tenure = Math.floor(U.fin(run.t)) * SC.perSecond;
    const contracts = run.contractsDone * SC.perContract;
    const pop = Math.round(run.peakPop) * SC.perPeakPop;
    const stages = run.mega.stage * SC.perStage;
    let mega = 0;
    if (run.mega.state === 'done') mega = M.bonus + Math.max(0, Math.round((M.timeBonusBy - run.mega.completedAt) * M.timeBonusPerSec));
    const base = revenue + tenure + contracts + pop + stages + mega;
    const mult = AS.CHARTERS[run.charter].score;
    return { revenue, tenure, contracts, pop, stages, mega, base, mult, total: Math.round(base * mult) };
  };
  S.rankTitle = score => AS.RANKS.find(t => score >= t[0])[1];

  /* ---------- save / resume: everything except derived maps and transient fx ---------- */
  const SKIP = { rng: 1, bodyMap: 1, routeMap: 1, fx: 1, primeRef: 1 };
  S.serialize = function (run) {
    return JSON.stringify(run, (k, v) => (SKIP[k] ? undefined : v));
  };
  S.deserialize = function (text) {
    const run = typeof text === 'string' ? JSON.parse(text) : text;
    if (!run || run.v !== 4 || !Array.isArray(run.bodies)) throw new Error('not a v4 save');
    run.rng = U.rngFrom(run.rngState);
    run.fx = [];
    run.primeRef = null;
    run.bodyMap = new Map(run.bodies.map(b => [b.id, b]));
    run.routeMap = new Map(run.routes.map(r => [r.id, r]));
    return run;
  };
  /** A short fingerprint of the full state, used to prove determinism. */
  S.hash = function (run) {
    const s = JSON.stringify(run, (k, v) => (SKIP[k] || k === 'actions' ? undefined : v));
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };

  /* ---------- invariants (used by the self-test and the fuzzer) ---------- */
  S.scanFinite = function (obj, path, out, depth) {
    if (out.length > 12 || depth > 7) return out;
    if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(path + '=' + obj); return out; }
    if (!obj || typeof obj !== 'object' || obj instanceof Map || typeof obj === 'function') return out;
    if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) S.scanFinite(obj[i], path + '[' + i + ']', out, depth + 1); return out; }
    for (const k in obj) { if (k === 'fx' || k === 'rng' || k === 'primeRef') continue; S.scanFinite(obj[k], path + '.' + k, out, depth + 1); }
    return out;
  };
  S.checkInvariants = function (run, fails) {
    if (run.routes.length !== run.routeMap.size) fails.push('route map out of sync');
    if (run.bodies.length !== run.bodyMap.size) fails.push('body map out of sync');
    if (run.conf < 0 || run.conf > 100) fails.push('confidence out of range ' + run.conf);
    if (run.bodies.filter(b => b.prime).length !== 1) fails.push('capital missing or duplicated');
    if (!S.prime(run).claimed) fails.push('capital unclaimed');
    const cap = S.capacity(run);
    for (const f of run.freighters) {
      if (f.route && !run.routeMap.has(f.route)) { fails.push('orphan freighter ' + f.id); break; }
      if (f.load < 0 || f.load > cap + 1e-6) { fails.push('freighter overload ' + f.id + ' ' + f.load); break; }
      let sum = 0;
      for (const g in f.cargo) sum += f.cargo[g];
      if (Math.abs(sum - f.load) > 1e-6) { fails.push('freighter cargo/load mismatch ' + f.id); break; }
    }
    for (const b of run.bodies) {
      const sc = S.storageCap(run, b);
      if (!b.claimed && b.fac.some(Boolean)) { fails.push('unclaimed world has facilities ' + b.name); return; }
      if (b.claimed && !b.found) { fails.push('claimed world not discovered ' + b.name); return; }
      if (b.fac.length !== b.slotsN) { fails.push('slot count mismatch ' + b.name); return; }
      if (b.pop < 0 || b.pop > 600 || (!b.claimed && b.pop !== 0)) { fails.push('population out of range at ' + b.name + ' ' + b.pop); return; }
      for (const g of AS.GOOD_KEYS) if (b.stock[g] < -1e-6 || b.stock[g] > sc + 1e-6) { fails.push('stock out of range at ' + b.name + ' ' + g + '=' + b.stock[g]); return; }
      for (const f of b.fac) if (f && (f.build < 0 || f.broken < 0 || !AS.FAC[f.type])) { fails.push('bad facility on ' + b.name); return; }
    }
    for (const r of run.routes) {
      const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
      if (!A || !B || !A.claimed || !B.claimed) { fails.push('route touches unclaimed world'); return; }
      if (A.site && B.site) { fails.push('site linked to itself'); return; }
    }
    if (run.mega.stage < 0 || run.mega.stage > C.mega.stages.length) fails.push('megaproject stage out of range');
    if (run.mega.state === 'done' && !run.won) fails.push('megaproject done but run not won');
  };
})(globalThis.AS = globalThis.AS || {});
