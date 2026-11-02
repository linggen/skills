// 对对子 (rules/duizi.mjs, scripts/couplet.js; design.md § AI mini-games, Hanli 2026-10-16).
// The rules own the form (length, the 下联's last tone under 新韵, no character at the
// same place, no copying) and the outcome (marks, pay, the ladder, the day's limits);
// Ling grades only the rubric, 0–2 each. These check what the RULES own — her taste
// cannot be unit-tested: guide/duizi.md is her rubric, and the live check grades one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, playTo, VERBS } from '../scripts/rules.mjs';
import { checkCouplet, checkUpper, hanOf, toneOf } from '../scripts/couplet.js';
import { markFor } from '../scripts/rules/duizi.mjs';
import { drawPool, shichenOf } from '../scripts/rules/pool.mjs';
import { PLAY_KINDS } from '../scripts/rules/aside.mjs';
import { stageCards } from '../scripts/stage.mjs';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { topics, guideText } from '../scripts/rules/guide.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const cfg = content.aigames.duizi, tones = content.tones;
const NOW = new Date('2026-10-15T09:00:00+08:00'); // the day the AI games' tests play 古七 to (a seeded playthrough)
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const nextDay = (n = 1) => ctx({ now: new Date(NOW.getTime() + n * 86400000) });

/* 古七's opening (古六's 掐诀 lesson behind him), at the 讲堂 — 银月 asleep in the token, as in 卷一. */
const played = playTo(content, newState(content, 'zh', NOW), '古七', { now: NOW }).state;
const base = { ...played, place: 'jiangtang', scene: null };
const awake = (() => { const { asleep, ...c } = base.companion; return { ...base, companion: { ...c, awake: true } }; })();

const run = (state, args, c = ctx()) => {
  const out = VERBS.duizi(state, content, c, args);
  return { s: out.state ?? state, r: out.result };
};
const must = (state, args, c) => {
  const out = run(state, args, c);
  assert.equal(out.r.ok, true, `duizi ${JSON.stringify(args)} → ${JSON.stringify(out.r).slice(0, 300)}`);
  return out;
};
const asLing = (extra = {}) => ctx({ reader: 'ling', ...extra });
const asHer = (extra = {}) => ctx({ reader: 'yinyue', ...extra });
const keysOf = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach(x => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
};
/* A round dealt and answered with the classic 下联, then graded. */
const playRound = (s, grades = { pos: 2, sense: 2, art: 1 }, rung) => {
  let x = must(s, { action: 'open', ...(rung ? { rung } : {}) }).s;
  x = must(x, { action: 'submit', down: x.duizi.round.ref }).s;
  return must(x, { action: 'grade', ...grades }, asLing());
};

/* ════════ the form (scripts/couplet.js) ════════ */

test('tones: 新韵 — 1–2 平, 3–4 仄; a polyphone is either; an unknown character is null', () => {
  assert.equal(toneOf(tones, '风'), 'P');
  assert.equal(toneOf(tones, '天'), 'P');
  assert.equal(toneOf(tones, '雨'), 'Z');
  assert.equal(toneOf(tones, '地'), 'Z');
  // 入声 lost: 竹 白 直 are 平 today
  assert.equal(toneOf(tones, '竹'), 'P');
  assert.equal(toneOf(tones, '白'), 'P');
  assert.equal(toneOf(tones, '长'), 'B'); // cháng · zhǎng
  assert.equal(toneOf(tones, '重'), 'B'); // zhòng · chóng
  assert.equal(toneOf(tones, 'x'), null);
  assert.equal(toneOf(tones, '㐀'), null, 'a rare character not in the table');
});

