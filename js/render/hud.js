/* ATLAS SYNDICATE v5 — render/hud.js
   Screen-space game UI: the top bar (credits, next cycle's net income, systems, clock), threat warnings,
   the event banner, the faction roster, the galaxy selection panel, the attack order with its odds,
   and the system view's side panel. Every element carries a short tooltip. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, PAL = AS.PALETTE, S = AS.S, G = AS.G, D = AS.Draw;
  const H = AS.HUD = {};
  const T = (ctx, s, x, y, col, o) => D.text(ctx, s, x, y, col, o);
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });
  const Act = () => AS.Act;
  const sign = v => (v >= 0 ? '+' : '') + v;

  /* ---------- top bar ---------- */
  H.drawTop = function (ctx, run, interactive) {
    const W = G.W, f = run.factions[0];
    D.rect(ctx, 0, 0, W, 13, 1); D.rect(ctx, 0, 13, W, 1, 3); D.rect(ctx, 0, 14, W, 1, 0);
    ctx.drawImage(AS.Spr.icons.coin, 3, 4);
    const cr = Math.round(G.disp.credits);
    T(ctx, U.fmtNum(cr), 10, 4, f.credits < 0 ? 17 : 13);
    let x = 12 + D.tw(U.fmtNum(cr)) + 6;
    const fc = G.forecast || { net: 0, income: 0, salary: 0, repairs: 0 };
    T(ctx, 'NET ' + sign(fc.net), x, 4, fc.net >= 0 ? 22 : (Math.floor(G.time * 3) % 2 ? 17 : 18));
    const nw = D.tw('NET ' + sign(fc.net));
    D.bar(ctx, x + nw + 3, 4, 16, 5, run.cycleT / C.game.cycle, 12);
    G.tip(0, 0, x + nw + 22, 13, 'CREDITS ' + U.fmtInt(f.credits) + '. NEXT CYCLE (EVERY ' + C.game.cycle + ' S): INCOME +' + fc.income + ', SALARIES -' + fc.salary + ', REPAIRS -' + fc.repairs + ' = ' + sign(fc.net) + '. BELOW ZERO CREDITS: A WARNING, THEN SOLDIERS DESERT.');
    x += nw + 24;
    const own = S.ownCount(run, 0);
    T(ctx, 'SYS ' + own + '/' + run.systems.length, x, 4, 7);
    G.tip(x - 2, 0, 46, 13, 'SYSTEMS YOU HOLD. WIN: ELIMINATE EVERY RIVAL, OR HOLD THE MOST SYSTEMS WHEN THE 30:00 TIMER ENDS.');
    x += 48;
    ctx.drawImage(AS.Spr.icons.clock, x, 4);
    const left = C.game.length - run.t;
    T(ctx, U.fmtTime(run.t), x + 7, 4, left < 120 ? (Math.floor(G.time * 2) % 2 ? 13 : 7) : 7);
    TS(ctx, '/' + U.fmtTime(C.game.length), x + 8 + D.tw(U.fmtTime(run.t)), 4, 5);
    G.tip(x - 2, 0, 58, 13, 'GAME TIME. THE GAME ENDS AT 30:00: MOST SYSTEMS WINS.');
    x += 60;
    if (run.t < C.game.protect) {
      const msg = 'ATTACKS OPEN ' + U.fmtTime(C.game.protect - run.t);
      D.hazard(ctx, x - 2, 2, D.tw(msg) + 6, 10, 13, G.time * 6);
      D.rect(ctx, x, 3, D.tw(msg) + 2, 8, 1);
      TS(ctx, msg, x + 1, 4, 13);
      G.tip(x - 2, 0, D.tw(msg) + 6, 13, 'PROTECTED PERIOD: NOBODY CAN ATTACK ANYBODY UNTIL 4:00. BUILD YOUR SUPPLY LINES.');
      x += D.tw(msg) + 8;
    } else {
      const nc = run.nextCard - run.t;
      TS(ctx, 'CARD ' + U.fmtTime(nc), x, 4, 12);
      G.tip(x - 2, 0, 44, 13, 'NEXT UPGRADE CARD DRAFT. YOU ALSO DRAFT ONE AFTER CAPTURING A RIVAL SYSTEM.');
      x += 46;
    }
    if (!interactive) return;
    const bx = W - 164;
    if (x > bx - 2) return;
    G.button(ctx, bx, 2, 26, 10, 'TIPS', () => Act().toggleTips(), { active: G.settings.tips, tip: 'TIPS: HOVER ANYTHING FOR AN EXPLANATION (T).' });
    G.button(ctx, bx + 28, 2, 14, 10, 'II', () => Act().togglePause(), { active: G.paused, tip: 'PAUSE (SPACE). YOU CAN STILL GIVE ORDERS.' });
    C.sim.hudSpeeds.forEach((s, i) => G.button(ctx, bx + 44 + i * 16, 2, 15, 10, s + 'X', () => Act().setSpeed(s), { active: !G.paused && G.speed === s, tip: 'GAME SPEED (KEYS 1-3).' }));
    G.button(ctx, bx + 94, 2, 20, 10, G.settings.mute ? 'MUT' : 'SND', () => Act().toggleMute(), { col: G.settings.mute ? 17 : 7, tip: 'SOUND ON/OFF (M).' });
    G.button(ctx, bx + 116, 2, 46, 10, 'MENU', () => Act().openPause(), { tip: 'PAUSE MENU AND SETTINGS (ESC).' });
  };

  /* ---------- warnings (left, under the bar) ---------- */
  H.drawWarnings = function (ctx, run, interactive) {
    let y = G.HUD_H + 3;
    const list = run.warnings.slice().sort((a, b) => ({ fight: 0, inc: 1, mass: 2, broke: 3 }[a.kind] - { fight: 0, inc: 1, mass: 2, broke: 3 }[b.kind])).slice(0, 4);
    for (const w of list) {
      const txt = w.text, wd = D.tw(txt) + 16;
      const col = w.kind === 'fight' ? 17 : w.kind === 'inc' ? 18 : w.kind === 'broke' ? 17 : 13;
      const blink = (w.kind === 'fight' || w.kind === 'inc') && Math.floor(G.time * 3) % 2;
      D.rect(ctx, 3, y + 1, wd, 10, 0);
      D.frame(ctx, 2, y, wd, 10, 1, col);
      D.rect(ctx, 3, y + 1, 3, 8, blink ? 31 : col);
      if (w.owner >= 0) ctx.drawImage(AS.Gal.ficon(run, w.owner), wd - 6, y + 2);
      TS(ctx, txt, 9, y + 3, blink ? 31 : 7);
      if (interactive) {
        G.btns.push({ x: 2, y, w: wd, h: 10, fn: () => { const s = run.systems[w.sys]; if (s) { if (G.view !== 'galaxy') Act().backToGalaxy(); G.focusOn(s.x, s.y, Math.max(2, G.cam.z)); G.sel = { sys: s.id }; AS.Sfx.play('click'); } } });
        G.tip(2, y, wd, 10, w.kind === 'mass' ? 'A RIVAL IS MASSING ARMIES NEXT TO YOUR SYSTEM. REINFORCE IT, RECRUIT THERE OR BUILD A PLATFORM. CLICK TO LOOK.' : w.kind === 'inc' ? 'AN ARMY IS ON ITS WAY TO YOUR SYSTEM. CLICK TO LOOK.' : w.kind === 'fight' ? 'A BATTLE IS ON IN YOUR SYSTEM. SEND REINFORCEMENTS: THEY JOIN THE DEFENCE.' : 'PAY YOUR SALARIES: BUILD INCOME OR LOSE SOLDIERS.');
      }
      y += 12;
    }
    return y;
  };

  /* ---------- event banner ---------- */
  H.drawEvent = function (ctx, run, y0) {
    const ev = run.events, e = ev.next;
    const items = [];
    for (const a of ev.active) items.push({ e: a, txt: AS.EVENTS[a.type].name + ' ' + U.fmtTime(a.until - run.t) + ' LEFT: ' + S.eventText(run, a), col: 18 });
    if (e && e.announced) items.push({ e, txt: 'IN ' + U.fmtTime(e.at - run.t) + ': ' + AS.EVENTS[e.type].name + ' - ' + S.eventText(run, e), col: 13 });
    let y = y0;
    for (const it of items.slice(0, 2)) {
      const w = Math.min(G.W - 200, D.tw(it.txt) + 14), x = Math.round(G.W / 2 - w / 2);
      D.rect(ctx, x + 1, y + 1, w, 11, 0);
      D.plate(ctx, x, y, w, 11, 1);
      D.hazard(ctx, x + 1, y + 1, 3, 9, it.col, G.time * 6);
      TS(ctx, it.txt.slice(0, Math.floor((w - 12) / 4)), x + 7, y + 3, it.col);
      G.tip(x, y, w, 11, 'GALAXY EVENT, ANNOUNCED 60 S AHEAD SO YOU CAN PREPARE.');
      y += 13;
    }
    return y;
  };

  /* ---------- faction roster (right) ---------- */
  H.drawRoster = function (ctx, run) {
    const w = 96, x = G.W - w - 3;
    let y = G.HUD_H + 3;
    const lead = S.leaderRaw(run);
    D.rect(ctx, x + 1, y + 1, w, 8 + run.factions.length * 9, 0);
    D.frame(ctx, x, y, w, 8 + run.factions.length * 9, 1, 3);
    TS(ctx, 'FACTION', x + 4, y + 2, 5); TS(ctx, 'SYS', x + w - 4, y + 2, 5, 'right');
    y += 8;
    const order = run.factions.slice().sort((a, b) => S.ownCount(run, b.id) - S.ownCount(run, a.id) || a.id - b.id);
    for (const f of order) {
      const n = S.ownCount(run, f.id);
      const col = f.alive ? f.col : 4;
      ctx.drawImage(AS.Spr.factionIcon(f.icon, col), x + 3, y + 1);
      TS(ctx, f.id === 0 ? 'YOU' : AS.PERS_NAMES[f.pers], x + 10, y + 1, f.alive ? (f.id === 0 ? 13 : 7) : 4);
      TS(ctx, f.alive ? n : 'OUT', x + w - 4, y + 1, f.alive ? col : 4, 'right');
      if (f.id === lead && Math.floor(G.time * 2) % 2) TS(ctx, '!', x + w - 18, y + 1, 17);
      G.tip(x, y, w, 9, f.id === 0 ? 'YOU (' + AS.CORPS[f.corp].name + ': ' + AS.CORPS[f.corp].desc + ')' : f.name + ' - ' + AS.PERS_NAMES[f.pers] + ': ' + AS.PERS_DESC[f.pers] + (f.id === lead ? ' HOLDS 35%+ OF THE GALAXY: EVERYONE TARGETS IT.' : ''));
      y += 9;
    }
    if (lead >= 0) {
      const t = 'LEADER: ' + (lead === 0 ? 'YOU' : AS.PERS_NAMES[run.factions[lead].pers]);
      D.frame(ctx, x, y + 2, w, 9, 1, 17);
      TS(ctx, t.slice(0, 23), x + 3, y + 4, 17);
      G.tip(x, y + 2, w, 9, 'LEADER PRESSURE: A FACTION HOLDING 35% OF THE GALAXY BECOMES EVERY RIVAL\'S PRIORITY TARGET.');
      y += 12;
    }
    return y;
  };

  /* ---------- galaxy selection panel (bottom left) ---------- */
  H.drawSelPanel = function (ctx, run) {
    if (!G.sel || G.sel.sys === undefined || G.order) return;
    const s = run.systems[G.sel.sys];
    if (!s) return;
    const k = AS.Gal.known(run, s), o = s.owner >= 0 ? run.factions[s.owner] : null;
    const w = 188, h = 70, x = 3, y = G.mapBottom() - h - 3;
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 2);
    D.rect(ctx, x + 1, y + 1, w - 2, 3, o ? o.col : 6);
    G.block(x, y, w, h);
    ctx.drawImage(AS.Gal.ficon(run, s.owner), x + 6, y + 8);
    T(ctx, s.name, x + 14, y + 8, 31);
    TS(ctx, (o ? (o.id === 0 ? 'YOURS' : o.short + ' - ' + AS.PERS_NAMES[o.pers]) : 'INDEPENDENT') + (s.capital >= 0 && s.capital === s.owner ? ' - CAPITAL' : '') + '  ' + (s.region === 'core' ? 'CORE' : 'ARM ' + 'ABCDE'[s.arm]), x + 14 + D.tw(s.name) + 5, y + 9, 6);
    G.button(ctx, x + w - 13, y + 6, 10, 9, 'X', () => { G.sel = null; AS.Sfx.play('click'); }, { tip: 'CLOSE (ESC).' });
    let yy = y + 19;
    const myAtt = s.battle && run.battles.find(b => b.id === s.battle && b.att.owner === 0);
    if (myAtt) {
      const r = S.oddsRaw(S.stackStrength(run, myAtt.att), S.defStrength(run, s), myAtt.att.mode);
      T(ctx, 'YOUR ' + (myAtt.att.mode === 'raid' ? 'RAID' : 'ATTACK') + ': ' + Math.round(r.p * 100) + '% NOW', x + 6, yy, r.p >= 0.5 ? 22 : 17);
      G.button(ctx, x + w - 64, y + h - 17, 58, 12, 'RETREAT', () => Act().retreat(myAtt.id), { tip: 'PULL OUT: SURVIVORS RETURN HOME, LOSING ' + Math.round(C.combat.retreatLoss * 100) + '% ON THE WAY OUT.' });
      yy += 9;
    }
    if (k.exact) {
      const g = s.gar;
      TS(ctx, 'DEFENCE ' + k.v + ' = ' + g.n + ' SOLDIERS' + (g.vet >= 0.33 ? ' VET ' + Math.floor(g.vet * 3) : '') + (g.ships ? ' + ' + g.ships + ' SHIPS' : '') + (s.plat.n ? ' + ' + s.plat.n + ' PLATFORMS' : ''), x + 6, yy, 7);
      G.tip(x, yy - 1, w, 7, 'DEFENCE = SOLDIERS (VETERANS UP TO +50%) + WARSHIPS + PLATFORMS, TIMES THE DEFENDER BONUS' + (s.capital >= 0 ? ' AND THE CAPITAL BONUS' : '') + '.');
    } else TS(ctx, 'SIZE BAND ' + k.text + ' - TOO FAR AWAY TO SEE EXACT NUMBERS', x + 6, yy, 5);
    yy += 8;
    let px = x + 6;
    for (const p of s.planets) { ctx.drawImage(AS.Spr.goods[p.type], px, yy); for (let i = 0; i < p.rich; i++) D.rect(ctx, px + 6, yy + 4 - i * 2, 1, 1, 13); px += 10; }
    TS(ctx, s.planets.length + ' PLANETS', px + 2, yy, 5);
    yy += 9;
    if (s.owner === 0) {
      const y2 = S.sysYield(run, s);
      TS(ctx, 'INCOME +' + Math.round(y2.credits) + '/CYCLE  POP ' + s.pop + (s.train.q ? '  TRAINING ' + s.train.q : ''), x + 6, yy, 22);
      G.button(ctx, x + 6, y + h - 17, 84, 12, 'OPEN SYSTEM', () => Act().openSystem(s.id), { primary: true, tip: 'OPEN THE SYSTEM VIEW: EXTRACTORS AND SUPPLY LINES (OR CLICK THE SYSTEM AGAIN).' });
      G.button(ctx, x + 94, y + h - 17, 58, 12, 'RECRUIT +5', () => Act().recruit(s.id), { tip: 'TRAIN 5 SOLDIERS HERE (ONE EVERY ' + C.army.trainTime + ' S). EACH COSTS SALARY EVERY CYCLE; SALARIES RISE WITH ARMY SIZE.' });
    } else {
      const adj = S.neighbours(run, s.id).some(n => run.systems[n].owner === 0);
      TS(ctx, adj ? (run.t < C.game.protect ? 'ATTACKS OPEN AT 4:00' : 'DRAG FROM YOUR SYSTEM ONTO IT TO ATTACK') : 'NOT NEXT TO YOUR SYSTEMS', x + 6, yy, adj ? 13 : 5);
      if (s.owner === -1 && adj) {
        const price = S.buyPrice(run, run.factions[0], s);
        G.button(ctx, x + 6, y + h - 17, 98, 12, 'BUY ' + U.fmtInt(price) + ' CR', () => Act().buy(s.id), { disabled: run.factions[0].credits < price || !!s.battle, tip: 'BUY THIS INDEPENDENT SYSTEM: PEACEFUL, BUILDINGS INTACT, BUT EXPENSIVE. THE PRICE RISES WITH EVERY SYSTEM YOU OWN.' });
      }
    }
  };

  /* ---------- the attack / move order (after dragging onto a system) ---------- */
  H.drawOrder = function (ctx, run) {
    const o = G.order;
    if (!o) return;
    const from = run.systems[o.from], to = run.systems[o.to];
    if (!from || !to || from.owner !== 0) { G.order = null; return; }
    const hostile = to.owner !== 0;
    const g = from.gar;
    const n = o.frac >= 1 ? g.n : Math.round(g.n * o.frac), ships = o.frac >= 1 ? g.ships : Math.round(g.ships * o.frac);
    const st = { owner: 0, n, vet: g.vet, ships, sdur: g.sdur };
    const w = 214, h = hostile ? 74 : 54;
    const p = G.toScreen(to.x, to.y);
    let x = Math.round(p.x + 16), y = Math.round(p.y - h / 2);
    if (x + w > G.W - 3) x = Math.round(p.x - w - 16);
    x = U.clamp(x, 3, G.W - w - 3); y = U.clamp(y, G.HUD_H + 3, G.mapBottom() - h - 3);
    D.rect(ctx, x + 2, y + 2, w, h, 0);
    D.plate(ctx, x, y, w, h, 2);
    D.hazard(ctx, x + 1, y + 1, w - 2, 3, hostile ? 17 : 13, 0);
    G.block(x, y, w, h);
    const tgtName = to.owner >= 0 ? (to.owner === 0 ? 'YOUR SYSTEM' : AS.PERS_NAMES[run.factions[to.owner].pers]) : 'INDEPENDENT';
    T(ctx, (hostile ? 'ATTACK ' : 'MOVE TO ') + to.name, x + 6, y + 8, 31);
    TS(ctx, tgtName, x + w - 6, y + 9, AS.Gal.fcol(run, to.owner), 'right');
    TS(ctx, 'SEND', x + 6, y + 21, 6);
    [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, 'ALL']].forEach(([fr, l], i) => G.button(ctx, x + 30 + i * 30, y + 18, 28, 11, l, () => { o.frac = fr; AS.Sfx.play('click'); }, { active: o.frac === fr, tip: 'HOW MUCH OF THE GARRISON TO SEND. WHAT STAYS BEHIND DEFENDS ' + from.name + '.' }));
    TS(ctx, n + ' SOLDIERS' + (ships ? ' + ' + ships + ' SHIPS' : ''), x + 152, y + 21, 7);
    if (hostile) {
      const odds = S.odds(run, st, to, 'attack');
      const pc = Math.round(odds.p * 100);
      const col = pc >= 70 ? 22 : pc >= 45 ? 13 : 17;
      T(ctx, pc + '% TO WIN', x + 6, y + 33, col, { big: false });
      TS(ctx, 'EXPECTED LOSSES ' + odds.lossLo + '-' + odds.lossHi + '   YOU ' + Math.round(odds.att) + ' VS ' + Math.round(odds.def), x + 62, y + 34, 7);
      G.tip(x, y + 31, w, 10, 'ODDS FROM THE SAME BATTLE MODEL THE GAME USES: DICE ROUNDS WHERE EACH SIDE HITS IN PROPORTION TO ITS STRENGTH. DEFENDERS GET A ' + Math.round((C.combat.defBonus - 1) * 100) + '% BONUS' + (to.capital >= 0 && to.capital === to.owner ? ', CAPITALS MORE' : '') + '.');
      const raid = S.odds(run, st, to, 'raid');
      TS(ctx, 'RAID: ' + C.combat.raidRounds + ' ROUNDS, WRECK BUILDINGS, LOOT, COME HOME (' + Math.round(raid.p * 100) + '% SURVIVE)', x + 6, y + 45, 5);
      const protectedNow = run.t < C.game.protect;
      G.button(ctx, x + 6, y + h - 17, 70, 12, 'ATTACK', () => Act().sendOrder('attack'), { primary: true, disabled: protectedNow || n + ships <= 0, tip: protectedNow ? 'ATTACKS OPEN AT 4:00.' : 'CAPTURE IT. A CAPTURED SYSTEM KEEPS ITS BUILDINGS, DAMAGED: REPAIR THEM TO PUT IT TO WORK.' });
      G.button(ctx, x + 80, y + h - 17, 60, 12, 'RAID', () => Act().sendOrder('raid'), { disabled: protectedNow || n + ships <= 0 || to.owner < 0, tip: to.owner < 0 ? 'INDEPENDENTS HAVE NOTHING WORTH RAIDING.' : 'FIGHT ' + C.combat.raidRounds + ' ROUNDS, DAMAGE THEIR BUILDINGS, STEAL CREDITS, THEN RETURN.' });
    } else {
      TS(ctx, 'ARMIES TRAVEL ONLY ALONG LANES, THROUGH YOUR OWN SYSTEMS', x + 6, y + 33, 5);
      G.button(ctx, x + 6, y + h - 17, 70, 12, 'MOVE', () => Act().sendOrder('move'), { primary: true, disabled: n + ships <= 0 });
    }
    G.button(ctx, x + w - 64, y + h - 17, 58, 12, 'CANCEL', () => { G.order = null; AS.Sfx.play('click'); }, { tip: 'ESC' });
  };

  /* ---------- system view side panel ---------- */
  H.drawSysPanel = function (ctx, run, s, L) {
    const f = run.factions[0], own = s.owner === 0;
    const pw = L.pw, x = G.W - pw, y0 = G.HUD_H, h = G.mapBottom() - G.HUD_H;
    D.plate(ctx, x, y0, pw, h, 2);
    G.block(x, y0, pw, h);
    D.hazard(ctx, x + 1, y0 + 1, pw - 2, 3, 13, 0);
    T(ctx, s.name, x + 6, y0 + 8, 31, { big: true });
    G.button(ctx, x + pw - 50, y0 + 7, 46, 11, 'GALAXY', () => Act().backToGalaxy(), { tip: 'BACK TO THE GALAXY (ESC OR RIGHT-CLICK).' });
    const y = S.sysYield(run, s);
    let yy = y0 + 22;
    const row = (label, val, col, tip) => { TS(ctx, label, x + 6, yy, 5); TS(ctx, val, x + pw - 6, yy, col || 7, 'right'); if (tip) G.tip(x, yy - 1, pw, 8, tip); yy += 8; };
    row('ORE / ENERGY', (Math.round(y.units.ore * 10) / 10) + ' / ' + (Math.round(y.units.energy * 10) / 10), 7, 'UNITS DELIVERED TO THE STATION PER CYCLE. THE FACTORY TURNS EACH ORE + ENERGY PAIR INTO ' + C.econ.pairValue + ' CR, TIMES THE POPULATION BONUS.');
    row('FOOD > POPULATION', (Math.round(y.units.food * 10) / 10) + ' > ' + s.pop + '/' + y.popCap, s.pop > y.popCap ? 17 : 22, 'EACH FOOD SUPPORTS ' + C.econ.popPerFood + ' POPULATION (MAX ' + C.econ.popMax + '). POPULATION GROWS 1 PER CYCLE TOWARD THAT.');
    row('OUTPUT BONUS', 'X' + y.popMult.toFixed(2), 13, 'POPULATION MULTIPLIES FACTORY OUTPUT: +' + Math.round(C.econ.popMult * 100) + '% PER POPULATION.');
    row('INCOME', '+' + Math.round(y.credits) + ' CR/CYCLE', y.credits > 0 ? 22 : 17, 'WHAT THIS SYSTEM ADDS TO YOUR EMPIRE EVERY CYCLE. ONLY COMPLETE CHAINS PAY.');
    row('LINES', s.lines.length + '/' + S.lineSlots(run, s), 7, 'SUPPLY LINES IN USE / AVAILABLE. MORE UNLOCK AT POPULATION ' + C.econ.linesAtPop.join(' AND ') + ', AND FROM CARDS.');
    row('FREIGHTERS FREE', S.freeFreighters(s) + ' OF ' + s.freighters, 7, 'A LINE NEEDS ONE FREIGHTER PER STOP AFTER THE FIRST TO RUN AT FULL SPEED.');
    yy += 2;
    if (own) {
      const bw = Math.floor((pw - 16) / 2);
      G.button(ctx, x + 6, yy, bw, 12, 'FREIGHTER ' + S.price(run, f, 'freighter'), () => Act().doSys('buyfr', { sys: s.id }, 'buy'), { disabled: s.freighters >= C.econ.maxFreighters, tip: 'BUY A FREIGHTER. IT JOINS THE LINE THAT NEEDS IT MOST. MAX ' + C.econ.maxFreighters + ' PER SYSTEM.' });
      const rc = S.repairAllCost(run, f, s);
      G.button(ctx, x + 10 + bw, yy, bw, 12, rc ? 'REPAIR ' + rc : 'NO REPAIRS', () => Act().doSys('repairall', { sys: s.id }, 'repair'), { disabled: !rc, primary: rc > 0 && S.buildings(run, s).some(b => b.dur <= 0), tip: 'REPAIR EVERYTHING HERE TO 100%. AT 0% A BUILDING STOPS WORKING. AUTO-REPAIR (BELOW) FIXES ANYTHING UNDER ' + C.dur.autoRepairAt + '% AT EACH CYCLE.' });
      yy += 15;
    }
    // selected line / planet details
    const sl = G.sel && G.sel.line !== undefined ? S.lineById(s, G.sel.line) : null;
    if (sl && own) {
      const li = s.lines.indexOf(sl), col = AS.SysView.LINE_COLS[li % 6];
      D.frame(ctx, x + 4, yy, pw - 8, 36, 1, col);
      TS(ctx, 'LINE ' + (li + 1) + ': ' + sl.stops.length + ' STOPS  ' + Math.round(y.eff[li] * 100) + '% SPEED  ' + Math.round(sl.dur) + '% DUR', x + 8, yy + 3, col);
      TS(ctx, 'FREIGHTERS ' + sl.fr + ' (NEEDS ' + Math.ceil((sl.stops.length - 1) / f.mods.reach) + ')', x + 8, yy + 12, 7);
      G.button(ctx, x + pw - 40, yy + 10, 14, 10, '-', () => Act().doSys('fr', { sys: s.id, line: sl.id, d: -1 }, 'click'), { tip: 'TAKE A FREIGHTER OFF THIS LINE.' });
      G.button(ctx, x + pw - 24, yy + 10, 14, 10, '+', () => Act().doSys('fr', { sys: s.id, line: sl.id, d: 1 }, 'click'), { tip: 'ADD A FREIGHTER (BUYS ONE IF NONE ARE FREE).' });
      G.button(ctx, x + 8, yy + 22, 56, 10, 'TRIM END', () => Act().doSys('trim', { sys: s.id, line: sl.id }, 'remove'), { tip: 'REMOVE THE LAST STOP.' });
      G.button(ctx, x + 68, yy + 22, 60, 10, 'REMOVE', () => { Act().doSys('unline', { sys: s.id, line: sl.id }, 'remove'); G.sel = null; }, { tip: 'REMOVE THE WHOLE LINE (50% REFUND).' });
      yy += 39;
    }
    // garrison & military
    D.rect(ctx, x + 4, yy, pw - 8, 1, 3); yy += 3;
    const g = s.gar;
    row('SOLDIERS', g.n + (g.vet >= 0.33 ? ' VET ' + Math.floor(g.vet * 3) : '') + (s.train.q ? ' (+' + s.train.q + ')' : ''), 7, 'SOLDIERS HERE. THEY GAIN VETERANCY OVER TIME AND IN BATTLE (UP TO +' + Math.round(f.mods.vetBonus * 100) + '% STRENGTH). NEW RECRUITS START AT ZERO.');
    row('WARSHIPS / PLATFORMS', g.ships + ' / ' + s.plat.n, 7, 'WARSHIPS: ONE-TIME COST, NO SALARY, ' + C.equip.shipPower + ' STRENGTH, MOVE WITH ARMIES. PLATFORMS: ' + C.equip.platformPower + ' STRENGTH, DEFENCE ONLY. BOTH WEAR DOWN.');
    row('DEFENCE', Math.round(S.defStrength(run, s)), 13, 'TOTAL DEFENDING STRENGTH, INCLUDING THE DEFENDER BONUS.');
    if (own) {
      const bw = Math.floor((pw - 20) / 3);
      G.button(ctx, x + 6, yy, bw, 12, 'RECRUIT', () => Act().recruit(s.id), { primary: AS.Tutorial && AS.Tutorial.want('recruit'), tip: 'TRAIN 5 SOLDIERS (' + C.army.trainTime + ' S EACH). +' + Math.round(S.salaryFor(run, f, S.soldiers(run, 0) + 5) - S.salary(run, f)) + ' CR SALARY PER CYCLE.' });
      G.button(ctx, x + 8 + bw, yy, bw, 12, 'SHIP ' + S.price(run, f, 'ship'), () => Act().doSys('ship', { sys: s.id }, 'build'), { tip: 'BUILD A WARSHIP: ' + Math.round(C.equip.shipPower * f.mods.shipPower) + ' STRENGTH, NO SALARY.' });
      G.button(ctx, x + 10 + bw * 2, yy, bw, 12, 'PLAT ' + S.price(run, f, 'plat'), () => Act().doSys('plat', { sys: s.id }, 'build'), { disabled: s.plat.n >= C.equip.maxPlatforms, tip: 'BUILD A DEFENCE PLATFORM: ' + Math.round(C.equip.platformPower * f.mods.platPower) + ' DEFENCE STRENGTH HERE.' });
      yy += 15;
      G.button(ctx, x + 6, yy, pw - 12, 11, 'AUTO-REPAIR ' + (f.autoRepair ? 'ON' : 'OFF'), () => Act().doSys('autorepair', { on: !f.autoRepair }, 'click'), { active: f.autoRepair, tip: 'EMPIRE-WIDE: AT EACH CYCLE, REPAIR ANYTHING UNDER ' + C.dur.autoRepairAt + '% IF YOU CAN AFFORD IT. SHOWN AS REPAIRS IN THE NET FORECAST.' });
      yy += 14;
    }
    // building condition list
    const bl = S.buildings(run, s).filter(b => b.dur < 100).sort((a, b) => a.dur - b.dur).slice(0, Math.max(0, Math.floor((y0 + h - yy - 4) / 8)));
    for (const b of bl) {
      const nm = { station: 'FACTORY', ext: AS.RES[s.planets[b.idx] ? s.planets[b.idx].type : 'ore'].name + ' EXTRACTOR', line: 'LINE ' + (b.idx + 1), fleet: 'FREIGHTERS', plat: 'PLATFORMS', ships: 'WARSHIPS' }[b.kind];
      TS(ctx, nm, x + 6, yy, b.dur <= 0 ? 17 : 6);
      D.bar(ctx, x + pw - 50, yy, 30, 6, b.dur / 100, b.dur < 25 ? 17 : b.dur < 50 ? 18 : 22);
      if (own) G.btns.push({ x: x + pw - 18, y: yy - 1, w: 14, h: 8, fn: () => Act().doSys('repair', { sys: s.id, kind: b.kind, idx: b.idx }, 'repair') });
      if (own) TS(ctx, 'FIX', x + pw - 17, yy, 13);
      G.tip(x, yy - 1, pw, 8, nm + ': ' + Math.round(b.dur) + '% DURABILITY. REPAIR: ' + S.repairCost(run, f, b) + ' CR.');
      yy += 8;
    }
  };

  /* ---------- ticker (bottom strip) ---------- */
  H.drawTicker = function (ctx, run) {
    const y = G.mapBottom();
    D.rect(ctx, 0, y, G.W, G.TICKER_H, 1); D.rect(ctx, 0, y, G.W, 1, 3);
    const last = run.log[run.log.length - 1];
    const hint = G.view === 'system' ? 'CLICK A PLANET: BUILD EXTRACTOR.  DRAG STATION > PLANET > PLANET: SUPPLY LINE.  ESC: GALAXY' : 'CLICK YOUR SYSTEM: OPEN IT.  DRAG FROM IT TO A NEIGHBOUR: MOVE OR ATTACK.  SPACE: PAUSE';
    if (last && run.t - last.t < 12) TS(ctx, U.fmtTime(last.t) + '  ' + last.text, 4, y + 3, last.k === 'bad' ? 17 : last.k === 'good' ? 22 : last.k === 'warn' ? 13 : 7);
    else TS(ctx, hint, 4, y + 3, 5);
  };
  H.drawToast = function (ctx, y) {
    const t = G.toast;
    if (!t) return;
    const w = D.tw(t.text) + 14, x = Math.round(G.W / 2 - w / 2);
    D.rect(ctx, x + 1, y + 1, w, 11, 0);
    D.frame(ctx, x, y, w, 11, 1, t.col);
    TS(ctx, t.text, G.W / 2, y + 3, t.col, 'center');
  };
  H.drawNotices = function (ctx, dt) {
    let y = G.mapBottom() - 30;
    for (const n of G.notices) {
      n.t -= dt;
      const k = U.clamp(Math.min(n.t, n.max - n.t) * 4, 0, 1);
      const w = Math.max(D.tw(n.text), D.tw(n.title)) + 14, x = Math.round(G.W - w - 4 + (1 - k) * 40);
      D.plate(ctx, x, y, w, 22, 1);
      TS(ctx, n.title, x + 6, y + 5, 12); T(ctx, n.text, x + 6, y + 12, 31);
      y -= 25;
    }
    G.notices = G.notices.filter(n => n.t > 0);
  };
})(globalThis.AS = globalThis.AS || {});
