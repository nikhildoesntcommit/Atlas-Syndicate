/* ATLAS SYNDICATE v4 — render/core.js
   Client state (AS.G), the integer-scaled adaptive layout, the camera and immediate-mode UI primitives. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE;

  const G = AS.G = {
    canvas: null, ctx: null, W: 480, H: 270, scale: 1, dpr: 1,
    mode: 'boot', screen: null, screenT: 0, run: null, demo: null, demoBot: null, demoAcc: 0, demoEndAt: 0,
    sel: null, selT: 0, drag: null, pan: null, pinch: null, popup: null, pointers: new Map(),
    mouse: { x: -99, y: -99, inside: false, down: false }, wm: { x: -99, y: -99 }, touch: false,
    btns: [], tipRegions: [], tipHover: { text: '', t: 0 }, pressed: null, focusField: null,
    cam: { x: 0, y: 0, z: 1, gx: null, gy: null }, keys: {},
    paused: false, speed: 1, urlSpeed: 1, acc: 0, time: 0, shake: 0, flash: 0, parts: [], floats: [], toast: null,
    disp: { credits: 0, conf: 100, q: 0 }, cards: [], seen: {}, advice: null, adviceT: 0,
    settings: null, name: 'PLAYER', overTimer: 0, finale: null, ff: null, attract: null, notices: [],
  };

  G.HUD_H = 15;
  G.CONSOLE_H = 74;
  G.TICKER_H = 12;
  /** Height of the bottom panel right now (animated). */
  G.bottomH = () => Math.round(G.TICKER_H + (G.CONSOLE_H - G.TICKER_H) * U.easeOut(U.clamp(G.selT, 0, 1)));
  G.mapBottom = () => G.H - G.bottomH();

  /* ---------- layout: pick the largest integer device-pixel scale that keeps the logical view >= the minimum ---------- */
  G.layout = function () {
    if (!G.canvas) return;
    const dpr = G.dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const dw = Math.floor(globalThis.innerWidth * dpr), dh = Math.floor(globalThis.innerHeight * dpr);
    const mins = C.view.scales[(G.settings && G.settings.uiScale) || 'large'] || C.view.scales.large;
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
    if (AS.World && AS.World.onResize) AS.World.onResize();
  };

  /* ---------- camera ---------- */
  G.toWorld = (x, y) => ({ x: x / G.cam.z + G.cam.x, y: y / G.cam.z + G.cam.y });
  G.toScreen = (x, y) => ({ x: (x - G.cam.x) * G.cam.z, y: (y - G.cam.y) * G.cam.z });
  G.clampCam = function () {
    const z = G.cam.z, M = C.camera.margin;
    const vw = G.W / z, vh = (G.mapBottom() - G.HUD_H) / z;
    const cx = C.map.cx, cy = C.map.cy;
    G.cam.x = U.clamp(G.cam.x, cx - 260 - M / z, cx + 260 + M / z - vw);
    G.cam.y = U.clamp(G.cam.y, cy - 120 - M / z - G.HUD_H / z, cy + 120 + M / z - vh);
  };
  G.zoomAt = function (sx, sy, z) {
    const Z = C.camera.zooms;
    z = U.clamp(Math.round(z), Z[0], Z[Z.length - 1]);
    if (z === G.cam.z) return;
    const w = G.toWorld(sx, sy);
    G.cam.z = z;
    G.cam.x = w.x - sx / z; G.cam.y = w.y - sy / z;
    G.cam.gx = null; G.cam.gy = null;
    G.clampCam();
  };
  G.zoomStep = function (d, sx, sy) {
    G.zoomAt(sx === undefined ? G.W / 2 : sx, sy === undefined ? (G.HUD_H + G.mapBottom()) / 2 : sy, G.cam.z + d);
  };
  /** Zoom that fits every discovered world, centred on the star. */
  G.fitView = function (run, glide) {
    let ext = 60;
    if (run) for (const b of run.bodies) if (b.found) ext = Math.max(ext, b.r + b.size + 10);
    const mapH = G.mapBottom() - G.HUD_H - 8;
    let z = 1;
    for (const zz of C.camera.zooms) if (ext * 2 * zz <= G.W - 16 && ext * 2 * C.map.tilt * zz + 30 <= mapH) z = zz;
    G.cam.z = z;
    const tx = C.map.cx - G.W / 2 / z, ty = C.map.cy - (G.HUD_H + mapH / 2 + 4) / z;
    if (glide) { G.cam.gx = tx; G.cam.gy = ty; } else { G.cam.x = tx; G.cam.y = ty; G.cam.gx = null; }
  };
  G.focusOn = function (x, y, z) {
    if (z) G.cam.z = U.clamp(z, 1, 4);
    G.cam.gx = x - G.W / 2 / G.cam.z;
    G.cam.gy = y - (G.HUD_H + G.mapBottom()) / 2 / G.cam.z;
  };
  G.updateCam = function (dt) {
    if (G.cam.gx === null || G.cam.gx === undefined) return;
    const k = 1 - Math.exp(-dt * C.camera.glide);
    G.cam.x += (G.cam.gx - G.cam.x) * k; G.cam.y += (G.cam.gy - G.cam.y) * k;
    if (Math.abs(G.cam.gx - G.cam.x) < 0.3 && Math.abs(G.cam.gy - G.cam.y) < 0.3) { G.cam.x = G.cam.gx; G.cam.y = G.cam.gy; G.cam.gx = null; }
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
