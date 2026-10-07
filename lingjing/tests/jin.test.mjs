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
import { newState } from '../scripts/state.mjs';
import { look, resolve, story, task, win } from '../scripts/rules.mjs';
import { codexFiles } from '../scripts/content.mjs';
import { bookEntries } from '../scripts/book-order.js';
import { huiEnded } from '../scripts/rules/hui.mjs';
import { throughJin } from './prologue.mjs';
import * as qianmi from '../scripts/games/qianmi.js';
import * as faqiu from '../scripts/games/faqiu.js';
import * as dark from '../scripts/games/dark.js';
import * as pulse from '../scripts/games/pulse.js';
import * as lastshot from '../scripts/games/lastshot.js';

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
    assert.ok(own.length >= 2 && own.length <= 3, `${id}: ${own.length} scenes`);
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
  s = resolve(s, content, ctx, { exit: 'go' }).state;
  assert.equal(s.scene, 'j01-track');
  const l = look(s, content, ctx);
  assert.equal(l.scene.line, 'jin');
  assert.equal(l.scene.scape, 'track');
  assert.ok(l.chapter.title.includes('今 · 一'), l.chapter.title);
  assert.equal(huiEnded(content, s), 'h02');
  assert.ok(l.scene.people.some(p => p.name === '沈芒' && p.art === 'art/people/jin-shenmang.webp'), 'his 人物志 portrait (2026-10-05)');
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  assert.equal(s.scene, 'j01-retest');
  assert.equal(resolve(s, content, ctx, { exit: 'finish' }).result.refused, 'needs', 'the retest is run first');
  const before = { progress: s.progress, wealth: s.wealth, tier: s.tier, step: s.step };
  s = win(s, content, ctx, { id: 'jin-qianmi' }).state;
  const done = task(s, content, ctx, { action: 'done', id: 'jin-qianmi' });
  assert.equal(done.result.ok, true);
  s = done.state;
  assert.deepEqual({ progress: s.progress, wealth: s.wealth, tier: s.tier, step: s.step }, before, 'the 今 lifts nothing of the 古');
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
  assert.equal(resolve(n, content, ctx, { exit: 'go' }).state.scene, 'j01-track');
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
  let s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: 'j07-ankle', place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['wm-heluo'] };
  assert.equal(look(s, content, ctx).chapter.fresh, undefined, 'the snow\'s intro waits for the snow');
  s = throughJin(s, content, NOW);
  assert.equal(s.scene, '09-snow');
  const snow = look(s, content, ctx);
  assert.equal(snow.chapter.fresh, true, 'and comes up there');
  assert.equal(snow.chapter.hui, 'h11', '古七 — its first half since the 2026-10-07 split');
  let t = { ...newState(content, 'zh', NOW), chapter: '01-ji', scene: 'j09-noise', place: 'houshan', ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: ['09-cliff'] };
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
  assert.equal(ch.scenes['wm-diyilu'].exits.find(e => e.id === 'save').next, 'wm-mijing', '古四 runs straight into 古五');
  assert.equal(chs['00-prologue'].scenes['00-notice'].exits[0].next, 'j01-track', 'the others still are');
});

/* ── the games: each completable, each failure the book's, never stuck ── */

const run = (mod, s, ms, step = 50) => { for (let t = 0; t < ms && !s.won && !s.failed; t += step) s = mod.tick(s, step); return s; };
const hold = (mod, s, gHold, ms) => run(mod, mod.act(s, { g: 'hold', gHold }).state, ms);
const release = (mod, s) => mod.act(s, { g: 'release' }).state;

test('一千米: out first, then in — the thousand run; panting throws up, and he runs again', () => {
  let s = qianmi.act(qianmi.newGame('t'), { g: 'start' }).state;
  for (let i = 0; i < 40 && !s.won; i++) {
    s = release(qianmi, hold(qianmi, s, 'out', 1800));
    s = release(qianmi, hold(qianmi, s, 'in', 1600));
  }
  assert.ok(s.won, `ran ${s.d}m with ${s.air} air`);
  assert.match(qianmi.html(s, 'zh'), /四分二十九/);
  let p = qianmi.act(qianmi.newGame('p'), { g: 'start' }).state;
  for (let i = 0; i < 200 && !p.failed; i++) p = release(qianmi, hold(qianmi, release(qianmi, hold(qianmi, p, 'out', 200)), 'in', 200));
  assert.ok(p.failed, 'quick shallow panting runs out of air');
  assert.equal(p.note, 'vomit');
  assert.match(qianmi.html(p, 'en'), /data-g="again"/);
  const again = qianmi.act(p, { g: 'again' }).state;
  assert.equal(again.live, true);
  assert.equal(again.tries, 1);
});

test('罚球: in four, out six brings the heart down and three go in; holding the breath shakes it off the rim', () => {
  let s = faqiu.newGame('t');
  assert.equal(faqiu.act(s, { g: 'bieshot' }).state.note, 'shake');
  for (let i = 0; i < 12 && s.hr > faqiu.STEADY; i++) s = run(faqiu, release(faqiu, hold(faqiu, s, 'in', 4000)), 6000);
  s = faqiu.act(s, { g: 'hold' }).state; // the last breath counted
  s = run(faqiu, release(faqiu, run(faqiu, s, 4000)), 6000);
  assert.ok(s.hr <= faqiu.STEADY, `heart ${s.hr}`);
  for (let i = 0; i < 6 && !s.won; i++) {
    s = faqiu.act(s, { g: 'shoot' }).state;
    if (!s.won) s = run(faqiu, release(faqiu, hold(faqiu, s, 'in', 4000)), 6000);
  }
  assert.ok(s.won);
  let h = run(faqiu, faqiu.act(faqiu.newGame('h'), { g: 'hold' }).state, 7000);
  assert.equal(h.note, 'held');
});

