/* ATLAS SYNDICATE v7 — sim/sim.js
   The run: creation, fair setup, the fixed-step update, fog of war, threat and shortage warnings,
   coalitions against a leader, win and loss, history for the end report, save/load, hashing and
   invariant checks. Pure simulation: no DOM, runs identically in the browser and in Node. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;

  function newFaction(def, i, pers) {
    const st = C.econ.start;
    return {
      id: i, name: def.name, short: def.short, pers, col: def.col, dark: def.dark, deep: def.deep, icon: def.icon,
      money: st.money, gold: st.gold, water: st.water, food: st.food, fuel: st.fuel,
      fuelEff: 1, fuelNeed: 0, farmFrac: 1, hungry: 0,
      alive: true, capital: -1, mods: null,
      lastWin: -999, lastDefeat: -999, outAt: 0, outBy: -1, lastCycle: { income: 0, got: null },
      stats: { income: 0, sold: 0, spent: 0, military: 0, upgrades: 0, lost: 0, killed: 0, captured: 0, systemsLost: 0, defended: 0, failed: 0, attacks: 0,
        attacked: 0, bought: 0, eliminated: 0, peakSystems: 1, peakPower: 0, starved: 0,
        goldMade: 0, waterMade: 0, foodMade: 0, fuelMade: 0, fuelUsed: 0, foodUsed: 0, waterUsed: 0, coalitions: 0 },
      ai: null,
    };
  }

  /** opts: diff, slot0 (null for a human, or an AI personality for tests/demo), noCoalition (test switch),
   *  endOnPlayerLoss (default true when slot 0 is human). */
  S.createRun = function (seed, opts) {
    opts = opts || {};
    seed = (seed >>> 0) || 1;
    const run = {
      v: AS.SAVE_VERSION, seed, diff: AS.DIFFICULTY[opts.diff] ? opts.diff : 'normal', rs: { a: (seed * 2654435761) >>> 0 }, t: 0, steps: 0, nextId: 1,
      cycleT: 0, cycleN: 0, phase: 'setup', systems: [], lanes: [], factions: [], armies: [],
      hist: [], log: [], battleLog: [], fx: [], warnings: [], warnHist: [], watch: {}, over: false, winner: -1, overReason: '', started: false,
      slot0: opts.slot0 || null, noCoalition: !!opts.noCoalition, endOnPlayerLoss: opts.endOnPlayerLoss !== undefined ? !!opts.endOnPlayerLoss : !opts.slot0,
      coalition: null, coalitionCool: 0, coalitions: [],
      stats: { warnedAttacks: 0, massWarned: 0, attacksOnPlayer: 0, firstAttackAny: 0, firstAttackOnPlayer: 0, leaders: {} },
    };
    run.rng = U.rngFrom(run.rs);
    S.initCombat();
    S.genGalaxy(run);
    run.factions = AS.FACTIONS.map((d, i) => newFaction(d, i, i === 0 ? (opts.slot0 || 'player') : d.pers));
    for (const f of run.factions) S.recomputeMods(run, f);
    S.initEvents(run);
    return run;
  };

  S.setupHome = function (run, sys, fid, planets) {
    sys.planets = JSON.parse(JSON.stringify(planets));
    sys.planets.forEach((p, i) => { p.name = sys.name + ' ' + AS.PLANET_SUFFIX[i]; p.phase = sys.id * 0.7 + i * 2.4; });
    sys.owner = fid; sys.capital = fid; sys.pathways = [];
    sys.gar = { ship: 0, destroyer: 0, cannon: 0 };   // everyone starts with no military at all
    sys.workers = 0;
    run.factions[fid].capital = sys.id;
  };
  /** Homes: the six arm tips, all the same distance from rivals and the core; the player picks one. */
  S.begin = function (run, homeId) {
    const cands = S.homeCandidates(run);
    if (cands.indexOf(homeId) < 0) homeId = cands[Math.floor(run.rng() * cands.length)];
    const homePlanets = S.makeHomePlanets((run.seed * 7 + 12345) >>> 0);
    S.setupHome(run, run.systems[homeId], 0, homePlanets);
    const rest = U.shuffle(run.rng, cands.filter(c => c !== homeId));
    for (let i = 1; i < run.factions.length; i++) S.setupHome(run, run.systems[rest[i - 1]], i, homePlanets);
    for (const f of run.factions) S.recomputeMods(run, f);
    for (const f of run.factions) if (f.id !== 0 || run.slot0) S.AI.init(run, f);
    run.phase = 'play';
    run.started = true;
    S.logMoment(run, 'GAME START AT ' + run.systems[homeId].name, 'info', 0);
    S.snapshot(run);
    return run;
  };

  /* ---------- fog of war ---------- */
  S.visibility = function (run, fid) {
    const key = run.steps + ':' + fid;
    run._vis = run._vis || {};
    const c = run._vis[fid];
    if (c && c.key === key) return c.v;
    const n = run.systems.length, v = new Uint8Array(n);
    for (const s of run.systems) if (s.owner === fid) {
      v[s.id] = 1;
      for (let j = 0; j < n; j++) if (run.hops[s.id][j] <= 1) v[j] = 1;
    }
    run._vis[fid] = { key, v };
    return v;
  };
  S.armyVisible = function (run, fid, a) {
    if (a.owner === fid) return true;
    const v = S.visibility(run, fid);
    return !!(v[a.path[a.seg]] || v[a.path[a.seg + 1]]);
  };

  /* ---------- coalitions: when one faction holds 35%, everyone else stops fighting each other and goes for it ---------- */
  S.leaderRaw = function (run) {
    const need = Math.ceil(C.game.leaderShare * run.systems.length - 1e-9);
    let best = -1, bn = 0;
    for (const f of run.factions) { if (!f.alive) continue; const n = S.ownCount(run, f.id); if (n > bn) { bn = n; best = f.id; } }
    return bn >= need ? best : -1;
  };
  S.leaderOf = run => (run.coalition ? run.coalition.target : -1);
  S.truceBlocks = (run, fid, targetOwner) => !!(run.coalition && fid !== run.coalition.target && targetOwner >= 0 && targetOwner !== run.coalition.target);
  function stepCoalition(run) {
    const L = S.leaderRaw(run);
    if (L >= 0 && !run.stats.leaders[L]) run.stats.leaders[L] = { at: Math.round(run.t), lost: 0 };
    const co = run.coalition;
    if (co) {
      const share = S.ownCount(run, co.target) / run.systems.length;
      const tf = run.factions[co.target];
      if (!tf.alive || share < C.coalition.breakShare || run.t >= co.until || run.factions.filter(f => f.alive).length < 3) {
        co.end = Math.round(run.t); co.endShare = share; co.result = !tf.alive ? 'eliminated' : share < C.coalition.breakShare ? 'broken' : 'expired';
        run.coalitions.push(co);
        run.coalition = null;
        run.coalitionCool = run.t + C.coalition.cooldown;
        run.fx.push({ type: 'coalitionEnd', target: co.target, result: co.result });
        S.logMoment(run, 'COALITION AGAINST ' + tf.short + ' ENDS (' + co.result.toUpperCase() + ')', co.target === 0 ? 'good' : 'info', -1, true);
        return;
      }
      if (run.t >= co.nextStrike) { co.strike = run.t; co.strikes++; co.nextStrike = run.t + C.coalition.strikeEvery; run.fx.push({ type: 'coalitionStrike', target: co.target }); }
      return;
    }
    if (run.noCoalition || L < 0 || run.t < run.coalitionCool || run.t < C.game.protect) return;
    if (run.factions.filter(f => f.alive).length < 3) return;
    run.coalition = { target: L, since: Math.round(run.t), until: run.t + C.coalition.duration, nextStrike: run.t + C.coalition.strikeFirst, strike: -999, strikes: 0, startShare: S.ownCount(run, L) / run.systems.length };
    for (const f of run.factions) if (f.alive && f.id !== L) f.stats.coalitions++;
    run.fx.push({ type: 'coalition', target: L });
    S.logMoment(run, 'COALITION AGAINST ' + run.factions[L].short + ': TRUCE BETWEEN EVERYONE ELSE', L === 0 ? 'bad' : 'warn', -1, true);
  }

  /* ---------- warnings for the player: threats they can see, and shortages before they happen ---------- */
  function updateWarnings(run, fid) {
    const vis = S.visibility(run, fid), out = [];
    const prev = run.warnings;
    for (const s of run.systems) {
      if (!vis[s.id] || s.owner === fid) continue;
      const w = run.watch[s.id] = run.watch[s.id] || [];
      const v = Math.round(S.sysPower(run, s));
      w.push([run.t, v, s.owner]);
      while (w.length && w[0][0] < run.t - 40) w.shift();
      if (s.owner < 0) continue;
      const mine = S.neighbours(run, s.id).filter(n => run.systems[n].owner === fid);
      if (!mine.length) continue;
      let lo = v;
      for (const r of w) if (r[2] === s.owner) lo = Math.min(lo, r[1]);
      const target = mine.reduce((b, n) => (S.sysPower(run, run.systems[n]) < S.sysPower(run, run.systems[b]) ? n : b), mine[0]);
      const tdef = S.sysPower(run, run.systems[target]);
      const old = prev.find(x => x.kind === 'mass' && x.sys === s.id && x.owner === s.owner);
      const on = v >= 14 && v > tdef * 0.9 && (v - lo >= Math.max(8, lo * 0.3) || v > tdef * 1.15);
      if (on || (old && run.t - old.last < 20)) {
        const o = run.factions[s.owner];
        const wr = old || { kind: 'mass', sys: s.id, owner: s.owner, target, t0: run.t, last: run.t };
        wr.text = AS.PERS_NAMES[o.pers] + ' MASSING ' + v + ' POWER AT ' + s.name + ' (YOU HAVE ' + Math.round(tdef) + ' AT ' + run.systems[wr.target].name + ')';
        if (on) { wr.last = run.t; wr.target = target; }
        out.push(wr);
        if (!old) { run.fx.push({ type: 'warn', sys: s.id, owner: s.owner, kind: 'mass', fid }); run.warnHist.push({ kind: 'mass', owner: s.owner, sys: s.id, t0: Math.round(run.t) }); }
      }
    }
    for (const a of run.armies) {
      if (a.owner === fid || a.mode !== 'attack' || !S.armyVisible(run, fid, a)) continue;
      const dest = run.systems[a.dest];
      if (!dest || dest.owner !== fid) continue;
      const o = run.factions[a.owner];
      const old = prev.find(x => x.kind === 'inc' && x.army === a.id);
      const wr = old || { kind: 'inc', army: a.id, sys: a.dest, owner: a.owner, t0: run.t };
      const ap = Math.round(S.armyPower(run, a)), dp = Math.round(S.sysPower(run, dest));
      wr.text = AS.PERS_NAMES[o.pers] + ' ATTACK INBOUND: ' + ap + ' VS YOUR ' + dp + ' AT ' + dest.name + (ap > dp ? ' - REINFORCE!' : '');
      out.push(wr);
      if (!old) { run.fx.push({ type: 'warn', sys: a.dest, owner: a.owner, kind: 'inc', fid }); run.warnHist.push({ kind: 'inc', owner: a.owner, sys: a.dest, t0: Math.round(run.t) }); }
    }
    const f = run.factions[fid];
    if (f.alive) {
      const fc = S.forecast(run, f);
      const what = { food: ': WORKERS WILL STARVE', fuel: ': YOUR MILITARY WEAKENS', water: ': FARMS STOP' };
      for (const w of fc.warn) out.push({ kind: 'short', res: w.res, sys: f.capital, owner: fid, t0: run.t,
        text: AS.STOCK[w.res].name + (w.cycles <= 0 ? ' RUNS OUT NEXT CYCLE' : ' RUNS OUT IN ' + w.cycles + ' CYCLES') + (what[w.res] || '') });
      if (f.hungry > 0) out.push({ kind: 'broke', res: 'food', sys: f.capital, owner: fid, t0: run.t, text: 'NO FOOD: WORKERS ARE STARVING, MACHINES STOP' });
      if (f.fuelEff < 0.999) out.push({ kind: 'broke', res: 'fuel', sys: f.capital, owner: fid, t0: run.t, text: 'LOW FUEL: MILITARY AT ' + Math.round(f.fuelEff * 100) + '% POWER' });
    }
    run.warnings = out;
    while (run.warnHist.length && run.warnHist[0].t0 < run.t - 120) run.warnHist.shift();
  }

  /* ---------- end of game ---------- */
  S.standings = function (run) {
    return run.factions.map(f => ({ id: f.id, systems: S.ownCount(run, f.id), army: Math.round(S.militaryPower(run, f.id)), alive: f.alive }))
      .sort((a, b) => b.systems - a.systems || b.army - a.army || a.id - b.id);
  };
  function finish(run, winner, reason, how) {
    run.over = true; run.winner = winner; run.overReason = reason; run.endT = run.t; run.endHow = how;
    if (run.coalition) { run.coalition.end = Math.round(run.t); run.coalition.result = 'gameover'; run.coalitions.push(run.coalition); run.coalition = null; }
    S.snapshot(run);
    run.fx.push({ type: 'over', winner });
    S.logMoment(run, reason, winner === 0 ? 'good' : 'bad', winner, true);
  }
  function checkEnd(run) {
    const alive = run.factions.filter(f => f.alive);
    if (run.endOnPlayerLoss && !run.factions[0].alive) return finish(run, S.standings(run)[0].id, 'YOUR CAPITAL WAS CAPTURED', 'loss');
    if (alive.length === 1) return finish(run, alive[0].id, alive[0].id === 0 ? 'EVERY RIVAL ELIMINATED' : alive[0].short + ' ELIMINATED EVERY RIVAL', 'elimination');
    if (run.t >= C.game.length) {
      const st = S.standings(run);
      return finish(run, st[0].id, 'TIME: ' + run.factions[st[0].id].short + ' HOLDS THE MOST SYSTEMS (' + st[0].systems + ')', 'timer');
    }
  }
  S.snapshot = function (run) {
    const p = run.factions[0];
    run.hist.push([Math.round(run.t), ...run.factions.map(f => S.ownCount(run, f.id)), Math.round(p.money), Math.round(S.militaryPower(run, 0)), Math.round(p.money), Math.round(p.gold), Math.round(p.fuel), Math.round(p.food)]);
  };
  S.logMoment = function (run, text, k, f, decisive) {
    run.log.push({ t: Math.round(run.t), text: String(text).toUpperCase(), k: k || 'info', f: f === undefined ? -1 : f, d: !!decisive });
    if (run.log.length > 400) run.log.shift();
  };

  /* ---------- the fixed step ---------- */
  S.step = function (run, dt) {
    if (run.over || run.phase !== 'play') return;
    run.t += dt; run.steps++;
    S.stepArmies(run, dt);
    run.cycleT += dt;
    if (run.cycleT >= C.game.cycle) { run.cycleT -= C.game.cycle; S.cycle(run); }
    S.stepEvents(run);
    if (run.t >= C.game.endgame && run.t - dt < C.game.endgame) { run.fx.push({ type: 'endgame' }); S.logMoment(run, '18:00 ENDGAME: RIVALS GO FOR EACH OTHER\'S CAPITALS', 'warn', -1, true); }
    if (run.steps % 10 === 0) stepCoalition(run);
    for (const f of run.factions) if (f.alive && f.ai && run.t >= f.ai.next) S.AI.think(run, f);
    if (run.steps % 10 === 0) {
      updateWarnings(run, 0);
      for (const f of run.factions) if (f.alive) {
        const n = S.ownCount(run, f.id);
        if (n > f.stats.peakSystems) f.stats.peakSystems = n;
        const a = Math.round(S.militaryPower(run, f.id));
        if (a > f.stats.peakPower) f.stats.peakPower = a;
      }
    }
    if (run.hist.length && run.t - run.hist[run.hist.length - 1][0] >= C.history.every) S.snapshot(run);
    checkEnd(run);
  };

  /** F9 presenter jump: the 'balanced' AI plays your slot until `target` seconds, then hands it back. */
  S.presenterJump = function (run, target, maxMs) {
    const f = run.factions[0];
    run.presented = true;
    if (!f.ai) { S.AI.init(run, f); f.ai.borrowed = true; f.ai.next = run.t; }
    const t0 = Date.now();
    while (run.t < target && !run.over) {
      S.step(run, C.sim.step);
      run.fx.length = 0;
      if (maxMs && Date.now() - t0 > maxMs) return false;
    }
    if (f.ai && f.ai.borrowed) f.ai = null;
    run.warnings = [];
    return true;
  };

  /* ---------- save / load / determinism ---------- */
  const SKIP = { rng: 1, fx: 1, _vis: 1, _cache: 1, _dm: 1, dbg: 1 };
  S.serialize = run => JSON.stringify(run, (k, v) => (SKIP[k] || (k && k[0] === '_') ? undefined : v));
  S.deserialize = function (str) {
    const run = typeof str === 'string' ? JSON.parse(str) : str;
    if (!run || run.v !== AS.SAVE_VERSION) throw new Error('not a v' + AS.SAVE_VERSION + ' save');
    run.rng = U.rngFrom(run.rs);
    run.fx = [];
    S.initCombat();
    for (const f of run.factions) S.recomputeMods(run, f);
    return run;
  };
  S.hash = function (run) {
    const s = S.serialize(run);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  S.scanFinite = function (o, path, out, depth) {
    if (depth > 9 || out.length > 10) return out;
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return out; }
    if (!o || typeof o !== 'object') return out;
    for (const k in o) { if (SKIP[k] || k[0] === '_' || k === 'rock') continue; S.scanFinite(o[k], path + '.' + k, out, depth + 1); }
    return out;
  };
  S.checkInvariants = function (run, fails) {
    const nF = run.factions.length;
    for (const f of run.factions) {
      for (const k of AS.STOCK_KEYS) { if (!Number.isFinite(f[k])) fails.push(f.short + ' ' + k + ' not finite'); else if (f[k] < -1e-6) fails.push(f.short + ' negative ' + k); }
      if (!(f.fuelEff >= 0 && f.fuelEff <= 1 + 1e-9)) fails.push(f.short + ' fuel efficiency ' + f.fuelEff);
      if (!(f.farmFrac >= 0 && f.farmFrac <= 1 + 1e-9)) fails.push(f.short + ' farm share');
      if (f.alive && run.started && !run.systems.some(s => s.owner === f.id)) fails.push(f.short + ' alive with no systems');
    }
    const okCount = v => Number.isInteger(v) && v >= 0;
    for (const s of run.systems) {
      if (s.owner < -1 || s.owner >= nF) fails.push(s.name + ' bad owner');
      if (s.owner >= 0 && !run.factions[s.owner].alive) fails.push(s.name + ' owned by dead faction');
      for (const k of AS.UNIT_KEYS) if (!okCount(s.gar[k])) fails.push(s.name + ' garrison ' + k + ' ' + s.gar[k]);
      if (s.capital >= 0 && s.owner !== s.capital) fails.push(s.name + ' capital not owned by its faction');
      if (s.pathways.length > C.econ.maxPathways) fails.push(s.name + ' too many pathways');
      if (!okCount(s.workers) || s.workers > S.crewNeed(s)) fails.push(s.name + ' workers ' + s.workers + '/' + S.crewNeed(s));
      for (const pw of s.pathways) if (!s.planets[pw.a] || !s.planets[pw.b] || pw.a === pw.b) fails.push(s.name + ' bad pathway');
      const f = s.owner >= 0 ? run.factions[s.owner] : null;
      s.planets.forEach((p, pi) => {
        const slots = new Set();
        for (const b of p.blds) {
          if (!AS.BLD[b.kind]) fails.push(p.name + ' unknown building');
          if (slots.has(b.slot)) fails.push(p.name + ' two buildings in one slot');
          slots.add(b.slot);
          if (!(b.slot >= 0 && b.slot < S.slotCount(p, f))) fails.push(p.name + ' building outside slots');
          if (!(b.lvl >= 1 && b.lvl <= C.upgrade.max)) fails.push(p.name + ' building level');
          if (b.drill) {
            if (AS.BLD[b.kind].role !== 'ext') fails.push(p.name + ' drill on a non-extractor');
            const d = p.deposits[b.drill.dep];
            if (!d || d.res !== AS.BLD[b.kind].res) fails.push(p.name + ' drill into the wrong deposit');
            for (const c of b.drill.path) if (S.rockAt(p, c) === 3) fails.push(p.name + ' drill through a barrier');
          }
          if (b.out) {
            if (AS.BLD[b.kind].role !== 'ext' || !AS.RES[AS.BLD[b.kind].res].proc) fails.push(p.name + ' conveyor from a building that cannot have one');
            if (b.out.b !== undefined) { const q = S.bldById(p, b.out.b); if (!q || AS.BLD[q.kind].res !== AS.BLD[b.kind].res || AS.BLD[q.kind].role !== 'proc') fails.push(p.name + ' conveyor to a wrong building'); }
            else if (!s.pathways.some(pw => pw.id === b.out.p && (pw.a === pi || pw.b === pi))) fails.push(p.name + ' conveyor to a missing port');
          }
        }
        for (const k in p.portIn) {
          if (!s.pathways.some(pw => pw.id === +k && (pw.a === pi || pw.b === pi))) fails.push(p.name + ' port link without pathway');
          const q = S.bldById(p, p.portIn[k].b);
          if (!q || AS.BLD[q.kind].role !== 'proc') fails.push(p.name + ' port feeds a non-processor');
        }
        for (const d of p.deposits) if (!(d.amount >= 0 && d.amount <= d.max)) fails.push(p.name + ' deposit amount');
      });
    }
    for (const a of run.armies) {
      for (const k of AS.UNIT_KEYS) if (!okCount(a.units[k])) fails.push('army counts');
      if (!run.factions[a.owner].alive) fails.push('army of dead faction');
      for (let i = 0; i + 1 < a.path.length; i++) if (!S.laneBetween(run, a.path[i], a.path[i + 1])) fails.push('army path without lane');
    }
    return fails;
  };
})(globalThis.AS = globalThis.AS || {});
