/* ATLAS SYNDICATE v4 — sim/actions.js
   Every player action. Each returns {ok, reason}. S.act() is the single entry point used by the UI,
   the bot and replays, so a run can be reproduced from its seed plus its action log. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  S.claimBody = function (run, b) {
    if (!b || b.claimed || b.site || !b.found) return { ok: false, reason: b && b.claimed ? 'claimed' : 'invalid' };
    if (b.lostAt > 0 && run.t - b.lostAt < C.colony.reclaimDelay) return { ok: false, reason: 'cooldown', left: Math.ceil(C.colony.reclaimDelay - (run.t - b.lostAt)) };
    const cost = S.claimCost(run, b);
    if (run.credits < cost) return { ok: false, reason: 'credits', cost };
    S.spend(run, cost);
    b.claimed = true; b.pop = C.colony.outpostPop; b.starving = false;
    for (const g of AS.GOOD_KEYS) b.stock[g] = 0;
    b.stock.food = C.colony.outpostFood;
    // a new claim starts with a stockpile of its richest raw resource
    let best = null;
    for (const g of ['ore', 'ice', 'gas']) if ((b.dep[g] || 0) > (best ? b.dep[best] : 0)) best = g;
    if (best) b.stock[best] = C.economy.claimYield;
    b.fac = new Array(b.slotsN).fill(null);
    const n = S.colonies(run).length;
    run.stats.maxColonies = Math.max(run.stats.maxColonies, n);
    run.fx.push({ type: 'claim', id: b.id });
    run.banner = { text: b.name + ' CLAIMED - LINKED TO ' + S.prime(run).name, col: 13, kind: 'good', t: 3 };
    S.autoLink(run, b);
    S.logMoment(run, 'CLAIMED ' + b.name + ' (WORLD ' + n + ')', 'claim');
    return { ok: true, cost };
  };
  S.buildFacility = function (run, b, slot, type) {
    const F = AS.FAC[type];
    if (!b || !b.claimed || b.site || !F) return { ok: false, reason: 'invalid' };
    if (slot < 0 || slot >= b.slotsN || b.fac[slot]) return { ok: false, reason: 'slot' };
    if (F.deposit && !(b.dep[F.deposit] > 0)) return { ok: false, reason: 'deposit' };
    if (run.credits < F.cost) return { ok: false, reason: 'credits', cost: F.cost };
    S.spend(run, F.cost);
    b.fac[slot] = S.newFacility(type, S.buildTime(type));
    run.facilitiesBuilt++;
    run.fx.push({ type: 'build', id: b.id, slot, fac: type });
    return { ok: true };
  };
  S.demolishFacility = function (run, b, slot) {
    if (!b || !b.fac || !b.fac[slot]) return { ok: false, reason: 'slot' };
    const F = AS.FAC[b.fac[slot].type];
    b.fac[slot] = null;
    const back = Math.round(F.cost * C.economy.demolishRefund);
    run.credits += back;
    run.fx.push({ type: 'demolish', id: b.id, slot });
    return { ok: true, refund: back };
  };
  S.buildRoute = function (run, a, b) {
    if (!a || !b || a === b) return { ok: false, reason: 'same' };
    if (!a.claimed || !b.claimed) return { ok: false, reason: 'unclaimed' };
    if (S.routeBetween(run, a, b)) return { ok: false, reason: 'exists' };
    const cost = S.routeCost(a, b);
    if (run.credits < cost) return { ok: false, reason: 'credits', cost };
    S.spend(run, cost);
    const r = { id: run.nextId++, a: a.id, b: b.id, cost, halted: 0, moved: 0, movedLog: [] };
    run.routes.push(r);
    run.routeMap.set(r.id, r);
    run.routesBuilt++;
    run.stats.maxPrimeRoutes = Math.max(run.stats.maxPrimeRoutes || 0, S.primeRoutes(run));
    const idle = S.idleFreighters(run)[0];
    if (idle) S.assignFreighter(run, r, idle);
    run.fx.push({ type: 'route', id: r.id });
    return { ok: true, route: r, cost };
  };
  /** New worlds are linked to the capital for free, and an available freighter starts work on the link. */
  S.autoLink = function (run, b) {
    const P = S.prime(run);
    if (!P || P === b || S.routeBetween(run, P, b)) return null;
    const r = { id: run.nextId++, a: P.id, b: b.id, cost: 0, halted: 0, moved: 0, movedLog: [], auto: true };
    run.routesBuilt++;
    run.routes.push(r);
    run.routeMap.set(r.id, r);
    const idle = S.idleFreighters(run).find(f => !f.parked) || S.idleFreighters(run)[0];
    if (idle) S.assignFreighter(run, r, idle);
    run.fx.push({ type: 'route', id: r.id });
    return r;
  };
  /** Idle freighters (not parked by the player) join the route that needs them most. Runs once a second. */
  S.autoAssign = function (run) {
    for (const f of run.freighters) {
      if (f.route || f.parked) continue;
      let best = null, bs = -1;
      for (const r of run.routes) {
        const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
        if (!A || !B) continue;
        let s = 1;
        for (const g of AS.GOOD_KEYS) s += Math.min(S.surplus(A, g, B), S.needFor(run, B, g, A)) + Math.min(S.surplus(B, g, A), S.needFor(run, A, g, B));
        if (A.starving || B.starving) s += 40;
        s /= 1 + S.routeFreighters(run, r).length * 1.5;
        if (s > bs) { bs = s; best = r; }
      }
      if (!best) return;
      S.assignFreighter(run, best, f);
    }
  };
  S.removeRoute = function (run, r, refund) {
    if (!r || !run.routeMap.has(r.id)) return { ok: false, reason: 'gone' };
    for (const f of run.freighters) if (f.route === r.id) S.settleFreighter(run, f);
    run.routes = run.routes.filter(x => x !== r);
    run.routeMap.delete(r.id);
    let back = 0;
    if (refund) { back = Math.round(r.cost * C.economy.routeRefund); run.credits += back; }
    return { ok: true, refund: back };
  };
  S.assignFreighter = function (run, r, f) {
    if (!r || !run.routeMap.has(r.id)) return { ok: false, reason: 'gone' };
    f = f || S.idleFreighters(run)[0];
    if (!f) return { ok: false, reason: 'nofreighter' };
    f.parked = false;
    const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
    const n = S.routeFreighters(run, r).length;
    f.route = r.id;
    if (n === 0 && A && B) {
      // the first freighter starts wherever there is cargo waiting, so it flies straight away
      let sa = 0, sb = 0;
      for (const g of AS.GOOD_KEYS) { sa += S.surplus(A, g); sb += S.surplus(B, g); }
      f.at = sb > sa ? r.b : r.a;
    } else f.at = n % 2 === 1 ? r.a : r.b;
    f.state = 'dock'; f.timer = 0.3; f.wait = 0; f.prog = 0; f.cargo = {}; f.load = 0;
    return { ok: true };
  };
  S.recallFreighter = function (run, r) {
    const own = S.routeFreighters(run, r);
    if (!own.length) return { ok: false, reason: 'none' };
    const f = own.find(x => x.state === 'dock' && !x.load) || own[own.length - 1];
    S.settleFreighter(run, f);
    f.parked = true;   // the player took it off; it waits until they reassign it
    return { ok: true };
  };
  S.buyFreighter = function (run) {
    const cost = S.freighterCost(run);
    if (run.credits < cost) return { ok: false, reason: 'credits', cost };
    S.spend(run, cost);
    run.freightersBought++;
    return { ok: true, cost, f: S.addFreighter(run) };
  };
  S.boost = function (run) {
    if (run.boostCd > 0) return { ok: false, reason: 'cooldown', left: Math.ceil(run.boostCd) };
    run.boostT = C.abilities.boost.dur;
    run.boostCd = C.abilities.boost.cooldown;
    run.fx.push({ type: 'boost' });
    return { ok: true };
  };
  S.deflectCost = run => C.abilities.deflect.base + C.abilities.deflect.perQ * run.quarter;
  S.deflect = function (run, id) {
    const p = run.pending.find(x => x.kind === 'meteor' && x.id === id);
    if (!p) return { ok: false, reason: 'gone' };
    const cost = S.deflectCost(run);
    if (run.credits < cost) return { ok: false, reason: 'credits', cost };
    S.spend(run, cost);
    run.pending = run.pending.filter(x => x !== p);
    run.deflected++;
    run.banner = { text: 'METEOR DEFLECTED', col: 22, kind: 'good', t: 3 };
    run.fx.push({ type: 'deflect', id });
    S.logMoment(run, 'METEOR DEFLECTED', 'good');
    return { ok: true, cost };
  };
  S.acceptContract = function (run, c) {
    if (!c || c.accepted || !run.contracts.includes(c)) return { ok: false, reason: 'gone' };
    c.accepted = true;
    c.deadline = run.t + C.contracts.deadline;
    return { ok: true };
  };
  S.declineContract = function (run, c) {
    if (!c || !run.contracts.includes(c)) return { ok: false, reason: 'gone' };
    run.contracts = run.contracts.filter(x => x !== c);
    return { ok: true };
  };
  S.choosePerk = function (run, key) {
    if (!run.shop || run.shop.offers.indexOf(key) < 0) return { ok: false, reason: 'nooffer' };
    run.perks[key] = (run.perks[key] || 0) + 1;
    const M = run.mods;
    switch (key) {
      case 'bulk': M.cap += 0.4; break;
      case 'drives': M.speed += 0.25; break;
      case 'express': M.tripCost *= 0.6; break;
      case 'hydro': M.agri += 0.5; break;
      case 'deep': M.extract += 0.3; break;
      case 'trade': M.trade += 0.2; break;
      case 'rings': M.housing += 0.5; break;
      case 'favour': run.conf = Math.min(100, run.conf + 15); break;
      case 'grant': run.credits += 1200 + 300 * run.quarter; break;
      case 'fleet': S.addFreighter(run); S.addFreighter(run); break;
      case 'bonded': M.storage += 0.5; break;
      case 'automat': M.industry += 0.4; break;
      case 'taxes': M.tax += 0.25; break;
      case 'hulls': M.hulls = true; break;
      case 'leanup': M.facUpkeep *= 0.75; break;
      case 'survey': {
        M.claim *= 0.8;
        const next = run.bodies.filter(b => !b.found && !b.site).sort((a, b) => a.discoverAt - b.discoverAt)[0];
        if (next) S.discover(run, next);
        break;
      }
    }
    S.logMoment(run, 'PERK: ' + AS.PERKS[key].name.toUpperCase(), 'perk');
    run.shop = null;
    run.fx.push({ type: 'perk', key });
    return { ok: true };
  };

  /* ---------- the single action entry point (logged for replays) ---------- */
  S.act = function (run, name, a) {
    a = a || {};
    const body = id => S.getBody(run, id), route = id => S.getRoute(run, id);
    const contract = id => run.contracts.find(c => c.id === id) || null;
    let res;
    switch (name) {
      case 'claim': res = S.claimBody(run, body(a.id)); break;
      case 'build': res = S.buildFacility(run, body(a.id), a.slot, a.type); break;
      case 'demolish': res = S.demolishFacility(run, body(a.id), a.slot); break;
      case 'route': res = S.buildRoute(run, body(a.a), body(a.b)); break;
      case 'unroute': res = S.removeRoute(run, route(a.id), true); break;
      case 'assign': res = S.assignFreighter(run, route(a.id)); break;
      case 'recall': res = S.recallFreighter(run, route(a.id)); break;
      case 'buy': res = S.buyFreighter(run); break;
      case 'accept': res = S.acceptContract(run, contract(a.id)); break;
      case 'decline': res = S.declineContract(run, contract(a.id)); break;
      case 'perk': res = S.choosePerk(run, a.key); break;
      case 'boost': res = S.boost(run); break;
      case 'deflect': res = S.deflect(run, a.id); break;
      default: res = { ok: false, reason: 'unknown' };
    }
    if (run.actions && res.ok) run.actions.push([run.steps, name, a]);
    return res;
  };
})(globalThis.AS = globalThis.AS || {});
