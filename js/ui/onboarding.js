/* ATLAS SYNDICATE v4 — ui/onboarding.js
   First-run guided opening: claim a world, build an extractor, connect a route, watch the first
   freighter deliver. Each step spotlights exactly what to click and advances when the player does it.
   The simulation is paused during steps 1-3. Skippable at any time (SKIP button or Esc). */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, D = AS.Draw, H = AS.HUD, PAL = AS.PALETTE;
  const O = AS.Onboard = { st: null };
  const TITLES = ['CLAIM A WORLD', 'BUILD AN EXTRACTOR', 'CONNECT A ROUTE', 'WATCH IT WORK'];

  O.active = () => !!(O.st && O.st.step < 5);
  O.blocksSim = () => !!(O.st && O.st.step < 3);
  O.start = function (run) {
    const P = S.prime(run);
    const cand = run.bodies.filter(b => b.found && !b.prime && !b.site && (b.dep.ice >= 0.9 || b.dep.ore >= 0.9));
    cand.sort((a, b) => (b.dep.ice >= 0.9 ? 1 : 0) - (a.dep.ice >= 0.9 ? 1 : 0) || S.planeDist(a, P) - S.planeDist(b, P));
    const T = cand[0];
    if (!T) return;
    O.st = { step: 0, target: T.id, t: 0, stepT: 0, run, doneT: 0 };
    G.fitView(run);
    G.focusOn((P.sx + T.sx) / 2, (P.sy + T.sy) / 2, 2);
  };
  O.skip = function () {
    if (!O.st) return;
    O.st = null;
    AS.Store.set('onboarded', true);
    AS.Sfx.play('click');
  };
  function target() { return O.st && S.getBody(O.st.run, O.st.target); }
  function advance() {
    O.st.step++; O.st.stepT = 0;
    AS.Sfx.play('good');
    const T = target(), P = S.prime(O.st.run);
    if (O.st.step === 2 && T) G.focusOn((P.sx + T.sx) / 2, (P.sy + T.sy) / 2, 2);
    if (O.st.step === 4) { O.st.doneT = 7; AS.Store.set('onboarded', true); }
  }
  /** Player actions report here. */
  O.event = function (name, a) {
    const st = O.st;
    if (!st || st.run !== G.run) return;
    if (st.step === 0 && name === 'claim') { st.target = a.id; advance(); }
    else if (st.step === 1 && name === 'build' && a.id === st.target) { G.sel = null; advance(); }
    else if (st.step === 2 && name === 'route') {
      const P = S.prime(st.run);
      if ((a.a === P.id && a.b === st.target) || (a.b === P.id && a.a === st.target)) { G.sel = null; advance(); }
    }
  };
  O.update = function (dt) {
    const st = O.st;
    if (!st) return;
    if (st.run !== G.run || G.mode !== 'play') { if (G.mode !== 'play') return; O.st = null; return; }
    st.t += dt; st.stepT += dt;
    const run = st.run, T = target();
    if (!T) { O.skip(); return; }
    if (st.step === 3) {
      const P = S.prime(run), r = S.routeBetween(run, P, T);
      const f = r && run.freighters.find(x => x.route === r.id);
      const p = f && AS.World.freighterPos(run, f, G.time);
      if (p) G.focusOn(p.x, p.y, 3);
      if (run.stats.delivered > 0 && st.stepT > 2.5 || st.stepT > 35) { advance(); G.fitView(run, true); }
    }
    if (st.step === 4) { st.doneT -= dt; if (st.doneT <= 0) st.step = 5; }
    if (st.step >= 5) O.st = null;
  };

  function dimExcept(ctx, holes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, G.W, G.H);
    for (const h of holes) ctx.rect(h.x, h.y, h.w, h.h);
    ctx.clip('evenodd');
    D.dim(ctx, 0, 0, G.W, G.H, 0.55);
    ctx.restore();
  }
  function spot(ctx, h, t) {
    const pad = 2 + (Math.floor(t * 4) % 2);
    const c = Math.floor(t * 4) % 2 ? 13 : 14;
    ctx.fillStyle = PAL[c];
    const x0 = h.x - pad, y0 = h.y - pad, x1 = h.x + h.w + pad - 1, y1 = h.y + h.h + pad - 1;
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(dx > 0 ? x : x - 4, y, 5, 1); ctx.fillRect(x, dy > 0 ? y : y - 4, 1, 5);
    }
    // bouncing arrow above (or below if near the top)
    const ax = Math.round(h.x + h.w / 2), up = h.y > 60;
    const ay = up ? Math.round(y0 - 6 - Math.abs(Math.sin(t * 5)) * 4) : Math.round(y1 + 6 + Math.abs(Math.sin(t * 5)) * 4);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = PAL[0]; ctx.fillRect(ax - i - 1, up ? ay - i - 1 : ay + i, i * 2 + 3, 1); }
    for (let i = 0; i < 4; i++) { ctx.fillStyle = PAL[13]; ctx.fillRect(ax - i, up ? ay - i : ay + i, i * 2 + 1, 1); }
  }
  function bodyRect(b) {
    const s = G.toScreen(b.sx, b.sy), r = (b.size + 5) * G.cam.z;
    return { x: Math.round(s.x - r), y: Math.round(s.y - r), w: Math.round(r * 2), h: Math.round(r * 2) };
  }

  O.draw = function (ctx) {
    const st = O.st;
    if (!st || st.run !== G.run || G.screen) return;
    const run = st.run, T = target(), P = S.prime(run);
    if (!T) return;
    let text = '', holes = [];
    const selT = G.sel && G.sel.kind === 'body' && G.sel.id === T.id && G.selT >= 1;
    const ext = T.dep.ice >= 0.9 ? 'drill' : T.dep.ore > 0 ? 'mine' : T.dep.gas > 0 ? 'skimmer' : 'drill';
    if (st.step === 0) {
      if (!selT) { holes = [bodyRect(T)]; text = 'CLICK ' + T.name + '. ' + (T.dep.ice >= 0.9 ? 'IT HAS ICE, WHICH BECOMES FOOD.' : 'IT HAS ORE TO SELL.'); }
      else if (H.claimBtn) { holes = [H.claimBtn]; text = 'NOW PRESS CLAIM. IT BECOMES YOUR WORLD.'; }
    } else if (st.step === 1) {
      const slot = T.fac.indexOf(null);
      if (!selT) { holes = [bodyRect(T)]; text = 'CLICK ' + T.name + ' TO SEE ITS BUILD SLOTS.'; }
      else if (!(G.popup && G.popup.kind === 'build')) {
        holes = [{ x: 6 + slot * 32, y: G.H - G.CONSOLE_H + 24, w: 32, h: 32 }];
        text = 'CLICK AN EMPTY SLOT.';
      } else {
        const row = (H.buildRows || []).find(r => r.key === ext);
        if (row) holes = [row];
        text = 'BUILD THE ' + AS.FAC[ext].name + '. IT DIGS RESOURCES FOR YOU.';
      }
    } else if (st.step === 2) {
      holes = [bodyRect(P), bodyRect(T)];
      text = 'DRAG FROM ATLAS PRIME TO ' + T.name + ' TO OPEN A FREIGHT ROUTE.';
    } else if (st.step === 3) {
      text = 'FREIGHTERS CARRY GOODS BY THEMSELVES. WHATEVER REACHES ATLAS PRIME IS SOLD.';
    } else if (st.step === 4) {
      text = 'DONE. NOW GROW: HIT EACH QUARTER\'S REVENUE TARGET (TOP BAR) TO KEEP THE BOARD HAPPY.';
    }
    if (holes.length && st.step < 3) {
      dimExcept(ctx, holes);
      for (const h of holes) spot(ctx, h, G.time);
    }
    if (st.step === 2) {   // ghost drag: a hand cursor sliding from Prime to the target
      const a = G.toScreen(P.sx, P.sy), b = G.toScreen(T.sx, T.sy);
      const k = U.easeInOut((G.time * 0.6) % 1);
      const x = Math.round(a.x + (b.x - a.x) * k), y = Math.round(a.y + (b.y - a.y) * k);
      ctx.fillStyle = PAL[13];
      const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * k / 4));
      for (let i = 0; i < n; i++) if (i % 2 === 0) ctx.fillRect(Math.round(a.x + (x - a.x) * i / n), Math.round(a.y + (y - a.y) * i / n), 2, 2);
      drawHand(ctx, x, y);
    }
    // instruction plate
    const lines = U.wrapText(text, 56);
    const w = Math.min(G.W - 20, 260), h = 22 + lines.length * 7;
    const x = Math.round(G.W / 2 - w / 2), y = G.HUD_H + 4;
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 2, 13, G.time * 8);
    const stepN = Math.min(st.step + 1, 4);
    D.text(ctx, st.step < 4 ? 'STEP ' + stepN + '/4  ' + TITLES[st.step] : 'YOU ARE SET', x + 6, y + 6, 13, { big: false });
    lines.forEach((l, i) => D.text(ctx, l, x + 6, y + 15 + i * 7, 31, { shadow: false }));
    if (st.step < 4) G.button(ctx, x + w - 34, y + 4, 30, 10, 'SKIP', () => O.skip(), { tip: 'SKIP THE GUIDE (ESC). TIPS AND THE ADVISOR STAY ON.' });
    else G.button(ctx, x + w - 26, y + 4, 22, 10, 'OK', () => { st.step = 5; AS.Sfx.play('click'); });
    G.block(x, y, w, h);
  };
  function drawHand(ctx, x, y) {
    const rows = ['0.....', '00....', '0v0...', '0vv0..', '0vvv0.', '0vvvv0', '0vv000', '00v0..', '...0..'];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { ctx.fillStyle = PAL[r[i] === '0' ? 0 : 31]; ctx.fillRect(x + i, y + j, 1, 1); } });
  }
})(globalThis.AS = globalThis.AS || {});
