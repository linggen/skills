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
// Reverb / echo / key shift come later (step 3); this is capture + mix + meter.
// Mic settings are tuned for SINGING, not calls: echo-cancellation /
// noise-suppression / auto-gain are off so the voice isn't pumped or gated.

export class KaraokeAudio {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.micGain = null;
    this.analyser = null;
    this.micStream = null;
    this.micNode = null;
    this.sources = new WeakMap(); // media element → its one MediaElementSourceNode
    this.micOn = false;
    this.voice = 1; // remembered voice level, so mute/unmute restores it
    this._buf = new Uint8Array(0);
  }

  // The engine is "active" once the context is built (mic may be on or off).
  get active() { return !!this.ctx; }

  // First enable: build the context (needs a user gesture — the mic tap), route
  // the active media element through the graph, then start the mic. Resolves
  // true; rejects if the mic is blocked/absent so the caller can explain.
  async enable(activeEl) {
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
    }
    await this.ctx.resume();
    if (activeEl) this.attachMusic(activeEl);
    await this._micStart();
    return true;
  }

  // Acquire the mic and wire it into the mix + meter.
  async _micStart() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.micStream = stream;
    this.micNode = this.ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.micGain);
    this.micNode.connect(this.analyser);
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
    src.connect(this.musicGain);
    this.sources.set(el, src);
  }

  setMusic(v) { if (this.musicGain) this.musicGain.gain.value = v; }
  setVoice(v) { this.voice = v; if (this.micGain && this.micOn) this.micGain.gain.value = v; }

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
