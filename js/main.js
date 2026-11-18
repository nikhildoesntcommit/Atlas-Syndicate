/* ATLAS SYNDICATE v4 — main.js
   Boot, the fixed-step loop, rendering order, run lifecycle, autosave, URL parameters,
   the ?demo attract mode with its camera director, and the F9 presenter jump. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, C = AS.CONFIG, D = AS.Draw, PAL = AS.PALETTE, Act = AS.Act, Sc = AS.Screens;
  const Main = AS.Main = {};
  const DEMO_SEED = 336761;   // a system that produces a good-looking bot run (checked headlessly)

  /* ---------- run lifecycle ---------- */
  function resetClient(run) {
    G.sel = null; G.selT = 0; G.drag = null; G.pan = null; G.popup = null; G.paused = false; G.speed = 1; G.acc = 0; G.overTimer = 0;
    G.parts = []; G.floats = []; G.toast = null; G.cards = []; G.seen = {}; G.advice = null; G.adviceT = 0; G.finale = null; G.ff = null;
    G.reported = false; G.saveT = 0;
    AS.Spr.planets = {};
    G.disp.credits = run.credits; G.disp.conf = run.conf; G.disp.q = run.qIncome; G.disp.score = 0; G.scoreNow = 0;
    const b = Act.board().filter(e => e.name === G.name)[0]; G.best = b ? b.score : 0;
  }
  Main.startRun = function (seed, charter, opts) {
    opts = opts || {};
    const run = S.createRun(seed, charter);
    run.daily = !!opts.daily;
    G.run = run; G.beat = opts.beat || 0;
    G.mode = 'play'; G.attract = null;
    Sc.close();
    resetClient(run);
    G.cam.z = 2; G.focusOn(C.map.cx, C.map.cy, 2); G.cam.x = G.cam.gx; G.cam.y = G.cam.gy; G.cam.gx = null;
    if (opts.tutorial) AS.Onboard.start(run); else AS.Onboard.st = null;
    AS.Sfx.play('start');
    Act.autosave();
  };
  Main.newGame = function () {
    if (!AS.Store.get('onboarded', false)) Main.startRun(U.randomSeed(), 'standard', { tutorial: true });
    else Main.openCharter(U.randomSeed(), false);
  };
  Main.openCharter = function (seed, daily) { Sc.open('charter', { seed, daily }); };
  Main.resume = function (info) {
    G.run = info.run; G.mode = 'play'; G.attract = null; Sc.close();
    resetClient(info.run);
    G.seen = info.seen || {};
    G.fitView(info.run);
    G.paused = true;
    G.showToast('RESUMED - PRESS SPACE TO CONTINUE', 13);
  };
  Main.toMenu = function (save) {
    if (save) Act.autosave();
    G.run = null; G.mode = 'menu'; G.attract = null; G.ff = null; G.finale = null;
    G.saveInfo = Act.savedRun();
    Sc.replace('title');
  };
  function endRun(run) {
    if (G.reported) return;
    G.reported = true;
    let rank = null;
    if (!G.attract && !run.recorded) {
      run.recorded = true;
      Act.checkAchievements(run, true);
      const sc = S.computeScore(run);
      const id = Date.now().toString(36) + '-' + run.seed;
      G.lastEntryId = id;
      rank = Act.addToBoard({ name: G.name, score: sc.total, time: Math.floor(run.t), seed: run.seed, charter: AS.CHARTERS[run.charter].name, sys: run.sysName, daily: run.daily, won: run.won, q: run.quarter, id });
      Act.clearSave();
    }
    Sc.replace('report', { run, rank, beat: G.beat });
  }

  /* ---------- presenter helpers ---------- */
  /** F9: fast-forward the current game with the built-in player until the megaproject phase.
   *  Pressed again during the megaproject: fill it to the last few deliveries so the finale can be shown. */
  Main.presenterJump = function () {
    const run = G.attract ? G.demo : G.run;
    if (!run || run.over || (G.mode !== 'play' && !G.attract)) return;
    if (AS.Onboard.st) AS.Onboard.skip();
    if (run.shop && !G.attract) { S.act(run, 'perk', { key: run.shop.offers[0] }); Sc.close(); }
    if (run.mega.state === 'locked') {
      G.ff = { run, bot: AS.Bot.create(run.seed, 'skilled'), t0: run.t };
      G.sel = null; G.popup = null; G.paused = false;
      run.presenter = true;
      AS.Sfx.play('route');
    } else if (run.mega.state === 'active') {
      run.mega.stage = C.mega.stages.length - 1;
      const st = S.megaStage(run);
      for (const g of AS.GOOD_KEYS) run.mega.done[g] = st.req[g] ? Math.floor(st.req[g] * 0.9) : 0;
      run.presenter = true;
      const site = S.site(run);
      G.sel = { kind: 'body', id: site.id }; G.focusOn(site.sx, site.sy, 2);
      G.showToast('PRESENTER: MEGAPROJECT AT 90%', 13);
    }
  };
  function updateFF() {
    const ff = G.ff, run = ff.run, t0 = performance.now();
    const STEP = C.sim.step;
    while (performance.now() - t0 < 28 && !run.over) {
      AS.Bot.step(run, ff.bot);
      if (run.shop) continue;
      S.step(run, STEP);
      run.conf = Math.max(run.conf, 35);   // presenter safety net while skipping ahead
      run.fx.length = 0;
      if (run.mega.state !== 'locked') break;
    }
    if (run.mega.state !== 'locked' || run.over) {
      G.ff = null;
      G.disp.credits = run.credits; G.disp.conf = run.conf; G.disp.q = run.qIncome;
      const site = S.site(run);
      if (site) { G.fitView(run); G.focusOn(site.sx, site.sy, 2); }
      AS.Sfx.play('megaUnlock'); if (AS.Music) AS.Music.sting();
      AS.FX.shake(0.8);
    }
  }

  /* ---------- attract mode (?demo): the bot plays a fast run with camera moves ---------- */
  Main.startAttract = function (seed, speed, from) {
    const run = S.createRun(seed || DEMO_SEED, 'standard');
    G.demo = run; G.demoBot = AS.Bot.create(run.seed, 'skilled');
    if (from > 0) {   // ?demo&from=900 starts the demo already 15 minutes in
      while (run.t < from && !run.over) { AS.Bot.step(run, G.demoBot); if (!run.shop) S.step(run, C.sim.step); run.fx.length = 0; }
      run.banner = null;
    }
    G.attract = { speed: speed || 6, shotT: 0, focus: null, z: 1, endT: 0 };
    G.mode = 'attract'; G.run = null;
    Sc.close();
    resetClient(run);
    G.settings.tips = false;
    G.fitView(run);
  };
  Main.exitAttract = function () { G.attract = null; Main.toMenu(false); };
  Main.attractClick = function () { G.showToast('DEMO MODE - PRESS ESC FOR THE MENU', 13); };
  function director(run, dt) {
    const A = G.attract;
    A.shotT -= dt;
    let cut = null;
    for (const e of run.fx) {
      const b = e.id ? S.getBody(run, e.id) : null;
      if (!b) continue;
      if (e.type === 'megaUnlock' || e.type === 'megaStage' || e.type === 'megaDone') cut = { b, z: 2, hold: 9, pri: 3 };
      else if ((e.type === 'claim' || e.type === 'discover' || e.type === 'meteor') && (!cut || cut.pri < 2)) cut = { b, z: e.type === 'discover' ? 1 : 2, hold: 5, pri: 2 };
    }
    if (cut && (A.shotT < 2 || cut.pri >= 3 || !A.pri || cut.pri > A.pri)) { A.focus = { id: cut.b.id }; A.z = cut.z; A.shotT = cut.hold; A.pri = cut.pri; A.follow = null; }
    else if (A.shotT <= 0) {
      A.pri = 0;
      const roll = Math.random();
      const movers = run.freighters.filter(f => f.route && f.state === 'transit' && f.load);
      if (roll < 0.3) { A.focus = null; A.z = 0; A.shotT = 6; A.follow = null; }
      else if (roll < 0.65 && movers.length) { A.follow = movers[Math.floor(Math.random() * movers.length)].id; A.z = 3; A.shotT = 5; A.focus = null; }
      else {
        const cols = S.colonies(run).concat(run.mega.state === 'active' ? [S.site(run)] : []);
        const b = cols[Math.floor(Math.random() * cols.length)];
        A.focus = { id: b.id }; A.z = 2; A.shotT = 5; A.follow = null;
      }
    }
    if (A.follow) {
      const f = run.freighters.find(x => x.id === A.follow);
      const p = f && f.route && AS.World.freighterPos(run, f, G.time);
      if (p) G.focusOn(p.x, p.y, A.z); else A.shotT = 0;
    } else if (A.focus) {
      const b = S.getBody(run, A.focus.id);
      if (b) G.focusOn(b.sx, b.sy, A.z);
    } else if (A.z === 0) { G.fitView(run, true); A.z = -1; }
  }
  function updateAttract(dt) {
    const run = G.demo, A = G.attract;
    if (run.over) {
      AS.FX.updateFinale(dt);
      A.endT += dt;
      if (A.endT > (run.won ? 7 : 2) && G.screen !== 'report') Sc.replace('report', { run });
      if (A.endT > (run.won ? 19 : 12)) Main.startAttract(run.seed === DEMO_SEED ? U.randomSeed() : DEMO_SEED, A.speed);
      return;
    }
    if (run.shop) AS.Bot.step(run, G.demoBot);
    G.demoAcc += dt * A.speed;
    let n = 0;
    while (G.demoAcc >= C.sim.step && n++ < 400) {
      AS.Bot.step(G.demo, G.demoBot);
      if (run.shop) AS.Bot.step(run, G.demoBot);
      S.step(run, C.sim.step);
      G.demoAcc -= C.sim.step;
      director(run, 0);
      AS.FX.consume(run, true);
      if (run.over) break;
    }
    director(run, dt);
  }

  /* ---------- the loop ---------- */
  function update(dt) {
    G.time += dt;
    AS.FX.update(dt);
    AS.Input.update(dt);
    G.updateCam(dt);
    G.selT = U.clamp(G.selT + (G.sel ? dt : -dt) * 6, 0, 1);
    if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
    let intensity = 1.7, tension = 0;
    if (G.mode === 'attract') {
      updateAttract(dt);
      const r = G.demo;
      intensity = r.mega.state === 'active' ? 4 : 1 + Math.min(2.2, r.quarter * 0.5);
    } else if (G.mode === 'play' && G.run) {
      const run = G.run;
      G.adviceT -= dt;
      if (G.adviceT <= 0) { G.advice = AS.Tips.advice(run); G.adviceT = 0.5; AS.Tips.check(run); Act.checkAchievements(run, false); }
      AS.Onboard.update(dt);
      AS.FX.updateFinale(dt);
      intensity = run.mega.state === 'active' ? 4 : run.mega.state === 'done' ? 4.6 : 1 + Math.min(2.2, run.quarter * 0.5);
      tension = run.conf < 30 ? (30 - run.conf) / 30 : 0;
      if (G.ff) { updateFF(); }
      else if (run.over) {
        G.overTimer += dt;
        if (G.overTimer > (run.won ? 7.5 : 2.2)) endRun(run);
      } else if (!G.screen && !G.paused && !AS.Onboard.blocksSim()) {
        G.acc += dt * G.urlSpeed * G.speed;
        let n = 0;
        while (G.acc >= C.sim.step && n < C.sim.maxStepsPerFrame) {
          S.step(run, C.sim.step);
          n++; G.acc -= C.sim.step;
          AS.FX.consume(run, true);
          if (run.shop) { G.acc = 0; G.popup = null; G.drag = null; Sc.open('shop'); Act.autosave(); break; }
          if (run.over) { G.acc = 0; break; }
        }
        if (n >= C.sim.maxStepsPerFrame) G.acc = 0;
        G.saveT += dt;
        if (G.saveT > C.save.every) { G.saveT = 0; Act.autosave(); }
      }
    } else if (G.mode === 'menu') {
      if (!G.demo || (G.demo.over && G.time > G.demoEndAt)) {
        const s = U.randomSeed();
        G.demo = S.createRun(s, 'standard'); G.demoBot = AS.Bot.create(s, 'skilled'); G.demoAcc = 0;
        AS.Spr.planets = {};
      }
      if (G.demo.over) { if (G.demoEndAt < G.time) G.demoEndAt = G.time + 3; }
      else {
        G.demoAcc += dt * 4;
        let n = 0;
        while (G.demoAcc >= C.sim.step && n++ < 120) {
          AS.Bot.step(G.demo, G.demoBot);
          if (G.demo.shop) AS.Bot.step(G.demo, G.demoBot);
          S.step(G.demo, C.sim.step);
          G.demoAcc -= C.sim.step;
          AS.FX.consume(G.demo, false);
          if (G.demo.over) { G.demoEndAt = G.time + 3; break; }
        }
      }
      G.fitView(G.demo);
      G.cam.x -= (G.W * 0.66 - G.W / 2) / G.cam.z;
    }
    if (AS.Music) AS.Music.update(G.settings.mute ? 0 : intensity, tension);
  }

  function render(dt) {
    const ctx = G.ctx;
    if (!ctx || !AS.Spr.ready) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    G.btns.length = 0;
    G.tipRegions.length = 0;
    G.wm = G.toWorld(G.mouse.x, G.mouse.y);
    AS.World.drawSpace(ctx, G.time);
    const run = G.mode === 'play' ? G.run : G.demo;
    const interactive = G.mode === 'play' && !G.screen && !G.ff;
    if (run) {
      let sx = 0, sy = 0;
      if (G.shake > 0) { const a = Math.min(3, G.shake * 3); sx = Math.round((Math.random() * 2 - 1) * a); sy = Math.round((Math.random() * 2 - 1) * a); }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, G.mode === 'menu' ? 0 : G.HUD_H, G.W, G.mode === 'menu' ? G.H : G.mapBottom() - G.HUD_H); ctx.clip();
      ctx.setTransform(G.cam.z, 0, 0, G.cam.z, Math.round(-G.cam.x * G.cam.z) + sx, Math.round(-G.cam.y * G.cam.z) + sy);
      ctx.imageSmoothingEnabled = false;
      AS.World.drawWorld(ctx, run, G.time, interactive);
      ctx.restore();
      if (G.mode !== 'menu') {
        AS.World.drawOverlay(ctx, run, G.time, interactive);
        AS.HUD.drawTop(ctx, run, interactive);
        const leftY = AS.HUD.drawContracts(ctx, run, interactive);
        const midY = AS.HUD.drawMega(ctx, run);
        const rightY = interactive ? AS.Tips.drawAdvisor(ctx, run) : 17;
        const by = AS.HUD.drawBanner(ctx, run, Math.max(midY, leftY, rightY, AS.Onboard.active() ? 56 : 0) + 2);
        AS.HUD.drawToast(ctx, by + 1);
        AS.HUD.drawConsole(ctx, run);
        AS.FX.drawUiSparks(ctx);
        if (interactive) {
          AS.HUD.drawMapControls(ctx);
          AS.Tips.drawCards(ctx, dt);
          AS.HUD.drawPopup(ctx, run);
        }
        AS.HUD.drawNotices(ctx, dt);
        AS.Onboard.draw(ctx);
        if (G.paused && !G.screen && G.mode === 'play') overlayText(ctx, 'PAUSED', 'SPACE OR 1X TO RESUME');
        if (G.ff) overlayText(ctx, 'FAST FORWARD >>', 'SKIPPING TO THE MEGAPROJECT  ' + U.fmtTime(G.ff.run.t));
        if (G.mode === 'attract' && Math.floor(G.time) % 4 < 3) D.text(ctx, 'DEMO', G.W - 6, G.HUD_H + 3, 4, { align: 'right' });
      } else {
        const cw = Math.round(Math.max(110, Math.min(G.W * 0.27, 190)) * 2);   // darken behind the menu column only
        D.dim(ctx, 0, 0, cw, G.H, 0.72);
        for (let i = 0; i < 6; i++) D.dim(ctx, cw + i * 6, 0, 6, G.H, 0.6 - i * 0.1);
      }
    }
    if (G.flash > 0) { ctx.fillStyle = 'rgba(232,226,207,' + (G.flash * 0.85).toFixed(3) + ')'; ctx.fillRect(0, 0, G.W, G.H); }
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
    const dt = last ? U.clamp((now - last) / 1000, 0, C.sim.maxFrameDt) : 0;
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
    PAL.forEach((c, i) => document.documentElement.style.setProperty('--p' + i, c));
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
    const seed = parseInt(q.get('seed'), 10), code = q.get('code');
    if (q.has && (q.has('demo') || q.get('demo') !== null)) {
      Main.startAttract(Number.isFinite(seed) && seed > 0 ? seed >>> 0 : DEMO_SEED, Number.isFinite(sp) ? sp : 6, U.clamp(parseInt(q.get('from'), 10) || 0, 0, 1700));
      G.urlSpeed = 1;
    } else {
      G.mode = 'menu';
      Sc.replace('title');
      if (code && U.parseCode(code)) { const c = U.parseCode(code); Main.startRun(c.seed, c.charter, { beat: c.score }); }
      else if (Number.isFinite(seed) && seed > 0) Main.openCharter(seed >>> 0, false);
      else if (!AS.Store.get('name', null)) Sc.open('name');   // first launch: ask for a player name
    }
    requestAnimationFrame(frame);
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Main.boot);
    else Main.boot();
  }
})(globalThis.AS = globalThis.AS || {});
