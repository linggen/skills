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
  const alone = shell.slice(shell.indexOf('export function playAlone('), shell.indexOf('export function playAlone(') + 3200);
  assert.match(alone, /\.\.\.outTools\(id, lang\)/);
  // ✕ puts it away, never deals it again (Hanli 11-08: 「点右上角关闭, 关闭后会马上再出来」 — the 11-03 shell dealt afresh on ✕).
  assert.match(alone, /else if \(act === 'close'\) away\(\);/, '✕ puts it away');
  assert.match(alone, /else if \(act === 'keep'\) \{ onKeep\?\.\(\); away\(\); \}/);
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
  assert.match(page, /toolHtml\('close', bw\.quit, 'data-fight-tap="quit"'\)/, 'a fight\'s ✕ is its own walk-out');
  assert.match(page, /toolHtml\('keep', words\(\)\.boardKeep, 'data-fight-tap="keep"'\)/, 'and its 留 beside it (11-05)');
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

test('the 游戏厅\'s ✕ and 留 put the game away for good — only 再来 deals it again (Hanli 11-08: 「关闭后会马上再出来」)', async () => {
  const { playAlone } = await import('../scripts/games/shell.js');
  let click = null;
  const slot = { replaceChildren() { slot.cleared = (slot.cleared ?? 0) + 1; } };
  const root = { innerHTML: '', querySelector: (q) => (q === '.gshell' ? { dataset: {} } : q === '#slot' ? slot : null),
    ownerDocument: { addEventListener: (k, fn) => { if (k === 'click') click = fn; }, removeEventListener() {} } };
  const mounts = [];
  const mount = (_slot, o) => new Promise((done) => { mounts.push(o); o.signal.addEventListener('abort', () => done({ left: true })); });
  let kept = 0;
  const stop = playAlone(root, mount, { id: 'pa-out', opts: {}, onKeep: () => { kept += 1; } });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const tap = (act) => click({ preventDefault() {}, target: { closest: (q) => (q === '[data-shell-act]' ? { dataset: { shellAct: act }, closest: () => ({ dataset: { shell: 'pa-out' } }) } : null) } });
  await tick();
  assert.equal(mounts.length, 1, 'dealt once');
  tap('close');
  await tick(); await tick();
  assert.equal(mounts.length, 1, '✕: not dealt again');
  assert.ok(mounts[0].signal.aborted, '✕: its play stopped');
  assert.equal(slot.cleared, 1, '✕: its board gone from the slot');
  tap('again');
  await tick();
  assert.equal(mounts.length, 2, '再来 deals it again');
  tap('keep');
  await tick(); await tick();
  assert.equal(kept, 1);
  assert.equal(mounts.length, 2, '留: kept and put away, not dealt again');
  stop();
});

test('a 试玩 board on the game page: ✕ · 留 put it away (view.left, its play taken down), and the tray holds it to take up again', async () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /if \(isArcadeBoard\(id\)\) return arcadeAway\(id\);/);
  const away = page.slice(page.indexOf('function arcadeAway('), page.indexOf('function arcadeAway(') + 600);
  assert.match(away, /beats\.leave\(id\)/);
  assert.match(away, /left: \[\.\.\.view\.left\.filter\(\(l\) => l\.id !== id\), \{ id,/);
  // the stage drops a board in view.left, whatever Look stands (withArcade stands the 试玩 first)
  assert.match(page, /if \(view\.left\.length\) cards = cards\.filter\(\(c\) => !\(c\.card === 'board' && view\.left\.some\(\(l\) => l\.id === c\.id\)\)\);/);
  const { withArcade } = await import('../scripts/arcade-board.js');
  const look = withArcade({ tasks: [], stage: [], agenda: [{ key: 'stage:stage', group: 'main', kind: 'stage', id: 'stage', tray: true }] }, 'drawguess');
  assert.deepEqual(look.agenda[0], { key: 'task:arcade:drawguess', group: 'other', kind: 'task', id: 'arcade:drawguess', tray: true }, 'its tray row, 玩');
  const { trayHtml, WORDS } = await import('../scripts/cards.js');
  assert.match(trayHtml({ look, words: WORDS.zh, lang: 'zh', onStage: [] }), /data-play="arcade:drawguess"/, 'put away, the tray offers it');
  assert.doesNotMatch(trayHtml({ look, words: WORDS.zh, lang: 'zh', onStage: ['arcade:drawguess'] }), /data-play="arcade:drawguess"/, 'on the stage, not twice');
});
