/* ATLAS SYNDICATE v4 — sim/selftest.js
   Fast correctness checks shared by tests/selftest.html (browser) and tests/run-headless.js (Node). */
(function (AS) {
  'use strict';

  const S = AS.S, U = AS.U, C = AS.CONFIG;

  AS.SelfTest = {
    run() {
      const lines = [], fails = [];
      const t0 = Date.now();
      const ok = (cond, msg) => { if (cond) lines.push('ok   ' + msg); else { fails.push(msg); lines.push('FAIL ' + msg); } };
      try {
        // 1. generator: 300 seeds, each with a capital, ice/ore in the starting area and gas as the first discovery
        let gen = true, why = '';
        for (let s = 1; s <= 300 && gen; s++) {
          const r = S.createRun(s * 7919, 'standard');
          const P = S.prime(r), start = r.bodies.filter(b => b.found && !b.prime);
          const later = r.bodies.filter(b => !b.found && !b.site).sort((a, b) => a.discoverAt - b.discoverAt);
          if (!P || !P.claimed) { gen = false; why = 'no capital'; }
          else if (!start.some(b => b.dep.ice >= 0.9)) { gen = false; why = 'no starting ice world'; }
          else if (!start.some(b => b.dep.ore >= 0.8)) { gen = false; why = 'no starting ore world'; }
          else if (!later.length || !(later[0].dep.gas >= 1)) { gen = false; why = 'first discovery is not a gas world'; }
          else if (!S.site(r)) { gen = false; why = 'no megaproject site'; }
          if (!gen) why += ' (seed ' + s * 7919 + ')';
        }
        ok(gen, '300 generated systems: capital, starting ice + ore, gas as first discovery, megaproject site' + (gen ? '' : ': ' + why));
        // 2. every charter initialises and simulates
        let chOk = true;
        for (const ch of AS.CHARTER_KEYS) {
          const r = S.createRun(99, ch);
          for (let i = 0; i < 400; i++) S.step(r, C.sim.step);
          const f = [];
          S.checkInvariants(r, f);
          if (S.scanFinite(r, 'run', [], 0).length || f.length) chOk = false;
        }
        ok(chOk, 'all ' + AS.CHARTER_KEYS.length + ' charters initialise and simulate cleanly');
        // 3. share codes round-trip
        let codeOk = true;
        for (let i = 0; i < 200; i++) {
          const seed = (Math.imul(i + 3, 2246822519) >>> 0) || 1, ch = AS.CHARTER_KEYS[i % 8], sc = i * 997;
          const p = U.parseCode(U.makeCode(seed, ch, sc));
          if (!p || p.seed !== seed || p.charter !== ch || p.score !== sc) codeOk = false;
        }
        ok(codeOk && !U.parseCode('ZZZ-Q-1') && U.parseCode('12345').seed === 12345, 'share codes round-trip and reject garbage');
        // 4. a full skilled run: invariants every 2 s, reaches the megaproject
        const a = AS.Bot.simulate(C.selftest.seed, 'standard', 'skilled', C.selftest.minutes * 60, { check: true, log: true });
        ok(!a.fails.length, 'skilled bot run ' + U.fmtTime(a.t) + ', no invariant failures' + (a.fails.length ? ': ' + a.fails.join('; ') : ''));
        ok(a.megaReached, 'megaproject reached at ' + U.fmtTime(a.megaAt) + (a.megaDone ? ', completed at ' + U.fmtTime(a.doneAt) : ', stage ' + a.stage));
        ok(a.run.totalIncome > 0 && a.run.routesBuilt > 0, 'revenue ' + U.fmtNum(a.run.totalIncome) + ', routes ' + a.run.routesBuilt + ', score ' + a.score);
        // 5. same seed + same actions = same state
        const b = AS.Bot.simulate(C.selftest.seed, 'standard', 'skilled', C.selftest.minutes * 60, {});
        ok(S.hash(a.run) === S.hash(b.run), 'replay with the same seed reproduced state hash ' + S.hash(a.run));
        // 6. save mid-run, resume, continue == uninterrupted
        const x = S.createRun(4242, 'veins'), bx = AS.Bot.create(4242, 'skilled');
        let y = S.createRun(4242, 'veins');
        const by = AS.Bot.create(4242, 'skilled');
        for (let i = 0; i < 20 * 60 * 8; i++) {
          AS.Bot.step(x, bx); S.step(x, C.sim.step); x.fx.length = 0;
          AS.Bot.step(y, by); S.step(y, C.sim.step); y.fx.length = 0;
          if (i === 20 * 60 * 4) y = S.deserialize(S.serialize(y));
        }
        ok(S.hash(x) === S.hash(y), 'save at 4:00, resume, continue to 8:00 matches an uninterrupted run');
        // 7. an idle player must be able to lose
        const idle = AS.Bot.simulate(C.selftest.seed, 'standard', 'idle', 60 * 60, {});
        ok(idle.over && !idle.won, 'a player who does nothing loses (at ' + U.fmtTime(idle.t) + ')');
      } catch (e) {
        fails.push('exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
        lines.push('FAIL exception ' + (e && e.message));
      }
      lines.push((fails.length ? 'FAIL' : 'PASS') + '  (' + (Date.now() - t0) + ' ms)');
      return { pass: !fails.length, lines, fails };
    },
  };
})(globalThis.AS = globalThis.AS || {});
