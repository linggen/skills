// 今线 in the game (Hanli, 2026-10-05: 今线进游戏，做成四段可玩的插曲): each 今
// interlude is two or three scenes and a game, played between two 古 films as
// the book reads — 今 · 一 after 古二, 今 · 二 after 古四, 今 · 三 after 古六, 今 · 四
// after 古八 (古七 before the 2026-10-07 split) — spliced in by its own declaration (`before`, content.mjs
// spliceInterludes), never by a 古 scene naming it. A save before the point
// plays it; a save already past it is not pulled back. Its games pay nothing to
// the 古 line. Its passages are the 插曲 files' own text (scene-book-sync.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lint, loadContent } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { look, resolve, story, task, win } from '../scripts/rules.mjs';
import { codexFiles } from '../scripts/content.mjs';
import { bookEntries } from '../scripts/book-order.js';
import { huiEnded } from '../scripts/rules/hui.mjs';
import { throughJin } from './prologue.mjs';


const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ctx = { now: NOW, quests: [] };
const scenes = () => Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes).map(sc => ({ ch, sc })));
const jinScenes = id => scenes().filter(({ sc }) => sc.hui === id);
const save = name => { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8')); return d.state ?? d; };

/* Where each interlude stands: the 古 scene it leads into, and the 古 回 the book reads before and after it. */
const PLACES = { j01: ['00-prologue', '00-gate', 'h02', 'h04'], j04: ['00-waimen', 'wm-mijing', 'h05', 'h07'], j07: ['00-zhuji', '09-snow', 'h08', 'h11'], j09: ['01-ji', '01-arrive', 'h09', 'h10'] };

test('four interludes, each two or three scenes and one game or two, in the book\'s place', () => {
  const book = bookEntries(content.book).filter(h => h.volume).map(h => h.id);
  for (const [id, [chapter, before, prev, next]] of Object.entries(PLACES)) {
    const own = jinScenes(id);
    // 今 · 一 has four since 2026-10-26 (the twelve channels its own scene, j01-loop)
    assert.ok(own.length >= 2 && own.length <= 5, `${id}: ${own.length} scenes`);
    assert.ok(own.every(({ ch }) => ch.id === chapter), `${id} stands in ${chapter}`);
    assert.ok(own.every(({ sc }) => !sc.at), `${id}: on no place of the map`);
    const head = own.find(({ sc }) => sc.before);
    assert.equal(head.sc.before, before, `${id} leads into ${before}`);
    assert.deepEqual([book[book.indexOf(id) - 1], book[book.indexOf(id) + 1]], [prev, next], `the book reads ${id} between ${prev} and ${next}`);
    // Every road into the 古 scene now runs through the interlude.
    const ch = content.chapters[chapter];
    const into = Object.values(ch.scenes).filter(sc => sc.exits.some(e => e.next === head.sc.id));
    assert.ok(into.length || ch.first_scene === head.sc.id, `${id} is reached`);
    for (const sc of into) assert.equal(sc.hui, prev, `${sc.id}, the 回 before ${id}, leads into it`);
    assert.ok(!Object.values(ch.scenes).some(sc => sc.hui !== id && sc.exits.some(e => e.next === before)), `nothing but ${id} leads into ${before} now`);
    const games = own.flatMap(({ sc }) => sc.offers?.tasks ?? []);
    assert.ok(games.length >= 1, `${id} has its game`);
  }
  assert.deepEqual(lint(content), []);
});

test('the 古 scenes never name an interlude: the splice is the interlude\'s own declaration', () => {
  for (const ch of fs.readdirSync(new URL('../worlds/jiuding/chapters/', import.meta.url))) {
    const dir = new URL(`../worlds/jiuding/chapters/${ch}/scenes/`, import.meta.url);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('j'))) {
      const raw = fs.readFileSync(new URL(f, dir), 'utf8');
      assert.ok(!/"next": "j\d\d-/.test(raw), `${ch}/${f} names an interlude`);
    }
  }
});

