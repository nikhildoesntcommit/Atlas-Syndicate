/* ATLAS SYNDICATE v6 — sim/ai/brain.js
   The shared decision system every rival uses (and the AI that plays your slot in ?demo / F9 / tests).

   Every few seconds a faction:
     1. perceives the map through its own fog of war (exact numbers only where it can see),
     2. scores its options with one formula per option type, weighted by its personality:
          repair / build a chain on a planet / upgrade / recruit / buy / attack X / reinforce Y / retreat / save,
     3. runs the best affordable options through S.act(), the same entry point the player uses.

   Economy: utility = value of what a planet chain produces per cycle x the cycles it will run, divided by
   what it costs. Chains are built exactly as a player builds them: place an extractor, drill the cheapest
   path around barriers, place a processor (here, or on another planet through a pathway and its ports
   when slots run out), connect. Resource values rise as stocks of alloy, fuel or food run short.

   Military: reinforce exposed borders first; stage an attack, hold massed, then strike when the odds meet
   the personality's threshold; retreat from fights that turn. Coalitions: when someone holds 35% of the
   galaxy, everybody else ignores each other and strikes the leader together on a shared clock. From
   18:00 rival capitals become the priority. Each faction thinks on its own staggered timer. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;
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
  const BAND = { S: 8, M: 26, L: 55 };
  const needCache = new Map();
  AI.required = function (def, thr, mode) {
    const key = Math.round(def) + '|' + Math.round(thr * 100) + '|' + mode;
    if (needCache.has(key)) return needCache.get(key);
    let lo = 0, hi = Math.max(4, def * 4 + 10);
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (S.oddsRaw(mid, def, mode).p >= thr) hi = mid; else lo = mid; }
    if (needCache.size > 5000) needCache.clear();
    needCache.set(key, hi);
    return hi;
  };

  /* ---------- perception ---------- */
  function perceive(run, f, P, D) {
    const vis = S.visibility(run, f.id), co = run.coalition;
    const V = { vis, co, own: [], threat: {}, deficit: {}, keep: {}, excess: {}, border: {}, incoming: {} };
    for (const b of run.battles) if (run.systems[b.sys].owner === f.id) f.ai.grudge[b.att.owner] = run.t;
    for (const a of run.armies) if (a.owner !== f.id && a.mode !== 'move' && a.mode !== 'return' && run.systems[a.dest].owner === f.id && S.armyVisible(run, f.id, a)) {
      V.incoming[a.dest] = (V.incoming[a.dest] || 0) + S.stackStrength(run, a);
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
    V.estimate = s => (vis[s.id] ? S.garStrength(run, s) : BAND[S.sizeBand(S.garStrength(run, s))]);
    const own = V.own = run.systems.filter(s => s.owner === f.id);
    const ownIn = {};
    for (const a of run.armies) if (a.owner === f.id && a.mode === 'move') ownIn[a.dest] = (ownIn[a.dest] || 0) + S.stackStrength(run, a);
    const safety = P.safety * D.react * (co && co.target === f.id ? 1.3 : 1);
    for (const s of own) {
      let t = 0, border = false;
      for (const n of S.neighbours(run, s.id)) {
        const o = run.systems[n];
        if (o.owner === f.id) continue;
        border = true;
        if (o.owner >= 0) t += V.host(o.owner) * V.estimate(o) * (vis[o.id] ? 1 : 0.7);
      }
      t += (V.incoming[s.id] || 0) * 1.3;
      const b = s.battle && run.battles.find(x => x.id === s.battle);
      if (b && b.att.owner !== f.id) t += S.stackStrength(run, b.att) * 1.2;
      V.threat[s.id] = t;
      V.border[s.id] = border;
      const def = S.defStrength(run, s) + (ownIn[s.id] || 0) * 1.1;
      const want = t * safety * (s.capital === f.id ? 1.25 : 1);
      V.deficit[s.id] = Math.max(0, want - def);
      V.keep[s.id] = Math.max(P.minGar, want * 0.9 / Math.max(0.5, f.mods.defBonus * f.mods.def));
      V.excess[s.id] = s.battle ? 0 : Math.max(0, S.garStrength(run, s) - V.keep[s.id]);
    }
    return V;
  }

  /* ---------- retreat ---------- */
  function checkRetreats(run, f, P) {
    for (const b of run.battles.slice()) {
      if (b.att.owner !== f.id || b.rounds < 1) continue;
      const r = S.oddsRaw(S.stackStrength(run, b.att), S.defStrength(run, run.systems[b.sys]), b.att.mode);
      if (r.p < P.retreat && S.act(run, f.id, 'retreat', { battle: b.id }).ok) note(f, run, 'RETREAT FROM ' + run.systems[b.sys].name + ' (ODDS ' + Math.round(r.p * 100) + '%)', 1 - r.p);
    }
  }

  /* ---------- economy: what each stock is worth to this faction right now ---------- */
  function values(run, f, fc) {
    const urg = (have, use, floor) => U.clamp((use * 14 + floor - have) / (use * 14 + floor), 0, 1);
    return {
      credits: 1 + 2.0 * urg(f.credits, Math.max(4, fc.credits.out), 200) + (fc.credits.net < 8 ? 0.8 : 0),
      alloy: 3 * (0.25 + 1.6 * urg(f.alloy, 3, 90)),
      fuel: 2.4 * (0.5 + 2.0 * urg(f.fuel, Math.max(1, fc.fuel.out), 50)),
      food: 3.0 * (0.4 + 2.2 * urg(f.food, Math.max(0.5, fc.food.out), 30) + (fc.food.net < 0 ? 0.8 : 0)),
    };
  }
  const freeSlots = (f, p) => { const n = S.slotCount(p, f), used = new Set(p.blds.map(b => b.slot)); const out = []; for (let i = 0; i < n; i++) if (!used.has(i)) out.push(i); return out; };
  const tapped = (p, dep) => p.blds.some(b => b.drill && b.drill.dep === dep.id);
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
        const rate = Math.min(dep.amount, S.extRate(f, dep) * fl.popMult);
        const runs = Math.min(horizon, dep.amount / Math.max(0.1, rate));
        const unit = r => S.convert(run, f, dep.res, r) * val[R.out];
        const base = [AS.BLD[ext].cost[0] + best.cost + AS.COSTS.conveyor[0], AS.BLD[ext].cost[1]];
        const opts = [];
        // (a) an existing processor of this resource on the same planet with room
        for (const q of p.blds) if (q.kind === proc && q.dur > 0) {
          const spare = E_CAP(f) - fl.B[q.id].input;
          if (spare > 0.5) opts.push({ gain: unit(Math.min(rate, spare)) * S.procBonus(p, proc) * (fl.B[q.id].input <= 1e-9 ? 1.6 : 1), cost: base.slice(), steps: [['connectB', pi, q.id]], where: p.name });
        }
        // (b) a new processor in another free slot here
        const other = free.filter(x => x !== best.slot);
        if (other.length) opts.push({ gain: unit(Math.min(rate, E_CAP(f))) * S.procBonus(p, proc), cost: [base[0] + AS.BLD[proc].cost[0], base[1] + AS.BLD[proc].cost[1]], steps: [['newProc', pi, other[0]], ['connectB', pi, 'Q']], where: p.name });
        // (c) through a pathway to another planet that has room (existing pathway, or a new one)
        s.planets.forEach((q, qi) => {
          if (qi === pi) return;
          const pw = s.pathways.find(x => (x.a === pi && x.b === qi) || (x.a === qi && x.b === pi));
          if (!pw && s.pathways.length >= S.pathwaySlots(run, s)) return;
          const pathCost = pw ? [0, 0] : AS.COSTS.pathway.slice();
          const link = pw ? q.portIn[pw.id] : null;
          const used = pw && fl.P[pw.id] ? fl.P[pw.id][pw.a === pi ? 'ab' : 'ba'] : 0;
          const pathRoom = C.econ.pathCap * f.mods.path - used;
          if (pathRoom < 1) return;
          if (link) {
            const lq = S.bldById(q, link.b);
            if (!lq || lq.kind !== proc || lq.dur <= 0) return;
            const spare = E_CAP(f) - fl.B[lq.id].input;
            if (spare < 1) return;
            opts.push({ gain: unit(Math.min(rate, spare, pathRoom)) * S.procBonus(q, proc), cost: base.slice(), steps: [['connectP', pi, pw.id]], where: q.name, port: true });
            return;
          }
          // a processor already there with room, or a new one in a free slot
          const qFree = freeSlots(f, q);
          const existing = q.blds.find(b => b.kind === proc && b.dur > 0 && E_CAP(f) - fl.B[b.id].input > 1);
          const qc = existing ? [AS.COSTS.conveyor[0], 0] : qFree.length ? [AS.BLD[proc].cost[0] + AS.COSTS.conveyor[0], AS.BLD[proc].cost[1]] : null;
          if (!qc) return;
          const steps = [];
          if (!pw) steps.push(['pathway', pi, qi]);
          if (!existing) steps.push(['newProc', qi, qFree[0]]);
          steps.push(['connectP', pi, pw ? pw.id : 'PW'], ['portIn', qi, pw ? pw.id : 'PW', existing ? existing.id : 'Q']);
          opts.push({ gain: unit(Math.min(rate, E_CAP(f), pathRoom)) * S.procBonus(q, proc), cost: [base[0] + qc[0] + pathCost[0], base[1] + qc[1] + pathCost[1]], steps, where: q.name, port: true });
        });
        for (const o of opts) {
          o.steps.unshift(['newExt', pi, best.slot, ext], ['drill', pi, 'E', best.path]);
          o.u = o.gain * runs / (o.cost[0] + o.cost[1] * 2);
          o.sys = s.id; o.label = AS.BLD[ext].name + (o.port ? ' > PORT > ' : ' > ') + AS.BLD[proc].name + ' ON ' + o.where;
          out.push(o);
        }
      }
    });
    return out;
  }
  const E_CAP = f => C.econ.procCap * f.mods.procCap;
  /** Extractors that are drilled but blocked: connect them (cheap, immediate payoff). */
  function fixCandidates(run, f, s, fl, val) {
    const out = [];
    s.planets.forEach((p, pi) => {
      for (const b of p.blds) {
        const st0 = fl.B[b.id];
        // a processor that has had nothing to do for two minutes gives its slot back
        const idleKey = s.id + ':' + b.id;
        if (!f.ai.idle) f.ai.idle = {};
        if ((st0.status !== 'idle' && st0.status !== 'blocked') || b.dur <= 0) { delete f.ai.idle[idleKey]; continue; }
        if (f.ai.idle[idleKey] === undefined) f.ai.idle[idleKey] = run.t;
        if (st0.role === 'ext') {   // an extractor that nothing could fix for 2.5 minutes is taken down
          if (run.t - f.ai.idle[idleKey] > 150) out.push({ u: 1.1, cost: [0, 0], sys: s.id, label: 'CLEAR STUCK ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        if (run.t - f.ai.idle[idleKey] > 120 && !Object.keys(p.portIn).some(k => p.portIn[k].b === b.id))
          out.push({ u: 1.2, cost: [0, 0], sys: s.id, label: 'CLEAR IDLE ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
      }
      for (const b of p.blds) {
        const st = fl.B[b.id];
        if (st.role === 'ext' && !b.drill && b.dur > 0) {
          const R0 = AS.RES[st.res];
          const dep0 = p.deposits.filter(d => d.res === st.res && d.amount > 0).map(d => ({ d, dr: S.bestDrill(run, f, p, b.slot, d) })).filter(x => x.dr).sort((a, c) => a.dr.cost - c.dr.cost)[0];
          if (dep0 && p.blds.some(x => x.kind === R0.proc && x.dur > 0)) out.push({ u: 3, cost: [dep0.dr.cost + AS.COSTS.conveyor[0], 0], sys: s.id, label: 'DRILL ' + AS.BLD[b.kind].name, steps: [['drillB', pi, b.id, dep0.dr.path]], bld: b.id });
          else out.push({ u: 1.2, cost: [0, 0], sys: s.id, label: 'CLEAR UNUSED ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        if (st.role !== 'ext' || !b.drill || b.dur <= 0) continue;
        const R = AS.RES[st.res], dep = p.deposits[b.drill.dep];
        if (!dep || dep.amount <= 0) {   // empty: free the slot if it is needed
          if (!freeSlots(f, p).length) out.push({ u: 1.5, cost: [0, 0], sys: s.id, label: 'DEMOLISH EMPTY ' + AS.BLD[b.kind].name, steps: [['demolish', pi, b.id]] });
          continue;
        }
        const q = p.blds.find(x => x.kind === R.proc && x.dur > 0 && E_CAP(f) - fl.B[x.id].input > 0.5 && !(b.out && b.out.b === x.id));
        if (b.out) {   // feeding a processor that is full: move the conveyor to one with room
          if (st.status === 'idle' && b.out.b !== undefined && q) out.push({ u: 4, cost: [AS.COSTS.conveyor[0], 0], sys: s.id, label: 'RECONNECT ' + AS.BLD[b.kind].name, steps: [['disconnect', pi, b.id], ['connectB', pi, q.id]], bld: b.id });
          else if (st.status === 'idle' && b.out.b !== undefined && freeSlots(f, p).length) {
            const pc = AS.BLD[R.proc].cost;
            out.push({ u: 2.5, cost: [pc[0] + AS.COSTS.conveyor[0], pc[1]], sys: s.id, label: 'SECOND ' + AS.BLD[R.proc].name + ' FOR ' + AS.BLD[b.kind].name, steps: [['newProcK', pi, freeSlots(f, p)[0], R.proc], ['disconnect', pi, b.id], ['connectB', pi, 'Q']], bld: b.id });
          }
          continue;
        }
        if (q) out.push({ u: 6, cost: [AS.COSTS.conveyor[0], 0], sys: s.id, label: 'CONNECT ' + AS.BLD[b.kind].name, steps: [['connectB', pi, q.id]], bld: b.id });
        void val;
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
        case 'newProc': { const p = run.systems[c.sys].planets[st[1]]; const kind = AS.RES[AS.BLD[S.bldById(run.systems[c.sys].planets[ref.Epi], ref.E).kind].res].proc; res = S.act(run, f.id, 'build', { sys: c.sys, planet: st[1], slot: st[2], kind }); if (res.ok) { ref.Q = res.bld.id; ref.Qpi = st[1]; } void p; break; }
        case 'connectB': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { b: c.bld !== undefined && ref.E === undefined ? c.bld : ref.E }, to: { b: r(st[2]) } }); break;
        case 'pathway': res = S.act(run, f.id, 'pathway', { sys: c.sys, a: st[1], b: st[2] }); if (res.ok) ref.PW = res.pathway.id; break;
        case 'connectP': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { b: ref.E }, to: { p: r(st[2]) } }); break;
        case 'portIn': res = S.act(run, f.id, 'connect', { sys: c.sys, planet: st[1], from: { p: r(st[2]) }, to: { b: r(st[3]) } }); break;
        case 'newProcK': res = S.act(run, f.id, 'build', { sys: c.sys, planet: st[1], slot: st[2], kind: st[3] }); if (res.ok) { ref.Q = res.bld.id; ref.Qpi = st[1]; } break;
        case 'disconnect': res = S.act(run, f.id, 'disconnect', { sys: c.sys, planet: st[1], from: { b: st[2] } }); break;
        case 'demolish': res = S.act(run, f.id, 'demolish', { sys: c.sys, planet: st[1], bld: st[2] }); break;
      }
      if (!res || !res.ok) return undo();
    }
    return true;
  }
  function economy(run, f, V, P, D, fc, budget) {
    const val = values(run, f, fc);
    const horizon = Math.min(36, Math.max(4, (C.game.length - run.t) / C.game.cycle));
    let alloyBudget = f.alloy - 12;
    const opts = [];
    // repairs: broken things first, then whatever is below the difficulty's threshold
    for (const s of V.own) for (const rp of S.repairList(run, s)) {
      if (rp.dur >= D.repairAt && rp.dur > 0) continue;
      const imp = { bld: 2, drill: 1.6, conv: 1.6, portconv: 1.6, pathway: 1.8, plat: V.threat[s.id] > 0 ? 1.5 : 0.4, ships: 0.8 }[rp.kind] || 1;
      opts.push({ u: (rp.dur <= 0 ? 4 : 1.5) * imp, cost: rp.cost, label: 'REPAIR ' + rp.kind.toUpperCase() + ' IN ' + s.name, go: () => S.act(run, f.id, 'repair', { sys: s.id, kind: rp.kind, planet: rp.pi, id: rp.id }).ok });
    }
    for (const s of V.own) {
      if (s.battle) continue;
      const fl = S.sysFlow(run, s);
      for (const c of fixCandidates(run, f, s, fl, val)) opts.push(Object.assign(c, { go: () => runSteps(run, f, c) }));
      for (const c of chainCandidates(run, f, s, fl, val, horizon)) {
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
      if (o.cost[0] > budget || o.cost[1] > alloyBudget) { if (o.u >= 2 && !f.ai.saving) f.ai.saving = true; continue; }
      const before = [f.credits, f.alloy];
      if (o.go()) { n++; budget -= before[0] - f.credits; alloyBudget -= before[1] - f.alloy; note(f, run, o.label, o.u); }
    }
    // the shop: the track this personality likes best that it can comfortably afford
    let best = null, bu = 0;
    for (const t of AS.UPG_TRACKS) {
      const nx = S.upgradeNext(f, t);
      if (!nx) continue;
      const u = (P.tracks[t] || 1) * (budget - nx.price[0]) / (nx.price[0] + 1);
      if (budget > nx.price[0] * 1.5 + 80 && alloyBudget > nx.price[1] + 25 && u > bu) { bu = u; best = [t, nx]; }
    }
    if (best && run.t > 200 && S.act(run, f.id, 'upgrade', { track: best[0] }).ok) { budget -= best[1].price[0]; note(f, run, 'UPGRADE ' + best[1].item.name, bu); }
    return budget;
  }

  /* ---------- military ---------- */
  function maxSoldiers(run, f, P, fc) {
    const tt = run.t / C.game.length;
    const phase = U.clamp(0.5 + 0.5 * (run.t - 120) / 480, 0.5, 1);
    let allowed = Math.max(0, fc.credits.in) * P.army * phase * (0.85 + 0.3 * tt) + Math.max(0, f.credits - 350) / 30;
    if (f.ai.saving) allowed *= 0.7;
    let n = 0;
    while (n < 600 && S.salaryFor(run, f, n + 5) <= allowed) n += 5;
    // rations: do not field more soldiers than the food supply can feed for long
    const foodPer = C.army.rations * f.mods.rations;
    const byFood = (fc.food.in - (fc.food.out - S.rations(run, f, S.soldiers(run, f.id))) + Math.max(0, f.food - 25) / 18) / foodPer;
    return Math.max(0, Math.min(n, Math.floor(byFood)));
  }
  function queued(run, f) { let q = 0; for (const s of run.systems) if (s.owner === f.id) q += s.train.q; return q; }
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
    const adj = S.neighbours(run, x.id).map(n => run.systems[n]).filter(s => s.owner === f.id && !s.battle && S.laneOpen(run, S.laneBetween(run, s.id, x.id)));
    // in a coalition, own systems that can reach the leader through partners' territory strike too
    if (V.co && V.co.target === x.owner && f.id !== V.co.target) for (const s of V.own) {
      if (adj.indexOf(s) >= 0 || s.battle || (V.excess[s.id] || 0) < 3 || run.hops[s.id][x.id] > 4) continue;
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
    const m = f.mods.attack, seen = {};
    for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
      const x = run.systems[n];
      if (x.owner === f.id || seen[n] || x.battle) continue;
      seen[n] = 1;
      if (f.ai.cool[n] && run.t < f.ai.cool[n]) continue;
      if (x.owner >= 0 && S.truceBlocks(run, f.id, x.owner)) continue;    // coalition truce
      const def = S.defStrength(run, x);
      const avail = sourcesFor(run, f, V, x).slice(0, D.sources).reduce((a, q) => a + (V.excess[q.id] || 0) * m, 0);
      let thr = P.odds + D.odds + (x.owner < 0 ? 0.04 : 0) - (f.ai.overArmed ? 0.08 : 0) - (endgame && P.late >= 0.8 ? 0.08 : 0);
      let w;
      if (x.owner < 0) w = P.neutral * (inCo ? 0.3 : 1);
      else {
        w = P.war * V.host(x.owner);
        const o = run.factions[x.owner];
        if (x.owner === strongest) {
          // the strongest neighbour only when the odds are clearly good; otherwise build up on weaker ones
          const pNow = S.oddsRaw(avail, def, 'attack').p;
          w *= pNow >= thr + 0.1 ? P.strongest : 0.5;
        }
        if (run.t - o.lastDefeat < 60 || run.t - x.lastBattle < 35) w *= P.weak;
        if (f.ai.grudge[x.owner] !== undefined && run.t - f.ai.grudge[x.owner] < 120) w *= 0.6 + 0.4 * P.punish;
        if (inCo && x.owner === co.target) { w *= 4; thr -= 0.15; }
        w *= U.clamp((run.t - 280) / 150, 0.05, 1);
        if (x.owner === 0 && f.id !== 0) w *= D.focus;
        if (x.capital === x.owner && endgame) { w *= 5; thr -= 0.08; }
        if (inCo && x.owner === co.target && x.capital === x.owner) w *= 2.5;
      }
      const weakness = U.clamp(1 - def / (avail + 1), 0, 1);
      w *= 1 + (P.weak - 1) * 0.6 * weakness;
      let mode = 'attack';
      if (x.owner >= 0 && P.raid > 0 && x.capital !== x.owner && run.rng() < P.raid) mode = 'raid';
      thr = U.clamp(thr, 0.45, 0.95);
      const need = AI.required(def, thr, mode);
      const value = mode === 'raid' ? 6 + x.planets.reduce((a, p) => a + p.blds.length * 3, 0) : targetValue(run, f, x);
      const score = agg * w * value / (1 + need / 35);
      out.push({ x, score, need, thr, mode, def });
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
  function sendFrom(run, f, from, to, strength, mode) {
    const gs = S.garStrength(run, from);
    if (gs <= 0 || strength <= 0) return false;
    return S.act(run, f.id, 'move', { from: from.id, to: to.id, frac: U.clamp(strength / gs, 0.05, 1), mode }).ok;
  }
  function military(run, f, V, P, D, fc, budget) {
    f.ai.overArmed = fc.salary > fc.credits.in * 0.95;
    const m = f.mods.attack, co = V.co;
    // reinforce exposed borders first (threat assessment)
    const deficits = V.own.filter(s => V.deficit[s.id] > 0.5).sort((a, b) => V.deficit[b.id] * (b.capital === f.id ? 2 : 1) - V.deficit[a.id] * (a.capital === f.id ? 2 : 1));
    let moves = 0, exposed = 0;
    for (const d of deficits.slice(0, 2)) {
      let need = V.deficit[d.id] / Math.max(0.5, f.mods.defBonus * f.mods.def);
      const donors = V.own.filter(s => s !== d && V.excess[s.id] >= 3 && !s.battle && run.hops[s.id][d.id] <= 3).sort((a, b) => run.hops[a.id][d.id] - run.hops[b.id][d.id] || V.excess[b.id] - V.excess[a.id]);
      for (const s of donors) {
        if (need <= 0 || moves >= 3) break;
        const amt = Math.min(V.excess[s.id], need * 1.1);
        if (amt < 2) continue;
        if (S.path(run, s.id, d.id, f.id) && sendFrom(run, f, s, d, amt, 'move')) { V.excess[s.id] -= amt; need -= amt; moves++; note(f, run, 'REINFORCE ' + d.name, V.deficit[d.id] / 10); }
      }
      if (need > 4) exposed += need;
    }
    // recruit: what salaries and rations allow
    const cap = maxSoldiers(run, f, P, fc);
    let room = Math.floor(cap - S.soldiers(run, f.id) - queued(run, f));
    if (fc.credits.net < 0 && f.credits < 150) room = Math.min(room, 0);
    if (fc.credits.net < 0 && f.credits < -fc.credits.net * 4) for (const s of V.own) if (s.train.q > 0) S.act(run, f.id, 'cancel', { sys: s.id });
    const plan = f.ai.plan;
    if (room >= 3) {
      const where = V.own.filter(s => s.train.q < C.army.maxQueue - 4)
        .map(s => ({ s, w: V.deficit[s.id] * 2 + (plan && plan.stage === s.id ? 30 : 0) + (s.capital === f.id ? 6 : 0) + (V.border[s.id] ? 4 + V.threat[s.id] * 0.2 : 0) }))
        .sort((a, b) => b.w - a.w);
      for (const { s } of where.slice(0, 3)) {
        if (room < 3) break;
        const n = Math.min(C.army.batch, room);
        if (budget < C.army.recruitCost * n) break;
        if (S.act(run, f.id, 'recruit', { sys: s.id, n }).ok) { room -= n; budget -= C.army.recruitCost * n; note(f, run, 'RECRUIT ' + n + ' AT ' + s.name, room / 10 + 1); }
      }
    }
    // platforms at chokepoints and the capital; warships when salaries are maxed and fuel allows
    const salaryCapped = room < 3;
    for (const s of V.own) {
      const pc = C.equip.platCost;
      if (budget < pc[0] || f.alloy < pc[1] + 20) break;
      const want = (s.capital === f.id ? 1 : 0) + (V.border[s.id] ? s.choke * 3 : 0) + (V.deficit[s.id] > 0 ? 1 : 0) + (co && co.target === f.id ? 1 : 0);
      const u = P.plat * want / (1 + s.plat.n * 1.2) * (salaryCapped ? 1.3 : 0.8);
      if (u >= 1 && s.plat.n < C.equip.maxPlatforms && run.t > 60 && S.act(run, f.id, 'plat', { sys: s.id }).ok) { budget -= pc[0]; note(f, run, 'PLATFORM AT ' + s.name, u); }
    }
    if ((salaryCapped || budget > 300) && budget > C.equip.shipCost[0] * 1.5 && f.alloy > C.equip.shipCost[1] + 30 && f.fuel > 25 && !f.ai.saving) {
      const bord = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id])[0];
      const st = plan ? run.systems[plan.stage] : deficits[0] || bord;
      const u = Math.max(0.5, P.ship) * (plan ? 1.3 : 0.9) * (budget / 300);
      if (st && st.owner === f.id && u >= 1 && S.act(run, f.id, 'ship', { sys: st.id }).ok) { budget -= C.equip.shipCost[0]; note(f, run, 'WARSHIP AT ' + st.name, u); }
    }
    // buy neutral systems (peaceful, expensive)
    if (P.buy > 0.1) {
      let best = null, bu = 0;
      for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
        const x = run.systems[n];
        if (x.owner !== -1 || x.battle) continue;
        const price = S.buyPrice(run, f, x);
        const u = P.buy * targetValue(run, f, x) / (price / 55) * (run.t < C.game.protect ? 1.25 : 1);
        if (u > bu) { bu = u; best = [x, price]; }
      }
      if (best && bu >= 1 && budget >= best[1] + 40 && S.act(run, f.id, 'buy', { sys: best[0].id }).ok) { budget -= best[1]; note(f, run, 'BUY ' + best[0].name, bu); }
    }
    if (run.t < C.game.protect) return budget;
    // attack plans: stage, mass, strike (coalition members strike the leader together on a shared clock)
    let pl = f.ai.plan;
    if (pl) {
      const x = run.systems[pl.target], st = run.systems[pl.stage];
      const vsCo = co && co.target === pl.owner && f.id !== co.target;
      const stale = run.t - pl.t0 > (vsCo ? 170 : 110);
      const truce = pl.owner >= 0 && S.truceBlocks(run, f.id, pl.owner);
      if (x.owner === f.id || x.owner !== pl.owner || st.owner !== f.id || stale || truce || (x.battle && !run.battles.some(b => b.id === x.battle && b.att.owner === f.id))) {
        if (stale) f.ai.cool[pl.target] = run.t + 45;
        f.ai.plan = pl = null;
      }
    }
    if (!pl && exposed < 8 && run.t - f.ai.lastPlanAt > 4) {
      const cands = scoreTargets(run, f, V, P, D);
      for (const c of cands.slice(0, 4)) {
        if (c.score < 1.2) break;
        const src = sourcesFor(run, f, V, c.x);
        if (!src.length) continue;
        const stage = src[0];
        const vsCo = co && c.x.owner === co.target && f.id !== co.target;
        const now = src.slice(0, D.sources + (vsCo ? 2 : 0)).reduce((a, s) => a + (V.excess[s.id] || 0) * m, 0);
        const reach = now + gatherable(run, f, V, stage, vsCo ? 8 : 3) * m * 0.8 + stage.train.q * 0.8;   // a coalition pools everything it has toward the leader
        if (reach < c.need * 0.95) continue;
        pl = f.ai.plan = { target: c.x.id, owner: c.x.owner, stage: stage.id, need: Math.round(c.need), thr: c.thr, mode: c.mode, t0: Math.round(run.t), readyAt: 0, have: Math.round(now) };
        f.ai.lastPlanAt = run.t;
        note(f, run, 'PLAN ' + (c.mode === 'raid' ? 'RAID ' : 'ATTACK ') + c.x.name + ' FROM ' + stage.name + (vsCo ? ' (COALITION)' : ''), c.score);
        break;
      }
    }
    if (pl) {
      const x = run.systems[pl.target], stage = run.systems[pl.stage];
      const vsCo = co && co.target === x.owner && f.id !== co.target;
      pl.need = Math.round(AI.required(S.defStrength(run, x), pl.thr, pl.mode));
      const src = sourcesFor(run, f, V, x).slice(0, D.sources + (vsCo ? 2 : 0));
      if (src.indexOf(stage) < 0 && stage.owner === f.id && !stage.battle) src.unshift(stage);
      const avail = src.reduce((a, s) => a + (V.excess[s.id] || 0) * m, 0);
      pl.have = Math.round(avail);
      const fuelNeed = src.reduce((a, s) => a + S.armyFuel(run, f, V.excess[s.id], 1), 0);
      pl.fuelShort = f.fuel < fuelNeed;
      if (avail >= pl.need && !pl.fuelShort) {
        const hold = x.owner < 0 ? 0 : P.hold * (D.think > 5 ? 1.4 : D.think < 3 ? 0.7 : 1);
        if (!pl.readyAt) pl.readyAt = run.t;
        const clock = !vsCo || run.t - co.strike < 20;    // coalition: wait for the shared strike
        if (run.t - pl.readyAt >= hold && clock) {
          let sent = 0;
          for (const s of src) { const amt = V.excess[s.id] || 0; if (amt >= 1 && sendFrom(run, f, s, x, amt, pl.mode)) sent += amt * m; }
          if (sent > 0) { f.ai.cool[pl.target] = run.t + 25; f.ai.plan = null; note(f, run, (pl.mode === 'raid' ? 'RAID ' : 'STRIKE ') + x.name + ' WITH ' + Math.round(sent) + ' (NEED ' + pl.need + ')', sent / Math.max(1, pl.need)); if (vsCo) run.stats.coalitionStrikes = (run.stats.coalitionStrikes || 0) + 1; }
        }
      } else {
        pl.readyAt = 0;
        const donors = V.own.filter(s => s !== stage && V.excess[s.id] >= 3 && !s.battle && run.hops[s.id][stage.id] <= (vsCo ? 8 : 3) && !(V.border[s.id] && V.deficit[s.id] > 0))
          .sort((a, b) => run.hops[a.id][stage.id] - run.hops[b.id][stage.id]);
        for (const s of donors) {
          if (moves >= 4) break;
          if (run.armies.some(a => a.owner === f.id && a.dest === stage.id && a.path[0] === s.id) || src.indexOf(s) >= 0) continue;
          if (S.path(run, s.id, stage.id, f.id) && sendFrom(run, f, s, stage, V.excess[s.id], 'move')) moves++;
        }
      }
    } else {
      const borders = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id]);
      if (borders.length) for (const s of V.own) {
        if (moves >= 2) break;
        if (V.border[s.id] || V.excess[s.id] < 6 || s.battle) continue;
        if (S.path(run, s.id, borders[0].id, f.id) && sendFrom(run, f, s, borders[0], V.excess[s.id], 'move')) moves++;
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
    checkRetreats(run, f, P);
    const fc = S.forecast(run, f);
    const reserve = Math.max(40, fc.salary * 2);
    let budget = f.credits - reserve;
    const exposedNow = V.own.some(s => V.deficit[s.id] > 6);
    if (exposedNow) { budget = military(run, f, V, P, D, fc, budget); economy(run, f, V, P, D, fc, budget); }
    else { budget = economy(run, f, V, P, D, fc, budget); military(run, f, V, P, D, fc, budget); }
  };
})(globalThis.AS = globalThis.AS || {});
