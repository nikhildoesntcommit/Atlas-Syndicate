/* ATLAS SYNDICATE v6 — ui/screens.js
   Every menu screen, drawn in-canvas with the pixel fonts (v4's panel, card and chart code):
   title, new game, the upgrade shop, settings, achievements, how to play, code entry, pause,
   and the end-of-run report. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, D = AS.Draw, C = AS.CONFIG, PAL = AS.PALETTE, Act = AS.Act;
  const Sc = AS.Screens = { stack: [] };
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });

  Sc.open = function (name, data) {
    if (G.screen) Sc.stack.push(G.screen);
    G.screen = name; G.screenData = data || {}; G.screenT = 0; G.focusField = null;
    if (name === 'code') Sc.field('', 16, v => Sc.startCode(v));
  };
  Sc.replace = function (name, data) { G.screen = null; Sc.stack = []; Sc.open(name, data); };
  Sc.back = function () { G.focusField = null; G.screen = Sc.stack.pop() || null; G.screenT = 0.3; if (!G.screen && G.mode === 'menu') G.screen = 'title'; blurKbd(); };
  Sc.close = function () { G.screen = null; Sc.stack = []; G.focusField = null; blurKbd(); };

  /* ---------- text field (keyboard; a hidden input raises phone keyboards) ---------- */
  Sc.field = function (value, max, onEnter) {
    G.focusField = { value: String(value || ''), max, onEnter };
    const k = document.getElementById('kbd');
    if (k && G.touch) { k.value = G.focusField.value; try { k.focus(); } catch (e) { /* ignore */ } }
  };
  function blurKbd() { const k = typeof document !== 'undefined' && document.getElementById('kbd'); if (k) try { k.blur(); } catch (e) { /* ignore */ } }
  Sc.fieldKey = function (e) {
    const f = G.focusField;
    if (!f) return false;
    if (e.key === 'Enter') { f.onEnter(f.value.trim()); return true; }
    if (e.key === 'Backspace') { f.value = f.value.slice(0, -1); AS.Sfx.play('type'); return true; }
    if (e.key.length === 1 && /[A-Za-z0-9\-]/.test(e.key) && f.value.length < f.max) { f.value += e.key.toUpperCase(); AS.Sfx.play('type'); return true; }
    return e.key !== 'Escape';
  };
  function drawField(ctx, x, y, w) {
    const f = G.focusField, v = f ? f.value : '';
    D.frame(ctx, x, y, w, 15, 0, 12);
    T(ctx, v, x + 5, y + 5, 13);
    if (Math.floor(G.time * 2) % 2 === 0) D.rect(ctx, x + 6 + D.tw(v) + (v ? 1 : 0), y + 4, 4, 7, 13);
    G.btns.push({ x, y, w, h: 15, fn: () => { const k = document.getElementById('kbd'); if (k) try { k.value = v; k.focus(); } catch (e) { /* ignore */ } } });
  }

  /* ---------- shared panel and card ---------- */
  function panel(ctx, w, h, title, sub, noDim) {
    w = Math.min(w, G.W - 8); h = Math.min(h, G.H - 8);
    const k = U.easeOut(U.clamp(G.screenT * 5, 0, 1));
    const x = Math.round(G.W / 2 - w / 2), y = Math.round(G.H / 2 - h / 2 + (1 - k) * 30);
    if (!noDim) D.dim(ctx, 0, 0, G.W, G.H, 0.62);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y + 4, w, h);
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 3, 13, 0);
    G.block(x, y, w, h);
    if (title) T(ctx, title, G.W / 2, y + 9, 31, { align: 'center', big: true });
    if (sub) TS(ctx, sub, G.W / 2, y + 20, 6, 'center');
    return { x, y, w, h };
  }
  Sc.panel = panel;
  function backBtn(ctx, p, label) { G.button(ctx, Math.round(G.W / 2 - 40), p.y + p.h - 18, 80, 13, label || 'BACK', () => { AS.Sfx.play('click'); Sc.back(); }, { tip: 'ESC' }); }
  function card(ctx, x, y, w, h, key, title, desc, foot, stripe, fn, i, note) {
    const kk = U.easeOut(U.clamp(G.screenT * 5 - i * 0.15, 0, 1));
    y = Math.round(y + (1 - kk) * 20);
    const hov = G.pointIn(G.mouse, x, y, w, h);
    D.frame(ctx, x, y + 1, w, h, 0, 0);
    D.frame(ctx, x, y, w, h, hov ? 4 : 3, hov ? 13 : 0);
    D.rect(ctx, x + 1, y + 1, 3, h - 2, stripe);
    TS(ctx, key, x + 8, y + 5, 5);
    if (note) TS(ctx, note, x + w - 5, y + 5, stripe, 'right');
    const tl = U.wrapText(title, Math.floor((w - 14) / 6));
    tl.forEach((l, j) => T(ctx, l, x + 8, y + 14 + j * 9, 13, { big: true }));
    const dl = U.wrapText(desc, Math.floor((w - 14) / 4));
    dl.slice(0, 8).forEach((l, j) => TS(ctx, l, x + 8, y + 18 + tl.length * 9 + j * 7, 7));
    if (foot) TS(ctx, foot, x + 8, y + h - 9, 12);
    G.btns.push({ x, y, w, h, fn: () => { AS.Sfx.play('perk'); fn(); }, press: true });
  }

  /* ---------- title ---------- */
  function drawTitle(ctx) {
    const cx = Math.round(Math.max(118, Math.min(G.W * 0.27, 190)));
    const k = U.easeOut(U.clamp(G.screenT * 2, 0, 1));
    const ly = Math.round(G.H * 0.12 - (1 - k) * 30);
    const sc = G.W >= 640 ? 4 : 3;
    AS.Font.logo(ctx, 'ATLAS', cx, ly, sc);
    AS.Font.logo(ctx, 'SYNDICATE', cx, ly + 8 * sc + 4, Math.max(2, sc - 1), [7, 7, 6, 6, 5, 5, 4]);
    const ry = ly + 8 * sc + 4 + 8 * Math.max(2, sc - 1) + 6;
    D.hazard(ctx, Math.round(cx - 90), ry, 180, 3, 13, G.time * 6);
    TS(ctx, 'DRILL. REFINE. RAISE AN ARMY.', cx, ry + 7, 7, 'center');
    if (G.oldSaveMsg) T(ctx, 'YOUR SAVE FROM AN OLDER VERSION WAS REMOVED', cx, ry + 25, 17, { align: 'center' });
    TS(ctx, 'TAKE THE GALAXY FROM FIVE AI RIVALS.', cx, ry + 15, 5, 'center');
    const save = G.saveInfo;
    const items = [];
    if (save) items.push(['CONTINUE  ' + U.fmtTime(save.run.t), () => AS.Main.resume(save), { primary: true, tip: 'RESUME YOUR LAST GAME.' }]);
    items.push(['NEW GAME', () => Sc.open('newgame', { seed: U.randomSeed() }), { primary: !save, tip: 'A NEW RANDOM GALAXY.' }]);
    items.push(['ENTER CODE', () => Sc.open('code'), { tip: 'PLAY A GALAXY SOMEONE SHARED: SAME SEED, CORPORATION AND DIFFICULTY.' }]);
    items.push(['WATCH THE AI PLAY', () => AS.Main.startAttract(0), { tip: 'DEMO MODE: AN AI PLAYS YOUR FACTION.' }]);
    const got = Object.keys(Act.achievements()).length;
    items.push(['ACHIEVEMENTS  ' + got + '/' + AS.ACHIEVEMENTS.length, () => Sc.open('ach'), {}]);
    items.push(['SETTINGS', () => Sc.open('settings'), {}]);
    items.push(['HOW TO PLAY', () => Sc.open('help'), {}]);
    const bw = 150, bh = 14, gap = 3;
    let y = Math.max(ry + 26, Math.round(G.H - items.length * (bh + gap) - 18));
    items.forEach(([label, fn, o], i) => {
      const kk = U.easeOut(U.clamp(G.screenT * 4 - i * 0.12, 0, 1));
      G.button(ctx, Math.round(cx - bw / 2 + (1 - kk) * 60), y, bw, bh, label, () => { AS.Sfx.play('click'); fn(); }, o);
      y += bh + gap;
    });
    TS(ctx, 'V' + AS.VERSION, G.W - 6, G.H - 9, 4, 'right');
  }

  /* ---------- new game: difficulty ---------- */
  function drawNewGame(ctx) {
    const d = G.screenData;
    const p = panel(ctx, 440, 132, 'NEW GAME', 'GALAXY SEED ' + d.seed + '  -  CHOOSE A DIFFICULTY');
    const cw = Math.floor((p.w - 24) / 3);
    AS.DIFF_KEYS.forEach((key, i) => {
      const Df = AS.DIFFICULTY[key], x = p.x + 8 + i * (cw + 4);
      card(ctx, x, p.y + 30, cw, 72, '[' + (i + 1) + ']', Df.name, Df.desc, key === 'normal' ? 'RECOMMENDED' : '', [22, 13, 17][i], () => AS.Main.newRun(d.seed, key), i);
    });
    G.button(ctx, p.x + 8, p.y + p.h - 18, 110, 13, 'DIFFERENT GALAXY', () => { AS.Sfx.play('click'); G.screenData = { seed: U.randomSeed() }; }, { tip: 'ROLL ANOTHER SEED.' });
    G.button(ctx, p.x + p.w - 88, p.y + p.h - 18, 80, 13, 'BACK', () => { AS.Sfx.play('click'); Sc.back(); });
  }

  /* ---------- settings ---------- */
  function drawSettings(ctx) {
    const p = panel(ctx, 320, 222, 'SETTINGS');
    const s = G.settings;
    let y = p.y + 26;
    const row = (label, value, fn, tip) => { T(ctx, label, p.x + 14, y + 3, 7, { big: true }); G.button(ctx, p.x + p.w - 114, y, 100, 13, value, () => { AS.Sfx.play('click'); fn(); }, { tip }); y += 16; };
    const vol = (label, key) => {
      T(ctx, label, p.x + 14, y + 3, 7, { big: true });
      const bx = p.x + p.w - 114;
      G.button(ctx, bx, y, 12, 11, '-', () => { s[key] = Math.max(0, Math.round((s[key] - 0.1) * 10) / 10); Act.saveSettings(); AS.Sfx.play('click'); });
      D.bar(ctx, bx + 14, y + 2, 62, 7, s[key], 12);
      G.button(ctx, bx + 78, y, 12, 11, '+', () => { s[key] = Math.min(1, Math.round((s[key] + 0.1) * 10) / 10); Act.saveSettings(); AS.Sfx.play('click'); });
      y += 16;
    };
    row('UI SCALE', s.uiScale + '%' + (G.scale ? '  (X' + G.scale + ')' : ''), () => { const L = G.UI_SCALES; s.uiScale = L[(L.indexOf(s.uiScale) + 1) % L.length]; Act.saveSettings(); G.layout(); }, 'HOW BIG EVERYTHING IS: 100, 125, 150 OR 200%. PIXELS STAY WHOLE, SO EACH STEP ROUNDS TO THE NEAREST WHOLE PIXEL SIZE THAT FITS THIS SCREEN.');
    row('SCREEN SHAKE', s.shake ? 'ON' : 'OFF', () => { s.shake = !s.shake; Act.saveSettings(); });
    row('TIPS', s.tips ? 'ON' : 'OFF', () => { s.tips = !s.tips; s.tipsSet = true; Act.saveSettings(); }, 'HOVER TOOLTIPS ON EVERY ELEMENT.');
    vol('MUSIC VOLUME', 'music');
    vol('EFFECTS VOLUME', 'sfx');
    row('SOUND', s.mute ? 'MUTED' : 'ON', () => { s.mute = !s.mute; Act.saveSettings(); });
    row('TUTORIAL', AS.Store.get('tutorialDone', false) ? 'REPLAY NEXT GAME' : 'ON NEXT GAME', () => { AS.Store.set('tutorialDone', false); G.showToast('THE TUTORIAL WILL RUN IN YOUR NEXT GAME', 13); });
    // saved games: two clicks (DELETE, then CONFIRM within 3 s) so a stray click never wipes a game
    const hasSave = Act.hasSave(), arm = G.delArm && G.time < G.delArm;
    const inGame = G.mode === 'play' && G.run && !G.run.over;
    T(ctx, 'SAVED GAME', p.x + 14, y + 3, 7, { big: true });
    G.button(ctx, p.x + p.w - 114, y, 100, 13, arm ? 'CONFIRM?' : hasSave ? 'DELETE' : 'NONE', () => {
      if (!arm) { G.delArm = G.time + 3; AS.Sfx.play('warning'); return; }
      G.delArm = 0;
      Act.deleteSaves();
      if (inGame) G.run.noSave = true;   // also stop autosaving the game in progress
      AS.Sfx.play('remove');
      G.showToast('SAVED GAME DELETED', 13);
    }, { disabled: !hasSave && !arm, col: arm ? 17 : undefined, tip: 'DELETE YOUR SAVED GAME FROM THIS BROWSER (CLICK TWICE). ' + (inGame ? 'THE GAME IN PROGRESS STOPS AUTOSAVING.' : 'CONTINUE DISAPPEARS FROM THE MENU.') });
    y += 14;
    backBtn(ctx, p);
  }

  /* ---------- achievements ---------- */
  function drawAch(ctx) {
    const got = Act.achievements();
    const p = panel(ctx, 440, 190, 'ACHIEVEMENTS', Object.keys(got).length + ' OF ' + AS.ACHIEVEMENTS.length + ' UNLOCKED');
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

  /* ---------- how to play ---------- */
  function drawHelp(ctx) {
    const p = panel(ctx, 490, 250, 'HOW TO PLAY');
    const L = [
      ['GOAL', 'ELIMINATE EVERY RIVAL, OR HOLD THE MOST SYSTEMS AT 30:00. LOSE YOUR CAPITAL AND YOU LOSE.'],
      ['VIEWS', 'GALAXY > SYSTEM > PLANET. CLICK YOUR SYSTEM, THEN A PLANET. ESC GOES BACK.'],
      ['PLANET', 'CLICK AN EMPTY SLOT: BUILD. DRAG DOWN FROM AN EXTRACTOR TO A DEPOSIT: DRILL (BARRIERS CANNOT BE DRILLED).'],
      ['', 'DRAG AN EXTRACTOR ACROSS TO ITS PROCESSOR: CONVEYOR. METAL > SMELTER = ALLOY. GOLD > MINT = CREDITS.'],
      ['', 'ICE > WATER PLANT = FOOD. CRUDE > REFINERY = FUEL. PROCESSORS WORK 50% BETTER ON MATCHING PLANETS.'],
      ['SYSTEM', 'DRAG PLANET > PLANET: PATHWAY. EACH END GETS A PORT: SEND RAW RESOURCES TO WHERE THERE IS ROOM.'],
      ['STOCKS', 'CREDITS PAY SALARIES. FOOD FEEDS SOLDIERS. FUEL MOVES ARMIES. ALLOY BUILDS AND REPAIRS.'],
      ['', 'EVERYTHING WEARS OUT; DEPOSITS RUN DRY. THE SHOP (U) SELLS PERMANENT UPGRADES.'],
      ['WAR', 'DRAG FROM YOUR SYSTEM ONTO A NEIGHBOUR: SEE THE ODDS AND FUEL, PICK HOW MANY, ATTACK OR RAID.'],
      ['', 'NOBODY ATTACKS BEFORE 4:00. ANYONE AT 35% FACES A COALITION OF EVERYONE ELSE.'],
      ['KEYS', 'SPACE PAUSE  1 2 3 SPEED  ESC BACK  U SHOP  WASD PAN  Q/E ZOOM  T TIPS  M MUTE  F9 JUMP TO 15:00'],
      ['TOUCH', 'TAP = CLICK. DRAG = PAN, DRILL OR CONNECT. PINCH = ZOOM.'],
    ];
    L.forEach(([h, t], i) => { const y = p.y + 26 + i * 15; if (h) T(ctx, h, p.x + 12, y, 12, { big: true }); TS(ctx, t, p.x + 62, y + 1, 7); });
    backBtn(ctx, p);
  }

  /* ---------- code entry ---------- */
  function drawCode(ctx) {
    const p = panel(ctx, 290, 110, 'ENTER CODE', 'A SHARE CODE FROM AN END REPORT, OR A SEED NUMBER');
    drawField(ctx, p.x + 30, p.y + 38, p.w - 60);
    const parsed = U.parseCode(G.focusField ? G.focusField.value : '');
    if (parsed) TS(ctx, 'SEED ' + parsed.seed + ' - ' + AS.DIFFICULTY[parsed.diff].name, G.W / 2, p.y + 60, 13, 'center');
    else if (G.focusField && G.focusField.value) TS(ctx, 'NOT A VALID CODE YET', G.W / 2, p.y + 60, 17, 'center');
    G.button(ctx, p.x + 30, p.y + p.h - 22, 100, 14, 'PLAY', () => Sc.startCode(G.focusField ? G.focusField.value : ''), { primary: !!parsed, disabled: !parsed });
    G.button(ctx, p.x + p.w - 130, p.y + p.h - 22, 100, 14, 'BACK', () => { AS.Sfx.play('click'); Sc.back(); });
  }
  Sc.startCode = function (v) {
    const c = U.parseCode(v);
    if (!c) { AS.Sfx.play('err'); return; }
    AS.Main.newRun(c.seed, c.diff);
  };

  /* ---------- pause ---------- */
  function drawPause(ctx) {
    const run = G.run;
    const p = panel(ctx, 230, 150, 'PAUSED', run ? 'SEED ' + run.seed + ' - ' + AS.DIFFICULTY[run.diff].name : '');
    const items = [
      ['RESUME', () => Sc.close(), { primary: true }],
      ['SETTINGS', () => Sc.open('settings'), {}],
      ['HOW TO PLAY', () => Sc.open('help'), {}],
      ['RESTART THIS GALAXY', () => AS.Main.newRun(run.seed, run.diff), {}],
      ['SAVE AND QUIT TO MENU', () => AS.Main.toMenu(true), {}],
    ];
    items.forEach(([l, fn, o], i) => G.button(ctx, p.x + 30, p.y + 30 + i * 18, p.w - 60, 14, l, () => { AS.Sfx.play('click'); fn(); }, o));
  }

  /* ---------- the upgrade shop ---------- */
  function drawShop(ctx) {
    const run = G.run, f = run && run.factions[0];
    if (!f) { Sc.close(); return; }
    const p = panel(ctx, Math.min(G.W - 8, 520), Math.min(G.H - 8, 230), 'UPGRADE SHOP', 'PERMANENT. BOUGHT IN ORDER ALONG EACH TRACK. TIME KEEPS RUNNING. YOU HAVE ' + Math.floor(f.credits) + ' CR, ' + Math.floor(f.alloy) + ' ALLOY');
    const cw = Math.floor((p.w - 20) / 4), rh = Math.floor((p.h - 54) / 5);
    AS.UPG_TRACKS.forEach((t, ti) => {
      const T2 = AS.UPGRADES[t], x = p.x + 8 + ti * (cw + 1), lvl = f.up[t];
      T(ctx, T2.name, x + cw / 2, p.y + 28, T2.col, { big: true, align: 'center' });
      T2.items.forEach((it, i) => {
        const y = p.y + 38 + i * rh, owned = i < lvl, next = i === lvl, price = AS.upgPrice(i);
        const can = next && S.canPay(f, price);
        D.frame(ctx, x, y, cw - 2, rh - 2, owned ? 20 : next ? 3 : 1, owned ? 21 : next ? (can ? 13 : 4) : 2);
        T(ctx, it.name, x + 4, y + 3, owned ? 22 : next ? 31 : 5, { big: rh >= 30 && cw >= 110 });
        const dl = U.wrapText(it.desc, Math.floor((cw - 10) / 4));
        dl.slice(0, 2).forEach((l, j) => TS(ctx, l, x + 4, y + (rh >= 30 ? 13 : 10) + j * 7, owned ? 7 : next ? 7 : 4));
        if (owned) TS(ctx, 'OWNED', x + cw - 6, y + 3, 22, 'right');
        else TS(ctx, price[0] + ' CR ' + price[1] + ' AL', x + cw - 6, y + rh - 9, can ? 13 : 4, 'right');
        if (next) G.btns.push({ x, y, w: cw - 2, h: rh - 2, fn: () => (can ? AS.Act.upgrade(t) : AS.Act.fail({ reason: 'cost', cost: price })), press: true, label: 'upg:' + t });
        G.tip(x, y, cw - 2, rh - 2, it.name + ': ' + it.desc + (owned ? ' (OWNED)' : next ? ' PRICE ' + price[0] + ' CREDITS AND ' + price[1] + ' ALLOY.' : ' BUY THE ONES ABOVE FIRST.'));
      });
    });
    G.button(ctx, Math.round(G.W / 2 - 40), p.y + p.h - 16, 80, 13, 'CLOSE', () => { AS.Sfx.play('click'); Sc.close(); }, { tip: 'ESC OR U' });
  }

  /* ---------- end-of-run report ---------- */
  function chart(ctx, x, y, w, h, hist, series, label, fmt) {
    D.frame(ctx, x, y, w, h, 1, 3);
    if (hist.length < 2) return;
    const tMax = Math.max(60, hist[hist.length - 1][0]);
    let hi = 1;
    for (const r of hist) for (const [i] of series) hi = Math.max(hi, r[i]);
    const px = t => x + 1 + Math.round(t / tMax * (w - 3)), py = v => y + h - 2 - Math.round(v / hi * (h - 10));
    for (let m = 300; m < tMax; m += 300) D.rect(ctx, px(m), y + h - 3, 1, 2, 4);
    for (const [idx, col] of series) {
      let prev = null;
      for (const r of hist) {
        const X = px(r[0]), Y = py(r[idx]);
        if (prev) { const st = Math.max(1, Math.abs(X - prev[0]), Math.abs(Y - prev[1])); for (let s = 0; s <= st; s++) D.rect(ctx, Math.round(prev[0] + (X - prev[0]) * s / st), Math.round(prev[1] + (Y - prev[1]) * s / st), 1, 1, col); }
        prev = [X, Y];
      }
    }
    TS(ctx, label, x + 3, y + 3, 7);
    TS(ctx, 'PEAK ' + fmt(hi), x + w - 3, y + 3, 5, 'right');
  }
  const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];
  function drawReport(ctx) {
    const d = G.screenData, run = d.run;
    if (!run) { Sc.close(); return; }
    const won = run.winner === 0, f = run.factions[0];
    const st = S.standings(run), place = st.findIndex(x => x.id === 0);
    const p = panel(ctx, 520, 270, won ? 'VICTORY' : f.alive ? 'GAME OVER' : 'DEFEATED', run.overReason + '  -  ' + U.fmtTime(run.endT || run.t));
    const lx = p.x + 10;
    let y = p.y + 30;
    T(ctx, 'RANK ' + ORD[place] + ' OF 6', lx, y, won ? 13 : 7, { big: true }); y += 12;
    const rows = [['SYSTEMS HELD (PEAK)', S.ownCount(run, 0) + ' (' + f.stats.peakSystems + ')'], ['CAPTURED / LOST', f.stats.captured + ' / ' + f.stats.systemsLost], ['BOUGHT', f.stats.bought], ['RIVALS ELIMINATED', f.stats.eliminated],
      ['DEFENCES HELD', f.stats.defended], ['RAIDS', f.stats.raids], ['SOLDIERS LOST / KILLED', f.stats.lost + ' / ' + f.stats.killed], ['DESERTED', f.stats.deserted], ['TOTAL INCOME', U.fmtInt(f.stats.income) + ' CR'], ['SALARIES PAID', U.fmtInt(f.stats.salary) + ' CR'],
      ['ALLOY / FUEL / FOOD MADE', Math.round(f.stats.alloyMade) + ' / ' + Math.round(f.stats.fuelMade) + ' / ' + Math.round(f.stats.foodMade)], ['DIFFICULTY', AS.DIFFICULTY[run.diff].name]];
    for (const [l, v] of rows) { TS(ctx, l, lx, y, 6); TS(ctx, v, lx + 160, y, 7, 'right'); y += 8; }
    y += 4;
    const code = U.makeCode(run.seed, run.diff);
    TS(ctx, 'SHARE CODE (SEED AND DIFFICULTY)', lx, y, 5);
    G.button(ctx, lx, y + 7, 160, 14, code, () => {
      try { if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => G.showToast('CODE COPIED', 13), () => G.showToast('CODE: ' + code, 13)); else G.showToast('CODE: ' + code, 13); } catch (e) { G.showToast('CODE: ' + code, 13); }
      AS.Sfx.play('click');
    }, { tip: 'CLICK TO COPY. A FRIEND ENTERS IT UNDER ENTER CODE TO PLAY THE SAME GALAXY.' });
    // charts
    const rx = p.x + 182, cw = p.w - 192;
    chart(ctx, rx, p.y + 28, cw, 62, run.hist, run.factions.map((x, i) => [1 + i, x.col]), 'SYSTEMS HELD PER FACTION', v => v);
    run.factions.forEach((x, i) => { ctx.drawImage(AS.Spr.factionIcon(x.icon, x.col), rx + 4 + i * 28, p.y + 92); TS(ctx, x.id === 0 ? 'YOU' : AS.PERS_NAMES[x.pers].slice(0, 4), rx + 10 + i * 28, p.y + 92, x.alive ? x.col : 4); });
    const half = Math.floor((cw - 4) / 2);
    chart(ctx, rx, p.y + 102, half, 40, run.hist, [[7, 13]], 'YOUR INCOME/CYCLE', v => v);
    chart(ctx, rx + half + 4, p.y + 102, half, 40, run.hist, [[8, 17]], 'YOUR SOLDIERS', v => v);
    TS(ctx, 'DECISIVE BATTLES', rx, p.y + 148, 12);
    const dec = run.battleLog.filter(b => b.att >= 0).map(b => Object.assign({ s: b.size + (b.capital ? 200 : 0) + (b.att === 0 || b.def === 0 ? 40 : 0) }, b)).sort((a, b) => b.s - a.s).slice(0, 6).sort((a, b) => a.t - b.t);
    dec.forEach((b, i) => {
      const A = run.factions[b.att], Dn = b.def >= 0 ? run.factions[b.def].short : 'INDEPENDENTS';
      const W = b.winner === b.att ? A.short + (b.mode === 'raid' ? ' RAIDED ' : ' TOOK ') : (b.def >= 0 ? run.factions[b.def].short : 'INDEPENDENTS') + ' HELD ';
      const txt = W + run.systems[b.sys].name + (b.winner === b.att ? ' FROM ' + Dn : ' VS ' + A.short) + (b.capital && b.winner === b.att ? ' (CAPITAL)' : '') + '  SIZE ' + b.size;
      TS(ctx, U.fmtTime(b.t), rx + 18, p.y + 157 + i * 8, 5, 'right');
      TS(ctx, txt.slice(0, Math.floor((cw - 24) / 4)), rx + 22, p.y + 157 + i * 8, b.att === 0 || b.def === 0 ? (b.winner === 0 ? 22 : 17) : 7);
    });
    const by = p.y + p.h - 20;
    if (G.attract) { TS(ctx, 'DEMO - RESTARTING SOON', G.W / 2, by + 4, 5, 'center'); return; }
    G.button(ctx, p.x + 10, by, 140, 14, 'PLAY THIS GALAXY AGAIN', () => { AS.Sfx.play('click'); AS.Main.newRun(run.seed, run.diff); }, { primary: true });
    G.button(ctx, p.x + 156, by, 90, 14, 'NEW GAME', () => { AS.Sfx.play('click'); AS.Main.toMenu(false); Sc.open('newgame', { seed: U.randomSeed() }); });
    G.button(ctx, p.x + p.w - 100, by, 90, 14, 'MAIN MENU', () => { AS.Sfx.play('click'); AS.Main.toMenu(false); });
  }

  const DRAW = { title: drawTitle, newgame: drawNewGame, shop: drawShop, settings: drawSettings, ach: drawAch, help: drawHelp, code: drawCode, pause: drawPause, report: drawReport };
  Sc.draw = function (ctx, dt) {
    if (!G.screen) return;
    G.screenT += dt;
    const fn = DRAW[G.screen];
    if (fn) fn(ctx);
  };
  Sc.key = function (e) {
    if (Sc.fieldKey(e)) return true;
    const k = e.key, scr = G.screen;
    if (k === 'Escape') {
      if (scr === 'report' || scr === 'title') return true;
      if (scr === 'pause') { Sc.close(); return true; }
      Sc.back(); return true;
    }
    const n = parseInt(k, 10);
    if (scr === 'shop' && (k === 'u' || k === 'U')) { Sc.close(); return true; }
    if (scr === 'newgame' && n >= 1 && n <= 3) { AS.Main.newRun(G.screenData.seed, AS.DIFF_KEYS[n - 1]); return true; }
    if (scr === 'title' && (k === 'Enter' || k === ' ')) { if (G.saveInfo) AS.Main.resume(G.saveInfo); else Sc.open('newgame', { seed: U.randomSeed() }); return true; }
    return false;
  };
})(globalThis.AS = globalThis.AS || {});