test('form: length, the 下联 ending 平, no same place, no copying — each told on its own', () => {
  const ok = checkCouplet(tones, '白日依山尽', '黄河入海流');
  assert.deepEqual(ok.checks, { len: 'ok', tail: 'ok', same: 'ok', copy: 'ok' });
  assert.equal(ok.ok, true);
  // too short is waiting, too long is bad
  assert.equal(checkCouplet(tones, '白日依山尽', '黄河').checks.len, 'wait');
  assert.equal(checkCouplet(tones, '白日依山尽', '黄河入海流水').checks.len, 'bad');
  // the 下联 ending 仄 fails; 平 holds
  assert.equal(checkCouplet(tones, '雨', '雪').checks.tail, 'bad');
  assert.equal(checkCouplet(tones, '雨', '云').checks.tail, 'ok');
  // the same character at the same place
  const same = checkCouplet(tones, '明月松间照', '明星水上流');
  assert.equal(same.checks.same, 'bad');
  assert.equal(same.ok, false);
  // copying: past the rung's allow; the free words never count
  assert.equal(checkCouplet(tones, '明月松间照', '清风月下流', { allow: 0 }).checks.copy, 'bad');
  assert.equal(checkCouplet(tones, '明月松间照', '清风月下流', { allow: 1 }).checks.copy, 'ok');
  assert.equal(checkCouplet(tones, '山之高', '水之深', { allow: 0, free: '之' }).checks.copy, 'ok');
  // only han characters count: punctuation and spaces are never letters
  assert.deepEqual(hanOf('黄河，入海 流!'), ['黄', '河', '入', '海', '流']);
});

test('form: when unsure the player is not failed — a polyphone or an unknown last character', () => {
  assert.equal(checkCouplet(tones, '雨', '长').checks.tail, 'unsure', '长 may be cháng');
  assert.equal(checkCouplet(tones, '雨', '长').ok, true);
  assert.equal(checkCouplet(tones, '雨', '㐀').checks.tail, 'unsure');
  assert.equal(checkCouplet(tones, '雨', '㐀').ok, true);
});

test('the reverse 上联: its length within the teacher, its tail told, never refused for it', () => {
  assert.deepEqual(checkUpper(tones, '春风', 5), { n: 2, fits: true, tail: 'bad' });
  assert.equal(checkUpper(tones, '春雨', 5).tail, 'ok');
  assert.equal(checkUpper(tones, '一二三四五六', 5).fits, false);
});

test('data: every 上联 ends 仄 (or either) under tones.json, its classic 下联 holds the form, lengths match the rung', () => {
  for (const rung of cfg.rungs) {
    assert.ok(rung.ladder.length >= 8, `${rung.id}: a ladder long enough to not repeat soon`);
    for (const [up, ref, src] of rung.ladder) {
      assert.equal(hanOf(up).length, rung.n, `${up} is ${rung.n}`);
      assert.equal(hanOf(ref).length, rung.n, `${ref} is ${rung.n}`);
      assert.ok(['Z', 'B'].includes(toneOf(tones, [...up].at(-1))), `${up} ends 仄`);
      for (const c of up + ref) assert.ok(toneOf(tones, c), `${c} (${up}/${ref}) is in tones.json`);
      assert.equal(checkCouplet(tones, up, ref, { allow: rung.allow, free: cfg.free }).ok, true, `${up} / ${ref} holds the form`);
      assert.ok(src, `${up}: its source`);
    }
  }
  // the teacher's rungs are rungs; 卷一's teacher goes to 五言 only
  for (const t of cfg.teachers) for (const id of t.rungs) assert.ok(cfg.rungs.some(r => r.id === id), id);
  const chu = cfg.teachers.find(t => t.who === 'chuxiansheng');
  assert.equal(Math.max(...chu.rungs.map(id => cfg.rungs.find(r => r.id === id).n)), 5);
});

test('marks: the first that fits the sum and the form; a broken form is never good', () => {
  assert.equal(markFor(cfg, 6, true).id, 'gong');
  assert.equal(markFor(cfg, 4, true).id, 'dui');
  assert.equal(markFor(cfg, 6, false).id, 'jin', 'the form broken: not good, whatever the grades');
  assert.equal(markFor(cfg, 1, true).id, 'bu');
  for (const m of cfg.marks.filter(x => x.pay)) assert.ok(content.rewards.tables[m.pay.table], m.id);
});

/* ════════ the door ════════ */

