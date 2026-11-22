/* ATLAS SYNDICATE v6 — main.js
   Boot, the fixed-step loop, render order (galaxy, system or planet view), run lifecycle, autosave,
   URL parameters (?demo, ?seed=, ?code=, ?diff=, ?speed=, ?aidebug), the ?demo camera director and the
   hidden F9 presenter jump to 15:00. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, C = AS.CONFIG, D = AS.Draw, Act = AS.Act, Sc = AS.Screens;
  const Main = AS.Main = {};
  const DEMO_SEED = 4207;

  function resetClient(run) {
    G.sel = null; G.drag = null; G.pan = null; G.order = null; G.paused = false; G.speed = 1; G.acc = 0; G.overTimer = 0;
    G.parts = []; G.floats = []; G.toast = null; G.notices = []; G.dice = {}; G.reported = false; G.saveT = 0; G.ff = null; G.warnOpen = false;
    G.view = 'galaxy'; G.sysId = -1; G.planet = -1; G.forecast = null; G.fcT = 0;
    AS.Spr.planets = {};
    G.disp.credits = run.factions[0].credits;
  }

  /* ---------- run lifecycle ---------- */
  Main.newRun = function (seed, diff) {
    const run = S.createRun(seed, { diff });
    G.run = run; G.mode = 'play'; G.attract = null;
    Sc.close();
    resetClient(run);
    AS.Tutorial.st = null;
    G.fitView(run);
    run.phase = 'home';
    G.showToast('CHOOSE YOUR HOME: ONE OF THE FLASHING SYSTEMS AT THE ARM TIPS', 13);
    AS.Sfx.play('start');
  };
  Main.chooseHome = function (id) {
    const run = G.run;
    S.begin(run, id);
    AS.Sfx.play('claim');
    const h = run.systems[run.factions[0].capital];
    G.focusOn(h.x, h.y, 2);
    G.sel = null;
    if (!AS.Store.get('tutorialDone', false)) AS.Tutorial.start();
    G.showToast('HOME: ' + h.name, 13);
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
    if (run.phase !== 'play') S.begin(run, S.homeCandidates(run)[0]);
    AS.Tutorial.st = null;
    if (G.screen) Sc.close();
    G.ff = { run, target: 900 };
    G.order = null; G.sel = null; G.view = 'galaxy'; G.paused = false;
    AS.Sfx.play('route');
  };
  function updateFF() {
    const ff = G.ff;
    if (S.presenterJump(ff.run, ff.target, 24)) {
      G.ff = null;
      G.disp.credits = ff.run.factions[0].credits;
      G.parts = []; G.floats = []; G.dice = {};
      G.fitView(ff.run, true);
      G.showToast('15:00 - THE WAR IS ON', 13);
      AS.Sfx.play('battle'); AS.FX.shake(0.6);
    }
  }

  /* ---------- ?demo: open in the galaxy on a battle, then cut into a busy planet ---------- */
  Main.startAttract = function (seed, speed, from) {
    const run = S.createRun(seed || DEMO_SEED, { diff: 'normal', slot0: 'balanced' });
    S.begin(run, -1);
    // skip ahead to the first real fight (so the audience sees a battle within seconds)
    const target = from > 0 ? from : 0;
    const t0 = Date.now();
    while (!run.over && Date.now() - t0 < 4000) {
      // prefer a fight between two factions; settle for any fight after 9:00
      if (target ? run.t >= target : run.t > C.game.protect + 20 && run.battles.some(b => b.att.owner >= 0 && (run.systems[b.sys].owner >= 0 || run.t > 540) && b.att.n >= 10 && run.systems[b.sys].gar.n >= 10)) break;
      if (!target && run.t > 900) break;
      S.step(run, C.sim.step); run.fx.length = 0;
    }
    G.demo = run;
    G.attract = { speed: speed || 2, shotT: 0, age: 0, z: 1, endT: 0, sysT: 0, didPlanet: false };
    G.mode = 'attract'; G.run = null;
    Sc.close();
    resetClient(run);
    const b = run.battles[0];
    if (b) { const s = run.systems[b.sys]; G.focusOn(s.x, s.y, 2); G.snapCam(); G.attract.shotT = 9; }
    else G.fitView(run);
  };
  Main.exitAttract = function () { G.attract = null; G.demo = null; Main.toMenu(false); };
  Main.attractClick = function () { G.showToast('DEMO - THE AI IS PLAYING YOUR FACTION. ESC FOR THE MENU', 13); };
  function busiestPlanet(run) {
    let best = null, bv = -1;
    for (const s of run.systems) if (s.owner === 0) { const fl = S.sysFlow(run, s); s.planets.forEach((p, i) => { const v = p.blds.reduce((a, b) => a + (fl.B[b.id].rate || 0) + 0.5, 0) + S.portsOf(s, i).length * 2; if (v > bv) { bv = v; best = [s.id, i]; } }); }
    return best;
  }
  function director(run, dt) {
    const A = G.attract;
    A.age += dt; A.shotT -= dt;
    if (G.view !== 'galaxy') { A.sysT -= dt; if (A.sysT <= 0) { G.view = 'galaxy'; G.sysId = -1; G.planet = -1; A.shotT = 0; } return; }
    if (A.shotT > 0) return;
    // after the opening battle: a short cut into the busiest planet, then rotate
    if (!A.didPlanet || Math.random() < 0.22) {
      const bp = busiestPlanet(run);
      if (bp) { G.view = 'planet'; G.sysId = bp[0]; G.planet = bp[1]; A.sysT = A.didPlanet ? 6 : 7; A.didPlanet = true; return; }
    }
    const ours = run.battles.filter(b => b.att.owner === 0 || run.systems[b.sys].owner === 0);
    const big = run.battles.slice().sort((a, b) => (b.a0 + b.d0) - (a.a0 + a.d0));
    const roll = Math.random();
    if (ours.length && roll < 0.6) { const s = run.systems[ours[0].sys]; G.focusOn(s.x, s.y, 2); A.shotT = 6; }
    else if (big.length && roll < 0.75) { const s = run.systems[big[0].sys]; G.focusOn(s.x, s.y, 2); A.shotT = 5; }
    else if (roll < 0.85) { const own = S.ownSystems(run, 0); if (own.length) { G.view = 'system'; G.sysId = own[Math.floor(Math.random() * own.length)].id; A.sysT = 5; } }
    else { G.fitView(run, true); A.shotT = 6; }
  }
  function updateAttract(dt) {
    const run = G.demo, A = G.attract;
    if (run.over) {
      A.endT += dt;
      if (A.endT > 2.5 && G.screen !== 'report') { G.view = 'galaxy'; Sc.replace('report', { run }); }
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
    if (run.coalition) intensity = Math.max(intensity, 2.6);
    if (run.warnings.some(w => w.kind === 'mass' || w.kind === 'inc')) tension = 0.7;
    return [intensity, tension];
  }
  function update(dt) {
    G.time += dt;
    const live = G.mode === 'attract' ? G.demo : G.mode === 'play' ? G.run : G.demo;
    AS.FX.update(dt, live);
    AS.Input.update(dt);
    if (G.view === 'galaxy') G.updateCam(dt);
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
      else if ((!G.screen || G.screen === 'shop') && !G.paused && run.phase === 'play') {
        G.acc += dt * G.urlSpeed * G.speed;
        let n = 0;
        while (G.acc >= C.sim.step && n < C.sim.maxStepsPerFrame) {
          S.step(run, C.sim.step);
          n++; G.acc -= C.sim.step;
          AS.FX.consume(run, true);
          if (run.over) { G.acc = 0; break; }
          if (G.view !== 'galaxy' && run.systems[G.sysId].owner !== 0) { G.view = 'galaxy'; G.showToast('SYSTEM LOST', 17); }
        }
        if (n >= C.sim.maxStepsPerFrame) G.acc = 0;
        G.saveT += dt;
        if (G.saveT > C.save.every) { G.saveT = 0; Act.autosave(); }
      }
    } else if (G.mode === 'menu') {
      if (!G.demo || (G.demo.over && G.time > G.demoEndAt)) {
        const s = U.randomSeed();
        G.demo = S.createRun(s, { slot0: 'balanced' }); S.begin(G.demo, -1); G.demoAcc = 0;
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
      } else if (G.view === 'system') {
        ctx.save(); ctx.translate(sx, sy);
        const s = run.systems[G.sysId];
        const L = AS.SysView.draw(ctx, run, s, G.time, interactive);
        ctx.restore();
        AS.HUD.drawSysPanel(ctx, run, s, L);
      } else {
        ctx.save(); ctx.translate(sx, sy);
        const s = run.systems[G.sysId];
        const L = AS.PlanetView.draw(ctx, run, s, G.planet, G.time, interactive);
        AS.FX.drawFloats(ctx, 'screen');
        ctx.restore();
        AS.HUD.drawPlanetPanel(ctx, run, s, G.planet, L);
      }
      if (!menu && run.phase === 'play') {
        AS.HUD.drawTop(ctx, run, interactive);
        const wy = AS.HUD.drawWarnings(ctx, run, interactive);
        const ey = AS.HUD.drawEvent(ctx, run, wy + 1);
        if (G.view === 'galaxy' && G.W >= 480) AS.HUD.drawRoster(ctx, run);
        AS.HUD.drawToast(ctx, Math.max(ey, G.HUD_H + 3) + 1);
        if (interactive && G.view === 'galaxy') { AS.HUD.drawSelPanel(ctx, run); AS.HUD.drawOrder(ctx, run); }
        AS.HUD.drawTicker(ctx, run);
        AS.HUD.drawNotices(ctx, dt);
        AS.Tutorial.draw(ctx);
        AS.Debug.draw(ctx, run);
        if (G.paused && !G.screen && G.mode === 'play') overlayText(ctx, 'PAUSED', 'SPACE OR 1X TO RESUME - ORDERS STILL WORK');
        if (G.ff) overlayText(ctx, 'FAST FORWARD >>', 'THE AI PLAYS YOUR SIDE UNTIL 15:00   ' + U.fmtTime(G.ff.run.t));
        if (G.mode === 'attract' && Math.floor(G.time) % 4 < 3) D.text(ctx, 'DEMO - AI PLAYING', G.W - 6, G.mapBottom() - 11, 13, { align: 'right', big: true });
      } else if (!menu) {
        AS.HUD.drawToast(ctx, G.HUD_H + 4);
        D.rect(ctx, 0, 0, G.W, G.HUD_H - 2, 1);
        D.text(ctx, run.phase === 'home' ? 'CHOOSE YOUR HOME: A FLASHING SYSTEM AT AN ARM TIP' : 'ATLAS SYNDICATE', 6, 5, 13, { big: true });
        if (run.phase === 'home') AS.Gal.drawOverlay(ctx, run, G.time, true);
      } else {
        const cw = Math.round(Math.max(118, Math.min(G.W * 0.27, 190)) * 2);
        D.dim(ctx, 0, 0, cw, G.H, 0.75);
        for (let i = 0; i < 6; i++) D.dim(ctx, cw + i * 6, 0, 6, G.H, 0.6 - i * 0.1);
      }
    }
    if (G.flash > 0) { ctx.fillStyle = 'rgba(232,226,207,' + (G.flash * 0.7).toFixed(3) + ')'; ctx.fillRect(0, 0, G.W, G.H); }
    AS.Screens.draw(ctx, dt);
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
    if (q.has && q.has('aidebug')) {
      AS.Debug.on = true;
      window.addEventListener('keydown', e => { if (e.key === 'd' || e.key === 'D') AS.Debug.on = !AS.Debug.on; });
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Act.autosave(); if (G.mode === 'play' && !G.screen) G.paused = true; } });
    window.addEventListener('pagehide', () => Act.autosave());
    window.addEventListener('pointerdown', () => AS.Sfx.init(), { capture: true });
    window.addEventListener('keydown', () => AS.Sfx.init(), { capture: true });
    G.oldSaveMsg = Act.discardOldSaves();
    G.saveInfo = Act.savedRun();
    const seed = parseInt(q.get('seed'), 10), code = q.get('code'), diff = q.get('diff');
    if (q.has && q.has('demo')) {
      Main.startAttract(Number.isFinite(seed) && seed > 0 ? seed >>> 0 : DEMO_SEED, Number.isFinite(sp) ? sp : 2, U.clamp(parseInt(q.get('from'), 10) || 0, 0, 1700));
      G.urlSpeed = 1;
    } else {
      G.mode = 'menu';
      Sc.replace('title');
      if (code && U.parseCode(code)) { const c = U.parseCode(code); Main.newRun(c.seed, c.diff); }
      else if (Number.isFinite(seed) && seed > 0) Main.newRun(seed >>> 0, AS.DIFFICULTY[diff] ? diff : 'normal');
    }
    requestAnimationFrame(frame);
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Main.boot);
    else Main.boot();
  }
})(globalThis.AS = globalThis.AS || {});
