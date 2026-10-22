// sound.js — the small games' one sound layer, owned by the shell (Hanli 10-22: 「还没加声效吗」 → 「开吧. 统一做进外壳」;
// doc/game-kit.md § Sound). A game never plays audio itself: it names what happened (`shell.sound('hit')`, or the
// shell's own moments — a button, the 3-2-1, 开始, the result), and data says what that sounds like:
//
//   audio/sounds.json   the sound ids (a slice of the CC0 sprite, or a ZzFX recipe) and, per game, event → sound:
//                       the game's own row, else its kit's (塔防, 投掷, 绳索 …), else the shell's base row. One bed of
//                       music per kit.
//   audio/bank.json     where each slice sits in sfx.ogg / sfx.m4a and the beds' files (built by tools/sound/build.mjs).
//
// One AudioContext for the page, made on the first touch, click or key (iOS will not start one otherwise). A storm of
// events stays a texture: each event has a least gap (`min` ms), and at most VOICES sounds play at once; everything
// goes through a compressor, so 300 hits a second never clip. Settings (音效 · 音乐, on/off and volume) are one for
// every game, kept in this browser (localStorage, never the save). Muted is silent: no source is started at all.
//
// Nothing runs at import: Node tests import the shell. `createSound({ AC, fetchJson, fetchBuf, storage, now })` is the
// engine with everything injected; `sound` is the page's one.
import { ZZFX } from '../../vendor/zzfx-1.4.0.mjs';

export const VOICES = 14;
export const MIN_MS = 30; // the least gap of an event that names none
export const DEFAULTS = Object.freeze({ sfx: { on: true, vol: 0.8 }, music: { on: true, vol: 0.3 }, muted: false });
/** What actually sounds: a part on, above zero, and the one mute (the shell's bar button) off. The mute leaves the
    parts' own settings alone, so unmuting brings back exactly what was set. */
export const audible = (st, k) => Boolean(!st.muted && st[k].on && st[k].vol > 0);
const KEY = 'lingjing.sound';
const DUCK = 0.25; // the bed under the pause veil
const RATE = 44100;

/* ── Data: what an event sounds like ── */

/** An event's rule, as written (a sound id, a list to pick from, or { sound, min, vol }), made one shape. */
export function ruleOf(v) {
  if (v == null) return null;
  if (typeof v === 'string' || Array.isArray(v)) return { sounds: [v].flat(), min: MIN_MS, vol: 1 };
  return { sounds: [v.sound].flat().filter(Boolean), min: v.min ?? MIN_MS, vol: v.vol ?? 1 };
}

/** The kit a game plays on (sounds.json games[id].kit), else the shell's plain board. */
export const kitOf = (maps, game) => maps?.games?.[game]?.kit ?? 'board';

/** What `event` sounds like in `game`: its own row, its kit's, then the shell's base. A `kind` (a fire 符's boom, a
    grade) is looked up first as `event.kind`. A row written `null` is silence on purpose and stops the search. */
export function resolve(maps, game, event, kind) {
  const rows = [maps?.games?.[game]?.events, maps?.kits?.[kitOf(maps, game)]?.events, maps?.base];
  for (const key of kind != null ? [`${event}.${kind}`, event] : [event]) {
    for (const row of rows) if (row && Object.hasOwn(row, key)) return ruleOf(row[key]);
  }
  return null;
}

/** The bed a game's kit plays (sounds.json kits[kit].music), or null. */
export const musicOf = (maps, game) => maps?.kits?.[kitOf(maps, game)]?.music ?? null;

/** Every sound id a rule anywhere in the maps names — the test holds each to the bank. */
export function namedSounds(maps) {
  const rows = [maps?.base, ...Object.values(maps?.kits ?? {}).map((k) => k.events), ...Object.values(maps?.games ?? {}).map((g) => g.events)];
  return new Set(rows.flatMap((r) => Object.values(r ?? {}).flatMap((v) => ruleOf(v)?.sounds ?? [])));
}

/* ── Settings: one for every game ── */

const clamp01 = (x, d) => (Number.isFinite(Number(x)) ? Math.min(1, Math.max(0, Number(x))) : d);
export function readSettings(storage) {
  let got = null;
  try { got = JSON.parse(storage?.getItem(KEY) ?? 'null'); } catch { got = null; }
  const part = (k) => ({ on: typeof got?.[k]?.on === 'boolean' ? got[k].on : DEFAULTS[k].on, vol: clamp01(got?.[k]?.vol, DEFAULTS[k].vol) });
  return { sfx: part('sfx'), music: part('music'), muted: got?.muted === true };
}
export function writeSettings(storage, s) { try { storage?.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: this visit only */ } }

