/* ATLAS SYNDICATE v5 — ui/actions.js
   What happens when the player does something: the sim action (through S.act, like every rival)
   plus feedback. Also settings, achievements and autosave. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, Store = AS.Store, C = AS.CONFIG;
  const Act = AS.Act = {};

  /* ---------- settings ---------- */
  const DEFAULTS = { uiScale: 'medium', shake: true, tips: true, music: 0.6, sfx: 0.8, mute: false, tipsSet: false };
  Act.loadSettings = function () {
    const s = Object.assign({}, DEFAULTS, Store.get('settings', {}) || {});
    if (!s.tipsSet) s.tips = !Store.get('tutorialDone', false);
    G.settings = s;
  };
  Act.saveSettings = function () { Store.set('settings', G.settings); if (AS.Sfx) AS.Sfx.applyVolumes(); };

  const REASONS = {
    notyours: 'NOT YOUR SYSTEM', invalid: 'NOT POSSIBLE', built: 'ALREADY BUILT', linked: 'ALREADY LINKED', long: 'A LINE HAS AT MOST 5 STOPS',
    slots: 'NO FREE SUPPLY LINE - GROW POPULATION OR EXTEND A LINE', credits: 'NOT ENOUGH CREDITS', maxfr: 'FREIGHTER LIMIT REACHED', none: 'NO FREIGHTER TO REMOVE',
    fine: 'NOTHING TO REPAIR', queue: 'TRAINING QUEUE FULL', maxplat: 'PLATFORM LIMIT REACHED', notneutral: 'ONLY INDEPENDENT SYSTEMS CAN BE BOUGHT',
    battle: 'A BATTLE IS ON THERE', notadjacent: 'MUST BE NEXT TO ONE OF YOUR SYSTEMS', underattack: 'UNDER ATTACK: THE GARRISON MUST FIGHT',
    protected: 'ATTACKS OPEN AT 4:00', nopath: 'NO LANE ROUTE THROUGH YOUR SYSTEMS', empty: 'NO SOLDIERS TO SEND', same: 'PICK ANOTHER SYSTEM', inactive: '',
  };
  Act.fail = function (res) {
    const t = res.reason === 'credits' && res.cost ? 'NOT ENOUGH CREDITS (' + res.cost + ' CR)' : (REASONS[res.reason] !== undefined ? REASONS[res.reason] : 'CANNOT DO THAT');
    if (t) G.showToast(t, 17);
    AS.Sfx.play('err');
  };
  Act.can = () => G.run && G.mode === 'play' && !G.run.over && G.run.phase === 'play';
  /** Run a sim action for the player; returns the result. */
  Act.do = function (name, args, sound) {
    if (!Act.can()) return { ok: false };
    const res = S.act(G.run, 0, name, args);
    if (res.ok) { if (sound) AS.Sfx.play(sound); if (AS.Tutorial) AS.Tutorial.event(name, args, res); AS.FX.consume(G.run, true); }
    else Act.fail(res);
    return res;
  };
  Act.doSys = (name, args, sound) => Act.do(name, args, sound);
  Act.recruit = function (sysId) { const r = Act.do('recruit', { sys: sysId, n: C.army.batch }); if (r.ok) G.showToast('TRAINING ' + r.n + ' SOLDIERS', 13); };
  Act.buy = function (sysId) { const r = Act.do('buy', { sys: sysId }); if (r.ok) { G.showToast('SYSTEM BOUGHT - ' + r.cost + ' CR', 13); G.sel = { sys: sysId }; } };
  Act.openSystem = function (id) {
    const s = G.run && G.run.systems[id];
    if (!s || s.owner !== 0) return;
    G.view = 'system'; G.sysId = id; G.sel = null; G.order = null; G.drag = null; G.viewT = 0;
    AS.Sfx.play('click');
    if (AS.Tutorial) AS.Tutorial.event('open', { sys: id });
  };
  Act.backToGalaxy = function () {
    if (G.view !== 'system') return;
    const s = G.run.systems[G.sysId];
    G.view = 'galaxy'; G.sel = s ? { sys: s.id } : null; G.drag = null; G.viewT = 0;
    if (s) G.focusOn(s.x, s.y);
    AS.Sfx.play('click');
    if (AS.Tutorial) AS.Tutorial.event('galaxy', {});
  };
  /** Dragged an army from one system onto another: open the order panel with odds. */
  Act.prepareOrder = function (from, to) {
    const run = G.run, a = run.systems[from], b = run.systems[to];
    if (!a || !b || a.owner !== 0 || from === to) return;
    if (a.battle) { Act.fail({ reason: 'underattack' }); return; }
    if (!S.path(run, from, to, 0)) { Act.fail({ reason: 'nopath' }); return; }
    G.order = { from, to, frac: b.owner === 0 ? 1 : 0.75 };
    G.sel = null;
    AS.Sfx.play('click');
  };
  Act.sendOrder = function (mode) {
    const o = G.order;
    if (!o) return;
    const r = Act.do('move', { from: o.from, to: o.to, frac: o.frac, mode }, null);
    if (r.ok) { G.order = null; G.showToast(mode === 'move' ? 'ARMY ON THE MOVE' : mode === 'raid' ? 'RAID LAUNCHED' : 'ATTACK LAUNCHED', mode === 'move' ? 13 : 18); AS.Sfx.play(mode === 'move' ? 'depart' : 'charge'); }
  };
  Act.retreat = function (battleId) { const r = Act.do('retreat', { battle: battleId }, 'remove'); if (r.ok) G.showToast('RETREATING - 10% LOST ON THE WAY OUT', 18); };
  Act.pickCard = function (key) {
    const r = S.act(G.run, 0, 'card', { key });
    if (r.ok) { AS.FX.consume(G.run, true); G.showToast(AS.CARDS[key].name + ' ACTIVE', 13); if (!G.run.factions[0].drafts.length) AS.Screens.close(); Act.autosave(); }
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
    if (!run || G.mode !== 'play' || run.over || run.phase !== 'play' || run.noSave) return;
    try { Store.set('save', { v: 5, at: Date.now(), data: S.serialize(run) }); } catch (e) { /* storage full: ignore */ }
  };
  Act.clearSave = () => Store.remove('save');
  /** Cheap check (no parsing) for whether a saved game exists. */
  Act.hasSave = function () {
    const k = Store.prefix + 'save';
    try { if (globalThis.localStorage) return globalThis.localStorage.getItem(k) !== null; } catch (e) { /* fall through */ }
    return k in Store.mem;
  };
  /** Settings > Saved games: delete the autosave (and anything older versions left behind). */
  Act.deleteSaves = function () {
    Act.clearSave();
    try {
      const ls = globalThis.localStorage, old = [];
      for (let i = 0; ls && i < ls.length; i++) { const k = ls.key(i); if (/^atlas[1-4]\./.test(k)) old.push(k); }
      for (const k of old) ls.removeItem(k);
    } catch (e) { /* storage blocked: nothing to clear */ }
    G.saveInfo = null;
  };
  Act.savedRun = function () {
    const s = Store.get('save', null);
    if (!s || s.v !== 5 || !s.data) return null;
    try { const run = S.deserialize(s.data); return run.over ? null : { run, at: s.at }; } catch (e) { return null; }
  };

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
    if (own.some(s => S.sysYield(run, s).pairs > 0)) unlock('chain');
    if (st.captured > 0) unlock('conquer');
    if (st.bought > 0) unlock('buyer');
    if (run.battleLog.some(b => b.def === 0 && b.att > 0 && b.winner === 0)) unlock('hold');
    if (st.raids > 0) unlock('raid');
    if (st.eliminated > 0) unlock('capital');
    if (own.length >= 8) unlock('eight');
    if (own.length >= 12) unlock('twelve');
    if (S.soldiers(run, 0) >= 100) unlock('army100');
    if (own.some(s => s.gar.n >= 10 && s.gar.vet >= 0.99)) unlock('vet');
    if (final && run.winner === 0) {
      unlock('win');
      if (run.diff === 'hard') unlock('winhard');
      if (run.factions.filter(x => x.alive).length === 1) unlock('sweep');
      if (st.deserted === 0) unlock('nodesert');
    }
  };
})(globalThis.AS = globalThis.AS || {});
