/* ATLAS SYNDICATE v6 — ui/input.js
   Mouse, keyboard and touch (pointer events, so touch works the same way).
   Galaxy: click your system = open it; click another = details; drag from your system onto another =
           move or attack (the order panel shows odds and fuel first); drag empty space = pan.
   System: click a planet = open it; drag planet -> planet = open a pathway; click a pathway = select it.
   Planet: click an empty slot = build menu; drag DOWN from an extractor = drill (follows the pointer cell
           by cell, stops at barriers, live price); drag ACROSS from an extractor to a processor or a port =
           conveyor; drag from a port to a processor = take what arrives. Right-click or Esc = back. */
(function (AS) {
  'use strict';

  const S = AS.S, G = AS.G, Act = AS.Act;
  const In = AS.Input = {};

  function canvasPos(e) {
    const r = G.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * G.W / Math.max(1, r.width), y: (e.clientY - r.top) * G.H / Math.max(1, r.height) };
  }
  const inMap = p => p.y > G.HUD_H && p.y < G.mapBottom();
  const playing = () => G.mode === 'play' && G.run && !G.screen && !G.ff;
  const sys = () => (G.run && G.sysId >= 0 ? G.run.systems[G.sysId] : null);

  /* ---------- drilling: extend the path one cell at a time toward the pointer ---------- */
  function drillTo(dr, L, cell) {
    const p = L.p, GW = S.GW;
    if (cell < 0) return;
    const at = dr.path.indexOf(cell);
    if (at >= 0) { dr.path.length = at + 1; return; }      // backing up trims the path
    let guard = 0;
    while (dr.path[dr.path.length - 1] !== cell && guard++ < 64) {
      const last = dr.path[dr.path.length - 1];
      const [lx, ly] = S.cellXY(last), [tx, ty] = S.cellXY(cell);
      const opts = [];
      if (tx !== lx) opts.push([lx + Math.sign(tx - lx), ly]);
      if (ty !== ly) opts.push([lx, ly + Math.sign(ty - ly)]);
      // take the step along the longer axis first; avoid barriers and cells already used
      opts.sort((a, b) => (Math.abs(tx - b[0]) + Math.abs(ty - b[1])) - (Math.abs(tx - a[0]) + Math.abs(ty - a[1])));
      let moved = false;
      for (const [nx, ny] of opts) {
        const j = ny * GW + nx;
        if (S.rockAt(p, j) === 3) { dr.hint = 'BARRIER'; continue; }
        if (dr.path.indexOf(j) >= 0) continue;
        dr.path.push(j); moved = true; break;
      }
      if (!moved) break;
    }
  }
  function drillState(dr, run, L) {
    const s = sys(), f = run.factions[0], p = L.p, b = S.bldById(p, dr.bld);
    const chk = S.checkDrill(f, p, b, dr.path);
    dr.price = S.drillPrice(f, p, dr.path);
    dr.valid = chk.ok;
    if (!chk.ok) dr.hint = chk.reason === 'barrier' ? 'BARRIER' : chk.reason === 'nodeposit' ? 'REACH ' + AS.RES[AS.BLD[b.kind].res].name : '';
    void s;
  }

  function down(e) {
    AS.Sfx.init();
    G.touch = e.pointerType === 'touch';
    const p = canvasPos(e);
    G.pointers.set(e.pointerId, p);
    G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = true; G.mouse.down = true;
    try { G.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (G.pointers.size === 2 && playing() && G.view === 'galaxy') {
      const [a, b] = [...G.pointers.values()];
      G.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; G.pan = null; G.drag = null;
      return;
    }
    if (G.pointers.size > 1) return;
    if (G.attract) { AS.Main.attractClick(); return; }
    const btn = G.buttonAt(p.x, p.y);
    if (btn) { if (btn.press) G.pressed = { x: btn.x, y: btn.y, t: G.time + 0.12 }; if (e.button === 0) btn.fn(); return; }
    if (!playing() || !inMap(p)) return;
    const run = G.run;
    if (e.button === 2) { if (G.view !== 'galaxy') Act.back(); else { G.order = null; G.sel = null; } return; }
    if (G.view === 'planet') {
      const s = sys(), L = AS.PlanetView.layout(run, s, G.planet);
      if (p.x >= G.W - L.pw) return;
      const sl = AS.PlanetView.slotAt(L, p.x, p.y), b = sl ? S.bldAt(L.p, sl.i) : null, pt = AS.PlanetView.portAt(L, p.x, p.y);
      G.drag = { kind: 'press', sx: p.x, sy: p.y, slot: sl ? sl.i : -1, bld: b ? b.id : -1, port: pt ? pt.pw.id : -1, sys: s.id, pi: G.planet };
      return;
    }
    if (G.view === 'system') {
      const s = sys(), L = AS.SysView.layout(run, s);
      if (p.x >= G.W - L.pw) return;
      const n = AS.SysView.nodeAt(L, p.x, p.y);
      G.drag = { kind: 'press', sx: p.x, sy: p.y, node: n ? n.idx : -1 };
      return;
    }
    G.order = null;
    const hit = AS.Gal.systemAt(run, p.x, p.y);
    G.drag = hit && hit.owner === 0 && run.phase === 'play' ? { kind: 'army', from: hit.id, sx: p.x, sy: p.y, moved: false, over: -1, valid: false } : null;
    G.stopCam();
    G.pan = { sx: p.x, sy: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, samples: [[performance.now(), p.x, p.y]] };
  }
  function move(e) {
    const p = canvasPos(e);
    if (G.pointers.has(e.pointerId)) G.pointers.set(e.pointerId, p);
    G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = true;
    if (G.pinch && G.pointers.size === 2) {
      const [a, b] = [...G.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), r = d / G.pinch.d0;
      if (r > 1.3 || r < 0.77) { G.zoomStep(r > 1 ? 1 : -1, (a.x + b.x) / 2, (a.y + b.y) / 2); G.pinch.d0 = d; }
      return;
    }
    const run = G.run, dr = G.drag;
    if (dr && G.mouse.down && playing()) {
      const far = Math.hypot(p.x - dr.sx, p.y - dr.sy) > (G.touch ? 7 : 4);
      if (G.view === 'planet') {
        const s = sys(), L = AS.PlanetView.layout(run, s, G.planet);
        if (dr.kind === 'press' && far && s.owner === 0) {
          const b = dr.bld >= 0 ? S.bldById(L.p, dr.bld) : null;
          const isExt = b && AS.BLD[b.kind].role === 'ext';
          const down = p.y - dr.sy > Math.abs(p.x - dr.sx);   // dragging downward means drilling; across means a conveyor
          if (isExt && !b.drill && down) G.drag = { kind: 'drill', sys: s.id, pi: G.planet, bld: b.id, path: [S.slotX(L.p, b.slot, run.factions[0])], price: 0, valid: false };
          else if (isExt) G.drag = { kind: 'conv', sys: s.id, pi: G.planet, from: { b: b.id }, valid: false };
          else if (dr.port >= 0) G.drag = { kind: 'conv', sys: s.id, pi: G.planet, from: { p: dr.port }, valid: false };
        }
        const d2 = G.drag;
        if (d2 && d2.kind === 'drill') { drillTo(d2, L, AS.PlanetView.cellAt(L, p.x, p.y)); drillState(d2, run, L); }
        if (d2 && d2.kind === 'conv') {
          const sl = AS.PlanetView.slotAt(L, p.x, p.y), q = sl ? S.bldAt(L.p, sl.i) : null, pt = AS.PlanetView.portAt(L, p.x, p.y);
          d2.to = q && AS.BLD[q.kind].role === 'proc' ? { b: q.id } : pt && d2.from.b !== undefined ? { p: pt.pw.id } : null;
          d2.valid = !!d2.to;
        }
        return;
      }
      if (G.view === 'system') {
        if (dr.kind === 'press' && far && dr.node >= 0 && sys().owner === 0) G.drag = { kind: 'pathway', from: dr.node, over: null, valid: false };
        const d2 = G.drag;
        if (d2 && d2.kind === 'pathway') { const n = AS.SysView.nodeAt(AS.SysView.layout(run, sys()), p.x, p.y); d2.over = n && n.idx !== d2.from ? n.idx : null; d2.valid = d2.over !== null; }
        return;
      }
      if (dr.kind === 'army') {
        if (far) dr.moved = true;
        if (dr.moved) {
          const h = AS.Gal.systemAt(run, p.x, p.y);
          dr.over = h && h.id !== dr.from ? h.id : -1;
          dr.valid = dr.over >= 0 && !!S.path(run, dr.from, dr.over, 0);
          G.pan = null;
          return;
        }
      }
    }
    if (G.pan) {
      if (Math.hypot(p.x - G.pan.sx, p.y - G.pan.sy) > (G.touch ? 6 : 3)) G.pan.moved = true;
      if (G.pan.moved) {
        G.cam.x = G.pan.cx - (p.x - G.pan.sx) / G.cam.zr; G.cam.y = G.pan.cy - (p.y - G.pan.sy) / G.cam.zr;
        G.clampCam();
        G.pan.samples.push([performance.now(), p.x, p.y]);
        if (G.pan.samples.length > 6) G.pan.samples.shift();
      }
    }
    if (playing() && G.view === 'galaxy') { const h = AS.Gal.systemAt(run, p.x, p.y); G.hoverSys = h ? h.id : -1; }
  }
  function up(e) {
    const p = canvasPos(e);
    G.pointers.delete(e.pointerId);
    G.mouse.down = false;
    if (G.pinch) { if (G.pointers.size < 2) G.pinch = null; G.pan = null; G.drag = null; return; }
    G.mouse.x = p.x; G.mouse.y = p.y;
    if (G.touch) G.mouse.inside = false;
    const pan = G.pan, dr = G.drag;
    G.pan = null; G.drag = null;
    if (!playing() || !dr && G.view !== 'galaxy') return;
    const run = G.run;
    if (G.view === 'planet') {
      if (dr.kind === 'drill') { if (dr.valid) Act.drill(dr.sys, dr.pi, dr.bld, dr.path); else if (dr.path.length > 1) G.showToast(dr.hint === 'BARRIER' ? 'BARRIERS CANNOT BE DRILLED: GO AROUND' : 'END THE DRILL ON A ' + AS.RES[AS.BLD[S.bldById(run.systems[dr.sys].planets[dr.pi], dr.bld).kind].res].name + ' DEPOSIT', 18); return; }
      if (dr.kind === 'conv') { if (dr.valid) Act.connect(dr.sys, dr.pi, dr.from, dr.to); return; }
      // a click
      if (dr.bld >= 0) G.sel = { bld: dr.bld };
      else if (dr.port >= 0) G.sel = { port: dr.port };
      else if (dr.slot >= 0) G.sel = { slot: dr.slot };
      else G.sel = null;
      AS.Sfx.play('click');
      return;
    }
    if (G.view === 'system') {
      if (dr.kind === 'pathway') { if (dr.valid) Act.pathway(G.sysId, dr.from, dr.over); return; }
      if (dr.node >= 0) { Act.openPlanet(dr.node); return; }
      const s = sys(), L = AS.SysView.layout(run, s);
      const pw = s.pathways.find(x => { const a = L.nodes[x.a], b = L.nodes[x.b]; return AS.U.distToSeg(p.x, p.y, a.x, a.y, b.x, b.y) < 5; });
      G.sel = pw ? { pathway: pw.id } : null;
      return;
    }
    if (dr && dr.kind === 'army' && dr.moved) { if (dr.over >= 0) Act.prepareOrder(dr.from, dr.over); return; }
    if (pan && pan.moved) {
      const sm = pan.samples, a = sm[0], b = sm[sm.length - 1], dt = (b[0] - a[0]) / 1000;
      if (dt > 0 && performance.now() - b[0] < 80) { G.cam.vx = -(b[1] - a[1]) / dt / G.cam.zr; G.cam.vy = -(b[2] - a[2]) / dt / G.cam.zr; }
      return;
    }
    if (!pan) return;
    const hit = AS.Gal.systemAt(run, p.x, p.y);
    if (run.phase === 'home') {
      if (hit && S.homeCandidates(run).indexOf(hit.id) >= 0) AS.Main.chooseHome(hit.id);
      else G.showToast('PICK ONE OF THE FLASHING SYSTEMS AT THE ARM TIPS', 13);
      return;
    }
    if (!hit) { G.sel = null; return; }
    if (hit.owner === 0) Act.openSystem(hit.id);
    else { G.sel = { sys: hit.id }; AS.Sfx.play('click'); }
  }
  function wheel(e) {
    e.preventDefault();
    if (!playing() || G.view !== 'galaxy') return;
    const p = canvasPos(e);
    if (!inMap(p)) return;
    const now = performance.now();
    if (now - (In.lastWheel || 0) < 110) return;
    In.lastWheel = now;
    G.zoomStep(e.deltaY < 0 ? 1 : -1, p.x, p.y);
  }
  const PANK = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'dn', s: 'dn', S: 'dn' };
  function key(e, isDown) {
    if (e.target && e.target.id === 'kbd' && e.key !== 'Escape') return;
    const k = e.key;
    if (!G.focusField && PANK[k]) { G.keys[PANK[k]] = isDown; if (playing()) e.preventDefault(); }
    if (!isDown) return;
    AS.Sfx.init();
    if (k === 'F9') { e.preventDefault(); AS.Main.presenterJump(); return; }
    if (G.attract) { if (k === 'Escape') AS.Main.exitAttract(); return; }
    if (G.screen) { if (AS.Screens.key(e)) e.preventDefault(); return; }
    if (G.mode !== 'play' || !G.run || G.ff) return;
    if (k === ' ' || k === 'Spacebar') { Act.togglePause(); e.preventDefault(); }
    else if (k === '1' || k === '2' || k === '3') Act.setSpeed(AS.CONFIG.sim.hudSpeeds[+k - 1]);
    else if (k === 'm' || k === 'M') Act.toggleMute();
    else if (k === 't' || k === 'T') Act.toggleTips();
    else if (k === 'u' || k === 'U') AS.Screens.open('shop');
    else if (k === 'q' || k === 'Q') G.zoomStep(-1);
    else if (k === 'e' || k === 'E') G.zoomStep(1);
    else if (k === 'Escape') {
      if (G.drag) G.drag = null;
      else if (G.order) G.order = null;
      else if (G.warnOpen) G.warnOpen = false;
      else if (G.view !== 'galaxy') { if (G.sel) G.sel = null; else Act.back(); }
      else if (G.sel) G.sel = null;
      else Act.openPause();
    }
  }

  In.bind = function () {
    const c = G.canvas;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => { G.pointers.delete(e.pointerId); G.pan = null; G.pinch = null; G.drag = null; });
    c.addEventListener('pointerleave', () => { if (!G.mouse.down) G.mouse.inside = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', e => key(e, true));
    window.addEventListener('keyup', e => key(e, false));
    window.addEventListener('blur', () => { G.keys = {}; });
    const kbd = document.getElementById('kbd');
    if (kbd) kbd.addEventListener('input', () => { if (G.focusField) G.focusField.value = kbd.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, G.focusField.max); });
    if (kbd) kbd.addEventListener('keydown', e => { if (e.key === 'Enter' && G.focusField) { G.focusField.onEnter(G.focusField.value.trim()); kbd.blur(); } });
  };
  In.update = function (dt) {
    if (!playing() || G.view !== 'galaxy') return;
    const k = G.keys, sp = 260 / G.cam.zr;
    const tx = ((k.r ? 1 : 0) - (k.l ? 1 : 0)) * sp, ty = ((k.dn ? 1 : 0) - (k.u ? 1 : 0)) * sp;
    if (tx || ty) {
      G.cam.tc = null; G.cam.anchor = null;
      const a = 1 - Math.exp(-dt * 9);
      G.cam.vx += (tx - G.cam.vx) * a; G.cam.vy += (ty - G.cam.vy) * a;
    }
  };
})(globalThis.AS = globalThis.AS || {});
