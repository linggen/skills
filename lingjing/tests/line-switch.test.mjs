// A line switch (Hanli, 2026-10-15, 今 · 二 → 古五: 「这个截图是从今线切回古线的第一幕. 感觉不太对.
// 太突然了... 今线感觉还没结束.」 and 「刚才今线没完就跳回了古, 然后又跳回了今」).
//
// j04-dog's last tap put him back on the open map at 柴房, the 古 place he had stood on before
// the interlude: 孙二狗's 七巧 board (an errand hosted there) stood on the stage, 第五回's 「完」,
// seal and opening passage all left behind a walk to 石门 — where, under 「今 · 二 · 完」, the 今
// picture came back. And inside the interlude, between the 罚球 board and the next passage, the 古's
// 下一步 card (「去沉鼎秘境 · 石门」, the 货郎) could stand a moment on 沈芒's stage.
//
// The rule now, both ways:
// - 今 → 古: the step out of an interlude's last scene puts him where the 古 scene it was spliced
//   before stands (core.mjs backFromSide). There the turn plays in order: the old 回's 「完」, the
//   new 回's seal, the scene's opening passage, and only then its choices and games.
// - 古 → 今: while a 今 scene is on, nothing of the 古 place shows — its hosted boards, its
//   errands, its beasts, its 下一步 (stage.mjs onSide, withNext).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, move, resolve } from '../scripts/rules.mjs';
import { huiOf, sceneHui } from '../scripts/rules/hui.mjs';
import { stageCards, stageSlots, withNext } from '../scripts/stage.mjs';
import { afterBook, atTurn, atTurnCards } from '../scripts/queue.js';
import { boardsFor, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-15T16:00:00Z');
const ctx = { now: NOW, quests: [] };
const fixture = (name) => { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8')); return d.state ?? d; };
const sceneOf = (id) => Object.values(content.chapters).map((ch) => ch.scenes[id]).find(Boolean);
const jin = (id) => huiOf(content, sceneHui(content, id))?.line === 'jin';
const fresh = (s) => ({ ...s, stamina: 100, stamina_at: NOW.toISOString() });

/* 古四 over at 柴房 (wm-diyilu), 孙二狗's charm taken: its 七巧 board is open AT 柴房. */
const WAIMEN = ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-yaoyuan', 'wm-chaifang', 'wm-danlu', 'wm-diyilu'];
function atChaifang(scene, passed = []) {
  const s = fixture('waimen');
  return fresh({ ...s, tell_owed: [], scene, place: 'chaifang', node: null,
    done_scenes: [...s.done_scenes.filter((x) => !WAIMEN.includes(x)), ...WAIMEN, ...passed],
    quests: { ...(s.quests ?? {}), 'xu-sun-charm': { took: '2026-10-15', have: {} } } });
}
const kinds = (cards) => cards.map((c) => `${c.card}${c.id ? `:${c.id}` : ''}`);
const hosted = (cards) => cards.filter((c) => c.card === 'board' && c.id === 'qiqiao' || ['next', 'offer', 'duel', 'creature', 'hexagram', 'goal', 'handed', 'road'].includes(c.card));

test('the 柴房 holds a game of its own: 孙二狗\'s 七巧, open there on the open map', () => {
  const l = look(atChaifang(null, ['j04-gym', 'j04-line', 'j04-dog']), content, ctx);
  assert.ok(kinds(l.stage).includes('board:qiqiao'), kinds(l.stage).join());
});

test('a 今 interlude played with the 古 place holding a game: that game, its errands and its 下一步 never stand while 沈芒\'s scenes are on', () => {
  let s = atChaifang('j04-gym');
  const seen = [];
  for (let n = 0; n < 6 && jin(s.scene); n += 1) {
    const l = look(s, content, ctx);
    assert.equal(l.place.id, 'chaifang', 'the 古 place stays under the save while the 今 runs (it moves nothing)');
    assert.deepEqual(kinds(hosted(l.stage)), [], `${s.scene}: ${kinds(l.stage).join()}`);
    // The page's own 下一步 (lingjing.js stageNow → withNext) never adds the 古's either — not even
    // with the scene's game played and its way on not yet taken (the moment after the 罚球).
    assert.deepEqual(kinds(withNext(l, [])), [], `${s.scene}: 下一步 on a side line`);
    seen.push(s.scene);
    const exit = sceneOf(s.scene).buttons[0];
    s = walk(s, [...boardsFor(s, content, exit), ['resolve', { exit }]], content, NOW);
    if (jin(s.scene) && s.tasks) {
      const won = look(s, content, ctx);
      assert.deepEqual(kinds(withNext(won, won.stage.filter((c) => c.card !== 'panel'))), kinds(won.stage.filter((c) => c.card !== 'panel')), `${s.scene}: nothing of the 古 added`);
    }
  }
  assert.deepEqual(seen, ['j04-gym', 'j04-line', 'j04-dog']);
  assert.equal(s.scene, 'wm-mijing');
});

test('今 → 古: the interlude\'s last tap puts him at the 古 scene\'s place, where 「完」, the seal and the passage come before any game', () => {
  const s = resolve(atChaifang('j04-dog', ['j04-gym', 'j04-line']), content, ctx, { exit: 'on' }).state;
  assert.deepEqual([s.scene, s.place], ['wm-mijing', 'shimen'], 'carried to 石门, never left at 柴房');
  const l = look(s, content, ctx);
  assert.equal(l.chapter.close?.id, 'j04', '「今 · 二 · 完」 stands');
  assert.equal(l.chapter.close.title, '今 · 二 · 完');
  assert.equal(l.chapter.hui, 'h07', 'and the 回 now beginning is 第五回');
  assert.ok((s.tell_owed ?? []).includes('scene/wm-mijing'), 'the scene\'s opening passage is owed');
  assert.ok(!kinds(l.stage).includes('board:qiqiao'), '柴房\'s 七巧 is not here');
  // The page at the turn: the 「完」 alone (queue.js atTurnCards), nothing queued behind it.
  const held = atTurnCards(l.stage, { turn: atTurn({ closeUp: true }), ahead: true });
  assert.deepEqual(stageSlots(l, held).main.map((c) => c.card), ['closed']);
  assert.equal(stageSlots(l, held).footer.waiting, 0);
  // 「完」 put away, the seal on its way: still the turn — the passage waits for the seal.
  assert.equal(atTurn({ closeUp: false, sealOwed: true }), true);
  // The seal played, the passage told: no game stands over it (queue.js afterBook), and only then the scene's own.
  const withGame = [...l.stage.filter((c) => c.card !== 'closed'), { card: 'board', id: 'qiqiao' }];
  assert.ok(!afterBook(withGame, true).some((c) => c.card === 'board'), 'a board waits for the passage');
  assert.deepEqual(stageSlots(l, afterBook(l.stage.filter((c) => c.card !== 'closed'), false)).main.map((c) => c.card), ['panel'], 'then the scene card, its 交 / 不交');
  // Only the place moved: the scene is the waypoint it always was, and he may walk off it.
  const off = move(s, content, ctx, { place: 'waimen' });
  assert.equal(off.result.ok, true, JSON.stringify(off.result).slice(0, 200));
});

test('every interlude hands into its 古 scene\'s place — the turn ahead of Hanli (古六 → 今 · 三 → 古七) included', () => {
  const ends = [];
  for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes)) {
    if (!jin(sc.id)) continue;
    for (const e of sc.exits ?? []) if (e.next && !jin(e.next)) ends.push({ ch, sc, e });
  }
  assert.deepEqual(ends.map(({ sc }) => sc.id).sort(), ['j01-retest', 'j04-dog', 'j07-guan', 'j09-dongzhi']);
  for (const { ch, sc, e } of ends) {
    const into = sceneOf(e.next);
    assert.ok(into.at, `${e.next} stands somewhere`);
    const elsewhere = ch.map?.places?.find((p) => p !== into.at) ?? 'nowhere';
    const base = fixture('waimen');
    // The scene's game already played (its way on waits on it).
    const played = e.needs?.task ? { [e.needs.task]: { status: 'done', period: 'once', done_at: NOW.toISOString() } } : {};
    const s = fresh({ ...base, chapter: ch.id, scene: sc.id, place: elsewhere, tell_owed: [], node: null, tasks: { ...base.tasks, ...played } });
    const r = resolve(s, content, ctx, { exit: e.id });
    assert.equal(r.result.ok, true, `${sc.id}/${e.id}: ${JSON.stringify(r.result).slice(0, 200)}`);
    assert.deepEqual([r.state.scene, r.state.place], [into.id, into.at], `${sc.id}/${e.id} → ${into.id}`);
  }
});

test('古 → 今 keeps him where he stood: a 今 scene stands nowhere on the map', () => {
  const before = atChaifang('wm-diyilu');
  let s = { ...before, done_scenes: before.done_scenes.filter((x) => x !== 'wm-diyilu') };
  s = walk(s, [...boardsFor(s, content, 'save'), ['resolve', { exit: 'save' }]], content, NOW);
  assert.deepEqual([s.scene, s.place], ['j04-gym', 'chaifang']);
  const l = look(s, content, ctx);
  assert.equal(l.chapter.close?.id, 'h05', '第四回 · 完 first');
  assert.deepEqual(kinds(hosted(l.stage)), [], kinds(l.stage).join());
});
