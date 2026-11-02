// 手边的棋局 (Hanli 2026-11-02: 「可以, 按你说的做」, then 「1,2 可以合并? 用边框颜色区分一下?」): one row — the 回's story boards,
// every timed or daily game open now (开局 here, 去X › a walk away, a notice), the cooldowns back within hours last.
// The rules own it (rules/tray.mjs over the one registry, rules/aside.mjs PLAY_KINDS); the page draws it (cards.js trayHtml).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { divine, look, move, playTo } from '../scripts/rules.mjs';
import { ASIDE_KINDS, PLAY_KINDS } from '../scripts/rules/aside.mjs';
import { COOL_MAX_MIN } from '../scripts/rules/tray.mjs';
import { WORDS, trayHtml } from '../scripts/cards.js';

const content = loadContent();
const T = content.tasks.tasks.find((t) => t.shouchao);
const START = new Date(2026, 9, 20, 9, 0);
const NOW = new Date(2026, 9, 20, 15, 0);
const ctx = (now = NOW) => ({ now, quests: [] });

/* 古四's 药园 behind him (the tide open, its first night's errand done), standing at 沉鼎观's 外门, 体力 full. */
const BASE = (() => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  try { return playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
})();
const at = (place, extra = {}) => ({ ...structuredClone(BASE), quests: { ...(BASE.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } },
  place, stamina: 100, stamina_at: NOW.toISOString(), ...extra });
const trayOf = (s, now = NOW) => look(s, content, ctx(now)).tray ?? [];
const draw = (l, extra = {}) => trayHtml({ look: l, lang: 'zh', words: WORDS.zh, qi: { st: 'full' }, ...extra });

test('one registry: 先放一放 is a facet of it (its kinds unchanged); every tray kind declares itself there', () => {
  assert.deepEqual(ASIDE_KINDS.map((k) => k.kind), ['replay', 'gongke', 'fantong', 'pool', 'tide', 'seclusion', 'her']);
  assert.deepEqual(PLAY_KINDS.filter((k) => k.tray).map((k) => k.kind), ['fantong', 'pool', 'yaoshou', 'tide', 'seclusion', 'her', 'errands', 'mijing', 'chance', 'visitor']);
  assert.ok(PLAY_KINDS.filter((k) => !k.open).every((k) => !k.takes), 'a kind never played while set aside takes no verb');
});

test('each entry: what it is, what is left, where, and its button — 开局 here or anywhere, 去X › a walk away', () => {
  const s = at('waimen');
  const rows = trayOf(s);
  const tide = rows.find((e) => e.id === T.id);
  assert.deepEqual({ seg: tide.seg, act: tide.act, opens: tide.opens, arg: tide.arg, left: tide.left, task: tide.task },
    { seg: 'open', act: 'open', opens: 'play', arg: T.id, left: { unit: 'night', n: 1 }, task: T.id }, '兽潮 in the 观: 开局');
  for (const id of ['seclusion', 'divine']) {
    const e = rows.find((x) => x.id === id);
    assert.equal(e?.act, 'open', `${id} opens anywhere`);
    assert.equal(e.where, undefined, `${id}: no place`);
  }
  // Every walk shown is one Move takes; every entry has a button, or is a notice.
  for (const e of rows) {
    assert.ok(['open', 'go', 'notice', 'cool'].includes(e.seg), e.id);
    if (e.act === 'go') assert.equal(move(s, content, ctx(), { place: e.go.id }).result.ok, true, `${e.id}: the walk to ${e.go.id}`);
  }
  // 妖兽出没 from the 外门 is a walk to its pool — and the walk is taken; there, 开局 is the pool's own fight.
  const away = rows.find((e) => e.id === 'yaoshou');
  assert.equal(away.act, 'go');
  assert.deepEqual(away.left, { unit: 'batch', n: content.balance.events.yaoshou.batch, of: content.balance.events.yaoshou.batch });
  const walked = move(s, content, ctx(), { place: away.go.id });
  assert.equal(walked.result.ok, true);
  // (The arrival may meet something first; standing there with the beast up, it is 开局.)
  const there = trayOf({ ...s, place: away.go.id }).find((e) => e.id === 'yaoshou');
  assert.deepEqual([there.act, there.opens], ['open', 'duel']);
  assert.equal(there.stage, `duel:${there.arg}`, 'the 降妖 card it would repeat on the stage');
  const out = s;
  // The page: 开局 opens the board by its own opener, 去X › walks.
  const html = draw({ tasks: [], tray: trayOf(out) });
  assert.match(html, new RegExp(`data-go="${away.go.id}"[^>]*>去${away.go.name}`));
  assert.match(draw({ tasks: [], tray: rows }), new RegExp(`data-play="${T.id}"`));
  assert.match(draw({ tasks: [], tray: rows }), /data-seclude-open/);
});

test('对对子 once its scene is behind him: today\'s couplets at the 讲堂, walked to from elsewhere', () => {
  const t = content.aigames.duizi.teachers[0];
  const s = at('waimen', { done_scenes: [...BASE.done_scenes, t.after] });
  const e = trayOf(s).find((x) => x.id === 'duizi');
  assert.equal(e.left.unit, 'couplets');
  assert.equal(e.left.n, content.aigames.duizi.rounds);
  assert.equal(e.act, 'go');
  assert.equal(e.go.id, t.at);
  assert.equal(trayOf({ ...s, place: t.at }).find((x) => x.id === 'duizi').act, 'open', 'at the 讲堂: 开局');
  assert.equal(trayOf(at('waimen')).find((x) => x.id === 'duizi'), undefined, 'before its scene: not there');
});

