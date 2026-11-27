/* ATLAS SYNDICATE — player-facing priority selector.
   Pure run-state reader shared by HUD, tutorial, and accessibility UI. */
(function (AS) {
  'use strict';
  const S = AS.S, C = AS.CONFIG;
  const has = (systems, kind, drilled) => systems.some(s => s.planets.some(p => p.blds.some(b => b.kind === kind && (!drilled || b.drill))));

  S.nextMove = function (run, fid) {
    fid = fid === undefined ? 0 : fid;
    const f = run && run.factions && run.factions[fid];
    if (!run || !f || !f.alive) return { kind: 'wait', title: 'STANDING BY', text: 'CHOOSE A NEW RUN TO BEGIN.', cta: '', action: 'none' };
    if (run.phase !== 'play') return { kind: 'home', title: 'CHOOSE A HOME', text: 'Pick a flashing arm-tip system. Every home begins on equal terms.', cta: 'CHOOSE HOME', action: 'home' };
    const own = S.ownSystems(run, fid), home = run.systems[f.capital] || own[0];
    const goHome = action => Object.assign({ sys: home && home.id }, action);
    const warning = (run.warnings || []).find(w => w.kind === 'inc') || (run.warnings || []).find(w => w.kind === 'mass');
    if (warning) return { kind: 'defend', title: 'SECURE THE BORDER', text: warning.text + '. Buy or move power to the threatened system before committing elsewhere.', cta: 'VIEW THREAT', action: 'threat', sys: warning.sys };
    const fc = S.forecast(run, f);
    if (f.hungry > 0 || fc.warn.some(w => w.res === 'food')) return goHome({ kind: 'food', title: 'KEEP CREWS FED', text: 'Food is the immediate risk. Build a greenhouse or buy food now; fed crews restore production.', cta: 'OPEN MARKET', action: 'shop', tab: 'market' });
    if (fc.warn.some(w => w.res === 'water')) return goHome({ kind: 'water', title: 'RESTORE WATER', text: 'Farms need water. Route ice into a water plant, or buy water until the line is running.', cta: 'OPEN HOME', action: 'home' });
    if (f.fuelEff < 0.999 || fc.warn.some(w => w.res === 'fuel')) return goHome({ kind: 'fuel', title: 'FUEL THE FLEET', text: 'Your fleet is fighting below full strength. Build crude-to-fuel production or buy fuel.', cta: 'OPEN MARKET', action: 'shop', tab: 'market' });
    if (!has(own, 'goldmine', true)) return goHome({ kind: 'gold', title: 'START A CASH ENGINE', text: 'Build a gold mine, drill to gold, then sell it. Credits fund every later choice.', cta: 'OPEN HOME', action: 'home' });
    if (!has(own, 'water')) return goHome({ kind: 'water', title: 'MAKE WATER', text: 'Build an ice drill and a water plant, then connect them. Water unlocks food security.', cta: 'OPEN HOME', action: 'home' });
    if (!has(own, 'greenhouse') && !has(own, 'livestock')) return goHome({ kind: 'food', title: 'SECURE FOOD', text: 'Use water in a greenhouse or livestock farm. Food keeps every machine staffed.', cta: 'OPEN HOME', action: 'home' });
    if (S.militaryPower(run, fid) < 5) return goHome({ kind: 'fleet', title: 'FIELD A FIRST FLEET', text: 'Buy at least 5 power before attacks open. Ships are cheap; destroyers build power quickly.', cta: 'BUY UNITS', action: 'shop', tab: 'units' });
    const neutral = own.flatMap(s => S.neighbours(run, s.id).map(id => run.systems[id])).find(s => s.owner === -1);
    if (neutral) return { kind: 'expand', title: 'CLAIM THE FRONTIER', text: 'Your first engine is online. Inspect a neighbouring independent system and decide whether to buy or take it.', cta: 'VIEW FRONTIER', action: 'threat', sys: neutral.id };
    if (!has(own, 'refinery')) return goHome({ kind: 'fuel', title: 'PREPARE FOR WAR', text: 'A fuel line keeps your growing fleet at full power. Build a fuel pump and refinery before the next push.', cta: 'OPEN HOME', action: 'home' });
    return goHome({ kind: 'free', title: 'CHOOSE YOUR NEXT EDGE', text: 'Your economy is stable. Upgrade a bottleneck, reinforce a border, or open a new pathway. ' + Math.ceil(Math.max(0, C.game.length - run.t) / 60) + ' minutes remain.', cta: 'OPEN HOME', action: 'home' });
  };
})(globalThis.AS = globalThis.AS || {});
