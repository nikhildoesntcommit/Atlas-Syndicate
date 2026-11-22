/* ATLAS SYNDICATE v5 — ui/input.js
   Mouse, keyboard and touch (pointer events, so touch works the same way).
   Galaxy: click your system = open it; click another = details; drag from your system onto another =
           move or attack (the order panel shows the odds before you confirm); drag empty space = pan.
   System: click a planet = build an extractor; drag station/planet -> planet = draw or extend a line;
           click a line = select it; right-click or Esc = back to the galaxy. */
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
    if (e.button === 2) { if (G.view === 'system') Act.backToGalaxy(); else { G.order = null; G.sel = null; } return; }
    if (G.view === 'system') {
      const s = sys();
      if (!s) return;
      const L = AS.SysView.layout(run, s, G.time);
      if (p.x >= G.W - L.pw) return;
      const n = AS.SysView.nodeAt(L, p.x, p.y);
      G.drag = { kind: n && s.owner === 0 ? 'line' : 'none', from: n ? n.idx : null, sx: p.x, sy: p.y, moved: false, over: null, valid: false };
      return;
    }
    G.order = null;
    const hit = AS.Gal.systemAt(run, p.x, p.y);
    if (hit && hit.owner === 0 && run.phase === 'play') G.drag = { kind: 'army', from: hit.id, sx: p.x, sy: p.y, moved: false, over: -1, valid: false };
    else G.drag = null;
    G.stopCam();
    G.pan = { sx: p.x, sy: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, samples: [[performance.now(), p.x, p.y]], hit: hit ? hit.id : -1 };
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
    const run = G.run;
    if (G.drag && G.mouse.down) {
      const dr = G.drag;
      if (Math.hypot(p.x - dr.sx, p.y - dr.sy) > (G.touch ? 7 : 4)) dr.moved = true;
      if (dr.kind === 'army' && dr.moved) {
        const h = AS.Gal.systemAt(run, p.x, p.y);
        dr.over = h && h.id !== dr.from ? h.id : -1;
        dr.valid = dr.over >= 0 && !!S.path(run, dr.from, dr.over, 0);
        G.pan = null;
        return;
      }
      if (dr.kind === 'line' && dr.moved) {
        const L = AS.SysView.layout(run, sys(), G.time);
        const n = AS.SysView.nodeAt(L, p.x, p.y);
        dr.over = n && n.idx !== dr.from ? n.idx : null;
        dr.valid = dr.over !== null;
        return;
      }
    }
    if (G.pan) {
      if (Math.hypot(p.x - G.pan.sx, p.y - G.pan.sy) > (G.touch ? 6 : 3)) G.pan.moved = true;
      if (G.pan.moved) {
        G.cam.x = G.pan.cx - (p.x - G.pan.sx) / G.cam.zr;
        G.cam.y = G.pan.cy - (p.y - G.pan.sy) / G.cam.zr;
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
    if (!playing()) return;
    const run = G.run;
    if (G.view === 'system') {
      const s = sys();
      if (!dr || !s) return;
      if (dr.kind === 'line' && dr.moved) { if (dr.valid) Act.do('line', { sys: s.id, a: dr.from, b: dr.over }); return; }
      if (dr.moved) return;
      const L = AS.SysView.layout(run, s, G.time);
      if (dr.from !== null && dr.from >= 0) {
        const pl = s.planets[dr.from];
        if (s.owner === 0 && !pl.ext) { const r = Act.do('ext', { sys: s.id, planet: dr.from }); if (r.ok) G.showToast(AS.RES[pl.type].name + ' EXTRACTOR BUILT - NOW CONNECT IT WITH A LINE', 13); return; }
        G.sel = { planet: dr.from }; AS.Sfx.play('click'); return;
      }
      const l = AS.SysView.lineAt(run, s, L, p.x, p.y);
      if (l) { G.sel = { line: l.id }; AS.Sfx.play('click'); } else G.sel = null;
      return;
    }
    // galaxy
    if (dr && dr.kind === 'army' && dr.moved) { if (dr.over >= 0) Act.prepareOrder(dr.from, dr.over); return; }
    if (pan && pan.moved) {
      const sm = pan.samples, a = sm[0], b = sm[sm.length - 1], dt = (b[0] - a[0]) / 1000;
      if (dt > 0 && performance.now() - b[0] < 80) { G.cam.vx = -(b[1] - a[1]) / dt / G.cam.zr; G.cam.vy = -(b[2] - a[2]) / dt / G.cam.zr; }
      return;
    }
    const hit = AS.Gal.systemAt(run, p.x, p.y);
    if (run.phase === 'home') {
      if (hit && S.homeCandidates(run).indexOf(hit.id) >= 0) AS.Main.chooseHome(hit.id);
      else G.showToast('PICK ONE OF THE FLASHING SYSTEMS IN THE OUTER ARMS', 13);
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
    else if (k === 'q' || k === 'Q') G.zoomStep(-1);
    else if (k === 'e' || k === 'E') G.zoomStep(1);
    else if (k === 'Escape') {
      if (G.order) G.order = null;
      else if (G.view === 'system') { if (G.sel) G.sel = null; else Act.backToGalaxy(); }
      else if (G.sel) G.sel = null;
      else Act.openPause();
    } else if ((k === 'Delete' || k === 'Backspace') && G.view === 'system' && G.sel && G.sel.line !== undefined) { Act.do('unline', { sys: G.sysId, line: G.sel.line }, 'remove'); G.sel = null; e.preventDefault(); }
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