test('the door: at the 讲堂 after 古六\'s 掐诀 lesson; in English the English ladder (tests/duizi-en)', () => {
  const d = look(base, content, ctx()).duizi;
  assert.ok(d, 'offered at the 讲堂');
  assert.equal(d.teacher, '褚先生');
  assert.deepEqual(d.rungs.map(r => r.open), [true, false, false, false], 'one rung open to begin');
  assert.equal(look({ ...base, place: 'waimen' }, content, ctx()).duizi, undefined, 'not elsewhere');
  const before = { ...base, done_scenes: (base.done_scenes ?? []).filter(id => id !== 'wm-qianye') };
  assert.equal(look(before, content, ctx()).duizi, undefined, 'not before the lesson');
  const en = { ...base, lang: 'en' };
  assert.deepEqual(look(en, content, ctx()).duizi.rungs.map(r => r.id), ['opposites', 'pairs', 'short', 'heroic'], 'English: its own ladder, never the Chinese');
  assert.equal(run({ ...base, lang: 'fr' }, { action: 'open' }).r.refused, 'not-in-lang', 'a language with no ladder has no door');
});

test('a later teacher (卷 not open) is never met — the 稷下 tier is data', () => {
  const later = { ...cfg, teachers: [...cfg.teachers, { id: 'jixia', who: 'chuxiansheng', at: 'waimen', after: 'wm-qianye', juan: 3, rungs: ['five'] }] };
  const c2 = { ...content, aigames: { ...content.aigames, duizi: later } };
  assert.equal(look({ ...base, place: 'waimen' }, c2, ctx()).duizi, undefined);
});

test('the card on the stage: the 上联 big, the input, the form checks; no classic 下联 before the grade', () => {
  const { s } = must(base, { action: 'open' });
  const L = look(s, content, ctx());
  assert.ok(stageCards(L).some(c => c.card === 'duizi'), 'on the stage');
  const html = cardHtml({ card: 'duizi' }, { look: L, words: WORDS.zh });
  assert.match(html, new RegExp(s.duizi.round.up));
  assert.match(html, /id="duizi-down"/);
  assert.match(html, /字数/);
  assert.ok(!html.includes(`>${s.duizi.round.ref}<`), 'the classic 下联 is not on the card yet');
});

/* ════════ a round ════════ */

test('a round: open deals a 上联, submit checks the form, Ling grades, the rules mark and pay', () => {
  const { s: opened, r } = must(base, { action: 'open' });
  const round = opened.duizi.round;
  assert.ok(round.up && round.ref, 'dealt from the ladder');
  assert.equal(r.duizi.round.up, round.up);
  // the classic 下联 is never in Look, the page's answer, or her answer
  for (const seen of [r, look(opened, content, ctx()), forLing(look(opened, content, ctx()))]) {
    assert.ok(!JSON.stringify(seen).includes(`"${round.ref}"`), 'no classic 下联 before the grade');
    assert.ok(!keysOf(seen).has('ref') && !keysOf(seen).has('reference'));
  }
  // a wrong length is refused, nothing spent
  assert.equal(run(opened, { action: 'submit', down: round.up + round.up }).r.refused, 'not-matched');
  // Ling may not open a round; the page may not grade
  assert.equal(run(base, { action: 'open' }, asLing()).r.refused, 'not-yours');
  const { s: sent, r: sr } = must(opened, { action: 'submit', down: round.ref });
  assert.equal(sr.submitted, true);
  assert.equal(sr.duizi.round.pending, true);
  assert.equal(run(sent, { action: 'grade', pos: 2, sense: 2, art: 2 }).r.refused, 'not-yours');
  // Ling's view while it waits: the rubric and the classic 下联 to judge by
  const lv = run(sent, { action: 'read' }, asLing()).r;
  assert.equal(lv.judge.reference, round.ref);
  assert.deepEqual(lv.judge.rubric.map(x => x.id), ['pos', 'sense', 'art']);
  // a grade missing a part is refused
  assert.equal(run(sent, { action: 'grade', pos: 2, sense: 2 }, asLing()).r.refused, 'need-grades');
  const before = sent.wealth;
  const { s: graded, r: gr } = must(sent, { action: 'grade', pos: 2, sense: 2, art: 2 }, asLing());
  assert.equal(gr.mark.id, 'gong');
  assert.ok(gr.paid && graded.wealth > before, 'paid');
  assert.ok(graded.wealth - before <= content.rewards.tables.game.wealth, 'capped by the game table');
  // graded: the classic 下联 and its source are the card's now
  const after = look(graded, content, ctx()).duizi.round;
  assert.equal(after.ref, round.ref);
  assert.ok(after.src);
  // graded once: a second grade is refused
  assert.equal(run(graded, { action: 'grade', pos: 0, sense: 0, art: 0 }, asLing()).r.refused, 'not-pending');
  // grades are clamped 0–2
  const { r: clamp } = must(sent, { action: 'grade', pos: 9, sense: -3, art: '1' }, asLing());
  assert.deepEqual(clamp.duizi.round.grades, { pos: 2, sense: 0, art: 1 });
});

