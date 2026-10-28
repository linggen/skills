// 所得 shown big (Hanli 2026-10-27, the 饭桶's first meeting: 「收了不只木草泥马吧, 只显示了获得这张牌的动画, 应该还有其他
// 的, 都没显示」): every thing a story step puts in his hands, and its 灵石, is kept on the save as the step's `gained`
// (counted, so the page shows each step's once, whoever took it) and named in Look; the page plays each big, one after
// another, before the step's cards (lingjing.js gainedThings → revealQueue → card-reveal.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { VERBS } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T10:00:00');
const ctx = { now: NOW, quests: [] };
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const atDiyilu = () => ({ ...base, scene: 'wm-diyilu', place: 'chaifang', tasks: { ...(base.tasks ?? {}), 'diyilu-niugu': { status: 'done', period: 'once' }, 'diyilu-tama': { status: 'done', period: 'once' } }, stamina: 100, stamina_at: NOW.toISOString() });

test('the 饭桶\'s first meeting: the 九转回春丹 it put in his hands is kept as the step\'s 所得, beside the card', () => {
  const r = VERBS.resolve(atDiyilu(), content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual(r.state.gained, { n: 1, scene: 'wm-diyilu', items: [{ id: 'mend-pill-9', n: 1 }] });
  assert.ok(r.result.cards.some((c) => c.id === 'mucao'), 'the card goes its own way (cards_new)');
  const look = VERBS.look(r.state, content, ctx, {}).result;
  assert.equal(look.gained.n, 1);
  assert.deepEqual(look.gained.items.map((i) => [i.id, i.n, i.name, i.kind]), [['mend-pill-9', 1, '九转回春丹', 'pill']]);
  assert.ok(look.gained.items[0].art && look.gained.items[0].hint);
  assert.ok(look.cards_new.includes('mucao'));
});

test('a step that pays its thing, the rest (`more`) and 灵石 keeps them all; the count moves on with each step', () => {
  const exit = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {})).flatMap((sc) => sc.exits ?? []).find((e) => e.grant?.more && e.grant?.wealth);
  assert.ok(exit, 'a scene exit with `more` and 灵石');
  const s = { ...atDiyilu(), gained: { n: 4, scene: 'x', items: [] } };
  const r = VERBS.resolve(s, content, ctx, { exit: 'save' });
  assert.equal(r.state.gained.n, 5, 'counted on');
  // gainsOf through the same door: an exit with all three, on a copy of the world where diyilu's way pays them.
  const world = structuredClone(content);
  const sc = world.chapters['00-waimen'].scenes['wm-diyilu'];
  sc.exits.find((e) => e.id === 'save').grant = { table: 'scene', item: 'mend-pill-9', wealth: 3, more: { 'tama-defu': 1, guoba: 2 } };
  const r2 = VERBS.resolve(atDiyilu(), world, ctx, { exit: 'save' });
  assert.deepEqual(r2.state.gained.items, [{ id: 'mend-pill-9', n: 1 }, { id: 'tama-defu', n: 1 }, { id: 'guoba', n: 2 }]);
  assert.ok(r2.state.gained.wealth > 0, '灵石 too');
});

test('the page plays every thing gained big, before the step\'s cards, from the same queue', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /gainedThings\(look, seen\);\n\s*gainedCards\(look, seen\);/, 'things first, then cards, on every read');
  assert.match(src, /function gainedThings\(was, now\)[\s\S]*?g\.n === was\.gained\?\.n/, 'once per step: its count');
  assert.match(src, /x\?\.thing \? thingCard\(x\.thing\)/, 'a thing is drawn as a card is');
});

