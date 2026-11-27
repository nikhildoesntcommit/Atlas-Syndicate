/* ATLAS SYNDICATE v7 — sim/selftest.js
   Fast rule checks that run in the browser (tests/selftest.html, ?selftest=1) and in Node. */
(function (AS) {
  'use strict';

  const S = AS.S, C = AS.CONFIG;
  const T = AS.SelfTest = {};

  T.run = function () {
    const lines = [];
    let pass = true;
    const check = (name, ok, info) => { lines.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) pass = false; };
    const cycle = run => { for (let i = 0; i < Math.round(C.game.cycle / C.sim.step) + 1; i++) { S.step(run, C.sim.step); run.fx.length = 0; } };

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
    check('next-move guidance starts with a cash engine', S.nextMove(run, 0).kind === 'gold');
    check('everyone starts with no military', run.factions.every(x => S.militaryPower(run, x.id) === 0));
    check('every home has the same four planets', run.factions.every(x => JSON.stringify(run.systems[x.capital].planets.map(q => q.rock)) === JSON.stringify(home.planets.map(q => q.rock))));
    f.money = 5000;
    const gold = p.deposits.find(d => d.res === 'gold');
    const gm = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 0, kind: 'goldmine' });
    check('place an extractor in a surface slot; its 2 workers arrive with it', gm.ok && home.workers === C.econ.crew);
    check('a second building cannot share the slot', !S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 0, kind: 'water' }).ok);
    const barrierPath = [];
    for (let y = 0; y < S.GH; y++) barrierPath.push(y * S.GW + S.slotX(p, 0, f));
    const hitsBarrier = barrierPath.findIndex(i => S.rockAt(p, i) === 3);
    if (hitsBarrier > 0) check('a drill cannot cross a barrier', !S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: gm.bld.id, path: barrierPath.slice(0, hitsBarrier + 1) }).ok);
    check('a drill must end in a matching deposit', !S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: gm.bld.id, path: [S.slotX(p, 0, f)] }).ok);
    const dr = S.bestDrill(run, f, p, 0, gold);
    const before = f.money;
    const d = S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: gm.bld.id, path: dr.path });
    check('drill to the gold deposit costs what was shown', d.ok && before - f.money === dr.cost, 'cost ' + dr.cost);
    let fl = S.sysFlow(run, home);
    check('a drilled gold mine delivers gold with no processor', fl.B[gm.bld.id].status === 'ok' && fl.out.gold > 0, (Math.round(fl.out.gold * 10) / 10) + ' gold/cycle');
    check('a gold mine takes no conveyor', !S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: gm.bld.id }, to: { b: gm.bld.id } }).ok);
    const g0 = f.gold, amt0 = gold.amount;
    cycle(run);
    check('the cycle pays what the buildings claim and depletes the deposit', f.gold > g0 && gold.amount < amt0 && Math.abs(f.lastCycle.got.gold - fl.out.gold) < 1e-6);
    const m0 = f.money, gHave = Math.floor(f.gold);
    check('gold sells on the market at a fixed price', S.act(run, 0, 'trade', { res: 'gold', qty: -gHave }).ok && Math.abs(f.money - m0 - gHave * AS.STOCK.gold.price) < 1e-6);
    check('buying costs the same fixed price', (() => { const m = f.money, w = f.water; return S.act(run, 0, 'trade', { res: 'water', qty: 10 }).ok && Math.abs(m - f.money - 10 * AS.STOCK.water.price) < 1e-6 && f.water === w + 10; })());
    // water: ice drill > conveyor > water plant; greenhouse: water > food
    const ice = p.deposits.find(x => x.res === 'ice');
    const idr = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 1, kind: 'icedrill' });
    S.act(run, 0, 'drill', { sys: home.id, planet: 0, bld: idr.bld.id, path: S.bestDrill(run, f, p, 1, ice).path });
    fl = S.sysFlow(run, home);
    check('a drilled ice drill with no processor is blocked, with the reason', fl.B[idr.bld.id].status === 'blocked' && /WATER PLANT/.test(fl.B[idr.bld.id].reason));
    const wp = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 2, kind: 'water' });
    check('a conveyor only joins matching resources', !S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: idr.bld.id }, to: { b: S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 3, kind: 'refinery' }).bld.id } }).ok);
    S.act(run, 0, 'connect', { sys: home.id, planet: 0, from: { b: idr.bld.id }, to: { b: wp.bld.id } });
    fl = S.sysFlow(run, home);
    check('ice drill > water plant makes 2 water per ice', fl.out.water > 0 && Math.abs(fl.out.water - 2 * fl.B[idr.bld.id].rate * S.procBonus(p, 'water')) < 1e-6);
    const gh = S.act(run, 0, 'build', { sys: home.id, planet: 0, slot: 4, kind: 'greenhouse' });
    f.water = 50; f.food = 0;
    fl = S.sysFlow(run, home);
    cycle(run);
    check('a greenhouse drinks water from the stock and grows food', gh.ok && f.lastCycle.got.food > 0 && Math.abs(f.lastCycle.got.food - fl.farmFood) < 1e-6);
    // workers: missed food first reduces staffing, then sustained hunger causes attrition
    f.food = 0; f.water = 0;
    home.planets[0].blds = home.planets[0].blds.filter(b => b.kind !== 'greenhouse' && b.kind !== 'livestock');
    home.workers = S.crewNeed(home);
    const w0 = home.workers;
    cycle(run);
    fl = S.sysFlow(run, home);
    check('the first missed meal reduces output before workers leave', home.workers === w0 && f.hungry === 1 && Object.values(fl.B).some(b => b.status === 'nocrew'));
    cycle(run); cycle(run);
    check('sustained hunger eventually causes worker attrition', home.workers < w0 && f.stats.starved > 0);
    f.food = 500;
    for (let i = 0; i < 6; i++) cycle(run);
    check('fed again, the workers come back', home.workers === S.crewNeed(home));
    // machinery upgrades instead of wear
    const r0 = S.sysFlow(run, home).B[gm.bld.id].rate;
    const up = S.act(run, 0, 'upgrade', { sys: home.id, planet: 0, bld: gm.bld.id });
    check('an upgrade adds 50% throughput', up.ok && Math.abs(S.sysFlow(run, home).B[gm.bld.id].rate - r0 * 1.5) < 1e-6);
    S.act(run, 0, 'upgrade', { sys: home.id, planet: 0, bld: gm.bld.id });
    check('upgrades stop at level 3', !S.act(run, 0, 'upgrade', { sys: home.id, planet: 0, bld: gm.bld.id }).ok && gm.bld.lvl === 3);
    check('nothing wears out', JSON.stringify(home).indexOf('"dur"') < 0);
    // ports
    const pw = S.act(run, 0, 'pathway', { sys: home.id, a: 0, b: 1 });
    check('open a pathway between two planets', pw.ok);
    // military: units, power, the subtraction rule, fuel
    const bu = S.act(run, 0, 'units', { sys: home.id, kind: 'cannon', n: 2 });
    S.act(run, 0, 'units', { sys: home.id, kind: 'destroyer', n: 1 });
    S.act(run, 0, 'units', { sys: home.id, kind: 'ship', n: 3 });
    check('the shop sells ships (1), destroyers (5) and cannons (10)', bu.ok && S.sysPower(run, home) === 28);
    run.t = C.game.protect + 1;
    const tgt = S.neighbours(run, home.id).find(n => run.systems[n].owner === -1), ts = run.systems[tgt];
    S.setGarPower(ts.gar, 13);
    const mv = S.act(run, 0, 'move', { from: home.id, to: tgt, frac: 1 });
    for (let i = 0; i < 400 && run.armies.length; i++) { S.step(run, C.sim.step); run.fx.length = 0; }
    check('the bigger power wins and keeps the difference (28 vs 13 leaves 15)', mv.ok && ts.owner === 0 && S.sysPower(run, ts) === 15, S.sysPower(run, ts) + ' left');
    const tgt2 = S.neighbours(run, tgt).find(n => run.systems[n].owner === -1);
    if (tgt2 !== undefined) {
      const t2 = run.systems[tgt2];
      S.setGarPower(t2.gar, 40);
      S.act(run, 0, 'move', { from: tgt, to: tgt2, frac: 1 });
      for (let i = 0; i < 400 && run.armies.length; i++) { S.step(run, C.sim.step); run.fx.length = 0; }
      check('the smaller power is wiped out; the defender keeps the difference (40 vs 15 leaves 25)', t2.owner === -1 && S.sysPower(run, t2) === 25);
    }
    check('survivors keep the biggest units', JSON.stringify(S.survivors({ ship: 3, destroyer: 1, cannon: 2 }, 15)) === JSON.stringify({ ship: 0, destroyer: 1, cannon: 1 }));
    S.act(run, 0, 'units', { sys: home.id, kind: 'cannon', n: 5 });
    f.fuel = 0;
    cycle(run);
    check('out of fuel, the military fights at the share of fuel it gets', f.fuelEff < 1e-9 && S.sysPower(run, home) === 0);
    S.act(run, 0, 'trade', { res: 'fuel', qty: 50 });
    check('fuel bought on the market restores it at once', f.fuelEff === 1 && S.sysPower(run, home) === 50);
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
    const farms = r3.factions.map(x => r3.systems.filter(s => s.owner === x.id).reduce((a, s) => a + s.planets.reduce((q, pl) => q + pl.blds.filter(b => AS.BLD[b.kind].role === 'farm').length, 0), 0));
    check('every AI grows its own food', farms.every(n => n >= 1), farms.join(','));
    check('every AI has bought a military by 6:00', r3.factions.every(x => S.militaryPower(r3, x.id) > 0));
    return { pass, lines };
  };
})(globalThis.AS = globalThis.AS || {});
