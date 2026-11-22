/* ATLAS SYNDICATE v5 — sim/selftest.js
   Fast rule checks that run in the browser (tests/selftest.html, ?selftest=1) and in Node. */
(function (AS) {
  'use strict';

  const S = AS.S, C = AS.CONFIG, U = AS.U;
  const T = AS.SelfTest = {};

  T.run = function () {
    const lines = [];
    let pass = true;
    const check = (name, ok, info) => { lines.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) pass = false; };

    // galaxy generation over many seeds
    let degOk = true, conn = true, cands = 99, chokes = 99, count = true;
    for (let i = 1; i <= 60; i++) {
      const r = S.createRun(i * 7919, {});
      if (r.systems.length !== 24) count = false;
      for (const s of r.systems) if (s.lanes.length < 2 || s.lanes.length > 4) degOk = false;
      if (!S.isConnected(r)) conn = false;
      cands = Math.min(cands, S.homeCandidates(r).length);
      chokes = Math.min(chokes, r.systems.filter(s => s.choke >= 0.4).length);
      for (const s of r.systems) if (s.planets.length < 3 || s.planets.length > 6) count = false;
    }
    check('24 systems, 3-6 planets each', count);
    check('every system has 2-4 lanes', degOk);
    check('every system reachable', conn);
    check('at least 6 home candidates in the outer arms', cands >= 6, 'min ' + cands);
    check('every galaxy has chokepoints', chokes >= 2, 'min ' + chokes);
    const g1 = S.createRun(4242, {}), g2 = S.createRun(4242, {});
    check('galaxy is deterministic for a seed', S.hash(g1) === S.hash(g2));
    const core = g1.systems.filter(s => s.region === 'core'), tips = g1.systems.filter(s => s.k === 3);
    check('core garrisons stronger than arm tips', Math.min(...core.map(s => s.gar.n)) > Math.max(...tips.map(s => s.gar.n)));

    // economy: only completed chains pay
    const run = S.createRun(1234, { slot0: null });
    S.begin(run, S.homeCandidates(run)[0], 'krone');
    const f = run.factions[0], home = run.systems[f.capital];
    const ore = home.planets.findIndex(p => p.type === 'ore' && p.rich === 2), en = home.planets.findIndex(p => p.type === 'energy' && p.rich === 2);
    f.credits = 5000;
    check('home has 5 planets, no extractors', home.planets.length === 5 && home.planets.every(p => !p.ext));
    S.act(run, 0, 'ext', { sys: home.id, planet: ore });
    check('extractor without a line pays nothing', S.sysYield(run, home).credits === 0);
    S.act(run, 0, 'line', { sys: home.id, a: -1, b: ore });
    const oreOnly = S.sysYield(run, home);
    check('ore alone: no factory pairs, warning shown', oreOnly.pairs === 0 && oreOnly.warn.some(w => w[0] === 'noenergy'));
    S.act(run, 0, 'ext', { sys: home.id, planet: en });
    S.act(run, 0, 'line', { sys: home.id, a: ore, b: en });
    let y = S.sysYield(run, home);
    check('extended line with too few freighters runs slower', y.eff[0] > 0 && y.eff[0] < 1, 'eff ' + y.eff[0]);
    S.act(run, 0, 'fr', { sys: home.id, line: home.lines[0].id, d: 1 });
    y = S.sysYield(run, home);
    check('ore + energy chain pays', y.pairs === 4 && y.credits > 30, 'pairs ' + y.pairs + ' cr ' + Math.round(y.credits));
    home.station.dur = 0;
    check('broken factory stops the chain', S.sysYield(run, home).credits === 0);
    home.station.dur = 100;
    const fc = S.forecast(run, f);
    check('forecast = income - salary - repairs', fc.net === fc.income - fc.salary - fc.repairs);
    check('salary scales with army size', S.salaryFor(run, f, 100) / 100 > S.salaryFor(run, f, 10) / 10);
    check('lines are limited per system', (() => { const a = S.act(run, 0, 'line', { sys: home.id, a: -1, b: (en + 1) % 5 }); const b = S.act(run, 0, 'line', { sys: home.id, a: -1, b: (en + 2) % 5 }); return a.ok !== b.ok || !b.ok; })());

    // combat
    const o1 = S.oddsRaw(20, 20, 'attack'), o2 = S.oddsRaw(40, 20, 'attack'), o3 = S.oddsRaw(10, 30, 'attack');
    check('odds rise with strength', o2.p > o1.p && o1.p > o3.p, [o3.p, o1.p, o2.p].map(v => v.toFixed(2)).join(' < '));
    check('odds are deterministic', S.oddsRaw(33, 21, 'attack').p === S.oddsRaw(33, 21, 'attack').p);
    const blocked = S.act(run, 0, 'move', { from: home.id, to: S.neighbours(run, home.id).find(n => run.systems[n].owner !== 0), frac: 1 });
    check('protected period blocks attacks', !blocked.ok && blocked.reason === 'protected');
    run.t = C.game.protect + 1;
    const target = run.systems[S.neighbours(run, home.id).find(n => run.systems[n].owner === -1)];
    target.gar.n = 2;
    const extBefore = target.planets.filter(p => p.ext).length;
    home.gar.n = 40;
    const mv = S.act(run, 0, 'move', { from: home.id, to: target.id, frac: 1 });
    check('attack order accepted after 4:00', mv.ok);
    for (let i = 0; i < 20 * 60 && target.owner !== 0; i++) { S.step(run, C.sim.step); run.fx.length = 0; }
    check('weak neutral captured', target.owner === 0);
    check('captured buildings are damaged, not new', target.station.dur === 0 && target.planets.filter(p => p.ext).every(p => p.ext.dur === 0) && target.planets.filter(p => p.ext).length <= extBefore);
    const fails = [];
    S.checkInvariants(run, fails);
    check('invariants hold after a battle', !fails.length, fails.slice(0, 3).join('; '));
    // elimination hands over every system
    const r2 = S.createRun(777, { slot0: 'balanced' });
    S.begin(r2, -1, null);
    const victim = r2.factions[2];
    const extra = r2.systems.find(s => s.owner === -1);
    extra.owner = 2;
    S.eliminate(r2, 2, 1);
    check('elimination transfers all systems', !victim.alive && r2.systems.every(s => s.owner !== 2) && extra.owner === 1);
    // save / load
    const str = S.serialize(run), back = S.deserialize(str);
    check('save/load round trip is exact', S.hash(back) === S.hash(run));
    // a short all-AI game stays sane
    const r3 = S.createRun(99, { slot0: 'balanced' });
    S.begin(r3, -1, null);
    let bad = '';
    for (let i = 0; i < 10 * 60 * 6 && !r3.over; i++) {
      S.step(r3, C.sim.step); r3.fx.length = 0;
      if (i % 200 === 0) { const fl = S.checkInvariants(r3, []); const nf = S.scanFinite(r3, 'run', [], 0); if (fl.length || nf.length) { bad = fl.concat(nf).slice(0, 3).join('; '); break; } }
    }
    check('6 minutes of all-AI play: no invariant or NaN failures', !bad, bad);
    check('rivals build real economies', r3.factions.filter(x => x.alive && x.lastCycle.income > 0).length >= 4);
    return { pass, lines };
  };
})(globalThis.AS = globalThis.AS || {});
