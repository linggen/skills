// Every board that is not a story scene's own shows its way out at every moment (Hanli 10-27: 「这个也没有跳过去的办法」):
// the rules mark it leavable (Look's task `leave`, rules/skips.mjs leaveOf) and its card draws 收手 — the shell bar's ✕ — while it plays; a
// 传闻's step board draws 「算了，往下走」 from the first moment. Story boards keep the stuck gate (10-15).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { leaveOf } from '../scripts/rules/skips.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';

const content = loadContent();
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const scenes = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {}));
const storyIds = new Set(scenes.flatMap((sc) => [...(sc.show ?? []).filter((c) => c.card === 'board').map((c) => c.id), ...sc.exits.map((e) => e.needs?.task).filter(Boolean)]));
const offStory = content.tasks.tasks.filter((t) => t.kind === 'board' && !t.cut && !storyIds.has(t.id));

test('every off-story board is his to put down (收手) wherever he stands', () => {
  const s = JSON.parse(read('./fixtures/saves/zhishi-09year.json')).state;
  assert.ok(offStory.length >= 10, `${offStory.length} off-story boards`);
  for (const t of offStory) assert.ok(leaveOf(content, s, t.id), `${t.id}: leavable`);
});

test('its card draws 收手 as the shell bar\'s ✕ while it plays (any board kind), and none once it is won', () => {
  const fake = { meta: { id: 'x', name: { zh: '某局', en: 'A game' }, how: { zh: '', en: '' } }, html: () => '<i>play</i>', act: () => ({}), newGame: () => ({}) };
  for (const t of offStory.slice(0, 40)) {
    const look = { tasks: [{ id: t.id, kind: 'board', game: t.game, title: '某局', status: 'offered', leave: true }], scene: null };
    const playing = cardHtml({ card: 'board', id: t.id }, { look, lang: 'zh', words: WORDS.zh, content: {}, boardFor: () => ({ taskId: t.id, mod: fake, state: {} }) });
    // ✕ in the shell's bar, top right, last: ? · 🔊 (· Ⅱ) · ✕ (Hanli 10-27: 「收手按钮改成右上的关闭icon button吧」).
    const tools = playing.match(/<header class="gshell-bar">[\s\S]*?<div class="gshell-tools">([\s\S]*?)<\/div>/)?.[1] ?? '';
    assert.match(tools, new RegExp(`^<button[^>]*class="gshell-btn gshell-ask"[^>]*>\\?</button><button[^>]*data-shell-mute[\\s\\S]*data-board-leave="${t.id}">✕</button>$`), `${t.id}: ? first, ✕ (收手) last in the bar`);
    assert.doesNotMatch(playing, />收手<|>问询</, `${t.id}: no words under the board`);
    const won = cardHtml({ card: 'board', id: t.id }, { look, lang: 'zh', words: WORDS.zh, content: {}, boardFor: () => ({ taskId: t.id, mod: fake, state: { won: true } }) });
    assert.doesNotMatch(won, /data-board-leave/, `${t.id}: won, no ✕ to put it down`);
  }
});

test('a 传闻 step board shows 「算了，往下走」 from the first moment', () => {
  assert.match(read('../scripts/cards.js'), /skipBoard\(g, st\.board\.id, ctx, \{ always: true \}\)/);
});

// One bar for every board (Hanli 10-27: 「问询改成右上的icon button也, 全局统一改」): ? · 🔊 · Ⅱ · ✕, the way out last.
test('the shell bar lays its icons in one order: ? · 🔊 · Ⅱ · ✕ — the fight room and 开炉 too', async () => {
  const { frameHtml, toolHtml } = await import('../scripts/games/shell.js');
  const html = frameHtml({ id: 'o', title: 't', timed: true, ask: toolHtml('ask', '问询', 'data-ask="x"'), close: toolHtml('close', '收手', 'data-board-leave="o"') });
  const tools = html.match(/<div class="gshell-tools">([\s\S]*?)<\/div>/)[1];
  assert.deepEqual([...tools.matchAll(/class="gshell-btn gshell-(\w+)"/g)].map((m) => m[1]), ['ask', 'mute', 'pause', 'close']);
  assert.match(tools, /aria-label="问询"[^>]*>\?<\/button>/);
  assert.match(tools, /aria-label="收手"[^>]*>✕<\/button>$/);
  // The fight: 怎么玩 and 认输 in the bar, the room's own pair stepping aside under the shell.
  const page = read('../scripts/lingjing.js');
  assert.match(page, /ask: toolHtml\('ask', bw\.how, 'data-fight-tap="help"'\), close: toolHtml\('close', bw\.quit, 'data-fight-tap="quit"'\)/);
  assert.match(page, /\['\[data-fight-tap\]', \(el\) => fightTap\(el\.dataset\.fightTap\)\]/);
  assert.match(read('../scripts/battle.css'), /\.gshell:has\(> \.gshell-bar \[data-fight-tap\]\) \.btop :is\(\.bquit, \.bhelpbtn\) \{ display: none; \}/);
  // 开炉: back to the pouch is its ✕, no word over the pane.
  const { kailuPaneHtml } = await import('../scripts/fantong-kailu.js');
  const k = kailuPaneHtml('zh');
  assert.match(k, /class="gshell-btn gshell-close" title="储物袋" aria-label="储物袋" data-pouch-pane="">✕<\/button><\/div>/);
  assert.doesNotMatch(k, /class="act quiet pback"/);
});
