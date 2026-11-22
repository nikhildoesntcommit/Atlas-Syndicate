/* ATLAS SYNDICATE v4 — sim/events.js
   The director: discovery waves, contracts, random events (some announced in advance),
   quarterly Board reviews with perk offers, and the megaproject unlock. */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  S.director = function (run) {
    const m = run.t / 60;
    for (const b of run.bodies) if (!b.found && !b.site && b.discoverAt > 0 && run.t >= b.discoverAt) S.discover(run, b);
    if (run.t >= run.nextContract) {
      if (run.contracts.length < C.contracts.maxActive) S.spawnContract(run);
      const CC = C.contracts;
      const gap = Math.max(CC.intervalMin, CC.intervalStart - CC.intervalDecPerMin * m);
      run.nextContract = run.t + gap * (0.85 + run.rng() * 0.3);
    }
    for (const p of run.pending.slice()) if (run.t >= p.at) { run.pending = run.pending.filter(x => x !== p); S.resolvePending(run, p); }
    if (run.t >= run.nextEvent) {
      S.triggerEvent(run);
      const E = C.events;
      const gap = Math.max(E.intervalMin, E.intervalMax - E.intervalDecPerMin * Math.max(0, m - E.startAt / 60));
      run.nextEvent = run.t + gap * (0.8 + run.rng() * 0.4);
    }
    const SC = S.sysCfg(run);
    if (run.mega.state === 'locked' && run.t - run.sysStart >= SC.unlock && S.colonies(run).length >= SC.minWorlds) S.unlockMega(run);
    if (run.t >= run.nextQuarter) S.quarterlyReview(run);
  };

  S.discover = function (run, b) {
    if (b.found) return;
    b.found = true; b.foundAt = run.t; b.discoverAt = 0;
    run.banner = { text: 'NEW WORLD FOUND: ' + b.name, col: 13, kind: 'info', t: 4 };
    run.fx.push({ type: 'discover', id: b.id });
    S.logMoment(run, 'FOUND ' + b.name, 'find');
  };

  S.spawnContract = function (run) {
    const CC = C.contracts, m = run.t / 60;
    const opts = [];
    for (const g of AS.GOOD_KEYS) {
      if (run.contracts.some(c => c.good === g)) continue;
      if (S.productionRate(run, g) < CC.minRate) continue;
      opts.push([g, 1 + Math.log(1 + AS.GOODS[g].price) * 0.3]);
    }
    const g = U.pickWeighted(run.rng, opts);
    if (!g) return;
    const qty = Math.max(CC.minQty, Math.round(S.productionRate(run, g) * CC.outputSeconds * (1 + CC.outputGrowthPerMin * m)));
    const reward = Math.round((qty * AS.GOODS[g].price * CC.rewardMult + CC.rewardBase) * run.mods.contractPay);
    run.contracts.push({ id: run.nextId++, good: g, qty, done: 0, accepted: false, expires: run.t + CC.offerTime, deadline: 0, reward });
    run.banner = { text: 'CONTRACT OFFER: ' + qty + ' ' + AS.GOODS[g].name + ' FOR ' + reward + ' CR', col: 13, kind: 'info', t: 3.5 };
    run.fx.push({ type: 'offer' });
  };

  function severity(run) { return 1 + C.events.sevPerQuarter * run.quarter; }

  S.triggerEvent = function (run) {
    const E = C.events, M = run.mods, q = run.quarter;
    const manned = run.routes.filter(r => S.routeFreighters(run, r).length > 0 && r.halted <= 0);
    const carrying = run.freighters.filter(f => f.route && f.state === 'transit' && f.load > 0);
    const working = [];
    for (const b of run.bodies) if (b.claimed && !b.site) b.fac.forEach((f, i) => {
      if (f && f.build <= 0 && !AS.FAC[f.type].housing && !AS.FAC[f.type].storage && f.broken <= 0) working.push([b, i]);
    });
    const cols = S.colonies(run);
    const extractors = cols.filter(b => b.fac.some(f => f && AS.FAC[f.type].extract && f.build <= 0));
    const roomy = cols.filter(b => !b.starving && b.pop < S.housing(run, b));
    const farms = cols.filter(b => b.fac.some(f => f && f.type === 'agri' && f.build <= 0) && b.blightT <= 0);
    const struck = cols.filter(b => !b.prime && b.fac.some(f => f && f.build <= 0));
    const opts = [['swing', E.swing.w * M.swingFreq], ['spike', E.spike.w]];
    if (manned.length) opts.push(['storm', E.storm.w * M.hazardMult]);
    if (manned.length && q >= E.flare.minQ && !run.pending.some(p => p.kind === 'flare')) opts.push(['flare', E.flare.w]);
    if (carrying.length && !M.hulls) opts.push(['cargo', E.cargo.w * M.hazardMult]);
    if (working.length) opts.push(['breakdown', E.breakdown.w]);
    if (struck.length && q >= E.meteor.minQ) opts.push(['meteor', E.meteor.w]);
    if (run.routes.length >= 2) opts.push(['fuel', E.fuel.w]);
    if (extractors.length) opts.push(['boom', E.boom.w]);
    if (roomy.length) opts.push(['immigrants', E.immigrants.w]);
    if (farms.length && q >= 1) opts.push(['blight', E.blight.w]);
    const kind = U.pickWeighted(run.rng, opts);
    const pick = arr => arr[Math.floor(run.rng() * arr.length)];
    const sev = severity(run);
    run.eventsFired++;
    run.lastEvent = kind;
    let text = '', col = 18, k = 'bad';
    if (kind === 'storm') {
      const r = pick(manned);
      r.halted = Math.round(E.storm.dur * sev);
      text = 'SOLAR STORM: ROUTE ' + S.getBody(run, r.a).name + ' - ' + S.getBody(run, r.b).name + ' STOPPED ' + r.halted + 'S';
      run.fx.push({ type: 'storm', rid: r.id });
    } else if (kind === 'flare') {
      run.pending.push({ kind: 'flare', at: run.t + E.warn });
      text = 'WARNING: SOLAR FLARE IN ' + E.warn + 'S - ALL FREIGHTERS WILL STOP'; col = 13; k = 'warn';
      run.fx.push({ type: 'warn', kind: 'flare' });
    } else if (kind === 'cargo') {
      const f = pick(carrying), lost = f.load, dst = S.getBody(run, f.to);
      if (dst) for (const g in f.cargo) dst.incoming[g] = Math.max(0, dst.incoming[g] - f.cargo[g]);
      f.cargo = {}; f.load = 0;
      text = 'CARGO LOSS: A FREIGHTER LOST ' + lost + ' UNITS';
      run.fx.push({ type: 'cargo', fid: f.id });
    } else if (kind === 'breakdown') {
      const weighted = working.map(w => [w, S.has(w[0], 'unstable') ? 3 : 1]);
      const [b, i] = U.pickWeighted(run.rng, weighted);
      b.fac[i].broken = Math.round(E.breakdown.dur * sev);
      text = 'BREAKDOWN: ' + AS.FAC[b.fac[i].type].name + ' ON ' + b.name + ' STOPPED ' + b.fac[i].broken + 'S';
      run.fx.push({ type: 'breakdown', id: b.id, slot: i });
    } else if (kind === 'meteor') {
      const b = U.pickWeighted(run.rng, struck.map(w => [w, S.has(w, 'unstable') ? 3 : 1]));
      run.pending.push({ kind: 'meteor', at: run.t + E.warn, id: b.id });
      text = 'WARNING: METEOR STRIKE ON ' + b.name + ' IN ' + E.warn + 'S'; col = 13; k = 'warn';
      run.fx.push({ type: 'warn', kind: 'meteor', id: b.id });
    } else if (kind === 'fuel') {
      run.fuelT = Math.round(E.fuel.dur * sev);
      text = 'FUEL SHORTAGE: TRIP COSTS X' + E.fuel.mult + ' FOR ' + run.fuelT + 'S';
    } else if (kind === 'boom') {
      const b = pick(extractors);
      b.boomT = E.boom.dur;
      text = 'RICH SEAM: ' + b.name + ' EXTRACTION X' + E.boom.mult + ' FOR ' + E.boom.dur + 'S'; col = 22; k = 'good';
      run.fx.push({ type: 'boom', id: b.id });
    } else if (kind === 'immigrants') {
      const b = pick(roomy);
      const n = Math.round(E.immigrants.n * (1 + q * 0.1));
      b.pop = Math.min(S.housing(run, b), b.pop + n);
      text = 'IMMIGRATION: +' + n + ' COLONISTS ON ' + b.name; col = 22; k = 'good';
    } else if (kind === 'blight') {
      const b = pick(farms);
      b.blightT = Math.round(E.blight.dur * sev);
      text = 'CROP BLIGHT: AGRI DOMES ON ' + b.name + ' STOPPED ' + b.blightT + 'S';
      run.fx.push({ type: 'blight', id: b.id });
    } else if (kind === 'spike') {
      const sold = AS.GOOD_KEYS.filter(g => S.productionRate(run, g) > 0.05);
      const g = sold.length ? pick(sold) : pick(AS.GOOD_KEYS), mk = run.market[g];
      mk.spike = E.spike.mult; mk.spikeT = E.spike.dur;
      text = 'DEMAND SPIKE: ' + AS.GOODS[g].name + ' SELLS X' + E.spike.mult + ', TWICE AS FAST, ' + E.spike.dur + 'S'; col = 22; k = 'good';
    } else {
      const g = pick(AS.GOOD_KEYS), mk = run.market[g];
      const lo = 1 - (1 - E.swing.min) * M.swingPow, hi = 1 + (E.swing.max - 1) * M.swingPow;
      mk.swing = Math.round(U.clamp(lo + run.rng() * (hi - lo), 0.2, 3) * 10) / 10;
      mk.swingT = E.swing.dur;
      text = 'PRICE SWING: ' + AS.GOODS[g].name + ' X' + mk.swing.toFixed(1) + ' FOR ' + E.swing.dur + 'S';
      col = mk.swing >= 1 ? 22 : 18; k = mk.swing >= 1 ? 'good' : 'bad';
    }
    if (AS.HARMFUL[kind] && run.perks.insure) S.insurePay(run);
    run.banner = { text, col, kind: k, t: 4.5 };
    run.fx.push({ type: 'event', kind });
  };

  /** Insurance pays into credits, but does not count as revenue towards the Board's targets. */
  S.insurePay = function (run) { run.credits += 150 * run.perks.insure * Math.max(1, Math.min(run.quarter, 8)); };

  S.resolvePending = function (run, p) {
    const E = C.events;
    if (p.kind === 'flare') {
      run.flareT = Math.round(E.flare.dur * severity(run));
      run.banner = { text: 'SOLAR FLARE: ALL FREIGHTERS STOPPED ' + run.flareT + 'S', col: 18, kind: 'bad', t: 4.5 };
      run.fx.push({ type: 'flare' });
      S.logMoment(run, 'SOLAR FLARE STOPPED ALL FREIGHT', 'bad');
      if (run.perks.insure) S.insurePay(run);
    } else if (p.kind === 'meteor') {
      const b = S.getBody(run, p.id);
      if (!b || !b.claimed) return;
      const slots = [];
      b.fac.forEach((f, i) => { if (f && f.build <= 0) slots.push(i); });
      U.shuffle(run.rng, slots);
      const hit = slots.slice(0, 1 + (run.quarter >= 5 ? 1 : 0));
      for (const i of hit) b.fac[i].broken = Math.round(E.meteor.dur * severity(run));
      for (const g of AS.GOOD_KEYS) b.stock[g] *= 1 - E.meteor.stockLoss;
      run.banner = { text: 'METEOR STRIKE ON ' + b.name + ': ' + hit.length + ' FACILITY STOPPED, STOCK -30%', col: 18, kind: 'bad', t: 4.5 };
      run.fx.push({ type: 'meteor', id: b.id });
      S.logMoment(run, 'METEOR STRIKE ON ' + b.name, 'bad');
      if (run.perks.insure) S.insurePay(run);
    }
  };

  S.perkOffers = function (run) {
    const keys = AS.PERK_KEYS.filter(k => {
      if (k === 'hulls' && run.mods.hulls) return false;
      if (k === 'gatefund' && run.sys === 0 && run.sq < 1) return false;
      if (k === 'survey' && !run.bodies.some(b => !b.found && !b.site)) return false;
      if ((k === 'overtime' || k === 'momentum' || k === 'insure' || k === 'integrate') && run.perks[k] >= 2) return false;
      return true;
    });
    U.shuffle(run.rng, keys);
    return keys.slice(0, run.mods.perkChoices);
  };

  S.quarterlyReview = function (run) {
    const B = C.board;
    const revenue = Math.round(run.qIncome), target = Math.round(run.target);
    const met = revenue >= target;
    const delta = met ? B.hitBonus : -Math.min(B.missMax, Math.round(B.missScale * (1 - U.safeDiv(revenue, target, 0))));
    run.conf = U.clamp(run.conf + delta, 0, 100);
    run.quarter++;
    run.sq++;
    if (met) { run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak); } else run.streak = 0;
    const growth = run.sq < 4 ? B.targetGrowth : B.targetGrowthLate;
    run.lastReview = { quarter: run.quarter, revenue, target, met, delta, conf: Math.round(run.conf), next: Math.round(run.target * growth) };
    run.target *= growth;
    run.qIncome = 0;
    run.nextQuarter += B.quarterSeconds;
    S.logMoment(run, 'Q' + run.quarter + ' ' + (met ? 'TARGET MET' : 'TARGET MISSED') + ' (' + U.fmtNum(revenue) + '/' + U.fmtNum(target) + ')', met ? 'good' : 'bad');
    run.fx.push({ type: 'quarter', met });
    if (run.conf <= 0) { run.over = true; run.overReason = 'DISMISSED AT QUARTERLY REVIEW'; return; }
    run.shop = { offers: S.perkOffers(run) };
  };
})(globalThis.AS = globalThis.AS || {});
