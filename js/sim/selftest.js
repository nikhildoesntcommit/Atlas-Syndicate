/* ATLAS SYNDICATE v6 — sim/selftest.js
   Fast rule checks that run in the browser (tests/selftest.html, ?selftest=1) and in Node. */
(function (AS) {
  'use strict';

  const S = AS.S, C = AS.CONFIG;
  const T = AS.SelfTest = {};

  T.run = function () {
    const lines = [];
    let pass = true;
    const check = (name, ok, info) => { lines.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) pass = false; };

    // galaxy: 24 systems, symmetric homes
    let count = true, deg = true, conn = true, fair = true, reach = true;
    for (let i = 1; i <= 40; i++) {
      const r = S.createRun(i * 7919, {});
      if (r.systems.length !== 24) count = false;
      for (const s of r.systems) { if (s.lanes.length < 2 || s.lanes.length > 4) deg = false; if (s.planets.length < 3 || s.planets.length > 6) count = false; }
      if (!S.isConnected(r)) conn = false;
      const homes = S.homeCandidates(r), core = r.systems.filter(s => s.region === 'core').map(s => s.id);
      const near = homes.map(h => Math.min(...homes.filter(x => x !== h).map(x => r.hops[h][x])));
      const toCore = homes.map(h => Math.min(...core.map(c => r.hops[h][c])));
      if (homes.length !== 6 || new Set(near).size !== 1 || new Set(toCore).size !== 1) fair = false;
      for (const s of r.systems) for (const p of s.planets) if (!S.groundReachable(p)) reach = false;
    }
    check('24 systems, 3-6 planets, 2-4 lanes each, connected', count && deg && conn);
    check('every home is equally far from its nearest rival and from the core', fair);
    check('every deposit can be reached from a surface slot', reach);
    const g1 = S.createRun(4242, {}), g2 = S.createRun(4242, {});
    check('galaxy and undergrounds are deterministic for a seed', S.hash(g1) === S.hash(g2));

    // the planet economy
    const run = S.createRun(1234, {});
    S.begin(run, S.homeCandidates(run)[0]);
    const f = run.factions[0], home = run.systems[f.capital], p = home.planets[0];
    f.credits = 5000; f.alloy = 500;
    check('every home has the same four planets', run.factions.every(x => JSON.stringify(run.systems[x.capital].planets.map(q => q.rock)) === JSON.stringify(home.planets.map(q => q.rock))));
    const metal = p.deposits.find(d => d.res === 'metal');
    const mine = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 0, kind: 'mine' });
    check('place an extractor in a surface slot', mine.ok);
    check('a second building cannot share the slot', !S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 0, kind: 'smelter' }).ok);
    const barrierPath = [];
    for (let y = 0; y < S.GH; y++) barrierPath.push(y * S.GW + S.slotX(p, 0, f));
    const hitsBarrier = barrierPath.findIndex(i => S.rockAt(p, i) === 3);
    if (hitsBarrier > 0) check('a drill cannot cross a barrier', !S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: mine.bld.id, path: barrierPath.slice(0, hitsBarrier + 1) }).ok);
    check('a drill must end in a matching deposit', !S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: mine.bld.id, path: [S.slotX(p, 0, f)] }).ok);
    const dr = S.bestDrill(run, f, p, 0, metal);
    const before = f.credits;
    const d = S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: mine.bld.id, path: dr.path });
    check('drill to the metal deposit costs what was shown', d.ok && before - f.credits === dr.cost, 'cost ' + dr.cost);
    let fl = S.sysFlow(run, home);
    check('a drilled extractor with no processor is blocked, with the reason', fl.B[mine.bld.id].status === 'blocked' && /NO PROCESSOR/.test(fl.B[mine.bld.id].reason));
    const sm = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 1, kind: 'smelter' });
    check('a conveyor only joins matching resources', !S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: mine.bld.id }, to: { b: S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 2, kind: 'mint' }).bld.id } }).ok);
    S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: mine.bld.id }, to: { b: sm.bld.id } });
    fl = S.sysFlow(run, home);
    check('mine > smelter makes alloy', fl.B[mine.bld.id].status === 'ok' && fl.out.alloy > 0, (Math.round(fl.out.alloy * 10) / 10) + ' alloy/cycle');
    const a0 = f.alloy, amt0 = metal.amount;
    for (let i = 0; i < 101; i++) { S.step(run, C.sim.step); run.fx.length = 0; }
    check('the cycle pays what the buildings claim and depletes the deposit', f.alloy > a0 && metal.amount < amt0 && Math.abs(f.lastCycle.got.alloy - fl.out.alloy) < 1e-6);
    // ports: ice on planet 0, water plant on planet 1
    const ice = p.deposits.find(x => x.res === 'ice');
    const pw = S.act(run, 0, 'pathway', { sys: home.id, a: 0, b: 1 });
    check('open a pathway between two planets', pw.ok);
    const idr = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 3, kind: 'icedrill' });
    S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: idr.bld.id, path: S.bestDrill(run, f, p, 3, ice).path });
    S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: idr.bld.id }, to: { p: pw.pathway.id } });
    fl = S.sysFlow(run, home);
    check('ice sent to a port with nothing on the other side is blocked', fl.B[idr.bld.id].status === 'blocked');
    const wp = S.act(run, 0, 'build', { sys: home.id, planet: 1, slot: 0, kind: 'water' });
    S.act(run, 0, 'connect', { sys: home.id, planet: 1, from: { p: pw.pathway.id }, to: { b: wp.bld.id } });
    fl = S.sysFlow(run, home);
    check('ice travels through the pathway to a water plant on another planet', fl.out.food > 0 && fl.P[pw.pathway.id].ab + fl.P[pw.pathway.id].ba > 0);
    home.planets[1].blds[0].dur = 0;
    check('a broken processor stops the chain, with the reason', /BROKEN/.test(S.sysFlow(run, home).B[idr.bld.id].reason));
    check('repair costs credits and alloy', S.act(run, 0, 'repair', { sys: home.id, kind: 'all' }).ok && home.planets[1].blds[0].dur === 100);
    const up = S.act(run, 0, 'upgrade', { track: 'ext' });
    check('the upgrade shop applies its effect', up.ok && f.mods.drill === 0.7);
    // military costs
    run.t = C.game.protect + 1;
    const fuel0 = f.fuel;
    const tgt = S.neighbours(run, home.id).find(n => run.systems[n].owner === -1);
    run.systems[tgt].gar.n = 1; home.gar.n = 40;
    check('moving an army costs fuel', S.act(run, 0, 'move', { from: home.id, to: tgt, frac: 1 }).ok && f.fuel < fuel0);
    f.fuel = 0; home.gar.n = 20;
    check('no fuel, no move', S.act(run, 0, 'move', { from: home.id, to: S.neighbours(run, home.id)[0], frac: 0.5 }).reason === 'nofuel');
    const fails = [];
    S.checkInvariants(run, fails);
    check('invariants hold', !fails.length, fails.slice(0, 3).join('; '));
    check('save/load round trip is exact', S.hash(S.deserialize(S.serialize(run))) === S.hash(run));
    // coalition truce
    const r2 = S.createRun(99, { slot0: 'balanced' });
    S.begin(r2, -1);
    r2.t = 300;
    r2.coalition = { target: 1, since: 300, until: 600, nextStrike: 330, strike: -999, strikes: 0 };
    check('during a coalition members may not attack each other, only the leader', S.truceBlocks(r2, 2, 3) && !S.truceBlocks(r2, 2, 1) && !S.truceBlocks(r2, 1, 2));
    // a short all-AI game
    const r3 = S.createRun(77, { slot0: 'balanced' });
    S.begin(r3, -1);
    let bad = '';
    for (let i = 0; i < 10 * 60 * 6 && !r3.over; i++) {
      S.step(r3, C.sim.step); r3.fx.length = 0;
      if (i % 200 === 0) { const fl2 = S.checkInvariants(r3, []), nf = S.scanFinite(r3, 'run', [], 0); if (fl2.length || nf.length) { bad = fl2.concat(nf).slice(0, 3).join('; '); break; } }
    }
    check('6 minutes of all-AI play: no invariant or NaN failures', !bad, bad);
    const blds = r3.factions.map(x => r3.systems.filter(s => s.owner === x.id).reduce((a, s) => a + s.planets.reduce((q, pl) => q + pl.blds.length, 0), 0));
    check('every AI builds a real economy through the planet view', blds.every(n => n >= 6), blds.join(','));
    return { pass, lines };
  };
})(globalThis.AS = globalThis.AS || {});
