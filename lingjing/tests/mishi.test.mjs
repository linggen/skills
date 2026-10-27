// 密室 (Hanli, 2026-10-15): the hidden room — asymmetric with 银月. Her pages ride her own read
// (Progress --for=yinyue) and never Look or the page's Progress; the rules deal a seeded solution
// and check every input; the written hint only after he asked her and the wait went by; the gated
// skip; pay once a week per room (less after), nothing after a skip; the day's limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { checkInput, dealRoom, herMishi, look, mishi, mishiData, mishiOffer, mishiRoll, playTo, targetOf } from '../scripts/rules.mjs';
import { STEMS, BRANCHES, LUOSHU, ORIENTS, WEN_IDS, yearIndex } from '../scripts/rules/mishi.mjs';
import { WEN } from '../scripts/games/wen.js';
import { stageCards } from '../scripts/stage.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const data = mishiData(content);
const NOW = new Date('2026-10-15T09:00:00+08:00');
const later = (ms) => new Date(NOW.getTime() + ms);

/* A save at 古五 standing at 藏经阁 (the room's door). */
const base = (() => {
  const out = playTo(content, newState(content, 'zh', NOW), '古五', { now: NOW, policy: 'win' });
  return { ...out.state, place: 'cangjing' };
})();
const ctxAt = (now) => ({ now, quests: [] });
const run = (s, args, now = NOW) => mishi(s, content, ctxAt(now), args);
const answerOf = (v) => (v.kind === 'dial' ? `${v.answer.s},${v.answer.b}` : v.answer.join(','));
const dealtOf = (s) => dealRoom(data, data.rooms.find((r) => r.id === s.mishi.room), s.mishi.seed, s.lang);
const herTexts = (s, now = NOW) => (herMishi(content, s, now)?.pages ?? []).map((p) => p.text);

function opened(s = base, now = NOW) {
  const r = run(s, { action: 'open', task: 'mishi' }, now);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  return r.state;
}
/* Every mechanism solved by the dealt answer, in order. */
function solveAll(s, now = NOW) {
  let st = s, last = null;
  for (const v of dealtOf(s)) {
    last = run(st, { action: 'try', input: answerOf(v) }, now);
    assert.equal(last.result.right, true, JSON.stringify(last.result));
    st = last.state;
  }
  return { state: st, result: last.result };
}

test('the data: rooms declared (at least two), each 2–3 mechanisms of known kinds, both languages, every room reachable by an entry', () => {
  assert.ok(data.rooms.length >= 2);
  const reach = new Set(data.entries.flatMap((e) => e.rooms));
  for (const room of data.rooms) {
    assert.ok(reach.has(room.id), room.id);
    assert.ok(room.puzzles.length >= 2 && room.puzzles.length <= 3, room.id);
    for (const p of room.puzzles) {
      assert.ok(['dial', 'hand', 'luoshu', 'stars', 'scroll'].includes(p.kind), p.kind);
      for (const k of ['his', 'her', 'hint', 'right']) for (const l of ['zh', 'en']) assert.ok(p[k]?.[l], `${room.id} ${p.kind} ${k}.${l}`);
    }
  }
  for (const e of data.entries) assert.ok(content.tasks.tasks.some((t) => t.id === e.task), e.task);
});

test('the knowledge is the game\'s own: the 文 are wen.js\'s, the 洛书 is 戴九履一 and every lid a magic square, every 干支 year a real one', () => {
  assert.deepEqual(WEN_IDS, WEN.map((w) => w.id));
  assert.equal(LUOSHU[1], 9); assert.equal(LUOSHU[7], 1); assert.equal(LUOSHU[3], 3); assert.equal(LUOSHU[5], 7);
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const g of ORIENTS) assert.ok(lines.every((l) => l.reduce((a, i) => a + g[i], 0) === 15));
  for (const room of data.rooms) for (let n = 0; n < 40; n += 1) {
    for (const v of dealRoom(data, room, `s${n}|${room.id}`, 'zh')) {
      if (v.kind === 'dial') assert.ok(yearIndex(v.answer.s, v.answer.b) >= 0);
      if (v.kind === 'hand') assert.equal(new Set(v.answer).size, 3);
      if (v.kind === 'luoshu') assert.equal(new Set(v.answer).size, 3);
      if (v.kind === 'scroll') for (const col of v.page.cols) assert.ok(yearIndex(STEMS.indexOf(col[0]), BRANCHES.indexOf(col[1])) >= 0, col.join(''));
    }
  }
});

