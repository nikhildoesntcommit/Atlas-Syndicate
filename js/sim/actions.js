/* ATLAS SYNDICATE v7 — sim/actions.js
   The single entry point for every order, used identically by the player's UI, every AI rival, the
   test bots and replays: S.act(run, factionId, name, args) -> {ok, reason}. Logged for replays. */
(function (AS) {
  'use strict';

  const S = AS.S;

  S.ACTIONS = ['build', 'drill', 'connect', 'disconnect', 'demolish', 'upgrade', 'pathway', 'unpath', 'trade', 'units', 'move', 'buy'];

  S.act = function (run, fid, name, a) {
    a = a || {};
    const f = run.factions[fid];
    if (!f || !f.alive || run.over || run.phase !== 'play') return { ok: false, reason: 'inactive' };
    let res;
    switch (name) {
      case 'build': res = S.placeBuilding(run, fid, a.sys, a.planet, a.slot, a.kind); break;
      case 'drill': res = S.drill(run, fid, a.sys, a.planet, a.bld, a.path); break;
      case 'connect': res = S.connect(run, fid, a.sys, a.planet, a.from, a.to); break;
      case 'disconnect': res = S.disconnect(run, fid, a.sys, a.planet, a.from); break;
      case 'demolish': res = S.demolish(run, fid, a.sys, a.planet, a.bld); break;
      case 'upgrade': res = S.upgradeBuilding(run, fid, a.sys, a.planet, a.bld); break;
      case 'pathway': res = S.openPathway(run, fid, a.sys, a.a, a.b); break;
      case 'unpath': res = S.closePathway(run, fid, a.sys, a.pathway); break;
      case 'trade': res = S.trade(run, fid, a.res, a.qty); break;
      case 'units': res = S.buyUnits(run, fid, a.sys, a.kind, a.n); break;
      case 'move': res = S.sendArmy(run, fid, a.from, a.to, a.frac); break;
      case 'buy': res = S.buySystem(run, fid, a.sys); break;
      default: res = { ok: false, reason: 'unknown' };
    }
    if (!res) res = { ok: false, reason: 'invalid' };
    if (res.ok && run.actions && fid === 0) run.actions.push([run.steps, name, JSON.parse(JSON.stringify(a))]);
    return res;
  };
})(globalThis.AS = globalThis.AS || {});
