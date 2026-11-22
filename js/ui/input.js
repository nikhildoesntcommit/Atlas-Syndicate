/* ATLAS SYNDICATE v4 — ui/input.js
   Mouse, keyboard and touch.
   - Drag anywhere = pan, with momentum when you let go. Tap/click = select. Double-click = zoom in there.
   - Wheel / pinch = smooth zoom. WASD / arrows = smooth, accelerating pan.
   - New routes: select a world, press NEW ROUTE, then click the other world (Esc cancels). */
(function (AS) {
  'use strict';

  const S = AS.S, G = AS.G, W = AS.World, Act = AS.Act;
  const In = AS.Input = {};
  let lastTap = { t: -9, x: 0, y: 0 };

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
      G.pan = null;
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
    if (!playing() || !inMap(p)) return;
    G.popup = null;
    G.stopCam();
    // every drag on the map pans; whether it was a tap is decided on release
    G.pan = { sx: p.x, sy: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, button: e.button, samples: [[performance.now(), p.x, p.y]] };
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
      if (r > 1.3 || r < 0.77) { G.zoomStep(r > 1 ? 1 : -1, (a.x + b.x) / 2, (a.y + b.y) / 2); G.pinch.d0 = d; }
      return;
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
  }
  function up(e) {
    const p = canvasPos(e);
    G.pointers.delete(e.pointerId);
    G.mouse.down = false;
    if (G.pinch) { if (G.pointers.size < 2) G.pinch = null; G.pan = null; return; }
    G.mouse.x = p.x; G.mouse.y = p.y;
    G.wm = G.toWorld(p.x, p.y);
    if (G.touch) G.mouse.inside = false;
    const pan = G.pan;
    G.pan = null;
    if (!pan || !playing()) return;
    if (pan.moved) {   // flick: keep gliding
      const sm = pan.samples, a = sm[0], b = sm[sm.length - 1], dt = (b[0] - a[0]) / 1000;
      if (dt > 0 && performance.now() - b[0] < 80) { G.cam.vx = -(b[1] - a[1]) / dt / G.cam.zr; G.cam.vy = -(b[2] - a[2]) / dt / G.cam.zr; }
      return;
    }
    tap(p, pan.button);
  }
  function tap(p, button) {
    const run = G.run;
    const body = W.bodyAt(run, G.wm.x, G.wm.y);
    const now = G.time;
    const dbl = now - lastTap.t < 0.35 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 8;
    lastTap = { t: now, x: p.x, y: p.y };
    if (G.link) {   // finishing a new route
      const from = S.getBody(run, G.link.from);
      if (body && from && body !== from) {
        const res = Act.do('route', { a: from.id, b: body.id });
        if (res.ok) { G.sel = { kind: 'route', id: res.route.id }; G.showToast('ROUTE OPEN - A FREIGHTER IS ON ITS WAY', 13); }
      } else AS.Sfx.play('click');
      G.link = null;
      return;
    }
    if (button === 2) { const r = W.routeAt(run, G.wm.x, G.wm.y); if (r) Act.removeRoute(r); else { G.sel = null; G.popup = null; } return; }
    if (dbl) {   // double-click: zoom in on that spot (or that world)
      if (body) G.focusOn(body.sx, body.sy, Math.min(4, G.cam.z + 1)); else G.zoomStep(1, p.x, p.y);
      return;
    }
    if (body) { G.sel = { kind: 'body', id: body.id }; AS.Sfx.play('click'); return; }
    const r = W.routeAt(run, G.wm.x, G.wm.y);
    if (r) { G.sel = { kind: 'route', id: r.id }; AS.Sfx.play('click'); } else G.sel = null;
  }
  function wheel(e) {
    e.preventDefault();
    if (!playing()) return;
    const p = canvasPos(e);
    if (!inMap(p)) return;
    const now = performance.now();
    if (now - (In.lastWheel || 0) < 110) return;   // one zoom step per wheel notch, even on trackpads
    In.lastWheel = now;
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
    else if (k === 'b' || k === 'B') Act.boost();
    else if (k === 'f' || k === 'F') Act.buyFreighter();
    else if (k === 'q' || k === 'Q') G.zoomStep(-1);
    else if (k === 'e' || k === 'E') G.zoomStep(1);
    else if (k === 'r' || k === 'R') G.fitView(run, true);
    else if (k === 'Escape') {
      if (G.link) G.link = null;
      else if (G.popup) G.popup = null;
      else if (AS.Onboard.active() && AS.Onboard.st.step < 3) AS.Onboard.skip();
      else if (G.sel) G.sel = null;
      else Act.openPause();
    } else if (k === '+' || k === '=' || k === 'Add') { const r = selRoute(); if (r) Act.freighters(r, 1); else G.zoomStep(1); }
    else if (k === '-' || k === '_' || k === 'Subtract') { const r = selRoute(); if (r) Act.freighters(r, -1); else G.zoomStep(-1); }
    else if (k === 'Delete' || k === 'Backspace') { const r = selRoute(); if (r) { Act.removeRoute(r); e.preventDefault(); } }
  }
  function selRoute() { return G.sel && G.sel.kind === 'route' && G.run ? S.getRoute(G.run, G.sel.id) : null; }

  In.bind = function () {
    const c = G.canvas;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => { G.pointers.delete(e.pointerId); G.pan = null; G.pinch = null; });
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
  /** Keyboard panning: velocity eases towards the held direction, so it accelerates and coasts smoothly. */
  In.update = function (dt) {
    if (!playing()) return;
    const k = G.keys, sp = AS.CONFIG.camera.panSpeed * 1.4 / G.cam.zr;
    const tx = ((k.r ? 1 : 0) - (k.l ? 1 : 0)) * sp, ty = ((k.dn ? 1 : 0) - (k.u ? 1 : 0)) * sp;
    if (tx || ty) {
      G.cam.tc = null; G.cam.anchor = null;
      const a = 1 - Math.exp(-dt * 9);
      G.cam.vx += (tx - G.cam.vx) * a; G.cam.vy += (ty - G.cam.vy) * a;
    }
  };
})(globalThis.AS = globalThis.AS || {});
