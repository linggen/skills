// pitch-shift.js — a pure-Web-Audio granular pitch shifter (no WASM, no deps).
//
// This is the well-known "Jungle" two-delay-line technique: two delay taps whose
// delay times are swept by looping ramp buffers (that's what shifts the pitch),
// crossfaded by a second pair of looping buffers so the seam where a ramp resets
// is masked. Tempo is preserved. Quality is "good enough for a karaoke key nudge"
// — clean around ±1–2 semitones, with audible warble as the shift grows.
//
// createPitchShifter(ctx) → { input, output, setSemitones(n) }. Route audio
// input → output; call setSemitones(0) to sit transparent (the caller should
// bypass entirely at 0 to avoid even the small artifacts).

const DELAY_TIME = 0.100;
const FADE_TIME = 0.050;
const BUFFER_TIME = 0.100;

// Crossfade envelope: ramps up, holds, ramps down (then silent while the other tap runs).
function createFadeBuffer(ctx, activeTime, fadeTime) {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);
  const fadeLength = fadeTime * ctx.sampleRate;
  const fadeIndex1 = fadeLength;
  const fadeIndex2 = length1 - fadeLength;
  for (let i = 0; i < length1; ++i) {
    let v;
    if (i < fadeIndex1) v = Math.sqrt(i / fadeLength);
    else if (i >= fadeIndex2) v = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
    else v = 1;
    p[i] = v;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

// Sawtooth ramp that drives a delay line's delayTime (the pitch sweep).
function createDelayTimeBuffer(ctx, activeTime, fadeTime, shiftUp) {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);
  for (let i = 0; i < length1; ++i) p[i] = shiftUp ? (length1 - i) / length : i / length1;
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

export function createPitchShifter(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const shiftDown = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
  const shiftUp = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);

  // Four delay-time modulators: 1/2 sweep down, 3/4 sweep up; gains pick direction.
  const mod1 = ctx.createBufferSource(); mod1.buffer = shiftDown;
  const mod2 = ctx.createBufferSource(); mod2.buffer = shiftDown;
  const mod3 = ctx.createBufferSource(); mod3.buffer = shiftUp;
  const mod4 = ctx.createBufferSource(); mod4.buffer = shiftUp;
  [mod1, mod2, mod3, mod4].forEach((m) => { m.loop = true; });

  const mod1Gain = ctx.createGain();
  const mod2Gain = ctx.createGain();
  const mod3Gain = ctx.createGain(); mod3Gain.gain.value = 0;
  const mod4Gain = ctx.createGain(); mod4Gain.gain.value = 0;
  mod1.connect(mod1Gain); mod2.connect(mod2Gain);
  mod3.connect(mod3Gain); mod4.connect(mod4Gain);

  // Per-tap delay amount (how far the sweep reaches = how big the pitch shift).
  const modGain1 = ctx.createGain();
  const modGain2 = ctx.createGain();
  const delay1 = ctx.createDelay();
  const delay2 = ctx.createDelay();
  mod1Gain.connect(modGain1); mod3Gain.connect(modGain1);
  mod2Gain.connect(modGain2); mod4Gain.connect(modGain2);
  modGain1.connect(delay1.delayTime);
  modGain2.connect(delay2.delayTime);

  // Crossfade between the two taps.
  const fade1 = ctx.createBufferSource();
  const fade2 = ctx.createBufferSource();
  const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);
  fade1.buffer = fadeBuffer; fade2.buffer = fadeBuffer;
  fade1.loop = true; fade2.loop = true;
  const mix1 = ctx.createGain(); mix1.gain.value = 0;
  const mix2 = ctx.createGain(); mix2.gain.value = 0;
  fade1.connect(mix1.gain); fade2.connect(mix2.gain);

  input.connect(delay1); input.connect(delay2);
  delay1.connect(mix1); delay2.connect(mix2);
  mix1.connect(output); mix2.connect(output);

  const t = ctx.currentTime + 0.050;
  const t2 = t + BUFFER_TIME - FADE_TIME;
  mod1.start(t); mod2.start(t2); mod3.start(t); mod4.start(t2);
  fade1.start(t); fade2.start(t2);

  function setDelay(d) {
    modGain1.gain.setTargetAtTime(0.5 * d, ctx.currentTime, 0.01);
    modGain2.gain.setTargetAtTime(0.5 * d, ctx.currentTime, 0.01);
  }

  // n = semitones (+up / -down). 12 semitones = one octave = full sweep.
  function setSemitones(n) {
    const mult = n / 12;
    const up = mult > 0;
    mod1Gain.gain.value = up ? 0 : 1;
    mod2Gain.gain.value = up ? 0 : 1;
    mod3Gain.gain.value = up ? 1 : 0;
    mod4Gain.gain.value = up ? 1 : 0;
    setDelay(DELAY_TIME * Math.abs(mult));
  }

  return { input, output, setSemitones };
}
