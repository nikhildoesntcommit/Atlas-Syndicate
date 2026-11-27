/* ATLAS SYNDICATE v7 — render/hud.js
   Screen-space UI, in two bars:
     TOP BAR    the stockpile (money, gold, water, food, fuel), military power, clock, speed and controls.
     LEFT PANEL collapsible. From the top:
                  1. what you clicked: the build list for an empty slot (click to buy), or the selected
                     building / port / pathway with its actions;
                  2. NOTIFICATIONS: what is happening in the galaxy (threats, shortages, events, big moments);
                  3. PLANET: the open planet (hidden when no planet is open);
                  4. SYSTEM: the open or selected system (hidden when none);
                  5. ECONOMY: every stock in detail, per cycle, with where it comes from and goes.
   Small alerts ("building placed", "connected") flash in the bottom strip for a few seconds.
   Plus the attack/move order (exact result, no dice) and the faction roster on the galaxy map. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, G = AS.G, D = AS.Draw;
  const H = AS.HUD = {};
  const TB = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: true, big: true, align });
  const TBn = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, big: true, align });
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const Act = () => AS.Act;
  const r1 = v => Math.round(v * 10) / 10;
  const sgn = v => (v >= 0 ? '+' : '-') + (Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : r1(Math.abs(v)));
  const money = c => '$' + U.fmtInt(c);
  H.money = money;
  const STATUS = { ok: 'WORKING', idle: 'IDLE', blocked: 'BLOCKED', empty: 'DEPOSIT EMPTY', nocrew: 'NO WORKERS' };
  /** The icon for what a building makes (or digs). */
  H.bldIcon = kind => { const B = AS.BLD[kind]; return AS.Spr.goods[B.role === 'farm' ? 'food' : B.role === 'proc' ? AS.RES[B.res].out : B.res]; };
  H.unitsText = u => AS.UNIT_KEYS.filter(k => u[k]).map(k => u[k] + ' ' + (u[k] === 1 ? AS.UNITS[k].name : AS.UNITS[k].short)).join(', ') || 'NO UNITS';

  /* ================= TOP BAR ================= */
  H.drawTop = function (ctx, run, interactive) {
    const W = G.W, f = run.factions[0], fc = G.forecast;
    D.rect(ctx, 0, 0, W, G.HUD_H - 2, 1); D.rect(ctx, 0, G.HUD_H - 2, W, 1, 3); D.rect(ctx, 0, G.HUD_H - 1, W, 1, 0);
    const narrow = W < 600;
    let x = 3;
    for (const k of AS.STOCK_KEYS) {
      const v = k === 'money' ? G.disp.money : f[k], st = AS.STOCK[k];
      ctx.drawImage(AS.Spr.goods[k], x, 6);
      const txt = (k === 'money' ? '$' : '') + U.fmtNum(Math.max(0, v));
      TB(ctx, txt, x + 7, 4, st.col);
      let w = 9 + D.tw(txt, true);
      const short = fc && fc.warn.some(q => q.res === k);
      if (fc && k !== 'money' && !narrow) {
        const net = fc[k].net;
        TS(ctx, sgn(net), x + w, 6, net > 0 ? 22 : net < 0 ? (short && Math.floor(G.time * 3) % 2 ? 31 : 17) : 5);
        w += D.tw(sgn(net));
      } else if (short) D.rect(ctx, x + w - 1, 5, 2, 2, Math.floor(G.time * 3) % 2 ? 31 : 17);
      w += 6;
      if (fc) G.tip(x - 2, 0, w, G.HUD_H, st.name + ': ' + Math.floor(v) + '. ' + st.use + (k === 'money' ? '' : ' NEXT CYCLE: +' + fc[k].in + ' IN, -' + fc[k].out + ' OUT.') + (st.price ? ' MARKET PRICE ' + S.price(run, k) + '.' : ''));
      x += w;
    }
    // military power
    const pw = Math.round(S.militaryPower(run, 0)), eff = f.fuelEff;
    ctx.drawImage(AS.Spr.icons.power, x, 6);
    const ptxt = String(pw);
    TB(ctx, ptxt, x + 7, 4, pw > 0 ? 17 : 5);
    let pwW = 9 + D.tw(ptxt, true);
    if (eff < 0.999) { TS(ctx, Math.round(eff * 100) + '%', x + pwW, 6, Math.floor(G.time * 3) % 2 ? 31 : 17); pwW += D.tw(Math.round(eff * 100) + '%'); }
    G.tip(x - 2, 0, pwW + 6, G.HUD_H, 'MILITARY POWER ' + pw + ': SHIPS 1, DESTROYERS 5, CANNONS 10 EACH' + (eff < 0.999 ? ', AT ' + Math.round(eff * 100) + '% BECAUSE FUEL RAN SHORT' : '') + '. BUY MORE IN THE SHOP.');
    x += pwW + 8;
    D.bar(ctx, x, 6, 14, 5, run.cycleT / C.game.cycle, 12);
    G.tip(x - 1, 0, 16, G.HUD_H, 'TIME TO THE NEXT CYCLE (EVERY ' + C.game.cycle + ' S): PRODUCTION ARRIVES, WORKERS EAT, THE MILITARY BURNS FUEL.');
    x += 18;
    const clock = U.fmtTime(run.t);
    TB(ctx, clock, x, 4, C.game.length - run.t < 120 && Math.floor(G.time * 2) % 2 ? 13 : 7);
    G.tip(x - 2, 0, D.tw(clock, true) + 4, G.HUD_H, 'GAME TIME. AT 30:00 THE FACTION WITH THE MOST SYSTEMS WINS. ' + S.ownCount(run, 0) + ' OF ' + run.systems.length + ' ARE YOURS.');
    if (!interactive) return;
    let bx = W - 3;
    const btn = (w, label, fn, o) => { bx -= w + 2; G.button(ctx, bx, 2, w, 12, label, fn, o); };
    btn(34, 'MENU', () => Act().openPause(), { tip: 'PAUSE MENU AND SETTINGS (ESC).' });
    if (!narrow) btn(22, G.settings.mute ? 'MUT' : 'SND', () => Act().toggleMute(), { col: G.settings.mute ? 17 : 7, tip: 'SOUND ON/OFF (M).' });
    for (let i = C.sim.hudSpeeds.length - 1; i >= 0; i--) { const sp = C.sim.hudSpeeds[i]; btn(16, sp + 'X', () => Act().setSpeed(sp), { active: !G.paused && G.speed === sp, tip: 'GAME SPEED (KEYS 1-3).' }); }
    btn(16, 'II', () => Act().togglePause(), { active: G.paused, tip: 'PAUSE (SPACE). YOU CAN STILL GIVE ORDERS.' });
    if (!narrow) btn(28, 'TIPS', () => Act().toggleTips(), { active: G.settings.tips, tip: 'TIPS: HOVER ANYTHING FOR AN EXPLANATION (T).' });
    btn(34, 'SHOP', () => Act().openShop(), { primary: AS.Tutorial && (AS.Tutorial.want('shop') || AS.Tutorial.want('units')), tip: 'SHOP (B): SELL GOLD AND TRADE RESOURCES ON THE MARKET, BUY SPACE SHIPS, DESTROYERS AND CANNONS.' });
  };

  /* ================= NOTIFICATIONS ================= */
  const PRI = { inc: 0, broke: 1, short: 2, mass: 3 };
  H.warningList = run => run.warnings.slice().sort((a, b) => PRI[a.kind] - PRI[b.kind] || b.t0 - a.t0);
  H.warnHelp = w => ({ mass: 'A RIVAL IS GATHERING POWER NEXT TO YOUR SYSTEM. BUY UNITS THERE OR MOVE SOME IN. CLICK TO LOOK.', inc: 'AN ATTACK IS ON ITS WAY. IF YOUR POWER THERE IS BIGGER WHEN IT ARRIVES, YOU WIN. BUY UNITS THERE NOW. CLICK TO LOOK.', short: 'THIS STOCK WILL RUN OUT AT THE CURRENT RATE. BUILD MORE OF ITS CHAIN, OR BUY SOME ON THE MARKET.', broke: 'FIX THIS NOW: BUILD THE CHAIN OR BUY IT ON THE MARKET (SHOP).' }[w.kind] || '');
  H.notifications = function (run) {
    const out = [], f = run.factions[0];
    if (run.t < C.game.protect) {
      const pw = S.militaryPower(run, 0);
      out.push({ text: 'PEACE FOR ' + U.fmtTime(C.game.protect - run.t) + ': NOBODY CAN ATTACK UNTIL 4:00.' + (pw < 1 ? ' YOU HAVE NO MILITARY YET: BUY SOME IN THE SHOP BEFORE THEN.' : ''), col: 13, tip: 'BUILD YOUR ECONOMY AND BUY SOME MILITARY BEFORE ATTACKS OPEN.', urgent: run.t > C.game.protect - 60 && pw < 1 });
    }
    for (const w of H.warningList(run)) out.push({ text: w.text, col: w.kind === 'inc' || w.kind === 'broke' ? 17 : w.kind === 'short' ? 18 : 13, sys: w.kind === 'short' || w.kind === 'broke' ? -1 : w.sys, tip: H.warnHelp(w), urgent: w.kind === 'inc' || w.kind === 'broke', res: w.res });
    const co = run.coalition;
    if (co) {
      const tgt = run.factions[co.target];
      out.push({ text: 'COALITION AGAINST ' + (co.target === 0 ? 'YOU' : AS.PERS_NAMES[tgt.pers]) + ': TRUCE ENDS IN ' + U.fmtTime(co.until - run.t) + ', NEXT STRIKE ' + U.fmtTime(Math.max(0, co.nextStrike - run.t)), col: 17,
        tip: tgt.short + ' HOLDS 35% OF THE GALAXY. EVERY OTHER FACTION STOPS FIGHTING EACH OTHER AND STRIKES IT TOGETHER.' + (co.target !== 0 ? ' YOU ARE IN THE TRUCE: YOU MAY ONLY ATTACK THE LEADER (AND INDEPENDENTS).' : ''), urgent: co.target === 0 });
    }
    const ev = run.events, e = ev.next;
    for (const a of ev.active) out.push({ text: AS.EVENTS[a.type].name + ' (' + U.fmtTime(a.until - run.t) + ' LEFT): ' + S.eventText(run, a), col: 18, tip: 'GALAXY EVENT IN PROGRESS.' });
    if (e && e.announced) out.push({ text: 'IN ' + U.fmtTime(e.at - run.t) + ': ' + AS.EVENTS[e.type].name + ' - ' + S.eventText(run, e), col: 13, tip: 'GALAXY EVENT, ANNOUNCED 60 S AHEAD SO YOU CAN PREPARE.' });
    const recent = run.log.filter(l => run.t - l.t < 60 && (l.d || l.k === 'bad' || l.k === 'good' || l.k === 'mega')).slice(-3).reverse();
    for (const l of recent) out.push({ text: U.fmtTime(l.t) + ' ' + l.text, col: l.k === 'bad' ? 17 : l.k === 'good' ? 22 : 6, tip: 'RECENT NEWS FROM THE GALAXY.', old: true });
    void f;
    return out;
  };
  H.goTo = function (run, sysId) {
    const s = run.systems[sysId];
    if (!s) return;
    Act().toGalaxy();
    G.focusOn(s.x, s.y, Math.max(2, G.cam.z));
    G.sel = { sys: s.id };
    AS.Sfx.play('click');
  };

  /* ================= LEFT PANEL ================= */
  H.drawPanel = function (ctx, run, interactive) {
    const y0 = G.HUD_H, y1 = G.mapBottom(), h = y1 - y0;
    if (!G.panelOpen) {
      const w = G.PANEL_STRIP, n = H.notifications(run), urgent = n.some(q => q.urgent);
      D.rect(ctx, 0, y0, w, h, 1); D.rect(ctx, w - 1, y0, 1, h, 3);
      G.block(0, y0, w, h);
      if (interactive) G.button(ctx, 1, y0 + 2, w - 2, 14, '>', () => Act().togglePanel(), { tip: 'OPEN THE PANEL (TAB).', big: false });
      if (n.length) { D.rect(ctx, 2, y0 + 19, w - 4, 9, urgent && Math.floor(G.time * 3) % 2 ? 17 : 4); TS(ctx, Math.min(9, n.length), w / 2, y0 + 21, 31, 'center'); G.tip(0, y0 + 18, w, 11, n.length + ' NOTIFICATIONS. OPEN THE PANEL TO READ THEM.'); }
      return;
    }
    const w = G.panelFull(), x = 0, iw = w - 8;
    D.rect(ctx, x, y0, w, h, 1); D.rect(ctx, w - 1, y0, 1, h, 3); D.rect(ctx, w, y0, 1, h, 0);
    G.block(x, y0, w, h);
    const vis = (yy, hh) => yy + hh > y0 && yy < y1;
    const P = {
      btn: (bx, by, bw, bh, label, fn, o) => { if (interactive && vis(by, bh)) G.button(ctx, bx, by, bw, bh, label, fn, o); else if (vis(by, bh)) G.button(ctx, bx, by, bw, bh, label, () => {}, Object.assign({}, o, { tip: '' })); },
      tip: (tx, ty, tw, th, t) => { if (vis(ty, th)) { const a = Math.max(ty, y0), b = Math.min(ty + th, y1); G.tip(tx, a, tw, b - a, t); } },
      click: (cx, cy, cw, ch, fn) => { if (interactive && vis(cy, ch)) { const a = Math.max(cy, y0), b = Math.min(cy + ch, y1); G.btns.push({ x: cx, y: a, w: cw, h: b - a, fn }); } },
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, w, h); ctx.clip();
    let y = y0 + 3 - G.panelScroll;
    const top = y;
    // Alerts own the top of the command panel until the player explicitly asks
    // to build or inspect something.  In that moment the decision palette takes
    // precedence, so a clicked + slot never leaves the choices below the fold.
    const hasContext = contextActive(run);
    if (hasContext) y = contextSection(ctx, run, x + 4, y, iw, P);
    else y = nextMoveSection(ctx, run, x + 4, y, iw, P);
    y = notifSection(ctx, run, x + 4, y, iw, P);
    if (G.view === 'planet') y = planetSection(ctx, run, x + 4, y, iw, P);
    y = systemSection(ctx, run, x + 4, y, iw, P);
    y = economySection(ctx, run, x + 4, y, iw, P);
    ctx.restore();
    // scrolling
    const contentH = y - top + 6, maxS = Math.max(0, contentH - h);
    G.panelMaxScroll = maxS;
    if (G.panelScroll > maxS) G.panelScroll = maxS;
    if (maxS > 0) {
      const th = Math.max(12, Math.round(h * h / contentH)), ty = y0 + Math.round((h - th) * G.panelScroll / maxS);
      D.rect(ctx, w - 3, y0, 2, h, 2); D.rect(ctx, w - 3, ty, 2, th, 5);
    }
    if (interactive) G.button(ctx, w - 14, y0 + 2, 11, 11, '<', () => Act().togglePanel(), { tip: 'COLLAPSE THE PANEL (TAB). WHEEL OVER IT TO SCROLL.', big: false });
  };
  function header(ctx, x, y, w, title, col, sub) {
    D.rect(ctx, x - 2, y, w + 4, 10, 2);
    D.rect(ctx, x - 2, y, 2, 10, col === undefined ? 12 : col);
    TBn(ctx, title, x + 3, y + 2, col === undefined ? 13 : col);
    if (sub) TS(ctx, sub, x + w - (title === 'NOTIFICATIONS' ? 0 : 12), y + 3, 5, 'right');
    return y + 13;
  }
  function wrapLines(ctx, text, x, y, w, col, P, maxLines) {
    const lines = U.wrapText(text, Math.max(8, Math.floor(w / 4)));
    const n = Math.min(lines.length, maxLines || 99);
    for (let i = 0; i < n; i++) TS(ctx, (i === n - 1 && n < lines.length ? lines[i].slice(0, -2) + '..' : lines[i]), x, y + i * 7, col);
    void P;
    return y + n * 7;
  }
  function goodsRow(ctx, x, y, out) {
    let px = x;
    for (const k of AS.STOCK_KEYS) {
      if (!out[k] || out[k] < 0.05) continue;
      ctx.drawImage(AS.Spr.goods[k], px, y + 1);
      TBn(ctx, '+' + r1(out[k]), px + 7, y, AS.STOCK[k].col);
      px += 12 + D.tw('+' + r1(out[k]), true);
    }
    return px;
  }

  /* ---------- 1. what you clicked ---------- */
  function nextMoveSection(ctx, run, x, y, w, P) {
    const n = S.nextMove(run, 0);
    const col = { gold: 13, food: 22, water: 26, fuel: 18, fleet: 17, defend: 17, expand: 13, free: 12, home: 13 }[n.kind] || 7;
    y = header(ctx, x, y, w, 'NEXT MOVE', col);
    TBn(ctx, n.title, x, y, col); y += 10;
    y = wrapLines(ctx, n.text, x, y, w, 7, P, 4) + 3;
    const act = () => {
      if (n.action === 'shop') Act().openShop(n.sys, n.tab);
      else if (n.action === 'threat' && n.sys !== undefined) H.goTo(run, n.sys);
      else if (n.action === 'home' && n.sys !== undefined) Act().openSystem(n.sys);
    };
    if (n.cta && n.action !== 'none') { P.btn(x, y, w, 13, n.cta, act, { primary: true, tip: n.text }); y += 16; }
    return y + 2;
  }
  function contextActive(run) {
    const sel = G.sel || {};
    if (G.view === 'planet') {
      const s = run.systems[G.sysId], p = s && s.planets[G.planet];
      return !!(p && ((sel.slot !== undefined && s.owner === 0 && !S.bldAt(p, sel.slot)) || sel.bld !== undefined || sel.port !== undefined));
    }
    return G.view === 'system' && sel.pathway !== undefined;
  }
  function contextSection(ctx, run, x, y, w, P) {
    const f = run.factions[0], sel = G.sel || {};
    if (G.view === 'planet') {
      const s = run.systems[G.sysId], pi = G.planet, p = s.planets[pi], own = s.owner === 0;
      if (sel.slot !== undefined && own && !S.bldAt(p, sel.slot)) return buildList(ctx, run, s, pi, sel.slot, x, y, w, P);
      if (sel.bld !== undefined) { const b = S.bldById(p, sel.bld); if (b) return bldCard(ctx, run, s, pi, b, x, y, w, P); }
      if (sel.port !== undefined) { const pw = S.pathwayById(s, sel.port); if (pw) return portCard(ctx, run, s, pi, pw, x, y, w, P); }
    }
    if (G.view === 'system' && sel.pathway !== undefined) {
      const s = run.systems[G.sysId], pw = S.pathwayById(s, sel.pathway);
      if (pw && s.owner === 0) {
        y = header(ctx, x, y, w, 'PATHWAY', 13);
        TBn(ctx, s.planets[pw.a].name.replace(/^\S+ /, '') + ' - ' + s.planets[pw.b].name.replace(/^\S+ /, ''), x, y, 31); y += 10;
        const fl = S.sysFlow(run, s), Pf = fl.P[pw.id];
        y = wrapLines(ctx, 'CARRIES ' + r1(Pf ? Pf.ab + Pf.ba : 0) + ' UNITS PER CYCLE (MAX ' + C.econ.pathCap + ' EACH WAY). A PATHWAY IS ONLY A ROAD: CONNECT EXTRACTORS TO ITS PORTS IN THE PLANET VIEW.', x, y, w, 6, P) + 2;
        P.btn(x, y, w, 12, 'CLOSE PATHWAY (+$' + Math.round(AS.COSTS.pathway * 0.5) + ')', () => { Act().doIt('unpath', { sys: s.id, pathway: pw.id }, 'remove'); G.sel = null; }, { big: false, tip: 'REMOVE THE PATHWAY AND ITS PORTS.' });
        return y + 17;
      }
    }
    void f;
    return y;
  }
  function buildList(ctx, run, s, pi, slot, x, y, w, P) {
    const f = run.factions[0], p = s.planets[pi];
    y = header(ctx, x, y, w, 'BUILD IN SLOT ' + (slot + 1), 13);
    P.btn(x + w - 11, y - 12, 11, 9, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { big: false, tip: 'CLOSE (ESC).' });
    TS(ctx, 'EACH BUILDING BRINGS ' + C.econ.crew + ' WORKERS. PICK A JOB.', x, y, 5); y += 10;
    // The palette mirrors the game loop instead of presenting seven unrelated
    // machines.  Keeping all choices visible preserves strategy while making
    // the first-time decision legible at a glance.
    const groups = [
      { title: 'MAKE MONEY', note: 'GOLD > MARKET', kinds: ['goldmine'] },
      { title: 'FEED CREWS', note: 'ICE > WATER > FOOD', kinds: ['icedrill', 'water', 'greenhouse', 'livestock'] },
      { title: 'POWER FLEET', note: 'CRUDE > FUEL', kinds: ['pump', 'refinery'] },
    ];
    for (const group of groups) {
      D.rect(ctx, x, y, w, 8, 2);
      TS(ctx, group.title, x + 3, y + 1, group.title === 'FEED CREWS' ? 22 : group.title === 'POWER FLEET' ? 18 : 13);
      TS(ctx, group.note, x + w - 3, y + 1, 5, 'right');
      y += 10;
      for (const kind of group.kinds) {
      const B = AS.BLD[kind], c = B.cost, can = S.canPay(f, c), good = S.procBonus(p, kind) > 1, want = AS.Tutorial && AS.Tutorial.wantBuild(kind);
      P.btn(x, y, w, 20, B.name, () => Act().build(s.id, pi, slot, kind), { noText: true, disabled: !can, primary: want, onDisabled: () => Act().fail({ reason: 'cost', cost: c }),
        tip: B.name + ': ' + B.does + (good ? ' +50% ON THIS PLANET.' : '') + ' COSTS ' + money(c) + '.' });
      ctx.drawImage(H.bldIcon(kind), x + 3, y + 3);
      TBn(ctx, B.name, x + 11, y + 2, can ? (want ? 0 : 31) : 4);
      TBn(ctx, money(c), x + w - 3, y + 2, can ? (want ? 0 : 13) : 4, 'right');
      TS(ctx, (good ? '+50% HERE. ' : '') + B.does, x + 11, y + 12, can ? (want ? 1 : good ? 22 : 6) : 4);
      y += 22;
      }
      y += 1;
    }
    return y + 3;
  }
  function bldCard(ctx, run, s, pi, b, x, y, w, P) {
    const p = s.planets[pi], fl = S.sysFlow(run, s), st = fl.B[b.id], B = AS.BLD[b.kind], own = s.owner === 0, lvl = b.lvl || 1;
    y = header(ctx, x, y, w, B.name, 13);
    P.btn(x + w - 11, y - 12, 11, 9, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { big: false, tip: 'DESELECT (ESC).' });
    // level pips
    TS(ctx, 'LEVEL', x, y + 1, 5);
    for (let i = 0; i < C.upgrade.max; i++) D.rect(ctx, x + 24 + i * 7, y + 1, 5, 5, i < lvl ? 13 : 3);
    TS(ctx, 'CREW ' + C.econ.crew + (st.staffed ? '' : ' - MISSING'), x + w, y + 1, st.staffed ? 6 : 17, 'right');
    y += 9;
    const col = AS.PlanetView.STATUS_COL[st.status] || 7;
    D.rect(ctx, x, y + 2, 5, 5, col);
    y = wrapLines(ctx, st.reason, x + 8, y + 1, w - 8, col, P, 4) + 3;
    y = wrapLines(ctx, AS.PlanetView.rateText(run, s, pi, b, st), x, y, w, 7, P, 4) + 4;
    if (!own) return y + 2;
    if (lvl < C.upgrade.max) {
      const c = AS.upgPrice(b.kind, lvl);
      P.btn(x, y, w, 13, 'UPGRADE TO LV' + (lvl + 1) + ' ' + money(c), () => Act().upgradeBld(s.id, pi, b.id), { disabled: !S.canPay(run.factions[0], c), primary: AS.Tutorial && AS.Tutorial.want('upgrade'), onDisabled: () => Act().fail({ reason: 'cost', cost: c }), tip: 'MACHINERY UPGRADE: +50% THROUGHPUT (' + (B.role === 'ext' ? 'DIGS FASTER' : B.role === 'proc' ? 'TAKES MORE IN' : 'DRINKS AND GROWS MORE') + '). SAME CREW.' });
      y += 15;
    } else { TS(ctx, 'FULLY UPGRADED', x, y + 2, 22); y += 10; }
    if (b.out) { P.btn(x, y, w, 12, 'REMOVE CONVEYOR', () => Act().doIt('disconnect', { sys: s.id, planet: pi, from: { b: b.id } }, 'remove'), { big: false, tip: 'DISCONNECT IT, SO YOU CAN CONNECT IT ELSEWHERE.' }); y += 14; }
    P.btn(x, y, w, 12, 'DEMOLISH (+$' + Math.round(B.cost * 0.4) + ')', () => { Act().doIt('demolish', { sys: s.id, planet: pi, bld: b.id }, 'remove'); G.sel = null; }, { big: false, tip: 'REMOVE THE BUILDING TO FREE THE SLOT. ITS WORKERS LEAVE.' });
    return y + 18;
  }
  function portCard(ctx, run, s, pi, pw, x, y, w, P) {
    const p = s.planets[pi], fl = S.sysFlow(run, s), other = s.planets[S.otherPlanet(pw, pi)], po = fl.ports[pi + ':' + pw.id] || { out: 0, in: 0 };
    y = header(ctx, x, y, w, 'PORT TO ' + other.name.replace(/^\S+ /, ''), 13);
    P.btn(x + w - 11, y - 12, 11, 9, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { big: false, tip: 'DESELECT (ESC).' });
    TBn(ctx, 'SENDING ' + (po.out ? r1(po.out) + ' ' + AS.RES[po.outRes].raw : '-'), x, y, po.out ? 13 : 5); y += 10;
    TBn(ctx, 'ARRIVING ' + (po.in ? r1(po.in) + ' ' + AS.RES[po.inRes].raw : '-'), x, y, po.in ? 22 : 5); y += 11;
    const link = p.portIn[pw.id];
    y = wrapLines(ctx, link ? 'ARRIVALS GO TO THE ' + AS.BLD[S.bldById(p, link.b).kind].name + '.' : 'DRAG AN ICE DRILL OR FUEL PUMP ONTO THIS PORT TO SEND ITS OUTPUT TO ' + other.name + '. DRAG FROM THE PORT TO A PROCESSOR TO TAKE WHAT ARRIVES.', x, y, w, 6, P) + 3;
    if (s.owner === 0 && link) { P.btn(x, y, w, 12, 'REMOVE PORT CONVEYOR', () => Act().doIt('disconnect', { sys: s.id, planet: pi, from: { p: pw.id } }, 'remove'), { big: false }); y += 14; }
    return y + 4;
  }

  /* ---------- 2. notifications ---------- */
  function notifSection(ctx, run, x, y, w, P) {
    const list = H.notifications(run);
    y = header(ctx, x, y, w, 'NOTIFICATIONS', list.some(n => n.urgent) ? 17 : 12, list.length ? String(list.length) : '');
    if (!list.length) { TS(ctx, 'ALL QUIET.', x, y, 4); return y + 11; }
    for (const n of list.slice(0, 7)) {
      const yy = y, blink = n.urgent && Math.floor(G.time * 3) % 2;
      const ye = wrapLines(ctx, n.text, x + 5, y, w - 5, n.old ? 5 : blink ? 31 : 7, P, 3);
      D.rect(ctx, x, yy, 2, ye - yy - 1, n.col);
      if (n.sys !== undefined && n.sys >= 0) P.click(x - 2, yy - 1, w + 4, ye - yy + 1, () => H.goTo(run, n.sys));
      else if (n.res && AS.MARKET_KEYS.indexOf(n.res) >= 0) P.click(x - 2, yy - 1, w + 4, ye - yy + 1, () => Act().openShop());
      if (n.tip) P.tip(x - 2, yy - 1, w + 4, ye - yy + 1, n.tip + (n.res ? ' CLICK FOR THE MARKET.' : n.sys >= 0 ? '' : ''));
      y = ye + 3;
    }
    return y + 3;
  }

  /* ---------- 3. planet ---------- */
  const KIND_NAME = { rust: 'RUST WORLD', cinder: 'CINDER WORLD', dwarf: 'DWARF WORLD', terran: 'TERRAN WORLD', ice: 'ICE WORLD', ice2: 'ICE WORLD', gas: 'GAS GIANT' };
  function planetSection(ctx, run, x, y, w, P) {
    const s = run.systems[G.sysId], p = s.planets[G.planet], f = run.factions[0], fl = S.sysFlow(run, s);
    y = header(ctx, x, y, w, 'PLANET', 12);
    TB(ctx, p.name, x, y, 31); y += 10;
    TS(ctx, KIND_NAME[p.kind] + '  -  SLOTS ' + p.blds.length + '/' + S.slotCount(p, f) + ' USED', x, y, 6); y += 8;
    const bonus = AS.BLD_KEYS.filter(k => S.procBonus(p, k) > 1).map(k => AS.BLD[k].short);
    if (bonus.length) { y = wrapLines(ctx, '+50% HERE: ' + bonus.join(', '), x, y, w, 22, P); y += 1; }
    const out = { gold: 0, water: 0, food: 0, fuel: 0 };
    for (const b of p.blds) { const st = fl.B[b.id], B = AS.BLD[b.kind]; if (B.role === 'proc') out[AS.RES[B.res].out] += st.output; else if (B.role === 'farm') out.food += st.output; else if (!AS.RES[B.res].proc) out.gold += st.output; }
    TS(ctx, 'MAKES PER CYCLE', x, y + 1, 5);
    if (goodsRow(ctx, x + 62, y, out) === x + 62) TS(ctx, 'NOTHING YET', x + 62, y + 1, 4);
    y += 10;
    const counts = {};
    for (const b of p.blds) { const st = fl.B[b.id].status; counts[st] = (counts[st] || 0) + 1; }
    let cx = x;
    for (const k of ['ok', 'idle', 'blocked', 'nocrew', 'empty']) if (counts[k]) { const t = counts[k] + ' ' + STATUS[k]; if (cx + D.tw(t) + 8 > x + w) { cx = x; y += 8; } D.rect(ctx, cx, y + 1, 4, 4, AS.PlanetView.STATUS_COL[k]); TS(ctx, t, cx + 6, y, 7); cx += D.tw(t) + 12; }
    if (p.blds.length) y += 9;
    if (s.owner === 0) y = wrapLines(ctx, 'CLICK A + SLOT TO BUILD. DRAG DOWN FROM AN EXTRACTOR TO DRILL. DRAG AN EXTRACTOR ONTO ITS PROCESSOR (OR A PORT) TO CONNECT.', x, y, w, 5, P) + 1;
    return y + 5;
  }

  /* ---------- 4. system ---------- */
  function systemSection(ctx, run, x, y, w, P) {
    const id = G.view !== 'galaxy' ? G.sysId : G.sel && G.sel.sys !== undefined ? G.sel.sys : -1;
    const s = run.systems[id];
    if (!s) return y;
    const f = run.factions[0], o = s.owner >= 0 ? run.factions[s.owner] : null, own = s.owner === 0;
    y = header(ctx, x, y, w, 'SYSTEM', o ? o.col : 6);
    if (G.view === 'galaxy') P.btn(x + w - 11, y - 12, 11, 9, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { big: false, tip: 'DESELECT (ESC).' });
    ctx.drawImage(AS.Gal.ficon(run, s.owner), x, y + 1);
    TB(ctx, s.name, x + 8, y, 31);
    TS(ctx, (o ? (own ? 'YOURS' : AS.PERS_NAMES[o.pers]) : 'INDEPENDENT') + (s.capital >= 0 && s.capital === s.owner ? ', CAPITAL' : ''), x + 10 + D.tw(s.name, true), y + 2, 6);
    y += 11;
    // military
    const k = AS.Gal.known(run, s);
    ctx.drawImage(AS.Spr.icons.power, x, y + 1);
    TBn(ctx, k.exact ? 'POWER ' + k.v : 'POWER ' + k.text + ' (FAR)', x + 8, y, k.exact ? 17 : 5);
    if (own && f.fuelEff < 0.999) TS(ctx, Math.round(f.fuelEff * 100) + '% FUEL', x + w, y + 1, 17, 'right');
    P.tip(x, y - 1, w, 9, k.exact ? 'POWER = SHIPS x1 + DESTROYERS x5 + CANNONS x10' + (s.owner >= 0 ? ', TIMES THE OWNER\'S FUEL EFFICIENCY' : '') + '. AN ATTACK WINS IF IT IS BIGGER; THE WINNER KEEPS THE DIFFERENCE.' : 'TOO FAR TO SEE EXACT NUMBERS: S UNDER 15, M UNDER 40, L 40 AND UP.');
    y += 9;
    if (k.exact) {
      let ux = x;
      for (const kk of AS.UNIT_KEYS) { ctx.drawImage(AS.Spr.icons[AS.UNITS[kk].icon], ux, y); TS(ctx, 'X' + s.gar[kk], ux + 7, y, s.gar[kk] ? 7 : 4); ux += 13 + D.tw('X' + s.gar[kk]); }
      P.tip(x, y - 1, w, 7, H.unitsText(s.gar) + '.');
      y += 8;
    }
    if (own) {
      const fl = S.sysFlow(run, s), need = S.crewNeed(s);
      TS(ctx, 'WORKERS ' + s.workers + '/' + need + (f.hungry ? ' - UNDERFED' : s.workers < need ? ' - RETURNING' : ''), x, y, f.hungry || s.workers < need ? 17 : 6);
      P.tip(x, y - 1, w, 7, 'EVERY BUILDING NEEDS ' + C.econ.crew + ' WORKERS; THEY EAT ' + C.econ.eat + ' FOOD EACH PER CYCLE. A MISSED MEAL REDUCES STAFFING FIRST. ONLY SUSTAINED HUNGER MAKES WORKERS LEAVE; ONCE FOOD IS BACK, ' + C.econ.regrow + ' RETURN PER CYCLE.');
      y += 8;
      const out = Object.assign({}, fl.out, { money: C.econ.levy });
      TS(ctx, 'MAKES', x, y + 1, 5); goodsRow(ctx, x + 24, y, out); y += 10;
      if (G.view !== 'galaxy') { TS(ctx, 'PATHWAYS ' + s.pathways.length + '/' + S.pathwaySlots(run, s) + (G.view === 'system' ? ': DRAG PLANET ONTO PLANET' : ''), x, y, 6); P.tip(x, y - 1, w, 7, 'PATHWAYS JOIN TWO PLANETS (' + money(AS.COSTS.pathway) + '): EACH END GETS A PORT. USE THEM WHEN A PLANET IS FULL OR ANOTHER SUITS A PROCESSOR BETTER.'); y += 9; }
      const bw = Math.floor((w - 2) / 2);
      if (G.view === 'galaxy') P.btn(x, y, bw, 13, 'OPEN', () => Act().openSystem(s.id), { primary: true, tip: 'OPEN THE SYSTEM: PLANETS AND PATHWAYS (OR CLICK IT AGAIN).' });
      else P.btn(x, y, bw, 13, G.view === 'planet' ? 'SYSTEM' : 'GALAXY', () => Act().back(), { tip: 'BACK (ESC OR RIGHT-CLICK).' });
      P.btn(x + bw + 2, y, w - bw - 2, 13, 'BUY UNITS', () => Act().openShop(s.id, 'units'), { primary: AS.Tutorial && AS.Tutorial.want('units'), tip: 'OPEN THE SHOP AND BUY SHIPS, DESTROYERS OR CANNONS FOR ' + s.name + '.' });
      y += 15;
    } else {
      const adj = S.neighbours(run, s.id).some(n => run.systems[n].owner === 0);
      y = wrapLines(ctx, !adj ? 'NOT NEXT TO YOUR SYSTEMS.' : run.t < C.game.protect ? 'ATTACKS OPEN AT 4:00.' : S.truceBlocks(run, 0, s.owner) ? 'COALITION TRUCE: ONLY THE LEADER CAN BE ATTACKED.' : 'DRAG FROM YOUR SYSTEM ONTO IT TO ATTACK. THE BIGGER POWER WINS.', x, y, w, adj ? 13 : 5, P) + 2;
      if (s.owner === -1 && adj) {
        const price = S.buyPrice(run, f, s);
        P.btn(x, y, w, 13, 'BUY SYSTEM ' + money(price), () => Act().buy(s.id), { disabled: f.money < price, onDisabled: () => Act().fail({ reason: 'cost', cost: price }), tip: 'BUY THIS INDEPENDENT SYSTEM: PEACEFUL BUT EXPENSIVE. THE PRICE RISES WITH EVERY SYSTEM YOU OWN.' });
        y += 15;
      }
    }
    return y + 3;
  }

  /* ---------- 5. economy ---------- */
  function economySection(ctx, run, x, y, w, P) {
    const f = run.factions[0], fc = G.forecast || S.forecast(run, f);
    y = header(ctx, x, y, w, 'ECONOMY', 12, 'PER CYCLE');
    const sys = S.ownCount(run, 0);
    const notes = {
      money: 'TAXES +' + C.econ.levy * sys + ' (' + C.econ.levy + ' PER SYSTEM) + SALES',
      gold: 'SELLS FOR $' + S.price(run, 'gold') + ' EACH ON THE MARKET',
      water: fc.farmWater > 0 ? 'FARMS DRINK ' + r1(fc.farmWater) + (fc.farmFrac < 0.999 ? ' - ONLY ' + Math.round(fc.farmFrac * 100) + '% MET' : '') : 'NO FARMS YET: BUILD A GREENHOUSE',
      food: fc.workers + ' WORKERS EAT ' + r1(fc.food.out) + (f.hungry ? ' - OUTPUT REDUCED!' : ''),
      fuel: fc.fuelNeed > 0 ? 'MILITARY BURNS ' + r1(fc.fuelNeed) + ' - POWER ' + Math.round(f.fuelEff * 100) + '%' : 'NO MILITARY TO FUEL YET',
    };
    const bad = { water: fc.farmFrac < 0.999, food: f.hungry > 0 || fc.food.net < 0, fuel: f.fuelEff < 0.999 || fc.fuel.net < 0 };
    for (const k of AS.STOCK_KEYS) {
      const st = AS.STOCK[k], v = f[k];
      ctx.drawImage(AS.Spr.goods[k], x, y + 1);
      TBn(ctx, st.name, x + 8, y, 7);
      const vt = (k === 'money' ? '$' : '') + U.fmtNum(Math.max(0, v));
      if (k !== 'money') {
        const net = fc[k].net, nt = sgn(net);
        TS(ctx, nt, x + w, y + 1, net > 0 ? 22 : net < 0 ? 17 : 5, 'right');
        TBn(ctx, vt, x + w - D.tw(nt) - 4, y, st.col, 'right');
      } else TBn(ctx, vt, x + w, y, st.col, 'right');
      y += 9;
      TS(ctx, notes[k], x + 8, y, bad[k] ? 17 : 5);
      P.tip(x, y - 10, w, 17, st.name + ': ' + st.use + (k !== 'money' ? ' THIS CYCLE: +' + fc[k].in + ' IN, -' + fc[k].out + ' OUT.' : ''));
      y += 9;
    }
    y += 1;
    const g = Math.floor(f.gold), bw = Math.floor((w - 2) / 2);
    P.btn(x, y, bw, 13, g ? 'SELL GOLD' : 'NO GOLD', () => Act().sellAllGold(), { disabled: g < 1, primary: g >= 1 && AS.Tutorial && AS.Tutorial.want('sell'), tip: g ? 'SELL ALL ' + g + ' GOLD FOR ' + money(g * S.price(run, 'gold')) + '.' : 'BUILD A GOLD MINE AND DRILL IT TO A GOLD DEPOSIT.' });
    P.btn(x + bw + 2, y, w - bw - 2, 13, 'MARKET', () => Act().openShop(-1, 'market'), { tip: 'BUY AND SELL GOLD, WATER, FOOD AND FUEL AT FIXED PRICES.' });
    return y + 16;
  }

  /* ================= ATTACK / MOVE ORDER ================= */
  H.drawOrder = function (ctx, run) {
    const o = G.order;
    if (!o) return;
    const from = run.systems[o.from], to = run.systems[o.to];
    if (!from || !to || from.owner !== 0) { G.order = null; return; }
    const hostile = to.owner !== 0;
    const units = S.splitUnits(from.gar, o.frac), eff = run.factions[0].fuelEff;
    const power = S.rawPower(units) * eff;
    const path = S.path(run, o.from, o.to, 0);
    let eta = 0;
    if (path) for (let i = 0; i + 1 < path.length; i++) eta += Math.max(0.5, S.laneTime(run, 0, path[i], path[i + 1]));
    const w = 236, h = hostile ? 92 : 62;
    const p = G.toScreen(to.x, to.y);
    let x = Math.round(p.x + 16), y = Math.round(p.y - h / 2);
    if (x + w > G.W - 3) x = Math.round(p.x - w - 16);
    x = U.clamp(x, G.mapLeft() + 3, G.W - w - 3); y = U.clamp(y, G.HUD_H + 3, G.mapBottom() - h - 3);
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 3, hostile ? 17 : 13, 0);
    G.block(x, y, w, h);
    TB(ctx, (hostile ? 'ATTACK ' : 'MOVE TO ') + to.name, x + 6, y + 8, 31);
    TS(ctx, to.owner >= 0 ? (to.owner === 0 ? 'YOURS' : AS.PERS_NAMES[run.factions[to.owner].pers]) : 'INDEPENDENT', x + w - 6, y + 10, AS.Gal.fcol(run, to.owner), 'right');
    TS(ctx, 'SEND', x + 6, y + 23, 6);
    [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, 'ALL']].forEach(([fr, l], i) => G.button(ctx, x + 30 + i * 31, y + 20, 29, 12, l, () => { o.frac = fr; AS.Sfx.play('click'); }, { active: o.frac === fr, big: false, tip: 'HOW MUCH OF ' + from.name + '\'S GARRISON TO SEND. WHAT STAYS BEHIND DEFENDS IT.' }));
    TBn(ctx, 'POWER ' + Math.round(power), x + w - 6, y + 22, 17, 'right');
    TS(ctx, H.unitsText(units).slice(0, 56), x + 6, y + 36, 7);
    G.tip(x, y + 34, w, 8, 'SHIPS 1, DESTROYERS 5, CANNONS 10' + (eff < 0.999 ? ', AT ' + Math.round(eff * 100) + '% FOR LACK OF FUEL' : '') + '. ARRIVES IN ABOUT ' + Math.round(eta) + ' S.');
    const empty = S.unitCount(units) <= 0;
    if (hostile) {
      const r = S.outcome(run, power, to);
      const txt = empty ? 'NOTHING TO SEND' : r.win ? 'YOU WIN AND KEEP ' + Math.round(r.left) + ' POWER' : 'YOU LOSE: THEY KEEP ' + Math.round(r.left);
      TB(ctx, Math.round(r.att) + ' VS ' + Math.round(r.def), x + 6, y + 46, 31);
      TBn(ctx, txt, x + 12 + D.tw(Math.round(r.att) + ' VS ' + Math.round(r.def), true), y + 46, r.win && !empty ? 22 : 17);
      TS(ctx, 'THE SMALLER POWER IS WIPED OUT. ARRIVES IN ~' + Math.round(eta) + ' S: THEY MAY REINFORCE.', x + 6, y + 58, 5);
      G.tip(x, y + 44, w, 20, 'NO DICE: THE BIGGER POWER WINS AND KEEPS THE DIFFERENCE. THIS IS THE RESULT IF NOTHING CHANGES BEFORE YOU ARRIVE.');
      const blocked = run.t < C.game.protect ? 'ATTACKS OPEN AT 4:00.' : S.truceBlocks(run, 0, to.owner) ? 'COALITION TRUCE: ONLY THE LEADER MAY BE ATTACKED.' : '';
      G.button(ctx, x + 6, y + h - 18, 76, 14, 'ATTACK', () => Act().sendOrder(), { primary: r.win && !blocked && !empty, disabled: !!blocked || empty, tip: blocked || (r.win ? 'CAPTURE IT. ITS BUILDINGS AND WORKERS BECOME YOURS.' : 'YOU WOULD LOSE EVERYTHING YOU SEND. SEND MORE, OR BUY MORE FIRST.') });
    } else G.button(ctx, x + 6, y + h - 18, 76, 14, 'MOVE', () => Act().sendOrder(), { primary: true, disabled: empty, tip: 'MOVE THROUGH YOUR OWN SYSTEMS.' });
    G.button(ctx, x + w - 64, y + h - 18, 58, 14, 'CANCEL', () => { G.order = null; AS.Sfx.play('click'); }, { tip: 'ESC' });
  };

  /* ================= FACTION ROSTER (galaxy) ================= */
  H.drawRoster = function (ctx, run) {
    const w = 104, x = G.W - w - 3;
    let y = G.HUD_H + 3;
    const co = run.coalition;
    D.rect(ctx, x + 1, y + 1, w, 10 + run.factions.length * 11, 0);
    D.frame(ctx, x, y, w, 10 + run.factions.length * 11, 1, 3);
    TS(ctx, 'FACTION', x + 4, y + 2, 5); TS(ctx, 'SYS', x + w - 4, y + 2, 5, 'right');
    y += 9;
    const order = run.factions.slice().sort((a, b) => S.ownCount(run, b.id) - S.ownCount(run, a.id) || a.id - b.id);
    for (const f of order) {
      const n = S.ownCount(run, f.id), col = f.alive ? f.col : 4;
      if (co && co.target === f.id && Math.floor(G.time * 2) % 2) D.frame(ctx, x + 1, y, w - 2, 11, 0, 17);
      ctx.drawImage(AS.Spr.factionIcon(f.icon, col), x + 3, y + 2);
      TB(ctx, f.id === 0 ? 'YOU' : AS.PERS_NAMES[f.pers].slice(0, 11), x + 10, y + 1, f.alive ? (f.id === 0 ? 13 : 7) : 4);
      TB(ctx, f.alive ? n : '-', x + w - 4, y + 1, col, 'right');
      G.tip(x, y, w, 11, f.id === 0 ? 'YOU.' : f.name + ' - ' + AS.PERS_NAMES[f.pers] + ': ' + AS.PERS_DESC[f.pers] + (co && co.target === f.id ? ' EVERYONE IS IN A COALITION AGAINST IT.' : ''));
      y += 11;
    }
    return y + 4;
  };

  /* ================= BOTTOM TOAST: short, non-blocking feedback ================= */
  H.drawBottom = function (ctx, run) {
    const t = G.toast;
    if (!t) return;
    const k = U.clamp(Math.min(t.t, t.max - t.t) * 6, 0, 1);
    const maxW = G.W - G.mapLeft() - 8;
    const w = Math.min(maxW, D.tw(t.text, true) + 14), x = Math.round((G.mapLeft() + G.W) / 2 - w / 2);
    const y = G.H - G.TICKER_H - 3;
    D.rect(ctx, x + 2, y + 2, w, G.TICKER_H, 0);
    D.frame(ctx, x, y, w, G.TICKER_H, k < 1 ? 2 : 1, t.col);
    D.rect(ctx, x + 1, y + 1, 3, G.TICKER_H - 2, t.col);
    TBn(ctx, t.text.slice(0, Math.floor((w - 12) / 6)), x + 7, y + 3, t.col);
  };
  H.drawNotices = function (ctx, dt) {
    let y = G.mapBottom() - 30;
    for (const n of G.notices) {
      n.t -= dt;
      const k = U.clamp(Math.min(n.t, n.max - n.t) * 4, 0, 1);
      const w = Math.max(D.tw(n.text, true), D.tw(n.title)) + 14, x = Math.round(G.W - w - 4 + (1 - k) * 40);
      D.plate(ctx, x, y, w, 24, 1);
      TS(ctx, n.title, x + 6, y + 4, 12); TB(ctx, n.text, x + 6, y + 12, 31);
      y -= 27;
    }
    G.notices = G.notices.filter(n => n.t > 0).slice(-2);
  };
})(globalThis.AS = globalThis.AS || {});
