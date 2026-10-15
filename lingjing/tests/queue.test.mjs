// The stage's one-at-a-time rule (scripts/queue.js, 2026-10-01): the passage
// that leads into a board, a fight, a set piece or a seal finishes in the box
// first, then that thing opens; the page's moments come one at a time, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterBook, bookAhead, boxGivesWay, huiLineOf, MOMENTS, momentMay, onStage, STANDS, trayWaits, TURN_KEEPS } from '../scripts/queue.js';
import { CARD_KINDS } from '../scripts/stage.mjs';
import { sceneUnder } from '../scripts/dialogue.js';

const cards = [{ card: 'meet', id: 'yinyue' }, { card: 'panel' }, { card: 'people' }, { card: 'board', id: 'deer-wind' }, { card: 'duel', id: 'longzhi' }, { card: 'tale' }, { card: 'lundao' }, { card: 'offer' }];

test('the games wait for the book: while a passage is ahead, no board, duel, 传闻 or 论道 stands; after it, all of them', () => {
  assert.deepEqual(afterBook(cards, true).map(c => c.card), ['panel', 'people']);
  assert.deepEqual(afterBook(cards, false), cards);
  for (const k of ['board', 'duel', 'tale', 'lundao', 'meet', 'breakthrough', 'born', 'value']) assert.ok(!STANDS.has(k), k);
});

// Live 2026-10-14: 可接的差事 stood behind 秦雁's large 亮相 card while the box told on. One thing on the
// stage, and nothing stands while the story is told: every card waits for the book but the few that STAND.
test('nothing stands while the story is told: only the header, the page\'s moments, the 「完」, a fight or 闭关 up — an errand waits too', () => {
  const waits = ['offer', 'handed', 'quest', 'road', 'building', 'empty', 'hexagram', 'codex', 'creature', 'item', 'map', 'traits', 'gate', 'tribulation', 'treasure'];
  for (const k of waits) assert.deepEqual(afterBook([{ card: k }], true), [], `${k} waits for the book`);
  for (const k of waits) assert.deepEqual(afterBook([{ card: k }], false), [{ card: k }], `${k} after it`);
  // the class, not a list of exceptions: of every kind the stage draws, only these stand
  const kinds = Object.keys(CARD_KINDS);
  const standing = kinds.filter(k => afterBook([{ card: k }], true).length);
  assert.deepEqual(standing.sort(), [...STANDS].filter(k => kinds.includes(k)).sort());
  assert.deepEqual([...STANDS].sort(), ['closed', 'doors', 'fight', 'goal', 'homing', 'memory', 'panel', 'people', 'seclude', 'seclusion', 'unfold']);
  // a 回's turn keeps the same, less the scene card (it waits behind the 「完」)
  assert.deepEqual([...TURN_KEEPS].sort(), [...STANDS].filter(k => k !== 'panel').sort());
});

