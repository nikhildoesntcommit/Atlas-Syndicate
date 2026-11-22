/* ATLAS SYNDICATE v5 — render/fx.js
   Turns simulation events into juice: battle flashes and dice, construction sparks, floating income,
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
      G.disp.credits += (f.credits - G.disp.credits) * k;
      if (Math.abs(f.credits - G.disp.credits) < 1) G.disp.credits = f.credits;
    }
  };
  /** Floats live in screen space for the system view and in galaxy space for the map. */
  FX.drawFloats = function (ctx, view) {
    for (const f of G.floats) {
      if (f.view !== view) continue;
      const k = 1 - f.t / f.max;
      let x = f.x, y = f.y - k * 12;
      if (view === 'galaxy') { const p = G.toScreen(f.x, f.y); x = p.x; y = p.y - 18 - k * 10; }
      if (k > 0.75 && Math.floor(f.t * 20) % 2) continue;
      AS.Draw.text(ctx, f.text, Math.round(x), Math.round(y), f.col, { align: 'center', big: f.big });
    }
  };

  /** live = this is the player's game (sounds and shake on). */
  FX.consume = function (run, live) {
    const snd = name => { if (live) AS.Sfx.play(name); };
    const vis = S.visibility(run, 0);
    const inSys = id => G.view === 'system' && G.sysId === id;
    const L = G.view === 'system' && G.sysId >= 0 ? AS.SysView.layout(run, run.systems[G.sysId], G.time) : null;
    for (const e of run.fx) {
      const s = e.sys !== undefined ? run.systems[e.sys] : null;
      const mine = e.owner === 0;
      switch (e.type) {
        case 'yield':
          if (!s || s.owner !== 0) break;
          if (inSys(s.id) && L) {
            FX.float('system', L.station.x, L.station.y - 30, '+' + e.v, 13, 1.6, true);
            const per = s.lastYield ? s.lastYield.per : [];
            per.forEach((u, i) => { if (u > 0 && L.nodes[i]) FX.float('system', L.nodes[i].x, L.nodes[i].y - L.nodes[i].size - 14, '+' + u, AS.RES[s.planets[i].type].col, 1.2); });
          } else if (G.view === 'galaxy') FX.float('galaxy', s.x, s.y, '+' + e.v, 13, 1.3);
          break;
        case 'build': case 'line': case 'repair': case 'ship': case 'plat':
          if (mine) snd(e.type === 'line' ? 'route' : e.type === 'repair' ? 'built' : 'build');
          if (mine && L && inSys(e.sys)) {
            const n = e.planet !== undefined ? L.nodes[e.planet] : L.station;
            if (n) { Gal().spark('system', n.x, n.y - 4, 14); Gal().burst('system', n.x, n.y, 10, [13, 12, 6], 14, 3, 0.5); }
          }
          break;
        case 'buy': if (mine) snd('buy'); break;
        case 'recruit': if (mine) snd('recruit'); break;
        case 'unline': if (mine) snd('remove'); break;
        case 'depart': if (mine) snd(e.mode === 'move' ? 'depart' : 'charge'); break;
        case 'arrive': break;
        case 'battle':
          if (s && (vis[s.id] || e.def === 0 || e.owner === 0)) {
            Gal().ring('galaxy', s.x, s.y, 2, 14, 0.6, 17);
            if (e.def === 0 || e.owner === 0) { snd('battle'); if (e.size > 40) FX.shake(0.7); }
          }
          break;
        case 'round':
          if (!s) break;
          G.dice[e.sys] = { ad: e.ad, dd: e.dd, al: e.al, dl: e.dl, at: G.time };
          if (vis[s.id]) {
            Gal().burst('galaxy', s.x, s.y, 6 + Math.min(14, e.al + e.dl), [31, 14, 18, 17, 4], 16, 4, 0.5);
            if (e.owner === 0 || e.def === 0) { snd('hit'); if (e.al + e.dl > 6) FX.shake(0.45); }
            if (inSys(e.sys) && L) { Gal().burst('system', L.cx + (Math.random() - 0.5) * 120, L.cy + (Math.random() - 0.5) * 40, 14, [31, 14, 18, 17], 22, 4, 0.6); FX.shake(0.3); }
          }
          break;
        case 'captured':
          if (s) {
            Gal().ring('galaxy', s.x, s.y, 2, 26, 1.0, Gal().fcol(run, e.owner));
            Gal().burst('galaxy', s.x, s.y, 40, [31, 14, 13, 12, 4], 30, 6, 1.0);
            if (e.owner === 0) { snd('capture'); FX.shake(0.9); FX.float('galaxy', s.x, s.y, 'CAPTURED', 13, 2.2, true); }
            else if (e.prev === 0) { snd('lost'); FX.shake(1.4); G.flash = Math.max(G.flash, 0.3); }
            else if (vis[s.id] && live) AS.Sfx.play('distant');
          }
          break;
        case 'battleEnd':
          if (s && (e.winner === 0 || e.loser === 0)) { snd(e.winner === 0 ? 'good' : 'bad'); Gal().ring('galaxy', s.x, s.y, 4, 20, 0.8, e.winner === 0 ? 22 : 17); }
          break;
        case 'raidEnd': if (e.def === 0) snd('bad'); else if (e.owner === 0) snd('good'); break;
        case 'retreat': if (e.owner === 0) snd('remove'); break;
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
        case 'draft': snd('perk'); break;
        case 'card': if (mine) snd('perk'); break;
        case 'bankrupt': if (mine) { snd('alarm'); G.showToast('BANKRUPT: SOLDIERS DESERT NEXT CYCLE', 17); } break;
        case 'desert': if (mine) { snd('bad'); G.showToast(e.n + ' SOLDIERS DESERTED', 17); } break;
        case 'over': break;
      }
    }
    run.fx.length = 0;
  };
})(globalThis.AS = globalThis.AS || {});
