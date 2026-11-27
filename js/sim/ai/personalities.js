/* ATLAS SYNDICATE v7 — sim/ai/personalities.js
   A personality is nothing but a set of weights on the shared scoring in ai/brain.js.
   There are no per-personality scripts: the Warlord and the Turtle run exactly the same code. */
(function (AS) {
  'use strict';

  /* aggr       how much attacking is worth at all             edge        extra power wanted over the defender (0.3 = 130%)
     neutral    value of taking independent systems            war         value of taking rival systems
     strongest  bonus for the strongest neighbour (only with a clear edge)
     weak       bonus for weakened / lightly held targets      punish      bonus for hitting whoever attacked us
     buy        value of buying neutral systems                econ        value of economic building
     army       share of spare money spent on the military     safety      garrison kept vs visible threat
     heavy      preference for big units (cannons) over ships  late        extra aggression after minute 18
     hold       seconds an army waits, massed, before it strikes (readable intent)
     minGar     smallest power left behind in a system */
  AS.PERSONALITIES = {
    warlord: {
      aggr: 1.5, edge: 0.15, neutral: 1.2, war: 1.3, strongest: 1.3, weak: 1.6, punish: 1.2, buy: 0.35, econ: 1.0,
      army: 0.7, safety: 0.8, heavy: 0.8, late: 0.3, hold: 8, minGar: 4,
    },
    merchant: {
      aggr: 0.55, edge: 0.45, neutral: 0.9, war: 0.9, strongest: 0.6, weak: 1.1, punish: 1.8, buy: 1.3, econ: 1.3,
      army: 0.45, safety: 1.05, heavy: 0.5, late: 0.8, hold: 10, minGar: 6,
    },
    turtle: {
      aggr: 1.1, edge: 0.3, neutral: 1.4, war: 1.0, strongest: 0.5, weak: 1.3, punish: 2.6, buy: 1.2, econ: 1.3,
      army: 0.6, safety: 1.25, heavy: 1.0, late: 1.0, hold: 9, minGar: 8,
    },
    opportunist: {
      aggr: 1.2, edge: 0.25, neutral: 1.0, war: 1.1, strongest: 0.7, weak: 2.3, punish: 1.2, buy: 0.4, econ: 1.1,
      army: 0.6, safety: 0.95, heavy: 0.6, late: 0.4, hold: 6, minGar: 5,
    },
    raider: {
      aggr: 1.3, edge: 0.2, neutral: 1.2, war: 1.05, strongest: 0.8, weak: 1.7, punish: 1.1, buy: 0.45, econ: 1.1,
      army: 0.62, safety: 0.9, heavy: 0.4, late: 0.4, hold: 5, minGar: 4,
    },
    // the player's slot when an AI plays it (?demo, F9, tournament)
    balanced: {
      aggr: 1.0, edge: 0.25, neutral: 1.0, war: 1.0, strongest: 1.0, weak: 1.3, punish: 1.4, buy: 0.6, econ: 1.1,
      army: 0.55, safety: 1.05, heavy: 0.7, late: 0.5, hold: 6, minGar: 5,
    },
  };
})(globalThis.AS = globalThis.AS || {});
