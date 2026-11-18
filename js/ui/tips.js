/* ATLAS SYNDICATE v4 — ui/tips.js
   The advisor (single most useful next step) and one-time explanation cards. Shown when tips are on. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, D = AS.Draw, C = AS.CONFIG, PAL = AS.PALETTE;
  const Tips = AS.Tips = {};

  const CARDS = {
    start: 'ATLAS PRIME IS YOUR CAPITAL. EVERYTHING DELIVERED THERE IS SOLD. THE ADVISOR (TOP RIGHT) SUGGESTS YOUR NEXT STEP.',
    claim: 'NEW WORLD. DRAG FROM ATLAS PRIME TO IT TO OPEN A ROUTE, THEN BUILD ON ITS SLOTS.',
    route: 'FREIGHTERS PICK CARGO THEMSELVES: SURPLUS GOES WHERE IT IS NEEDED, THE REST TO ATLAS PRIME TO BE SOLD.',
    quarter: 'EVERY 3 MINUTES THE BOARD CHECKS REVENUE AGAINST A TARGET (TOP BAR). MISSING IT COSTS CONFIDENCE.',
    offer: 'CONTRACTS ARE OPTIONAL. TAKE ONE ONLY IF YOU ALREADY MAKE THAT GOOD. FAILING COSTS CONFIDENCE.',
    starve: 'A WORLD IS STARVING. ROUTE FOOD TO IT, OR BUILD AN ICE DRILL AND AGRI DOME THERE.',
    full: 'A FACILITY IS FULL. ITS WORLD NEEDS A ROUTE AND FREIGHTERS TO MOVE THE OUTPUT AWAY.',
    debt: 'YOU ARE IN DEBT. CONFIDENCE DRAINS UNTIL CREDITS ARE BACK ABOVE ZERO. PAUSE BUILDING.',
    discover: 'A NEW WORLD WAS FOUND. THE MAP GROWS OVER TIME: OUTER WORLDS ARE RICHER BUT FURTHER AWAY.',
    traits: 'SOME WORLDS HAVE TRAITS (RICH, RAD, LOWG...). HOVER A WORLD OR CHECK ITS PANEL TO SEE WHAT THEY DO.',
    gas: 'GAS WORLD. A FABRICATOR TURNS ALLOY + GAS INTO PARTS, THE MOST VALUABLE GOOD. GAS GIANTS NEED FOOD BY ROUTE.',
    mega: 'MEGAPROJECT UNLOCKED. DELIVER THE GOODS IN THE TOP PANEL TO THE GATE. FINISH ALL 3 STAGES TO WIN.',
    storm: 'A SOLAR STORM STOPS ONE ROUTE FOR A WHILE. IT RESTARTS BY ITSELF.',
    flare: 'A SOLAR FLARE STOPS ALL FREIGHTERS BRIEFLY. KEEP SOME STOCK BUFFERED.',
    meteor: 'METEOR STRIKES STOP FACILITIES AND DESTROY SOME STOCK. THEY ARE ANNOUNCED 8 S AHEAD.',
    cargo: 'CARGO LOSS: ONE FREIGHTER LOSES ITS LOAD. THE REINFORCED HULLS PERK PREVENTS IT.',
    fuel: 'FUEL SHORTAGE: EVERY TRIP COSTS MORE FOR A WHILE.',
    zoom: 'WHEEL OR PINCH TO ZOOM, DRAG EMPTY SPACE TO PAN. R OR FIT SHOWS EVERYTHING.',
  };
  Tips.show = function (key) {
    if (!G.settings.tips || G.seen[key] || !CARDS[key] || (AS.Onboard && AS.Onboard.active())) return;
    G.seen[key] = true;
    G.cards.push({ key, text: CARDS[key], t: 11, max: 11 });
    if (G.cards.length > 2) G.cards.shift();
  };
  Tips.check = function (run) {
    if (!G.settings.tips || G.mode !== 'play' || run.tutorial) return;
    const cols = S.colonies(run);
    if (run.t > 1) Tips.show('start');
    if (run.t > 40) Tips.show('zoom');
    if (run.t > 100) Tips.show('quarter');
    if (cols.length > 1) Tips.show('claim');
    if (run.routes.length) Tips.show('route');
    if (run.contracts.some(c => !c.accepted)) Tips.show('offer');
    if (cols.some(b => b.starving)) Tips.show('starve');
    if (cols.some(b => b.fac.some(f => f && f.status === 'full'))) Tips.show('full');
    if (run.credits < 0) Tips.show('debt');
    if (run.bodies.some(b => b.found && b.foundAt > 0 && !b.site)) Tips.show('discover');
    if (run.bodies.some(b => b.found && b.traits && b.traits.length && !b.prime) && run.t > 60) Tips.show('traits');
    if (cols.some(b => b.dep.gas >= 1)) Tips.show('gas');
    if (run.mega.state === 'active') Tips.show('mega');
    if (run.lastEvent) Tips.show(run.lastEvent);
  };
  Tips.drawCards = function (ctx, dt) {
    if (!G.settings.tips) return;
    let y = G.mapBottom() - 4;
    for (let i = G.cards.length - 1; i >= 0; i--) {
      const c = G.cards[i];
      c.t -= dt;
      const lines = U.wrapText(c.text, 42), w = 178, h = lines.length * 7 + 8;
      const k = U.easeOut(U.clamp((c.max - c.t) * 5, 0, 1)) * U.clamp(c.t * 3, 0, 1);
      y -= h + 3;
      const x = Math.round(3 - (1 - k) * (w + 6));
      D.plate(ctx, x, y, w, h, 1);
      D.rect(ctx, x + 1, y + 1, 2, h - 2, 13);
      lines.forEach((l, j) => D.text(ctx, l, x + 7, y + 4 + j * 7, 7, { shadow: false }));
      G.btns.push({ x, y, w, h, fn: () => { c.t = Math.min(c.t, 0.3); } });
    }
    G.cards = G.cards.filter(c => c.t > 0);
  };

  /** The single most useful next action, recomputed twice a second. */
  Tips.advice = function (run) {
    const P = S.prime(run), cols = S.colonies(run);
    const free = run.bodies.filter(b => b.found && !b.claimed && !b.site);
    const starving = cols.find(b => b.starving);
    if (starving) return { text: starving.name + ' IS STARVING: ROUTE FOOD TO IT, OR BUILD DRILL + AGRI THERE', id: starving.id };
    if (run.credits < 0) return { text: 'IN DEBT: STOP BUILDING UNTIL CREDITS RECOVER', id: P.id };
    const noRoute = cols.find(b => !b.prime && S.neighbors(run, b).length === 0);
    if (noRoute) return { text: 'DRAG FROM ATLAS PRIME TO ' + noRoute.name + ' TO OPEN A ROUTE', id: noRoute.id };
    if (run.mega.state === 'active') {
      const site = S.site(run), st = S.megaStage(run);
      const links = run.routes.filter(r => r.a === site.id || r.b === site.id);
      const fl = links.reduce((n, r) => n + S.routeFreighters(run, r).length, 0);
      const missing = Object.keys(st.req).find(g => S.megaRemaining(run, g) > 0 && S.productionRate(run, g) < 0.05);
      if (missing) return { text: 'THE GATE NEEDS ' + AS.GOODS[missing].name + ' AND NOTHING MAKES IT: BUILD FOR IT', id: site.id };
      if (fl < 4) return { text: 'PUT MORE FREIGHTERS ON ROUTES TO THE ' + C.mega.name, id: site.id };
    }
    if (!cols.some(b => !b.prime && b.dep.ice >= 0.9)) {
      const t = free.filter(b => b.dep.ice >= 0.9).sort((a, b) => S.planeDist(a, P) - S.planeDist(b, P))[0];
      if (t) return { text: 'CLAIM ' + t.name + ' (ICE). ICE BECOMES FOOD FOR COLONISTS', id: t.id };
    }
    const bare = cols.find(b => !b.prime && !b.fac.some(f => f && AS.FAC[f.type].extract) && b.fac.includes(null));
    if (bare) { const g = ['ice', 'ore', 'gas'].find(k => bare.dep[k]); return { text: 'BUILD ' + (g === 'ice' ? 'AN ICE DRILL' : g === 'ore' ? 'AN ORE MINE' : 'A GAS SKIMMER') + ' ON ' + bare.name, id: bare.id }; }
    const idle = S.idleFreighters(run).length;
    if (idle && run.routes.length) return { text: idle + ' IDLE FREIGHTER' + (idle > 1 ? 'S' : '') + ': CLICK A ROUTE, PRESS +', id: 0 };
    if (run.routes.find(r => S.routeFreighters(run, r).length === 0)) return { text: 'A ROUTE HAS NO FREIGHTERS: CLICK IT, PRESS +', id: 0 };
    const offer = run.contracts.find(c => !c.accepted && S.productionRate(run, c.good) * C.contracts.deadline * 0.8 >= c.qty);
    if (offer) return { text: 'GOOD CONTRACT: ' + offer.qty + ' ' + AS.GOODS[offer.good].name + '. PRESS TAKE', id: 0 };
    const full = cols.find(b => b.fac.some(f => f && f.status === 'full'));
    if (full) return { text: full.name + ' IS FULL: ADD A FREIGHTER TO ITS ROUTE', id: full.id };
    if (!cols.some(b => b.dep.gas >= 1) && cols.length >= 2) {
      const t = free.filter(b => b.dep.gas >= 1).sort((a, b) => S.planeDist(a, P) - S.planeDist(b, P))[0];
      if (t) return { text: 'CLAIM ' + t.name + ' (GAS). GAS + ALLOY = PARTS, THE BEST EARNER', id: t.id };
    }
    if (cols.some(b => b.dep.gas >= 1) && !cols.some(b => b.fac.some(f => f && f.type === 'fab'))) {
      const host = cols.find(b => b.fac.includes(null) && b.prime) || cols.find(b => b.fac.includes(null));
      if (host) return { text: 'BUILD A FABRICATOR ON ' + host.name + ' (ALLOY + GAS > PARTS)', id: host.id };
    }
    if (run.mega.state === 'locked' && cols.length < C.mega.minWorlds) {
      const t = free.sort((a, b) => S.planeDist(a, P) - S.planeDist(b, P))[0];
      if (t) return { text: 'THE MEGAPROJECT NEEDS ' + C.mega.minWorlds + ' WORLDS. CLAIM ' + t.name, id: t.id };
    }
    const crowded = cols.find(b => b.pop >= S.housing(run, b) - 0.5 && b.fac.includes(null) && !b.starving);
    if (crowded) return { text: crowded.name + ' IS FULL OF PEOPLE: A HABITAT MEANS MORE TAX', id: crowded.id };
    const spare = cols.find(b => b.fac.includes(null) && ['ore', 'ice', 'gas'].some(k => b.dep[k] >= 1));
    if (spare && run.credits > 700) return { text: 'SPARE SLOT ON ' + spare.name + ': MORE INDUSTRY = MORE REVENUE', id: spare.id };
    const nextFree = free.sort((a, b) => S.planeDist(a, P) - S.planeDist(b, P))[0];
    if (nextFree && run.credits > S.claimCost(run, nextFree) + 300) return { text: 'EXPAND: CLAIM ' + nextFree.name, id: nextFree.id };
    return { text: 'BEAT THE TARGET: ' + U.fmtNum(run.target - run.qIncome) + ' CR TO GO IN ' + U.fmtTime(run.nextQuarter - run.t), id: 0 };
  };
  Tips.drawAdvisor = function (ctx, run) {
    if (!G.settings.tips || !G.advice || (AS.Onboard && AS.Onboard.active())) return 17;
    const lines = U.wrapText(G.advice.text, 34);
    const w = 146, h = lines.length * 7 + 13, x = G.W - w - 2, y = 17;
    D.plate(ctx, x, y, w, h, 1);
    D.text(ctx, 'ADVISOR', x + 5, y + 4, 12, { shadow: false });
    if (G.advice.id) D.text(ctx, 'CLICK >', x + w - 5, y + 4, 4, { shadow: false, align: 'right' });
    lines.forEach((l, i) => D.text(ctx, l, x + 5, y + 11 + i * 7, 7, { shadow: false }));
    const id = G.advice.id;
    G.btns.push({ x, y, w, h, fn: () => { const b = id && S.getBody(run, id); if (b) { G.sel = { kind: 'body', id: b.id }; G.focusOn(b.sx, b.sy, Math.max(2, G.cam.z)); AS.Sfx.play('click'); } } });
    G.tip(x, y, w, h, 'ADVISOR: YOUR MOST USEFUL NEXT STEP. CLICK TO JUMP TO THE WORLD IT MENTIONS. TURN TIPS OFF (T) TO HIDE.');
    return y + h + 2;
  };
})(globalThis.AS = globalThis.AS || {});
