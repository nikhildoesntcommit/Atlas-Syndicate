/* ATLAS SYNDICATE v5 — sim/ai/brain.js
   The shared decision system every rival uses (and the AI that plays your slot in ?demo / F9 / tests).

   Every few seconds a faction:
     1. perceives the map through its own fog of war (no cheating: exact numbers only where it can see),
     2. scores its options with one formula per option type, weighted by its personality:
          repair / build / recruit / buy / attack target X / reinforce Y / retreat / save,
     3. runs the best-scoring affordable options through S.act(), the same entry point the player uses.

   Tactics that fall out of the scoring:
     threat assessment  exposed borders are reinforced before any new attack is planned
     staging            an attack is a plan: gather at a border system, hold massed for a few seconds, then strike
     odds               a plan only launches when the battle model says the odds meet the personality threshold
     retreat            live odds are re-checked every think; losing armies are pulled out
     economy            salaries are capped to a share of income; damaged buildings are repaired before they break
     opportunism        targets that just lost a battle, or are lightly held, score higher
     leader pressure    anyone holding 35% of the galaxy becomes everybody's priority target
   Work is spread out: each faction thinks on its own staggered timer, so at most one or two think per frame. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;
  const AI = S.AI = {};

  AI.init = function (run, f) {
    f.ai = { next: run.t + 1.5 + f.id * 0.67, plan: null, grudge: {}, cool: {}, diff: f.id === 0 ? 'normal' : run.diff, thinks: 0, lastPlanAt: -999 };
  };
  AI.params = function (run, f) {
    return { P: AS.PERSONALITIES[f.pers] || AS.PERSONALITIES.balanced, D: AS.DIFFICULTY[(f.ai && f.ai.diff) || run.diff] };
  };
  /** The faction holding at least 35% of the galaxy (if any). Public information: owners are visible to all. */
  S.leaderOf = function (run) { return run.noLeaderPressure ? -1 : S.leaderRaw(run); };
  S.leaderRaw = function (run) {
    const need = Math.ceil(C.game.leaderShare * run.systems.length - 1e-9);
    let best = -1, bn = 0;
    for (const f of run.factions) { if (!f.alive) continue; const n = S.ownCount(run, f.id); if (n > bn) { bn = n; best = f.id; } }
    return bn >= need ? best : -1;
  };
  const BAND = { S: 8, M: 26, L: 55 };
  /** Smallest attacking strength that reaches the odds threshold against `def`. */
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
    const vis = S.visibility(run, f.id), lead = S.leaderOf(run);
    const V = { vis, lead, own: [], threat: {}, deficit: {}, keep: {}, excess: {}, border: {}, incoming: {}, est: {} };
    for (const b of run.battles) if (run.systems[b.sys].owner === f.id) f.ai.grudge[b.att.owner] = run.t;
    for (const a of run.armies) if (a.owner !== f.id && a.mode !== 'move' && a.mode !== 'return' && run.systems[a.dest].owner === f.id && S.armyVisible(run, f.id, a)) {
      V.incoming[a.dest] = (V.incoming[a.dest] || 0) + S.stackStrength(run, a);
      f.ai.grudge[a.owner] = run.t;
    }
    V.host = o => {
      if (o < 0 || o === f.id) return 0;
      let h = 0.55;
      if (f.ai.grudge[o] !== undefined && run.t - f.ai.grudge[o] < 150) h += 0.45 * P.punish;
      return h;
    };
    V.hostT = o => V.host(o) + (lead === o && o >= 0 ? 1.2 : 0);   // leader pressure raises target value, not fear
    V.estimate = s => (vis[s.id] ? S.garStrength(run, s) : BAND[S.sizeBand(S.garStrength(run, s))]);   // the size band is public
    const own = V.own = run.systems.filter(s => s.owner === f.id);
    const ownIn = {};
    for (const a of run.armies) if (a.owner === f.id && a.mode === 'move') ownIn[a.dest] = (ownIn[a.dest] || 0) + S.stackStrength(run, a);
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
      const want = t * P.safety * D.react * (s.capital === f.id ? 1.25 : 1);
      V.deficit[s.id] = Math.max(0, want - def);
      V.keep[s.id] = Math.max(P.minGar, want * 0.9 / Math.max(0.5, f.mods.defBonus * f.mods.def));
      V.excess[s.id] = s.battle ? 0 : Math.max(0, S.garStrength(run, s) - V.keep[s.id]);
    }
    return V;
  }

  /* ---------- 1. cards ---------- */
  function pickCards(run, f, P, D) {
    while (f.drafts.length) {
      const d = f.drafts[0];
      let best = d.offers[0], bs = -1;
      for (const k of d.offers) {
        const c = AS.CARDS[k];
        let s = P.cards[c.cat] || 1;
        for (const [a, b] of AS.CARD_SYNERGY) if ((k === a && f.cards.indexOf(b) >= 0) || (k === b && f.cards.indexOf(a) >= 0)) s += 0.6;
        if (k === 'radar') s *= 0.6;
        if (k === 'bonds' && run.t < 600) s += 0.2;
        if (k === 'extraline' && S.ownCount(run, f.id) >= 3) s += 0.2;
        s *= 1 + D.noise * (run.rng() - 0.5);
        if (s > bs) { bs = s; best = k; }
      }
      if (!S.act(run, f.id, 'card', { key: best }).ok) f.drafts.shift();
    }
  }

  /* ---------- 2. retreat ---------- */
  function checkRetreats(run, f, P) {
    for (const b of run.battles.slice()) {
      if (b.att.owner !== f.id || b.rounds < 1) continue;
      const r = S.oddsRaw(S.stackStrength(run, b.att), S.defStrength(run, run.systems[b.sys]), b.att.mode);
      if (r.p < P.retreat) S.act(run, f.id, 'retreat', { battle: b.id });
    }
  }

  /* ---------- 3. economy: repairs and building, scored by payback ---------- */
  function cloneSys(s) {
    return Object.assign({}, s, {
      planets: s.planets.map(p => Object.assign({}, p, { ext: p.ext ? Object.assign({}, p.ext) : null })),
      lines: s.lines.map(l => Object.assign({}, l, { stops: l.stops.slice() })),
    });
  }
  /** Where would a new stop for planet pi go? Extend a short station line, else a new line, else any line. */
  function connectChoice(run, f, s, pi) {
    const reach = f.mods.reach;
    const st = s.lines.filter(l => l.stops.indexOf(-1) >= 0 && l.stops.indexOf(pi) < 0 && l.stops[l.stops.length - 1] !== -1).sort((a, b) => a.stops.length - b.stops.length);
    if (st.length && st[0].stops.length < 3) return { kind: 'extend', line: st[0] };
    if (s.lines.length < S.lineSlots(run, s)) return { kind: 'new' };
    const any = s.lines.filter(l => l.stops.length < 5 && l.stops.indexOf(pi) < 0 && l.stops[l.stops.length - 1] !== -1).sort((a, b) => a.stops.length - b.stops.length);
    if (any.length) return { kind: 'extend', line: any[0] };
    void reach;
    return null;
  }
  function econCandidates(run, f, s) {
    const out = [];
    const y0 = S.sysYield(run, s);
    const base = y0.credits;
    const pExt = S.price(run, f, 'ext'), pLine = S.price(run, f, 'line'), pFr = S.price(run, f, 'freighter');
    const needFr = (l, stops) => Math.max(0, Math.ceil((stops - 1) / f.mods.reach) - l.fr);
    /** Hypothetically extract and connect a list of planets (in order); return cost, gain and the steps. */
    const planFor = list => {
      const hs = cloneSys(s);
      let cost = 0, free = S.freeFreighters(s);
      const steps = [];
      for (const pi of list) {
        const p = hs.planets[pi];
        if (!p.ext) { p.ext = { dur: 100 }; cost += pExt; steps.push(['ext', pi]); }
        const linked = hs.lines.some(l => l.stops.indexOf(pi) >= 0) && (y0.per[pi] && y0.per[pi].frac > 0 || steps.some(st => st[0] !== 'ext' && st.indexOf(pi) > 0));
        if (linked) continue;
        const ch = connectChoice(run, f, hs, pi);
        if (!ch) return null;
        if (ch.kind === 'new') {
          const l = { id: -1 - steps.length, stops: [-1, pi], fr: 0, dur: 100 };
          hs.lines.push(l); cost += pLine; steps.push(['new', pi, l.id]);
          if (free > 0) { l.fr = 1; free--; } else { if (hs.freighters >= C.econ.maxFreighters) return null; hs.freighters++; l.fr = 1; cost += pFr; steps.push(['fr', l.id]); }
        } else {
          const l = hs.lines.find(x => x.id === ch.line.id);
          l.stops.push(pi);
          steps.push(['extend', l.id, pi]);
          const nf = needFr(l, l.stops.length);
          for (let i = 0; i < nf; i++) {
            if (free > 0) { free--; l.fr++; steps.push(['fr', l.id]); continue; }
            if (hs.freighters >= C.econ.maxFreighters) break;
            hs.freighters++; l.fr++; cost += pFr; steps.push(['fr', l.id]);
          }
        }
      }
      const d = S.sysYield(run, hs).credits - base;
      return { cost, delta: d, steps, sys: s.id };
    };
    const open = [];
    s.planets.forEach((p, pi) => {
      if (p.ext && p.ext.dur <= 0) return;   // repairs handle broken extractors
      if (p.ext && y0.per[pi].frac >= 1) return;
      open.push(pi);
      const c = planFor([pi]);
      if (c && c.delta > 0.5) out.push(c);
    });
    // an ORE planet pays nothing until ENERGY reaches the factory too: score complementary pairs together
    for (const a of open) for (const b of open) {
      if (a >= b) continue;
      const ta = s.planets[a].type, tb = s.planets[b].type;
      if (!((ta === 'ore' && tb === 'energy') || (ta === 'energy' && tb === 'ore'))) continue;
      const c = planFor([a, b]);
      if (c && c.delta > 0.5) out.push(c);
    }
    // under-served lines: one more freighter
    s.lines.forEach((l, i) => {
      if (l.dur <= 0 || y0.eff[i] >= 1) return;
      const hs = cloneSys(s), hl = hs.lines[i];
      let cost = 0;
      if (S.freeFreighters(s) <= 0) { if (s.freighters >= C.econ.maxFreighters) return; hs.freighters++; cost = pFr; }
      hl.fr++;
      const d = S.sysYield(run, hs).credits - base;
      if (d > 0.5) out.push({ cost, delta: d, steps: [['fr', l.id]], sys: s.id, label: 'freighter' });
    });
    return out;
  }
  function runSteps(run, f, c) {
    const ids = {};   // hypothetical line id -> real line id
    for (const st of c.steps) {
      let r;
      const s = run.systems[c.sys];
      if (st[0] === 'ext') r = S.act(run, f.id, 'ext', { sys: c.sys, planet: st[1] });
      else if (st[0] === 'new') {
        r = S.act(run, f.id, 'line', { sys: c.sys, a: -1, b: st[1] });
        if (r.ok) { ids[st[2]] = r.line.id; r.line.fr = 0; S.fixFreighters(s); }
      } else if (st[0] === 'extend') {
        const l = S.lineById(s, ids[st[1]] !== undefined ? ids[st[1]] : st[1]);
        if (!l) return false;
        r = S.act(run, f.id, 'line', { sys: c.sys, a: l.stops[l.stops.length - 1], b: st[2] });
      } else if (st[0] === 'fr') {
        const id = ids[st[1]] !== undefined ? ids[st[1]] : st[1];
        r = S.act(run, f.id, 'fr', { sys: c.sys, line: id, d: 1 });
      }
      if (!r || !r.ok) return false;
    }
    return true;
  }
  function economy(run, f, V, P, D, budget) {
    const cyclesLeft = Math.max(4, (C.game.length - run.t) / C.game.cycle);
    const horizon = Math.min(26, cyclesLeft);
    const repairAt = D.repairAt + (P.econ > 1.2 ? 10 : 0);
    const opts = [];
    for (const s of V.own) {
      for (const b of S.buildings(run, s)) {
        if (b.dur >= repairAt && b.dur > 0) continue;
        const cost = S.repairCost(run, f, b);
        if (cost <= 0) continue;
        const imp = { station: 3, ext: 1.6, line: 1.6, fleet: 2, plat: V.threat[s.id] > 0 ? 1.5 : 0.5, ships: 1 }[b.kind] || 1;
        opts.push({ u: (b.dur <= 0 ? 4 : 1.6) * imp, cost, kind: 'repair', go: () => S.act(run, f.id, 'repair', { sys: s.id, kind: b.kind, idx: b.idx }).ok });
      }
      if (s.battle) continue;
      for (const c of econCandidates(run, f, s)) {
        const u = P.econ * D.econ * c.delta * horizon / Math.max(20, c.cost) * (1 + D.noise * (run.rng() - 0.5));
        opts.push({ u, cost: c.cost, kind: 'build', go: () => runSteps(run, f, c) });
      }
    }
    opts.sort((a, b) => b.u - a.u);
    f.ai.saving = opts.some(o => o.kind === 'build' && o.u >= 2 && o.cost > budget);
    let n = 0;
    const maxN = 2 + Math.round(D.econ * 3);
    for (const o of opts) {
      if (n >= maxN) break;
      if (o.u < (o.kind === 'repair' ? 0.6 : f.credits > 400 ? 0.55 : 0.8)) continue;   // idle money lowers the bar
      if (o.cost > budget) continue;
      const before = f.credits;
      if (o.go()) { n++; budget -= before - f.credits; }
    }
    return budget;
  }

  /* ---------- 4. military ---------- */
  function maxSoldiers(run, f, P, income) {
    const t = run.t / C.game.length;
    // early on the economy comes first: the salary share ramps up from 50% to 100% by minute 10
    const phase = U.clamp(0.5 + 0.5 * (run.t - 120) / 480, 0.5, 1);
    let allowed = income * P.army * phase * (0.85 + 0.3 * t) + Math.max(0, f.credits - 350) / 30;
    if (f.ai.saving) allowed *= 0.65;
    let n = 0;
    while (n < 600 && S.salaryFor(run, f, n + 5) <= allowed) n += 5;
    return n;
  }
  function queued(run, f) { let q = 0; for (const s of run.systems) if (s.owner === f.id) q += s.train.q; return q; }

  function targetValue(run, f, V, P, x) {
    let v = 3 + (x.region === 'core' ? 5 : 0);
    for (const p of x.planets) v += p.rich * (p.type === 'food' ? 2 : 3) + (p.ext ? 2 : 0);
    if (x.capital >= 0 && x.capital === x.owner) v += 45 * (f.id === 0 ? 1 : AS.DIFFICULTY[f.ai.diff].aggr);   // taking a capital eliminates the faction
    return v;
  }
  function strongestNeighbour(run, f, V) {
    const tot = {};
    for (const s of run.systems) if (s.owner >= 0 && s.owner !== f.id) tot[s.owner] = (tot[s.owner] || 0) + V.estimate(s);
    const touching = {};
    for (const s of V.own) for (const n of S.neighbours(run, s.id)) { const o = run.systems[n].owner; if (o >= 0 && o !== f.id) touching[o] = 1; }
    let best = -1, bv = -1;
    for (const o in touching) if (tot[o] > bv) { bv = tot[o]; best = +o; }
    return best;
  }
  function threshold(run, f, P, D, x, lead) {
    let thr = P.odds + D.odds;
    if (x.owner >= 0 && x.owner === lead) thr -= 0.03;
    if (run.t > 1080 && P.late >= 1) thr -= 0.12;
    if (f.ai.overArmed) thr -= 0.08;   // salaries exceed income: use the army before it deserts
    if (x.owner < 0) thr += 0.04;
    return U.clamp(thr, 0.45, 0.95);
  }
  function scoreTargets(run, f, V, P, D) {
    const out = [], lead = V.lead;
    const strongest = strongestNeighbour(run, f, V);
    const tt = run.t / C.game.length;
    const agg = P.aggr * (f.id === 0 ? 1 : D.aggr) * (0.65 + 0.9 * tt) * (run.t > 1080 ? 1 + P.late : 1);
    const seen = {};
    for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
      const x = run.systems[n];
      if (x.owner === f.id || seen[n]) continue;
      seen[n] = 1;
      if (x.battle) continue;
      if (f.ai.cool[n] && run.t < f.ai.cool[n]) continue;
      const lane = S.laneBetween(run, s.id, n);
      if (!S.laneOpen(run, lane) && !S.neighbours(run, n).some(m => m !== s.id && run.systems[m].owner === f.id)) continue;
      const def = S.defStrength(run, x);
      let w;
      if (x.owner < 0) w = P.neutral;
      else {
        w = P.war * V.hostT(x.owner);
        if (x.owner === strongest) w *= P.strongest;
        const o = run.factions[x.owner];
        if (run.t - o.lastDefeat < 60 || run.t - x.lastBattle < 35) w *= P.weak;
        if (f.ai.grudge[x.owner] !== undefined && run.t - f.ai.grudge[x.owner] < 120) w *= 0.6 + 0.4 * P.punish;
        if (x.owner === lead) w *= 2.6;
        w *= U.clamp((run.t - 280) / 150, 0.05, 1);   // right after 4:00 everyone grabs independents first
        if (x.owner === 0 && f.id !== 0) w *= D.focus;   // difficulty: how much rivals go after the player's slot
      }
      if (def < 10) w *= 1 + (P.weak - 1) * 0.6;
      let mode = 'attack';
      if (x.owner >= 0 && P.raid > 0) {
        const isCap = x.capital === x.owner;
        if (!isCap && run.rng() < P.raid) mode = 'raid';
      }
      const thr = threshold(run, f, P, D, x, lead);
      const need = AI.required(def, thr, mode);
      const value = mode === 'raid' ? 6 + x.planets.filter(p => p.ext).length * 3 + x.lines.length * 3 : targetValue(run, f, V, P, x);
      const score = agg * w * value / (1 + need / 35) * (1 + D.noise * (run.rng() - 0.5));
      out.push({ x, score, need, thr, mode, def });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
  /** Own systems adjacent to target, best staging point first. */
  function sourcesFor(run, f, V, x) {
    return S.neighbours(run, x.id).map(n => run.systems[n]).filter(s => s.owner === f.id && !s.battle && S.laneOpen(run, S.laneBetween(run, s.id, x.id)))
      .sort((a, b) => V.excess[b.id] - V.excess[a.id]);
  }
  /** Strength that could reach `stage` within a few lanes from own systems that can spare it. */
  function gatherable(run, f, V, stage, maxHops) {
    let g = 0;
    for (const s of V.own) {
      if (s.id === stage.id || V.excess[s.id] < 3) continue;
      if (run.hops[s.id][stage.id] > maxHops) continue;
      if (V.border[s.id] && V.threat[s.id] > 0 && V.deficit[s.id] > 0) continue;
      g += V.excess[s.id];
    }
    return g;
  }
  function sendFrom(run, f, from, to, strength, mode) {
    const g = from.gar;
    const gs = S.garStrength(run, from);
    if (gs <= 0 || strength <= 0) return false;
    const frac = U.clamp(strength / gs, 0.05, 1);
    return S.act(run, f.id, 'move', { from: from.id, to: to.id, frac, mode }).ok && g !== null;
  }
  function military(run, f, V, P, D, budget) {
    const fc = S.forecast(run, f);
    const income = Math.max(0, fc.income);
    f.ai.overArmed = fc.salary > fc.income * 0.95;
    const m = f.mods.attack;
    // --- reinforce exposed borders first (threat assessment) ---
    const deficits = V.own.filter(s => V.deficit[s.id] > 0.5).sort((a, b) => V.deficit[b.id] * (b.capital === f.id ? 2 : 1) - V.deficit[a.id] * (a.capital === f.id ? 2 : 1));
    let moves = 0;
    let exposed = 0;
    for (const d of deficits.slice(0, 2)) {
      let need = V.deficit[d.id] / Math.max(0.5, f.mods.defBonus * f.mods.def);
      const donors = V.own.filter(s => s !== d && V.excess[s.id] >= 3 && !s.battle && run.hops[s.id][d.id] <= 3).sort((a, b) => run.hops[a.id][d.id] - run.hops[b.id][d.id] || V.excess[b.id] - V.excess[a.id]);
      for (const s of donors) {
        if (need <= 0 || moves >= 3) break;
        const amt = Math.min(V.excess[s.id], need * 1.1);
        if (amt < 2) continue;
        if (S.path(run, s.id, d.id, f.id) && sendFrom(run, f, s, d, amt, 'move')) { V.excess[s.id] -= amt; need -= amt; moves++; }
      }
      if (need > 4) exposed += need;
    }
    // --- recruit: as many soldiers as the salary budget allows ---
    const cap = maxSoldiers(run, f, P, income) * D.army;
    let room = Math.floor(cap - S.soldiers(run, f.id) - queued(run, f));
    if (fc.net < 0 && f.credits < 150) room = Math.min(room, 0);
    // salary discipline: never train into bankruptcy
    if (fc.net < 0 && f.credits < -fc.net * 4) for (const s of V.own) if (s.train.q > 0) S.act(run, f.id, 'cancel', { sys: s.id });
    const plan = f.ai.plan;
    if (room >= 3) {
      const where = V.own.filter(s => s.train.q < C.army.maxQueue - 4)
        .map(s => ({ s, w: V.deficit[s.id] * 2 + (plan && plan.stage === s.id ? 30 : 0) + (s.capital === f.id ? 6 : 0) + (V.border[s.id] ? 4 + V.threat[s.id] * 0.2 : 0) + s.pop * 0.1 }))
        .sort((a, b) => b.w - a.w);
      for (const { s } of where.slice(0, 3)) {
        if (room < 3) break;
        const n = Math.min(C.army.batch, room);
        if (S.act(run, f.id, 'recruit', { sys: s.id, n }).ok) room -= n;
      }
    }
    // --- platforms at chokepoints and the capital, warships when salaries are maxed ---
    const salaryCapped = room < 3;
    for (const s of V.own) {
      if (budget < 60) break;
      const pc = S.price(run, f, 'plat');
      const want = (s.capital === f.id ? 1 : 0) + (V.border[s.id] ? s.choke * 3 : 0) + (V.deficit[s.id] > 0 ? 1 : 0);
      const u = P.plat * want / (1 + s.plat.n * 1.2) * (salaryCapped ? 1.3 : 0.8);
      if (u >= 1 && budget >= pc && s.plat.n < C.equip.maxPlatforms && run.t > 60) { if (S.act(run, f.id, 'plat', { sys: s.id }).ok) budget -= pc; }
    }
    if ((salaryCapped || budget > 300) && budget > S.price(run, f, 'ship') * 1.5 && !f.ai.saving) {
      const bord = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id])[0];
      const st = plan ? run.systems[plan.stage] : deficits[0] || bord;
      const u = Math.max(0.5, P.ship) * (plan ? 1.3 : 0.9) * (budget / 300);
      if (st && st.owner === f.id && u >= 1) { const pc = S.price(run, f, 'ship'); if (S.act(run, f.id, 'ship', { sys: st.id }).ok) budget -= pc; }
    }
    // --- buy neutral systems (peaceful, expensive) ---
    if (P.buy > 0.1) {
      let best = null, bu = 0;
      for (const s of V.own) for (const n of S.neighbours(run, s.id)) {
        const x = run.systems[n];
        if (x.owner !== -1 || x.battle) continue;
        const price = S.buyPrice(run, f, x);
        let u = P.buy * targetValue(run, f, V, P, x) / (price / 55);
        if (run.t < C.game.protect) u *= 1.25;
        if (u > bu) { bu = u; best = [x, price]; }
      }
      if (best && bu >= 1 && budget >= best[1] + 40) { if (S.act(run, f.id, 'buy', { sys: best[0].id }).ok) budget -= best[1]; }
    }
    if (run.t < C.game.protect) return budget;
    // --- attack plans: stage, mass, strike ---
    let pl = f.ai.plan;
    if (pl) {
      const x = run.systems[pl.target], st = run.systems[pl.stage];
      const stale = run.t - pl.t0 > (pl.owner >= 0 && pl.owner === V.lead ? 150 : 110);
      if (x.owner === f.id || x.owner !== pl.owner || st.owner !== f.id || stale || (x.battle && !run.battles.some(b => b.id === x.battle && b.att.owner === f.id))) {
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
        const vsLead = c.x.owner >= 0 && c.x.owner === V.lead;   // pressure on the leader: wider gathering, every adjacent source
        const now = src.slice(0, D.sources + (vsLead ? 1 : 0)).reduce((a, s) => a + V.excess[s.id] * m, 0);
        const reach = now + gatherable(run, f, V, stage, vsLead ? 5 : 3) * m * 0.8 + stage.train.q * 0.8;
        if (reach < c.need * 0.95) continue;
        pl = f.ai.plan = { target: c.x.id, owner: c.x.owner, stage: stage.id, need: c.need, thr: c.thr, mode: c.mode, t0: run.t, readyAt: 0 };
        f.ai.lastPlanAt = run.t;
        break;
      }
    }
    if (pl) {
      const x = run.systems[pl.target], stage = run.systems[pl.stage];
      const def = S.defStrength(run, x);
      pl.need = AI.required(def, pl.thr, pl.mode);
      const src = sourcesFor(run, f, V, x).slice(0, D.sources + (x.owner >= 0 && x.owner === V.lead ? 1 : 0));
      if (src.indexOf(stage) < 0 && stage.owner === f.id && !stage.battle) src.unshift(stage);
      const avail = src.reduce((a, s) => a + V.excess[s.id] * m, 0);
      if (avail >= pl.need) {
        const hold = x.owner < 0 ? 0 : P.hold * (D.think > 5 ? 1.4 : D.think < 3 ? 0.7 : 1);
        if (!pl.readyAt) pl.readyAt = run.t;
        if (run.t - pl.readyAt >= hold) {
          // strike with everything the sources can spare, all at once (no trickling)
          let sent = 0;
          for (const s of src) { const amt = V.excess[s.id]; if (amt >= 1 && sendFrom(run, f, s, x, amt, pl.mode)) sent += amt * m; }
          if (sent > 0) { f.ai.cool[pl.target] = run.t + 25; f.ai.plan = null; }
        }
      } else {
        pl.readyAt = 0;
        // gather: move spare strength from nearby own systems to the staging system
        const donors = V.own.filter(s => s !== stage && V.excess[s.id] >= 3 && !s.battle && run.hops[s.id][stage.id] <= (x.owner >= 0 && x.owner === V.lead ? 5 : 3) && !(V.border[s.id] && V.deficit[s.id] > 0))
          .sort((a, b) => run.hops[a.id][stage.id] - run.hops[b.id][stage.id]);
        for (const s of donors) {
          if (moves >= 4) break;
          const inbound = run.armies.some(a => a.owner === f.id && a.dest === stage.id && a.path[0] === s.id);
          if (inbound) continue;
          if (src.indexOf(s) >= 0) continue;   // other sources strike from where they are
          if (S.path(run, s.id, stage.id, f.id) && sendFrom(run, f, s, stage, V.excess[s.id], 'move')) moves++;
        }
      }
    } else {
      // no plan: push spare interior troops toward the most threatened border
      const borders = V.own.filter(s => V.border[s.id]).sort((a, b) => V.threat[b.id] - V.threat[a.id]);
      if (borders.length) for (const s of V.own) {
        if (moves >= 2) break;
        if (V.border[s.id] || V.excess[s.id] < 6 || s.battle) continue;
        const dst = borders[0];
        if (S.path(run, s.id, dst.id, f.id) && sendFrom(run, f, s, dst, V.excess[s.id], 'move')) moves++;
      }
    }
    return budget;
  }

  /* ---------- the think ---------- */
  AI.think = function (run, f) {
    const { P, D } = AI.params(run, f);
    f.ai.next = run.t + D.think * (0.85 + 0.3 * run.rng());
    f.ai.thinks++;
    pickCards(run, f, P, D);
    const V = perceive(run, f, P, D);
    checkRetreats(run, f, P);
    const salary = S.salary(run, f);
    const reserve = Math.max(40, salary * (P.econ > 1.3 ? 2.5 : 1.5));
    let budget = f.credits - reserve;
    // order matters only for who gets the credits first: urgent defence before economy when exposed
    const exposedNow = V.own.some(s => V.deficit[s.id] > 6);
    if (exposedNow) { budget = military(run, f, V, P, D, budget); economy(run, f, V, P, D, budget); }
    else { budget = economy(run, f, V, P, D, budget); military(run, f, V, P, D, budget); }
  };
})(globalThis.AS = globalThis.AS || {});
