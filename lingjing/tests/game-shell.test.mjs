// The one shell every small game wears (games/shell.js; Hanli 2026-10-20: 「确保所有小游戏一套外壳」): the story's
// board card, the 游戏厅 and the try page draw the same frame round the game's own host; every game in the
// registry can be hosted in it; pause stops a game's clock and hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { anyPaused, forget, frameHtml, isPaused, playAlone, say, setPaused, shellFor, showResult, tallOf, tallStyle, timedOf } from '../scripts/games/shell.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const REG = JSON.parse(read('../worlds/jiuding/games.json'));

test('the frame: the game\'s own host inside, as given; title and how-to in the bar; pause only for a game in time', () => {
  const body = '<div class="game" data-game="t1"><b>board</b></div>';
  const f = frameHtml({ id: 't1', title: '喂饭桶', how: '划断藤', body, timed: true });
  assert.ok(f.includes(body), 'the host unchanged (play-human and the page key on [data-game] / [data-mount])');
  assert.match(f, /class="gshell"[^>]*data-shell="t1"/);
  assert.match(f, /gshell-title">喂饭桶</);
  assert.match(f, /gshell-how">划断藤</);
  assert.match(f, /data-shell-pause="t1"/);
  assert.doesNotMatch(frameHtml({ id: 't2', title: 'x', body, timed: false }), /data-shell-pause/, 'a board not in time has nothing to pause');
  assert.doesNotMatch(frameHtml({ id: 't3', title: '<b>' }), /<b>"/, 'text is escaped');
});

test('the store, not the DOM: pause, a bubble and the result are drawn from it each time the card is laid', () => {
  forget('s1');
  assert.equal(isPaused('s1'), false);
  setPaused('s1', true);
  assert.equal(isPaused('s1'), true);
  assert.equal(anyPaused(), true, 'the story page\'s clock stops for it, as for 回看');
  assert.equal(shellFor('s1').paused(), true, 'a game hears it through its mount options');
  const f = frameHtml({ id: 's1', title: 'x', timed: true });
  assert.match(f, /gshell is-paused/);
  assert.match(f, /gshell-veil/);
  setPaused('s1', false);
  say('s1', '银月', '来了！');
  assert.match(frameHtml({ id: 's1', title: 'x' }), /gshell-bubble" data-who="银月">来了！/);
  showResult('s1', { won: true, stars: 2, acts: [{ id: 'again', main: true }] });
  const r = frameHtml({ id: 's1', title: 'x' });
  assert.match(r, /id="won">成</);
  assert.match(r, /★★☆/);
  assert.match(r, /data-shell-act="again"/);
  forget('s1');
  assert.equal(anyPaused(), false);
  assert.doesNotMatch(frameHtml({ id: 's1', title: 'x' }), /gshell-bubble|id="won"/, 'a fresh deal is never born with the last one\'s state');
});

test('the story\'s board card wears the shell round a pure board and round a mounted one', () => {
  const task = { id: 'tk', title: '喂饼', kind: 'board', game: 'bread', status: 'offered', how: '划断藤' };
  const pure = { mod: { html: () => '<i>b</i>', tick: () => {}, meta: {} }, state: {} };
  const ctx = (g) => ({ look: { tasks: [task], lang: 'zh' }, lang: 'zh', words: WORDS.zh, qi: { st: 'full' }, boardFor: () => g });
  const a = cardHtml({ card: 'board', id: 'tk' }, ctx(pure));
  assert.match(a, /class="gshell"[^>]*data-shell="tk"/);
  assert.match(a, /<div class="game" data-game="tk"><i>b<\/i><\/div>/);
  assert.match(a, /gshell-title">喂饼</);
  assert.match(a, /gshell-how">划断藤</);
  assert.match(a, /data-shell-pause="tk"/, 'a board in time can be paused in the story too');
  assert.doesNotMatch(a, /class="cardtitle"/, 'one title, the shell\'s — never two');
  const mounted = { mod: { mount: () => new Promise(() => {}), meta: {} }, state: {} };
  const b = cardHtml({ card: 'board', id: 'tk' }, ctx(mounted));
  assert.match(b, /class="gshell"[^>]*data-shell="tk"/);
  assert.match(b, /data-mount="tk"/);
});

test('a Mac window: the story\'s game card takes the stage up to 720, a tall field its bar beside it — one rule, the shell\'s (Hanli 10-21)', async () => {
  // The kits that say they play tall, and only those: the story's card and the 游戏厅 read the same word.
  for (const id of ['shoulu', 'shouqiang', 'sadou']) assert.equal(tallOf(await import(`../scripts/games/${id}.js`)), true, id);
  for (const id of ['zhazhai', 'qimai', 'bread']) assert.equal(tallOf(await import(`../scripts/games/${id}.js`)), false, id);
  const task = { id: 'tk', title: '守炉', kind: 'board', game: 'shoulu', status: 'offered' };
  const ctx = (g) => ({ look: { tasks: [task], lang: 'zh' }, lang: 'zh', words: WORDS.zh, qi: { st: 'full' }, boardFor: () => g });
  const mount = () => new Promise(() => {});
  assert.match(cardHtml({ card: 'board', id: 'tk' }, ctx({ mod: { mount, meta: { tall: true } }, state: {} })), /class="gshell is-tall"/);
  // …its card as wide as the field at the stage's height, plus what the game sets beside it (Hanli 10-21: 「agree」).
  assert.match(cardHtml({ card: 'board', id: 'tk' }, ctx({ mod: { mount, meta: { tall: true, aspect: 0.75, beside: 252 } }, state: {} })), /<div class="card gamecard" style="--ar:0\.75;--beside:252px">/);
  assert.equal(tallStyle(await import('../scripts/games/sadou.js')), `--ar:${9 / 16};--beside:0px`);
  assert.equal(tallStyle(await import('../scripts/games/zhazhai.js')), '');
  assert.match(cardHtml({ card: 'board', id: 'tk' }, ctx({ mod: { mount, meta: {} }, state: {} })), /class="gshell"/);
  assert.match(read('../scripts/arcade.js'), /tall: tallOf\(mod\)/);
  // The width, the height a board sized by the window is told, the bar back over a landscape field or on a narrow
  // stage — on a Mac only, so the phone's card is the one it was.
  const css = read('../scripts/games/shell.css');
  const mac = css.slice(css.indexOf('@media (min-width: 900px)'));
  assert.match(mac, /\.focus \.card\.gamecard:has\(> \.gshell\) \{ max-width: 720px; --game-reserve: 230px; \}/);
  assert.match(mac, /\.focus \.card\.gamecard:has\(> \.gshell\.is-tall\) \{ --game-reserve: 204px;\s+max-width: calc\(200px \+ 18px \+ 34px \+ \(100dvh - var\(--game-reserve\)\) \* var\(--ar, \.5625\) \+ var\(--beside, 0px\)\); \}/);
  assert.match(mac, /\.focus \.card\.gamecard:has\(> \.gshell\.is-tall \[data-landscape="true"\]\) \{ max-width: 720px; \}/);
  assert.match(mac, /\.gshell\.is-tall:has\(\[data-landscape="true"\]\) \{ display: flex;/);
  assert.match(mac, /@container scene \(max-width: 620px\) \{ \.focus \.card\.gamecard > \.gshell\.is-tall \{ display: flex;/);
  assert.equal(css.slice(0, css.indexOf('@media (min-width: 900px)')).includes('.focus'), false, 'nothing of the story\'s outside the Mac rule');
  // 守炉 fits its field to the box that scrolls it (the story's stage), on a Mac only, and again when that box changes.
  const lu = read('../scripts/games/shoulu.js');
  assert.match(lu, /if \(!win\.matchMedia\?\.\('\(min-width: 900px\)'\)\.matches\) return null;/);
  assert.match(lu, /box \? roomIn\(box\) : \(win\.innerHeight \|\| 800\) - top - below/);
  assert.match(lu, /sized\.observe\(box\)/);
  // …and on a wide stage stands its HUD, bar and controls beside the field, as wide as it declares (`beside`).
  assert.match(lu, /side = Boolean\(box\) && root\.clientWidth >= 640/);
  assert.match(read('../scripts/games/shoulu/shoulu.css'), /\.g-shoulu\.is-side \{ display: grid; grid-template-columns: auto 240px;/);
});

test('every game in the registry can be hosted in the shell, and every place a game plays uses it', async () => {
  const ids = [...new Set(REG.games.filter((g) => !g.replaced).map((g) => g.id))];
  const missing = [];
  for (const id of ids) {
    const path = new URL(`../scripts/games/${id}.js`, import.meta.url);
    if (!fs.existsSync(path)) { missing.push(id); continue; }
    // A game the shell hosts: a mount(), or a pure board (html · act) that mountPure / the page draws.
    const mod = await import(path.href);
    assert.ok(typeof mod.mount === 'function' || (typeof mod.html === 'function' && typeof mod.act === 'function'), `${id}: neither a mount() nor a pure board`);
  }
  assert.deepEqual(missing, [], 'a registry row with no module');
  // The three places: the story's card (cards.js), the 游戏厅 (arcade.js), the try page; a mounted story
  // game hears the shell (beat-host.js); the story page's clock stops for its pause (lingjing.js).
  assert.match(read('../scripts/cards.js'), /frameHtml\(\{ id, title/);
  assert.match(read('../scripts/arcade.js'), /playAlone\(card, mount/);
  assert.match(read('../scripts/try-game.html'), /playAlone\(document\.getElementById\('play'\), mount/);
  assert.match(read('../scripts/beat-host.js'), /shell: shellFor\(id\)/);
  assert.match(read('../scripts/lingjing.js'), /paused: \(\) => view\.logOpen \|\| anyPaused\(\)/);
  for (const page of ['index.html', 'arcade.html', 'try-game.html']) assert.match(read(`../scripts/${page}`), /games\/shell\.css/, page);
  // Pause reaches every clock a game runs on: the pure boards' (mountPure) and 气走经脉's own frame loop.
  assert.match(read('../scripts/games/mount.js'), /doc\.visibilityState !== 'visible' \|\| paused\(\)/);
  assert.match(read('../scripts/games/qimai.js'), /doc\.visibilityState === 'visible' && !paused\(\)/);
  assert.equal(timedOf({ tick() {} }), true);
  assert.equal(timedOf({ meta: { pause: true } }), true);
  assert.equal(timedOf({ mount() {} }), false, 'a kit with its own loop and no pause yet shows no pause button');
});

test('off the story, 台词预取 only when asked (`prefetch`, a dev page\'s ?prefetch=1): once a deal, its lines into the mount', async () => {
  const fakeRoot = () => ({ innerHTML: '', querySelector: (q) => (q === '.gshell' ? { dataset: {} } : {}), ownerDocument: { addEventListener() {}, removeEventListener() {} } });
  const seen = [];
  const mount = async (_slot, o) => { seen.push(o); return { left: true }; };
  let asked = 0;
  const lines = { win: ['守住了。'] };
  const stop = playAlone(fakeRoot(), mount, { id: 'pa1', opts: { seed: 's' }, prefetch: ({ signal }) => { asked += 1; assert.ok(signal); return { lines }; } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(asked, 1);
  assert.equal(seen[0].lines, lines, 'her lines reach the game');
  assert.ok(seen[0].shell?.say, 'the shell still rides along');
  stop();
  const plain = playAlone(fakeRoot(), mount, { id: 'pa2', opts: {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen[1].lines, undefined, 'no prefetch: the level\'s own lines');
  plain();
  assert.match(read('../scripts/beat-host.js'), /prefetch\(id, g\)/, 'the story\'s host asks as it mounts');
});

test('a lead card reads at the story\'s 自动 pace, one rule for every game: 3 s at least, 8 s at most (Hanli 2026-10-21)', async () => {
  const { leadMs, LEAD_MS } = await import('../scripts/games/shell.js');
  const short = leadMs('来了。'), long = leadMs('爪印是从西头的崖根底下来的。又同崖根底下去。东头有灯，有鞭味，那东西今夜只会往没人的西头来——往他怀里来。'.repeat(3));
  assert.equal(short, LEAD_MS.min);
  assert.equal(long, LEAD_MS.max);
  const mid = leadMs('爪印是从西头的崖根底下来的。又同崖根底下去。东头有灯，有鞭味，那东西今夜只会往没人的西头来——往他怀里来。'); // 53 字 ≈ 4.5 s
  assert.ok(mid > LEAD_MS.min && mid < LEAD_MS.max, String(mid));
  for (const f of ['sadou', 'shouqiang', 'shoulu']) {
    const src = fs.readFileSync(new URL(`../scripts/games/${f}.js`, import.meta.url), 'utf8');
    assert.match(src, /shell\.lead\(said, \{ auto: 'read', lang/, `${f} reads its lead by the one rule`);
    assert.doesNotMatch(src, /auto: reducedMotion \? 2400 : 4200/, f);
  }
});
