// 第九回 · 筑基 (chapter 00-zhuji, his 2026-09-30: 照这样重做冀州) — the book's winter, the
// year and the cliff, played at 沉鼎观 before the road north: the official pill sniffed and
// resealed, the furnace's three 九转, the year as the book's four seasons (one layer each —
// never days of chores), 瞿老's last disciple, and the Foundation laid on the cliff with the
// 九转 reached for before the sect's 一转. The cliff ends it straight into 第十回.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, oddsOf, resolve, rollOf } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-30T12:00:00');
const ctx = { now: NOW, quests: [] };
const CH = content.chapters['00-zhuji'];

/* Standing at 第九回's first scene: 外门 behind him, 练气五层, full 体力. */
const atSnow = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-snow', place: 'chaifang',
  ended: ['00-prologue', '00-waimen'], tier: 'qi', step: 4, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'],
  stamina: 100, stamina_at: NOW.toISOString(), bag: { 'foundation-pill': 1, danlu: 1 }, ...extra,
});
const go = (s, exit, extra = {}) => {
  const r = resolve(s, content, ctx, { exit, ...extra });
  assert.equal(r.result.ok, true, `${exit} at ${s.scene}: ${JSON.stringify(r.result)}`);
  return r;
};
const buttons = s => look(s, content, ctx).scene.buttons.map(b => b.id);
const full = s => ({ ...s, stamina: 100, stamina_at: NOW.toISOString() });

test('第九回 is its own chapter at 沉鼎观: between 外门 and 冀, the Foundation\'s gate, every scene reached', () => {
  assert.deepEqual([CH.province, CH.gate, CH.first_scene, CH.coming], ['徐', 1, '09-snow', undefined]);
  for (const sc of Object.values(CH.scenes)) {
    assert.equal(sc.hui, 'h09', sc.id);
    assert.ok(CH.map.places.includes(sc.at), `${sc.id} stands on the mountain`);
    assert.ok(sc.story?.zh && sc.story?.en, `${sc.id}: the book's passage`);
  }
  const seen = new Set(), todo = [CH.first_scene];
  while (todo.length) {
    const id = todo.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of CH.scenes[id].exits) if (e.next) todo.push(e.next);
  }
  assert.deepEqual([...seen].sort(), Object.keys(CH.scenes).sort());
});

test('the winter and the year: the seal resealed, the furnace\'s 九转, and the four seasons a layer each — 25 体力 a season, in order, once', () => {
  let s = atSnow();
  assert.equal(go(s, 'eat').state.scene, '09-snow', 'eating it now is turned down: the scene stays');
  s = go(s, 'taste').state;
  assert.equal(s.scene, '09-furnace');
  assert.equal(s.bag['foundation-pill'], 1, 'the sect\'s 一转 is not eaten: resealed, into 饭桶');
  s = go(s, 'fire').state;
  assert.equal(s.bag['foundation-pill-9'], 1, 'one 九转 is his, carried against the skin');
  assert.equal(s.scene, '09-year');
  s = full({ ...s, place: 'yaoyuan' });
  // Only the season due is offered; one out of order is refused.
  assert.deepEqual(buttons(s), ['qingming']);
  assert.equal(resolve(s, content, ctx, { exit: 'duanwu' }).result.refused, 'needs');
  const layers = [];
  for (const exit of ['qingming', 'duanwu', 'futian']) {
    const before = s.stamina;
    const r = go(s, exit);
    assert.equal(r.state.scene, '09-year', `${exit} stays`);
    assert.equal(before - r.state.stamina, 25, `${exit}: a season's practice costs 25 体力`);
    assert.ok(!buttons(r.state).includes(exit), `${exit} is not offered again`);
    s = r.state; layers.push(s.step + 1);
  }
  assert.deepEqual(layers, [6, 7, 8], '清明六 · 端午七 · 伏天八');
  // The pool is spent: 入秋 waits for 体力 — 闭关 (or the hours) brings it back.
  assert.equal(resolve(s, content, ctx, { exit: 'ruqiu' }).result.refused, 'no-stamina');
  const autumn = go(full(s), 'ruqiu').state;
  assert.equal(autumn.step, 8, '九层');
  assert.equal(autumn.progress, threshold(content, autumn), '圆满: the lake full');
  assert.equal(autumn.scene, '09-qulao');
});

