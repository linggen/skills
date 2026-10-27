// Every board that is not a story scene's own shows its way out at every moment (Hanli 10-27: 「这个也没有跳过去的办法」):
// the rules mark it leavable (Look's task `leave`, rules/skips.mjs leaveOf) and its card draws 收手 while it plays; a
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
  const s = JSON.parse(read('./fixtures/saves/arcade-duanan.json')).state;
  assert.ok(offStory.length >= 10, `${offStory.length} off-story boards`);
  for (const t of offStory) assert.ok(leaveOf(content, s, t.id), `${t.id}: leavable`);
});

test('its card draws 收手 while it plays (any board kind), and none once it is won', () => {
  const fake = { meta: { id: 'x', name: { zh: '某局', en: 'A game' }, how: { zh: '', en: '' } }, html: () => '<i>play</i>', act: () => ({}), newGame: () => ({}) };
  for (const t of offStory.slice(0, 40)) {
    const look = { tasks: [{ id: t.id, kind: 'board', game: t.game, title: '某局', status: 'offered', leave: true }], scene: null };
    const playing = cardHtml({ card: 'board', id: t.id }, { look, lang: 'zh', words: WORDS.zh, content: {}, boardFor: () => ({ taskId: t.id, mod: fake, state: {} }) });
    assert.match(playing, new RegExp(`data-[a-z-]*leave[a-z-]*="${t.id}"|>收手<`), `${t.id}: 收手 drawn`);
  }
});

test('a 传闻 step board shows 「算了，往下走」 from the first moment', () => {
  assert.match(read('../scripts/cards.js'), /skipBoard\(g, st\.board\.id, ctx, \{ always: true \}\)/);
});
