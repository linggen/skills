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
  try { return { mod, state: mod.newGame('t', 1, {}) }; } catch { return { mod, state: { won: false } }; }
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
  for (const id of IDS) {
    const g = await boardOf(id);
    if (!g) continue;
    for (const [kind, of] of Object.entries(KINDS)) {
      const { task, scene } = of(id);
      let html;
      try { html = cardHtml({ card: 'board', id: task.id }, { lang: 'zh', words: WORDS.zh, content: {}, reading: null, boardFor: () => ({ ...g, taskId: task.id }), look: { tasks: [task], scene } }); } catch { continue; }
      if (!html.includes('gshell-tools')) continue;
      const bar = tools(html);
      assert.equal((bar.match(/✕/g) ?? []).length, 1, `${id} as ${kind}: one ✕`);
      assert.equal((bar.match(/data-board-keep=/g) ?? []).length, 1, `${id} as ${kind}: one 留`);
      assert.match(bar, /data-board-keep="[^"]+">留<\/button><button[^>]*data-board-close="[^"]+">✕<\/button>$/, `${id} as ${kind}: 留 then ✕, last`);
      assert.doesNotMatch(html, /data-skip-slot|data-g="skip"|is-skip/, `${id} as ${kind}: no other skip`);
      n += 1;
    }
  }
  assert.ok(n >= IDS.length * 2, `${n} cards drawn`);
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
  assert.match(page, /close: toolHtml\('close', bw\.quit, 'data-fight-tap="quit"'\)/, 'a fight\'s ✕ is its own walk-out');
});
