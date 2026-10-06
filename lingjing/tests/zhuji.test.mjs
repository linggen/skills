// 古七 · 筑基 (chapter 00-zhuji, his 2026-09-30: 照这样重做冀州) — the book's winter, the
// year and the cliff, played at 沉鼎观 before the road north: 劈柴 from the 饭桶 (the
// 九转 is not shown until the eve of 筑基, Hanli 2026-10-06 — no 官丹 yet: 古六's final was lost, 2026-10-03), the furnace's
// culls, the year as the book's seasons (never days of chores) with the five-year skip, where
// the year-five 大比 is won and the sect's 一转 comes into the bag, 瞿老's last disciple, and the
// Foundation laid on the cliff with the 九转 reached for before the sect's 一转. The cliff ends it
// straight into 古八.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, oddsOf, resolve, rollOf } from '../scripts/rules.mjs';
import { bookNo } from './book-num.mjs';

const content = loadContent();
const NOW = new Date('2026-09-30T12:00:00');
const ctx = { now: NOW, quests: [] };
const CH = content.chapters['00-zhuji'];

/* Standing at 古九's first scene: 外门 behind him, 练气五层, full 体力. */
const atSnow = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-snow', place: 'chaifang',
  ended: ['00-prologue', '00-waimen'], tier: 'qi', step: 4, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'],
  stamina: 100, stamina_at: NOW.toISOString(), bag: { danlu: 1 }, ...extra,
});
const go = (s, exit, extra = {}) => {
  const r = resolve(s, content, ctx, { exit, ...extra });
  assert.equal(r.result.ok, true, `${exit} at ${s.scene}: ${JSON.stringify(r.result)}`);
  return r;
};
const buttons = s => look(s, content, ctx).scene.buttons.map(b => b.id);
const full = s => ({ ...s, stamina: 100, stamina_at: NOW.toISOString() });

