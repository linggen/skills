// The one shell every small game wears (games/shell.js; Hanli 2026-10-20: 「确保所有小游戏一套外壳」): the story's
// board card, the 游戏厅 and the try page draw the same frame round the game's own host; every game in the
// registry can be hosted in it; pause stops a game's clock and hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { anyPaused, forget, frameHtml, isPaused, say, setPaused, shellFor, showResult, timedOf } from '../scripts/games/shell.js';

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