test('黑地: eleven steps landed in the middle of the sway, three wobbles and he starts again; then lead him out of the numbness', () => {
  let s = dark.act(dark.newGame('t'), { g: 'start' }).state;
  // A wobble: put down at the swing's far end.
  const far = (st) => { let x = st; for (let i = 0; i < 60 && Math.abs(dark.swayOf(x)) < 0.9; i++) x = dark.tick(x, 25); return x; };
  for (let i = 0; i < dark.FALLS; i++) s = dark.act(far(s), { g: 'step' }).state;
  assert.equal(s.note, 'fall');
  assert.equal(s.step, 0);
  for (let i = 0; i < 40 && s.phase === 'walk'; i++) {
    let x = s;
    for (let k = 0; k < 200 && Math.abs(dark.swayOf(x)) >= dark.STEADY * 0.8; k++) x = dark.tick(x, 10);
    s = dark.act(x, { g: 'step' }).state;
  }
  assert.equal(s.phase, 'lead');
  assert.equal(s.note, 'door');
  for (let i = 0; i < 10 && !s.won; i++) s = run(dark, release(dark, hold(dark, s, 'in', 3000)), 5000);
  s = dark.act(s, { g: 'hold' }).state;
  assert.ok(s.won);
  assert.match(dark.html(s, 'zh'), /二氧化碳/);
});

test('晨脉: rest till it is under seventy, then the ball; touching it early digs the pit again, three times and back to the ward', () => {
  let s = pulse.newGame('t');
  s = pulse.act(s, { g: 'train' }).state;
  assert.equal(s.note, 'dug');
  s = pulse.act(s, { g: 'train' }).state;
  s = pulse.act(s, { g: 'train' }).state;
  assert.equal(s.note, 'ward');
  assert.equal(s.pulse, pulse.START);
  const days = [s.pulse];
  while (s.pulse >= pulse.LIMIT) { s = pulse.act(s, { g: 'rest' }).state; days.push(s.pulse); }
  assert.deepEqual(days, [76, 72, 69], 'as the book counts it');
  assert.ok(pulse.act(s, { g: 'train' }).won);
});

test('最后一罚: chants push the heart up, the long breath brakes it but never stills the hands; two breaths and shoot late in the out-breath', () => {
  let s = lastshot.newGame('t');
  s = lastshot.act(s, { g: 'shoot' }).state;
  assert.equal(s.note, 'miss', 'before the breaths, the front of the rim');
  for (let i = 0; i < 3; i++) s = run(lastshot, release(lastshot, hold(lastshot, s, 'in', 4000)), 6000);
  assert.ok(s.hr >= lastshot.FLOOR);
  assert.ok(lastshot.shakeOf(s.hr) > 0, 'the hands still shake');
  // The third hold closes the second breath; then shoot four beats into the out-breath.
  s = run(lastshot, release(lastshot, run(lastshot, lastshot.act(s, { g: 'hold' }).state, 4000)), 4000);
  const r = lastshot.act(s, { g: 'shoot' });
  assert.ok(r.won);
  assert.match(lastshot.html(r.state, 'zh'), /掉了进去/);
});

test('every game is in both languages, its task pays nothing, and its scene waits on it', () => {
  for (const mod of [qianmi, faqiu, dark, pulse, lastshot]) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const g = mod.newGame('x');
    assert.ok(mod.html(g, 'zh').includes('g-jin') && mod.html(g, 'en').includes('g-jin'));
    const t = content.tasks.tasks.find(x => x.game === mod.meta.id);
    assert.ok(t && /^jin-/.test(t.id), mod.meta.id);
    assert.equal(t.grant.progress ?? 0, 0);
    assert.equal(t.grant.wealth ?? 0, 0);
    const at = scenes().find(({ sc }) => sc.offers?.tasks?.includes(t.id));
    assert.ok(at && /^j\d\d$/.test(at.sc.hui), `${t.id} is an interlude's`);
    assert.ok(at.sc.exits.some(e => e.needs?.task === t.id && e.refuse?.zh && e.refuse?.en));
  }
});

test("今线's people: a card in the book at their first appearance (今 · 一), never brought on or met in play (Hanli 2026-10-05: 「放到原著书里」)", async () => {
  const { codexOf } = await import('../scripts/codex.js');
  const { renderMarkdown } = await import('../scripts/read-md.js');
  const codex = codexOf(codexFiles(content), { lang: 'zh' });
  const jin = content.people.people.filter(p => p.line === 'jin').map(p => p.id);
  assert.equal(jin.length, 8);
  for (const id of jin) assert.ok(codex.get(id)?.book_only && codex.get(id).first?.book === 'j01' && codex.get(id).image, id);
  const md = fs.readFileSync(new URL('../story/jiuding-lu/今线/插曲01.md', import.meta.url), 'utf8');
  const html = renderMarkdown(md, { codex, chapter: 'j01', lang: 'zh' });
  for (const id of jin) assert.equal((html.match(new RegExp(`class="codexcard first" data-codex="${id}"`, 'g')) ?? []).length, 1, `${id}: one card in 今 · 一`);
  let s = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'] };
  s = resolve(s, content, ctx, { exit: 'go' }).state;
  const met = story(s, content, { now: NOW, quests: [] }).result.codex ?? [];
  for (const id of jin) assert.ok(!met.includes(id), `${id} never met in play`);
});
