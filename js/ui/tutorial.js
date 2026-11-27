/* ATLAS SYNDICATE v7 — ui/tutorial.js
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
  const homeFlow = run => S.sysFlow(run, home(run));
  const anyBld = (run, kind) => home(run).planets.some(p => p.blds.some(b => b.kind === kind));

  const STEPS = [
    { text: 'THIS IS YOUR HOME SYSTEM. CLICK IT TO OPEN IT.', done: run => G.view !== 'galaxy' && G.sysId === home(run).id, hl: run => ({ kind: 'system', id: home(run).id }) },
    { text: 'CLICK YOUR HOME PLANET (WITH THE ARROW) TO OPEN IT.', done: run => inPlanet(run, 0), hl: run => nav(run, 0, null) },
    { text: 'THE GROUND IS ALONG THE BOTTOM. CLICK A + SLOT ON THE SURFACE, THEN GOLD MINE IN THE BUILD LIST (TOP LEFT).', done: run => !!find(planet0(run), 'goldmine'), want: 'goldmine', hl: run => nav(run, 0, H(run, 0, { kind: 'slot', slot: freeSlot(run, planet0(run)) })) },
    { text: 'DRAG DOWN FROM THE GOLD MINE TO THE BRIGHT GOLD DEPOSIT TO DRILL. THE PRICE SHOWS AS YOU DRAG.', done: run => { const m = find(planet0(run), 'goldmine'); return m && !!m.drill; }, hl: run => nav(run, 0, H(run, 0, { kind: 'deposit', dep: shallow(planet0(run), 'gold').id })) },
    { text: 'GOLD ARRIVES EVERY CYCLE (10 S). WHEN IT DOES, CLICK SELL GOLD (LEFT PANEL, ECONOMY) TO TURN IT INTO MONEY.', done: run => run.factions[0].stats.sold > 0, want: 'sell' },
    { text: 'YOUR WORKERS NEED FOOD. BUILD AN ICE DRILL IN ANOTHER SLOT AND DRAG DOWN FROM IT TO THE PALE BLUE ICE.', done: run => { const d = find(planet0(run), 'icedrill'); return d && !!d.drill; }, want: 'icedrill',
      hl: run => { const p = planet0(run), d = find(p, 'icedrill'); return nav(run, 0, !d ? H(run, 0, { kind: 'slot', slot: freeSlot(run, p) }) : H(run, 0, { kind: 'deposit', dep: shallow(p, 'ice').id })); } },
    { text: 'BUILD A WATER PLANT, THEN DRAG THE ICE DRILL ACROSS ONTO IT: A CONVEYOR. ICE BECOMES WATER.', done: run => homeFlow(run).out.water > 0, want: 'water',
      hl: run => { const p = planet0(run), d = find(p, 'icedrill'); return nav(run, 0, !find(p, 'water') ? H(run, 0, { kind: 'slot', slot: freeSlot(run, p) }) : d ? H(run, 0, { kind: 'bld', bld: d.id }) : null); } },
    { text: 'NOW A GREENHOUSE: IT DRINKS WATER FROM YOUR STOCK AND GROWS FOOD. NO CONVEYOR NEEDED.', done: run => anyBld(run, 'greenhouse') || anyBld(run, 'livestock'), want: ['greenhouse', 'livestock'],
      hl: run => nav(run, 0, H(run, 0, { kind: 'slot', slot: freeSlot(run, planet0(run)) })) },
    { text: 'YOU HAVE NO MILITARY. OPEN THE SHOP (TOP RIGHT) AND BUY SOME SPACE SHIPS OR A DESTROYER FOR YOUR HOME.', done: run => S.militaryPower(run, 0) >= 5, want: 'units' },
    { text: 'YOUR MILITARY BURNS FUEL. ON THE GAS GIANT (PLANET III): A FUEL PUMP DRILLED TO THE DARK CRUDE, A REFINERY, AND A CONVEYOR BETWEEN THEM.', done: run => homeFlow(run).out.fuel > 0, want: ['pump', 'refinery'],
      hl: run => { const p = home(run).planets[2], pm = find(p, 'pump'); return nav(run, 2, !pm ? H(run, 2, { kind: 'slot', slot: freeSlot(run, p) }) : !pm.drill ? H(run, 2, { kind: 'deposit', dep: shallow(p, 'fuel').id }) : !find(p, 'refinery') ? H(run, 2, { kind: 'slot', slot: freeSlot(run, p) }) : H(run, 2, { kind: 'bld', bld: pm.id })); } },
    { text: 'MACHINES NEVER WEAR OUT, BUT THEY CAN BE UPGRADED. CLICK ANY BUILDING AND UPGRADE IT (+50%).', done: run => home(run).planets.some(p => p.blds.some(b => b.lvl >= 2)), want: 'upgrade' },
    { text: 'ATTACKS OPEN AT 4:00. DRAG FROM YOUR SYSTEM ONTO A NEIGHBOUR TO ATTACK: THE BIGGER POWER WINS AND KEEPS THE DIFFERENCE. WATCH NOTIFICATIONS (LEFT) FOR THREATS.', done: (run, st) => st.t > 12, end: true },
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
    const left = G.mapLeft(), aw = G.W - left;
    const w = Math.min(330, aw - 12), lines = U.wrapText(s.text, Math.floor((w - 12) / 6));
    const h = 16 + lines.length * 10 + 4;
    // in the planet view the box sits top right (the ground fills the bottom); elsewhere bottom centre
    const x = G.view === 'planet' ? G.W - w - 4 : Math.round(left + aw / 2 - w / 2), y = G.view === 'planet' ? G.HUD_H + 4 : G.mapBottom() - h - 6;
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
