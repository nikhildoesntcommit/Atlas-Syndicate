/* ATLAS SYNDICATE v5 — sim/cards.js
   Upgrade-card drafts: every 3 minutes, and after capturing a rival's system, a faction picks one of
   three cards. Same pool and same rules for the player and every rival. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S;

  S.cardAvailable = (f, key) => AS.CARDS[key].stack || f.cards.indexOf(key) < 0;
  S.makeOffers = function (run, f, n) {
    const pool = AS.CARD_KEYS.filter(k => S.cardAvailable(f, k));
    // never offer three cards of the same category: shuffle, then prefer variety
    U.shuffle(run.rng, pool);
    const out = [], cats = {};
    for (const k of pool) { const c = AS.CARDS[k].cat; if (!cats[c]) { out.push(k); cats[c] = 1; } if (out.length >= n) break; }
    for (const k of pool) { if (out.length >= n) break; if (out.indexOf(k) < 0) out.push(k); }
    return out.slice(0, n);
  };
  S.queueDraft = function (run, f, why) {
    if (!f.alive) return;
    if (f.drafts.length >= 3) return;   // never let them pile up forever
    f.drafts.push({ why, offers: S.makeOffers(run, f, 3), t: run.t });
    if (f.id === 0) run.fx.push({ type: 'draft', owner: 0, why });
  };
  S.pickCard = function (run, fid, key) {
    const f = run.factions[fid];
    const d = f && f.drafts[0];
    if (!d || d.offers.indexOf(key) < 0) return { ok: false, reason: 'nooffer' };
    f.drafts.shift();
    f.cards.push(key);
    S.recomputeMods(run, f);
    if (key === 'bonds') f.credits += 600;
    if (key === 'mercs') {
      const cap = run.systems.find(s => s.capital === fid && s.owner === fid) || run.systems.find(s => s.owner === fid);
      if (cap) { const g = cap.gar; g.vet = U.safeDiv(g.vet * g.n, g.n + 15, 0); g.n += 15; }
    }
    run.fx.push({ type: 'card', owner: fid, key });
    if (fid === 0) S.logMoment(run, 'CARD: ' + AS.CARDS[key].name, 'perk', 0);
    return { ok: true };
  };
  S.stepCards = function (run) {
    if (run.t < run.nextCard) return;
    run.nextCard += C.game.cardEvery;
    for (const f of run.factions) if (f.alive) S.queueDraft(run, f, 'timer');
  };
})(globalThis.AS = globalThis.AS || {});