/* ── ZzFX recipes → samples (made once, at load) ── */

/** A recipe's samples: ZZFX.buildSamples(...zzfx), or, with `notes` (semitones), that sound once per note, `step` s apart. */
export function zzfxSamples({ zzfx, notes = null, step = 0.08 }) {
  ZZFX.sampleRate = RATE;
  const one = (shift) => { const p = [...zzfx]; p[1] = 0; p[2] = (p[2] ?? 220) * 2 ** (shift / 12); return ZZFX.buildSamples(...p); };
  if (!notes?.length) return one(0);
  const parts = notes.map(one), gap = Math.round(step * RATE);
  const out = new Float32Array(Math.max(...parts.map((p, i) => i * gap + p.length)));
  parts.forEach((p, i) => { for (let j = 0; j < p.length; j += 1) out[i * gap + j] += p[j]; });
  return out;
}

/* ── The engine ── */

export function createSound({ AC = null, fetchJson = null, fetchBuf = null, storage = null, now = () => Date.now(), base = null, canPlay = null } = {}) {
  let settings = readSettings(storage);
  let ctx = null, maps = null, bank = null, ready = null, sprite = null, sfxBus = null, musicBus = null, voices = 0;
  const tones = new Map(), beds = new Map(), last = new Map();
  const log = []; // the last plays (dev: window.__lingjingSound.log)
  let bed = null; // { board, game, id, src, gain, ducked }
  const heard = { events: 0, played: 0, dropped: 0 };

  const ext = () => (canPlay?.('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a');
  const url = (p) => (base ? new URL(p, base).href : p);

  async function load() {
    [maps, bank] = await Promise.all([fetchJson(url('sounds.json')), fetchJson(url('bank.json'))]);
    for (const [id, def] of Object.entries(maps.sounds ?? {})) {
      if (!def.zzfx) continue;
      const s = zzfxSamples(def), b = ctx.createBuffer(1, s.length, RATE);
      b.getChannelData(0).set(s);
      tones.set(id, b);
    }
    sprite = await ctx.decodeAudioData(await fetchBuf(url(bank.sprite[ext()])));
    startBed();
  }

  function graph() {
    const comp = ctx.createDynamicsCompressor?.() ?? null;
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    if (comp) { sfxBus.connect(comp); comp.connect(ctx.destination); } else sfxBus.connect(ctx.destination);
    musicBus.connect(ctx.destination);
    levels();
  }
  function levels() {
    if (sfxBus) sfxBus.gain.value = audible(settings, 'sfx') ? settings.sfx.vol : 0;
    if (musicBus) musicBus.gain.value = audible(settings, 'music') ? settings.music.vol : 0;
  }

  /** A touch, click or key: the context is made (once) or woken. Answers the load. */
  function wake() {
    if (!AC) return Promise.resolve(false);
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { console.warn('[sound]', e); AC = null; return Promise.resolve(false); }
      graph();
      ready = load().then(() => true, (e) => { console.warn('[sound] bank', e); return false; });
    }
    if (ctx.state === 'suspended') ctx.resume?.().catch?.(() => {});
    return ready;
  }

  function voice(buffer, { offset = 0, dur, vol = 1, loop = false, bus = sfxBus } = {}) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    g.gain.value = vol;
    src.connect(g);
    g.connect(bus);
    if (loop) src.start(0); else src.start(0, offset, dur);
    return { src, gain: g };
  }

  /** An event in `game`: what the data says it sounds like, if anything, and if there is room for it. */
  function play(game, event, { kind } = {}) {
    heard.events += 1;
    if (!audible(settings, 'sfx') || !ctx || !maps || !sprite) return false;
    const rule = resolve(maps, game, event, kind);
    if (!rule?.sounds.length) return false;
    const key = `${game}|${event}`, t = now();
    if (t - (last.get(key) ?? -Infinity) < rule.min || voices >= VOICES) { heard.dropped += 1; return false; }
    last.set(key, t);
    const id = rule.sounds[Math.floor(Math.random() * rule.sounds.length)];
    const def = maps.sounds?.[id];
    const slices = def?.sprite?.map((k) => bank.sprite.map[k]).filter(Boolean) ?? [];
    const slice = slices[Math.floor(Math.random() * slices.length)];
    const buffer = tones.get(id) ?? (slice ? sprite : null);
    if (!buffer) return false;
    const v = voice(buffer, { offset: slice?.[0] ?? 0, dur: slice?.[1], vol: rule.vol * (def.vol ?? 1) });
    voices += 1;
    v.src.onended = () => { voices -= 1; v.gain.disconnect(); };
    heard.played += 1;
    log.push({ at: t, game, event, sound: id });
    if (log.length > 60) log.shift();
    return true;
  }

  /* The bed: one at a time, owned by a board. */
  async function startBed() {
    if (!bed || bed.src || !ctx || !bank || !maps || !audible(settings, 'music')) return;
    const want = bed;
    want.id = musicOf(maps, want.game);
    const files = bank.music?.[want.id];
    if (!files) return;
    if (!beds.has(want.id)) beds.set(want.id, fetchBuf(url(files[ext()])).then((b) => ctx.decodeAudioData(b)).catch((e) => { console.warn('[sound] bed', e); return null; }));
    const buf = await beds.get(want.id);
    if (!buf || bed !== want || want.src || !audible(settings, 'music')) return;
    const v = voice(buf, { loop: true, vol: 0, bus: musicBus });
    want.src = v.src;
    want.gain = v.gain;
    fade(want, want.ducked ? DUCK : 1, 1.2);
  }
  function fade(b, to, s) {
    const g = b.gain?.gain;
    if (!g) return;
    const t = ctx.currentTime;
    g.cancelScheduledValues?.(t);
    g.setValueAtTime?.(g.value, t);
    if (g.linearRampToValueAtTime) g.linearRampToValueAtTime(to, t + s); else g.value = to;
  }
  function endBed(b) {
    if (!b?.src) return;
    fade(b, 0, 0.6);
    const src = b.src;
    setTimeout(() => { try { src.stop(); } catch { /* already */ } b.gain?.disconnect(); }, 700);
    b.src = null;
  }

  function apply() {
    writeSettings(storage, settings);
    levels();
    if (!audible(settings, 'music')) endBed(bed); else if (bed && !bed.src) startBed();
    return structuredClone(settings);
  }

  return {
    wake,
    play,
    /** `board` plays now: its kit's bed loops (the last board's stops). */
    music(board, game) {
      if (bed?.board === board && bed.game === game) return;
      endBed(bed);
      bed = { board, game, src: null, ducked: false };
      startBed(); // now, or once the bank is in (load)
    },
    /** The pause veil: the bed goes quiet under it, and back. */
    duck(board, on) { if (bed?.board !== board) return; bed.ducked = Boolean(on); if (bed.src) fade(bed, on ? DUCK : 1, 0.3); },
    /** The board is done (its result, or it left): its bed stops. */
    stop(board) { if (board != null && bed?.board !== board) return; endBed(bed); bed = null; },
    settings: () => structuredClone(settings),
    /** A part's own setting (the pause veil). Turning a part on also lifts the mute: the player asked to hear it. */
    set(part, patch) {
      settings = { ...settings, [part]: { ...settings[part], ...patch }, ...(patch.on ? { muted: false } : {}) };
      return apply();
    },
    /** The one mute (the shell's bar): both parts silent at once, their own settings kept for unmute. */
    mute(on) { settings = { ...settings, muted: Boolean(on) }; return apply(); },
    /** The tab hidden: nothing plays; back: it goes on. */
    hidden(on) { if (!ctx) return; if (on) ctx.suspend?.(); else ctx.resume?.(); },
    state: () => ({ ctx: ctx?.state ?? 'none', loaded: Boolean(sprite), voices, bed: bed ? { board: bed.board, id: bed.id, playing: Boolean(bed.src), ducked: bed.ducked } : null, ...heard, settings: structuredClone(settings) }),
    log,
  };
}

/* ── The page's one ── */

const win = globalThis.window;
export const sound = createSound(win ? {
  AC: win.AudioContext || win.webkitAudioContext || null,
  fetchJson: (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }),
  fetchBuf: (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.arrayBuffer(); }),
  storage: (() => { try { return win.localStorage; } catch { return null; } })(),
  base: new URL('./audio/', import.meta.url).href,
  canPlay: (t) => { try { return Boolean(new win.Audio().canPlayType(t)); } catch { return false; } },
} : {});

let unlocked = false;
/** The page's first touch, click or key wakes the one context; a hidden tab holds it. Once per page. */
export function unlockOn(doc = globalThis.document) {
  if (unlocked || !doc?.addEventListener) return;
  unlocked = true;
  const go = () => { sound.wake(); };
  for (const t of ['pointerdown', 'touchend', 'keydown', 'click']) doc.addEventListener(t, go, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => sound.hidden(doc.visibilityState === 'hidden'));
  if (win) win.__lingjingSound = { state: () => sound.state(), log: sound.log, play: (game, event, o) => sound.play(game, event, o) };
}