test('a broken form is never paid, whatever Ling grades', () => {
  let s = must(base, { action: 'open', rung: 'one' }).s;
  const up = s.duizi.round.up;
  s = must(s, { action: 'submit', down: up }).s; // the same character: same place, copied
  assert.equal(s.duizi.round.form.ok, false);
  const { s: g, r } = must(s, { action: 'grade', pos: 2, sense: 2, art: 2 }, asLing());
  assert.equal(r.mark.good, false);
  assert.equal(r.paid, undefined);
  assert.equal(g.wealth, s.wealth);
  assert.equal(g.duizi.good?.one ?? 0, 0, 'not counted on the ladder');
});

test('the day: three paid rounds, then refused; tomorrow they come back, the ladder stays', () => {
  let s = base;
  for (let i = 0; i < cfg.rounds; i++) s = playRound(s).s;
  assert.equal(run(s, { action: 'open' }).r.refused, 'rounds-done');
  assert.equal(look(s, content, ctx()).duizi.rounds_left, 0);
  const t = must(s, { action: 'open' }, nextDay());
  assert.equal(t.r.opened, true);
  assert.equal(t.s.duizi.good.one, cfg.rounds, 'the good answers stay');
  // an unanswered round can be let go — it is spent
  const k = must(t.s, { action: 'skip' }, nextDay());
  assert.equal(k.r.skipped, true);
});

test('the ladder: `need` good answers on a rung open the next; a closed rung is refused', () => {
  assert.equal(run(base, { action: 'open', rung: 'two' }).r.refused, 'rung-shut');
  let s = base, unlocked = null;
  for (let i = 0; i < cfg.need; i++) {
    const day = nextDay(i);
    let x = must(s, { action: 'open', rung: 'one' }, day).s;
    x = must(x, { action: 'submit', down: x.duizi.round.ref }, day).s;
    const g = must(x, { action: 'grade', pos: 2, sense: 1, art: 0 }, ctx({ reader: 'ling', now: day.now }));
    s = g.s;
    unlocked = g.r.unlocked ?? unlocked;
  }
  assert.equal(unlocked?.id, 'two');
  const L = look(s, content, nextDay(cfg.need)).duizi;
  assert.deepEqual(L.rungs.map(r => r.open), [true, true, false, false]);
  assert.equal(L.rung, 'two', 'the highest open is the default');
  const o = must(s, { action: 'open', rung: 'two' }, nextDay(cfg.need));
  assert.equal(hanOf(o.s.duizi.round.up).length, 2);
});

test('the 上联 dealt is not one dealt lately', () => {
  let s = base;
  const ups = [];
  for (let i = 0; i < 6; i++) {
    const day = nextDay(i);
    const o = must(s, { action: 'open', rung: 'one' }, day);
    ups.push(o.s.duizi.round.up);
    s = must(o.s, { action: 'skip' }, day).s;
  }
  assert.equal(new Set(ups).size, ups.length, ups.join());
});

/* ════════ reverse ════════ */

test('reverse: his 上联, the teacher\'s 下联 checked by the rules; no pay, a small limit a day', () => {
  assert.equal(run(base, { action: 'reverse', up: '一二三四五六七' }).r.refused, 'bad-upper');
  const { s, r } = must(base, { action: 'reverse', up: '春雨' });
  assert.equal(r.reversed, true);
  assert.equal(r.duizi.rev.up, '春雨');
  // her answer must match the length — she tries again
  assert.equal(run(s, { action: 'answer', down: '秋风起' }, asLing()).r.refused, 'not-matched');
  const a = must(s, { action: 'answer', down: '秋风' }, asLing());
  assert.equal(a.r.answered, true);
  assert.equal(a.s.wealth, s.wealth, 'no pay');
  let x = a.s;
  for (let i = 1; i < cfg.reverse; i++) x = must(must(x, { action: 'reverse', up: '明月' }).s, { action: 'answer', down: '清风' }, asLing()).s;
  assert.equal(run(x, { action: 'reverse', up: '夜雨' }).r.refused, 'reverse-done');
  assert.equal(must(x, { action: 'reverse', up: '夜雨' }, nextDay()).r.reversed, true, 'tomorrow, again');
});

