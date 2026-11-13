// 耗材's mechanics behind their knobs (design.md § 耗材 — what 灵石 and 体力 are for, 2026-11-12): the 秘境 paid once at the
// door (`mijing.door`) and its key switched off (`mijing.key_on`); 闭关 drawing on 灵石 — 聚灵, then 吐纳 (`julin`). Each at
// its non-neutral values in a fixture that sets the knob, and at the neutral values (NEUTRAL) the game as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState, threshold } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { keyDrop, mijingBrief, mijingDoors } from '../scripts/rules/mijing.mjs';
import { arrayHolds, julinBrief, julinPreview } from '../scripts/rules/seclusion.mjs';
import { convertRate } from '../scripts/rules/playpay.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { cardCatalog } from '../scripts/rules/cards.mjs';
import { lockReset } from '../scripts/state.mjs';
import { WORDS, cardHtml, trayHtml, bookPopHtml, itemDoes } from '../scripts/cards.js';
import { itemBrief } from '../scripts/rules/errands.mjs';

const content = loadContent();
const M = content.mijing;
const NOW = new Date(2026, 10, 12, 10, 0);
const at = h => new Date(NOW.getTime() + h * 3600_000);
const ctx = (now = NOW) => ({ now, quests: [] });

/* The world with some knobs moved (balance.json's derived blocks, as tools/master.mjs makes them). */
const withKnobs = ({ mijing = {}, julin = {} } = {}) => ({ ...content, balance: { ...content.balance, mijing: { ...content.balance.mijing, ...mijing }, julin: { ...content.balance.julin, ...julin } } });
const DOOR = withKnobs({ mijing: { door: 25, key_on: false } });
const JULIN = withKnobs({ julin: { on: true } });
const NEUTRAL = withKnobs({ mijing: { door: 0, key_on: true }, julin: { on: false } });
const call = (c, verb, s, args, now = NOW) => VERBS[verb](s, c, ctx(now), args);

test('the world ships the first numbers (design.md § 耗材): the door\'s 25 体力, no 秘境令, the 阵 on', () => {
  assert.deepEqual([content.balance.mijing.door, content.balance.mijing.key_on, content.balance.julin.on], [25, false, true]);
});

test('neutral: no door fee, the key asked, 闭关 without the 阵 — the game as it was', () => {
  const s = sitter();
  const info = call(NEUTRAL, 'seclude', s, { action: 'info' });
  assert.equal(info.result.choices.julin, undefined, 'no 阵 on the chooser');
  assert.equal(call(NEUTRAL, 'seclude', s, { action: 'array' }).result.refused, 'no-julin');
  assert.equal(call(NEUTRAL, 'seclude', s, { action: 'enter', focus: 'progress', stones: 5 }).result.refused, 'stones-need-progress');
});

let cached = null;
/* A save past 古五's 秘境 passage, at the stone door (tests/mijing.test.mjs atDoor). */
function atDoor(keys = 0) {
  if (!cached) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cached = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(cached);
  s.place = 'shimen';
  if (keys) s.bag[M.key] = keys; else delete s.bag[M.key];
  return s;
}

