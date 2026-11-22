/* ATLAS SYNDICATE v5 — util.js
   Seeded PRNG with serialisable state, maths helpers, formatting, guarded storage. */
(function (AS) {
  'use strict';

  const U = AS.U = {};
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
  U.safeDiv = (a, b, d = 0) => (b === 0 || !Number.isFinite(b) ? d : U.fin(a / b, d));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = t => t * t * (3 - 2 * t);
  U.easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
  U.easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  U.bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

  /** mulberry32 with its state in a plain object, so a run can be saved and resumed exactly. */
  U.rngFrom = function (state) {
    const f = function () {
      state.a = (state.a + 0x6d2b79f5) >>> 0;
      let t = state.a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = state;
    return f;
  };
  U.rng = seed => U.rngFrom({ a: seed >>> 0 });
  U.randomSeed = () => ((Math.random() * 4294967296) >>> 0) || 1;
  U.hash2 = function (x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s | 0) * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  U.pickWeighted = function (rng, opts) {
    let total = 0;
    for (const o of opts) total += Math.max(0, o[1]);
    if (total <= 0) return opts.length ? opts[0][0] : null;
    let r = rng() * total;
    for (const [k, w] of opts) { r -= Math.max(0, w); if (r <= 0) return k; }
    return opts[opts.length - 1][0];
  };
  U.shuffle = function (rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  U.distToSeg = function (px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? U.clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(U.fin(sec)));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.fmtNum = function (v) {
    v = U.fin(v);
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 100000) return (v / 1000).toFixed(0) + 'K';
    if (a >= 10000) return (v / 1000).toFixed(1) + 'K';
    return String(Math.floor(v));
  };
  U.fmtInt = function (v) {
    const s = String(Math.round(Math.abs(U.fin(v))));
    return (v < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  U.wrapText = function (text, maxChars) {
    const words = String(text).toUpperCase().split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines;
  };

  /* ---------- storage: every access guarded, memory fallback ---------- */
  const Store = AS.Store = {
    mem: {},
    prefix: 'atlas5.',
    get(key, def) {
      key = this.prefix + key;
      let raw = null;
      try { raw = globalThis.localStorage ? globalThis.localStorage.getItem(key) : null; } catch (e) { raw = null; }
      if (raw === null || raw === undefined) return key in this.mem ? this.mem[key] : def;
      try { return JSON.parse(raw); } catch (e) { return key in this.mem ? this.mem[key] : def; }
    },
    set(key, value) {
      key = this.prefix + key;
      this.mem[key] = value;
      try { if (globalThis.localStorage) globalThis.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* memory fallback */ }
    },
    remove(key) {
      key = this.prefix + key;
      delete this.mem[key];
      try { if (globalThis.localStorage) globalThis.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- share codes: seed + corporation + difficulty, e.g. 1KZ9QW-C-N7 ---------- */
  const CORP_L = 'ABCDEFGH', DIFF_L = 'ENH';
  function check(body) { let sum = 0; for (let i = 0; i < body.length; i++) sum = (sum * 31 + body.charCodeAt(i)) % 36; return sum.toString(36).toUpperCase(); }
  U.makeCode = function (seed, corp, diff) {
    const ci = Math.max(0, AS.CORP_KEYS.indexOf(corp)), di = Math.max(0, AS.DIFF_KEYS.indexOf(diff));
    const body = (seed >>> 0).toString(36).toUpperCase() + '-' + CORP_L[ci] + '-' + DIFF_L[di];
    return body + check(body);
  };
  U.parseCode = function (code) {
    const s = String(code || '').toUpperCase().replace(/[^0-9A-Z-]/g, '');
    const m = /^([0-9A-Z]{1,7})-([A-H])-([ENH])([0-9A-Z])$/.exec(s);
    if (!m) {
      const plain = parseInt(s, 10);                         // a bare number is accepted as a seed
      return /^\d{1,10}$/.test(s) && plain > 0 ? { seed: plain >>> 0, corp: null, diff: 'normal' } : null;
    }
    const body = m[1] + '-' + m[2] + '-' + m[3];
    if (check(body) !== m[4]) return null;
    const seed = parseInt(m[1], 36) >>> 0;
    if (!seed) return null;
    return { seed, corp: AS.CORP_KEYS[CORP_L.indexOf(m[2])] || null, diff: AS.DIFF_KEYS[DIFF_L.indexOf(m[3])] || 'normal' };
  };

})(globalThis.AS = globalThis.AS || {});
