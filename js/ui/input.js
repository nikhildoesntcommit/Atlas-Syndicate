/* ATLAS SYNDICATE v4 — ui/input.js
   Mouse, keyboard and touch. Tap = click, drag from a world = route, drag space = pan, pinch = zoom. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, W = AS.World, Act = AS.Act;
  const In = AS.Input = {};

  function canvasPos(e) {
    const r = G.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * G.W / Math.max(1, r.width), y: (e.clientY - r.top) * G.H / Math.max(1, r.height) };
  }
  const inMap = p => p.y > G.HUD_H && p.y < G.mapBottom();
  const playing = () => G.mode === 'play' && G.run && !G.screen && !G.ff;

  function down(e) {
    AS.Sfx.init();
    G.touch = e.pointerType === 'touch';
    const p = canvasPos(e);
    G.pointers.set(e.pointerId, p);
    G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = true; G.mouse.down = true;
    G.wm = G.toWorld(p.x, p.y);
    try { G.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (G.pointers.size === 2 && playing()) {   // pinch
      const [a, b] = [...G.pointers.values()];
      G.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      G.drag = null; G.pan = null;
      return;
    }
    if (G.pointers.size > 1) return;
    if (G.attract) { if (e.button === 0) AS.Main.attractClick(); return; }
    const btn = G.buttonAt(p.x, p.y);
    if (btn) {
      if (btn.press) G.pressed = { x: btn.x, y: btn.y, t: G.time + 0.12 };
      if (e.button === 0) btn.fn();
      return;
    }
    if (!playing()) return;
    const run = G.run;
    if (e.button === 1 || (e.button === 2 && inMap(p))) { G.pan = { sx: p.x, sy: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, button: e.button }; return; }
    if (e.button !== 0 || run.over) return;
    G.popup = null;
    if (!inMap(p)) return;
    const body = W.bodyAt(run, G.wm.x, G.wm.y);
    if (body) { G.drag = { from: body, sx: p.x, sy: p.y, moved: false }; return; }
    G.pan = { sx: p.x, sy: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, button: 0 };
  }
  function move(e) {
    const p = canvasPos(e);
    if (G.pointers.has(e.pointerId)) G.pointers.set(e.pointerId, p);
    G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = true;
    G.wm = G.toWorld(p.x, p.y);
    if (G.pinch && G.pointers.size === 2) {
      const [a, b] = [...G.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = d / G.pinch.d0;
      if (r > 1.35 || r < 0.74) { G.zoomStep(r > 1 ? 1 : -1, (a.x + b.x) / 2, (a.y + b.y) / 2); G.pinch.d0 = d; }
      return;
    }
    const thr = G.touch ? 8 : 4;
    if (G.drag && Math.hypot(p.x - G.drag.sx, p.y - G.drag.sy) > thr) G.drag.moved = true;
    if (G.pan) {
      if (Math.hypot(p.x - G.pan.sx, p.y - G.pan.sy) > thr - 1) G.pan.moved = true;
      if (G.pan.moved) { G.cam.gx = null; G.cam.x = G.pan.cx - (p.x - G.pan.sx) / G.cam.z; G.cam.y = G.pan.cy - (p.y - G.pan.sy) / G.cam.z; G.clampCam(); }
    }
  }
  function up(e) {
    const p = canvasPos(e);
    G.pointers.delete(e.pointerId);
    G.mouse.down = false;
    if (G.pinch) { if (G.pointers.size < 2) G.pinch = null; G.drag = null; G.pan = null; return; }
    G.mouse.x = p.x; G.mouse.y = p.y;
    G.wm = G.toWorld(p.x, p.y);
    if (G.touch) G.mouse.inside = false;
    const run = G.run;
    if (G.pan) {
      const pan = G.pan;
      G.pan = null;
      if (!pan.moved && playing() && inMap(p)) {
        const r = W.routeAt(run, G.wm.x, G.wm.y);
        if (pan.button === 2) { if (r) Act.removeRoute(r); else { G.sel = null; G.popup = null; } }
        else if (pan.button === 0) { if (r) { G.sel = { kind: 'route', id: r.id }; AS.Sfx.play('click'); } else G.sel = null; }
      }
      return;
    }
    if (!G.drag || !playing()) { G.drag = null; return; }
    const from = G.drag.from, target = W.bodyAt(run, G.wm.x, G.wm.y);
    if (G.drag.moved && target && target !== from) {
      const res = Act.do('route', { a: from.id, b: target.id });
      if (res.ok) {
        G.sel = { kind: 'route', id: res.route.id };
        if (!S.routeFreighters(run, res.route).length) G.showToast('ROUTE OPEN - PRESS + TO ADD A FREIGHTER', 13);
      }
    } else if (!G.drag.moved) { G.sel = { kind: 'body', id: from.id }; AS.Sfx.play('click'); }
    G.drag = null;
  }
  function wheel(e) {
    e.preventDefault();
    if (!playing()) return;
    const p = canvasPos(e);
    if (!inMap(p)) return;
    G.zoomStep(e.deltaY < 0 ? 1 : -1, p.x, p.y);
  }
  const PANK = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'dn', s: 'dn', S: 'dn' };
  function key(e, isDown) {
    if (e.target && e.target.id === 'kbd' && e.key !== 'Escape') return;   // the hidden keyboard field handles its own typing
    const k = e.key;
    if (!G.focusField && PANK[k]) { G.keys[PANK[k]] = isDown; if (playing()) e.preventDefault(); }
    if (!isDown) return;
    AS.Sfx.init();
    if (k === 'F9') { e.preventDefault(); AS.Main.presenterJump(); return; }
    if (G.attract) { if (k === 'Escape') AS.Main.exitAttract(); return; }
    if (G.screen) { if (AS.Screens.key(e)) e.preventDefault(); return; }
    if (G.mode !== 'play' || !G.run || G.ff) return;
    const run = G.run;
    if (k === ' ' || k === 'Spacebar') { Act.togglePause(); e.preventDefault(); }
    else if (k === '1' || k === '2' || k === '3') Act.setSpeed(AS.CONFIG.sim.hudSpeeds[+k - 1]);
    else if (k === 'm' || k === 'M') Act.toggleMute();
    else if (k === 't' || k === 'T') Act.toggleTips();
    else if (k === 'f' || k === 'F') Act.buyFreighter();
    else if (k === 'q' || k === 'Q') G.zoomStep(-1);
    else if (k === 'e' || k === 'E') G.zoomStep(1);
    else if (k === 'r' || k === 'R') G.fitView(run, true);
    else if (k === 'Escape') {
      if (G.popup) G.popup = null;
      else if (AS.Onboard.active() && AS.Onboard.st.step < 4) AS.Onboard.skip();
      else if (G.sel) G.sel = null;
      else Act.openPause();
    } else if (k === '+' || k === '=' || k === 'Add') { const r = selRoute(); if (r) Act.freighters(r, 1); else G.showToast('SELECT A ROUTE FIRST'); }
    else if (k === '-' || k === '_' || k === 'Subtract') { const r = selRoute(); if (r) Act.freighters(r, -1); else G.showToast('SELECT A ROUTE FIRST'); }
    else if (k === 'Delete' || k === 'Backspace') { const r = selRoute(); if (r) { Act.removeRoute(r); e.preventDefault(); } }
  }
  function selRoute() { return G.sel && G.sel.kind === 'route' && G.run ? S.getRoute(G.run, G.sel.id) : null; }

  In.bind = function () {
    const c = G.canvas;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => { G.pointers.delete(e.pointerId); G.drag = null; G.pan = null; G.pinch = null; });
    c.addEventListener('pointerleave', () => { if (!G.mouse.down) G.mouse.inside = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', e => key(e, true));
    window.addEventListener('keyup', e => key(e, false));
    window.addEventListener('blur', () => { G.keys = {}; });
    const kbd = document.getElementById('kbd');
    if (kbd) kbd.addEventListener('input', () => {
      if (!G.focusField) return;
      G.focusField.value = kbd.value.toUpperCase().replace(/[^A-Z0-9 \-_.]/g, '').slice(0, G.focusField.max);
    });
    if (kbd) kbd.addEventListener('keydown', e => { if (e.key === 'Enter' && G.focusField) { G.focusField.onEnter(G.focusField.value.trim()); kbd.blur(); } });
  };
  In.update = function (dt) {
    if (!playing()) return;
    const sp = AS.CONFIG.camera.panSpeed * dt / G.cam.z;
    if (G.keys.l || G.keys.r || G.keys.u || G.keys.dn) G.cam.gx = null;
    if (G.keys.l) G.cam.x -= sp;
    if (G.keys.r) G.cam.x += sp;
    if (G.keys.u) G.cam.y -= sp;
    if (G.keys.dn) G.cam.y += sp;
    G.clampCam();
  };
})(globalThis.AS = globalThis.AS || {});
