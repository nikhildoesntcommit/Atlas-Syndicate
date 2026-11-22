/* ATLAS SYNDICATE v5 — sim/sim.js
   The run: creation, setup (corporations and homes), the fixed-step update, fog of war, threat warnings,
   win and loss, history for the end report, save/load, hashing and invariant checks.
   Pure simulation: no DOM, runs identically in the browser and in Node. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;

  function newFaction(def, i, pers) {
    return {
      id: i, name: def.name, short: def.short, pers, col: def.col, dark: def.dark, deep: def.deep, icon: def.icon,
      corp: null, credits: C.econ.startCredits, alive: true, capital: -1, cards: [], drafts: [], mods: S.baseMods(),
      autoRepair: pers === 'player', broke: 0, lastWin: -999, lastDefeat: -999, outAt: 0, outBy: -1, lastCycle: { income: 0, salary: 0, repairs: 0 },
      stats: { income: 0, salary: 0, repairs: 0, spent: 0, lost: 0, killed: 0, captured: 0, systemsLost: 0, defended: 0, failed: 0, attacks: 0,
        attacked: 0, raids: 0, loot: 0, retreats: 0, bought: 0, deserted: 0, eliminated: 0, peakSystems: 1, peakArmy: 0, firstAttackAt: 0, firstAttackedAt: 0 },
      ai: null,
    };
  }

  /** opts: diff ('easy'|'normal'|'hard'), slot0 (null for a human, or an AI personality for tests/demo),
   *  noLeaderPressure (test switch), endOnPlayerLoss (default true when slot 0 is human). */
  S.createRun = function (seed, opts) {
    opts = opts || {};
    seed = (seed >>> 0) || 1;
    const run = {
      v: 5, seed, diff: AS.DIFFICULTY[opts.diff] ? opts.diff : 'normal', rs: { a: (seed * 2654435761) >>> 0 }, t: 0, steps: 0, nextId: 1,
      cycleT: 0, cycleN: 0, nextCard: C.game.cardEvery, phase: 'setup', systems: [], lanes: [], factions: [], armies: [], battles: [],
      hist: [], log: [], battleLog: [], fx: [], warnings: [], warnHist: [], watch: {}, over: false, winner: -1, overReason: '', started: false,
      slot0: opts.slot0 || null, noLeaderPressure: !!opts.noLeaderPressure, endOnPlayerLoss: opts.endOnPlayerLoss !== undefined ? !!opts.endOnPlayerLoss : !opts.slot0,
      stats: { warnedAttacks: 0, massWarned: 0, attacksOnPlayer: 0, firstAttackAny: 0, firstAttackOnPlayer: 0 }, tutorial: false,
    };
    run.rng = U.rngFrom(run.rs);
    S.genGalaxy(run);
    run.factions = AS.FACTIONS.map((d, i) => newFaction(d, i, i === 0 ? (opts.slot0 || 'player') : d.pers));
    S.initEvents(run);
    return run;
  };
  /** The three corporations offered at the start of a run (a function of the seed). */
  S.corpOffers = function (seed) { const r = U.rng((seed ^ 0x51ed27) >>> 0); return U.shuffle(r, AS.CORP_KEYS.slice()).slice(0, 3); };
  const CORP_PREF = {
    warlord: ['halden', 'drill', 'rapid', 'krone'], merchant: ['krone', 'swift', 'duramax', 'salvage'], turtle: ['fortis', 'duramax', 'halden', 'krone'],
    opportunist: ['rapid', 'salvage', 'drill', 'halden'], raider: ['rapid', 'salvage', 'drill', 'swift'], balanced: ['krone', 'halden', 'fortis', 'swift'],
  };
  S.aiPickCorp = function (pers, offers) {
    const pref = CORP_PREF[pers] || CORP_PREF.balanced;
    let best = offers[0], bi = 99;
    for (const o of offers) { const i = pref.indexOf(o); const v = i < 0 ? 50 : i; if (v < bi) { bi = v; best = o; } }
    return best;
  };

  S.setupHome = function (run, sys, fid) {
    const r = U.rng((run.seed * 31 + sys.id * 977) >>> 0);
    sys.planets = S.HOME_PLANETS.map(([type, rich], i) => S.makePlanet(r, type, rich, i, S.HOME_PLANETS.length));
    U.shuffle(r, sys.planets);
    sys.planets.forEach((p, i) => { p.orbit = (i + 1) / sys.planets.length; });
    sys.owner = fid; sys.capital = fid;
    sys.lines = []; sys.freighters = C.econ.startFreighters; sys.fdur = 100; sys.station.dur = 100;
    sys.gar = { n: C.army.startSoldiers, vet: C.army.startVet, ships: 0, sdur: 100 };
    sys.plat = { n: C.army.startPlatforms, dur: 100 }; sys.train = { q: 0, prog: 0 }; sys.pop = 5;
    run.factions[fid].capital = sys.id;
  };
  /** Choose the home systems: the player picks theirs; rivals spread out from the player and each other. */
  S.begin = function (run, homeId, corp) {
    const cands = S.homeCandidates(run);
    if (cands.indexOf(homeId) < 0) homeId = cands[Math.floor(run.rng() * cands.length)];
    const offers = S.corpOffers(run.seed);
    const p0 = run.factions[0];
    p0.corp = AS.CORPS[corp] ? corp : (run.slot0 ? S.aiPickCorp(run.slot0, offers) : offers[0]);
    S.setupHome(run, run.systems[homeId], 0);
    const taken = [homeId];
    for (let i = 1; i < run.factions.length; i++) {
      let bestD = -1, pool = [];
      for (const c of cands) {
        if (taken.indexOf(c) >= 0) continue;
        const d = Math.min(...taken.map(t => run.hops[t][c]));
        if (d > bestD) { bestD = d; pool = [c]; } else if (d === bestD) pool.push(c);
      }
      // a little randomness: sometimes accept a home one hop closer
      if (bestD > 3 && run.rng() < 0.35) for (const c of cands) if (taken.indexOf(c) < 0 && Math.min(...taken.map(t => run.hops[t][c])) === bestD - 1) pool.push(c);
      const h = pool[Math.floor(run.rng() * pool.length)];
      taken.push(h);
      const f = run.factions[i];
      f.corp = S.aiPickCorp(f.pers, U.shuffle(run.rng, AS.CORP_KEYS.slice()).slice(0, 3));
      S.setupHome(run, run.systems[h], i);
    }
    for (const f of run.factions) S.recomputeMods(run, f);
    for (const f of run.factions) if (f.id !== 0 || run.slot0) S.AI.init(run, f);
    run.phase = 'play';
    run.started = true;
    S.logMoment(run, 'GAME START - ' + AS.CORPS[p0.corp].name + ' AT ' + run.systems[homeId].name, 'info', 0);
    S.snapshot(run);
    return run;
  };

  /* ---------- fog of war ---------- */
  /** 1 = exact information (own systems and systems within sight lanes of them), 0 = owner and size band only. */
  S.visibility = function (run, fid) {
    const key = run.steps + ':' + fid;
    run._vis = run._vis || {};
    const c = run._vis[fid];
    if (c && c.key === key) return c.v;
    const n = run.systems.length, v = new Uint8Array(n);
    const sight = run.factions[fid] ? run.factions[fid].mods.sight : 1;
    for (const s of run.systems) if (s.owner === fid) {
      v[s.id] = 1;
      for (let j = 0; j < n; j++) if (run.hops[s.id][j] <= sight) v[j] = 1;
    }
    run._vis[fid] = { key, v };
    return v;
  };
  S.armyVisible = function (run, fid, a) {
    if (a.owner === fid) return true;
    const v = S.visibility(run, fid);
    return !!(v[a.path[a.seg]] || v[a.path[a.seg + 1]]);
  };

  /* ---------- threat warnings: derived only from what the faction can see ---------- */
  function updateWarnings(run, fid) {
    const vis = S.visibility(run, fid), out = [];
    const prev = run.warnings;
    for (const s of run.systems) {
      if (!vis[s.id] || s.owner === fid) continue;
      const w = run.watch[s.id] = run.watch[s.id] || [];
      const v = Math.round(S.garStrength(run, s));
      w.push([run.t, v, s.owner]);
      while (w.length && w[0][0] < run.t - 40) w.shift();
      if (s.owner < 0) continue;   // independents never attack
      const mine = S.neighbours(run, s.id).filter(n => run.systems[n].owner === fid);
      if (!mine.length) continue;
      let lo = v;
      for (const r of w) if (r[2] === s.owner) lo = Math.min(lo, r[1]);
      const target = mine.reduce((b, n) => (S.defStrength(run, run.systems[n]) < S.defStrength(run, run.systems[b]) ? n : b), mine[0]);
      const tdef = S.defStrength(run, run.systems[target]);
      const old = prev.find(x => x.kind === 'mass' && x.sys === s.id && x.owner === s.owner);
      const growing = v - lo >= Math.max(8, lo * 0.3);
      const big = v >= 14 && v >= tdef * 0.9;
      const on = big && (growing || v >= tdef * 1.15);
      if (on || (old && run.t - old.last < 20)) {   // stays up 20 s after the build-up ends, so it covers the strike
        const o = run.factions[s.owner];
        const wr = old || { kind: 'mass', sys: s.id, owner: s.owner, target, t0: run.t, last: run.t, text: AS.PERS_NAMES[o.pers] + ' FORCES GATHERING AT ' + s.name };
        if (on) { wr.last = run.t; wr.v = v; wr.target = target; }
        out.push(wr);
        if (!old) {
          run.fx.push({ type: 'warn', sys: s.id, owner: s.owner, kind: 'mass', target, fid });
          S.logMoment(run, wr.text, 'warn', fid);
          run.warnHist.push({ kind: 'mass', owner: s.owner, sys: s.id, t0: Math.round(run.t) });
        }
      }
    }
    for (const a of run.armies) {
      if (a.owner === fid || a.mode === 'move' || a.mode === 'return') continue;
      if (!S.armyVisible(run, fid, a)) continue;
      const dest = run.systems[a.dest];
      if (!dest || dest.owner !== fid) continue;
      const o = run.factions[a.owner];
      const old = prev.find(x => x.kind === 'inc' && x.army === a.id);
      const wr = old || { kind: 'inc', army: a.id, sys: a.dest, owner: a.owner, t0: run.t, text: AS.PERS_NAMES[o.pers] + (a.mode === 'raid' ? ' RAID' : ' ATTACK') + ' INBOUND: ' + dest.name };
      out.push(wr);
      if (!old) { run.fx.push({ type: 'warn', sys: a.dest, owner: a.owner, kind: 'inc', fid }); run.warnHist.push({ kind: 'inc', owner: a.owner, sys: a.dest, t0: Math.round(run.t) }); }
    }
    for (const b of run.battles) {
      const s = run.systems[b.sys];
      if (s.owner === fid) out.push({ kind: 'fight', sys: s.id, owner: b.att.owner, t0: b.t0, text: s.name + ' UNDER ATTACK' });
    }
    const f = run.factions[fid];
    if (f.broke > 0) out.push({ kind: 'broke', sys: f.capital, owner: fid, t0: run.t, text: 'BANKRUPT: SOLDIERS DESERT NEXT CYCLE' });
    run.warnings = out;
    while (run.warnHist.length && run.warnHist[0].t0 < run.t - 120) run.warnHist.shift();
  }

  /* ---------- end of game ---------- */
  S.standings = function (run) {
    return run.factions.map(f => ({ id: f.id, systems: S.ownCount(run, f.id), army: S.soldiers(run, f.id), alive: f.alive }))
      .sort((a, b) => b.systems - a.systems || b.army - a.army || a.id - b.id);
  };
  function finish(run, winner, reason) {
    run.over = true; run.winner = winner; run.overReason = reason; run.endT = run.t;
    S.snapshot(run);
    run.fx.push({ type: 'over', winner });
    S.logMoment(run, reason, winner === 0 ? 'good' : 'bad', winner, true);
  }
  function checkEnd(run) {
    const alive = run.factions.filter(f => f.alive);
    if (run.endOnPlayerLoss && !run.factions[0].alive) return finish(run, S.standings(run)[0].id, 'YOUR CAPITAL WAS CAPTURED');
    if (alive.length === 1) return finish(run, alive[0].id, alive[0].id === 0 ? 'EVERY RIVAL ELIMINATED' : alive[0].short + ' ELIMINATED EVERY RIVAL');
    if (run.t >= C.game.length) {
      const st = S.standings(run);
      return finish(run, st[0].id, 'TIME: ' + run.factions[st[0].id].short + ' HOLDS THE MOST SYSTEMS (' + st[0].systems + ')');
    }
  }

  S.snapshot = function (run) {
    const p = run.factions[0];
    run.hist.push([Math.round(run.t), ...run.factions.map(f => S.ownCount(run, f.id)), p.lastCycle.income, S.soldiers(run, 0), Math.round(p.credits)]);
  };
  S.logMoment = function (run, text, k, f, decisive) {
    run.log.push({ t: Math.round(run.t), text: String(text).toUpperCase(), k: k || 'info', f: f === undefined ? -1 : f, d: !!decisive });
    if (run.log.length > 400) run.log.shift();
  };

  /* ---------- the fixed step ---------- */
  S.step = function (run, dt) {
    if (run.over || run.phase !== 'play') return;
    run.t += dt; run.steps++;
    S.stepTraining(run, dt);
    S.stepArmies(run, dt);
    S.stepBattles(run, dt);
    run.cycleT += dt;
    if (run.cycleT >= C.game.cycle) {
      run.cycleT -= C.game.cycle;
      S.cycle(run);
      for (const s of run.systems) if (s.owner >= 0 && run.factions[s.owner].mods.militia && !s.battle) s.mil = run.factions[s.owner].mods.militia;
    }
    S.stepCards(run);
    S.stepEvents(run);
    for (const f of run.factions) if (f.alive && f.ai && run.t >= f.ai.next) S.AI.think(run, f);
    if (run.steps % 10 === 0) {
      updateWarnings(run, 0);
      for (const f of run.factions) if (f.alive) {
        const n = S.ownCount(run, f.id);
        if (n > f.stats.peakSystems) f.stats.peakSystems = n;
        const a = S.soldiers(run, f.id);
        if (a > f.stats.peakArmy) f.stats.peakArmy = a;
      }
    }
    if (run.hist.length && run.t - run.hist[run.hist.length - 1][0] >= C.history.every) S.snapshot(run);
    checkEnd(run);
  };

  /** F9 presenter jump: the 'balanced' AI plays your slot until `target` seconds, then hands it back.
   *  With maxMs it works in slices (call again until it returns true) so the browser never freezes. */
  S.presenterJump = function (run, target, maxMs) {
    const f = run.factions[0];
    run.presented = true;   // no achievements for a game the AI played
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
  const SKIP = { rng: 1, fx: 1, _vis: 1, _cache: 1 };
  S.serialize = run => JSON.stringify(run, (k, v) => (SKIP[k] || (k && k[0] === '_') ? undefined : v));
  S.deserialize = function (str) {
    const run = typeof str === 'string' ? JSON.parse(str) : str;
    if (!run || run.v !== 5) throw new Error('not a v5 save');
    run.rng = U.rngFrom(run.rs);
    run.fx = [];
    return run;
  };
  S.hash = function (run) {
    const s = S.serialize(run);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  S.scanFinite = function (o, path, out, depth) {
    if (depth > 8 || out.length > 10) return out;
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return out; }
    if (!o || typeof o !== 'object') return out;
    for (const k in o) { if (SKIP[k] || k[0] === '_') continue; S.scanFinite(o[k], path + '.' + k, out, depth + 1); }
    return out;
  };
  S.checkInvariants = function (run, fails) {
    const nF = run.factions.length;
    for (const f of run.factions) {
      if (!Number.isFinite(f.credits)) fails.push(f.short + ' credits not finite');
      if (f.alive && run.started && !run.systems.some(s => s.owner === f.id)) fails.push(f.short + ' alive with no systems');
    }
    for (const s of run.systems) {
      if (s.owner < -1 || s.owner >= nF) fails.push(s.name + ' bad owner');
      if (s.owner >= 0 && !run.factions[s.owner].alive) fails.push(s.name + ' owned by dead faction');
      if (s.gar.n < 0 || s.gar.n !== Math.floor(s.gar.n)) fails.push(s.name + ' garrison ' + s.gar.n);
      if (s.gar.ships < 0) fails.push(s.name + ' ships < 0');
      if (s.gar.vet < 0 || s.gar.vet > 1.0001) fails.push(s.name + ' vet ' + s.gar.vet);
      let used = 0;
      for (const l of s.lines) {
        used += l.fr;
        if (l.fr < 0) fails.push(s.name + ' line fr < 0');
        if (l.stops.length < 2) fails.push(s.name + ' short line');
        if (new Set(l.stops).size !== l.stops.length) fails.push(s.name + ' line repeats a stop');
        for (const st of l.stops) if (st !== -1 && !s.planets[st]) fails.push(s.name + ' line to missing planet');
        if (!(l.dur >= 0 && l.dur <= 100)) fails.push(s.name + ' line dur');
      }
      if (used > s.freighters) fails.push(s.name + ' freighters over-assigned ' + used + '/' + s.freighters);
      if (s.owner >= 0 && s.lines.length > C.econ.maxLines) fails.push(s.name + ' too many lines');
      for (const p of s.planets) if (p.ext && !(p.ext.dur >= 0 && p.ext.dur <= 100)) fails.push(s.name + ' ext dur');
      if (!(s.station.dur >= 0 && s.station.dur <= 100)) fails.push(s.name + ' station dur');
      if (s.battle && !run.battles.some(b => b.id === s.battle)) fails.push(s.name + ' dangling battle');
      if (s.capital >= 0 && s.owner !== s.capital) fails.push(s.name + ' capital not owned by its faction');
      if (s.pop < 0 || s.pop > C.econ.popMax) fails.push(s.name + ' pop');
    }
    for (const b of run.battles) {
      if (run.systems[b.sys].battle !== b.id) fails.push('battle not linked');
      if (b.att.n < 0) fails.push('battle attacker n < 0');
      if (!run.factions[b.att.owner].alive) fails.push('dead attacker');
    }
    for (const a of run.armies) {
      if (a.n < 0 || a.ships < 0 || a.n !== Math.floor(a.n)) fails.push('army counts');
      if (!run.factions[a.owner].alive) fails.push('army of dead faction');
      for (let i = 0; i + 1 < a.path.length; i++) if (!S.laneBetween(run, a.path[i], a.path[i + 1])) fails.push('army path without lane');
      if (!(a.prog >= 0 && a.prog <= 1)) fails.push('army prog');
    }
    return fails;
  };
})(globalThis.AS = globalThis.AS || {});