test('古九 is its own chapter at 沉鼎观: between 外门 and 冀, the Foundation\'s gate, every scene reached', () => {
  assert.deepEqual([CH.province, CH.gate, CH.first_scene, CH.coming], ['徐', 1, 'j07-ankle', undefined], '今 · 三 first, then 09-snow (2026-10-05)');
  for (const sc of Object.values(CH.scenes)) {
    assert.ok(['h09', 'j07'].includes(sc.hui), sc.id);
    assert.ok(sc.hui === 'j07' ? !sc.at : CH.map.places.includes(sc.at), `${sc.id} stands on the mountain (今 · 三 on none)`);
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

test('the winter and the year: the one 九转 on the snow night, the furnace\'s culls, and the seasons — the story\'s own, free of 体力 (Hanli, 2026-10-01), in order, once', () => {
  let s = atSnow();
  assert.deepEqual(buttons(s), ['feed'], 'the gourd and the shards into the 饭桶 — nothing else');
  s = go(s, 'feed').state;
  assert.equal(s.scene, '09-furnace');
  assert.equal(s.bag['pichai-jian'], 1, 'a plain sword');
  assert.equal(s.bag['foundation-pill-9'], undefined, 'the 九转 is not shown before the eve of 筑基 (Hanli 2026-10-06)');
  assert.equal(s.bag['foundation-pill'], undefined, 'no 官丹 yet: 祁长松 has the sect\'s one');
  s = go(s, 'fire').state;
  assert.equal(s.bag['foundation-pill-9'], undefined, 'the furnace gives qi pills, not a 九转');
  assert.equal(s.scene, '09-year');
  s = full({ ...s, place: 'yaoyuan' });
  // Only the season due is offered; one out of order is refused.
  assert.deepEqual(buttons(s), ['qingming']);
  assert.equal(resolve(s, content, ctx, { exit: 'futian' }).result.refused, 'needs');
  assert.equal(resolve(s, content, ctx, { exit: 'duanwu' }).result.refused, 'unknown-exit', 'no 端午 验封: cut from the book (2026-10-03)');
  // The seasons are the main story, not optional practice (主线, Hanli 2026-10-01):
  // no season asks 体力 of its own — not even on an empty pool.
  assert.ok(CH.scenes['09-year'].exits.every(e => e.stamina == null), 'no season carries a toil price');
  const layers = [];
  s = { ...s, stamina: 0, resting: true };
  for (const exit of ['qingming', 'futian']) {
    const r = go(s, exit);
    assert.equal(r.state.scene, '09-year', `${exit} stays`);
    assert.equal(r.state.stamina, 0, `${exit}: a season costs no 体力`);
    assert.ok(!buttons(r.state).includes(exit), `${exit} is not offered again`);
    s = r.state; layers.push(s.step + 1);
    if (exit === 'qingming') assert.equal(s.bag['foundation-pill'], undefined, 'not yet: the 官丹 waits for the year-five 大比');
  }
  assert.deepEqual(layers, [5, 9], '清明仍是五层 · 伏天一晃五年，九层');
  assert.equal(s.bag['foundation-pill'], 1, 'the skip carries the year-five 大比: the sect\'s 一转 is his, resealed into 饭桶');
  // 入秋 moves the story on (`next`): a story step's 3, like every scene's step.
  assert.equal(resolve(s, content, ctx, { exit: 'ruqiu' }).result.refused, 'no-stamina', 'a spent pool still waits on the step');
  const autumn = go(full(s), 'ruqiu').state;
  assert.equal(100 - autumn.stamina, content.rewards.stamina.cost.step, '入秋: one story step');
  assert.equal(autumn.step, 8, '九层');
  assert.equal(autumn.progress, threshold(content, autumn), '圆满: the lake full');
  assert.equal(autumn.scene, '09-qulao');
});

test('the cliff: 瞿老\'s last disciple, then the throw — the 九转 reached for before the 一转, and 古十 opens at once', () => {
  let s = { ...atSnow(), scene: '09-qulao', place: 'houshan', step: 8, progress: 130, bag: { 'foundation-pill': 1 } };
  s = go(s, 'listen').state;
  assert.equal(s.scene, '09-cliff');
  assert.equal(s.bag['foundation-pill-9'], 1, 'the 九转 comes out on the eve of 筑基');
  const odds = oddsOf(content, s, NOW, 'foundation');
  const pill = odds.parts.find(p => p.id === 'pill');
  assert.equal(pill.item.id, 'foundation-pill-9');
  assert.equal(pill.n, content.ladder.breakthrough.pill.by_zhuan[9], 'the 九转 weighs by its 转');
  // the try whose die lands
  let t = s;
  for (let k = 0; rollOf(t, 'foundation') >= odds.chance; k += 1) t = { ...s, breakthrough: { tries: { foundation: k + 1 } } };
  const r = go(t, 'take');
  assert.equal(r.result.breakthrough.success, true);
  assert.deepEqual(r.result.breakthrough.pill, { id: 'foundation-pill-9', name: '九转筑基丹' });
  assert.equal(r.state.bag['foundation-pill'], 1, 'the 官丹 stays sealed in 饭桶');
  assert.equal(r.state.bag['foundation-pill-9'], undefined, 'the 九转 is eaten');
  assert.equal(r.state.tier, 'foundation');
  assert.deepEqual([r.state.chapter, r.state.scene], ['01-ji', 'j09-noise'], '今 · 四 first (2026-10-05)');
  // 古九's 「完」 (the book's number) stands on the next 回's first scene — 今 · 四's — with what he did and the teaser.
  const close = look({ ...r.state, place: 'zhangnan' }, content, ctx).chapter.close;
  assert.equal(close.title, `${bookNo(content, 'h09')} · 完`);
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

test('one runner for both set pieces: 筑基天象 is painted like 漳水立起 (setpieces/zhuji.js builds on painted.js), and the page plays a node\'s piece', async () => {
  const fs = await import('node:fs');
  const zhuji = await import('../scripts/setpieces/zhuji.js');
  const zhang = await import('../scripts/setpieces/zhang.js');
  for (const def of [zhuji, zhang]) {
    assert.equal(typeof def.build, 'function');
    assert.equal(typeof def.stillSvg, 'function');
    assert.equal(def.play, undefined, 'no piece brings its own player');
  }
  assert.deepEqual(zhuji.BEATS.map(b => b.id), ['gather', 'light', 'tai', 'door', 'zhu', 'stars', 'settle']);
  for (const f of ['zhuji', 'zhang']) assert.match(fs.readFileSync(new URL(`../scripts/setpieces/${f}.js`, import.meta.url), 'utf8'), /from '\.\/painted\.js'/);
  const runner = fs.readFileSync(new URL('../scripts/setpiece.js', import.meta.url), 'utf8');
  assert.match(runner, /scene = def\.build\(/);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /const piece = setpieceOf\(n\);\s*if \(piece\) momentTurn\('piece'\)\.then\(\(\) => playPiece\(piece, setpieceBeats\(n\)\)\);/);
  assert.match(page, /await momentTurn\('memory'\);\s*if \(play\) show\(\{ memory/, 'her memory waits its turn (queue.js MOMENTS: after the piece)');
  assert.match(page, /await momentTurn\('homing'/, '鼎归 waits its turn');
});

test('the sect\'s 筑基丹 comes from the five-year skip, not from 古六: 09-year\'s 伏天 grants it, nothing before (2026-10-03)', () => {
  const fu = CH.scenes['09-year'].exits.find(e => e.id === 'futian');
  assert.equal(fu.grant?.item, 'foundation-pill', '伏天 · 一晃五年 grants the sect\'s pill');
  assert.match(fu.story.zh, /第五年腊八[\s\S]*写了「沈小满」三个字[\s\S]*米汤/, 'the year-five 大比 won plainly, the seal glued back with rice water');
  assert.match(fu.story.zh, /祁长松转过年开春出了关。[\s\S]*还是一个九层[\s\S]*「身子记下了。下回。」[\s\S]*第二回闭关，这一回，筑了基/, '祁长松 fails his first 筑基 the spring after 古六 and lays it on the second (Hanli 2026-10-06: a failed attempt is experience)');
  const grants = Object.values(CH.scenes).flatMap(sc => sc.exits.filter(e => e.grant?.item === 'foundation-pill').map(e => `${sc.id}/${e.id}`));
  assert.deepEqual(grants, ['09-year/futian']);
  for (const sc of Object.values(content.chapters['00-waimen'].scenes)) for (const e of sc.exits) assert.notEqual(e.grant?.item, 'foundation-pill', `${sc.id}/${e.id}`);
  assert.doesNotMatch(JSON.stringify(CH.scenes), /验封|戒律堂|草木灰|当众/);
  let s = full({ ...atSnow(), scene: '09-year', place: 'yaoyuan', marks: ['y-qingming'] });
  assert.equal(s.bag['foundation-pill'], undefined);
  s = go(s, 'futian').state;
  assert.equal(s.bag['foundation-pill'], 1);
  assert.equal(s.step, 8, '九层');
});