test('linked: the hand\'s first 文 is the branch of the year the dial opened on; the dial after the scroll begins from the year read', () => {
  const jiabi = data.rooms.find((r) => r.id === 'cangjing-jiabi'), shuku = data.rooms.find((r) => r.id === 'cangjing-shuku');
  for (let n = 0; n < 20; n += 1) {
    const [dial, hand] = dealRoom(data, jiabi, `x${n}`, 'zh');
    assert.equal(hand.answer[0], WEN_IDS[dial.year % 12]);
    const [, scroll, dial2] = dealRoom(data, shuku, `x${n}`, 'zh');
    assert.equal((scroll.year + dial2.vars.n) % 60, dial2.year);
  }
});

test('seeded: the same save, room and day deal the same; another day deals another', () => {
  const room = data.rooms[0];
  assert.deepEqual(dealRoom(data, room, 'a|r|2026-10-15', 'zh'), dealRoom(data, room, 'a|r|2026-10-15', 'zh'));
  const days = new Set(Array.from({ length: 8 }, (_, i) => JSON.stringify(dealRoom(data, room, `a|r|2026-10-${10 + i}`, 'zh').map((v) => v.answer))));
  assert.ok(days.size >= 6, `${days.size} of 8 differ`);
});

test('the door stands at 藏经阁 as a board; nothing of the room anywhere else', () => {
  const lk = look(base, content, ctxAt(NOW));
  assert.deepEqual(lk.mishi, { task: 'mishi', door: true, left_today: data.limits.per_day });
  assert.ok(lk.tasks.some((t) => t.id === 'mishi' && t.status === 'offered'));
  assert.ok(stageCards(lk).some((c) => c.card === 'board' && c.id === 'mishi'));
  const away = look({ ...base, place: 'waimen' }, content, ctxAt(NOW));
  assert.equal(away.mishi, undefined);
  assert.ok(!away.tasks.some((t) => t.id === 'mishi'));
});

test('her pages never reach Look (the page\'s or Ling\'s): only her own tool carries them, one more as each mechanism gives way', () => {
  let s = opened();
  for (let step = 0; step < 3; step += 1) {
    const texts = herTexts(s);
    assert.equal(texts.length, step + 1);
    const seen = JSON.stringify(look(s, content, ctxAt(NOW)));
    for (const t of texts) {
      assert.ok(!seen.includes(t), `her page in Look: ${t}`);
      // …not even its quoted body (the words inside 『』).
      const body = /『(.+)』/.exec(t)?.[1];
      if (body) assert.ok(!seen.includes(body));
    }
    const v = dealtOf(s)[step];
    s = run(s, { action: 'try', input: answerOf(v) }).state;
  }
});