test('秘境 at the door: the fee whole or refused with the pool\'s words; rooms inside cost no 体力; the day\'s runs rationed', () => {
  const s = atDoor();
  s.stamina = 24; s.stamina_at = NOW.toISOString();
  const no = call(DOOR, 'mijing', s, { action: 'enter', tier: 1 });
  assert.equal(no.result.refused, 'no-stamina', 'short of the fee: refused, the last point\'s grace never stands here');
  assert.match(no.result.say, /体力耗尽了/);
  s.stamina = 25;
  const inn = call(DOOR, 'mijing', s, { action: 'enter', tier: 1 });
  assert.ok(inn.result.ok, JSON.stringify(inn.result));
  assert.equal(inn.state.stamina, 0, 'the fee taken whole');
  assert.equal(inn.state.mijing.run.door, 25, 'the run is stamped paid');
  // A first-row room: a board won and handed in, or a fight's door — no 体力 at 0, none refused.
  let r = inn.state;
  const first = r.mijing.run.map.layers[0];
  for (const room of first) {
    const went = call(DOOR, 'mijing', r, { action: 'go', room: room.id });
    assert.ok(went.result.ok);
    const here = went.state.mijing.run.room;
    if (here.phase === 'board') {
      const w = win(went.state, DOOR, ctx(), { id: here.board.task, stars: 3 });
      assert.ok(w.result.ok, JSON.stringify(w.result));
      const done = task(w.state, DOOR, ctx(), { action: 'done', id: here.board.task });
      assert.ok(done.result.ok, `a board room at 0 体力 is counted: ${JSON.stringify(done.result)}`);
      assert.equal(done.state.stamina, 0);
      const row = look(went.state, DOOR, ctx()).tasks?.find(t => t.id === here.board.task);
      if (row) assert.equal(row.door_paid, true, 'Look says the room\'s board is paid for');
      const lost = task(went.state, DOOR, ctx(), { action: 'lost', id: here.board.task });
      assert.equal(lost.result.stamina, 0, 'lost, it costs nothing more');
      r = done.state;
      break;
    }
    if (here.phase === 'fight') {
      const door = call(DOOR, 'duel', went.state, { id: `mijing:${room.id}` });
      assert.ok(door.result.ok, `a fight room's door at 0 体力: ${JSON.stringify(door.result)}`);
      assert.equal(door.state.stamina, 0);
      const picks = winningPicks(door.state.fight.setup, cardCatalog(DOOR), 40);
      r = call(DOOR, 'duel', door.state, { id: `mijing:${room.id}`, picks: picks.join(',') }).state;
      break;
    }
  }
  // The day's runs: `cap_day` begun, the door shut till tomorrow (no 秘境令 asked, none held).
  let t = call(DOOR, 'mijing', r, { action: 'leave' }).state;
  t.stamina = 100;
  assert.equal(mijingBrief(DOOR, t, NOW).runs_left, 1);
  t = call(DOOR, 'mijing', t, { action: 'enter', tier: 1 }).state;
  t = call(DOOR, 'mijing', t, { action: 'leave' }).state;
  t.stamina = 100;
  const third = call(DOOR, 'mijing', t, { action: 'enter', tier: 1 });
  assert.equal(third.result.refused, 'no-runs-left');
  assert.ok(call(DOOR, 'mijing', t, { action: 'enter', tier: 1 }, at(24)).result.ok, 'a new day, new runs');
});

