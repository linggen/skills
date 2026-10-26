// 古六's 讲堂 as 结印's teaching level where a camera is (Hanli 2026-10-21: 「古6教学结手印那里可以做教学关卡」, 结印 in
// 卷一 「放进去」). One task row, two ways to play it: `alt` declares the camera board, the PAGE chooses (caps.js) —
// no camera, the row is played exactly as before (砸寨 · 讲堂试法). Either way the same id, grade, marks, pay, way on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { chooseBoard, fallBack, meets, withCaps } from '../scripts/caps.js';
import { stampShown, stuckNow, STUCK_MS } from '../scripts/stuck.js';
import { skipBoard } from '../scripts/cards.js';
import * as jieyinMod from '../scripts/games/jieyin.js';
import { start, step, starsOf } from '../scripts/games/jieyin/sequence.js';
import { artOf, castOf, levelAsked, swapLabel } from '../scripts/games/jieyin.js';
import { TO_OPEN, walk } from './prologue.mjs';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const NOW = new Date('2026-10-21T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url), 'utf8'));
const row = content.tasks.tasks.find((t) => t.id === 'qianye-qiajue');
const must = (fn, s, args) => {
  const out = fn(fn === resolve ? earnedFor(content, s, args?.exit) : s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
const at = () => ({ ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), stamina: 100, stamina_at: NOW.toISOString(), scene: 'wm-qianye', place: 'waimen', step: 4, progress: 0, done_scenes: ['wm-ahe', 'wm-chu'], tasks: { 'qianye-qiajue': { status: 'offered' } } });
const boardRow = (lang = 'zh') => look({ ...at(), lang }, content, ctx()).look?.tasks?.find((t) => t.id === 'qianye-qiajue')
  ?? look({ ...at(), lang }, content, ctx()).tasks?.find((t) => t.id === 'qianye-qiajue');

test('the row declares one alt: a camera plays 结印 · jiangtang, its grades the row\'s own marks; the lint knows the shape', () => {
  assert.equal(row.game, 'zhazhai');
  assert.equal(row.deal.lv, 'jiangtang');
  assert.equal(row.alt.length, 1);
  const [alt] = row.alt;
  assert.deepEqual(alt.needs, { camera: true });
  assert.equal(alt.game, 'jieyin');
  assert.equal(alt.deal.lv, 'jiangtang');
  assert.deepEqual(alt.deal.grades, row.deal.grades, 'the same stars → the same grade either way');
  assert.ok(alt.title.zh && alt.title.en && alt.how.zh && alt.how.en);
  assert.deepEqual(lint(content), []);
  const bad = (alt2) => lint({ ...content, tasks: { ...content.tasks, tasks: content.tasks.tasks.map((t) => (t.id === row.id ? { ...t, alt: [alt2] } : t)) } });
  assert.ok(bad({ ...alt, needs: { telepathy: true } }).some((p) => /alt needs/.test(p)));
  assert.ok(bad({ ...alt, game: 'nope' }).some((p) => /unknown game/.test(p)));
  assert.ok(bad({ ...alt, deal: { ...alt.deal, grades: { 3: 'perfect' } } }).some((p) => /alt grade/.test(p)));
});

test('Look hands the alt on as data, its words in the reader\'s tongue; the row\'s own game, deal and title are untouched', () => {
  for (const lang of ['zh', 'en']) {
    const t = boardRow(lang);
    assert.ok(t, 'the board is in Look');
    assert.equal(t.game, 'zhazhai');
    assert.equal(t.deal.lv, 'jiangtang');
    assert.equal(t.alt[0].game, 'jieyin');
    assert.equal(t.alt[0].title, row.alt[0].title[lang]);
    assert.equal(t.alt[0].how, row.alt[0].how[lang]);
    assert.deepEqual(t.alt[0].needs, { camera: true });
  }
});

test('camera present → the teaching board (same id); absent → 讲堂试法, identical to today', () => {
  const t = boardRow('zh');
  const cam = chooseBoard(t, { camera: true });
  assert.equal(cam.id, 'qianye-qiajue');
  assert.equal(cam.game, 'jieyin');
  assert.equal(cam.deal.lv, 'jiangtang');
  assert.equal(cam.title, '讲堂 · 一印一印');
  for (const caps of [{}, { camera: false }, null]) assert.equal(chooseBoard(t, caps), t, 'no camera: the very row');
  const lk = { tasks: [t, { id: 'other', game: 'sneeze' }] };
  assert.equal(withCaps(lk, {}).tasks[0], t);
  assert.equal(withCaps(lk, { camera: true }).tasks[0].game, 'jieyin');
  assert.equal(withCaps(lk, { camera: true }).tasks[1], lk.tasks[1]);
  const plain = { tasks: [{ id: 'x', game: 'zhazhai' }] };
  assert.equal(withCaps(plain, { camera: true }), plain, 'nothing declares an alt: Look as it came');
  assert.ok(meets({ camera: true }, { camera: true }) && !meets({ camera: true }, {}) && meets({ camera: false }, {}));
});

test('both win paths reach the same way on and the same pay', () => {
  const after = (stars) => {
    const grade = { zhazhai: row.deal.grades[String(stars)], jieyin: row.alt[0].deal.grades[String(stars)] };
    assert.equal(grade.zhazhai, grade.jieyin, `★${stars}`);
    let s = must(win, at(), { id: row.id, grade: grade.jieyin, stars });
    s = must(task, s, { action: 'done', id: row.id });
    return must(resolve, s, { exit: 'eve' });
  };
  for (const stars of [1, 2, 3]) {
    const s = after(stars);
    assert.equal(s.scene, 'wm-zhaojing');
    assert.ok(s.marks.includes('xiangke'));
    assert.ok(s.marks.includes(row.marks[row.deal.grades[String(stars)]]));
    assert.ok(s.progress > 0, '修为 paid');
  }
});

test('the teaching level: the book\'s seals in the passage\'s order, 褚先生\'s words, then the four at the straw dummy', () => {
  const lv = levelAsked(kit, { lv: 'jiangtang' });
  assert.equal(lv.mode, 'one');
  const book = CH.scenes['wm-qianye'].story.zh;
  // where the lesson names each: 五指张开 · 巳 (index tip) · 午 (middle tip) · 申 (little tip) · 剑诀
  const where = { zhang: '五指张开', si: '到指尖是巳文', wu: '中指尖，午', shen: '小指尖，申', jian: '剑诀' };
  const at2 = lv.sequence.map((id) => book.indexOf(where[id]));
  assert.ok(at2.every((i) => i > 0), 'each seal is named in the lesson');
  assert.deepEqual([...at2].sort((a, b) => a - b), at2, 'in the passage\'s order');
  for (const id of lv.sequence) assert.ok(kit.seals[id].hint.zh && kit.seals[id].hint.en, id);
  const aim = castOf(lv);
  assert.deepEqual(aim.sequence, ['zhang', 'jian', 'shen', 'wu'], 'the 火蛋\'s four, 午文 last');
  assert.equal(aim.forgive, true);
  assert.equal(aim.hits, 1);
  assert.ok(lv.cast.say.zh && lv.cast.say.en);
  assert.match(artOf(lv).bg, /zhazhai\/art\/place-jiangtang\.webp$/);
  assert.match(artOf(lv).foe('hit'), /zhazhai\/art\/dummy\.webp$/);
  for (const f of [lv.art.bg, lv.art.foe]) assert.ok(fs.existsSync(new URL(`../scripts/games/jieyin/${f}`, import.meta.url)), f);
  // a level without art keeps 守墙关's
  assert.match(artOf(kit.levels[0]).foe('walk-1'), /shouqiang\/art\/yezhu-walk-1\.webp$/);
});

/* The seals played on the clock: each held `holdMs`, with a wrong one held `wrongMs` where asked. */
const K = kit.judge;
function play(level, seals) {
  let s = start(level);
  const events = [];
  for (const seal of seals) {
    const ms = seal === 'none' ? K.graceMs + 50 : K.wrongMs + 50;
    for (let t = 0; t < ms; t += 50) {
      const r = step(s, seal === 'none' ? null : seal, 50, K);
      s = r.state;
      events.push(...r.events);
    }
    const r = step(s, null, K.graceMs + 10, K);
    s = r.state;
  }
  return { s, events };
}

test('teaching plays to its end on the right seals, a wrong one only a miss; the cast forgives too — stars from misses', () => {
  const lv = levelAsked(kit, { lv: 'jiangtang' });
  const one = play(lv, [...lv.sequence]);
  assert.equal(one.s.done, true);
  assert.equal(one.s.misses, 0);
  const wrong = play(lv, ['zhang', 'shen', 'si', 'wu', 'shen', 'jian']);
  assert.equal(wrong.s.done, true);
  assert.equal(wrong.s.misses, 1);
  assert.ok(!wrong.events.some((e) => e.type === 'fizzle'), 'no 走火 in teaching');
  // the close: the four in order cast once; a wrong one held is a miss, the seal wanted stays
  const cast = { ...lv.cast, mode: 'sequence' };
  const c = play(cast, ['zhang', 'jian', 'si', 'shen', 'wu']);
  assert.equal(c.s.casts, 1);
  assert.equal(c.s.fizzles, 0);
  assert.equal(c.s.misses, 1);
  assert.deepEqual(c.events.filter((e) => e.type === 'miss').map((e) => e.seal), ['si']);
  assert.equal(starsOf(0 + 0, lv.stars), 3);
  assert.equal(starsOf(wrong.s.misses + c.s.misses, lv.stars), 2);
  assert.equal(starsOf(4, lv.stars), 1);
  // the 火蛋 level itself is unchanged: a wrong seal there is still 走火, back to the first
  const fire = play(kit.levels.find((l) => l.id === 'huodan'), ['zhang', 'jian', 'si']);
  assert.equal(fire.s.fizzles, 1);
});

test('short: the whole teaching board is well under 90 s of holding', () => {
  const lv = levelAsked(kit, { lv: 'jiangtang' });
  const seals = lv.sequence.length + lv.cast.sequence.length;
  assert.ok(seals * K.holdMs < 90_000 / 10, 'holding is seconds; reading the hints is the rest');
});

test('the page chooses: lingjing.js reads Look through caps (probed once, before the first Look), and grades a starred win by the deal', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /probeCaps\(window\)/);
  assert.match(src, /withArcade\(withCaps\(seen, caps\)/);
  assert.match(src, /g\.data\?\.grades\?\.\[String\(result\.stars\)\]/);
  const rules = fs.readdirSync(new URL('../scripts/rules/', import.meta.url)).map((f) => fs.readFileSync(new URL(`../scripts/rules/${f}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/jieyin|camera/.test(rules.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the rules name no game and see no camera');
});

/* Hanli 10-21: 「用户结印失败, 或者不愿意使用摄像头, 塔防游戏也能正常完成, 不会影响剧情推进.」 */
test('never a dead end: a camera refused or failing, or 「改用讲堂试法」 after misses → the 讲堂试法 board, same task', () => {
  const t = boardRow('zh');
  const cam = chooseBoard(t, { camera: true });
  assert.equal(cam.deal.instead, '讲堂试法', 'the alt\'s deal names the board behind it');
  assert.equal(swapLabel(cam.deal.instead, 'zh'), '改用「讲堂试法」');
  assert.match(swapLabel('Trying the spells', 'en'), /instead/);
  // the camera refused / failing: that need is gone for the page, the row's own board is dealt
  const a = fallBack({ camera: true }, t.id, { won: false, left: true, unable: 'camera' }, cam.deal);
  assert.equal(a.camera, false);
  assert.equal(chooseBoard(t, a), t, '讲堂试法, the very row');
  assert.equal(a.turned.length, 1);
  // he chose the other board after missing: the camera stays for other boards, this task turns back
  const b = fallBack({ camera: true }, t.id, { won: false, left: true, instead: true }, cam.deal);
  assert.equal(b.camera, true);
  assert.equal(chooseBoard(t, b), t);
  assert.equal(withCaps({ tasks: [t] }, b).tasks[0].game, 'zhazhai');
  // a plain leave (the shell's 离开, an abort) is no fallback; nor anything from a board without `instead`
  assert.equal(fallBack({ camera: true }, t.id, { won: false, left: true }, cam.deal), null);
  assert.equal(fallBack({ camera: true }, t.id, { won: false, left: true, unable: 'camera' }, { lv: 'huodan' }), null);
  // either board wins the same task: the pay is the row's (tested above, both win paths)
});

test('the game leaves at once, with `unable`, when the camera is missing and a board stands behind it; the 游戏厅 keeps its line', async () => {
  const fakeDoc = () => {
    const el = { innerHTML: '', querySelector: () => null, append() {} };
    const doc = { head: { append() {} }, querySelector: () => true, createElement: () => ({ getContext: () => null }), defaultView: null };
    el.ownerDocument = doc;
    return el;
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => kit });
  try {
    const story = await jieyinMod.mount(fakeDoc(), { lang: 'zh', data: { lv: 'jiangtang', instead: '讲堂试法' } });
    assert.deepEqual(story, { won: false, left: true, unable: 'camera' });
    const box = fakeDoc();
    const arcade = await jieyinMod.mount(box, { lang: 'zh', data: { lv: 'jiangtang' } });
    assert.deepEqual(arcade, { won: false, left: true });
    assert.match(box.innerHTML, /摄像头/);
  } finally { globalThis.fetch = prevFetch; }
});

test('the source: 「改用…」 after `swapAfter` misses (3), only on a story board; the page deals the row\'s own board on a fallback', () => {
  const src = fs.readFileSync(new URL('../scripts/games/jieyin.js', import.meta.url), 'utf8');
  assert.match(src, /if \(misses < \(data\.swapAfter \?\? 3\)/);
  assert.match(src, /&& data\.instead\) offerSwap/);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /if \(!result\?\.won && !g\.sent && !g\.skipped\) fallBackFrom\(g, result\);/);
  assert.match(page, /async function fallBackFrom\(g, result\) \{\n  if \(!\(await fellBack\(g\.taskId, result, g\.data, window\)\)\) return;\n  boards\.delete\(g\.taskId\);/);
});

test('the stuck rule holds on the 结印 board: 「算了，往下走」 after the stuck time, as on every scene board', () => {
  const g = { mod: jieyinMod, state: { won: false }, taskId: 'qianye-qiajue' };
  const ctx = { lang: 'zh' };
  assert.doesNotMatch(skipBoard(g, g.taskId, ctx), /data-game-skip/, 'not at once');
  g.shownAt -= STUCK_MS + 1;
  assert.ok(stuckNow(g, Date.now()));
  assert.match(skipBoard(g, g.taskId, ctx), /data-game-skip="qianye-qiajue"/);
  assert.ok(stampShown);
});

/* Hanli 10-21 on his camera: 「手印识别的时候, 需要转动一下手才能识别. 需要提示用户一下」; 「告诉玩家, 用左手还是右手,
   手掌朝自己还是摄像头. 需要提示清楚」. */
test('the 讲堂 tells which hand and which way before he tries, turns him sooner, and shows 「转一转」 when a seal will not come', async () => {
  const { facingLine, turnOf } = await import('../scripts/games/jieyin/hint.js');
  const { iconSvg } = await import('../scripts/games/jieyin/pose.js');
  const lv = levelAsked(kit, { lv: 'jiangtang' });
  assert.equal(lv.turnMs, 400, 'the turn cue at 0.4 s in teaching');
  assert.ok(lv.turnMs < kit.orient.turnMs);
  assert.equal(lv.demoMs, 3000);
  for (const id of [...lv.sequence, ...lv.cast.sequence]) {
    const s = kit.seals[id];
    assert.equal(s.hand, 'right', `${id}: one hand named`);
    assert.match(facingLine(s, 'zh'), /^用右手（左手也行），(掌心朝摄像头|手侧过来，小指朝摄像头)，手指朝上$/, id);
    assert.match(facingLine(s, 'en'), /^Right hand \(the left works too\), /, id);
    assert.notEqual(iconSvg(s, 40), iconSvg(s, 40, { hand: 'left' }), `${id}: drawn as the right hand, seen from his side`);
  }
  // a seal that takes only its hand says exactly which to switch to; the cue words are exact, never 「手转一下」
  const only = { ...kit.seals.zhang, handOnly: true };
  assert.match(facingLine(only, 'zh'), /^用右手，/);
  const { poseOf } = await import('../scripts/games/jieyin/pose.js');
  assert.deepEqual(turnOf({ world: [poseOf(only)], handed: ['Left'], seal: only, orient: kit.orient }), { to: 'hand', hand: 'right' });
  assert.equal(turnOf({ world: [poseOf(kit.seals.zhang)], handed: ['Left'], seal: kit.seals.zhang, orient: kit.orient }), null, 'either hand: no switch asked');
  const src = fs.readFileSync(new URL('../scripts/games/jieyin/hint.js', import.meta.url), 'utf8');
  assert.match(src, /换右手/);
  assert.match(src, /掌心转向摄像头/);
  assert.doesNotMatch(src, /手转一下/);
  const page = fs.readFileSync(new URL('../scripts/games/jieyin.js', import.meta.url), 'utf8');
  assert.match(page, /knobs: \{ \.\.\.kit\.hint, orient \}/, 'the level\'s turnMs reaches the hint');
  assert.match(page, /world: hands, handed, held: \[\]/, 'world and handed reach the hint: the turn cue can show');
  assert.match(page, /\$\('\.jy-face'\)\.textContent = next \? facingLine\(next, lang\)/);
});

test('the judge is a little wider (Hanli had to turn his hand): straight past ×1.15, a pinch within 0.4 — still each seal only itself (game-jieyin)', () => {
  assert.equal(kit.judge.ext, 1.15);
  assert.equal(kit.judge.near, 0.4);
});

test('结印 copy says 摄像头, never 镜头 (Hanli 10-21), and the 讲堂 keeps the hand-and-facing line in sight', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const p of ['scripts/games/jieyin.js', 'scripts/games/jieyin/hint.js', 'scripts/games/doufa.js', 'scripts/games/texie.js']) assert.doesNotMatch(code(read(p)), /镜头/, p);
  for (const p of ['worlds/jiuding/levels/jieyin.json', 'worlds/jiuding/levels/zhidian.json', 'worlds/jiuding/levels/texie.json']) assert.doesNotMatch(read(p), /镜头/, p);
  const css = read('scripts/games/jieyin/jieyin.css');
  assert.match(css, /\.jy\[data-mode="one"\] \.jy-field \{ max-height: calc\(100dvh - 450px\); \}/);
  assert.match(css, /\.jy\[data-mode="one"\] \.jy-face \{ order: 1;/);
});
