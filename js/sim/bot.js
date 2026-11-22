/* ATLAS SYNDICATE v4 — sim/bot.js
   A built-in player. It drives the attract mode (?demo), the F9 fast-forward and the balance tests.
   Skill levels: 'skilled' (plays well), 'casual' (slow, makes fewer and worse decisions), 'idle' (does nothing).
   It acts only through S.act(), exactly like a human. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;
  const B = AS.Bot = {};

  const PERK_PRIO = ['bulk', 'fleet', 'deep', 'automat', 'hydro', 'trade', 'integrate', 'gatefund', 'taxes', 'drives', 'momentum',
    'rings', 'grant', 'favour', 'hub', 'cluster', 'express', 'bonded', 'leanup', 'survey', 'overtime', 'hulls', 'insure'];

  B.create = function (seed, skill) {
    skill = skill || 'skilled';
    const P = {
      skilled: { every: 2, claimEvery: 100, reserve: 200, fleetPerRoute: 2, contracts: true, rebalance: true, mega: true },
      casual: { every: 6, claimEvery: 170, reserve: 350, fleetPerRoute: 1.2, contracts: false, rebalance: false, mega: false },
      idle: { every: 1e9 },
    }[skill];
    return { rng: U.rng(((seed >>> 0) ^ 0x9e3779b9) >>> 0), next: 1, skill, p: P };
  };

  function plan(run, b) {
    const cols = S.colonies(run);
    const megaOn = run.mega.state === 'active';
    if (b.prime) return ['mine', 'drill', 'agri', 'smelter', 'habitat', cols.some(c => c.dep.gas) ? 'fab' : null].filter(Boolean);
    const p = [];
    if (b.dep.ice) p.push('drill', 'agri');
    if (b.dep.gas) p.push('skimmer');
    if (b.dep.ore) p.push('mine');
    p.push('habitat');
    if (b.dep.gas) p.push('skimmer');
    if (b.dep.ore >= 1) p.push('mine', 'smelter');
    if (b.dep.ice >= 1) p.push('drill');
    if (b.dep.gas >= 1 && run.t > 600) p.push('fab');
    if (b.dep.ore >= 0.8 && run.t > 600) p.push('smelter');
    return p.slice(0, b.slotsN);
  }

  /** Food made per second minus food eaten per second, across all worlds. */
  function foodBalance(run) {
    let eat = 0;
    for (const b of S.colonies(run)) eat += S.foodRate(run, b);
    return S.productionRate(run, 'food') - eat;
  }
  B.foodBalance = foodBalance;

  function score(run, bot, b, P) {
    const cols = S.colonies(run);
    const hasIce = cols.some(c => !c.prime && c.dep.ice >= 1), hasGas = cols.some(c => c.dep.gas >= 1);
    let s = (!hasIce && b.dep.ice >= 1 ? 300 : 0) + (hasIce && !hasGas && b.dep.gas >= 1 ? 220 : 0);
    s += ((b.dep.ore || 0) + (b.dep.ice || 0) + (b.dep.gas || 0)) * 40 + b.slotsN * 12;
    // diversify: favour whatever the network is short of (and what the megaproject stage needs)
    const ore = S.productionRate(run, 'ore');
    if (ore < 2 + (run.t - run.sysStart) / 600 && b.dep.ore >= 0.9) s += ore < 1 && cols.length >= 2 ? 360 : 160;
    if ((run.t > 300 || run.sys > 0) && S.productionRate(run, 'gas') < 1 && b.dep.gas >= 1) s += run.sys > 0 && cols.length >= 2 ? 300 : 140;
    if (run.mega.state === 'active') for (const g of ['ore', 'ice', 'gas']) if (S.megaRemaining(run, g) > 0 && b.dep[g] >= 0.9) s += 120;
    if (S.has(b, 'rich')) s += 40;
    if (S.has(b, 'radiation')) s -= 15;
    s -= S.planeDist(b, P) * 0.5;
    return s + bot.rng() * 20;
  }

  B.step = function (run, bot) {
    if (run.over) return;
    const p = bot.p;
    if (run.shop) {
      const offers = run.shop.offers;
      const key = bot.skill === 'skilled'
        ? offers.slice().sort((a, b) => PERK_PRIO.indexOf(a) - PERK_PRIO.indexOf(b))[0]
        : offers[Math.floor(bot.rng() * offers.length)];
      S.act(run, 'perk', { key });
      return;
    }
    if (bot.skill === 'idle' || run.t < bot.next) return;
    bot.next = run.t + p.every;
    const P = S.prime(run);
    const cols = S.colonies(run);
    const megaOn = run.mega.state === 'active';
    const site = S.site(run);
    const reserve = p.reserve + (megaOn ? 100 : 0);

    // 1. claim new worlds at a steady pace; without a food surplus only worlds that can feed themselves
    const food = foodBalance(run);
    if (cols.length < 1 + Math.floor((run.t - run.sysStart + 40) / p.claimEvery) && run.credits > 0) {
      let free = run.bodies.filter(b => b.found && !b.claimed && !b.site && run.t - b.lostAt > 120);
      if (food < 0.35 && bot.skill === 'skilled' && free.some(b => b.dep.ice >= 0.9)) free = free.filter(b => b.dep.ice >= 0.9);
      const nxt = free.sort((a, c) => score(run, bot, c, P) - score(run, bot, a, P))[0];
      if (nxt && run.credits > S.claimCost(run, nxt) + reserve + 250) S.act(run, 'claim', { id: nxt.id });
    }
    // 2. every colony gets a route to the capital; hungry worlds without ice get a food line
    for (const b of S.colonies(run)) if (!b.prime && !S.routeBetween(run, P, b) && run.credits > S.routeCost(P, b) + 60) S.act(run, 'route', { a: P.id, b: b.id });
    for (const b of S.colonies(run)) {
      if (!b.starving || b.dep.ice) continue;
      const src = S.colonies(run).filter(o => o !== b && o.fac.some(f => f && f.type === 'agri') && o.stock.food > 20).sort((x, y) => y.stock.food - x.stock.food)[0];
      if (src && !S.routeBetween(run, src, b) && run.credits > S.routeCost(src, b)) S.act(run, 'route', { a: src.id, b: b.id });
    }
    // 3. build by plan, food emergencies first
    for (const b of S.colonies(run)) {
      const slot = b.fac.indexOf(null);
      if (slot < 0) continue;
      const have = {};
      for (const f of b.fac) if (f) have[f.type] = (have[f.type] || 0) + 1;
      let pick = null;
      if (b.starving && b.dep.ice && !have.agri) pick = have.drill ? 'agri' : 'drill';
      else if (megaOn && p.mega && S.megaRemaining(run, 'alloy') > 0 && S.productionRate(run, 'alloy') < 1 && (b.dep.ore >= 0.5 || b.prime)) pick = (have.mine || 0) > (have.smelter || 0) || b.stock.ore > 20 ? 'smelter' : (b.dep.ore ? 'mine' : 'smelter');
      else if (megaOn && p.mega && S.megaRemaining(run, 'parts') > 0 && S.productionRate(run, 'parts') < 0.5 && b.dep.gas >= 0.5 && !have.fab) pick = 'fab';
      else if (bot.skill === 'skilled' && !b.prime && food < 0.2 && b.dep.ice >= 0.9 && (have.agri || 0) <= (have.drill || 0) && (have.agri || 0) < 2) pick = (have.drill || 0) > (have.agri || 0) ? 'agri' : 'drill';
      else {
        const need = {};
        for (const t of plan(run, b)) { need[t] = (need[t] || 0) + 1; if ((have[t] || 0) < need[t]) { pick = t; break; } }
        if (pick === 'habitat' && bot.skill === 'skilled' && food < 0.5) pick = null;
      }
      if (pick && run.credits > AS.FAC[pick].cost + (b.starving ? 0 : reserve)) S.act(run, 'build', { id: b.id, slot, type: pick });
    }
    // 4. freighters
    const fleetCap = Math.floor(run.routes.length * p.fleetPerRoute) + 1 + (megaOn && p.mega ? 4 : 0);
    if (S.idleFreighters(run).length === 0 && run.credits > S.freighterCost(run) + reserve + 100 && run.freighters.length < fleetCap) S.act(run, 'buy');
    for (const f of S.idleFreighters(run)) {
      let best = null, bs = -1;
      for (const r of run.routes) {
        const A = S.getBody(run, r.a), Bb = S.getBody(run, r.b);
        let s = 0;
        for (const g of AS.GOOD_KEYS) s += Math.min(S.surplus(A, g, Bb), S.needFor(run, Bb, g, A)) + Math.min(S.surplus(Bb, g, A), S.needFor(run, A, g, Bb));
        if (A.starving || Bb.starving) s += 40;
        if ((A.site || Bb.site) && p.mega) s += 30;
        const n = S.routeFreighters(run, r).length;
        if (!p.rebalance && n > 0) s *= 0.2;
        s /= (1 + n);
        if (s > bs) { bs = s; best = r; }
      }
      if (best) S.act(run, 'assign', { id: best.id }); else break;
    }
    // 5. megaproject: direct links from producers to the site once the capital link is busy
    if (megaOn && p.mega && site) {
      const st = S.megaStage(run);
      for (const b of S.colonies(run)) {
        if (b.prime || S.routeBetween(run, b, site)) continue;
        const useful = Object.keys(st.req).some(g => S.megaRemaining(run, g) > 0 && b.stock[g] > 15);
        if (useful && run.credits > S.routeCost(b, site) + reserve + 300 && run.routes.filter(r => r.a === site.id || r.b === site.id).length < 3) {
          S.act(run, 'route', { a: b.id, b: site.id });
          break;
        }
      }
    }
    // 6. abilities: deflect meteors it can afford, boost when the gate or a quarter-end needs it
    if (p.mega) {
      for (const pd of run.pending) if (pd.kind === 'meteor' && run.credits > S.deflectCost(run) + reserve) S.act(run, 'deflect', { id: pd.id });
      if (run.boostCd <= 0 && (megaOn || (run.nextQuarter - run.t < 40 && run.qIncome < run.target))) S.act(run, 'boost');
    }
    // 7. contracts the economy can plausibly cover
    if (p.contracts) for (const c of run.contracts) {
      if (!c.accepted && S.productionRate(run, c.good) * C.contracts.deadline * 0.7 >= c.qty && (c.good !== 'food' || P.stock.food > c.qty + 60) && !P.starving) S.act(run, 'accept', { id: c.id });
    }
  };

  /** Run a whole game headlessly. Returns a summary used by the tests and the balance report. */
  B.simulate = function (seed, charter, skill, limitSec, opts) {
    opts = opts || {};
    const run = S.createRun(seed, charter), bot = B.create(seed, skill);
    if (opts.log) run.actions = [];
    const STEP = C.sim.step, fails = [];
    let steps = 0;
    try {
      while (!run.over && run.t < limitSec) {
        B.step(run, bot);
        S.step(run, STEP);
        run.fx.length = 0;
        steps++;
        if (opts.check && steps % 40 === 0) {
          const bad = S.scanFinite(run, 'run', [], 0);
          if (bad.length) { fails.push('non-finite: ' + bad.slice(0, 4).join(', ')); break; }
          const n = fails.length;
          S.checkInvariants(run, fails);
          if (fails.length > n) break;
        }
      }
    } catch (e) { fails.push('exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    const sc = S.computeScore(run);
    return {
      run, fails, steps, seed, charter, skill, t: run.t, over: run.over, won: run.won, reason: run.overReason,
      megaReached: run.mega.state !== 'locked', megaAt: run.mega.unlockedAt, megaDone: run.mega.state === 'done', doneAt: run.mega.completedAt,
      stage: run.mega.stage, sys: run.sys, sysDone: run.sysDone, score: sc.total, quarters: run.quarter, colonies: S.colonies(run).length, conf: run.conf, minConf: run.minConf,
    };
  };
})(globalThis.AS = globalThis.AS || {});