test('the key off: none asked, none dropped, none shown; a 令 still held is ignored; the door\'s road opens on the day\'s runs', () => {
  const s = atDoor(11);
  s.stamina = 100;
  const inn = call(DOOR, 'mijing', s, { action: 'enter', tier: 1 });
  assert.ok(inn.result.ok);
  assert.equal(inn.state.bag[M.key], 11, 'the 令 in the bag is not spent');
  assert.equal(keyDrop(DOOR, structuredClone(s), ctx(), 'shouchao'), null, 'nothing drops');
  const b = mijingBrief(DOOR, s, NOW);
  assert.equal(b.keys, undefined); assert.equal(b.key_name, undefined);
  assert.deepEqual([b.runs_left, b.cap_day, b.door_cost], [2, 2, 25]);
  const html = cardHtml({ card: 'mijing' }, { look: { mijing: b }, lang: 'zh', words: WORDS.zh });
  assert.doesNotMatch(html, /秘境令/, 'the door card says nothing of keys');
  assert.match(html, /进门 体力 25/);
  const away = { ...s, place: 'waimen' };
  const brief = mijingBrief(DOOR, away, NOW);
  assert.deepEqual(brief, { away: true, door: brief.door, runs_left: 2, cap_day: 2, door_cost: 25 });
  assert.equal(brief.door.id, 'shimen');
  assert.equal(mijingBrief(DOOR, newState(DOOR, 'zh', NOW), NOW), null);
  assert.ok(mijingBrief(DOOR, inn.state, NOW).inside);
  const keyed = mijingBrief(NEUTRAL, away, NOW);
  assert.deepEqual(keyed, { away: true, keys: 11, key_name: keyed.key_name, door: brief.door });
  const view = look(away, DOOR, ctx());
  assert.ok((view.tray ?? []).some(r => r.id === 'mijing'));
  const page = { look: view, lang: 'zh', words: WORDS.zh };
  for (const html of [trayHtml(page), bookPopHtml(page)]) {
    assert.match(html, /今日还剩 2\/2 趟 · 进门 25 体力 · .*石门/);
    assert.match(html, /data-go="shimen"[^>]*>去[^<]*石门 ›/);
  }
  const spent = look({ ...away, mijing: { day: { day: dayKey(NOW), n: 2 } } }, DOOR, ctx());
  const spentPage = { ...page, look: spent };
  assert.match(bookPopHtml(spentPage), /今日的 2 趟已尽 · 明日再来/);
  assert.equal(spent.tray.find(r => r.id === 'mijing').act, undefined);
  assert.doesNotMatch(trayHtml(spentPage), /data-tray="mijing"/);
  const enView = look({ ...away, lang: 'en' }, DOOR, ctx());
  const enPage = { look: enView, lang: 'en', words: WORDS.en };
  for (const html of [trayHtml(enPage), bookPopHtml(enPage)]) {
    assert.match(html, /Hidden realm/);
    assert.match(html, /2 of 2 runs left today · 25 stamina at the door/);
  }
  const enSpent = look({ ...away, lang: 'en', mijing: { day: { day: dayKey(NOW), n: 2 } } }, DOOR, ctx());
  assert.match(bookPopHtml({ ...enPage, look: enSpent }), /Today&#39;s 2 runs are spent — tomorrow/);
  // The road to the door: open with a run left, though no 令 is held.
  const bare = atDoor(0);
  assert.deepEqual(mijingDoors(NEUTRAL, bare, NOW), [], 'key on, none held: shut');
  assert.deepEqual(mijingDoors(DOOR, bare, NOW), M.doors, 'key off: open on the day\'s runs');
});

test('fuel effect is carried to the item detail in both languages', () => {
  const item = { ...content.items.items.find(i => i.id === 'lutan'), id: 'other-fuel' };
  for (const lang of ['zh', 'en']) {
    const brief = itemBrief(content, { ...atDoor(), lang }, item);
    assert.deepEqual(brief.effect, { kailu: 'fuel' });
    assert.equal(itemDoes(brief.effect, { words: WORDS[lang] }), WORDS[lang].effFuel);
  }
});

/* A 练气九层 player with a purse (the 阵 holds 4% of 910 at its first level: 12 stones). */
function sitter(extra = {}) {
  return { ...newState(content, 'zh', NOW), name: '清玄', chapter: '03-qing', scene: null, place: 'sishui', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'qi', step: 9, progress: 100, wealth: 500, stamina: 100, stamina_at: NOW.toISOString(), ...extra };
}
const sit = (c, s, hours, args) => {
  const inn = call(c, 'seclude', s, { action: 'enter', focus: 'progress', ...args });
  assert.ok(inn.result.ok, JSON.stringify(inn.result));
  return { inn, out: call(c, 'seclude', inn.state, { action: 'leave' }, at(hours)) };
};

test('聚灵: the stones laid are drawn first at one pace, each its 修为; then 吐纳 at a trickle; out early, the rest back', () => {
  const s = sitter(), need = threshold(JULIN, s), J = JULIN.balance.julin;
  const holds = arrayHolds(JULIN, s);
  assert.equal(holds, Math.floor((J.array[0] * need) / J.per_stone));
  const b = julinBrief(JULIN, s, NOW);
  assert.deepEqual([b.level, b.holds, b.most, b.per_stone, b.hours], [1, holds, holds, J.per_stone, J.hours]);
  assert.equal(b.trickle, Math.max(1, Math.floor(J.trickle * need)));
  assert.deepEqual(b.presets, { none: 0, half: Math.floor(holds / 2), full: holds });
  assert.deepEqual(b.next, { level: 2, price: J.costs[1], holds: Math.floor((J.array[1] * need) / J.per_stone) });
  // A full 阵, out after `hours` + 2: all drawn, then two hours of 吐纳.
  const { inn, out } = sit(JULIN, s, J.hours + 2, { stones: holds });
  assert.equal(inn.state.wealth, 500 - holds, 'laid: out of the purse going in');
  const e = out.result.emerged;
  assert.deepEqual([e.progress.julin.drawn, e.progress.julin.back], [holds, 0]);
  assert.equal(e.progress.julin.stones, holds * J.per_stone, 'each stone its 修为, as it is (no 灵根 or 签 on it)');
  assert.equal(e.progress.julin.trickle, 2 * b.trickle);
  assert.equal(out.state.progress, 100 + holds * J.per_stone + 2 * b.trickle);
  assert.equal(out.state.wealth, 500 - holds);
  const pre = julinPreview(JULIN, s, NOW, holds);
  assert.deepEqual([pre.progress, pre.hours], [holds * J.per_stone, J.hours], 'the preview is what lands');
  // Out after half the hours: half drawn, half handed back; under `min_hours` still drawn (real hours), no 吐纳.
  const half = sit(JULIN, s, J.hours / 2, { stones: holds }).out;
  assert.equal(half.result.emerged.progress.julin.drawn, Math.floor(holds / 2));
  assert.equal(half.result.emerged.progress.julin.back, holds - Math.floor(holds / 2));
  assert.equal(half.state.wealth, 500 - Math.floor(holds / 2));
  const short = sit(JULIN, s, 0.5, { stones: holds }).out.result.emerged;
  assert.equal(short.grows, false);
  assert.equal(short.progress.julin.drawn, Math.floor(0.5 * holds / J.hours));
  assert.equal(short.progress.julin.trickle, 0, 'under min_hours no 吐纳');
  // None laid: 吐纳 alone, the old night's rate gone.
  const bare = sit(JULIN, s, 8, {}).out.result.emerged;
  assert.equal(bare.progress.julin.drawn, 0);
  assert.equal(bare.progress.paid, 8 * b.trickle);
});

test('聚灵 never past the bar: stones it cannot take are not drawn and come back', () => {
  const s0 = sitter(), need = threshold(JULIN, s0);
  const s = sitter({ progress: need - 7 }), holds = arrayHolds(JULIN, s), per = JULIN.balance.julin.per_stone;
  const pre = julinPreview(JULIN, s, NOW, holds);
  assert.equal(pre.progress, Math.floor(7 / per) * per);
  const { out } = sit(JULIN, s, JULIN.balance.julin.hours, { stones: holds });
  const j = out.result.emerged.progress.julin;
  assert.equal(j.drawn, Math.floor(7 / per));
  assert.equal(j.back, holds - j.drawn);
  assert.equal(out.state.wealth - (out.result.emerged.progress.converted?.wealth ?? 0), 500 - j.drawn);
  assert.ok(out.state.progress <= need);
  // No loop: a stone buys less 修为 than the 灵石 a full bar pays back for it.
  assert.ok(per * convertRate(JULIN, s) < 1, `${per} 修为 a stone × ${convertRate(JULIN, s)} 灵石 a 修为 past the bar`);
});

test('聚灵 previews: one per preset, the rules\' own julinPreview; none is 吐纳 alone; a full 阵 past the bar carries back', () => {
  const s = sitter(), b = julinBrief(JULIN, s, NOW);
  assert.deepEqual(Object.keys(b.previews), Object.keys(b.presets));
  for (const [k, n] of Object.entries(b.presets)) assert.deepEqual(b.previews[k], julinPreview(JULIN, s, NOW, n), `${k} is julinPreview of ${n}`);
  assert.deepEqual(b.previews.none, { stones: 0, hours: 0, progress: 0, trickle: b.trickle }, 'none: no stones, the 吐纳 rate');
  assert.equal(b.previews.full.back, undefined, 'room enough: nothing handed back');
  const tight = sitter({ progress: threshold(JULIN, s) - 7 }), t = julinBrief(JULIN, tight, NOW), per = JULIN.balance.julin.per_stone;
  assert.equal(t.previews.full.back, t.presets.full - Math.floor(7 / per), 'a full 阵 past the bar: the rest comes back');
  assert.deepEqual(t.previews.full, julinPreview(JULIN, tight, NOW, t.presets.full));
});

test('聚灵 chooser: the page\'s preview line is the rules\' `previews`, whichever preset is picked', () => {
  const tight = sitter({ progress: threshold(JULIN, sitter()) - 7 });
  const j = julinBrief(JULIN, tight, NOW), w = WORDS.zh;
  for (const [k, pv] of Object.entries(j.previews)) {
    const html = cardHtml({ card: 'seclude' }, { seclude: { julin: j, rule: {}, pills: [] }, secludeFocus: { focus: 'progress' }, secludeStones: j.presets[k], lang: 'zh', words: w });
    const want = pv.stones > 0 ? w.secludePreview.replace('{n}', pv.stones).replace('{h}', String(Math.round(pv.hours * 10) / 10)).replace('{p}', pv.progress).replace('{t}', pv.trickle) : w.secludePreviewNone.replace('{t}', pv.trickle);
    assert.ok(html.includes(want), `${k}: ${want}`);
    assert.equal(html.includes(w.secludePreviewBack.replace('{back}', pv.back)), Boolean(pv.back), `${k}: the 退回 note only with back`);
  }
});

test('the day\'s cap is shared by several 闭关; laying more than the 阵, the day or the purse allows is refused', () => {
  const s = sitter(), holds = arrayHolds(JULIN, s);
  assert.equal(call(JULIN, 'seclude', s, { action: 'enter', focus: 'progress', stones: holds + 1 }).result.refused, 'too-many-stones');
  assert.equal(call(JULIN, 'seclude', sitter({ wealth: 3 }), { action: 'enter', focus: 'progress', stones: 4 }).result.refused, 'too-many-stones');
  assert.equal(call(JULIN, 'seclude', s, { action: 'enter', focus: 'treasure', stones: 2 }).result.refused, 'stones-need-progress');
  const a = sit(JULIN, s, 1, { stones: 4 }).out.state; // short: all 4 drawn in 1 h? at holds / hours a h
  const drawn = Math.min(4, Math.floor(holds / JULIN.balance.julin.hours));
  assert.equal(julinBrief(JULIN, a, at(1)).left_today, holds - drawn, 'what the first drew counts against the day');
  assert.equal(call(JULIN, 'seclude', a, { action: 'enter', focus: 'progress', stones: holds - drawn + 1 }, at(1)).result.refused, 'too-many-stones');
  assert.ok(call(JULIN, 'seclude', a, { action: 'enter', focus: 'progress', stones: holds - drawn }, at(1)).result.ok);
  assert.equal(julinBrief(JULIN, a, at(24)).left_today, holds, 'a new day, the 阵 whole again');
});

test('the 阵 grows: a level bought once each at its climbing price; refused plainly when he cannot pay', () => {
  const J = JULIN.balance.julin;
  assert.deepEqual(J.costs.slice(1), [100, 200, 400, 800], 'the first numbers: 40 minutes of 练气一层\'s income, doubling');
  const poor = call(JULIN, 'seclude', sitter({ wealth: 99 }), { action: 'array' });
  assert.equal(poor.result.refused, 'too-poor');
  assert.match(poor.result.say, /灵石不够：要 100，囊中 99/);
  let s = sitter({ wealth: 1500 });
  for (let lv = 2; lv <= J.array.length; lv++) {
    const r = call(JULIN, 'seclude', s, { action: 'array' });
    assert.ok(r.result.ok, JSON.stringify(r.result));
    assert.equal(r.result.level, lv);
    s = r.state;
  }
  assert.equal(s.wealth, 0);
  assert.equal(arrayHolds(JULIN, s), Math.floor((J.array.at(-1) * threshold(JULIN, s)) / J.per_stone), 'the full 阵: 8% of 练气九层 (24 at 910)');
  assert.equal(call(JULIN, 'seclude', { ...s, wealth: 9999 }, { action: 'array' }).result.refused, 'array-top');
});

test('Look carries the 阵\'s facts and the card draws the choice; a sitting dropped behind a gate hands its stones back', () => {
  const s = sitter();
  const view = look(s, JULIN, ctx());
  assert.equal(view.julin?.holds, arrayHolds(JULIN, s));
  assert.equal(look(s, NEUTRAL, ctx()).julin, undefined, 'neutral: none');
  const choices = call(JULIN, 'seclude', s, { action: 'info' }).result.choices;
  const html = cardHtml({ card: 'seclude' }, { lang: 'zh', words: WORDS.zh, seclude: choices, secludeFocus: { focus: 'progress' }, look: view });
  assert.match(html, new RegExp(`布 ${choices.julin.holds} 块：约 ${JULIN.balance.julin.hours} 小时吸尽，修为 \\+${choices.julin.holds * 3}；之后吐纳，每小时 \\+${choices.julin.trickle}`));
  assert.match(html, /data-seclude-array/);
  assert.match(html, /扩阵 · 100 灵石/);
  // The rules drop a sitting behind a story gate that shuts 闭关 (state.mjs lockReset): the stones come back.
  const inn = call(JULIN, 'seclude', s, { action: 'enter', focus: 'progress', stones: 6 }).state;
  const fresh = newState(content, 'zh', NOW);
  const fix = lockReset(JULIN, { ...inn, chapter: fresh.chapter, scene: fresh.scene, place: fresh.place, ended: [], done_scenes: [] });
  assert.ok('seclusion' in fix, 'the sitting is dropped');
  assert.equal(fix.julin.drawn, 0, 'the day\'s draw given back');
  assert.equal(fix.wealth, 0, 'there the purse itself is shut (灵石 before 入门 are none)');
});

test('the shipped world through Look: at the door the day\'s runs and the fee, no key; inside a paid run at 0 体力 the run stands, no spent-pool card', async () => {
  const { stageCards } = await import('../scripts/stage.mjs');
  const s = { ...atDoor(5), stamina: 25, stamina_at: NOW.toISOString() };
  const door = look(s, content, ctx());
  assert.deepEqual([door.mijing.door, door.mijing.runs_left, door.mijing.door_cost, door.mijing.keys], [true, 2, 25, undefined]);
  assert.ok(stageCards(door).some(c => c.card === 'mijing'), 'the door\'s card on the stage');
  const html = cardHtml({ card: 'mijing' }, { look: door, lang: 'zh', words: WORDS.zh });
  assert.match(html, /data-mijing="enter" data-tier="1">/, 'the way in open');
  const inn = call(content, 'mijing', s, { action: 'enter', tier: 1 });
  assert.equal(inn.state.stamina, 0);
  const inside = look(inn.state, content, ctx());
  assert.ok(inside.mijing.inside);
  const cards = stageCards(inside).map(c => c.card);
  assert.ok(cards.includes('mijing') && !cards.includes('empty'), `the run's card stands, no spent-pool card: ${cards}`);
  assert.equal(inside.mijing.door_paid, 25);
});

test('the command line takes the 阵: `seclude --action=array` and `--stones=N` on a save on disk', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), { spawnSync } = await import('node:child_process');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-julin-'));
  try {
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(sitter({ wealth: 150 })));
    const cli = (now, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: now.toISOString() }, encoding: 'utf8' }).stdout);
    const up = cli(NOW, 'seclude', '--action=array');
    assert.deepEqual([up.ok, up.level, up.price], [true, 2, 100]);
    const holds = up.julin.holds;
    const inn = cli(NOW, 'seclude', '--action=enter', '--focus=progress', `--stones=${holds}`);
    assert.equal(inn.ok, true, JSON.stringify(inn));
    const out = cli(at(content.balance.julin.hours), 'seclude', '--action=leave');
    assert.equal(out.emerged.progress.julin.drawn, holds);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    assert.equal(saved.julin.level, 2);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