test('the cliff: 瞿老\'s last disciple, then the throw — the 九转 reached for before the 一转, and 第十回 opens at once', () => {
  let s = { ...atSnow(), scene: '09-qulao', place: 'houshan', step: 8, progress: 130, bag: { 'foundation-pill': 1, 'foundation-pill-9': 1 } };
  s = go(s, 'listen').state;
  assert.equal(s.scene, '09-cliff');
  const odds = oddsOf(content, s, NOW, 'foundation');
  const pill = odds.parts.find(p => p.id === 'pill');
  assert.equal(pill.item.id, 'foundation-pill-9');
  assert.equal(pill.n, content.ladder.breakthrough.pill.bonus_of['foundation-pill-9']);
  // the try whose die lands
  let t = s;
  for (let k = 0; rollOf(t, 'foundation') >= odds.chance; k += 1) t = { ...s, breakthrough: { tries: { foundation: k + 1 } } };
  const r = go(t, 'take');
  assert.equal(r.result.breakthrough.success, true);
  assert.deepEqual(r.result.breakthrough.pill, { id: 'foundation-pill-9', name: '九转筑基丹' });
  assert.equal(r.state.bag['foundation-pill'], 1, 'the 官丹 stays sealed in 饭桶');
  assert.equal(r.state.bag['foundation-pill-9'], undefined, 'the 九转 is eaten');
  assert.equal(r.state.tier, 'foundation');
  assert.deepEqual([r.state.chapter, r.state.scene], ['01-ji', '01-arrive']);
  // 「第九回 · 完」 stands on 第十回's first scene, with what he did and the teaser.
  const close = look({ ...r.state, place: 'zhangnan' }, content, ctx).chapter.close;
  assert.equal(close.title, '第九回 · 完');
  assert.match(close.did, /崖顶筑了基/);
  assert.match(close.teaser, /邺城[\s\S]*豆腐/);
});

test('the set pieces ride their exits: 筑基天象 on the cliff\'s throw, 漳水立起 as he walks into the river standing up', () => {
  assert.equal(CH.scenes['09-cliff'].exits.find(e => e.id === 'take').setpiece, 'zhuji');
  // 漳水立起 in three runs, the picture keeping pace with the play: the river stands (send),
  // the player fights the trial himself, the wall falls after the win (stand), the seal and the 鼎 (seal).
  const exitOf = (sc, id) => content.chapters['01-ji'].scenes[sc].exits.find(e => e.id === id);
  const send = exitOf('01-altar', 'send');
  assert.deepEqual([send.setpiece, send.next], [{ id: 'zhang', beats: ['still', 'rise', 'bingyi'] }, '01-rise']);
  assert.deepEqual(exitOf('01-rise', 'stand').setpiece, { id: 'zhang', beats: ['fall'] });
  assert.equal(exitOf('01-rise', 'stand').game?.creature, 'foe-shuanglong', 'the trial is fought, not watched');
  assert.deepEqual(exitOf('01-deep', 'seal').setpiece, { id: 'zhang', beats: ['seal', 'ding'] });
  const played = ['01-altar/send', '01-rise/stand', '01-deep/seal'].flatMap((k) => exitOf(...k.split('/')).setpiece.beats);
  assert.ok(!played.includes('trial'), 'the trial beat is not replayed as a picture');
  const cliff = { ...atSnow(), scene: '09-cliff', place: 'houshan', step: 8, progress: 130 };
  let t = cliff;
  const chance = oddsOf(content, cliff, NOW, 'foundation').chance;
  for (let k = 0; rollOf(t, 'foundation') >= chance; k += 1) t = { ...cliff, breakthrough: { tries: { foundation: k + 1 } } };
  assert.equal(go(t, 'take').state.node?.setpiece, 'zhuji', 'the story node carries it to the page');
});

test('one runner for both set pieces: setpieces/zhuji.js hands 筑基天象\'s own player to setpiece.js, and the page plays a node\'s piece', async () => {
  const fs = await import('node:fs');
  const zhuji = await import('../scripts/setpieces/zhuji.js');
  assert.equal(typeof zhuji.play, 'function');
  assert.deepEqual(zhuji.BEATS.map(b => b.id), ['gather', 'light', 'tai', 'door', 'zhu', 'stars', 'settle']);
  const runner = fs.readFileSync(new URL('../scripts/setpiece.js', import.meta.url), 'utf8');
  assert.match(runner, /typeof def\.play === 'function'\) return def\.play\(host/);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /const piece = setpieceOf\(n\);\s*if \(piece\) playPiece\(piece, setpieceBeats\(n\)\);/);
  assert.match(page, /k < 600 && pieceOn; k \+= 1\) await pause\(250\);\s*if \(play\) show\(\{ memory/, 'her memory waits for the piece');
  assert.match(page, /k < 600 && pieceOn; k \+= 1\) await pause\(250\); \/\/ a set piece first, then the map/, '鼎归 waits for the piece');
});
