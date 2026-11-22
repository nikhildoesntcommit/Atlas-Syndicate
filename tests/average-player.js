/* ATLAS SYNDICATE v6 — tests/average-player.js
   A deliberately simple scripted "average player" for the player-slot test. Not the game AI: no utility
   scoring, no staging, no odds search beyond what the order panel shows. On a planet it does what the
   tutorial teaches: an extractor, a drill to the nearest matching deposit, a processor next to it,
   a conveyor; when a planet is full it routes ice or fuel through a pathway to the next planet.
   One decision every 5 seconds, using only what the HUD shows. Never touches run.rng (replayable). */
(function (AS) {
  'use strict';

  const S = AS.S, C = AS.CONFIG, U = AS.U;
  const Bot = AS.AveragePlayer = {};

  Bot.create = function (seed) { return { rng: U.rng((seed ^ 0xa11ce) >>> 0), next: 2, lastAttack: -99 }; };
  const act = (run, name, a) => S.act(run, 0, name, a);
  const free = (f, p) => { const used = new Set(p.blds.map(b => b.slot)); const o = []; for (let i = 0; i < S.slotCount(p, f); i++) if (!used.has(i)) o.push(i); return o; };

  /** Build one chain for resource res somewhere in system s (local first, then through a pathway). */
  function buildChain(run, f, s, res) {
    const R = AS.RES[res];
    for (let pi = 0; pi < s.planets.length; pi++) {
      const p = s.planets[pi], fr = free(f, p);
      if (!fr.length) continue;
      const dep = p.deposits.filter(d => d.res === res && d.amount > 40 && !p.blds.some(b => b.drill && b.drill.dep === d.id)).sort((a, b) => a.depth - b.depth)[0];
      if (!dep) continue;
      // try the free slots left to right until one can reach the deposit (like dragging from each one)
      let drill = null, at = -1;
      for (const sl of fr) { drill = S.bestDrill(run, f, p, sl, dep); if (drill) { at = sl; break; } }
      if (!drill) continue;
      fr.splice(fr.indexOf(at), 1); fr.unshift(at);
      const need = AS.BLD[R.ext].cost[0] + drill.cost + AS.BLD[R.proc].cost[0] + 30 + (fr.length < 2 ? AS.COSTS.pathway[0] : 0);
      if (f.credits < need || f.alloy < AS.BLD[R.ext].cost[1] + AS.BLD[R.proc].cost[1] + 10 + (fr.length < 2 ? AS.COSTS.pathway[1] : 0)) return false;
      if (fr.length >= 2) {
        const e = act(run, 'build', { sys: s.id, planet: pi, slot: fr[0], kind: R.ext }); if (!e.ok) return false;
        act(run, 'drill', { sys: s.id, planet: pi, bld: e.bld.id, path: drill.path });
        const q = act(run, 'build', { sys: s.id, planet: pi, slot: fr[1], kind: R.proc });
        if (q.ok) act(run, 'connect', { sys: s.id, planet: pi, from: { b: e.bld.id }, to: { b: q.bld.id } });
        return true;
      }
      // one free slot: send it through a pathway to a neighbour planet with room
      for (let qi = 0; qi < s.planets.length; qi++) {
        if (qi === pi || free(f, s.planets[qi]).length < 1) continue;
        let pw = s.pathways.find(x => (x.a === pi && x.b === qi) || (x.a === qi && x.b === pi));
        if (!pw) { const r = act(run, 'pathway', { sys: s.id, a: pi, b: qi }); if (!r.ok) continue; pw = r.pathway; }
        if (s.planets[qi].portIn[pw.id]) continue;
        const e = act(run, 'build', { sys: s.id, planet: pi, slot: fr[0], kind: R.ext }); if (!e.ok) return false;
        act(run, 'drill', { sys: s.id, planet: pi, bld: e.bld.id, path: drill.path });
        const q = act(run, 'build', { sys: s.id, planet: qi, slot: free(f, s.planets[qi])[0], kind: R.proc });
        act(run, 'connect', { sys: s.id, planet: pi, from: { b: e.bld.id }, to: { p: pw.id } });
        if (q.ok) act(run, 'connect', { sys: s.id, planet: qi, from: { p: pw.id }, to: { b: q.bld.id } });
        return true;
      }
    }
    return false;
  }

  Bot.step = function (run, b) {
    if (run.over || run.t < b.next) return;
    b.next = run.t + 5;
    const f = run.factions[0];
    if (!f.alive) return;
    const own = S.ownSystems(run, 0);
    const fc = S.forecast(run, f);
    // economy: the tutorial order at home, then the same in every system; extra chains for whatever runs short
    const want = ['metal', 'gold', 'ice', 'fuel'];
    if (fc.food.net < 0) want.unshift('ice');
    if (fc.credits.net < 10) want.unshift('gold');
    for (const s of own) {
      if (s.battle) continue;
      const have = r => s.planets.some(p => p.blds.some(x => x.kind === AS.RES[r].ext && x.drill && p.deposits[x.drill.dep].amount > 0));
      // a shortfall warning on the top bar means: build another chain of that resource
      const short = { ice: fc.food.net < 0.3, gold: fc.credits.net < 10, fuel: fc.fuel.net < 0 && f.fuel < 80, metal: f.alloy < 40 };
      for (const r of want) if ((!have(r) || (short[r] && s === own[0])) && buildChain(run, f, s, r)) break;
      if (S.repairList(run, s).some(r => r.dur <= 0) && f.credits > 150) act(run, 'repair', { sys: s.id, kind: 'all' });
    }
    let saving = false;
    {   // grow: buy a free neighbour as soon as there is money for it (sooner while the map is still open)
      let cheap = null;
      for (const s of own) for (const n of S.neighbours(run, s.id)) { const x = run.systems[n]; if (x.owner === -1 && !x.battle) { const pr = S.buyPrice(run, f, x); if (!cheap || pr < cheap[1]) cheap = [x, pr]; } }
      if (cheap && f.credits > cheap[1] + (own.length < 4 ? 20 : 250)) act(run, 'buy', { sys: cheap[0].id });
      else if (cheap && own.length < 4 && run.t > 100) saving = true;   // saving up for it
    }
    // spare money goes into more gold (credits) first, then metal: the tutorial's two chains, repeated
    let extra = 0;
    if (f.credits > 260 && !saving) for (const s of own) { if (buildChain(run, f, s, 'gold') || (f.alloy < 120 && buildChain(run, f, s, 'metal')) || (fc.food.net < 1 && buildChain(run, f, s, 'ice'))) { if (++extra >= 2) break; } }
    // the shop: buy the cheapest next upgrade when rich
    if (f.credits > 550 && !saving) { const t = AS.UPG_TRACKS.slice().sort((a, c) => f.up[a] - f.up[c])[0]; act(run, 'upgrade', { track: t }); }
    // spare alloy: warships on the border, a platform or two at the capital (what the build buttons offer)
    if (f.alloy > 140 && f.credits > 200 && !saving) {
      const cap = run.systems[f.capital];
      const border = own.filter(s => S.neighbours(run, s.id).some(n => run.systems[n].owner > 0)).sort((a, c) => a.gar.n - c.gar.n)[0] || cap;
      if (cap.plat.n < 2) act(run, 'plat', { sys: cap.id });
      else if (fc.fuel.net > 0 || f.fuel > 100) act(run, 'ship', { sys: border.id });
    }
    // army: salaries near half of income, as long as food keeps up
    const soldiers = S.soldiers(run, 0) + own.reduce((a, s) => a + s.train.q, 0);
    const armyGoal = 10 + 8 * own.length + run.t / 60 + Math.max(0, f.credits - 500) / 25;   // and with money in the bank   // grows with the empire, not ahead of it
    if (run.t > C.game.protect - 40 && soldiers < armyGoal && S.salaryFor(run, f, soldiers + 5) < fc.credits.in * 0.6 && fc.credits.net > 0 && (fc.food.net > -0.5 || f.food > 40)) {
      const border = own.filter(s => S.neighbours(run, s.id).some(n => run.systems[n].owner !== 0));
      const at = (border.length ? border : own)[Math.floor(b.rng() * (border.length || own.length))];
      act(run, 'recruit', { sys: at.id, n: f.credits > 1500 ? 15 : 5 });
    }
    // defend: react to warnings by pulling troops from the safest system
    for (const w of run.warnings) {
      if (w.kind !== 'mass' && w.kind !== 'inc') continue;
      const target = run.systems[w.kind === 'mass' ? w.target : w.sys];
      if (!target || target.owner !== 0) continue;
      const donor = own.filter(s => s !== target && !s.battle && s.capital !== 0 && s.gar.n > 8 && !S.neighbours(run, s.id).some(n => run.systems[n].owner > 0)).sort((a, c) => c.gar.n - a.gar.n)[0];
      if (donor) act(run, 'move', { from: donor.id, to: target.id, frac: 0.6 });
      if (f.credits > 260 && f.alloy > 60 && target.plat.n < 3) act(run, 'plat', { sys: target.id });
      break;
    }
    // spend spare money: buy a cheap independent neighbour
    // expand: attack the easiest neighbour when the shown odds are good (rival capitals at a little less)
    if (run.t >= C.game.protect && run.t - b.lastAttack > 12) {
      let best = null;
      for (const s of own) {
        if (s.battle || s.gar.n < 7) continue;
        for (const n of S.neighbours(run, s.id)) {
          const x = run.systems[n];
          if (x.owner === 0 || x.battle || (x.owner > 0 && S.truceBlocks(run, 0, x.owner))) continue;
          const rivalNext = S.neighbours(run, s.id).some(m => run.systems[m].owner > 0);
          const keep = Math.min(s.gar.n - 1, s.capital === 0 ? (rivalNext ? 12 : 5) : rivalNext ? 6 : 2);
          const frac = (s.gar.n - keep) / s.gar.n;
          const st = { owner: 0, n: Math.round(s.gar.n * frac), vet: s.gar.vet, ships: s.gar.ships, sdur: s.gar.sdur };
          const o = S.odds(run, st, x, 'attack');
          const cap = x.owner > 0 && x.capital === x.owner;
          const need = cap ? 0.6 : x.owner < 0 ? 0.7 : 0.78;
          const score = o.p + (cap ? 1 : 0);
          if (o.p >= need && (!best || score > best.score)) best = { from: s.id, to: n, frac, score };
        }
      }
      if (best && act(run, 'move', { from: best.from, to: best.to, frac: best.frac }).ok) b.lastAttack = run.t;
    }
    for (const bt of run.battles) if (bt.att.owner === 0 && bt.rounds >= 2) {
      const o = S.oddsRaw(S.stackStrength(run, bt.att), S.defStrength(run, run.systems[bt.sys]), bt.att.mode);
      if (o.p < 0.25) act(run, 'retreat', { battle: bt.id });
    }
  };
})(globalThis.AS = globalThis.AS || {});
