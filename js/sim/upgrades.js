/* ATLAS SYNDICATE v6 — sim/upgrades.js
   The upgrade shop: four tracks of five permanent upgrades (Extraction, Processing, Logistics, Military),
   bought in order with credits and alloy. Prices rise along each track. Same shop for every faction. */
(function (AS) {
  'use strict';

  const S = AS.S;

  S.upgradeNext = function (f, track) {
    const lvl = f.up[track];
    const T = AS.UPGRADES[track];
    if (!T || lvl >= T.items.length) return null;
    return { item: T.items[lvl], level: lvl, price: AS.upgPrice(lvl) };
  };
  S.buyUpgrade = function (run, fid, track) {
    const f = run.factions[fid];
    if (!AS.UPGRADES[track]) return { ok: false, reason: 'invalid' };
    const nx = S.upgradeNext(f, track);
    if (!nx) return { ok: false, reason: 'maxed' };
    if (!S.pay(f, nx.price)) return { ok: false, reason: 'cost', cost: nx.price };
    f.up[track]++;
    S.recomputeMods(run, f);
    run.fx.push({ type: 'upgrade', owner: fid, track, key: nx.item.key });
    if (fid === 0) S.logMoment(run, 'UPGRADE: ' + nx.item.name, 'perk', 0);
    return { ok: true, item: nx.item, cost: nx.price };
  };
})(globalThis.AS = globalThis.AS || {});
