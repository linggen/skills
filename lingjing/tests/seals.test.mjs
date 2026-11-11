// 师父传印 (rules/seals.mjs, worlds/jiuding/chuanyin.json, games/jieyin/flow.js · lesson.js · mastery.js · seal-share.js; Hanli
// 2026-11-10: 「结印是亮点」 · 「可以，按这个做」): the master passes on a seal a week (看 · 跟 · 考), the 印谱 keeps what is
// learned, mastery grows by clean casts (half as fast tapped) and lends the kits' spells strength — and nothing needs a camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, threshold } from '../scripts/state.mjs';
import { look, VERBS } from '../scripts/rules.mjs';
import { drawAt, dealOf, happeningTray, metKinds } from '../scripts/rules/happenings.mjs';
import { shichenOf } from '../scripts/rules/pool.mjs';
import { playGrant, storyPlay } from '../scripts/rules/playpay.mjs';
import { bookView, cardView, daysSince, drillRows, heldOf, lessonRow, levelAt, planView, powerAt, seals } from '../scripts/rules/seals.mjs';
import { begin, castsOf, confirm, figuresOf, left, next as nextStep, offerTap, switchTo, tick, trayOf, wanted } from '../scripts/games/jieyin/flow.js';
import { NONE, castsText, factorOf, masteryFor } from '../scripts/games/jieyin/mastery.js';
import { paintSeal, sealChars, sealRows } from '../scripts/games/jieyin/seal-share.js';
import { figureOf } from '../scripts/seal-figure.js';
import { jieyinCast, jieyinState, newGame as newTide, levelsFrom, spawnAt } from '../scripts/games/shoulu/core.js';
import { jieyinCfg } from '../scripts/games/shoulu.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url), 'utf8'));
const cfg = content.chuanyin;
const DAY = (d, h = 9, m = 10) => new Date(2026, 10, d, h, m);
const NOW = DAY(12);
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
/* A save at 练气八层 in 古八 (the 讲堂's lesson behind him), standing at `place`. */
const at = (place = 'jiangtang', extra = {}) => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-shenshi', place, ended: ['00-prologue', '00-waimen'], done_scenes: ['09-futian', '09-dabi', '09-shenshi', '09-danfang'], tier: 'qi', step: 8, progress: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), marks: ['qiajue-tight'], ...extra };
  s.progress = Math.floor(0.3 * threshold(content, s));
  return s;
};
const run = (s, args, now = NOW) => { const r = seals(s, content, { now }, args); return { ...r, state: r.state ?? s }; };
const learnedIds = (s, now = NOW) => Object.keys(heldOf(content, s)).sort();
const zhLen = (t) => [...String(t)].filter((c) => /[㐀-鿿]/.test(c)).length;

test('the book: six seals in the master\'s order, each a spell some kit resolves, its gestures real one-hand seals, its words in zh and en', () => {
  const ids = cfg.book.map((r) => r.id);
  assert.deepEqual(ids, ['feijian', 'huodan', 'bingzhui', 'jinren', 'muteng', 'tuqiang']);
  const kitMoves = new Set([...kit.hosts.shoulu.moves.map((m) => m.id), ...content.tasks.tasks.length ? [] : []]);
  const shouqiang = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/shouqiang.json', import.meta.url), 'utf8')).jieyin.moves.map((m) => m.id);
  const sadou = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/sadoushou.json', import.meta.url), 'utf8')).jieyinSets.full.map((m) => m.id);
  for (const r of cfg.book) {
    assert.ok(r.move.every((m) => kitMoves.has(m) || shouqiang.includes(m) || sadou.includes(m)), `${r.id}: a kit resolves its spell`);
    assert.ok(r.figures.length >= 2 && r.figures.every((f) => kit.seals[f] && (kit.seals[f].hands ?? 1) === 1), `${r.id}: one-hand seals of the kit`);
    assert.equal(r.figures.at(-1), kit.spells[r.id]?.wen ?? r.figures.at(-1), `${r.id}: ends on the spell's 文`);
    for (const k of ['name', 'spell', 'does', 'line']) assert.ok(r[k]?.zh && r[k]?.en, `${r.id}.${k} in zh and en`);
    assert.ok(zhLen(r.name.zh) <= 20 && zhLen(r.does.zh) <= 30 && zhLen(r.line.zh) <= 40);
  }
  for (const l of ['zh', 'en']) for (const [k, v] of Object.entries(cfg.words[l])) if (typeof v === 'string' && l === 'zh') assert.ok(zhLen(v) <= 20 || ['watchLine', 'followLine', 'examLine', 'tapExam', 'tapFollow', 'timeout', 'drillNames', 'passed', 'next', 'noLesson'].includes(k) || zhLen(v) <= 24, `words.${k}: ${v}`);
  assert.ok(zhLen(cfg.words.zh.cameraTip) <= 20 && zhLen(cfg.words.zh.untaught) <= 20, 'the camera line and the outline label stay under twenty');
  assert.deepEqual(Object.keys(cfg.words.zh).sort(), Object.keys(cfg.words.en).sort(), 'the same words in both tongues');
});

test('the weekly gate: one seal a week, seven real days from the last learned — and only a seal whose spell he has met', () => {
  const s0 = at('jiangtang');
  // The story's own 讲堂 lesson taught 飞剑 and 火弹: learned at 生, undated — so the first lesson is due at once.
  assert.deepEqual(learnedIds(s0), ['feijian', 'huodan']);
  assert.equal(lessonRow(content, s0, NOW)?.id, 'bingzhui');
  assert.equal(daysSince(content, s0, NOW), null, 'a seed starts no clock');
  const a = run(s0, { action: 'learn', id: 'bingzhui', how: 'hands' }, NOW);
  assert.equal(a.result.ok, true, JSON.stringify(a.result));
  assert.equal(a.state.seals.book.bingzhui.at, NOW.toISOString());
  assert.equal(lessonRow(content, a.state, DAY(13)), null, 'the next day: nothing');
  assert.equal(lessonRow(content, a.state, DAY(18, 23)), null, 'six days on: nothing');
  assert.equal(lessonRow(content, a.state, DAY(19, 0, 5))?.id, 'jinren', 'the seventh day: the next, by the book\'s order');
  // A spell not yet met is not taught: before the 讲堂 (no marks) only 飞剑 is open; once learned, nothing is due — however long.
  const bare = at('jiangtang', { marks: [] });
  assert.deepEqual(learnedIds(bare), []);
  assert.equal(lessonRow(content, bare, NOW)?.id, 'feijian');
  const one = run(bare, { action: 'learn', id: 'feijian', how: 'tap' });
  assert.equal(lessonRow(content, one.state, DAY(12 + 30)), null, 'huodan and the rest wait on the story\'s marks');
  // …a lesson cannot be forced: a seal that is not due is refused, and a repeat report is the same answer.
  assert.equal(run(bare, { action: 'learn', id: 'jinren' }).result.refused, 'not-due');
  assert.equal(run(one.state, { action: 'learn', id: 'feijian' }).result.again, true);
});

