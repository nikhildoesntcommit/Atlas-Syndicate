/* ATLAS SYNDICATE v5 — ui/tutorial.js
   The interactive, skippable tutorial. It runs during the protected period (0:00-4:00), one short
   instruction at a time, pointing at the exact thing to click. Each step completes from game state,
   so doing things in a different order still works. */
(function (AS) {
  'use strict';

  const S = AS.S, G = AS.G, D = AS.Draw, U = AS.U, C = AS.CONFIG;
  const Tu = AS.Tutorial = { st: null };

  const home = run => run.systems[run.factions[0].capital];
  const findPlanet = (run, type) => { const s = home(run); let best = -1; s.planets.forEach((p, i) => { if (p.type === type && (best < 0 || p.rich > s.planets[best].rich)) best = i; }); return best; };
  const linked = (run, type) => { const s = home(run), y = S.sysYield(run, s); return s.planets.some((p, i) => p.type === type && p.ext && y.per[i].frac > 0); };

  const STEPS = [
    { text: 'THIS IS YOUR HOME SYSTEM. CLICK IT TO OPEN IT.', done: run => G.view === 'system', hl: run => ({ kind: 'system', id: home(run).id }) },
    { text: 'CLICK THE ORE PLANET (BROWN ROCK ICON) TO BUILD AN EXTRACTOR.', done: run => home(run).planets.some(p => p.type === 'ore' && p.ext), hl: run => ({ kind: 'planet', idx: findPlanet(run, 'ore') }), view: 'system' },
    { text: 'NOW THE ENERGY PLANET (BLUE BOLT ICON). ORE + ENERGY = CREDITS.', done: run => home(run).planets.some(p => p.type === 'energy' && p.ext), hl: run => ({ kind: 'planet', idx: findPlanet(run, 'energy') }), view: 'system' },
    { text: 'DRAG FROM THE STATION (BELOW THE STAR) TO THE ORE PLANET: A SUPPLY LINE.', done: run => linked(run, 'ore'), hl: () => ({ kind: 'station' }), view: 'system' },
    { text: 'DRAG FROM THE ORE PLANET ON TO THE ENERGY PLANET TO EXTEND THE LINE.', done: run => S.sysYield(run, home(run)).pairs > 0, hl: run => ({ kind: 'planet', idx: findPlanet(run, 'ore') }), view: 'system' },
    { text: 'A CHAIN PAYS EVERY CYCLE. A LINE NEEDS ONE FREIGHTER PER STOP: CLICK THE LINE, PRESS +.', done: run => { const s = home(run), y = S.sysYield(run, s); return y.eff.length && y.eff.every(e => e >= 1); }, view: 'system' },
    { text: 'FOOD GROWS POPULATION, AND POPULATION MULTIPLIES OUTPUT. EXTRACT AND LINK THE FOOD PLANET.', done: run => linked(run, 'food'), hl: run => ({ kind: 'planet', idx: findPlanet(run, 'food') }), view: 'system' },
    { text: 'PRESS RECRUIT. SOLDIERS COST SALARY EVERY CYCLE: WATCH NET AT THE TOP.', done: run => home(run).train.q > 0 || S.soldiers(run, 0) > C.army.startSoldiers, want: 'recruit', view: 'system' },
    { text: 'ESC: BACK TO THE GALAXY. FROM 4:00, DRAG FROM YOUR SYSTEM ONTO A NEIGHBOUR TO ATTACK. RIVALS WILL ATTACK YOU TOO.', done: () => G.view === 'galaxy', view: 'system' },
    { text: 'WATCH THE WARNINGS (TOP LEFT): THEY SHOW RIVALS MASSING ON YOUR BORDER. GOOD LUCK.', done: (run, st) => st.t > 9, end: true },
  ];

  Tu.start = function () { Tu.st = { step: 0, t: 0, doneAt: 0 }; };
  Tu.active = () => !!Tu.st;
  Tu.skip = function () { Tu.st = null; AS.Store.set('tutorialDone', true); AS.Sfx.play('click'); };
  Tu.event = function () { /* steps check state each frame; events just wake it up */ };
  Tu.cur = () => (Tu.st ? STEPS[Tu.st.step] : null);
  Tu.highlight = function () { const s = Tu.cur(); return s && s.hl && G.run ? s.hl(G.run) : null; };
  Tu.want = k => { const s = Tu.cur(); return !!(s && s.want === k); };
  Tu.update = function (dt) {
    const st = Tu.st, run = G.run;
    if (!st || !run || run.phase !== 'play') return;
    st.t += dt;
    const s = STEPS[st.step];
    if (s.done(run, st)) {
      if (s.end) { Tu.st = null; AS.Store.set('tutorialDone', true); return; }
      st.step++; st.t = 0;
      AS.Sfx.play('good');
      // skip steps already satisfied
      while (st.step < STEPS.length - 1 && STEPS[st.step].done(run, st)) st.step++;
    }
  };
  Tu.draw = function (ctx) {
    const st = Tu.st, s = Tu.cur(), run = G.run;
    if (!st || !s || !run || G.screen) return;
    const lines = U.wrapText(s.text, Math.floor(Math.min(300, G.W - 220) / 4));
    const w = Math.min(310, G.W - 210), h = 14 + lines.length * 7 + 4;
    const pw = G.view === 'system' ? AS.SysView.panelW() : 0;
    const x = Math.round((G.W - pw) / 2 - w / 2), y = G.mapBottom() - h - 6;
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 1);
    D.hazard(ctx, x + 1, y + 1, w - 2, 2, 13, G.time * 6);
    D.text(ctx, 'TUTORIAL ' + (st.step + 1) + '/' + STEPS.length, x + 6, y + 6, 12, { shadow: false });
    lines.forEach((l, i) => D.text(ctx, l, x + 6, y + 14 + i * 7, 31, { shadow: false }));
    G.block(x, y, w, h);
    G.button(ctx, x + w - 36, y + 4, 32, 9, 'SKIP', () => Tu.skip(), { tip: 'SKIP THE TUTORIAL. REPLAY IT FROM SETTINGS.' });
    const hl = Tu.highlight();
    if (hl && hl.kind === 'system' && G.view === 'galaxy') {
      const sys = run.systems[hl.id], p = G.toScreen(sys.x, sys.y);
      AS.SysView.pointer(ctx, Math.round(p.x), Math.round(p.y) - 18, G.time);
    }
  };
})(globalThis.AS = globalThis.AS || {});
