/* ATLAS SYNDICATE v4 — sim/logistics.js
   Automatic freight: every world computes what it keeps and what it wants; freighters on a route
   carry surplus to where it is needed and everything else to Atlas Prime, which sells it. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  /** keep = local working reserve; want = what freighters should bring; Prime wants everything (it sells it). */
  S.computeLogistics = function (run) {
    for (const b of run.bodies) {
      if (!b.hold) b.hold = {};
      for (const g of AS.GOOD_KEYS) { b.incoming[g] = 0; b.keep[g] = 0; b.want[g] = 0; b.need[g] = 0; b.hold[g] = 0; }
    }
    for (const f of run.freighters) {
      if (!f.route || !f.load) continue;
      const dst = S.getBody(run, f.state === 'unload' ? f.at : f.to);
      if (dst) for (const g in f.cargo) dst.incoming[g] += f.cargo[g];
    }
    const P = S.prime(run);
    const order = run.bodies.filter(b => b.claimed && !b.prime);
    order.push(P);
    for (const b of order) {
      const cap = S.storageCap(run, b);
      if (b.site) {
        for (const g of AS.GOOD_KEYS) {
          b.want[g] = Math.min(cap, S.megaRemaining(run, g));
          b.need[g] = Math.max(0, b.want[g] - b.stock[g] - b.incoming[g]);
        }
        continue;
      }
      const rate = {};
      for (const g of AS.GOOD_KEYS) rate[g] = 0;
      for (const f of b.fac) {
        if (!f || f.build > 0) continue;
        const F = AS.FAC[f.type];
        if (!F.recipe) continue;
        const sp = Math.max(0.5, S.recipeSpeed(run, b, f));
        for (const g in F.recipe.in) rate[g] += F.recipe.in[g] / F.time * sp;
      }
      rate.food += S.foodRate(run, b);
      for (const g of AS.GOOD_KEYS) {
        let k = rate[g] * C.logistics.bufferSeconds;
        if (b.prime) {
          for (const c of run.contracts) if (c.good === g && c.accepted) k += c.qty - c.done;
          for (const N of S.neighbors(run, b)) if (!N.prime) b.hold[g] += N.need[g];   // a hub: hold what connected worlds and the megaproject need
        }
        b.keep[g] = Math.min(cap * 0.9, k + b.hold[g]);
        b.hold[g] = Math.min(b.hold[g], b.keep[g]);
        b.want[g] = b.keep[g] + (b.prime ? cap : 0);
        b.need[g] = Math.max(0, Math.min(cap, b.want[g]) - b.stock[g] - b.incoming[g]);
      }
    }
  };
  S.needFor = function (run, B, g, A) {
    if (!B.claimed) return 0;
    const cap = S.storageCap(run, B);
    let want = B.want[g];
    if (B.prime) for (const N of S.neighbors(run, B)) if (N !== A && N.claimed) want += N.need[g];   // Prime relays
    return Math.max(0, Math.min(want, cap) - B.stock[g] - B.incoming[g]);
  };
  /** What A can spare of g; goods Prime holds for a connected world count as spare on trips to that world. */
  S.surplus = function (A, g, B) {
    if (A.site) return 0;
    const extra = Math.max(0, A.stock[g] - A.keep[g]);
    if (!(B && A.prime && A.hold)) return extra;
    // goods earmarked for B (held back from local use) are always free to go to B
    const earmarked = Math.min(A.stock[g], A.hold[g], B.need[g]);
    return Math.min(A.stock[g], earmarked + extra);
  };

  S.planCargo = function (run, A, B, capLeft) {
    const items = [];
    for (const g of AS.GOOD_KEYS) {
      const q = Math.floor(Math.min(S.surplus(A, g, B), S.needFor(run, B, g, A)));
      if (q < 1) continue;
      let score = q / Math.max(1, B.want[g] + 1) + AS.GOODS[g].price * 0.01;
      if (g === 'food' && B.starving) score += 5;
      if (!B.prime && B.need[g] >= 1) score += 1;
      if (B.site) score += 1.5;
      if (B.prime && run.contracts.some(c => c.good === g && c.accepted)) score += 1;
      items.push({ g, q, score });
    }
    items.sort((p, q) => q.score - p.score || (p.g < q.g ? -1 : 1));
    const out = [];
    let left = capLeft, urgent = false;
    for (const it of items) {
      if (left <= 0) break;
      const q = Math.min(it.q, left);
      out.push({ g: it.g, q });
      left -= q;
      if (it.score >= 2) urgent = true;
    }
    return { items: out, total: capLeft - left, urgent };
  };

  S.settleFreighter = function (run, f) {
    // a freighter leaving its route delivers whatever it carries to its destination
    const dstId = f.state === 'unload' ? f.at : (f.state === 'transit' || f.state === 'load') ? f.to : 0;
    const dst = dstId ? S.getBody(run, dstId) : null;
    if (dst && dst.claimed) { const cap = S.storageCap(run, dst); for (const g in f.cargo) dst.stock[g] = Math.min(cap, dst.stock[g] + f.cargo[g]); }
    f.cargo = {}; f.load = 0; f.route = null; f.state = 'idle'; f.prog = 0; f.timer = 0; f.wait = 0;
  };

  S.updateFreighters = function (run, dt) {
    const FL = C.fleet;
    if (run.flareT > 0) run.flareT = Math.max(0, run.flareT - dt);
    if (run.fuelT > 0) run.fuelT = Math.max(0, run.fuelT - dt);
    for (const f of run.freighters) {
      if (!f.route) continue;
      const r = S.getRoute(run, f.route);
      if (!r) { S.settleFreighter(run, f); continue; }
      if ((r.halted > 0 || run.flareT > 0) && f.state !== 'unload') continue;
      if (f.state === 'transit') {
        f.prog += U.safeDiv(FL.speed * run.mods.speed * (run.boostT > 0 ? C.abilities.boost.mult : 1) * dt, f.dist, 1);
        if (f.prog >= 1) { f.prog = 1; f.at = f.to; f.state = 'unload'; f.timer = FL.unloadTime; run.fx.push({ type: 'arrive', fid: f.id, id: f.at }); }
      } else if (f.state === 'unload') {
        f.timer -= dt;
        if (f.timer <= 0) {
          const B = S.getBody(run, f.at);
          if (B && B.claimed) {
            const cap = S.storageCap(run, B);
            for (const g in f.cargo) B.stock[g] = Math.min(cap, B.stock[g] + f.cargo[g]);
            if (f.load) {
              r.moved += f.load; r.movedLog.push([run.t, f.load]);
              run.stats.delivered += f.load;
              run.fx.push({ type: 'drop', id: B.id, fid: f.id, load: f.load, prime: B.prime, site: B.site });
            }
          }
          f.cargo = {}; f.load = 0; f.state = 'dock'; f.timer = 0.2; f.wait = 0;
        }
      } else if (f.state === 'load') {
        f.timer -= dt;
        if (f.timer <= 0) S.depart(run, f);
      } else if (f.state === 'dock') {
        f.timer -= dt;
        if (f.timer <= 0) S.decide(run, f, r);
      }
    }
    for (const r of run.routes) while (r.movedLog.length && r.movedLog[0][0] < run.t - 60) r.movedLog.shift();
  };

  S.decide = function (run, f, r) {
    const FL = C.fleet;
    const A = S.getBody(run, f.at), B = S.getBody(run, f.at === r.a ? r.b : r.a);
    if (!A || !B) { S.settleFreighter(run, f); return; }
    const capL = S.capacity(run);
    const plan = S.planCargo(run, A, B, capL);
    if (plan.total > 0 && (plan.total >= capL * FL.minLoadFrac || plan.urgent || f.wait >= FL.patience)) {
      f.cargo = {}; f.load = 0;
      for (const it of plan.items) { A.stock[it.g] -= it.q; f.cargo[it.g] = (f.cargo[it.g] || 0) + it.q; f.load += it.q; B.incoming[it.g] += it.q; }
      f.from = A.id; f.to = B.id; f.state = 'load'; f.timer = FL.dockTime; f.wait = 0;
      return;
    }
    if (plan.total === 0) {
      const back = S.planCargo(run, B, A, capL);
      const covered = run.freighters.some(o => o !== f && o.route === r.id &&
        ((o.state === 'transit' && o.to === B.id) || (o.state !== 'transit' && o.at === B.id)));
      if (back.total > 0 && !covered) { f.cargo = {}; f.load = 0; f.from = A.id; f.to = B.id; S.depart(run, f); return; }
    }
    f.wait += FL.recheck;
    f.timer = FL.recheck;
  };

  S.depart = function (run, f) {
    const A = S.getBody(run, f.from), B = S.getBody(run, f.to);
    if (!A || !B) { S.settleFreighter(run, f); return; }
    f.dist = Math.max(4, S.planeDist(A, B));
    const c = S.tripCost(run, f.dist, A, B);
    S.spend(run, c);
    run.tripSpend += c;
    f.prog = 0; f.state = 'transit'; f.timer = 0;
    run.fx.push({ type: 'launch', fid: f.id, id: A.id });
  };
})(globalThis.AS = globalThis.AS || {});
