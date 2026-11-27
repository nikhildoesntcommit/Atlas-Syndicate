/* ATLAS SYNDICATE v7 — sim/ai/brain.js
   The shared decision system every rival uses (and the AI that plays your slot in ?demo / F9 / tests).

   Every few seconds a faction:
     1. perceives the map through its own fog of war (exact power only where it can see),
     2. scores its options with one formula per option type, weighted by its personality:
          build a chain on a planet / build a farm / upgrade a machine / trade / buy units / buy a system /
          attack X / reinforce Y / save,
     3. runs the best affordable options through S.act(), the same entry point the player uses.

   Economy: utility = value of what a chain produces per cycle (minus what its workers eat) x the cycles
   it will run, divided by what it costs. Chains are built exactly as a player builds them: place an
   extractor, drill the cheapest path around barriers, place a processor (here, or on another planet
   through a pathway and its ports when slots run out), connect. Gold is sold as soon as it arrives; food,
   water and fuel are bought on the market when they are about to run out.

   Military: power is deterministic (the bigger side wins and keeps the difference), so the AI simply
   wants its personality's edge over the defender. Reinforce exposed borders first; stage an attack, hold
   massed, then strike. Coalitions: when someone holds 35% of the galaxy, everybody else ignores each other
   and strikes the leader together on a shared clock. From 18:00 rival capitals become the priority. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, E = C.econ;
  const AI = S.AI = {};

  AI.init = function (run, f) {
    f.ai = { next: run.t + 1.0 + f.id * 0.67, plan: null, grudge: {}, cool: {}, diff: f.id === 0 && !run.seat0Same ? 'normal' : run.diff, thinks: 0, lastPlanAt: -999, log: [], idle: {} };
  };
  AI.params = function (run, f) {
    return { P: AS.PERSONALITIES[f.pers] || AS.PERSONALITIES.balanced, D: AS.DIFFICULTY[(f.ai && f.ai.diff) || run.diff] };
  };
  function note(f, run, what, u) {
    f.ai.log.push({ t: Math.round(run.t), what, u: Math.round(U.fin(u, 0) * 100) / 100 });
    if (f.ai.log.length > 10) f.ai.log.shift();
  }
  const BAND = { S: 10, M: 30, L: 70 };
  /** Power needed to take a defender of `def` with this edge. */
  AI.required = (def, edge) => def * (1 + edge) + 3;

  /* ---------- perception ---------- */
  function perceive(run, f, P, D) {
    const vis = S.visibility(run, f.id), co = run.coalition;
    const V = { vis, co, own: [], threat: {}, deficit: {}, keep: {}, excess: {}, border: {}, incoming: {} };
    for (const a of run.armies) if (a.owner !== f.id && a.mode === 'attack' && run.systems[a.dest].owner === f.id && S.armyVisible(run, f.id, a)) {
      V.incoming[a.dest] = (V.incoming[a.dest] || 0) + S.armyPower(run, a);
      f.ai.grudge[a.owner] = run.t;
    }
    V.host = o => {
      if (o < 0 || o === f.id) return 0;
      if (S.truceBlocks(run, o, f.id)) return 0.15;      // a coalition partner cannot attack us during the truce
      let h = 0.55;
      if (f.ai.grudge[o] !== undefined && run.t - f.ai.grudge[o] < 150) h += 0.45 * P.punish;
      if (co && co.target === o) h += 0.6;
      return h;
    };
    V.estimate = s => (vis[s.id] ? S.sysPower(run, s) : BAND[S.sizeBand(S.sysPower(run, s))]);
    const own = V.own = run.systems.filter(s => s.owner === f.id);
    const ownIn = {};
    for (const a of run.armies) if (a.owner === f.id && a.mode === 'move') ownIn[a.dest] = (ownIn[a.dest] || 0) + S.armyPower(run, a);
    const safety = P.safety * D.react * (co && co.target === f.id ? 1.3 : 1);
    const early = run.t < C.game.protect - 60 ? 0 : 1;   // nobody can attack before 4:00
    for (const s of own) {
      let t = 0, border = false;
      for (const n of S.neighbours(run, s.id)) {
        const o = run.systems[n];
        if (o.owner === f.id) continue;
        border = true;
        if (o.owner >= 0) t += V.host(o.owner) * V.estimate(o) * (vis[o.id] ? 1 : 0.7);
      }
      t = t * early + (V.incoming[s.id] || 0) * 1.3;
      V.threat[s.id] = t;
      V.border[s.id] = border;
      const def = S.sysPower(run, s) + (ownIn[s.id] || 0);
      // a baseline guard that grows with the clock, so nothing is ever left at zero once attacks open
      const base = run.t < C.game.protect - 70 ? 0 : (s.capital === f.id ? 1 : border ? 0.5 : 0.1) * (25 + Math.max(0, run.t - C.game.protect) / 60 * 9) * P.safety;
      const want = Math.max(t * safety * (s.capital === f.id ? 1.25 : 1), base);
      V.deficit[s.id] = Math.max(0, want - def);
      V.keep[s.id] = Math.max(early ? P.minGar : 0, want * 0.9);
      V.excess[s.id] = Math.max(0, S.sysPower(run, s) - V.keep[s.id]);
    }
    return V;
  }

  /* ---------- economy: what each stock is worth to this faction right now (in money) ---------- */
  function values(run, f, fc) {
    const urg = (have, use, floor) => U.clamp((use * 14 + floor - have) / (use * 14 + floor), 0, 1);
    const food = 3 * (1 + 2.5 * urg(f.food, Math.max(0.5, fc.food.out), 30) + (fc.food.net < 0 ? 1.5 : 0));
    return {
      money: 1,
      gold: S.price(run, 'gold'),
      water: 2 * (1 + (fc.farmWater > 0 ? 1.5 * urg(f.water, Math.max(0.5, fc.water.out), 20) : 0) + (fc.food.net < 1 ? 1 : 0)),
      food,
      fuel: 4 * (0.6 + 2 * urg(f.fuel, Math.max(0.3, fc.fuel.out), 30) + (fc.fuel.net < 0 ? 1 : 0)),
      crew: E.crew * E.eat * food,    // what one building's workers eat per cycle, in money
    };
  }
  const freeSlots = (f, p) => { const n = S.slotCount(p, f), used = new Set(p.blds.map(b => b.slot)); const out = []; for (let i = 0; i < n; i++) if (!used.has(i)) out.push(i); return out; };
  const tapped = (p, dep) => p.blds.some(b => b.drill && b.drill.dep === dep.id);
  const E_CAP = b => E.procCap * (b ? S.lvlMult(b) : 1);
  /** All ways to turn a deposit into stock, as concrete build steps with a price and a payoff. */
  function chainCandidates(run, f, s, fl, val, horizon) {
    const out = [];
    s.planets.forEach((p, pi) => {
      const free = freeSlots(f, p);
      if (!free.length) return;
      for (const dep of p.deposits) {
        if (dep.amount < 25 || tapped(p, dep)) continue;
        const R = AS.RES[dep.res], ext = R.ext, proc = R.proc;
        // cheapest shaft from any free slot
        let best = null;
        for (const sl of free) { const d = S.bestDrill(run, f, p, sl, dep); if (d && (!best || d.cost < best.cost)) best = Object.assign({ slot: sl }, d); }
        if (!best) continue;
        const rate = Math.min(dep.amount, S.extRate(f, dep));
        const runs = Math.min(horizon, dep.amount / Math.max(0.1, rate));
        const base = AS.BLD[ext].cost + best.cost;
        const opts = [];
        if (!proc) opts.push({ gain: rate * val.gold - val.crew, cost: base, steps: [], where: p.name });   // the gold mine: no processor
        else {
          const unit = (r, q, qp) => r * AS.BLD[proc].yield * S.procBonus(qp, proc) * val[R.out];
          // (a) an existing processor of this resource on the same planet with room
          for (const q of p.blds) if (q.kind === proc && fl.B[q.id].staffed) {
            const spare = E_CAP(q) - fl.B[q.id].input;
            if (spare > 0.5) opts.push({ gain: unit(Math.min(rate, spare), q, p) - val.crew, cost: base + AS.COSTS.conveyor, steps: [['connectB', pi, q.id]], where: p.name });
          }
          // (b) a new processor in another free slot here
          const other = free.filter(x => x !== best.slot);
          if (other.length) opts.push({ gain: unit(Math.min(rate, E_CAP()), null, p) - 2 * val.crew, cost: base + AS.COSTS.conveyor + AS.BLD[proc].cost, steps: [['newProc', pi, other[0]], ['connectB', pi, 'Q']], where: p.name });
          // (c) through a pathway to another planet that has room (existing pathway, or a new one)
          s.planets.forEach((q, qi) => {
            if (qi === pi) return;
            const pw = s.pathways.find(x => (x.a === pi && x.b === qi) || (x.a === qi && x.b === pi));
            if (!pw && s.pathways.length >= S.pathwaySlots(run, s)) return;
            const pathCost = pw ? 0 : AS.COSTS.pathway;
            const link = pw ? q.portIn[pw.id] : null;
            const used = pw && fl.P[pw.id] ? fl.P[pw.id][pw.a === pi ? 'ab' : 'ba'] : 0;
            const pathRoom = E.pathCap - used;
            if (pathRoom < 1) return;
            if (link) {
              const lq = S.bldById(q, link.b);
              if (!lq || lq.kind !== proc || !fl.B[lq.id].staffed) return;
              const spare = E_CAP(lq) - fl.B[lq.id].input;
              if (spare < 1) return;
              opts.push({ gain: unit(Math.min(rate, spare, pathRoom), lq, q) - val.crew, cost: base + AS.COSTS.conveyor, steps: [['connectP', pi, pw.id]], where: q.name, port: true });
              return;
            }
            // a processor already there with room, or a new one in a free slot
            const qFree = freeSlots(f, q);
            const existing = q.blds.find(b => b.kind === proc && fl.B[b.id].staffed && E_CAP(b) - fl.B[b.id].input > 1);
            const qc = existing ? AS.COSTS.conveyor * 2 : qFree.length ? AS.BLD[proc].cost + AS.COSTS.conveyor * 2 : null;
            if (qc === null) return;
            const steps = [];
            if (!pw) steps.push(['pathway', pi, qi]);
            if (!existing) steps.push(['newProc', qi, qFree[0]]);
            steps.push(['connectP', pi, pw ? pw.id : 'PW'], ['portIn', qi, pw ? pw.id : 'PW', existing ? existing.id : 'Q']);
            opts.push({ gain: unit(Math.min(rate, E_CAP(), pathRoom), null, q) - (existing ? 1 : 2) * val.crew, cost: base + qc + pathCost, steps, where: q.name, port: true });
          });
        }
        for (const o of opts) {
          o.steps.unshift(['newExt', pi, best.slot, ext], ['drill', pi, 'E', best.path]);
          o.u = o.gain * runs / Math.max(1, o.cost);
          o.sys = s.id; o.label = AS.BLD[ext].name + (proc ? (o.port ? ' > PORT > ' : ' > ') + AS.BLD[proc].name : '') + ' ON ' + o.where;
          out.push(o);
        }
      }
    });
    return out;
  }
  /** Farms: water from the stockpile into food. Best on terran planets. */
  function farmCandidates(run, f, s, fc, val, horizon) {
    const out = [];
    const waterSpare = fc.water.in - fc.water.out + Math.max(0, f.water - 20) / 12;
    let bestP = -1, bestBonus = 0, slot = -1;
    s.planets.forEach((p, pi) => { const fr = freeSlots(f, p); if (!fr.length) return; const bo = AS.FARM_PLANETS.indexOf(p.kind) >= 0 ? E.bonus : 1; if (bo > bestBonus || bestP < 0) { bestBonus = bo; bestP = pi; slot = fr[0]; } });
    if (bestP < 0) return out;
    for (const kind of ['greenhouse', 'livestock']) {
      const B = AS.BLD[kind];
      if (waterSpare < B.water * 0.8) continue;
      const gain = B.food * bestBonus * val.food - B.water * val.water - val.crew;
      out.push({ u: gain * Math.min(horizon, 24) / B.cost, cost: B.cost, sys: s.id, label: B.name + ' ON ' + s.planets[bestP].name, steps: [['newK', bestP, slot, kind]] });
    }
    return out;
  }
  /** Machinery upgrades that pay: busy gold mines, full processors, watered farms. */
  function upgradeCandidates(run, f, s, fl, fc, val, horizon) {
    const out = [];
    const blocked = {};
    s.planets.forEach(p => { for (const b of p.blds) { const st = fl.B[b.id]; if (st.role === 'ext' && st.dest !== undefined && st.potential > st.rate + 0.2 && /PROCESSOR FULL/.test(st.reason)) blocked[st.dest] = (blocked[st.dest] || 0) + st.potential - st.rate; } });
    s.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const st = fl.B[b.id], B = AS.BLD[b.kind];
        if ((b.lvl || 1) >= C.upgrade.max || !st.staffed || st.status !== 'ok') continue;
        const price = AS.upgPrice(b.kind, b.lvl || 1), step = C.upgrade.boost / S.lvlMult(b);
        let gain = 0, runs = horizon;
        if (B.role === 'ext' && !AS.RES[B.res].proc) { const d = p.deposits[b.drill.dep]; gain = st.rate * step * val.gold; runs = Math.min(horizon, d.amount / Math.max(0.1, st.rate * (1 + step))); }
        else if (B.role === 'proc' && blocked[b.id]) gain = Math.min(blocked[b.id], E.procCap * C.upgrade.boost) * B.yield * S.procBonus(p, b.kind) * val[AS.RES[B.res].out];
        else if (B.role === 'farm' && fc.water.in - fc.water.out > B.water * C.upgrade.boost) gain = st.potential * step * val.food - st.water * step * val.water;
        if (gain <= 0) continue;
        out.push({ u: gain * Math.min(runs, 24) / price * 0.9, cost: price, sys: s.id, label: 'UPGRADE ' + B.name + ' TO LV' + ((b.lvl || 1) + 1), steps: [['upgrade', pi, b.id]] });
      }
    });
    return out;
  }
  /** Extractors that are drilled but blocked: connect them (cheap, immediate payoff); clear dead weight. */
  function fixCandidates(run, f, s, fl) {
    const out = [];
    s.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const st0 = fl.B[b.id];
        const idleKey = s.id + ':' + b.id;
        if (!f.ai.idle) f.ai.idle = {};
        if (st0.status !== 'idle' && st0.status !== 'blocked') { delete f.ai.idle[idleKey]; continue; }
        if (f.ai.idle[idleKey] === undefined) f.ai.idle[idleKey] = run.t;
        if (st0.role === 'ext') {   // an extractor that nothing could fix for 2.5 minutes is taken down
          if (run.t - f.ai.idle[idleKey] > 150) out.push({ u: 1.1, cost: 0, sys: s.id, label: 'CLEAR STUCK ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        if (st0.role === 'proc' && run.t - f.ai.idle[idleKey] > 120 && !Object.keys(p.portIn).some(k => p.portIn[k].b === b.id))
          out.push({ u: 1.2, cost: 0, sys: s.id, label: 'CLEAR IDLE ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
      }
      for (const b of p.blds) {
        const st = fl.B[b.id];
        if (st.role !== 'ext' || !st.staffed) continue;
        const R = AS.RES[st.res];
        if (!b.drill) {
          const dep0 = p.deposits.filter(d => d.res === st.res && d.amount > 0).map(d => ({ d, dr: S.bestDrill(run, f, p, b.slot, d) })).filter(x => x.dr).sort((a, c) => a.dr.cost - c.dr.cost)[0];
          if (dep0 && (!R.proc || p.blds.some(x => x.kind === R.proc))) out.push({ u: 3, cost: dep0.dr.cost + AS.COSTS.conveyor, sys: s.id, label: 'DRILL ' + AS.BLD[b.kind].name, steps: [['drillB', pi, b.id, dep0.dr.path]], bld: b.id });
          else out.push({ u: 1.2, cost: 0, sys: s.id, label: 'CLEAR UNUSED ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        const dep = p.deposits[b.drill.dep];
        if (!dep || dep.amount <= 0) {   // empty: free the slot
          out.push({ u: freeSlots(f, p).length ? 1.1 : 1.5, cost: 0, sys: s.id, label: 'DEMOLISH EMPTY ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        if (!R.proc) continue;
        const q = p.blds.find(x => x.kind === R.proc && fl.B[x.id].staffed && E_CAP(x) - fl.B[x.id].input > 0.5 && !(b.out && b.out.b === x.id));
        if (b.out) {   // feeding a processor that is full: move the conveyor to one with room
          if (st.status === 'idle' && b.out.b !== undefined && q) out.push({ u: 4, cost: AS.COSTS.conveyor, sys: s.id, label: 'RECONNECT ' + AS.BLD[b.kind].name, steps: [['disconnect', pi, b.id], ['connectB', pi, q.id]], bld: b.id });
          else if (st.status === 'idle' && b.out.b !== undefined && freeSlots(f, p).length) {
            out.push({ u: 2.5, cost: AS.BLD[R.proc].cost + AS.COSTS.conveyor, sys: s.id, label: 'SECOND ' + AS.BLD[R.proc].name + ' FOR ' + AS.BLD[b.kind].name, steps: [['newK', pi, freeSlots(f, p)[0], R.proc], ['disconnect', pi, b.id], ['connectB', pi, 'Q']], bld: b.id });
          }
          continue;
        }
        if (q) out.push({ u: 6, cost: AS.COSTS.conveyor, sys: s.id, label: 'CONNECT ' + AS.BLD[b.kind].name, steps: [['connectB', pi, q.id]], bld: b.id });
      }
    });
    return out;
  }
  function runSteps(run, f, c) {
    if (!S.canPay(f, c.cost)) return false;
    const ref = {};
    // a chain is built whole or not at all: if a later step fails, take down what this chain put up
    const undo = () => { const s = run.systems[c.sys]; for (const [k, pk] of [['Q', 'Qpi'], ['E', 'Epi']]) if (ref[k] !== undefined && s.planets[ref[pk]] && S.bldById(s.planets[ref[pk]], ref[k])) S.act(run, f.id, 'demolish', { sys: c.sys, planet: ref[pk], bld: ref[k] }); return false; };
    const r = v => (typeof v === 'string' ? ref[v] : v);
    for (const st of c.steps) {
      let res;
      switch (st[0]) {
        case 'newExt': res = S.act(run, f.id, 'build', { sys: c.sys, planet: st[1], slot: st[2], kind: st[3] }); if (res.ok) { ref.E = res.bld.id; ref.Epi = st[1]; } break;
        case 'drill': res = S.act(run, f.id, 'drill', { sys: c.sys, planet: st[1], bld: r(st[2]), path: st[3] }); break;
        case 'drillB': res = S.act(run, f.id, 'drill', { sys: c.sys, planet: st[1], bld: st[2], path: st[3] }); break;
        case 'newProc': { const kind = AS.RES[AS.BLD[S.bldById(run.systems[c.sys].planets[ref.Epi], ref.E).kind].res].proc; res = S.act(run, f.id, 'build', { sys: c.sys, planet: st[1], slot: st[2], kind }); if (res.ok) { ref.Q = res.bld.id; ref.Qpi = st[1]; } break; }
        case 'newK': res = S.act(run, f.id, 'build', { sys: c.sys, planet: st[1], slot: st[2], kind: st[3] }); if (res.ok) { ref.Q = res.bld.id; ref.Qpi = st[1]; } break;
        case 'connectB': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { b: c.bld !== undefined && ref.E === undefined ? c.bld : ref.E }, to: { b: r(st[2]) } }); break;
        case 'pathway': res = S.act(run, f.id, 'pathway', { sys: c.sys, a: st[1], b: st[2] }); if (res.ok) ref.PW = res.pathway.id; break;
        case 'connectP': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { b: ref.E }, to: { p: r(st[2]) } }); break;
        case 'portIn': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { p: r(st[2]) }, to: { b: r(st[3]) } }); break;
        case 'disconnect': res = S.act(run, f.id, 'disconnect', { sys: c.sys, planet: st[1], from: { b: st[2] } }); break;
        case 'demolish': res = S.act(run, f.id, 'demolish', { sys: c.sys, planet: st[1], bld: st[2] }); break;
        case 'upgrade': res = S.act(run, f.id, 'upgrade', { sys: c.sys, planet: st[1], bld: st[2] }); break;
      }
      if (!res || !res.ok) return undo();
    }
    return true;
  }
  /** The market: gold is always sold; food, water and fuel are topped up before they run out. */
  function trade(run, f, fc) {
    if (f.gold >= 1) S.act(run, f.id, 'trade', { res: 'gold', qty: -Math.floor(f.gold) });
    const topUp = (res, cycles, cap) => {
      const need = Math.ceil(Math.max(0, -fc[res].net * cycles - f[res]));
      const can = Math.floor(Math.max(0, f.money - 40) * cap / S.price(run, res));
      const n = Math.min(need, can);
      if (n >= 1 && S.act(run, f.id, 'trade', { res, qty: n }).ok) note(f, run, 'BUY ' + n + ' ' + AS.STOCK[res].name, n / 10);
    };
    if (fc.food.net < 0 && f.food < -fc.food.net * 3) topUp('food', 5, 0.6);
    if (fc.fuel.net < 0 && (f.fuelEff < 1 || f.fuel < -fc.fuel.net * 3)) topUp('fuel', 5, 0.4);
    if (fc.farmWater > 0 && fc.water.net < 0 && f.water < -fc.water.net * 2) topUp('water', 3, 0.3);
    // surpluses nobody needs go to market
    const sellOver = (res, keep) => { const n = Math.floor(f[res] - keep); if (n >= 5) S.act(run, f.id, 'trade', { res, qty: -n }); };
    sellOver('food', 120 + Math.max(0, fc.food.out) * 12);
    sellOver('water', 60 + Math.max(0, fc.water.out) * 10);
    sellOver('fuel', 150 + Math.max(0, fc.fuel.out) * 15);
  }
  function economy(run, f, V, P, D, fc, budget) {
    trade(run, f, fc);
    budget = Math.min(budget, f.money - 30);
    const val = values(run, f, fc);
    const horizon = Math.min(36, Math.max(4, (C.game.length - run.t) / C.game.cycle));
    const opts = [];
    for (const s of V.own) {
      const fl = S.sysFlow(run, s);
      for (const c of fixCandidates(run, f, s, fl)) opts.push(Object.assign(c, { go: () => runSteps(run, f, c) }));
      for (const c of chainCandidates(run, f, s, fl, val, horizon).concat(farmCandidates(run, f, s, fc, val, horizon), upgradeCandidates(run, f, s, fl, fc, val, horizon))) {
        c.u *= P.econ * (1 + (D.pick || 0) * (run.rng() - 0.5));
        opts.push(Object.assign(c, { go: () => runSteps(run, f, c) }));
      }
    }
    opts.sort((a, b) => b.u - a.u);
    let n = 0;
    f.ai.saving = false;
    for (const o of opts) {
      if (n >= (D.acts || 3)) break;
      if (o.u < 1.0) break;
      if (o.cost > budget) { if (o.u >= 2 && !f.ai.saving) f.ai.saving = true; continue; }
      const before = f.money;
      if (o.go()) { n++; budget -= before - f.money; note(f, run, o.label, o.u); }
    }
    return budget;
  }

  /* ---------- military ---------- */
  function targetValue(run, f, x) {
    let v = 3 + (x.region === 'core' ? 5 : 0);
    for (const p of x.planets) { v += 1.2 + p.slots * 0.3; for (const d of p.deposits) v += d.amount > 30 ? (d.res === 'gold' ? 2.2 : 1.2) : 0; v += p.blds.length * 1.5; }
    if (x.capital >= 0 && x.capital === x.owner) v += 45;   // taking a capital eliminates the faction
    return v;
  }
  function strongestNeighbour(run, f, V) {
    const tot = {}, touching = {};
    for (const s of run.systems) if (s.owner >= 0 && s.owner !== f.id) tot[s.owner] = (tot[s.owner] || 0) + V.estimate(s);
    for (const s of V.own) for (const n of S.neighbours(run, s.id)) { const o = run.systems[n].owner; if (o >= 0 && o !== f.id) touching[o] = 1; }
    let best = -1, bv = -1;
    for (const o in touching) if (tot[o] > bv) { bv = tot[o]; best = +o; }
    return best;
  }
  function sourcesFor(run, f, V, x) {
    const adj = S.neighbours(run, x.id).map(n => run.systems[n]).filter(s => s.owner === f.id && S.laneOpen(run, S.laneBetween(run, s.id, x.id)));
    // in a coalition, own systems that can reach the leader through partners' territory strike too
    if (V.co && V.co.target === x.owner && f.id !== V.co.target) for (const s of V.own) {
      if (adj.indexOf(s) >= 0 || (V.excess[s.id] || 0) < 3 || run.hops[s.id][x.id] > 4) continue;
      const pth = S.path(run, s.id, x.id, f.id);
      if (pth && pth.length - 1 <= 4) adj.push(s);
    }
    return adj.sort((a, b) => (V.excess[b.id] || 0) - (V.excess[a.id] || 0));
  }
  function scoreTargets(run, f, V, P, D) {
    const out = [], co = V.co, inCo = co && co.target !== f.id;
    const strongest = strongestNeighbour(run, f, V);
    const tt = run.t / C.game.length, endgame = run.t >= C.game.endgame;
    const agg = P.aggr * (D.aggr || 1) * (0.65 + 0.9 * tt) * (endgame ? 1 + P.late : 1);
    const seen = {};
    for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
      const x = run.systems[n];
      if (x.owner === f.id || seen[n]) continue;
      seen[n] = 1;
      if (f.ai.cool[n] && run.t < f.ai.cool[n]) continue;
      if (x.owner >= 0 && S.truceBlocks(run, f.id, x.owner)) continue;    // coalition truce
      const def = S.sysPower(run, x);
      const avail = sourcesFor(run, f, V, x).slice(0, D.sources).reduce((a, q) => a + (V.excess[q.id] || 0), 0);
      let edge = P.edge + D.margin + (x.owner < 0 ? 0.05 : 0) - (endgame && P.late >= 0.8 ? 0.08 : 0);
      let w;
      if (x.owner < 0) w = P.neutral * (inCo ? 0.3 : 1);
      else {
        w = P.war * V.host(x.owner);
        const o = run.factions[x.owner];
        if (x.owner === strongest) w *= avail >= AI.required(def, edge + 0.2) ? P.strongest : 0.5;   // the strongest neighbour only with a clear edge
        if (run.t - o.lastDefeat < 60 || run.t - x.lastBattle < 35) w *= P.weak;
        if (f.ai.grudge[x.owner] !== undefined && run.t - f.ai.grudge[x.owner] < 120) w *= 0.6 + 0.4 * P.punish;
        if (inCo && x.owner === co.target) { w *= 4; edge -= 0.1; }
        w *= U.clamp((run.t - 280) / 150, 0.05, 1);
        if (x.owner === 0 && f.id !== 0) w *= D.focus;
        if (x.capital === x.owner && endgame) { w *= 5; edge -= 0.05; }
        if (inCo && x.owner === co.target && x.capital === x.owner) w *= 2.5;
      }
      const weakness = U.clamp(1 - def / (avail + 1), 0, 1);
      w *= 1 + (P.weak - 1) * 0.6 * weakness;
      edge = U.clamp(edge, 0.02, 1);
      const need = AI.required(def, edge);
      const score = agg * w * targetValue(run, f, x) / (1 + need / 60);
      out.push({ x, score, need, edge, def });
    }
    out.sort((a, b) => b.score - a.score);
    // Easy: sometimes take a worse target than the best one
    if (D.pick && out.length > 1 && run.rng() < D.pick) { const k = 1 + Math.floor(run.rng() * Math.min(4, out.length - 1)); const t = out[0]; out[0] = out[k]; out[k] = t; }
    return out;
  }
  function gatherable(run, f, V, stage, maxHops) {
    let g = 0;
    for (const s of V.own) {
      if (s.id === stage.id || V.excess[s.id] < 3 || run.hops[s.id][stage.id] > maxHops) continue;
      if (V.border[s.id] && V.threat[s.id] > 0 && V.deficit[s.id] > 0) continue;
      g += V.excess[s.id];
    }
    return g;
  }
  function sendFrom(run, f, from, to, power) {
    const gs = S.sysPower(run, from);
    if (gs <= 0 || power <= 0) return false;
    return S.act(run, f.id, 'move', { from: from.id, to: to.id, frac: U.clamp(power / gs, 0.05, 1) }).ok;
  }
  /** Buy about `power` worth of units at sys, within budget: cannons when fuel allows, else destroyers; ships fill the rest. */
  function buyPower(run, f, P, fc, sys, power, budget, why) {
    if (power < 1 || budget < AS.UNITS.ship.cost) return 0;
    const fuelOk = fc.fuel.net >= 0.3 || f.fuel > 40 + fc.fuel.out * 10;
    const big = fuelOk && P.heavy >= 0.6 ? 'cannon' : 'destroyer';
    let spent = 0;
    const want = Math.ceil(power);
    const nBig = Math.min(Math.floor(want / AS.UNITS[big].power), Math.floor(budget / S.unitCost(run, big)));
    if (nBig > 0 && S.act(run, f.id, 'units', { sys: sys.id, kind: big, n: Math.min(50, nBig) }).ok) spent += S.unitCost(run, big) * Math.min(50, nBig);
    const rest = Math.min(want - nBig * AS.UNITS[big].power, Math.floor((budget - spent) / S.unitCost(run, 'ship')));
    if (rest > 0 && S.act(run, f.id, 'units', { sys: sys.id, kind: 'ship', n: Math.min(50, rest) }).ok) spent += S.unitCost(run, 'ship') * Math.min(50, rest);
    if (spent) note(f, run, 'BUY ' + Math.round(power) + ' POWER AT ' + sys.name + (why ? ' (' + why + ')' : ''), power / 10);
    return spent;
  }
  function military(run, f, V, P, D, fc, budget) {
    const co = V.co;
    // reinforce exposed borders first: move spare power, then buy what is still missing
    const deficits = V.own.filter(s => V.deficit[s.id] > 0.5).sort((a, b) => V.deficit[b.id] * (b.capital === f.id ? 2 : 1) - V.deficit[a.id] * (a.capital === f.id ? 2 : 1));
    let moves = 0, exposed = 0;
    for (const d of deficits.slice(0, 2)) {
      let need = V.deficit[d.id];
      const donors = V.own.filter(s => s !== d && V.excess[s.id] >= 3 && run.hops[s.id][d.id] <= 3).sort((a, b) => run.hops[a.id][d.id] - run.hops[b.id][d.id] || V.excess[b.id] - V.excess[a.id]);
      for (const s of donors) {
        if (need <= 0 || moves >= 3) break;
        const amt = Math.min(V.excess[s.id], need * 1.1);
        if (amt < 2) continue;
        if (S.path(run, s.id, d.id, f.id) && sendFrom(run, f, s, d, amt)) { V.excess[s.id] -= amt; need -= amt; moves++; note(f, run, 'REINFORCE ' + d.name, V.deficit[d.id] / 10); }
      }
      if (need > 2) {
        const spend = buyPower(run, f, P, fc, d, need * 1.1, Math.max(0, budget) * (V.incoming[d.id] ? 0.95 : 0.6), 'DEFENCE');
        budget -= spend;
        if (spend) need = Math.max(0, need - spend / 11);
      }
      if (need > 4) exposed += need;
    }
    // buy neutral systems (peaceful, expensive)
    if (P.buy > 0.1) {
      let best = null, bu = 0;
      for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
        const x = run.systems[n];
        if (x.owner !== -1) continue;
        const price = S.buyPrice(run, f, x);
        const u = P.buy * targetValue(run, f, x) / (price / 55) * (run.t < C.game.protect ? 1.25 : 1);
        if (u > bu) { bu = u; best = [x, price]; }
      }
      if (best && bu >= 1 && budget >= best[1] + 40 && S.act(run, f.id, 'buy', { sys: best[0].id }).ok) { budget -= best[1]; note(f, run, 'BUY ' + best[0].name, bu); }
    }
    if (run.t < C.game.protect - 50) return budget;
    // attack plans: stage, mass, strike (coalition members strike the leader together on a shared clock)
    let pl = f.ai.plan;
    if (pl) {
      const x = run.systems[pl.target], st = run.systems[pl.stage];
      const vsCo = co && co.target === pl.owner && f.id !== co.target;
      const stale = run.t - pl.t0 > (vsCo ? 170 : 110);
      const truce = pl.owner >= 0 && S.truceBlocks(run, f.id, pl.owner);
      if (x.owner === f.id || x.owner !== pl.owner || st.owner !== f.id || stale || truce) {
        if (stale) f.ai.cool[pl.target] = run.t + 45;
        f.ai.plan = pl = null;
      }
    }
    const milBudget = Math.max(0, budget) * P.army * U.clamp(0.5 + 0.5 * (run.t - 120) / 360, 0.3, 1);
    if (!pl && exposed < 8 && run.t - f.ai.lastPlanAt > 4) {
      const cands = scoreTargets(run, f, V, P, D);
      for (const c of cands.slice(0, 4)) {
        if (c.score < 1.2) break;
        const src = sourcesFor(run, f, V, c.x);
        if (!src.length) continue;
        const stage = src[0];
        const vsCo = co && c.x.owner === co.target && f.id !== co.target;
        const now = src.slice(0, D.sources + (vsCo ? 2 : 0)).reduce((a, s) => a + (V.excess[s.id] || 0), 0);
        const reach = now + gatherable(run, f, V, stage, vsCo ? 8 : 3) * 0.8 + milBudget / 11;   // a coalition pools everything it has toward the leader
        if (reach < c.need * 0.95) continue;
        pl = f.ai.plan = { target: c.x.id, owner: c.x.owner, stage: stage.id, need: Math.round(c.need), edge: c.edge, t0: Math.round(run.t), readyAt: 0, have: Math.round(now) };
        f.ai.lastPlanAt = run.t;
        note(f, run, 'PLAN ATTACK ' + c.x.name + ' FROM ' + stage.name + (vsCo ? ' (COALITION)' : ''), c.score);
        break;
      }
    }
    if (pl) {
      const x = run.systems[pl.target], stage = run.systems[pl.stage];
      const vsCo = co && co.target === x.owner && f.id !== co.target;
      pl.need = Math.round(AI.required(S.sysPower(run, x), pl.edge));
      const src = sourcesFor(run, f, V, x).slice(0, D.sources + (vsCo ? 2 : 0));
      if (src.indexOf(stage) < 0 && stage.owner === f.id) src.unshift(stage);
      let avail = src.reduce((a, s) => a + (V.excess[s.id] || 0), 0);
      if (avail < pl.need && run.t >= C.game.protect - 20) {   // top the staging system up from the shop
        const spend = buyPower(run, f, P, fc, stage, pl.need - avail + 1, milBudget, 'FOR ' + x.name);
        budget -= spend;
        if (spend) { V.excess[stage.id] = Math.max(0, S.sysPower(run, stage) - V.keep[stage.id]); avail = src.reduce((a, s) => a + (V.excess[s.id] || 0), 0); }
      }
      pl.have = Math.round(avail);
      if (avail >= pl.need && run.t >= C.game.protect) {
        const hold = x.owner < 0 ? 0 : P.hold * (D.think > 5 ? 1.4 : D.think < 3 ? 0.7 : 1);
        if (!pl.readyAt) pl.readyAt = run.t;
        const clock = !vsCo || run.t - co.strike < 20;    // coalition: wait for the shared strike
        if (run.t - pl.readyAt >= hold && clock) {
          let sent = 0;
          for (const s of src) { const amt = V.excess[s.id] || 0; if (amt >= 1 && sendFrom(run, f, s, x, amt)) sent += amt; }
          if (sent > 0) { f.ai.cool[pl.target] = run.t + 25; f.ai.plan = null; note(f, run, 'STRIKE ' + x.name + ' WITH ' + Math.round(sent) + ' (NEED ' + pl.need + ')', sent / Math.max(1, pl.need)); if (vsCo) run.stats.coalitionStrikes = (run.stats.coalitionStrikes || 0) + 1; }
        }
      } else {
        pl.readyAt = 0;
        const donors = V.own.filter(s => s !== stage && V.excess[s.id] >= 3 && run.hops[s.id][stage.id] <= (vsCo ? 8 : 3) && !(V.border[s.id] && V.deficit[s.id] > 0))
          .sort((a, b) => run.hops[a.id][stage.id] - run.hops[b.id][stage.id]);
        for (const s of donors) {
          if (moves >= 4) break;
          if (run.armies.some(a => a.owner === f.id && a.dest === stage.id && a.path[0] === s.id) || src.indexOf(s) >= 0) continue;
          if (S.path(run, s.id, stage.id, f.id) && sendFrom(run, f, s, stage, V.excess[s.id])) moves++;
        }
      }
    } else {
      // no plan: keep a standing guard on the most threatened border, sized to the threat; money piling up goes to the border too
      const rich = Math.max(0, f.money - 900) * P.army * 0.5;
      if (rich > 100 && run.t >= C.game.protect - 30) { const at = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id])[0] || run.systems[f.capital]; if (at && at.owner === f.id) budget -= buyPower(run, f, P, fc, at, rich / 11, rich, 'SURPLUS'); }
      const bord = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id])[0];
      if (bord && V.threat[bord.id] > 0) budget -= buyPower(run, f, P, fc, bord, Math.max(0, V.threat[bord.id] * P.safety * 0.6 - S.sysPower(run, bord)), milBudget * 0.5, 'GUARD');
      const borders = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id]);
      if (borders.length) for (const s of V.own) {
        if (moves >= 2) break;
        if (V.border[s.id] || V.excess[s.id] < 6) continue;
        if (S.path(run, s.id, borders[0].id, f.id) && sendFrom(run, f, s, borders[0], V.excess[s.id])) moves++;
      }
    }
    return budget;
  }

  /* ---------- the think ---------- */
  AI.think = function (run, f) {
    const { P, D } = AI.params(run, f);
    f.ai.next = run.t + D.think * (0.85 + 0.3 * run.rng());
    f.ai.thinks++;
    const V = perceive(run, f, P, D);
    const fc = S.forecast(run, f);
    let budget = f.money - 40;
    const exposedNow = V.own.some(s => V.deficit[s.id] > 6);
    if (exposedNow) { budget = military(run, f, V, P, D, fc, budget); economy(run, f, V, P, D, S.forecast(run, f), budget); }
    else {
      // from 3:00 part of the money is kept back for the military, so nobody stands unarmed when attacks open
      const keep = run.t > C.game.protect - 60 ? Math.max(0, budget) * P.army * 0.6 : 0;
      budget = economy(run, f, V, P, D, fc, budget - keep) + keep;
      military(run, f, V, P, D, S.forecast(run, f), budget);
    }
  };
})(globalThis.AS = globalThis.AS || {});
