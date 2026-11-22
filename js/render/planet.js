/* ATLAS SYNDICATE v6 — render/planet.js
   The planet view: a side-on cross-section (in the spirit of Turmoil, but nothing is hidden).
   Surface slots on top; layered rock below with hard layers, barriers and visible deposits showing what
   is left in them; one port on the left edge per pathway. Everything that flows is animated at a speed
   and density that follow the real rate. Every building has a status light and a one-line reason. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw;
  const PV = AS.PlanetView = {};
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TB = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, big: true, align });
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const GW = C.ground.w, GH = C.ground.h;
  PV.STATUS_COL = { ok: 22, idle: 13, blocked: 18, empty: 5, broken: 17 };

  PV.panelW = () => Math.round(U.clamp(G.W * 0.32, 168, 250));
  /** Screen layout of the open planet. */
  PV.layout = function (run, s, pi) {
    const p = s.planets[pi], f = s.owner >= 0 ? run.factions[s.owner] : null;
    const pw = PV.panelW(), top = G.HUD_H + 4, bottom = G.mapBottom() - 4;
    const portW = 64, x0 = portW + 10, x1 = G.W - pw - 8;
    const surfH = 40;
    const cs = Math.max(4, Math.floor(Math.min((x1 - x0) / GW, (bottom - top - surfH - 6) / GH)));
    const gw = cs * GW, gx = x0 + Math.floor((x1 - x0 - gw) / 2), gy = top + surfH;
    const n = S.slotCount(p, f), slotW = gw / n;
    const slots = [];
    for (let i = 0; i < n; i++) { const sx = S.slotX(p, i, f); slots.push({ i, x: Math.round(gx + i * slotW), w: Math.round(slotW), cx: gx + sx * cs + cs / 2 }); }
    const ports = S.portsOf(s, pi).map((pw2, k) => ({ pw: pw2, other: s.planets[S.otherPlanet(pw2, pi)], x: 4, y: top + surfH - 12 + k * 30, w: portW, h: 27 }));
    const full = slotW >= 34;
    return { p, pi, s, f, pw, top, bottom, gx, gy, cs, gw, gh: cs * GH, slots, ports, surfaceY: gy - 1, artH: full ? 32 : 16, full, slotW };
  };
  PV.cellRect = (L, i) => { const [x, y] = S.cellXY(i); return [L.gx + x * L.cs, L.gy + y * L.cs]; };
  PV.cellAt = function (L, x, y) {
    if (x < L.gx || y < L.gy || x >= L.gx + L.gw || y >= L.gy + L.gh) return -1;
    return Math.floor((y - L.gy) / L.cs) * GW + Math.floor((x - L.gx) / L.cs);
  };
  PV.slotAt = function (L, x, y) {
    if (y < L.top || y > L.gy + 2) return null;
    for (const sl of L.slots) if (x >= sl.x && x < sl.x + sl.w) return sl;
    return null;
  };
  PV.portAt = function (L, x, y) { for (const pt of L.ports) if (x >= pt.x && x < pt.x + pt.w && y >= pt.y && y < pt.y + pt.h) return pt; return null; };
  PV.bldCenter = (L, b) => { const sl = L.slots[b.slot] || L.slots[L.slots.length - 1]; return { x: sl.cx, y: L.surfaceY - L.artH / 2 }; };

  /* ---------- the rock, baked once per planet and cell size ---------- */
  const DEP_LOOK = {
    fuel:  { base: [1, 0, 2], fleck: 24 },     // dark, oily pockets
    ice:   { base: [25, 26, 31], fleck: 31 },  // pale blue veins
    metal: { base: [10, 6, 11], fleck: 5 },    // grey-brown ore bodies
    gold:  { base: [12, 13, 14], fleck: 31 },  // small bright seams
  };
  const ROCK = [[9, 8, 10], [10, 9, 27], [3, 4, 2]];
  const bakeCache = new Map();
  function bake(L) {
    const p = L.p, key = p.rock + ':' + L.cs;
    if (bakeCache.has(key)) return bakeCache.get(key);
    const c = AS.Spr.mkCanvas(L.gw, L.gh), x = c.getContext('2d');
    const dm = S.depositMap(p), cs = L.cs;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const i = cy * GW + cx, h = S.rockAt(p, i), d = dm[i] >= 0 ? p.deposits[dm[i]] : null;
      for (let py = 0; py < cs; py++) for (let px = 0; px < cs; px++) {
        const X = cx * cs + px, Y = cy * cs + py, b = U.bayer(X, Y);
        let col;
        if (h === 3) col = ((X + Y) >> 1) % 4 === 0 ? 15 : (b < 5 ? 1 : 0);       // barrier: black slab, oxblood hatching
        else if (d) { const lk = DEP_LOOK[d.res]; col = U.hash2(X, Y, i) < 0.12 ? lk.fleck : lk.base[b < 5 ? 0 : b < 11 ? 1 : 2]; }
        else { const r = ROCK[h]; col = r[b < 6 ? 0 : b < 13 ? 1 : 2]; if (cy === 0 && py === 0) col = 28; }
        x.fillStyle = PAL[col]; x.fillRect(X, Y, 1, 1);
      }
      // layer boundaries read as faint seams
      if (cy > 0 && S.rockAt(p, i - GW) !== h && h !== 3) { x.fillStyle = PAL[h > S.rockAt(p, i - GW) ? 2 : 11]; x.fillRect(cx * cs, cy * cs, cs, 1); }
    }
    if (bakeCache.size > 40) bakeCache.clear();
    bakeCache.set(key, c);
    return c;
  }

  /* ---------- small building art for narrow slots (half-size, baked once) ---------- */
  const half = {};
  function art(kind, full) {
    const a = AS.Spr.fac[AS.BLD[kind].art];
    if (full) return a;
    if (!half[kind]) {
      const c = AS.Spr.mkCanvas(16, 16), x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(a, 0, 0, 32, 32, 0, 0, 16, 16);
      half[kind] = c;
    }
    return half[kind];
  }

  function flowDots(ctx, pts, rate, col, time, speed) {
    // pixels moving along a polyline: density and speed follow the rate per cycle
    if (rate <= 0 || pts.length < 2) return;
    let len = 0;
    const seg = [];
    for (let i = 0; i + 1 < pts.length; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); len += d; }
    const gap = U.clamp(18 / rate, 3, 22), v = (speed || 10) * (0.6 + Math.min(1.5, rate / 4));
    ctx.fillStyle = PAL[col];
    for (let d = (time * v) % gap; d < len; d += gap) {
      let k = 0, r = d;
      while (k < seg.length - 1 && r > seg[k]) { r -= seg[k]; k++; }
      const t = seg[k] ? r / seg[k] : 0;
      ctx.fillRect(Math.round(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t), Math.round(pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t), 2, 2);
    }
  }
  PV.flowDots = flowDots;
  function wear(ctx, x, y, w, h, dur) {
    if (dur >= 75) return;
    const n = Math.round((75 - dur) / 5);
    for (let i = 0; i < n; i++) D.rect(ctx, x + Math.floor(U.hash2(i, 1, 7) * w), y + Math.floor(U.hash2(i, 2, 7) * h), 1, 1, i % 3 ? 10 : 11);
    if (dur < 35) for (let i = 0; i < 3; i++) D.rect(ctx, x + Math.floor(U.hash2(i, 5, 7) * w), y + Math.floor(U.hash2(i, 6, 7) * h), 2, 1, 0);
  }

  /* ---------- draw ---------- */
  PV.draw = function (ctx, run, s, pi, time, interactive) {
    const L = PV.layout(run, s, pi), p = L.p;
    const fl = S.sysFlow(run, s);
    const sel = G.sel || {};
    // sky strip and surface
    D.rect(ctx, 0, L.top - 4, G.W - L.pw, L.gy - L.top + 4, 1);
    for (let i = 0; i < 40; i++) D.rect(ctx, Math.floor(U.hash2(i, 3, s.id) * (G.W - L.pw)), L.top + Math.floor(U.hash2(i, 4, s.id) * 26), 1, 1, [3, 4, 5][i % 3]);
    D.rect(ctx, L.gx - 2, L.gy - 2, L.gw + 4, L.gh + 4, 3);
    ctx.drawImage(bake(L), L.gx, L.gy);
    D.rect(ctx, L.gx - 1, L.gy - 2, L.gw + 2, 2, 28);
    D.rect(ctx, L.gx - 1, L.gy - 2, L.gw + 2, 1, 29);
    // deposit amounts
    for (const d of p.deposits) {
      let sx = 0, sy = 0;
      for (const c of d.cells) { const [cx, cy] = S.cellXY(c); sx += cx; sy += cy; }
      sx = L.gx + (sx / d.cells.length + 0.5) * L.cs; sy = L.gy + (sy / d.cells.length + 0.5) * L.cs;
      const txt = d.amount <= 0 ? 'EMPTY' : String(Math.round(d.amount));
      D.rect(ctx, Math.round(sx - D.tw(txt) / 2) - 1, Math.round(sy - 3), D.tw(txt) + 3, 7, 0);
      TS(ctx, txt, Math.round(sx), Math.round(sy - 2), d.amount <= 0 ? 5 : AS.RES[d.res].mark, 'center');
      if (interactive) G.tip(sx - 14, sy - 6, 28, 12, AS.RES[d.res].name + ' DEPOSIT: ' + Math.round(d.amount) + ' LEFT OF ' + d.max + ', ' + Math.round(d.depth) + ' ROWS DOWN. DEEPER DEPOSITS ARE RICHER AND FASTER TO WORK, BUT COST MORE TO REACH. ' + AS.RES[d.res].use);
    }
    // slots
    for (const sl of L.slots) {
      const b = S.bldAt(p, sl.i);
      const hov = interactive && G.pointIn(G.mouse, sl.x, L.top, sl.w, L.gy - L.top);
      if (!b) {
        D.rect(ctx, sl.x + 2, L.surfaceY - 2, sl.w - 4, 2, hov || sel.slot === sl.i ? 13 : 4);
        if (s.owner === 0 && (hov || sel.slot === sl.i || Math.floor(time * 1.5) % 2 === 0)) TB(ctx, '+', Math.round(sl.x + sl.w / 2), L.surfaceY - 12, sel.slot === sl.i ? 13 : 5, 'center');
        if (interactive && s.owner === 0) G.tip(sl.x, L.top, sl.w, L.gy - L.top, 'EMPTY SLOT ' + (sl.i + 1) + ' OF ' + L.slots.length + '. CLICK TO BUILD.');
      }
    }
    // drills (under the buildings)
    for (const b of p.blds) {
      if (!b.drill) continue;
      const st = fl.B[b.id];
      const pts = [[PV.bldCenter(L, b).x, L.gy]].concat(b.drill.path.map(c => { const [x, y] = PV.cellRect(L, c); return [x + L.cs / 2, y + L.cs / 2]; }));
      const col = b.drill.dur <= 0 ? 17 : st.status === 'ok' ? 7 : 5;
      for (let k = 0; k + 1 < pts.length; k++) { AS.Gal.line(ctx, pts[k][0] + 1, pts[k][1], pts[k + 1][0] + 1, pts[k + 1][1], 0, 0); AS.Gal.line(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], col, 0); }
      if (st.rate > 0) flowDots(ctx, pts.slice().reverse(), st.rate, AS.RES[st.res].mark, time, 12);
    }
    // the drill being dragged, with its live price
    if (G.drag && G.drag.kind === 'drill' && G.drag.sys === s.id && G.drag.pi === pi) {
      const dr = G.drag, b = S.bldById(p, dr.bld);
      if (b && dr.path.length) {
        const pts = [[PV.bldCenter(L, b).x, L.gy]].concat(dr.path.map(c => { const [x, y] = PV.cellRect(L, c); return [x + L.cs / 2, y + L.cs / 2]; }));
        const ok = dr.valid;
        for (let k = 0; k + 1 < pts.length; k++) AS.Gal.line(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ok ? 14 : 18, 2, time * 10);
        const last = pts[pts.length - 1], txt = dr.price + ' CR' + (ok ? '' : dr.hint ? '  ' + dr.hint : '');
        D.rect(ctx, Math.round(last[0] + 6), Math.round(last[1] - 6), D.tw(txt, true) + 6, 11, 0);
        TB(ctx, txt, Math.round(last[0] + 9), Math.round(last[1] - 4), ok ? 14 : 18);
      }
    }
    // conveyors on the surface
    const convY = k => L.surfaceY - 3 - (k % 3) * 3;
    let k = 0;
    for (const b of p.blds) {
      if (!b.out) continue;
      const st = fl.B[b.id], a = PV.bldCenter(L, b);
      let tx;
      if (b.out.b !== undefined) { const q = S.bldById(p, b.out.b); if (!q) continue; tx = PV.bldCenter(L, q).x; }
      else { const pt = L.ports.find(x => x.pw.id === b.out.p); if (!pt) continue; tx = pt.x + pt.w; }
      const y = convY(k++), col = b.out.dur <= 0 ? 16 : st.rate > 0 ? 29 : 4;
      D.rect(ctx, Math.min(a.x, tx), y, Math.abs(tx - a.x) + 1, 2, col);
      D.rect(ctx, Math.min(a.x, tx), y + 2, Math.abs(tx - a.x) + 1, 1, 0);
      if (st.rate > 0) flowDots(ctx, [[a.x, y], [tx, y]], st.rate, AS.RES[st.res].mark, time, 14);
      const mid = Math.round((a.x + tx) / 2);
      if (st.rate > 0) TS(ctx, (Math.round(st.rate * 10) / 10) + '/C', mid, y - 7, 7, 'center');
      if (interactive) G.tip(Math.min(a.x, tx), y - 3, Math.abs(tx - a.x), 7, 'CONVEYOR: ' + (Math.round(st.rate * 10) / 10) + ' ' + AS.RES[st.res].raw + ' PER CYCLE. ' + Math.round(b.out.dur) + '% DURABILITY.');
    }
    for (const pt of L.ports) {
      const link = p.portIn[pt.pw.id];
      if (!link) continue;
      const q = S.bldById(p, link.b);
      if (!q) continue;
      const pin = fl.ports[pi + ':' + pt.pw.id], y = convY(k++), tx = PV.bldCenter(L, q).x, x0 = pt.x + pt.w;
      D.rect(ctx, x0, y, tx - x0 + 1, 2, link.dur <= 0 ? 16 : pin && pin.in > 0 ? 29 : 4);
      D.rect(ctx, x0, y + 2, tx - x0 + 1, 1, 0);
      if (pin && pin.in > 0) flowDots(ctx, [[x0, y], [tx, y]], pin.in, AS.RES[pin.inRes].mark, time, 14);
    }
    // conveyor being dragged
    if (G.drag && G.drag.kind === 'conv' && G.drag.sys === s.id && G.drag.pi === pi) {
      const a = G.drag.from.b !== undefined ? PV.bldCenter(L, S.bldById(p, G.drag.from.b)) : (() => { const pt = L.ports.find(x => x.pw.id === G.drag.from.p); return { x: pt.x + pt.w, y: pt.y + 13 }; })();
      AS.Gal.line(ctx, a.x, L.surfaceY - 4, G.mouse.x, G.mouse.y, G.drag.valid ? 14 : 5, 2, time * 10);
    }
    // buildings
    for (const b of p.blds) {
      const sl = L.slots[b.slot];
      if (!sl) continue;
      const st = fl.B[b.id], a = art(b.kind, L.full);
      const x = Math.round(sl.cx - a.width / 2), y = L.surfaceY - a.height + 1;
      ctx.drawImage(a, x, y);
      wear(ctx, x + 2, y + 2, a.width - 4, a.height - 4, b.dur);
      if (b.dur <= 0) { ctx.globalAlpha = 0.45; D.rect(ctx, x, y, a.width, a.height, 0); ctx.globalAlpha = 1; }
      // resource badge, status light
      ctx.drawImage(AS.Spr.goods[st.res], x, y - 6);
      const lc = PV.STATUS_COL[st.status] || 5;
      D.rect(ctx, x + a.width - 5, y - 6, 5, 5, 0); D.rect(ctx, x + a.width - 4, y - 5, 3, 3, Math.floor(time * 3) % 2 && st.status === 'broken' ? 0 : lc);
      // repair icon on the building itself when it needs it
      const worst = Math.min(b.dur, b.drill ? b.drill.dur : 100, b.out ? b.out.dur : 100);
      if (s.owner === 0 && worst < 60) {
        const wx = x + Math.floor(a.width / 2) - 3, wy = y - 7;
        D.rect(ctx, wx - 1, wy - 1, 7, 7, worst <= 0 ? 17 : 12);
        ctx.drawImage(AS.Spr.icons.wrench, wx, wy);
        if (interactive) G.btns.push({ x: wx - 2, y: wy - 2, w: 9, h: 9, fn: () => AS.Act.repairBld(s.id, pi, b.id), press: true, label: 'repair' });
      }
      if (sel.bld === b.id) D.frame(ctx, x - 2, y - 8, a.width + 4, a.height + 9, 0, 13), ctx.drawImage(a, x, y);
      if (interactive) G.tip(x, y - 6, a.width, a.height + 6, PV.tipFor(run, s, pi, b, st));
    }
    // ports
    for (const pt of L.ports) {
      const po = fl.ports[pi + ':' + pt.pw.id] || { out: 0, in: 0 };
      const hov = interactive && G.pointIn(G.mouse, pt.x, pt.y, pt.w, pt.h), selp = sel.port === pt.pw.id;
      D.plate(ctx, pt.x, pt.y, pt.w, pt.h, selp ? 4 : 2);
      if (hov) D.frame(ctx, pt.x, pt.y, pt.w, pt.h, 0, 13), D.plate(ctx, pt.x + 1, pt.y + 1, pt.w - 2, pt.h - 2, 3);
      TS(ctx, 'PORT', pt.x + 4, pt.y + 3, 5);
      TS(ctx, pt.other.name.replace(/^\S+ /, ''), pt.x + pt.w - 4, pt.y + 3, 7, 'right');
      TS(ctx, '> ' + (po.out > 0 ? (Math.round(po.out * 10) / 10) + ' ' + AS.RES[po.outRes].name : '-'), pt.x + 4, pt.y + 11, po.out > 0 ? 13 : 4);
      TS(ctx, '< ' + (po.in > 0 ? (Math.round(po.in * 10) / 10) + ' ' + AS.RES[po.inRes].name : '-'), pt.x + 4, pt.y + 18, po.in > 0 ? 22 : 4);
      if (interactive) G.tip(pt.x, pt.y, pt.w, pt.h, 'PORT TO ' + pt.other.name + ' (PATHWAY ' + Math.round(pt.pw.dur) + '%). LEAVING: ' + (Math.round(po.out * 10) / 10) + ' PER CYCLE. ARRIVING: ' + (Math.round(po.in * 10) / 10) + ' PER CYCLE. DRAG AN EXTRACTOR HERE TO SEND ITS OUTPUT; DRAG FROM HERE TO A PROCESSOR TO TAKE WHAT ARRIVES.');
    }
    if (!L.ports.length && s.owner === 0) TS(ctx, 'NO PORTS: OPEN A', 6, L.gy, 4), TS(ctx, 'PATHWAY IN THE', 6, L.gy + 7, 4), TS(ctx, 'SYSTEM VIEW', 6, L.gy + 14, 4);
    // tutorial pointer
    const hl = AS.Tutorial && AS.Tutorial.highlight();
    if (hl && hl.planet === pi && hl.sys === s.id) {
      let px = null, py = null;
      if (hl.kind === 'slot') { const sl = L.slots[hl.slot] || L.slots[0]; px = sl.cx; py = L.surfaceY - 30; }
      else if (hl.kind === 'deposit') { const d = p.deposits[hl.dep]; if (d) { const [x, y] = PV.cellRect(L, d.cells[0]); px = x + L.cs / 2; py = y - 4; } }
      else if (hl.kind === 'bld') { const b = S.bldById(p, hl.bld); if (b) { const c = PV.bldCenter(L, b); px = c.x; py = c.y - 22; } }
      else if (hl.kind === 'port') { const pt = L.ports[0]; if (pt) { px = pt.x + pt.w / 2; py = pt.y - 2; } }
      if (px !== null) AS.SysView.pointer(ctx, Math.round(px), Math.round(py), time);
    }
    AS.Gal.drawParts(ctx, 'planet');
    return L;
  };
  PV.tipFor = function (run, s, pi, b, st) {
    const R = AS.BLD[b.kind], p = s.planets[pi];
    let t = R.name + ': ' + st.reason + '. ';
    if (st.role === 'ext') {
      if (b.drill) { const d = p.deposits[b.drill.dep]; t += 'DRILLS ' + AS.RES[st.res].name + ' (' + Math.round(d.amount) + ' LEFT), ' + (Math.round(st.rate * 10) / 10) + ' PER CYCLE'; }
      else t += 'DRAG DOWN FROM IT TO A ' + AS.RES[st.res].name + ' DEPOSIT TO DRILL';
      if (st.dest !== undefined) t += ' > ' + AS.BLD[S.bldById(s.planets[st.destPlanet], st.dest).kind].name + (st.via !== null ? ' ON ' + s.planets[st.destPlanet].name + ' (BY PATHWAY)' : '');
      else if (b.drill) t += '. DRAG IT TO A ' + AS.BLD[AS.RES[st.res].proc].name + ' OR A PORT';
    } else {
      t += 'TAKES ' + (Math.round(st.input * 10) / 10) + ' ' + AS.RES[st.res].raw + ', MAKES ' + (Math.round(st.output * 10) / 10) + ' ' + AS.RES[st.res].outName + ' PER CYCLE';
      if (S.procBonus(p, b.kind) > 1) t += ' (+50% ON THIS PLANET)';
    }
    return t + '. ' + Math.round(b.dur) + '% DURABILITY.';
  };
})(globalThis.AS = globalThis.AS || {});
