/* ATLAS SYNDICATE v4 — sim/economy.js
   Production, construction, colonists, the Atlas Prime exchange, contracts payout, finance,
   and the megaproject site absorbing deliveries. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  S.earn = function (run, v) { v = U.fin(v); if (v <= 0) return; run.credits += v; run.totalIncome += v; run.qIncome += v; run.frameIncome += v; };
  S.spend = function (run, v) { v = U.fin(v); if (v <= 0) return; run.credits -= v; run.frameExpense += v; };

  S.updateMarket = function (run, dt) {
    const decay = Math.exp(-dt / C.market.satDecay);
    for (const g of AS.GOOD_KEYS) {
      const m = run.market[g];
      m.sat *= decay;
      if (m.swingT > 0) { m.swingT = Math.max(0, m.swingT - dt); if (m.swingT === 0) m.swing = 1; }
      if (m.spikeT > 0) { m.spikeT = Math.max(0, m.spikeT - dt); if (m.spikeT === 0) m.spike = 1; }
    }
    run.saleTimer += dt;
    if (run.saleTimer >= 1) {
      run.saleTimer -= 1;
      for (const g of AS.GOOD_KEYS) {
        const m = run.market[g];
        m.prev = m.price; m.price = S.marketPrice(run, g);
        m.trend = m.price > m.prev * 1.003 ? 1 : m.price < m.prev * 0.997 ? -1 : 0;
      }
      run.payTimer++;
      if (run.saleAcc >= 1 && run.payTimer >= 2) { run.fx.push({ type: 'pay', id: S.prime(run).id, value: Math.round(run.saleAcc) }); run.saleAcc = 0; run.payTimer = 0; }
    }
  };

  S.updateColony = function (run, b, dt) {
    const cap = S.storageCap(run, b);
    if (b.boomT > 0) b.boomT = Math.max(0, b.boomT - dt);
    if (b.blightT > 0) b.blightT = Math.max(0, b.blightT - dt);
    for (let i = 0; i < b.fac.length; i++) {
      const f = b.fac[i];
      if (!f) continue;
      const F = AS.FAC[f.type];
      if (f.build > 0) {
        f.build = Math.max(0, f.build - dt);
        f.status = 'build';
        if (f.build === 0) { f.status = 'ok'; run.fx.push({ type: 'built', id: b.id, slot: i, fac: f.type }); }
        continue;
      }
      if (f.broken > 0) { f.broken = Math.max(0, f.broken - dt); f.status = 'broken'; continue; }
      if (F.extract) {
        const g = F.extract.good;
        if (b.stock[g] >= cap) { f.status = 'full'; continue; }
        b.stock[g] = Math.min(cap, b.stock[g] + S.extractRate(run, b, f) * dt);
        f.status = 'ok';
      } else if (F.recipe) {
        const R = F.recipe;
        if (!f.busy) {
          let full = false, starved = false;
          for (const g in R.out) if (b.stock[g] + R.out[g] > cap) full = true;
          for (const g in R.in) if (b.stock[g] < R.in[g]) starved = true;
          if (full) { f.status = 'full'; continue; }
          if (starved) { f.status = 'starved'; continue; }
          for (const g in R.in) b.stock[g] -= R.in[g];
          f.busy = true; f.prog = 0;
        }
        const sp = S.recipeSpeed(run, b, f);
        f.status = sp > 0 ? 'ok' : 'broken';
        f.prog += U.safeDiv(dt * sp, F.time, 0);
        if (f.prog >= 1) {
          for (const g in R.out) b.stock[g] = Math.min(cap, b.stock[g] + R.out[g]);
          f.busy = false; f.prog = 0;
          if (f.type === 'fab' && !run.fx2.firstParts) { run.fx2.firstParts = true; S.logMoment(run, 'FIRST PARTS MADE ON ' + b.name, 'good'); }
        }
      } else f.status = 'ok';
    }
    const need = S.foodRate(run, b) * dt;
    const ate = Math.min(need, b.stock.food);
    b.stock.food -= ate;
    const wasStarving = b.starving;
    b.starving = need > 0 && ate < need * 0.999;
    if (b.starving && !wasStarving) run.fx.push({ type: 'starve', id: b.id });
    const capPop = S.housing(run, b);
    if (b.starving) b.pop = Math.max(0, b.pop - C.colony.decline * dt);
    else if (b.pop < capPop) b.pop = Math.min(capPop, b.pop + C.colony.growth * dt);
    else if (b.pop > capPop) b.pop = Math.max(capPop, b.pop - C.colony.decline * dt);
    if (b.prime) b.pop = Math.max(2, b.pop);
    S.earn(run, b.pop * C.colony.taxPer * run.mods.tax * dt);
    for (const g of AS.GOOD_KEYS) b.stock[g] = U.clamp(U.fin(b.stock[g]), 0, cap);
    if (!b.prime && b.pop < 0.5) S.loseColony(run, b);
  };

  S.loseColony = function (run, b) {
    for (const r of run.routes.slice()) if (r.a === b.id || r.b === b.id) S.removeRoute(run, r, false);
    b.claimed = false; b.pop = 0; b.starving = false;
    b.fac = new Array(b.slotsN).fill(null);
    for (const g of AS.GOOD_KEYS) b.stock[g] = 0;
    b.lostAt = run.t;
    run.coloniesLost++;
    run.conf -= C.board.colonyLostPenalty;
    run.banner = { text: b.name + ' ABANDONED - WORLD LOST', col: 17, kind: 'bad', t: 5 };
    run.fx.push({ type: 'lost', id: b.id });
    S.logMoment(run, b.name + ' LOST TO STARVATION', 'bad');
  };

  /* ---------- the exchange at Atlas Prime ---------- */
  S.updateExchange = function (run, dt) {
    const P = S.prime(run);
    for (const g of AS.GOOD_KEYS) {
      const amt = Math.min(P.stock[g] - P.keep[g], S.sellRate(run, g) * dt);
      if (amt <= 0) continue;
      const v = amt * S.marketPrice(run, g);
      P.stock[g] -= amt;
      run.market[g].sat += amt;
      run.stats.sold[g] += amt;
      S.earn(run, v);
      run.saleAcc += v;
    }
    const CC = C.contracts;
    for (const c of run.contracts.slice()) {
      if (!c.accepted) { if (run.t >= c.expires) run.contracts = run.contracts.filter(x => x !== c); continue; }
      const reserve = c.good === 'food' ? S.foodRate(run, P) * 20 : 0;
      const take = Math.min(c.qty - c.done, Math.max(0, P.stock[c.good] - reserve), CC.fulfilRate * dt);
      if (take > 0) { P.stock[c.good] -= take; c.done += take; }
      if (c.done >= c.qty - 1e-6) {
        S.earn(run, c.reward);
        run.conf = Math.min(100, run.conf + CC.confWin);
        run.contractsDone++;
        run.contracts = run.contracts.filter(x => x !== c);
        run.banner = { text: 'CONTRACT DONE +' + c.reward + ' CR', col: 13, kind: 'good', t: 3 };
        run.fx.push({ type: 'contract', ok: true, value: c.reward });
      } else if (run.t >= c.deadline) {
        run.conf -= CC.confFail;
        run.contractsFailed++;
        run.contracts = run.contracts.filter(x => x !== c);
        run.banner = { text: 'CONTRACT FAILED: ' + AS.GOODS[c.good].name + '  -' + CC.confFail + ' CONFIDENCE', col: 17, kind: 'bad', t: 4 };
        run.fx.push({ type: 'contract', ok: false });
        S.logMoment(run, 'CONTRACT FAILED (' + AS.GOODS[c.good].name + ')', 'bad');
      }
    }
  };

  S.updateFinance = function (run, dt) {
    const B = C.board;
    S.spend(run, S.upkeepRate(run) * dt);
    if (run.credits < 0) {
      S.spend(run, -run.credits * C.economy.debtInterest * dt);
      run.conf -= Math.min(B.debtDrainMax, B.debtDrain + B.debtDrainPer1k * -run.credits / 1000) * dt;
    }
    for (const b of run.bodies) if (b.claimed && b.starving) run.conf -= B.starveDrain * run.mods.starveMult * dt;
  };

  /* ---------- megaproject ---------- */
  S.megaStage = run => C.mega.stages[run.mega.stage] || null;
  S.megaRemaining = function (run, g) {
    const st = S.megaStage(run);
    if (!st || run.mega.state !== 'active' || !st.req[g]) return 0;
    return Math.max(0, st.req[g] - run.mega.done[g]);
  };
  S.megaFraction = function (run) {
    const M = C.mega;
    if (run.mega.state === 'done') return 1;
    let tot = 0, got = 0;
    M.stages.forEach((st, i) => {
      for (const g in st.req) {
        tot += st.req[g];
        if (i < run.mega.stage) got += st.req[g];
        else if (i === run.mega.stage) got += Math.min(st.req[g], run.mega.done[g]);
      }
    });
    return U.safeDiv(got, tot, 0);
  };
  S.stageFraction = function (run) {
    const st = S.megaStage(run);
    if (!st) return 1;
    let tot = 0, got = 0;
    for (const g in st.req) { tot += st.req[g]; got += Math.min(st.req[g], run.mega.done[g]); }
    return U.safeDiv(got, tot, 0);
  };
  S.unlockMega = function (run) {
    if (run.mega.state !== 'locked') return;
    const site = S.site(run), P = S.prime(run);
    run.mega.state = 'active';
    run.mega.unlockedAt = run.t;
    site.found = true; site.foundAt = run.t; site.claimed = true;
    // the Board funds the first link: a free route from Atlas Prime plus freighters on it
    const r = { id: run.nextId++, a: P.id, b: site.id, cost: S.routeCost(P, site), halted: 0, moved: 0, movedLog: [] };
    run.routes.push(r); run.routeMap.set(r.id, r);
    for (let i = 0; i < C.mega.freeFreighters; i++) S.assignFreighter(run, r, S.addFreighter(run));
    run.banner = { text: 'MEGAPROJECT UNLOCKED: ' + C.mega.name, col: 13, kind: 'mega', t: 6 };
    run.fx.push({ type: 'megaUnlock', id: site.id });
    S.logMoment(run, 'MEGAPROJECT UNLOCKED', 'mega');
  };
  /** Deliveries that reach the site are built straight into the structure. */
  S.updateSite = function (run) {
    const site = S.site(run);
    if (!site || run.mega.state !== 'active') return;
    const st = S.megaStage(run);
    const pay = C.mega.payFrac * (run.perks.gatefund ? 2 : 1);
    for (const g of AS.GOOD_KEYS) {
      const q = site.stock[g];
      if (q <= 0) continue;
      const use = Math.min(q, Math.max(0, (st.req[g] || 0) - run.mega.done[g]));
      site.stock[g] -= use;
      if (use > 0) {
        run.mega.done[g] += use;
        run.mega.delivered += use;
        const v = use * AS.GOODS[g].price * pay;
        S.earn(run, v);
        run.stats.megaPaid += v;
      }
      if (site.stock[g] > 0 && !st.req[g]) {   // anything this stage does not need is sold at the market price
        S.earn(run, site.stock[g] * S.marketPrice(run, g));
        site.stock[g] = 0;
      }
    }
    let complete = true;
    for (const g in st.req) if (run.mega.done[g] < st.req[g] - 1e-6) complete = false;
    if (!complete) return;
    run.mega.stageAt.push(Math.round(run.t));
    run.conf = Math.min(100, run.conf + C.mega.stageConf);
    run.credits += C.mega.stageGrant;
    S.logMoment(run, 'MEGAPROJECT STAGE ' + (run.mega.stage + 1) + ' (' + st.name + ') COMPLETE', 'mega');
    run.mega.stage++;
    for (const g of AS.GOOD_KEYS) { run.mega.done[g] = 0; site.stock[g] = 0; }
    if (run.mega.stage >= C.mega.stages.length) {
      run.mega.state = 'done';
      run.mega.completedAt = run.t;
      run.won = true; run.over = true; run.overReason = 'MEGAPROJECT COMPLETE';
      run.banner = { text: C.mega.name + ' COMPLETE', col: 14, kind: 'mega', t: 8 };
      run.fx.push({ type: 'megaDone', id: site.id });
      S.logMoment(run, C.mega.name + ' COMPLETE', 'mega');
    } else {
      run.banner = { text: 'STAGE ' + run.mega.stage + ' DONE - NEXT: ' + S.megaStage(run).name + '  +' + C.mega.stageConf + ' CONFIDENCE', col: 13, kind: 'mega', t: 5 };
      run.fx.push({ type: 'megaStage', id: site.id, stage: run.mega.stage });
    }
  };
})(globalThis.AS = globalThis.AS || {});
