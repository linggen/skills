// 古五's 石室 on 四层圆满 (Hanli 2026-10-28: 「游戏的层数要和剧情匹配」 · 「故事里是4层圆满, 游戏里保持一致」): in the 沉鼎秘境's
// stone chamber the book has 小满 draw the 灵气 up to 四层圆满 (「再吸半天，第五层的门槛也许便摸得着了」), and on the way 「第二天晌午，
// 他冲开了第四层」 — so wm-kaikai's way on waits on 三层圆满 right before that noon, and wm-xiqi's (老蔫's climb and fall, then the
// third dawn) on 四层圆满 right before 「第三天天快亮」. Through the rooms before it (wm-xirang, wm-tama) the book still
// has him at 二层: 古五's cap holds there (`holds`) until the story reaches the 石室's scene. Inside the 秘境 the world outside is
// frozen, so the 修为 is earned in the room: the 石室's own 主力 levels, hosted there as practice. A save that came through the
// 石室 before this (Hanli's, at 古六's eve on 三层) is never pulled back: it stands at the eve, which asks 四层圆满 now, and earns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, migrate, newState, threshold } from '../scripts/state.mjs';
import { look, quest, resolve, task, win } from '../scripts/rules.mjs';
import { capOf, rankOf, settleHeld, underCap } from '../scripts/rules/cap.mjs';
import { gatesOf, settleStages, stageGate, stageNow } from '../scripts/rules/gates.mjs';
import { earnedFor } from './earn.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-31T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const th = content.ladder.tiers[0].thresholds;
const SCENE = content.chapters['00-waimen'].scenes['wm-kaikai'], XIQI = content.chapters['00-waimen'].scenes['wm-xiqi'];
const INSIDE = ['wm-mijing', 'wm-kouzi', 'wm-shiting', 'wm-xiongya', 'wm-wangzuo', 'wm-kunzhen', 'wm-shishi', 'wm-xirang', 'wm-anhe', 'wm-tama'];
const BEFORE = ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-chaifang', 'wm-danlu', 'wm-diyilu', 'wm-xunye', 'wm-duizhang', 'wm-yan', 'wm-baoming'];
const base = extra => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', ended: ['00-prologue'], traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), wealth: 20, ...extra });
/* In the 石室 at wm-kaikai, the 息壤 board won, the bar where `step`/`progress` say. */
const atShishi = (step, progress, extra = {}) => base({ scene: 'wm-kaikai', place: 'mijing-shishi', done_scenes: [...BEFORE, ...INSIDE], tier: 'qi', step, progress,
  tasks: { 'xirang-wumen': { status: 'done', done_at: NOW.toISOString() } }, ...extra });
/* …and on in wm-xiqi, the noon behind him. */
const atXiqi = (step, progress, extra = {}) => atShishi(step, progress, { scene: 'wm-xiqi', done_scenes: [...BEFORE, ...INSIDE, 'wm-kaikai'], ...extra });
const rank = step => rankOf(content, 'qi', step);

test('the data: 古五 reaches 四层, held at 二层 until the 石室; wm-kaikai · sit on 三层圆满, wm-xiqi · draw on 四层圆满, with the room\'s own words; 古六\'s eve on 四层圆满', () => {
  const h07 = content.ladder.caps.hui.h07;
  assert.equal(h07.layer, 4);
  assert.deepEqual(h07.holds, [{ layer: 2, until: 'wm-kaikai' }]);
  const by = gatesOf(content).filter(g => ['h07', 'h08'].includes(g.hui)).map(g => `${g.scene}/${g.exits.join('|')}@${g.layer}`);
  assert.deepEqual(by, ['wm-mijing/pay|refuse@2', 'wm-kaikai/sit@3', 'wm-xiqi/draw@4', 'wm-qianye/eve@4']);
  for (const id of ['wm-kaikai', 'wm-xiqi']) assert.match(gatesOf(content).find(g => g.scene === id).say.zh, /石室/, 'inside, the refusal points at the room, not 功课');
  // The room hosts the work: the 石室's two 主力 levels again, practice boards (hosted, not a stall).
  const room = Object.values(content.places).flatMap(d => d.places).find(p => p.id === 'mijing-shishi');
  assert.deepEqual(room.has.games, ['shishi-lingqi', 'shishi-yinshen']);
  for (const id of room.has.games) {
    const t = content.tasks.tasks.find(x => x.id === id);
    assert.ok(t.hosted && !t.stall && t.kind === 'board' && t.game === 'sadoushou', id);
  }
});

