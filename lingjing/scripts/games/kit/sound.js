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
// goes through a compressor, so 300 hits a second never clip. The one setting is the bar's 🔊 (muted or not), one for
// every game, kept in this browser (localStorage, never the save). Muted is silent: no source is started at all.
//
// Nothing runs at import: Node tests import the shell. `createSound({ AC, fetchJson, fetchBuf, storage, now })` is the
// engine with everything injected; `sound` is the page's one.
import { ZZFX } from '../../vendor/zzfx-1.4.0.mjs';

export const VOICES = 14;
/** At most this many of one sound at once: a storm of the same hit stacks into a buzz on a Mac's speakers (Hanli 11-05). */
export const SAME_MAX = 3;
/** The master level under the limiter: music and effects together never reach 0 dBFS. */
export const MASTER = 0.7;
/** Nothing sounding this long, the context is suspended: a running context on silence hisses on some Macs (11-05). */
export const IDLE_MS = 4000;
export const MIN_MS = 30; // the least gap of an event that names none
export const DEFAULTS = Object.freeze({ sfx: { on: true, vol: 0.8 }, music: { on: true, vol: 0.6 }, muted: false });
/** What actually sounds: a part on, above zero, and the one mute (the shell's bar button) off. The mute leaves the
    parts' own settings alone, so unmuting brings back exactly what was set. */
export const audible = (st, k) => Boolean(!st.muted && st[k].on && st[k].vol > 0);
/** The bar's one state: silent is whatever sounds nothing. The parts no longer have a switch or a volume of their own
    (Hanli 11-04: 「暂停界面还有音乐, 音效调整? 可以去掉吗, 直接用系统默认的?」): effects and music play at the app's
    default level, follow the one 🔊 together, and the system volume rules the rest. */
export const silent = (st) => !audible(st, 'sfx') && !audible(st, 'music');
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

/* ── Settings: the one mute, for every game ── */

/** What this browser keeps: only `muted`. A part's old on/off or volume (the pause veil's 音效 · 音乐, gone 11-04) is
    not read: the root of 「取消静音后还是没有声音」 was { sfx: off·0, music: off·0, muted: false } — the 🔊 showed
    unmuted, its click only flipped `muted`, and the veil's rows held the page silent. Such a store reads as the parts
    on at their default, and is written back as { muted } on the next toggle. */
