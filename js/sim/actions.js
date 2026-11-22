/* ATLAS SYNDICATE v5 — sim/actions.js
   The single entry point for every order, used identically by the player's UI, every AI rival, the
   test bots and replays: S.act(run, factionId, name, args) -> {ok, reason}. Logged for replays. */
(function (AS) {
  'use strict';

  const S = AS.S;

  S.ACTIONS = ['ext', 'line', 'unline', 'trim', 'fr', 'buyfr', 'repair', 'repairall', 'recruit', 'cancel', 'ship', 'plat', 'move', 'buy', 'retreat', 'card', 'autorepair'];

  S.act = function (run, fid, name, a) {
    a = a || {};
    const f = run.factions[fid];
    if (!f || !f.alive || run.over || run.phase !== 'play') return { ok: false, reason: 'inactive' };
    let res;
    switch (name) {
      case 'ext': res = S.buildExtractor(run, fid, a.sys, a.planet); break;
      case 'line': res = S.drawLine(run, fid, a.sys, a.a, a.b); break;
      case 'unline': res = S.removeLine(run, fid, a.sys, a.line); break;
      case 'trim': res = S.trimLine(run, fid, a.sys, a.line); break;
      case 'fr': res = S.lineFreighter(run, fid, a.sys, a.line, a.d); break;
      case 'buyfr': res = S.buyFreighter(run, fid, a.sys); break;
      case 'repair': res = S.repair(run, fid, a.sys, a.kind, a.idx); break;
      case 'repairall': res = S.repairAll(run, fid, a.sys); break;
      case 'recruit': res = S.recruit(run, fid, a.sys, a.n); break;
      case 'cancel': res = S.cancelRecruit(run, fid, a.sys); break;
      case 'ship': res = S.buyShip(run, fid, a.sys); break;
      case 'plat': res = S.buyPlatform(run, fid, a.sys); break;
      case 'move': res = S.sendArmy(run, fid, a.from, a.to, a.frac, a.mode); break;
      case 'buy': res = S.buySystem(run, fid, a.sys); break;
      case 'retreat': res = S.retreat(run, fid, a.battle); break;
      case 'card': res = S.pickCard(run, fid, a.key); break;
      case 'autorepair': f.autoRepair = !!a.on; res = { ok: true }; break;
      default: res = { ok: false, reason: 'unknown' };
    }
    if (!res) res = { ok: false, reason: 'invalid' };
    if (res.ok && run.actions && fid === 0) run.actions.push([run.steps, name, a]);
    return res;
  };
})(globalThis.AS = globalThis.AS || {});
