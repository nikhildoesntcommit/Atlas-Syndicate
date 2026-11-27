/* ATLAS SYNDICATE v7 — render/planet.js
   The planet view: a side-on cross-section. The ground fills the bottom of the screen from edge to edge:
   layered rock with hard layers, barriers and visible deposits showing what is left in them. Buildings
   stand on the surface strip above it. Ports (one per pathway, the connectors to the other planets) sit
   above the surface on the left, each labelled with the planet it leads to and what flows each way.
   Everything that flows is animated at a speed and density that follow the real rate. Every building
   has a status light, its level, and a one-line reason. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw;
  const PV = AS.PlanetView = {};
  const TB = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, big: true, align });
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const GW = C.ground.w, GH = C.ground.h;
  PV.STATUS_COL = { ok: 22, idle: 13, blocked: 18, empty: 5, nocrew: 17 };
  const r1 = v => Math.round(v * 10) / 10;

  /** Screen layout of the open planet. */
  PV.layout = function (run, s, pi) {
    const p = s.planets[pi], f = s.owner >= 0 ? run.factions[s.owner] : null;
    const areaL = G.mapLeft(), areaR = G.W, top = G.HUD_H, bottom = G.mapBottom();
    const areaW = areaR - areaL;
    const xs = [];
    for (let i = 0; i <= GW; i++) xs.push(areaL + Math.round(i * areaW / GW));
    const cw = areaW / GW;
    const skyMin = 86;
    const ch = U.clamp(Math.floor((bottom - top - skyMin) / GH), 4, Math.max(4, Math.ceil(cw)));
    const gh = ch * GH, gy = bottom - gh;
    const n = S.slotCount(p, f), slotW = areaW / n;
    const colMid = c => (xs[c] + xs[c + 1]) / 2;
    const slots = [];
    for (let i = 0; i < n; i++) slots.push({ i, x: Math.round(areaL + i * slotW), w: Math.round(slotW), cx: Math.round(colMid(S.slotX(p, i, f))) });
    const full = slotW >= 34, artH = full ? 32 : 16;
    const portW = 84, portH = 27;
    const py = Math.max(top + 4, gy - artH - 12 - portH - 8);
    const ports = S.portsOf(s, pi).map((pw2, k) => ({ pw: pw2, other: s.planets[S.otherPlanet(pw2, pi)], x: areaL + 4 + k * (portW + 6), y: py, w: portW, h: portH }));
    return { p, pi, s, f, areaL, areaR, areaW, top, bottom, xs, cw, ch, gx: areaL, gy, gw: areaW, gh, slots, ports, surfaceY: gy - 1, artH, full, slotW, portY: py };
  };
  /** [x, y, w, h] of an underground cell. */
  PV.cellRect = (L, i) => { const [x, y] = S.cellXY(i); return [L.xs[x], L.gy + y * L.ch, L.xs[x + 1] - L.xs[x], L.ch]; };
  PV.cellMid = (L, i) => { const r = PV.cellRect(L, i); return [r[0] + r[2] / 2, r[1] + r[3] / 2]; };
  PV.cellAt = function (L, x, y) {
    if (x < L.areaL || y < L.gy || x >= L.areaR || y >= L.gy + L.gh) return -1;
    let c = Math.min(GW - 1, Math.floor((x - L.areaL) / L.cw));
    while (c > 0 && x < L.xs[c]) c--;
    while (c < GW - 1 && x >= L.xs[c + 1]) c++;
    return Math.floor((y - L.gy) / L.ch) * GW + c;
  };
  PV.slotAt = function (L, x, y) {
    if (y < L.portY + (L.ports.length ? 30 : 0) || y > L.gy + 2) return null;
    for (const sl of L.slots) if (x >= sl.x && x < sl.x + sl.w) return sl;
    return null;
  };
  PV.portAt = function (L, x, y) { for (const pt of L.ports) if (x >= pt.x && x < pt.x + pt.w && y >= pt.y && y < pt.y + pt.h) return pt; return null; };
  PV.bldCenter = (L, b) => { const sl = L.slots[b.slot] || L.slots[L.slots.length - 1]; return { x: sl.cx, y: L.surfaceY - L.artH / 2 }; };

  /* ---------- the rock, baked once per planet and layout ---------- */
  const DEP_LOOK = {
    fuel: { base: [1, 0, 2], fleck: 24 },     // dark, oily pockets of crude
    ice:  { base: [25, 26, 31], fleck: 31 },  // pale blue veins
    gold: { base: [12, 13, 14], fleck: 31 },  // bright seams
  };
  const ROCK = [[9, 8, 10], [10, 9, 27], [3, 4, 2]];
  const bakeCache = new Map();
  function bake(L) {
    const p = L.p, key = p.rock + ':' + L.areaW + ':' + L.ch;
    if (bakeCache.has(key)) return bakeCache.get(key);
    const c = AS.Spr.mkCanvas(L.gw, L.gh), x = c.getContext('2d');
    const dm = S.depositMap(p), ch = L.ch;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const i = cy * GW + cx, h = S.rockAt(p, i), d = dm[i] >= 0 ? p.deposits[dm[i]] : null;
      const x0 = L.xs[cx] - L.areaL, cw = L.xs[cx + 1] - L.xs[cx];
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
        const X = x0 + px, Y = cy * ch + py, b = U.bayer(X, Y);
        let col;
        if (h === 3) col = ((X + Y) >> 1) % 4 === 0 ? 15 : (b < 5 ? 1 : 0);       // barrier: black slab, oxblood hatching
        else if (d) { const lk = DEP_LOOK[d.res] || DEP_LOOK.gold; col = U.hash2(X, Y, i) < 0.12 ? lk.fleck : lk.base[b < 5 ? 0 : b < 11 ? 1 : 2]; }
        else { const r = ROCK[h]; col = r[b < 6 ? 0 : b < 13 ? 1 : 2]; if (cy === 0 && py === 0) col = 28; }
        x.fillStyle = PAL[col]; x.fillRect(X, Y, 1, 1);
      }
      if (cy > 0 && S.rockAt(p, i - GW) !== h && h !== 3) { x.fillStyle = PAL[h > S.rockAt(p, i - GW) ? 2 : 11]; x.fillRect(x0, cy * ch, cw, 1); }
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
  /** A conveyor drawn as a belt polyline (2px + shadow). */
  function belt(ctx, pts, col) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      if (ay === by) { D.rect(ctx, Math.min(ax, bx), ay, Math.abs(bx - ax) + 2, 2, col); D.rect(ctx, Math.min(ax, bx), ay + 2, Math.abs(bx - ax) + 2, 1, 0); }
      else { D.rect(ctx, ax, Math.min(ay, by), 2, Math.abs(by - ay) + 2, col); D.rect(ctx, ax + 2, Math.min(ay, by), 1, Math.abs(by - ay) + 2, 0); }
    }
  }
  /** The route of a conveyor from a building (or port) to a building (or port), along the surface. */
  PV.convPts = function (L, k, fromX, toX, toPort, fromPort) {
    const y = L.surfaceY - 3 - (k % 4) * 3;
    const pts = [];
    if (fromPort) pts.push([fromPort.x + fromPort.w / 2, fromPort.y + fromPort.h]);
    pts.push([Math.round(fromX), y]);
    pts.push([Math.round(toX), y]);
    if (toPort) pts.push([toPort.x + toPort.w / 2, toPort.y + toPort.h]);
    return pts.map(q => [Math.round(q[0]), Math.round(q[1])]);
  };

  /* ---------- draw ---------- */
  PV.draw = function (ctx, run, s, pi, time, interactive) {
    const L = PV.layout(run, s, pi), p = L.p;
    const fl = S.sysFlow(run, s);
    const sel = G.sel || {};
    // sky, then the ground from edge to edge
    D.rect(ctx, L.areaL, L.top, L.areaW, L.gy - L.top, 1);
    for (let i = 0; i < 50; i++) D.rect(ctx, L.areaL + Math.floor(U.hash2(i, 3, s.id) * L.areaW), L.top + Math.floor(U.hash2(i, 4, s.id) * (L.gy - L.top - 40)), 1, 1, [3, 4, 5][i % 3]);
    ctx.drawImage(bake(L), L.areaL, L.gy);
    D.rect(ctx, L.areaL, L.gy - 2, L.areaW, 2, 28);
    D.rect(ctx, L.areaL, L.gy - 2, L.areaW, 1, 29);
    // deposit amounts
    for (const d of p.deposits) {
      let sx = 0, sy = 0;
      for (const c of d.cells) { const [mx, my] = PV.cellMid(L, c); sx += mx; sy += my; }
      sx /= d.cells.length; sy /= d.cells.length;
      const txt = d.amount <= 0 ? 'EMPTY' : AS.RES[d.res].name + ' ' + Math.round(d.amount);
      const tw = D.tw(txt);
      D.rect(ctx, Math.round(sx - tw / 2) - 2, Math.round(sy - 4), tw + 4, 8, 0);
      TS(ctx, txt, Math.round(sx), Math.round(sy - 2), d.amount <= 0 ? 5 : AS.RES[d.res].mark, 'center');
      if (interactive) G.tip(sx - tw / 2 - 2, sy - 6, tw + 4, 12, AS.RES[d.res].name + ' DEPOSIT: ' + Math.round(d.amount) + ' LEFT OF ' + d.max + ', ' + Math.round(d.depth) + ' ROWS DOWN. DEEPER DEPOSITS ARE RICHER AND FASTER TO WORK, BUT COST MORE TO REACH. ' + AS.RES[d.res].use);
    }
    // slots
    for (const sl of L.slots) {
      const b = S.bldAt(p, sl.i);
      const hov = interactive && G.pointIn(G.mouse, sl.x, L.surfaceY - L.artH - 8, sl.w, L.artH + 10);
      if (!b) {
        D.rect(ctx, sl.x + 2, L.surfaceY - 2, sl.w - 4, 2, hov || sel.slot === sl.i ? 13 : 4);
        if (s.owner === 0) {
          const on = hov || sel.slot === sl.i;
          D.frame(ctx, sl.cx - 6, L.surfaceY - 18, 13, 13, on ? 3 : 1, on ? 13 : 4);
          TB(ctx, '+', sl.cx + 1, L.surfaceY - 15, on ? 13 : 5, 'center');
          if (interactive) G.tip(sl.x, L.surfaceY - L.artH - 8, sl.w, L.artH + 10, 'EMPTY SLOT ' + (sl.i + 1) + ' OF ' + L.slots.length + '. CLICK TO BUILD.');
        }
      }
    }
    // drills (under the buildings)
    for (const b of p.blds) {
      if (!b.drill) continue;
      const st = fl.B[b.id];
      const pts = [[PV.bldCenter(L, b).x, L.gy]].concat(b.drill.path.map(c => PV.cellMid(L, c)));
      const col = st.status === 'ok' ? 7 : 5;
      for (let k = 0; k + 1 < pts.length; k++) { AS.Gal.line(ctx, pts[k][0] + 1, pts[k][1], pts[k + 1][0] + 1, pts[k + 1][1], 0, 0); AS.Gal.line(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], col, 0); }
      if (st.rate > 0) flowDots(ctx, pts.slice().reverse(), st.rate, AS.RES[st.res].mark, time, 12);
    }
    // the drill being dragged, with its live price
    if (G.drag && G.drag.kind === 'drill' && G.drag.sys === s.id && G.drag.pi === pi) {
      const dr = G.drag, b = S.bldById(p, dr.bld);
      if (b && dr.path.length) {
        const pts = [[PV.bldCenter(L, b).x, L.gy]].concat(dr.path.map(c => PV.cellMid(L, c)));
        const ok = dr.valid;
        for (let k = 0; k + 1 < pts.length; k++) AS.Gal.line(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ok ? 14 : 18, 2, time * 10);
        const last = pts[pts.length - 1], txt = '$' + dr.price + (ok ? '' : dr.hint ? '  ' + dr.hint : '');
        D.rect(ctx, Math.round(last[0] + 6), Math.round(last[1] - 6), D.tw(txt, true) + 6, 11, 0);
        TB(ctx, txt, Math.round(last[0] + 9), Math.round(last[1] - 4), ok ? 14 : 18);
      }
    }
    // port pylons, then conveyors on the surface
    for (const pt of L.ports) { const px = pt.x + pt.w / 2 - 1; D.rect(ctx, px - 1, pt.y + pt.h, 4, L.surfaceY - pt.y - pt.h, 0); D.rect(ctx, px, pt.y + pt.h, 2, L.surfaceY - pt.y - pt.h, 4); }
    let k = 0;
    for (const b of p.blds) {
      if (!b.out) continue;
      const st = fl.B[b.id], a = PV.bldCenter(L, b);
      let pts;
      if (b.out.b !== undefined) { const q = S.bldById(p, b.out.b); if (!q) continue; pts = PV.convPts(L, k++, a.x, PV.bldCenter(L, q).x); }
      else { const pt = L.ports.find(x => x.pw.id === b.out.p); if (!pt) continue; pts = PV.convPts(L, k++, a.x, pt.x + pt.w / 2, pt); }
      belt(ctx, pts, st.rate > 0 ? 29 : 4);
      if (st.rate > 0) flowDots(ctx, pts, st.rate, AS.RES[st.res].mark, time, 14);
      if (interactive) { const y = pts[0][1], x0 = Math.min(pts[0][0], pts[1][0]); G.tip(x0, y - 3, Math.abs(pts[1][0] - pts[0][0]) + 2, 7, 'CONVEYOR: ' + r1(st.rate) + ' ' + AS.RES[st.res].raw + ' PER CYCLE.'); }
    }
    for (const pt of L.ports) {
      const link = p.portIn[pt.pw.id];
      if (!link) continue;
      const q = S.bldById(p, link.b);
      if (!q) continue;
      const pin = fl.ports[pi + ':' + pt.pw.id];
      const pts = PV.convPts(L, k++, pt.x + pt.w / 2 + 3, PV.bldCenter(L, q).x, null, pt);
      belt(ctx, pts, pin && pin.in > 0 ? 29 : 4);
      if (pin && pin.in > 0) flowDots(ctx, pts, pin.in, AS.RES[pin.inRes].mark, time, 14);
    }
    // conveyor being dragged
    if (G.drag && G.drag.kind === 'conv' && G.drag.sys === s.id && G.drag.pi === pi) {
      const a = G.drag.from.b !== undefined ? PV.bldCenter(L, S.bldById(p, G.drag.from.b)) : (() => { const pt = L.ports.find(x => x.pw.id === G.drag.from.p); return { x: pt.x + pt.w / 2, y: pt.y + pt.h }; })();
      AS.Gal.line(ctx, a.x, a.y, G.mouse.x, G.mouse.y, G.drag.valid ? 14 : 5, 2, time * 10);
    }
    // buildings
    for (const b of p.blds) {
      const sl = L.slots[b.slot];
      if (!sl) continue;
      const st = fl.B[b.id], a = art(b.kind, L.full);
      const x = Math.round(sl.cx - a.width / 2), y = L.surfaceY - a.height + 1;
      ctx.drawImage(a, x, y);
      if (st.status === 'nocrew') { ctx.globalAlpha = 0.5; D.rect(ctx, x, y, a.width, a.height, 0); ctx.globalAlpha = 1; }
      // what it makes, status light, level pips
      ctx.drawImage(AS.HUD.bldIcon(b.kind), x, y - 7);
      const lc = PV.STATUS_COL[st.status] || 5;
      D.rect(ctx, x + a.width - 5, y - 7, 5, 5, 0); D.rect(ctx, x + a.width - 4, y - 6, 3, 3, Math.floor(time * 3) % 2 && (st.status === 'nocrew' || st.status === 'blocked') ? 0 : lc);
      for (let i = 1; i < (b.lvl || 1); i++) D.rect(ctx, x + 7 + (i - 1) * 3, y - 5, 2, 2, 13);
      if (sel.bld === b.id) { D.frame(ctx, x - 2, y - 9, a.width + 4, a.height + 10, 0, 13); ctx.drawImage(a, x, y); }
      if (interactive) G.tip(x, y - 7, a.width, a.height + 7, PV.tipFor(run, s, pi, b, st));
    }
    // ports: the connectors to the other planets, labelled
    for (const pt of L.ports) {
      const po = fl.ports[pi + ':' + pt.pw.id] || { out: 0, in: 0 };
      const hov = interactive && G.pointIn(G.mouse, pt.x, pt.y, pt.w, pt.h), selp = sel.port === pt.pw.id;
      D.rect(ctx, pt.x + 2, pt.y + 2, pt.w, pt.h, 0);
      D.plate(ctx, pt.x, pt.y, pt.w, pt.h, selp ? 4 : 2);
      if (hov || selp) D.frame(ctx, pt.x, pt.y, pt.w, pt.h, selp ? 4 : 3, 13);
      D.rect(ctx, pt.x + 1, pt.y + 1, pt.w - 2, 7, 3);
      TS(ctx, 'PORT TO ' + pt.other.name.replace(/^\S+ /, ''), pt.x + 4, pt.y + 2, 31);
      TS(ctx, 'OUT > ' + (po.out > 0 ? r1(po.out) + ' ' + AS.RES[po.outRes].raw : '-'), pt.x + 4, pt.y + 11, po.out > 0 ? 13 : 4);
      TS(ctx, 'IN  < ' + (po.in > 0 ? r1(po.in) + ' ' + AS.RES[po.inRes].raw : '-'), pt.x + 4, pt.y + 18, po.in > 0 ? 22 : 4);
      if (interactive) G.tip(pt.x, pt.y, pt.w, pt.h, 'PORT: THE PATHWAY TO ' + pt.other.name + '. OUT: ' + r1(po.out) + ' PER CYCLE. IN: ' + r1(po.in) + ' PER CYCLE. DRAG AN ICE DRILL OR FUEL PUMP ONTO IT TO SEND ITS OUTPUT; DRAG FROM IT ONTO A PROCESSOR TO TAKE WHAT ARRIVES.');
    }
    if (!L.ports.length && s.owner === 0) {
      const x = L.areaL + 4, y = L.portY;
      D.frame(ctx, x, y, 118, 27, 1, 3);
      TS(ctx, 'NO PORTS ON THIS PLANET', x + 4, y + 3, 6);
      TS(ctx, 'OPEN A PATHWAY IN THE SYSTEM', x + 4, y + 11, 4);
      TS(ctx, 'VIEW TO LINK IT TO ANOTHER', x + 4, y + 18, 4);
      if (interactive) G.tip(x, y, 118, 27, 'PORTS CONNECT THIS PLANET TO THE OTHERS IN THE SYSTEM. GO BACK (ESC) AND DRAG FROM ONE PLANET ONTO ANOTHER TO OPEN A PATHWAY: BOTH GET A PORT HERE.');
    }
    // tutorial pointer
    const hl = AS.Tutorial && AS.Tutorial.highlight();
    if (hl && hl.planet === pi && hl.sys === s.id) {
      let px = null, py = null;
      if (hl.kind === 'slot') { const sl = L.slots[hl.slot] || L.slots[0]; px = sl.cx; py = L.surfaceY - 22; }
      else if (hl.kind === 'deposit') { const d = p.deposits[hl.dep]; if (d) { const [x, y] = PV.cellMid(L, d.cells[0]); px = x; py = y - 4; } }
      else if (hl.kind === 'bld') { const b = S.bldById(p, hl.bld); if (b) { const c = PV.bldCenter(L, b); px = c.x; py = c.y - 24; } }
      else if (hl.kind === 'port') { const pt = L.ports[0]; if (pt) { px = pt.x + pt.w / 2; py = pt.y - 2; } }
      if (px !== null) AS.SysView.pointer(ctx, Math.round(px), Math.round(py), time);
    }
    AS.Gal.drawParts(ctx, 'planet');
    return L;
  };
  /** What a building is doing, in numbers. */
  PV.rateText = function (run, s, pi, b, st) {
    const R = AS.BLD[b.kind], p = s.planets[pi];
    if (st.role === 'ext') {
      if (!b.drill) return 'DRAG DOWN FROM IT TO A ' + AS.RES[st.res].name + ' DEPOSIT TO DRILL. HARD ROCK COSTS MORE; BARRIERS CANNOT BE CROSSED.';
      const d = p.deposits[b.drill.dep];
      let t = 'DIGS ' + r1(st.rate) + ' ' + AS.RES[st.res].raw + ' PER CYCLE (' + Math.round(d.amount) + ' LEFT)';
      if (!AS.RES[st.res].proc) return t + ', STRAIGHT TO YOUR GOLD STOCK.';
      if (st.dest !== undefined) t += ' > ' + AS.BLD[S.bldById(s.planets[st.destPlanet], st.dest).kind].name + (st.via !== null ? ' ON ' + s.planets[st.destPlanet].name + ' (BY PATHWAY)' : '');
      return t + '.';
    }
    if (st.role === 'farm') return 'DRINKS ' + r1(st.water) + ' WATER, GROWS ' + r1(st.potential) + ' FOOD PER CYCLE' + (S.procBonus(p, b.kind) > 1 ? ' (+50% ON THIS PLANET)' : '') + '. WATER COMES FROM YOUR STOCK: NO CONVEYOR NEEDED.';
    return 'TAKES ' + r1(st.input) + ' OF ' + r1(E_CAP(b)) + ' ' + AS.RES[st.res].raw + ', MAKES ' + r1(st.output) + ' ' + AS.STOCK[AS.RES[st.res].out].name + ' PER CYCLE' + (S.procBonus(p, b.kind) > 1 ? ' (+50% ON THIS PLANET)' : '') + '.';
  };
  const E_CAP = b => C.econ.procCap * S.lvlMult(b);
  PV.tipFor = function (run, s, pi, b, st) {
    return AS.BLD[b.kind].name + ' (LEVEL ' + (b.lvl || 1) + '): ' + st.reason + '. ' + PV.rateText(run, s, pi, b, st) + ' CLICK FOR DETAILS AND UPGRADES.';
  };
})(globalThis.AS = globalThis.AS || {});
