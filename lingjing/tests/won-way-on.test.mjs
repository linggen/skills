// A scene's fight won moves the story on (2026-10-15, live: 蠪侄 beaten at
// 00-longzhi, the page told Ling `[scene] won gate-longzhi`, and Ling's Look
// said nothing about Resolve — she told the finish and stopped, and nothing on
// the stage moved him on). The way on is mechanical, so it is the page's
// (stage.mjs wonWayOn): the won exit is found from Look alone and Resolved, a
// second Resolve is refused harmlessly, and a save already left in that state
// shows its way on (cards.js panelActsHtml) instead of a card that says 今日已降.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, battle, begin, foeTurn, offers, tokenOf } from '../scripts/battle.js';
import { WORDS, panelActsHtml } from '../scripts/cards.js';
import { loadContent, gameOf } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, look, resolve } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { cardHoldsWay, stageCards, wonWayOn } from '../scripts/stage.mjs';
import { TO_HALL, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const atLongzhi = () => walk(newState(content, 'zh', NOW), TO_HALL.slice(0, TO_HALL.findIndex(([v]) => v === 'won')), content, NOW);
const page = (l, extra = {}) => ({ look: l, lang: l.lang, words: WORDS[l.lang], content: {}, ...extra });

/* The fight played out the way the page plays it: the door, then the picks
   replayed by the rules (a greedy line, deterministic on the day's seed). */
function fightOut(state, id) {
  const started = duel(state, content, ctx(), { id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const { setup } = started.result.duel;
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const st = begin(setup, catalog), actions = [];
  for (let guard = 0; guard < 160 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const body = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6, 0);
    const before = { hp: st.foe.hp, mine: body(st.you), theirs: body(st.foe) };
    const best = offers(st).filter(o => o.ok && o.action.kind !== 'end')
      .map(o => {
        const after = battle([...actions, tokenOf(o.action)], setup, catalog);
        return { o, worth: (before.hp - after.foe.hp) * 2 + (body(after.you) - before.mine) * 1.2 + (before.theirs - body(after.foe)) - (o.cost ?? 0) * 0.1 };
      })
      .sort((a, b) => b.worth - a.worth)[0]?.o;
    if (!best) { act(st, { kind: 'end' }, 'you'); actions.push('end'); continue; }
    act(st, best.action, 'you');
    actions.push(tokenOf(best.action));
  }
  return duel(started.state, content, ctx(), { id, picks: actions.join(',') });
}

test('a won exit duel: the page finds its way on from Look, Resolves it, and the next scene stands', () => {
  const s = atLongzhi();
  assert.equal(s.scene, '00-longzhi');
  assert.equal(wonWayOn(look(s, content, ctx())), null, 'not won: nothing to take');
  const fought = fightOut(s, 'gate-longzhi');
  assert.equal(fought.result.outcome, 'won', JSON.stringify(fought.result));
  const after = look(fought.state, content, ctx());
  const way = wonWayOn(after);
  assert.equal(way?.id, 'subdue', 'the exit the win belongs to');
  const on = resolve(fought.state, content, ctx(), { exit: way.id });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
  assert.equal(on.state.scene, '00-hall');
  // The exit's own story is owed to the story view (Look's tell_owed → the page draws it).
  assert.equal(look(on.state, content, ctx()).tell_owed, true);
  assert.match(tellOf(content, on.state).tell.find(t => t.id === '00-longzhi/subdue').text, /……左边/);
  assert.equal(wonWayOn(look(on.state, content, ctx())), null, 'taken: nothing waits');
  // Ling Resolving it again (her guide said so until 2026-10-15) is refused, and writes nothing.
  const twice = resolve(on.state, content, ctx(), { exit: 'subdue' });
  assert.equal(twice.result.ok, false);
  assert.equal(twice.result.refused, 'unknown-exit');
  assert.equal(twice.state ?? null, null, 'a refusal carries no state to write');
  // …and a Resolve that lands on the old scene after the win was spent is refused too.
  const spent = resolve({ ...fought.state, wins: {} }, content, ctx(), { exit: 'subdue' });
  assert.equal(spent.result.refused, 'game-not-won');
});

test('a fight still open holds the way on', () => {
  const s = atLongzhi();
  const l = look({ ...s, wins: { 'gate-longzhi': NOW.toISOString() }, fight: { game: 'gate-longzhi', creature: 'longzhi', at: NOW.toISOString() } }, content, ctx());
  assert.equal(wonWayOn(l), null);
});

test('heal: a save left with the win in hand and the exit untaken shows its way on, not 今日已降', () => {
  // Hanli's save on 2026-10-15: 00-longzhi, gate-longzhi won, `subdue` never Resolved.
  const stuck = { ...atLongzhi(), wins: { 'gate-longzhi': NOW.toISOString() } };
  const l = look(stuck, content, ctx());
  assert.equal(wonWayOn(l)?.id, 'subdue');
  // The page counts a won exit's fight as called (calledDuels), which hid its tap: now it is the way on.
  const html = panelActsHtml(page(l, { called: new Set(['gate-longzhi']) }));
  assert.match(html, /data-panel-exit="subdue"/);
  assert.doesNotMatch(html, /data-panel-duel/);
  assert.match(html, /接着 ›/);
  // …and the stage stands the scene card, not the beaten beast's 出手 card in front of it.
  const cards = stageCards(l).map(c => c.card);
  assert.ok(cards.includes('panel'));
  assert.ok(!cards.includes('duel'), JSON.stringify(cards));
  assert.ok(stageCards(look(atLongzhi(), content, ctx())).some(c => c.card === 'duel'), 'not won: the fight card stands');
  // Not won: the tap still calls the fight up.
  const before = panelActsHtml(page(look(atLongzhi(), content, ctx())));
  assert.match(before, /data-panel-duel="gate-longzhi"/);
  // And the way on, tapped, goes where the win goes.
  assert.equal(resolve(stuck, content, ctx(), { exit: 'subdue' }).state.scene, '00-hall');
});

test('every exit duel in the world goes the same way: one per scene, with a way on', () => {
  const duels = [];
  for (const ch of Object.values(content.chapters)) {
    for (const sc of Object.values(ch.scenes ?? {})) {
      const ways = (sc.exits ?? []).filter(e => gameOf(e)?.kind === 'duel');
      if (!ways.length) continue;
      assert.equal(ways.length, 1, `${sc.id}: one fight's exit — wonWayOn takes only a lone one`);
      const e = ways[0];
      assert.ok(e.next || e.ends, `${sc.id}/${e.id}: a won fight leads somewhere`);
      assert.ok(!e.stay && !e.needs, `${sc.id}/${e.id}: nothing but the win stands before it`);
      // What Look hands the page for it, won: the one way on.
      const l = { scene: { exits: sc.exits.map(x => ({ id: x.id, ...(gameOf(x) ? { game: gameOf(x), won: x === e } : {}) })) } };
      assert.equal(wonWayOn(l)?.id, e.id, `${sc.id}`);
      duels.push(`${sc.id}/${e.id}`);
    }
  }
  // 三试, the 外门大比's three rounds, 秘境, 药园, 冰夷's 双龙, and the nine 鼎 fights.
  for (const at of ['00-longzhi/subdue', 'wm-fushi/flip', 'wm-lun2/dodge', 'wm-juesai/face', '01-rise/stand', '02-lake/subdue']) assert.ok(duels.includes(at), at);
});

/* The same class (2026-10-15, live at 00-hall): the story view played the
   passage to its last beat, 「…他把手放在测灵石上。」, and held it there with the
   scene's 看 list as its only "choices" — the 生辰 card, the way on, stood
   behind it and never came up. A way on that is a card of its own is never
   held in the box: the box goes, and the card stands. */
test('a passage ending on a scene whose way on is a card (生辰): the box holds no choices, the card stands', () => {
  const hall = walk(newState(content, 'zh', NOW), TO_HALL, content, NOW);
  assert.equal(hall.scene, '00-hall');
  const l = look(hall, content, ctx());
  assert.ok(l.scene.exits.some(e => e.born && !e.born.kept));
  assert.equal(cardHoldsWay(l), true);
  // lingjing.js choicesInBox reads cardHoldsWay: nothing held at the last beat, the box is put away…
  assert.match(panelActsHtml(page(l)), /data-look-at/, '…and the scene card carries its 看 beside the card');
  assert.ok(stageCards(l).some(c => c.card === 'born'), 'the 生辰 card stands');
  // Roots read (a save that holds them): the exit is the plain tap again, and the box may hold it.
  const kept = look({ ...hall, traits: ['wood', 'water'] }, content, ctx());
  assert.equal(cardHoldsWay(kept), false);
  // A scene whose way on is its taps (a fight called by its words, 00-longzhi) is held in the box as before.
  assert.equal(cardHoldsWay(look(atLongzhi(), content, ctx())), false);
});

test('the page wires both: every read and every passage drawn looks for the won way on; the box yields to a card', async () => {
  const fs = await import('node:fs');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));
  assert.match(body('readOnce'), /watchTell\(\);\n\s+watchWayOn\(\);/, 'on every Look: the live win and a reload alike');
  assert.match(body('watchTell'), /watchWayOn\(\);/, 'and once an owed passage is drawn');
  assert.match(body('watchWayOn'), /storyAhead\(\)/, 'never over words still to draw or still playing');
  assert.match(page, /const storyAhead = \(\) => Boolean\(look\?\.tell_owed \|\| drawingTold \|\| playing\(readingHere\(\)\)\)/);
  assert.match(body('watchWayOn'), /wayOnTried/, 'tried once: a refusal never loops');
  assert.match(body('choicesInBox'), /!cardHoldsWay\(look\)/);
});