test('the CLI: her tool (Mishi, --for=yinyue) reads her pages; Look, Progress, the page\'s door and Ling never do', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mishi-'));
  const env = { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString(), LINGJING_STAMINA_LIMIT: '0' };
  const cli = (...a) => { const r = spawnSync('node', [path.join(ROOT, 'scripts/rules.mjs'), ...a, '--save=mishi-t'], { env, encoding: 'utf8' }); return JSON.parse(r.stdout); };
  try {
    assert.equal(cli('seed', '--at=古五').ok, true);
    cli('move', '--place=cangjing');
    assert.equal(cli('mishi', '--action=open', '--task=mishi').ok, true);
    const hers = cli('mishi', '--action=read', '--for=yinyue');
    assert.ok(hers.ok && hers.pages?.length === 1 && hers.how, JSON.stringify(hers));
    assert.equal(Object.keys(hers)[0], 'how');
    const text = hers.pages[0].text;
    for (const out of [cli('look'), cli('look', '--for=ling', '--said=看看'), cli('progress'), cli('progress', '--for=yinyue'), cli('mishi'), cli('mishi', '--action=try', '--input=0')]) {
      assert.ok(!JSON.stringify(out).includes(text), 'her page leaked');
    }
    // Her read answers her alone: the page's door and Ling are refused.
    assert.equal(cli('mishi', '--action=read').refused, 'hers');
    assert.equal(cli('mishi', '--action=read', '--for=ling').refused, 'hers');
    // What another member (Ling) reads of her call: only these keys (SKILL.md others_read).
    const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
    const tool = md.slice(md.indexOf('  - name: Mishi'), md.indexOf('  - name: Tame'));
    assert.match(tool, /others_read: \[open, room, step, of\]/);
    assert.match(tool, /--for=yinyue/);
    assert.match(tool, /page_only: true/);
    // Ling may read the room but never move it: the taps are the page's.
    assert.equal(cli('mishi', '--action=try', '--input=0', '--for=ling').refused, 'page-only');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every input is checked: a wrong one counts and moves nothing; the dealt answer opens the next', () => {
  const s = opened();
  const v = dealtOf(s)[0];
  const wrong = run(s, { action: 'try', input: v.kind === 'stars' ? String((v.answer[0] + 1) % 28) : '0,1' });
  assert.equal(wrong.result.right, false);
  assert.equal(wrong.state.mishi.step, 0);
  assert.equal(wrong.state.mishi.wrong, 1);
  const right = run(wrong.state, { action: 'try', input: answerOf(v) });
  assert.equal(right.result.right, true);
  assert.equal(right.state.mishi.step, 1);
  assert.equal(right.state.mishi.wrong, 0);
  assert.ok(checkInput(v, answerOf(v)));
  // A stale tap (a step already passed) changes nothing.
  assert.equal(run(right.state, { action: 'try', step: 0, input: answerOf(v) }).result.refused, 'stale');
});

test('the hint: never before he asked her; after asking, only once the wait went by; then on the page, her half paraphrased', () => {
  const s = opened();
  assert.equal(run(s, { action: 'hint' }).result.refused, 'too-soon');
  const asked = run(s, { action: 'asked' }).state;
  assert.equal(run(asked, { action: 'hint' }, later(5000)).result.refused, 'too-soon');
  const wait = data.limits.hint_wait_s * 1000;
  const r = run(asked, { action: 'hint' }, later(wait + 1));
  assert.equal(r.result.ok, true);
  assert.ok(r.result.hint && !herTexts(asked).includes(r.result.hint));
  const lk = look(r.state, content, ctxAt(later(wait + 2)));
  assert.equal(lk.mishi.puzzles[0].hint, r.result.hint);
  assert.equal(lk.mishi.hint_at, new Date(NOW.getTime() + wait).toISOString());
});

test('no way in is a trap: 跳过这一道 stands on every mechanism of every room from the start, and 收手 (Look\'s task `leave`) on the board', () => {
  for (const room of data.rooms.filter((r) => r.id.startsWith('cangjing'))) {
    let s = opened({ ...base, mishi_log: { day: null, n: 0, paid: Object.fromEntries(data.rooms.filter((r) => r.id !== room.id).map((r) => [r.id, NOW.toISOString()])) } });
    assert.equal(s.mishi.room, room.id);
    for (let step = 0; step < room.puzzles.length; step += 1) {
      const lk = look(s, content, ctxAt(NOW));
      assert.equal(lk.mishi.can_skip, true, `${room.id} ${step}`);
      assert.equal(lk.tasks.find((t) => t.id === 'mishi')?.leave, true, `${room.id} ${step}: 收手`);
      s = run(s, { action: 'skip' }).state;
    }
    assert.equal(s.mishi.done, true);
  }
});

test('跳过这一道 opens the mechanism at once, and the room then pays nothing', () => {
  let s = opened();
  s = run(s, { action: 'skip' }).state;
  assert.equal(s.mishi.step, 1);
  const v = dealtOf(s);
  let st = s;
  for (let i = 1; i < v.length; i += 1) st = run(st, { action: 'try', input: answerOf(v[i]) }).state;
  assert.equal(st.mishi.done, true);
  assert.equal(st.wealth, s.wealth);
  assert.equal(look(st, content, ctxAt(NOW)).mishi.escaped, false);
  const out = run(st, { action: 'leave' }).state;
  assert.equal(out.tasks.mishi.status, 'done');
  assert.equal(out.tasks.mishi.skipped, true);
});

