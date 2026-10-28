// 古五 (2026-10-15): a board won moved only the header. Every win shows what it paid: a fight's 所得
// (settleBout), and a board's — 修为 · 灵石, the thing granted, the task's own line (payWin).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, spoilsHtml } from '../scripts/battle-card.js';

const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));

test('a board won stands its 所得: the pay, the item, the line', () => {
  assert.match(body('payWin'), /if \(r\.ok && boardPaid\(r\)\) keep\(\{ spoils: \{[^}]*paid: r\.paid[^}]*line: r\.line \?\? null \} \}\)/);
  assert.match(page, /const boardPaid = \(r\) => Boolean\(r\.paid\?\.progress \|\| r\.paid\?\.wealth/);
  const html = spoilsHtml({ cards: [], items: [{ name: '灵芝', n: 1 }], paid: { progress: 12, wealth: 3 }, spent: [], line: '洛书成了。' }, { words: WORDS.zh, catalog: {}, lang: 'zh' });
  assert.match(html, /修为 \+12 · 灵石 \+3/);
  assert.match(html, /灵芝/);
  assert.match(html, /洛书成了。/);
});

test('a fight won stands its 所得 when it paid', () => {
  assert.match(body('settleBout'), /r\.paid\?\.progress \|\| r\.paid\?\.wealth/);
  assert.match(body('settleBout'), /keep\(\{ spoils: \{/);
});

// 古五 (2026-10-15): lost at the 暗河, the pool's next beast stood and nothing led back toward the story.
// A place's own beast carries 下一步's go while the story's way lies elsewhere; a scene's fight does not.
test('a pool beast\'s card carries the way back toward the story', async () => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const { look, move, playTo } = await import('../scripts/rules.mjs');
  const { cardHtml, WORDS: CW } = await import('../scripts/cards.js');
  const content = loadContent();
  const NOW = new Date('2026-10-15T09:00:00+08:00');
  const ctx = { now: NOW, quests: [] };
  // the 秘境's second night (wm-kaikai, in the 石室), then into the 暗河 — its room open since wm-kunzhen
  const at = playTo(content, newState(content, 'zh', NOW), 'wm-kaikai', { now: NOW }).state;
  const moved = move(at, content, ctx, { place: 'mijing-anhe' });
  assert.equal(moved.result.ok, true, JSON.stringify(moved.result).slice(0, 200));
  const l = look(moved.state, content, ctx);
  const enc = l.place?.encounter;
  assert.ok(enc?.game?.id, `a beast in the 暗河: ${JSON.stringify(l.stage)}`);
  assert.equal(l.waypoint?.toward?.id, 'mijing-shishi');
  const html = cardHtml({ card: 'duel', id: enc.game.id }, { look: l, lang: 'zh', words: CW.zh, artBase: '', content: {} });
  assert.match(html, /data-go="mijing-shishi"[^>]*>下一步 · 去沉鼎秘境 · 石室 ›/);
  // standing where the story is, the beast's card is the fight alone
  const home = look(at, content, ctx);
  if (home.place?.encounter?.game?.id) assert.doesNotMatch(cardHtml({ card: 'duel', id: home.place.encounter.game.id }, { look: home, lang: 'zh', words: CW.zh, artBase: '', content: {} }), /wayback/);
});