test('a save walks 古二 → 今 · 一 → 古三: the close of 第二回, the modern stage, the game won, then the gate', () => {
  let s = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'] };
  s = { ...s, tasks: { ...s.tasks, 'notice-shuitong': { status: 'done' }, 'notice-wupo': { status: 'done' } } }; // 水桶落井 played (2026-10-20)
  s = resolve(s, content, ctx, { exit: 'go' }).state;
  assert.equal(s.scene, 'j01-track');
  const l = look(s, content, ctx);
  assert.equal(l.scene.line, 'jin');
  assert.equal(l.scene.scape, 'track');
  assert.ok(l.chapter.title.includes('今 · 一'), l.chapter.title);
  assert.equal(huiEnded(content, s), 'h02');
  assert.ok(l.scene.people.some(p => p.name === '沈芒' && p.art === 'art/people/jin-shenmang.webp'), 'his 人物志 portrait (2026-10-05)');
  // the ball first (投一个给我看看, 砸寨; the 调息 cut 2026-10-20, was 边跑边念): the track's way on waits for it
  assert.equal(resolve(s, content, ctx, { exit: 'on' }).result.refused, 'needs', 'the ball is thrown first');
  // 那一圈 (2026-10-26) the track's first board: the passage up to her line is its rest
  assert.match(content.chapters['00-prologue'].scenes['j01-track'].story_after.zh, /「你投一个给我看看。」$/, 'the passage stops on her line; the throw is told after the game');
  // a save from before the cut, holding 边跑边念 offered here, loads with the ball offered instead
  const old = fitWorld({ ...s, tasks: { ...s.tasks, 'jin-paobu': { status: 'offered' } } }, content);
  assert.equal(old.tasks['jin-paobu'], undefined, 'the old board let go');
  assert.equal(old.tasks['jin-toulan']?.status, 'offered');
  // 那一圈 first, the ball second (2026-10-26); the twelve channels (j01-loop), then 葛奶奶 at the anatomy's door
  for (const id of ['jin-yiquan', 'jin-toulan']) { s = win(s, content, ctx, { id }).state; s = task(s, content, ctx, { action: 'done', id }).state; }
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  assert.equal(s.scene, 'j01-weigh');
  s = win(s, content, ctx, { id: 'jin-biedou' }).state;
  s = task(s, content, ctx, { action: 'done', id: 'jin-biedou' }).state;
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  assert.equal(s.scene, 'j01-loop');
  s = win(s, content, ctx, { id: 'jin-jingluo' }).state;
  s = task(s, content, ctx, { action: 'done', id: 'jin-jingluo' }).state;
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  assert.equal(s.scene, 'j01-anatomy');
  s = win(s, content, ctx, { id: 'jin-chat-ge' }).state;
  s = task(s, content, ctx, { action: 'done', id: 'jin-chat-ge' }).state;
  // 六一七 · 别拍 (今's 聊天, 2026-10-22): the 617 group the night before the retest — the way on waits for it
  assert.equal(resolve(s, content, ctx, { exit: 'on' }).result.refused, 'needs', 'the chat is had first');
  const before = { progress: s.progress, wealth: s.wealth, tier: s.tier, step: s.step };
  s = win(s, content, ctx, { id: 'jin-chat-617' }).state;
  const done = task(s, content, ctx, { action: 'done', id: 'jin-chat-617' });
  assert.equal(done.result.ok, true);
  s = done.state;
  assert.deepEqual({ progress: s.progress, wealth: s.wealth, tier: s.tier, step: s.step }, before, 'the 今 lifts nothing of the 古');
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  assert.equal(s.scene, 'j01-retest');
  // 先吐 is told by the way on now (the 调息 sweep): nothing to play at the retest
  assert.equal(content.chapters['00-prologue'].scenes['j01-retest'].exits.find((e) => e.id === 'finish').needs, undefined);
  s = resolve(s, content, ctx, { exit: 'finish' }).state;
  assert.equal(s.scene, '00-gate');
  const g = look(s, content, ctx);
  assert.equal(g.scene.line, undefined, 'back on the 古 stage');
  assert.equal(g.chapter.close.title, '今 · 一 · 完');
  assert.equal(g.chapter.close.juan, undefined);
});

test('old saves: before the point they meet the interlude; past it they go on as they were', () => {
  // A save made before the interludes, on 古二's last scene: its next step is 今 · 一.
  const n = save('jin-notice');
  assert.equal(n.scene, '00-notice');
  // 00-notice's 水桶落井 (2026-10-20) waits first; played, the next step is 今 · 一
  const nw = { ...n, tasks: { ...n.tasks, 'notice-shuitong': { status: 'done' }, 'notice-wupo': { status: 'done' } } };
  assert.equal(resolve(nw, content, ctx, { exit: 'go' }).state.scene, 'j01-track');
  // 外门 from its first scene: 今 · 二 waits after 古四.
  const w = save('waimen');
  assert.equal(look(w, content, ctx).scene.id, 'wm-ahe');
  // At the cliff (古八 since the 2026-10-07 split): the throw lands on 今 · 四 before 古九 — the interlude is made up as he walks on.
  const z = save('zhuji-cliff');
  assert.equal(look(z, content, ctx).scene.id, '09-cliff');
  // Already in 古九: nothing pulls him back; Look and the 回 are as they were.
  const j = save('ji-altar');
  const l = look(j, content, ctx);
  assert.equal(l.scene.id, '01-altar');
  assert.equal(l.chapter.hui, 'h10');
  assert.equal(l.chapter.fresh, undefined);
  // Standing on the 古 scene an interlude leads into: it plays on, no interlude owed.
  const gate = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-gate', place: 'shanmen', done_scenes: ['00-notice'] };
  assert.equal(look(gate, content, ctx).scene.id, '00-gate');
});