test('pay on escape: 灵石 and the find, recorded; the same room within the week pays a part and no find; the board is done for the day', () => {
  const s = opened();
  const { state, result } = solveAll(s);
  assert.equal(result.escaped, true);
  const room = data.rooms.find((r) => r.id === s.mishi.room);
  assert.equal(result.paid.wealth, data.pay.grant.wealth);
  assert.equal(state.wealth, s.wealth + data.pay.grant.wealth);
  assert.equal(state.bag[room.find.item] ?? 0, (s.bag[room.find.item] ?? 0) + (room.find.n ?? 1));
  assert.ok(state.mishi_log.paid[room.id]);
  // The board stands with what he found until 出去; then it is done for the day, nothing of the room left.
  const shown = look(state, content, ctxAt(NOW)).mishi;
  assert.equal(shown.escaped, true);
  assert.equal(shown.paid.wealth, data.pay.grant.wealth);
  assert.equal(run(state, { action: 'open', task: 'mishi' }).result.refused, 'done-today');
  const left = run(state, { action: 'leave' }).state;
  assert.equal(left.tasks.mishi.status, 'done');
  assert.equal(look(left, content, ctxAt(NOW)).mishi, undefined);
  assert.ok(!look(left, content, ctxAt(NOW)).tasks.some((t) => t.id === 'mishi' && t.status === 'offered'));
  assert.equal(run(left, { action: 'open', task: 'mishi' }).result.refused, 'not-here');
  // Tomorrow the door is back; the same room (forced) pays a quarter and no find.
  const tomorrow = later(864e5);
  const next = { ...left, mishi_log: { ...state.mishi_log, paid: Object.fromEntries(data.entries[0].rooms.map((r) => [r, NOW.toISOString()])) } };
  const s2 = opened(next, tomorrow);
  const again = solveAll(s2, tomorrow);
  assert.equal(again.result.paid.repeat, true);
  assert.equal(again.result.paid.wealth, Math.round(data.pay.grant.wealth * data.limits.repeat.factor));
  assert.equal(again.result.paid.item, null);
});

test('a room not paid this week is chosen first', () => {
  const [a, b] = data.entries[0].rooms;
  const s = opened({ ...base, mishi_log: { day: null, n: 0, paid: { [a]: NOW.toISOString() } } });
  assert.equal(s.mishi.room, b);
});

test('the day\'s limit: per_day rooms entered, then refused until tomorrow', () => {
  const full = { ...base, mishi_log: { day: dayKey(NOW), n: data.limits.per_day, paid: {} } };
  assert.equal(run(full, { action: 'open', task: 'mishi' }).result.refused, 'limit-today');
  assert.equal(run(full, { action: 'open', task: 'mishi' }, later(864e5)).result.ok, true);
  // A room open is resumed, never counted twice.
  const s = opened();
  const again = run(s, { action: 'open', task: 'mishi' });
  assert.equal(again.result.resumed, true);
  assert.equal(again.state, null);
});

test('the rerun hook: a roll by its seed at the declared chance; the day\'s limit holds it back', () => {
  const hits = Array.from({ length: 400 }, (_, i) => mishiRoll(content, base, { seed: `r${i}`, now: NOW })).filter(Boolean);
  const chance = data.entries.find((e) => e.rerun).chance;
  assert.ok(Math.abs(hits.length / 400 - chance) < 0.08, `${hits.length}/400`);
  assert.equal(hits[0].task, 'mishi-mijing');
  // Offered there for the day — but only while a run is on (the real run: the test below).
  const at = { ...mishiOffer(content, base, { place: 'shimen', now: NOW }), place: 'shimen' };
  assert.equal(at.mishi_offer.task, 'mishi-mijing');
  assert.equal(look(at, content, ctxAt(NOW)).mishi, undefined);
  const full = { ...base, mishi_log: { day: dayKey(NOW), n: data.limits.per_day, paid: {} } };
  assert.ok(Array.from({ length: 50 }, (_, i) => mishiRoll(content, full, { seed: `r${i}`, now: NOW })).every((x) => x === null));
});

