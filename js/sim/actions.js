/* ATLAS SYNDICATE v6 — sim/actions.js
   The single entry point for every order, used identically by the player's UI, every AI rival, the
   test bots and replays: S.act(run, factionId, name, args) -> {ok, reason}. Logged for replays. */
(function (AS) {
  'use strict';

  const S = AS.S;

  S.ACTIONS = ['build', 'drill', 'connect', 'disconnect', 'demolish', 'pathway', 'unpath', 'repair', 'recruit', 'cancel', 'ship', 'plat', 'move', 'buy', 'retreat', 'upgrade', 'autorepair'];

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
      case 'pathway': res = S.openPathway(run, fid, a.sys, a.a, a.b); break;
      case 'unpath': res = S.closePathway(run, fid, a.sys, a.pathway); break;
      case 'repair': res = S.repair(run, fid, a.sys, a.kind, a.planet, a.id); break;
      case 'recruit': res = S.recruit(run, fid, a.sys, a.n); break;
      case 'cancel': res = S.cancelRecruit(run, fid, a.sys); break;
      case 'ship': res = S.buyShip(run, fid, a.sys); break;
      case 'plat': res = S.buyPlatform(run, fid, a.sys); break;
      case 'move': res = S.sendArmy(run, fid, a.from, a.to, a.frac, a.mode); break;
      case 'buy': res = S.buySystem(run, fid, a.sys); break;
      case 'retreat': res = S.retreat(run, fid, a.battle); break;
      case 'upgrade': res = S.buyUpgrade(run, fid, a.track); break;
      case 'autorepair': f.autoRepair = !!a.on; res = { ok: true }; break;
      default: res = { ok: false, reason: 'unknown' };
    }
    if (!res) res = { ok: false, reason: 'invalid' };
    if (res.ok && run.actions && fid === 0) run.actions.push([run.steps, name, JSON.parse(JSON.stringify(a))]);
    return res;
  };
})(globalThis.AS = globalThis.AS || {});
