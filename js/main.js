/* ATLAS SYNDICATE v5 — main.js
   Boot, the fixed-step loop, render order, run lifecycle, autosave, URL parameters, the ?demo
   attract mode (an AI plays your faction while a camera director follows the action), and the
   hidden F9 presenter jump to 15:00. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, C = AS.CONFIG, D = AS.Draw, PAL = AS.PALETTE, Act = AS.Act, Sc = AS.Screens;
  const Main = AS.Main = {};
  const DEMO_SEED = 4207;

  function resetClient(run) {
    G.sel = null; G.drag = null; G.pan = null; G.order = null; G.paused = false; G.speed = 1; G.acc = 0; G.overTimer = 0;
    G.parts = []; G.floats = []; G.toast = null; G.notices = []; G.dice = {}; G.reported = false; G.saveT = 0; G.ff = null;
    G.view = 'galaxy'; G.sysId = -1; G.forecast = null; G.fcT = 0;
    AS.Spr.planets = {};
    G.disp.credits = run.factions[0].credits;
  }

  /* ---------- run lifecycle ---------- */
  Main.newRun = function (seed, diff, corp) {
    const run = S.createRun(seed, { diff });
    G.run = run; G.mode = 'play'; G.attract = null;
    Sc.close();
    resetClient(run);
    AS.Tutorial.st = null;
    G.fitView(run);
    if (corp && AS.CORPS[corp]) { G.pendingCorp = corp; run.phase = 'home'; G.showToast('CLICK A FLASHING SYSTEM IN THE OUTER ARMS: YOUR HOME', 13); }
    else Sc.open('corp');
    AS.Sfx.play('start');
  };
  Main.chooseHome = function (id) {
    const run = G.run;
    S.begin(run, id, G.pendingCorp);
    AS.Sfx.play('claim');
    const h = run.systems[run.factions[0].capital];
    G.focusOn(h.x, h.y, 2);
    G.sel = null;
    if (!AS.Store.get('tutorialDone', false)) AS.Tutorial.start();
    G.showToast('HOME: ' + h.name + '  -  ' + AS.CORPS[run.factions[0].corp].name, 13);
    Act.autosave();
  };
  Main.resume = function (info) {
    G.run = info.run; G.mode = 'play'; G.attract = null; Sc.close();
    resetClient(info.run);
    AS.Tutorial.st = null;
    G.fitView(info.run);
    G.paused = true;
    G.showToast('RESUMED - PRESS SPACE TO CONTINUE', 13);
  };
  Main.toMenu = function (save) {
    if (save) Act.autosave();
    G.run = null; G.mode = 'menu'; G.attract = null; G.ff = null; G.view = 'galaxy';
    AS.Tutorial.st = null;
    G.saveInfo = Act.savedRun();
    Sc.replace('title');
  };
  function endRun(run) {
    if (G.reported) return;
    G.reported = true;
    if (!G.attract) { Act.checkAchievements(run, true); Act.clearSave(); }
    G.view = 'galaxy';
    Sc.replace('report', { run });
  }

  /* ---------- F9: jump to 15:00 with the AI playing your slot until then ---------- */
  Main.presenterJump = function () {
    const run = G.attract ? G.demo : G.run;
    if (!run || run.over) return;
    if (run.t >= 899) { G.showToast('ALREADY PAST 15:00', 13); return; }
    if (run.phase !== 'play') {
      const offers = S.corpOffers(run.seed);
      S.begin(run, S.homeCandidates(run)[0], G.pendingCorp || offers[0]);
    }
    AS.Tutorial.st = null;
    if (G.screen) Sc.close();
    G.ff = { run, target: 900 };
    G.order = null; G.sel = null; G.view = 'galaxy'; G.paused = false;
    AS.Sfx.play('route');
  };
  function updateFF() {
    const ff = G.ff;
    const done = S.presenterJump(ff.run, ff.target, 24);
    if (done) {
      G.ff = null;
      G.disp.credits = ff.run.factions[0].credits;
      G.parts = []; G.floats = []; G.dice = {};
      G.fitView(ff.run, true);
      G.showToast('15:00 - THE WAR IS ON', 13);
      AS.Sfx.play('battle'); AS.FX.shake(0.6);
    }
  }

  /* ---------- ?demo attract mode ---------- */
  Main.startAttract = function (seed, speed, from) {
    const run = S.createRun(seed || DEMO_SEED, { diff: 'normal', slot0: 'balanced' });
    S.begin(run, -1, null);
    if (from > 0) S.presenterJump(run, from);   // AI plays the player slot already, so this just fast-forwards
    G.demo = run;
    G.attract = { speed: speed || 3, shotT: 0, focus: null, z: 1, endT: 0, sysT: 0 };
    G.mode = 'attract'; G.run = null;
    Sc.close();
    resetClient(run);
    G.fitView(run);
  };
  Main.exitAttract = function () { G.attract = null; G.demo = null; Main.toMenu(false); };
  Main.attractClick = function () { G.showToast('DEMO - THE AI IS PLAYING YOUR FACTION. ESC FOR THE MENU', 13); };
  /** Camera director: cut to battles (ours first), open our systems now and then, pull back to the galaxy. */
  function director(run, dt) {
    const A = G.attract;
    A.shotT -= dt;
    if (G.view === 'system') { A.sysT -= dt; if (A.sysT <= 0) { G.view = 'galaxy'; G.sysId = -1; A.shotT = 0; } return; }
    if (A.shotT > 0) return;
    const ours = run.battles.filter(b => b.att.owner === 0 || run.systems[b.sys].owner === 0);
    const big = run.battles.slice().sort((a, b) => (b.a0 + b.d0) - (a.a0 + a.d0));
    const roll = Math.random();
    if (ours.length && roll < 0.75) { const s = run.systems[ours[0].sys]; G.focusOn(s.x, s.y, 2); A.shotT = 5; }
    else if (big.length && roll < 0.55) { const s = run.systems[big[0].sys]; G.focusOn(s.x, s.y, 2); A.shotT = 4.5; }
    else if (roll < 0.72) {
      const own = S.ownSystems(run, 0);
      if (own.length) { const s = own[Math.floor(Math.random() * own.length)]; G.view = 'system'; G.sysId = s.id; A.sysT = 5; A.shotT = 0; G.parts = G.parts.filter(p => p.view !== 'system'); }
    } else if (roll < 0.86) {
      const mass = run.warnings[0];
      if (mass && run.systems[mass.sys]) { const s = run.systems[mass.sys]; G.focusOn(s.x, s.y, 2); A.shotT = 4; } else { G.fitView(run, true); A.shotT = 6; }
    } else { G.fitView(run, true); A.shotT = 6; }
  }
  function updateAttract(dt) {
    const run = G.demo, A = G.attract;
    if (run.over) {
      A.endT += dt;
      if (A.endT > 2.5 && G.screen !== 'report') Sc.replace('report', { run });
      if (A.endT > 14) Main.startAttract(run.seed === DEMO_SEED ? U.randomSeed() : DEMO_SEED, A.speed);
      return;
    }
    G.demoAcc += dt * A.speed;
    let n = 0;
    while (G.demoAcc >= C.sim.step && n++ < 200) {
      S.step(run, C.sim.step);
      G.demoAcc -= C.sim.step;
      AS.FX.consume(run, true);
      if (run.over) break;
    }
    director(run, dt);
  }

  /* ---------- the loop ---------- */
  function intensityFor(run) {
    let intensity = run.t < C.game.protect ? 1 : 1.9, tension = 0;
    if (run.battles.some(b => run.systems[b.sys].owner === 0)) intensity = 4.3;
    else if (run.battles.some(b => b.att.owner === 0) || run.battleLog.some(b => (b.att === 0 || b.def === 0) && run.t - b.t < 40)) intensity = 3.1;
    if (run.warnings.some(w => w.kind === 'mass' || w.kind === 'inc')) tension = 0.7;
    return [intensity, tension];
  }
  function update(dt) {
    G.time += dt;
    const live = G.mode === 'attract' ? G.demo : G.mode === 'play' ? G.run : G.demo;
    AS.FX.update(dt, live);
    AS.Input.update(dt);
    if (G.view === 'galaxy') G.updateCam(dt);
    G.viewT += dt;
    if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
    let mus = [1.2, 0];
    if (G.mode === 'attract') { updateAttract(dt); mus = intensityFor(G.demo); }
    else if (G.mode === 'play' && G.run) {
      const run = G.run;
      G.fcT -= dt;
      if (G.fcT <= 0 && run.phase === 'play') { G.fcT = 0.25; G.forecast = S.forecast(run, run.factions[0]); Act.checkAchievements(run, false); }
      AS.Tutorial.update(dt);
      if (run.phase === 'play') mus = intensityFor(run);
      if (G.ff) updateFF();
      else if (run.over) { G.overTimer += dt; if (G.overTimer > 3) endRun(run); }
      else if (!G.screen && !G.paused && run.phase === 'play') {
        G.acc += dt * G.urlSpeed * G.speed;
        let n = 0;
        while (G.acc >= C.sim.step && n < C.sim.maxStepsPerFrame) {
          S.step(run, C.sim.step);
          n++; G.acc -= C.sim.step;
          AS.FX.consume(run, true);
          if (run.factions[0].drafts.length) { G.acc = 0; G.order = null; G.drag = null; Sc.open('draft'); break; }
          if (run.over) { G.acc = 0; break; }
          if (G.view === 'system' && run.systems[G.sysId].owner !== 0) { G.view = 'galaxy'; G.showToast('SYSTEM LOST', 17); }
        }
        if (n >= C.sim.maxStepsPerFrame) G.acc = 0;
        G.saveT += dt;
        if (G.saveT > C.save.every) { G.saveT = 0; Act.autosave(); }
      }
    } else if (G.mode === 'menu') {
      if (!G.demo || (G.demo.over && G.time > G.demoEndAt)) {
        const s = U.randomSeed();
        G.demo = S.createRun(s, { slot0: 'balanced' }); S.begin(G.demo, -1, null); G.demoAcc = 0;
      }
      if (G.demo.over) { if (G.demoEndAt < G.time) G.demoEndAt = G.time + 3; }
      else {
        G.demoAcc += dt * 3;
        let n = 0;
        while (G.demoAcc >= C.sim.step && n++ < 80) { S.step(G.demo, C.sim.step); G.demoAcc -= C.sim.step; AS.FX.consume(G.demo, false); }
      }
      G.cam.z = 1; G.cam.zr = 1;
      G.setCenter(-(G.W * 0.16), 4);
    }
    if (AS.Music) AS.Music.update(G.settings.mute ? 0 : mus[0], mus[1]);
  }

  function render(dt) {
    const ctx = G.ctx;
    if (!ctx || !AS.Spr.ready) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    G.btns.length = 0;
    G.tipRegions.length = 0;
    AS.Gal.drawSpace(ctx, G.time);
    const run = G.mode === 'play' ? G.run : G.demo;
    const interactive = G.mode === 'play' && !G.screen && !G.ff;
    if (run) {
      let sx = 0, sy = 0;
      if (G.shake > 0) { const a = Math.min(3, G.shake * 3); sx = Math.round((Math.random() * 2 - 1) * a); sy = Math.round((Math.random() * 2 - 1) * a); }
      const menu = G.mode === 'menu';
      if (G.view === 'galaxy' || menu) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, menu ? 0 : G.HUD_H, G.W, menu ? G.H : G.mapBottom() - G.HUD_H); ctx.clip();
        const z = G.cam.zr;
        ctx.setTransform(z, 0, 0, z, Math.round(-G.cam.x * z) + sx, Math.round(-G.cam.y * z) + sy);
        ctx.imageSmoothingEnabled = false;
        AS.Gal.drawWorld(ctx, run, G.time);
        ctx.restore();
        if (!menu) {
          ctx.save(); ctx.beginPath(); ctx.rect(0, G.HUD_H, G.W, G.mapBottom() - G.HUD_H); ctx.clip();
          AS.Gal.drawOverlay(ctx, run, G.time, interactive);
          AS.FX.drawFloats(ctx, 'galaxy');
          ctx.restore();
        }
      } else {
        ctx.save(); ctx.translate(sx, sy);
        const s = run.systems[G.sysId];
        G.sysL = AS.SysView.draw(ctx, run, s, G.time, interactive);
        AS.FX.drawFloats(ctx, 'system');
        ctx.restore();
        AS.HUD.drawSysPanel(ctx, run, s, G.sysL);
      }
      if (!menu && run.phase === 'play') {
        AS.HUD.drawTop(ctx, run, interactive || G.mode === 'attract' ? interactive : false);
        const wy = AS.HUD.drawWarnings(ctx, run, interactive);
        const ey = AS.HUD.drawEvent(ctx, run, G.HUD_H + 3);
        if (G.view === 'galaxy' && G.W >= 480) AS.HUD.drawRoster(ctx, run);
        AS.HUD.drawToast(ctx, Math.max(ey, G.HUD_H + 3) + 1);
        if (interactive && G.view === 'galaxy') { AS.HUD.drawSelPanel(ctx, run); AS.HUD.drawOrder(ctx, run); }
        AS.HUD.drawTicker(ctx, run);
        AS.HUD.drawNotices(ctx, dt);
        AS.Tutorial.draw(ctx);
        void wy;
        if (G.paused && !G.screen && G.mode === 'play') overlayText(ctx, 'PAUSED', 'SPACE OR 1X TO RESUME - ORDERS STILL WORK');
        if (G.ff) overlayText(ctx, 'FAST FORWARD >>', 'THE AI PLAYS YOUR SIDE UNTIL 15:00   ' + U.fmtTime(G.ff.run.t));
        if (G.mode === 'attract' && Math.floor(G.time) % 4 < 3) D.text(ctx, 'DEMO - AI PLAYING', G.W - 6, G.mapBottom() - 9, 13, { align: 'right' });
      } else if (!menu) {
        AS.HUD.drawToast(ctx, G.HUD_H + 4);
        D.rect(ctx, 0, 0, G.W, 13, 1);
        D.text(ctx, run.phase === 'home' ? 'CHOOSE YOUR HOME SYSTEM: ONE OF THE FLASHING SYSTEMS IN THE OUTER ARMS' : 'ATLAS SYNDICATE  -  SEED ' + run.seed, 6, 4, 13);
        if (run.phase === 'home') AS.Gal.drawOverlay(ctx, run, G.time, true);
      } else {
        const cw = Math.round(Math.max(118, Math.min(G.W * 0.27, 190)) * 2);
        D.dim(ctx, 0, 0, cw, G.H, 0.75);
        for (let i = 0; i < 6; i++) D.dim(ctx, cw + i * 6, 0, 6, G.H, 0.6 - i * 0.1);
      }
    }
    if (G.flash > 0) { ctx.fillStyle = 'rgba(232,226,207,' + (G.flash * 0.7).toFixed(3) + ')'; ctx.fillRect(0, 0, G.W, G.H); }
    Sc.draw(ctx, dt);
    G.drawTooltip(ctx, dt);
  }
  function overlayText(ctx, a, b) {
    const y = Math.round((G.HUD_H + G.mapBottom()) / 2) - 14;
    const w = Math.max(D.tw(a, true, 2), D.tw(b)) + 24, x = Math.round(G.W / 2 - w / 2);
    D.plate(ctx, x, y, w, 32, 1);
    D.hazard(ctx, x + 1, y + 1, w - 2, 2, 13, G.time * 10);
    D.text(ctx, a, G.W / 2, y + 6, 13, { align: 'center', big: true, scale: 2 });
    D.text(ctx, b, G.W / 2, y + 23, 6, { align: 'center', shadow: false });
  }

  let last = 0;
  function frame(now) {
    const dt = last ? U.clamp((now - last) / 1000, 0, C.sim.maxFrameDt * 2) : 0;
    last = now;
    const t0 = performance.now();
    try { update(dt); render(dt); G.cpu = (G.cpu || 0) * 0.95 + (performance.now() - t0) * 0.05; } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  Main.boot = function () {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = { get: () => null, has: () => false }; }
    if (q.get('selftest') === '1') { location.href = 'tests/selftest.html'; return; }
    const sp = parseFloat(q.get('speed'));
    G.urlSpeed = Number.isFinite(sp) ? U.clamp(sp, 0.25, C.sim.maxUrlSpeed) : 1;
    G.canvas = document.getElementById('screen');
    G.ctx = G.canvas.getContext('2d', { alpha: false });
    Act.loadSettings();
    AS.Spr.bake();
    G.layout();
    window.addEventListener('resize', G.layout);
    AS.Input.bind();
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Act.autosave(); if (G.mode === 'play' && !G.screen) G.paused = true; } });
    window.addEventListener('pagehide', () => Act.autosave());
    window.addEventListener('pointerdown', () => AS.Sfx.init(), { capture: true });
    window.addEventListener('keydown', () => AS.Sfx.init(), { capture: true });
    G.saveInfo = Act.savedRun();
    const seed = parseInt(q.get('seed'), 10), code = q.get('code'), diff = q.get('diff');
    if (q.has && q.has('demo')) {
      Main.startAttract(Number.isFinite(seed) && seed > 0 ? seed >>> 0 : DEMO_SEED, Number.isFinite(sp) ? sp : 3, U.clamp(parseInt(q.get('from'), 10) || 0, 0, 1700));
      G.urlSpeed = 1;
    } else {
      G.mode = 'menu';
      Sc.replace('title');
      if (code && U.parseCode(code)) { const c = U.parseCode(code); Main.newRun(c.seed, c.diff, c.corp); }
      else if (Number.isFinite(seed) && seed > 0) Main.newRun(seed >>> 0, AS.DIFFICULTY[diff] ? diff : 'normal');
    }
    requestAnimationFrame(frame);
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Main.boot);
    else Main.boot();
  }
})(globalThis.AS = globalThis.AS || {});
