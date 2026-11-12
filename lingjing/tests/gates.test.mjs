// 阶段任务 — the 修为 stage quest (Hanli, 2026-10-15; rules/gates.mjs, ladder.json caps.hui.<回>.gates):
// each 回's next story stage waits on 圆满 of the layer he holds. Refused `stage` in the world's
// words until the bar is full; the 事 book shows it with its progress, 下一步 and Ling point to
// where 修为 is earned; a scene already passed is never gated again. Declared, never named in code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, move, playTo, resolve, targetOf } from '../scripts/rules.mjs';
import { health } from '../scripts/rules/health.mjs';
import { sealedOf } from '../scripts/rules/world.mjs';
import { gatesOf, settleStages, stageGate, stageNow } from '../scripts/rules/gates.mjs';
import { settleHeld } from '../scripts/rules/cap.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { WORDS, bookPopHtml, panelActsHtml } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0'; // as the game plays (体力 off while we test), and tests/seed-at.test.mjs
const content = loadContent();
const NOW = new Date('2026-10-16T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const th = content.ladder.tiers[0].thresholds;
/* 古四's 柴房 night: the beat that ends in 第一路's rise to 二层 waits on 一层圆满 (its entry: he can walk away to earn it). */
const atChaifang = (progress, extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
  done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-yaoyuan'], tier: 'qi', step: 1, progress, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), ...extra });

test('every 回 past 古三 holds one (古九 aside); 古七\'s four as the book\'s layers come, 古八\'s three, a year each (年六 七层, 年七 八层 before the 腊月, 入秋 九层; 2026-10-28) — the data, linted', () => {
  const by = {};
  for (const g of gatesOf(content)) (by[g.hui] ??= []).push(`${g.scene}@${g.layer}`);
  assert.deepEqual(by, {
    // 古五: the 石室's 三层圆满 (wm-kaikai); the 秘境's door (二层圆满) and the 石室's 四层圆满 (wm-xiqi) dropped 2026-11-03 (Hanli:
    // 「可以, 两件一起做」) — 二层 stops at a share through the rooms, 四层 is entered in the 石室 and fills toward 定风. 古六's eve on
    // 三层圆满 again (a catch-up for a save that came through the 石室 before its gates: 四层 for 褚先生's 「四层」).
    // 古四's 一层 and 古七's 五层 · 六层 in three stretches since 2026-11-10 (shares; a proposal for Hanli — tests/pacing.test.mjs pins them).
    h05: ['wm-dianmao@1', 'wm-zhishi@1', 'wm-chaifang@1'], h07: ['wm-kaikai@3'], h08: ['wm-qianye@3'],
    // 古七: 定风 is the 五层 the book tells (「那天早上……他过了五层」) — 09-year's 伏天 asks nothing since 2026-11-03 (it held 五层 two scenes past it)
    h11: ['09-furnace@4', '09-danfang@5', '09-year@5', '09-yishui@5', '09-xie@6', '09-nianyao@6', '09-futian@6'], h09: ['09-shenshi@7', '09-dingfeng@8', '09-qulao@9'], // 入秋's 九层圆满 at 瞿老's door (09-qulao) since 2026-11-03
  });
  assert.equal(content.ladder.caps.hui.h11.layer, 6, '古七 grinds to 六层 (its rises come behind its gates)');
  // Nothing in the rules names a 回 or a scene of them.
  const code = fs.readFileSync(new URL('../scripts/rules/gates.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /wm-|09-|'h\d\d'/);
});

test('the 柴房 night waits on 一层圆满: refused in the world\'s words with where he stands, then open once the bar is full', () => {
  const short = resolve(atChaifang(th[1] - 30), content, ctx, { exit: 'count' });
  // Standing at the scene that waits, the 事 row still points to where 修为 is earned.
  const here = look(atChaifang(th[1] - 30), content, ctx).stage_quest;
  assert.ok(here.work?.place?.id && !here.work.here, JSON.stringify(here.work));
  assert.equal(short.result.refused, 'stage');
  assert.match(short.result.say, /阶段任务.*练气一层圆满/);
  assert.deepEqual(short.result.stage.now, { step: '练气一层', progress: th[1] - 30, of: th[1] });
  assert.equal(short.result.stage.met, false);
  const full = resolve(atChaifang(th[1]), content, ctx, { exit: 'count' });
  assert.equal(full.result.ok, true, JSON.stringify(full.result));
  assert.equal(full.state.scene, 'wm-tonglu'); // the gift's night, cut from wm-danlu (the reading gaps, 2026-10-31)
  assert.match(resolve({ ...atChaifang(0), lang: 'en' }, content, ctx, { exit: 'count' }).result.say, /Stage quest.*Layer 1, Consummation/);
});

// A share of the layer (Hanli 2026-11-10: 「可以是剧情-游戏-剧情-游戏-剧情-游戏到圆满-剧情突破」): 点卯's way on waits on 一层四成.
const atDianmao = (progress, extra = {}) => atChaifang(progress, { scene: 'wm-dianmao', place: 'jiangtang', done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi'],
  tasks: Object.fromEntries((content.chapters['00-waimen'].scenes['wm-dianmao'].show ?? []).filter(c => c.card === 'board').map(c => [c.id, { status: 'done' }])), ...extra });
test('a share gate: refused at the layer\'s share in the world\'s words (练气一层四成), open at its mark; met, nothing to hand in — the next gate stands, and no back pay', () => {
  const mark = Math.floor(0.4 * th[1]);
  const short = resolve(atDianmao(mark - 1), content, ctx, { exit: 'on' });
  assert.equal(short.result.refused, 'stage', JSON.stringify(short.result).slice(0, 300));
  assert.match(short.result.say, /^阶段任务：先修炼到练气一层四成。/);
  assert.deepEqual(short.result.stage.now, { step: '练气一层', progress: mark - 1, of: mark }, 'where he stands, toward the mark');
  assert.match(resolve({ ...atDianmao(0), lang: 'en' }, content, ctx, { exit: 'on' }).result.say, /Stage quest: first cultivate to Qi Condensation · Layer 1 at 40%\./);
  assert.equal(stageNow(content, atDianmao(0)).step, '练气一层四成');
  const open = resolve(atDianmao(mark), content, ctx, { exit: 'on' });
  assert.equal(open.result.ok, true, JSON.stringify(open.result).slice(0, 300));
  assert.equal(open.state.scene, 'wm-zhishi');
  // Met, it is open: the 事 row is the next gate's (执事房's 七成), never a 交差 for 四成; no 灵石 paid for it, now or later.
  assert.equal(stageNow(content, atDianmao(mark)).step, '练气一层七成');
  assert.equal(settleStages(content, { ...open.state, scene: 'wm-tonglu', done_scenes: [...open.state.done_scenes, 'wm-zhishi', 'wm-yaoyuan'] }, NOW).stages?.some(k => k.startsWith('wm-dianmao') || k.startsWith('wm-zhishi')) ?? false, false);
});

test('a scene already passed is never gated again (a save above a new gate keeps its place); one past the layer walks through', () => {
  const passed = atChaifang(0, { done_scenes: [...atChaifang(0).done_scenes, 'wm-chaifang'] });
  assert.equal(stageGate(content, passed, 'wm-chaifang', 'count'), null);
  assert.equal(stageGate(content, atChaifang(0, { step: 2 }), 'wm-chaifang', 'count'), null, 'already 二层');
  assert.ok(stageGate(content, atChaifang(0), 'wm-chaifang', 'count'));
});

test('the 事 book holds it: 阶段任务 · 练气一层圆满, where he stands, and the walk to where 修为 is earned; full, it reads 已圆满', () => {
  const left = move(atChaifang(40), content, ctx, { place: 'houshan' });
  assert.equal(left.result.ok, true, JSON.stringify(left.result).slice(0, 200));
  const away = left.state, l = look(away, content, ctx);
  assert.deepEqual([l.stage_quest.step, l.stage_quest.met, l.stage_quest.now.progress], ['练气一层圆满', false, 40]);
  // Away from the scene, the goal line is the stage quest's (下一步), and the work it points at raises 修为.
  assert.equal(l.waypoint.gate.kind, 'stage');
  const html = bookPopHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } });
  assert.match(html, /阶段任务 · 修炼到练气一层圆满/);
  assert.match(html, /t-stage[^>]*>阶段<[\s\S]*阶段任务 · 练气一层圆满[\s\S]*如今 练气一层 · 40\//);
  const full = look({ ...away, progress: th[1] }, content, ctx);
  assert.equal(full.stage_quest.met, true);
  assert.equal(full.waypoint.gate, undefined, 'full: the road to the story again');
  assert.match(bookPopHtml({ look: full, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } }), new RegExp(`已圆满 · 交差领赏[\\s\\S]*灵石 \\+${full.stage_quest.pays.wealth}[\\s\\S]*data-do="turn" data-id="stage"`)); // its pay: the stage table's minutes × I where he stands (batch 2)
  // Past its scene, the 回 has no stage quest left.
  assert.equal(stageNow(content, { ...away, done_scenes: [...away.done_scenes, 'wm-chaifang'] }), null);
});

test('古七 on the stage quests: the furnace\'s 定风 waits on 四层圆满, the 沂水 night on 五层圆满, the autumn on 六层圆满', () => {
  const at = (scene, step, progress, done = []) => ({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene, place: 'houshan', ended: ['00-prologue', '00-waimen'],
    done_scenes: ['09-snow', '09-jiuge', ...done], tier: 'qi', step, progress, traits: ROOTS });
  assert.equal(stageGate(content, at('09-furnace', 4, 10), '09-furnace', 'fire').layer, 4);
  assert.equal(stageGate(content, at('09-furnace', 4, th[4]), '09-furnace', 'fire'), null);
  assert.equal(stageGate(content, at('09-yishui', 5, 0), '09-yishui', 'night').layer, 5);
  const s = at('09-futian', 6, 10);
  assert.equal(stageGate(content, s, '09-futian', 'spar').layer, 6);
  assert.equal(threshold(content, s), th[6]);
});

/* Every gate's scene reached by a forward run (rules/progress.mjs, boards won), set below its mark. */
const GATED = [...new Set(gatesOf(content).map(g => g.scene))];
const reached = new Map();
playTo(content, newState(content, 'zh', NOW), null, { now: NOW, policy: 'win', targets: GATED.map(id => [id, targetOf(content, id)]), onAt: (label, st, r) => reached.set(label, { s: st, now: r.now }) });
const below = (id) => {
  const { s: st, now } = reached.get(id), g = gatesOf(content).find(x => x.scene === id);
  // Below the gate, it is not handed in yet (the forward run hands a met one in as it walks, rules/progress.mjs handIn).
  const stages = (st.stages ?? []).filter(k => !k.startsWith(`${id}/`));
  return { s: { ...st, place: content.chapters[st.chapter].scenes[id].at, tier: g.tier, step: g.step, progress: 0, stretch: undefined, stamina: 100, stamina_at: now.toISOString(), stages }, now, g };
};

test('every gate stands where he can walk away to earn it, and come back: refused `stage`, healthy, the walk to the pool open, 下一步 on the stage quest', () => {
  assert.equal(reached.size, GATED.length, `reached ${[...reached.keys()]}`);
  for (const id of GATED) {
    const { s: s0, now } = below(id), c = { now, quests: [] };
    const way = gatesOf(content).find(x => x.scene === id).exits[0];
    // A gate whose layer the walk already stands past (a catch-up gate, 古六's eve since 2026-11-03): walked through.
    if (reached.get(id).s.step > s0.step) { assert.equal(stageGate(content, reached.get(id).s, id, way), null, id); continue; }
    // The scene's own board played, its fight won: only the stage quest stands.
    const ex = content.chapters[s0.chapter].scenes[id].exits.find(e => e.id === way);
    const st = { ...s0, tasks: { ...s0.tasks, ...(ex.needs?.task ? { [ex.needs.task]: { status: 'done' } } : {}) }, marks: [...(s0.marks ?? []), ...(ex.needs?.mark ? [ex.needs.mark] : [])], wins: { ...s0.wins, ...(ex.game ? { [ex.game.id]: now.toISOString() } : {}) } };
    assert.equal(resolve(st, content, c, { exit: way }).result.refused, 'stage', id);
    assert.deepEqual(health(content, st, now).filter(p => p.level === 'error'), [], `${id}: healthy while it waits`);
    // To the pool (后山崖顶), or — the scene standing there — to 外门 and the work it points at. Inside a sealed instance (古五's
    // 石室, 2026-10-31) the walk is to another of its rooms: the work is the room's own practice boards.
    const sealed = sealedOf(content, st);
    if (sealed) assert.ok(look(st, content, c).tasks.some(t => t.practice && (t.pays?.progress ?? 0) > 0), `${id}: a practice board here pays 修为`);
    const away = sealed ? sealed.places.find(p => p !== content.chapters[st.chapter].scenes[id].at) : content.chapters[st.chapter].scenes[id].at === 'houshan' ? 'waimen' : 'houshan';
    const out = move(st, content, c, { place: away });
    assert.equal(out.result.ok, true, `${id}: ${JSON.stringify(out.result).slice(0, 200)}`);
    const l = look(out.state, content, c);
    assert.equal(l.waypoint?.gate?.kind, 'stage', `${id}: 下一步 reads the stage quest`);
    assert.equal(l.stage_quest.scene, id);
    const back = move(out.state, content, c, { place: content.chapters[st.chapter].scenes[id].at });
    assert.equal(back.result.ok, true, `${id}: back to it`);
    assert.equal(back.state.scene, id, `${id}: the scene still stands`);
  }
});


test('古七\'s cap follows its stage quests (2026-10-16): grinding stops at the layer the next one asks, and the way on lifts nothing — the next layer is ground', () => {
  const T = content.rewards.tables;
  const at = (done, step, progress) => ({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'],
    done_scenes: ['09-snow', '09-jiuge', ...done], tier: 'qi', step, progress, traits: ROOTS });
  const grind = s => { for (let k = 0; k < 400; k += 1) pay(content, s, { now: new Date(NOW.getTime() + k * 86_400_000), quests: [] }, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth }); return s; };
  // Before 定风: 四层, full, and no further — the furnace's rise still carries him to 五层.
  const snow = grind(at([], 4, 0));
  assert.deepEqual([snow.step, snow.progress], [4, th[4]]);
  // Past 定风, before 沂水: 五层 to 0.7 until 09-fangshi (the share hold, 2026-11-03: 圆满 near 沂水), then full, never 六层.
  const year = grind(at(['09-furnace', '09-year', '09-lingcao'], 5, 0));
  assert.deepEqual([year.step, year.progress], [5, Math.floor(0.7 * th[5])]);
  const fang = grind(at(['09-furnace', '09-year', '09-lingcao', '09-fangshi'], 5, 0));
  assert.deepEqual([fang.step, fang.progress], [5, th[5]]);
  // Past 沂水: 六层 (0.7 until 09-nianyao) — the autumn's 七层 is the story's.
  const xie = grind(at(['09-furnace', '09-year', '09-lingcao', '09-yishui', '09-xie'], 6, 0));
  assert.deepEqual([xie.step, xie.progress], [6, Math.floor(0.7 * th[6])]);
  const nian = grind(at(['09-furnace', '09-year', '09-lingcao', '09-yishui', '09-xie', '09-nianyao'], 6, 0));
  assert.deepEqual([nian.step, nian.progress], [6, th[6]]);
  // 定风 lifts nothing by itself (no story rise since 2026-10-16: 「不要直接跳层」) — but its gate passed, the 四层 he ground full
  // steps the moment the next 修为 comes, or on load (rules/cap.mjs settleHeld); 09-year's 伏天 holds nothing (2026-11-03).
  const fire = resolve({ ...snow, scene: '09-furnace', place: content.chapters['00-zhuji'].scenes['09-furnace'].at, tasks: { 'furnace-ding': { status: 'done' } }, stamina: 100, stamina_at: NOW.toISOString() }, content, ctx, { exit: 'fire' });
  assert.equal(fire.result.ok, true, JSON.stringify(fire.result).slice(0, 200));
  // The way on's own 修为 lands where it walks to (core.mjs pay `landing`, 2026-11-12): 定风's gate behind him, the full 四层 steps.
  assert.equal(fire.state.step, 5, 'his full 四层 steps on the way on\'s own 修为 — no rise of the story\'s');
  assert.equal(grind({ ...fire.state, scene: null, place: 'houshan' }).step, 5, 'ground on 五层 right past 定风, the year not walked yet');
  // A 四层 already full when 定风 is walked steps on load — never a free rise: one short of 圆满 stays 四层.
  const past = { ...fire.state, scene: '09-danfang', place: content.chapters['00-zhuji'].scenes['09-danfang'].at, step: 4, stretch: undefined, progress: th[4] + 80 };
  const settled = settleHeld(content, past);
  assert.deepEqual([settled.step, settled.progress > 0], [5, true], '定风 behind him and 四层 full: 五层 on load');
  assert.equal(settleHeld(content, { ...past, progress: th[4] - 1 }).step, 4, 'short of 圆满: no step');
});

test('a refusal stands where the eye is: over the choices it answers, in the box and on the scene card (2026-10-16: under them it fell below a phone\'s fold)', () => {
  const st = atChaifang(40), l = look(st, content, ctx);
  const say = resolve(st, content, ctx, { exit: 'count' }).result.say;
  for (const inBox of [true, false]) {
    const html = panelActsHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石' }, panelNote: say }, { inBox });
    assert.ok(html.indexOf('donote') >= 0 && html.indexOf('donote') < html.indexOf('paneltaps'), `${inBox ? 'box' : 'card'}: the note before the choices`);
  }
  // The page brings any new refusal note into view (lingjing.js noteInView, after every draw).
  assert.match(fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8'), /noteInView\(\);\n\}/);
});
