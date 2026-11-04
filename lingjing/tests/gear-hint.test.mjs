// gear-hint.test.mjs — a story fight weighed with a thing worn, and he is not wearing it (Hanli 2026-11-04: 「要加」):
// Look's door carries `gear_hint` (rules/gearhint.mjs), the page's one tap puts it on him, 银月 says it from the facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { look, trade } from '../scripts/rules.mjs';
import { newState } from '../scripts/state.mjs';
import { gameOf } from '../scripts/content.mjs';
import { FIGHTS, content, gameOf as fightGame, keyOf, NOW, stateAt } from '../tools/story-fights.mjs';
import { gearFacts, gearKey, MOMENTS, poolOf } from '../scripts/hersay.js';
import { gearHintHtml, WORDS } from '../scripts/battle-card.js';
import { huiOrder, sceneHui } from '../scripts/rules/hui.mjs';

const ctx = () => ({ now: NOW, quests: [] });
const HER = { joined: '2026-10-19', asleep: true, here: true };
/* His save's shape (11-04): at 灵草谷 at 五层, the bronze sword on him, 火柴 given to 银月. */
const his = () => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-lingcao', place: content.chapters['00-zhuji'].scenes['09-lingcao'].at,
  ended: ['00-prologue', '00-waimen'], tier: 'qi', step: 5, traits: ['metal', 'wood', 'water', 'fire', 'earth'], stamina: 100, stamina_at: NOW.toISOString(),
  companion: HER, wear: { robe: 'grey-robe', weapon: 'qingtong-jian', 'yinyue.weapon': 'huochai-jian' }, bag: { 'grey-robe': 1, 'qingtong-jian': 1, 'huochai-jian': 1 },
});
const door = (s) => look(s, content, ctx()).scene.exits.find(e => e.game?.id === 'lingcao-qiuyu').duel;

test('his save shape: 火柴 on 银月, the bronze sword on him — the 犰狳 door says where 火柴 is', () => {
  const h = door(his()).gear_hint;
  assert.equal(h.item, 'huochai-jian');
  assert.equal(h.slot, 'weapon');
  assert.equal(h.on, 'yinyue');
  assert.equal(h.now.item, 'qingtong-jian');
  assert.deepEqual(h.resists.lets, ['金'], 'what 装睡 lets in');
  assert.equal(h.lead, '沈小满');
  const f = gearFacts(look(his(), content, ctx()), true);
  assert.match(f.what, /火柴/);
  assert.match(f.what, /银月身上/);
  assert.match(f.what, /金/);
});

test('in the bag, unworn: on is the bag', () => {
  const s = his();
  delete s.wear['yinyue.weapon'];
  assert.equal(door(s).gear_hint.on, 'bag');
});

test('worn: no hint; not owned at all: no hint; won, or a fight open: no hint', () => {
  const s = his();
  assert.equal(door({ ...s, wear: { robe: 'grey-robe', weapon: 'huochai-jian', 'yinyue.weapon': 'qingtong-jian' } }).gear_hint, undefined);
  const { 'huochai-jian': _, ...bag } = s.bag;
  assert.equal(door({ ...s, bag, wear: { robe: 'grey-robe', weapon: 'qingtong-jian' } }).gear_hint, undefined);
  assert.equal(door({ ...s, fight: { game: 'lingcao-qiuyu', creature: 'qiuyu', at: NOW.toISOString() } }).gear_hint, undefined);
});

test('the one tap: 火柴 off 银月, onto him (a plain use is refused while she wears the only copy)', () => {
  const s = his();
  assert.equal(trade(s, content, ctx(), { action: 'use', id: 'huochai-jian' }).result.refused, 'worn-elsewhere', 'why the page takes it off her first');
  const off = trade(s, content, ctx(), { action: 'remove', id: 'huochai-jian', on: 'her', slot: 'weapon' });
  assert.equal(off.result.ok, true);
  const on = trade(off.state, content, ctx(), { action: 'use', id: 'huochai-jian' });
  assert.equal(on.result.ok, true);
  assert.equal(on.state.wear.weapon, 'huochai-jian');
  assert.equal(on.state.wear['yinyue.weapon'], undefined);
  assert.equal(on.state.bag['qingtong-jian'], 1, 'the bronze sword back in the bag');
  assert.equal(door(on.state).gear_hint, undefined, 'worn: the hint is gone');
});

