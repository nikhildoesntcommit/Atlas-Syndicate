/* ATLAS SYNDICATE v6 — sim/galaxy.js
   Seeded galaxy: a stylised six-armed spiral of 24 star systems (six core systems, six arms of three).
   The lanes are laid out with rotational symmetry, so every home (an arm tip) is exactly as far from its
   nearest rivals and from the core as every other home: no start is better than another.
   Each system holds 3-6 planets with their own underground (sim/planet.js). Plus graph helpers. */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG;
  const S = AS.S = AS.S || {};

  S.newSystem = function (id, name, x, y, region, arm, k) {
    return {
      id, name, x, y, region, arm, k, lanes: [], owner: -1, capital: -1,
      gar: { n: 0, vet: 0, ships: 0, sdur: 100 }, plat: { n: 0, dur: 100 }, train: { q: 0, prog: 0 },
      planets: [], pathways: [], pop: 0, battle: 0, lastBattle: -999, lastLost: -999, lastCaptured: -999, captureCount: 0, raidedAt: -999, flow: null,
    };
  };

  S.genGalaxy = function (run) {
    const rng = U.rng((run.seed ^ 0x9e3779b9) >>> 0);
    const G = C.galaxy, A = G.arms, step = U.TAU / A;
    const names = U.shuffle(rng, AS.SYSTEM_NAMES.slice());
    const systems = [];
    const rot = rng() * U.TAU;
    const jit = () => (rng() - 0.5) * 7;
    for (let j = 0; j < G.core; j++) {
      const a = rot + (j + 0.5) * step;
      systems.push(S.newSystem(systems.length, names[systems.length], Math.cos(a) * G.coreR * 1.3 + jit() * 0.5, Math.sin(a) * G.coreR * 0.8 + jit() * 0.4, 'core', -1, -1));
    }
    for (let i = 0; i < A; i++) for (let k = 0; k < G.perArm; k++) {
      const r = G.armR0 + k * G.armDR, a = rot + i * step + k * G.twist;
      systems.push(S.newSystem(systems.length, names[systems.length], Math.cos(a) * r + jit(), Math.sin(a) * r * G.squash + jit() * 0.6, 'arm', i, k));
    }
    const arm = (i, k) => systems[G.core + ((i % A) + A) % A * G.perArm + k];
    const core = j => systems[((j % G.core) + G.core) % G.core];
    const lanes = [];
    const add = (a, b) => lanes.push({ a: a.id, b: b.id, closedUntil: 0 });
    for (let j = 0; j < G.core; j++) add(core(j), core(j + 1));
    for (let i = 0; i < A; i++) {
      add(arm(i, 0), core(i - 1)); add(arm(i, 0), core(i));      // each arm meets the core at two systems
      add(arm(i, 0), arm(i, 1)); add(arm(i, 1), arm(i, 2));
      add(arm(i, 2), arm(i + 1, 1));                              // each tip reaches the next arm: the frontier
    }
    lanes.forEach((l, i) => {
      const a = systems[l.a], b = systems[l.b];
      l.id = i; l.len = Math.hypot(a.x - b.x, a.y - b.y);
      a.lanes.push(i); b.lanes.push(i);
    });
    // planets, neutral garrisons
    for (const s of systems) {
      const count = s.region === 'core' ? 5 + (rng() < 0.5 ? 1 : 0) : s.k === 0 ? 4 + (rng() < 0.5 ? 1 : 0) : 4;
      s.planets = [];
      for (let i = 0; i < count; i++) s.planets.push(S.makePlanet(rng, i, count, s.region === 'core'));
      U.shuffle(rng, s.planets);
      const a0 = rng() * U.TAU;
      s.planets.forEach((p, i) => { p.orbit = (i + 1) / count; p.phase = a0 + i * 2.4; p.name = s.name + ' ' + AS.PLANET_SUFFIX[i]; });   // golden-angle spacing: planets never start bunched
      const N = C.neutral, band = s.region === 'core' ? N.core : N.arm[Math.min(s.k, N.arm.length - 1)];
      s.gar.n = Math.round(band[0] + rng() * (band[1] - band[0]));
      s.gar.vet = N.vet;
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
   *  During a coalition truce, members may also pass through each other's systems (pooling toward the leader).
   *  Closed lanes are avoided. Returns null if there is no such path. */
  S.path = function (run, a, b, owner) {
    if (a === b) return null;
    const n = run.systems.length, prev = new Array(n).fill(-2);
    prev[a] = -1;
    const q = [a];
    for (let i = 0; i < q.length; i++) {
      const v = q[i];
      if (v !== a && run.systems[v].owner !== owner && !(S.truceBlocks && run.systems[v].owner >= 0 && S.truceBlocks(run, owner, run.systems[v].owner))) continue;   // own systems (or truce partners)
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
  S.homeCandidates = run => run.systems.filter(s => s.region === 'arm' && s.k === C.galaxy.perArm - 1).map(s => s.id);
})(globalThis.AS = globalThis.AS || {});
