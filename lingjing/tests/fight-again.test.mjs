// After a fight that was not won (Hanli 11-04, 灵草谷's 犰狳: 「刚打完的妖, 力竭遁走了. 主界面还可以再打, 是故意设计的吗?」).
// A STORY fight (`retry`, 09-lingcao's 犰狳) is not over: the story waits on its win, 出手 is open again at once, and the
// card and Look say so (`again`) — never shut for the day. A haunt's beast keeps the day rule: run dry or beaten off, it is
// gone till tomorrow, the card draws no 出手, and tomorrow it stands again. And the story fight's 留 · ✕ sit inside its card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { duel, look, playTo } from '../scripts/rules.mjs';
import { challengeHtml, WORDS as BATTLE_WORDS } from '../scripts/battle-card.js';
import { beforeChapterOne, TO_WAIMEN, walk } from './prologue.mjs';
import { resolve } from '../scripts/rules.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-15T09:00:00+08:00');
const TOMORROW = new Date(NOW.getTime() + 24 * 3600 * 1000);
const START = NOW;
const ctx = (now = NOW) => ({ now, quests: [] });
const card = (brief) => challengeHtml(brief, { words: BATTLE_WORDS.zh, lang: 'zh', title: brief.creature.name });

test('a story fight run dry (or lost) today is open again at once, and the card and Look say it is not over', () => {
  const out = playTo(content, newState(content, 'zh', START), '09-lingcao', { now: START, policy: 'win' });
  // …and walked to where the scene stands (its `at`, the 山门), on the run's own clock.
  const s0 = { ...out.state, place: 'shanmen' }, at = out.now;
  assert.equal(s0.scene, '09-lingcao');
  const ctx = (now = at) => ({ now, quests: [] }), NOW = at;
  for (const outcome of ['withdrew', 'lost']) {
    const s = { ...s0, duels: { ...s0.duels, qiuyu: { day: dayKey(NOW), outcome } } };
    const fight = look(s, content, ctx()).scene.exits.find((e) => e.game?.id === 'lingcao-qiuyu');
    assert.ok(fight, 'the scene\'s fight is its exit');
    assert.equal(fight.withdrawn, false, `${outcome}: never shut for the day`);
    assert.equal(fight.duel.today, null, `${outcome}: no day's outcome on the door`);
    assert.deepEqual(fight.duel.again, { outcome, story_open: true }, `${outcome}: Look tells Ling the beat is still his`);
    const html = card(fight.duel);
    assert.match(html, /还没打完 —— 再出手/, 'the card says it is not over');
    assert.match(html, /data-duel-start="lingcao-qiuyu">再出手</, '…and 出手 is open again');
    assert.equal(duel(s, content, ctx(), { id: 'lingcao-qiuyu' }).result.ok, true, 'the rules let him go again at once');
  }
  // a fresh door says nothing of the kind
  const fresh = look(s0, content, ctx()).scene.exits.find((e) => e.game?.id === 'lingcao-qiuyu');
  assert.equal(fresh.duel.again, undefined);
  assert.doesNotMatch(card(fresh.duel), /还没打完/);
});

test('a haunt\'s beast run dry stays gone today — no 出手 on its card, refused at the door — and stands again tomorrow', () => {
  const open = walk(newState(content, 'zh', NOW), TO_WAIMEN, beforeChapterOne(content), NOW);
  const c1 = beforeChapterOne(content);
  let s = resolve(open, c1, ctx(), { exit: 'pay' }).state;
  s = resolve(s, c1, ctx(), { exit: 'rest' }).state;
  s = { ...s, chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  for (const outcome of ['withdrew', 'lost']) {
    const today = { ...s, duels: { ...s.duels, jingwei: { day: dayKey(NOW), outcome } } };
    const e = look(today, c1, ctx()).place.encounter;
    assert.equal(e.game.id, 'haunt:jingwei');
    assert.equal(e.duel.today?.outcome, outcome, 'the day\'s outcome is on its door');
    assert.equal(e.duel.again, undefined, 'a haunt is no story fight');
    assert.doesNotMatch(card(e.duel), /data-duel-start/, `${outcome}: no 出手 today`);
    const r = duel(today, c1, ctx(), { id: 'haunt:jingwei' }).result;
    assert.equal(r.ok, false);
    assert.equal(r.refused, outcome === 'lost' ? 'withdrawn' : 'spent-today');
    const next = look(today, c1, ctx(TOMORROW)).place.encounter;
    assert.equal(next.duel.today, null, 'tomorrow it stands again');
    assert.match(card(next.duel), /data-duel-start="haunt:jingwei"/);
  }
});

test('留 · ✕ of a way on that is no board sit inside their card, at its top right (「留和关闭的位置不对」)', () => {
  const src = fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /html \+ leave/, 'never laid after the card\'s closing tag');
  assert.match(src, /leave \? withCloseX\(html, leave\) : html/, 'a story fight\'s pair goes inside the card root');
  assert.match(src, /<div class="riddletap">\$\{leave\}/, 'a riddle\'s pair is the first thing in its card');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  assert.match(css, /\.card > \.gshell-tools\.passout, \.riddletap > \.gshell-tools\.passout \{ position: absolute; top: 8px; right: 8px;/);
});