export function readSettings(storage) {
  let got = null;
  try { got = JSON.parse(storage?.getItem(KEY) ?? 'null'); } catch { got = null; }
  return { sfx: { ...DEFAULTS.sfx }, music: { ...DEFAULTS.music }, muted: got?.muted === true };
}
export function writeSettings(storage, s) { try { storage?.setItem(KEY, JSON.stringify({ muted: Boolean(s?.muted) })); } catch { /* private mode: this visit only */ } }

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
  let ctx = null, maps = null, bank = null, ready = null, sprite = null, sfxBus = null, musicBus = null, voices = 0, master = null, idleTimer = null;
  const playing = new Map(); // sound id → how many sound now (SAME_MAX)
  const tones = new Map(), beds = new Map(), last = new Map();
  const log = []; // the last plays (dev: window.__lingjingSound.log)
  let bed = null; // { board, game, id, src, gain, ducked }
  const heard = { events: 0, played: 0, dropped: 0 };

  // The format to try first: ogg where the page says it plays it, else m4a. A 「probably」 is not a decode: WebKit's
  // <audio> answers ogg vorbis 「probably」 while its Web Audio cannot decode it (the phone's WKWebView, 10-28: every
  // board silent — 「兽潮游戏在手机上没有声音」), so a failed decode falls back to the other file, and stays there.
  let order = null;
  const exts = () => (order ??= canPlay?.('audio/ogg; codecs="vorbis"') ? ['ogg', 'm4a'] : ['m4a', 'ogg']);
  /** `files` ({ ogg, m4a }) decoded in the first format that decodes; a format that failed is not tried first again. */
  async function decode(files) {
    let err = null;
    for (const e of exts().filter((x) => files?.[x])) {
      try { return await ctx.decodeAudioData(await fetchBuf(url(files[e]))); } catch (x) { err = x; if (order[0] === e) order = [...order.slice(1), e]; }
    }
    throw err ?? new Error('no file to decode');
  }
  const url = (p) => (base ? new URL(p, base).href : p);

  async function load() {
    [maps, bank] = await Promise.all([fetchJson(url('sounds.json')), fetchJson(url('bank.json'))]);
    for (const [id, def] of Object.entries(maps.sounds ?? {})) {
      if (!def.zzfx) continue;
      const s = zzfxSamples(def), b = ctx.createBuffer(1, s.length, RATE);
      b.getChannelData(0).set(s);
      tones.set(id, b);
    }
    sprite = await decode(bank.sprite);
    startBed();
  }

  /* effects → compressor ─┐
     music ─────────────────┴→ master (MASTER) → limiter → destination: the two together never clip (Hanli 11-05: the Mac's
     speakers crackled while a game sounded — the bed went straight to the destination beside the compressed effects). */
  function graph() {
    const comp = ctx.createDynamicsCompressor?.() ?? null;
    const limit = ctx.createDynamicsCompressor?.() ?? null;
    const set = (n, k, v) => { if (n?.[k] && 'value' in n[k]) n[k].value = v; };
    if (limit) { set(limit, 'threshold', -3); set(limit, 'knee', 0); set(limit, 'ratio', 20); set(limit, 'attack', 0.002); set(limit, 'release', 0.1); }
    master = ctx.createGain();
    master.gain.value = MASTER;
    if (limit) { master.connect(limit); limit.connect(ctx.destination); } else master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    if (comp) { sfxBus.connect(comp); comp.connect(master); } else sfxBus.connect(master);
    musicBus.connect(master);
    levels();
  }
  /* Silence for IDLE_MS (no effect, no bed): the context sleeps; the next sound or touch wakes it. */
  function idleSoon() {
    if (!ctx) return;
    clearTimeout(idleTimer);
    if (voices > 0 || bed?.src) return;
    idleTimer = setTimeout(() => { if (ctx && voices === 0 && !bed?.src && ctx.state === 'running') ctx.suspend?.()?.catch?.(() => {}); }, IDLE_MS);
  }
  function awake() { clearTimeout(idleTimer); if (ctx && ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {}); }
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
    }
    // A bank that failed to come in (a blip mid-deploy) is fetched again on the next touch, not silent for the visit.
    ready ??= load().then(() => true, (e) => { console.warn('[sound] bank', e); ready = null; return false; });
    // Chrome's autoplay rule: a context made or left suspended runs only once resumed inside a gesture.
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume?.()?.catch?.(() => {});
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
    const id = rule.sounds[Math.floor(Math.random() * rule.sounds.length)];
    if ((playing.get(id) ?? 0) >= SAME_MAX) { heard.dropped += 1; return false; }
    last.set(key, t);
    const def = maps.sounds?.[id];
    const slices = def?.sprite?.map((k) => bank.sprite.map[k]).filter(Boolean) ?? [];
    const slice = slices[Math.floor(Math.random() * slices.length)];
    const buffer = tones.get(id) ?? (slice ? sprite : null);
    if (!buffer) return false;
    awake();
    const v = voice(buffer, { offset: slice?.[0] ?? 0, dur: slice?.[1], vol: rule.vol * (def.vol ?? 1) });
    voices += 1;
    playing.set(id, (playing.get(id) ?? 0) + 1);
    v.src.onended = () => { voices -= 1; playing.set(id, Math.max(0, (playing.get(id) ?? 1) - 1)); v.gain.disconnect(); idleSoon(); };
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
    if (!beds.has(want.id)) beds.set(want.id, decode(files).catch((e) => { console.warn('[sound] bed', e); return null; }));
    const buf = await beds.get(want.id);
    if (!buf || bed !== want || want.src || !audible(settings, 'music')) return;
    awake();
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
    setTimeout(() => { try { src.stop(); } catch { /* already */ } b.gain?.disconnect(); idleSoon(); }, 700);
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
    /** Nothing sounds: what the bar's 🔊 shows. */
    silent: () => silent(settings),
    /** Another tab of this browser changed the setting (the `storage` event): this page takes it, so the bar and
        what sounds never come from two different copies. */
    reload() { settings = readSettings(storage); levels(); if (!audible(settings, 'music')) endBed(bed); else if (bed && !bed.src) startBed(); return structuredClone(settings); },
    /** The one mute (the shell's bar, the phone's 🔊): effects and music silent together, and back together. */
    mute(on) { settings = { ...settings, muted: Boolean(on) }; return apply(); },
    /** The tab hidden: nothing plays; back: it goes on. */
    hidden(on) { if (!ctx) return; if (on) ctx.suspend?.(); else ctx.resume?.(); },
    state: () => ({ ctx: ctx?.state ?? 'none', rate: ctx?.sampleRate ?? null, master: master?.gain?.value ?? null, loaded: Boolean(sprite), voices, bed: bed ? { board: bed.board, id: bed.id, playing: Boolean(bed.src), ducked: bed.ducked } : null, ...heard, settings: structuredClone(settings) }),
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
let onReload = null;
/** The shell repaints its bar when another tab changed the setting. */
export function onSoundReload(fn) { onReload = fn; }
export function unlockOn(doc = globalThis.document) {
  if (unlocked || !doc?.addEventListener) return;
  unlocked = true;
  const go = () => { sound.wake(); };
  for (const t of ['pointerdown', 'touchend', 'keydown', 'click']) doc.addEventListener(t, go, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => sound.hidden(doc.visibilityState === 'hidden'));
  win?.addEventListener?.('storage', (e) => { if (e.key === KEY || e.key === null) { sound.reload(); onReload?.(); } });
  if (win) win.__lingjingSound = { state: () => sound.state(), log: sound.log, play: (game, event, o) => sound.play(game, event, o) };
}
