// The bar's speaker (Hanli 11-04, 守炉 「头几夜 · 看的是药」: 「取消静音后还是没有声音」). His browser held
// { sfx: off·0, music: off·0, muted: false } — the pause veil's 音效 · 音乐 rows unticked at 0 — so the bar showed
// 🔊 「静音」 over a silent page, and its click only flipped `muted`. The lock: the veil's rows are gone (「可以去掉吗,
// 直接用系统默认的?」), the 🔊 is the one control, an old store plays again, one click on a silent bar makes the
// next effect heard (the context resumed inside the click), and icon and tooltip always agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULTS, createSound, silent } from '../scripts/games/kit/sound.js';
import { frameHtml, muteFace, shellFor, toggleMute } from '../scripts/games/shell.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const SOUNDS = read('../scripts/games/kit/audio/sounds.json');
const BANK = read('../scripts/games/kit/audio/bank.json');
const STUCK = { sfx: { on: false, vol: 0 }, music: { on: false, vol: 0 }, muted: false }; // his, read 11-04

/* A fake Web Audio that starts suspended, as Chrome makes one outside a gesture. */
function fakeAC(state = 'suspended') {
  const made = { started: [], resumes: 0 };
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  const node = () => ({ gain: param(), connect() { return this; }, disconnect() {} });
  class AC {
    constructor() { this.state = state; this.currentTime = 0; this.destination = node(); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
    createBufferSource() { const s = { ...node(), loop: false, onended: null, start: () => made.started.push({ s, running: this.state === 'running' }), stop() {} }; return s; }
    decodeAudioData() { return Promise.resolve({ length: 1, duration: 120 }); }
    resume() { made.resumes += 1; this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; }
  }
  return { AC, made };
}
const memory = (v) => { const m = new Map(v ? [['lingjing.sound', JSON.stringify(v)]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, x) => m.set(k, String(x)), m }; };
function engine(stored, state) {
  const { AC, made } = fakeAC(state), storage = memory(stored);
  const s = createSound({ AC, storage, canPlay: () => true, fetchJson: async (u) => (u.endsWith('sounds.json') ? SOUNDS : BANK), fetchBuf: async () => new ArrayBuffer(8) });
  return { s, made, storage };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('his old store plays again: the parts read on at their default; only the mute is kept', () => {
  const { s: snd, storage } = engine(STUCK);
  assert.deepEqual(snd.settings(), DEFAULTS);
  assert.equal(snd.silent(), false, 'the bar shows 🔊 and it is true');
  snd.mute(true); snd.mute(false);
  assert.equal(storage.getItem('lingjing.sound'), '{"muted":false}', 'written back as the mute alone');
  assert.equal(silent({ ...DEFAULTS, muted: true }), true);
  assert.equal(silent(DEFAULTS), false);
});

test('his stuck page, one click on the speaker: the context resumed in the click, the toggle heard, the next effect heard', async () => {
  const { s, made, storage } = engine({ ...STUCK, muted: true }, 'suspended');
  shellFor('mute-td', 'shoulu');
  assert.equal(s.silent(), true);
  assert.equal(muteFace('zh', s.silent()).label, '取消静音', 'before: the bar says a click unmutes');
  const after = toggleMute('mute-td', s); // no touch before it: the click is the page's first gesture
  assert.equal(after, false, 'one click: sounding');
  assert.equal(made.resumes, 1, 'resume() called inside the click');
  assert.equal(s.state().ctx, 'running');
  await settle(); await settle();
  assert.equal(made.started.length >= 1, true, 'the toggle itself is heard once the bank is in');
  assert.ok(made.started.every((x) => x.running), 'nothing started on a suspended context');
  assert.equal(s.play('shoulu', 'hit'), true, 'the next effect sounds');
  assert.equal(storage.getItem('lingjing.sound'), '{"muted":false}', 'kept for every game');
  s.music('mute-td', 'shoulu'); await settle(); await settle();
  assert.equal(s.state().bed.playing, true, 'music follows the same toggle');
  assert.equal(toggleMute('mute-td', s), true, 'and the next click mutes');
  assert.equal(s.play('shoulu', 'boom'), false);
  assert.equal(s.state().bed.playing, false, 'and both go quiet together');
});

test('a context suspended later (the tab hidden, Safari interrupted) is resumed by the next click, not left asleep', async () => {
  const { s, made } = engine(null, 'running');
  await s.wake();
  s.hidden(true);
  assert.equal(s.state().ctx, 'suspended');
  s.mute(true);
  toggleMute('x', s);
  assert.equal(s.state().ctx, 'running');
  assert.ok(made.resumes >= 1);
});

test('a bank that failed to load is fetched again on the next touch, not silent for the visit', async () => {
  const { AC } = fakeAC('running');
  let fail = true;
  const s = createSound({ AC, storage: memory(), canPlay: () => true, fetchBuf: async () => new ArrayBuffer(8),
    fetchJson: async (u) => { if (fail) throw new Error('blip'); return u.endsWith('sounds.json') ? SOUNDS : BANK; } });
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await s.wake(), false); } finally { console.warn = warn; }
  fail = false;
  assert.equal(await s.wake(), true);
  assert.equal(s.play('shoulu', 'hit'), true);
});

test('icon and tooltip agree with the state, in every case and both languages', () => {
  for (const quiet of [false, true]) {
    const { s: snd } = engine({ muted: quiet });
    assert.equal(snd.silent(), quiet);
    const zh = muteFace('zh', snd.silent()), en = muteFace('en', snd.silent());
    assert.deepEqual(zh, quiet ? { pressed: 'true', icon: '🔇', label: '取消静音' } : { pressed: 'false', icon: '🔊', label: '静音' });
    assert.equal(en.label, quiet ? 'Unmute' : 'Mute');
    assert.equal(en.icon, zh.icon);
  }
  // The frame's button is drawn from the same face (the page's sound here: no storage in Node, the defaults).
  const html = frameHtml({ id: 'mute-face', title: 'x', timed: true });
  assert.match(html, /data-shell-mute aria-pressed="false" aria-label="静音" title="静音">🔊</);
});

test('one source: the bar, the phone\'s 🔊 and the page all read sound.silent(), never settings().muted', () => {
  const shell = fs.readFileSync(new URL('../scripts/games/shell.js', import.meta.url), 'utf8');
  const host = fs.readFileSync(new URL('../scripts/games/phone/host.js', import.meta.url), 'utf8');
  const bar = shell.slice(shell.indexOf('export function muteFace'), shell.indexOf('function paintMute'));
  const click = shell.slice(shell.indexOf('export function toggleMute'), shell.indexOf('export function wireShell'));
  for (const part of [bar, click]) { assert.ok(part.length > 50); assert.doesNotMatch(part, /settings\(\)\.muted/); }
  assert.doesNotMatch(host, /muted: sound\.settings\(\)\.muted/);
  assert.match(host, /muted: sound\.silent\(\)/);
  assert.match(host, /return sound\.silent\(\)/);
});
