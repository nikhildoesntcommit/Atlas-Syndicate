/* ATLAS SYNDICATE v4 — render/hud.js
   Screen-space game UI: top bar, contracts, megaproject widget, banners, the sliding bottom console
   (market ticker / world / survey / route / megaproject views) and build pop-ups. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw;
  const H = AS.HUD = {};
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const STATUS_TXT = { ok: ['RUN', 22], starved: ['NO INPUT', 18], full: ['FULL', 13], broken: ['STOPPED', 17], build: ['BUILDING', 12] };
  const GROUND = { terran: [28, 27], rust: [10, 9], cinder: [16, 15], ice: [25, 24], ice2: [21, 20], gas: [3, 2], dwarf: [4, 3], belt: [4, 3] };

  /* ---------- top bar ---------- */
  H.drawTop = function (ctx, run, interactive) {
    const W = G.W;
    D.rect(ctx, 0, 0, W, 13, 1); D.rect(ctx, 0, 13, W, 1, 3); D.rect(ctx, 0, 14, W, 1, 0);
    ctx.drawImage(AS.Spr.icons.coin, 3, 4);
    const cr = G.disp.credits;
    T(ctx, U.fmtNum(cr), 10, 4, run.credits < 0 ? 17 : 13);
    const net = run.incomeRate - run.expenseRate;
    T(ctx, (net >= 0 ? '+' : '') + net.toFixed(1) + '/S', 42, 4, net >= 0 ? 22 : 17);
    G.tip(0, 0, 76, 13, 'CREDITS, AND NET INCOME PER SECOND AFTER UPKEEP AND TRIP COSTS. BELOW ZERO = DEBT, WHICH DRAINS BOARD CONFIDENCE.');
    T(ctx, 'BOARD', 80, 4, 5);
    const conf = G.disp.conf, cc = conf > 60 ? 22 : conf > 30 ? 13 : 17;
    const low = run.conf < 25 && Math.floor(G.time * 4) % 2;
    D.bar(ctx, 101, 3, 40, 7, conf / 100, cc);
    T(ctx, Math.round(conf), 144, 4, low ? 31 : cc);
    if (run.conf < 25) T(ctx, '!', 155, 4, 17);
    G.tip(78, 0, 82, 13, 'BOARD CONFIDENCE: YOUR LIFE BAR. AT ZERO THE RUN ENDS. LOST BY STARVING WORLDS, DEBT, FAILED CONTRACTS AND MISSED TARGETS.');
    ctx.drawImage(AS.Spr.icons.clock, 162, 4); T(ctx, U.fmtTime(run.t), 169, 4, 7);
    G.tip(160, 0, 30, 13, 'TIME PLAYED. EVERY SECOND ADDS TO YOUR SCORE.');
    T(ctx, 'Q' + (run.quarter + 1), 193, 4, 5);
    const qf = U.safeDiv(G.disp.q, run.target, 0);
    D.bar(ctx, 205, 3, 30, 7, qf, qf >= 1 ? 22 : 12);
    T(ctx, U.fmtNum(G.disp.q) + '/' + U.fmtNum(run.target), 238, 4, qf >= 1 ? 22 : 7);
    if (qf >= 1) T(ctx, 'OK', 238 + D.tw(U.fmtNum(G.disp.q) + '/' + U.fmtNum(run.target)) + 3, 4, 22);
    const left = run.nextQuarter - run.t;
    T(ctx, U.fmtTime(left), 310, 4, left < 20 && qf < 1 ? (Math.floor(G.time * 4) % 2 ? 17 : 7) : 6, { align: 'right' });
    G.tip(191, 0, 122, 13, 'THIS QUARTER: REVENUE SO FAR / BOARD TARGET, AND TIME TO THE REVIEW. TARGETS RISE EVERY QUARTER.');
    if (!interactive) return;
    const bx = W - 164;
    G.button(ctx, bx, 2, 26, 10, 'TIPS', () => AS.Act.toggleTips(), { active: G.settings.tips, tip: 'TIPS: HOVER EXPLANATIONS AND THE ADVISOR (T).' });
    G.button(ctx, bx + 28, 2, 14, 10, 'II', () => AS.Act.togglePause(), { active: G.paused, tip: 'PAUSE (SPACE).' });
    C.sim.hudSpeeds.forEach((s, i) => G.button(ctx, bx + 44 + i * 16, 2, 15, 10, s + 'X', () => AS.Act.setSpeed(s), { active: !G.paused && G.speed === s, tip: 'GAME SPEED (KEYS 1-3).' }));
    G.button(ctx, bx + 94, 2, 20, 10, G.settings.mute ? 'MUT' : 'SND', () => AS.Act.toggleMute(), { col: G.settings.mute ? 17 : 7, tip: 'SOUND ON/OFF (M).' });
    G.button(ctx, bx + 116, 2, 46, 10, 'MENU', () => AS.Act.openPause(), { tip: 'PAUSE MENU AND SETTINGS (ESC).' });
  };

  /* ---------- contracts (top left) ---------- */
  H.drawContracts = function (ctx, run, interactive) {
    // live score (the end-of-run formula, updated as you play)
    D.frame(ctx, 2, 17, 132, 11, 1, 4);
    ctx.drawImage(AS.Spr.icons.star, 4, 20);
    T(ctx, 'SCORE ' + U.fmtInt(G.disp.score || 0), 11, 20, 13);
    if (G.best) TS(ctx, 'BEST ' + U.fmtNum(G.best), 131, 20, 5, 'right');
    G.tip(2, 17, 132, 11, 'SCORE: REVENUE + TIME + CONTRACTS + PEAK COLONISTS + GATE STAGES, TIMES THE CHARTER MULTIPLIER. FINISHING THE GATE ADDS A BIG BONUS.');
    let y = 30;
    for (const c of run.contracts) {
      const left = (c.accepted ? c.deadline : c.expires) - run.t;
      const urgent = c.accepted && left < 30 && Math.floor(G.time * 3) % 2 === 0;
      D.frame(ctx, 2, y, 132, 11, 1, urgent ? 17 : c.accepted ? 4 : 3);
      ctx.drawImage(AS.Spr.goods[c.good], 4, y + 3);
      TS(ctx, AS.GOODS[c.good].name + ' ' + (c.accepted ? Math.floor(c.done) + '/' : '') + c.qty, 11, y + 3, c.accepted ? 7 : 6);
      TS(ctx, '+' + U.fmtNum(c.reward), 84, y + 3, 13, 'right');
      if (c.accepted) {
        TS(ctx, U.fmtTime(left), 131, y + 3, left < 30 ? 17 : 6, 'right');
        D.rect(ctx, 3, y + 9, Math.round(U.clamp(c.done / c.qty, 0, 1) * 130), 1, 12);
        G.tip(2, y, 132, 11, 'ACTIVE CONTRACT: DELIVER ' + c.qty + ' ' + AS.GOODS[c.good].name + ' TO ATLAS PRIME BEFORE THE TIMER ENDS. REWARD ' + c.reward + ' CR. FAILURE: -' + C.contracts.confFail + ' CONFIDENCE.');
      } else {
        if (interactive) {
          G.button(ctx, 87, y + 1, 24, 8, 'TAKE', () => AS.Act.do('accept', { id: c.id }, 'good'), { tip: 'ACCEPT: ' + U.fmtTime(C.contracts.deadline) + ' TO DELIVER ' + c.qty + ' ' + AS.GOODS[c.good].name + ' TO ATLAS PRIME. YOU MAKE ' + S.productionRate(run, c.good).toFixed(1) + '/S NOW.' });
          G.button(ctx, 112, y + 1, 20, 8, 'NO', () => AS.Act.do('decline', { id: c.id }, 'click'), { tip: 'DECLINE. NO PENALTY.' });
        }
        D.rect(ctx, 3, y + 9, Math.round(U.clamp(left / C.contracts.offerTime, 0, 1) * 130), 1, 5);
        G.tip(2, y, 84, 11, 'CONTRACT OFFER (OPTIONAL). IT LAPSES WHEN THE GREY BAR RUNS OUT.');
      }
      y += 12;
    }
    return y;
  };

  /* ---------- megaproject widget (top centre) ---------- */
  H.drawMega = function (ctx, run) {
    const M = C.mega, w = 168, x = Math.round(G.W / 2 - w / 2), y = 17;
    if (run.mega.state === 'locked') {
      const left = M.unlockAt - run.t, worlds = S.colonies(run).length;
      if (left > 300 && worlds >= M.minWorlds) return y;
      const txt = left > 0 ? 'MEGAPROJECT IN ' + U.fmtTime(left) : 'MEGAPROJECT: OWN ' + M.minWorlds + ' WORLDS (' + worlds + ')';
      const tw = D.tw(txt) + 12;
      D.frame(ctx, Math.round(G.W / 2 - tw / 2), y, tw, 10, 1, 4);
      ctx.drawImage(AS.Spr.icons.lock, Math.round(G.W / 2 - tw / 2) + 3, y + 3);
      TS(ctx, txt, G.W / 2 + 4, y + 3, left < 30 ? 13 : 6, 'center');
      G.tip(G.W / 2 - tw / 2, y, tw, 10, 'THE MEGAPROJECT UNLOCKS AT ' + U.fmtTime(M.unlockAt) + ' IF YOU OWN AT LEAST ' + M.minWorlds + ' WORLDS. FINISHING IT ENDS THE RUN WITH A BIG SCORE BONUS.');
      return y + 12;
    }
    if (run.mega.state !== 'active') return y;
    const st = S.megaStage(run), goods = Object.keys(st.req);
    const h = 13 + goods.length * 7;
    D.plate(ctx, x, y, w, h, 1);
    T(ctx, M.name + '  ' + (run.mega.stage + 1) + '/' + M.stages.length + ' ' + st.name, x + 5, y + 3, 13);
    TS(ctx, Math.round(S.megaFraction(run) * 100) + '%', x + w - 5, y + 3, 7, 'right');
    goods.forEach((g, i) => {
      const yy = y + 11 + i * 7, need = st.req[g], got = Math.min(need, run.mega.done[g]);
      ctx.drawImage(AS.Spr.goods[g], x + 5, yy);
      TS(ctx, AS.GOODS[g].name, x + 12, yy, 6);
      D.bar(ctx, x + 44, yy, 80, 6, got / need, got >= need ? 22 : AS.GOODS[g].col);
      TS(ctx, Math.floor(got) + '/' + need, x + w - 5, yy, got >= need ? 22 : 7, 'right');
    });
    G.tip(x, y, w, h, 'MEGAPROJECT: DELIVER THESE GOODS TO THE ' + M.name + '. EACH DELIVERY PAYS ' + Math.round(M.payFrac * 100) + '% OF BASE PRICE. EACH STAGE: +' + M.stageConf + ' CONFIDENCE AND ' + M.stageGrant + ' CREDITS. CLICK TO FIND IT.');
    G.btns.push({ x, y, w, h, fn: () => { const s = S.site(run); if (s) { G.sel = { kind: 'body', id: s.id }; G.focusOn(s.sx, s.sy, Math.max(G.cam.z, 2)); AS.Sfx.play('click'); } } });
    return y + h + 2;
  };

  /* ---------- banners & toasts ---------- */
  H.drawBanner = function (ctx, run, y) {
    if (!run.banner) return y;
    const b = run.banner, tw = D.tw(b.text);
    const k = U.easeOut(U.clamp((4.5 - b.t) * 5, 0, 1));   // stamps open sideways on arrival
    const w = Math.max(8, Math.round((tw + 16) * k)), x = Math.round(G.W / 2 - w / 2);
    const yy = y;
    if (k < 0.7) { D.frame(ctx, x, yy, w, 13, 13, 0); return yy + 15; }
    const bad = b.kind === 'bad' || b.kind === 'warn';
    D.frame(ctx, x, yy, w, 13, b.kind === 'good' ? 20 : b.kind === 'mega' ? 9 : bad ? 15 : 2, 0);
    if (bad || b.kind === 'mega') {
      const ph = Math.floor(G.time * 10);
      const flash = b.kind === 'warn' ? Math.floor(G.time * 5) % 2 === 0 : true;
      if (flash) { D.hazard(ctx, x + 1, yy + 1, w - 2, 2, b.kind === 'mega' ? 13 : b.kind === 'warn' ? 13 : 17, ph); D.hazard(ctx, x + 1, yy + 10, w - 2, 2, b.kind === 'mega' ? 13 : b.kind === 'warn' ? 13 : 17, -ph); }
    } else { D.rect(ctx, x + 1, yy + 1, w - 2, 1, b.kind === 'good' ? 22 : 4); }
    const ic = b.kind === 'warn' ? AS.Spr.icons.warn : b.kind === 'good' ? null : null;
    if (ic) ctx.drawImage(ic, x + 3, yy + 4);
    T(ctx, b.text, G.W / 2, yy + 4, b.col === 17 ? 31 : b.col, { align: 'center' });
    return yy + 15;
  };
  H.drawToast = function (ctx, y) {
    if (!G.toast) return;
    const tw = D.tw(G.toast.text), x = Math.round(G.W / 2 - tw / 2 - 4);
    D.frame(ctx, x, y, tw + 8, 9, 0, G.toast.col);
    TS(ctx, G.toast.text, G.W / 2, y + 2, G.toast.col, 'center');
  };
  /** Achievement and other notices: slide in at the right above the console. */
  H.drawNotices = function (ctx, dt) {
    let y = G.mapBottom() - 4;
    for (const n of G.notices.slice(0, 2)) {   // two at a time; the rest wait their turn
      n.t -= dt;
      const k = U.clamp(Math.min(n.max - n.t, n.t) * 4, 0, 1);
      const w = 150, h = 20, x = Math.round(G.W - 4 - w * U.easeOut(k));
      y -= h + 3;
      D.plate(ctx, x, y, w, h, 2);
      ctx.drawImage(AS.Spr.icons.star, x + 5, y + 4);
      T(ctx, n.title, x + 13, y + 4, 13);
      TS(ctx, n.text, x + 13, y + 12, 6);
    }
    G.notices = G.notices.filter(n => n.t > 0);
  };

  H.drawMapControls = function (ctx) {
    const y = G.mapBottom() - 14;
    G.button(ctx, G.W - 52, y, 14, 11, '+', () => G.zoomStep(1), { tip: 'ZOOM IN (WHEEL / E / PINCH).' });
    G.button(ctx, G.W - 37, y, 14, 11, '-', () => G.zoomStep(-1), { tip: 'ZOOM OUT (WHEEL / Q).' });
    G.button(ctx, G.W - 22, y, 20, 11, 'FIT', () => G.fitView(G.run, true), { tip: 'SHOW EVERY KNOWN WORLD (R). DRAG EMPTY SPACE TO PAN.' });
  };

  /* ---------- bottom console ---------- */
  H.drawConsole = function (ctx, run) {
    const W = G.W, bh = G.bottomH(), y0 = G.H - bh;
    G.block(0, y0 - 2, W, bh + 2);
    D.plate(ctx, 0, y0, W, bh + 2);
    D.hazard(ctx, 1, y0 - 2, W - 2, 2, 13, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, bh); ctx.clip();
    const sel = G.sel;
    const cy = G.H - G.CONSOLE_H;   // content is laid out for the full panel and slides with it
    ctx.translate(0, y0 - cy);
    let drawn = false;
    if (sel && sel.kind === 'body') {
      const b = S.getBody(run, sel.id);
      if (b && b.found) { if (b.site) H.siteConsole(ctx, run, b, cy); else if (b.claimed) H.colonyConsole(ctx, run, b, cy); else H.surveyConsole(ctx, run, b, cy); drawn = true; }
      else G.sel = null;
    } else if (sel && sel.kind === 'route') {
      const r = S.getRoute(run, sel.id);
      if (r) { H.routeConsole(ctx, run, r, cy); drawn = true; } else G.sel = null;
    }
    ctx.restore();
    if (!drawn || G.selT < 0.15) H.ticker(ctx, run, G.H - G.TICKER_H + 2);
  };
  function closeBtn(ctx, cy) { G.button(ctx, G.W - 14, cy + 4, 11, 10, 'X', () => { G.sel = null; G.popup = null; AS.Sfx.play('click'); }, { tip: 'CLOSE (ESC).' }); }

  H.ticker = function (ctx, run, y) {
    const P = S.prime(run);
    let x = 5;
    TS(ctx, 'PRIME PAYS', x, y + 1, 5);
    x += 44;
    for (const g of AS.GOOD_KEYS) {
      const m = run.market[g];
      ctx.drawImage(AS.Spr.goods[g], x, y + 1);
      const pc = m.swing * m.spike > 1.05 ? 22 : m.swing * m.spike < 0.95 ? 17 : 13;
      const tx = m.price.toFixed(m.price < 10 ? 1 : 0);
      TS(ctx, tx, x + 7, y + 1, pc);
      const ar = m.trend > 0 ? '^' : m.trend < 0 ? '~' : '';
      if (ar) TS(ctx, ar, x + 8 + D.tw(tx), y + 1, m.trend > 0 ? 22 : 17);
      G.tip(x - 1, y - 1, 40, 8, AS.GOODS[g].help + ' ATLAS PRIME PAYS ' + m.price.toFixed(1) + ' EACH. PRICES DROP WHILE YOU SELL A LOT AND RECOVER OVER TIME.' + (m.spikeT > 0 ? ' DEMAND SPIKE ACTIVE.' : m.swingT > 0 ? ' PRICE SWING ACTIVE.' : '') + ' IN STOCK AT PRIME: ' + Math.floor(P.stock[g]) + '.');
      x += 40;
    }
    const idle = S.idleFreighters(run).length;
    const rx = G.W - 100;
    if (x < rx - 4) TS(ctx, 'FLEET ' + run.freighters.length + (idle ? ' (' + idle + ' IDLE)' : ''), Math.max(x + 4, rx - 64), y + 1, idle ? 13 : 5);
    G.button(ctx, rx, y - 2, 96, 10, 'BUY FREIGHTER ' + S.freighterCost(run), () => AS.Act.buyFreighter(), { disabled: run.credits < S.freighterCost(run), onDisabled: () => AS.Act.buyFreighter(), tip: 'NEW FREIGHTER (F). THEN CLICK A ROUTE AND PRESS + TO PUT IT TO WORK.' });
  };

  /* ---------- world console ---------- */
  H.colonyConsole = function (ctx, run, b, y0) {
    const cap = S.storageCap(run, b);
    const sw = 32 * b.slotsN + 4, sx = 4, sy = y0 + 4;
    const gr = GROUND[b.kind] || GROUND.dwarf;
    D.frame(ctx, sx, sy, sw, 52, 1, 0);
    for (let i = 0; i < 18; i++) D.rect(ctx, sx + 2 + Math.floor(U.hash2(i, 1, b.id) * (sw - 4)), sy + 2 + Math.floor(U.hash2(i, 2, b.id) * 18), 1, 1, U.hash2(i, b.id, 9) < 0.5 ? 3 : 5);
    D.rect(ctx, sx + 1, sy + 40, sw - 2, 11, gr[0]);
    D.dither(ctx, sx + 1, sy + 40, sw - 2, 11, gr[1], 5);
    for (let i = 0; i < b.slotsN; i++) {
      const f = b.fac[i], x = sx + 2 + i * 32, y = sy + 20;
      const hov = G.pointIn(G.mouse, x, y, 32, 32);
      const isPop = G.popup && G.popup.slot === i && G.popup.bodyId === b.id;
      if (f && f.build > 0) {
        ctx.drawImage(AS.Spr.slot, x, y);
        AS.Spr.drawScaffold(ctx, x, y, f.type, 1 - f.build / Math.max(0.01, f.buildT), G.time);
        if (Math.random() < 0.4) G.uiSparks.push({ x: x + 6 + Math.random() * 20, y: y + 4 + Math.random() * 22, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 30, life: 0.4 });
      } else {
        ctx.drawImage(f ? AS.Spr.fac[f.type] : AS.Spr.slot, x, y);
        if (f) H.facAnim(ctx, run, b, f, x, y);
      }
      if (hov || isPop) { ctx.fillStyle = PAL[isPop ? 13 : 6]; ctx.fillRect(x, y, 32, 1); ctx.fillRect(x, y + 31, 32, 1); ctx.fillRect(x, y, 1, 32); ctx.fillRect(x + 31, y, 1, 32); }
      if (f) {
        const [st, sc] = STATUS_TXT[f.status] || STATUS_TXT.ok;
        TS(ctx, AS.FAC[f.type].short, x + 16, sy + 3 + (i % 2) * 7, 7, 'center');
        if (f.build > 0) TS(ctx, Math.ceil(f.build) + 'S', x + 16, y - 7 + (i % 2 ? 0 : 0), 12, 'center');
        else if (f.status !== 'ok' && Math.floor(G.time * 2 + i) % 2 === 0) T(ctx, st, x + 16, y + 11, sc, { align: 'center' });
        G.tip(x, y, 32, 32, AS.FAC_HELP[f.type] + ' STATUS: ' + AS.STATUS_HELP[f.status] + ' CLICK FOR OPTIONS.');
      } else G.tip(x, y, 32, 32, 'EMPTY SLOT. CLICK TO BUILD.');
      G.btns.push({ x, y, w: 32, h: 32, fn: () => { G.popup = { kind: f ? 'fac' : 'build', bodyId: b.id, slot: i, t: G.time }; AS.Sfx.play('click'); if (AS.Onboard) AS.Onboard.event('slot', { body: b, slot: i }); } });
    }
    const x = sx + sw + 7;
    T(ctx, b.name, x, y0 + 4, 12);
    if (b.traits.length) TS(ctx, b.traits.map(t => AS.TRAITS[t].short).join(' '), x + D.tw(b.name) + 6, y0 + 4, 29);
    G.tip(x, y0 + 3, 90, 8, b.traits.length ? b.traits.map(t => AS.TRAITS[t].name + ': ' + AS.TRAITS[t].desc).join(' ') : b.blurb);
    const capPop = S.housing(run, b);
    TS(ctx, 'COLONISTS ' + Math.floor(b.pop) + '/' + capPop, x, y0 + 14, 7);
    G.tip(x, y0 + 13, 90, 8, 'COLONISTS / HOUSING. FED WORLDS GROW UP TO THE HOUSING LIMIT. HABITATS ADD ROOM.');
    const fr = S.foodRate(run, b);
    ctx.drawImage(AS.Spr.goods.food, x, y0 + 22);
    TS(ctx, b.starving ? 'STARVING!' : 'FED ' + Math.floor(U.safeDiv(b.stock.food, fr, 0)) + 'S', x + 7, y0 + 23, b.starving ? 17 : 22);
    G.tip(x, y0 + 21, 90, 8, 'THIS WORLD EATS ' + fr.toFixed(2) + ' FOOD/S. THE NUMBER IS HOW LONG ITS FOOD LASTS WITHOUT NEW DELIVERIES.');
    TS(ctx, 'TAX +' + (b.pop * C.colony.taxPer * run.mods.tax).toFixed(1) + '/S', x, y0 + 32, 6);
    TS(ctx, 'DEPOSITS', x, y0 + 41, 5);
    let dx = x;
    for (const g of ['ore', 'ice', 'gas']) if (b.dep[g]) { ctx.drawImage(AS.Spr.goods[g], dx, y0 + 48); TS(ctx, b.dep[g].toFixed(1), dx + 7, y0 + 49, AS.GOODS[g].col); dx += 26; }
    G.tip(x, y0 + 40, 90, 16, 'WHAT CAN BE EXTRACTED HERE. HIGHER = FASTER MINES, DRILLS AND SKIMMERS.');
    if (b.boomT > 0) TS(ctx, 'RICH SEAM ' + Math.ceil(b.boomT) + 'S', x, y0 + 60, 22);
    else if (b.blightT > 0) TS(ctx, 'BLIGHT ' + Math.ceil(b.blightT) + 'S', x, y0 + 60, 17);
    else TS(ctx, b.prime ? 'CAPITAL: SELLS GOODS' : 'CLICK A SLOT TO BUILD', x, y0 + 60, 4);
    const kx = G.W - 104;
    D.rect(ctx, kx - 5, y0 + 4, 1, G.CONSOLE_H - 8, 0);
    TS(ctx, 'STOCK  MAX ' + cap, kx, y0 + 5, 5);
    G.tip(kx, y0 + 3, 90, 8, 'GOODS STORED HERE. THE WHITE TICK IS WHAT THIS WORLD KEEPS FOR ITSELF; ANYTHING ABOVE IT IS SHIPPED OUT.');
    AS.GOOD_KEYS.forEach((g, i) => {
      const y = y0 + 14 + i * 9, v = b.stock[g];
      ctx.drawImage(AS.Spr.goods[g], kx, y);
      TS(ctx, AS.GOODS[g].name, kx + 7, y + 1, 6);
      TS(ctx, Math.floor(v), kx + 52, y + 1, v >= cap - 0.5 ? 13 : 7, 'right');
      if (b.incoming[g] >= 1) TS(ctx, '+' + Math.floor(b.incoming[g]), kx + 55, y + 1, 22);
      const bw = Math.round(U.clamp(v / cap, 0, 1) * 20);
      D.rect(ctx, kx + 74, y + 1, 20, 4, 1);
      if (bw) D.rect(ctx, kx + 74, y + 1, bw, 4, AS.GOODS[g].col);
      if (b.keep[g] >= 1) D.rect(ctx, kx + 74 + Math.min(19, Math.round(U.clamp(b.keep[g] / cap, 0, 1) * 20)), y, 1, 6, 31);
      G.tip(kx, y - 1, 96, 9, AS.GOODS[g].name + ': ' + Math.floor(v) + ' STORED' + (b.incoming[g] >= 1 ? ', ' + Math.floor(b.incoming[g]) + ' ON THE WAY' : '') + (b.keep[g] >= 1 ? ', KEEPING ' + Math.floor(b.keep[g]) + ' FOR LOCAL USE' : '') + '.');
    });
    closeBtn(ctx, y0);
  };

  H.facAnim = function (ctx, run, b, f, x, y) {
    const p = (px, py, c) => { ctx.fillStyle = PAL[c]; ctx.fillRect(x + px, y + py, 1, 1); };
    if (f.status !== 'ok') { if (f.status === 'broken' && Math.random() < 0.3) p(8 + Math.floor(Math.random() * 16), 10 + Math.floor(Math.random() * 10), 18); return; }
    const t = G.time, fr = Math.floor(t * 6 + b.id);
    switch (f.type) {
      case 'mine': p(22 + [0, 2, 0, -2][fr % 4], 4 + [-2, 0, 2, 0][fr % 4], 7); p(6 + (fr % 4), 25, 12); break;
      case 'drill': p(20, 6 + (fr % 18), 13); break;
      case 'skimmer': if (fr % 2) p(22, 1, 13); break;
      case 'smelter':
        for (const [sx, sy] of [[8, 0], [15, 3]]) for (let k = 0; k < 3; k++) {
          const ph = (t * 0.6 + k / 3 + b.id * 0.1) % 1;
          const px = sx + Math.round(Math.sin(ph * 5 + k) + ph * 4), py = sy - Math.round(ph * 9);
          if (py >= -6) { ctx.fillStyle = PAL[ph < 0.5 ? 5 : 4]; ctx.fillRect(x + px, y + py, 2, 1); }
        }
        if (fr % 3 === 0) p(20, 24, 14);
        break;
      case 'agri': if (fr % 4 === 0) p(10 + (fr * 7) % 12, 15 + (fr * 3) % 5, 22); break;
      case 'fab': if (fr % 3 === 0) { p(13 + (fr * 5) % 6, 24, 14); p(14 + (fr * 5) % 6, 23, 13); } break;
      case 'habitat': if (fr % 7 === 0) p(11 + (fr % 4) * 3, 9 + (fr % 5) * 3, 2); break;
    }
  };

  H.surveyConsole = function (ctx, run, b, y0) {
    T(ctx, b.name + ' - UNCLAIMED', 6, y0 + 5, 12);
    TS(ctx, b.blurb, 6, y0 + 14, 6);
    TS(ctx, 'DEPOSITS', 6, y0 + 24, 5);
    ['ore', 'ice', 'gas'].forEach((g, i) => {
      const y = y0 + 32 + i * 9;
      ctx.drawImage(AS.Spr.goods[g], 8, y);
      TS(ctx, AS.GOODS[g].name, 15, y + 1, b.dep[g] ? AS.GOODS[g].col : 3);
      D.bar(ctx, 40, y, 60, 6, (b.dep[g] || 0) / 1.8, AS.GOODS[g].col);
      TS(ctx, (b.dep[g] || 0).toFixed(1), 104, y + 1, 6);
      G.tip(6, y - 1, 116, 9, AS.GOODS[g].help);
    });
    const P = S.prime(run);
    TS(ctx, 'BUILD SLOTS ' + b.slotsN, 132, y0 + 24, 7);
    TS(ctx, 'DISTANCE TO PRIME ' + Math.round(S.planeDist(b, P)), 132, y0 + 32, 7);
    G.tip(130, y0 + 31, 110, 8, 'DISTANCE CHANGES AS WORLDS ORBIT. LONGER ROUTES TAKE LONGER AND COST MORE PER TRIP.');
    b.traits.forEach((t, i) => { TS(ctx, AS.TRAITS[t].name, 132, y0 + 41 + i * 8, 29); G.tip(130, y0 + 40 + i * 8, 110, 8, AS.TRAITS[t].desc); });
    const wait = b.lostAt > 0 ? Math.ceil(C.colony.reclaimDelay - (run.t - b.lostAt)) : 0;
    if (b.lostAt > 0) TS(ctx, wait > 0 ? 'LOST WORLD - REOPENS IN ' + wait + 'S' : 'FORMER COLONY - CAN BE RECLAIMED', 132, y0 + 60, wait > 0 ? 17 : 22);
    const cost = S.claimCost(run, b);
    const x = Math.max(272, G.W - 200);
    TS(ctx, 'A NEW CLAIM STARTS WITH', x, y0 + 14, 5);
    TS(ctx, C.colony.outpostPop + ' COLONISTS, ' + C.colony.outpostFood + ' FOOD, ' + C.economy.claimYield + ' RAW GOODS', x, y0 + 22, 6);
    TS(ctx, b.dep.ice ? 'CAN FEED ITSELF (DRILL + AGRI)' : 'NO ICE: NEEDS FOOD BY ROUTE', x, y0 + 31, b.dep.ice ? 22 : 18);
    G.button(ctx, x, y0 + 42, 140, 16, 'CLAIM  ' + cost + ' CR', () => AS.Act.claim(b), { primary: run.credits >= cost && wait <= 0, disabled: run.credits < cost || wait > 0, onDisabled: () => AS.Act.claim(b), tip: 'CLAIM THIS WORLD. THEN DRAG A ROUTE FROM ATLAS PRIME TO IT AND BUILD ON ITS SLOTS.' });
    H.claimBtn = { x, y: y0 + 42 + (G.H - G.CONSOLE_H - y0), w: 140, h: 16 };
    closeBtn(ctx, y0);
  };

  H.routeConsole = function (ctx, run, r, y0) {
    const A = S.getBody(run, r.a), B = S.getBody(run, r.b);
    if (!A || !B) { G.sel = null; return; }
    const d = S.planeDist(A, B), own = S.routeFreighters(run, r);
    T(ctx, 'ROUTE ' + A.name + ' <> ' + B.name, 6, y0 + 5, 12);
    TS(ctx, 'DISTANCE ' + Math.round(d) + '   TRIP ' + (d / (C.fleet.speed * run.mods.speed)).toFixed(0) + 'S   COST/TRIP ' + S.tripCost(run, d, A, B).toFixed(1) + ' CR', 6, y0 + 15, 6);
    G.tip(4, y0 + 14, 240, 8, 'WORLDS ORBIT, SO DISTANCE, TRIP TIME AND COST CHANGE ALL THE TIME.');
    let moved = 0;
    for (const [, q] of r.movedLog) moved += q;
    TS(ctx, 'MOVED IN THE LAST MINUTE: ' + moved + ' UNITS', 6, y0 + 24, 6);
    if (r.halted > 0 || run.flareT > 0) TS(ctx, 'STOPPED ' + Math.ceil(Math.max(r.halted, run.flareT)) + 'S', 180, y0 + 24, 17);
    T(ctx, 'FREIGHTERS', 6, y0 + 37, 5);
    T(ctx, own.length, 56, y0 + 37, 13);
    G.button(ctx, 68, y0 + 34, 18, 12, '-', () => AS.Act.freighters(r, -1), { disabled: !own.length, tip: 'TAKE A FREIGHTER OFF THIS ROUTE (-).' });
    G.button(ctx, 88, y0 + 34, 18, 12, '+', () => AS.Act.freighters(r, 1), { primary: true, tip: S.idleFreighters(run).length ? 'PUT AN IDLE FREIGHTER ON THIS ROUTE (+).' : 'NO IDLE FREIGHTERS: + BUYS ONE FOR ' + S.freighterCost(run) + ' CR.' });
    H.plusBtn = { x: 88, y: y0 + 34 + (G.H - G.CONSOLE_H - y0), w: 18, h: 12 };
    TS(ctx, 'IDLE ' + S.idleFreighters(run).length, 112, y0 + 37, 6);
    own.slice(0, 6).forEach((f, i) => {
      const st = f.state === 'transit' ? (f.load ? 'HAULING ' + f.load : 'EMPTY RUN') : f.state === 'dock' ? 'WAITING' : f.state === 'load' ? 'LOADING' : 'UNLOADING';
      TS(ctx, '#' + (i + 1) + ' ' + st, 6 + (i % 3) * 70, y0 + 51 + Math.floor(i / 3) * 8, f.load ? 7 : 5);
    });
    G.tip(4, y0 + 49, 210, 18, 'FREIGHTERS CHOOSE CARGO THEMSELVES: SURPLUS GOES WHERE IT IS NEEDED; EVERYTHING ELSE HEADS TO ATLAS PRIME TO BE SOLD.');
    const bx = G.W - 140;
    G.button(ctx, bx, y0 + 46, 124, 13, 'CLOSE ROUTE  +' + Math.round(r.cost * C.economy.routeRefund) + ' CR', () => AS.Act.removeRoute(r), { col: 18, tip: 'CLOSE THIS ROUTE. HALF THE BUILD COST COMES BACK; ITS FREIGHTERS BECOME IDLE.' });
    closeBtn(ctx, y0);
  };

  H.siteConsole = function (ctx, run, b, y0) {
    const M = C.mega;
    T(ctx, M.name + ' - MEGAPROJECT', 6, y0 + 5, 13);
    TS(ctx, 'FINISH ALL ' + M.stages.length + ' STAGES TO WIN THE RUN. BONUS ' + U.fmtInt(M.bonus) + ' + TIME BONUS', 6, y0 + 15, 6);
    M.stages.forEach((st, i) => {
      const x = 6 + i * 118, y = y0 + 25;
      const doneSt = i < run.mega.stage || run.mega.state === 'done', cur = i === run.mega.stage && run.mega.state === 'active';
      D.frame(ctx, x, y, 112, 42, cur ? 2 : 1, cur ? 12 : doneSt ? 21 : 3);
      TS(ctx, (i + 1) + ' ' + st.name + (doneSt ? '  DONE' : ''), x + 4, y + 3, doneSt ? 22 : cur ? 13 : 5);
      Object.keys(st.req).forEach((g, k) => {
        const yy = y + 12 + k * 9, need = st.req[g], got = doneSt ? need : cur ? Math.min(need, run.mega.done[g]) : 0;
        ctx.drawImage(AS.Spr.goods[g], x + 4, yy);
        D.bar(ctx, x + 11, yy, 56, 6, got / need, doneSt ? 21 : AS.GOODS[g].col);
        TS(ctx, Math.floor(got) + '/' + need, x + 108, yy + 1, 7, 'right');
      });
    });
    const links = run.routes.filter(r => r.a === b.id || r.b === b.id);
    const fl = links.reduce((n, r) => n + S.routeFreighters(run, r).length, 0);
    const x = Math.min(G.W - 110, 362);
    TS(ctx, 'ROUTES IN ' + links.length, x, y0 + 26, 7);
    TS(ctx, 'FREIGHTERS ' + fl, x, y0 + 35, 7);
    TS(ctx, 'PAYS ' + Math.round(M.payFrac * 100 * (run.perks.gatefund ? 2 : 1)) + '% OF PRICE', x, y0 + 44, 6);
    TS(ctx, 'DRAG A ROUTE FROM', x, y0 + 54, 4);
    TS(ctx, 'ANY WORLD TO HERE', x, y0 + 61, 4);
    G.tip(x, y0 + 24, 100, 44, 'GOODS ATLAS PRIME RECEIVES ARE FORWARDED HERE. DIRECT ROUTES FROM PRODUCING WORLDS AND MORE FREIGHTERS ON THESE ROUTES SPEED IT UP.');
    closeBtn(ctx, y0);
  };

  /* ---------- pop-ups above the console ---------- */
  H.drawPopup = function (ctx, run) {
    const pu = G.popup;
    if (!pu) return;
    const b = S.getBody(run, pu.bodyId);
    if (!b || !b.claimed || !G.sel || G.sel.kind !== 'body' || G.sel.id !== b.id || G.selT < 1) { G.popup = null; return; }
    const top = G.H - G.CONSOLE_H;
    const sx = 6 + pu.slot * 32;
    const k = U.easeOut(U.clamp((G.time - (pu.t || 0)) * 8, 0, 1));
    if (pu.kind === 'build') {
      if (b.fac[pu.slot]) { G.popup = null; return; }
      const w = 196, h = AS.FAC_KEYS.length * 11 + 16;
      const x = U.clamp(sx - 8, 2, G.W - w - 2), y = Math.round(top - h - 3 + (1 - k) * 10);
      D.plate(ctx, x, y, w, h);
      G.block(x, y, w, h);
      T(ctx, 'BUILD IN SLOT ' + (pu.slot + 1), x + 6, y + 5, 12);
      H.buildRows = [];
      AS.FAC_KEYS.forEach((key, i) => {
        const F = AS.FAC[key], yy = y + 14 + i * 11;
        const noDep = F.deposit && !(b.dep[F.deposit] > 0), poor = run.credits < F.cost;
        if (!noDep && G.pointIn(G.mouse, x + 3, yy, w - 6, 11)) D.rect(ctx, x + 3, yy, w - 6, 11, 3);
        TS(ctx, F.name, x + 7, yy + 3, noDep ? 3 : poor ? 5 : 7);
        TS(ctx, noDep ? 'NO DEPOSIT' : AS.FAC_DESC[key], x + 70, yy + 3, noDep ? 16 : 5);
        if (!noDep) TS(ctx, F.cost, x + w - 7, yy + 3, poor ? 17 : 13, 'right');
        G.btns.push({ x: x + 3, y: yy, w: w - 6, h: 11, fn: () => AS.Act.build(b, pu.slot, key) });
        H.buildRows.push({ key, x: x + 3, y: yy, w: w - 6, h: 11 });
        G.tip(x + 3, yy, w - 6, 11, noDep ? 'THIS WORLD HAS NO ' + AS.GOODS[F.deposit].name + ' DEPOSIT.' : AS.FAC_HELP[key] + ' COST ' + F.cost + ', UPKEEP ' + F.upkeep.toFixed(2) + '/S, BUILD TIME ' + S.buildTime(key) + 'S.');
      });
    } else {
      const f = b.fac[pu.slot];
      if (!f) { G.popup = null; return; }
      const F = AS.FAC[f.type];
      const w = 170, h = 46, x = U.clamp(sx - 8, 2, G.W - w - 2), y = Math.round(top - h - 3 + (1 - k) * 10);
      D.plate(ctx, x, y, w, h);
      G.block(x, y, w, h);
      T(ctx, F.name, x + 6, y + 5, 12);
      TS(ctx, AS.FAC_DESC[f.type] + '  UPKEEP ' + S.facUpkeep(run, b, f).toFixed(2) + '/S', x + 6, y + 14, 6);
      const [st, sc] = STATUS_TXT[f.status] || STATUS_TXT.ok;
      TS(ctx, 'STATUS ' + st + (f.broken > 0 ? ' ' + Math.ceil(f.broken) + 'S' : f.build > 0 ? ' ' + Math.ceil(f.build) + 'S' : ''), x + 6, y + 23, sc);
      G.button(ctx, x + 6, y + 31, 110, 11, 'DEMOLISH +' + Math.round(F.cost * C.economy.demolishRefund) + ' CR', () => AS.Act.demolish(b, pu.slot), { col: 18, tip: 'REMOVE IT TO FREE THE SLOT. 40% OF THE COST COMES BACK.' });
    }
  };
})(globalThis.AS = globalThis.AS || {});