test('the three steps: 看 plays the master, 跟 confirms each gesture, 考 runs the whole seal against the clock — a time out only a try again', () => {
  const plan = planView(content, at(), NOW, 'lesson');
  assert.equal(plan.mode, 'lesson');
  assert.equal(plan.seal.id, 'bingzhui');
  assert.deepEqual(figuresOf(plan), cfg.book[2].figures);
  for (const input of ['camera', 'tap']) {
    let s = begin(plan, { input, exam: plan.exam });
    assert.equal(s.phase, 'watch');
    // the demonstration goes on by itself, a figure at a time, and by a tap
    let r = tick(s, plan.exam.watch);
    assert.equal(r.state.at, 1);
    r = nextStep(r.state);
    assert.equal(r.state.phase, 'follow', 'the last figure shown: the follow');
    assert.equal(wanted(r.state), figuresOf(plan)[0]);
    s = r.state;
    if (input === 'tap') assert.equal(confirm(s, 'jian').events[0].type, 'wrong', 'a wrong figure is only a wrong tap');
    for (const f of figuresOf(plan)) s = confirm(s, f).state;
    assert.equal(s.phase, 'exam', 'every gesture confirmed: the test');
    assert.equal(s.at, 0);
    // the clock runs out: a try again, the same step — the strikes counted, never a loss
    const t = tick(s, left(s) + 1);
    assert.deepEqual(t.events.map((e) => e.type), ['timeout', 'again']);
    assert.equal(t.state.phase, 'exam');
    assert.equal(t.state.strikes, 1);
    s = t.state;
    for (const f of figuresOf(plan)) s = confirm(s, f).state;
    assert.equal(s.done, true);
    assert.equal(s.passes, 1);
  }
});

test('the learned record: passing the 考 writes the seal into the 印谱 (id, when, mastery) and hands the share card its facts', () => {
  const s0 = at();
  const r = run(s0, { action: 'learn', id: 'bingzhui', how: 'hands' });
  assert.deepEqual(r.state.seals.book.bingzhui, { at: NOW.toISOString(), via: 'lesson', hp: cfg.mastery.cast.hands });
  assert.equal(r.result.card.learned, '学会了 冰锥印');
  assert.equal(r.state.seals.book.feijian.via, 'story', 'the seeds are written beside it once the book is written');
  const book = bookView(content, r.state, NOW);
  const row = book.rows.find((x) => x.id === 'bingzhui');
  assert.equal(row.learned, true);
  assert.equal(row.head, '冰锥印 · 生');
  assert.equal(book.rows.find((x) => x.id === 'jinren').learned, false, 'an unlearned seal is an outline');
  assert.ok(book.words.untaught === '师父还没传');
});

test('the drill: dealt only with two seals learned; two or three of them, the same day on both devices; pays one small game, once a deal', () => {
  const one = at('jiangtang', { marks: [] });
  const learnedOne = run(one, { action: 'learn', id: 'feijian', how: 'tap' }).state;
  assert.equal(drillRows(content, learnedOne, NOW), null, 'one learned: no drill');
  assert.equal(planView(content, learnedOne, NOW, 'drill').mode, 'none', 'and nothing to teach either: the board leaves, never a dead end of its own');
  const s = at();
  const rows = drillRows(content, s, NOW);
  assert.ok(rows.length >= 2 && rows.length <= 3, `${rows.map((r) => r.id)}`);
  assert.deepEqual(drillRows(content, structuredClone(s), NOW).map((r) => r.id), rows.map((r) => r.id), 'a day\'s pick is the save\'s');
  const plan = planView(content, s, NOW, 'drill');
  assert.equal(plan.mode, 'drill');
  assert.equal(figuresOf(plan).length, rows.length);
  assert.deepEqual(castsOf(plan), rows.map((r) => r.id));
});

