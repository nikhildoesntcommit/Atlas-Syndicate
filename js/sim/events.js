/* ATLAS SYNDICATE v5 — sim/events.js
   Galaxy events, about every 4 minutes, each announced 60 seconds before it happens so everyone can
   prepare: solar storm, market boom, mercenary surplus, lane collapse, pirate surge. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S, EV = C.events;

  function plan(run, at) {
    const last = run.events.history.slice(-2).map(e => e.type);
    const opts = AS.EVENT_KEYS.filter(k => last.indexOf(k) < 0).map(k => [k, AS.EVENTS[k].w]);
    const type = U.pickWeighted(run.rng, opts);
    const e = { type, at, announced: false };
    if (type === 'storm') {
      if (run.rng() < 0.3) e.region = 'core';
      else { e.region = 'arm'; e.arm = Math.floor(run.rng() * C.galaxy.arms); }
    } else if (type === 'boom') e.res = AS.RES_KEYS[Math.floor(run.rng() * 3)];
    else if (type === 'lane') {
      // prefer a lane between two different owners: that is where it matters
      const contested = run.lanes.filter(l => run.systems[l.a].owner !== run.systems[l.b].owner && l.closedUntil <= run.t);
      const pool = contested.length ? contested : run.lanes;
      e.lane = pool[Math.floor(run.rng() * pool.length)].id;
    }
    run.events.next = e;
  }
  S.initEvents = function (run) {
    run.events = { next: null, active: [], history: [] };
    plan(run, EV.first + (run.rng() - 0.5) * EV.jitter);
  };
  S.regionName = function (run, e) { return e.region === 'core' ? 'THE CORE' : 'ARM ' + 'ABCDE'[e.arm]; };
  /** Plain description with exact numbers, for banners and tooltips. */
  S.eventText = function (run, e) {
    switch (e.type) {
      case 'storm': return 'SUPPLY LINES IN ' + S.regionName(run, e) + ' STOP FOR ' + AS.EVENTS.storm.dur + ' S';
      case 'boom': return 'SURPLUS ' + AS.RES[e.res].name + ' SELLS FOR ' + AS.EVENTS.boom.value + ' CR FOR ' + AS.EVENTS.boom.dur + ' S';
      case 'mercs': return 'SALARIES -50% AND TRAINING 3X FASTER FOR ' + AS.EVENTS.mercs.dur + ' S';
      case 'lane': { const l = run.lanes[e.lane]; return 'LANE ' + run.systems[l.a].name + ' - ' + run.systems[l.b].name + ' CLOSES FOR ' + AS.EVENTS.lane.dur + ' S'; }
      case 'pirate': return 'EVERY INDEPENDENT GARRISON GROWS BY 50% +5';
    }
    return '';
  };
  S.stepEvents = function (run) {
    const ev = run.events, e = ev.next;
    for (const a of ev.active.slice()) if (run.t >= a.until) { ev.active = ev.active.filter(x => x !== a); run.fx.push({ type: 'eventEnd', ev: a.type }); }
    if (!e) return;
    if (!e.announced && run.t >= e.at - EV.warn) {
      e.announced = true;
      run.fx.push({ type: 'eventWarn', ev: e.type });
      S.logMoment(run, 'IN 60 S: ' + AS.EVENTS[e.type].name, 'info', -1);
    }
    if (run.t < e.at) return;
    const def = AS.EVENTS[e.type];
    const act = Object.assign({}, e, { until: run.t + def.dur, start: run.t });
    if (e.type === 'lane') run.lanes[e.lane].closedUntil = run.t + def.dur;
    if (e.type === 'pirate') for (const s of run.systems) if (s.owner === -1 && !s.battle) s.gar.n = Math.round(s.gar.n * def.mult + def.add);
    if (def.dur > 0) ev.active.push(act);
    ev.history.push({ type: e.type, t: Math.round(run.t) });
    run.fx.push({ type: 'event', ev: e.type });
    S.logMoment(run, def.name + ': ' + S.eventText(run, e), 'event', -1);
    plan(run, e.at + EV.every + (run.rng() - 0.5) * 2 * EV.jitter);
  };
})(globalThis.AS = globalThis.AS || {});