test('the split: wm-kaikai\'s way on opens on 「第二天晌午，他冲开了第四层」; wm-xiqi tells the climb and fall, its way on opens on 「第三天天快亮」 and ends on the doors — word for word', () => {
  const sit = SCENE.exits.find(e => e.id === 'sit');
  assert.ok(SCENE.story_after.zh.endsWith('他没算错，只是算早了半夜。'));
  assert.ok(sit.story.zh.startsWith('第二天晌午，他冲开了第四层。\n\n第二天夜里'));
  assert.ok(sit.story.zh.endsWith('只喊了这一声。'));
  assert.ok(sit.story.en.startsWith('At noon on the second day'));
  assert.equal(sit.next, 'wm-xiqi');
  assert.equal(sit.doors, undefined);
  assert.ok(XIQI.story.zh.startsWith('小满埋在土里，土齐着胸口') && XIQI.story.zh.endsWith('他却觉得冷，冷得牙齿磕着牙齿。'));
  const draw = XIQI.exits.find(e => e.id === 'draw');
  assert.ok(draw.story.zh.startsWith('第三天天快亮，石室里的灵气还厚着。再吸半天，第五层的门槛也许便摸得着了。'));
  assert.ok(draw.story.en.startsWith('Near dawn on the third day'));
  assert.equal(draw.doors.length, 5, 'the five doors still follow the mound cracking open');
  assert.deepEqual([draw.next, draw.grant.item], ['wm-chu', 'xizhu']);
  assert.ok(content.chapters['00-waimen'].beats.find(b => b.sealed).scenes.includes('wm-xiqi'), 'inside the seal');
});

test('through the rooms before the 石室 the bar holds at 二层 (wm-xirang, wm-tama say 二层); at wm-kaikai it may climb to 三层, at wm-xiqi to 四层', () => {
  const tama = atShishi(2, th[2], { scene: 'wm-tama', place: 'mijing-yabi', done_scenes: [...BEFORE, ...INSIDE.slice(0, -1)] });
  assert.equal(capOf(content, tama).grind, rank(2));
  assert.equal(underCap(content, tama, 'qi', 3), false);
  const here = atShishi(2, th[2]);
  assert.equal(capOf(content, here).grind, rank(3), 'at wm-kaikai, 三层 — the noon of the second day waits on it');
  assert.equal(capOf(content, atXiqi(3, th[3])).grind, rank(4), 'at wm-xiqi, 四层');
  // The 修为 counted on past 二层's mark carries him up the moment the story stands in the 石室 (cap.mjs settleHeld).
  const over = settleHeld(content, atShishi(2, th[2] + 100));
  assert.deepEqual([over.step, over.progress], [3, 100]);
});

