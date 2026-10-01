// The stage's one-at-a-time rule (scripts/queue.js, 2026-10-01): the passage
// that leads into a board, a fight, a set piece or a seal finishes in the box
// first, then that thing opens; the page's moments come one at a time, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterBook, bookAhead, BOX_FIRST, boxGivesWay, MOMENTS, momentMay } from '../scripts/queue.js';

const cards = [{ card: 'meet', id: 'yinyue' }, { card: 'panel' }, { card: 'people' }, { card: 'board', id: 'deer-wind' }, { card: 'duel', id: 'longzhi' }, { card: 'tale' }, { card: 'lundao' }, { card: 'offer' }];

test('the games wait for the book: while a passage is ahead, no board, duel, 传闻 or 论道 stands; after it, all of them', () => {
  assert.deepEqual(afterBook(cards, true).map(c => c.card), ['panel', 'people', 'offer']);
  assert.deepEqual(afterBook(cards, false), cards);
  for (const k of ['board', 'duel', 'tale', 'lundao', 'meet']) assert.ok(BOX_FIRST.has(k), k);
});

test('the book is ahead while passages are owed, being drawn or playing — but not while paused at a 回\'s turn', () => {
  assert.equal(bookAhead({ owed: true }), true, 'owed, not yet drawn (the choice\'s passage is coming)');
  assert.equal(bookAhead({ drawing: true }), true);
  assert.equal(bookAhead({ playing: true }), true);
  assert.equal(bookAhead({ playing: true, huiTurn: true }), false, 'its 「完」, the seal and the new title go first there');
  assert.equal(bookAhead({}), false);
});

test('the box gives the stage away only to what is UP — never to a game or a moment that waits for it (no deadlock)', () => {
  assert.equal(boxGivesWay({}), false, 'a board in main no longer hides the box');
  assert.equal(boxGivesWay({ bout: true }), true, 'a fight in play');
  assert.equal(boxGivesWay({ appearing: true }), true, 'a beast\'s first sight');
  assert.equal(boxGivesWay({ up: true }), true, 'a moment already on the stage');
  assert.equal(boxGivesWay({ huiTurn: true }), true, 'a 回\'s 「完」 and the new title');
});

test('the moments come after the book, one at a time, in their order: set piece, doors, seal, memory, 鼎归', () => {
  assert.deepEqual(MOMENTS, ['piece', 'doors', 'feat', 'memory', 'homing']);
  assert.equal(momentMay('piece', { ahead: true }), false, 'the passage first (漳水立起 after 巫祝投河)');
  assert.equal(momentMay('feat', { up: true }), false, 'never a seal over the doors (突破 over 五门俱开)');
  assert.equal(momentMay('feat', { pending: ['doors', 'feat'] }), false, 'the doors are on their way: they go first');
  assert.equal(momentMay('memory', { pending: ['feat', 'memory'] }), false, 'the seal before her memory');
  assert.equal(momentMay('doors', { pending: ['feat', 'memory', 'doors'] }), true, 'a later moment never holds an earlier one');
  assert.equal(momentMay('homing', {}), true);
});

test('the page asks queue.js: the games are held, every moment waits its turn, a gain waits for a quiet stage', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /cards = afterBook\(cards, boxAhead\(\)\);\s*watchAppear\(cards\);/, 'a beast\'s first sight only for a card that is drawn');
  for (const m of MOMENTS) assert.match(page, new RegExp(`momentTurn\\('${m}'`), `${m} waits its turn`);
  assert.match(page, /async function gainBurst[\s\S]{0,200}boxAhead\(\) \|\| momentUp\(\) \|\| momentPending\.size/, '修为 +n never floats over her memory');
  assert.match(page, /slots\.main\.some\(\(c\) => c\.card === 'closed'\) \? '' : toastsHtml\(\)/, '「完」 stands alone (所得 waits)');
});

test('a board won: its last line is read first, then the scene\'s way on that waited on it is taken; the tray lets it go', async () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /async function onWin\(taskId\) \{\s*await pause\(stillMotion\(\) \? 1200 : WIN_LINE_MS\);/);
  assert.match(page, /const on = winExit\(taskId\);\s*if \(on\) await panelTap\(on\.id/);
  const { trayHtml, WORDS } = await import('../scripts/cards.js');
  const look = { tasks: [{ id: 'deer-wind', title: '射鹿', kind: 'board', status: 'done' }, { id: 'xisui-hold', title: '洗髓', kind: 'board', status: 'offered' }] };
  const tray = trayHtml({ look, words: WORDS.zh, lang: 'zh' });
  assert.doesNotMatch(tray, /射鹿/, 'a finished board leaves the tray');
  assert.match(tray, /洗髓/);
});

test('冰夷\'s trial waits for 站着，不跪: a scene\'s fight with its own words is a choice first, its card after', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const { look } = await import('../scripts/rules.mjs');
  const { cardHtml, WORDS } = await import('../scripts/cards.js');
  const content = loadContent();
  const base = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/ji-altar.json', import.meta.url), 'utf8'));
  const l = look({ ...base, scene: '01-rise', place: content.chapters['01-ji'].scenes['01-rise'].at }, content, { now: new Date('2026-09-29T11:00:00'), quests: [] });
  const tap = l.scene.panel.taps.find(t => t.id === 'stand');
  assert.equal(tap?.duel, 'shuanglong-trial', JSON.stringify(l.scene.panel.taps));
  const card = (called) => cardHtml({ card: 'panel' }, { look: l, words: WORDS.zh, lang: 'zh', called });
  assert.match(card(new Set()), /data-panel-duel="shuanglong-trial"[^>]*>站着，不跪</);
  assert.doesNotMatch(card(new Set(['shuanglong-trial'])), /站着，不跪/, 'chosen: the trial card stands instead');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /c\.card !== 'duel' \|\| !\(look\.scene\?\.panel\?\.taps \?\? \[\]\)\.some\(\(t\) => t\.duel === c\.id\) \|\| called\.has\(c\.id\)/);
});

test('银月\'s card shows what the dawn tells: the girl with one tail, named — and her lines keep the fox where no form is named', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const { beatsOf } = await import('../scripts/rules/tell.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const content = loadContent();
  const raw = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/codex.json', import.meta.url), 'utf8')).entries.yinyue;
  assert.equal(raw.kind, '人物');
  assert.equal(raw.image, 'art/people/yinyue.webp');
  assert.doesNotMatch(raw.lines.zh.join(''), /巴掌大/, 'never the fox of later chapters on her first card');
  assert.match(raw.lines.zh.join(''), /银发[\s\S]*一条银尾/);
  const s = { ...newState(content, 'zh', new Date('2026-09-29T11:00:00')), lang: 'zh' };
  assert.equal(beatsOf(content, s, { of: 'scene', id: '00-yinyue', text: '**银月**：难吃。' })[0].art, 'art/people/yinyue.webp', 'the girl at dawn');
  assert.equal(beatsOf(content, s, { of: 'scene', id: '00-cliff', text: '**银月**：让开。' })[0].art, 'art/people/yinyue-fox.webp', 'the fox elsewhere');
});