/* ════════ one 联 a sitting (Hanli 2026-11-02: 「可以, 按你说的做」) ════════
   Three 联 a day still, but one a sitting: graded, the card ends (收下, no 再来); the next comes when the 时辰 pool
   draws 对对子 again — its cooldown one 时辰 (aside.mjs HER_POOL). Times from shichenOf, so any TZ reads the same. */

const HOUR2 = 2 * 3600_000;
const at = (t, extra = {}) => ctx({ now: t, ...extra });
/* 40 minutes into each 时辰 of the first whole day after NOW, 丑 to 亥, in whatever TZ the test runs — 子 left out:
   from 23:00 it is the pool's next day (pool.mjs shichenOf) but the calendar's today (duizi.mjs dayOf, dayKey). */
const ZI = (() => { let t = shichenOf(NOW).end; while (shichenOf(t).i !== 0) t = shichenOf(t).end; return t; })();
const SITTINGS = Array.from({ length: 11 }, (_, i) => new Date(ZI.getTime() + (i + 1) * HOUR2 + 40 * 60_000));
const drawnHere = (s, t) => (look(s, content, at(t)).tray ?? []).some(e => e.id === 'duizi' && e.act === 'open');
const html = (s, t, lang = 'zh') => cardHtml({ card: 'duizi' }, { look: look(s, content, at(t)), words: WORDS[lang], lang });
/* One sitting at `t`: open (the gated verb stamps the pool), the classic 下联, Ling's grade. */
const sitting = (s, t) => {
  let x = must(s, { action: 'open' }, at(t)).s;
  x = must(x, { action: 'submit', down: x.duizi.round.ref }, at(new Date(+t + 60_000))).s;
  return must(x, { action: 'grade', pos: 2, sense: 2, art: 1 }, asLing({ now: new Date(+t + 120_000) })).s;
};

test('one 联 a sitting: graded, the card ends with 收下 — no 再来, in Chinese and English', () => {
  for (const lang of ['zh', 'en']) {
    const s0 = { ...base, lang }, t = SITTINGS.find(x => drawnHere(s0, x));
    assert.ok(t, `${lang}: some 时辰 draws 对对子`);
    // Drawn: the offer stands on the stage, its rungs and 请先生出上联.
    assert.ok(stageCards(look(s0, content, at(t))).some(c => c.card === 'duizi'));
    assert.match(html(s0, t, lang), /data-duizi-open/);
    const g = sitting(s0, t), t1 = new Date(+t + 5 * 60_000);
    assert.ok(new Date(g.pool_played?.duizi) >= shichenOf(t).start, 'the open stamped the 时辰 pool');
    const graded = html(g, t1, lang);
    assert.match(graded, /data-duizi-close/);
    assert.match(graded, lang === 'zh' ? />收下</ : />Take it</);
    assert.doesNotMatch(graded, /data-duizi-open|data-duizi-rung/, `${lang}: no 再来, no rungs`);
    assert.doesNotMatch(graded, /再来|Another/);
    assert.ok(stageCards(look(g, content, at(t1))).some(c => c.card === 'duizi'), 'graded, it stands until 收下');
    // 收下: the card is gone, the tray row too, for the rest of the 时辰 — and a reload keeps it so (the save's `closed`).
    const c = must(g, { action: 'close' }, at(t1));
    assert.equal(c.r.closed, true);
    assert.equal(c.s.duizi.round.closed, true);
    for (const later of [t1, new Date(shichenOf(t).end - 60_000)]) {
      const L = look(c.s, content, at(later));
      assert.ok(!stageCards(L).some(x => x.card === 'duizi'), `${lang}: off the stage at ${later.toISOString()}`);
      assert.ok(!(L.tray ?? []).some(e => e.id === 'duizi'), 'out of the row');
      assert.doesNotMatch(html(c.s, later, lang), /data-duizi-open/, 'no begin, even drawn by hand');
    }
    assert.equal(run(c.s, { action: 'close' }, at(t1)).r.again, true, 'once');
    assert.equal(run(base, { action: 'close' }).r.refused, 'not-graded');
    // The ladder is the ladder: a good answer counted on its rung, pay as before.
    assert.equal(c.s.duizi.good[g.duizi.round.rung], 1);
    assert.ok(c.s.wealth > s0.wealth);
  }
});

