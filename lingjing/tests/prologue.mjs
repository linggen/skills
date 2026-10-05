// tests/prologue.mjs — the prologue walked the ordinary way (prologue-v3:
// story/jiuding-lu/notes/archive/prologue-1-source.md and prologue-2-source.md),
// for every test that needs a save at a point of it or past it. One walk, so a
// scene rewritten is one edit here, not one in every test file.
import assert from 'node:assert/strict';
import { resolve, task, VERBS, win } from '../scripts/rules.mjs';

/* The walk's birthday (named for v1, whose 木 水 火 土 it read under the retired
   rule): now 五行杂灵根 like every birthday, 木 and 水 tied to lead. */
export const V1_BIRTH = '1986-07-07';

/* `look` with `at` is 看 (rules/examine.mjs): a hotspot looked at, free. */
const FNS = { resolve, task, win, look: VERBS.look };

/* 石坳村 to the valley: the name card, the rent, the egg, the stele's rules,
   the clue at 黑松岭, the storm, the fall, the fox — and she joins at daybreak (`follow`). */
export const TO_VALLEY = [
  ['resolve', { exit: 'begin' }],
  ['resolve', { exit: 'endure' }],
  ['resolve', { exit: 'egg' }],
  ['resolve', { exit: 'go' }],
  ['resolve', { exit: 'lookout' }],
  ['resolve', { exit: 'rules' }],
  // 黑松岭: the tracks go on past the stone by the stream — found, the chase opens.
  ['look', { at: 'stone' }],
  ['resolve', { exit: 'carve' }],
  ['resolve', { exit: 'turn' }],
  // the storm is played (lane MG's board): haul 爹 back in the lulls, then the fall
  ['win', { id: 'fall-storm' }],
  ['task', { action: 'done', id: 'fall-storm' }],
  ['resolve', { exit: 'check' }],
  ['resolve', { exit: 'save' }],
  ['resolve', { exit: 'share' }],
];
/* 今 · 一 (2026-10-05): the interlude spliced in after 古二 (00-notice → 00-gate,
   content.mjs spliceInterludes) — the track, the anatomy lab, and the retest won.
   Marked `jin`: walked only where the save stands in it — a world without
   the interludes (withoutInterludes) walks past them. */
export const JIN_ONE = [
  ['resolve', { exit: 'on' }, 'jin'],
  ['resolve', { exit: 'on' }, 'jin'],
  ['win', { id: 'jin-qianmi' }, 'jin'],
  ['task', { action: 'done', id: 'jin-qianmi' }, 'jin'],
  ['resolve', { exit: 'finish' }, 'jin'],
];
/* Up to 00-hall: out of the valley, the deer, the rent, her sleep in the
   token, half a year, 舅舅, the three trials. `won` sets a scene fight's win
   down as the page would record it. */
export const TO_HALL = [
  ...TO_VALLEY,
  ['resolve', { exit: 'follow' }],
  ['resolve', { exit: 'climb' }],
  ['win', { id: 'deer-wind' }],
  ['task', { action: 'done', id: 'deer-wind' }],
  ['resolve', { exit: 'left' }],
  ['resolve', { exit: 'visit' }],
  ['resolve', { exit: 'dumb' }],
  ['resolve', { exit: 'on' }],
  ['win', { id: 'xisui-hold' }],
  ['task', { action: 'done', id: 'xisui-hold' }],
  ['resolve', { exit: 'bath' }],
  ['resolve', { exit: 'on' }],
  ['resolve', { exit: 'go' }],
  ['resolve', { exit: 'go' }],
  ...JIN_ONE,
  ['resolve', { exit: 'steady' }],
  ['win', { id: 'gate-luoshu' }],
  ['task', { action: 'done', id: 'gate-luoshu' }],
  ['resolve', { exit: 'pass' }],
  ['won', { id: 'gate-longzhi' }],
  ['resolve', { exit: 'subdue' }],
];
/* The roots read: the outer court's first night (公中). */
export const TO_WAIMEN = [...TO_HALL, ['resolve', { exit: 'born', birth: V1_BIRTH }]];
/* The prologue ended: 公中 paid, the notice board, and chapter 1 opens. */
export const TO_OPEN = [...TO_WAIMEN, ['resolve', { exit: 'pay' }], ['resolve', { exit: 'rest' }]];

/* The world as the tests written before 第一章 · 外门 knew it: the prologue
   ended straight onto the open 徐 and the road to 冀 — no chapter between, no
   map shut by a chapter, 冀 not waiting on its rewrite. Their fixtures test
   the engine's roads, markets and fights on that spine; tests/waimen.test.mjs
   tests the chapter as shipped. Mutates and returns the content it is given. */
