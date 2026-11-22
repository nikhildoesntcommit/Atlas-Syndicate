/* ATLAS SYNDICATE v5 — tests/average-player.js
   A deliberately simple scripted "average player" for the player-slot test. It is not the game AI:
   no utility scoring, no staging, no odds search. It does what a reasonable first-time player does,
   at human speed (one decision every 5 seconds), using only what the HUD shows.
   It never touches run.rng, so a run it plays can be replayed from its action log. */
(function (AS) {
  'use strict';

  const S = AS.S, C = AS.CONFIG, U = AS.U;
  const Bot = AS.AveragePlayer = {};

  Bot.create = function (seed) { return { rng: U.rng((seed ^ 0xa11ce) >>> 0), next: 2, lastAttack: -99 }; };

  function act(run, name, a) { return S.act(run, 0, name, a); }
  function setupSystem(run, s, f) {
    // repair what is broken, then extract and connect ORE + ENERGY, then FOOD
    if (S.repairAllCost(run, f, s) > 0 && f.credits > 120) act(run, 'repairall', { sys: s.id });
    const order = s.planets.map((p, i) => [p, i]).sort((a, b) => (a[0].type === 'food') - (b[0].type === 'food') || b[0].rich - a[0].rich);
    for (const [p, i] of order) {
      if (f.credits < 160) break;
      if (!p.ext) act(run, 'ext', { sys: s.id, planet: i });
      const y = S.sysYield(run, s);
      if (p.ext && y.per[i].frac <= 0) {
        const l = s.lines.find(x => x.stops[0] === -1 && x.stops.length < 3 && x.stops.indexOf(i) < 0);
        if (l) act(run, 'line', { sys: s.id, a: l.stops[l.stops.length - 1], b: i });
        else act(run, 'line', { sys: s.id, a: -1, b: i });
      }
    }
    const y = S.sysYield(run, s);
    s.lines.forEach((l, i) => { if (y.eff[i] < 1 && f.credits > 90) act(run, 'fr', { sys: s.id, line: l.id, d: 1 }); });
  }

  const fc0 = (run, f) => (f.credits > 150 ? 1 : S.forecast(run, f).net);
  Bot.step = function (run, b) {
    if (run.over || run.t < b.next) return;
    b.next = run.t + 5;
    const f = run.factions[0];
    if (!f.alive) return;
    while (f.drafts.length) {   // cards: economy first, otherwise the first one offered
      const d = f.drafts[0];
      const k = d.offers.find(x => AS.CARDS[x].cat === 'econ') || d.offers[0];
      act(run, 'card', { key: k });
    }
    const own = S.ownSystems(run, 0);
    for (const s of own) if (fc0(run, f) > -20 || s.capital === 0) setupSystem(run, s, f);
    const fc = S.forecast(run, f);
    // army: keep salaries at about half of income
    const soldiers = S.soldiers(run, 0) + own.reduce((a, s) => a + s.train.q, 0);
    const canPay = S.salaryFor(run, f, soldiers + 5) < fc.income * 0.6 && fc.net > 5;
    if (S.salaryFor(run, f, soldiers + 5) < fc.income * 0.55 && fc.net > 0) {
      const border = own.filter(s => S.neighbours(run, s.id).some(n => run.systems[n].owner !== 0));
      const at = (border.length ? border : own)[Math.floor(b.rng() * (border.length || own.length))];
      act(run, 'recruit', { sys: at.id, n: 5 });
    }
    // defend: react to warnings by pulling troops from the safest system
    for (const w of run.warnings) {
      if (w.kind !== 'mass' && w.kind !== 'inc') continue;
      const target = run.systems[w.kind === 'mass' ? w.target : w.sys];
      if (!target || target.owner !== 0) continue;
      const donor = own.filter(s => s !== target && !s.battle && s.capital !== 0 && s.gar.n > 8 && !S.neighbours(run, s.id).some(n => run.systems[n].owner > 0))
        .sort((a, c) => c.gar.n - a.gar.n)[0];
      if (donor) act(run, 'move', { from: donor.id, to: target.id, frac: 0.6 });
      if (canPay) act(run, 'recruit', { sys: target.id, n: 5 });
      if (f.credits > 260 && target.plat.n < 3) act(run, 'plat', { sys: target.id });
      break;
    }
    // spend spare money: buy a cheap independent neighbour, else warships on the busiest border
    if (f.credits > 500) {
      let cheap = null;
      for (const s of own) for (const n of S.neighbours(run, s.id)) { const x = run.systems[n]; if (x.owner === -1 && !x.battle) { const pr = S.buyPrice(run, f, x); if (!cheap || pr < cheap[1]) cheap = [x, pr]; } }
      if (cheap && f.credits > cheap[1] + 200) act(run, 'buy', { sys: cheap[0].id });
      else {
        const border = own.filter(s => S.neighbours(run, s.id).some(n => run.systems[n].owner !== 0)).sort((a, c) => c.gar.n - a.gar.n)[0];
        if (border) act(run, 'ship', { sys: border.id });
      }
    }
    // expand: attack the easiest neighbour when the shown odds are good
    if (run.t >= C.game.protect && run.t - b.lastAttack > 12) {
      let best = null;
      for (const s of own) {
        if (s.battle || s.gar.n < 8) continue;
        for (const n of S.neighbours(run, s.id)) {
          const x = run.systems[n];
          if (x.owner === 0 || x.battle) continue;
          const keep = Math.min(s.gar.n - 1, s.capital === 0 ? 14 : S.neighbours(run, s.id).some(m => run.systems[m].owner > 0) ? 6 : 2);
          const frac = (s.gar.n - keep) / s.gar.n;
          const st = { owner: 0, n: Math.round(s.gar.n * frac), vet: s.gar.vet, ships: s.gar.ships, sdur: s.gar.sdur };
          const o = S.odds(run, st, x, 'attack');
          const cap = x.owner > 0 && x.capital === x.owner;   // a capital takes the whole faction: worth a risk
          const need = cap ? 0.6 : x.owner < 0 ? 0.7 : 0.78;
          const score = o.p + (cap ? 1 : 0);
          if (o.p >= need && (!best || score > best.score)) best = { from: s.id, to: n, frac, p: o.p, score };
        }
      }
      if (best) { act(run, 'move', { from: best.from, to: best.to, frac: best.frac }); b.lastAttack = run.t; }
    }
    // retreat from clearly lost attacks
    for (const bt of run.battles) if (bt.att.owner === 0 && bt.rounds >= 2) {
      const o = S.oddsRaw(S.stackStrength(run, bt.att), S.defStrength(run, run.systems[bt.sys]), bt.att.mode);
      if (o.p < 0.25) act(run, 'retreat', { battle: bt.id });
    }
  };
})(globalThis.AS = globalThis.AS || {});
