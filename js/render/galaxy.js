/* ATLAS SYNDICATE v5 — render/galaxy.js
   The galaxy view (Risk): a dithered spiral backdrop, hyperlanes, star systems with owner colour,
   army strength as a number, status icons, armies flowing along lanes as pixel streams, battle dice,
   and the particles shared with the system view. Fog: exact numbers only where the player can see. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw, TAU = U.TAU;
  const Gal = AS.Gal = { bg: null, bgSeed: -1, stars: [] };
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });

  Gal.fcol = (run, o) => (o >= 0 ? run.factions[o].col : AS.NEUTRAL.col);
  Gal.fdark = (run, o) => (o >= 0 ? run.factions[o].dark : AS.NEUTRAL.dark);
  Gal.fdeep = (run, o) => (o >= 0 ? run.factions[o].deep : AS.NEUTRAL.deep);
  Gal.ficon = (run, o) => AS.Spr.factionIcon(o >= 0 ? run.factions[o].icon : 'neutral', Gal.fcol(run, o));
  Gal.viewer = () => 0;   // the player's faction: fog is always drawn from slot 0's point of view

  /* ---------- screen backdrop (parallax stars, as in v4) ---------- */
  Gal.onResize = function () {
    const sr = U.rng(1234), w = G.W, h = G.H;
    Gal.stars = [];
    const n = Math.round(w * h / 700);
    for (let i = 0; i < n; i++) {
      const layer = i < n * 0.6 ? 0 : i < n * 0.88 ? 1 : 2;
      Gal.stars.push({ x: sr() * w, y: sr() * h, layer, tw: sr() * TAU, col: [[2, 3], [3, 4], [5, 6]][layer][sr() < 0.5 ? 0 : 1] });
    }
  };
  Gal.drawSpace = function (ctx, time) {
    if (!Gal.stars.length) Gal.onResize();
    D.rect(ctx, 0, 0, G.W, G.H, 0);
    for (const s of Gal.stars) {
      const par = [0.05, 0.12, 0.25][s.layer];
      let x = (s.x - time * [0.3, 0.7, 1.5][s.layer] - G.cam.x * par * G.cam.zr) % G.W; if (x < 0) x += G.W;
      let y = (s.y - G.cam.y * par * G.cam.zr) % G.H; if (y < 0) y += G.H;
      ctx.fillStyle = PAL[Math.sin(time * 1.3 + s.tw) > 0.95 ? 7 : s.col];
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  };

  /* ---------- the spiral itself: baked once per seed in world space, ordered dither only ---------- */
  const BX = 250, BY = 150;   // backdrop half-size in world units
  function bakeBackdrop(run) {
    const w = BX * 2, h = BY * 2;
    const c = AS.Spr.mkCanvas(w, h), x = c.getContext('2d');
    const img = x.createImageData(w, h), d = img.data;
    const rot = Math.atan2(run.systems[4].y, run.systems[4].x) - 0.2;
    const sq = C.galaxy.squash;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const wx = px - BX, wy = (py - BY) / sq;
      const r = Math.hypot(wx, wy), a = Math.atan2(wy, wx);
      // five logarithmic-ish arms following the generator's twist
      let arm = 0;
      for (let i = 0; i < C.galaxy.arms; i++) {
        const target = rot + i * TAU / C.galaxy.arms + Math.max(0, r - C.galaxy.armR0) / C.galaxy.armDR * C.galaxy.twist;
        let da = Math.abs(((a - target) % TAU + TAU * 1.5) % TAU - Math.PI);
        da = Math.PI - da;
        arm = Math.max(arm, Math.max(0, 1 - da * r / 34));
      }
      const fade = U.clamp(1 - (r - 150) / 90, 0, 1);
      const core = U.clamp(1 - r / 70, 0, 1);
      const n = U.hash2(px >> 2, py >> 2, run.seed) * 0.25 + U.hash2(px, py, run.seed + 3) * 0.1;
      const v = (arm * 0.55 * fade + core * 0.75 + n * fade * 0.5) + (U.bayer(px, py) / 16 - 0.5) * 0.18;
      let col = -1;
      if (v > 0.9) col = 9; else if (v > 0.72) col = 8; else if (v > 0.55) col = 23; else if (v > 0.42) col = 1;
      if (col < 0) continue;
      const rgb = AS.PAL_RGB[col], p = (py * w + px) * 4;
      d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a sprinkle of distant suns
    const r = U.rng(run.seed ^ 77);
    for (let i = 0; i < 260; i++) {
      const px = Math.floor(r() * w), py = Math.floor(r() * h);
      x.fillStyle = PAL[[3, 4, 5, 6, 12][Math.floor(r() * 5)]];
      x.fillRect(px, py, 1, 1);
    }
    Gal.bg = c; Gal.bgSeed = run.seed;
  }

  /* ---------- particles (used by both views; coordinates are in the view's own space) ---------- */
  Gal.spark = function (view, x, y, n) { for (let i = 0; i < n; i++) G.parts.push({ view, x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 40, g: 90, life: 0.3 + Math.random() * 0.4, max: 0.7, cols: [14, 13, 12] }); };
  Gal.burst = function (view, x, y, n, cols, spread, up, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = Math.random() * (spread || 20);
      G.parts.push({ view, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (up || 0), g: 30, life: (life || 0.8) * (0.5 + Math.random() * 0.5), max: life || 0.8, cols });
    }
  };
  Gal.ring = function (view, x, y, r0, r1, dur, col) { G.parts.push({ view, ring: true, x, y, r0, r1, life: dur, max: dur, cols: [col] }); };
  Gal.drawParts = function (ctx, view) {
    for (const p of G.parts) {
      if (p.view !== view) continue;
      const k = 1 - p.life / p.max;
      if (p.ring) {
        const r = p.r0 + (p.r1 - p.r0) * U.easeOut(k), n = Math.max(12, Math.round(r * 3));
        ctx.fillStyle = PAL[p.cols[0]];
        for (let i = 0; i < n; i++) { if ((i + Math.floor(k * 8)) % 3 === 0) continue; const a = i / n * TAU; ctx.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r * (view === 'galaxy' ? 0.7 : 0.5)), 1, 1); }
        continue;
      }
      ctx.fillStyle = PAL[p.cols[Math.min(p.cols.length - 1, Math.floor(k * p.cols.length))]];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  };

  /* ---------- helpers ---------- */
  Gal.systemAt = function (run, sx, sy) {
    let best = null, bd = 11;
    for (const s of run.systems) {
      const p = G.toScreen(s.x, s.y);
      const d = Math.hypot(p.x - sx, p.y - (sy - 2));
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  Gal.armyPos = function (run, a) {
    const A = run.systems[a.path[a.seg]], B = run.systems[a.path[a.seg + 1]];
    const t = a.wait > 0 ? 0.92 : U.clamp(a.prog, 0, 1);
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, dx: B.x - A.x, dy: B.y - A.y };
  };
  /** What the viewer knows about a system: exact strength, or only a size band. */
  Gal.known = function (run, s) {
    const vis = S.visibility(run, Gal.viewer());
    const v = Math.round(S.defStrength(run, s));
    return vis[s.id] ? { exact: true, v, text: String(v) } : { exact: false, v, text: S.sizeBand(S.garStrength(run, s)) };
  };
  Gal.damaged = function (run, s) {
    if (s.owner < 0) return false;
    for (const b of S.buildings(run, s)) if (b.dur < 30 && (b.kind !== 'ships' && b.kind !== 'plat')) return true;
    return false;
  };

  function line(ctx, x0, y0, x1, y1, col, dash, phase) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, k = 0, guard = 0;
    ctx.fillStyle = PAL[col];
    while (guard++ < 3000) {
      if (!dash || (((k + (phase | 0)) >> 1) % dash) === 0) ctx.fillRect(x0, y0, 1, 1);
      k++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  Gal.line = line;

  /* ---------- world pass (camera transform applied) ---------- */
  Gal.drawWorld = function (ctx, run, time) {
    if (Gal.bgSeed !== run.seed || !Gal.bg) bakeBackdrop(run);
    ctx.drawImage(Gal.bg, -BX, -BY);
    const me = Gal.viewer(), vis = S.visibility(run, me);
    // lanes
    for (const l of run.lanes) {
      const A = run.systems[l.a], B = run.systems[l.b];
      const closed = l.closedUntil > run.t;
      const same = A.owner === B.owner && A.owner >= 0;
      const col = closed ? 17 : same ? Gal.fdark(run, A.owner) : 4;
      line(ctx, A.x, A.y + 1, B.x, B.y + 1, 0, 0);
      line(ctx, A.x, A.y, B.x, B.y, col, closed ? 2 : same ? 0 : 2, 0);
      if (closed) {   // X marks on a collapsed lane: never colour alone
        const mx = Math.round((A.x + B.x) / 2), my = Math.round((A.y + B.y) / 2);
        ctx.fillStyle = PAL[Math.floor(time * 3) % 2 ? 17 : 13];
        for (let d = -2; d <= 2; d++) { ctx.fillRect(mx + d, my + d, 1, 1); ctx.fillRect(mx + d, my - d, 1, 1); }
      }
    }
    // order drag preview
    const od = G.drag && G.drag.kind === 'army' ? G.drag : null;
    if (od) {
      const A = run.systems[od.from];
      const tgt = od.over >= 0 ? run.systems[od.over] : null;
      const w = tgt ? tgt : G.toWorld(G.mouse.x, G.mouse.y);
      line(ctx, A.x, A.y, w.x, w.y, od.valid ? 13 : 17, 2, time * 10);
    }
    // armies: pixel streams flowing along the lanes
    for (const a of run.armies) {
      if (!S.armyVisible(run, me, a)) continue;
      const p = Gal.armyPos(run, a), len = Math.max(1, Math.hypot(p.dx, p.dy));
      const ux = p.dx / len, uy = p.dy / len;
      const n = U.clamp(Math.round((a.n + a.ships * 5) / 4) + 2, 3, 16);
      const col = Gal.fcol(run, a.owner), dark = Gal.fdark(run, a.owner);
      for (let i = 0; i < n; i++) {
        const back = i * 2.2 + Math.sin(time * 9 + i) * 0.6;
        const x = Math.round(p.x - ux * back + (i % 2 ? -uy : uy) * (i % 3 === 0 ? 1 : 0)), y = Math.round(p.y - uy * back + (i % 2 ? ux : -ux) * (i % 3 === 0 ? 1 : 0));
        ctx.fillStyle = PAL[0]; ctx.fillRect(x, y + 1, 1, 1);
        ctx.fillStyle = PAL[i === 0 ? 31 : i < 3 ? col : dark]; ctx.fillRect(x, y, 1, 1);
      }
      if (a.mode === 'raid') { ctx.fillStyle = PAL[Math.floor(time * 6) % 2 ? 18 : 13]; ctx.fillRect(Math.round(p.x + ux * 2), Math.round(p.y + uy * 2), 1, 1); }
    }
    // stars
    for (const s of run.systems) {
      const x = Math.round(s.x), y = Math.round(s.y);
      const sc = [14, 13, 26, 18, 31][s.id % 5];
      ctx.fillStyle = PAL[0]; ctx.fillRect(x - 2, y - 1, 5, 4);
      ctx.fillStyle = PAL[sc]; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = PAL[31]; ctx.fillRect(x, y, 1, 1);
      if (s.battle) {   // battle flashes: hard pixels, no glow
        const k = Math.floor(time * 14 + s.id) % 4;
        ctx.fillStyle = PAL[[31, 14, 18, 17][k]];
        ctx.fillRect(x - 3 + ((s.id * 7 + k * 3) % 7), y - 3 + ((s.id + k * 5) % 7), 1, 1);
        ctx.fillRect(x + 3 - ((s.id + k * 2) % 7), y + 2 - ((s.id * 3 + k) % 6), 1, 1);
      }
    }
    void vis;
    Gal.drawParts(ctx, 'galaxy');
  };

  /* ---------- overlay pass (screen space): plates, numbers, names, icons, dice ---------- */
  Gal.drawOverlay = function (ctx, run, time, interactive) {
    const me = Gal.viewer();
    const homePick = run.phase === 'home';
    const cands = homePick ? S.homeCandidates(run) : null;
    const top = G.HUD_H, bottom = G.mapBottom();
    for (const s of run.systems) {
      const p = G.toScreen(s.x, s.y);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x < -30 || x > G.W + 30 || y < top - 10 || y > bottom + 10) continue;
      const k = Gal.known(run, s);
      const own = s.owner;
      const fc = Gal.fcol(run, own), fd = Gal.fdeep(run, own);
      const txt = homePick ? '' : k.text;
      const w = Math.max(9, D.tw(txt) + 10), px = x - Math.floor(w / 2), py = y - 13;
      const sel = G.sel && G.sel.sys === s.id;
      const hov = interactive && G.hoverSys === s.id;
      if (!homePick || own >= 0) {
        D.rect(ctx, px, py + 1, w, 9, 0);
        D.frame(ctx, px, py, w, 9, fd, sel ? 31 : hov ? 14 : fc);
        if (s.capital >= 0 && s.capital === own) { D.hazard(ctx, px + 1, py - 2, w - 2, 2, fc, 0); }
        ctx.drawImage(Gal.ficon(run, own), px + 2, py + 2);
        if (txt) TS(ctx, txt, px + 8, py + 2, k.exact ? (own === me ? 31 : 7) : 5);
      }
      // status icons: under attack, building up, damaged
      let ix = px + w + 1;
      if (s.battle) { if (Math.floor(time * 4) % 2 === 0) ctx.drawImage(AS.Spr.icons.swords, ix, py + 2); ix += 6; }
      if (k.exact && s.train.q > 0) { ctx.drawImage(AS.Spr.icons.up, ix, py + 2); ix += 6; }
      if (k.exact && Gal.damaged(run, s)) { ctx.drawImage(AS.Spr.icons.wrench, ix, py + 2); ix += 6; }
      if (k.exact && s.plat.n > 0 && s.plat.dur > 0 && G.cam.zr >= 2) { ctx.drawImage(AS.Spr.icons.shield, ix, py + 2); ix += 6; }
      // name
      const nc = own === me ? 13 : sel || hov ? 7 : 5;
      if (G.cam.zr >= 1) TS(ctx, s.name, x, y + 4, nc, 'center');
      if (homePick && cands.indexOf(s.id) >= 0) {
        const r = 8 + Math.floor(time * 4) % 3;
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + time; D.rect(ctx, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 1, 1, (i % 4) < 2 ? 13 : 0); }
        if (hov) T(ctx, 'CLICK TO MAKE THIS YOUR HOME', x, y - 24, 13, { align: 'center' });
      }
      if (interactive) G.tip(px - 2, py - 2, w + 4, 20, Gal.tipFor(run, s));
    }
    // army tags (strength) on visible armies
    for (const a of run.armies) {
      if (!S.armyVisible(run, me, a)) continue;
      const p = Gal.armyPos(run, a), sp = G.toScreen(p.x, p.y);
      const v = Math.round(S.stackStrength(run, a));
      const col = Gal.fcol(run, a.owner);
      const w = D.tw(String(v)) + 3;
      D.rect(ctx, Math.round(sp.x) - 1, Math.round(sp.y) - 9, w, 7, 0);
      TS(ctx, v, Math.round(sp.x), Math.round(sp.y) - 8, col);
    }
    // battle dice (visible battles only: the fight itself is public, the numbers are not)
    const vis = S.visibility(run, me);
    for (const b of run.battles) {
      const s = run.systems[b.sys];
      const dz = G.dice[b.sys];
      if (!vis[s.id] || !dz) continue;
      const p = G.toScreen(s.x, s.y);
      const x = Math.round(p.x) + 12, y = Math.round(p.y) - 30;
      if (x > G.W - 50 || y < top) continue;
      const age = G.time - dz.at;
      const roll = age < 0.25;
      D.rect(ctx, x - 1, y - 1, 48, 22, 0);
      D.frame(ctx, x - 2, y - 2, 48, 22, 1, 4);
      const ac = Gal.fcol(run, b.att.owner), dc = Gal.fcol(run, s.owner);
      for (let i = 0; i < 3; i++) {
        AS.Spr.die(ctx, x + i * 8, y, roll ? 1 + Math.floor(Math.random() * 6) : dz.ad[i], ac, 0);
        AS.Spr.die(ctx, x + i * 8, y + 10, roll ? 1 + Math.floor(Math.random() * 6) : dz.dd[i], dc, 0);
      }
      if (!roll) {
        TS(ctx, '-' + dz.dl, x + 26, y + 11, dz.dl ? 17 : 5);
        TS(ctx, '-' + dz.al, x + 26, y + 1, dz.al ? 17 : 5);
      }
      TS(ctx, Math.round(S.stackStrength(run, b.att)), x + 38, y + 1, ac, 'center');
      TS(ctx, Math.round(S.defStrength(run, s)), x + 38, y + 11, dc, 'center');
    }
  };

  Gal.tipFor = function (run, s) {
    const k = Gal.known(run, s);
    const o = s.owner >= 0 ? run.factions[s.owner] : null;
    let t = s.name + ': ' + (o ? o.name + (o.id === 0 ? '' : ' (' + AS.PERS_NAMES[o.pers] + ')') : 'INDEPENDENT') + '. ';
    t += k.exact ? 'DEFENCE ' + k.v + '. ' : 'SIZE BAND ' + k.text + ' (S UNDER 15, M UNDER 40, L 40+): TOO FAR TO SEE EXACT NUMBERS. ';
    if (s.capital >= 0 && s.capital === s.owner) t += 'CAPITAL: TAKE IT TO ELIMINATE THEM. ';
    if (s.owner === 0) t += 'CLICK TO OPEN. DRAG TO A NEIGHBOUR TO MOVE OR ATTACK.';
    else t += 'CLICK FOR DETAILS.';
    return t;
  };
})(globalThis.AS = globalThis.AS || {});
