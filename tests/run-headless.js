#!/usr/bin/env node
/* ATLAS SYNDICATE v5 — headless test runner (Node 16+, no dependencies).
   Loads the same simulation files the browser uses and runs:
     selftest    rule checks (same as tests/selftest.html)
     tournament  N full games of six AI factions (the player's slot played by the 'balanced' AI)
                 across seeds and difficulties: game length, wins per personality, first attacks,
                 warnings before attacks, snowballing; then the same seeds with leader pressure OFF (A/B)
     player      the scripted average player (tests/average-player.js) against the rivals on Easy and Normal
     fuzz        random (often invalid) player actions; any exception, NaN or broken invariant fails
     replay      determinism: same seed + same action log = identical state; save/load mid-run = identical
     f9          the presenter jump to 15:00 leaves a plausible mid-war galaxy
   Usage: node tests/run-headless.js [all|selftest|tournament|player|fuzz|replay|f9] [--games 210] [--seeds 40] [--json out.json]
   Exit code 0 only when every check passes. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/config.js', 'js/util.js', 'js/sim/galaxy.js', 'js/sim/economy.js', 'js/sim/combat.js', 'js/sim/cards.js', 'js/sim/events.js',
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

/** Play one full game. bot: null (AI in slot 0) or 'average'. */
function play(seed, diff, o) {
  o = o || {};
  const run = S.createRun(seed, { diff, slot0: o.bot ? null : 'balanced', noLeaderPressure: !!o.noLP, endOnPlayerLoss: !!o.bot });
  if (o.log) run.actions = [];
  const cands = S.homeCandidates(run);
  S.begin(run, cands[(seed >>> 3) % cands.length], o.bot ? S.corpOffers(seed)[0] : null);
  const bot = o.bot ? AS.AveragePlayer.create(seed) : null;
  const stepsMax = Math.ceil((C.game.length + 5) / C.sim.step);
  const t0 = Date.now();
  let leaderAt = 0, leaderId = -1, snowball = false, invFail = '';
  const lostAfterLead = {};
  for (let i = 0; i < stepsMax && !run.over; i++) {
    if (bot) AS.AveragePlayer.step(run, bot);
    S.step(run, C.sim.step);
    // count systems lost by whoever is leading, to judge snowballing
    for (const e of run.fx) if (e.type === 'captured' && e.prev >= 0 && lostAfterLead[e.prev] !== undefined) lostAfterLead[e.prev]++;
    run.fx.length = 0;
    if (i % 100 === 0) {
      const L = S.leaderRaw(run);
      if (L >= 0 && lostAfterLead[L] === undefined) { lostAfterLead[L] = 0; if (leaderId < 0) { leaderId = L; leaderAt = run.t; } }
      if (o.check && i % 300 === 0) {
        const fl = S.checkInvariants(run, []); const nf = S.scanFinite(run, 'run', [], 0);
        if (fl.length || nf.length) { invFail = fl.concat(nf).slice(0, 3).join('; '); break; }
      }
    }
  }
  const w = run.winner;
  if (w >= 0 && lostAfterLead[w] === 0) snowball = true;
  const fBattles = run.battleLog.filter(b => b.att >= 0 && b.def >= 0);
  const duringLead = fBattles.filter(b => b.lead >= 0 && b.att !== b.lead);
  return {
    seed, diff, winner: w, winnerPers: w >= 0 ? run.factions[w].pers : 'none', t: run.endT || run.t, reason: run.overReason,
    timeout: /^TIME/.test(run.overReason), alive: run.factions.filter(f => f.alive).length,
    firstAttack: run.stats.firstAttackAny, firstAttackOnSlot0: run.stats.firstAttackOnPlayer, attacksOnSlot0: run.stats.attacksOnPlayer,
    warned: run.stats.warnedAttacks, massWarned: run.stats.massWarned,
    leaderId, leaderAt, leaderWon: leaderId >= 0 && leaderId === w, snowball,
    leadAttacks: duringLead.length, leadAttacksOnLeader: duringLead.filter(b => b.def === b.lead).length,
    battles: run.battleLog.length, systemsEnd: run.factions.map(f => S.ownCount(run, f.id)),
    playerAlive: run.factions[0].alive, playerOutAt: run.factions[0].alive ? 0 : run.factions[0].outAt, playerSystems: S.ownCount(run, 0),
    playerWon: w === 0, playerRank: S.standings(run).findIndex(x => x.id === 0) + 1, ms: Date.now() - t0, invFail, run: o.keep ? run : undefined,
  };
}

