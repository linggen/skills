// Never a blank stage (Hanli, 2026-10-15: at 外门 with the story at 柴房 the stage was only its
// backdrop — 「webUI要提示下一步的事情，不要让玩家不知道下面该做什么」): when nothing in main is a
// thing to do, the page's 下一步 card says where the story goes and walks him there in one tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { stageCards, stageSlots, withNext } from '../scripts/stage.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const kinds = (cards) => cards.map((c) => c.card);

test('下一步 stands only when nothing else is a thing to do — never in a fight or 闭关', () => {
  const l = { place: { id: 'waimen' }, tasks: [], scene: null };
  assert.deepEqual(kinds(withNext(l, [])), ['next']);
  assert.deepEqual(kinds(withNext(l, [{ card: 'goal' }, { card: 'hexagram' }])), ['goal', 'hexagram', 'next']);
  for (const c of [{ card: 'offer' }, { card: 'board', id: 'b' }, { card: 'duel', id: 'd' }, { card: 'panel' }, { card: 'closed' }, { card: 'road' }]) assert.deepEqual(kinds(withNext(l, [c])), [c.card], c.card);
  assert.deepEqual(withNext({ ...l, fight: {} }, []), []);
  assert.deepEqual(withNext({ ...l, seclusion: {} }, []), []);
  assert.deepEqual(kinds(stageSlots(l, withNext(l, [{ card: 'hexagram' }])).main), ['next'], 'it is what main shows');
});

test('at 外门 with the story at 柴房: the stage holds 下一步, and its one button walks to 柴房', () => {
  const opened = walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW);
  // 修屋顶 already in hand (no offer card), as he stood (live, 2026-10-15).
  const s = { ...opened, scene: 'wm-chaifang', place: 'waimen', quests: { ...opened.quests, 'xu-waimen-roof': { took: '2026-09-29', have: {} } }, stamina: 100, stamina_at: NOW.toISOString() };
  const l = look(s, content, { now: NOW, quests: [] });
  // As he stood: every errand here taken or done (no offer, no board), the 序章's 「完」 put away (the page's 合上).
  const bare = { ...l, offers: [], tasks: [], chapter: { ...l.chapter, close: null } };
  assert.deepEqual(kinds(stageSlots(bare, stageCards(bare)).main), ['next'], JSON.stringify(stageCards(bare)));
  assert.equal(l.waypoint.toward.id, 'chaifang');
  const html = cardHtml({ card: 'next' }, { look: { ...l, offers: [] }, words: WORDS.zh, lang: 'zh' });
  assert.match(html, /data-go="chaifang"/);
  assert.match(html, /去沉鼎观 · 柴房 ›/);
  assert.match(html, /外门大比/, 'the goal line');
});

test('the card names the places passed, the work while the cauldron waits, and what can be handed in', () => {
  const w = WORDS.zh, base = { place: { id: 'a' }, tasks: [], book: [] };
  const far = cardHtml({ card: 'next' }, { look: { ...base, waypoint: { text: '路通向丙。', place: { id: 'c', name: '丙' }, toward: { id: 'c', name: '丙', via: ['乙'] } } }, words: w, lang: 'zh' });
  assert.match(far, /data-go="c"/);
  assert.match(far, /经 乙/);
  const gated = cardHtml({ card: 'next' }, { look: { ...base, waypoint: { gate: { step: '二层', progress: 40, now: {} } }, work: { place: { id: 'w', name: '讲堂' }, here: false } }, words: w, lang: 'zh' });
  assert.match(gated, /data-go="w"/);
  assert.match(gated, /去讲堂找事做/);
  const ready = cardHtml({ card: 'next' }, { look: { ...base, book: [{ ready: true }, { ready: true, away: true }] }, words: w, lang: 'zh' });
  assert.match(ready, /data-book/);
  assert.match(ready, /可交 1/);
  assert.match(ready, /四处走走/, 'no goal: still a line, never empty');
});