test('the happening deals them: the lesson first while it is due, the drill after, the errand\'s step never — and each pays its own games, once a deal', () => {
  const all = (s, now) => (cfg ? content.happenings.happenings.find((h) => h.id === 'jiangtang-zaoke') : null) && dealOf(content, s, content.happenings.happenings.find((h) => h.id === 'jiangtang-zaoke'), shichenOf(now), 'mac', metKinds(content, s));
  assert.ok(metKinds(content, at()).has('jieyin'), 'the 讲堂 lesson behind him: 结印 is met');
  const due = all(at(), DAY(12, 9));
  assert.equal(due?.task, 'chuanyin-lesson', 'due: the lesson, ahead of the rotation');
  const learned = run(at(), { action: 'learn', id: 'bingzhui', how: 'hands' }).state;
  assert.equal(all(learned, DAY(12, 9))?.task, 'chuanyin-lesson', 'passed this morning: still the deal that was made (its win is counted where it stands)');
  const next = all(learned, DAY(13, 9));
  assert.notEqual(next?.task, 'chuanyin-lesson', 'the day after: the week is not out');
  assert.ok(['chuanyin-drill', 'jiangtang-shifa'].includes(next?.task));
  for (const day of [12, 13, 20]) for (const s of [at(), learned]) assert.notEqual(all(s, DAY(day, 9))?.task, 'chuanyin-step', 'the step is only ever asked for');
  // pay: the lesson three small games, the drill one — in place of the board's own minutes (rules/playpay.mjs playGrant `own`)
  for (const [id, games] of [['chuanyin-lesson', 3], ['chuanyin-drill', 1], ['chuanyin-step', 1]]) assert.deepEqual(content.tasks.tasks.find((x) => x.id === id).own, { games }, `${id}: its pay declared in small games`);
  let lesson = null;
  for (let d = 12; d < 26 && !lesson; d += 1) for (const h of [6, 8, 10]) {
    const now = DAY(d, h), s = at('jiangtang');
    if (happeningTray(content, s, now).some((e) => e.happening === 'jiangtang-zaoke')) { lesson = { now, s }; break; }
  }
  assert.ok(lesson, '讲堂早课 lights within a fortnight');
  const ctx = { now: lesson.now, quests: [] };
  const tray = happeningTray(content, lesson.s, lesson.now).find((e) => e.happening === 'jiangtang-zaoke');
  assert.equal(tray.task, 'chuanyin-lesson');
  const won = VERBS.win(lesson.s, content, ctx, { id: 'chuanyin-lesson' });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  const done = VERBS.task(won.state, content, ctx, { action: 'done', id: 'chuanyin-lesson' });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  const unit = storyPlay(content, lesson.s);
  assert.ok(Math.abs(done.result.paid.progress - 3 * unit) <= 3, `three small games' worth: ${done.result.paid.progress} vs 3 × ${unit}`);
  assert.ok(done.state.happen.at['jiangtang-zaoke'], 'the happening is gone to');
});

test('mastery: thresholds in the data, a tapped cast half a camera one, and it never drops', () => {
  let s = run(at(), { action: 'cast', casts: 'feijian:3', how: 'hands' }).state;
  assert.equal(s.seals.book.feijian.hp, 3 * cfg.mastery.cast.hands);
  s = run(s, { action: 'cast', casts: 'feijian:2', how: 'tap' }).state;
  assert.equal(s.seals.book.feijian.hp, 3 * cfg.mastery.cast.hands + 2 * cfg.mastery.cast.tap, 'tapped: half');
  assert.equal(cfg.mastery.cast.tap * 2, cfg.mastery.cast.hands);
  const [, shu, jing] = cfg.mastery.levels;
  const at12 = run(at(), { action: 'cast', casts: { huodan: shu.at / cfg.mastery.cast.hands }, how: 'hands' });
  assert.equal(levelAt(content, at12.state.seals.book.huodan.hp).level.id, 'shu');
  assert.deepEqual(at12.result.up, ['huodan'], 'the rise is told');
  assert.equal(powerAt(content, shu.at - 1), 0, 'under 熟: nothing');
  assert.equal(powerAt(content, shu.at), 0.1);
  assert.equal(powerAt(content, jing.at), 0.2);
  assert.equal(powerAt(content, 10_000), 0.2, 'the top stays the top');
  // never down: a negative or absurd report adds nothing / is rounded to the most one board can send
  const before = at12.state.seals.book.huodan.hp;
  assert.equal(run(at12.state, { action: 'cast', casts: 'huodan:-9', how: 'hands' }).state.seals.book.huodan.hp, before);
  assert.ok(run(at12.state, { action: 'cast', casts: 'huodan:99999', how: 'hands' }).state.seals.book.huodan.hp <= before + 40 * cfg.mastery.cast.hands);
  // a seal not learned counts nothing; a kit's move id answers to its book seal
  assert.deepEqual(run(at(), { action: 'cast', casts: 'tuqiang:4', how: 'hands' }).result.ignored, ['tuqiang']);
  // the 印谱 says it: 「飞剑印 · 熟 · 威力 +10%」, and what is left
  const book = bookView(content, at12.state, NOW);
  assert.equal(book.rows.find((r) => r.id === 'huodan').head, '火弹印 · 熟 · 威力 +10%');
  assert.match(book.rows.find((r) => r.id === 'huodan').next, /再练 \d+ 次，升到精/);
  assert.equal(book.bonus.huodan, 1.1);
  assert.equal(book.bonus.feijian, undefined, 'at 生 a seal lends nothing');
  assert.equal(bookView(content, { ...at12.state, lang: 'en' }, NOW).rows.find((r) => r.id === 'huodan').head, 'Fire-shot seal · Practised · power +10%');
});

test('the kits: a seal at 熟 makes its spell 10% stronger in 守炉; the proof (no mastery given) resolves exactly as before', () => {
  const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
  const levels = levelsFrom(reg.games.find((g) => g.id === 'shoulu' && g.levels)), host = kit.hosts.shoulu, lv = levels.find((l) => l.id === 'houshan');
  const dmg = (mastery) => {
    const g = newTide(lv, { seed: 'm', headless: true }), hot = { ...jieyinCfg(host, lv), ...(mastery ? { mastery } : {}) };
    const b = spawnAt(g, 'yezhu', 300), hp = b.hp;
    assert.equal(jieyinCast(g, 'feijian', hot), true);
    return hp - b.hp;
  };
  const plain = dmg(null);
  assert.equal(plain, host.moves[0].dmg, 'no mastery: the row\'s number');
  assert.equal(dmg({}), plain, 'an empty book: the same');
  assert.ok(Math.abs(dmg({ feijian: 1.1 }) - plain * 1.1) < 1e-6, '熟: +10%');
  assert.ok(Math.abs(dmg({ feijian: 1.2 }) - plain * 1.2) < 1e-6, '精: +20%');
  assert.equal(dmg({ huodan: 1.2 }), plain, 'another seal\'s strength is not this one\'s');
});

