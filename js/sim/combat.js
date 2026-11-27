/* ATLAS SYNDICATE v7 — sim/combat.js
   Military power is the sum of your units' scores: space ship 1, destroyer 5, orbital strike cannon 10,
   times your fuel efficiency. Armies move only along hyperlanes. When one arrives at a hostile system the
   fight is settled at once: the smaller power is wiped out and the winner keeps the difference.
   Ties go to the defender (with nothing left). No dice, no odds: the order panel shows the exact result. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;
  S.initCombat = () => {};
  /** What fog of war lets you see of a far system: S under 15, M under 40, L 40 and up. */
  S.sizeBand = v => (v < 15 ? 'S' : v < 40 ? 'M' : 'L');

  /** The result of attackPower hitting sys right now. */
  S.outcome = function (run, attPower, sys) {
    const def = S.sysPower(run, sys);
    const win = attPower > def + 1e-9;
    return { att: attPower, def, win, left: Math.abs(attPower - def) };
  };
  /** Units sent from a garrison for a fraction 0..1 (each kind rounded; 'all' sends everything). */
  S.splitUnits = function (g, frac) {
    const u = {};
    for (const k of AS.UNIT_KEYS) u[k] = frac >= 1 ? g[k] : Math.round(g[k] * frac);
    return u;
  };

  /* ---------- orders ---------- */
  S.laneTime = function (run, owner, a, b) {
    const l = S.laneBetween(run, a, b);
    return (l ? l.len : 60) / C.army.speed;
  };
  /** Send part of a garrison along lanes. Through own systems only; the last hop may attack. */
  S.sendArmy = function (run, fid, fromId, toId, frac) {
    const from = run.systems[fromId], to = run.systems[toId];
    if (!from || !to || from.owner !== fid) return { ok: false, reason: 'notyours' };
    if (fromId === toId) return { ok: false, reason: 'same' };
    const hostile = to.owner !== fid;
    if (hostile && run.t < C.game.protect) return { ok: false, reason: 'protected' };
    if (hostile && to.owner >= 0 && S.truceBlocks(run, fid, to.owner)) return { ok: false, reason: 'truce' };
    const path = S.path(run, fromId, toId, fid);
    if (!path) return { ok: false, reason: 'nopath' };
    frac = U.clamp(U.fin(frac, 1), 0.05, 1);
    const units = S.splitUnits(from.gar, frac);
    if (S.unitCount(units) <= 0) return { ok: false, reason: 'empty' };
    for (const k of AS.UNIT_KEYS) from.gar[k] -= units[k];
    const mode = hostile ? 'attack' : 'move';
    const a = { id: run.nextId++, owner: fid, units, path, seg: 0, prog: 0, mode, origin: path[path.length - 2], dest: toId, wait: 0, born: run.t };
    run.armies.push(a);
    run.fx.push({ type: 'depart', sys: fromId, to: toId, owner: fid, power: S.armyPower(run, a), mode, army: a.id });
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
      if (a.seg + 1 < a.path.length - 1 && (node.owner === a.owner || partner)) {
        const next = S.laneBetween(run, to, a.path[a.seg + 2]);
        if (S.laneOpen(run, next)) { a.seg++; a.prog = 0; continue; }
        a.dest = to;   // lane closed ahead: stop here
      }
      if (a.seg + 1 < a.path.length - 1) a.dest = to;
      arrive(run, a);
    }
  };
  function removeArmy(run, a) { const i = run.armies.indexOf(a); if (i >= 0) run.armies.splice(i, 1); }
  function mergeInto(g, u) { for (const k of AS.UNIT_KEYS) g[k] += u[k] || 0; }
  function arrive(run, a) {
    const sysId = a.path[a.seg + 1], s = run.systems[sysId];
    if (s.owner === a.owner) {
      mergeInto(s.gar, a.units);
      removeArmy(run, a);
      run.fx.push({ type: 'arrive', sys: sysId, owner: a.owner });
      return;
    }
    if (run.t < C.game.protect || (s.owner >= 0 && S.truceBlocks(run, a.owner, s.owner))) {   // cannot happen through orders, but be safe: turn back
      return turnBack(run, a);
    }
    removeArmy(run, a);
    fight(run, a, s);
  }
  function turnBack(run, a) {
    const back = S.neighbours(run, a.path[a.seg + 1]).find(n => run.systems[n].owner === a.owner);
    if (back === undefined) { removeArmy(run, a); return; }
    a.path = [a.path[a.seg + 1], back]; a.seg = 0; a.prog = 0; a.mode = 'move'; a.dest = back; a.wait = 0;
  }

  /* ---------- the fight: bigger power wins, keeps the difference ---------- */
  function fight(run, a, s) {
    const af = run.factions[a.owner], prev = s.owner, df = prev >= 0 ? run.factions[prev] : null;
    const A = S.armyPower(run, a), D = S.sysPower(run, s);
    const wasCapital = s.capital >= 0 && s.capital === s.owner;
    const lead = S.leaderRaw ? S.leaderRaw(run) : -1;
    if (prev >= 0) {
      if (!run.stats.firstAttackAny) run.stats.firstAttackAny = Math.round(run.t);
      if (prev === 0) {   // was the player's side warned in time?
        run.stats.attacksOnPlayer++;
        if (!run.stats.firstAttackOnPlayer) run.stats.firstAttackOnPlayer = Math.round(run.t);
        const ws = run.warnHist.filter(w => w.owner === a.owner && run.t - w.t0 <= 90);
        const near = w => w.sys === s.id || S.neighbours(run, s.id).indexOf(w.sys) >= 0;
        if (ws.some(w => w.kind === 'mass' && near(w) && run.t - w.t0 >= 8)) run.stats.massWarned++;
        if (ws.some(w => near(w) && run.t - w.t0 >= 4)) run.stats.warnedAttacks++;
      }
      df.stats.attacked++;
    }
    s.lastBattle = run.t;
    const win = A > D + 1e-9;
    const lostA = win ? D : A, lostD = win ? D : A;
    af.stats.lost += lostA; af.stats.killed += lostD;
    if (df) { df.stats.lost += lostD; df.stats.killed += lostA; }
    run.battleLog.push({ t: Math.round(run.t), sys: s.id, att: a.owner, def: prev, size: Math.round(A + D), att0: Math.round(A), def0: Math.round(D), winner: win ? a.owner : prev, capital: wasCapital, lead });
    if (run.battleLog.length > 400) run.battleLog.shift();
    run.fx.push({ type: 'battle', sys: s.id, owner: a.owner, def: prev, att: A, defP: D, win, size: A + D });
    if (!win) {
      // the defender holds with what is left
      const eff = S.fuelEff(run, prev);
      s.gar = S.survivors(s.gar, eff > 0 ? (D - A) / eff : 0);
      af.stats.failed++; af.lastDefeat = run.t;
      if (df) { df.stats.defended++; df.lastWin = run.t; }
      if (A + D > 40 || prev === 0 || a.owner === 0) S.logMoment(run, (df ? df.short : 'INDEPENDENTS') + ' HELD ' + s.name + ' AGAINST ' + af.short + ' (' + Math.round(D) + ' VS ' + Math.round(A) + ')', prev === 0 ? 'good' : a.owner === 0 ? 'bad' : 'info', prev, true);
      return;
    }
    // capture: the attacker moves in with what is left
    const eff = S.fuelEff(run, a.owner);
    if (df) { df.lastDefeat = run.t; df.stats.systemsLost++; }
    s.lastLost = run.t;
    S.capture(run, s, a.owner, prev);
    if (prev >= 0 && run.stats.leaders[prev]) run.stats.leaders[prev].lost++;   // did the 35% leader lose ground?
    if (run.coalition && prev === run.coalition.target) run.coalition.taken = (run.coalition.taken || 0) + 1;
    s.gar = S.survivors(a.units, eff > 0 ? (A - D) / eff : 0);
    af.stats.captured++; af.lastWin = run.t;
    run.fx.push({ type: 'captured', sys: s.id, owner: a.owner, prev, size: A + D });
    S.logMoment(run, af.short + ' TOOK ' + s.name + (df ? ' FROM ' + df.short : '') + ' (' + Math.round(A) + ' VS ' + Math.round(D) + ')', a.owner === 0 ? 'good' : prev === 0 ? 'bad' : 'info', a.owner, true);
    if (prev >= 0 && wasCapital) S.eliminate(run, prev, a.owner);
  }
  /** Ownership change. Buildings and their workers carry on for the new owner. */
  S.capture = function (run, s, newOwner, prev) {
    s.owner = newOwner;
    s.lastCaptured = run.t;
    s.captureCount++;
    if (s.capital === prev && prev >= 0) s.capital = -1;
  };
  /** A capital falls: the faction is out and its remaining systems go to whoever took it (their garrisons disband). */
  S.eliminate = function (run, loserId, captorId) {
    const L = run.factions[loserId], cap = run.factions[captorId];
    if (!L.alive) return;
    L.alive = false; L.outAt = run.t; L.outBy = captorId;
    for (const s of run.systems) {
      if (s.owner !== loserId) continue;
      s.owner = captorId; s.lastCaptured = run.t; s.gar = { ship: 0, destroyer: 0, cannon: 0 };
      if (s.capital === loserId) s.capital = -1;
    }
    run.armies = run.armies.filter(a => a.owner !== loserId);
    cap.stats.eliminated++;
    run.fx.push({ type: 'eliminated', owner: loserId, by: captorId });
    S.logMoment(run, L.short + ' ELIMINATED BY ' + cap.short, loserId === 0 ? 'bad' : captorId === 0 ? 'good' : 'mega', captorId, true);
  };
})(globalThis.AS = globalThis.AS || {});
