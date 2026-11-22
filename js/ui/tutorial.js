/* ATLAS SYNDICATE v6 — ui/tutorial.js
   The interactive, skippable tutorial, during the 4-minute protected period. One step at a time, a
   pointer on exactly what to click, and each step completes only when it is actually done (from game
   state, so doing things in another order still works). */
(function (AS) {
  'use strict';

  const S = AS.S, G = AS.G, D = AS.Draw, U = AS.U;
  const Tu = AS.Tutorial = { st: null };

  const home = run => run.systems[run.factions[0].capital];
  const planet0 = run => home(run).planets[0];
  const find = (p, kind) => p.blds.find(b => b.kind === kind);
  const freeSlot = (run, p) => { const used = new Set(p.blds.map(b => b.slot)); for (let i = 0; i < S.slotCount(p, run.factions[0]); i++) if (!used.has(i)) return i; return 0; };
  const shallow = (p, res) => p.deposits.filter(d => d.res === res).sort((a, b) => a.depth - b.depth)[0];
  const inPlanet = (run, pi) => G.view === 'planet' && G.sysId === home(run).id && G.planet === pi;
  const H = (run, pi, o) => Object.assign({ sys: home(run).id, planet: pi }, o);
  /** Guide the player into the right view before pointing inside it. */
  function nav(run, pi, inside) {
    const h = home(run);
    if (G.view === 'galaxy') return { kind: 'system', id: h.id };
    if (G.view === 'system' || G.sysId !== h.id || G.planet !== pi) return { kind: 'planet', sys: h.id, planet: pi };
    return inside;
  }
  const chainDone = (run, res) => { const s = home(run), fl = S.sysFlow(run, s); return s.planets.some(p => p.blds.some(b => fl.B[b.id].role === 'ext' && fl.B[b.id].res === res && fl.B[b.id].rate > 0)); };

  const STEPS = [
    { text: 'THIS IS YOUR HOME SYSTEM. CLICK IT TO OPEN IT.', done: run => G.view !== 'galaxy' && G.sysId === home(run).id, hl: run => ({ kind: 'system', id: home(run).id }) },
    { text: 'CLICK YOUR HOME PLANET (WITH THE ARROW) TO OPEN IT.', done: run => inPlanet(run, 0), hl: run => nav(run, 0, null) },
    { text: 'THIS IS THE UNDERGROUND. CLICK AN EMPTY SLOT ON THE SURFACE, THEN BUILD A MINE.', done: run => !!find(planet0(run), 'mine'), want: 'mine', hl: run => nav(run, 0, H(run, 0, { kind: 'slot', slot: freeSlot(run, planet0(run)) })) },
    { text: 'DRAG DOWN FROM THE MINE TO THE GREY-BROWN METAL DEPOSIT TO DRILL. THE PRICE SHOWS AS YOU DRAG.', done: run => { const m = find(planet0(run), 'mine'); return m && !!m.drill; }, hl: run => nav(run, 0, H(run, 0, { kind: 'deposit', dep: shallow(planet0(run), 'metal').id })) },
    { text: 'NOW BUILD A SMELTER IN ANOTHER EMPTY SLOT. IT TURNS ORE INTO ALLOY.', done: run => !!find(planet0(run), 'smelter'), want: 'smelter', hl: run => nav(run, 0, H(run, 0, { kind: 'slot', slot: freeSlot(run, planet0(run)) })) },
    { text: 'DRAG FROM THE MINE ACROSS TO THE SMELTER: A CONVEYOR.', done: run => { const m = find(planet0(run), 'mine'); return m && m.out && m.out.b !== undefined; }, hl: run => { const m = find(planet0(run), 'mine'); return nav(run, 0, m ? H(run, 0, { kind: 'bld', bld: m.id }) : null); } },
    { text: 'WATCH THE ORE CLIMB THE DRILL AND ALLOY ARRIVE AT THE TOP OF THE SCREEN (EVERY 10 S).', done: run => run.factions[0].stats.alloyMade > 0 },
    { text: 'DO THE SAME FOR GOLD: A GOLD MINE, A DRILL TO THE BRIGHT GOLD SEAM, A MINT, A CONVEYOR. GOLD BECOMES CREDITS.', done: run => chainDone(run, 'gold'), want: ['goldmine', 'mint'],
      hl: run => { const p = planet0(run), gm = find(p, 'goldmine'); return nav(run, 0, !gm ? H(run, 0, { kind: 'slot', slot: freeSlot(run, p) }) : !gm.drill ? H(run, 0, { kind: 'deposit', dep: shallow(p, 'gold').id }) : !find(p, 'mint') ? H(run, 0, { kind: 'slot', slot: freeSlot(run, p) }) : H(run, 0, { kind: 'bld', bld: gm.id })); } },
    { text: 'THIS PLANET IS NEARLY FULL. ESC TO THE SYSTEM, THEN DRAG FROM THIS PLANET TO THE ICE PLANET: A PATHWAY.', done: run => home(run).pathways.length > 0, hl: run => (G.view === 'system' ? { kind: 'planet', sys: home(run).id, planet: 1 } : null) },
    { text: 'ROUTE ICE: AN ICE DRILL HERE, DRILLED TO THE ICE, CONVEYOR TO THE PORT. THEN ON THE ICE PLANET A WATER PLANT, AND DRAG ITS PORT TO IT.', done: run => { const s = home(run), fl = S.sysFlow(run, s); return s.pathways.some(pw => fl.P[pw.id] && fl.P[pw.id].res && (fl.P[pw.id].res.ab === 'ice' || fl.P[pw.id].res.ba === 'ice') && (fl.P[pw.id].ab + fl.P[pw.id].ba) > 0) && fl.out.food > 0; },
      want: ['icedrill', 'water'], hl: run => { const p = planet0(run), d = find(p, 'icedrill'); if (!d) return nav(run, 0, H(run, 0, { kind: 'slot', slot: freeSlot(run, p) })); if (!d.drill) return nav(run, 0, H(run, 0, { kind: 'deposit', dep: shallow(p, 'ice').id })); if (!d.out) return nav(run, 0, H(run, 0, { kind: 'port' })); return nav(run, 1, H(run, 1, find(home(run).planets[1], 'water') ? { kind: 'port' } : { kind: 'slot', slot: freeSlot(run, home(run).planets[1]) })); } },
    { text: 'YOUR ECONOMY RUNS. BACK TO THE GALAXY (ESC) AND RECRUIT SOLDIERS: CLICK YOUR SYSTEM PANEL\'S RECRUIT.', done: run => home(run).train.q > 0 || S.soldiers(run, 0) > AS.CONFIG.army.startSoldiers, want: 'recruit' },
    { text: 'ATTACKS OPEN AT 4:00. DRAG FROM YOUR SYSTEM ONTO A NEIGHBOUR TO ATTACK. WARNINGS (TOP LEFT) SHOW RIVALS MASSING. GOOD LUCK.', done: (run, st) => st.t > 10, end: true },
  ];

  Tu.start = function () { Tu.st = { step: 0, t: 0 }; };
  Tu.active = () => !!Tu.st;
  Tu.skip = function () { Tu.st = null; AS.Store.set('tutorialDone', true); AS.Sfx.play('click'); };
  Tu.cur = () => (Tu.st ? STEPS[Tu.st.step] : null);
  Tu.stepIndex = () => (Tu.st ? Tu.st.step : -1);
  Tu.highlight = function () { const s = Tu.cur(); return s && s.hl && G.run ? s.hl(G.run) : null; };
  Tu.want = k => { const s = Tu.cur(); return !!(s && (s.want === k || (Array.isArray(s.want) && s.want.indexOf(k) >= 0))); };
  Tu.wantBuild = k => Tu.want(k);
  Tu.update = function (dt) {
    const st = Tu.st, run = G.run;
    if (!st || !run || run.phase !== 'play') return;
    st.t += dt;
    const s = STEPS[st.step];
    if (s.done(run, st)) {
      if (s.end) { Tu.st = null; AS.Store.set('tutorialDone', true); return; }
      st.step++; st.t = 0;
      AS.Sfx.play('good');
      while (st.step < STEPS.length - 1 && STEPS[st.step].done(run, st)) st.step++;
    }
  };
  Tu.draw = function (ctx) {
    const st = Tu.st, s = Tu.cur(), run = G.run;
    if (!st || !s || !run || G.screen) return;
    const side = G.view === 'planet' ? AS.PlanetView.panelW() : G.view === 'system' ? AS.SysView.panelW() : 0;
    const w = Math.min(340, G.W - side - 12), lines = U.wrapText(s.text, Math.floor((w - 12) / 6));
    const h = 16 + lines.length * 10 + 4;
    const x = Math.round((G.W - side) / 2 - w / 2), y = G.mapBottom() - h - 6;
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 1);
    D.hazard(ctx, x + 1, y + 1, w - 2, 2, 13, G.time * 6);
    D.text(ctx, 'TUTORIAL ' + (st.step + 1) + '/' + STEPS.length, x + 6, y + 6, 12, { shadow: false });
    lines.forEach((l, i) => D.text(ctx, l, x + 6, y + 15 + i * 10, 31, { shadow: false, big: true }));
    G.block(x, y, w, h);
    G.button(ctx, x + w - 36, y + 4, 32, 10, 'SKIP', () => Tu.skip(), { tip: 'SKIP THE TUTORIAL. REPLAY IT FROM SETTINGS.', big: false });
    const hl = Tu.highlight();
    if (hl && hl.kind === 'system' && G.view === 'galaxy') { const sys = run.systems[hl.id], p = G.toScreen(sys.x, sys.y); AS.SysView.pointer(ctx, Math.round(p.x), Math.round(p.y) - 18, G.time); }
  };
})(globalThis.AS = globalThis.AS || {});
