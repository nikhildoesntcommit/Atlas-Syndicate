/* ATLAS SYNDICATE v7 — render/sprites.js
   All pixel art, generated in code (unchanged v4 generators): painter helpers, facility art, freighters,
   icons, the star, and planets that rotate under a moving day/night terminator. v5 adds faction icons
   and map status badges in the same style. */
(function (AS) {
  'use strict';

  const U = AS.U, PAL = AS.PALETTE, RGB = AS.PAL_RGB, TAU = U.TAU, bayer = U.bayer, clamp = U.clamp;
  const Spr = AS.Spr = { planets: {}, tex: {}, warnings: [] };

  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  Spr.mkCanvas = mkCanvas;

  function Painter(w, h) {
    const c = mkCanvas(w, h), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return {
      c, x, w, h,
      px(a, b, col) { if (col < 0 || col >= PAL.length) return; x.fillStyle = PAL[col]; x.fillRect(a | 0, b | 0, 1, 1); },
      r(a, b, ww, hh, col) { if (ww <= 0 || hh <= 0 || col < 0) return; x.fillStyle = PAL[col]; x.fillRect(a | 0, b | 0, ww | 0, hh | 0); },
      d(a, b, ww, hh, col, lvl) { x.fillStyle = PAL[col]; for (let yy = b | 0; yy < (b + hh) | 0; yy++) for (let xx = a | 0; xx < (a + ww) | 0; xx++) if (bayer(xx, yy) < lvl) x.fillRect(xx, yy, 1, 1); },
      line(x0, y0, x1, y1, col) {
        x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, guard = 0;
        x.fillStyle = PAL[col];
        while (guard++ < 2000) {
          x.fillRect(x0, y0, 1, 1);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      },
    };
  }
  Spr.Painter = Painter;
  function bake(name, w, h, fn) {
    try { const P = Painter(w, h); fn(P); return P.c; } catch (e) { Spr.warnings.push(name + ': ' + e.message); return mkCanvas(w, h); }
  }
  function bakeGrid(name, rows, outline) {
    const h = rows.length, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return bake(name, w, h, P => {
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const i = AS.PAL_KEYS.indexOf(r[x]); if (i >= 0 && r[x] !== '.') P.px(x, y, i); } });
      if (outline >= 0) autoOutline(P, outline);
    });
  }
  function autoOutline(P, col) {
    const { w, h, x } = P;
    let img;
    try { img = x.getImageData(0, 0, w, h); } catch (e) { return; }
    const d = img.data, solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    const [r, g, b] = RGB[col];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      if (solid[i]) continue;
      if ((xx > 0 && solid[i - 1]) || (xx < w - 1 && solid[i + 1]) || (yy > 0 && solid[i - w]) || (yy < h - 1 && solid[i + w])) {
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }
  function obox(P, x, y, w, d, h, c) {
    P.r(x, y, w, d, c.top); P.r(x, y + d, w, h, c.front);
    P.r(x + 1, y, w - 2, 1, c.hi); P.r(x, y + d, w, 1, c.hi);
    if (h > 2) P.d(x + w - 3, y + d + 1, 3, h - 1, c.lo, 8);
    P.r(x, y + d + h - 1, w, 1, c.lo);
  }
  function shadeEll(P, cx, cy, rx, ry, ramp, yMax) {
    yMax = yMax === undefined ? 999 : yMax;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (y > yMax) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, dd = nx * nx + ny * ny;
        if (dd > 1) continue;
        const l = clamp(0.55 - nx * 0.45 - ny * 0.45 - dd * 0.25, 0, 0.999);
        P.px(x, y, ramp[clamp(Math.floor(l * ramp.length + (bayer(x, y) / 16 - 0.5) * 0.9), 0, ramp.length - 1)]);
      }
    }
  }
  function cylinder(P, x, y, w, h, ramp) {
    for (let i = 0; i < w; i++) {
      const t = i / Math.max(1, w - 1), l = clamp(0.85 - Math.abs(t - 0.3) * 1.3, 0, 0.999);
      for (let yy = y; yy < y + h; yy++) P.px(x + i, yy, ramp[clamp(Math.floor(l * ramp.length + (bayer(x + i, yy) / 16 - 0.5) * 0.8), 0, ramp.length - 1)]);
    }
    shadeEll(P, x + (w - 1) / 2, y, w / 2, Math.max(1, w / 5), ramp);
  }
  const STEEL = { top: 5, front: 4, hi: 6, lo: 3 }, DARKS = { top: 4, front: 3, hi: 5, lo: 2 }, RUST = { top: 11, front: 10, hi: 12, lo: 9 };
  const CONC = { top: 6, front: 5, hi: 7, lo: 4 }, BRICK = { top: 17, front: 16, hi: 18, lo: 15 }, OLIVE = { top: 29, front: 28, hi: 30, lo: 27 };
  const NAVY = { top: 25, front: 24, hi: 26, lo: 23 };
  function drawPad(P) { P.r(1, 27, 30, 4, 2); P.r(1, 27, 30, 1, 4); for (let x = 1; x < 31; x++) P.px(x, 30, ((x >> 1) & 1) ? 13 : 0); }

  const FAC_ART = {
    mine(P) {
      drawPad(P); obox(P, 3, 17, 12, 4, 6, DARKS); P.r(6, 23, 4, 4, 1); P.px(11, 22, 13);
      P.line(18, 26, 22, 5, 10); P.line(28, 26, 23, 5, 10); P.line(19, 26, 22, 6, 11); P.line(27, 26, 23, 6, 11);
      for (let y = 10; y < 26; y += 5) { P.line(20, y, 26, y + 4, 9); P.line(26, y, 20, y + 4, 9); }
      for (let a = 0; a < 12; a++) { const t = a / 12 * TAU; P.px(22 + Math.round(Math.cos(t) * 3), 4 + Math.round(Math.sin(t) * 3), 6); }
      P.px(22, 4, 7); P.line(22, 4, 12, 17, 4);
      for (let y = 22; y <= 26; y++) for (let x = 27 - (y - 22); x <= 29; x++) P.px(x, y, (x + y) & 1 ? 12 : 11);
    },
    drill(P) {
      drawPad(P); cylinder(P, 3, 13, 8, 13, [3, 4, 5, 6]); P.r(3, 17, 8, 1, 11); P.r(3, 21, 8, 1, 11);
      P.line(15, 26, 20, 2, 5); P.line(26, 26, 21, 2, 5); for (let y = 6; y < 26; y += 4) P.line(16, y + 3, 25, y, 4);
      obox(P, 18, 0, 6, 2, 2, RUST); P.r(20, 4, 1, 22, 6); obox(P, 17, 22, 8, 2, 3, DARKS);
    },
    skimmer(P) {
      drawPad(P); shadeEll(P, 9, 20, 6, 6, [9, 10, 29, 30, 31], 25); P.r(3, 21, 13, 1, 10); obox(P, 19, 9, 6, 2, 16, STEEL);
      for (let y = 2; y <= 8; y++) { const hw = 1 + ((8 - y) >> 1); P.r(22 - hw, y, hw * 2, 1, y & 1 ? 29 : 30); }
      P.r(14, 18, 5, 1, 4); P.r(14, 19, 5, 1, 3); P.px(26, 10, 13);
    },
    smelter(P) {
      drawPad(P); obox(P, 4, 13, 22, 5, 9, BRICK); obox(P, 6, 1, 4, 2, 12, DARKS); obox(P, 13, 4, 4, 2, 9, DARKS);
      P.r(6, 6, 4, 1, 13); P.r(13, 8, 4, 1, 13); P.r(18, 21, 5, 5, 0); P.d(19, 22, 3, 4, 18, 9); P.d(19, 23, 3, 3, 12, 5);
      P.r(26, 24, 5, 1, 4); P.r(26, 25, 5, 1, 2);
    },
    agri(P) {
      drawPad(P); obox(P, 3, 21, 26, 2, 4, CONC); shadeEll(P, 16, 21, 12, 11, [19, 20, 21, 22, 26], 21);
      for (let x = 8; x <= 24; x += 4) for (let y = 11; y <= 21; y++) { const nx = (x - 16) / 12, ny = (y - 21) / 11; if (nx * nx + ny * ny <= 1) P.px(x, y, 3); }
      for (let x = 6; x <= 26; x++) { const nx = (x - 16) / 12, y = 21 - Math.round(Math.sqrt(Math.max(0, 1 - nx * nx)) * 5.5); P.px(x, y, 3); }
      for (let x = 7; x < 26; x += 3) P.px(x, 20, 28);
    },
    fab(P) {
      drawPad(P); obox(P, 3, 13, 26, 4, 10, STEEL);
      for (let k = 0; k < 3; k++) for (let i = 0; i < 8; i++) {
        const x = 4 + k * 8 + i, top = 12 - Math.floor(i * 5 / 7);
        if (i === 7) P.r(x, 7, 1, 6, 4); else { P.r(x, top, 1, 13 - top, 5); P.px(x, top, 6); }
      }
      P.r(11, 20, 9, 7, 2); for (let y = 21; y < 27; y += 2) P.r(11, y, 9, 1, 3);
      for (let y = 19; y < 27; y++) { P.px(10, y, (y & 1) ? 13 : 0); P.px(20, y, (y & 1) ? 0 : 13); }
    },
    habitat(P) {
      drawPad(P); obox(P, 2, 16, 8, 3, 8, DARKS); obox(P, 22, 14, 8, 3, 10, DARKS); obox(P, 9, 3, 14, 4, 21, CONC);
      for (let y = 9; y <= 22; y += 3) for (let x = 11; x < 21; x += 3) P.px(x, y, U.hash2(x, y, 3) < 0.65 ? 14 : 2);
      for (let y = 20; y <= 22; y += 2) { P.px(4, y, 14); P.px(7, y, 2); P.px(24, y - 2, 14); P.px(27, y, 14); }
      P.r(16, 0, 1, 3, 6);
    },
    tank(P) {
      drawPad(P); cylinder(P, 3, 9, 11, 17, [23, 24, 25, 26]); cylinder(P, 17, 14, 11, 12, [23, 24, 25, 26]);
      P.r(3, 14, 11, 1, 26); P.r(3, 20, 11, 1, 24); P.r(17, 19, 11, 1, 26);
      P.r(14, 22, 3, 2, 5); P.r(14, 22, 3, 1, 6); P.r(8, 4, 1, 5, 6); P.r(7, 3, 3, 1, 5);
      for (let y = 11; y < 25; y += 3) P.px(5, y, 31);
      P.d(19, 21, 7, 4, 26, 6);
    },
    barn(P) {
      drawPad(P); obox(P, 4, 15, 24, 2, 10, BRICK);
      for (let y = 5; y <= 15; y++) { const hw = Math.round((y - 5) * 1.25); P.r(16 - hw, y, hw * 2, 1, y & 1 ? 9 : 10); }
      P.line(16, 5, 3, 16, 31); P.line(16, 5, 29, 16, 31);
      P.r(12, 19, 8, 8, 8); P.line(12, 19, 19, 26, 31); P.line(19, 19, 12, 26, 31); P.r(12, 19, 8, 1, 31);
      P.r(6, 19, 3, 3, 14); P.r(23, 19, 3, 3, 14);
      P.r(27, 22, 4, 5, 29); P.r(27, 22, 4, 1, 30);
    },
    depot(P) {
      drawPad(P); P.r(3, 6, 2, 21, 12); P.r(27, 6, 2, 21, 12); for (let y = 7; y < 26; y += 3) { P.px(3, y, 0); P.px(28, y, 0); }
      obox(P, 2, 3, 28, 2, 2, { top: 13, front: 12, hi: 14, lo: 11 }); for (let x = 3; x < 30; x += 2) P.px(x, 5, 0);
      obox(P, 7, 20, 9, 2, 5, RUST); obox(P, 16, 20, 9, 2, 5, OLIVE); obox(P, 11, 14, 9, 2, 5, NAVY); P.r(15, 6, 1, 7, 6); P.r(14, 12, 3, 1, 6);
    },
  };

  /* resource icons: distinct shapes so colour is never the only cue */
  const GOOD_ICONS = {
    metal:   ['.bb..', 'b6bb.', 'bbbba', '.aaa.', '.....'],
    gold:    ['..e..', '.ede.', 'eddde', '.cdc.', '..c..'],
    ice:     ['..v..', '.vqv.', 'vqqqp', '.pqp.', '..p..'],
    fuel:    ['..3..', '.343.', '3a443', '3a443', '.333.'],
    alloy:   ['.....', '.777.', '66666', '55555', '.....'],
    food:    ['.m.m.', 'mmmmm', 'mlllm', 'mlllm', '.mmm.'],
    credits: ['.ddd.', 'dcddd', 'dcdde', 'ddddb', '.bbb.'],
    money:   ['.....', 'vvvvv', 'vmlmv', 'vvvvv', '.....'],
    water:   ['..q..', '.qqq.', 'qqqvq', 'qqqqq', '.ppp.'],
  };
  /* faction icons (5x5, drawn in the faction colour) and map badges */
  const FICON = {
    atlas:       ['..#..', '.#.#.', '#####', '#...#', '#...#'],
    warlord:     ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    merchant:    ['.###.', '#.#..', '.###.', '..#.#', '.###.'],
    turtle:      ['#####', '#...#', '#.#.#', '.#.#.', '..#..'],
    opportunist: ['.....', '.###.', '#.#.#', '.###.', '.....'],
    raider:      ['...#.', '..#..', '.###.', '..#..', '.#...'],
    neutral:     ['.....', '.###.', '.#.#.', '.###.', '.....'],
  };
  const ICONS = {
    coin: ['.ddd.', 'dcddd', 'dcdde', 'ddddb', '.bbb.'],
    clock: ['.666.', '6.7.6', '6.776', '6...6', '.666.'],
    board: ['77777', '7...7', '7d.d7', '7...7', '77777'],
    warn: ['..d..', '.d0d.', '.d0d.', 'ddddd', '.....'],
    lock: ['.666.', '6...6', 'ddddd', 'dd0dd', 'ddddd'],
    star: ['..d..', '.ddd.', 'ddddd', '.d.d.', '.....'],
    swords: ['h...h', '.h.h.', '..h..', '.h.h.', 'h...h'],
    up: ['..m..', '.mmm.', 'm.m.m', '..m..', '..m..'],
    wrench: ['.i..i', '.iiii', '.i...', 'i....', 'i....'],
    shield: ['mmmmm', 'mlllm', 'mlllm', '.mlm.', '..m..'],
    worker: ['.7.', '777', '.7.', '7.7'],
    ship: ['.....', '..7..', '.676.', '7.6.7', '.....'],
    destroyer: ['.....', '6....', '67776', '.6666', '.....'],
    cannon: ['....d', '...d.', '.66..', '6666.', '66666'],
    power: ['..dd.', '.dd..', 'ddddd', '..dd.', '.dd..'],
  };

  /* freighter hull (faces right); pods are painted per frame in rows 2-4, x 4..11 */
  const HULL = [
    '.....3333.......',
    '..33444445566...',
    'E3442222222267..',
    'E34422222222677.',
    'E3442222222267..',
    '..33444445566...',
    '.....3333.......',
  ];

  Spr.bake = function () {
    Spr.fac = {};
    for (const k of Object.keys(FAC_ART)) Spr.fac[k] = bake('fac:' + k, 32, 32, P => { FAC_ART[k](P); autoOutline(P, 0); });
    Spr.slot = bake('slot', 32, 32, P => {
      drawPad(P);
      for (let x = 4; x < 28; x++) if (((x >> 1) & 1) === 0) { P.px(x, 9, 4); P.px(x, 25, 4); }
      for (let y = 9; y < 26; y++) if (((y >> 1) & 1) === 0) { P.px(4, y, 4); P.px(27, y, 4); }
      P.r(15, 13, 2, 9, 5); P.r(11, 16, 10, 2, 5);
    });
    Spr.hull = [0, 1].map(frame => [0, 1].map(flip => bakeGrid('hull', HULL.map(r => {
      let s = r.replace(/E/g, frame ? 'c' : 'a');
      if (flip) s = s.split('').reverse().join('');
      return s;
    }), 0)));
    Spr.goods = {};
    for (const g in GOOD_ICONS) Spr.goods[g] = bakeGrid('good:' + g, GOOD_ICONS[g]);
    Spr.icons = {};
    for (const k in ICONS) Spr.icons[k] = bakeGrid('icon:' + k, ICONS[k]);
    Spr.ficon = {};   // per faction icon, per palette colour, baked lazily
    Spr.FICON = FICON;
    Spr.star = bake('star', 40, 40, P => {
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
        const d = Math.hypot(x - 19.5, y - 19.5);
        if (d <= 11) {
          const l = clamp(1 - d / 12 + ((x - 19.5) * -0.02) + (bayer(x, y) / 16 - 0.5) * 0.18, 0, 0.999);
          P.px(x, y, [16, 17, 18, 12, 13, 14][Math.floor(l * 6)]);
        } else if (d <= 18) {
          const lvl = Math.floor(clamp((18 - d) / 7, 0, 1) * 9);
          if (bayer(x, y) < lvl) P.px(x, y, d < 14 ? 18 : 16);
        }
      }
    });
    Spr.ready = true;
  };

  /** Freighter: hull plus up to three cargo pods in the colour of the resource it carries. */
  Spr.drawFreighter = function (ctx, x, y, flip, frame, col, pods) {
    ctx.drawImage(Spr.hull[frame][flip], x, y);
    for (let i = 0; i < (pods || 0); i++) {
      const px = flip ? x + 16 - 1 - (4 + i * 3) - 1 : x + 4 + i * 3;
      ctx.fillStyle = PAL[col]; ctx.fillRect(px, y + 2, 2, 3);
      ctx.fillStyle = PAL[0]; ctx.fillRect(px, y + 3, 2, 1);
    }
  };
  /** Faction icon in a colour (5x5). */
  Spr.factionIcon = function (key, col) {
    const k = key + ':' + col;
    if (!Spr.ficon[k]) Spr.ficon[k] = bake('ficon:' + k, 5, 5, P => { (FICON[key] || FICON.neutral).forEach((r, y) => { for (let x = 0; x < 5; x++) if (r[x] === '#') P.px(x, y, col); }); });
    return Spr.ficon[k];
  };
  /** One pixel die face (7x7) showing v, for the battle readout. */
  Spr.die = function (ctx, x, y, v, col, pipCol) {
    ctx.fillStyle = PAL[0]; ctx.fillRect(x, y + 1, 7, 7);
    ctx.fillStyle = PAL[col]; ctx.fillRect(x, y, 7, 7);
    ctx.fillStyle = PAL[pipCol];
    const P = { 1: [[3, 3]], 2: [[1, 1], [5, 5]], 3: [[1, 1], [3, 3], [5, 5]], 4: [[1, 1], [5, 1], [1, 5], [5, 5]], 5: [[1, 1], [5, 1], [3, 3], [1, 5], [5, 5]], 6: [[1, 1], [5, 1], [1, 3], [5, 3], [1, 5], [5, 5]] }[v] || [];
    for (const [a, b] of P) ctx.fillRect(x + a, y + b, 1, 1);
  };

  /** Scaffolding over a facility slot while it is being built (frac 0..1 complete). */
  Spr.drawScaffold = function (ctx, x, y, type, frac, time) {
    const art = Spr.fac[type];
    const shown = Math.round(28 * frac);
    if (shown > 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(art, 0, 30 - shown, 32, shown, x, y + 30 - shown, 32, shown);
    }
    ctx.fillStyle = PAL[12];
    for (let px = 4; px <= 28; px += 6) ctx.fillRect(x + px, y + 4, 1, 26);
    for (let py = 6; py <= 28; py += 5) { ctx.fillStyle = PAL[(py >> 1) & 1 ? 11 : 12]; ctx.fillRect(x + 4, y + py, 25, 1); }
    ctx.fillStyle = PAL[13];
    for (let i = 4; i < 29; i += 2) if (((i + Math.floor(time * 8)) >> 1) & 1) ctx.fillRect(x + i, y + 3, 2, 1);
    // crane
    ctx.fillStyle = PAL[6]; ctx.fillRect(x + 26, y + 0, 1, 30); ctx.fillRect(x + 12, y + 0, 15, 1);
    const hx = x + 14 + Math.round((Math.sin(time * 1.3) + 1) * 5);
    ctx.fillStyle = PAL[5]; ctx.fillRect(hx, y + 1, 1, 6 + Math.round(Math.sin(time * 2) * 2));
  };

  /* ---------- planets ---------- */
  const LOOK = {
    terran: { a: [23, 24, 25, 26], b: [27, 28, 21, 22, 30] },
    rust:   { a: [8, 9, 10, 11, 12], b: [9, 10, 11, 12, 30] },
    cinder: { a: [15, 16, 17, 18, 12], b: [8, 15, 16, 10, 11] },
    ice:    { a: [23, 24, 25, 26, 31], b: [24, 25, 26, 31, 31] },
    ice2:   { a: [19, 20, 21, 22, 26], b: [23, 24, 25, 26, 7] },
    gas:    { a: [9, 10, 12, 30, 31], b: [8, 9, 11, 29, 30] },
    dwarf:  { a: [1, 2, 3, 4, 5, 6], b: [1, 2, 8, 9, 10, 5] },
    belt:   { a: [2, 3, 4, 5, 6], b: [8, 9, 10, 11, 12] },
  };
  const TW = 64, TH = 32;
  function texture(b) {
    if (Spr.tex[b.key]) return Spr.tex[b.key];
    const seed = (b.id * 7919 + (b.r | 0)) | 0;
    const t = new Float32Array(TW * TH), m = new Uint8Array(TW * TH);
    const vn = (u, v, cells, s) => {
      const gx = u / TW * cells, gy = v / TH * (cells / 2), x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = U.smooth(gx - x0), fy = U.smooth(gy - y0);
      const h = (i, j) => U.hash2(((x0 + i) % cells + cells) % cells, y0 + j, s);
      return (h(0, 0) * (1 - fx) + h(1, 0) * fx) * (1 - fy) + (h(0, 1) * (1 - fx) + h(1, 1) * fx) * fy;
    };
    for (let v = 0; v < TH; v++) for (let u = 0; u < TW; u++) {
      const i = v * TW + u;
      const n = vn(u, v, 8, seed) * 0.6 + vn(u, v, 16, seed + 1) * 0.4;
      if (b.kind === 'gas') {
        const band = Math.sin((v / TH) * Math.PI * 7 + vn(u, v, 8, seed) * 2.2);
        t[i] = 0.1 * band; m[i] = band > 0 ? 0 : 1;
      } else if (b.kind === 'terran') {
        t[i] = (n - 0.5) * 0.3; m[i] = n > 0.52 ? 1 : 0;
      } else {
        t[i] = (n - 0.5) * 0.35; m[i] = n > 0.66 ? 1 : 0;
      }
      if (b.kind === 'ice' && (v < 4 || v > TH - 5)) { t[i] = 0.25; m[i] = 1; }
    }
    Spr.tex[b.key] = { t, m, lights: Array.from({ length: TW * TH }, (_, i) => U.hash2(i % TW, (i / TW) | 0, seed + 9)) };
    return Spr.tex[b.key];
  }

  /**
   * Planet sprite at the current rotation and light direction. Re-rendered only when the
   * quantised rotation or light bucket changes, so it costs almost nothing per frame.
   * lights: 0..1 share of night-side lamps (claimed worlds light up as they grow).
   */
  Spr.planet = function (b, time, lights) {
    const R = b.size, S = R * 2 + 3, c0 = R + 1;
    const ang = Math.atan2(-b.z, -b.x);
    const lb = ((Math.round(ang / TAU * 64) % 64) + 64) % 64;
    const rot = ((Math.floor(time * b.spin * 6) % TW) + TW) % TW;
    const lk = Math.round((lights || 0) * 8);
    let e = Spr.planets[b.key];
    if (!e || e.S !== S) {
      const c = mkCanvas(S, S);
      e = Spr.planets[b.key] = { c, x: c.getContext('2d'), S, key: '' };
    }
    const key = lb + ':' + (b.kind === 'belt' ? 0 : rot) + ':' + lk;
    if (e.key === key) return e.c;
    e.key = key;
    const ctx = e.x;
    ctx.clearRect(0, 0, S, S);
    const look = LOOK[b.kind] || LOOK.dwarf;
    if (b.kind === 'belt') {
      const P = { x: ctx, px(a, bb, col) { ctx.fillStyle = PAL[col]; ctx.fillRect(a | 0, bb | 0, 1, 1); }, r(a, bb, w, h, col) { ctx.fillStyle = PAL[col]; ctx.fillRect(a, bb, w, h); }, d() {} };
      const rng = U.rng(77);
      for (let k = 0; k < 6; k++) { const ox = (rng() - 0.5) * R * 1.6, oy = (rng() - 0.5) * R * 1.2, rr = 1 + rng() * 1.8; shadeEll(P, c0 + ox, c0 + oy, rr, rr * 0.8, look.a); }
      P.r(c0 - 2, c0 - 1, 5, 2, 5); P.r(c0 - 2, c0 + 1, 5, 1, 3); P.px(c0, c0 - 2, 13);
      return e.c;
    }
    const a = lb / 64 * TAU, T = 0.38;
    const L = [Math.cos(a), Math.sin(a) * T, Math.sin(a) * Math.sqrt(1 - T * T)];
    const tex = texture(b);
    const img = ctx.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x - c0) / R, ny = (y - c0) / R, dd = nx * nx + ny * ny;
      if (dd > 1) continue;
      const nz = Math.sqrt(1 - dd);
      const lon = Math.atan2(nx, nz), lat = Math.asin(clamp(ny, -1, 1));
      const u = ((Math.floor((lon / TAU) * TW + rot) % TW) + TW) % TW;
      const v = clamp(Math.floor((lat / Math.PI + 0.5) * TH), 0, TH - 1);
      const ti = v * TW + u;
      const lit = nx * L[0] + ny * L[1] + nz * L[2];
      const ramp = tex.m[ti] ? look.b : look.a;
      let col;
      const dith = bayer(x, y) / 16 - 0.5;
      if (lit < -0.08 + dith * 0.12) {
        col = ramp[0];
        if (lk && tex.lights[ti] < lk / 8 * 0.18 && tex.m[ti] === 0) col = tex.lights[ti] < 0.03 ? 14 : 13;
      } else {
        const l = clamp(lit, 0, 1) * 0.72 + 0.22 + tex.t[ti] + (1 - nz) * -0.05;
        col = ramp[clamp(Math.floor(l * ramp.length + dith * 0.9), 0, ramp.length - 1)];
      }
      const rgb = RGB[col], p = (y * S + x) * 4;
      d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return e.c;
  };
  /** Gas giant ring, split so the far half is drawn behind the planet and the near half in front. */
  Spr.drawRing = function (ctx, b, front) {
    const R = b.size, cx = Math.round(b.sx), cy = Math.round(b.sy);
    for (let i = 0; i < 80; i++) {
      const a = i / 80 * TAU;
      const sin = Math.sin(a);
      if ((sin > 0) !== front) continue;
      for (const k of [1.45, 1.7]) {
        const x = cx + Math.round(Math.cos(a) * R * k), y = cy + Math.round(sin * R * k * 0.28);
        if (!front && Math.hypot(x - cx, y - cy) < R) continue;
        ctx.fillStyle = PAL[k > 1.5 ? 28 : 29];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };
})(globalThis.AS = globalThis.AS || {});
