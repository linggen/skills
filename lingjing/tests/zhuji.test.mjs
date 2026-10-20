// 古七 · 古八 · 筑基 (chapter 00-zhuji, his 2026-09-30: 照这样重做冀州; one 回 until Hanli split it in two,
// 2026-10-07 — 古七 h11 is 09-snow · 09-jiuge · 09-furnace · 09-year · 09-lingcao · 09-yishui · 09-xie · 09-futian since the
// 2026-10-15 split, 古八 h09 is 09-dabi · 09-qulao · 09-cliff) — the book's winter, the
// year and the cliff, played at 沉鼎观 before the road north: 火柴 from the 饭桶 (the
// 九转 is not shown until the eve of 筑基, Hanli 2026-10-06 — no 官丹 yet: 古六's final was lost, 2026-10-03), the furnace's
// culls, the year as the book's seasons (never days of chores) with the five-year skip, where
// the year-five 大比 is won and the sect's 一转 comes into the bag, 瞿老's last disciple, and the
// Foundation laid on the cliff with the 九转 reached for before the sect's 一转. The cliff ends it
// straight into 古九 (after 今 · 四).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, oddsOf, resolve, rollOf } from '../scripts/rules.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { bookNo } from './book-num.mjs';
import { earnedFor } from './earn.mjs';

const content = loadContent();
// 练气九层圆满: the peak a throw is tried from (the threshold, re-derived 2026-10-15).
const PEAK = content.ladder.tiers[0].thresholds.at(-1);
const NOW = new Date('2026-09-30T12:00:00');
const ctx = { now: NOW, quests: [] };
const CH = content.chapters['00-zhuji'];

/* Standing at 古九's first scene: 外门 behind him, 练气五层, full 体力. */
const atSnow = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-snow', place: 'chaifang',
  ended: ['00-prologue', '00-waimen'], tier: 'qi', step: 5, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'],
  stamina: 100, stamina_at: NOW.toISOString(), bag: { danlu: 1 }, tasks: { 'snow-fantong': { status: 'done' } }, ...extra, // 喂饭桶 played (tests/gu7.test.mjs)
});
const go = (s, exit, extra = {}) => {
  const r = resolve(earnedFor(content, s, exit), content, ctx, { exit, ...extra });
  assert.equal(r.result.ok, true, `${exit} at ${s.scene}: ${JSON.stringify(r.result)}`);
  return r;
};
const buttons = s => look(s, content, ctx).scene.buttons.map(b => b.id);
const full = s => ({ ...s, stamina: 100, stamina_at: NOW.toISOString() });