test('the kits: 守墙关 and 守山门 lay the same strength on their spells, and play as before without it', async () => {
  const sq = await import('../scripts/games/shouqiang/core.js'), sd = await import('../scripts/games/sadoushou/core.js');
  const json = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const sqKit = sq.withRoots(json('worlds/jiuding/levels/shouqiang.json'), json('worlds/jiuding/creatures.json').creatures), sqLevel = { ...sqKit.levels[0], jieyinWhen: 'always' };
  const wave1 = (mastery) => {
    const g = sq.newGame(sqKit, mastery ? { ...sqLevel, mastery } : sqLevel, { seed: 'k' });
    const adv = (s) => { for (let t = 0; t < s; t += 0.1) sq.step(g, 0.1); };
    adv(sqLevel.leadSec + 0.2); sq.pick(g, 'open-jian'); adv(sqLevel.countIn + 0.2);
    for (let i = 0; i < 300 && !g.beasts.some((b) => b.y >= sq.reachY(g) && b.hp > 0); i += 1) sq.step(g, 0.1);
    g.cool.sword = g.cool.fox = 999; g.shots.length = 0;
    const t = sq.jieyinTarget(g), hp = t.hp;
    assert.equal(sq.castJieyin(g, 'feijian'), true);
    for (let i = 0; i < 30; i += 1) { g.cool.sword = g.cool.fox = 999; sq.step(g, 0.05); if (t.hp < hp) break; }
    return hp - t.hp;
  };
  const plain = wave1(null);
  assert.ok(plain > 0);
  assert.equal(wave1({}), plain);
  assert.ok(Math.abs(wave1({ feijian: 1.1 }) - plain * 1.1) < 1e-6, '守墙关: +10%');
  // 守山门: the level's jieyin carries it (the page lays it there); the same cast hits the 大妖 harder by the share, never past `bossCap`
  const sdKit = json('worlds/jiuding/levels/sadoushou.json'), sdLevel = sdKit.levels.filter((l) => !l.story)[0];
  const boss = (mastery) => {
    const lv = { ...sdLevel, waves: [], belt: { ...sdLevel.belt, lines: [] }, jieyin: { ...sd.jieyinOf(sdKit, sdLevel), ...(mastery ? { mastery } : {}) } };
    const g = sd.newGame(sdKit, lv, { seed: 'jy' });
    sd.step(g, 1 / 30);
    for (let i = 0; i < 90; i += 1) { sd.aim(g, sd.colMid('L')); sd.step(g, 1 / 30); }
    assert.ok(sd.jieyinState(g).ready);
    g.squad = 50; // a small squad: far under bossCap, so the strength shows
    const hp = g.boss.hp;
    assert.equal(sd.castJieyin(g, 'feijian', 'middle'), true);
    return hp - g.boss.hp;
  };
  const base = boss(null);
  assert.ok(base > 0);
  assert.equal(boss({}), base);
  assert.ok(Math.abs(boss({ feijian: 1.2 }) - base * 1.2) < 1e-6, `守山门: +20% (${base} → ${boss({ feijian: 1.2 })})`);
});

test('mastery.js: the strength comes from the book (a host with none plays as before) and the casts go back in batches and at the close', async () => {
  assert.equal(factorOf({}, 'feijian'), 1);
  assert.equal(factorOf({ feijian: 1.1 }, 'feijian'), 1.1);
  assert.equal((await masteryFor({})).bonus, NONE.bonus, 'no seam: nothing');
  const sent = [];
  const m = await masteryFor({ sealBook: async (a) => { assert.equal(a.action, 'book'); return { ok: true, bonus: { huodan: 1.1 } }; }, sealed: async (a) => { sent.push(a); return { ok: true }; } });
  assert.deepEqual(m.bonus, { huodan: 1.1 });
  m.report('huodan'); m.report('huodan'); m.report('feijian');
  assert.equal(sent.length, 0, 'not yet: a few casts wait');
  m.flush();
  assert.deepEqual(sent, [{ action: 'cast', casts: 'huodan:2,feijian:1', how: 'hands' }]);
  m.flush();
  assert.equal(sent.length, 1, 'nothing left to send');
  for (let i = 0; i < 4; i += 1) m.report('feijian');
  assert.equal(sent.length, 2, 'a batch of four goes by itself');
  assert.equal(castsText({ a: 2, b: 0, c: 1 }), 'a:2,c:1');
  assert.deepEqual((await masteryFor({ sealBook: async () => { throw new Error('far'); } })).bonus, {}, 'a book out of reach: no bonus, no failure');
});

test('no camera, still finishable: the lesson and the drill complete by taps alone, the pay and the steps the same, mastery at half', () => {
  const s = at();
  for (const intent of ['lesson', 'drill']) {
    const plan = planView(content, s, NOW, intent);
    let f = begin(plan, { input: 'tap', exam: plan.exam });
    let guard = 0;
    while (!f.done && guard++ < 200) {
      if (f.phase === 'watch') { f = nextStep(f).state; continue; }
      const tray = trayOf(f, Object.keys(plan.figures), 2);
      assert.ok(tray.includes(wanted(f)), 'the wanted figure is on the tray');
      f = confirm(f, wanted(f)).state;
    }
    assert.equal(f.done, true, `${intent} completes with no camera`);
    // what the page then reports: a lesson learned / a drill's casts, "tap" — the rules count half
    const report = intent === 'lesson' ? { action: 'learn', id: plan.seal.id, how: 'tap' } : { action: 'cast', casts: castsOf(plan).map((id) => `${id}:1`).join(','), how: 'tap' };
    const r = run(s, report);
    assert.equal(r.result.ok, true);
    const id = intent === 'lesson' ? plan.seal.id : castsOf(plan)[0];
    assert.equal(r.state.seals.book[id].hp, (heldOf(content, s)[id]?.hp ?? 0) + cfg.mastery.cast.tap, 'half the camera\'s');
  }
  // a camera that fails mid-way: the same step by taps, no restart
  const plan = planView(content, s, NOW, 'lesson');
  let f = begin(plan, { input: 'camera', exam: plan.exam });
  f = nextStep(nextStep(tick(f, 99999).state).state).state;
  f = confirm(f).state;
  const t = switchTo(f, 'tap');
  assert.equal(t.at, f.at, 'a follow in hand stays in hand');
  // the camera's patience: two time outs and 「改用点选」 is offered; the taps never need it
  let c = begin(plan, { input: 'camera', exam: plan.exam });
  c = { ...c, phase: 'exam', at: 0 };
  c = tick(c, left(c) + 1).state;
  assert.equal(offerTap(c), false);
  c = tick(c, left(c) + 1).state;
  assert.equal(offerTap(c), true);
  assert.equal(offerTap(switchTo(c, 'tap')), false);
});

