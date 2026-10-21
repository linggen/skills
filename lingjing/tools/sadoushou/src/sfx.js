// sfx.js — 守山门's sounds (a copy of 撒豆成兵's, tools/sadou/src/sfx.js), made on the spot with WebAudio (no files):
// a pop for each soldier joining, a chime for a good gate, a sour buzz for a trap, thuds for the clash and the boss.
// Silent until the first touch or key (iOS asks for a gesture); rate-limited so a storm of events stays a texture.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.on = true;
  }

  wake() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.4;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  }

  gap(name, ms) {
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < ms) return false;
    this.last[name] = now;
    return Boolean(this.ctx && this.on);
  }

  tone(freq, dur, { type = 'sine', vol = 0.5, to = null, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, { vol = 0.4, freq = 900, q = 0.8, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  pop() { if (this.gap('pop', 35)) this.tone(500 + Math.random() * 500, 0.07, { type: 'triangle', vol: 0.18, to: 1400 }); }
  good() {
    if (!this.gap('good', 120)) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.32, at: i * 0.05 }));
  }
  bad() {
    if (!this.gap('bad', 120)) return;
    this.tone(220, 0.35, { type: 'sawtooth', vol: 0.22, to: 90 });
    this.tone(233, 0.35, { type: 'square', vol: 0.08, to: 95 });
  }
  thud() { if (this.gap('thud', 60)) { this.tone(120, 0.12, { vol: 0.5, to: 50 }); this.hiss(0.08, { vol: 0.25, freq: 600 }); } }
  hit() { if (this.gap('hit', 50)) { this.tone(180 + Math.random() * 60, 0.09, { type: 'square', vol: 0.14, to: 70 }); this.hiss(0.06, { vol: 0.2, freq: 1800 }); } }
  slam() { if (this.gap('slam', 300)) { this.tone(70, 0.5, { vol: 0.8, to: 30 }); this.hiss(0.4, { vol: 0.5, freq: 300, q: 0.5 }); } }
  tick() { if (this.gap('tick', 200)) this.tone(880, 0.12, { type: 'square', vol: 0.12 }); }
  go() { if (this.gap('go', 200)) [660, 990].forEach((f, i) => this.tone(f, 0.2, { type: 'square', vol: 0.14, at: i * 0.08 })); }
  win() { if (this.gap('win', 1000)) [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.3, at: i * 0.09 })); }
  lose() { if (this.gap('lose', 1000)) [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.25, at: i * 0.14 })); }
  close() { this.ctx?.close?.(); this.ctx = null; }
}
