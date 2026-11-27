/* ATLAS SYNDICATE v7 — ui/actions.js
   What happens when the player does something: the sim action (through S.act, like every rival) plus
   feedback. Navigation between the three views, settings, achievements and autosave. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, Store = AS.Store, C = AS.CONFIG;
  const Act = AS.Act = {};

  /* ---------- settings ---------- */
  const DEFAULTS = { uiScale: 0, shake: true, tips: true, music: 0.6, sfx: 0.8, mute: false, tipsSet: false, panelOpen: true };
  Act.loadSettings = function () {
    const s = Object.assign({}, DEFAULTS, Store.get('settings', {}) || {});
    if (!s.uiScale) s.uiScale = G.defaultUiScale();
    if (!s.tipsSet) s.tips = !Store.get('tutorialDone', false);
    G.settings = s;
    G.panelOpen = s.panelOpen !== false;
  };
  Act.saveSettings = function () { Store.set('settings', G.settings); if (AS.Sfx) AS.Sfx.applyVolumes(); };

  const REASONS = {
    notyours: 'NOT YOURS', invalid: 'NOT POSSIBLE', slot: 'NO SUCH SLOT', slotused: 'SLOT IN USE', drilled: 'ALREADY DRILLED', notext: 'ONLY EXTRACTORS DRILL',
    path: 'THE DRILL MUST RUN CELL BY CELL FROM THE SHAFT', barrier: 'BARRIERS CANNOT BE DRILLED: GO AROUND', nodeposit: 'END THE DRILL ON A MATCHING DEPOSIT',
    fromext: 'DRAG FROM AN ICE DRILL, A FUEL PUMP OR A PORT', direct: 'GOLD MINES NEED NO CONVEYOR: GOLD GOES STRAIGHT TO YOUR STOCK', connected: 'ALREADY CONNECTED: REMOVE THE OLD CONVEYOR FIRST',
    toproc: 'CONNECT TO A WATER PLANT OR A REFINERY', wrongres: 'THAT PROCESSOR TAKES ANOTHER RESOURCE',
    noport: 'NO SUCH PORT', linked: 'ALREADY LINKED', pathways: 'NO FREE PATHWAY: ' + C.econ.maxPathways + ' PER SYSTEM', maxed: 'ALREADY AT THE TOP LEVEL',
    nothing: 'NOTHING TO SELL', notneutral: 'ONLY INDEPENDENT SYSTEMS CAN BE BOUGHT',
    notadjacent: 'MUST BE NEXT TO ONE OF YOUR SYSTEMS', protected: 'ATTACKS OPEN AT 4:00',
    nopath: 'NO LANE ROUTE THROUGH YOUR SYSTEMS', empty: 'NO UNITS THERE: BUY SOME IN THE SHOP', same: 'PICK ANOTHER SYSTEM',
    truce: 'COALITION TRUCE: ONLY THE LEADER MAY BE ATTACKED', sanction: 'THE COALITION BLOCKS YOUR PURCHASES', inactive: '',
  };
  Act.fail = function (res) {
    const t = res.reason === 'cost' && res.cost !== undefined ? 'NEED $' + Math.ceil(res.cost) + ' (YOU HAVE $' + Math.floor(G.run ? G.run.factions[0].money : 0) + '). SELL GOLD FOR MORE' : (REASONS[res.reason] !== undefined ? REASONS[res.reason] : 'CANNOT DO THAT');
    if (t) G.showToast(t, 17);
    AS.Sfx.play('err');
  };
  Act.can = () => G.run && G.mode === 'play' && !G.run.over && G.run.phase === 'play';
  Act.doIt = function (name, args, sound) {
    if (!Act.can()) return { ok: false };
    const res = S.act(G.run, 0, name, args);
    if (res.ok) { if (sound) AS.Sfx.play(sound); AS.FX.consume(G.run, true); }
    else Act.fail(res);
    return res;
  };

  /* ---------- navigation: galaxy > system > planet ---------- */
  Act.openSystem = function (id) {
    const s = G.run && G.run.systems[id];
    if (!s || s.owner !== 0) return;
    G.view = 'system'; G.sysId = id; G.planet = -1; G.sel = null; G.order = null; G.drag = null;
    AS.Sfx.play('click');
  };
  Act.openPlanet = function (pi) {
    const s = G.run && G.run.systems[G.sysId];
    if (!s || !s.planets[pi]) return;
    G.view = 'planet'; G.planet = pi; G.sel = null; G.drag = null;
    AS.Sfx.play('click');
  };
  Act.back = function () {
    if (G.view === 'planet') { G.view = 'system'; G.sel = { planet: G.planet }; G.planet = -1; G.drag = null; AS.Sfx.play('click'); return; }
    Act.toGalaxy(true);
  };
  Act.toGalaxy = function (sound) {
    if (G.view === 'galaxy') return;
    const s = G.run && G.run.systems[G.sysId];
    G.view = 'galaxy'; G.planet = -1; G.sel = s ? { sys: s.id } : null; G.drag = null;
    if (s) G.focusOn(s.x, s.y);
    if (sound) AS.Sfx.play('click');
  };

  /* ---------- planet actions ---------- */
  Act.build = function (sys, pi, slot, kind) {
    const r = Act.doIt('build', { sys, planet: pi, slot, kind });
    if (r.ok) G.sel = { bld: r.bld.id };
    return r;
  };
  Act.drill = function (sys, pi, bld, path) {
    const r = Act.doIt('drill', { sys, planet: pi, bld, path }, 'drill');
    if (r.ok) {
      const b = S.bldById(G.run.systems[sys].planets[pi], bld), R = AS.RES[AS.BLD[b.kind].res];
      G.showToast('DRILLED FOR $' + r.cost + (R.proc ? ' - NOW DRAG IT ONTO A ' + AS.BLD[R.proc].name + ' OR A PORT' : ' - GOLD WILL ARRIVE EVERY CYCLE'), 13);
    }
    return r;
  };
  Act.connect = function (sys, pi, from, to) {
    const r = Act.doIt('connect', { sys, planet: pi, from, to }, 'route');
    if (r.ok) G.showToast('CONNECTED', 22);
    return r;
  };
  Act.pathway = function (sys, a, b) {
    const r = Act.doIt('pathway', { sys, a, b }, 'route');
    if (r.ok) G.showToast('PATHWAY OPEN: BOTH PLANETS NOW HAVE A PORT', 13);
    return r;
  };
  Act.upgradeBld = function (sys, pi, id) { return Act.doIt('upgrade', { sys, planet: pi, bld: id }); };

  /* ---------- the shop: market and military ---------- */
  Act.openShop = function (sysId, tab) {
    if (!Act.can()) return;
    const run = G.run;
    if (sysId !== undefined && sysId >= 0 && run.systems[sysId].owner === 0) G.shopSys = sysId;
    else if (G.view !== 'galaxy' && run.systems[G.sysId] && run.systems[G.sysId].owner === 0) G.shopSys = G.sysId;
    else if (G.sel && G.sel.sys !== undefined && run.systems[G.sel.sys].owner === 0) G.shopSys = G.sel.sys;
    if (!(G.shopSys >= 0 && run.systems[G.shopSys] && run.systems[G.shopSys].owner === 0)) G.shopSys = run.factions[0].capital;
    G.order = null; G.drag = null;
    AS.Screens.open('shop', { tab: tab || 'market' });
    AS.Sfx.play('click');
  };
  Act.trade = function (res, qty) {
    const r = Act.doIt('trade', { res, qty });
    if (r.ok) G.showToast((r.qty < 0 ? 'SOLD ' + -r.qty + ' ' + AS.STOCK[res].name + ' FOR $' + Math.round(r.money) : 'BOUGHT ' + r.qty + ' ' + AS.STOCK[res].name + ' FOR $' + Math.round(-r.money)), r.qty < 0 ? 22 : 13);
    return r;
  };
  Act.sellAllGold = function () { const g = Math.floor(G.run.factions[0].gold); if (g >= 1) Act.trade('gold', -g); else Act.fail({ reason: 'nothing' }); };
  Act.buyUnits = function (sysId, kind, n) {
    const r = Act.doIt('units', { sys: sysId, kind, n });
    if (r.ok) G.showToast(n + ' ' + (n === 1 ? AS.UNITS[kind].name : AS.UNITS[kind].short) + ' AT ' + G.run.systems[sysId].name + ': +' + n * AS.UNITS[kind].power + ' POWER', 22);
    return r;
  };
  Act.togglePanel = function () { G.panelOpen = !G.panelOpen; G.panelScroll = 0; AS.Sfx.play('click'); if (G.settings) { G.settings.panelOpen = G.panelOpen; Act.saveSettings(); } };

  /* ---------- military ---------- */
  Act.buy = function (sysId) { const r = Act.doIt('buy', { sys: sysId }, 'claim'); if (r.ok) { G.showToast('SYSTEM BOUGHT - $' + r.cost, 13); G.sel = { sys: sysId }; } };
  Act.prepareOrder = function (from, to) {
    const run = G.run, a = run.systems[from], b = run.systems[to];
    if (!a || !b || a.owner !== 0 || from === to) return;
    if (!S.path(run, from, to, 0)) { Act.fail({ reason: 'nopath' }); return; }
    if (S.unitCount(a.gar) <= 0) { Act.fail({ reason: 'empty' }); return; }
    G.order = { from, to, frac: 1 };
    G.sel = null;
    AS.Sfx.play('click');
  };
  Act.sendOrder = function () {
    const o = G.order;
    if (!o) return;
    const hostile = G.run.systems[o.to].owner !== 0;
    const r = Act.doIt('move', { from: o.from, to: o.to, frac: o.frac });
    if (r.ok) { G.order = null; G.showToast(hostile ? 'ATTACK LAUNCHED: ' + Math.round(S.armyPower(G.run, r.army)) + ' POWER' : 'FLEET ON THE MOVE', hostile ? 18 : 13); AS.Sfx.play(hostile ? 'charge' : 'depart'); }
  };

  Act.toggleTips = function () {
    G.settings.tips = !G.settings.tips; G.settings.tipsSet = true; Act.saveSettings();
    AS.Sfx.play('click');
    G.showToast(G.settings.tips ? 'TIPS ON - HOVER ANYTHING FOR AN EXPLANATION' : 'TIPS OFF', 13);
  };
  Act.togglePause = function () { if (G.mode !== 'play') return; G.paused = !G.paused; AS.Sfx.play('click'); };
  Act.setSpeed = function (s) { if (G.mode !== 'play') return; G.speed = s; G.paused = false; AS.Sfx.play('click'); };
  Act.toggleMute = function () { G.settings.mute = !G.settings.mute; Act.saveSettings(); if (!G.settings.mute) AS.Sfx.play('click'); };
  Act.openPause = function () { if (G.mode === 'play' && G.run && !G.run.over && !G.screen) { G.drag = null; G.pan = null; G.order = null; AS.Screens.open('pause'); Act.autosave(); } };

  /* ---------- autosave ---------- */
  Act.autosave = function () {
    const run = G.run;
    if (!run || G.mode !== 'play' || run.over || run.phase !== 'play' || run.noSave || run.presented) return;
    try { Store.set('save', { v: AS.SAVE_VERSION, at: Date.now(), data: S.serialize(run) }); } catch (e) { /* storage full: ignore */ }
  };
  Act.clearSave = () => Store.remove('save');
  Act.hasSave = function () {
    const k = Store.prefix + 'save';
    try { if (globalThis.localStorage) return globalThis.localStorage.getItem(k) !== null; } catch (e) { /* fall through */ }
    return k in Store.mem;
  };
  Act.savedRun = function () {
    const s = Store.get('save', null);
    if (!s || s.v !== AS.SAVE_VERSION || !s.data) return null;
    try { const run = S.deserialize(s.data); return run.over ? null : { run, at: s.at }; } catch (e) { return null; }
  };
  /** Saves from older versions cannot be loaded: remove them and say so once. */
  Act.discardOldSaves = function () {
    let found = false;
    try {
      const ls = globalThis.localStorage, old = [];
      for (let i = 0; ls && i < ls.length; i++) { const k = ls.key(i); if (/^atlas[1-6]\./.test(k)) { if (/save$/.test(k)) found = true; old.push(k); } }
      for (const k of old) ls.removeItem(k);
    } catch (e) { /* storage blocked */ }
    return found;
  };
  Act.deleteSaves = function () { Act.clearSave(); Act.discardOldSaves(); G.saveInfo = null; };

  /* ---------- achievements ---------- */
  Act.achievements = () => Store.get('ach', {}) || {};
  function unlock(id) {
    const got = Act.achievements();
    if (got[id]) return;
    got[id] = Date.now();
    Store.set('ach', got);
    const a = AS.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    G.notices.push({ title: 'ACHIEVEMENT', text: a.name, t: 5, max: 5 });
    AS.Sfx.play('achievement');
  }
  Act.checkAchievements = function (run, final) {
    if (!run || G.attract || run.slot0 || run.presented) return;
    const f = run.factions[0], st = f.stats, own = S.ownSystems(run, 0);
    if (st.sold > 0) unlock('gold');
    if (st.waterMade > 0) unlock('water');
    if (st.foodMade > 0 && f.hungry === 0 && S.workers(run, 0) >= 6) unlock('farm');
    if (own.some(s => { const fl = S.sysFlow(run, s); return s.pathways.some(pw => fl.P[pw.id] && (fl.P[pw.id].ab + fl.P[pw.id].ba) > 0); })) unlock('port');
    if (own.some(s => s.planets.some(p => p.blds.some(b => b.lvl >= AS.CONFIG.upgrade.max)))) unlock('upgrade');
    if (st.captured > 0) unlock('conquer');
    if (st.bought > 0) unlock('buyer');
    if (run.battleLog.some(b => b.def === 0 && b.att > 0 && b.winner === 0)) unlock('hold');
    if (st.eliminated > 0) unlock('capital');
    if (st.coalitions > 0) unlock('coalition');
    if (own.length >= 8) unlock('eight');
    if (S.militaryPower(run, 0) >= 200) unlock('power200');
    if (final && run.winner === 0) {
      unlock('win');
      if (run.diff === 'hard') unlock('winhard');
      if (run.factions.filter(x => x.alive).length === 1) unlock('sweep');
    }
  };
})(globalThis.AS = globalThis.AS || {});
