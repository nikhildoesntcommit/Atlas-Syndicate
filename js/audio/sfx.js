/* ATLAS SYNDICATE v4 — audio/sfx.js
   WebAudio context, mix buses (master / music / sfx) and procedural sound effects.
   Nothing is loaded: every sound is synthesised. Audio starts after the first user gesture. */
(function (AS) {
  'use strict';

  const A = AS.Sfx = { ctx: null, master: null, sfxBus: null, musicBus: null, noise: null, last: {}, ready: false };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      const c = A.ctx = new AC();
      A.master = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      A.master.connect(comp); comp.connect(c.destination);
      A.sfxBus = c.createGain(); A.sfxBus.connect(A.master);
      A.musicBus = c.createGain(); A.musicBus.connect(A.master);
      const len = c.sampleRate;
      A.noise = c.createBuffer(1, len, c.sampleRate);
      const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.applyVolumes();
      A.ready = true;
      if (AS.Music) AS.Music.start();
    } catch (e) { A.ctx = null; }
  };
  A.applyVolumes = function () {
    if (!A.ctx) return;
    const s = AS.G.settings || { music: 0.6, sfx: 0.8, mute: false };
    const t = A.ctx.currentTime;
    A.master.gain.setTargetAtTime(s.mute ? 0 : 0.8, t, 0.05);
    A.sfxBus.gain.setTargetAtTime(s.sfx * 0.9, t, 0.05);
    A.musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
  };

  /* ---------- voices ---------- */
  A.tone = function (freq, dur, type, vol, slideTo, delay, bus) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || A.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  };
  A.hiss = function (dur, vol, f0, f1, type, delay, q, bus) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = A.noise;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    if (q) f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || A.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  };
  /** Metallic clank: inharmonic FM partials with a fast decay (struck steel). */
  A.metal = function (freq, dur, vol, delay, bus) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = freq; mod.frequency.value = freq * 1.414;
    mg.gain.setValueAtTime(freq * 2.2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(bus || A.sfxBus);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  };
  A.thud = function (freq, dur, vol, delay, bus) {
    A.tone(freq, dur, 'sine', vol, freq * 0.4, delay, bus);
    A.hiss(dur * 0.4, vol * 0.4, 900, 120, 'lowpass', delay, 0, bus);
  };

  const GAP = { sale: 0.22, arrive: 0.18, depart: 0.25, click: 0.03, err: 0.12, alarm: 0.6, megaDrop: 0.15, build: 0.08, built: 0.1, warning: 0.8 };
  A.play = function (name) {
    if (!A.ctx || A.ctx.state !== 'running' || (AS.G.settings && AS.G.settings.mute)) return;
    const now = A.ctx.currentTime;
    if (A.last[name] && now - A.last[name] < (GAP[name] || 0.05)) return;
    A.last[name] = now;
    try {
      switch (name) {
        case 'click': A.hiss(0.025, 0.18, 4200, 1600, 'bandpass', 0, 2); A.metal(1900, 0.03, 0.03); break;
        case 'err': A.tone(98, 0.14, 'square', 0.05); A.tone(92, 0.14, 'square', 0.04, 0, 0.07); break;
        case 'claim': A.thud(70, 0.4, 0.4); [147, 196, 247, 294].forEach((f, i) => A.tone(f, 0.24, 'square', 0.035, 0, 0.05 + i * 0.09)); A.metal(587, 0.6, 0.06, 0.4); break;
        case 'build': A.hiss(0.08, 0.25, 2600, 400, 'bandpass', 0, 3); A.metal(220, 0.25, 0.08, 0.02); A.metal(330, 0.2, 0.06, 0.14); A.hiss(0.06, 0.2, 3200, 800, 'bandpass', 0.18, 3); break;
        case 'built': A.metal(440, 0.35, 0.07); A.metal(660, 0.4, 0.05, 0.08); A.thud(90, 0.2, 0.18); break;
        case 'route': A.tone(196, 0.1, 'square', 0.04); A.tone(294, 0.14, 'square', 0.04, 0, 0.09); A.hiss(0.3, 0.06, 300, 3000, 'bandpass', 0.05, 4); break;
        case 'depart': A.hiss(0.6, 0.07, 200, 1400, 'bandpass', 0, 3); A.tone(55, 0.5, 'sawtooth', 0.025, 90); break;
        case 'arrive': A.hiss(0.08, 0.12, 900, 200); A.metal(180, 0.15, 0.05, 0.04); break;
        case 'sale': A.metal(1320, 0.12, 0.035); A.metal(1760, 0.16, 0.025, 0.05); break;
        case 'megaDrop': A.metal(262, 0.3, 0.06); A.thud(80, 0.25, 0.2, 0.02); break;
        case 'warning': A.tone(440, 0.12, 'square', 0.035); A.tone(440, 0.12, 'square', 0.035, 0, 0.2); break;
        case 'alarm': for (let i = 0; i < 3; i++) { A.tone(523, 0.16, 'square', 0.05, 392, i * 0.32); A.tone(262, 0.16, 'sawtooth', 0.03, 196, i * 0.32); } break;
        case 'lost': A.hiss(1.4, 0.35, 1400, 40); A.tone(110, 1.2, 'sawtooth', 0.08, 28); A.metal(147, 1.2, 0.08, 0.1); break;
        case 'quarterGood': [262, 330, 392, 523].forEach((f, i) => A.tone(f, 0.22, 'square', 0.045, 0, i * 0.09)); A.metal(1047, 0.6, 0.05, 0.36); break;
        case 'quarterBad': A.tone(196, 0.32, 'square', 0.05, 98); A.tone(147, 0.5, 'sawtooth', 0.04, 73, 0.25); A.thud(60, 0.5, 0.3, 0.25); break;
        case 'contract': [392, 523, 659, 784].forEach((f, i) => A.tone(f, 0.14, 'square', 0.045, 0, i * 0.06)); break;
        case 'good': [392, 523, 659].forEach((f, i) => A.tone(f, 0.14, 'square', 0.04, 0, i * 0.07)); break;
        case 'bad': A.tone(196, 0.3, 'square', 0.05, 98); break;
        case 'notice': A.tone(523, 0.08, 'square', 0.04); A.tone(392, 0.12, 'square', 0.04, 0, 0.09); break;
        case 'event': A.tone(220, 0.2, 'sawtooth', 0.045, 150); A.tone(220, 0.2, 'sawtooth', 0.045, 150, 0.24); break;
        case 'discover': for (let i = 0; i < 3; i++) A.tone(1046, 0.5, 'sine', 0.05 / (i + 1), 1040, i * 0.35); A.tone(523, 0.9, 'triangle', 0.03); break;
        case 'impact': A.thud(45, 0.9, 0.6); A.hiss(1.2, 0.4, 2400, 60); A.metal(98, 0.8, 0.08, 0.05); break;
        case 'flare': A.hiss(2.0, 0.25, 6000, 200, 'highpass'); A.tone(70, 1.6, 'sawtooth', 0.05, 35); break;
        case 'perk': A.metal(784, 0.4, 0.06); [523, 659, 784, 1047].forEach((f, i) => A.tone(f, 0.18, 'triangle', 0.05, 0, i * 0.07)); break;
        case 'buy': A.hiss(0.1, 0.2, 2000, 300, 'bandpass', 0, 3); A.tone(392, 0.12, 'square', 0.045, 0, 0.05); break;
        case 'remove': A.tone(300, 0.15, 'square', 0.045, 120); A.metal(150, 0.3, 0.05); break;
        case 'achievement': [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone(f, 0.2, 'square', 0.035, 0, i * 0.07)); A.metal(2093, 0.8, 0.03, 0.35); break;
        case 'megaUnlock': A.thud(40, 1.4, 0.5); [131, 165, 196, 262].forEach((f, i) => A.tone(f, 1.2, 'sawtooth', 0.03, 0, i * 0.25)); A.metal(523, 1.6, 0.07, 1.0); break;
        case 'megaStage': A.thud(50, 1.0, 0.5); [196, 247, 294, 392].forEach((f, i) => A.tone(f, 0.4, 'square', 0.04, 0, i * 0.1)); A.metal(784, 1.2, 0.06, 0.4); break;
        case 'megaDone':
          A.thud(35, 2.4, 0.7); A.hiss(3.0, 0.2, 200, 8000, 'bandpass', 0, 1);
          [131, 196, 262, 330, 392, 523].forEach((f, i) => A.tone(f, 2.2, 'sawtooth', 0.025, 0, 0.4 + i * 0.3));
          [1047, 1319, 1568, 2093].forEach((f, i) => A.metal(f, 1.6, 0.05, 2.6 + i * 0.12));
          A.thud(30, 2.5, 0.8, 2.6); A.hiss(2.5, 0.4, 5000, 80, 'lowpass', 2.6);
          break;
        case 'start': A.thud(55, 0.8, 0.4); A.metal(262, 1.0, 0.06, 0.1); A.metal(392, 1.0, 0.05, 0.25); break;
        case 'type': A.hiss(0.02, 0.12, 5000, 2000, 'bandpass', 0, 3); break;
        case 'boost': A.tone(110, 0.7, 'sawtooth', 0.05, 440); A.hiss(0.6, 0.15, 400, 5000, 'bandpass', 0, 2); A.metal(880, 0.4, 0.04, 0.35); break;
        case 'deflect': A.tone(1400, 0.12, 'square', 0.05, 300); A.thud(70, 0.4, 0.35, 0.08); A.hiss(0.6, 0.3, 3000, 100, 'lowpass', 0.08); A.metal(1175, 0.5, 0.05, 0.1); break;
        case 'warp': A.thud(30, 2.0, 0.6); A.hiss(2.2, 0.3, 150, 9000, 'bandpass', 0, 1); [196, 262, 392, 523, 784].forEach((f, i) => A.tone(f, 1.0, 'sawtooth', 0.025, f * 2, 0.15 + i * 0.12)); A.metal(1568, 1.4, 0.05, 1.0); break;
      }
    } catch (e) { /* audio must never break the game */ }
  };
})(globalThis.AS = globalThis.AS || {});