export function beforeChapterOne(content) {
  withoutInterludes(content);
  delete content.chapters['00-waimen'];
  delete content.chapters['00-zhuji'];
  delete content.chapters['00-prologue'].map;
  return everyJuan(content);
}

/* The world before the 今 interludes were played (2026-10-05, content.mjs
   spliceInterludes): every 今 scene gone and the roads into it led back to
   the 古 scene it stood before. For the tests of the engine's roads and
   fights on the old spine; tests/jin.test.mjs tests the interludes as shipped.
   Mutates and returns the content it is given. */
export function withoutInterludes(content) {
  for (const ch of Object.values(content.chapters)) {
    const scenes = Object.values(ch.scenes ?? {});
    const jin = scenes.filter(sc => /^j\d\d$/.test(sc.hui ?? ''));
    for (const head of jin.filter(sc => sc.before)) {
      for (const sc of scenes) for (const e of sc.exits ?? []) if (e.next === head.id) e.next = head.before;
      if (ch.first_scene === head.id) ch.first_scene = head.before;
    }
    for (const sc of jin) delete ch.scenes[sc.id];
  }
  return content;
}

/* The world before 卷一 was walled (2026-10-05, world.mjs juanOpen): every
   卷 open — no `juan` on a chapter or a thing, no 卷一 map on 冀 — and the
   haunts the walling took off 卷一's map back where the old spine had them
   (夫诸 at 泗水北岸, 狍鸮 at 河伯祠). The engine's fights, roads and rumors
   are tested on that world; tests/juan.test.mjs tests the wall as shipped.
   Mutates and returns the content it is given. */
export function everyJuan(content) {
  for (const ch of Object.values(content.chapters)) delete ch.juan;
  delete content.chapters['01-ji']?.map;
  const strip = list => (list ?? []).forEach(x => delete x.juan);
  strip(content.creatures.creatures);
  strip(content.items.items);
  strip(content.quests);
  for (const d of Object.values(content.seeds ?? {})) strip(d.seeds);
  for (const l of Object.values(content.meets?.finds ?? {})) strip(l);
  const at = id => Object.values(content.places).flatMap(d => d.places).find(p => p.id === id);
  // The old spine's markets: each shop the province's shelf (`shop: true`), not its own goods (按店进货, 2026-10-05).
  for (const d of Object.values(content.places)) for (const p of d.places) if (p.has?.shop && typeof p.has.shop === 'object') p.has = { ...p.has, shop: true };
  // …and no pools (游荡的怪, 2026-10-05): a beast met only at its haunt or on the road.
  for (const d of Object.values(content.places)) for (const p of d.places) if (p.has?.pool) { const { pool, ...has } = p.has; p.has = has; }
  if (at('sibei')) at('sibei').has = { ...at('sibei').has, creature: 'fuzhu' };
  if (at('hebo')) at('hebo').has = { ...at('hebo').has, creature: 'paoxiao' };
  return content;
}

/* Walk `steps` from `state`; every step must land. */
export function walk(state, steps, content, now) {
  let s = state;
  for (const [verb, args, line] of steps) {
    if (line === 'jin' && !/^j\d\d$/.test(content.chapters[s.chapter]?.scenes?.[s.scene]?.hui ?? '')) continue;
    if (verb === 'won') { s = { ...s, wins: { ...s.wins, [args.id]: now.toISOString() } }; continue; }
    const out = FNS[verb](s, content, { now, quests: [] }, args);
    assert.equal(out.result.ok, true, `${verb} ${JSON.stringify(args)} at ${s.scene}: ${JSON.stringify(out.result)}`);
    s = out.state ?? s;
  }
  return s;
}

/* Through a 今 interlude the save stands in (2026-10-05): each scene's game won
   as the page records it and handed in, then its one way on — until the save
   stands in a 古 scene again. A save not in one is handed back as it is. */
export function throughJin(state, content, now) {
  let s = state;
  const here = () => content.chapters[s.chapter]?.scenes?.[s.scene];
  for (let n = 0; n < 12 && /^j\d\d$/.test(here()?.hui ?? ''); n++) {
    const sc = here();
    for (const id of sc.offers?.tasks ?? []) s = walk(s, [['win', { id }], ['task', { action: 'done', id }]], content, now);
    s = walk(s, [['resolve', { exit: sc.buttons[0] }]], content, now);
  }
  return s;
}
