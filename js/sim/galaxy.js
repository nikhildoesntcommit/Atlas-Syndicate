/* ATLAS SYNDICATE v5 — sim/galaxy.js
   Seeded galaxy generation: a stylised five-armed spiral of 24 star systems joined by hyperlanes,
   each system with 3-6 planets. Plus graph helpers (neighbours, distances, paths). */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG;
  const S = AS.S = AS.S || {};

  function segCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    if (a === c || a === d || b === c || b === d) return false;
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  /** Planet set for a system. Richer and more numerous in the core, poorer at the arm tips. */
  function makePlanets(rng, region, k) {
    const count = region === 'core' ? 5 + (rng() < 0.5 ? 1 : 0) : [4 + (rng() < 0.5 ? 1 : 0), 4 + (rng() < 0.4 ? 1 : 0), 3 + Math.floor(rng() * 3), 3 + (rng() < 0.4 ? 1 : 0)][k];
    const richW = region === 'core' ? [[2, 0.45], [3, 0.55]] : [[[1, 0.3], [2, 0.5], [3, 0.2]], [[1, 0.45], [2, 0.45], [3, 0.1]], [[1, 0.55], [2, 0.45]], [[1, 0.7], [2, 0.3]]][k];
    const types = ['ore', 'energy', rng() < 0.85 ? 'food' : (rng() < 0.5 ? 'ore' : 'energy')];
    while (types.length < count) types.push(U.pickWeighted(rng, [['ore', 0.36], ['energy', 0.34], ['food', 0.3]]));
    U.shuffle(rng, types);
    return types.map((type, i) => makePlanet(rng, type, U.pickWeighted(rng, richW), i, count));
  }
  function makePlanet(rng, type, rich, i, count) {
    const kinds = AS.RES[type].kinds;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    return {
      type, rich, kind, orbit: (i + 1) / count, phase: rng() * U.TAU, period: 240 + rng() * 260,
      size: kind === 'gas' ? 9 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 3) + rich, spin: 0.25 + rng() * 0.5, ext: null,
    };
  }
  S.makePlanet = makePlanet;

  /** Every home is identical, so no faction starts with a better economy. */
  S.HOME_PLANETS = [['ore', 2], ['energy', 2], ['food', 2], ['energy', 1], ['ore', 1]];

  S.newSystem = function (id, name, x, y, region, arm, k) {
    return {
      id, name, x, y, region, arm, k, lanes: [], owner: -1, capital: -1,
      gar: { n: 0, vet: 0, ships: 0, sdur: 100 }, plat: { n: 0, dur: 100 }, train: { q: 0, prog: 0 },
      planets: [], station: { dur: 100 }, lines: [], nextLine: 1, freighters: 0, fdur: 100,
      pop: 0, battle: 0, lastBattle: -999, lastLost: -999, lastCaptured: -999, captureCount: 0,
      lastYield: null, raidedAt: -999,
    };
  };

  /** Generate the galaxy into run.systems / run.lanes. Deterministic for a seed. */
  S.genGalaxy = function (run) {
    const rng = U.rng((run.seed ^ 0x9e3779b9) >>> 0);
    const G = C.galaxy;
    const names = U.shuffle(rng, AS.SYSTEM_NAMES.slice());
    const systems = [];
    const rot = rng() * U.TAU, rot2 = rng() * U.TAU;
    for (let j = 0; j < G.core; j++) {
      const a = rot2 + j * U.TAU / G.core + (rng() - 0.5) * 0.3, r = G.coreR + (rng() - 0.5) * 10;
      systems.push(S.newSystem(systems.length, names[systems.length], Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.8, 'core', -1, -1));
    }
    for (let i = 0; i < G.arms; i++) {
      const base = rot + i * U.TAU / G.arms;
      for (let k = 0; k < G.perArm; k++) {
        const r = G.armR0 + k * G.armDR + (rng() - 0.5) * 10, a = base + k * G.twist + (rng() - 0.5) * 0.16;
        systems.push(S.newSystem(systems.length, names[systems.length], Math.cos(a) * r, Math.sin(a) * r * G.squash, 'arm', i, k));
      }
    }
    const armSys = (i, k) => systems[G.core + i * G.perArm + k];
    const lanes = [];
    const has = (a, b) => lanes.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    const deg = id => lanes.reduce((n, l) => n + (l.a === id || l.b === id ? 1 : 0), 0);
    const ok = (a, b) => {
      if (a === b || has(a, b)) return false;
      const A = systems[a], B = systems[b];
      for (const l of lanes) if (segCross(A, B, systems[l.a], systems[l.b])) return false;
      for (const s of systems) if (s !== A && s !== B && U.distToSeg(s.x, s.y, A.x, A.y, B.x, B.y) < 11) return false;
      return true;
    };
    const add = (a, b, force) => { if (force ? (a !== b && !has(a, b)) : ok(a, b)) { lanes.push({ a, b, closedUntil: 0 }); return true; } return false; };
    // core ring (+ maybe a diagonal)
    for (let j = 0; j < G.core; j++) add(j, (j + 1) % G.core, true);
    if (rng() < 0.5) add(0, 2); else add(1, 3);
    // arm chains and their roots into the core
    for (let i = 0; i < G.arms; i++) {
      for (let k = 0; k < G.perArm - 1; k++) add(armSys(i, k).id, armSys(i, k + 1).id, true);
      const root = armSys(i, 0);
      const cores = systems.slice(0, G.core).sort((p, q) => Math.hypot(p.x - root.x, p.y - root.y) - Math.hypot(q.x - root.x, q.y - root.y));
      if (!add(root.id, cores[0].id)) add(root.id, cores[0].id, true);
    }
    // cross-arm lanes between neighbouring arms (these, and the roots, make the chokepoints)
    for (let i = 0; i < G.arms; i++) {
      const j = (i + 1) % G.arms, cand = [];
      for (let k = 1; k < G.perArm; k++) for (let kk = 0; kk < G.perArm; kk++) {
        const A = armSys(i, k), B = armSys(j, kk);
        cand.push([A.id, B.id, Math.hypot(A.x - B.x, A.y - B.y), k]);
      }
      cand.sort((p, q) => p[2] - q[2]);
      let first = null;
      for (const c of cand) if (add(c[0], c[1])) { first = c; break; }
      if (first && rng() < 0.45) for (const c of cand) if (Math.abs(c[3] - first[3]) >= 2 && add(c[0], c[1])) break;
    }
    // every system needs 2-4 lanes
    for (const s of systems) {
      if (deg(s.id) >= 2) continue;
      const near = systems.filter(o => o !== s && deg(o.id) < 4).sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y));
      for (const o of near) if (add(s.id, o.id)) break;
      if (deg(s.id) < 2) for (const o of near) if (add(s.id, o.id, true)) break;
    }
    // trim over-connected systems where it keeps the galaxy connected
    for (const s of systems) {
      while (deg(s.id) > 4) {
        const mine = lanes.filter(l => l.a === s.id || l.b === s.id).sort((p, q) => deg(q.a === s.id ? q.b : q.a) - deg(p.a === s.id ? p.b : p.a));
        let removed = false;
        for (const l of mine) {
          const other = l.a === s.id ? l.b : l.a;
          if (deg(other) <= 2) continue;
          const idx = lanes.indexOf(l);
          lanes.splice(idx, 1);
          if (connected(systems.length, lanes)) { removed = true; break; }
          lanes.splice(idx, 0, l);
        }
        if (!removed) break;
      }
    }
    lanes.forEach((l, i) => {
      const A = systems[l.a], B = systems[l.b];
      l.id = i; l.len = Math.hypot(A.x - B.x, A.y - B.y);
      A.lanes.push(i); B.lanes.push(i);
    });
    // planets, neutral garrisons and pre-built independent infrastructure
    for (const s of systems) {
      s.planets = makePlanets(rng, s.region, s.k);
      const N = C.neutral, band = s.region === 'core' ? N.core : N.arm[s.k];
      s.gar.n = Math.round(band[0] + rng() * (band[1] - band[0]));
      s.gar.vet = N.vet;
      s.station.dur = Math.round(70 + rng() * 30);
      s.freighters = 2; s.fdur = Math.round(60 + rng() * 30);
      const ore = s.planets.findIndex(p => p.type === 'ore'), en = s.planets.findIndex(p => p.type === 'energy');
      const built = [ore, en].filter(i => i >= 0);
      if (rng() < 0.5) { const f = s.planets.findIndex(p => p.type === 'food'); if (f >= 0) built.push(f); }
      for (const i of built) s.planets[i].ext = { dur: Math.round(55 + rng() * 35) };
      if (built.length) s.lines.push({ id: s.nextLine++, stops: [-1].concat(built.slice(0, 2)), fr: 2, dur: Math.round(60 + rng() * 30) });
      s.pop = s.region === 'core' ? 10 : 6;
    }
    run.systems = systems;
    run.lanes = lanes;
    S.computeTopology(run);
  };

  function connected(n, lanes) {
    const adj = Array.from({ length: n }, () => []);
    for (const l of lanes) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
    const seen = new Uint8Array(n), st = [0];
    seen[0] = 1;
    let c = 1;
    while (st.length) { const v = st.pop(); for (const w of adj[v]) if (!seen[w]) { seen[w] = 1; c++; st.push(w); } }
    return c === n;
  }
  S.isConnected = run => connected(run.systems.length, run.lanes);

  /** Static graph facts used by the AI and the map: hop distances and chokepoint scores. */
  S.computeTopology = function (run) {
    const n = run.systems.length;
    run.hops = [];
    for (let i = 0; i < n; i++) run.hops.push(S.bfs(run, i, null));
    // chokepoint: how many shortest paths between all pairs run through the system (betweenness, normalised)
    const between = new Array(n).fill(0);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const d = run.hops[a][b];
      for (let v = 0; v < n; v++) if (v !== a && v !== b && run.hops[a][v] + run.hops[v][b] === d) between[v]++;
    }
    const mx = Math.max(1, ...between);
    run.systems.forEach((s, i) => { s.choke = Math.round(between[i] / mx * 100) / 100; });
  };

  /* ---------- graph helpers ---------- */
  S.otherEnd = (run, laneId, sysId) => { const l = run.lanes[laneId]; return l.a === sysId ? l.b : l.a; };
  S.neighbours = function (run, id) { const s = run.systems[id]; return s.lanes.map(l => S.otherEnd(run, l, id)); };
  S.laneBetween = function (run, a, b) {
    for (const li of run.systems[a].lanes) { const l = run.lanes[li]; if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l; }
    return null;
  };
  S.laneOpen = (run, l) => !l || l.closedUntil <= run.t;
  /** BFS hop distances from id; pass may restrict which systems can be walked through. */
  S.bfs = function (run, id, pass) {
    const n = run.systems.length, d = new Array(n).fill(99);
    d[id] = 0;
    const q = [id];
    for (let i = 0; i < q.length; i++) {
      const v = q[i];
      for (const w of S.neighbours(run, v)) if (d[w] === 99 && (!pass || pass(w))) { d[w] = d[v] + 1; q.push(w); }
    }
    return d;
  };
  /** Path of system ids from a to b, walking only through systems owned by `owner` (the last hop may be anything).
   *  Closed lanes are avoided. Returns null if there is no such path. */
  S.path = function (run, a, b, owner) {
    if (a === b) return null;
    const n = run.systems.length, prev = new Array(n).fill(-2);
    prev[a] = -1;
    const q = [a];
    for (let i = 0; i < q.length; i++) {
      const v = q[i];
      if (v !== a && run.systems[v].owner !== owner) continue;   // can only pass through own systems
      for (const li of run.systems[v].lanes) {
        const l = run.lanes[li];
        if (!S.laneOpen(run, l)) continue;
        const w = l.a === v ? l.b : l.a;
        if (prev[w] !== -2) continue;
        prev[w] = v;
        if (w === b) { const p = [b]; let c = v; while (c !== -1) { p.push(c); c = prev[c]; } return p.reverse(); }
        q.push(w);
      }
    }
    return null;
  };
  S.homeCandidates = run => run.systems.filter(s => s.region === 'arm' && s.k >= 2).map(s => s.id);
})(globalThis.AS = globalThis.AS || {});
