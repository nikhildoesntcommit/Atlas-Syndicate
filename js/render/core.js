/* ATLAS SYNDICATE v5 — render/core.js
   Client state (AS.G), the integer-scaled adaptive layout (from v4), the galaxy camera and
   immediate-mode UI primitives: riveted plates, hazard stripes, buttons, tooltips. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE;

  const G = AS.G = {
    canvas: null, ctx: null, W: 480, H: 270, scale: 1, dpr: 1,
    mode: 'boot', screen: null, screenT: 0, run: null, demo: null, demoAcc: 0, demoEndAt: 0, view: 'galaxy', sysId: -1,
    sel: null, selT: 0, drag: null, pan: null, pinch: null, popup: null, order: null, pointers: new Map(), dice: {}, viewT: 0,
    mouse: { x: -99, y: -99, inside: false, down: false }, wm: { x: -99, y: -99 }, touch: false,
    btns: [], tipRegions: [], tipHover: { text: '', t: 0 }, pressed: null, focusField: null,
    cam: { x: 0, y: 0, z: 1, zr: 1, vx: 0, vy: 0, tc: null, anchor: null }, keys: {}, link: null,
    paused: false, speed: 1, urlSpeed: 1, acc: 0, time: 0, shake: 0, flash: 0, parts: [], floats: [], toast: null,
    disp: { credits: 0, conf: 100, q: 0 }, cards: [], seen: {}, advice: null, adviceT: 0,
    settings: null, name: 'PLAYER', overTimer: 0, finale: null, ff: null, attract: null, notices: [],
  };

  G.HUD_H = 15;
  G.TICKER_H = 11;
  G.bottomH = () => G.TICKER_H;
  G.mapBottom = () => G.H - G.bottomH();

  /* ---------- layout: pick the largest integer device-pixel scale that keeps the logical view >= the minimum ---------- */
  G.layout = function () {
    if (!G.canvas) return;
    const dpr = G.dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const dw = Math.floor(globalThis.innerWidth * dpr), dh = Math.floor(globalThis.innerHeight * dpr);
    const mins = C.view.scales[(G.settings && G.settings.uiScale) || 'medium'] || C.view.scales.medium;
    let s = Math.max(1, Math.floor(Math.min(dw / mins[0], dh / mins[1])));
    // never go below 480x270 logical
    while (s > 1 && (Math.floor(dw / s) < C.view.minW || Math.floor(dh / s) < C.view.minH)) s--;
    G.scale = s;
    G.W = Math.max(C.view.minW, Math.floor(dw / s));
    G.H = Math.max(C.view.minH, Math.floor(dh / s));
    if (G.canvas.width !== G.W || G.canvas.height !== G.H) { G.canvas.width = G.W; G.canvas.height = G.H; }
    G.canvas.style.width = (G.W * s / dpr) + 'px';
    G.canvas.style.height = (G.H * s / dpr) + 'px';
    G.ctx.imageSmoothingEnabled = false;
    if (AS.Gal && AS.Gal.onResize) AS.Gal.onResize();
  };

  /* ---------- camera: smooth zoom (animated between whole-number levels), glides, momentum ---------- */
  // cam.z = target zoom level (whole number); cam.zr = zoom being drawn right now (animates towards cam.z).
  G.mapMidY = () => (G.HUD_H + G.mapBottom()) / 2;
  G.toWorld = (x, y) => ({ x: x / G.cam.zr + G.cam.x, y: y / G.cam.zr + G.cam.y });
  G.toScreen = (x, y) => ({ x: (x - G.cam.x) * G.cam.zr, y: (y - G.cam.y) * G.cam.zr });
  G.camCenter = () => ({ x: G.cam.x + G.W / 2 / G.cam.zr, y: G.cam.y + G.mapMidY() / G.cam.zr });
  G.setCenter = (cx, cy) => { G.cam.x = cx - G.W / 2 / G.cam.zr; G.cam.y = cy - G.mapMidY() / G.cam.zr; };
  G.clampCam = function () {
    const z = G.cam.zr, M = C.camera.margin;
    const vw = G.W / z, vh = (G.mapBottom() - G.HUD_H) / z;
    const cx = 0, cy = 0;
    const x0 = cx - 235 - M / z, x1 = cx + 235 + M / z - vw, y0 = cy - 140 - M / z - G.HUD_H / z, y1 = cy + 140 + M / z - vh;
    if (G.cam.x < x0 || G.cam.x > x1) G.cam.vx = 0;
    if (G.cam.y < y0 || G.cam.y > y1) G.cam.vy = 0;
    G.cam.x = x1 < x0 ? (x0 + x1) / 2 : U.clamp(G.cam.x, x0, x1);
    G.cam.y = y1 < y0 ? (y0 + y1) / 2 : U.clamp(G.cam.y, y0, y1);
  };
  G.stopCam = () => { G.cam.vx = 0; G.cam.vy = 0; G.cam.tc = null; G.cam.anchor = null; };
  /** Zoom to a whole-number level, keeping the point under (sx, sy) fixed while it animates. */
  G.zoomAt = function (sx, sy, z) {
    const Z = C.camera.zooms;
    z = U.clamp(Math.round(z), Z[0], Z[Z.length - 1]);
    if (z === G.cam.z) return;
    G.stopCam();
    G.cam.anchor = { w: G.toWorld(sx, sy), sx, sy };
    G.cam.z = z;
  };
  G.zoomStep = function (d, sx, sy) {
    G.zoomAt(sx === undefined ? G.W / 2 : sx, sy === undefined ? G.mapMidY() : sy, G.cam.z + d);
  };
  /** Zoom 1, centred on the galaxy core. */
  G.fitView = function (run, glide) {
    G.stopCam();
    G.cam.z = 1;
    G.cam.tc = { x: 0, y: 4 };
    if (!glide) G.snapCam();
  };
  /** Glide to a world point, optionally changing zoom. */
  G.focusOn = function (x, y, z) {
    G.cam.anchor = null; G.cam.vx = 0; G.cam.vy = 0;
    if (z) G.cam.z = U.clamp(Math.round(z), 1, 3);
    G.cam.tc = { x, y };
  };
  /** Jump straight to the target view with no animation. */
  G.snapCam = function () {
    G.cam.zr = G.cam.z;
    if (G.cam.tc) G.setCenter(G.cam.tc.x, G.cam.tc.y);
    G.cam.tc = null; G.cam.anchor = null;
    G.clampCam();
  };
  G.updateCam = function (dt) {
    const cam = G.cam, c = G.camCenter();
    if (cam.zr !== cam.z) {
      cam.zr += (cam.z - cam.zr) * (1 - Math.exp(-dt * 13));
      if (Math.abs(cam.z - cam.zr) < 0.004) cam.zr = cam.z;
    }
    if (cam.anchor) {
      cam.x = cam.anchor.w.x - cam.anchor.sx / cam.zr; cam.y = cam.anchor.w.y - cam.anchor.sy / cam.zr;
      if (cam.zr === cam.z) cam.anchor = null;
    } else if (cam.tc) {
      const k = 1 - Math.exp(-dt * C.camera.glide);
      const nx = c.x + (cam.tc.x - c.x) * k, ny = c.y + (cam.tc.y - c.y) * k;
      G.setCenter(nx, ny);
      if (Math.abs(cam.tc.x - nx) < 0.2 && Math.abs(cam.tc.y - ny) < 0.2 && cam.zr === cam.z) { G.setCenter(cam.tc.x, cam.tc.y); cam.tc = null; }
    } else G.setCenter(c.x, c.y);   // zooming via buttons/keys keeps the centre still
    if (cam.vx || cam.vy) {         // momentum after a flick
      cam.x += cam.vx * dt; cam.y += cam.vy * dt;
      const d = Math.exp(-dt * 4.2);
      cam.vx *= d; cam.vy *= d;
      if (Math.hypot(cam.vx, cam.vy) * cam.zr < 4) { cam.vx = 0; cam.vy = 0; }
    }
    G.clampCam();
  };

  /* ---------- drawing primitives ---------- */
  const D = AS.Draw = {};
  D.rect = (ctx, x, y, w, h, col) => { ctx.fillStyle = PAL[col]; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
  D.frame = function (ctx, x, y, w, h, fill, border) {
    ctx.fillStyle = PAL[border]; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAL[fill]; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  };
  D.dither = function (ctx, x, y, w, h, col, lvl) {
    ctx.fillStyle = PAL[col];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (U.bayer(xx, yy) < lvl) ctx.fillRect(xx, yy, 1, 1);
  };
  /** Flat translucent soot: dims what is behind without breaking pixel text into noise. */
  D.dim = function (ctx, x, y, w, h, a) { ctx.fillStyle = 'rgba(13,14,16,' + a + ')'; ctx.fillRect(x, y, w, h); };
  /** Riveted steel plate. */
  D.plate = function (ctx, x, y, w, h, fill) {
    D.frame(ctx, x, y, w, h, fill === undefined ? 2 : fill, 0);
    ctx.fillStyle = PAL[4]; ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = PAL[1]; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillStyle = PAL[5];
    for (const [px, py] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) ctx.fillRect(px, py, 1, 1);
    ctx.fillStyle = PAL[1];
    for (const [px, py] of [[x + 4, y + 4], [x + w - 3, y + 4], [x + 4, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(px, py, 1, 1);
  };
  D.hazard = function (ctx, x, y, w, h, col, phase) {
    col = col === undefined ? 13 : col;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      ctx.fillStyle = PAL[(((i + j + (phase | 0)) >> 2) & 1) ? col : 0];
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  };
  D.bar = function (ctx, x, y, w, h, frac, col, back) {
    D.frame(ctx, x, y, w, h, back === undefined ? 1 : back, 0);
    const fw = Math.round(U.clamp(U.fin(frac), 0, 1) * (w - 2));
    if (fw > 0) { ctx.fillStyle = PAL[col]; ctx.fillRect(x + 1, y + 1, fw, h - 2); }
    // tick marks every quarter so the level reads without colour
    ctx.fillStyle = PAL[0];
    for (let k = 1; k < 4; k++) ctx.fillRect(x + Math.round(w * k / 4), y + h - 2, 1, 1);
  };
  D.text = (ctx, s, x, y, col, o) => AS.Font.draw(ctx, s, x, y, col, o);
  D.tw = (s, big, sc) => AS.Font.width(s, big, sc);

  /* ---------- immediate-mode UI ---------- */
  G.pointIn = (m, x, y, w, h) => m.inside && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
  G.tip = function (x, y, w, h, text) { if (G.settings && G.settings.tips && text) G.tipRegions.push({ x, y, w, h, text }); };
  /** Region that swallows clicks (panels), so clicks do not fall through to the map. */
  G.block = (x, y, w, h) => G.btns.push({ x, y, w, h, fn: () => {} });
  /**
   * Button with a depressed state. opt: disabled, active, col, tip, big, key (shortcut label), onDisabled, fill
   */
  G.button = function (ctx, x, y, w, h, label, fn, opt) {
    opt = opt || {};
    const hov = !opt.disabled && G.pointIn(G.mouse, x, y, w, h);
    const pr = G.pressed && G.pressed.x === x && G.pressed.y === y && G.pressed.t > G.time;
    const dy = pr ? 1 : 0;
    ctx.fillStyle = PAL[0]; ctx.fillRect(x, y + 1, w, h);
    const fill = opt.disabled ? 2 : opt.active ? 11 : opt.primary ? (hov ? 13 : 12) : hov ? 4 : 3;
    D.frame(ctx, x, y + dy, w, h, fill, 0);
    if (!pr) { ctx.fillStyle = PAL[opt.active ? 12 : opt.primary ? 14 : hov ? 5 : 4]; ctx.fillRect(x + 1, y + 1, w - 2, 1); }
    const tc = opt.disabled ? 4 : opt.primary ? 0 : opt.active ? 31 : (opt.col || 7);
    const fh = opt.big ? 7 : 5;
    D.text(ctx, label, x + w / 2, y + dy + Math.floor((h - fh) / 2) + (pr ? 0 : 0), tc, { align: 'center', shadow: !opt.primary && !opt.disabled, big: opt.big });
    G.btns.push({ x, y, w, h, fn: opt.disabled ? (opt.onDisabled || (() => AS.Sfx && AS.Sfx.play('err'))) : fn, press: !opt.disabled, label: String(label) });
    if (opt.tip) G.tip(x, y, w, h, opt.tip);
  };
  G.buttonAt = function (x, y) {
    for (let i = G.btns.length - 1; i >= 0; i--) { const b = G.btns[i]; if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b; }
    return null;
  };

  G.drawTooltip = function (ctx, dt) {
    if (!G.settings.tips || !G.mouse.inside || G.drag || G.pan || G.touch) { G.tipHover.t = 0; return; }
    let reg = null;
    for (let i = G.tipRegions.length - 1; i >= 0; i--) {
      const r = G.tipRegions[i];
      if (G.mouse.x >= r.x && G.mouse.x < r.x + r.w && G.mouse.y >= r.y && G.mouse.y < r.y + r.h) { reg = r; break; }
    }
    if (!reg) { G.tipHover = { text: '', t: 0 }; return; }
    if (reg.text !== G.tipHover.text) G.tipHover = { text: reg.text, t: 0 };
    G.tipHover.t += dt;
    if (G.tipHover.t < C.camera.tipDelay) return;
    const lines = U.wrapText(reg.text, 36);
    const w = Math.max(...lines.map(l => D.tw(l))) + 9, h = lines.length * 7 + 6;
    let x = Math.round(G.mouse.x + 9), y = Math.round(G.mouse.y + 10);
    if (x + w > G.W - 2) x = Math.round(G.mouse.x - w - 5);
    if (y + h > G.H - 2) y = Math.round(G.mouse.y - h - 5);
    x = U.clamp(x, 2, G.W - w - 2); y = U.clamp(y, 2, G.H - h - 2);
    D.frame(ctx, x, y, w, h, 1, 12);
    ctx.fillStyle = PAL[12]; ctx.fillRect(x + 1, y + 1, 2, h - 2);
    lines.forEach((l, i) => D.text(ctx, l, x + 5, y + 3 + i * 7, 31, { shadow: false }));
  };

  G.toast = null;
  G.showToast = function (text, col) { G.toast = { text: String(text).toUpperCase(), col: col === undefined ? 18 : col, t: 2.6 }; };
})(globalThis.AS = globalThis.AS || {});
