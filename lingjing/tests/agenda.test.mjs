// 事 — ONE list at two sizes (Hanli 2026-11-04: 「可以, 按你说的做」): Look's `agenda` (rules/agenda.mjs) orders every task
// once — 主线 · 目标 · 其他 — the tray under the stage is its head and 「全部 ›」 opens the whole of it; the footer has no
// 「事」 chip any more. The rules own the order; the page (cards.js trayHtml · bookPopHtml) and the phone draw it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, move, playTo } from '../scripts/rules.mjs';
import { agendaReady, stageLeads, TRAY_MAX } from '../scripts/rules/agenda.mjs';
import { FOOTER } from '../scripts/stage.mjs';
import { WORDS, allChipHtml, bookPopHtml, trayHtml } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const START = new Date(2026, 9, 20, 9, 0);
const NOW = new Date(2026, 9, 20, 15, 0);
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const th = content.ladder.tiers[0].thresholds;
const page = (l) => ({ look: l, lang: 'zh', words: WORDS.zh, qi: { st: 'full' } });
const keysIn = (html) => [...html.matchAll(/data-agenda="([^"]+)"/g)].map((m) => m[1]);
const GROUPS = ['main', 'goal', 'other'];

/* Saves across 卷一: walked to each scene, 体力 full. */
const played = (scene) => { const s = playTo(content, newState(content, 'zh', START), scene, { now: START }).state; return { ...s, stamina: 100, stamina_at: NOW.toISOString() }; };
const SAVES = ['wm-ahe', 'wm-yaoyuan', 'wm-chaifang', 'wm-kaikai'].map(played);
/* 古四's 柴房 night waits on 一层圆满 (tests/gates.test.mjs): walked off to 后山, the stage quest holds the story. */
const atChaifang = (progress) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
  done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-yaoyuan'], tier: 'qi', step: 1, progress, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString() });
const heldOff = (progress) => move(atChaifang(progress), content, ctx, { place: 'houshan' }).state;

/* Where each kind's facts are in Look: the item is a reference, and it must point at something there. */
const SOURCE = {
  way: (l) => l.waypoint, here: (l) => l.capped?.story?.here, stage: (l) => l.stage_quest, aim: (l) => l.stage_quest?.work,
  task: (l, id) => (l.tasks ?? []).find((t) => t.id === id), tray: (l, id) => (l.tray ?? []).find((e) => e.id === id),
  kept: (l) => (l.kept ?? []).length, errand: (l, id) => (l.book ?? []).find((q) => q.id === id && !q.chore),
  chore: (l, id) => (l.book ?? []).find((q) => q.id === id && q.chore), chance: (l) => l.chance, kaifu: (l) => l.kaifu,
  hour: (l) => l.tray_hour?.drawn, happen: (l) => (l.tray ?? []).some((e) => e.happening), offer: (l, id) => (l.offers ?? []).find((o) => o.id === id), work: (l) => l.work, visitor: (l, id) => (l.visitors ?? []).find((v) => v.place?.id === id),
};