test('今 · 三 opens 筑基\'s chapter (古七, the old 古九) without spending its intro; 今 · 四 never closes the 卷', () => {
  let s = fitWorld({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: 'j07-ankle', place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['wm-heluo'] }, content); // its boards offered as it loads (今三's, 2026-10-26)
  assert.equal(look(s, content, ctx).chapter.fresh, undefined, 'the snow\'s intro waits for the snow');
  const wealth = s.wealth;
  s = throughJin(s, content, NOW);
  assert.equal(s.scene, '09-snow');
  // 不跨线: past 入门 a 今 board (the dark's chat) pays no 灵石 — found live 10-22 (灵石 +5 on 今三)
  assert.equal(s.wealth, wealth, 'the 今 pays nothing, past 入门 too');
  assert.equal(s.tasks['jin-chat-dark']?.status, 'done');
  const snow = look(s, content, ctx);
  assert.equal(snow.chapter.fresh, true, 'and comes up there');
  assert.equal(snow.chapter.hui, 'h11', '古七 — its first half since the 2026-10-07 split');
  // fitWorld: as a save loads — j09-noise's 聊天 (2026-10-22) offered where it stands
  let t = fitWorld({ ...newState(content, 'zh', NOW), chapter: '01-ji', scene: 'j09-noise', place: 'houshan', ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: ['09-cliff'] }, content);
  t = throughJin(t, content, NOW);
  assert.equal(t.scene, '01-arrive');
  const arrive = look(t, content, ctx).chapter;
  assert.equal(arrive.close.title, '今 · 四 · 完');
  assert.equal(arrive.close.juan, undefined, '卷一 ends on 古九, not here');
});

test('an interlude the book holds back (`draft`) is not played', async () => {
  const { loadChapters, playedChapters } = await import('../scripts/content.mjs');
  const book = JSON.parse(JSON.stringify(content.book));
  book.volumes[0].hui.find(h => h.id === 'j04').draft = true;
  const chs = playedChapters(loadChapters(new URL('../worlds/jiuding/chapters', import.meta.url).pathname), book);
  const ch = chs['00-waimen'];
  assert.ok(!Object.values(ch.scenes).some(sc => sc.hui === 'j04'), 'its scenes are not played');
  assert.equal(ch.scenes['wm-baoming'].exits.find(e => e.id === 'enter').next, 'wm-mijing', '古四 runs straight into 古五'); // 第一路's way on split 2026-10-26: its last scene is wm-baoming
  assert.equal(chs['00-prologue'].scenes['00-notice'].exits[0].next, 'j01-track', 'the others still are');
});

/* ── the games: each completable, each failure the book's, never stuck ── */

