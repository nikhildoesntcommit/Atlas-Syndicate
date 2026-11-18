/* ATLAS SYNDICATE v4 — render/fx.js
   Turns simulation events into juice: particles, floating credits, shake, flashes and sounds.
   Purely visual: never touches simulation state. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, W = AS.World, C = AS.CONFIG;
  const FX = AS.FX = {};
  G.uiSparks = [];

  FX.shake = function (amt) { if (G.settings && G.settings.shake) G.shake = Math.max(G.shake, amt); };

  FX.update = function (dt) {
    for (const p of G.parts) { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vy = (p.vy || 0) + (p.g || 0) * dt; p.life -= dt; }
    G.parts = G.parts.filter(p => p.life > 0 && (p.run === G.run || p.run === G.demo));
    for (const f of G.floats) f.t -= dt;
    G.floats = G.floats.filter(f => f.t > 0 && (f.run === G.run || f.run === G.demo));
    for (const s of G.uiSparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; s.life -= dt; }
    G.uiSparks = G.uiSparks.filter(s => s.life > 0);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.5);
    // numbers count towards their real value
    const run = G.attract ? G.demo : G.run;
    if (run) {
      const k = 1 - Math.exp(-dt * 7);
      G.disp.credits += (run.credits - G.disp.credits) * k;
      if (Math.abs(run.credits - G.disp.credits) < 1) G.disp.credits = run.credits;
      G.disp.conf += (run.conf - G.disp.conf) * k;
      G.disp.q += (run.qIncome - G.disp.q) * k;
      G.scoreT = (G.scoreT || 0) - dt;
      if (G.scoreT <= 0) { G.scoreT = 0.25; G.scoreNow = S.computeScore(run).total; }
      G.disp.score = (G.disp.score || 0) + ((G.scoreNow || 0) - (G.disp.score || 0)) * k;
      if (run.qIncome < G.disp.q - 1) G.disp.q = run.qIncome;
    }
  };
  FX.drawUiSparks = function (ctx) {
    for (const s of G.uiSparks) { ctx.fillStyle = AS.PALETTE[s.life > 0.25 ? 14 : 12]; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
  };

  function float(run, x, y, text, col, t, big) { G.floats.push({ run, x, y, text, col, t: t || 1.4, max: t || 1.4, big }); }

  /** live = this run is the player's (sounds and shake on). */
  FX.consume = function (run, live) {
    const snd = name => { if (live) AS.Sfx.play(name); };
    for (const e of run.fx) {
      const b = e.id ? S.getBody(run, e.id) : null;
      switch (e.type) {
        case 'claim':
          if (b) { W.burst(run, b.sx, b.sy, 30, [14, 13, 12, 7], 30, 4); W.ring(run, b.sx, b.sy, b.size, b.size + 18, 0.8, 13); }
          snd('claim'); break;
        case 'build': snd('build'); if (b) W.spark(run, b.sx, b.sy - b.size * 0.5, 6); break;
        case 'built': snd('built'); if (b) W.burst(run, b.sx, b.sy, 8, [13, 12, 6], 14, 3, 0.5); break;
        case 'demolish': snd('remove'); break;
        case 'route': snd('route'); break;
        case 'launch': snd('depart'); break;
        case 'arrive': break;
        case 'pay':
          if (b && e.value >= 1) float(run, b.sx, b.sy - b.size - 6, '+' + e.value, 13, 1.4);
          snd('sale'); break;
        case 'drop':
          if (b) W.burst(run, b.sx, b.sy - b.size, 4, [6, 5, 4], 9, 6, 0.5);
          if (b && b.site) float(run, b.sx, b.sy - 26, '+' + e.load, 14, 1.2);
          snd(b && b.site ? 'megaDrop' : 'arrive'); break;
        case 'lost':
          if (b) { W.burst(run, b.sx, b.sy, 70, [17, 18, 12, 4, 9], 50, 10, 1.2); W.ring(run, b.sx, b.sy, 4, 30, 1, 17); }
          if (live) { FX.shake(1.2); AS.Sfx.play('lost'); } break;
        case 'starve': snd('warning'); break;
        case 'quarter': snd(e.met ? 'quarterGood' : 'quarterBad'); if (live && !e.met) FX.shake(0.6); break;
        case 'contract': snd(e.ok ? 'contract' : 'bad'); if (e.ok) { const P = S.prime(run); float(run, P.sx, P.sy - 20, '+' + e.value, 14, 2, true); } break;
        case 'offer': snd('notice'); break;
        case 'discover':
          if (b) { W.ring(run, b.sx, b.sy, 2, 30, 1.4, 13); W.ring(run, b.sx, b.sy, 2, 18, 1.0, 12); }
          snd('discover'); break;
        case 'warn': snd('alarm'); if (live) FX.shake(0.3); break;
        case 'cargo': {
          const f = run.freighters.find(x => x.id === e.fid), p = f && W.freighterPos(run, f, G.time);
          if (p) W.burst(run, p.x, p.y, 24, [17, 18, 4, 3], 30, 4);
          snd('bad'); break;
        }
        case 'meteor':
          if (b) {
            for (let i = 0; i < 6; i++) W.burst(run, b.sx + (Math.random() - 0.5) * b.size * 2, b.sy + (Math.random() - 0.5) * b.size, 10, [14, 13, 18, 17, 4], 26, 8, 0.9);
            W.ring(run, b.sx, b.sy, b.size, b.size + 26, 0.9, 18);
          }
          if (live) { FX.shake(1.6); G.flash = Math.max(G.flash, 0.25); AS.Sfx.play('impact'); } break;
        case 'flare': if (live) { FX.shake(1.0); G.flash = Math.max(G.flash, 0.5); AS.Sfx.play('flare'); } break;
        case 'storm': snd('event'); break;
        case 'breakdown': case 'blight': snd('event'); if (b) W.burst(run, b.sx, b.sy, 10, [5, 4, 3], 12, 6); break;
        case 'boom': snd('good'); if (b) W.burst(run, b.sx, b.sy, 16, [13, 12, 22], 18, 6); break;
        case 'event': break;
        case 'perk': snd('perk'); break;
        case 'megaUnlock':
          if (b) { W.ring(run, b.sx, b.sy, 4, 50, 1.6, 13); W.ring(run, b.sx, b.sy, 4, 34, 1.2, 14); }
          if (live) { FX.shake(0.8); AS.Sfx.play('megaUnlock'); if (AS.Music) AS.Music.sting(); }
          break;
        case 'megaStage':
          if (b) { W.burst(run, b.sx, b.sy, 60, [14, 13, 12, 6], 40, 6, 1.2); W.ring(run, b.sx, b.sy, 20, 46, 1.2, 14); }
          if (live) { FX.shake(1.0); AS.Sfx.play('megaStage'); }
          break;
        case 'megaDone':
          G.finale = { run, t: 0, id: e.id };
          if (live) AS.Sfx.play('megaDone');
          break;
      }
    }
    run.fx.length = 0;
  };

  /** The finale: the gate powers up, shock rings, sparks, a bone-white flash. ~7 s. */
  FX.updateFinale = function (dt) {
    const f = G.finale;
    if (!f) return;
    f.t += dt;
    const b = S.getBody(f.run, f.id);
    if (!b) return;
    const live = f.run === G.run;
    if (f.t < 3 && Math.random() < 0.9) W.spark(f.run, b.sx + (Math.random() - 0.5) * 44, b.sy + (Math.random() - 0.5) * 44, 3);
    for (const [at, r] of [[0.4, 40], [1.2, 60], [2.0, 90], [2.6, 140]]) {
      if (f.t - dt < at && f.t >= at) {
        W.ring(f.run, b.sx, b.sy, 20, r, 1.6, at > 2 ? 31 : 13);
        W.burst(f.run, b.sx, b.sy, 50, [31, 14, 13, 12, 11], 30 + r * 0.6, 4, 1.6);
        if (live) FX.shake(0.6 + at * 0.4);
      }
    }
    if (f.t - dt < 2.6 && f.t >= 2.6) G.flash = 1;
    if (live && f.t > 0.3 && f.t < 5) G.cam.gx = b.sx - G.W / 2 / G.cam.z, G.cam.gy = b.sy - (G.HUD_H + G.mapBottom()) / 2 / G.cam.z;
  };
})(globalThis.AS = globalThis.AS || {});