test('at wm-kaikai short of 三层圆满, at wm-xiqi short of 四层圆满: refused in the room\'s own words; the 石室\'s boards stand as practice and pay 修为; full, the ways on open', () => {
  const short = resolve(atShishi(3, 100), content, ctx, { exit: 'sit' });
  assert.equal(short.result.refused, 'stage', JSON.stringify(short.result).slice(0, 300));
  assert.match(short.result.say, /阶段任务：先修炼到练气三层圆满。石室里的灵气还厚着/);
  const noon = resolve(atShishi(3, th[3]), content, ctx, { exit: 'sit' });
  assert.equal(noon.result.ok, true, JSON.stringify(noon.result).slice(0, 300));
  assert.equal(noon.state.scene, 'wm-xiqi', 'into wm-xiqi: its gate waits there, never at the way in (the room has work)');
  assert.match(resolve(atXiqi(4, 100), content, ctx, { exit: 'draw' }).result.say, /练气四层圆满。石室里的灵气还厚着/);
  const l = look(atShishi(3, 100), content, ctx);
  assert.ok(l.sealed, 'inside the 秘境');
  const practice = (l.tasks ?? []).filter(t => t.practice).map(t => t.id).sort();
  assert.deepEqual(practice, ['shishi-lingqi', 'shishi-yinshen']);
  assert.ok((l.tasks.find(t => t.id === 'shishi-lingqi').pays?.progress ?? 0) > 0, 'a practice play pays 修为 here');
  // Played and won: its 修为 lands on the bar.
  const s = atShishi(3, 100);
  const played = task(win(s, content, ctx, { id: 'shishi-lingqi' }).state ?? s, content, ctx, { action: 'done', id: 'shishi-lingqi' });
  assert.equal(played.result.ok, true, JSON.stringify(played.result).slice(0, 300));
  assert.ok(played.state.progress > 100 || played.state.step > 3, `${played.state.step} · ${played.state.progress}`);
  // 四层圆满: the stage quest handed in where it stands, inside (交差 is the instance's own, rules/sealed.mjs) …
  const turned = quest(atXiqi(4, th[4], { stages: ['wm-kaikai/sit'] }), content, ctx, { id: 'stage', action: 'turn' });
  assert.equal(turned.result.ok, true, JSON.stringify(turned.result).slice(0, 200));
  assert.equal(turned.result.key, 'wm-xiqi/draw');
  // … and through, onto 「第三天天快亮」.
  const full = resolve(atXiqi(4, th[4]), content, ctx, { exit: 'draw' });
  assert.equal(full.result.ok, true, JSON.stringify(full.result).slice(0, 300));
  assert.equal(full.state.scene, 'wm-chu');
});

test('a save already past the 石室 keeps its place: at 古六\'s eve on 三层 168/570 it stays on its layer, the eve asks 四层圆满, and grinding there is open', () => {
  const eve = base({ scene: 'wm-qianye', place: 'waimen', tier: 'qi', step: 3, progress: 168,
    done_scenes: [...BEFORE, ...INSIDE, 'wm-kaikai', 'wm-chu', 'wm-hetan', 'wm-luobo', 'wm-yaban'], stages: ['wm-chaifang/count', 'wm-mijing/pay'], tasks: { 'qianye-qiajue': { status: 'done', done_at: NOW.toISOString() } } });
  const loaded = fitWorld(migrate(structuredClone(eve), content), content);
  assert.deepEqual([loaded.scene, loaded.tier, loaded.step, loaded.progress], ['wm-qianye', 'qi', 3, 168], 'never pulled back, never pushed on');
  assert.equal(settleHeld(content, eve), eve, 'nothing to step');
  assert.equal(settleStages(content, eve, NOW), eve, 'the 石室\'s quest is behind him, short: nothing paid yet');
  const q = stageNow(content, eve);
  assert.equal(q.step, '练气四层圆满');
  assert.equal(q.met, false);
  assert.equal(resolve(eve, content, ctx, { exit: 'eve' }).result.refused, 'stage');
  assert.equal(underCap(content, eve, 'qi', 4), true, '古六 may grind to 四层');
  assert.ok(look(eve, content, ctx).stage_quest?.work?.place, 'and the 事 row points to where 修为 is earned');
  // Earned at the eve: the 石室's quest, behind him, is paid once on the next load (补发) — the eve's is handed in there.
  const done = { ...eve, step: 4, progress: th[4] };
  const back = settleStages(content, done, NOW).stages;
  assert.ok(back.includes('wm-kaikai/sit') && back.includes('wm-xiqi/draw'), 'both 石室 quests, behind him, paid once');
  assert.equal(resolve(earnedFor(content, done, 'eve'), content, ctx, { exit: 'eve' }).result.ok, true);
});

test('a save past the eve is never gated again, at whatever layer it stands', () => {
  const on = base({ scene: 'wm-koujue', place: 'waimen', tier: 'qi', step: 3, progress: 0,
    done_scenes: [...BEFORE, ...INSIDE, 'wm-kaikai', 'wm-chu', 'wm-hetan', 'wm-luobo', 'wm-yaban', 'wm-qianye'] });
  assert.equal(stageGate(content, on, 'wm-qianye', 'eve'), null);
  assert.equal(stageGate(content, on, 'wm-kaikai', 'sit'), null);
  assert.equal(stageGate(content, { ...on, done_scenes: [...on.done_scenes, 'wm-xiqi'] }, 'wm-xiqi', 'draw'), null);
  assert.equal(threshold(content, on) > 0, true);
});