// 今线's boards (the 调息 sweep, Hanli 10-22: 「你说的1-6 都是好主意, 按你说的改一遍. 关键是能留住玩家」): a chat in each
// interlude (games/jinchat.js); 最后一罚 the one 气走经脉 left, the climax played (Hanli 10-22: 「改成玩」); 今二's free throws
// a 砸寨 throw. 先吐, 黑地十一步 and 罚球 are cut (their ways on tell them); 晨脉 was cut 10-19.
test('every 今线 board is a chat, 最后一罚 or 白线上: its task pays nothing, and its scene waits on it; the cut ones are offered nowhere', () => {
  // 10-22 (Hanli: 「改成玩」): 最后一罚 back as 今四's board, 今二's free throws a 砸寨 throw (白线上)
  const games = { 'jin-chat-617': 'jinchat', 'jin-chat-ma': 'jinchat', 'jin-chat-dark': 'jinchat', 'jin-chat-ahe': 'jinchat', 'jin-lastshot': 'dash', 'jin-whiteline': 'zhazhai',
    // 今二's four (全文后的小游戏 2026-10-26)
    'jin-wotui': 'dash', 'jin-qiu': 'rain', 'jin-xisi': 'dash', // 调息 → 几何冲刺 10-27 (「调息的不太好玩…」); 嘀声 cut 10-27
    // 今三's five (全文后的小游戏 第二批 2026-10-26)
    'jin-zhizhen': 'rain', 'jin-danjiao': 'dash', 'jin-quxian': 'jinchat', 'jin-chenmai': 'rain' };
  for (const [id, game] of Object.entries(games)) {
    const t = content.tasks.tasks.find(x => x.id === id);
    assert.equal(t.game, game, id);
    assert.equal(t.grant.progress ?? 0, 0);
    assert.equal(t.grant.wealth ?? 0, 0);
    const at = scenes().find(({ sc }) => sc.offers?.tasks?.includes(id));
    assert.ok(at && /^j\d\d$/.test(at.sc.hui), `${id} is an interlude's`);
    // its scene waits on it: the way on needs it, or a board shown after it (j04-gym's 视频 then 卧推, j04-line's 捡球 then 投篮)
    const order = (at.sc.show ?? []).filter((c) => c.card === 'board').map((c) => c.id);
    assert.ok(at.sc.exits.some(e => e.needs?.task && order.indexOf(e.needs.task) >= order.indexOf(id) && e.refuse?.zh && e.refuse?.en), id);
  }
  for (const id of ['jin-qianmi', 'jin-dark', 'jin-faqiu']) {
    assert.ok(content.tasks.tasks.find(x => x.id === id)?.cut, `${id} cut`);
    assert.ok(!scenes().some(({ sc }) => sc.offers?.tasks?.includes(id) || sc.exits.some((e) => e.needs?.task === id)), `${id}: offered nowhere`);
  }
  assert.ok(!scenes().some(({ sc }) => sc.offers?.tasks?.includes('jin-pulse')), '晨脉: cut, offered nowhere');
});

test('晨脉 (jin-pulse) was cut 2026-10-19; the way on tells the 六十九 — after j07-chenmai\'s own count (打地鼠 `chenmai`, 2026-10-26); an old save holding the cut board lets it go', () => {
  const sc = scenes().find(({ sc }) => sc.id === 'j07-chenmai').sc;
  assert.deepEqual(sc.show, [{ card: 'board', id: 'jin-chenmai' }]);
  const out = sc.exits.find(e => e.id === 'out');
  assert.equal(out.needs.task, 'jin-chenmai');
  assert.match(out.story.zh, /六十九[\s\S]*「出关了。」/);
  assert.equal(content.tasks.tasks.find(t => t.id === 'jin-pulse').cut, '2026-10-19');
  const s = { ...newState(content, 'zh', new Date('2026-10-19T10:00:00')), chapter: '00-zhuji', scene: 'j07-chenmai', tasks: { 'jin-pulse': { status: 'offered' }, 'jin-chenmai': { status: 'done' } } };
  const fit = fitWorld(s, content);
  assert.equal(fit.tasks['jin-pulse'], undefined, 'let go on load');
  const on = resolve(fit, content, { now: new Date('2026-10-19T10:00:00'), quests: [] }, { exit: 'out' });
  assert.ok(on.result.ok, JSON.stringify(on.result).slice(0, 200));
  assert.equal(on.state.scene, '09-snow');
});

test("今线's people: a card in the book at their first appearance (今 · 一), never brought on or met in play (Hanli 2026-10-05: 「放到原著书里」)", async () => {
  const { codexOf } = await import('../scripts/codex.js');
  const { renderMarkdown } = await import('../scripts/read-md.js');
  const codex = codexOf(codexFiles(content), { lang: 'zh' });
  const jin = content.people.people.filter(p => p.line === 'jin').map(p => p.id);
  assert.equal(jin.length, 10); // 妈 · 爸 since 2026-10-27 (「今1 没有人物志图片呢」)
  for (const id of jin) assert.ok(codex.get(id)?.book_only && codex.get(id).first?.book === 'j01' && codex.get(id).image, id);
  const md = fs.readFileSync(new URL('../story/jiuding-lu/今线/插曲01.md', import.meta.url), 'utf8');
  const html = renderMarkdown(md, { codex, chapter: 'j01', lang: 'zh' });
  for (const id of jin) assert.equal((html.match(new RegExp(`class="codexcard first" data-codex="${id}"`, 'g')) ?? []).length, 1, `${id}: one card in 今 · 一`);
  let s = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'] };
  s = { ...s, tasks: { ...s.tasks, 'notice-shuitong': { status: 'done' }, 'notice-wupo': { status: 'done' } } }; // 水桶落井 played (2026-10-20)
  s = resolve(s, content, ctx, { exit: 'go' }).state;
  const met = story(s, content, { now: NOW, quests: [] }).result.codex ?? [];
  for (const id of jin) assert.ok(!met.includes(id), `${id} never met in play`);
});
