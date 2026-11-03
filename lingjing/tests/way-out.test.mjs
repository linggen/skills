// Two ways out of every board, top right, from the first frame (Hanli 11-03: 「跳过, 我们统一改成右上角的关闭按钮了. 不需要卡住,
// 直接就给这个关闭按钮」 · 「还是加一个按钮好一些, 可能用户想丢掉, 可能想以后玩」): 留 then ✕, once each, on every game the
// registry plays, as the story's own board, one he chose, an errand's and one taken up again — and in the 游戏厅's shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { mountOnly } from '../scripts/beat-host.js';
import { newBoard } from '../scripts/board.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const REG = JSON.parse(read('../worlds/jiuding/games.json'));
const IDS = [...new Set(REG.games.map((g) => g.id))].filter((id) => fs.existsSync(new URL(`../scripts/games/${id}.js`, import.meta.url)));
const tools = (html) => html.slice(html.indexOf('<div class="gshell-tools">'), html.indexOf('</div>', html.indexOf('<div class="gshell-tools">')));

async function boardOf(id) {
  const mod = await import(`../scripts/games/${id}.js`);
  if (!mod.meta) return null;
  if (mountOnly(mod)) return { mod, state: { won: false } };
  return { mod, state: mod.newGame('t', 1, {}) };
}
const KINDS = {
  story: (id) => ({ task: { id: `t-${id}`, kind: 'board', game: id, title: id }, scene: { show: [{ card: 'board', id: `t-${id}` }] } }),
  chosen: (id) => ({ task: { id: `t-${id}`, kind: 'board', game: id, title: id, leave: true }, scene: { show: [] } }),
  errand: (id) => ({ task: { id: `t-${id}`, kind: 'board', game: id, title: id, leave: true, skip: { cut: 0.5 } }, scene: { show: [] } }),
  kept: (id) => ({ task: { id: `t-${id}`, kind: 'board', game: id, title: id, replay: true, leave: true }, scene: { show: [] } }),
};

test('every game, every kind of board: one 留 and one ✕ at the bar\'s right, from the first frame — no stuck wait', async () => {
  assert.ok(IDS.length >= 25, `${IDS.length} games`);
  let n = 0;
  const drawn = [], unshelled = [];
  for (const id of IDS) {
    const g = await boardOf(id);
    if (!g) { unshelled.push(id); continue; }
    drawn.push(id);
    for (const [kind, of] of Object.entries(KINDS)) {
      const { task, scene } = of(id);
      const html = cardHtml({ card: 'board', id: task.id }, { lang: 'zh', words: WORDS.zh, content: {}, reading: null, boardFor: () => ({ ...g, taskId: task.id }), look: { tasks: [task], scene } });
      assert.match(html, /gshell-tools/, `${id} as ${kind}: drawn in the shell`);
      const bar = tools(html);
      assert.equal((bar.match(/✕/g) ?? []).length, 1, `${id} as ${kind}: one ✕`);
      assert.equal((bar.match(/data-board-keep=/g) ?? []).length, 1, `${id} as ${kind}: one 留`);
      assert.match(bar, /data-board-keep="[^"]+">留<\/button><button[^>]*data-board-close="[^"]+">✕<\/button>$/, `${id} as ${kind}: 留 then ✕, last`);
      assert.doesNotMatch(html, /data-skip-slot|data-g="skip"|is-skip/, `${id} as ${kind}: no other skip`);
      n += 1;
    }
  }
  assert.equal(n, drawn.length * Object.keys(KINDS).length, 'every game as every kind');
  assert.deepEqual(unshelled, [], 'a game with no module meta');
  // The story's 炼丹 herbs too.
  const herbs = newBoard([{ id: 'a', tile: '参', label: '参' }], 'alchemy-first');
  const html = cardHtml({ card: 'board', id: 'alchemy-first' }, { lang: 'zh', words: WORDS.zh, content: {}, reading: null, boardFor: () => herbs, look: { tasks: [{ id: 'alchemy-first', kind: 'board', title: '炼丹' }], scene: { show: [{ card: 'board', id: 'alchemy-first' }] } } });
  assert.equal((tools(html).match(/✕/g) ?? []).length, 1);
});