test('the share card: words and the seal\'s figures only — never a name, a camera frame or a save field; painted from the rows alone', () => {
  const s = run(at(), { action: 'learn', id: 'bingzhui', how: 'hands' });
  const card = cardView(content, { ...s.state, name: 'SECRET-NAME' }, 'bingzhui', NOW);
  assert.equal(card.ok, true);
  const rows = sealRows(card);
  assert.deepEqual(rows.map((r) => r.role), ['head', 'name', 'figs', 'line', 'does', 'date', 'brand']);
  const said = JSON.stringify(rows);
  assert.ok(!said.includes('SECRET-NAME') && !/image|frame|video|修为|灵石/.test(said.replace('灵境', '')), 'nothing of his save');
  assert.equal(rows.find((r) => r.role === 'figs').figs.length, cfg.book[2].figures.length);
  for (const f of rows.find((r) => r.role === 'figs').figs) assert.ok(f.hands[0].lines.length === 21 && f.hands[0].poly.length === 6, 'the figure\'s strokes');
  // painted: every character it draws is one the rows say
  const drawn = [];
  const g = { fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, createLinearGradient: () => ({ addColorStop() {} }), measureText: (t) => ({ width: [...String(t)].length * 20 }), fillText(t) { drawn.push(t); } };
  const canvas = { getContext: () => g };
  paintSeal(canvas, rows, { font: 'serif' });
  assert.ok(canvas.width === 1080 && canvas.height > 600);
  const chars = new Set(sealChars(rows));
  for (const ch of drawn.join('')) if (ch !== ' ') assert.ok(chars.has(ch), `drawn ${ch} is in the rows`);
  assert.equal(cardView(content, s.state, 'tuqiang', NOW).refused, 'not-learned');
  assert.deepEqual(sealRows({ figures: [] }), []);
  assert.ok(figureOf(kit.seals.zhang).hands.length === 1 && figureOf(kit.seals.lihuo).hands.length === 2, 'a two-hand seal draws two');
});

test('sharing the card counts as the day\'s 传音, once (the existing share path; the card adds no pay of its own)', () => {
  const ctx = { now: NOW, quests: [] };
  const s = at('jiangtang', { tier: 'qi', step: 3 });
  const a = VERBS.quest(s, content, ctx, { action: 'share' });
  assert.equal(a.result.ok, true, JSON.stringify(a.result));
  assert.equal(a.result.shared, true);
  const first = a.result.paid?.progress;
  assert.ok(first > 0);
  const again = VERBS.quest(a.state, content, ctx, { action: 'share' });
  assert.ok(!(again.result.paid?.progress > 0), 'the second share of the day pays nothing');
  // the card carries no pay of its own: the learn answer holds facts, not a reward
  const learn = run(s, { action: 'learn', id: 'bingzhui', how: 'hands' }).result;
  assert.ok(!('paid' in learn) && !('progress' in learn));
});

test('Ling reads the book, never writes it: learning and casts are the page\'s (rules.mjs PAGE_ACTIONS)', async () => {
  const { pageOnly } = await import('../scripts/rules.mjs');
  assert.equal(pageOnly('seals', { action: 'learn' }), true);
  assert.equal(pageOnly('seals', { action: 'cast' }), true);
  assert.equal(pageOnly('seals', { action: 'book' }), false);
  assert.equal(pageOnly('seals', { action: 'plan' }), false);
});

test('old saves load: the book is derived (the story\'s seeds at 生, undated), no migration, nothing in the save until it is written', () => {
  const dir = new URL('./fixtures/saves/', import.meta.url);
  let seeded = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const s = migrate(migrate(structuredClone(raw.state ?? raw)), content);
    assert.equal(s.seals, undefined, `${f}: migrate adds no field`);
    const book = bookView(content, s, NOW);
    assert.equal(book.ok, true, f);
    const has = (s.marks ?? []).some((m) => m.startsWith('qiajue'));
    assert.deepEqual(book.rows.filter((r) => r.learned).map((r) => r.id), has ? ['feijian', 'huodan'] : [], `${f}: seeded from the 讲堂 marks the save records`);
    for (const r of book.rows.filter((x) => x.learned)) { assert.equal(r.level.id, 'sheng', `${f}: at 生`); assert.equal(r.at, null, 'undated'); assert.equal(r.via, 'story'); }
    if (has) seeded += 1;
    if (['waimen.json', 'zhuji-cliff.json', 'ji-altar.json', 'zhishi-09year.json'].includes(f)) assert.equal(look(s, content, { now: NOW, quests: [] }).ok, true, `${f}: Look holds`); // (the others fail Look on main too: an older ladder's step)
  }
  assert.ok(seeded >= 3, 'fixtures with the 讲堂 behind them seed the book');
});

test('the 讲堂 card on the Look tray: the lesson is a happening\'s deal like any other (the title the player reads, in the book\'s voice)', () => {
  const t = content.tasks.tasks.filter((x) => x.id.startsWith('chuanyin-'));
  assert.equal(t.length, 3);
  for (const x of t) {
    assert.ok(x.hosted && x.kind === 'board' && x.game === 'jieyin' && x.own?.games > 0, x.id);
    assert.ok(zhLen(x.title.zh) <= 20 && x.title.en && x.how.zh && x.how.en && x.done_line.zh && x.done_line.en, x.id);
  }
  const h = content.happenings.happenings.find((x) => x.id === 'jiangtang-zaoke');
  assert.deepEqual(h.deals.map((d) => d.task), ['jiangtang-shifa', 'chuanyin-lesson', 'chuanyin-drill', 'chuanyin-step']);
  assert.equal(h.who, cfg.master.who, 'the master is 褚先生, who already holds the lesson');
  assert.equal(content.people.people.find((p) => p.id === cfg.master.who).name.zh, '褚先生');
  assert.ok(drawAt && look);
});

