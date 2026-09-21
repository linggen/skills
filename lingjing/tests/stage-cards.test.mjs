// Every card the rules can put on the stage, drawn the way the page draws it.
// 2026-09-21: the stage had been blank for three days wherever a 差事 was
// offered — the page called its own cards a second way and one was called
// without its card — while every test of the rules stayed green. Nothing here
// knows the cards by name: a card the rules stage and the page cannot draw
// fails, whatever it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest } from '../scripts/rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding', f), 'utf8'));
const content = loadContent();
const NOW = new Date('2026-09-21T12:00:00');

// The page's own reading of the world (lingjing.js loadContent), from the same files.
const authored = { world: 'jiuding', dir: 'worlds/jiuding', creatures: read('creatures.json').creatures.map(c => ({ ...c, dir: 'worlds/jiuding' })),
  herbs: read('herbs.json').herbs, hexagrams: read('hexagrams.json').hexagrams, traits: read('traits.json'), dictionary: read('dictionary.json'), cards: read('cards.json') };

function pageCtx(l) {
  const q = l.stamina, p = q?.max ? Math.round((q.now / q.max) * 100) : 0;
  return { look: l, lang: l.lang, words: WORDS[l.lang], content: authored, artBase: '../worlds/jiuding/', mapView: 'province', atlas: null,
    qi: q?.max ? { st: q.empty ? 'empty' : 'full', p, now: q.now, max: q.max, refillAt: null } : null,
    boardFor: () => null, duelFor: () => null };
}

const open = { ...newState(content, 'zh', NOW), scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 0, progress: 306, name: '清玄', bag: {} };
const chores = [{ id: 'shifu-scan', app: 'apple-shifu', period: 'week', due: true, reward: 30, done_at: '2026-09-21T09:00:00', title: { zh: '扫描', en: 'Scan' } },
  { id: 'health-workout', app: 'health', period: 'day', due: true, reward: 20, title: { zh: '炼体', en: 'Workout' } }];
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });

const SITUATIONS = {
  'an errand offered at a beast\'s haunt': [{ ...open, place: 'sibei' }, ctx()],
  'a market: the shelf, an authored errand, the day\'s notice': [{ ...open, place: 'pengcheng' }, ctx()],
  'the cauldron waiting on cultivation, the 功课 in the book': [{ ...open, chapter: '03-qing', scene: '03-cauldron', place: 'penglai', ended: ['00-prologue', '01-ji', '02-yan'] }, ctx({ quests: chores })],
  'the search for her: the bell not bought': [{ ...open, place: 'sishui', companion: { called: true } }, ctx()],
  '丹田 empty': [{ ...open, place: 'sishui', stamina: 0, stamina_at: NOW.toISOString() }, ctx()],
  'the first scene of a new save': [newState(content, 'zh', NOW), ctx()],
  'the same, in English': [{ ...open, place: 'pengcheng', lang: 'en' }, ctx({ quests: chores })],
};

for (const [name, [state, c]] of Object.entries(SITUATIONS)) {
  test(`the stage draws — ${name}`, () => {
    const l = look(state, content, c);
    assert.ok(l.stage.length, 'something stands on the stage');
    for (const card of l.stage) {
      const html = cardHtml(card, pageCtx(l));
      assert.ok(html.trim(), `${card.card}${card.id ? `:${card.id}` : ''} draws nothing`);
      assert.doesNotMatch(html, /undefined|\{\w+\}|NaN/, `${card.card} leaks a hole: ${html.match(/.{0,30}(undefined|\{\w+\}|NaN).{0,30}/)?.[0]}`);
    }
  });
}

test('the situations cover the stage\'s own cards', () => {
  const seen = new Set(Object.values(SITUATIONS).flatMap(([s, c]) => look(s, content, c).stage.map(x => x.card)));
  for (const kind of ['goal', 'offer', 'item', 'creature', 'hexagram']) assert.ok(seen.has(kind), `no situation stages a ${kind} card`);
});

test('a taken errand and a ready 功课 are rows of the goal card, with 交差 where it is due', () => {
  const at = ctx({ quests: chores });
  const took = quest({ ...open, place: 'sibei' }, content, at, { action: 'take', id: 'xu-lvliang-look' });
  const l = look(took.state, content, at);
  const html = cardHtml({ card: 'goal' }, pageCtx(l));
  assert.match(html, /吕梁洪的水声/);
  assert.match(html, /到 0\/1 · 在吕梁洪/);
  assert.match(html, /class="bookrow ready".*扫描.*交 差/s, 'the scan its app saw done is handed in from the row');
  assert.match(html, /炼体.*Health · 今日待做/s);
});

test('every word the page has in one language it has in the other', () => {
  // effAtk and four more were zh-only until 2026-09-21: in English a market's shelf threw, and the stage went blank.
  const keys = (o, at = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${at}${k}.`) : [`${at}${k}`]));
  assert.deepEqual(keys(WORDS.zh).filter(k => !keys(WORDS.en).includes(k)), [], 'en lacks');
  assert.deepEqual(keys(WORDS.en).filter(k => !keys(WORDS.zh).includes(k)), [], 'zh lacks');
});