test('the board (games/mishi.js): drawn from Look alone, its tries go to the rules, the torn page offered only after the wait with no word from her', async () => {
  const mod = await import('../scripts/games/mishi.js');
  let s = opened();
  const lk = look(s, content, ctxAt(NOW));
  let g = mod.fromLook(mod.newGame('x'), lk, { task: 'mishi', present: true });
  const drawn = mod.html(g, 'zh');
  for (const t of herTexts(s)) assert.ok(!drawn.includes(t));
  assert.ok(drawn.includes('data-g="her"') && !drawn.includes('data-g="hint"'));
  // A try is never judged here: it is a verb for the rules.
  const v = dealtOf(s)[0];
  if (v.kind === 'stars') g = mod.act(g, { g: 'pick', i: v.answer[0] }).state;
  else g = { ...g, dial: v.answer };
  const tried = mod.act(g, { g: 'try' });
  assert.equal(tried.send.verb, 'mishi');
  assert.equal(tried.send.args.action, 'try');
  assert.equal(run(s, tried.send.args).result.right, true);
  // Asked: the clock runs; she speaks — no torn page; she does not — the page offers it once the rules allow.
  assert.equal(mod.act(g, { g: 'her' }).her, true);
  let w = mod.heard(g, { her: 'asked' });
  assert.equal(w.live, true);
  assert.equal(mod.heard(w, { her: 'spoke' }).spoke, true);
  // (the board reads the real clock against `hint_at`: asked a minute before now)
  const asked = { ...s, mishi: { ...s.mishi, asked_at: new Date(Date.now() - 60_000).toISOString() } };
  w = mod.fromLook(w, look(asked, content, ctxAt(NOW)), { task: 'mishi', present: true });
  w = mod.tick(w, (data.limits.hint_wait_s + 1) * 1000 + 10);
  assert.equal(w.live, false);
  assert.ok(mod.html(w, 'zh').includes('data-g="hint"'));
  // She answered within the wait: no torn page, though the rules' wait has gone by too.
  let spoke = mod.fromLook(mod.heard(mod.heard(g, { her: 'asked' }), { her: 'spoke' }), look(asked, content, ctxAt(NOW)), { task: 'mishi', present: true });
  spoke = mod.tick(spoke, (data.limits.hint_wait_s + 1) * 1000 + 10);
  assert.ok(!mod.html(spoke, 'zh').includes('data-g="hint"'));
});

test('a real 秘境 rerun: a run with no cache may roll the 暗室 into one of its rooms (rules/rerun.mjs enterRun calls the hook)', async () => {
  const { rerun } = await import('../scripts/rules.mjs');
  const beat = content.chapters['00-waimen'].beats.find((b) => b.sealed?.rerun), x = beat.sealed.rerun;
  const start = new Date('2026-10-15T09:00:00+08:00');
  const played = playTo(content, newState(content, 'zh', start), 'wm-qianye', { now: start }).state;
  const open = new Date(new Date(played.reruns[beat.id].ended_at).getTime() + x.every_h * 3600000);
  let hit = null;
  for (let i = 0; i < 60 && !hit; i += 1) {
    const s = { ...structuredClone(played), seed: `anshi-${i}`, place: x.door, stamina: 100, stamina_at: open.toISOString() };
    const r = rerun(s, content, ctxAt(open), { action: 'enter' });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    if (r.state.mishi_offer) hit = r.state;
    else assert.ok(true);
  }
  assert.ok(hit, 'some run in sixty rolls a 暗室');
  assert.ok(!Object.values(hit.rerun.rooms).some((r) => r.cache), 'instead of a cache');
  assert.ok(x.rooms.includes(hit.mishi_offer.place));
  const there = { ...hit, place: hit.mishi_offer.place };
  const lk = look(there, content, ctxAt(open));
  assert.equal(lk.mishi?.task, 'mishi-mijing');
  assert.ok(lk.tasks.some((t) => t.id === 'mishi-mijing' && t.status === 'offered'));
  const inRoom = mishi(there, content, ctxAt(open), { action: 'open' });
  assert.equal(inRoom.result.opened, 'mijing-anshi');
});