test('exclusions: a card on the stage, a game done for today, a road Move refuses', () => {
  const s = at('waimen');
  const rows = trayOf(s);
  // On the stage: the entry naming that card is not drawn again; its task never doubles as a story board.
  const tide = rows.find((e) => e.id === T.id);
  const story = { id: T.id, kind: 'board', title: '兽潮 · 第1潮', status: 'offered', tide: true };
  assert.doesNotMatch(draw({ tasks: [story], tray: rows }, { stageKeys: [tide.stage] }), new RegExp(`data-play="${T.id}"`));
  assert.equal(draw({ tasks: [story], tray: rows }).split(`data-play="${T.id}"`).length, 2, 'drawn once, as the tray entry');
  // Done for today: the day's cast leaves 问卦 out (no cooldown row either).
  const cast = divine(s, content, ctx(), {});
  assert.equal(cast.result.ok, true, JSON.stringify(cast.result).slice(0, 200));
  assert.equal(trayOf(cast.state).find((e) => e.id === 'divine'), undefined);
  // A road refused: the book set aside, nothing walks (Move waits for it) — the entries stay, without the walk.
  const held = trayOf({ ...at('shanlu'), aside: { scene: BASE.scene, items: [], i: 0, j: 0 } });
  assert.ok(held.length);
  assert.ok(held.every((e) => e.act !== 'go'), JSON.stringify(held.map((e) => [e.id, e.act])));
});

test('cooling: only a wait back within hours, muted at the row\'s end; a longer one is not in the tray', () => {
  const s = at('waimen');
  const every = content.balance.events.shouchao.every_h * 60;
  const just = { ...s, shouchao: { ...(s.shouchao ?? {}), n: 1 }, events: { ...(s.events ?? {}), shouchao: { at: new Date(NOW.getTime() - 10 * 60_000).toISOString(), day: null, n: 1 } } };
  const cool = trayOf(just).find((e) => e.id === T.id);
  assert.equal(cool.seg, 'cool');
  assert.equal(cool.wait_min, every - 10);
  assert.ok(cool.act === undefined, 'nothing to start');
  // A wait past the cap (a clock set ahead): out.
  const far = { ...just, events: { ...just.events, shouchao: { ...just.events.shouchao, at: new Date(NOW.getTime() + COOL_MAX_MIN * 60_000).toISOString() } } };
  assert.equal(trayOf(far).find((e) => e.id === T.id), undefined);
  const html = draw({ tasks: [], tray: trayOf(just) });
  assert.match(html, new RegExp(`class="card task waiting cool" data-wait="${T.id}"`));
  assert.match(html, /兽潮 · 第1潮/);
});

test('order: the story\'s boards, then 开局, then 去X ›, then notices, then the cooldowns', () => {
  const s = at('waimen');
  const rows = trayOf(s);
  const segs = rows.map((e) => e.seg);
  assert.deepEqual(segs, [...segs].sort((a, b) => ['open', 'go', 'notice', 'cool'].indexOf(a) - ['open', 'go', 'notice', 'cool'].indexOf(b)));
  const cool = { kind: 'pool', id: 'pool:x', title: '某地', wait_min: 30, seg: 'cool' };
  const go = { kind: 'errands', id: 'errands', left: { unit: 'errands', n: 2 }, seg: 'go', act: 'go', where: { id: 'zhishi', name: '执事堂' }, go: { id: 'zhishi', name: '执事堂' } };
  const open = { kind: 'seclusion', id: 'seclusion', left: { unit: 'today' }, seg: 'open', act: 'open', opens: 'seclude' };
  const html = draw({ tasks: [{ id: 'b1', kind: 'board', title: '一局', status: 'offered' }], tray: [open, go, cool] });
  const ix = ['class="card task story', 'data-tray="seclusion"', 'data-tray="errands"', 'data-wait="pool:x"'].map((k) => html.indexOf(k));
  assert.ok(ix.every((n) => n >= 0) && ix.every((n, i) => !i || n > ix[i - 1]), JSON.stringify(ix));
  assert.match(html, /执事堂差事/);
  assert.match(html, /2 件 · 执事堂/);
  assert.match(html, /去执事堂 ›/);
  assert.match(html, /class="card task timed"/, 'the games beside the story: their own (jade) border');
});

test('the empty state: only when all of it is empty', () => {
  assert.equal(draw({ tasks: [] }), `<div class="small dim trayempty">${WORDS.zh.trayEmpty}</div>`);
  assert.doesNotMatch(draw({ tasks: [], tray: [{ kind: 'pool', id: 'pool:x', title: 'x', wait_min: 30, seg: 'cool' }] }), /trayempty/);
  assert.doesNotMatch(draw({ tasks: [{ id: 'b1', kind: 'board', title: '一局', status: 'offered' }] }), /trayempty/);
  assert.equal(trayHtml({ look: { tasks: [] }, lang: 'en', words: WORDS.en }), `<div class="small dim trayempty">${WORDS.en.trayEmpty}</div>`);
});
