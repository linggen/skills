// 斗法 taps in quick succession (Hanli 11-07: 「斗法一张牌出手后要等1秒，才能点第二张…能优化一下，让用户能快速连着点击吗」):
// a tap while his own move is still being drawn is taken at once — kept in order, the drawing hurried (games/kapai.js
// queueTap, battle-anim.js hurry) — never dropped and never doubled. Several plays fired fast end where the same plays
// made slowly end; a play the rules refuse keeps its card and says why; a tap behind 结束回合 is let go.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const WORLD = new URL('../worlds/jiuding/', import.meta.url).href;
globalThis.fetch = async (url) => {
  const href = String(url);
  if (!href.startsWith(WORLD)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL(href), 'utf8')) };
};
globalThis.document ??= { addEventListener() {}, removeEventListener() {} };
const { mount } = await import('../scripts/games/kapai.js');
const { begin, view } = await import('../scripts/battle.js');

const CARDS = {
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: 'wood', atk: 1, hp: 2 },
  ember: { id: 'ember', kind: 'spell', name: '火星', cost: 1, element: 'fire', effect: { draw: 1 } },
  salve: { id: 'salve', kind: 'spell', name: '小还', cost: 1, element: 'water', effect: { heal: 2 } },
  imp: { id: 'imp', kind: 'minion', name: '小鬼', cost: 1, element: 'metal', atk: 1, hp: 1 },
  pup: { id: 'pup', kind: 'minion', name: '小狗', cost: 1, element: 'earth', atk: 1, hp: 1 },
  boulder: { id: 'boulder', kind: 'minion', name: '巨石', cost: 9, element: 'earth', atk: 5, hp: 5 },
};
const SETUP = {
  mode: 'pve', seed: 'fast|1',
  you: { tier: 'qi', step: 0, root: 'wood', deck: ['cub', 'ember', 'salve', 'boulder', 'cub', 'ember', 'cub', 'salve', 'cub', 'cub'] },
  foe: { tier: 'qi', root: 'earth', deck: Array(12).fill('cub') },
};
const BRIEF = { creature: { name: '试妖' }, says: {} };

function fakeRoom() {
  const el = () => ({ className: '', innerHTML: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; }, querySelector: () => null, contains: () => true });
  return { ownerDocument: { createElement: el }, kids: [], replaceChildren(h) { this.kids = [h]; } };
}
async function room(hand = ['cub', 'ember', 'salve', 'cub', 'boulder']) {
  const st = begin(SETUP, CARDS);
  st.you.hand = [...hand];
  st.you.mana = 6;
  st.you.manaMax = 6;
  st.you.hp = 10;
  const tokens = [];
  const container = fakeRoom();
  mount(container, { data: { setup: SETUP, brief: BRIEF, st, catalog: CARDS }, lang: 'zh', shell: { paused: () => false, say() {}, onPause: () => () => {} }, story: { onMove: (t) => tokens.push(t), holdMs: () => 0 } });
  let host = null;
  for (let i = 0; i < 50 && !host?.kapai; i++) { await new Promise((r) => setTimeout(r, 5)); host = container.kids[0]; }
  assert.ok(host?.kapai, 'the room is up');
  return { host, st, tokens };
}
const settled = async (host) => { for (let i = 0; i < 200 && (host.kapai.busy() || host.kapai.room().queue.length); i++) await new Promise((r) => setTimeout(r, 2)); };
/* What the fight is, to compare: everything but the log's own order of drawing. */
const facts = (st) => { const v = view(st); return { you: { ...v.you }, foe: { ...v.foe, log: undefined }, turn: v.turn, whose: v.whose, played: st.you.played }; };

const PLAYS = ['cub', 'ember', 'salve', 'cub'];
/* The index of the nth copy of `id` in a hand, the copies before it skipped. */
const at = (hand, id, nth = 0) => hand.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0)[nth];

test('four plays fired at once end where the same four made slowly end: none lost, none doubled', async () => {
  const slow = await room();
  for (const id of PLAYS) { slow.host.kapai.tap({ kind: 'hand', index: at(slow.st.you.hand, id) }); await settled(slow.host); }
  const fast = await room();
  assert.equal(fast.host.kapai.room().queue.length, 0);
  fast.host.kapai.tap({ kind: 'hand', index: at(fast.st.you.hand, PLAYS[0]) });
  assert.ok(fast.host.kapai.busy(), 'the first is still being drawn');
  // The rest tapped on the hand as the room shows it now (the first card gone from it), each where it stands there.
  const shown = [...fast.st.you.hand], used = {};
  for (const id of PLAYS.slice(1)) { fast.host.kapai.tap({ kind: 'hand', index: at(shown, id, used[id] ?? 0) }); used[id] = (used[id] ?? 0) + 1; }
  assert.equal(fast.host.kapai.room().queue.length, 3, 'the other three are taken at once, in order — not dropped');
  await settled(fast.host);
  assert.deepEqual(fast.tokens, slow.tokens, 'the same moves, once each, in the same order');
  assert.deepEqual(fast.st.you.played, PLAYS);
  assert.deepEqual(facts(fast.st), facts(slow.st));
});

test('a play the rules refuse, tapped behind one it pays for, keeps its card and says why', async () => {
  const r = await room();
  r.st.you.mana = 1;
  const hand = [...r.st.you.hand];
  const dear = hand.indexOf('boulder');
  r.host.kapai.tap({ kind: 'hand', index: hand.findIndex((id) => id !== 'boulder') }); // 1 灵力: the last it can pay for
  r.host.kapai.tap({ kind: 'hand', index: dear >= 0 ? dear : 0 });
  await settled(r.host);
  assert.equal(r.tokens.length, 1, 'only the one it could pay for');
  assert.ok(r.st.you.hand.length >= hand.length - 1, 'the refused card is still in the hand');
  assert.ok(r.host.kapai.room().note, 'and the room says why');
});

test('a tap kept behind 结束回合 is for a turn that is over: let go', async () => {
  const r = await room();
  r.host.kapai.tap({ kind: 'hand', index: 0 });
  r.host.kapai.tap({ kind: 'end', index: -1 });
  r.host.kapai.tap({ kind: 'hand', index: 0 });
  await settled(r.host);
  for (let i = 0; i < 200 && r.st.whose !== 'you'; i++) await new Promise((res) => setTimeout(res, 5));
  await settled(r.host);
  assert.deepEqual(r.tokens.slice(0, 2).map((t) => t === 'end' ? 'end' : 'play'), ['play', 'end']);
  assert.equal(r.tokens.filter((t) => t !== 'end').length, 1, 'the tap behind the end was never played on the beast\'s turn or the next');
});

test('two taps queued against the same shown hand play the two cards tapped, not the ones their places hold by then', async () => {
  const r = await room(['cub', 'salve', 'imp', 'pup']);
  r.host.kapai.tap({ kind: 'hand', index: 0 }); // 小妖 goes; the room now shows 小还 · 小鬼 · 小狗
  assert.ok(r.host.kapai.busy());
  r.host.kapai.tap({ kind: 'hand', index: 0 }); // 小还
  r.host.kapai.tap({ kind: 'hand', index: 1 }); // 小鬼, as shown — by the time it is taken, 小狗 stands at 1
  await settled(r.host);
  assert.deepEqual(r.st.you.played, ['cub', 'salve', 'imp'], 'the cards he tapped');
  assert.deepEqual(r.st.you.hand.filter((id) => id === 'pup').length, 1, '小狗 was never played');
});