test('one list in Look: every item once, in 主线 · 目标 · 其他 order, each pointing at the Look field that holds it', () => {
  for (const s of [...SAVES, heldOff(40)]) {
    const l = look(s, content, ctx), items = l.agenda ?? [];
    assert.ok(items.length, s.scene);
    assert.equal(new Set(items.map((i) => i.key)).size, items.length, `${s.scene}: no duplicates`);
    const order = items.map((i) => GROUPS.indexOf(i.group));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${s.scene}: groups in order`);
    for (const i of items) assert.ok(SOURCE[i.kind]?.(l, i.id), `${s.scene}: ${i.key} points at nothing`);
    // Everything from both old places is in it: the tray's rows and the book's lines, the offers and the stage quest.
    for (const e of l.tray ?? []) assert.ok(items.some((i) => i.key === `tray:${e.id}`), `${s.scene}: tray ${e.id}`);
    for (const q of l.book ?? []) assert.ok(items.some((i) => i.id === q.id && ['errand', 'chore'].includes(i.kind)), `${s.scene}: book ${q.id}`);
    for (const o of l.offers ?? []) assert.ok(items.some((i) => i.key === `offer:${o.id}`), `${s.scene}: offer ${o.id}`);
    if (l.stage_quest) assert.ok(items.some((i) => i.key === 'stage:stage'), `${s.scene}: the stage quest`);
    if (l.waypoint) assert.ok(items.some((i) => i.key === 'way:way' || (i.key === 'stage:stage' && i.way)), `${s.scene}: the goal line`);
  }
});

test('主线 first; when the stage quest holds the story it leads, the goal line riding under it — else it heads 目标', () => {
  const held = look(heldOff(40), content, ctx);
  assert.equal(held.waypoint.gate.kind, 'stage');
  assert.ok(stageLeads(held, heldOff(40)));
  assert.deepEqual([held.agenda[0].key, held.agenda[0].group, held.agenda[0].way], ['stage:stage', 'main', true]);
  assert.ok(!held.agenda.some((i) => i.key === 'way:way'), 'the goal line is not a second item');
  const pop = bookPopHtml(page(held));
  assert.match(pop, /data-agenda-group="main"[^>]*>[\s\S]*?data-agenda="stage:stage"[\s\S]*?阶段任务 · 修炼到练气一层圆满/, '主线: the stage quest, then the goal line');
  // Free (the gate is further on): the goal line leads, the stage quest is 目标's first.
  const free = look(SAVES[1], content, ctx);
  assert.ok(!stageLeads(free, SAVES[1]));
  assert.equal(free.agenda.find((i) => i.key === 'stage:stage')?.group, 'goal');
  // Met: 目标, and it counts to hand in.
  const met = look(move(atChaifang(th[1]), content, ctx, { place: 'houshan' }).state, content, ctx);
  const st = met.agenda.find((i) => i.key === 'stage:stage');
  assert.deepEqual([st.group, st.ready], ['goal', true]);
  assert.equal(met.agenda.filter((i) => i.group === 'main')[0]?.key, 'way:way');
});

test('目标: what the stage quest\'s work points at is tagged with its layer — 「练气一层 ↑」 on the row and the card', () => {
  const l = look(SAVES[1], content, ctx), sq = l.stage_quest;
  assert.ok(sq && !sq.met && sq.work?.place?.id, JSON.stringify(sq));
  const goal = l.agenda.filter((i) => i.group === 'goal' && i.serves);
  assert.ok(goal.length, 'a serving item');
  for (const i of goal) assert.equal(i.serves, '练气一层', 'the layer, without 圆满');
  assert.ok(l.agenda.filter((i) => i.group !== 'goal').every((i) => !i.serves), 'only 目标 serves');
  assert.match(bookPopHtml(page(l)), new RegExp(`data-agenda="${goal[0].key}"[\\s\\S]*?class="serves">练气一层 ↑<`));
  assert.match(trayHtml(page(l)), /class="serves">练气一层 ↑</);
  // Held off, at 后山: the work points at a beast there — a fight in the tray if one stands, else the pointer itself.
  const off = look(heldOff(40), content, ctx);
  assert.ok(off.agenda.some((i) => i.group === 'goal' && i.serves), JSON.stringify(off.agenda));
});

test('the tray is the head of the list: its cards are 事\'s rows, in the same order, and 「全部 ›」 is last', () => {
  for (const s of [...SAVES, heldOff(40)]) {
    const l = look(s, content, ctx), tray = trayHtml(page(l)), pop = bookPopHtml(page(l));
    const t = keysIn(tray), b = keysIn(pop);
    assert.ok(t.length, `${s.scene}: a tray`);
    let at = -1;
    for (const k of t) { const n = b.indexOf(k, at + 1); assert.ok(n > at, `${s.scene}: ${k} in 事 after the one before (${t.join(' ')} | ${b.join(' ')})`); at = n; }
    assert.ok(tray.trimEnd().endsWith('</button>') && /class="bookchip allchip[^"]*" data-book[^>]*>全部 ›/.test(tray), `${s.scene}: 全部 last`);
    assert.ok(l.agenda.filter((i) => i.tray && i.group === 'other').length <= TRAY_MAX);
    // Every tray card off its buttons opens 事 at its own row.
    for (const m of tray.matchAll(/data-agenda="([^"]+)" data-agenda-at="([^"]+)"/g)) assert.equal(m[1], m[2]);
    // 主线's card comes first in the tray when there is one to show.
    const main = l.agenda.find((i) => i.group === 'main' && i.tray);
    if (main && t.includes(main.key)) assert.equal(t[0], main.key, s.scene);
  }
});

test('交N sits on 「全部 ›」: the count of what can be handed in, and nowhere else in the tray', () => {
  const met = look(move(atChaifang(th[1]), content, ctx, { place: 'houshan' }).state, content, ctx);
  const n = agendaReady(met.agenda);
  assert.ok(n >= 1);
  const tray = trayHtml(page(met));
  assert.match(tray, new RegExp(`class="bookchip allchip ready[^"]*" data-book[^>]*>全部 ›<b class="due">交${n}</b></button>$`));
  assert.equal((tray.match(/class="due"/g) ?? []).length, 1);
  // 开府 counts each of its done rows.
  assert.equal(agendaReady([{ ready: true }, { ready: true, n: 3 }, {}]), 4);
  assert.equal(allChipHtml(page({ agenda: [] })), '');
});