test('the 游戏厅 and the try page wear the same two (shell.js playAlone); the arcade keeps its own list', () => {
  const shell = read('../scripts/games/shell.js');
  const alone = shell.slice(shell.indexOf('export function playAlone('), shell.indexOf('export function playAlone(') + 1800);
  assert.match(alone, /\.\.\.outTools\(id, lang\)/);
  assert.match(alone, /if \(act === 'again' \|\| act === 'close'\) deal\(\);/, '✕ deals it again');
  assert.match(alone, /else if \(act === 'keep'\) \{ onKeep\?\.\(\); deal\(\); \}/);
  assert.match(read('../scripts/arcade.js'), /onKeep: \(\) => keptAdd\(/);
  assert.match(read('../scripts/games/phone/host.js'), /\/\/ No stuck wait any more[^\n]*\n\s*post\(\{ t: 'stuck' \}\);/, 'the phone\'s way out from the first moment');
});

test('the page: ✕ is the skip path for each kind, 留 the keep; a fight\'s ✕ stays its own', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /\['\[data-board-close\]', \(el\) => closeBoard\(el\.dataset\.boardClose\)\]/);
  assert.match(page, /\['\[data-board-keep\]', \(el\) => keepGame\(el\.dataset\.boardKeep\)\]/);
  const close = page.slice(page.indexOf('function closeBoard('), page.indexOf('function keepGame('));
  assert.match(close, /return boardSkipped\(g\);/);
  const keep = page.slice(page.indexOf('function keepGame('), page.indexOf('async function onSkip('));
  assert.match(keep, /onSkip\(g, 'keep'\)/);
  assert.match(page, /write\('task', \{ action, id \}\)/);
  const cards = read('../scripts/cards.js');
  assert.match(cards, /skipped: \(r, h\) => \(r\.id \? `<button class="act quiet hometodo" data-kept-open>/, 'the 主页 row opens the kept list');
  assert.match(cards, /replay: \(o\) => `data-kept-play="\$\{esc\(o\.id\)\}"`/, 'the aside tray takes a kept board up');
  assert.doesNotMatch(page.slice(page.indexOf('function keptTap('), page.indexOf('function keptTap(') + 400), /'replay'/);
  assert.match(page, /close: toolHtml\('close', bw\.quit, 'data-fight-tap="quit"'\)/, 'a fight\'s ✕ is its own walk-out');
});

test('留 on a board that cannot wait on a list (切磋, 秘境, 兽潮, 考考你) does what ✕ does and says so — never refused', () => {
  const tasks = read('../scripts/rules/tasks.mjs');
  const fn = tasks.slice(tasks.indexOf('function keepOrPut('), tasks.indexOf('function keepOrPut(') + 700);
  assert.match(fn, /isBout\(content, id\)\) return put\(qiecuoOver\(state, content, ctx, id, 'skipped'\)\)/);
  assert.match(fn, /t\.mijing \|\| isTide\(content, id\) \|\| kaoHere\(content, state, id, ctx\.now\)\)\) return put\(leaveBoard\(/);
  assert.match(tasks, /if \(args\.action === 'keep'\) return keepOrPut\(/);
});

test('a story fight\'s card and a scene\'s riddle: 留 · ✕ from the first moment, both the pass (Hanli 11-03: no stuck waits anywhere)', () => {
  const cards = read('../scripts/cards.js');
  assert.match(cards, /const leave = exit !== e && exit\.stuck \? passOut\(exit\.id, ctx\.lang, 'duelpass'\) : '';/);
  assert.match(cards, /const leave = ex\.stuck \? passOut\(t\.id, lang, 'riddlepass', off\) : '';/);
  assert.match(cards, /const passOut = \(exitId, lang, cls, off = ''\) => `<div class="gshell-tools passout \$\{cls\}">\$\{outHtml\(lang,/);
  assert.doesNotMatch(cards, /SKIP\[/, 'no 「算了，往下走」 word left');
  assert.match(read('../scripts/rules/look.mjs'), /const stuck = true;/, 'a riddle may be left at once');
  assert.match(read('../scripts/rules/skips.mjs'), /return game\?\.kind === 'duel' && !state\.wins\?\.\[game\.id\];/, 'a story fight may be left at once');
  assert.ok(!/function stuckNow|STUCK_MS/.test(read('../scripts/stuck.js')), 'the stuck gate is gone');
});
