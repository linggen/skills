// 去修炼 on the stage quest's card (Hanli 11-02 at 古六's eve, 练气四层 48/654: 「点页面上去修炼按钮, 打开了事的dialog, 但是
// 没有去修炼可以去的地方呢」): with no errand of 修行 or beast up (Look's `work` null) the card names what earns 修为 now —
// the 主页's ranking (rules/home.mjs) — never a bare 事 book that names nowhere either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, gateCardHtml, bookPopHtml } from '../scripts/cards.js';

const w = { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' };
const gate = { step: '练气四层圆满', now: { step: '练气四层', progress: 48, of: 654 }, met: false };
// His Look at 18:40, its `home` as the rules wrote it.
const home = { gate: { step: '练气四层圆满', progress: 48, of: 654, short: 606, chores: 189, plays: 3 },
  next: { kind: 'board', id: 'wuziqi', title: '五子 · 与人对弈', progress: 180 },
  todo: [{ kind: 'gongke', id: 'cfo-import', title: '清点府库', means: '算账', progress: 189 }, { kind: 'wait', id: 'shouchao', title: '兽潮 · 第6潮', wait_min: 46 }] };

test('no work to walk to: the card\'s ways are the boards, 功课, waits and 闭关 that earn 修为', () => {
  const html = gateCardHtml(gate, { work: null, home }, w, { lang: 'zh', words: w });
  assert.match(html, /data-play="wuziqi">开局 · 五子 · 与人对弈 · 修为 \+180/);
  assert.match(html, /data-book[^>]*>算账 · 修为 \+189/);
  assert.match(html, /data-home-wait="[^"]+">兽潮 · 第6潮/);
  assert.match(html, /data-seclude-open>闭关/);
  assert.doesNotMatch(html, /data-book[^>]*>去修炼/, 'never the bare book');
});

test('work to walk to keeps its one go; nothing at all falls back to the book', () => {
  assert.match(gateCardHtml(gate, { work: { place: { id: 'houshan', name: '后山' }, here: false }, home }, w), /data-go="houshan">去修炼 · 后山/);
  assert.match(gateCardHtml(gate, { work: null, locked: ['seclusion'] }, w), /data-book[^>]*>去修炼/);
  // At the gated scene Look's own `work` is null; the stage quest's (look anywhere) is the one to walk to.
  assert.match(gateCardHtml(gate, { work: null, stage_quest: { work: { place: { id: 'houshan', name: '后山' }, here: false } }, home }, w), /data-go="houshan">去修炼 · 后山/);
});

test('the 事 book\'s 阶段任务 row, short with no work: the one next act that earns it', () => {
  const look = { stage_quest: { step: '练气四层圆满', now: gate.now, met: false, work: null }, home, quests: [], book: [] };
  const html = bookPopHtml({ look, lang: 'zh', words: w });
  assert.match(html, /阶段任务 · 练气四层圆满[\s\S]*?data-play="wuziqi"/);
});
