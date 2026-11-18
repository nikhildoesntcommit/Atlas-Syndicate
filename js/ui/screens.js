/* ATLAS SYNDICATE v4 — ui/screens.js
   Every menu screen, drawn in-canvas with the pixel fonts: title, charter, settings, achievements,
   leaderboard, how to play, share-code entry, pause, quarterly review (perks) and the end-of-run report. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, D = AS.Draw, C = AS.CONFIG, PAL = AS.PALETTE, Act = AS.Act;
  const Sc = AS.Screens = { stack: [] };
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });

  Sc.open = function (name, data) {
    if (G.screen) Sc.stack.push(G.screen);
    G.screen = name; G.screenData = data || {}; G.screenT = 0; G.focusField = null;
    if (name === 'name') Sc.field(G.name === 'PLAYER' ? '' : G.name, 12, v => { G.name = v || 'PLAYER'; AS.Store.set('name', G.name); Sc.back(); });
    if (name === 'code') Sc.field('', 16, v => Sc.startCode(v));
  };
  Sc.replace = function (name, data) { G.screen = null; Sc.stack = []; Sc.open(name, data); };
  Sc.back = function () { G.focusField = null; G.screen = Sc.stack.pop() || null; G.screenT = 0.3; if (!G.screen && G.mode === 'menu') G.screen = 'title'; blurKbd(); };
  Sc.close = function () { G.screen = null; Sc.stack = []; G.focusField = null; blurKbd(); };

  /* ---------- text fields (keyboard; a hidden input brings up phone keyboards) ---------- */
  Sc.field = function (value, max, onEnter) {
    G.focusField = { value: String(value || ''), max, onEnter };
    const k = document.getElementById('kbd');
    if (k && G.touch) { k.value = G.focusField.value; try { k.focus(); } catch (e) { /* ignore */ } }
  };
  function blurKbd() { const k = document.getElementById('kbd'); if (k) try { k.blur(); } catch (e) { /* ignore */ } }
  Sc.fieldKey = function (e) {
    const f = G.focusField;
    if (!f) return false;
    if (e.key === 'Enter') { f.onEnter(f.value.trim()); return true; }
    if (e.key === 'Backspace') { f.value = f.value.slice(0, -1); AS.Sfx.play('type'); return true; }
    if (e.key.length === 1 && /[A-Za-z0-9 \-_.]/.test(e.key) && f.value.length < f.max) { f.value += e.key.toUpperCase(); AS.Sfx.play('type'); return true; }
    return e.key !== 'Escape';
  };
  function drawField(ctx, x, y, w) {
    const f = G.focusField;
    D.frame(ctx, x, y, w, 15, 0, 12);
    const v = f ? f.value : '';
    T(ctx, v, x + 5, y + 4, 13, { big: false, scale: 1 });
    if (Math.floor(G.time * 2) % 2 === 0) D.rect(ctx, x + 6 + D.tw(v) + (v ? 1 : 0), y + 3, 4, 8, 13);
    G.btns.push({ x, y, w, h: 15, fn: () => { const k = document.getElementById('kbd'); if (k) try { k.value = v; k.focus(); } catch (e) { /* ignore */ } } });
  }

  /* ---------- shared panel ---------- */
  function panel(ctx, w, h, title, sub) {
    w = Math.min(w, G.W - 8); h = Math.min(h, G.H - 8);
    const k = U.easeOut(U.clamp(G.screenT * 5, 0, 1));
    const x = Math.round(G.W / 2 - w / 2), y = Math.round(G.H / 2 - h / 2 + (1 - k) * 30);
    D.dim(ctx, 0, 0, G.W, G.H, 0.62);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y + 4, w, h);
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 3, 13, 0);
    G.block(x, y, w, h);
    if (title) T(ctx, title, G.W / 2, y + 9, 31, { align: 'center', big: true });
    if (sub) TS(ctx, sub, G.W / 2, y + 20, 6, 'center');
    return { x, y, w, h };
  }
  function backBtn(ctx, p, label) { G.button(ctx, Math.round(G.W / 2 - 40), p.y + p.h - 18, 80, 13, label || 'BACK', () => { AS.Sfx.play('click'); Sc.back(); }, { tip: 'ESC' }); }

  /* ---------- title ---------- */
  function drawTitle(ctx) {
    const cx = Math.round(Math.max(110, Math.min(G.W * 0.27, 190)));
    const k = U.easeOut(U.clamp(G.screenT * 2, 0, 1));
    const ly = Math.round(G.H * 0.12 - (1 - k) * 30);
    const sc = G.W >= 640 ? 4 : 3;
    AS.Font.logo(ctx, 'ATLAS', cx, ly, sc);
    AS.Font.logo(ctx, 'SYNDICATE', cx, ly + 8 * sc + 4, Math.max(2, sc - 1), [7, 7, 6, 6, 5, 5, 4]);
    const ry = ly + 8 * sc + 4 + 8 * Math.max(2, sc - 1) + 6;
    D.hazard(ctx, Math.round(cx - 90), ry, 180, 3, 13, G.time * 6);
    TS(ctx, 'BUILD AN INTERPLANETARY SUPPLY CHAIN', cx, ry + 7, 7, 'center');
    TS(ctx, 'CLAIM WORLDS - BUILD INDUSTRY - MOVE FREIGHT', cx, ry + 15, 5, 'center');
    const save = G.saveInfo;
    const items = [];
    if (save) items.push(['CONTINUE  ' + U.fmtTime(save.run.t), () => AS.Main.resume(save), { primary: true, tip: 'RESUME YOUR LAST RUN (' + save.run.sysName + ').' }]);
    items.push(['NEW GAME', () => AS.Main.newGame(), { primary: !save, tip: 'A NEW RANDOM SYSTEM.' }]);
    items.push(['DAILY SYSTEM  ' + S.systemName(U.dailySeed()), () => AS.Main.openCharter(U.dailySeed(), true), { tip: 'THE SAME SYSTEM FOR EVERYONE TODAY.' }]);
    items.push(['ENTER CODE', () => Sc.open('code'), { tip: 'PLAY A SYSTEM SOMEONE SHARED WITH YOU.' }]);
    const got = Object.keys(Act.achievements()).length;
    items.push(['ACHIEVEMENTS  ' + got + '/' + AS.ACHIEVEMENTS.length, () => Sc.open('ach'), {}]);
    items.push(['LEADERBOARD', () => Sc.open('board'), {}]);
    items.push(['SETTINGS', () => Sc.open('settings'), {}]);
    items.push(['HOW TO PLAY', () => Sc.open('help'), {}]);
    const bw = 150, bh = 14, gap = 3;
    const total = items.length * (bh + gap);
    let y = Math.max(ry + 26, Math.round(G.H - total - 18));
    items.forEach(([label, fn, o], i) => {
      const kk = U.easeOut(U.clamp(G.screenT * 4 - i * 0.12, 0, 1));
      const x = Math.round(cx - bw / 2 + (1 - kk) * 60);
      G.button(ctx, x, y, bw, bh, label, () => { AS.Sfx.play('click'); fn(); }, o);
      y += bh + gap;
    });
    const best = Act.board().filter(e => e.name === G.name)[0];
    TS(ctx, 'PLAYER ' + G.name + '  (CHANGE)', 6, G.H - 9, 6);
    G.btns.push({ x: 4, y: G.H - 11, w: D.tw('PLAYER ' + G.name + '  (CHANGE)') + 4, h: 9, fn: () => { AS.Sfx.play('click'); Sc.open('name'); } });
    if (best) TS(ctx, 'BEST ' + U.fmtInt(best.score), G.W - 6, G.H - 9, 13, 'right');
    else TS(ctx, 'V' + AS.VERSION, G.W - 6, G.H - 9, 4, 'right');
  }

  /* ---------- charter choice ---------- */
  function drawCharter(ctx) {
    const d = G.screenData;
    const p = panel(ctx, 440, 128, 'CHOOSE A CHARTER', 'SYSTEM ' + S.systemName(d.seed) + (d.daily ? '  -  DAILY SYSTEM' : '  -  SEED ' + d.seed) + '  -  HARDER CHARTERS MULTIPLY YOUR SCORE');
    const offers = S.charterOffers(d.seed);
    const cw = Math.floor((p.w - 24) / 3), ch = 70;
    offers.forEach((key, i) => {
      const Ch = AS.CHARTERS[key], x = p.x + 8 + i * (cw + 4), y = p.y + 30;
      card(ctx, x, y, cw, ch, '[' + (i + 1) + ']', Ch.name, Ch.desc, 'SCORE X' + Ch.score.toFixed(2), () => AS.Main.startRun(d.seed, key, { daily: d.daily }), i);
    });
    if (!d.daily) G.button(ctx, p.x + 8, p.y + p.h - 18, 110, 13, 'DIFFERENT SYSTEM', () => { AS.Sfx.play('click'); G.screenData = { seed: U.randomSeed(), daily: false }; }, { tip: 'GENERATE ANOTHER SYSTEM.' });
    G.button(ctx, p.x + p.w - 88, p.y + p.h - 18, 80, 13, 'BACK', () => { AS.Sfx.play('click'); Sc.back(); });
  }
  function card(ctx, x, y, w, h, key, title, desc, foot, fn, i) {
    const kk = U.easeOut(U.clamp(G.screenT * 5 - i * 0.15, 0, 1));
    y = Math.round(y + (1 - kk) * 20);
    const hov = G.pointIn(G.mouse, x, y, w, h);
    D.frame(ctx, x, y + 1, w, h, 0, 0);
    D.frame(ctx, x, y, w, h, hov ? 4 : 3, hov ? 13 : 0);
    D.rect(ctx, x + 1, y + 1, 3, h - 2, 12);
    TS(ctx, key, x + 8, y + 5, 5);
    const tl = U.wrapText(title, Math.floor((w - 14) / 4));
    tl.forEach((l, j) => T(ctx, l, x + 8, y + 13 + j * 7, 13));
    const dl = U.wrapText(desc, Math.floor((w - 14) / 4));
    dl.slice(0, 7).forEach((l, j) => TS(ctx, l, x + 8, y + 16 + tl.length * 7 + j * 7, 7));
    if (foot) TS(ctx, foot, x + 8, y + h - 9, 12);
    G.btns.push({ x, y, w, h, fn: () => { AS.Sfx.play('perk'); fn(); }, press: true });
  }

  /* ---------- settings ---------- */
  function drawSettings(ctx) {
    const p = panel(ctx, 300, 200, 'SETTINGS');
    const s = G.settings;
    let y = p.y + 26;
    const row = (label, value, fn, tip) => {
      TS(ctx, label, p.x + 14, y + 3, 7);
      G.button(ctx, p.x + p.w - 104, y, 90, 11, value, () => { AS.Sfx.play('click'); fn(); }, { tip });
      y += 14;
    };
    const vol = (label, key) => {
      TS(ctx, label, p.x + 14, y + 3, 7);
      const bx = p.x + p.w - 104;
      G.button(ctx, bx, y, 12, 11, '-', () => { s[key] = Math.max(0, Math.round((s[key] - 0.1) * 10) / 10); Act.saveSettings(); AS.Sfx.play('click'); });
      D.bar(ctx, bx + 14, y + 2, 62, 7, s[key], 12);
      G.button(ctx, bx + 78, y, 12, 11, '+', () => { s[key] = Math.min(1, Math.round((s[key] + 0.1) * 10) / 10); Act.saveSettings(); AS.Sfx.play('click'); });
      y += 14;
    };
    row('PIXEL SIZE', { large: 'LARGE', medium: 'MEDIUM', small: 'SMALL' }[s.uiScale], () => { s.uiScale = s.uiScale === 'large' ? 'medium' : s.uiScale === 'medium' ? 'small' : 'large'; Act.saveSettings(); G.layout(); }, 'UI SCALE. SMALLER PIXELS SHOW MORE OF THE MAP.');
    row('SCREEN SHAKE', s.shake ? 'ON' : 'OFF', () => { s.shake = !s.shake; Act.saveSettings(); });
    row('TIPS & ADVISOR', s.tips ? 'ON' : 'OFF', () => { s.tips = !s.tips; s.tipsSet = true; Act.saveSettings(); });
    vol('MUSIC VOLUME', 'music');
    vol('EFFECTS VOLUME', 'sfx');
    row('SOUND', s.mute ? 'MUTED' : 'ON', () => { s.mute = !s.mute; Act.saveSettings(); });
    row('PLAYER NAME', G.name, () => Sc.open('name'));
    row('GUIDED OPENING', AS.Store.get('onboarded', false) ? 'REPLAY NEXT GAME' : 'ON NEXT GAME', () => { AS.Store.set('onboarded', false); G.showToast('THE GUIDE WILL RUN IN YOUR NEXT NEW GAME', 13); }, 'SHOW THE 4-STEP GUIDE AGAIN.');
    backBtn(ctx, p);
  }

  /* ---------- achievements ---------- */
  function drawAch(ctx) {
    const got = Act.achievements();
    const p = panel(ctx, 440, 220, 'ACHIEVEMENTS', Object.keys(got).length + ' OF ' + AS.ACHIEVEMENTS.length + ' UNLOCKED');
    const colW = Math.floor((p.w - 24) / 2);
    AS.ACHIEVEMENTS.forEach((a, i) => {
      const x = p.x + 10 + (i % 2) * (colW + 4), y = p.y + 30 + Math.floor(i / 2) * 20;
      const ok = !!got[a.id];
      D.frame(ctx, x, y, colW, 18, ok ? 20 : 1, ok ? 21 : 3);
      ctx.drawImage(ok ? AS.Spr.icons.star : AS.Spr.icons.lock, x + 4, y + 6);
      T(ctx, a.name, x + 13, y + 3, ok ? 13 : 5);
      TS(ctx, a.desc, x + 13, y + 10, ok ? 7 : 4);
    });
    backBtn(ctx, p);
  }

  /* ---------- leaderboard ---------- */
  function drawBoard(ctx) {
    const p = panel(ctx, 400, 200, 'LEADERBOARD', 'TOP 10 ON THIS DEVICE');
    const b = Act.board();
    const cols = [[14, '#'], [32, 'PLAYER'], [112, 'SCORE'], [164, 'TIME'], [196, 'RESULT'], [256, 'CHARTER']];
    cols.forEach(([x, h]) => TS(ctx, h, p.x + x, p.y + 30, 5));
    D.rect(ctx, p.x + 10, p.y + 37, p.w - 20, 1, 3);
    if (!b.length) TS(ctx, 'NO RUNS RECORDED YET', G.W / 2, p.y + 70, 5, 'center');
    b.forEach((e, i) => {
      const y = p.y + 41 + i * 12, me = e.id === G.lastEntryId;
      if (me) D.rect(ctx, p.x + 10, y - 2, p.w - 20, 10, 3);
      const c = me ? 13 : 7;
      TS(ctx, i + 1, p.x + 14, y, c); TS(ctx, e.name, p.x + 32, y, c); TS(ctx, U.fmtInt(e.score), p.x + 112, y, c);
      TS(ctx, U.fmtTime(e.time), p.x + 164, y, c); TS(ctx, e.won ? 'GATE OPEN' : 'Q' + (e.q || 0), p.x + 196, y, e.won ? 22 : 6);
      TS(ctx, (e.charter || '').toUpperCase().slice(0, 18) + (e.daily ? ' D' : ''), p.x + 256, y, 6);
    });
    backBtn(ctx, p);
  }

  /* ---------- how to play ---------- */
  function drawHelp(ctx) {
    const p = panel(ctx, 460, 250, 'HOW TO PLAY');
    const L = [
      ['GOAL', 'CLAIM WORLDS, BUILD, LINK THEM TO ATLAS PRIME. GOODS THAT REACH PRIME ARE SOLD.'],
      ['', 'EVERY 3 MINUTES THE BOARD CHECKS REVENUE. KEEP BOARD CONFIDENCE ABOVE ZERO.'],
      ['', 'AROUND 18:00 THE JUMP GATE MEGAPROJECT UNLOCKS. FINISH ITS 3 STAGES TO WIN.'],
      ['CHAIN', 'MINE > ORE   DRILL > ICE   SKIMMER > GAS   AGRI DOME: ICE > FOOD'],
      ['', 'SMELTER: 2 ORE > ALLOY   FABRICATOR: ALLOY + GAS > PARTS (BEST PRICE)'],
      ['RULES', 'BOARD CONFIDENCE IS YOUR LIFE BAR: STARVING WORLDS, DEBT, MISSED TARGETS DRAIN IT.'],
      ['', 'COLONISTS PAY TAX AND EAT FOOD. NO FOOD = WORLD LOST; IT CAN BE CLAIMED AGAIN AFTER 60 S.'],
      ['MOUSE', 'CLICK A WORLD TO CLAIM OR MANAGE IT. CLICK A SLOT TO BUILD.'],
      ['', 'DRAG WORLD TO WORLD = ROUTE. CLICK A ROUTE, + / - FREIGHTERS. RIGHT-CLICK CLOSES IT.'],
      ['', 'DRAG EMPTY SPACE TO PAN, WHEEL TO ZOOM.'],
      ['TOUCH', 'TAP = CLICK. DRAG FROM A WORLD = ROUTE. DRAG SPACE = PAN. PINCH = ZOOM.'],
      ['KEYS', 'WASD/ARROWS PAN  Q/E ZOOM  R FIT  SPACE PAUSE  1 2 3 SPEED  F BUY FREIGHTER'],
      ['', '+/- FREIGHTERS ON ROUTE  T TIPS  M MUTE  ESC MENU'],
    ];
    L.forEach(([h, t], i) => { const y = p.y + 26 + i * 14; if (h) T(ctx, h, p.x + 12, y, 12); TS(ctx, t, p.x + 54, y, 7); });
    const gy = p.y + 26 + L.length * 14 + 2;
    AS.GOOD_KEYS.forEach((g, i) => { ctx.drawImage(AS.Spr.goods[g], p.x + 54 + i * 58, gy); TS(ctx, AS.GOODS[g].name + ' ' + AS.GOODS[g].price, p.x + 61 + i * 58, gy + 1, AS.GOODS[g].col); });
    backBtn(ctx, p);
  }

  /* ---------- code & name entry ---------- */
  function drawCode(ctx) {
    const p = panel(ctx, 280, 110, 'ENTER CODE', 'A SHARE CODE FROM A REPORT, OR A SEED NUMBER');
    drawField(ctx, p.x + 30, p.y + 38, p.w - 60);
    const parsed = U.parseCode(G.focusField ? G.focusField.value : '');
    if (parsed) TS(ctx, S.systemName(parsed.seed) + ' - ' + AS.CHARTERS[parsed.charter].name.toUpperCase() + (parsed.score ? ' - SCORE TO BEAT ' + U.fmtInt(parsed.score) : ''), G.W / 2, p.y + 60, 13, 'center');
    else if (G.focusField && G.focusField.value) TS(ctx, 'NOT A VALID CODE YET', G.W / 2, p.y + 60, 17, 'center');
    G.button(ctx, p.x + 30, p.y + p.h - 22, 100, 14, 'PLAY', () => Sc.startCode(G.focusField ? G.focusField.value : ''), { primary: !!parsed, disabled: !parsed });
    G.button(ctx, p.x + p.w - 130, p.y + p.h - 22, 100, 14, 'BACK', () => { AS.Sfx.play('click'); Sc.back(); });
  }
  Sc.startCode = function (v) {
    const c = U.parseCode(v);
    if (!c) { AS.Sfx.play('err'); return; }
    AS.Main.startRun(c.seed, c.charter, { beat: c.score });
  };
  function drawName(ctx) {
    const p = panel(ctx, 280, 100, 'ENTER YOUR NAME', 'UP TO 12 LETTERS OR DIGITS - SHOWN ON THE LEADERBOARD');
    drawField(ctx, p.x + 30, p.y + 36, p.w - 60);
    G.button(ctx, p.x + 30, p.y + p.h - 22, 90, 14, 'OK', () => G.focusField && G.focusField.onEnter(G.focusField.value.trim()), { primary: true });
    G.button(ctx, p.x + p.w - 120, p.y + p.h - 22, 90, 14, 'SKIP', () => { AS.Sfx.play('click'); if (!AS.Store.get('name', null)) AS.Store.set('name', G.name); Sc.back(); });
  }

  /* ---------- pause ---------- */
  function drawPause(ctx) {
    const run = G.run;
    const p = panel(ctx, 220, 150, 'PAUSED', run ? run.sysName + ' - ' + AS.CHARTERS[run.charter].name.toUpperCase() : '');
    const items = [
      ['RESUME', () => Sc.close(), { primary: true }],
      ['SETTINGS', () => Sc.open('settings'), {}],
      ['HOW TO PLAY', () => Sc.open('help'), {}],
      ['RESTART THIS SYSTEM', () => AS.Main.startRun(run.seed, run.charter, { daily: run.daily }), {}],
      ['SAVE AND QUIT TO MENU', () => AS.Main.toMenu(true), {}],
    ];
    items.forEach(([l, fn, o], i) => G.button(ctx, p.x + 30, p.y + 30 + i * 18, p.w - 60, 14, l, () => { AS.Sfx.play('click'); fn(); }, o));
  }

  /* ---------- quarterly review & perk choice ---------- */
  function drawShop(ctx) {
    const run = G.run;
    if (!run || !run.shop) { Sc.close(); return; }
    const R = run.lastReview;
    const n = run.shop.offers.length;
    const p = panel(ctx, Math.min(470, 130 * n + 30), 150, 'QUARTER ' + (R ? R.quarter : run.quarter) + ' REVIEW');
    if (R) {
      const k = U.clamp(G.screenT / 1.2, 0, 1);
      const shown = Math.round(R.revenue * U.easeOut(k));
      TS(ctx, 'REVENUE', p.x + 16, p.y + 24, 5);
      T(ctx, U.fmtInt(shown) + ' / ' + U.fmtInt(R.target) + ' CR', p.x + 52, p.y + 24, k >= 1 ? (R.met ? 22 : 17) : 7);
      D.bar(ctx, p.x + 16, p.y + 32, p.w - 32, 7, U.safeDiv(shown, R.target, 0), R.met ? 22 : 17);
      if (k >= 1) {
        T(ctx, R.met ? 'TARGET MET' : 'TARGET MISSED', p.x + p.w - 16, p.y + 24, R.met ? 22 : 17, { align: 'right' });
        TS(ctx, 'BOARD CONFIDENCE ' + (R.delta >= 0 ? '+' : '') + R.delta + '  >  ' + R.conf + '/100     NEXT TARGET ' + U.fmtInt(R.next) + ' CR' + (run.streak > 1 ? '     STREAK ' + run.streak : ''), p.x + 16, p.y + 43, 7);
      }
    }
    TS(ctx, 'CHOOSE ONE PERK FROM THE BOARD (KEYS 1-' + n + ')', G.W / 2, p.y + 55, 12, 'center');
    const cw = Math.floor((p.w - 16 - (n - 1) * 4) / n), ch = 62;
    run.shop.offers.forEach((key, i) => {
      const P = AS.PERKS[key], x = p.x + 8 + i * (cw + 4);
      card(ctx, x, p.y + 64, cw, ch, '[' + (i + 1) + ']' + (run.perks[key] ? '  OWNED X' + run.perks[key] : ''), P.name, P.desc, '', () => Sc.pickPerk(key), i);
    });
    TS(ctx, 'TIME IS PAUSED', G.W / 2, p.y + p.h - 12, 4, 'center');
  }
  Sc.pickPerk = function (key) {
    const run = G.run;
    if (!run || !run.shop) return;
    const res = S.act(run, 'perk', { key });
    if (res.ok) { AS.FX.consume(run, true); G.showToast(AS.PERKS[key].name.toUpperCase() + ' ACTIVE', 13); Sc.close(); Act.autosave(); }
  };

  /* ---------- end-of-run report ---------- */
  function chart(ctx, x, y, w, h, run, idx, col, label, fmt) {
    D.frame(ctx, x, y, w, h, 1, 3);
    const hist = run.hist;
    if (hist.length < 2) return;
    const tMax = Math.max(60, hist[hist.length - 1][0]);
    let lo = Infinity, hi = -Infinity;
    for (const r of hist) { lo = Math.min(lo, r[idx]); hi = Math.max(hi, r[idx]); }
    if (idx === 3) { lo = 0; hi = 100; }
    lo = Math.min(lo, 0); if (hi - lo < 1) hi = lo + 1;
    const px = t => x + 1 + Math.round(t / tMax * (w - 3)), py = v => y + h - 2 - Math.round((v - lo) / (hi - lo) * (h - 4));
    // quarter ticks and the megaproject unlock
    for (let q = 180; q < tMax; q += 180) D.rect(ctx, px(q), y + h - 3, 1, 2, 4);
    if (run.mega.unlockedAt) for (let yy = y + 1; yy < y + h - 1; yy += 2) D.rect(ctx, px(run.mega.unlockedAt), yy, 1, 1, 12);
    if (lo < 0) for (let xx = x + 1; xx < x + w - 1; xx += 2) D.rect(ctx, xx, py(0), 1, 1, 4);
    let prev = null;
    for (const r of hist) {
      const X = px(r[0]), Y = py(r[idx]);
      for (let yy = Y + 1; yy < y + h - 1; yy++) if (U.bayer(X, yy) < 4) D.rect(ctx, X, yy, 1, 1, 3);
      if (prev) {
        const steps = Math.max(1, Math.abs(X - prev[0]), Math.abs(Y - prev[1]));
        for (let s = 0; s <= steps; s++) D.rect(ctx, Math.round(prev[0] + (X - prev[0]) * s / steps), Math.round(prev[1] + (Y - prev[1]) * s / steps), 1, 1, col);
      }
      prev = [X, Y];
    }
    TS(ctx, label, x + 3, y + 3, col);
    TS(ctx, fmt(hist[hist.length - 1][idx]), x + w - 3, y + 3, 7, 'right');
    TS(ctx, 'PEAK ' + fmt(hi), x + w - 3, y + h - 8, 5, 'right');
  }
  function moments(run) {
    const pri = { mega: 5, bad: 3, find: 1, claim: 2, good: 2, perk: 1, ach: 2, info: 0 };
    const picked = run.log.filter(l => l.k !== 'perk' || false).map((l, i) => ({ l, s: (pri[l.k] || 0) + (/STAGE|COMPLETE|UNLOCKED|LOST|FIRST|MISSED/.test(l.text) ? 2 : 0) - i * 0.001 }));
    picked.sort((a, b) => b.s - a.s);
    return picked.slice(0, 8).map(p => p.l).sort((a, b) => a.t - b.t);
  }
  function drawReport(ctx) {
    const d = G.screenData, run = d.run;
    if (!run) { Sc.close(); return; }
    const sc = S.computeScore(run);
    const won = run.won;
    const p = panel(ctx, 470, 258, won ? C.mega.name + ' COMPLETE' : 'RUN OVER', (won ? 'MEGAPROJECT FINISHED AT ' + U.fmtTime(run.mega.completedAt) : run.overReason + ' AT ' + U.fmtTime(run.t)) + '  -  ' + run.sysName + '  -  ' + AS.CHARTERS[run.charter].name.toUpperCase());
    // left: score
    const lx = p.x + 12;
    let y = p.y + 30;
    const k = U.clamp(G.screenT / 1.5, 0, 1);
    const rows = [['REVENUE', sc.revenue], ['TIME ' + U.fmtTime(run.t), sc.tenure], ['CONTRACTS ' + run.contractsDone, sc.contracts], ['PEAK COLONISTS ' + Math.round(run.peakPop), sc.pop], ['GATE STAGES ' + run.mega.stage + '/3', sc.stages]];
    if (sc.mega) rows.push(['GATE BONUS', sc.mega]);
    rows.forEach(([l, v]) => { TS(ctx, l, lx, y, 6); TS(ctx, '+' + U.fmtInt(Math.round(v * U.easeOut(k))), lx + 150, y, 7, 'right'); y += 8; });
    TS(ctx, 'CHARTER MULTIPLIER', lx, y, 6); TS(ctx, 'X' + sc.mult.toFixed(2), lx + 150, y, 7, 'right'); y += 9;
    D.rect(ctx, lx, y - 2, 150, 1, 4);
    T(ctx, 'SCORE', lx, y + 2, 13, { big: true });
    T(ctx, U.fmtInt(Math.round(sc.total * U.easeOut(k))), lx + 150, y + 2, 13, { big: true, align: 'right' });
    y += 14;
    T(ctx, 'RANK: ' + S.rankTitle(sc.total), lx, y, 31);
    y += 9;
    TS(ctx, d.rank ? 'LEADERBOARD #' + d.rank + ' ON THIS DEVICE' : 'OUTSIDE THE LOCAL TOP 10', lx, y, 6);
    if (d.beat) { y += 8; TS(ctx, sc.total > d.beat ? 'YOU BEAT THE SHARED SCORE ' + U.fmtInt(d.beat) : 'SHARED SCORE TO BEAT: ' + U.fmtInt(d.beat), lx, y, sc.total > d.beat ? 22 : 17); }
    y += 11;
    const code = U.makeCode(run.seed, run.charter, sc.total);
    TS(ctx, 'SHARE CODE (SAME SYSTEM AND CHARTER)', lx, y, 5);
    G.button(ctx, lx, y + 7, 150, 14, code, () => {
      try { if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => G.showToast('CODE COPIED', 13), () => G.showToast('CODE: ' + code, 13)); else G.showToast('CODE: ' + code, 13); } catch (e) { G.showToast('CODE: ' + code, 13); }
      AS.Sfx.play('click');
    }, { tip: 'CLICK TO COPY. A FRIEND ENTERS IT UNDER ENTER CODE TO PLAY THIS EXACT SYSTEM.' });
    // right: charts + moments
    const rx = p.x + 176, cw = p.w - 188;
    chart(ctx, rx, p.y + 28, cw, 30, run, 1, 13, 'CREDITS', v => U.fmtNum(v));
    chart(ctx, rx, p.y + 61, cw, 30, run, 2, 22, 'COLONISTS', v => String(Math.round(v)));
    chart(ctx, rx, p.y + 94, cw, 30, run, 3, 26, 'BOARD CONFIDENCE', v => String(Math.round(v)));
    TS(ctx, 'KEY MOMENTS', rx, p.y + 130, 12);
    moments(run).forEach((m, i) => {
      const col = m.k === 'bad' ? 17 : m.k === 'mega' ? 13 : m.k === 'good' ? 22 : 7;
      TS(ctx, U.fmtTime(m.t), rx + 18, p.y + 139 + i * 8, 5, 'right');
      TS(ctx, m.text.slice(0, Math.floor((cw - 24) / 4)), rx + 22, p.y + 139 + i * 8, col);
    });
    const by = p.y + p.h - 20;
    if (G.attract) { TS(ctx, 'DEMO - RESTARTING SOON', G.W / 2, by + 4, 5, 'center'); return; }
    G.button(ctx, p.x + 12, by, 140, 14, 'PLAY THIS SYSTEM AGAIN', () => { AS.Sfx.play('click'); AS.Main.startRun(run.seed, run.charter, { daily: run.daily }); }, { primary: true });
    G.button(ctx, p.x + 158, by, 90, 14, 'NEW GAME', () => { AS.Sfx.play('click'); AS.Main.newGame(); });
    G.button(ctx, p.x + 254, by, 90, 14, 'LEADERBOARD', () => { AS.Sfx.play('click'); Sc.open('board'); });
    G.button(ctx, p.x + p.w - 102, by, 90, 14, 'MAIN MENU', () => { AS.Sfx.play('click'); AS.Main.toMenu(false); });
  }

  const DRAW = { title: drawTitle, charter: drawCharter, settings: drawSettings, ach: drawAch, board: drawBoard, help: drawHelp, code: drawCode, name: drawName, pause: drawPause, shop: drawShop, report: drawReport };
  Sc.draw = function (ctx, dt) {
    if (!G.screen) return;
    G.screenT += dt;
    const fn = DRAW[G.screen];
    if (fn) fn(ctx);
  };
  /** Keyboard shortcuts for screens. Returns true if handled. */
  Sc.key = function (e) {
    if (Sc.fieldKey(e)) return true;
    const k = e.key, scr = G.screen;
    if (k === 'Escape') {
      if (scr === 'shop' || scr === 'report' || scr === 'title') return true;
      if (scr === 'pause') { Sc.close(); return true; }
      Sc.back(); return true;
    }
    const n = parseInt(k, 10);
    if (scr === 'shop' && G.run && G.run.shop && n >= 1 && n <= G.run.shop.offers.length) { Sc.pickPerk(G.run.shop.offers[n - 1]); return true; }
    if (scr === 'charter' && n >= 1 && n <= 3) { const d = G.screenData; AS.Main.startRun(d.seed, S.charterOffers(d.seed)[n - 1], { daily: d.daily }); return true; }
    if (scr === 'title' && (k === 'Enter' || k === ' ')) { if (G.saveInfo) AS.Main.resume(G.saveInfo); else AS.Main.newGame(); return true; }
    return false;
  };
})(globalThis.AS = globalThis.AS || {});
