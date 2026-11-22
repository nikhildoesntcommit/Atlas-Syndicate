/* ATLAS SYNDICATE v5 — render/system.js
   The system view (Mini Metro): a star, 3-6 planets on slow cosmetic orbits, the station with its
   factory, and the supply lines you draw between them. Freighters shuttle along each line; worn
   buildings show rust and cracks; broken chains show a warning; income floats up every cycle. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw, TAU = U.TAU;
  const SV = AS.SysView = {};
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  SV.LINE_COLS = [13, 17, 25, 22, 18, 31];
  const TILT = 0.42;

  SV.panelW = () => Math.round(U.clamp(G.W * 0.3, 158, 210));
  /** Screen layout for the open system: star centre, orbit sizes, node positions (station = -1). */
  SV.layout = function (run, s, time) {
    const pw = SV.panelW(), top = G.HUD_H + 4, bottom = G.mapBottom() - 4;
    const cx = Math.round((G.W - pw) / 2), cy = Math.round((top + bottom) / 2) - 4;
    const rmax = Math.min((G.W - pw) / 2 - 22, (bottom - top) / 2 / TILT - 24);
    const r0 = 34;
    const nodes = s.planets.map((p, i) => {
      const r = r0 + (rmax - r0) * p.orbit;
      const a = p.phase + (run.t + time * 0) * TAU / p.period;
      return { idx: i, x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r * TILT), r, a, size: Math.min(p.size, 10), p };
    });
    const station = { idx: -1, x: cx, y: cy + 26, size: 9 };
    return { cx, cy, rmax, r0, nodes, station, pw, top, bottom, node: i => (i === -1 ? station : nodes[i]) };
  };
  SV.nodeAt = function (L, x, y) {
    let best = null, bd = 99;
    for (const n of L.nodes.concat([L.station])) { const d = Math.hypot(n.x - x, n.y - y); if (d < Math.max(10, n.size + 4) && d < bd) { bd = d; best = n; } }
    return best;
  };
  SV.lineAt = function (run, s, L, x, y) {
    for (let li = s.lines.length - 1; li >= 0; li--) {
      const l = s.lines[li];
      for (let i = 0; i + 1 < l.stops.length; i++) {
        const a = L.node(l.stops[i]), b = L.node(l.stops[i + 1]);
        const o = offs(li);
        if (U.distToSeg(x, y, a.x + o, a.y + o, b.x + o, b.y + o) < 4) return l;
      }
    }
    return null;
  };
  const offs = li => (li - 1) * 4;

  /* planet adapter for the v4 planet renderer (light comes from the star) */
  function body(s, n) {
    const p = n.p;
    return { key: 's' + s.id + 'p' + n.idx, id: s.id * 10 + n.idx, r: n.r, size: n.size, kind: p.kind, spin: p.spin, x: Math.cos(n.a) * n.r, z: Math.sin(n.a) * n.r, sx: n.x, sy: n.y };
  }

  function thick(ctx, x0, y0, x1, y1, col, dark, dashed, time) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.max(1, Math.hypot(dx, dy));
    const px = -dy / len, py = dx / len;
    // a 3-pixel rail: soot shadow, two lines of colour, a darker edge
    for (const [o, c, dy] of [[0, 0, 2], [0, col, 0], [1, col, 0], [-1, col, 0], [2, dark, 0]]) {
      AS.Gal.line(ctx, x0 + px * o, y0 + py * o + dy, x1 + px * o, y1 + py * o + dy, c, dashed ? 2 : 0, time * 8);
    }
  }

  SV.draw = function (ctx, run, s, time, interactive) {
    const L = SV.layout(run, s, time);
    const f = s.owner >= 0 ? run.factions[s.owner] : null;
    const y = S.sysYield(run, s);
    // orbits
    for (const n of L.nodes) {
      const steps = Math.round(n.r * 2.2);
      ctx.fillStyle = PAL[3];
      for (let i = 0; i < steps; i++) { if (i % 3 === 2) continue; const a = i / steps * TAU; ctx.fillRect(Math.round(L.cx + Math.cos(a) * n.r), Math.round(L.cy + Math.sin(a) * n.r * TILT), 1, 1); }
    }
    ctx.drawImage(AS.Spr.star, L.cx - 20, L.cy - 20);
    // lines
    s.lines.forEach((l, li) => {
      const col = SV.LINE_COLS[li % SV.LINE_COLS.length], eff = y.eff[li];
      const sel = G.sel && G.sel.line === l.id;
      for (let i = 0; i + 1 < l.stops.length; i++) {
        const a = L.node(l.stops[i]), b = L.node(l.stops[i + 1]), o = offs(li);
        const dead = l.dur <= 0 || eff <= 0;
        thick(ctx, a.x + o, a.y + o, b.x + o, b.y + o, dead ? 16 : col, dead ? 15 : sel ? 31 : [11, 16, 24, 21, 10, 6][li % 6], dead, time);
      }
    });
    // draft line being dragged
    if (G.drag && G.drag.kind === 'line') {
      const a = L.node(G.drag.from);
      const tgt = G.drag.over !== undefined && G.drag.over !== null ? L.node(G.drag.over) : { x: G.mouse.x, y: G.mouse.y };
      thick(ctx, a.x, a.y, tgt.x, tgt.y, G.drag.valid ? 14 : 5, 0, true, time);
    }
    // station (the factory)
    const st = L.station;
    ctx.drawImage(AS.Spr.fac.fab, st.x - 16, st.y - 22);
    wear(ctx, st.x - 10, st.y - 10, 20, 10, s.station.dur, time);
    // planets
    const tut = AS.Tutorial && AS.Tutorial.highlight();
    for (const n of L.nodes) {
      const b = body(s, n), p = n.p;
      const img = AS.Spr.planet(b, time, s.owner >= 0 ? Math.min(1, s.pop / 20) : 0);
      ctx.drawImage(img, n.x - n.size - 1, n.y - n.size - 1);
      if (p.kind === 'gas') { AS.Spr.drawRing(ctx, b, true); }
      // resource badge + richness pips
      const bx = n.x - 4, by = n.y - n.size - 10;
      D.frame(ctx, bx - 1, by - 1, 9, 7, 1, p.ext ? (p.ext.dur <= 0 ? 17 : 4) : 2);
      ctx.drawImage(AS.Spr.goods[p.type], bx + 1, by);
      for (let k = 0; k < p.rich; k++) D.rect(ctx, bx + 9 + k * 2, by + 3, 1, 2, 13);
      if (p.ext) {
        // extractor rig on the planet's crown, worn as durability falls
        const rx = n.x - 2, ry = n.y - n.size - 2;
        D.rect(ctx, rx, ry, 5, 3, p.ext.dur <= 0 ? 4 : 6); D.rect(ctx, rx + 2, ry - 2, 1, 2, 5);
        if (p.ext.dur < 60) D.rect(ctx, rx + 1, ry + 1, 1, 1, 11);
        if (p.ext.dur < 35) D.rect(ctx, rx + 3, ry, 1, 1, 10);
        if (p.ext.dur <= 0 && Math.floor(time * 3) % 2) { D.rect(ctx, rx - 1, ry - 1, 1, 1, 17); D.rect(ctx, rx + 5, ry + 3, 1, 1, 17); }
        if (s.lastYield && s.lastYield.per[n.idx] > 0 && G.cam) { /* floats come from FX */ }
        const unl = y.per[n.idx].frac <= 0 && p.ext.dur > 0;
        if (unl && Math.floor(time * 2) % 2) T(ctx, '!', n.x + n.size + 2, n.y - n.size - 4, 18);
      } else if (interactive && s.owner === 0) {
        if (Math.floor(time * 2) % 2 === 0) TS(ctx, '+', n.x + n.size + 2, n.y - 3, 13);
      }
      if (tut && tut.kind === 'planet' && tut.idx === n.idx) pointer(ctx, n.x, n.y - n.size - 12, time);
      const rate = y.per[n.idx].u;
      if (rate > 0) TS(ctx, '+' + (Math.round(rate * 10) / 10), n.x, n.y + n.size + 3, AS.RES[p.type].col, 'center');
      if (interactive) G.tip(n.x - n.size - 2, n.y - n.size - 12, n.size * 2 + 14, n.size * 2 + 14, planetTip(run, s, n, y));
    }
    if (tut && tut.kind === 'station') pointer(ctx, st.x, st.y - 26, time);
    // freighters shuttle back and forth along each line
    s.lines.forEach((l, li) => {
      if (l.fr <= 0 || l.stops.length < 2) return;
      const pts = l.stops.map(i => L.node(i));
      const segs = [];
      let total = 0;
      for (let i = 0; i + 1 < pts.length; i++) { const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); segs.push(d); total += d; }
      const moving = y.eff[li] > 0;
      const speed = 26 * (f ? f.mods.reach : 1);
      for (let k = 0; k < Math.min(l.fr, 6); k++) {
        let u = moving ? ((time * speed / total) + k / l.fr) % 2 : k / Math.max(1, l.fr) * 0.3;
        const back = u > 1;
        if (back) u = 2 - u;
        let dist = u * total, i = 0;
        while (i < segs.length - 1 && dist > segs[i]) { dist -= segs[i]; i++; }
        const a = pts[i], b = pts[i + 1], t = segs[i] ? dist / segs[i] : 0;
        const x = a.x + (b.x - a.x) * t + offs(li), yy = a.y + (b.y - a.y) * t + offs(li);
        const dirx = (b.x - a.x) * (back ? -1 : 1);
        const flip = dirx < 0 ? 1 : 0;
        const cargoFrom = l.stops[back ? i : i + 1];
        const pod = cargoFrom >= 0 && s.planets[cargoFrom].ext ? AS.RES[s.planets[cargoFrom].type].col : 5;
        if (moving) { ctx.fillStyle = PAL[4]; for (let q = 1; q < 4; q++) if (U.bayer(q, Math.floor(time * 8)) < 9) ctx.fillRect(Math.round(x - (flip ? -1 : 1) * (8 + q * 2)), Math.round(yy), 1, 1); }
        AS.Spr.drawFreighter(ctx, Math.round(x - 8), Math.round(yy - 3), flip, Math.floor(time * 6) % 2, pod, back ? 0 : 2);
      }
    });
    AS.Gal.drawParts(ctx, 'system');
    // warnings strip under the map
    const W0 = [];
    for (const [k, i] of y.warn) {
      const txt = { station: 'FACTORY BROKEN - REPAIR IT', noenergy: 'FACTORY NEEDS ENERGY', noore: 'FACTORY NEEDS ORE', nofood: 'NOT ENOUGH FOOD - POPULATION SHRINKING',
        unlinked: 'PLANET NOT CONNECTED', broken: 'EXTRACTOR BROKEN', linebroken: 'LINE BROKEN', slow: 'LINE SHORT OF FREIGHTERS', nofr: 'LINE HAS NO FREIGHTER',
        fleet: 'FREIGHTERS BROKEN', storm: 'SOLAR STORM: LINES STOPPED' }[k];
      if (txt && W0.indexOf(txt) < 0) W0.push(txt);
      void i;
    }
    W0.slice(0, 3).forEach((t, i) => {
      const w = D.tw(t) + 12, x = G.W - L.pw - w - 4, yy = L.top + 16 + i * 12;   // below the toast line
      D.frame(ctx, x, yy, w, 10, 1, 17);
      D.rect(ctx, x + 1, yy + 1, 2, 8, 17);
      TS(ctx, t, x + 7, yy + 3, Math.floor(time * 2) % 2 ? 18 : 7);
    });
    return L;
  };
  function wear(ctx, x, y, w, h, dur, time) {
    if (dur >= 70) return;
    const n = Math.round((70 - dur) / 6);
    for (let i = 0; i < n; i++) D.rect(ctx, x + Math.floor(U.hash2(i, 1, 9) * w), y + Math.floor(U.hash2(i, 2, 9) * h), 1, 1, i % 2 ? 11 : 10);
    if (dur <= 0 && Math.floor(time * 3) % 2) T(ctx, 'X', x + w / 2, y, 17, { align: 'center' });
  }
  function pointer(ctx, x, y, time) {
    const b = Math.round(Math.sin(time * 6) * 2);
    ctx.fillStyle = PAL[13];
    for (let i = 0; i < 4; i++) ctx.fillRect(x - i, y - 6 + b + i, 1 + i * 2, 1);
    ctx.fillStyle = PAL[0]; ctx.fillRect(x - 3, y - 6 + b + 4, 7, 1);
  }
  SV.pointer = pointer;
  function planetTip(run, s, n, y) {
    const p = n.p, R = AS.RES[p.type];
    let t = R.name + ' PLANET, RICHNESS ' + p.rich + '. ';
    if (!p.ext) t += s.owner === 0 ? 'CLICK TO BUILD AN EXTRACTOR (' + S.price(run, run.factions[0], 'ext') + ' CR): ' + p.rich * C.econ.perRich + ' ' + R.name + ' PER CYCLE. ' : '';
    else t += 'EXTRACTOR ' + Math.round(p.ext.dur) + '% DURABILITY. ' + (y.per[n.idx].frac > 0 ? 'DELIVERING ' + (Math.round(y.per[n.idx].u * 10) / 10) + ' PER CYCLE. ' : 'NOT CONNECTED: DRAG A LINE FROM THE STATION OR A CONNECTED PLANET. ');
    return t + R.help;
  }
})(globalThis.AS = globalThis.AS || {});
