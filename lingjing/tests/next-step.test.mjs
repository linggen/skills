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

test('a thing a scene brings on is one line while the scene\'s game waits beside it — the board stays in view (00-sleep\'s 洗髓, the crawler 2026-10-15)', async () => {
  const { sceneGameOpen } = await import('../scripts/cards.js');
  const { codexCompactHtml } = await import('../scripts/codex.js');
  const look = { scene: { show: [{ card: 'board', id: 'xisui-hold' }], exits: [] }, tasks: [{ id: 'xisui-hold', status: 'offered' }] };
  assert.equal(sceneGameOpen(look), true);
  assert.equal(sceneGameOpen({ ...look, tasks: [{ id: 'xisui-hold', status: 'done' }] }), false, 'played: the thing has its large card again');
  assert.equal(sceneGameOpen({ scene: { exits: [{ game: { kind: 'duel' } }] }, tasks: [] }), true, 'a fight not yet won');
  const pill = { id: 'xisui-dan', kind: '物品', tag: '丹药', name: '洗髓丹', lines: ['一颗黑丸子。', '「疼，别喊。」'], image: 'x.webp' };
  assert.match(codexCompactHtml(pill), /codexcompact big/);
  const small = codexCompactHtml(pill, { small: true });
  assert.doesNotMatch(small, /codexcompact big/);
  assert.doesNotMatch(small, /疼，别喊/, 'one line only; a tap opens it whole');
});

test('a card that only tells is no thing to do: 下一步 stands before 狰\'s 已收服 card (the crawler, 2026-10-15, 药园 after the fight)', () => {
  const l = { place: { id: 'yaoyuan', encounter: { creature: { id: 'zheng' }, beaten: true, tamed: true } }, tasks: [], scene: null };
  const cards = withNext(l, [{ card: 'goal' }, { card: 'creature', id: 'zheng' }]);
  assert.deepEqual(kinds(cards), ['goal', 'creature', 'next']);
  assert.deepEqual(kinds(stageSlots(l, cards).main), ['next'], 'the way on first; the record waits behind it');
  // a beast beaten and not yet won over: its card carries 收服 — a thing to do
  const winnable = { ...l, place: { id: 'yaoyuan', encounter: { creature: { id: 'zheng' }, beaten: true, tamed: false, likes: { id: 'luobo' } } } };
  assert.deepEqual(kinds(withNext(winnable, [{ card: 'creature', id: 'zheng' }])), ['creature']);
});

test('a 回\'s 「完」 held back by a seal or a set piece is not a blank stage: 下一步 waits with it', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  // The 完 is taken off while a moment plays (stageBusy) or the ending waits — and while it is, no 下一步.
  assert.match(src, /const closeHeld = \(\) => closeUp\(\) && \(stageBusy\(\) \|\| endingWaits\(\)\);/);
  assert.match(src, /closeHeld\(\) \? queued\.filter\(\(c\) => c\.card !== 'next'\) : withNext\(look,/);
});

test('下一步 on a 今 scene: the scene\'s own way on — never the 古\'s goal, road, work, book or 货郎', () => {
  // Review, 2026-10-15: next() had no 今线 guard; a 古 waypoint on the look would have stood on 沈芒's stage.
  const gu = { waypoint: { text: '去沉鼎秘境 · 石门', place: { id: 'shimen', name: '石门' }, toward: { id: 'shimen', name: '石门', via: [] } },
    work: { kind: 'errand', place: { id: 'waimen', name: '外门' }, here: false, titles: ['药园巡夜'] },
    book: [{ id: 'q', ready: true }], visitors: [{ say: '货郎今日上山', today: true, place: { id: 'yanwu', name: '演武场' } }] };
  const scene = { id: 'j04-gym', line: 'jin', spot: '沂中医 · 学生健身房', panel: { taps: [{ id: 'on', label: '十月三十一日，对抗赛', quiet: 'label' }] }, exits: [{ id: 'on' }] };
  const l = { place: { id: 'chaifang' }, tasks: [], scene, ...gu };
  assert.deepEqual(kinds(withNext(l, [])), ['next']);
  const html = cardHtml({ card: 'next' }, { look: l, words: WORDS.zh, lang: 'zh' });
  assert.match(html, /data-panel-exit="on"/);
  assert.match(html, /十月三十一日，对抗赛/);
  assert.match(html, /沂中医 · 学生健身房/);
  assert.doesNotMatch(html, /石门|外门|药园|货郎|data-go|data-book/);
  // A 今 scene with no way on to name: no 下一步 at all, and never the 古's.
  const none = { ...l, scene: { ...scene, panel: { taps: [{ id: 'on', label: 'x', spent: true }] } } };
  assert.deepEqual(withNext(none, []), []);
  assert.equal(cardHtml({ card: 'next' }, { look: none, words: WORDS.zh, lang: 'zh' }), '');
});
