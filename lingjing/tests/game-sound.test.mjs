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
  for (const ev of ['hit', 'boss', 'kill', 'result.win', 'button']) assert.equal(s.play('shouqiang', ev), false);
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

/* ── Every board sounds (Hanli 10-26: 「查一下, 有很多小游戏没有声音和退出」) ──
   The audit found most boards silent but for the end chime: a pure board named nothing, the story's own runner never
   gave its boards a shell, the kits' rows (rope, whack, flight, card, seal) were data nobody named. The lock: every game
   a player can open — the 游戏厅's rows and every story task's — declares what it names (`meta.sounds`), each of those
   names resolves to a real sound in sounds.json, its module's id is its file's (the story looks its sounds up by it), a
   pure board names them through `sounds(before, after)` (games/kit/heard.js), and each runner sounds every step. */
import { loadContent } from '../scripts/content.mjs';
import { heardOf } from '../scripts/games/kit/heard.js';
import { loadPair, playOnce } from '../tools/board-bots.mjs';

const GAMES = new URL('../scripts/games/', import.meta.url);
const REG = read('../worlds/jiuding/games.json');
const has = (id) => fs.existsSync(new URL(`${id}.js`, GAMES));
// The registry is the whole catalogue (every game a task names has a row; a cut one says so): its rows still played.
const playable = [...new Set(REG.games.filter((r) => !r.replaced).map((r) => r.id))].filter(has).sort();
const storyGames = new Set(loadContent().tasks.tasks.filter((t) => t.kind === 'board' && t.game).map((t) => t.game));
const SHELL_OWN = new Set(['tap', 'nope']);

test('every playable game is in the lock (the 游戏厅\'s rows and the story\'s boards)', () => {
  for (const id of ['rain', 'qimai', 'jinchat', 'shouqiang', 'kapai', 'luoshu', 'bread', 'lianliankan', 'simon']) assert.ok(playable.includes(id), id);
  const cut = new Set(REG.games.filter((r) => r.replaced).map((r) => r.id));
  assert.deepEqual([...storyGames].filter((g) => has(g) && !playable.includes(g) && !cut.has(g)), [], 'a story board\'s game outside the lock');
});

for (const id of playable) {
  test(`${id}: names its sounds, and each is a real sound`, async () => {
    const mod = await import(new URL(`${id}.js`, GAMES));
    assert.equal(mod.meta?.id, id, 'its id is its file\'s: the story and the shell look its sounds up by it');
    const names = mod.meta?.sounds ?? [];
    assert.ok(names.length, `${id} names no sound (meta.sounds): it would play silent but for the end chime`);
    let heard = 0;
    for (const ev of names) {
      const rule = resolve(SOUNDS, id, ev);
      if (SOUNDS.games[id]?.events?.[ev] === null) continue; // silent on purpose (the shell's result sounds instead)
      assert.ok(rule?.sounds.length, `${id}: '${ev}' sounds like nothing in sounds.json`);
      heard += 1;
      for (const s of rule.sounds) assert.ok(SOUNDS.sounds[s], `${id}: '${ev}' → '${s}', no such sound`);
    }
    assert.ok(heard, `${id}: every name it declares is silent`);
    const src = fs.readFileSync(new URL(`${id}.js`, GAMES), 'utf8');
    // A pure board names through `sounds` (its runners call it); a game with its own loop calls the shell itself.
    if (mod.act && !(mod.meta?.beat === 'mount')) assert.equal(typeof mod.sounds, 'function', `${id}: a pure board names its moments with sounds(before, after)`);
    else assert.ok(typeof mod.sounds === 'function' || /shell\?\.sound\?\.\(|onEntry: \(t\) => shell\?\.sound/.test(src) || /export const \{[^}]*\} = makeYubu/.test(src)
      || /from '\.\/ropebeats\.js'/.test(src) || fs.existsSync(new URL(`${id}/${id}.min.mjs`, GAMES)), `${id}: its own loop never calls the shell's sound`);
  });
}

test('a pure board\'s bot play names its moments, and only the ones it declares', async () => {
  const quiet = [];
  for (const id of playable) {
    const { mod, bot, deal } = await loadPair(id);
    if (!bot || !mod.act || !mod.tick && !mod.sounds) continue;
    const heard = new Set();
    const snap = mod.soundSnap ?? ((s) => s);
    const spy = {
      ...mod,
      act: (s, d) => { const b = snap(s); const r = mod.act(s, d); for (const e of heardOf(mod, b, snap(r.state ?? s), 'tap')) heard.add(e.event); return r; },
      tick: mod.tick && ((s, ms) => { const b = snap(s); const n = mod.tick(s, ms); for (const e of heardOf(mod, b, snap(n))) heard.add(e.event); return n; }),
    };
    playOnce(spy, bot, { deal, limit: 60000 });
    const own = [...heard].filter((e) => !SHELL_OWN.has(e));
    if (!own.length) quiet.push(id);
    for (const e of own) assert.ok(mod.meta.sounds.includes(e), `${id} named '${e}', which its meta.sounds does not declare`);
  }
  assert.deepEqual(quiet, [], 'played by its bot, these named nothing of their own');
});

test('every runner sounds each step: off the story (mount.js), the story\'s clock and taps (live-games.js, lingjing.js), the fight\'s log', () => {
  const src = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const mount = src('../scripts/games/mount.js'), live = src('../scripts/live-games.js'), page = src('../scripts/lingjing.js');
  assert.equal((mount.match(/sounded\(shell, mod,/g) ?? []).length, 3, 'mount.js: an act, a tick and the rival\'s answer');
  assert.equal((live.match(/sounded\(shellFor\(/g) ?? []).length, 3, 'live-games.js: a press, the catch-up and the clock');
  assert.match(page, /shellOf: \(id, g\) => shellFor\(id, g\.mod\?\.meta\?\.id\)/, 'the story\'s live boards get their shell (sounds, bed)');
  assert.match(page, /onWon: \(g\) => \{ g\.sent = true; settleShell\(g\.taskId/, 'a story board\'s win chimes');
  assert.match(page, /sounded\(shellFor\(g\.taskId, g\.mod\.meta\?\.id\), g\.mod, was, g\.state, press\)/, 'a tapped story board sounds');
  assert.match(page, /shellFor\(fightShell\(b\), 'kapai'\)/, 'the story\'s card fight sounds as the 游戏厅\'s');
  assert.match(page, /shellFor\(board\.taskId, 'lianliankan'\)\.sound\(event\)/, 'the herb board sounds');
});
