/* ATLAS SYNDICATE v7 — render/system.js
   The system view: the star and its planets on slow cosmetic orbits, and the pathways between them.
   A pathway is only a road: it shows cargo moving (and how much per cycle) only when something flows.
   Each planet carries a summary row: what it extracts, what it processes, and a status light. */
(function (AS) {
  'use strict';

  const U = AS.U, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw, TAU = U.TAU;
  const SV = AS.SysView = {};
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const TB = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: true, big: true, align });
  const TILT = 0.44;

  SV.layout = function (run, s) {
    const left = G.mapLeft(), top = G.HUD_H + 4, bottom = G.mapBottom() - 4, aw = G.W - left;
    const cx = Math.round(left + aw / 2), cy = Math.round((top + bottom) / 2) - 6;
    const rmax = Math.min(aw / 2 - 34, (bottom - top) / 2 / TILT - 30), r0 = 40;
    const nodes = s.planets.map((p, i) => {
      const r = r0 + (rmax - r0) * p.orbit, a = p.phase + run.t * TAU / p.period;
      return { idx: i, x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r * TILT), r, a, size: Math.min(p.size, 11), p };
    });
    return { cx, cy, nodes, left, top, bottom };
  };
  SV.nodeAt = function (L, x, y) {
    let best = null, bd = 99;
    for (const n of L.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < Math.max(12, n.size + 5) && d < bd) { bd = d; best = n; } }
    return best;
  };
  function body(s, n) { const p = n.p; return { key: 's' + s.id + 'p' + n.idx, id: s.id * 10 + n.idx, r: n.r, size: n.size, kind: p.kind, spin: p.spin, x: Math.cos(n.a) * n.r, z: Math.sin(n.a) * n.r, sx: n.x, sy: n.y }; }
  function rail(ctx, a, b, col, dark, dashed, time) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(1, Math.hypot(dx, dy)), px = -dy / len, py = dx / len;
    for (const [o, c, d] of [[0, 0, 2], [0, col, 0], [1, col, 0], [-1, col, 0], [2, dark, 0]]) AS.Gal.line(ctx, a.x + px * o, a.y + py * o + d, b.x + px * o, b.y + py * o + d, c, dashed ? 2 : 0, time * 8);
  }
  /** Worst status on a planet: red if workers are missing, amber if anything is idle or blocked, green if all work. */
  SV.planetStatus = function (fl, p) {
    let worst = p.blds.length ? 'ok' : 'none';
    for (const b of p.blds) { const st = fl.B[b.id].status; if (st === 'nocrew') return 'nocrew'; if (st !== 'ok' && st !== 'empty') worst = 'idle'; }
    return worst;
  };

  SV.draw = function (ctx, run, s, time, interactive) {
    const L = SV.layout(run, s), fl = S.sysFlow(run, s);
    for (const n of L.nodes) {
      const steps = Math.round(n.r * 2.2);
      ctx.fillStyle = PAL[3];
      for (let i = 0; i < steps; i++) { if (i % 3 === 2) continue; const a = i / steps * TAU; ctx.fillRect(Math.round(L.cx + Math.cos(a) * n.r), Math.round(L.cy + Math.sin(a) * n.r * TILT), 1, 1); }
    }
    ctx.drawImage(AS.Spr.star, L.cx - 20, L.cy - 20);
    // pathways
    for (const pw of s.pathways) {
      const a = L.nodes[pw.a], b = L.nodes[pw.b], P = fl.P[pw.id];
      const sel = G.sel && G.sel.pathway === pw.id, dead = false;
      rail(ctx, a, b, sel ? 14 : 6, 3, P && !P.ok, time);
      const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
      if (P && P.ab > 0) { AS.PlanetView.flowDots(ctx, [[a.x, a.y], [b.x, b.y]], P.ab, AS.RES[P.res.ab].mark, time, 16); TS(ctx, '>' + (Math.round(P.ab * 10) / 10) + ' ' + AS.RES[P.res.ab].raw, mid.x, mid.y - 9, AS.RES[P.res.ab].mark, 'center'); }
      if (P && P.ba > 0) { AS.PlanetView.flowDots(ctx, [[b.x, b.y], [a.x, a.y]], P.ba, AS.RES[P.res.ba].mark, time, 16); TS(ctx, '<' + (Math.round(P.ba * 10) / 10) + ' ' + AS.RES[P.res.ba].raw, mid.x, mid.y + 4, AS.RES[P.res.ba].mark, 'center'); }
      if (P && !P.ab && !P.ba && !dead) TS(ctx, 'EMPTY', mid.x, mid.y - 3, 4, 'center');
      if (interactive) G.tip(mid.x - 16, mid.y - 8, 32, 16, 'PATHWAY ' + a.p.name + ' - ' + b.p.name + ': ' + (P ? (Math.round(P.ab * 10) / 10) + ' AND ' + (Math.round(P.ba * 10) / 10) : 0) + ' UNITS PER CYCLE (MAX ' + Math.round(P ? P.cap : 0) + ' EACH WAY). A PATHWAY IS ONLY A ROAD: CONNECT EXTRACTORS TO ITS PORTS IN THE PLANET VIEW.');
    }
    if (G.drag && G.drag.kind === 'pathway') {
      const a = L.nodes[G.drag.from], b = G.drag.over !== null && G.drag.over !== undefined ? L.nodes[G.drag.over] : { x: G.mouse.x, y: G.mouse.y };
      rail(ctx, a, b, G.drag.valid ? 14 : 5, 0, true, time);
    }
    const hl = AS.Tutorial && AS.Tutorial.highlight();
    for (const n of L.nodes) {
      const b = body(s, n), p = n.p;
      ctx.drawImage(AS.Spr.planet(b, time, s.owner >= 0 ? Math.min(1, p.blds.length / 6) : 0), n.x - n.size - 1, n.y - n.size - 1);
      if (p.kind === 'gas') AS.Spr.drawRing(ctx, b, true);
      // summary row: extracts, processes, status light
      const exts = [...new Set(p.blds.filter(x => AS.BLD[x.kind].role === 'ext').map(x => AS.BLD[x.kind].res))];
      const procs = [...new Set(p.blds.filter(x => AS.BLD[x.kind].role !== 'ext').map(x => (AS.BLD[x.kind].role === 'farm' ? 'food' : AS.RES[AS.BLD[x.kind].res].out)))];
      const stt = SV.planetStatus(fl, p);
      const w = 8 + exts.length * 6 + (procs.length ? 4 + procs.length * 6 : 0), x0 = n.x - Math.round(w / 2), y0 = n.y + n.size + 4;
      if (p.blds.length) {
        D.frame(ctx, x0 - 1, y0 - 1, w + 2, 8, 1, 3);
        let x = x0 + 1;
        D.rect(ctx, x, y0 + 1, 4, 4, { ok: 22, idle: 13, nocrew: Math.floor(time * 3) % 2 ? 17 : 0 }[stt] || 5); x += 6;
        for (const r of exts) { ctx.drawImage(AS.Spr.goods[r], x, y0 + 1); x += 6; }
        if (procs.length) { D.rect(ctx, x, y0 + 3, 2, 1, 5); x += 4; for (const r of procs) { ctx.drawImage(AS.Spr.goods[r], x, y0 + 1); x += 6; } }
      }
      const free = S.slotCount(p, s.owner >= 0 ? run.factions[s.owner] : null) - p.blds.length;
      TS(ctx, p.name.replace(/^\S+ /, '') + '  ' + free + ' FREE', n.x, y0 + (p.blds.length ? 9 : 1), G.sel && G.sel.planet === n.idx ? 13 : 6, 'center');
      if (hl && hl.kind === 'planet' && hl.sys === s.id && hl.planet === n.idx) SV.pointer(ctx, n.x, n.y - n.size - 6, time);
      if (interactive) G.tip(n.x - n.size - 3, n.y - n.size - 3, n.size * 2 + 6, n.size * 2 + 22, SV.planetTip(run, s, n.idx, fl));
    }
    AS.Gal.drawParts(ctx, 'system');
    return L;
  };
  SV.planetTip = function (run, s, pi, fl) {
    const p = s.planets[pi], f = s.owner >= 0 ? run.factions[s.owner] : null;
    const deps = {};
    for (const d of p.deposits) if (d.amount > 0) deps[d.res] = (deps[d.res] || 0) + Math.round(d.amount);
    const bonus = AS.BLD_KEYS.filter(k => S.procBonus(p, k) > 1).map(k => AS.BLD[k].name + 'S');
    return p.name + ': ' + S.slotCount(p, f) + ' SLOTS (' + p.blds.length + ' USED). UNDERGROUND: ' + (Object.keys(deps).map(r => deps[r] + ' ' + AS.RES[r].name).join(', ') || 'NOTHING LEFT') + '. ' +
      (bonus.length ? bonus.join(' AND ') + ' WORK 50% BETTER HERE. ' : '') + (s.owner === 0 ? 'CLICK TO OPEN THE PLANET. DRAG TO ANOTHER PLANET FOR A PATHWAY.' : '') + (fl ? '' : '');
  };
  SV.pointer = function (ctx, x, y, time) {
    const b = Math.round(Math.sin(time * 6) * 2);
    ctx.fillStyle = PAL[13];
    for (let i = 0; i < 5; i++) ctx.fillRect(x - i, y - 8 + b + i, 1 + i * 2, 1);
    ctx.fillStyle = PAL[0]; ctx.fillRect(x - 4, y - 8 + b + 5, 9, 1);
    ctx.fillStyle = PAL[13]; ctx.fillRect(x - 1, y - 14 + b, 3, 6);
  };
  void TB;
})(globalThis.AS = globalThis.AS || {});
