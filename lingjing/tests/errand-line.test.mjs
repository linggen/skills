// 差事的话 (Hanli 2026-10-28, on his phone's 事 book: 「彭城的药钱, 没有提示, 玩家不知到怎么做这个差事」): every
// errand's row says what to do by name and where — the thing and where to get it, each step's place, who takes it —
// and one next act. Rules: scripts/rules/errand-line.mjs; the Mac (cards.js) and the phone show these as they are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, pick } from '../scripts/state.mjs';
import { look, move, quest } from '../scripts/rules.mjs';
import { resolve, task, win } from '../scripts/rules.mjs';
import { boardsFor, TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const DAY1 = new Date('2026-09-29T09:00:00');
const ctx = () => ({ now: DAY1, quests: [] });
const must = (fn, s, args) => {
  const out = fn(s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
const fresh = (s) => ({ ...s, stamina: 100, stamina_at: DAY1.toISOString() });
function step(s, exit) {
  if (exit === 'breathe') { s = must(win, s, { id: 'zhoutian-sanguan' }); s = must(task, s, { action: 'done', id: 'zhoutian-sanguan' }); }
  for (const [verb, args] of boardsFor(s, content, exit)) s = must(verb === 'win' ? win : task, s, args);
  return must(resolve, s, { exit });
}
const roaming = (lang = 'zh') => {
  let s = fresh(walk(newState(content, lang, DAY1), TO_OPEN, content, DAY1));
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = step(must(move, s, { place: 'jiangtang' }), 'on');
  s = step(must(move, s, { place: 'waimen' }), 'patrol');
  return fresh(s);
};
const row = (s, id) => look(s, content, ctx()).book.find((b) => b.id === id);
const lines = (r) => [...r.steps.map((x) => x.text), r.hand?.text].filter(Boolean);
const bare = (n) => String(n ?? '').split(' · ').at(-1);

test('彭城的药钱: names the 灵芝, where it is sold and its price, and the old man at 彭城 who takes it', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = must(quest, s, { action: 'take', id: 'xu-elder-herb' });
  let r = row(s, 'xu-elder-herb');
  assert.deepEqual(lines(r), ['带一株灵芝 · 彭城有卖 · 30灵石', '交给彭城坊市的老丈']);
  assert.equal(r.where.id, 'pengcheng');
  assert.ok(!r.where.here, 'never 「就在此处」 at 执事堂, whose store sells no 灵芝');
  assert.deepEqual([r.go.does, r.go.place.id, r.go.label], ['move', 'pengcheng', '去彭城']);
  // at 彭城: the buy, at its price
  s = { ...fresh(must(move, s, { place: 'pengcheng' })), wealth: 100 };
  r = row(s, 'xu-elder-herb');
  assert.equal(r.steps[0].text, '带一株灵芝 · 这里有卖 · 30灵石');
  assert.deepEqual([r.go.does, r.go.item, r.go.label], ['buy', 'lingzhi', '买灵芝 · 30灵石']);
  s = must((st, c, x, a) => resolveTrade(st, c, x, a), s, { action: 'buy', id: 'lingzhi' });
  r = row(s, 'xu-elder-herb');
  assert.equal(r.steps[0].text, '带一株灵芝 · 已在囊中');
  assert.ok(r.ready);
  assert.deepEqual([r.go.does, r.go.label], ['turn', '交 差']);
  s = must(quest, s, { action: 'turn', id: 'xu-elder-herb' });
  assert.ok(s.quests['xu-elder-herb'].done_at);
});

test('彭城的药钱 names the old man, but 交差 is where he stands (his ruling 2026-09-18: 不要让用户跑地图)', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = { ...must(quest, s, { action: 'take', id: 'xu-elder-herb' }), bag: { lingzhi: 1 } };
  const r = row(s, 'xu-elder-herb');
  assert.ok(r.ready);
  assert.equal(r.hand.text, '交给彭城坊市的老丈');
  assert.equal(r.go.does, 'turn', 'never a walk to 彭城 with the 灵芝 already in hand');
  s = must(quest, s, { action: 'turn', id: 'xu-elder-herb' });
  assert.ok(s.quests['xu-elder-herb'].done_at);
});

test('帮厨: each step its own place, in order — 先到饭堂提一壶茶 · 再把茶送到讲堂', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = { ...s, quests: { ...s.quests, 'wall-20260929-fantang-bangchu': { took: '2026-09-29', have: {} } } };
  let r = row(s, 'wall-20260929-fantang-bangchu');
  assert.deepEqual(r.steps.map((x) => x.text), ['先到饭堂提一壶茶', '再把茶送到讲堂']);
  assert.deepEqual([r.go.does, r.go.place.id], ['move', 'fantang']);
  // the lecture hall first counts for nothing: the tea is fetched before it is brought
  s = fresh(must(move, s, { place: 'jiangtang' }));
  assert.equal(row(s, 'wall-20260929-fantang-bangchu').steps[1].done, false);
  s = fresh(must(move, must(move, s, { place: 'waimen' }), { place: 'fantang' }));
  r = row(s, 'wall-20260929-fantang-bangchu');
  assert.equal(r.steps[0].done, true);
  assert.deepEqual([r.go.does, r.go.place.id], ['move', 'jiangtang']);
  s = fresh(must(move, must(move, s, { place: 'waimen' }), { place: 'jiangtang' }));
  assert.ok(s.quests['wall-20260929-fantang-bangchu'].done_at, 'brought, it hands itself in');
});