test('one 联 a sitting: the pool brings 对对子 back the very next 时辰, the day\'s three still the cap', () => {
  const her = PLAY_KINDS.find(k => k.kind === 'her');
  assert.equal(her.pool.row({ id: 'duizi' }).cooldown_min, 0, '对对子 rests out its own 时辰 only');
  assert.equal(her.pool.row({ id: 'kao' }).cooldown_min, 24 * 60, '本王考考你 rests a day still');
  // The boundary, in the draw alone (one member, so drawn whenever it is in the pool): played 40 minutes into a 时辰
  // (and in its last minute), out of the row to its end, back at the next 时辰's first minute; 出题 not.
  const sc = shichenOf(SITTINGS[0]), next = new Date(+sc.end + 60_000);
  for (const id of ['duizi', 'kao']) {
    for (const playedAt of [new Date(+sc.start + 40 * 60_000), new Date(+sc.end - 60_000)]) {
      const s = { ...base, pool_played: { [id]: playedAt.toISOString() } }, row = [{ kind: 'her', id, seg: 'open' }];
      const now = drawPool(content, s, row, PLAY_KINDS, new Date(+sc.end - 30_000)).drawn.find(e => e.id === id);
      assert.equal(now?.played, true, `${id}: played, out of the row for the rest of its 时辰`);
      const then = drawPool(content, s, row, PLAY_KINDS, next).drawn.find(e => e.id === id);
      if (id === 'duizi') assert.ok(then && !then.played, `对对子 back in the next 时辰 (played ${playedAt.toISOString()})`);
      else assert.equal(then, undefined, '出题 rests its day');
    }
  }
  // Through Look: three sittings in three drawn 时辰 of one day, then none — the row and the stage both.
  let s = base, n = 0;
  const today = SITTINGS;
  assert.equal(new Set(today.map(t => shichenOf(t).day)).size, 1, 'one day of 时辰');
  for (const t of today) {
    if (n === cfg.rounds || !drawnHere(s, t)) continue;
    s = must(sitting(s, t), { action: 'close' }, at(new Date(+t + 300_000))).s;
    n += 1;
  }
  assert.equal(n, cfg.rounds, `three drawn 时辰 in a day (${today.filter(t => drawnHere(base, t)).length} drawn on a fresh save)`);
  assert.equal(s.duizi.played, cfg.rounds);
  for (const t of today.filter(x => x > new Date(s.pool_played.duizi))) {
    const L = look(s, content, at(t));
    assert.ok(!(L.tray ?? []).some(e => e.id === 'duizi'), `the day's three used: never in the row (${t.toISOString()})`);
    assert.ok(!stageCards(L).some(c => c.card === 'duizi'));
  }
  const last = today.at(-1);
  assert.equal(run(s, { action: 'open' }, at(last)).r.refused, 'rounds-done', 'the rules keep the cap');
});

test('the tray reads 今日 n 联 from Look, one less after a sitting', () => {
  const t = SITTINGS.find(x => drawnHere(base, x));
  const e = look(base, content, at(t)).tray.find(x => x.id === 'duizi');
  assert.deepEqual(e.left, { unit: 'couplets', n: cfg.rounds });
  assert.equal(WORDS.zh.trayLeft.couplets, '今日 {n} 联');
  const s = must(sitting(base, t), { action: 'close' }, at(t)).s;
  const back = SITTINGS.find(x => x > t && shichenOf(x).day === shichenOf(t).day && drawnHere(s, x));
  if (back) assert.equal(look(s, content, at(back)).tray.find(x => x.id === 'duizi').left.n, cfg.rounds - 1);
});