/* ── The chain errand's step (quests/guan.json guan-jiujie-4a) ── */
const done = '2026-11-12T10:00:00.000Z';
const chainAt = (step, share, quests, extra = {}) => {
  const s = at('jiangtang', { step, quests, ...extra });
  s.progress = Math.floor(share * threshold(content, s));
  return s;
};
const offeredAt = (s, now = NOW) => (look(s, content, { now, quests: [] }).offers ?? []).map((o) => o.id);

test('the chain\'s step: the master\'s seal before 看炉 — data, its gate, and nobody already past it is ever offered it', () => {
  const chain = content.quests.filter((q) => q.chain === 'jiujie');
  const i = chain.findIndex((q) => q.id === 'guan-jiujie-4a');
  assert.equal(chain[i - 1].id, 'guan-jiujie-4');
  assert.equal(chain[i + 1].id, 'guan-jiujie-5', 'before 看炉');
  assert.equal(chain[i - 1].then, 'guan-jiujie-4a');
  assert.equal(chain[i].then, 'guan-jiujie-5');
  assert.equal(chain[i].opens.after, 'guan-jiujie-4');
  assert.equal(chain[i + 1].opens.after, 'guan-jiujie-4a');
  const q = chain[i];
  assert.equal(q.from.place, 'jiangtang');
  assert.equal(q.from.who.zh, '褚先生');
  assert.deepEqual(q.need, [{ kind: 'board', task: 'chuanyin-step', n: 1, at: 'jiangtang' }]);
  assert.equal(q.work, 'labor');
  assert.deepEqual(q.grant, { table: 'labor', ls: 1.5 }, 'a size in 灵石 minutes like the chain\'s other board steps — no hand number (the board itself pays its small games\' worth, tasks/happenings.json `own`)');
  assert.ok(q.say.zh && q.say.en && q.done.zh && q.done.en && q.title.zh && q.title.en);
  assert.ok(zhLen(q.title.zh) <= 20);
  assert.equal(chain.find((x) => x.id === 'guan-jiujie-6').id, 'guan-jiujie-6', 'nothing renumbered');
  // The step\'s seals are in 守炉\'s own move list: what he learns there, the 看炉 board can use.
  const shoulu = kit.hosts.shoulu.moves.map((m) => m.jieyin ?? m.id);
  for (const id of cfg.step.seals) assert.ok(cfg.book.find((r) => r.id === id).move.every((m) => shoulu.includes(m)), `${id} is a 守炉 move`);
  // the gate: after 秦雁's step, at 八层 70%, at the 讲堂 — never once 看炉 is in the book or done
  const q4 = { 'guan-jiujie-1': { done_at: done }, 'guan-jiujie-2': { done_at: done }, 'guan-jiujie-3': { done_at: done }, 'guan-jiujie-4': { done_at: done } };
  assert.ok(!offeredAt(chainAt(8, 0.69, q4)).includes('guan-jiujie-4a'), '69%: shut');
  assert.ok(offeredAt(chainAt(8, 0.7, q4)).includes('guan-jiujie-4a'), '70%: 褚先生 offers it at the 讲堂');
  assert.ok(offeredAt(chainAt(9, 0.1, q4)).includes('guan-jiujie-4a'), 'a layer past it: open');
  const { 'guan-jiujie-4': _4, ...q3 } = q4;
  assert.ok(!offeredAt(chainAt(8, 0.9, q3)).includes('guan-jiujie-4a'), 'before 秦雁\'s step is done: shut');
  const past = { ...q4, 'guan-jiujie-5': { took: '2026-11-12', have: {} } };
  assert.ok(!offeredAt(chainAt(9, 0.5, past)).includes('guan-jiujie-4a'), 'a save with 看炉 taken: never offered the step behind it');
  assert.ok(!offeredAt(chainAt(9, 0.9, { ...past, 'guan-jiujie-5': { done_at: done } })).includes('guan-jiujie-4a'), '…nor one past it');
  // 看炉 waits for the step: at 药园 with 4 done and the step not, it is not offered
  const yao = (qs) => { const s = chainAt(9, 0.4, qs); s.place = 'yaoyuan'; return s; };
  assert.ok(!offeredAt(yao(q4)).includes('guan-jiujie-5'), '看炉 after the master\'s seal');
  assert.ok(offeredAt(yao({ ...q4, 'guan-jiujie-4a': { done_at: done } })).includes('guan-jiujie-5'));
});