// Hanli, 2026-10-14 (at 三试: the box's 「继续」 under the 降妖 card's 出手): the early rule is gone —
// no game stands over the passage, a fight no more than a board.
test('no game stands over the passage: a fight, a 传闻, a 论道 wait for the book like a board', () => {
  assert.deepEqual(afterBook(cards, true).map(c => c.card), ['panel', 'people']);
  assert.equal(afterBook.length, 2, 'no `early` switch left');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /gamesEarly|sceneUnder\(/, 'the page lets nothing through early');
  // a scene's fight waits for the box to be put away, unless its words were chosen in the box — which puts it away
  assert.match(page, /if \(storyAhead\(\)\) cards = cards\.filter\(\(c\) => \(c\.card !== 'board' \|\| c\.id === view\.opened\?\.id\) && !\(c\.card === 'duel' && sceneGame\(look, c\) && !called\.has\(c\.id\)\)\);/);
  assert.match(page, /function callDuel\(id\) \{[\s\S]{0,300}if \(playing\(r\) && atLast\(r, lang\(\)\)\) setReading\(advance\(r, lang\(\)\), \{ called \}\);/);
  const items = [{ of: 'scene', id: 's1', beats: { zh: [{ text: '题。', cap: true }, { text: '一。' }] } }];
  assert.equal(sceneUnder({ scene: 's1', items, i: 0, j: 1, closed: false }, 's1'), true, 'the reading still knows where it is; the stage no longer asks');
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

test('the moments come after the book, one at a time, in their order: set piece, doors, seal, memory, 鼎归, the map unfolding', () => {
  assert.deepEqual(MOMENTS, ['piece', 'doors', 'feat', 'memory', 'homing', 'unfold']);
  assert.equal(momentMay('piece', { ahead: true }), false, 'the passage first (漳水立起 after 巫祝投河)');
  assert.equal(momentMay('feat', { up: true }), false, 'never a seal over the doors (突破 over 五门俱开)');
  assert.equal(momentMay('feat', { pending: ['doors', 'feat'] }), false, 'the doors are on their way: they go first');
  assert.equal(momentMay('memory', { pending: ['feat', 'memory'] }), false, 'the seal before her memory');
  assert.equal(momentMay('doors', { pending: ['feat', 'memory', 'doors'] }), true, 'a later moment never holds an earlier one');
  assert.equal(momentMay('homing', {}), true);
  assert.equal(momentMay('unfold', { pending: ['homing', 'unfold'] }), false, 'a 鼎 home first, then a new map');
});

test('the page asks queue.js: the games are held, every moment waits its turn, a gain waits for a quiet stage', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /cards = afterBook\(cards, cardsAhead\(\)\);\s*watchAppear\(cards\);/, 'a beast\'s first sight only for a card that is drawn');
  for (const m of MOMENTS) assert.match(page, new RegExp(`momentTurn\\('${m}'`), `${m} waits its turn`);
  assert.match(page, /playing: playing\(r\) && r\.items\[r\.i\]\?\.of !== 'scene'/, 'a set piece plays after its choice\'s passage, before the next scene\'s (01-deep: the seal, then 01-cauldron)');
  assert.match(page, /async function gainBurst[\s\S]{0,200}boxAhead\(\) \|\| momentUp\(\) \|\| momentPending\.size/, '修为 +n never floats over her memory');
  assert.match(page, /slots\.main\.some\(\(c\) => c\.card === 'closed'\) \? '' : toastsHtml\(\)/, '「完」 stands alone (所得 waits)');
});

test('a board won: its last line is read first, then the scene\'s way on that waited on it is taken; the tray lets it go', async () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /async function onWin\(taskId\) \{[\s\S]{0,300}await pause\(stillMotion\(\) \? 1200 : WIN_LINE_MS\);/);
  // The grade is read off the won board before that pause: the board is not dealt again under it.
  assert.match(page, /const won = boards\.get\(taskId\), grade = won\?\.state\?\.grade \?\? null;\s*if \(won\) won\.winning = true;/);
  assert.match(page, /&& !old\.winning &&/);
  assert.match(page, /const on = winExit\(taskId, grade\);[\s\S]{0,300}if \(on && !look\?\.tell_owed\) await panelTap\(on\.id/);
  // The grade goes with the win, and one way on is taken for him only when it is the only one (算账's two are his).
  assert.match(page, /write\('win', \{ id: taskId, \.\.\.\(grade \? \{ grade \} : \{\}\) \}\)/);
  assert.match(page, /return ways\.length === 1 \? ways\[0\] : null;/);
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
  assert.match(card(new Set()), /data-panel-duel="shuanglong-trial"[^>]*>站着，不跪( ›)?</);
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

// Live 卷一 play-through (2026-10-01): 开局 in the tray opened a board over a
// passage still playing — the tray's board waits, book first, like the rest.
test('a board opened from the tray\'s 开局 waits for the whole passage, and for a 回\'s turn', () => {
  assert.equal(trayWaits({ playing: true }), true, 'the box still telling, even on its last beat');
  assert.equal(trayWaits({ owed: true }), true, 'a passage owed');
  assert.equal(trayWaits({ drawing: true }), true);
  assert.equal(trayWaits({ huiTurn: true }), true, 'a 回\'s 「完」 or the new title first');
  assert.equal(trayWaits({}), false, 'the book told: the board opens');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /if \(view\.opened && trayAhead\(\)\) cards = cards\.filter\(\(c\) => !\(c\.card === 'board' && c\.id === view\.opened\.id\)\);[\s\S]{0,900}cards = afterBook\(cards, cardsAhead\(\)\);/, 'the page holds the opened board back');
  assert.match(page, /const trayAhead = \(\) => trayWaits\(\{ owed: [^}]*playing: playing\(readingHere\(\)\), huiTurn: atHuiTurn\(\) \}\);/, 'the box playing, not its choices up');
});

// Live (2026-10-01): the 回 line turned to the next 回 while the old 回's last passage still played.
test('the 回 line keeps the old 回 while its last passage is told, and turns once it is', () => {
  const titles = { h09: '卷一 · 第九回　筑基', h10: '卷一 · 第十回　冀州' };
  const now = { hui: 'h10', title: titles.h10, titles };
  assert.equal(huiLineOf({ ...now, telling: 'h09' }), titles.h09, 'the old 回\'s passage under its own line');
  assert.equal(huiLineOf({ ...now, telling: 'h10' }), titles.h10, 'the new 回\'s passage');
  assert.equal(huiLineOf({ ...now, telling: null }), titles.h10, 'told: the line turns');
  assert.equal(huiLineOf({ ...now, telling: 'h08' }), titles.h10, 'a 回 the page never showed: the save\'s line');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  // The 回 the reading tells — or, under the old 回's 「完」 at its turn, that 回 (2026-10-14, proto f).
  assert.match(page, /const closing = closeUp\(\) \? ended\?\.id \?\? null : null;\n {2}\$\('huiLine'\)\.textContent = look\.chapter\?\.hui \? huiLineOf\(\{ hui: look\.chapter\.hui, title: look\.chapter\.title, telling: closing \?\? huiAt\(told\), titles \}\) : '';/);
  assert.match(page, /if \(ended\?\.id && ended\.line\) titles\[ended\.id\] = ended\.line;/, 'the ended 回\'s line from its close (a fresh tab has no memory of it)');
});

test('a game and the box are never on the stage together (Hanli, 2026-10-14: 「小游戏，和剧情不要同时显示」)', () => {
  for (const g of [{ card: 'board', id: 'feather-breath' }, { card: 'duel', id: 'gate-longzhi' }]) {
  const cards = [{ card: 'panel' }, g];
  // every state of the book: the passage owed, mid-passage (past its caption or not), at its last beat, put away
  const states = [];
  for (const ahead of [true, false]) for (const early of [true, false]) for (const playing of [true, false]) for (const huiTurn of [true, false]) states.push({ ahead, early, playing, huiTurn });
  for (const st of states) {
    const { cards: shown, box } = onStage({ cards, ...st, game: (c) => c.card === g.card });
    const game = shown.some((c) => c.card === g.card);
    assert.ok(!(game && box), `both up: ${JSON.stringify(st)}`);
    if (st.ahead) assert.ok(!game, `the game waits for its passage: ${JSON.stringify(st)}`);
  }
  }
  // the passage told to its last beat: the game takes the stage alone, the box hidden
  const at = onStage({ cards, ahead: false, playing: true });
  assert.deepEqual([at.cards.some((c) => c.card === 'board'), at.box], [true, false]);
  // the game played and closed: the box comes back with the rest, or the choices
  assert.deepEqual(onStage({ cards: [{ card: 'panel' }], ahead: false, playing: true }).box, true);
  // the page asks the same: the box yields to an open board in main, and a played scene board closes
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /const boxYields = \(slots\) => boxGivesWay\(\{[^}]*game: gameUp\(slots\) \}\);/);
  // and a scene's game waits for the box to be put away, its last beat read
  assert.match(page, /if \(storyAhead\(\)\) cards = cards\.filter\(\(c\) => \(c\.card !== 'board' \|\| c\.id === view\.opened\?\.id\) && /);
  assert.match(page, /const storyAhead = \(\) => Boolean\(look\?\.tell_owed \|\| drawingTold \|\| playing\(readingHere\(\)\)\);/);
  assert.match(page, /cards = cards\.filter\(\(c\) => !\(c\.card === 'board' && played\(c\.id\) && !boards\.get\(c\.id\)\?\.winning\)\);/);
});

