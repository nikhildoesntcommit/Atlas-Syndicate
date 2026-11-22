/* ATLAS SYNDICATE v4 — ui/actions.js
   What happens when the player does something: sim action + feedback. Also settings,
   achievements, autosave and the local leaderboard. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, Store = AS.Store, C = AS.CONFIG;
  const Act = AS.Act = {};

  /* ---------- settings ---------- */
  const DEFAULTS = { uiScale: 'large', shake: true, tips: true, music: 0.6, sfx: 0.8, mute: false, tipsSet: false };
  Act.loadSettings = function () {
    const s = Object.assign({}, DEFAULTS, Store.get('settings', {}) || {});
    // tips default on for first-time players, off for returning ones (unless chosen explicitly)
    if (!s.tipsSet) s.tips = !Store.get('onboarded', false);
    G.settings = s;
    G.name = String(Store.get('name', 'PLAYER') || 'PLAYER').slice(0, 12);
  };
  Act.saveSettings = function () { Store.set('settings', G.settings); if (AS.Sfx) AS.Sfx.applyVolumes(); };

  const REASONS = {
    same: 'PICK A DIFFERENT WORLD', unclaimed: 'CLAIM BOTH WORLDS FIRST', exists: 'ROUTE ALREADY EXISTS',
    credits: 'NOT ENOUGH CREDITS', nofreighter: 'NO IDLE FREIGHTERS', none: 'NO FREIGHTERS ON THIS ROUTE',
    deposit: 'NO SUITABLE DEPOSIT HERE', slot: 'SLOT IN USE', claimed: 'ALREADY CLAIMED', invalid: 'NOT POSSIBLE', gone: 'GONE', cooldown: 'THIS WORLD IS RECOVERING - TRY AGAIN SOON',
  };
  Act.fail = function (res) {
    G.showToast(res.reason === 'credits' && res.cost ? 'NOT ENOUGH CREDITS (' + res.cost + ' CR)' : res.reason === 'cooldown' ? 'WORLD RECOVERING: CLAIM AGAIN IN ' + res.left + 'S' : (REASONS[res.reason] || 'CANNOT DO THAT'));
    AS.Sfx.play('err');
  };
  /** Generic: run a sim action on the player's run; returns the result. */
  Act.do = function (name, args, sound) {
    if (!G.run || G.mode !== 'play' || G.run.over) return { ok: false };
    const res = S.act(G.run, name, args);
    if (res.ok) { if (sound) AS.Sfx.play(sound); if (AS.Onboard) AS.Onboard.event(name, args); }
    else Act.fail(res);
    return res;
  };
  Act.claim = b => Act.do('claim', { id: b.id });
  Act.build = function (b, slot, type) {
    const r = Act.do('build', { id: b.id, slot, type });
    if (r.ok) { G.popup = null; G.showToast(AS.FAC[type].name + ' UNDER CONSTRUCTION', 13); }
  };
  Act.demolish = function (b, slot) { const r = Act.do('demolish', { id: b.id, slot }); if (r.ok) { G.popup = null; G.showToast('DEMOLISHED +' + r.refund + ' CR', 13); } };
  Act.removeRoute = function (r) {
    const res = Act.do('unroute', { id: r.id }, 'remove');
    if (res.ok) { G.showToast('ROUTE CLOSED +' + res.refund + ' CR', 13); if (G.sel && G.sel.id === r.id) G.sel = null; }
  };
  Act.buyFreighter = function () {
    const res = Act.do('buy', {}, 'buy');
    if (res.ok) G.showToast('FREIGHTER BOUGHT - CLICK A ROUTE AND PRESS +', 13);
    return res;
  };
  Act.freighters = function (r, d) {
    if (d > 0 && !S.idleFreighters(G.run).length) {
      const res = Act.do('buy', {}, 'buy');
      if (!res.ok) return;
      G.showToast('BOUGHT A FREIGHTER FOR ' + res.cost + ' CR', 13);
    }
    Act.do(d > 0 ? 'assign' : 'recall', { id: r.id }, 'click');
  };
  Act.boost = function () {
    const res = S.act(G.run, 'boost', {});
    if (res.ok) { G.showToast('BOOST: FREIGHTERS AT DOUBLE SPEED', 13); }
    else if (res.reason === 'cooldown') { G.showToast('BOOST RECHARGING: ' + res.left + 'S', 18); AS.Sfx.play('err'); }
  };
  Act.deflect = function (b) { const r = Act.do('deflect', { id: b.id }); return r; };
  Act.toggleTips = function () {
    G.settings.tips = !G.settings.tips; G.settings.tipsSet = true; Act.saveSettings();
    AS.Sfx.play('click');
    G.showToast(G.settings.tips ? 'TIPS ON - HOVER ANYTHING FOR AN EXPLANATION' : 'TIPS OFF', 13);
  };
  Act.togglePause = function () { if (G.mode !== 'play') return; G.paused = !G.paused; AS.Sfx.play('click'); };
  Act.setSpeed = function (s) { if (G.mode !== 'play') return; G.speed = s; G.paused = false; AS.Sfx.play('click'); };
  Act.toggleMute = function () { G.settings.mute = !G.settings.mute; Act.saveSettings(); if (!G.settings.mute) AS.Sfx.play('click'); };
  Act.openPause = function () { if (G.mode === 'play' && G.run && !G.run.over && !G.screen) { G.drag = null; G.pan = null; G.popup = null; AS.Screens.open('pause'); Act.autosave(); } };

  /* ---------- autosave (resume a closed tab) ---------- */
  Act.autosave = function () {
    const run = G.run;
    if (!run || G.mode !== 'play' || G.attract || run.over || run.tutorial) return;
    try { Store.set('save', { v: 4, at: Date.now(), name: G.name, data: S.serialize(run), seen: G.seen }); } catch (e) { /* storage full: ignore */ }
  };
  Act.clearSave = () => Store.remove('save');
  Act.savedRun = function () {
    const s = Store.get('save', null);
    if (!s || s.v !== 4 || !s.data) return null;
    try { const run = S.deserialize(s.data); return run.over ? null : { run, at: s.at, seen: s.seen || {} }; } catch (e) { return null; }
  };

  /* ---------- leaderboard ---------- */
  Act.board = function () {
    const b = Store.get('board', []);
    if (!Array.isArray(b)) return [];
    return b.filter(e => e && Number.isFinite(e.score)).sort((a, c) => c.score - a.score).slice(0, 10);
  };
  Act.addToBoard = function (entry) {
    const b = Act.board();
    b.push(entry);
    b.sort((a, c) => c.score - a.score);
    const top = b.slice(0, 10);
    Store.set('board', top);
    const i = top.findIndex(e => e.id === entry.id);
    return i >= 0 ? i + 1 : null;
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
    if (G.run) S.logMoment(G.run, 'ACHIEVEMENT: ' + a.name, 'ach');
  }
  /** Checked twice a second during play and once at the end of a run. */
  Act.checkAchievements = function (run, final) {
    if (!run || G.attract || run.tutorial) return;
    const cols = S.colonies(run).length;
    if (run.stats.delivered > 0 && S.prime(run).stock && Object.values(run.stats.sold).some(v => v > 0)) unlock('first');
    if (cols >= 5) unlock('five');
    if (cols >= 8) unlock('eight');
    if (S.totalPop(run) >= 100) unlock('pop100');
    if (run.stats.sold.parts >= 100) unlock('parts');
    if (run.freighters.length >= 20) unlock('fleet20');
    if (run.bestStreak >= 5) unlock('streak5');
    if (run.contractsDone >= 10) unlock('contr10');
    if (run.totalIncome >= 100000) unlock('rich');
    if (run.comeback) unlock('comeback');
    if (run.mega.state !== 'locked' || run.sysDone) unlock('megaup');
    if (run.sysDone >= 1) unlock('warp');
    if (run.deflected >= 3) unlock('shield');
    if (run.won) {
      unlock('megadone');
      if (run.mega.completedAt < 35 * 60) unlock('speed');
      if (AS.CHARTERS[run.charter].score >= 1.15) unlock('hard');
    }
    if (run.t >= 15 * 60 && run.coloniesLost === 0 && run.contractsFailed === 0) unlock('clean');
    if (final && run.daily) unlock('daily');
  };
})(globalThis.AS = globalThis.AS || {});
