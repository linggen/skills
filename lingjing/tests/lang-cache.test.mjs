// The save holds ids, never a display string in the language of the moment (Hanli 11-02: under 中 the 秘境 spoils card
// read 「Third depth · The Stone Chamber … 得: Copper ore × 5」 — its names were written into the save in English).
// The same play in zh and in en must leave the same save; a field that differs is a name cached instead of an id.
// Allowed: the story node (a moment's message, kept in its own language and left out of a Look in the other —
// rules/language.mjs stateText, story.mjs nodeLook) and `page_did` (Ling's own notes, never drawn on the page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { endRun } from '../scripts/rules/mijing.mjs';
import { settleStages, stageBack } from '../scripts/rules/gates.mjs';
import { nodeLook } from '../scripts/rules/story.mjs';
import { stateText } from '../scripts/rules/language.mjs';
import { sweep } from '../tools/explore.mjs';

const content = loadContent();
const NOW = new Date(2026, 9, 28, 10, 0);
const ctx = { now: NOW, quests: [] };
const ALLOWED = [/^\.node(\.|$)/, /^\.page_did/];

/* Every path where two saves differ. */
function diff(a, b, at = '', out = []) {
  if (a === b) return out;
  if (ALLOWED.some(r => r.test(at))) return out;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { out.push(`${at}: ${JSON.stringify(a)?.slice(0, 50)} ≠ ${JSON.stringify(b)?.slice(0, 50)}`); return out; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}.${k}`, out);
  return out;
}
const bare = ({ lang, ...s }) => s;

test('卷一 walked in zh and in en: the same save at every scene', () => {
  const at = { zh: new Map(), en: new Map() };
  for (const lang of ['zh', 'en']) sweep(content, 'all-win', { lang, arrive: (id, s) => { if (!at[lang].has(id)) at[lang].set(id, structuredClone(s)); } });
  const found = [];
  for (const [id, s] of at.zh) if (at.en.has(id)) found.push(...diff(bare(s), bare(at.en.get(id))).map(d => `${id} ${d}`));
  assert.ok(at.zh.size > 50, 'the walk reached 卷一');
  assert.deepEqual([...new Set(found.map(f => f.replace(/^\S+ /, '').replace(/:.*/, '')))], [], found.slice(0, 8).join('\n'));
});

let door = null;
/* A save at the 秘境's stone door with keys (the story's own walk to 古六). */
function atDoor(lang) {
  if (!door) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { door = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(door);
  s.place = 'shimen';
  s.bag[content.mijing.key] = 3;
  return { ...s, lang };
}

test('a 秘境 run ended in zh or in en: the same save; Look names its spoils in the language it is drawn in', () => {
  const ended = {};
  for (const lang of ['zh', 'en']) {
    const t = VERBS.mijing(atDoor(lang), content, ctx, { action: 'enter', tier: 1, seed: 'cache' }).state;
    t.mijing.run.loot = { items: { tongkuang: 5, 'qi-pill': 2 }, wealth: 40 };
    t.mijing.run.done = ['1a'];
    ended[lang] = endRun(structuredClone(t), content, ctx, 'left').state;
  }
  assert.deepEqual(diff(bare(ended.zh), bare(ended.en)), []);
  // His save from before the fix kept English names: drawn again from its ids, in 中.
  const old = { ...ended.zh, mijing: { ...ended.zh.mijing, last: { ...ended.zh.mijing.last, name: 'Third depth · The Stone Chamber', items: ended.zh.mijing.last.items.map(i => ({ ...i, name: 'Copper ore' })) } } };
  const zh = look({ ...old, place: 'shimen' }, content, ctx).mijing.last;
  assert.ok(![zh.name, ...zh.items.map(i => i.name)].some(n => /[A-Za-z]{3}/.test(n)), JSON.stringify(zh));
  const en = look({ ...old, place: 'shimen', lang: 'en' }, content, ctx).mijing.last;
  assert.ok(![en.name, ...en.items.map(i => i.name)].some(n => /[一-鿿]/.test(n)), JSON.stringify(en));
});

test('stage quests settled in zh or in en: the same save, the steps named as Look is drawn', () => {
  // A save at 古八's 九层 with the gates behind it never handed in (tests/stage-pay.test.mjs's).
  const scenesOf = (ch) => Object.keys(content.chapters[ch].scenes);
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-yanceng', place: 'jiangtang', ended: ['00-prologue', '00-waimen'],
    done_scenes: [...scenesOf('00-prologue'), ...scenesOf('00-waimen'), '09-snow', '09-furnace', '09-year', '09-dabi', '09-shenshi', '09-dingfeng', '09-laba'], marks: ['y-futian', 'y-dabi'],
    tier: 'qi', step: 9, progress: 0, wealth: 112, traits: ['metal', 'wood', 'water', 'fire', 'earth'], tasks: { 'danfang-kanlu': { status: 'done' }, 'yanceng-chu': { status: 'done' } } };
  const zh = settleStages(content, { ...s, lang: 'zh' }, NOW), en = settleStages(content, { ...s, lang: 'en' }, NOW);
  assert.ok(zh.stage_back?.n > 0, 'gates settled');
  assert.deepEqual(diff(bare(zh), bare(en)), []);
  assert.ok(stageBack(content, zh, NOW, 'en').steps.every(n => !/[一-鿿]/.test(n)));
  assert.ok(stageBack(content, en, NOW, 'zh').steps.every(n => !/[A-Za-z]{3}/.test(n)));
});

test('the story node keeps its language and is left out of a Look in the other', () => {
  const s = { ...newState(content, 'zh', NOW), node: { kind: 'scene', at: NOW.toISOString(), recap: '石坳村' }, lang: 'zh' };
  const kept = JSON.parse(stateText(s));
  assert.equal(kept.node.lang, 'zh');
  assert.ok(nodeLook({ ...kept, lang: 'zh' }, NOW).story_node);
  assert.deepEqual(nodeLook({ ...kept, lang: 'en' }, NOW), {});
});