test('the 回\'s 「完」 is never held off by what waits behind the new 回\'s seal — 外门 after 回去歇下 stood blank (the crawler, 2026-10-15)', async () => {
  const { momentsHold } = await import('../scripts/queue.js');
  // The live deadlock: the map's unfolding queued behind the seal, the seal waiting on the 「完」.
  assert.equal(momentsHold({ pending: ['unfold', 'feat'] }), false, 'the 「完」 stands; then the seal; then the map');
  assert.equal(momentsHold({ pending: ['feat'], waits: true }), false, 'a memory or 鼎归 not yet queued waits behind the seal too');
  // What still holds it: a moment up, one before the seal (a set piece, 息壤's doors), or anything with no seal pending.
  assert.equal(momentsHold({ up: true, pending: ['feat'] }), true);
  assert.equal(momentsHold({ pending: ['piece', 'feat'] }), true);
  assert.equal(momentsHold({ pending: ['doors', 'feat'] }), true);
  // The map's unfolding queued never holds the 「完」: it waits for the 「完」 itself (古九, 2026-10-15: map, then 完).
  assert.equal(momentsHold({ pending: ['unfold'] }), false);
  assert.equal(momentsHold({ up: true, pending: ['unfold'] }), true, 'up, it holds');
  assert.equal(momentsHold({ waits: true }), true);
  assert.equal(momentsHold({ pending: ['feat'] }), false, 'a seal alone waits on the 「完」 itself');
});

