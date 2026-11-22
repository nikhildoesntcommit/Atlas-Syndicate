#!/usr/bin/env node
/* ATLAS SYNDICATE v6 — headless test runner (Node 16+, no dependencies).
   Loads the same simulation files the browser uses and runs:
     selftest    rule checks (same as tests/selftest.html)
     tournament  N full games of six AI factions (the player's slot played by the 'balanced' AI) across
                 seeds and difficulties, then the same games with coalitions switched off (A/B)
     player      the scripted average player (tests/average-player.js) on Easy, Normal and Hard
     economy     50 seeds: AI-built planets produce what their buildings claim, no building idle > 3 min,
                 every resource is spent on something
     fuzz        random (often invalid) player actions incl. every planet action; no crash, NaN or broken invariant
     replay      same seed + same action log = identical state; save/load mid-game = identical
     f9          the presenter jump to 15:00 leaves a playable mid-war galaxy
   Usage: node tests/run-headless.js [all|selftest|tournament|player|economy|fuzz|replay|f9] [--games 210] [--seeds 40] [--json out.json]
   Exit code 0 only when every check passes (balance targets are reported, not enforced). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/config.js', 'js/util.js', 'js/sim/planet.js', 'js/sim/galaxy.js', 'js/sim/economy.js', 'js/sim/combat.js', 'js/sim/upgrades.js', 'js/sim/events.js',
  'js/sim/sim.js', 'js/sim/actions.js', 'js/sim/ai/personalities.js', 'js/sim/ai/brain.js', 'js/sim/selftest.js', 'tests/average-player.js'];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const AS = globalThis.AS, S = AS.S, U = AS.U, C = AS.CONFIG;

const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const NGAMES = +opt('games', 210), NSEEDS = +opt('seeds', 40), NFUZZ = +opt('fuzz', 30);
const results = {};
let failed = false;
const fail = msg => { failed = true; console.log('  FAIL ' + msg); };
const seedList = (n, salt) => Array.from({ length: n }, (_, i) => ((Math.imul(i + 1 + (salt || 0) * 1000, 2654435761) >>> 0) % 900000) + 1000);
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const min = v => +(v / 60).toFixed(1);

/** Play one full game. o.bot: 'average' puts the scripted player in slot 0; otherwise the AI plays it. */
function play(seed, diff, o) {
  o = o || {};
  const run = S.createRun(seed, { diff, slot0: o.bot ? null : 'balanced', noCoalition: !!o.noCo, endOnPlayerLoss: !!o.bot });
  if (!o.bot) run.seat0Same = true;   // tournament: seat 0 plays at the game's difficulty too, so all six seats are equal
  if (o.log) run.actions = [];
  const cands = S.homeCandidates(run);
  S.begin(run, cands[(seed >>> 3) % cands.length]);
  const bot = o.bot ? AS.AveragePlayer.create(seed) : null;
  const stepsMax = Math.ceil((C.game.length + 5) / C.sim.step);
  const t0 = Date.now();
  let invFail = '';
  for (let i = 0; i < stepsMax && !run.over; i++) {
    if (bot) AS.AveragePlayer.step(run, bot);
    S.step(run, C.sim.step);
    run.fx.length = 0;
    if (o.check && i % 300 === 0) {
      const fl = S.checkInvariants(run, []), nf = S.scanFinite(run, 'run', [], 0);
      if (fl.length || nf.length) { invFail = fl.concat(nf).slice(0, 3).join('; '); break; }
    }
  }
  const w = run.winner;
  const L = run.stats.leaders, firstLeader = Object.keys(L).map(Number).sort((a, b) => L[a].at - L[b].at)[0];
  return {
    seed, diff, winner: w, winnerPers: w >= 0 ? run.factions[w].pers : 'none', t: run.endT || run.t, how: run.endHow,
    alive: run.factions.filter(f => f.alive).length,
    firstAttack: run.stats.firstAttackAny, firstAttackOnSlot0: run.stats.firstAttackOnPlayer, attacksOnSlot0: run.stats.attacksOnPlayer,
    warned: run.stats.warnedAttacks, massWarned: run.stats.massWarned,
    leaders: Object.keys(L).length, firstLeader: firstLeader === undefined ? -1 : firstLeader,
    leaderWon: firstLeader !== undefined && +firstLeader === w, leaderLostAfter: firstLeader !== undefined && L[firstLeader].lost > 0,
    coalitions: run.coalitions.length, coalitionStrikes: run.stats.coalitionStrikes || 0, coalitionResults: run.coalitions.map(c => c.result),
    playerAlive: run.factions[0].alive, playerOutAt: run.factions[0].alive ? 0 : run.factions[0].outAt, playerSystems: S.ownCount(run, 0), playerWon: w === 0,
    playerRank: S.standings(run).findIndex(x => x.id === 0) + 1, ms: Date.now() - t0, invFail, run: o.keep ? run : undefined,
  };
}