test('the card: one line and the 戴上 tap, from the facts; 银月 once a fight a day, again after a loss', () => {
  const h = door(his()).gear_hint;
  const html = gearHintHtml(h, { words: WORDS.zh });
  assert.match(html, /这一场按戴着火柴调的/);
  assert.match(html, /给沈小满戴上 · 火柴/);
  assert.match(html, /data-gear-hint="huochai-jian" data-on="yinyue" data-slot="weapon"/);
  assert.match(gearHintHtml(door({ ...his(), lang: 'en' }).gear_hint, { words: WORDS.en }), /Put the Matchstick on/);
  for (const l of ['zh', 'en']) for (const k of ['gearHint', 'gearHintWear']) {
    const t = WORDS[l][k].replace(/\{\w+\}/g, '');
    assert.ok(l === 'zh' ? [...t].length <= 20 : t.split(/\s+/).filter(Boolean).length <= 20, `${l}.${k} short`);
  }
  assert.equal(MOMENTS.gear.once, 'key');
  const f = gearFacts(look(his(), content, ctx()), true);
  assert.notEqual(gearKey(f, 'd'), gearKey({ ...f, lost: 1 }, 'd'), 'a loss opens the word again');
  assert.notEqual(gearKey(f, 'd1'), gearKey(f, 'd2'), 'a new day too');
  for (const mode of ['awake', 'asleep']) for (const lang of ['zh', 'en']) {
    assert.ok(poolOf('gear', { mode, lang }) !== poolOf('won', { mode, lang }), `${mode}.${lang} has her gear pool`);
    assert.ok(poolOf('lost', { mode, lang, variant: 'gear' }) !== poolOf('lost', { mode, lang }), `${mode}.${lang} has lost_gear`);
  }
});

/* The lint: every `weighed_with` names a thing that exists, that the road had him wear when the fight was weighed
   (tools/story-fights.mjs STOPS), and that a scene before the fight's grants. */
test('lint: every weighed_with item exists, was worn in the weighing, and is had before that scene', () => {
  const tagged = [];
  for (const ch of Object.values(content.chapters)) for (const [sid, sc] of Object.entries(ch.scenes ?? {})) for (const e of sc.exits ?? []) {
    const g = gameOf(e);
    if (!g?.weighed_with) continue;
    tagged.push(g.id);
    assert.equal(g.kind, 'duel', `${g.id}: a duel`);
    const f = FIGHTS.find(x => x.scene === `${sid}/${e.id}`);
    assert.ok(f, `${g.id}: weighed in tools/story-fights.mjs`);
    assert.equal(fightGame(f).id, g.id);
    const road = stateAt(f.at);
    for (const [slot, id] of Object.entries(g.weighed_with.wear ?? {})) {
      const item = content.items.items.find(i => i.id === id);
      assert.ok(item, `${g.id}: ${id} is an item`);
      assert.equal(item.kind, slot, `${g.id}: ${id} goes in ${slot}`);
      assert.equal(road.wear[slot], id, `${keyOf(f)}: weighed with ${id} worn`);
      const at = huiOrder(content, sceneHui(content, sid));
      const grants = [];
      for (const c2 of Object.values(content.chapters)) for (const [s2, sc2] of Object.entries(c2.scenes ?? {})) for (const x of sc2.exits ?? []) {
        if (x.grant?.item === id || (x.grant?.items ?? []).includes?.(id)) grants.push(s2);
      }
      assert.ok(grants.length, `${id}: some scene grants it`);
      // Before: an earlier 回, or the same 回 with the fight down the scenes' `next` chain from the grant.
      const scenes = Object.assign({}, ...Object.values(content.chapters).map(c2 => c2.scenes ?? {}));
      const reaches = (from, to, seen = new Set()) => from === to || (!seen.has(from) && (seen.add(from), (scenes[from]?.exits ?? []).some(x => x.next && reaches(x.next, to, seen))));
      assert.ok(grants.some(s2 => s2 !== sid && (huiOrder(content, sceneHui(content, s2)) < at || reaches(s2, sid))), `${id}: granted before ${sid}`);
    }
  }
  assert.deepEqual(tagged.sort(), ['lingcao-qiuyu', 'shuanglong-trial']);
});
