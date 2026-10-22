// The small games' one sound layer (games/kit/sound.js; Hanli 10-22: 「还没加声效吗」 → 「开吧. 统一做进外壳」): data says
// what an event sounds like, one AudioContext made on the first touch, a storm of events never clips, muted is silent,
// one setting for every game.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULTS, MIN_MS, VOICES, createSound, readSettings, resolve, ruleOf, writeSettings, zzfxSamples } from '../scripts/games/kit/sound.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const SOUNDS = read('../scripts/games/kit/audio/sounds.json');
const BANK = read('../scripts/games/kit/audio/bank.json');

/* A fake Web Audio: enough nodes to count what starts, and nothing else. */
function fakeAC() {
  const made = { contexts: 0, started: [], stopped: 0 };
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  const node = () => ({ gain: param(), connect() { return this; }, disconnect() {} });
  class AC {
    constructor() { made.contexts += 1; this.state = 'running'; this.currentTime = 0; this.destination = node(); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
    createBufferSource() {
      const s = { ...node(), loop: false, onended: null, start: (at, off, dur) => made.started.push({ s, off, dur, loop: s.loop }), stop: () => { made.stopped += 1; } };
      return s;
    }
    decodeAudioData() { return Promise.resolve({ length: 1, duration: 120 }); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; }
  }
  return { AC, made };
}
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
function engine({ storage = memory(), clock = { t: 1000 } } = {}) {
  const { AC, made } = fakeAC();
  const s = createSound({
    AC, storage, now: () => clock.t, canPlay: () => true,
    fetchJson: async (u) => (u.endsWith('sounds.json') ? SOUNDS : BANK),
    fetchBuf: async () => new ArrayBuffer(8),
  });
  return { s, made, clock, storage };
}

test('data: a game\'s own row, then its kit\'s, then the shell\'s base; a kind first; null is silence on purpose', () => {
  const maps = {
    base: { win: 'a', hit: 'base-hit' },
    kits: { td: { events: { hit: { sound: ['k1', 'k2'], min: 50, vol: 0.5 }, boss: 'bell' } } },
    games: { g: { kit: 'td', events: { boss: null, 'boom.huo': 'fire', boom: 'boom' } } },
  };
  assert.deepEqual(resolve(maps, 'g', 'hit'), { sounds: ['k1', 'k2'], min: 50, vol: 0.5 });
  assert.deepEqual(resolve(maps, 'g', 'win'), { sounds: ['a'], min: MIN_MS, vol: 1 });
  assert.equal(resolve(maps, 'g', 'boss'), null, 'the game silences its kit\'s row');
  assert.deepEqual(resolve(maps, 'g', 'boom', 'huo').sounds, ['fire']);
  assert.deepEqual(resolve(maps, 'g', 'boom', 'han').sounds, ['boom']);
  assert.equal(resolve(maps, 'g', 'nothing'), null);
  assert.deepEqual(resolve(maps, undefined, 'hit').sounds, ['base-hit'], 'a board the shell knows no game for: the base row');
  assert.equal(ruleOf(null), null);
});

test('settings: one for every game, defaults on with the music quiet; a broken or missing store is the defaults', () => {
  assert.deepEqual(readSettings(null), DEFAULTS);
  assert.ok(DEFAULTS.music.vol < DEFAULTS.sfx.vol, 'music quiet');
  const bad = { getItem: () => '{nope', setItem() { throw new Error('quota'); } };
  assert.deepEqual(readSettings(bad), DEFAULTS);
  assert.doesNotThrow(() => writeSettings(bad, DEFAULTS), 'private mode: kept for this visit only');
  const st = memory();
  writeSettings(st, { sfx: { on: false, vol: 0.4 }, music: { on: true, vol: 7 } });
  assert.deepEqual(readSettings(st), { sfx: { on: false, vol: 0.4 }, music: { on: true, vol: 1 }, muted: false });
});

test('ZzFX recipes become samples (no context needed); notes are mixed in one buffer', () => {
  const one = zzfxSamples(SOUNDS.sounds['tone.pop']);
  assert.ok(one.length > 1000 && one.some((x) => Math.abs(x) > 0.05));
  const win = zzfxSamples(SOUNDS.sounds['tone.win']);
  assert.ok(win.length > one.length);
  for (const [id, def] of Object.entries(SOUNDS.sounds)) if (def.zzfx) assert.ok(zzfxSamples(def).length > 0, id);
});

test('nothing plays before the first touch; one context for the page, made then; an event plays its slice', async () => {
  const { s, made } = engine();
  assert.equal(s.play('shouqiang', 'hit'), false, 'no context yet');
  assert.equal(made.contexts, 0, 'nothing at import or before a gesture');
  await s.wake();
  await s.wake();
  assert.equal(made.contexts, 1, 'one context, however many touches');
  assert.equal(s.play('shouqiang', 'boss'), true);
  const last = made.started.at(-1);
  assert.deepEqual([last.off, last.dur], BANK.sprite.map.impactBell_heavy_000, 'the bell\'s slice of the sprite');
  assert.equal(s.log.at(-1).sound, 'hit.bell');
  assert.equal(s.play('shouqiang', 'won'), false, 'null in the data: silent');
});

test('a storm stays a texture: each event keeps its least gap, and at most VOICES play at once', async () => {
  const { s, made, clock } = engine();
  await s.wake();
  const n0 = made.started.length;
  for (let i = 0; i < 300; i += 1) s.play('shouqiang', 'hit'); // 300 hits in the same instant
  assert.equal(made.started.length - n0, 1, 'one hit, the rest dropped by its gap');
  for (let i = 0; i < 300; i += 1) { clock.t += 3; s.play('shouqiang', 'hit'); } // a hit every 3 ms for ~1 s
  const played = made.started.length - n0;
  assert.ok(played <= VOICES, `never more than ${VOICES} voices at once (${played} — none ended in the fake)`);
  assert.ok(s.state().dropped > 280);
});

test('muted is silent: no source starts at all; the setting is kept and every game hears it', async () => {
  const storage = memory();
  const { s, made } = engine({ storage });
  await s.wake();
  s.set('sfx', { on: false });
  const n0 = made.started.length;
  for (const ev of ['hit', 'boss', 'kill', 'win', 'button']) assert.equal(s.play('shouqiang', ev), false);
  assert.equal(s.play('zhazhai', 'impactWoodHeavy'), false);
  assert.equal(made.started.length, n0, 'not one start()');
  const again = engine({ storage }).s; // another game, another page: the same setting
  assert.equal(again.settings().sfx.on, false);
  s.set('sfx', { on: true, vol: 0 });
  assert.equal(s.play('shouqiang', 'boss'), false, 'volume 0 is muted too');
});

test('the bed: one per board, its kit\'s, looped; quiet under the pause; gone at the result; off when music is off', async () => {
  const { s, made } = engine();
  s.music('b1', 'shouqiang'); // before the first touch: it waits
  assert.equal(made.started.length, 0);
  await s.wake();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(s.state().bed, { board: 'b1', id: 'td', playing: true, ducked: false });
  assert.ok(made.started.some((x) => x.loop), 'looped');
  s.duck('b1', true);
  assert.equal(s.state().bed.ducked, true);
  s.stop('other');
  assert.equal(s.state().bed.board, 'b1', 'another board\'s end leaves this bed alone');
  s.stop('b1');
  assert.equal(s.state().bed, null);
  s.music('b2', 'wuziqi');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.state().bed.playing, false, 'a plain board has no bed');
  s.set('music', { on: false });
  s.music('b3', 'zhazhai');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.state().bed.playing, false, 'music off: no bed');
  s.set('music', { on: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(s.state().bed, { board: 'b3', id: 'throw', playing: true, ducked: false }, 'on again: it plays');
});

test('the one mute (the shell\'s bar, Hanli 10-22: 「添加一个静音按钮吧」): both parts silent at once, kept across games, unmute brings back what was set', async () => {
  const storage = memory();
  const { s, made } = engine({ storage });
  await s.wake();
  s.set('sfx', { vol: 0.5 });
  s.set('music', { vol: 0.2 });
  s.music('m1', 'shouqiang');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.state().bed.playing, true);
  s.mute(true);
  const n0 = made.started.length;
  assert.equal(s.play('shouqiang', 'boss'), false);
  assert.equal(made.started.length, n0, 'muted: not one start()');
  assert.equal(s.state().bed.playing, false, 'the bed stops too');
  assert.equal(engine({ storage }).s.settings().muted, true, 'another game, another page: still muted');
  s.mute(false);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(s.settings(), { sfx: { on: true, vol: 0.5 }, music: { on: true, vol: 0.2 }, muted: false }, 'what was set, back');
  assert.equal(s.state().bed.playing, true, 'the bed comes back');
  assert.equal(s.play('shouqiang', 'boss'), true);
  s.mute(true);
  s.set('music', { on: true });
  assert.equal(s.settings().muted, false, 'turning a part on lifts the mute');
});