function selftest() {
  console.log('\n== SELF-TEST ==');
  const r = AS.SelfTest.run();
  for (const l of r.lines) console.log('  ' + l);
  results.selftest = r;
  if (!r.pass) failed = true;
}

function summarise(rows, label) {
  const n = rows.length;
  const wins = {};
  for (const p of ['balanced', 'warlord', 'merchant', 'turtle', 'opportunist', 'raider']) wins[p] = pct(rows.filter(r => r.winnerPers === p).length, n);
  const fa = rows.filter(r => r.firstAttack).map(r => r.firstAttack);
  const fs0 = rows.filter(r => r.firstAttackOnSlot0).map(r => r.firstAttackOnSlot0);
  const leadRows = rows.filter(r => r.leaderId >= 0);
  const la = rows.reduce((a, r) => a + r.leadAttacks, 0), lal = rows.reduce((a, r) => a + r.leadAttacksOnLeader, 0);
  const att0 = rows.reduce((a, r) => a + r.attacksOnSlot0, 0);
  return {
    label, games: n,
    lengthMeanMin: min(avg(rows.map(r => r.t))), lengthMedianMin: min(med(rows.map(r => r.t))),
    lengthIn20to30: pct(rows.filter(r => r.t >= 1200 && r.t <= 1805).length, n), endedByTimer: pct(rows.filter(r => r.timeout).length, n),
    winsPct: wins,
    firstAttackMeanMin: min(avg(fa)), firstAttackOnPlayerSlotMeanMin: min(avg(fs0)), firstAttackOnPlayerSlotMedianMin: min(med(fs0)),
    attacksOnPlayerSlotWarnedPct: pct(rows.reduce((a, r) => a + r.warned, 0), att0), attacksOnPlayerSlotMassWarnedPct: pct(rows.reduce((a, r) => a + r.massWarned, 0), att0),
    gamesWithLeader: pct(leadRows.length, n), leaderWentOnToWin: pct(leadRows.filter(r => r.leaderWon).length, leadRows.length),
    snowballUnopposed: pct(rows.filter(r => r.snowball).length, n),
    shareOfAttacksOnLeaderWhileLeading: pct(lal, la),
    survivorsAtEndMean: +avg(rows.map(r => r.alive)).toFixed(2), battlesPerGame: Math.round(avg(rows.map(r => r.battles))),
    msPerGame: Math.round(avg(rows.map(r => r.ms))),
  };
}
function printSummary(s) {
  console.log('  [' + s.label + '] games ' + s.games + ', length mean ' + s.lengthMeanMin + ' min (median ' + s.lengthMedianMin + '), 20-30 min: ' + s.lengthIn20to30 + '%, timer: ' + s.endedByTimer + '%');
  console.log('    wins %: ' + Object.entries(s.winsPct).map(([k, v]) => k + ' ' + v).join(', '));
  console.log('    first attack (any faction) ' + s.firstAttackMeanMin + ' min; first attack on player slot mean ' + s.firstAttackOnPlayerSlotMeanMin + ' / median ' + s.firstAttackOnPlayerSlotMedianMin + ' min');
  console.log('    attacks on player slot with a warning >=4 s before: ' + s.attacksOnPlayerSlotWarnedPct + '%, with a massing warning >=8 s before: ' + s.attacksOnPlayerSlotMassWarnedPct + '%');
  console.log('    a faction reached 35%: ' + s.gamesWithLeader + '% of games; that leader went on to win ' + s.leaderWentOnToWin + '%; share of attacks aimed at the leader ' + s.shareOfAttacksOnLeaderWhileLeading + '%');
  console.log('    snowball unopposed (winner never lost a system after reaching 35%): ' + s.snowballUnopposed + '%; survivors at end ' + s.survivorsAtEndMean + '; battles/game ' + s.battlesPerGame + '; ' + s.msPerGame + ' ms/game');
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
  console.log('\n== A/B: same ' + Math.min(rows.length, per * 3) + ' games with leader pressure OFF ==');
  const off = [];
  for (const diff of AS.DIFF_KEYS) for (const seed of seedList(per, 1)) off.push(play(seed, diff, { noLP: true }));
  const offS = summarise(off, 'leader pressure OFF');
  printSummary(offS);
  results.tournament = { all, byDiff, leaderPressureOff: offS, rows: rows.map(r => Object.assign({}, r, { run: undefined })) };
  const maxWin = Math.max(...Object.values(all.winsPct));
  if (maxWin > 34) fail('a personality wins ' + maxWin + '% (> ~30%)');
}
function player() {
  console.log('\n== PLAYER SLOT: scripted average player ==');
  const out = {};
  for (const diff of String(opt('diffs', 'easy,normal,hard')).split(',')) {
    const rows = seedList(NSEEDS, 7).map(s => play(s, diff, { bot: 'average', check: true }));
    for (const r of rows) if (r.invFail) fail('invariant in player test ' + r.seed + ': ' + r.invFail);
    const n = rows.length;
    const s = {
      games: n, survivedPast10Min: pct(rows.filter(r => r.playerAlive || r.playerOutAt > 600).length, n), lost: pct(rows.filter(r => !r.playerWon).length, n),
      eliminated: pct(rows.filter(r => !r.playerAlive).length, n), won: pct(rows.filter(r => r.playerWon).length, n), topTwo: pct(rows.filter(r => r.playerRank <= 2).length, n),
      eliminatedMedianMin: min(med(rows.filter(r => !r.playerAlive).map(r => r.playerOutAt))), systemsAtEndMean: +avg(rows.map(r => r.playerSystems)).toFixed(1),
      firstAttackOnPlayerMedianMin: min(med(rows.filter(r => r.firstAttackOnSlot0).map(r => r.firstAttackOnSlot0))),
      warnedPct: pct(rows.reduce((a, r) => a + r.warned, 0), rows.reduce((a, r) => a + r.attacksOnSlot0, 0)),
    };
    out[diff] = s;
    console.log('  ' + diff.padEnd(7) + JSON.stringify(s));
  }
  results.player = out;
  if (!out.normal || !out.easy) return;
  if (out.normal.survivedPast10Min < 60) fail('average player survives past 10 min on Normal only ' + out.normal.survivedPast10Min + '%');
  if (out.normal.eliminated === 0) fail('average player never loses on Normal');
  if (out.easy.won < 50) fail('average player wins on Easy only ' + out.easy.won + '%');
}
function fuzz() {
  console.log('\n== FUZZ: ' + NFUZZ + ' games of random player actions ==');
  const fails = [];
  let tried = 0, steps = 0, saves = 0;
  for (let k = 0; k < NFUZZ; k++) {
    const seed = 5000 + k * 7919, R = U.rng(seed ^ 0xbeef);
    let run = S.createRun(seed, { diff: AS.DIFF_KEYS[k % 3] });
    const pickI = n => Math.floor(R() * n);
    try {
      S.begin(run, R() < 0.2 ? -5 : S.homeCandidates(run)[pickI(10)], R() < 0.2 ? 'bogus' : AS.CORP_KEYS[pickI(8)]);
      const bot = k % 2 ? AS.AveragePlayer.create(seed) : null;
      for (let i = 0; i < (C.game.length + 5) / C.sim.step && !run.over; i++) {
        if (bot) AS.AveragePlayer.step(run, bot);
        if (R() < 0.12) {
          tried++;
          const sys = R() < 0.9 ? pickI(24) : pickI(40) - 8, f0 = run.factions[0];
          const s = run.systems[sys];
          const line = s && s.lines.length ? s.lines[pickI(s.lines.length)].id : pickI(5);
          const nodes = () => pickI(8) - 2;
          switch (pickI(19)) {
            case 0: S.act(run, 0, 'ext', { sys, planet: nodes() }); break;
            case 1: S.act(run, 0, 'line', { sys, a: nodes(), b: nodes() }); break;
            case 2: S.act(run, 0, 'unline', { sys, line }); break;
            case 3: S.act(run, 0, 'trim', { sys, line }); break;
            case 4: S.act(run, 0, 'fr', { sys, line, d: R() < 0.5 ? 1 : -1 }); break;
            case 5: S.act(run, 0, 'buyfr', { sys }); break;
            case 6: S.act(run, 0, 'repair', { sys, kind: ['station', 'ext', 'line', 'fleet', 'plat', 'ships', 'x'][pickI(7)], idx: nodes() }); break;
            case 7: S.act(run, 0, 'repairall', { sys }); break;
            case 8: S.act(run, 0, 'recruit', { sys, n: pickI(40) - 5 }); break;
            case 9: S.act(run, 0, 'cancel', { sys }); break;
            case 10: S.act(run, 0, 'ship', { sys }); break;
            case 11: S.act(run, 0, 'plat', { sys }); break;
            case 12: S.act(run, 0, 'move', { from: f0.capital, to: pickI(24), frac: R() * 1.4 - 0.2, mode: R() < 0.3 ? 'raid' : 'attack' }); break;
            case 13: S.act(run, 0, 'move', { from: sys, to: pickI(26) - 1, frac: R() }); break;
            case 14: S.act(run, 0, 'buy', { sys }); break;
            case 15: if (run.battles.length) S.act(run, 0, 'retreat', { battle: run.battles[pickI(run.battles.length)].id }); break;
            case 16: S.act(run, 0, 'card', { key: f0.drafts[0] && R() < 0.8 ? f0.drafts[0].offers[pickI(3)] : 'nonsense' }); break;
            case 17: S.act(run, 0, 'autorepair', { on: R() < 0.5 }); break;
            case 18: if (R() < 0.05) f0.credits -= 2000 * R(); else S.act(run, 0, 'bogus', {}); break;
          }
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
  results.fuzz = { games: NFUZZ, actionsTried: tried, steps, saveRoundTrips: saves, fails };
  console.log('  games ' + NFUZZ + ', random actions ' + tried + ', steps ' + steps + ', save/load round trips ' + saves + ', failures ' + fails.length);
  for (const f of fails) fail(f);
}
function replay() {
  console.log('\n== DETERMINISM ==');
  const out = [];
  for (const [seed, diff] of [[424242, 'normal'], [777, 'hard'], [31337, 'easy']]) {
    const a = play(seed, diff, { bot: 'average', log: true, keep: true });
    const run = S.createRun(seed, { diff, slot0: null, endOnPlayerLoss: true });
    const cands = S.homeCandidates(run);
    S.begin(run, cands[(seed >>> 3) % cands.length], S.corpOffers(seed)[0]);
    run.actions = [];   // the replay logs too, so both states carry the same log
    const log = a.run.actions;
    let li = 0;
    while (!run.over && run.t < C.game.length + 5) {
      while (li < log.length && log[li][0] === run.steps) { const [, n, x] = log[li++]; S.act(run, 0, n, x); }
      S.step(run, C.sim.step);
      run.fx.length = 0;
    }
    const h1 = S.hash(a.run), h2 = S.hash(run);
    // save at 10 minutes, resume from JSON, continue: must match an uninterrupted game
    const mk = () => { const r = S.createRun(seed, { diff, slot0: 'balanced' }); S.begin(r, -1, null); return r; };
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
    S.begin(run, S.homeCandidates(run)[0], S.corpOffers(seed)[0]);
    S.presenterJump(run, 900);
    const own = S.ownCount(run, 0), alive = run.factions.filter(f => f.alive).length;
    const fine = run.factions[0].alive && own >= 2 && alive >= 3 && run.t >= 899;
    if (fine) ok++;
    rows.push({ seed, t: Math.round(run.t), playerSystems: own, factionsAlive: alive, battles: run.battleLog.length });
  }
  console.log('  ' + ok + '/' + rows.length + ' jumps land in a playable mid-war state (player alive with 2+ systems, 3+ factions left)');
  console.log('  ' + JSON.stringify(rows.slice(0, 5)));
  results.f9 = { ok, n: rows.length, rows };
  if (ok < rows.length * 0.9) fail('F9 jump left an unplayable state too often');
}

if (mode === 'all' || mode === 'selftest') selftest();
if (mode === 'all' || mode === 'replay') replay();
if (mode === 'all' || mode === 'fuzz') fuzz();
if (mode === 'all' || mode === 'f9') f9();
if (mode === 'all' || mode === 'player') player();
if (mode === 'all' || mode === 'tournament') tournament();
const jsonOut = opt('json', null);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
console.log('\n' + (failed ? 'RESULT: FAIL' : 'RESULT: PASS'));
process.exit(failed ? 1 : 0);
