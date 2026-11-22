#!/usr/bin/env node
/* ATLAS SYNDICATE v4 — headless test runner (Node 16+, no dependencies).
   Loads the same simulation files the browser uses and runs:
     balance   8 charters x N seeds x bot skill levels, reports survival / megaproject reach / completion
     fuzz      random (often invalid) player actions; any exception, NaN or broken invariant fails
     replay    determinism: same seed + same action log = identical state; save/load mid-run = identical state
   Usage: node tests/run-headless.js [all|balance|fuzz|replay] [--seeds 10] [--fuzz 40] [--json out.json]
   Exit code 0 only when every check passes. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/config.js', 'js/util.js', 'js/sim/world.js', 'js/sim/economy.js', 'js/sim/logistics.js',
  'js/sim/actions.js', 'js/sim/events.js', 'js/sim/sim.js', 'js/sim/bot.js', 'js/sim/selftest.js'];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const AS = globalThis.AS, S = AS.S, U = AS.U, C = AS.CONFIG;

const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const NSEEDS = +opt('seeds', 10), NFUZZ = +opt('fuzz', 40), LIMIT = +opt('limit', 50) * 60;
const results = { balance: null, fuzz: null, replay: null, selftest: null };
let failed = false;

const seedList = n => Array.from({ length: n }, (_, i) => (Math.imul(i + 1, 2654435761) >>> 0) % 900000 + 1000);
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function balance() {
  const seeds = seedList(NSEEDS), out = {};
  console.log('\n== BALANCE: ' + AS.CHARTER_KEYS.length + ' charters x ' + seeds.length + ' seeds, limit ' + LIMIT / 60 + ' min ==');
  for (const skill of ['skilled', 'casual', 'idle']) {
    const rows = [];
    const t0 = Date.now();
    for (const ch of AS.CHARTER_KEYS) for (const s of seeds) {
      const r = AS.Bot.simulate(s, ch, skill, LIMIT, { check: true });
      if (r.fails.length) { failed = true; console.log('  FAIL ' + skill + ' ' + ch + ' seed ' + s + ': ' + r.fails.join('; ')); }
      rows.push({ ch, seed: s, t: Math.round(r.t), won: r.won, reached: r.sysDone >= 1, sys2: r.sysDone >= 2, done: r.won, doneAt: Math.round(r.doneAt), sys: r.sys + 1, score: r.score, lost: r.over && !r.won, minConf: Math.round(r.minConf) });
    }
    const n = rows.length, lost = rows.filter(r => r.lost), done = rows.filter(r => r.done);
    const summary = {
      runs: n, survivalMedianMin: +(med(rows.map(r => r.t)) / 60).toFixed(1), survivalMeanMin: +(avg(rows.map(r => r.t)) / 60).toFixed(1),
      lossRate: pct(lost.length, n), firstGateRate: pct(rows.filter(r => r.reached).length, n), secondGateRate: pct(rows.filter(r => r.sys2).length, n), winRate: pct(done.length, n),
      winMedianMin: done.length ? +(med(done.map(r => r.doneAt)) / 60).toFixed(1) : null,
      winRangeMin: done.length ? [+(Math.min(...done.map(r => r.doneAt)) / 60).toFixed(1), +(Math.max(...done.map(r => r.doneAt)) / 60).toFixed(1)] : null,
      lossMedianMin: lost.length ? +(med(lost.map(r => r.t)) / 60).toFixed(1) : null,
      scoreMedian: med(rows.map(r => r.score)), ms: Date.now() - t0,
      perCharter: {},
    };
    for (const ch of AS.CHARTER_KEYS) {
      const rr = rows.filter(r => r.ch === ch);
      summary.perCharter[ch] = { gate1: pct(rr.filter(r => r.reached).length, rr.length), gate2: pct(rr.filter(r => r.sys2).length, rr.length), won: pct(rr.filter(r => r.done).length, rr.length), lost: pct(rr.filter(r => r.lost).length, rr.length), winMedianMin: rr.some(r => r.done) ? +(med(rr.filter(r => r.done).map(r => r.doneAt)) / 60).toFixed(1) : null };
    }
    out[skill] = { summary, rows };
    console.log('  ' + skill.padEnd(8) + JSON.stringify(Object.assign({}, summary, { perCharter: undefined })));
    for (const ch of AS.CHARTER_KEYS) console.log('     ' + ch.padEnd(10) + JSON.stringify(summary.perCharter[ch]));
  }
  results.balance = out;
}

function fuzz() {
  console.log('\n== FUZZ: ' + NFUZZ + ' runs of random player actions ==');
  const fails = [];
  let actionsTried = 0, stepsRun = 0, saves = 0;
  for (let k = 0; k < NFUZZ; k++) {
    const seed = 5000 + k * 7919, ch = AS.CHARTER_KEYS[k % AS.CHARTER_KEYS.length];
    const run = S.createRun(seed, ch), R = U.rng(seed ^ 0xbeef);
    const pick = a => (a.length ? a[Math.floor(R() * a.length)] : null);
    const bot = k % 2 === 0 ? AS.Bot.create(seed, 'casual') : null;
    let cur = run;
    try {
      for (let i = 0; i < 20 * 60 * (12 + (k % 4) * 6) && !cur.over; i++) {
        if (cur.shop) { S.act(cur, 'perk', { key: R() < 0.1 ? 'nonsense' : pick(cur.shop.offers) }); if (cur.shop) S.act(cur, 'perk', { key: cur.shop.offers[0] }); }
        if (bot) AS.Bot.step(cur, bot);
        if (R() < 0.08) {
          actionsTried++;
          const b = pick(cur.bodies), b2 = pick(cur.bodies), r = pick(cur.routes), c = pick(cur.contracts);
          const types = AS.FAC_KEYS.concat(['bogus']);
          switch (Math.floor(R() * 15)) {
            case 0: S.act(cur, 'claim', { id: b.id }); break;
            case 1: S.act(cur, 'build', { id: b.id, slot: Math.floor(R() * 8) - 1, type: pick(types) }); break;
            case 2: S.act(cur, 'demolish', { id: b.id, slot: Math.floor(R() * 7) }); break;
            case 3: S.act(cur, 'route', { a: b.id, b: b2.id }); break;
            case 4: if (r) S.act(cur, 'unroute', { id: r.id }); break;
            case 5: if (r) S.act(cur, 'assign', { id: r.id }); break;
            case 6: if (r) S.act(cur, 'recall', { id: r.id }); break;
            case 7: S.act(cur, 'buy'); break;
            case 8: if (c) S.act(cur, R() < 0.5 ? 'accept' : 'decline', { id: c.id }); break;
            case 9: S.act(cur, 'route', { a: S.prime(cur).id, b: b.id }); break;
            case 10: S.act(cur, 'claim', { id: 99999 }); S.act(cur, 'unroute', { id: -1 }); break;
            case 11: if (R() < 0.05) cur.credits -= 3000 * R(); break;   // force debt now and then
            case 12: S.act(cur, 'boost'); break;
            case 13: S.act(cur, 'deflect', { id: b.id }); if (cur.pending[0]) S.act(cur, 'deflect', { id: cur.pending[0].id }); break;
            case 14: if (R() < 0.02 && !cur.over && cur.sys < 2) { cur.mega.state = 'done'; cur.warpAt = cur.t + 1; } break;   // force a warp
          }
        }
        if (k % 5 === 1 && i === 20 * 60 * 4) cur.t = Math.max(cur.t, cur.sysStart + S.sysCfg(cur).unlock - 1);   // jump some runs to the gate
        S.step(cur, C.sim.step);
        cur.fx.length = 0;
        stepsRun++;
        if (i % 20 === 0) {
          const bad = S.scanFinite(cur, 'run', [], 0);
          if (bad.length) throw new Error('non-finite ' + bad.slice(0, 4).join(', '));
          const f = [];
          S.checkInvariants(cur, f);
          if (f.length) throw new Error('invariant: ' + f.join('; '));
        }
        if (i % 2400 === 1200) { cur = S.deserialize(S.serialize(cur)); saves++; }   // save/resume round trip mid-run
      }
    } catch (e) { fails.push('seed ' + seed + ' ' + ch + ': ' + (e && e.message)); }
  }
  results.fuzz = { runs: NFUZZ, actionsTried, stepsRun, saveRoundTrips: saves, fails };
  console.log('  runs ' + NFUZZ + ', random actions ' + actionsTried + ', steps ' + stepsRun + ', save/load round trips ' + saves + ', failures ' + fails.length);
  for (const f of fails) console.log('  FAIL ' + f);
  if (fails.length) failed = true;
}

function replay() {
  console.log('\n== DETERMINISM ==');
  const out = [];
  for (const [seed, ch] of [[424242, 'standard'], [777, 'volatile'], [31337, 'hazard']]) {
    const a = AS.Bot.simulate(seed, ch, 'skilled', 30 * 60, { log: true });
    // replay the recorded action log with no bot at all
    const run = S.createRun(seed, ch);
    const log = a.run.actions;
    let li = 0;
    while (!run.over && run.t < 30 * 60) {
      while (li < log.length && log[li][0] === run.steps) { const [, n, x] = log[li++]; S.act(run, n, x); }
      if (run.shop) { while (li < log.length && log[li][0] === run.steps) { const [, n, x] = log[li++]; S.act(run, n, x); } }
      S.step(run, C.sim.step);
      run.fx.length = 0;
    }
    const h1 = S.hash(a.run), h2 = S.hash(run);
    // save at 10 min, resume, continue: must match an uninterrupted run
    const x = S.createRun(seed, ch), bx = AS.Bot.create(seed, 'skilled');
    const y0 = S.createRun(seed, ch), by = AS.Bot.create(seed, 'skilled');
    let y = y0;
    for (let i = 0; i < 20 * 60 * 15; i++) {
      AS.Bot.step(x, bx); S.step(x, C.sim.step); x.fx.length = 0;
      AS.Bot.step(y, by); S.step(y, C.sim.step); y.fx.length = 0;
      if (i === 20 * 60 * 10) y = S.deserialize(JSON.parse(JSON.stringify(JSON.parse(S.serialize(y)))));
    }
    const ok = h1 === h2 && S.hash(x) === S.hash(y);
    out.push({ seed, ch, actions: log.length, replayHash: h2, originalHash: h1, saveResumeMatch: S.hash(x) === S.hash(y), ok });
    console.log('  seed ' + seed + ' ' + ch + ': ' + log.length + ' actions replayed, hash ' + h1 + (h1 === h2 ? ' == ' : ' != ') + h2 + ', save/resume ' + (S.hash(x) === S.hash(y) ? 'identical' : 'DIVERGED'));
    if (!ok) failed = true;
  }
  results.replay = out;
}

function selftest() {
  console.log('\n== SELF-TEST (same checks as tests/selftest.html) ==');
  const r = AS.SelfTest.run();
  for (const l of r.lines) console.log('  ' + l);
  results.selftest = r;
  if (!r.pass) failed = true;
}

if (mode === 'all' || mode === 'selftest') selftest();
if (mode === 'all' || mode === 'replay') replay();
if (mode === 'all' || mode === 'fuzz') fuzz();
if (mode === 'all' || mode === 'balance') balance();
const jsonOut = opt('json', null);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, (k, v) => (k === 'run' ? undefined : v), 1));
console.log('\n' + (failed ? 'RESULT: FAIL' : 'RESULT: PASS'));
process.exit(failed ? 1 : 0);