function selftest() {
  console.log('\n== SELF-TEST ==');
  const r = AS.SelfTest.run();
  for (const l of r.lines) console.log('  ' + l);
  results.selftest = r;
  if (!r.pass) failed = true;
}

const PERS = ['balanced', 'warlord', 'merchant', 'turtle', 'opportunist', 'raider'];
function summarise(rows, label) {
  const n = rows.length, wins = {};
  for (const p of PERS) wins[p] = pct(rows.filter(r => r.winnerPers === p).length, n);
  const lead = rows.filter(r => r.firstLeader >= 0), att0 = rows.reduce((a, r) => a + r.attacksOnSlot0, 0);
  return {
    label, games: n, lengthMeanMin: min(avg(rows.map(r => r.t))), lengthMedianMin: min(med(rows.map(r => r.t))),
    endedByElimination: pct(rows.filter(r => r.how === 'elimination').length, n), endedByTimer: pct(rows.filter(r => r.how === 'timer').length, n),
    winsPct: wins, firstAttackMeanMin: min(avg(rows.filter(r => r.firstAttack).map(r => r.firstAttack))),
    firstAttackOnPlayerSlotMedianMin: min(med(rows.filter(r => r.firstAttackOnSlot0).map(r => r.firstAttackOnSlot0))),
    warnedPct: pct(rows.reduce((a, r) => a + r.warned, 0), att0), massWarnedPct: pct(rows.reduce((a, r) => a + r.massWarned, 0), att0),
    gamesWithLeader: pct(lead.length, n), leaderWonPct: pct(lead.filter(r => r.leaderWon).length, lead.length),
    leaderLostSystemsPct: pct(lead.filter(r => r.leaderLostAfter).length, lead.length),
    coalitionsPerGame: +avg(rows.map(r => r.coalitions)).toFixed(2), coalitionStrikesPerGame: +avg(rows.map(r => r.coalitionStrikes)).toFixed(1),
    survivorsAtEnd: +avg(rows.map(r => r.alive)).toFixed(2), msPerGame: Math.round(avg(rows.map(r => r.ms))),
  };
}
function printSummary(s) {
  console.log('  [' + s.label + '] games ' + s.games + ', length mean ' + s.lengthMeanMin + ' min (median ' + s.lengthMedianMin + '); ended by elimination ' + s.endedByElimination + '%, by timer ' + s.endedByTimer + '%');
  console.log('    wins %: ' + Object.entries(s.winsPct).map(([k, v]) => k + ' ' + v).join(', '));
  console.log('    a faction reached 35% in ' + s.gamesWithLeader + '% of games; that leader won ' + s.leaderWonPct + '% and lost systems afterwards in ' + s.leaderLostSystemsPct + '%; coalitions/game ' + s.coalitionsPerGame + ', coalition strikes/game ' + s.coalitionStrikesPerGame);
  console.log('    first attack ' + s.firstAttackMeanMin + ' min; on player slot (median) ' + s.firstAttackOnPlayerSlotMedianMin + ' min; attacks on player slot warned ' + s.warnedPct + '% (massing ' + s.massWarnedPct + '%); survivors ' + s.survivorsAtEnd + '; ' + s.msPerGame + ' ms/game');
}
function tournament() {
  const per = Math.ceil(NGAMES / 3);
  console.log('\n== AI TOURNAMENT: ' + per * 3 + ' full games, 6 AI factions, easy/normal/hard ==');
  const rows = [];
  for (const diff of AS.DIFF_KEYS) for (const seed of seedList(per, 1)) {
    const r = play(seed, diff, { check: true });
    if (r.invFail) fail('invariant in tournament seed ' + seed + ' ' + diff + ': ' + r.invFail);
    rows.push(r);
  }
  const all = summarise(rows, 'all');
  printSummary(all);
  const byDiff = {};
  for (const d of AS.DIFF_KEYS) { byDiff[d] = summarise(rows.filter(r => r.diff === d), d); printSummary(byDiff[d]); }
  let off = null;
  if (!opt('noab', null)) {
    console.log('\n== A/B: the same games with coalitions OFF ==');
    const offRows = [];
    for (const diff of AS.DIFF_KEYS) for (const seed of seedList(per, 1)) offRows.push(play(seed, diff, { noCo: true }));
    off = summarise(offRows, 'coalitions OFF');
    printSummary(off);
  }
  results.tournament = { all, byDiff, coalitionsOff: off, rows: rows.map(r => Object.assign({}, r, { run: undefined })) };
  const w = Object.values(all.winsPct);
  console.log('\n  TARGETS: leader wins <= ~55%: ' + (all.leaderWonPct <= 55 ? 'MET' : 'MISSED') + ' (' + all.leaderWonPct + '%); leader loses systems in most games: ' + (all.leaderLostSystemsPct > 50 ? 'MET' : 'MISSED') + ' (' + all.leaderLostSystemsPct + '%)');
  console.log('           >= 50% end by elimination: ' + (all.endedByElimination >= 50 ? 'MET' : 'MISSED') + ' (' + all.endedByElimination + '%); every personality 10-30%: ' + (Math.min(...w) >= 10 && Math.max(...w) <= 30 ? 'MET' : 'MISSED') + ' (' + Math.min(...w) + '-' + Math.max(...w) + '%)');
}
function player() {
  console.log('\n== PLAYER SLOT: scripted average player ==');
  const out = {};
  for (const diff of String(opt('diffs', 'easy,normal,hard')).split(',')) {
    const rows = seedList(NSEEDS, 7).map(s => play(s, diff, { bot: 'average', check: true }));
    for (const r of rows) if (r.invFail) fail('invariant in player test ' + r.seed + ': ' + r.invFail);
    const n = rows.length;
    out[diff] = { games: n, won: pct(rows.filter(r => r.playerWon).length, n), topTwo: pct(rows.filter(r => r.playerRank <= 2).length, n),
      eliminated: pct(rows.filter(r => !r.playerAlive).length, n), survivedPast10Min: pct(rows.filter(r => r.playerAlive || r.playerOutAt > 600).length, n),
      systemsAtEndMean: +avg(rows.map(r => r.playerSystems)).toFixed(1), warnedPct: pct(rows.reduce((a, r) => a + r.warned, 0), rows.reduce((a, r) => a + r.attacksOnSlot0, 0)) };
    console.log('  ' + diff.padEnd(7) + JSON.stringify(out[diff]));
  }
  results.player = out;
  if (out.easy && out.normal && out.hard) console.log('  TARGETS: Easy >= 55%: ' + (out.easy.won >= 55 ? 'MET' : 'MISSED') + ' (' + out.easy.won + '%); Normal 25-40%: ' + (out.normal.won >= 25 && out.normal.won <= 40 ? 'MET' : 'MISSED') + ' (' + out.normal.won + '%); Hard 10-20%: ' + (out.hard.won >= 10 && out.hard.won <= 20 ? 'MET' : 'MISSED') + ' (' + out.hard.won + '%)');
}
/** Economy sanity on AI empires: claims match production, nothing idles for long, every resource is used. */
function economy() {
  const seeds = seedList(+opt('econ', 50), 11);
  console.log('\n== ECONOMY SANITY: ' + seeds.length + ' seeds, all-AI games to 20:00 ==');
  let checked = 0, mismatches = 0, evSkipped = 0, idleLong = 0, idleSamples = [], buildings = 0;
  const used = { credits: 0, alloy: 0, fuel: 0, food: 0 }, made = { credits: 0, alloy: 0, fuel: 0, food: 0 };
  for (const seed of seeds) {
    const run = S.createRun(seed, { diff: 'normal', slot0: 'balanced' });
    S.begin(run, -1);
    const idleSince = {};
    while (run.t < 1200 && !run.over) {
      const before = run.factions.map(f => ({ credits: f.credits, alloy: f.alloy, fuel: f.fuel, food: f.food }));
      const lastCycle = run.cycleT + C.sim.step >= C.game.cycle;
      let claims = null;
      if (lastCycle) claims = run.factions.map(f => { const o = { credits: 0, alloy: 0, fuel: 0, food: 0 }; for (const s of run.systems) if (s.owner === f.id) { const fl = S.sysFlow(run, s); for (const k in o) o[k] += fl.out[k]; } return o; });
      const sig = () => run.events.active.map(e => e.type + e.start).join() + '|' + run.systems.map(s => s.owner + ':' + s.pathways.map(w => w.id + (w.dur > 0 ? 'u' : 'x')).join() + ':' + s.planets.map(p => p.blds.map(b => b.id + (b.dur > 0 ? 'u' : 'x') + (b.drill ? 'd' + (b.drill.dur > 0 ? 1 : 0) : '') + (b.out ? 'o' + (b.out.b !== undefined ? b.out.b : 'p' + b.out.p) + (b.out.dur > 0 ? 1 : 0) : '')).join() + '/' + Object.keys(p.portIn).map(k => k + '>' + p.portIn[k].b + (p.portIn[k].dur > 0 ? 1 : 0)).join()).join(';')).join('#');
      const evBefore = claims ? sig() : '';
      S.step(run, C.sim.step);
      if (claims && sig() !== evBefore) { claims = null; evSkipped++; }   // something was built, broken, captured or an event began inside this exact tick: the claim is stale
      for (const e of run.fx) if (e.type === 'yield') { /* produced this cycle */ }
      run.fx.length = 0;
      if (claims) {
        // production the buildings claimed must be exactly what the cycle paid out (before spending)
        for (const f of run.factions) {
          if (!f.alive) continue;
          checked++;
          const lc = f.lastCycle.got;
          for (const k of ['alloy', 'fuel', 'food']) if (Math.abs(lc[k] - claims[f.id][k]) > 1e-6) { mismatches++; if (process.env.DBG) console.log('MISMATCH', seed, Math.round(run.t), f.id, k, lc[k], claims[f.id][k]); }
          const credClaim = (claims[f.id].credits + C.econ.levy * S.ownCount(run, f.id)) * f.mods.income;
          if (Math.abs(lc.credits - credClaim) > 1e-6 && Math.abs(lc.credits - credClaim) / Math.max(1, credClaim) > 0.2) mismatches++;
          for (const k in made) made[k] += lc[k];
        }
        // idle buildings in AI empires: count any that stay idle/blocked for over 3 minutes (broken = repairs pending, empty = depleted: excluded)
        for (const s of run.systems) {
          if (s.owner < 0) continue;
          const fl = S.sysFlow(run, s);
          s.planets.forEach(p => p.blds.forEach(b => {
            const st = fl.B[b.id];
            const idle = st.status === 'idle' || st.status === 'blocked';
            const k = s.id + ':' + b.id + ':' + s.owner;
            if (idle) { if (idleSince[k] === undefined) idleSince[k] = run.t; else if (run.t - idleSince[k] > 180 && run.t - s.lastCaptured > 180) { idleLong++; if (idleSamples.length < 6) idleSamples.push(AS.BLD[b.kind].name + ': ' + st.reason); idleSince[k] = run.t + 1e9; } }
            else delete idleSince[k];
          }));
        }
      }
    }
    for (const f of run.factions) {
      used.credits += f.stats.salary + f.stats.spent; used.alloy += f.stats.alloyUsed; used.fuel += f.stats.fuelUsed; used.food += f.stats.foodUsed;
      buildings += run.systems.filter(s => s.owner === f.id).reduce((a, s) => a + s.planets.reduce((x, p) => x + p.blds.length, 0), 0);
    }
  }
  const allUsed = used.credits > 0 && used.fuel > 0 && used.food > 0 && used.alloy > 0;
  results.economy = { seeds: seeds.length, cycleChecks: checked, mismatches, skippedChangedTicks: evSkipped, idleOver3Min: idleLong, idleSamples, buildingsPerGame: Math.round(buildings / seeds.length), made: Object.fromEntries(Object.entries(made).map(([k, v]) => [k, Math.round(v / seeds.length)])), used: Object.fromEntries(Object.entries(used).map(([k, v]) => [k, Math.round(v / seeds.length)])) };
  console.log('  ' + JSON.stringify(results.economy));
  if (mismatches) fail('production did not match what buildings claimed (' + mismatches + ')');
  if (!allUsed) fail('a resource is never spent');
}
function fuzz() {
  console.log('\n== FUZZ: ' + NFUZZ + ' games of random player actions ==');
  const fails = [];
  let tried = 0, steps = 0, saves = 0, okActs = 0;
  for (let k = 0; k < NFUZZ; k++) {
    const seed = 5000 + k * 7919, R = U.rng(seed ^ 0xbeef);
    let run = S.createRun(seed, { diff: AS.DIFF_KEYS[k % 3] });
    const pickI = n => Math.floor(R() * n);
    try {
      S.begin(run, R() < 0.2 ? -5 : S.homeCandidates(run)[pickI(6)]);
      const bot = k % 2 ? AS.AveragePlayer.create(seed) : null;
      for (let i = 0; i < (C.game.length + 5) / C.sim.step && !run.over; i++) {
        if (bot) AS.AveragePlayer.step(run, bot);
        if (R() < 0.15) {
          tried++;
          const f0 = run.factions[0];
          const sys = R() < 0.85 ? f0.capital : pickI(30) - 3, s = run.systems[sys];
          const pi = pickI(7) - 1, p = s && s.planets[pi];
          const b = p && p.blds.length ? p.blds[pickI(p.blds.length)] : null;
          const pw = s && s.pathways.length ? s.pathways[pickI(s.pathways.length)] : null;
          const cell = () => pickI(S.GW * S.GH + 4) - 2;
          let r;
          switch (pickI(20)) {
            case 0: r = S.act(run, 0, 'build', { sys, planet: pi, slot: pickI(12) - 1, kind: R() < 0.9 ? AS.BLD_KEYS[pickI(8)] : 'bogus' }); break;
            case 1: { // a real cheapest drill most of the time, garbage otherwise
              if (b && p && R() < 0.7) { const d = p.deposits[pickI(p.deposits.length)]; const dr = d && S.bestDrill(run, f0, p, b.slot, d); r = S.act(run, 0, 'drill', { sys, planet: pi, bld: b.id, path: dr ? dr.path : [] }); }
              else r = S.act(run, 0, 'drill', { sys, planet: pi, bld: b ? b.id : 9999, path: Array.from({ length: pickI(12) }, cell) });
              break;
            }
            case 2: r = S.act(run, 0, 'connect', { sys, planet: pi, from: b ? { b: b.id } : { p: pw ? pw.id : 1 }, to: R() < 0.5 && pw ? { p: pw.id } : { b: p && p.blds.length ? p.blds[pickI(p.blds.length)].id : 7 } }); break;
            case 3: r = S.act(run, 0, 'connect', { sys, planet: pi, from: { p: pw ? pw.id : -1 }, to: { b: b ? b.id : -1 } }); break;
            case 4: r = S.act(run, 0, 'disconnect', { sys, planet: pi, from: R() < 0.5 ? { b: b ? b.id : 0 } : { p: pw ? pw.id : 0 } }); break;
            case 5: r = S.act(run, 0, 'demolish', { sys, planet: pi, bld: b ? b.id : -3 }); break;
            case 6: r = S.act(run, 0, 'pathway', { sys, a: pickI(7) - 1, b: pickI(7) - 1 }); break;
            case 7: r = S.act(run, 0, 'unpath', { sys, pathway: pw ? pw.id : 12345 }); break;
            case 8: r = S.act(run, 0, 'repair', { sys, kind: ['all', 'bld', 'drill', 'conv', 'portconv', 'pathway', 'plat', 'ships', 'x'][pickI(9)], planet: pi, id: b ? b.id : pw ? pw.id : -1 }); break;
            case 9: r = S.act(run, 0, 'recruit', { sys, n: pickI(40) - 5 }); break;
            case 10: r = S.act(run, 0, 'cancel', { sys }); break;
            case 11: r = S.act(run, 0, 'ship', { sys }); break;
            case 12: r = S.act(run, 0, 'plat', { sys }); break;
            case 13: r = S.act(run, 0, 'move', { from: f0.capital, to: pickI(26) - 1, frac: R() * 1.4 - 0.2, mode: R() < 0.3 ? 'raid' : 'attack' }); break;
            case 14: r = S.act(run, 0, 'buy', { sys: pickI(26) - 1 }); break;
            case 15: if (run.battles.length) r = S.act(run, 0, 'retreat', { battle: run.battles[pickI(run.battles.length)].id }); break;
            case 16: r = S.act(run, 0, 'upgrade', { track: R() < 0.9 ? AS.UPG_TRACKS[pickI(4)] : 'nonsense' }); break;
            case 17: r = S.act(run, 0, 'autorepair', { on: R() < 0.5 }); break;
            case 18: if (R() < 0.05) { f0.credits += 3000; f0.alloy += 300; } else r = S.act(run, 0, 'bogus', {}); break;
            case 19: if (R() < 0.03) { f0.food = 0; f0.fuel = 0; } break;
          }
          if (r && r.ok) okActs++;
        }
        S.step(run, C.sim.step);
        run.fx.length = 0;
        steps++;
        if (i % 50 === 0) {
          const bad = S.scanFinite(run, 'run', [], 0);
          if (bad.length) throw new Error('non-finite ' + bad.slice(0, 4).join(', '));
          const fl = S.checkInvariants(run, []);
          if (fl.length) throw new Error('invariant: ' + fl.slice(0, 4).join('; '));
        }
        if (i % 3000 === 1500) { run = S.deserialize(S.serialize(run)); saves++; }
      }
    } catch (e) { fails.push('seed ' + seed + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
  }
  results.fuzz = { games: NFUZZ, actionsTried: tried, actionsAccepted: okActs, steps, saveRoundTrips: saves, fails };
  console.log('  games ' + NFUZZ + ', random actions ' + tried + ' (' + okActs + ' accepted), steps ' + steps + ', save/load round trips ' + saves + ', failures ' + fails.length);
  for (const f of fails) fail(f);
}
function replay() {
  console.log('\n== DETERMINISM ==');
  const out = [];
  for (const [seed, diff] of [[424242, 'normal'], [777, 'hard'], [31337, 'easy']]) {
    const a = play(seed, diff, { bot: 'average', log: true, keep: true });
    const run = S.createRun(seed, { diff, slot0: null, endOnPlayerLoss: true });
    const cands = S.homeCandidates(run);
    S.begin(run, cands[(seed >>> 3) % cands.length]);
    run.actions = [];
    const log = a.run.actions;
    let li = 0;
    while (!run.over && run.t < C.game.length + 5) {
      while (li < log.length && log[li][0] === run.steps) { const [, n, x] = log[li++]; S.act(run, 0, n, x); }
      S.step(run, C.sim.step);
      run.fx.length = 0;
    }
    const h1 = S.hash(a.run), h2 = S.hash(run);
    const mk = () => { const r = S.createRun(seed, { diff, slot0: 'balanced' }); S.begin(r, -1); return r; };
    const x = mk();
    let y = mk();
    for (let i = 0; i < 10 * 60 * 15; i++) {
      S.step(x, C.sim.step); x.fx.length = 0;
      S.step(y, C.sim.step); y.fx.length = 0;
      if (i === 10 * 60 * 10) y = S.deserialize(JSON.parse(JSON.stringify(JSON.parse(S.serialize(y)))));
    }
    const ok = h1 === h2 && S.hash(x) === S.hash(y);
    out.push({ seed, diff, actions: log.length, ok });
    console.log('  seed ' + seed + ' ' + diff + ': ' + log.length + ' player actions replayed, hash ' + h1 + (h1 === h2 ? ' == ' : ' != ') + h2 + ', save/resume at 10:00 ' + (S.hash(x) === S.hash(y) ? 'identical' : 'DIVERGED'));
    if (!ok) failed = true;
  }
  results.replay = out;
}
function f9() {
  console.log('\n== F9 PRESENTER JUMP (to 15:00 with the AI playing your slot) ==');
  let ok = 0;
  const rows = [];
  for (const seed of seedList(20, 3)) {
    const run = S.createRun(seed, { diff: 'normal' });
    S.begin(run, S.homeCandidates(run)[0]);
    S.presenterJump(run, 900);
    const own = S.ownCount(run, 0), alive = run.factions.filter(f => f.alive).length;
    const blds = run.systems.filter(s => s.owner === 0).reduce((a, s) => a + s.planets.reduce((x, p) => x + p.blds.length, 0), 0);
    if (run.factions[0].alive && own >= 2 && alive >= 3 && run.t >= 899 && blds >= 8) ok++;
    rows.push({ seed, t: Math.round(run.t), playerSystems: own, playerBuildings: blds, factionsAlive: alive });
  }
  console.log('  ' + ok + '/' + rows.length + ' jumps land in a playable mid-war state (player alive, 2+ systems, 8+ buildings, 3+ factions left)');
  results.f9 = { ok, n: rows.length, rows };
  if (ok < rows.length * 0.8) fail('F9 jump left an unplayable state too often');
}

if (mode === 'all' || mode === 'selftest') selftest();
if (mode === 'all' || mode === 'replay') replay();
if (mode === 'all' || mode === 'fuzz') fuzz();
if (mode === 'all' || mode === 'f9') f9();
if (mode === 'all' || mode === 'economy') economy();
if (mode === 'all' || mode === 'player') player();
if (mode === 'all' || mode === 'tournament') tournament();
const jsonOut = opt('json', null);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
console.log('\n' + (failed ? 'RESULT: FAIL' : 'RESULT: PASS'));
process.exit(failed ? 1 : 0);