test('古九 is its own chapter at 沉鼎观: between 外门 and 冀, the Foundation\'s gate, every scene reached', () => {
  assert.deepEqual([CH.province, CH.gate, CH.first_scene, CH.coming], ['徐', 1, 'j07-ankle', undefined], '今 · 三 first, then 09-snow (2026-10-05)');
  for (const sc of Object.values(CH.scenes)) {
    assert.ok(['h11', 'h09', 'j07'].includes(sc.hui), sc.id);
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
  // Each scene names the 回 whose text it plays (2026-10-07 split): the first half to 阿禾's 「亲传，不算外门」, then 年六 on.
  const huiOfScene = Object.fromEntries(Object.values(CH.scenes).filter(sc => sc.hui !== 'j07').map(sc => [sc.id, sc.hui]));
  // 古七's five years played since the 2026-10-15 split (tests/gu7.test.mjs): nine scenes, then 古八's.
  assert.deepEqual(huiOfScene, { '09-snow': 'h11', '09-jiuge': 'h11', '09-furnace': 'h11', '09-year': 'h11', '09-lingcao': 'h11', '09-yishui': 'h11', '09-xie': 'h11', '09-futian': 'h11', '09-dabi': 'h09', '09-qulao': 'h09', '09-cliff': 'h09' });
});

test('the winter and the years: 火柴 at the move, the furnace\'s culls, the seasons and the five years — the story\'s own, free of 体力 but a story step (Hanli, 2026-10-01), in order, once; the layers one at a time (2026-10-15)', () => {
  // Every 古七 board counted and its two fights won (tests/gu7.test.mjs plays them): the ways on are the story's.
  const H11 = ['snow-fantong', 'jiuge-yubu', 'furnace-recipe', 'furnace-ding', 'year-smell', 'yishui-reed'];
  const placed = (s) => full({ ...s, place: CH.scenes[s.scene]?.at ?? s.place });
  let s = { ...atSnow({ step: 4 }), tasks: Object.fromEntries(H11.map(id => [id, { status: 'done' }])), wins: { 'lingcao-qiuyu': NOW.toISOString(), 'futian-qinyan': NOW.toISOString() } };
  assert.deepEqual(buttons(s), ['feed'], 'the gourd and the shards tossed into the 饭桶 to be rid of them — nothing asked (Hanli 2026-10-06)');
  s = go(s, 'feed').state;
  assert.equal(s.scene, '09-jiuge');
  assert.equal(s.bag['huochai-jian'], 1, 'a plain sword, 火柴, at the move into the 内门 the day after the 大比 (renamed from 劈柴, Hanli 2026-10-06)');
  assert.equal(s.bag['foundation-pill-9'], undefined, 'the 九转 is not shown before the eve of 筑基 (Hanli 2026-10-06)');
  assert.equal(s.bag['foundation-pill'], undefined, 'no 官丹 yet: 祁长松 has the sect\'s one');
  s = go(placed(s), 'down').state;
  assert.equal(s.scene, '09-furnace');
  assert.equal(s.step, 4, '腊月: still 四层');
  s = go(placed(s), 'fire').state;
  assert.equal(s.bag['foundation-pill-9'], undefined, 'the furnace gives qi pills, not a 九转');
  assert.equal(s.scene, '09-year');
  assert.equal(s.step, 4, '定风 lifts no layer (2026-10-16): 五层 is ground behind the next gate');
  s = placed(s);
  // Only the season due is offered; one out of order is refused.
  assert.deepEqual(buttons(s), ['qingming']);
  assert.equal(resolve(s, content, ctx, { exit: 'futian' }).result.refused, 'needs');
  assert.equal(resolve(s, content, ctx, { exit: 'duanwu' }).result.refused, 'unknown-exit', 'no 端午 验封: cut from the book (2026-10-03)');
  // The seasons are the main story, not optional practice (主线, Hanli 2026-10-01):
  // no season asks 体力 of its own — not even on an empty pool.
  for (const id of ['09-year', '09-lingcao', '09-yishui', '09-xie', '09-futian', '09-dabi']) assert.ok(CH.scenes[id].exits.every(e => e.stamina == null), `${id}: no season carries a toil price`);
  s = go({ ...s, stamina: 0, resting: true }, 'qingming').state;
  assert.equal(s.stamina, 0, '清明 costs no 体力');
  assert.ok(!buttons(s).includes('qingming'), '清明 is not offered again');
  assert.equal(resolve(s, content, ctx, { exit: 'futian' }).result.refused, 'no-stamina', '伏天 moves the story on: a spent pool waits on the step');
  const layers = [];
  for (const [exit, at] of [['futian', '09-lingcao'], ['fight', '09-yishui'], ['night', '09-xie'], ['go', '09-futian'], ['spar', '09-dabi']]) {
    const r = go(placed(s), exit);
    assert.equal(r.state.scene, at, `${exit} → ${at}`);
    s = r.state; layers.push(s.step);
    assert.equal(s.bag['foundation-pill'], undefined, 'not yet: the 官丹 waits for the year-five 大比');
  }
  // No story rise (2026-10-16): each layer is his own, earned behind its gate (earnedFor stands in for the routine) —
  // 伏天 四层 · 灵草谷 五层 (what he banked steps him once 伏天 is behind) · 沂水 五层 · the boots 六层 · 秦雁 六层.
  assert.deepEqual(layers, [4, 5, 5, 6, 6]);
  assert.equal(s.bag['shunfeng-liu'], 1, 'the boots, from the 鯥\'s hide');
  assert.deepEqual(buttons(placed(s)), ['dabi'], '古八 opens on its own years; 入秋 waits on them');
  const seven = look(placed(s), content, ctx).chapter.close;
  assert.equal(seven?.title, `${bookNo(content, 'h11')} · 完`, '「第七回 · 完」 stands on 古八\'s first scene');
  // 古七's own words (close.hui.h11, 2026-10-15): its 饭桶 and 禹步, the book's 除夕 for the teaser — not 古八's 筑基.
  assert.match(seven.did, /饭桶[\s\S]*禹步/);
  assert.doesNotMatch(seven.did, /筑了基|腊八/);
  assert.match(seven.teaser, /除夕[\s\S]*筑了基的/);
  assert.equal(resolve(placed(s), content, ctx, { exit: 'ruqiu' }).result.refused, 'needs');
  s = go(placed(s), 'dabi').state;
  assert.equal(s.step, 9, '腊八 waited on 八层圆满, earned; what he banked past it steps him to 九层 once 腊八 is behind him');
  s = { ...s, stamina: 0, resting: true };
  assert.equal(s.bag['foundation-pill'], 1, 'the year-five 大比: the sect\'s 一转 is his, resealed into 饭桶');
  // 入秋 moves the story on (`next`): a story step's 3, like every scene's step.
  assert.equal(resolve(s, content, ctx, { exit: 'ruqiu' }).result.refused, 'stage', '入秋 waits on 九层圆满, earned');
  assert.equal(resolve(earnedFor(content, s, 'ruqiu'), content, ctx, { exit: 'ruqiu' }).result.refused, 'no-stamina', 'a spent pool still waits on the step');
  const autumn = go(full(s), 'ruqiu').state;
  assert.equal(100 - autumn.stamina, content.rewards.stamina.cost.step, '入秋: one story step');
  assert.equal(autumn.step, 9, '九层');
  assert.equal(autumn.progress, threshold(content, autumn), '圆满: the lake full');
  assert.equal(autumn.scene, '09-qulao');
});

test('the cliff: 瞿老\'s last disciple, then the throw — the 九转 reached for before the 一转, and 古十 opens at once', () => {
  let s = { ...atSnow(), scene: '09-qulao', place: 'houshan', step: 9, progress: PEAK, bag: { 'foundation-pill': 1 } };
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
  // The 九转 filled 小成 in one night until 2026-10-16 (Hanli 10-14); since 「不要直接跳层」 no story-given thing fills a step:
  // 筑基小成, and he sits it full himself.
  assert.equal(r.state.step, 0);
  assert.ok(r.state.progress < threshold(content, r.state), '小成, not filled by the pill');
  assert.equal(r.result.breakthrough.full, undefined);
  assert.equal(r.result.breakthrough.to, '筑基小成', 'Ling hears it as it stands');
  assert.equal(look(r.state, content, ctx).tier.name, '筑基小成');
  assert.deepEqual([r.state.chapter, r.state.scene], ['01-ji', 'j09-noise'], '今 · 四 first (2026-10-05)');
  // 古九's 「完」 (the book's number) stands on the next 回's first scene — 今 · 四's — with what he did and the teaser.
  const close = look({ ...r.state, place: 'zhangnan' }, content, ctx).chapter.close;
  assert.equal(close.title, `${bookNo(content, 'h09')} · 完`);
  assert.match(close.did, /崖顶筑了基/);
  assert.doesNotMatch(close.did, /饭桶|火柴/, '「第八回 · 完」 opens on 古八\'s own years, not 古七\'s 饭桶 (2026-10-15)');
  assert.match(close.teaser, /邺城[\s\S]*豆腐/);
});

test('no pill fills a step (2026-10-16): the 九转 and the sect\'s 一转 both land 筑基小成; he grinds it full, and 中成 stays shut by the 回\'s cap', () => {
  assert.equal(content.items.items.find(i => i.id === 'foundation-pill-9').fill, undefined);
  assert.equal(content.items.items.find(i => i.id === 'foundation-pill').fill, undefined);
  assert.equal(CH.scenes['09-cliff'].exits.find(e => e.id === 'take').fill, undefined, 'the exit declares nothing: the pill eaten decides');
  const win = s => {
    const chance = oddsOf(content, s, NOW, 'foundation').chance;
    let t = s;
    for (let k = 0; rollOf(t, 'foundation') >= chance; k += 1) t = { ...s, breakthrough: { tries: { foundation: k + 1 } } };
    return go(t, 'take');
  };
  const cliff = bag => ({ ...atSnow(), scene: '09-cliff', place: 'houshan', step: 9, progress: PEAK, bag });
  // The 一转 alone (no 九转 in the bag): plain 筑基小成, 修为 0 — the cliff's own grant is all that goes in.
  const plain = win(cliff({ 'foundation-pill': 1 }));
  assert.equal(plain.result.breakthrough.pill.id, 'foundation-pill');
  assert.equal(plain.result.breakthrough.full, undefined);
  assert.equal(plain.result.breakthrough.to, '筑基小成');
  assert.equal(plain.state.step, 0);
  assert.ok(plain.state.progress < threshold(content, plain.state), '小成, not filled');
  assert.equal(look(plain.state, content, ctx).tier.name, '筑基小成');
  // The 九转: 小成 too, ground full — and no work carries it on to 中成; 古九 (卷一's end) stops at 筑基小成.
  const nine = win(cliff({ 'foundation-pill-9': 1, 'foundation-pill': 1 }));
  assert.deepEqual([nine.result.breakthrough.pill.id, nine.result.breakthrough.to], ['foundation-pill-9', '筑基小成']);
  const filled = nine.state;
  for (const s of [filled, { ...filled, chapter: '01-ji', scene: null, place: 'zhangyuan', ended: [...filled.ended, '01-ji'], done_scenes: Object.keys(content.chapters['01-ji'].scenes) }]) {
    let got = 0, last = null;
    for (let i = 0; i < 50; i += 1) { last = pay(content, s, ctx, { table: 'seclusion', progress: 90 }); got += last.progress; }
    assert.ok(got > 0 && s.step === 0 && s.tier === 'foundation', 'it counts on past the mark (2026-10-15), and still no 中成');
    assert.equal(last.hold?.cap, true, 'the cap keeps 中成 shut');
    assert.ok(s.progress > threshold(content, s), 'the bar shows it past the mark');
    assert.equal(look(s, content, ctx).tier.name, '筑基小成圆满');
  }
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
  const cliff = { ...atSnow(), scene: '09-cliff', place: 'houshan', step: 9, progress: PEAK };
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
  assert.deepEqual(zhuji.BEATS.map(b => b.id), ['door', 'gather', 'light', 'tai', 'zhu', 'stars', 'settle']);
  for (const f of ['zhuji', 'zhang']) assert.match(fs.readFileSync(new URL(`../scripts/setpieces/${f}.js`, import.meta.url), 'utf8'), /from '\.\/painted\.js'/);
  const runner = fs.readFileSync(new URL('../scripts/setpiece.js', import.meta.url), 'utf8');
  assert.match(runner, /scene = def\.build\(/);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /const piece = setpieceOf\(n\);[\s\S]{0,300}?if \(piece\) pieceOfChoice\(piece, setpieceBeats\(n\)\);/);
  assert.match(page, /await momentTurn\('piece'\);\s*playPiece\(piece, beats\);/, 'the piece waits its turn (queue.js MOMENTS: first)');
  assert.match(page, /await momentTurn\('memory'\);\s*if \(play\) show\(\{ memory/, 'her memory waits its turn (queue.js MOMENTS: after the piece)');
  assert.match(page, /await momentTurn\('homing'/, '鼎归 waits its turn');
});

test('the sect\'s 筑基丹 comes from the five-year skip, not from 古六: 古八\'s 腊八 (09-dabi, 伏天\'s second half until the 2026-10-07 split) grants it, nothing before (2026-10-03)', () => {
  const fu = CH.scenes['09-futian'].exits.find(e => e.id === 'spar');
  const dabi = CH.scenes['09-dabi'].exits.find(e => e.id === 'dabi');
  assert.equal(dabi.grant?.item, 'foundation-pill', '腊八 · 再上五行台 grants the sect\'s pill');
  assert.match(dabi.story.zh, /第五年腊八[\s\S]*写了「沈小满」三个字[\s\S]*米汤/, 'the year-five 大比 won plainly, the seal glued back with rice water');
  assert.match(fu.story.zh, /往后殿静室那边看了一眼，没再往下说。\n\n周衡出了正殿[\s\S]*他知道里头是谁。$/, '伏天 ends where 古七 ends (the 观主\'s glance at the quiet room, then 周衡 at the 柴房 door — the book\'s last line, restored 2026-10-15; 「亲传，不算外门」 cut 2026-10-09)');
  assert.match(CH.scenes['09-dabi'].story.zh, /^年六，沈小满十七岁[\s\S]*闵丹师头一回不叫他碾药[\s\S]*九节聚气/, 'and 古八 opens on 年六 (grounding: 火柴, 顺风溜, 丹房), then 闵丹师\'s lesson and the 九节聚气 recipe (the bear tag cut 2026-10-09)');
  assert.match(CH.scenes['09-xie'].story.zh, // 顺风溜 told 2026-10-20: the passage whole
    /祁长松是年三开春出的关。[\s\S]*还是一个九层[\s\S]*「身子记下了，下回再来。」[\s\S]*第二回闭关，这一回，筑了基/, '祁长松 fails his first 筑基 the spring after 古六 and lays it on the second (Hanli 2026-10-06: a failed attempt is experience)');
  const grants = Object.values(CH.scenes).flatMap(sc => sc.exits.filter(e => e.grant?.item === 'foundation-pill').map(e => `${sc.id}/${e.id}`));
  assert.deepEqual(grants, ['09-dabi/dabi']);
  for (const sc of Object.values(content.chapters['00-waimen'].scenes)) for (const e of sc.exits) assert.notEqual(e.grant?.item, 'foundation-pill', `${sc.id}/${e.id}`);
  assert.doesNotMatch(JSON.stringify(CH.scenes), /验封|戒律堂执事|草木灰|当众/); // the cut 端午验封 (2026-10-03); 周衡's 「戒律堂头一个问你」 stays (Hanli 2026-10-14)
  assert.match(CH.scenes['09-furnace'].story.zh, /空着也是空着[\s\S]*戒律堂头一个问你/, 'the 巡夜令 handed back on 正月初一, as 古七 has it');
  let s = full({ ...atSnow({ step: 6 }), scene: '09-futian', place: 'houshan', marks: ['y-qingming', 'y-futian'], wins: { 'futian-qinyan': NOW.toISOString() } });
  assert.equal(s.bag['foundation-pill'], undefined);
  s = go(s, 'spar').state;
  assert.equal(s.bag['foundation-pill'], undefined, 'not in 古七');
  assert.equal(s.step, 6, '六层: 七层 is ground in 古八, not given by the autumn');
  s = go(full(s), 'dabi').state;
  assert.equal(s.bag['foundation-pill'], 1);
  assert.equal(s.step, 9, '九层');
});

test('09-snow 「扔进饭桶」 eats the 赤铜葫芦 if he still holds it, and nothing if he pawned it — never a NaN count', () => {
  const held = go(atSnow({ bag: { danlu: 1, 'chitong-hulu': 1 }, wear: { weapon: 'chitong-hulu' } }), 'feed').state;
  assert.equal(held.bag['chitong-hulu'], undefined, 'the gourd is gone into the 饭桶');
  assert.notEqual(held.wear?.weapon, 'chitong-hulu', 'and off his hand');
  assert.ok(held.bag['huochai-jian'] >= 1, '火柴 out');
  const pawned = go(atSnow(), 'feed').state;
  assert.equal('chitong-hulu' in pawned.bag, false, 'a pawned gourd is not made a count');
  assert.ok(Object.values(pawned.bag).every(n => Number.isFinite(n) && n > 0), JSON.stringify(pawned.bag));
});
