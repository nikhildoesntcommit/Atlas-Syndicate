/* ATLAS SYNDICATE v7 — tests/average-player.js
   A deliberately simple scripted "average player" for the player-slot test. Not the game AI: no utility
   scoring, no staging, no odds search beyond what the order panel shows. On a planet it does what the
   tutorial teaches: a gold mine drilled to gold (sold every few seconds), an ice drill and water plant,
   a greenhouse, a fuel chain; when a planet is full it routes ice or crude through a pathway.
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
      if (!R.proc) {   // gold: one building and a drill
        if (f.money < AS.BLD[R.ext].cost + drill.cost + 20) return false;
        const e = act(run, 'build', { sys: s.id, planet: pi, slot: fr[0], kind: R.ext }); if (!e.ok) return false;
        act(run, 'drill', { sys: s.id, planet: pi, bld: e.bld.id, path: drill.path });
        return true;
      }
      const need = AS.BLD[R.ext].cost + drill.cost + AS.BLD[R.proc].cost + 30 + (fr.length < 2 ? AS.COSTS.pathway : 0);
      if (f.money < need) return false;
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
  function buildFarm(run, f, s) {
    for (let pi = 0; pi < s.planets.length; pi++) { const fr = free(f, s.planets[pi]); if (fr.length && f.money > 90) return act(run, 'build', { sys: s.id, planet: pi, slot: fr[0], kind: f.money > 400 ? 'livestock' : 'greenhouse' }).ok; }
    return false;
  }

  Bot.step = function (run, b) {
    if (run.over || run.t < b.next) return;
    b.next = run.t + 5;
    const f = run.factions[0];
    if (!f.alive) return;
    const own = S.ownSystems(run, 0);
    let fc = S.forecast(run, f);
    // the market: sell the gold; top up food or fuel when the top bar says they run out
    if (f.gold >= 1) act(run, 'trade', { res: 'gold', qty: -Math.floor(f.gold) });
    if (fc.food.net < 0 && f.food < -fc.food.net * 2 && f.money > 60) act(run, 'trade', { res: 'food', qty: Math.min(50, Math.ceil(-fc.food.net * 4)) });
    if (f.fuelEff < 1 && f.money > 60) act(run, 'trade', { res: 'fuel', qty: Math.min(50, Math.ceil(fc.fuelNeed * 3) + 1) });
    // economy: the tutorial order at home, then the same in every system; extra chains for whatever runs short
    for (const s of own) {
      const have = r => s.planets.some(p => p.blds.some(x => x.kind === AS.RES[r].ext && x.drill && p.deposits[x.drill.dep].amount > 0));
      fc = S.forecast(run, f);
      if (!have('gold') && buildChain(run, f, s, 'gold')) break;
      if (fc.food.net < 0.5 && fc.water.in - fc.water.out >= 1.5 && buildFarm(run, f, s)) break;
      if ((!have('ice') || (fc.food.net < 0.5 && fc.water.in - fc.water.out < 1.5)) && buildChain(run, f, s, 'ice')) break;
      if (S.militaryPower(run, 0) > 0 && (!have('fuel') || fc.fuel.net < 0) && buildChain(run, f, s, 'fuel')) break;
    }
    let saving = false;
    {   // grow: buy a free neighbour as soon as there is money for it (sooner while the map is still open)
      let cheap = null;
      for (const s of own) for (const n of S.neighbours(run, s.id)) { const x = run.systems[n]; if (x.owner === -1) { const pr = S.buyPrice(run, f, x); if (!cheap || pr < cheap[1]) cheap = [x, pr]; } }
      if (cheap && f.money > cheap[1] + (own.length < 4 ? 20 : 250)) act(run, 'buy', { sys: cheap[0].id });
      else if (cheap && own.length < 4 && run.t > 100) saving = true;   // saving up for it
    }
    // spare money goes into more gold first (money), then an upgrade on the best gold mine
    if (f.money > 260 && !saving) for (const s of own) if (buildChain(run, f, s, 'gold')) break;
    if (f.money > 400 && !saving) {
      outer: for (const s of own) for (let pi = 0; pi < s.planets.length; pi++) for (const x of s.planets[pi].blds) if (x.kind === 'goldmine' && x.drill && x.lvl < 3 && f.money > AS.upgPrice(x.kind, x.lvl) + 200) { act(run, 'upgrade', { sys: s.id, planet: pi, bld: x.id }); break outer; }
    }
    // military: before attacks open, and then keep about a third of spare money in units at the border
    const border = own.filter(s => S.neighbours(run, s.id).some(n => run.systems[n].owner !== 0));
    const at = (border.length ? border : own).slice().sort((a, c) => S.sysPower(run, a) - S.sysPower(run, c))[0];
    const goal = 20 + 10 * own.length + run.t / 20;
    if (run.t > C.game.protect - 90 && S.militaryPower(run, 0) < goal && f.money > 120 && !saving) {
      const kind = fc.fuel.net > 0.3 || f.fuel > 60 ? 'cannon' : 'destroyer';
      const n = Math.max(1, Math.min(10, Math.floor((f.money - 60) * 0.4 / S.unitCost(run, kind))));
      act(run, 'units', { sys: at.id, kind, n });
    }
    // defend: react to warnings by moving power from the safest system and buying more at the target
    for (const w of run.warnings) {
      if (w.kind !== 'mass' && w.kind !== 'inc') continue;
      const target = run.systems[w.kind === 'mass' ? w.target : w.sys];
      if (!target || target.owner !== 0) continue;
      const donor = own.filter(s => s !== target && s.capital !== 0 && S.sysPower(run, s) > 10 && !S.neighbours(run, s.id).some(n => run.systems[n].owner > 0)).sort((a, c) => S.sysPower(run, c) - S.sysPower(run, a))[0];
      if (donor) act(run, 'move', { from: donor.id, to: target.id, frac: 0.6 });
      if (f.money > 150) act(run, 'units', { sys: target.id, kind: 'destroyer', n: Math.min(10, Math.floor((f.money - 50) / 2 / S.unitCost(run, 'destroyer'))) || 1 });
      break;
    }
    // expand: attack the easiest neighbour when the order panel shows a clear win (rival capitals at a little less)
    if (run.t >= C.game.protect && run.t - b.lastAttack > 12) {
      let best = null;
      for (const s of own) {
        const mine = S.sysPower(run, s);
        if (mine < 8) continue;
        for (const n of S.neighbours(run, s.id)) {
          const x = run.systems[n];
          if (x.owner === 0 || (x.owner > 0 && S.truceBlocks(run, 0, x.owner))) continue;
          const rivalNext = S.neighbours(run, s.id).some(m => run.systems[m].owner > 0);
          const keep = Math.min(mine * 0.6, s.capital === 0 ? (rivalNext ? 30 : 10) : rivalNext ? 12 : 3);
          const frac = (mine - keep) / mine;
          const send = S.rawPower(S.splitUnits(s.gar, frac)) * f.fuelEff;
          const o = S.outcome(run, send, x);
          const cap = x.owner > 0 && x.capital === x.owner;
          const margin = cap ? 1.1 : x.owner < 0 ? 1.2 : 1.35;
          if (send >= o.def * margin + 2 && (!best || (cap ? 1 : 0) + send / Math.max(1, o.def) > best.score)) best = { from: s.id, to: n, frac, score: (cap ? 1 : 0) + send / Math.max(1, o.def) };
        }
      }
      if (best && act(run, 'move', { from: best.from, to: best.to, frac: best.frac }).ok) b.lastAttack = run.t;
    }
  };
})(globalThis.AS = globalThis.AS || {});
