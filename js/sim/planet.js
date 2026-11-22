/* ATLAS SYNDICATE v6 — sim/planet.js
   The planet cross-section (Turmoil-style, but nothing is hidden): a strip of surface building slots
   above a grid of layered rock. Hardness 0-2 makes drilling dearer; 3 is a barrier that cannot be
   drilled. Deposits of fuel, ice, metal and gold sit at visible depths; deeper ones are richer.
   Also: drill pricing and validation, and the cheapest drill route (used by the AI and by hints). */
(function (AS) {
  'use strict';

  const U = AS.U, C = AS.CONFIG, S = AS.S = AS.S || {};
  const GW = C.ground.w, GH = C.ground.h;
  S.GW = GW; S.GH = GH;

  const idx = (x, y) => y * GW + x;
  S.cellXY = i => [i % GW, Math.floor(i / GW)];

  /** How many surface slots a planet has (survey upgrade adds one). */
  S.slotCount = (p, f) => p.slots + (f && f.up && f.up.ext >= 5 ? 1 : 0);
  /** Column of the shaft under surface slot i. */
  S.slotX = (p, i, f) => { const n = S.slotCount(p, f); return Math.min(GW - 1, Math.floor((i + 0.5) * GW / n)); };

  /* ---------- generation ---------- */
  function noise(rng) {
    const g = [];
    for (let i = 0; i < 9 * 6; i++) g.push(rng());
    return (x, y) => {
      const gx = x / GW * 8, gy = y / GH * 5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = U.smooth(gx - x0), fy = U.smooth(gy - y0);
      const v = (i, j) => g[Math.min(5, y0 + j) * 9 + Math.min(8, x0 + i)];
      return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy;
    };
  }
  /**
   * Build an underground. spec: { slots, deps: [[res, minDepth, maxDepth, minCells, maxCells], ...], barriers }
   */
  S.genGround = function (rng, spec) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const n = noise(rng), rock = new Array(GW * GH).fill(0);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const v = n(x, y) + (rng() - 0.5) * 0.18, d = y / GH;
        rock[idx(x, y)] = d < 0.18 ? 0 : v + d * 0.9 > 1.15 ? 2 : v + d * 0.9 > 0.72 ? 1 : 0;
      }
      // barriers: unbroken slabs of hard rock, with gaps so everything stays reachable
      const nb = spec.barriers === undefined ? 1 + Math.floor(rng() * 3) : spec.barriers;
      for (let b = 0; b < nb; b++) {
        const y = 5 + Math.floor(rng() * 7), len = 6 + Math.floor(rng() * 9), x0 = Math.floor(rng() * (GW - len));
        for (let x = x0; x < x0 + len; x++) rock[idx(x, y)] = 3;
        if (rng() < 0.5) { const yy = Math.min(GH - 1, y + 1); for (let x = x0; x < x0 + Math.floor(len / 2); x++) rock[idx(x, yy)] = 3; }
      }
      const owner = new Array(GW * GH).fill(-1), deposits = [];
      let ok = true;
      for (const [res, d0, d1, c0, c1] of spec.deps) {
        let placed = false;
        for (let tries = 0; tries < 40 && !placed; tries++) {
          const sx = 1 + Math.floor(rng() * (GW - 2)), sy = d0 + Math.floor(rng() * (d1 - d0 + 1));
          if (owner[idx(sx, sy)] >= 0 || rock[idx(sx, sy)] === 3) continue;
          const want = c0 + Math.floor(rng() * (c1 - c0 + 1)), cells = [idx(sx, sy)];
          owner[cells[0]] = deposits.length;
          for (let k = 0; k < 80 && cells.length < want; k++) {
            const [cx, cy] = S.cellXY(cells[Math.floor(rng() * cells.length)]);
            const dir = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(rng() * 6)];
            const nx = cx + dir[0], ny = cy + dir[1];
            if (nx < 0 || ny < 1 || nx >= GW || ny >= GH) continue;
            const j = idx(nx, ny);
            if (owner[j] >= 0 || rock[j] === 3) continue;
            // keep a one-cell gap from other deposits so each reads as its own shape
            let touch = false;
            for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = nx + ax, yy = ny + ay; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH && owner[idx(xx, yy)] >= 0 && owner[idx(xx, yy)] !== deposits.length) touch = true; }
            if (touch) continue;
            owner[j] = deposits.length; cells.push(j);
          }
          const depth = cells.reduce((a, c) => a + Math.floor(c / GW), 0) / cells.length;
          const per = res === 'gold' ? 20 + 5 * depth : 14 + 3.5 * depth;
          const amount = Math.round(cells.length * per);
          deposits.push({ id: deposits.length, res, cells, amount, max: amount, depth: Math.round(depth * 10) / 10 });
          placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      const g = { slots: spec.slots, rock: rock.join(''), deposits };
      if (S.groundReachable(g)) return g;
    }
    // fallback: no barriers at all
    return S.genGround(rng, Object.assign({}, spec, { barriers: 0 }));
  };
  /** Every deposit can be reached from at least one slot without crossing a barrier. */
  S.groundReachable = function (g) {
    const seen = new Uint8Array(GW * GH), q = [];
    for (let i = 0; i < g.slots + 1; i++) { const x = Math.min(GW - 1, Math.floor((i + 0.5) * GW / g.slots)); const j = idx(x, 0); if (g.rock[j] !== '3' && !seen[j]) { seen[j] = 1; q.push(j); } }
    for (let k = 0; k < q.length; k++) {
      const [x, y] = S.cellXY(q[k]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = idx(nx, ny);
        if (seen[j] || g.rock[j] === '3') continue;
        seen[j] = 1; q.push(j);
      }
    }
    return g.deposits.every(d => d.cells.some(c => seen[c]));
  };

  /* planet look, slots and deposit mix by planet type */
  const KIND_RES = { rust: 'metal', cinder: 'metal', dwarf: 'gold', terran: 'gold', ice: 'ice', ice2: 'ice', gas: 'fuel' };
  S.kindRes = k => KIND_RES[k] || 'metal';
  /** Random planet for a neutral system. Big planets get many slots and few deposits; small ones the reverse. */
  S.makePlanet = function (rng, i, count, rich) {
    const kinds = ['rust', 'cinder', 'dwarf', 'terran', 'ice', 'ice2', 'gas'];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const cls = rng() < 0.33 ? 0 : rng() < 0.6 ? 1 : 2;     // 0 small, 1 medium, 2 large
    const slots = [5, 7, 9][cls] + (rng() < 0.5 ? 1 : 0);
    const main = KIND_RES[kind];
    const nDeps = [5, 4, 3][cls] + (rich ? 1 : 0) - (rng() < 0.4 ? 1 : 0);
    const deps = [];
    for (let k = 0; k < nDeps; k++) {
      let res = k === 0 || rng() < 0.45 ? main : AS.RES_KEYS[Math.floor(rng() * 4)];
      if (res === 'gold' && main !== 'gold' && rng() < 0.4) res = 'metal';
      deps.push(res === 'gold' ? ['gold', 7, 14, 3, 6] : [res, 1 + Math.floor(rng() * 4), 6 + Math.floor(rng() * 8), 5, 11 + (rich ? 3 : 0)]);
    }
    const g = S.genGround(rng, { slots, deps });
    return finishPlanet(rng, kind, i, count, g, cls);
  };
  function finishPlanet(rng, kind, i, count, g, cls) {
    return {
      kind, size: kind === 'gas' ? 10 + Math.floor(rng() * 2) : 6 + cls * 2 + Math.floor(rng() * 2), orbit: (i + 1) / count,
      phase: rng() * U.TAU, period: 260 + rng() * 260, spin: 0.25 + rng() * 0.5,
      slots: g.slots, rock: g.rock, deposits: g.deposits, blds: [], portIn: {},
    };
  }
  /** Every home system is the same four planets, so no start is better than another. */
  S.HOME_SPEC = [
    { kind: 'rust',  cls: 0, slots: 5, barriers: 1, deps: [['metal', 2, 4, 8, 10], ['gold', 7, 9, 4, 5], ['ice', 3, 5, 6, 8], ['metal', 11, 13, 9, 11]] },
    { kind: 'ice',   cls: 2, slots: 8, barriers: 1, deps: [['ice', 3, 6, 8, 10], ['fuel', 6, 9, 6, 8]] },
    { kind: 'gas',   cls: 1, slots: 6, barriers: 2, deps: [['fuel', 2, 5, 8, 10], ['fuel', 9, 12, 8, 10], ['metal', 6, 9, 6, 8]] },
    { kind: 'dwarf', cls: 1, slots: 6, barriers: 2, deps: [['gold', 9, 12, 4, 6], ['metal', 3, 6, 7, 9], ['gold', 12, 14, 3, 5]] },
  ];
  S.makeHomePlanets = function (seedForAllHomes) {
    const rng = U.rng(seedForAllHomes >>> 0);
    return S.HOME_SPEC.map((sp, i) => finishPlanet(rng, sp.kind, i, S.HOME_SPEC.length, S.genGround(rng, sp), sp.cls));
  };

  /* ---------- lookups ---------- */
  S.rockAt = (p, i) => +p.rock[i];
  S.depositMap = function (p) {
    if (p._dm) return p._dm;
    const m = new Int16Array(GW * GH).fill(-1);
    for (const d of p.deposits) for (const c of d.cells) m[c] = d.id;
    Object.defineProperty(p, '_dm', { value: m, enumerable: false, configurable: true, writable: true });
    return m;
  };
  S.depositAt = (p, i) => { const id = S.depositMap(p)[i]; return id >= 0 ? p.deposits[id] : null; };
  S.bldAt = (p, slot) => p.blds.find(b => b.slot === slot) || null;
  S.bldById = (p, id) => p.blds.find(b => b.id === id) || null;

  /* ---------- drilling ---------- */
  S.drillPrice = function (f, p, path) {
    let c = 0;
    for (const i of path) c += C.ground.hardCost[S.rockAt(p, i)] || 99;
    return Math.ceil(c * C.ground.drillCost * (f && f.up && f.up.ext >= 1 ? 0.7 : 1));
  };
  /** Checks a drill path: starts under the slot, steps one cell at a time, never repeats, never hits a
   *  barrier, and ends in a deposit of the extractor's resource. Returns {ok, reason, cost, dep}. */
  S.checkDrill = function (f, p, b, path) {
    if (!b || AS.BLD[b.kind].role !== 'ext') return { ok: false, reason: 'notext' };
    if (!Array.isArray(path) || path.length < 1 || path.length > GW * GH) return { ok: false, reason: 'path' };
    const start = idx(S.slotX(p, b.slot, f), 0);
    if (path[0] !== start) return { ok: false, reason: 'path' };
    const seen = new Set();
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      if (!(i >= 0 && i < GW * GH) || i !== Math.floor(i) || seen.has(i)) return { ok: false, reason: 'path' };
      if (S.rockAt(p, i) === 3) return { ok: false, reason: 'barrier' };
      seen.add(i);
      if (k) {
        const [ax, ay] = S.cellXY(path[k - 1]), [bx, by] = S.cellXY(i);
        if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return { ok: false, reason: 'path' };
      }
    }
    const dep = S.depositAt(p, path[path.length - 1]);
    if (!dep || dep.res !== AS.BLD[b.kind].res) return { ok: false, reason: 'nodeposit' };
    return { ok: true, cost: S.drillPrice(f, p, path), dep };
  };
  /** Dijkstra from a slot's shaft top over the rock (cached: the rock never changes). */
  const distCache = new Map();
  S.drillField = function (run, p, startX) {
    const key = p.rock + ':' + startX;   // the rock layout itself: identical rock, identical field
    const hit = distCache.get(key);
    if (hit) return hit;
    const N = GW * GH, dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const s = idx(startX, 0);
    if (S.rockAt(p, s) === 3) { const r = { dist, prev }; distCache.set(key, r); return r; }
    dist[s] = C.ground.hardCost[S.rockAt(p, s)];
    // small grid: a simple bucket queue on integer costs is plenty
    const buckets = [];
    buckets[dist[s]] = [s];
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (const i of b) {
        if (done[i] || dist[i] !== d) continue;
        done[i] = 1;
        const [x, y] = S.cellXY(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const j = idx(nx, ny), h = S.rockAt(p, j);
          if (h === 3) continue;
          const nd = d + C.ground.hardCost[h];
          if (nd < dist[j]) { dist[j] = nd; prev[j] = i; (buckets[nd] = buckets[nd] || []).push(j); }
        }
      }
    }
    const r = { dist, prev };
    if (distCache.size > 4000) distCache.clear();
    distCache.set(key, r);
    return r;
  };
  /** Cheapest drill from slot to deposit: {path, cost} or null. */
  S.bestDrill = function (run, f, p, slot, dep) {
    const fld = S.drillField(run, p, S.slotX(p, slot, f));
    let best = -1, bd = Infinity;
    for (const c of dep.cells) if (fld.dist[c] < bd) { bd = fld.dist[c]; best = c; }
    if (best < 0) return null;
    const path = [];
    for (let c = best; c >= 0; c = fld.prev[c]) path.push(c);
    path.reverse();
    return { path, cost: S.drillPrice(f, p, path) };
  };
})(globalThis.AS = globalThis.AS || {});
