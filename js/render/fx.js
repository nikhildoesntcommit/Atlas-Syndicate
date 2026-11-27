/* ATLAS SYNDICATE v7 — render/fx.js
   Turns simulation events into juice: battle flashes, construction sparks, floating income,
   capture rings, screen shake and sound. Purely visual: never touches simulation state. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, C = AS.CONFIG;
  const FX = AS.FX = {};
  const Gal = () => AS.Gal;

  FX.shake = function (amt) { if (G.settings && G.settings.shake) G.shake = Math.max(G.shake, amt); };
  FX.float = function (view, x, y, text, col, t, big) { G.floats.push({ view, x, y, text, col, t: t || 1.4, max: t || 1.4, big }); };

  FX.update = function (dt, run) {
    for (const p of G.parts) { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vy = (p.vy || 0) + (p.g || 0) * dt; p.life -= dt; }
    G.parts = G.parts.filter(p => p.life > 0);
    if (G.parts.length > 900) G.parts.splice(0, G.parts.length - 900);
    for (const f of G.floats) f.t -= dt;
    G.floats = G.floats.filter(f => f.t > 0);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2);
    if (run) {
      const f = run.factions[0];
      const k = 1 - Math.exp(-dt * 7);
      G.disp.money += (f.money - G.disp.money) * k;
      if (Math.abs(f.money - G.disp.money) < 1) G.disp.money = f.money;
    }
  };
  /** Floats live in screen space for the system view and in galaxy space for the map. */
  FX.drawFloats = function (ctx, view) {
    for (const f of G.floats) {
      if (f.view !== view) continue;
      const k = 1 - f.t / f.max;
      let x = f.x, y = f.y - k * 12;
      if (view === 'galaxy') { const p = G.toScreen(f.x, f.y); x = p.x; y = p.y - 18 - k * 10; }
      if (view === 'screen') { y = f.y - k * 6; }
      if (k > 0.75 && Math.floor(f.t * 20) % 2) continue;
      AS.Draw.text(ctx, f.text, Math.round(x), Math.round(y), f.col, { align: 'center', big: f.big });
    }
  };

  /** live = this is the player's game (sounds and shake on). */
  FX.consume = function (run, live) {
    const snd = name => { if (live) AS.Sfx.play(name); };
    const vis = S.visibility(run, 0);
    const inSys = id => G.view === 'system' && G.sysId === id;
    const PL = G.view === 'planet' && G.run === run ? AS.PlanetView.layout(run, run.systems[G.sysId], G.planet) : null;
    for (const e of run.fx) {
      const s = e.sys !== undefined ? run.systems[e.sys] : null;
      const mine = e.owner === 0;
      switch (e.type) {
        case 'yield':
          if (!s || s.owner !== 0) break;
          if (G.view === 'galaxy' && e.out.gold >= 0.5) FX.float('galaxy', s.x, s.y, '+' + (Math.round(e.out.gold * 10) / 10) + ' GOLD', 13, 1.3);
          if (G.view === 'planet' && G.sysId === s.id && PL) {
            let k = 0;
            for (const key of ['gold', 'water', 'food', 'fuel']) if (e.out[key] >= 0.5) FX.float('screen', PL.areaR - 44, PL.top + 12 + (k++) * 10, '+' + (Math.round(e.out[key] * 10) / 10) + ' ' + AS.STOCK[key].name, AS.STOCK[key].col, 1.6);
          }
          break;
        case 'build': case 'drill': case 'conveyor': case 'upgrade':
          if (mine) {
            snd(e.type === 'conveyor' ? 'route' : e.type === 'upgrade' ? 'perk' : e.type === 'drill' ? 'drill' : 'build');
            if (e.type === 'build') G.showToast(AS.BLD[e.kind].name + ' PLACED: ' + AS.BLD[e.kind].does, 22);
            if (e.type === 'upgrade') G.showToast('UPGRADED TO LEVEL ' + e.lvl + ': +50% THROUGHPUT', 13);
          }
          if (mine && PL && G.sysId === e.sys && G.planet === e.planet) {
            const b = S.bldById(PL.p, e.bld);
            if (b) { const c = AS.PlanetView.bldCenter(PL, b); Gal().spark('planet', c.x, c.y - 6, 16); Gal().burst('planet', c.x, c.y, 12, [13, 12, 6], 16, 3, 0.6); }
          }
          break;
        case 'pathway': if (mine) snd('route'); break;
        case 'unit': if (mine) { snd('recruit'); if (s && G.view === 'galaxy') FX.float('galaxy', s.x, s.y, '+' + e.n * AS.UNITS[e.kind].power + ' POWER', 17, 1.4); } break;
        case 'trade': if (mine) snd(e.qty < 0 ? 'buy' : 'click'); break;
        case 'coalition': snd('alarm'); if (live) { G.notices.push({ title: 'COALITION', text: 'EVERYONE VS ' + (e.target === 0 ? 'YOU' : run.factions[e.target].short), t: 5, max: 5 }); FX.shake(0.4); } break;
        case 'coalitionStrike': if (live && e.target === 0) snd('alarm'); break;
        case 'coalitionEnd': snd('notice'); break;
        case 'starve': if (mine) { snd('alarm'); G.showToast(e.n + ' WORKERS STARVED: THEIR MACHINES STOP. BUILD FARMS OR BUY FOOD', 17); } break;
        case 'hunger': if (mine) { snd('alarm'); G.showToast('CREWS UNDERFED: OUTPUT REDUCED. BUY OR GROW FOOD', 18); } break;
        case 'lowfuel': if (mine) { snd('alarm'); G.showToast('OUT OF FUEL: MILITARY AT ' + Math.round(e.eff * 100) + '% POWER. BUILD A REFINERY OR BUY FUEL', 17); } break;
        case 'nowater': if (mine) { snd('warning'); G.showToast('FARMS ARE SHORT OF WATER: BUILD A WATER PLANT OR BUY WATER', 18); } break;
        case 'demolish': if (mine) snd('remove'); break;
        case 'depart': if (mine) snd(e.mode === 'move' ? 'depart' : 'charge'); break;
        case 'arrive': break;
        case 'battle':
          if (s && (vis[s.id] || e.def === 0 || e.owner === 0)) {
            Gal().ring('galaxy', s.x, s.y, 2, 14, 0.6, 17);
            Gal().burst('galaxy', s.x, s.y, 10 + Math.min(30, Math.round(e.size / 6)), [31, 14, 18, 17, 4], 18, 4, 0.7);
            if (e.def === 0 || e.owner === 0) {
              snd('battle');
              FX.shake(e.size > 60 ? 0.8 : 0.45);
              FX.float('galaxy', s.x, s.y - 6, Math.round(e.att) + ' VS ' + Math.round(e.defP), 31, 2.2, true);
              const meWon = (e.owner === 0 && e.win) || (e.def === 0 && !e.win);
              if (e.def === 0 && !e.win) { snd('good'); G.showToast('DEFENCE HELD AT ' + s.name + ': ' + Math.round(e.defP) + ' VS ' + Math.round(e.att), 22); }
              if (e.owner === 0 && !e.win) { snd('bad'); G.showToast('ATTACK ON ' + s.name + ' FAILED: ' + Math.round(e.att) + ' VS ' + Math.round(e.defP), 17); }
              void meWon;
            }
          }
          break;
        case 'captured':
          if (s) {
            Gal().ring('galaxy', s.x, s.y, 2, 26, 1.0, Gal().fcol(run, e.owner));
            Gal().burst('galaxy', s.x, s.y, 40, [31, 14, 13, 12, 4], 30, 6, 1.0);
            if (e.owner === 0) { snd('capture'); FX.shake(0.9); FX.float('galaxy', s.x, s.y, 'CAPTURED', 13, 2.2, true); G.showToast('CAPTURED ' + s.name + ': ITS BUILDINGS AND WORKERS ARE YOURS', 22); }
            else if (e.prev === 0) { snd('lost'); FX.shake(1.4); G.flash = Math.max(G.flash, 0.3); G.showToast(s.name + ' WAS CAPTURED', 17); }
            else if (vis[s.id] && live) AS.Sfx.play('distant');
          }
          break;
        case 'bought': if (mine) { snd('claim'); if (s) Gal().ring('galaxy', s.x, s.y, 2, 22, 1.0, 13); } break;
        case 'eliminated':
          if (live) {
            AS.Sfx.play(e.owner === 0 ? 'lost' : 'eliminated');
            FX.shake(e.owner === 0 || e.by === 0 ? 1.6 : 0.6);
            const L2 = run.factions[e.owner], B = run.factions[e.by];
            G.notices.push({ title: 'ELIMINATED', text: L2.short + ' BY ' + B.short, t: 5, max: 5 });
          }
          break;
        case 'warn': if (e.fid === 0) snd(e.kind === 'inc' ? 'alarm' : 'warning'); break;
        case 'eventWarn': snd('notice'); break;
        case 'event': snd('event'); if (live) FX.shake(0.3); break;
        case 'endgame': snd('alarm'); if (live) G.notices.push({ title: '18:00 ENDGAME', text: 'RIVALS GO FOR THE CAPITALS', t: 6, max: 6 }); break;
        case 'over': break;
      }
    }
    run.fx.length = 0;
  };
})(globalThis.AS = globalThis.AS || {});
