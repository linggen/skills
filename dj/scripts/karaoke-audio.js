// karaoke-audio.js — the live karaoke audio engine.
//
// OFF until the singer turns the mic on. That keeps step-1 behaviour intact
// (the backing track plays straight to the output) and the first mic tap doubles
// as the user gesture the Web Audio AudioContext needs to start.
//
// When enabled, the graph is:
//
//     <audio>/<video> ──▶ musicGain ─┐
//                                     ├──▶ destination (speaker)
//     mic ──▶ micGain ───────────────┘
//        └──▶ analyser  (level meter only — not routed to the speaker)
//
// Mic settings are tuned for SINGING, not calls: echo-cancellation /
// noise-suppression / auto-gain are off so the voice isn't pumped or gated.
//
// The voice runs through an FX chain — dry + reverb + echo all summed into the
// Voice gain — so it sounds like karaoke, not a dry talk mic:
//
//     mic ─┬─▶ dry ───────────────────────┐
//          ├─▶ convolver ─▶ reverbWet ─────┼─▶ micGain ─▶ destination
//          └─▶ delay⟲feedback ─▶ echoWet ──┘
//          └─▶ analyser (meter)

import { createPitchShifter } from './pitch-shift.js';

// A synthetic reverb impulse: decaying stereo noise. Avoids shipping an IR file.
function makeImpulse(ctx, seconds = 2.2, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class KaraokeAudio {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.micGain = null;
    this.analyser = null;
    this.micStream = null;
    this.micNode = null;
    this.micDeviceId = null;
    this.outputDeviceId = null;
    this.sources = new WeakMap(); // media element → its one MediaElementSourceNode
    this.micOn = false;
    this.voice = 1; // remembered voice level, so mute/unmute restores it
    this._buf = new Uint8Array(0);
  }

  // The engine is "active" once the context is built (mic may be on or off).
  get active() { return !!this.ctx; }

  // Build the audio graph (context, music chain, voice FX) — but NOT the mic.
  // Needs a user gesture (the mic tap or a Key press). Routes the active media
  // element through the graph. Idempotent; safe to call from either control.
  async ensureEngine(activeEl) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain();
      this.micGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this._buf = new Uint8Array(this.analyser.fftSize);
      this.musicGain.connect(this.ctx.destination);
      this.micGain.connect(this.ctx.destination);

      // Music chain: media element → musicIn → (bypass | pitch shifter) → musicGain.
      this.musicIn = this.ctx.createGain();
      this.pitch = createPitchShifter(this.ctx);
      this.key = 0;
      this.musicIn.connect(this.musicGain); // key 0 = bypass the shifter

      // Voice FX chain — dry + reverb + echo all sum into micGain (= Voice level).
      this.dry = this.ctx.createGain();
      this.dry.connect(this.micGain);
      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = makeImpulse(this.ctx);
      this.reverbWet = this.ctx.createGain();
      this.reverbWet.gain.value = 0.3; // a little reverb by default = karaoke sound
      this.convolver.connect(this.reverbWet);
      this.reverbWet.connect(this.micGain);
      this.delay = this.ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.26;
      this.feedback = this.ctx.createGain();
      this.feedback.gain.value = 0.32; // ~3-4 audible repeats
      this.echoWet = this.ctx.createGain();
      this.echoWet.gain.value = 0;
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.echoWet);
      this.echoWet.connect(this.micGain);
    }
    await this.ctx.resume();
    if (this.outputDeviceId) this.setOutputDevice(this.outputDeviceId);
    if (activeEl) this.attachMusic(activeEl);
  }

  // Full mic enable: build the engine (gesture) + start the mic. Resolves true;
  // rejects if the mic is blocked/absent so the caller can explain.
  async enable(activeEl) {
    await this.ensureEngine(activeEl);
    await this._micStart();
    return true;
  }

  // Acquire the mic and wire it into the mix + meter.
  async _micStart() {
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    if (this.micDeviceId) audio.deviceId = { exact: this.micDeviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.micStream = stream;
    this.micNode = this.ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.dry);        // dry voice
    this.micNode.connect(this.convolver);  // → reverb send
    this.micNode.connect(this.delay);      // → echo send
    this.micNode.connect(this.analyser);   // → level meter
    this.micGain.gain.value = this.voice;
    this.micOn = true;
  }

  // Fully RELEASE the mic device (stops the tracks → the OS mic indicator goes
  // off), not just mute it. The context + music keep running.
  _micStop() {
    if (this.micNode) { this.micNode.disconnect(); this.micNode = null; }
    if (this.micStream) { this.micStream.getTracks().forEach((t) => t.stop()); this.micStream = null; }
    this.micOn = false;
  }

  // Route a media element's audio into the graph. A given element can only ever
  // have ONE source node (Web Audio rule), so this is idempotent per element —
  // call it for whichever element (audio or video) just became active.
  attachMusic(el) {
    if (!this.ctx || !el || this.sources.has(el)) return;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.musicIn);
    this.sources.set(el, src);
  }

  // Shift the BACKING TRACK's key by `semitones` (tempo preserved) so the singer
  // can match their range. 0 = bypass the shifter entirely (cleanest).
  setKey(semitones) {
    if (!this.ctx) return;
    this.key = semitones;
    try { this.musicIn.disconnect(); } catch { /* not connected */ }
    try { this.pitch.output.disconnect(); } catch { /* not connected */ }
    if (!semitones) {
      this.musicIn.connect(this.musicGain);
    } else {
      this.musicIn.connect(this.pitch.input);
      this.pitch.output.connect(this.musicGain);
      this.pitch.setSemitones(semitones);
    }
  }

  setMusic(v) { if (this.musicGain) this.musicGain.gain.value = v; }
  setVoice(v) { this.voice = v; if (this.micGain && this.micOn) this.micGain.gain.value = v; }

  // Choose the mic input device; re-acquire if the mic is already live.
  async setMicDevice(id) {
    this.micDeviceId = id || null;
    if (this.micOn) { this._micStop(); await this._micStart(); }
  }

  // Route the mix to a specific output device (Chrome ≥110 AudioContext.setSinkId).
  // Returns false if the browser can't redirect the context output.
  async setOutputDevice(id) {
    this.outputDeviceId = id || null;
    if (this.ctx && typeof this.ctx.setSinkId === 'function') {
      try { await this.ctx.setSinkId(id || ''); return true; } catch { return false; }
    }
    return false;
  }
  setReverb(v) { if (this.reverbWet) this.reverbWet.gain.value = v; }
  setEcho(v) { if (this.echoWet) this.echoWet.gain.value = v; }

  // Toggle the mic. OFF fully releases the device (indicator off); ON re-acquires
  // it. Async because acquiring is async. Returns the new on/off state.
  async toggleMic() {
    if (this.micOn) { this._micStop(); return false; }
    await this._micStart();
    return true;
  }

  // Current mic level, 0..1 (RMS, lightly gained for a lively meter).
  level() {
    if (!this.analyser || !this.micOn) return 0;
    this.analyser.getByteTimeDomainData(this._buf);
    let sum = 0;
    for (let i = 0; i < this._buf.length; i++) { const x = (this._buf[i] - 128) / 128; sum += x * x; }
    return Math.min(1, Math.sqrt(sum / this._buf.length) * 3);
  }

  // Release the mic device + tear down the context (e.g. on leaving the stage).
  dispose() {
    this._micStop();
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}