test('the reverse, one a sitting: his 上联 answered, no second form until the next 时辰', () => {
  const t = SITTINGS[0], t2 = new Date(+shichenOf(t).end + 40 * 60_000);
  const r1 = must(base, { action: 'reverse', up: '春雨' }, at(t)).s;
  const a1 = must(r1, { action: 'answer', down: '秋风' }, asLing({ now: t })).s;
  assert.equal(look(a1, content, at(t)).duizi.rev_now, true);
  const now = html(a1, t);
  assert.match(now, /<span>秋<\/span><span>风<\/span>/, 'his line and the answer shown');
  assert.doesNotMatch(now, /id="duizi-up"/, 'no second 上联 this sitting');
  const later = look(a1, content, at(t2)).duizi;
  assert.equal(later.rev_now, undefined);
  assert.equal(later.reverse_left, cfg.reverse - 1);
  const next = html(a1, t2);
  assert.match(next, /id="duizi-up"/, 'the next 时辰: one more');
  assert.doesNotMatch(next, /<span>秋<\/span>/, 'the earlier sitting\'s is not this card\'s');
});

/* ════════ 银月 ════════ */

test('银月 asleep in the token: her part is simply absent', () => {
  assert.ok(base.companion.asleep || !base.companion.awake, '卷一: she sleeps');
  assert.equal(look(base, content, ctx()).duizi.her, undefined);
  const { s } = must(base, { action: 'open' });
  assert.equal(run(s, { action: 'hint' }, asHer()).r.refused, 'no-host');
  assert.equal(run(s, { action: 'offer', down: '风' }, asHer()).r.refused, 'no-host');
  const html = cardHtml({ card: 'duizi' }, { look: look(s, content, ctx()), words: WORDS.zh });
  assert.ok(!html.includes('data-duizi-her'), 'no 银月 buttons');
});

test('银月 awake: one hint a round, one 下联 of her own — checked, never scored', () => {
  assert.equal(look(awake, content, ctx()).duizi.her, true);
  const { s } = must(awake, { action: 'open', rung: 'one' });
  const html = cardHtml({ card: 'duizi' }, { look: look(s, content, ctx()), words: WORDS.zh });
  assert.match(html, /data-duizi-her="hint"/);
  const hv = run(s, { action: 'read' }, asHer()).r;
  assert.equal(Object.keys(hv)[0], 'how', 'her note first');
  assert.ok(!JSON.stringify(hv).includes(`"${s.duizi.round.ref}"`), 'she never holds the classic 下联');
  const h = must(s, { action: 'hint' }, asHer());
  assert.equal(run(h.s, { action: 'hint' }, asHer()).r.refused, 'hint-used');
  // the page and Ling may not take hers
  assert.equal(run(h.s, { action: 'offer', down: '风' }).r.refused, 'not-yours');
  assert.equal(run(h.s, { action: 'offer', down: '风风' }, asHer()).r.refused, 'not-matched');
  const o = must(h.s, { action: 'offer', down: s.duizi.round.ref }, asHer());
  assert.equal(o.r.offered, true);
  assert.equal(o.s.wealth, s.wealth);
  assert.equal(run(o.s, { action: 'offer', down: '风' }, asHer()).r.refused, 'offered');
  assert.equal(look(o.s, content, ctx()).duizi.round.her.down, s.duizi.round.ref);
});

/* ════════ the wiring ════════ */

test('the guide and the tools: Ling has `duizi`, 银月 has Couplet', () => {
  assert.ok(topics().includes('duizi'));
  assert.match(guideText('duizi'), /Duizi/);
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.match(md, /name: Duizi\n/);
  assert.match(md, /name: Couplet\n/);
  assert.match(md, /rules\.mjs duizi --action=\{\{action\}\}.*--for=ling/);
  assert.match(md, /rules\.mjs duizi --action=\{\{action\}\}.*--for=yinyue/);
});

test('no personal name in what 对对子 ships', () => {
  for (const f of ['scripts/rules/duizi.mjs', 'scripts/couplet.js', 'scripts/rhyme.js', 'scripts/aigames-cards.js', 'guide/duizi.md', 'worlds/jiuding/aigames.json', 'worlds/jiuding/rhymes.json', 'tools/tone-table.py', 'tools/rhyme-table.py']) {
    assert.ok(!/Liang/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  }
});