test('the step is a lesson where a seal is owed, else a drill; the errand takes it at the 讲堂, the board hands it in, 看炉 follows; the weekly clock starts from the lesson', () => {
  // a seal he lacks (飞剑: no 讲堂 marks yet) is taught — the week's wait does not hold it back, even the day after another lesson
  const bare = at('jiangtang', { marks: [] });
  assert.equal(planView(content, bare, NOW, 'step').mode, 'lesson');
  assert.equal(planView(content, bare, NOW, 'step').seal.id, 'feijian');
  const withSeeds = at('jiangtang');
  const plan = planView(content, withSeeds, NOW, 'step');
  assert.equal(plan.mode, 'drill', 'the 讲堂 lesson behind him: the chain seals are known — the step is a drill');
  assert.deepEqual(plan.seals.map((r) => r.id).sort(), ['feijian', 'huodan'], 'of the seals the furnace uses');
  // with one learned and the second's spell not met: a drill of the one — the step is never a dead end
  const one = run(bare, { action: 'learn', id: 'feijian', how: 'tap' }).state;
  const p1 = planView(content, one, NOW, 'step');
  assert.equal(p1.mode, 'drill');
  assert.equal(p1.seals.length, 1);
  // the lesson (via the errand) counts as the week's: another seal is not due again for seven days
  const lesson = run(bare, { action: 'learn', id: 'feijian', how: 'hands', via: 'step' });
  assert.equal(lesson.result.ok, true);
  assert.equal(lesson.state.seals.book.feijian.via, 'step');
  assert.equal(daysSince(content, lesson.state, NOW), 0, 'the clock starts from it');
  // the errand: taken at the 讲堂, the step's board won and counted — the step is handed in at once
  const ctx = { now: NOW, quests: [] };
  const q4 = { 'guan-jiujie-1': { done_at: done }, 'guan-jiujie-2': { done_at: done }, 'guan-jiujie-3': { done_at: done }, 'guan-jiujie-4': { done_at: done } };
  const s = chainAt(8, 0.7, q4);
  const took = VERBS.quest(s, content, ctx, { action: 'take', id: 'guan-jiujie-4a' });
  assert.ok(took.state?.quests?.['guan-jiujie-4a'], JSON.stringify(took.result));
  const won = VERBS.win(took.state, content, ctx, { id: 'chuanyin-step' });
  assert.equal(won.result.ok, true, `the board stands at the 讲堂 for the errand: ${JSON.stringify(won.result)}`);
  const counted = VERBS.task(won.state, content, ctx, { action: 'done', id: 'chuanyin-step' });
  assert.equal(counted.result.ok, true, JSON.stringify(counted.result));
  // the board counted is the errand's hand-in (the 看炉 step does the same): the step pays like the chain's other labor
  assert.equal(counted.result.for, 'errand');
  assert.deepEqual(counted.result.handed.map((h) => h.id), ['guan-jiujie-4a']);
  assert.ok(counted.result.handed[0].paid.progress > 0 || counted.result.handed[0].paid.wealth > 0, 'a step paid like the chain\'s other labor');
  assert.ok(counted.state.quests['guan-jiujie-4a'].done_at);
  // …and 看炉 is next: put in the book by the hand-in if its share is reached, else offered by 闵丹师 at 药园
  const yaoyuan = { ...counted.state, place: 'yaoyuan', progress: Math.floor(0.4 * threshold(content, { ...counted.state, step: 9 })), step: 9 };
  assert.ok(offeredAt(yaoyuan).includes('guan-jiujie-5'));
});

test('the 印谱 sheet: a learned seal in full with its figures and strength, an outline with 「师父还没传」 where not taught; the 储物袋 shows the pane once he holds a seal', async () => {
  const { sealsHtml } = await import('../scripts/seals-page.js');
  const { pouchHtml } = await import('../scripts/pouch.js');
  const s = run(at(), { action: 'cast', casts: 'huodan:6', how: 'hands' }).state;
  const book = bookView(content, s, NOW);
  const html = sealsHtml(book);
  assert.match(html, /火弹印 · 熟 · 威力 \+10%/);
  assert.equal((html.match(/is-outline/g) ?? []).length, 4, 'four seals still to be taught');
  assert.equal((html.match(/师父还没传/g) ?? []).length, 4);
  assert.match(html, /<svg class="sfig"/);
  assert.match(html, /讲堂学过/);
  assert.match(sealsHtml(null), /loading/);
  // the gear read says the pane is there once he holds a seal, and not before
  const g1 = VERBS.gear(s, content, { now: NOW }).result.gear, g0 = VERBS.gear(at('jiangtang', { marks: [] }), content, { now: NOW }).result.gear;
  assert.equal(g1.seals, true);
  assert.equal(g0.seals, undefined);
  const panel = pouchHtml({ lang: 'zh', gear: { ...g1, bag: [], cards: [] }, look: {}, words: {} }, { pane: 'seals' });
  assert.match(panel, /data-pouch-pane="seals"/);
  assert.match(pouchHtml({ lang: 'zh', gear: { ...g1, bag: [], cards: [] }, look: {}, words: {}, sealBook: book }, { pane: 'seals' }), /火弹印 · 熟/);
});

test('the order the page keeps — the seal learned first, the board\'s win counted after — still counts at the 讲堂 (the day\'s deal stands once the lesson is passed)', () => {
  let lesson = null;
  for (let d = 12; d < 26 && !lesson; d += 1) for (const h of [6, 8, 10]) {
    const now = DAY(d, h), s = at('jiangtang');
    if (happeningTray(content, s, now).some((e) => e.happening === 'jiangtang-zaoke' && e.task === 'chuanyin-lesson')) { lesson = { now, s }; break; }
  }
  assert.ok(lesson, 'the lesson stands at the 讲堂 within a fortnight');
  const ctx = { now: lesson.now, quests: [] };
  const learned = VERBS.seals(lesson.s, content, ctx, { action: 'learn', id: 'bingzhui', how: 'tap' });
  assert.equal(learned.result.ok, true);
  const won = VERBS.win(learned.state, content, ctx, { id: 'chuanyin-lesson' });
  assert.equal(won.result.ok, true, `the win is counted where the deal stands: ${JSON.stringify(won.result)}`);
  const done = VERBS.task(won.state, content, ctx, { action: 'done', id: 'chuanyin-lesson' });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  assert.ok(done.result.paid.progress > 0);
  assert.ok(done.state.happen.at['jiangtang-zaoke'] && done.state.happen.last === 'chuanyin-lesson', 'the happening is gone to');
  assert.ok(done.state.seals.book.bingzhui, 'and the seal is in the book');
  // played through, the lesson is not dealt a second time the same day for another seal
  assert.notEqual(happeningTray(content, done.state, lesson.now).find((e) => e.happening === 'jiangtang-zaoke')?.task, 'chuanyin-lesson');
});

test('the lesson played through is not dealt again the same day: 卯 lesson, 辰 and 巳 something else (the stamp, not the last game, ends it)', () => {
  const h = content.happenings.happenings.find((x) => x.id === 'jiangtang-zaoke');
  const deal = (s, now) => dealOf(content, s, h, shichenOf(now), 'mac', metKinds(content, s))?.task;
  const s0 = at('jiangtang');
  assert.equal(deal(s0, DAY(12, 6)), 'chuanyin-lesson');
  const ctx = { now: DAY(12, 6), quests: [] };
  const learned = VERBS.seals(s0, content, ctx, { action: 'learn', id: 'bingzhui', how: 'tap' }).state;
  const won = VERBS.win(learned, content, ctx, { id: 'chuanyin-lesson' });
  const played = VERBS.task(won.state, content, ctx, { action: 'done', id: 'chuanyin-lesson' }).state;
  // the day's other games go by (any of them overwrites `happen.last`): the lesson still does not come back
  const later = { ...played, happen: { ...played.happen, last: 'jiangtang-shifa' } };
  for (const hour of [8, 10]) assert.notEqual(deal(later, DAY(12, hour)), 'chuanyin-lesson', `${hour}时: not again`);
  assert.notEqual(deal(played, DAY(12, 7)), 'chuanyin-lesson');
  assert.notEqual(deal(later, DAY(18, 9)), 'chuanyin-lesson', 'six days on: the week is not out');
  assert.equal(deal(later, DAY(19, 9)), 'chuanyin-lesson', 'the seventh: the next lesson');
  // …but a lesson passed and not yet played through (the app closed between) is still the deal that was made
  assert.equal(deal(learned, DAY(12, 6)), 'chuanyin-lesson');
});