const WALL = new Set((content.walls ?? []).flatMap((w) => w.pool.map((p) => p.id)));
const qid = (id) => (WALL.has(id) ? `wall-20260929-${id}` : id);
/* Every errand there is: the authored ones, the east wall's whole pool, a notice of each template. */
function everyErrand() {
  const wall = (content.walls ?? []).flatMap((w) => w.pool.map((p) => p.id));
  // a market's 榜文: one of each template, at the first target it can name
  const notices = (content.notices ?? []).map((t) => allPlaces(content).map((p) => `daily-20260929-${t.id}-${t.kind === 'visit' || t.kind === 'board' ? p.id : p.has?.creature}`).find((id) => noticeOf(content, id))).filter(Boolean);
  assert.ok(notices.length >= (content.notices ?? []).length, 'a notice of every template');
  return [...content.quests.map((q) => q.id), ...wall, ...notices];
}

test('audit: every errand\'s line names its thing or target and a place, in zh and en, with a way to act', () => {
  for (const lang of ['zh', 'en']) {
    const base = must(move, roaming(lang), { place: 'zhishi' });
    for (const id of everyErrand()) {
      const s = { ...base, quests: { [qid(id)]: { took: '2026-09-29', have: {} } } };
      const r = look(s, content, ctx()).book.find((b) => b.id === qid(id));
      assert.ok(r, `${id} in the book`);
      const q = content.quests.find((x) => x.id === id) ?? (content.walls ?? []).flatMap((w) => w.pool).find((p) => p.id === id) ?? noticeOf(content, id);
      if (process.env.SHOW_LINES) console.log(lang, id, '|', lines(r).join(' | '), '|', r.go?.label);
      r.steps.forEach((st, i) => {
        const n = q.need[i];
        assert.ok(st.at?.name, `${lang} ${id} step ${i} has a place: ${st.text}`);
        assert.ok(st.text.toLowerCase().includes(bare(st.at.name).toLowerCase()), `${lang} ${id} step ${i} names its place: ${st.text}`);
        const what = n.item ? content.items.items.find((x) => x.id === n.item)?.name
          : n.task ? content.tasks.tasks.find((t) => t.id === n.task)?.title
            : n.creature ? content.creatures.creatures.find((c) => c.id === n.creature)?.name : null;
        if (what) assert.ok(st.text.includes(pick(what, lang)), `${lang} ${id} step ${i} names ${pick(what, lang)}: ${st.text}`);
        assert.ok(!/^\S+ \d+\/\d+$/.test(st.text), `${lang} ${id}: never a bare verb and count`);
        if (lang === 'zh') assert.ok(st.text.length <= 24, `${id} step ${i} short: ${st.text}`);
      });
      assert.equal(new Set(r.steps.map((x) => x.text)).size, r.steps.length, `${lang} ${id}: no two steps alike`);
      // a multi-step walk of visits says each step's own words — 帮厨's 「到 0/1 · 到 0/1」 never again
      if (q.need.length > 1) for (const n of q.need.filter((m) => m.kind === 'visit')) assert.ok(n.do, `${id}: each step of a walk says what is fetched or brought`);
      assert.ok(r.go, `${lang} ${id} has a next act`);
      if (q.need.some((n) => n.kind === 'carry')) assert.ok(r.hand, `${id}: a thing carried is handed to someone`);
    }
  }
});

