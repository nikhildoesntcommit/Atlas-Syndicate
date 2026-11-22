/* ATLAS SYNDICATE v4 — render/world.js
   Everything inside the camera: backdrop, parallax stars, orbits, asteroid belt, worlds, routes,
   freighters with engine trails, the megaproject structure, and screen-space world labels. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw, TAU = U.TAU;
  const W = AS.World = { bg: null, stars: [], belt: [], orbitKey: '', orbit: null };
  const CX = C.map.cx, CY = C.map.cy, TILT = C.map.tilt;

  /* ---------- backdrop & stars ---------- */
  W.onResize = function () {
    const w = G.W, h = G.H;
    const c = AS.Spr.mkCanvas(w, h), x = c.getContext('2d');
    const img = x.createImageData(w, h), d = img.data;
    const vn = (px, py, cell, s) => {
      const gx = px / cell, gy = py / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = U.smooth(gx - x0), fy = U.smooth(gy - y0), v = (i, j) => U.hash2(x0 + i, y0 + j, s);
      return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy;
    };
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const n = vn(xx, y, 46, 11) * 0.6 + vn(xx, y, 15, 12) * 0.4;
      const band = 1 - Math.abs((y - xx * 0.25 - 10) / (130 * h / 270));
      const v = n * 0.75 + band * 0.35 + (U.bayer(xx, y) / 16 - 0.5) * 0.12;
      const col = v > 0.9 ? 9 : v > 0.8 ? 8 : v > 0.68 ? 1 : 0;
      const p = (y * w + xx) * 4, rgb = AS.PAL_RGB[col];
      d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    W.bg = c;
    const sr = U.rng(1234);
    W.stars = [];
    const n = Math.round(w * h / 800);
    for (let i = 0; i < n; i++) {
      const layer = i < n * 0.6 ? 0 : i < n * 0.88 ? 1 : 2;
      W.stars.push({ x: sr() * w, y: sr() * h, layer, tw: sr() * TAU, col: [[2, 3], [4, 5], [6, 7]][layer][sr() < 0.5 ? 0 : 1] });
    }
  };
  W.drawSpace = function (ctx, time) {
    if (!W.bg) W.onResize();
    ctx.drawImage(W.bg, 0, 0);
    const w = G.W, h = G.H;
    for (const s of W.stars) {
      const par = [0.06, 0.15, 0.3][s.layer];
      let x = (s.x - time * [0.4, 1.0, 2.2][s.layer] - G.cam.x * par * G.cam.zr) % w; if (x < 0) x += w;
      let y = (s.y - G.cam.y * par * G.cam.zr) % h; if (y < 0) y += h;
      ctx.fillStyle = PAL[Math.sin(time * 1.3 + s.tw) > 0.94 ? 7 : s.col];
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  };

  /* ---------- orbits & belt ---------- */
  function orbitLayer(run, time) {
    const key = run.seed + ':' + run.bodies.filter(b => b.found).map(b => b.id).join(',') + ':' + run.bodies.filter(b => b.claimed).length;
    if (W.orbitKey === key && W.orbit) return W.orbit;
    const P = AS.Spr.Painter(560, 260);
    for (const b of run.bodies) {
      if (!b.found || b.site || run.t - b.foundAt < 2.5 && b.foundAt > 0) continue;
      const n = Math.round(b.r * 2.4);
      for (let i = 0; i < n; i++) {
        if (i % 3 === 2) continue;
        const a = i / n * TAU;
        P.px(Math.round(CX + 40 + b.r * Math.cos(a)), Math.round(CY + b.r * Math.sin(a) * TILT), b.prime ? 4 : b.claimed ? 3 : 2);
      }
    }
    W.orbit = P.c; W.orbitKey = key;
    return P.c;
  }
  function drawBelt(ctx, run, time) {
    if (!W.belt.length || W.beltSeed !== run.seed + ':' + run.sys) {
      const r = U.rng((run.seed + run.sys * 977) ^ 55);
      W.belt = [];
      for (let i = 0; i < 300; i++) W.belt.push({ a: r() * TAU, dr: (r() - 0.5) * 16, s: r() < 0.12 ? 2 : 1, c: r() < 0.3 ? 5 : r() < 0.6 ? 4 : 3, w: 0.8 + r() * 0.4 });
      W.beltSeed = run.seed + ':' + run.sys;
    }
    const om = TAU / C.map.primePeriod * Math.pow(C.map.refRadius / run.beltR, 1.5);
    for (const k of W.belt) {
      const a = k.a + om * k.w * (run.t + time * 0.4), rr = run.beltR + k.dr;
      ctx.fillStyle = PAL[k.c];
      ctx.fillRect(Math.round(CX + rr * Math.cos(a)), Math.round(CY + rr * Math.sin(a) * TILT), k.s, k.s > 1 ? 1 : 1);
    }
  }

  /* ---------- routes ---------- */
  function beam(x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const pts = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    while (guard++ < 1500) {
      pts.push(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return { pts, steep: dx < -dy };
  }
  const RAIL = { normal: [0, 4, 6], idle: [0, 3, 4], selected: [0, 12, 13], halted: [0, 16, 17], valid: [0, 12, 14], invalid: [0, 16, 17], site: [0, 11, 13] };
  W.drawRail = function (ctx, x0, y0, x1, y1, style, time) {
    const { pts, steep } = beam(x0, y0, x1, y1);
    const ox = steep ? 1 : 0, oy = steep ? 0 : 1;
    const [sh, rail, dash] = RAIL[style] || RAIL.normal;
    ctx.fillStyle = PAL[sh];
    for (let i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i] + ox, pts[i + 1] + oy + 1, 1, 1);
    const moving = style === 'selected' || style === 'site' || style === 'valid';
    const phase = moving ? Math.floor(time * 10) : 0;
    for (let i = 0; i < pts.length; i += 2) {
      const k = i >> 1;
      ctx.fillStyle = PAL[rail];
      ctx.fillRect(pts[i], pts[i + 1], 1, 1);
      if (((k + phase) >> 2) & 1) { ctx.fillStyle = PAL[dash]; ctx.fillRect(pts[i] - ox, pts[i + 1] - oy, 1, 1); }
    }
    if (style === 'halted') {   // X marks: a halted route never relies on colour alone
      const n = pts.length >> 1;
      for (const f of [0.33, 0.66]) {
        const i = Math.floor(n * f) * 2, x = pts[i], y = pts[i + 1];
        ctx.fillStyle = PAL[17];
        for (let d = -2; d <= 2; d++) { ctx.fillRect(x + d, y + d, 1, 1); ctx.fillRect(x + d, y - d, 1, 1); }
      }
    }
  };
  function routeStyle(run, r) {
    if (G.sel && G.sel.kind === 'route' && G.sel.id === r.id && run === G.run) return 'selected';
    if (r.halted > 0 || run.flareT > 0) return 'halted';
    const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
    if ((A && A.site) || (B && B.site)) return 'site';
    return S.routeFreighters(run, r).length ? 'normal' : 'idle';
  }

  /* ---------- freighters ---------- */
  W.freighterPos = function (run, f, time) {
    const r = S.getRoute(run, f.route);
    if (!r) return null;
    if (f.state === 'transit') {
      const A = S.getBody(run, f.from), B = S.getBody(run, f.to);
      if (!A || !B) return null;
      const p = U.clamp(f.prog, 0, 1);
      const t = p + (U.easeInOut(p) - p) * 0.7;   // gentle acceleration away and braking on arrival
      const off = (A.size + 3) / Math.max(1, Math.hypot(B.sx - A.sx, B.sy - A.sy));
      const tt = off + t * (1 - 2 * off);
      return { x: A.sx + (B.sx - A.sx) * tt, y: A.sy + (B.sy - A.sy) * tt, flip: B.sx < A.sx ? 1 : 0, moving: true, ang: Math.atan2(B.sy - A.sy, B.sx - A.sx) };
    }
    const A = S.getBody(run, f.at), O = S.getBody(run, f.at === r.a ? r.b : r.a);
    if (!A || !O) return null;
    const dx = O.sx - A.sx, dy = O.sy - A.sy, d = Math.hypot(dx, dy) || 1, off = A.size + 5 + (f.id % 3) * 3;
    const bob = Math.sin(time * 2 + f.id) * 0.6;
    return { x: A.sx + dx / d * off, y: A.sy + dy / d * off + bob, flip: dx < 0 ? 1 : 0, moving: false };
  };

  /* ---------- bodies ---------- */
  W.bodyAt = function (run, wx, wy) {
    let best = null, bd = Infinity;
    for (const b of run.bodies) {
      if (!b.found) continue;
      const d = Math.hypot(wx - b.sx, wy - b.sy);
      const reach = b.site ? 24 : b.size + 3 + 5 / G.cam.zr + (G.touch ? 6 / G.cam.zr : 0);
      if (d <= reach && d < bd) { bd = d; best = b; }
    }
    return best;
  };
  W.routeAt = function (run, wx, wy) {
    let best = null, bd = 3.5 / G.cam.zr + 0.5 + (G.touch ? 4 / G.cam.zr : 0);
    for (const r of run.routes) {
      const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
      if (!A || !B) continue;
      const d = U.distToSeg(wx, wy, A.sx, A.sy, B.sx, B.sy);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  W.hoverBody = run => (G.mouse.inside && G.mouse.y < G.mapBottom() && G.mouse.y > G.HUD_H ? W.bodyAt(run, G.wm.x, G.wm.y) : null);

  function brackets(ctx, x, y, e, col) {
    ctx.fillStyle = PAL[col];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = Math.round(x + sx * e), cy = Math.round(y + sy * e);
      ctx.fillRect(sx < 0 ? cx : cx - 2, cy, 3, 1);
      ctx.fillRect(cx, sy < 0 ? cy : cy - 2, 1, 3);
    }
  }
  function drawBody(ctx, run, b, time, interactive) {
    if (b.site) return W.drawGate(ctx, run, b, time);
    const lights = b.claimed ? U.clamp(b.pop / 40, 0.15, 1) : 0;
    const spr = AS.Spr.planet(b, time, lights), R = b.size + 1;
    const age = b.foundAt > 0 ? run.t - b.foundAt : 99;
    if (b.kind === 'gas') AS.Spr.drawRing(ctx, b, false);
    if (age < 1.2) {   // materialise on discovery: dithered fade-in
      const lvl = Math.floor(age / 1.2 * 16);
      ctx.save(); ctx.beginPath();
      for (let y = 0; y < R * 2 + 1; y++) for (let x = 0; x < R * 2 + 1; x++) if (U.bayer(x, y) < lvl) ctx.rect(Math.round(b.sx - R) + x, Math.round(b.sy - R) + y, 1, 1);
      ctx.clip(); ctx.drawImage(spr, Math.round(b.sx - R), Math.round(b.sy - R)); ctx.restore();
    } else ctx.drawImage(spr, Math.round(b.sx - R), Math.round(b.sy - R));
    if (b.kind === 'gas') AS.Spr.drawRing(ctx, b, true);
    if (b.claimed) {   // claim beacon: steel mast with a blinking lamp
      const sx = Math.round(b.sx + b.size), sy = Math.round(b.sy - b.size - 1);
      ctx.fillStyle = PAL[0]; ctx.fillRect(sx - 1, sy - 1, 3, 5);
      ctx.fillStyle = PAL[5]; ctx.fillRect(sx, sy, 1, 3);
      ctx.fillStyle = PAL[Math.floor(time * 1.5 + b.id) % 2 ? 13 : 11]; ctx.fillRect(sx, sy - 1, 1, 1);
      if (b.fac.some(f => f && f.build > 0) && Math.random() < 0.35) W.spark(run, b.sx + (Math.random() - 0.5) * b.size * 1.4, b.sy - b.size * 0.4 + (Math.random() - 0.5) * b.size, 3);
    }
    const sel = interactive && G.sel && G.sel.kind === 'body' && G.sel.id === b.id;
    const hov = interactive && W.hoverBody(run) === b;
    const adv = interactive && G.settings.tips && G.advice && G.advice.id === b.id && !sel;
    if (sel || hov || adv) brackets(ctx, b.sx, b.sy, b.size + 4 + (sel ? Math.floor(time * 3) % 2 : 0), sel ? 13 : adv ? (Math.floor(time * 2) % 2 ? 12 : 10) : 6);
  }

  /* ---------- the megaproject structure ---------- */
  W.drawGate = function (ctx, run, b, time) {
    const cx = Math.round(b.sx), cy = Math.round(b.sy), R = 20, N = 28;
    const st = run.mega.stage, done = run.mega.state === 'done';
    const fin = G.finale && G.finale.run === run ? G.finale : null;
    const frameFrac = st > 0 || done ? 1 : S.stageFraction(run);
    const plateFrac = st > 1 || done ? 1 : st === 1 ? S.stageFraction(run) : 0;
    const lampFrac = done ? 1 : st === 2 ? S.stageFraction(run) : 0;
    const spin = fin ? fin.t * fin.t * 0.6 : 0;
    // inner vortex once complete
    if (done || fin) {
      const k = fin ? U.clamp(fin.t / 2.5, 0, 1) : 1;
      for (let y = -R + 3; y <= R - 3; y++) for (let x = -R + 3; x <= R - 3; x++) {
        const d = Math.hypot(x, y) / (R - 3);
        if (d > k) continue;
        const a = Math.atan2(y, x) + time * 2.2 - d * 5;
        const v = (Math.sin(a * 3) * 0.5 + 0.5) * (1 - d) + U.bayer(x + cx, y + cy) / 32;
        ctx.fillStyle = PAL[v > 0.75 ? 31 : v > 0.55 ? 14 : v > 0.38 ? 13 : v > 0.22 ? 12 : v > 0.1 ? 11 : 9];
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    } else {
      ctx.fillStyle = PAL[1];
      for (let y = -R + 4; y <= R - 4; y += 2) for (let x = -R + 4; x <= R - 4; x += 2) if (x * x + y * y < (R - 4) * (R - 4) && U.bayer(x + cx, y + cy) < 3) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU + spin, a2 = (i + 1) / N * TAU + spin;
      const x0 = cx + Math.cos(a) * R, y0 = cy + Math.sin(a) * R;
      const built = i / N < frameFrac;
      if (!built) { if (i % 2 === 0) { ctx.fillStyle = PAL[3]; ctx.fillRect(Math.round(x0), Math.round(y0), 1, 1); } continue; }
      const plated = i / N < plateFrac;
      // segment: two-pixel girder, plated segments get rust/steel skin
      for (let s = 0; s <= 4; s++) {
        const t = s / 4, x = Math.round(x0 + (Math.cos(a2) * R + cx - x0) * t), y = Math.round(y0 + (Math.sin(a2) * R + cy - y0) * t);
        ctx.fillStyle = PAL[plated ? (i % 3 === 0 ? 10 : 6) : 5]; ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = PAL[plated ? 11 : 4]; ctx.fillRect(x + 1, y + 1, 1, 1);
      }
      if (!plated && i % 2 === 0) { ctx.fillStyle = PAL[4]; ctx.fillRect(Math.round(cx + Math.cos(a) * (R - 3)), Math.round(cy + Math.sin(a) * (R - 3)), 1, 1); }
      if (i % 4 === 0) {   // coil lamps (stage 3)
        const lit = i / N < lampFrac;
        const lx = Math.round(cx + Math.cos(a) * (R + 3)), ly = Math.round(cy + Math.sin(a) * (R + 3));
        ctx.fillStyle = PAL[0]; ctx.fillRect(lx - 1, ly - 1, 3, 3);
        ctx.fillStyle = PAL[lit ? (Math.floor(time * 4 + i) % 3 ? 13 : 14) : 3]; ctx.fillRect(lx, ly, 1, 1);
      }
    }
    // construction gantry & sparks while active
    if (run.mega.state === 'active') {
      ctx.fillStyle = PAL[4]; ctx.fillRect(cx - 1, cy + R + 2, 3, 6); ctx.fillRect(cx - 6, cy + R + 7, 13, 1);
      if (Math.random() < 0.5) {
        const a = frameFrac * TAU + (st > 0 ? plateFrac * TAU : 0);
        W.spark(run, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4);
      }
    }
    const sel = G.sel && G.sel.kind === 'body' && G.sel.id === b.id;
    if (sel) brackets(ctx, cx, cy, R + 6, 13);
  };

  /* ---------- particles (world space) ---------- */
  W.spark = function (run, x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 8 + Math.random() * 18;
      G.parts.push({ run, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, life: 0.3 + Math.random() * 0.35, max: 0.6, cols: [14, 13, 12, 11], g: 60, s: 1 });
    }
  };
  W.burst = function (run, x, y, n, cols, spread, up, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = Math.random() * spread;
      const l = (life || 0.8) * (0.6 + Math.random() * 0.7);
      G.parts.push({ run, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - (up || 0), life: l, max: l, cols, s: Math.random() < 0.2 ? 2 : 1, g: 18 });
    }
    if (G.parts.length > 1400) G.parts.splice(0, G.parts.length - 1400);
  };
  W.ring = function (run, x, y, r0, r1, dur, col) { G.parts.push({ run, ring: true, x, y, r0, r1, life: dur, max: dur, cols: [col] }); };

  /* ---------- the world pass ---------- */
  W.drawWorld = function (ctx, run, time, interactive) {
    ctx.drawImage(orbitLayer(run, time), -40, 0);
    // orbits of fresh discoveries sweep in
    for (const b of run.bodies) {
      if (!b.found || b.site || b.foundAt <= 0) continue;
      const age = run.t - b.foundAt;
      if (age >= 2.5) continue;
      const n = Math.round(b.r * 2.4), upto = Math.floor(n * U.easeOut(age / 2.5));
      ctx.fillStyle = PAL[12];
      for (let i = 0; i < upto; i++) { if (i % 3 === 2) continue; const a = b.phase + b.omega * run.t + i / n * TAU; ctx.fillRect(Math.round(CX + b.r * Math.cos(a)), Math.round(CY + b.r * Math.sin(a) * TILT), 1, 1); }
    }
    drawBelt(ctx, run, time);
    for (const r of run.routes) { const A = S.getBody(run, r.a), B = S.getBody(run, r.b); if (A && B) W.drawRail(ctx, A.sx, A.sy, B.sx, B.sy, routeStyle(run, r), time); }
    if (interactive && G.link) {   // NEW ROUTE: a line follows the cursor until you click the other world
      const a = S.getBody(run, G.link.from), t = W.bodyAt(run, G.wm.x, G.wm.y);
      if (a) {
        const ok = t && t !== a && t.claimed && !S.routeBetween(run, a, t) && run.credits >= S.routeCost(a, t);
        W.drawRail(ctx, a.sx, a.sy, t && t !== a ? t.sx : G.wm.x, t && t !== a ? t.sy : G.wm.y, !t || t === a ? 'valid' : ok ? 'valid' : 'invalid', time);
      } else G.link = null;
    }
    const vis = run.bodies.filter(b => b.found);
    const back = vis.filter(b => b.z < 0).sort((p, q) => p.z - q.z), front = vis.filter(b => b.z >= 0).sort((p, q) => p.z - q.z);
    for (const b of back) drawBody(ctx, run, b, time, interactive);
    ctx.drawImage(AS.Spr.star, CX - 20, CY - 20);
    const fl = Math.floor(time * 3);
    for (let k = 0; k < 4; k++) {   // corona flicker, dithered pixels only
      const a = ((fl + k * 7) * 2.399) % TAU, rr = 12 + ((fl + k) % 5);
      ctx.fillStyle = PAL[k === 0 ? 18 : k === 1 ? 13 : 12];
      ctx.fillRect(Math.round(CX + Math.cos(a) * rr), Math.round(CY + Math.sin(a) * rr), 1, 1);
    }
    for (const b of front) drawBody(ctx, run, b, time, interactive);
    const cap = S.capacity(run);
    for (const f of run.freighters) {
      if (!f.route) continue;
      const p = W.freighterPos(run, f, time);
      if (!p) continue;
      const r = S.getRoute(run, f.route), frozen = (r && r.halted > 0) || run.flareT > 0;
      const frame = p.moving && !frozen ? (Math.floor(time * 12 + f.id) & 1) : 1;
      const x = Math.round(p.x) - 8, y = Math.round(p.y) - 3;
      AS.Spr.drawFreighter(ctx, x, y, p.flip, frame, f.cargo, f.load, cap);
      if (p.moving && !frozen && Math.random() < 0.7) {
        const ex = p.x - Math.cos(p.ang) * 8, ey = p.y - Math.sin(p.ang) * 4;
        G.parts.push({ run, x: ex + (Math.random() - 0.5), y: ey + (Math.random() - 0.5), vx: -Math.cos(p.ang) * 4, vy: -Math.sin(p.ang) * 2, life: 0.7, max: 0.7, cols: [13, 12, 11, 10, 9, 3], s: 1, g: 0 });
      }
    }
    for (const pt of G.parts) {
      if (pt.run !== run) continue;
      const k = 1 - pt.life / pt.max;
      if (pt.ring) {
        const rr = pt.r0 + (pt.r1 - pt.r0) * U.easeOut(k), n = Math.max(12, Math.round(rr * 4));
        ctx.fillStyle = PAL[pt.cols[0]];
        for (let i = 0; i < n; i++) if ((i + Math.floor(k * 8)) % 3) { const a = i / n * TAU; ctx.fillRect(Math.round(pt.x + Math.cos(a) * rr), Math.round(pt.y + Math.sin(a) * rr * (pt.flat || 1)), 1, 1); }
        continue;
      }
      ctx.fillStyle = PAL[pt.cols[Math.min(pt.cols.length - 1, Math.floor(k * pt.cols.length))]];
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.s, pt.s);
    }
  };

  /* ---------- screen-space overlay: labels, warnings, off-screen markers, floats ---------- */
  W.drawOverlay = function (ctx, run, time, interactive) {
    const placed = [];
    const top = G.HUD_H + 1, bottom = G.mapBottom();
    const rank = b => (interactive && G.sel && G.sel.kind === 'body' && G.sel.id === b.id ? 4 : 0) + (b.claimed ? 2 : 0) + (b.prime || b.site ? 1 : 0);
    const hb = interactive ? W.hoverBody(run) : null;
    for (const b of run.bodies.filter(x => x.found).sort((p, q) => rank(q) - rank(p))) {
      const s = G.toScreen(b.sx, b.sy);
      const rad = (b.site ? 26 : b.size + 4) * G.cam.zr;
      if (s.x < -60 || s.x > G.W + 60 || s.y < top - 30 || s.y > bottom + 20) {
        if (b.foundAt > 0 && run.t - b.foundAt < 20 && interactive) drawEdgeMarker(ctx, s, b, time);
        continue;
      }
      const sel = interactive && G.sel && G.sel.kind === 'body' && G.sel.id === b.id;
      const lab = b.claimed && !b.site ? b.name + ' ' + Math.floor(b.pop) : b.name;
      const w = D.tw(lab), x = Math.round(s.x - w / 2), y = Math.round(s.y + rad);
      const rect = [x - 1, y - 1, x + w + 1, y + 6];
      const hit = placed.some(r => !(rect[2] < r[0] || rect[0] > r[2] || rect[3] < r[1] || rect[1] > r[3]));
      if (!(hit && !sel && hb !== b) && y < bottom - 6 && y > top) {
        placed.push(rect);
        if (b.claimed || sel || hb === b || b.prime) D.text(ctx, lab, s.x, y, sel ? 13 : b.site ? 13 : b.claimed ? 7 : 6, { align: 'center' });
        else D.text(ctx, lab, s.x, y, 5, { align: 'center', shadow: true, shadowCol: 0 });
        if (b.traits && b.traits.length && G.cam.z >= 2) {
          const tl = b.traits.map(t => AS.TRAITS[t].short).join(' ');
          D.text(ctx, tl, s.x, y + 7, 29, { align: 'center' });
        }
      }
      if (b.claimed && b.starving) {   // hunger: icon + word + flash, never colour alone
        const yy = Math.round(s.y - rad - 9);
        if (Math.floor(time * 3) % 2 === 0) { ctx.drawImage(AS.Spr.goods.food, Math.round(s.x - 17), yy); D.text(ctx, 'HUNGER', s.x + 3, yy, 17, { align: 'center' }); }
      }
      if (b.foundAt > 0 && run.t - b.foundAt < 6) {   // discovery ping
        const k = ((run.t - b.foundAt) % 1.5) / 1.5, rr = Math.round(rad + k * 22);
        ctx.fillStyle = PAL[13];
        for (let i = 0; i < 24; i++) if (i % 2) { const a = i / 24 * TAU; ctx.fillRect(Math.round(s.x + Math.cos(a) * rr), Math.round(s.y + Math.sin(a) * rr * 0.6), 1, 1); }
        if (Math.floor(time * 3) % 2) D.text(ctx, 'NEW', s.x, Math.round(s.y - rad - 9), 13, { align: 'center' });
      }
      const pend = run.pending.find(p => p.kind === 'meteor' && p.id === b.id);
      if (pend) {
        const left = Math.ceil(pend.at - run.t);
        D.hazard(ctx, Math.round(s.x - 16), Math.round(s.y - rad - 12), 32, 2, 17, time * 12);
        D.text(ctx, 'IMPACT ' + left, s.x, Math.round(s.y - rad - 9), Math.floor(time * 4) % 2 ? 17 : 13, { align: 'center' });
        if (interactive) {
          const cost = S.deflectCost(run);
          G.button(ctx, Math.round(s.x - 30), Math.round(s.y - rad - 26), 60, 11, 'DEFLECT ' + cost, () => AS.Act.deflect(b), { primary: run.credits >= cost, disabled: run.credits < cost, tip: 'SHOOT DOWN THE METEOR BEFORE IT HITS. COSTS ' + cost + ' CREDITS.' });
        }
      }
      if (interactive) {
        const deps = ['ore', 'ice', 'gas'].filter(k => b.dep[k]).map(k => AS.GOODS[k].name + ' ' + b.dep[k].toFixed(1)).join(', ');
        const tr = (b.traits || []).map(t => AS.TRAITS[t].name + ': ' + AS.TRAITS[t].desc).join(' ');
        G.tip(s.x - rad, s.y - rad, rad * 2, rad * 2, b.site
          ? AS.CONFIG.mega.name + ': DELIVER THE GOODS EACH STAGE NEEDS. FINISH IT TO WARP TO THE NEXT SYSTEM. CLICK FOR PROGRESS.'
          : b.claimed
            ? b.name + ': ' + Math.floor(b.pop) + '/' + S.housing(run, b) + ' COLONISTS, ' + (b.starving ? 'STARVING!' : 'FED') + '. CLICK TO MANAGE IT. ' + tr
            : b.name + ' (' + b.blurb + '): ' + (deps || 'NO DEPOSITS') + '. CLICK TO SURVEY AND CLAIM. ' + tr);
      }
    }
    if (interactive) {
      const r = !hb && G.mouse.y < bottom && G.mouse.y > top ? W.routeAt(run, G.wm.x, G.wm.y) : null;
      if (r) G.tip(G.mouse.x - 3, G.mouse.y - 3, 6, 6, 'ROUTE ' + S.getBody(run, r.a).name + ' - ' + S.getBody(run, r.b).name + ': ' + S.routeFreighters(run, r).length + ' FREIGHTERS. CLICK TO MANAGE IT.');
    }
    for (const fl of G.floats) if (fl.run === run) {
      const s = G.toScreen(fl.x, fl.y);
      const k = fl.t / fl.max;
      if (s.y > top && s.y < bottom) D.text(ctx, fl.text, s.x, s.y - (1 - k) * 12, fl.col, { align: 'center', big: fl.big });
    }
    if (interactive && G.link) {
      const a = S.getBody(run, G.link.from), t = W.bodyAt(run, G.wm.x, G.wm.y);
      if (!a) return;
      let label = '', lcol = 17;
      if (t && t !== a) {
        const cost = S.routeCost(a, t);
        if (!t.claimed) label = 'CLAIM ' + t.name + ' FIRST';
        else if (S.routeBetween(run, a, t)) label = 'ROUTE EXISTS';
        else if (run.credits < cost) label = 'NEED ' + cost + ' CR';
        else { label = 'OPEN ROUTE ' + cost + ' CR'; lcol = 13; }
      } else label = 'CLICK ONE OF YOUR WORLDS (ESC CANCELS)';
      const lw = D.tw(label) + 6, lx = U.clamp(Math.round(G.mouse.x + 8), 2, G.W - lw - 2), ly = U.clamp(Math.round(G.mouse.y - 12), top + 2, bottom - 10);
      D.frame(ctx, lx, ly, lw, 9, 0, lcol);
      D.text(ctx, label, lx + 3, ly + 2, lcol, { shadow: false });
    }
  };
  function drawEdgeMarker(ctx, s, b, time) {
    const top = G.HUD_H + 10, bottom = G.mapBottom() - 10;
    const x = U.clamp(s.x, 12, G.W - 12), y = U.clamp(s.y, top, bottom);
    if (Math.floor(time * 3) % 3 === 0) return;
    ctx.fillStyle = PAL[13];
    const dx = Math.sign(s.x - x), dy = Math.sign(s.y - y);
    for (let i = 0; i < 4; i++) { ctx.fillRect(x + dx * i - (dy ? i : 0), y + dy * i - (dx ? i : 0), 1 + (dy ? i * 2 : 0), 1 + (dx ? i * 2 : 0)); }
    D.text(ctx, b.name, U.clamp(x - dx * 6, 20, G.W - 20), U.clamp(y - dy * 8 - 2, top, bottom), 13, { align: dx > 0 ? 'right' : dx < 0 ? 'left' : 'center' });
  }
})(globalThis.AS = globalThis.AS || {});