test('a kit starts without waiting on the rules: a book that never answers costs the start a moment, never the game', async () => {
  const t0 = Date.now();
  const m = await masteryFor({ sealBook: () => new Promise(() => {}), sealed: async () => ({ ok: true }) }, { ms: 60 });
  assert.deepEqual(m.bonus, {});
  assert.ok(Date.now() - t0 < 1000, 'bounded');
  m.report('feijian'); m.flush(); // the casts still go
  const src = fs.readFileSync(new URL('../scripts/games/jieyin/mastery.js', import.meta.url), 'utf8');
  assert.match(src, /READ_MS = 1500/);
});

test('through the real door: the CLI plays plan, learn, cast and book on a temp save; Ling reads and is refused the writes; casts never reach the Undo log', async () => {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os'), path = await import('node:path');
  const ROOT = path.resolve(import.meta.dirname, '..'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-seals-'));
  try {
    const when = DAY(12, 9).toISOString();
    const state = at('jiangtang');
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(state));
    const cli = (reader, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args, ...(reader ? ['--for=ling'] : [])], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: when, LINGGEN_LANGUAGE: 'zh-Hans' },
    }).stdout);
    const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    const logged = () => (fs.existsSync(path.join(data, 'log.jsonl')) ? fs.readFileSync(path.join(data, 'log.jsonl'), 'utf8') : '');
    const plan = cli(false, 'seals', '--action=plan', '--intent=lesson');
    assert.equal(plan.ok, true);
    assert.equal(plan.mode, 'lesson');
    assert.equal(plan.seal.id, 'bingzhui');
    // Ling reads the book and the plan…
    assert.equal(cli(true, 'seals', '--action=book').ok, true);
    // …and is refused every write, the save untouched
    const before = JSON.stringify(saved().seals ?? null);
    for (const args of [['--action=learn', '--id=bingzhui', '--how=tap'], ['--action=cast', '--casts=huodan:3', '--how=hands']]) {
      const r = cli(true, 'seals', ...args);
      assert.deepEqual([r.ok, r.refused], [false, 'page-only'], args[0]);
    }
    assert.equal(JSON.stringify(saved().seals ?? null), before);
    // the page's writes, flags as the page sends them (`--k=v`, one word each)
    const learn = cli(false, 'seals', '--action=learn', '--id=bingzhui', '--how=tap', '--via=lesson');
    assert.equal(learn.ok, true, JSON.stringify(learn));
    assert.equal(saved().seals.book.bingzhui.hp, cfg.mastery.cast.tap);
    const cast = cli(false, 'seals', '--action=cast', '--casts=huodan:2,feijian:1', '--how=hands');
    assert.deepEqual(cast.gained, { huodan: 4, feijian: 2 });
    assert.equal(saved().seals.book.huodan.hp, 4);
    const book = cli(false, 'seals', '--action=book');
    assert.equal(book.rows.find((r) => r.id === 'bingzhui').head, '冰锥印 · 生');
    // Undo takes back moves: the learn and the casts are bookkeeping, never a line of its log
    assert.ok(!/"verb":"seals"/.test(logged()), 'no seals line in the Undo log');
    assert.equal(cli(false, 'seals', '--action=nope').refused, 'unknown-action');
  } finally { fs.rmSync(data, { recursive: true, force: true }); }
});

test('the drill pays one small game\'s worth at a lit 时辰, then it is gone from the row; a second play of it the same day pays the replay share', () => {
  const week = new Date(2026, 10, 9, 9).toISOString(); // a seal learned three days ago: the lesson is not due, the drill is
  const s0 = at('jiangtang', { seals: { book: { bingzhui: { at: week, via: 'lesson', hp: 2 } } }, happen: { kinds: { zhazhai: new Date(2026, 10, 12, 5).toISOString() } } });
  let lit = null;
  for (let d = 12; d < 26 && !lit; d += 1) for (const h of [6, 8, 10]) {
    const now = DAY(d, h);
    const row = happeningTray(content, s0, now).find((e) => e.happening === 'jiangtang-zaoke');
    if (row?.task === 'chuanyin-drill') { lit = { now, s: { ...s0, stamina_at: now.toISOString() } }; break; }
  }
  assert.ok(lit, 'the drill stands at the 讲堂 within a fortnight');
  const ctx = { now: lit.now, quests: [] };
  const won = VERBS.win(lit.s, content, ctx, { id: 'chuanyin-drill' });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  const done = VERBS.task(won.state, content, ctx, { action: 'done', id: 'chuanyin-drill' });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  const unit = storyPlay(content, lit.s);
  assert.ok(Math.abs(done.result.paid.progress - unit) <= 2, `one small game: ${done.result.paid.progress} vs ${unit}`);
  assert.ok(!happeningTray(content, done.state, lit.now).some((e) => e.happening === 'jiangtang-zaoke'), 'gone from the row for the 时辰');
  assert.equal(done.state.plays.ids['chuanyin-drill'], 1, 'counted once');
  const again = playGrant(content, done.state, 'chuanyin-drill', content.tasks.tasks.find((t) => t.id === 'chuanyin-drill'), lit.now);
  assert.ok(Math.abs(again.progress - Math.round(unit * 0.5)) <= 2, `a second play the same day pays the replay share: ${again.progress} vs ${unit}/2`);
});