// 踏马符 is the book's at the 饭桶's first feed and nowhere else (Hanli 2026-10-28: 「踏马符游戏里出现地方不对, 我刚打怪得到了,
// 应该安排一个饭桶的剧情固定游戏. 让玩家按要求放剧情里的东西进饭桶, 开出来踏马符等. 和故事对齐.」): wm-diyilu's second board is a
// fixed 开炉 (the 银毛 in, the 踏马符 out), blocks the exit, and its win puts the 踏马符 in the bag, shown big as a gain.
test('wm-diyilu: the 踏马符 board blocks the way on, hands the 踏马符 over once won, and shows it as a gain', async () => {
  const { win, task } = await import('../scripts/rules.mjs');
  const open = { ...atDiyilu(), tasks: { ...atDiyilu().tasks, 'diyilu-tama': { status: 'offered' } } };
  const no = VERBS.resolve(open, content, ctx, { exit: 'save' });
  assert.equal(no.result.ok, false, 'the exit waits on the second board');
  const w = win(open, content, ctx, { id: 'diyilu-tama' });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const d = task(w.state, content, ctx, { action: 'done', id: 'diyilu-tama' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.equal(d.state.bag['tama-fu'], 1);
  assert.deepEqual(d.state.gained.items, [{ id: 'tama-fu', n: 1 }]);
  const look = VERBS.look(d.state, content, ctx, {}).result;
  assert.deepEqual(look.gained.items.map((i) => i.id), ['tama-fu']);
  assert.ok(VERBS.resolve(d.state, content, ctx, { exit: 'save' }).result.ok, 'the way on opens');
  // …and a save that never had it still gets it at wm-wangzuo; one that has it is not given a second.
  const wz = content.chapters['00-waimen'].scenes['wm-wangzuo'].exits.find((e) => e.id === 'open');
  assert.equal(wz.grant.unless_found, true);
});

test('the pot is the book\'s: the 银毛 gives the 踏马符 in gold, any other pot is spat back whole', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL(u), 'utf8')) });
  try {
    const { storyPot } = await import('../scripts/games/kailu.js');
    const deal = content.tasks.tasks.find((t) => t.id === 'diyilu-tama').deal.story;
    const { brief, roll } = await storyPot('zh', deal);
    assert.deepEqual(brief.inputs.map((i) => i.id), ['yinyue-mao', 'shizi', 'kuye', 'chaihuo']);
    assert.equal(brief.inputs[0].name, '一根银毛');
    const spat = await roll(['shizi'], 0, false);
    assert.equal(spat.spat_back, true);
    assert.equal((await roll(['yinyue-mao', 'shizi'], 0, false)).spat_back, true);
    const { potOf } = await import('../scripts/games/bots/kailu.js');
    const r = await roll(potOf(deal), 0, false);
    assert.deepEqual([r.ok, r.grade, r.story, r.outs.map((o) => o.id)], [true, 'best', true, ['tama-fu']]);
    assert.equal(r.outs[0].name, '踏马符');
    assert.equal(r.outs[0].hint, '足下一踏，马上便走。');
  } finally { globalThis.fetch = fetch0; }
});

// The other two feedings the book tells (Hanli 10-28: 「喂饭桶的小游戏, 做一个固定的喂饭桶的, 别用塔防」): 一根牛骨头 and 一根萝卜
// are the same fixed 开炉 on the book's pot, not a 塔防 level — the book's one thing in, the book's result out.
test('wm-diyilu 牛骨头 and wm-luobo 萝卜: fixed pots of the book — its thing opens it, the rest is spat back free, the spoils are swallowed', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL(u), 'utf8')) });
  try {
    const { storyPot } = await import('../scripts/games/kailu.js');
    const { potOf } = await import('../scripts/games/bots/kailu.js');
    const task = (id) => content.tasks.tasks.find((t) => t.id === id);
    const bone = task('diyilu-niugu'), radish = task('luobo-rope');
    for (const t of [bone, radish]) {
      assert.equal(t.game, 'kailu', `${t.id} is the 开炉`);
      assert.equal(t.deal.lv, undefined, `${t.id}: no 塔防 level`);
      assert.deepEqual(t.grant, { table: 'task', progress: 5 }, `${t.id}: pay kept`);
    }
    const b = await storyPot('zh', bone.deal.story);
    assert.deepEqual(b.brief.inputs.map((i) => i.id), ['niu-gutou', 'chaihuo', 'shizi', 'kuye', 'huangqi-canzhu']);
    assert.equal(b.brief.inputs[0].name, '一根牛骨头');
    assert.equal((await b.roll(['chaihuo', 'shizi'], 0, false)).spat_back, true, 'a decoy is spat back');
    assert.equal((await b.roll(['niu-gutou', 'kuye'], 0, false)).spat_back, true, 'the bone with another is not the book\'s pot');
    const rb = await b.roll(potOf(bone.deal.story), 0, false);
    assert.deepEqual([rb.ok, rb.grade, rb.story, rb.outs.map((o) => o.id)], [true, 'best', true, ['niuzhi-ganlu']]);
    assert.equal(rb.outs[0].name, '牛脂甘露');

    const r = await storyPot('zh', radish.deal.story);
    assert.deepEqual(r.brief.inputs.map((i) => i.id), ['dingtai', 'longxu-cao', 'xizhu', 'luobo']);
    const eaten = await r.roll(['dingtai', 'longxu-cao', 'xizhu'], 0, false);
    assert.deepEqual([eaten.ok, eaten.swallowed, eaten.outs, eaten.spat_back], [true, true, [], undefined], 'the spoils are swallowed, nothing out');
    assert.match(eaten.say, /嗝/);
    assert.equal((await r.roll(['dingtai', 'luobo'], 0, false)).spat_back, true, 'a spoil with the radish is spat back, not swallowed');
    const rr = await r.roll(potOf(radish.deal.story), 0, false);
    assert.deepEqual(rr.outs.map((o) => o.id), ['foundation-pill-9']);
    assert.equal((await storyPot('en', radish.deal.story).then((p) => p.roll(['xizhu'], 0, false))).say.length > 5, true, 'the burp has its English');
  } finally { globalThis.fetch = fetch0; }
});