/* Live 2026-10-15: after 蠪侄 was beaten, either its death passage or the 所得 card was lost — the
   way on was Resolved the moment the passage was drawn (not read), and walking on put 所得 away.
   One order now: the passage, then 所得, then the way on. */
test('a won fight: the passage, then 所得, then the way on — never one walked past', async () => {
  const fs = await import('node:fs');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));
  assert.match(body('watchWayOn'), /storyAhead\(\) \|\| spoilsUp\(\)/, 'the way on waits for the passage and for 所得');
  assert.match(page, /const spoilsShown = \(\) => spoilsUp\(\) && !view\.spoils\.pending && !storyAhead\(\)/, '所得 waits for the passage');
  assert.match(body('choicesInBox'), /!spoilsUp\(\)/, 'the box does not hold the way on while 所得 waits');
  assert.match(body('settleBout'), /pending: true/, '所得 kept from the fight\'s end, shown once the rules\' Look is in');
  assert.match(body('settleBout'), /await refresh\(\);\n\s+\/\/[^\n]*\n\s+if \(view\.spoils\?\.pending\)/);
  assert.match(body('draw'), /watchWayOn\(\);/, 'each draw looks again: 所得 put away, the passage read');
  assert.match(body('focusHtml'), /spoilsUp\(\) \? slots\.main\.filter\(\(c\) => c\.card !== 'next'\)/, '下一步 never stands over 所得');
});
