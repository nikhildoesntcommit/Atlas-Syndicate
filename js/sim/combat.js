/* ATLAS SYNDICATE v6 — sim/combat.js
   Armies move only along hyperlanes. Arriving at a hostile system starts a battle that resolves over a
   few seconds in visible dice rounds. Odds are estimated with the same battle model, so the "68% to win"
   the player sees is the number the AI uses too. Capture, raids, retreats and elimination live here. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, K = C.combat;
  let BASE = null;
  S.initCombat = () => { BASE = S.baseMods(); };

  /* ---------- strength ---------- */
  S.soldierPower = (vet, m, f) => (1 + U.clamp(vet, 0, 1) * m.vetBonus) * (f && f.hungry ? C.army.hungerMult : 1);   // hungry soldiers fight at 75%
  S.shipPower = (m, f) => (f && f.noFuel ? 0 : C.equip.shipPower * m.shipPower);                                        // no fuel: warships go dark
  /** Attacking strength of a stack (army or battle attacker). */
  S.stackStrength = function (run, st) {
    const f = run.factions[st.owner], m = f.mods;
    return (st.n * S.soldierPower(st.vet, m, f) + (st.sdur > 0 ? st.ships * S.shipPower(m, f) : 0)) * m.attack;
  };
  /** Strength a system defends with: garrison, warships, platforms, militia, defender bonus, capital bonus. */
  S.defStrength = function (run, sys) {
    const own = sys.owner >= 0 ? run.factions[sys.owner] : null;
    const m = own ? own.mods : BASE;
    const g = sys.gar;
    let st = g.n * S.soldierPower(g.vet, m, own) + (g.sdur > 0 ? g.ships * S.shipPower(m, own) : 0);
    if (sys.plat.n && sys.plat.dur > 0) st += sys.plat.n * C.equip.platformPower * m.platPower;
    st += sys.mil || 0;
    let mult = m.defBonus * m.def;
    if (own && sys.capital === sys.owner && run.t < C.game.endgame) mult *= K.capitalBonus * m.capital;   // from 18:00 capitals stand exposed
    return st * mult;
  };
  /** Garrison strength without the defender multipliers (what an army sent from here would be worth). */
  S.garStrength = function (run, sys) {
    if (sys.owner < 0) return S.defStrength(run, sys);
    const f = run.factions[sys.owner], m = f.mods, g = sys.gar;
    return g.n * S.soldierPower(g.vet, m, f) + (g.sdur > 0 ? g.ships * S.shipPower(m, f) : 0);
  };
  S.sizeBand = v => (v < 15 ? 'S' : v < 40 ? 'M' : 'L');

  /* ---------- odds: Monte Carlo over the battle model, cached, deterministic ---------- */
  const oddsCache = new Map();
  S.oddsRaw = function (A, D, mode) {
    A = Math.max(0, A); D = Math.max(0, D);
    const key = Math.round(A * 2) + '|' + Math.round(D * 2) + '|' + mode;
    const hit = oddsCache.get(key);
    if (hit) return hit;
    if (A <= 0) { const r = { p: 0, lo: 0, hi: 0, mean: 0, rounds: 0 }; return r; }
    if (D <= 0) { const r = { p: 1, lo: 0, hi: 0, mean: 0, rounds: 0 }; oddsCache.set(key, r); return r; }
    const rng = U.rng(((Math.round(A * 7) * 73856093) ^ (Math.round(D * 7) * 19349663) ^ (mode === 'raid' ? 83492791 : 0)) >>> 0 || 1);
    const N = 160, losses = [];
    let wins = 0, rounds = 0;
    const d3 = () => 3 + Math.floor(rng() * 6) + Math.floor(rng() * 6) + Math.floor(rng() * 6);
    for (let t = 0; t < N; t++) {
      let a = A, d = D, r = 0;
      const limit = mode === 'raid' ? K.raidRounds : K.maxRounds;
      while (a > 0.25 && d > 0.25 && r < limit) {
        const ra = d3(), rd = d3();
        const da = d * K.k * rd / 10.5, dd = a * K.k * ra / 10.5;
        a -= da; d -= dd; r++;
      }
      rounds += r;
      const won = mode === 'raid' ? a > 0.25 : d <= 0.25 && a > 0.25;
      if (won) { wins++; losses.push(A - Math.max(0, a)); }
    }
    losses.sort((x, y) => x - y);
    const q = f => (losses.length ? losses[Math.min(losses.length - 1, Math.floor(losses.length * f))] : A);
    const res = { p: wins / N, lo: q(0.2), hi: q(0.8), mean: losses.length ? losses.reduce((x, y) => x + y, 0) / losses.length : A, rounds: rounds / N };
    if (oddsCache.size > 20000) oddsCache.clear();
    oddsCache.set(key, res);
    return res;
  };
  /** Odds for a concrete order: stack attacking system. Losses reported in soldiers. */
  S.odds = function (run, st, sys, mode) {
    const A = S.stackStrength(run, st), D = S.defStrength(run, sys);
    const r = S.oddsRaw(A, D, mode || 'attack');
    const per = Math.max(0.01, U.safeDiv(A, st.n + (st.ships * 5), 1));
    return { p: r.p, lossLo: Math.round(r.lo / per), lossHi: Math.max(Math.round(r.lo / per), Math.round(r.hi / per)), att: A, def: D, rounds: r.rounds };
  };

  /* ---------- orders ---------- */
  S.laneTime = function (run, owner, a, b) {
    const l = S.laneBetween(run, a, b);
    const f = run.factions[owner];
    let sp = C.army.speed * f.mods.speed;
    if (run.systems[a].owner === owner && run.systems[b].owner === owner) sp *= f.mods.interior;
    return (l ? l.len : 60) / sp;
  };
  /** Send part of a garrison along lanes. Through own systems only; the last hop may attack. */
  S.sendArmy = function (run, fid, fromId, toId, frac, mode) {
    const from = run.systems[fromId], to = run.systems[toId];
    if (!from || !to || from.owner !== fid) return { ok: false, reason: 'notyours' };
    if (fromId === toId) return { ok: false, reason: 'same' };
    if (from.battle) return { ok: false, reason: 'underattack' };
    const hostile = to.owner !== fid;
    if (hostile && run.t < C.game.protect) return { ok: false, reason: 'protected' };
    if (hostile && to.owner >= 0 && S.truceBlocks(run, fid, to.owner)) return { ok: false, reason: 'truce' };
    const path = S.path(run, fromId, toId, fid);
    if (!path) return { ok: false, reason: 'nopath' };
    frac = U.clamp(U.fin(frac, 1), 0.05, 1);
    const g = from.gar, f = run.factions[fid];
    const n = frac >= 1 ? g.n : Math.round(g.n * frac), ships = frac >= 1 ? g.ships : Math.round(g.ships * frac);
    if (n + ships <= 0) return { ok: false, reason: 'empty' };
    // fuel: every lane costs fuel, more for a bigger army
    const fuel = S.armyFuel(run, f, n + ships * 5, path.length - 1);
    if (f.fuel < fuel) return { ok: false, reason: 'nofuel', fuel };
    f.fuel -= fuel; f.stats.fuelUsed += fuel;
    mode = hostile ? (mode === 'raid' ? 'raid' : 'attack') : 'move';
    g.n -= n; g.ships -= ships;
    const a = { id: run.nextId++, owner: fid, n, vet: g.vet, ships, sdur: g.sdur, path, seg: 0, prog: 0, mode, origin: path[path.length - 2], dest: toId, wait: 0, born: run.t };
    if (g.n <= 0) g.vet = 0;
    run.armies.push(a);
    run.fx.push({ type: 'depart', sys: fromId, to: toId, owner: fid, n: n + ships, mode, army: a.id });
    if (hostile) run.factions[fid].stats.attacks++;
    return { ok: true, army: a };
  };

  /* ---------- movement ---------- */
  S.stepArmies = function (run, dt) {
    for (const a of run.armies.slice()) {
      if (run.armies.indexOf(a) < 0) continue;
      if (a.wait > 0) { a.wait -= dt; if (a.wait <= 0) arrive(run, a); continue; }
      const from = a.path[a.seg], to = a.path[a.seg + 1];
      const T = Math.max(0.5, S.laneTime(run, a.owner, from, to));
      a.prog += dt / T;
      if (a.prog < 1) continue;
      a.prog = 1;
      const node = run.systems[to];
      const partner = node.owner >= 0 && node.owner !== a.owner && S.truceBlocks(run, a.owner, node.owner);   // coalition partners let each other through
      if (a.seg + 1 < a.path.length - 1 && ((node.owner === a.owner && !node.battle) || partner)) {
        const next = S.laneBetween(run, to, a.path[a.seg + 2]);
        if (S.laneOpen(run, next)) { a.seg++; a.prog = 0; continue; }
        a.dest = to;   // lane closed ahead: stop here
      }
      if (a.seg + 1 < a.path.length - 1) a.dest = to;
      arrive(run, a);
    }
  };
  function removeArmy(run, a) { const i = run.armies.indexOf(a); if (i >= 0) run.armies.splice(i, 1); }
  function mergeInto(g, a) {
    const tot = g.n + a.n;
    g.vet = U.safeDiv(g.vet * g.n + a.vet * a.n, tot, 0);
    g.sdur = U.safeDiv(g.sdur * g.ships + a.sdur * a.ships, g.ships + a.ships, 100);
    g.n = tot; g.ships += a.ships;
  }
  function arrive(run, a) {
    const sysId = a.path[a.seg + 1], s = run.systems[sysId];
    if (s.owner === a.owner) {
      if (s.battle) {   // join the defence
        mergeInto(s.gar, a);
      } else mergeInto(s.gar, a);
      removeArmy(run, a);
      run.fx.push({ type: 'arrive', sys: sysId, owner: a.owner });
      return;
    }
    if (a.mode === 'move' || a.mode === 'return') a.mode = 'attack';   // the destination changed hands on the way
    if (s.battle) {
      const b = run.battles.find(x => x.id === s.battle);
      if (b && b.att.owner === a.owner) { mergeInto(b.att, a); b.att.n0 += a.n; removeArmy(run, a); return; }
      a.wait = 1.0;   // someone else is fighting here: hold at the edge and look again
      return;
    }
    if (run.t < C.game.protect) {   // cannot happen through orders, but be safe: turn back
      return turnBack(run, a);
    }
    startBattle(run, a, s);
    removeArmy(run, a);
  }
  function turnBack(run, a) {
    const back = S.neighbours(run, a.path[a.seg + 1]).find(n => run.systems[n].owner === a.owner);
    if (back === undefined) { removeArmy(run, a); return; }
    a.path = [a.path[a.seg + 1], back]; a.seg = 0; a.prog = 0; a.mode = 'move'; a.dest = back; a.wait = 0;
  }

  /* ---------- battles ---------- */
  function startBattle(run, a, s) {
    const b = {
      id: run.nextId++, sys: s.id, defOwner: s.owner, t0: run.t, next: K.round * 0.75, rounds: 0,
      att: { owner: a.owner, n: a.n, vet: a.vet, ships: a.ships, sdur: a.sdur, mode: a.mode, origin: a.origin, n0: a.n, carry: 0 },
      def0: s.gar.n, defCarry: 0, a0: 0, d0: 0, last: null, wasCapital: s.capital >= 0 && s.capital === s.owner,
    };
    b.a0 = S.stackStrength(run, b.att); b.d0 = S.defStrength(run, s);
    b.lead = S.leaderRaw ? S.leaderRaw(run) : -1;
    if (s.owner >= 0 && a.owner >= 0) {
      if (!run.stats.firstAttackAny) run.stats.firstAttackAny = Math.round(run.t);
      if (s.owner === 0) {   // was the player's side warned in time?
        run.stats.attacksOnPlayer++;
        if (!run.stats.firstAttackOnPlayer) run.stats.firstAttackOnPlayer = Math.round(run.t);
        const ws = run.warnHist.filter(w => w.owner === a.owner && run.t - w.t0 <= 90);
        const near = w => w.sys === s.id || S.neighbours(run, s.id).indexOf(w.sys) >= 0;
        if (ws.some(w => w.kind === 'mass' && near(w) && run.t - w.t0 >= 8)) run.stats.massWarned++;
        if (ws.some(w => near(w) && run.t - w.t0 >= 4)) run.stats.warnedAttacks++;
      }
    }
    run.battles.push(b);
    s.battle = b.id;
    s.lastBattle = run.t;
    run.fx.push({ type: 'battle', sys: s.id, owner: a.owner, def: s.owner, mode: a.mode, size: b.a0 + b.d0 });
    if (s.owner >= 0) run.factions[s.owner].stats.attacked++;
  }
  const d6 = run => 1 + Math.floor(run.rng() * 6);
  /** Apply strength damage to a stack of soldiers + ships (+ platforms and militia for a defender). */
  function hurt(run, st, dmg, m, carryKey, holder, sys) {
    const sp = S.soldierPower(st.vet, m), shp = S.shipPower(m);
    const solP = st.n * sp, shipP = st.sdur > 0 ? st.ships * shp : 0;
    const platP = sys && sys.plat.n && sys.plat.dur > 0 ? sys.plat.n * C.equip.platformPower * m.platPower : 0;
    const milP = sys ? (sys.mil || 0) : 0;
    const tot = solP + shipP + platP + milP;
    if (tot <= 0) return 0;
    if (shipP > 0) st.sdur = Math.max(0, st.sdur - dmg * shipP / tot / shipP * 100 * 0.55);
    if (platP > 0) sys.plat.dur = Math.max(0, sys.plat.dur - dmg * platP / tot / platP * 100 * 0.45);
    if (milP > 0) sys.mil = Math.max(0, milP - dmg * milP / tot);
    const want = dmg * solP / tot / sp + holder[carryKey];
    const lost = Math.min(st.n, Math.floor(want));
    holder[carryKey] = want - lost;
    st.n -= lost;
    if (st.n <= 0) holder[carryKey] = 0;
    return lost;
  }
  S.stepBattles = function (run, dt) {
    for (const b of run.battles.slice()) {
      if (run.battles.indexOf(b) < 0) continue;   // ended by another battle this step (elimination)
      b.next -= dt;
      if (b.next > 0) continue;
      b.next += K.round;
      round(run, b);
    }
  };
  function round(run, b) {
    const s = run.systems[b.sys], att = b.att;
    const af = run.factions[att.owner], am = af.mods;
    const dm = s.owner >= 0 ? run.factions[s.owner].mods : S.baseMods();
    const A = S.stackStrength(run, att), D = S.defStrength(run, s);
    const ad = [d6(run), d6(run), d6(run)], dd = [d6(run), d6(run), d6(run)];
    const ra = ad[0] + ad[1] + ad[2], rd = dd[0] + dd[1] + dd[2];
    const toDef = A * K.k * ra / 10.5, toAtt = D * K.k * rd / 10.5;
    // the defender multiplier boosts damage dealt, not hit points, so damage taken is split over raw strength
    const al = hurt(run, att, toAtt / am.attack, am, 'carry', att, null);
    const dl = hurt(run, s.gar, toDef / Math.max(0.01, dm.defBonus * dm.def * (s.capital === s.owner && s.owner >= 0 && run.t < C.game.endgame ? K.capitalBonus * dm.capital : 1)), dm, 'defCarry', b, s);
    S.damageBuildings(run, s, att.mode === 'raid' ? C.dur.raidDmg : C.dur.battleDmg, att.mode === 'raid');
    let loot = 0;
    if (att.mode === 'raid' && ra > rd) {
      loot = K.raidLoot;
      if (s.owner >= 0) { const df = run.factions[s.owner]; loot = Math.max(0, Math.min(loot, Math.floor(df.credits))); df.credits -= loot; }
      af.credits += loot; af.stats.loot += loot;
    }
    b.rounds++;
    b.last = { ad, dd, al, dl, loot, t: run.t };
    run.fx.push({ type: 'round', sys: s.id, battle: b.id, ad, dd, al, dl, owner: att.owner, def: s.owner });
    af.stats.lost += al; af.stats.killed += dl;
    if (s.owner >= 0) { run.factions[s.owner].stats.lost += dl; run.factions[s.owner].stats.killed += al; }
    const attAlive = att.n > 0 || (att.ships > 0 && att.sdur > 0);
    const defAlive = S.defStrength(run, s) > 0.25;
    if (!attAlive) return endBattle(run, b, 'def');
    if (!defAlive) return endBattle(run, b, att.mode === 'raid' ? 'raid' : 'att');
    if (att.mode === 'raid' && b.rounds >= K.raidRounds) return endBattle(run, b, 'raid');
    if (b.rounds >= K.maxRounds) return S.retreat(run, att.owner, b.id, true);
  }
  function record(run, b, winner) {
    const size = b.a0 + b.d0;
    run.battleLog.push({ t: Math.round(b.t0), sys: b.sys, att: b.att.owner, def: b.defOwner, mode: b.att.mode, size: Math.round(size), winner, rounds: b.rounds, capital: b.wasCapital, lead: b.lead });
    if (run.battleLog.length > 400) run.battleLog.shift();
  }
  function endBattle(run, b, result) {
    const s = run.systems[b.sys], att = b.att;
    const af = run.factions[att.owner];
    run.battles = run.battles.filter(x => x !== b);
    s.battle = 0;
    const prev = s.owner;
    const df = prev >= 0 ? run.factions[prev] : null;
    if (result === 'def') {
      record(run, b, prev);
      s.gar.vet = Math.min(1, s.gar.vet + C.army.vetPerBattle * (df ? df.mods.vetGain : 1));
      if (df) { df.stats.defended++; if (df.mods.medics) s.gar.n += Math.floor((b.def0 - s.gar.n > 0 ? b.def0 - s.gar.n : 0) * df.mods.medics); }
      af.stats.failed++;
      af.lastDefeat = run.t;
      run.fx.push({ type: 'battleEnd', sys: s.id, winner: prev, loser: att.owner, held: true, size: b.a0 + b.d0 });
      if (b.a0 + b.d0 > 40 || prev === 0 || att.owner === 0) S.logMoment(run, (df ? df.short : 'INDEPENDENTS') + ' HELD ' + s.name + ' AGAINST ' + af.short, prev === 0 ? 'good' : att.owner === 0 ? 'bad' : 'info', prev, true);
      if (df) df.lastWin = run.t;
      return;
    }
    if (result === 'raid') {
      record(run, b, att.owner);
      af.stats.raids++;
      s.raidedAt = run.t;
      if (df) df.lastDefeat = run.t;
      run.fx.push({ type: 'raidEnd', sys: s.id, owner: att.owner, def: prev });
      S.logMoment(run, af.short + ' RAIDED ' + s.name, prev === 0 ? 'bad' : att.owner === 0 ? 'good' : 'info', att.owner);
      sendBack(run, att, s.id, 0);
      return;
    }
    // capture
    record(run, b, att.owner);
    if (df) { df.lastDefeat = run.t; df.stats.systemsLost++; }
    s.lastLost = run.t;
    S.capture(run, s, att.owner, prev);
    if (prev >= 0 && run.stats.leaders[prev]) run.stats.leaders[prev].lost++;   // did the 35% leader lose ground?
    if (run.coalition && prev === run.coalition.target) run.coalition.taken = (run.coalition.taken || 0) + 1;
    s.gar.n = att.n; s.gar.vet = Math.min(1, att.vet + C.army.vetPerBattle * af.mods.vetGain); s.gar.ships = att.ships; s.gar.sdur = att.sdur;
    if (af.mods.medics) s.gar.n += Math.floor(Math.max(0, att.n0 - att.n) * af.mods.medics);
    af.stats.captured++;
    af.lastWin = run.t;
    run.fx.push({ type: 'captured', sys: s.id, owner: att.owner, prev, size: b.a0 + b.d0 });
    S.logMoment(run, af.short + ' TOOK ' + s.name + (df ? ' FROM ' + df.short : ''), att.owner === 0 ? 'good' : prev === 0 ? 'bad' : 'info', att.owner, true);
    if (prev >= 0 && b.wasCapital) S.eliminate(run, prev, att.owner);
  }
  /** Ownership change. Everything built there survives, broken: it needs repairs before it works again. */
  S.capture = function (run, s, newOwner, prev) {
    s.owner = newOwner;
    s.lastCaptured = run.t;
    s.captureCount++;
    s.train.q = 0; s.train.prog = 0;
    s.mil = 0;
    s.pop = Math.floor(s.pop / 2);
    if (s.capital === prev && prev >= 0) s.capital = -1;
    S.wreckForCapture(s);
    s.plat.dur = 0;
  };
  function sendBack(run, att, fromSys, lossFrac) {
    const n = Math.max(0, att.n - Math.ceil(att.n * lossFrac));
    if (n + att.ships <= 0) return null;
    let dest = att.origin;
    if (dest === undefined || run.systems[dest].owner !== att.owner || !S.laneBetween(run, fromSys, dest)) {
      dest = S.neighbours(run, fromSys).find(x => run.systems[x].owner === att.owner);
    }
    if (dest === undefined) { run.factions[att.owner].stats.lost += n; return null; }   // nowhere to go: the army disbands
    const a = { id: run.nextId++, owner: att.owner, n, vet: att.vet, ships: att.ships, sdur: att.sdur, path: [fromSys, dest], seg: 0, prog: 0, mode: 'return', origin: fromSys, dest, wait: 0, born: run.t };
    run.armies.push(a);
    return a;
  }
  /** Pull an attacking army out of a battle: it loses 10% on the way out and heads back. */
  S.retreat = function (run, fid, battleId, forced) {
    const b = run.battles.find(x => x.id === battleId);
    if (!b || b.att.owner !== fid) return { ok: false, reason: 'invalid' };
    const s = run.systems[b.sys], af = run.factions[fid];
    run.battles = run.battles.filter(x => x !== b);
    s.battle = 0;
    record(run, b, s.owner);
    af.stats.retreats++;
    af.lastDefeat = run.t;
    const lost = Math.ceil(b.att.n * K.retreatLoss);
    af.stats.lost += lost;
    sendBack(run, b.att, b.sys, K.retreatLoss);
    if (s.owner >= 0) { run.factions[s.owner].stats.defended++; run.factions[s.owner].lastWin = run.t; }
    run.fx.push({ type: 'retreat', sys: s.id, owner: fid, forced: !!forced });
    if (fid === 0 || s.owner === 0) S.logMoment(run, af.short + ' RETREATED FROM ' + s.name, s.owner === 0 ? 'good' : 'info', fid);
    return { ok: true };
  };
  /** A capital falls: the faction is out and its remaining systems go to whoever took it. */
  S.eliminate = function (run, loserId, captorId) {
    const L = run.factions[loserId], cap = run.factions[captorId];
    if (!L.alive) return;
    L.alive = false; L.outAt = run.t; L.outBy = captorId;
    for (const s of run.systems) {
      if (s.owner !== loserId) continue;
      if (s.battle) { const b = run.battles.find(x => x.id === s.battle); if (b) { run.battles = run.battles.filter(x => x !== b); sendBack(run, b.att, s.id, 0); } s.battle = 0; }
      s.owner = captorId; s.gar.n = 0; s.gar.vet = 0; s.gar.ships = 0; s.train.q = 0; s.lastCaptured = run.t;
      if (s.capital === loserId) s.capital = -1;
    }
    run.armies = run.armies.filter(a => a.owner !== loserId);
    for (const b of run.battles.slice()) if (b.att.owner === loserId) { run.battles = run.battles.filter(x => x !== b); run.systems[b.sys].battle = 0; }
    cap.stats.eliminated++;
    run.fx.push({ type: 'eliminated', owner: loserId, by: captorId });
    S.logMoment(run, L.short + ' ELIMINATED BY ' + cap.short, loserId === 0 ? 'bad' : captorId === 0 ? 'good' : 'mega', captorId, true);
  };
})(globalThis.AS = globalThis.AS || {});