test('the footer has no 「事」 chip: 去往 · 木牌 · 天气 · 时辰 · 书 · 物品; every way that named 事 opens the list', () => {
  assert.ok(!FOOTER.includes('errands'));
  assert.deepEqual(FOOTER.filter((p) => p !== 'more' && p !== 'festival'), ['her', 'weather', 'hour', 'books', 'bag']);
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const chips = src.slice(src.indexOf('const FOOT_CHIPS = {'), src.indexOf('const IN_A_FIGHT'));
  assert.doesNotMatch(chips, /bookChipHtml|allChipHtml|data-book/, 'no chip of 事 in the footer');
  assert.match(chips, /more: \(slots\) => `<span class="errands">\$\{view\.bookOpen \? bookPopHtml\(ctx\(\)\) : ''\}\$\{moreHtml\(slots\)\}/, 'the list stands from there, and 还有 N 件 keeps its place');
  // The cap's 「走剧情破境 ›」 opens it at 主线; a tray card at its own item; 收着 n at the kept boards.
  assert.match(src, /class="capgo" data-book data-book-at="group:main"/);
  assert.match(src, /\['\[data-agenda-at\]', \(el\) => openBook\(el\.dataset\.agendaAt\)\]/);
  assert.match(src, /\['\[data-kept-open\]', \(\) => openBook\('kept:kept'\)\]/);
  const cards = fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cards, /export function bookChipHtml/);
  // Every other opener names where 事 opens (an item, or a group): only 「全部 ›」 opens it at the top.
  for (const [name, code] of [['cards.js', cards], ['lingjing.js', src]]) {
    for (const line of code.split('\n').filter((l) => /data-book(?![-\w])/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l))) {
      assert.ok(/data-book-at|bookAt\(|allchip|\['\[data-book\]'/.test(line), `${name}: an opener of 事 with nowhere to land: ${line.trim().slice(0, 160)}`);
    }
  }
});

test('小游戏池 in the list: the draw together under one heading, no countdown (2026-11-04: it waits till played); all played, the heading says so', () => {
  const at = (h) => new Date(2026, 9, 20, h, 10);
  // A 时辰 whose draw stands in the tray (the 观, 体力 full): find one.
  let l = null;
  for (let h = 1; h < 24 && !l; h += 2) { const x = look(SAVES[1], content, { now: at(h), quests: [] }); if ((x.tray ?? []).some((e) => e.pool)) l = x; }
  assert.ok(l, 'a 时辰 with its draw in the tray');
  const items = l.agenda, head = items.findIndex((i) => i.key === 'hour:pool');
  assert.ok(head >= 0 && items[head].group === 'other' && items[head].ends_min === undefined);
  const pooled = items.map((i, n) => [i, n]).filter(([i]) => i.pool).map(([, n]) => n);
  assert.ok(pooled.length);
  assert.deepEqual(pooled, pooled.map((_, k) => head + 1 + k), 'grouped, right under the heading');
  assert.ok(!items[head].tray, 'the heading is the list\'s, never a tray card');
  const pop = bookPopHtml(page(l));
  assert.match(pop, /class="thead small dim poolhead"[^>]*>小游戏 · 玩过一局才换下一局</);
  assert.doesNotMatch(pop + trayHtml(page(l)), /分后换/, 'no countdown that is not true');
  // All played: the heading is the all-played line with the next 时辰.
  const all = { ...l, agenda: undefined, tray_hour: { ...l.tray_hour, played: l.tray_hour.drawn } };
  assert.match(bookPopHtml(page(all)), /poolhead allplayed[^>]*>这个时辰的都玩过了 · \S+时再来</);
  assert.match(bookPopHtml({ ...page(l), lang: 'en', words: WORDS.en }), /Small games · the next once this one is played/);
});

test('the strip shows what is new or due; 闭关, on hand all day, is 全部\'s alone (Hanli 11-05: 「这个闭关卡一直这么显示吗? 可以折叠进全部dialog里」)', async () => {
  const { agendaLook } = await import('../scripts/rules/agenda.mjs');
  const { PLAY_KINDS } = await import('../scripts/rules/aside.mjs');
  const row = PLAY_KINDS.find((k) => k.kind === 'seclusion').tray(content, {}, { locked: [] })[0];
  assert.equal(row.standing, true, '闭关 is a standing row');
  const items = agendaLook(content, {}, { tasks: [], book: [] }, [{ kind: 'seclusion', ...row, seg: 'open', act: 'open' }, { kind: 'fantong', id: 'fantong', left: { unit: 'today' }, opens: 'gear', seg: 'open', act: 'open' }]);
  const sec = items.find((i) => i.kind === 'tray' && i.id === 'seclusion'), fan = items.find((i) => i.kind === 'tray' && i.id === 'fantong');
  assert.ok(sec, '闭关 is still in 全部');
  assert.ok(!sec.tray, 'never on the strip');
  assert.ok(fan.tray, 'what is due still is');
  // 全部 opens it as before (its 开局); the strip draws no card for it.
  const tray = [{ kind: 'seclusion', ...row, seg: 'open', act: 'open' }], look2 = { tasks: [], book: [], tray };
  look2.agenda = agendaLook(content, {}, look2, tray);
  assert.match(bookPopHtml({ look: look2, words: WORDS.zh, lang: 'zh' }), /data-seclude-open>开局/);
  assert.doesNotMatch(trayHtml({ look: look2, words: WORDS.zh, lang: 'zh' }), /data-tray="seclusion"/);
});