// Live 2026-10-15: the 事 chip read 「还有：next ›」 — the 下一步 card had no queue word and the raw kind showed.
test('every card kind the stage can queue has a queue word in both languages, 下一步 among them', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  for (const lang of ['zh', 'en']) {
    assert.ok(WORDS[lang].queueKinds.next, `${lang} next`);
    for (const k of ['handed', 'quest', 'road', 'offer', 'duel', 'tale', 'lundao', 'board', 'replay']) assert.ok(WORDS[lang].queueKinds[k], `${lang} ${k}`);
  }
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function queueLabel'), src.indexOf('function putOff'));
  assert.ok(!/name:\s*kind \? '' : c\.card/.test(body), 'a kind with no word never shows raw');
});

// Live 2026-10-15: 开局 in the tray, tapped while the scene's choices stood in the box, did nothing — and the
// board (炼丹) came up later out of nowhere, after a tame.
test('开局 from the tray is never dropped: in the box\'s choices the box goes and the board stands; mid-passage its button says it waits; a scene moved on forgets it', async () => {
  const { WORDS, trayHtml } = await import('../scripts/cards.js');
  const look = { tasks: [{ id: 'liandan', kind: 'board', title: '炼丹', status: 'offered', game: 'abacus' }] };
  const tray = (q) => trayHtml({ look, words: WORDS.zh, lang: 'zh', trayQueued: q });
  assert.match(tray(null), /data-play="liandan"/);
  assert.match(tray('liandan'), /读完这段就开/);
  assert.ok(!/data-play="liandan"/.test(tray('liandan')), 'no second tap to drop');
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function openFromTray('), src.indexOf('\n}\n', src.indexOf('function openFromTray(')));
  assert.match(body, /const inBox = choicesInBox\(\);[\s\S]*if \(inBox\) nextBeat\(\);/);
  assert.match(src, /\['\[data-play\]', \(el\) => !el\.matches\(':disabled'\) && openFromTray\(el\.dataset\.play\)\]/);
  assert.match(src, /view\.opened\.scene \?\? null\) !== \(look\.scene\?\.id \?\? null\)/);
  assert.match(src, /trayQueued: view\.opened && trayAhead\(\) \? view\.opened\.id : null/);
});

// 古九's tester (2026-10-15): at a 回's turn the new chapter's map unfolded before the old 回's 「完」 — at the turn
// the box is paused (bookAhead false), so the unfolding went first and then held the 「完」 off while it played.
test('a 回\'s turn: the 「完」 first, then the map unfolds — watchUnfold waits for the 「完」 to be put away', async () => {
  const fs = await import('node:fs');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = page.slice(page.indexOf('async function watchUnfold('), page.indexOf('\n}\n', page.indexOf('async function watchUnfold(')));
  assert.match(body, /momentTurn\('unfold', \(\) => closeUp\(\)/);
  const { AFTER_CLOSE, momentsHold } = await import('../scripts/queue.js');
  assert.ok(AFTER_CLOSE.has('unfold'));
  assert.equal(momentsHold({ pending: ['unfold'] }), false, 'so its waiting never holds the 「完」 off (no deadlock)');
});
