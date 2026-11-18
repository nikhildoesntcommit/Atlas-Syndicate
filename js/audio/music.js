/* ATLAS SYNDICATE v4 — audio/music.js
   Procedural industrial soundtrack. A look-ahead step sequencer drives five layers that fade in
   with intensity: 0 drone, 1 machine percussion, 2 bass pulse + struck-metal tones, 3 hats,
   4 megaproject drive (arpeggio, faster tempo). Low Board confidence adds a dissonant undertone. */
(function (AS) {
  'use strict';

  const M = AS.Music = { on: false, step: 0, nextT: 0, intensity: 0, target: 0, layers: null, bpm: 92, tension: 0 };
  const ROOTS = [73.42, 58.27, 87.31, 65.41];          // D, Bb, F, C (low octave)
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];            // minor pentatonic-ish, semitones
  const BELL = [0, 7, 3, -1, 10, -1, 5, -1, 12, -1, 7, 3, -1, 15, -1, -1];

  M.start = function () {
    const A = AS.Sfx;
    if (M.on || !A.ctx) return;
    const c = A.ctx;
    M.layers = {};
    for (const k of ['drone', 'perc', 'bass', 'bell', 'hats', 'drive', 'tension']) {
      const g = c.createGain(); g.gain.value = 0; g.connect(A.musicBus); M.layers[k] = g;
    }
    // drone: detuned saws through a slowly swept low-pass, plus filtered noise "machine room"
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 3;
    f.connect(M.layers.drone);
    M.droneOsc = [];
    for (const [mul, type, det] of [[1, 'sawtooth', -6], [1, 'sawtooth', 7], [1.5, 'triangle', 0], [0.5, 'sine', 0]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = ROOTS[0] * mul; o.detune.value = det; o.connect(f); o.start();
      M.droneOsc.push([o, mul]);
    }
    const ns = c.createBufferSource(); ns.buffer = A.noise; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 260; nf.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = 0.12;
    ns.connect(nf); nf.connect(ng); ng.connect(f); ns.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.04;
    const lg = c.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    // tension: tritone pair, slow beating
    const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 400; tf.connect(M.layers.tension);
    for (const fr of [103.8, 104.6, 146.8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(tf); o.start(); }
    M.nextT = c.currentTime + 0.1;
    M.on = true;
  };

  function note(layer, freq, t, dur, type, vol, cutoff) {
    const c = AS.Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(cutoff * 3, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + dur * 0.6);
      o.connect(f); f.connect(g);
    } else o.connect(g);
    g.connect(M.layers[layer]);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, vol) {
    const c = AS.Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(M.layers.perc); o.start(t); o.stop(t + 0.4);
  }
  function noiseHit(layer, t, dur, vol, f, type, q) {
    const c = AS.Sfx.ctx, s = c.createBufferSource(); s.buffer = AS.Sfx.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(M.layers[layer]); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }
  function metal(layer, freq, t, dur, vol) {
    const c = AS.Sfx.ctx;
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * 1.41;
    mg.gain.setValueAtTime(freq * 1.6, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(M.layers[layer]);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  function schedule(i, t) {
    const lvl = M.intensity, s = i % 32, bar = Math.floor(i / 32);
    const root = ROOTS[bar % 4];
    const st = 60 / M.bpm / 4;
    if (s === 0) for (const [o, mul] of M.droneOsc) o.frequency.setTargetAtTime(root * mul, t, 0.4);
    // machine percussion
    if (lvl >= 0.8) {
      if (s % 8 === 0) kick(t, 0.55);
      if (lvl >= 2.5 && (s === 14 || s === 30)) kick(t, 0.35);
      if (s % 8 === 4) { metal('perc', 190 + (bar % 2) * 30, t, 0.22, 0.09); noiseHit('perc', t, 0.08, 0.18, 1800, 'bandpass', 4); }
      if (s % 16 === 11) metal('perc', 610, t, 0.12, 0.035);
    }
    // bass pulse in eighths
    if (lvl >= 1.8 && s % 2 === 0) {
      const oct = (s % 8 === 6) ? 2 : 1;
      note('bass', root * oct, t, st * 1.7, 'sawtooth', 0.12, 260 + lvl * 60);
    }
    // struck-metal tones, sparse
    if (lvl >= 1.6 && s % 2 === 0) {
      const sem = BELL[(s / 2 + bar * 3) % 16];
      if (sem >= 0 && ((s + bar) % 6 !== 0)) metal('bell', root * 4 * Math.pow(2, sem / 12), t, 1.2, 0.045);
    }
    // hats
    if (lvl >= 2.8) noiseHit('hats', t, s % 4 === 2 ? 0.09 : 0.04, s % 4 === 2 ? 0.12 : 0.06, 7000, 'highpass', 1);
    // megaproject drive: rising arpeggio
    if (lvl >= 3.8) {
      const idx = SCALE[(s * 3 + bar) % SCALE.length];
      note('drive', root * 2 * Math.pow(2, idx / 12), t, st * 0.9, 'square', 0.05, 900 + (s % 8) * 120);
      if (s % 4 === 0) noiseHit('drive', t, 0.16, 0.12, 2400, 'bandpass', 2);
    }
  }

  const LAYER_ON = { drone: 0, perc: 0.8, bass: 1.8, bell: 1.6, hats: 2.8, drive: 3.8 };
  /** Called every frame with the desired intensity (0..5) and tension (0..1). */
  M.update = function (target, tension) {
    const A = AS.Sfx;
    if (!M.on || !A.ctx) return;
    const c = A.ctx, now = c.currentTime;
    M.intensity += (target - M.intensity) * 0.02;
    M.bpm = 92 + Math.max(0, M.intensity - 3) * 10;
    for (const k in LAYER_ON) {
      const v = k === 'drone' ? 0.5 : U.clamp((M.intensity - LAYER_ON[k] + 0.4) / 0.6, 0, 1);
      M.layers[k].gain.setTargetAtTime(v * (k === 'drone' ? 1 : 0.9), now, 0.5);
    }
    M.layers.tension.gain.setTargetAtTime(tension * 0.05, now, 0.8);
    if (M.nextT < now - 0.5) M.nextT = now + 0.05;   // tab was asleep: skip, do not burst
    while (M.nextT < now + 0.25) {
      try { schedule(M.step, M.nextT); } catch (e) { /* ignore */ }
      M.nextT += 60 / M.bpm / 4;
      M.step++;
    }
  };
  /** A short metallic swell used when the megaproject unlocks. */
  M.sting = function () {
    if (!M.on) return;
    const t = AS.Sfx.ctx.currentTime + 0.05;
    [1, 1.5, 2, 3].forEach((m, i) => metal('bell', ROOTS[0] * 4 * m, t + i * 0.15, 2.2, 0.05));
  };
  const U = AS.U;
})(globalThis.AS = globalThis.AS || {});