import { trade as resolveTrade } from '../scripts/rules.mjs';
import { noticeOf } from '../scripts/rules/errands.mjs';
import { allPlaces } from '../scripts/rules/world.mjs';

/* ── 主页 · 待办 (Hanli 10-28: 「点dashboard的待办"彭城的药钱 · 执事堂" 也没反应」) ── */
import { WORDS, cardHtml } from '../scripts/cards.js';
const homeHtml = (l) => cardHtml({ card: 'next' }, { look: l, words: WORDS.zh, lang: 'zh' });
const TAPS = /data-(go|book|play|do|home-way|duel-start)=?/;

test('待办: an errand in hand is named by its next place and the tap does its next act — 彭城的药钱 · 彭城', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = must(quest, s, { action: 'take', id: 'xu-elder-herb' });
  const l = look(s, content, ctx());
  const r = l.home?.todo?.find((x) => x.id === 'xu-elder-herb');
  assert.deepEqual([r?.kind, r?.place?.id, r?.go?.does], ['held', 'pengcheng', 'move'], JSON.stringify(l.home?.todo));
  assert.match(homeHtml(l), /<button class="act go quiet hometodo" data-go="pengcheng">彭城的药钱 · 彭城<\/button>/);
  // at 彭城 with no 灵芝: the buy, not a walk to where he stands
  const at = { ...fresh(must(move, s, { place: 'pengcheng' })), wealth: 100 };
  const h = look(at, content, ctx()).home.todo.find((x) => x.id === 'xu-elder-herb');
  assert.equal(h.go.does, 'buy');
  assert.match(homeHtml(look(at, content, ctx())), /data-do="buy" data-id="lingzhi">彭城的药钱 · 彭城</);
});

test('待办: every kind that asks something of him is a tap (a cooldown and the set-aside count are lines: nothing to do yet)', () => {
  const place = { id: 'pengcheng', name: '彭城' };
  const rows = {
    ready: { kind: 'ready', n: 1, title: 'x' },
    held: { kind: 'held', id: 'q', title: 'x', place, go: { does: 'move', place, label: '去彭城' } },
    heldBuy: { kind: 'held', id: 'q', title: 'x', place: { ...place, here: true }, go: { does: 'buy', item: 'lingzhi', place, label: '买' } },
    heldPlay: { kind: 'held', id: 'q', title: 'x', place, go: { does: 'play', task: 'huarong', place, label: '开局' } },
    heldHere: { kind: 'held', id: 'q', title: 'x', place: { ...place, here: true } },
    heldBare: { kind: 'held', id: 'q', title: 'x' },
    gongke: { kind: 'gongke', id: 'g', title: 'x', progress: 5 },
    tide: { kind: 'tide', id: 'shouchao', title: 'x' },
    rerun: { kind: 'rerun', place, title: 'x' },
  };
  for (const [name, r] of Object.entries(rows)) {
    const out = homeHtml({ home: { gate: null, next: null, todo: [r] } });
    const chip = out.slice(out.indexOf('hometodos'));
    assert.match(chip, TAPS, `${name}: ${chip}`);
  }
  // A cooldown says when it opens again; the boards set aside open the first again.
  assert.match(homeHtml({ home: { gate: null, next: null, todo: [{ kind: 'wait', id: 'w', title: 'x', wait_min: 5 }] } }), /data-home-wait="x · \d+:\d\d 再开"/);
  assert.match(homeHtml({ home: { gate: null, next: null, todo: [{ kind: 'skipped', n: 2, id: 'b1' }] } }), /data-replay-play="b1"/);
});
