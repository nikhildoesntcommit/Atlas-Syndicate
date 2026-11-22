/* ATLAS SYNDICATE v6 — sim/ai/personalities.js
   A personality is nothing but a set of weights on the shared scoring in ai/brain.js.
   There are no per-personality scripts: the Warlord and the Turtle run exactly the same code. */
(function (AS) {
  'use strict';

  /* aggr       how much attacking is worth at all             odds        minimum win chance to attack
     neutral    value of taking independent systems            war         value of taking rival systems
     strongest  bonus for the strongest neighbour (only taken when the odds are good)
     weak       bonus for weakened / lightly held targets      punish      bonus for hitting whoever attacked us
     raid       share of rival attacks done as raids           buy         value of buying neutral systems
     econ       value of economic building                     army        share of income spent on salaries
     safety     garrison kept vs visible threat                plat / ship value of platforms / warships
     retreat    pull out when live odds fall below this        late        extra aggression after minute 18
     hold       seconds an army waits, massed, before it strikes (readable intent)
     tracks     weight per upgrade-shop track                  minGar      smallest garrison left behind */
  AS.PERSONALITIES = {
    warlord: {
      aggr: 1.5, odds: 0.64, neutral: 1.2, war: 1.3, strongest: 1.3, weak: 1.6, punish: 1.2, raid: 0.05, buy: 0.35, econ: 1.1,
      army: 0.72, safety: 0.8, plat: 0.3, ship: 0.9, retreat: 0.24, late: 0.3, hold: 8, minGar: 3,
      tracks: { ext: 0.8, proc: 0.8, log: 0.9, mil: 1.6 },
    },
    merchant: {
      aggr: 0.55, odds: 0.84, neutral: 0.9, war: 0.9, strongest: 0.6, weak: 1.1, punish: 1.8, raid: 0.0, buy: 1.3, econ: 1.25,
      army: 0.5, safety: 1.05, plat: 0.6, ship: 1.2, retreat: 0.42, late: 0.8, hold: 10, minGar: 4,
      tracks: { ext: 1.3, proc: 1.5, log: 1.1, mil: 0.7 },
    },
    turtle: {
      aggr: 1.1, odds: 0.67, neutral: 1.4, war: 1.0, strongest: 0.5, weak: 1.3, punish: 2.6, raid: 0.0, buy: 1.2, econ: 1.35,
      army: 0.66, safety: 1.2, plat: 1.2, ship: 0.7, retreat: 0.38, late: 1.0, hold: 9, minGar: 5,
      tracks: { ext: 1.0, proc: 1.0, log: 0.7, mil: 1.4 },
    },
    opportunist: {
      aggr: 1.2, odds: 0.66, neutral: 1.0, war: 1.1, strongest: 0.7, weak: 2.3, punish: 1.2, raid: 0.1, buy: 0.4, econ: 1.1,
      army: 0.64, safety: 0.95, plat: 0.4, ship: 0.8, retreat: 0.34, late: 0.4, hold: 6, minGar: 4,
      tracks: { ext: 1.0, proc: 1.0, log: 1.4, mil: 1.1 },
    },
    raider: {
      aggr: 1.3, odds: 0.66, neutral: 1.2, war: 1.05, strongest: 0.8, weak: 1.7, punish: 1.1, raid: 0.35, buy: 0.45, econ: 1.15,
      army: 0.64, safety: 0.95, plat: 0.3, ship: 0.8, retreat: 0.5, late: 0.4, hold: 5, minGar: 3,
      tracks: { ext: 0.9, proc: 0.9, log: 1.5, mil: 1.2 },
    },
    // the player's slot when an AI plays it (?demo, F9, tournament)
    balanced: {
      aggr: 1.0, odds: 0.68, neutral: 1.0, war: 1.0, strongest: 1.0, weak: 1.3, punish: 1.4, raid: 0.1, buy: 0.6, econ: 1.1,
      army: 0.6, safety: 1.05, plat: 0.7, ship: 0.9, retreat: 0.34, late: 0.5, hold: 6, minGar: 4,
      tracks: { ext: 1.1, proc: 1.1, log: 1.0, mil: 1.0 },
    },
  };
})(globalThis.AS = globalThis.AS || {});
