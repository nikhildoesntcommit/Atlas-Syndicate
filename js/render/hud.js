/* ATLAS SYNDICATE v6 — render/hud.js
   Screen-space UI: the top bar (four stocks with their change per cycle, clock, shop), one warning at a
   time (the rest in a list you can open), the event and coalition banners, the faction roster, the
   galaxy selection panel, the attack order with odds and fuel, and the side panels of the system and
   planet views. Panels show only what matters now. Every element carries a short tooltip. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, G = AS.G, D = AS.Draw;
  const H = AS.HUD = {};
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TB = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: true, big: true, align });
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const Act = () => AS.Act;
  const r1 = v => Math.round(v * 10) / 10;
  const sgn = v => (v >= 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : r1(v));
  const costTxt = c => c[0] + ' CR' + (c[1] ? ' ' + c[1] + ' AL' : '');

  /* ---------- top bar ---------- */
  H.drawTop = function (ctx, run, interactive) {
    const W = G.W, f = run.factions[0], fc = G.forecast;
    D.rect(ctx, 0, 0, W, G.HUD_H - 2, 1); D.rect(ctx, 0, G.HUD_H - 2, W, 1, 3); D.rect(ctx, 0, G.HUD_H - 1, W, 1, 0);
    let x = 3;
    for (const k of AS.STOCK_KEYS) {
      const v = k === 'credits' ? G.disp.credits : f[k], net = fc ? fc[k].net : 0;
      ctx.drawImage(AS.Spr.goods[k], x, 6);
      const txt = U.fmtNum(Math.max(0, v));
      TB(ctx, txt, x + 7, 4, AS.STOCK[k].col);
      const nx = x + 9 + D.tw(txt, true);
      const short = fc && fc.warn.some(w => w.res === k);
      TS(ctx, sgn(net), nx, 6, net >= 0 ? 22 : short && Math.floor(G.time * 3) % 2 ? 31 : 17);
      const w = nx - x + D.tw(sgn(net)) + 6;
      if (fc) G.tip(x - 2, 0, w, G.HUD_H, AS.STOCK[k].name + ' ' + Math.round(v) + '. NEXT CYCLE (EVERY ' + C.game.cycle + ' S): +' + fc[k].in + ' IN, -' + fc[k].out + ' OUT. ' + ({ credits: 'FROM MINTS AND ' + C.econ.levy + ' PER SYSTEM; PAYS SALARIES, RECRUITS, BUILDINGS. BELOW ZERO: SOLDIERS DESERT.', alloy: 'FROM SMELTERS; PAYS FOR BUILDINGS, REPAIRS, WARSHIPS, PLATFORMS.', fuel: 'FROM REFINERIES; EVERY ARMY MOVE COSTS FUEL, WARSHIPS BURN IT. AT ZERO: ARMIES STOP.', food: 'FROM WATER PLANTS; SOLDIER RATIONS AND POPULATION. AT ZERO: SOLDIERS FIGHT AT 75%, THEN DESERT.' }[k]));
      x += w;
    }
    D.bar(ctx, x, 6, 14, 5, run.cycleT / C.game.cycle, 12);
    G.tip(x - 1, 0, 16, G.HUD_H, 'TIME TO THE NEXT CYCLE.');
    x += 18;
    const clock = U.fmtTime(run.t);
    TB(ctx, clock, x, 4, C.game.length - run.t < 120 && Math.floor(G.time * 2) % 2 ? 13 : 7);
    G.tip(x - 2, 0, D.tw(clock, true) + 4, G.HUD_H, 'GAME TIME. AT 30:00 THE FACTION WITH THE MOST SYSTEMS WINS. ' + S.ownCount(run, 0) + ' OF ' + run.systems.length + ' ARE YOURS.');
    x += D.tw(clock, true) + 6;
    if (run.t < C.game.protect && W - x > 230) {
      const msg = 'ATTACKS ' + U.fmtTime(C.game.protect - run.t);
      D.hazard(ctx, x - 2, 2, D.tw(msg) + 6, 11, 13, G.time * 6);
      D.rect(ctx, x, 4, D.tw(msg) + 2, 7, 1);
      TS(ctx, msg, x + 1, 5, 13);
      G.tip(x - 2, 0, D.tw(msg) + 6, G.HUD_H, 'PROTECTED PERIOD: NOBODY CAN ATTACK ANYBODY UNTIL 4:00. BUILD YOUR ECONOMY.');
    }
    if (!interactive) return;
    const narrow = W < 560;
    let bx = W - 3;
    const btn = (w, label, fn, o) => { bx -= w + 2; G.button(ctx, bx, 2, w, 12, label, fn, o); };
    btn(34, 'MENU', () => Act().openPause(), { tip: 'PAUSE MENU AND SETTINGS (ESC).' });
    if (!narrow) btn(22, G.settings.mute ? 'MUT' : 'SND', () => Act().toggleMute(), { col: G.settings.mute ? 17 : 7, tip: 'SOUND ON/OFF (M).' });
    for (let i = C.sim.hudSpeeds.length - 1; i >= 0; i--) { const s = C.sim.hudSpeeds[i]; btn(16, s + 'X', () => Act().setSpeed(s), { active: !G.paused && G.speed === s, tip: 'GAME SPEED (KEYS 1-3).' }); }
    btn(16, 'II', () => Act().togglePause(), { active: G.paused, tip: 'PAUSE (SPACE). YOU CAN STILL GIVE ORDERS.' });
    if (!narrow) btn(28, 'TIPS', () => Act().toggleTips(), { active: G.settings.tips, tip: 'TIPS: HOVER ANYTHING FOR AN EXPLANATION (T).' });
    btn(34, 'SHOP', () => AS.Screens.open('shop'), { primary: AS.Tutorial && AS.Tutorial.want('shop'), tip: 'UPGRADE SHOP (U): PERMANENT UPGRADES FOR CREDITS AND ALLOY.' });
  };

  /* ---------- one warning at a time; the rest in a list ---------- */
  const PRI = { fight: 0, inc: 1, short: 2, broke: 2, mass: 3 };
  H.warningList = run => run.warnings.slice().sort((a, b) => PRI[a.kind] - PRI[b.kind] || b.t0 - a.t0);
  H.drawWarnings = function (ctx, run, interactive) {
    const list = H.warningList(run);
    if (!list.length) { G.warnOpen = false; return G.HUD_H + 3; }
    const w0 = list[0], y = G.HUD_H + 3;
    const col = w0.kind === 'fight' || w0.kind === 'broke' ? 17 : w0.kind === 'inc' || w0.kind === 'short' ? 18 : 13;
    const blink = (w0.kind === 'fight' || w0.kind === 'inc') && Math.floor(G.time * 3) % 2;
    const side = G.view === 'planet' ? AS.PlanetView.panelW() : G.view === 'system' ? AS.SysView.panelW() : 112;
    const more = list.length - 1, wd = Math.min(G.W - side - 8, D.tw(w0.text, true) + 16 + (more ? 40 : 0));
    D.rect(ctx, 3, y + 1, wd, 13, 0);
    D.frame(ctx, 2, y, wd, 13, 1, col);
    D.rect(ctx, 3, y + 1, 3, 11, blink ? 31 : col);
    TB(ctx, w0.text.slice(0, Math.floor((wd - 16 - (more ? 40 : 0)) / 6)), 9, y + 3, blink ? 31 : 7);
    if (interactive) {
      G.btns.push({ x: 2, y, w: wd - (more ? 40 : 0), h: 13, fn: () => H.goTo(run, w0) });
      G.tip(2, y, wd, 13, H.warnHelp(w0));
      if (more) G.button(ctx, wd - 38, y + 1, 36, 11, (G.warnOpen ? 'HIDE' : '+' + more), () => { G.warnOpen = !G.warnOpen; AS.Sfx.play('click'); }, { tip: 'ALL CURRENT WARNINGS.', big: false });
    }
    let yy = y + 15;
    if (G.warnOpen && interactive) {
      for (const w of list.slice(1, 8)) {
        const ww = Math.min(G.W - side - 8, D.tw(w.text) + 12);
        D.frame(ctx, 2, yy, ww, 9, 1, 3);
        TS(ctx, w.text, 6, yy + 2, 7);
        G.btns.push({ x: 2, y: yy, w: ww, h: 9, fn: () => H.goTo(run, w) });
        yy += 10;
      }
    }
    return yy;
  };
  H.goTo = function (run, w) {
    const s = run.systems[w.sys];
    if (!s) return;
    Act().toGalaxy();
    G.focusOn(s.x, s.y, Math.max(2, G.cam.z));
    G.sel = { sys: s.id };
    AS.Sfx.play('click');
  };
  H.warnHelp = w => ({ mass: 'A RIVAL IS MASSING ARMIES NEXT TO YOUR SYSTEM. REINFORCE IT, RECRUIT THERE OR BUILD A PLATFORM. CLICK TO LOOK.', inc: 'AN ARMY IS ON ITS WAY TO YOUR SYSTEM. CLICK TO LOOK.', fight: 'A BATTLE IS ON IN YOUR SYSTEM. SEND REINFORCEMENTS: THEY JOIN THE DEFENCE.', short: 'THIS STOCK WILL RUN OUT AT THE CURRENT RATE. BUILD MORE OF ITS CHAIN, OR SPEND LESS.', broke: 'FIX THIS NOW.' }[w.kind] || '');

  /* ---------- event and coalition banners ---------- */
  H.drawEvent = function (ctx, run, y0) {
    const items = [];
    const co = run.coalition;
    if (co) {
      const tgt = run.factions[co.target];
      items.push({ txt: 'COALITION AGAINST ' + (co.target === 0 ? 'YOU' : AS.PERS_NAMES[tgt.pers]) + ' - TRUCE ' + U.fmtTime(co.until - run.t) + ' - NEXT STRIKE ' + U.fmtTime(Math.max(0, co.nextStrike - run.t)), col: 17,
        tip: tgt.short + ' HOLDS 35% OF THE GALAXY. EVERY OTHER FACTION STOPS FIGHTING EACH OTHER AND STRIKES IT TOGETHER, FROM SEVERAL SIDES AT ONCE.' + (co.target !== 0 ? ' YOU ARE IN THE TRUCE: YOU MAY ONLY ATTACK THE LEADER (AND INDEPENDENTS).' : '') });
    }
    const ev = run.events, e = ev.next;
    for (const a of ev.active) items.push({ txt: AS.EVENTS[a.type].name + ' ' + U.fmtTime(a.until - run.t) + ': ' + S.eventText(run, a), col: 18, tip: 'GALAXY EVENT IN PROGRESS.' });
    if (e && e.announced) items.push({ txt: 'IN ' + U.fmtTime(e.at - run.t) + ': ' + AS.EVENTS[e.type].name + ' - ' + S.eventText(run, e), col: 13, tip: 'GALAXY EVENT, ANNOUNCED 60 S AHEAD SO YOU CAN PREPARE.' });
    let y = y0;
    for (const it of items.slice(0, 2)) {
      const side = G.view === 'planet' ? AS.PlanetView.panelW() : G.view === 'system' ? AS.SysView.panelW() : 112;
      const w = Math.min(G.W - side - 16, D.tw(it.txt) + 14), x = Math.max(4, Math.round((G.W - side) / 2 - w / 2));
      if (w < 60) break;
      D.rect(ctx, x + 1, y + 1, w, 11, 0);
      D.plate(ctx, x, y, w, 11, 1);
      D.hazard(ctx, x + 1, y + 1, 3, 9, it.col, G.time * 6);
      TS(ctx, it.txt.slice(0, Math.floor((w - 12) / 4)), x + 7, y + 3, it.col);
      G.tip(x, y, w, 11, it.tip);
      y += 13;
    }
    return y;
  };

  /* ---------- faction roster (galaxy view) ---------- */
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
      if (co && co.target === f.id && Math.floor(G.time * 2) % 2) D.frame(ctx, x + 1, y, w - 2, 11, 0, 17);   // the coalition's target blinks (behind its row)
      ctx.drawImage(AS.Spr.factionIcon(f.icon, col), x + 3, y + 2);
      TB(ctx, f.id === 0 ? 'YOU' : AS.PERS_NAMES[f.pers].slice(0, 11), x + 10, y + 1, f.alive ? (f.id === 0 ? 13 : 7) : 4);
      TB(ctx, f.alive ? n : '-', x + w - 4, y + 1, col, 'right');
      G.tip(x, y, w, 11, f.id === 0 ? 'YOU.' : f.name + ' - ' + AS.PERS_NAMES[f.pers] + ': ' + AS.PERS_DESC[f.pers] + (co && co.target === f.id ? ' EVERYONE IS IN A COALITION AGAINST IT.' : ''));
      y += 11;
    }
    return y + 4;
  };

  /* ---------- galaxy selection panel ---------- */
  H.drawSelPanel = function (ctx, run) {
    if (!G.sel || G.sel.sys === undefined || G.order) return;
    const s = run.systems[G.sel.sys];
    if (!s) return;
    const k = AS.Gal.known(run, s), o = s.owner >= 0 ? run.factions[s.owner] : null, f = run.factions[0];
    const w = Math.min(230, G.W - 120), h = 78, x = 3, y = G.mapBottom() - h - 3;
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 2);
    D.rect(ctx, x + 1, y + 1, w - 2, 3, o ? o.col : 6);
    G.block(x, y, w, h);
    ctx.drawImage(AS.Gal.ficon(run, s.owner), x + 6, y + 9);
    TB(ctx, s.name, x + 14, y + 8, 31);
    TS(ctx, (o ? (o.id === 0 ? 'YOURS' : AS.PERS_NAMES[o.pers]) : 'INDEPENDENT') + (s.capital >= 0 && s.capital === s.owner ? ' - CAPITAL' : ''), x + 16 + D.tw(s.name, true), y + 10, 6);
    G.button(ctx, x + w - 14, y + 6, 11, 11, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { tip: 'CLOSE (ESC).', big: false });
    let yy = y + 21;
    const myAtt = s.battle && run.battles.find(b => b.id === s.battle && b.att.owner === 0);
    if (myAtt) {
      const r = S.oddsRaw(S.stackStrength(run, myAtt.att), S.defStrength(run, s), myAtt.att.mode);
      TB(ctx, 'YOUR ATTACK: ' + Math.round(r.p * 100) + '% NOW', x + 6, yy, r.p >= 0.5 ? 22 : 17);
      G.button(ctx, x + w - 66, y + h - 17, 60, 13, 'RETREAT', () => Act().retreat(myAtt.id), { tip: 'PULL OUT: SURVIVORS RETURN HOME, LOSING 10% ON THE WAY OUT.' });
      yy += 11;
    }
    TB(ctx, k.exact ? 'DEFENCE ' + k.v : 'SIZE ' + k.text, x + 6, yy, k.exact ? 7 : 5);
    if (k.exact) TS(ctx, s.gar.n + ' SOLDIERS' + (s.gar.ships ? ', ' + s.gar.ships + ' SHIPS' : '') + (s.plat.n ? ', ' + s.plat.n + ' PLATFORMS' : ''), x + 10 + D.tw('DEFENCE ' + k.v, true), yy + 2, 6);
    G.tip(x, yy - 1, w, 10, k.exact ? 'DEFENCE = SOLDIERS (VETERANS STRONGER, HUNGRY ONES WEAKER) + WARSHIPS + PLATFORMS, TIMES THE DEFENDER BONUS.' : 'TOO FAR TO SEE EXACT NUMBERS: S UNDER 15, M UNDER 40, L 40 AND UP.');
    yy += 11;
    const deps = {};
    for (const p of s.planets) for (const d of p.deposits) if (d.amount > 0) deps[d.res] = (deps[d.res] || 0) + 1;
    let px = x + 6;
    for (const r of AS.RES_KEYS) if (deps[r]) { ctx.drawImage(AS.Spr.goods[r], px, yy); TS(ctx, 'X' + deps[r], px + 7, yy, 6); px += 22; }
    TS(ctx, s.planets.length + ' PLANETS', px + 2, yy, 5);
    G.tip(x, yy - 1, w, 8, 'DEPOSITS IN THIS SYSTEM, BY RESOURCE.');
    yy += 10;
    if (s.owner === 0) {
      G.button(ctx, x + 6, y + h - 17, 90, 13, 'OPEN SYSTEM', () => Act().openSystem(s.id), { primary: true, tip: 'OPEN THE SYSTEM: PLANETS AND PATHWAYS (OR CLICK THE SYSTEM AGAIN).' });
      const rc = [C.army.recruitCost * C.army.batch, 0];
      G.button(ctx, x + 100, y + h - 17, 80, 13, 'RECRUIT 5', () => Act().recruit(s.id), { disabled: !S.canPay(f, rc), primary: AS.Tutorial && AS.Tutorial.want('recruit'), tip: 'TRAIN 5 SOLDIERS HERE: ' + rc[0] + ' CR NOW, THEN SALARY AND RATIONS EVERY CYCLE.' });
    } else {
      const adj = S.neighbours(run, s.id).some(n => run.systems[n].owner === 0);
      TS(ctx, adj ? (run.t < C.game.protect ? 'ATTACKS OPEN AT 4:00' : S.truceBlocks(run, 0, s.owner) ? 'COALITION TRUCE: ONLY THE LEADER CAN BE ATTACKED' : 'DRAG FROM YOUR SYSTEM ONTO IT TO ATTACK') : 'NOT NEXT TO YOUR SYSTEMS', x + 6, yy, adj ? 13 : 5);
      if (s.owner === -1 && adj) {
        const price = S.buyPrice(run, f, s);
        G.button(ctx, x + 6, y + h - 17, 110, 13, 'BUY ' + U.fmtInt(price) + ' CR', () => Act().buy(s.id), { disabled: f.credits < price || !!s.battle, tip: 'BUY THIS INDEPENDENT SYSTEM: PEACEFUL BUT EXPENSIVE. THE PRICE RISES WITH EVERY SYSTEM YOU OWN.' });
      }
    }
  };

  /* ---------- attack / move order ---------- */
  H.drawOrder = function (ctx, run) {
    const o = G.order;
    if (!o) return;
    const from = run.systems[o.from], to = run.systems[o.to], f = run.factions[0];
    if (!from || !to || from.owner !== 0) { G.order = null; return; }
    const hostile = to.owner !== 0, g = from.gar;
    const n = o.frac >= 1 ? g.n : Math.round(g.n * o.frac), ships = o.frac >= 1 ? g.ships : Math.round(g.ships * o.frac);
    const st = { owner: 0, n, vet: g.vet, ships, sdur: g.sdur };
    const path = S.path(run, o.from, o.to, 0);
    const fuel = S.armyFuel(run, f, n + ships * 5, path ? path.length - 1 : 1);
    const w = 240, h = hostile ? 86 : 64;
    const p = G.toScreen(to.x, to.y);
    let x = Math.round(p.x + 16), y = Math.round(p.y - h / 2);
    if (x + w > G.W - 3) x = Math.round(p.x - w - 16);
    x = U.clamp(x, 3, G.W - w - 3); y = U.clamp(y, G.HUD_H + 3, G.mapBottom() - h - 3);
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 3, hostile ? 17 : 13, 0);
    G.block(x, y, w, h);
    TB(ctx, (hostile ? 'ATTACK ' : 'MOVE TO ') + to.name, x + 6, y + 8, 31);
    TS(ctx, to.owner >= 0 ? (to.owner === 0 ? 'YOURS' : AS.PERS_NAMES[run.factions[to.owner].pers]) : 'INDEPENDENT', x + w - 6, y + 10, AS.Gal.fcol(run, to.owner), 'right');
    TS(ctx, 'SEND', x + 6, y + 23, 6);
    [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, 'ALL']].forEach(([fr, l], i) => G.button(ctx, x + 30 + i * 31, y + 20, 29, 12, l, () => { o.frac = fr; AS.Sfx.play('click'); }, { active: o.frac === fr, big: false, tip: 'HOW MUCH OF THE GARRISON TO SEND. WHAT STAYS BEHIND DEFENDS ' + from.name + '.' }));
    TS(ctx, n + ' SOLDIERS' + (ships ? ' + ' + ships + ' SHIPS' : ''), x + 158, y + 23, 7);
    const fuelOk = f.fuel >= fuel;
    TS(ctx, 'FUEL ' + fuel + ' OF ' + Math.floor(f.fuel), x + 6, y + 36, fuelOk ? 18 : 17);
    G.tip(x, y + 34, 90, 8, 'EVERY LANE COSTS FUEL: ' + C.army.laneFuel + ' PLUS ' + C.army.fuelPer10 + ' PER 10 STRENGTH SENT.');
    if (hostile) {
      const odds = S.odds(run, st, to, 'attack'), pc = Math.round(odds.p * 100);
      TB(ctx, pc + '% TO WIN', x + 6, y + 46, pc >= 70 ? 22 : pc >= 45 ? 13 : 17);
      TS(ctx, 'LOSSES ' + odds.lossLo + '-' + odds.lossHi + '  YOU ' + Math.round(odds.att) + ' VS ' + Math.round(odds.def), x + 74, y + 48, 7);
      G.tip(x, y + 44, w, 11, 'ODDS FROM THE SAME BATTLE MODEL THE GAME USES. DEFENDERS GET +20%' + (to.capital >= 0 && to.capital === to.owner ? ', CAPITALS MORE' : '') + '.');
      const blocked = run.t < C.game.protect ? 'ATTACKS OPEN AT 4:00.' : S.truceBlocks(run, 0, to.owner) ? 'COALITION TRUCE: ONLY THE LEADER MAY BE ATTACKED.' : !fuelOk ? 'NOT ENOUGH FUEL.' : '';
      G.button(ctx, x + 6, y + h - 18, 76, 14, 'ATTACK', () => Act().sendOrder('attack'), { primary: true, disabled: !!blocked || n + ships <= 0, tip: blocked || 'CAPTURE IT. ITS BUILDINGS ARRIVE BROKEN: REPAIR THEM TO PUT THEM TO WORK.' });
      G.button(ctx, x + 86, y + h - 18, 60, 14, 'RAID', () => Act().sendOrder('raid'), { disabled: !!blocked || n + ships <= 0 || to.owner < 0, tip: to.owner < 0 ? 'INDEPENDENTS HAVE NOTHING WORTH RAIDING.' : 'FIGHT ' + C.combat.raidRounds + ' ROUNDS, WRECK THEIR BUILDINGS, STEAL CREDITS, THEN RETURN.' });
    } else G.button(ctx, x + 6, y + h - 18, 76, 14, 'MOVE', () => Act().sendOrder('move'), { primary: true, disabled: n + ships <= 0 || !fuelOk, tip: fuelOk ? 'MOVE THROUGH YOUR OWN SYSTEMS.' : 'NOT ENOUGH FUEL.' });
    G.button(ctx, x + w - 64, y + h - 18, 58, 14, 'CANCEL', () => { G.order = null; AS.Sfx.play('click'); }, { tip: 'ESC' });
  };

  /* ---------- side panels ---------- */
  function sidePanel(ctx, x, y0, w, h, title, sub, back, backTip) {
    D.plate(ctx, x, y0, w, h, 2);
    G.block(x, y0, w, h);
    D.hazard(ctx, x + 1, y0 + 1, w - 2, 3, 13, 0);
    TB(ctx, title.slice(0, Math.floor((w - 60) / 6)), x + 6, y0 + 8, 31);
    if (sub) TS(ctx, sub, x + 6, y0 + 18, 6);
    G.button(ctx, x + w - 50, y0 + 6, 46, 13, back, () => Act().back(), { tip: backTip });
    return y0 + 28;
  }
  function stockRow(ctx, x, y, out, keys) {
    let px = x;
    for (const k of keys || AS.STOCK_KEYS) {
      if (!out[k]) continue;
      ctx.drawImage(AS.Spr.goods[k], px, y + 1);
      TB(ctx, '+' + r1(out[k]), px + 7, y, AS.STOCK[k].col);
      px += 14 + D.tw('+' + r1(out[k]), true);
    }
    return px;
  }
  H.drawSysPanel = function (ctx, run, s, L) {
    const f = run.factions[0], own = s.owner === 0, x = G.W - L.pw, w = L.pw, h = G.mapBottom() - G.HUD_H;
    let y = sidePanel(ctx, x, G.HUD_H, w, h, s.name, (own ? 'POPULATION ' + s.pop + ' (+' + Math.round(s.pop * C.econ.popMult * 100) + '% OUTPUT)' : ''), 'GALAXY', 'BACK TO THE GALAXY (ESC OR RIGHT-CLICK).');
    const fl = S.sysFlow(run, s);
    TS(ctx, 'THIS SYSTEM MAKES PER CYCLE', x + 6, y, 5); y += 8;
    const out = Object.assign({}, fl.out); out.credits += own ? C.econ.levy : 0;
    if (stockRow(ctx, x + 6, y, out) === x + 6) TS(ctx, 'NOTHING YET: OPEN A PLANET', x + 6, y + 1, 4);
    G.tip(x, y - 9, w, 18, 'WHAT THIS SYSTEM ADDS TO YOUR STOCKPILE EVERY CYCLE (INCLUDING THE ' + C.econ.levy + ' CR LEVY).');
    y += 14;
    TB(ctx, 'PATHWAYS ' + s.pathways.length + '/' + S.pathwaySlots(run, s), x + 6, y, 7);
    G.tip(x, y - 1, w, 10, 'PATHWAYS JOIN TWO PLANETS. DRAG FROM ONE PLANET TO ANOTHER TO OPEN ONE (' + costTxt(AS.COSTS.pathway) + '). THE LOGISTICS UPGRADES ADD MORE.');
    y += 10;
    TS(ctx, own ? 'DRAG PLANET > PLANET: NEW PATHWAY' : '', x + 6, y, 5); y += 9;
    if (G.sel && G.sel.pathway !== undefined && own) {
      const pw = S.pathwayById(s, G.sel.pathway);
      if (pw) { G.button(ctx, x + 6, y, w - 12, 12, 'CLOSE PATHWAY ' + s.planets[pw.a].name.replace(/^\S+ /, '') + '-' + s.planets[pw.b].name.replace(/^\S+ /, ''), () => { Act().doIt('unpath', { sys: s.id, pathway: pw.id }, 'remove'); G.sel = null; }, { tip: 'REMOVE THE PATHWAY AND ITS PORTS (50% CREDIT REFUND).', big: false }); y += 15; }
    }
    D.rect(ctx, x + 4, y, w - 8, 1, 3); y += 4;
    const g = s.gar, k = S.defStrength(run, s);
    TB(ctx, 'DEFENCE ' + Math.round(k), x + 6, y, 13);
    TS(ctx, g.n + ' SOLDIERS' + (s.train.q ? ' (+' + s.train.q + ')' : '') + (g.ships ? ', ' + g.ships + ' SHIPS' : '') + (s.plat.n ? ', ' + s.plat.n + ' PLAT' : ''), x + 10 + D.tw('DEFENCE ' + Math.round(k), true), y + 2, 6);
    G.tip(x, y - 1, w, 10, 'SOLDIERS GAIN VETERANCY OVER TIME AND IN BATTLE. WARSHIPS: ' + C.equip.shipPower + ' STRENGTH, NO SALARY, BURN ' + C.equip.shipFuel + ' FUEL PER CYCLE. PLATFORMS: ' + C.equip.platformPower + ' DEFENCE STRENGTH.');
    y += 13;
    if (own) {
      const bw = Math.floor((w - 16) / 3), rc = [C.army.recruitCost * C.army.batch, 0];
      G.button(ctx, x + 6, y, bw, 13, 'RECRUIT', () => Act().recruit(s.id), { disabled: !S.canPay(f, rc), primary: AS.Tutorial && AS.Tutorial.want('recruit'), tip: 'TRAIN 5 SOLDIERS: ' + rc[0] + ' CR NOW. THEN ' + r1(S.salaryFor(run, f, S.soldiers(run, 0) + 5) - S.salary(run, f)) + ' CR SALARY AND ' + r1(S.rations(run, f, 5)) + ' FOOD EVERY CYCLE.' });
      G.button(ctx, x + 8 + bw, y, bw, 13, 'SHIP', () => Act().doIt('ship', { sys: s.id }, 'build'), { disabled: !S.canPay(f, C.equip.shipCost), tip: 'WARSHIP: ' + costTxt(C.equip.shipCost) + '.' });
      G.button(ctx, x + 10 + bw * 2, y, bw, 13, 'PLATFORM', () => Act().doIt('plat', { sys: s.id }, 'build'), { disabled: !S.canPay(f, C.equip.platCost) || s.plat.n >= C.equip.maxPlatforms, tip: 'DEFENCE PLATFORM: ' + costTxt(C.equip.platCost) + '.', big: bw >= 50 });
      y += 16;
      const rl = S.repairList(run, s), rc2 = rl.reduce((a, r) => [a[0] + r.cost[0], a[1] + r.cost[1]], [0, 0]);
      if (rl.some(r => r.dur < 60)) { G.button(ctx, x + 6, y, w - 12, 13, 'REPAIR ALL ' + costTxt(rc2), () => Act().doIt('repair', { sys: s.id, kind: 'all' }, 'repair'), { primary: rl.some(r => r.dur <= 0), disabled: !S.canPay(f, [Math.min(rc2[0], 1), Math.min(rc2[1], 1)]), tip: 'REPAIR EVERYTHING HERE YOU CAN AFFORD. BUILDINGS STOP AT 0%.' }); y += 16; }
      G.button(ctx, x + 6, y, w - 12, 12, 'AUTO-REPAIR ' + (f.autoRepair ? 'ON' : 'OFF'), () => Act().doIt('autorepair', { on: !f.autoRepair }, 'click'), { active: f.autoRepair, big: false, tip: 'EMPIRE-WIDE: AT EACH CYCLE, REPAIR ANYTHING UNDER ' + C.dur.autoRepairAt + '% IF YOU CAN AFFORD IT.' });
    }
  };
  H.drawPlanetPanel = function (ctx, run, s, pi, L) {
    const f = run.factions[0], p = s.planets[pi], own = s.owner === 0, x = G.W - L.pw, w = L.pw, h = G.mapBottom() - G.HUD_H;
    const bonus = AS.RES_KEYS.filter(r => AS.RES[r].planets.indexOf(p.kind) >= 0);
    let y = sidePanel(ctx, x, G.HUD_H, w, h, p.name, S.slotCount(p, f) + ' SLOTS, ' + p.blds.length + ' USED' + (bonus.length ? '  +50%: ' + bonus.map(r => AS.BLD[AS.RES[r].proc].name).join(', ') : ''), 'SYSTEM', 'BACK TO THE SYSTEM (ESC OR RIGHT-CLICK).');
    const fl = S.sysFlow(run, s), sel = G.sel || {};
    if (sel.slot !== undefined && own && !S.bldAt(p, sel.slot)) {
      TB(ctx, 'BUILD IN SLOT ' + (sel.slot + 1), x + 6, y, 13); y += 12;
      const bw = Math.floor((w - 14) / 2);
      AS.BLD_KEYS.forEach((kind, i) => {
        const B = AS.BLD[kind], c = B.cost, bx = x + 6 + (i % 2) * (bw + 2), by = y + Math.floor(i / 2) * 26;
        const good = S.procBonus(p, kind) > 1 && B.role === 'proc', want = AS.Tutorial && AS.Tutorial.wantBuild(kind);
        G.button(ctx, bx, by, bw, 24, B.name, () => Act().build(s.id, pi, sel.slot, kind), { noText: true, disabled: !S.canPay(f, c), primary: want, tip: B.name + ': ' + (B.role === 'ext' ? 'EXTRACTS ' + AS.RES[B.res].name + '. THEN DRAG DOWN FROM IT TO A DEPOSIT TO DRILL.' : 'TURNS ' + AS.RES[B.res].raw + ' INTO ' + AS.RES[B.res].outName + (good ? ' (+50% ON THIS PLANET)' : '') + '.') + ' ' + AS.RES[B.res].use });
        ctx.drawImage(AS.Spr.goods[B.role === 'ext' ? B.res : AS.RES[B.res].out], bx + 4, by + 4);
        TB(ctx, B.name, bx + 12, by + 3, S.canPay(f, c) ? (want ? 0 : 31) : 4);
        TS(ctx, costTxt(c) + (good ? ' +50%' : ''), bx + 12, by + 14, S.canPay(f, c) ? (good ? 22 : 6) : 4);
      });
      return;
    }
    if (sel.bld !== undefined) {
      const b = S.bldById(p, sel.bld);
      if (b) {
        const st = fl.B[b.id], B = AS.BLD[b.kind];
        TB(ctx, B.name, x + 6, y, 31); y += 11;
        D.rect(ctx, x + 6, y + 1, 5, 5, AS.PlanetView.STATUS_COL[st.status] || 5);
        const lines = U.wrapText(st.reason, Math.floor((w - 22) / 6));
        lines.forEach((l, i) => TB(ctx, l, x + 14, y + i * 10, AS.PlanetView.STATUS_COL[st.status] || 7));
        y += lines.length * 10 + 3;
        const det = U.wrapText(AS.PlanetView.tipFor(run, s, pi, b, st).replace(/^[^.]*\. [^.]*\. /, ''), Math.floor((w - 12) / 4));
        det.slice(0, 5).forEach((l, i) => TS(ctx, l, x + 6, y + i * 7, 6));
        y += Math.min(5, det.length) * 7 + 4;
        D.bar(ctx, x + 6, y, w - 12, 6, b.dur / 100, b.dur < 25 ? 17 : b.dur < 50 ? 18 : 22);
        G.tip(x + 6, y - 1, w - 12, 8, 'DURABILITY ' + Math.round(b.dur) + '%. AT 0% IT STOPS UNTIL REPAIRED.');
        y += 10;
        if (own) {
          const rl = S.repairList(run, s).filter(r => r.pi === pi && r.id === b.id && (r.kind === 'bld' || r.kind === 'drill' || r.kind === 'conv'));
          const rc = rl.reduce((a, r) => [a[0] + r.cost[0], a[1] + r.cost[1]], [0, 0]);
          if (rl.length) { G.button(ctx, x + 6, y, w - 12, 13, 'REPAIR ' + costTxt(rc), () => Act().repairBld(s.id, pi, b.id), { primary: b.dur <= 0, tip: 'REPAIR THE BUILDING, ITS DRILL AND ITS CONVEYOR.' }); y += 16; }
          if (b.out) { G.button(ctx, x + 6, y, w - 12, 12, 'REMOVE CONVEYOR', () => Act().doIt('disconnect', { sys: s.id, planet: pi, from: { b: b.id } }, 'remove'), { big: false }); y += 14; }
          G.button(ctx, x + 6, y, w - 12, 12, 'DEMOLISH (+' + Math.round(B.cost[0] * 0.4) + ' CR)', () => { Act().doIt('demolish', { sys: s.id, planet: pi, bld: b.id }, 'remove'); G.sel = null; }, { big: false, tip: 'REMOVE THE BUILDING TO FREE THE SLOT.' });
        }
        return;
      }
    }
    if (sel.port !== undefined) {
      const pw = S.pathwayById(s, sel.port);
      if (pw) {
        const other = s.planets[S.otherPlanet(pw, pi)], po = fl.ports[pi + ':' + pw.id] || { out: 0, in: 0 };
        TB(ctx, 'PORT TO ' + other.name.replace(/^\S+ /, ''), x + 6, y, 31); y += 12;
        TB(ctx, 'LEAVING ' + (po.out ? r1(po.out) + ' ' + AS.RES[po.outRes].name : '-'), x + 6, y, po.out ? 13 : 5); y += 11;
        TB(ctx, 'ARRIVING ' + (po.in ? r1(po.in) + ' ' + AS.RES[po.inRes].name : '-'), x + 6, y, po.in ? 22 : 5); y += 13;
        const link = p.portIn[pw.id];
        TS(ctx, link ? 'ARRIVALS GO TO ' + AS.BLD[S.bldById(p, link.b).kind].name : 'DRAG FROM THE PORT TO A PROCESSOR TO TAKE WHAT ARRIVES.', x + 6, y, 6); y += 10;
        if (own && link) G.button(ctx, x + 6, y, w - 12, 12, 'REMOVE PORT CONVEYOR', () => Act().doIt('disconnect', { sys: s.id, planet: pi, from: { p: pw.id } }, 'remove'), { big: false });
        return;
      }
    }
    // nothing selected: what this planet does, in one glance
    const out = { credits: 0, alloy: 0, fuel: 0, food: 0 };
    for (const b of p.blds) { const st = fl.B[b.id]; if (st.role === 'proc') out[AS.RES[st.res].out] += st.output; }
    TS(ctx, 'THIS PLANET MAKES PER CYCLE', x + 6, y, 5); y += 8;
    if (stockRow(ctx, x + 6, y, out) === x + 6) TS(ctx, 'NOTHING YET', x + 6, y + 1, 4);
    y += 14;
    const counts = {};
    for (const b of p.blds) { const st = fl.B[b.id].status; counts[st] = (counts[st] || 0) + 1; }
    for (const [k2, label] of [['ok', 'WORKING'], ['idle', 'IDLE'], ['blocked', 'BLOCKED'], ['broken', 'BROKEN'], ['empty', 'DEPOSIT EMPTY']]) if (counts[k2]) { D.rect(ctx, x + 6, y + 2, 5, 5, AS.PlanetView.STATUS_COL[k2]); TB(ctx, counts[k2] + ' ' + label, x + 14, y, 7); y += 11; }
    if (own) {
      y += 4;
      for (const l of ['CLICK AN EMPTY SLOT TO BUILD.', 'DRAG DOWN FROM AN EXTRACTOR', 'TO A DEPOSIT TO DRILL.', 'DRAG AN EXTRACTOR TO A PROCESSOR', 'OR A PORT TO CONNECT IT.']) { TS(ctx, l, x + 6, y, 5); y += 8; }
    }
  };

  /* ---------- ticker, toast, notices ---------- */
  H.drawTicker = function (ctx, run) {
    const y = G.mapBottom();
    D.rect(ctx, 0, y, G.W, G.TICKER_H, 1); D.rect(ctx, 0, y, G.W, 1, 3);
    const last = run.log[run.log.length - 1];
    const hint = G.view === 'planet' ? 'CLICK A SLOT: BUILD.  DRAG DOWN: DRILL.  DRAG ACROSS: CONVEYOR.  ESC: BACK' : G.view === 'system' ? 'CLICK A PLANET: OPEN IT.  DRAG PLANET > PLANET: PATHWAY.  ESC: GALAXY' : 'CLICK YOUR SYSTEM: OPEN IT.  DRAG FROM IT TO A NEIGHBOUR: MOVE OR ATTACK.';
    if (last && run.t - last.t < 10) TB(ctx, U.fmtTime(last.t) + '  ' + last.text.slice(0, Math.floor((G.W - 50) / 6)), 4, y + 3, last.k === 'bad' ? 17 : last.k === 'good' ? 22 : last.k === 'warn' ? 13 : 7);
    else TS(ctx, hint, 4, y + 4, 5);
  };
  H.drawToast = function (ctx, y) {
    const t = G.toast;
    if (!t) return;
    const w = Math.min(G.W - 20, D.tw(t.text, true) + 14), x = Math.round(G.W / 2 - w / 2);
    D.rect(ctx, x + 1, y + 1, w, 13, 0);
    D.frame(ctx, x, y, w, 13, 1, t.col);
    TB(ctx, t.text.slice(0, Math.floor((w - 12) / 6)), G.W / 2, y + 3, t.col, 'center');
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
  void T;
})(globalThis.AS = globalThis.AS || {});
