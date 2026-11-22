/* ATLAS SYNDICATE v5 — sim/ai/personalities.js
   A personality is nothing but a set of weights on the shared scoring in ai/brain.js.
   There are no per-personality scripts: the Warlord and the Turtle run exactly the same code. */
(function (AS) {
  'use strict';

  /* Weights (all multiply the same utility formulas):
     aggr       how much attacking is worth at all             odds        minimum win chance to attack
     neutral    value of taking independent systems            war         value of taking rival systems
     strongest  bonus for targeting the strongest neighbour    weak        bonus for weakened / lightly held targets
     punish     bonus for hitting whoever attacked us          raid        share of rival attacks done as raids
     buy        value of buying neutral systems                econ        value of economic building
     army       share of income spent on salaries              safety      garrison kept vs visible threat
     plat       value of defence platforms (more at chokepoints) ship      value of warships
     retreat    pull out when live odds fall below this        late        extra aggression after minute 18
     hold       seconds an army waits, massed, before it strikes (readable intent)
     cards      weight per card category                       minGar      smallest garrison left behind */
  AS.PERSONALITIES = {
    warlord: {
      aggr: 1.6, odds: 0.64, neutral: 0.9, war: 1.5, strongest: 1.6, weak: 1.0, punish: 1.2, raid: 0.05, buy: 0.15, econ: 1.1,
      army: 0.7, safety: 0.8, plat: 0.25, ship: 0.9, retreat: 0.22, late: 0.15, hold: 8, minGar: 3,
      cards: { econ: 0.8, mil: 1.6, log: 1.0, def: 0.6 },
    },
    merchant: {
      aggr: 0.45, odds: 0.9, neutral: 0.8, war: 0.9, strongest: 0.6, weak: 1.1, punish: 1.8, raid: 0.0, buy: 1.0, econ: 1.1,
      army: 0.5, safety: 1.05, plat: 0.6, ship: 1.3, retreat: 0.42, late: 0.6, hold: 10, minGar: 4,
      cards: { econ: 1.7, mil: 0.9, log: 1.1, def: 0.9 },
    },
    turtle: {
      aggr: 0.45, odds: 0.8, neutral: 0.75, war: 0.7, strongest: 0.5, weak: 1.0, punish: 2.6, raid: 0.0, buy: 0.6, econ: 1.2,
      army: 0.6, safety: 1.45, plat: 1.9, ship: 0.6, retreat: 0.38, late: 0.35, hold: 10, minGar: 6,
      cards: { econ: 1.0, mil: 0.8, log: 0.7, def: 1.9 },
    },
    opportunist: {
      aggr: 1.2, odds: 0.67, neutral: 1.0, war: 1.1, strongest: 0.7, weak: 2.3, punish: 1.2, raid: 0.1, buy: 0.4, econ: 1.25,
      army: 0.62, safety: 0.95, plat: 0.4, ship: 0.8, retreat: 0.34, late: 0.3, hold: 6, minGar: 4,
      cards: { econ: 1.0, mil: 1.2, log: 1.3, def: 0.8 },
    },
    raider: {
      aggr: 1.25, odds: 0.67, neutral: 1.0, war: 1.0, strongest: 0.8, weak: 1.6, punish: 1.1, raid: 0.85, buy: 0.3, econ: 1.1,
      army: 0.62, safety: 0.85, plat: 0.3, ship: 0.7, retreat: 0.5, late: 0.25, hold: 5, minGar: 3,
      cards: { econ: 0.9, mil: 1.2, log: 1.5, def: 0.7 },
    },
    // the player's slot when an AI plays it (?demo, F9, tournament): middle of the road on everything
    balanced: {
      aggr: 1.0, odds: 0.68, neutral: 1.0, war: 1.0, strongest: 1.0, weak: 1.3, punish: 1.4, raid: 0.1, buy: 0.7, econ: 1.0,
      army: 0.6, safety: 1.05, plat: 0.7, ship: 0.9, retreat: 0.34, late: 0.4, hold: 6, minGar: 4,
      cards: { econ: 1.1, mil: 1.1, log: 1.0, def: 1.0 },
    },
  };
  // pairs that make each other stronger; the AI values a card more when it already holds its partner
  AS.CARD_SYNERGY = [
    ['cadre', 'wages'], ['cadre', 'hardened'], ['wages', 'sergeants'], ['guns', 'warfound'], ['grid', 'cheapplat'],
    ['grid', 'fortress'], ['extraline', 'fastfr'], ['deepcore', 'foundry'], ['hydro', 'taxes'], ['drives', 'shock'], ['tough', 'hulls'],
  ];
})(globalThis.AS = globalThis.AS || {});
