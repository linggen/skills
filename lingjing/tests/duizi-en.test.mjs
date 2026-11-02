// English 对对子 — the rhyming-couplet ladder (Hanli 2026-11-02: 「可以, 按你说的做」;
// rules/duizi.mjs over aigames.json `duizi.english`, scripts/rhyme.js on rhymes.json).
// The rules own the form (syllables, the rhyme, one word, not copied) and the outcome
// (the same marks, pay, ladder and day as the Chinese); Ling grades the rubric.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, rhymesTable } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, playTo, VERBS } from '../scripts/rules.mjs';
import { checkPrompt, checkRhyme, guessSyllables, rhymeOf, soundsOf, syllablesOf, wordsOf } from '../scripts/rhyme.js';
import { markFor } from '../scripts/rules/duizi.mjs';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { duiziFormOf, duiziTableOf } from '../scripts/aigames-cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const cfg = content.aigames.duizi, en = cfg.english, table = rhymesTable(content);
const NOW = new Date('2026-10-15T09:00:00+08:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const nextDay = (n = 1) => ctx({ now: new Date(NOW.getTime() + n * 86400000) });
const asLing = (extra = {}) => ctx({ reader: 'ling', ...extra });
const asHer = (extra = {}) => ctx({ reader: 'yinyue', ...extra });

/* 古七's opening at the 讲堂, as the Chinese tests — in an English save. */
const played = playTo(content, newState(content, 'en', NOW), '古七', { now: NOW }).state;
const base = { ...played, lang: 'en', place: 'jiangtang', scene: null };
const zh = { ...base, lang: 'zh' };
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
const rungOf = id => en.rungs.find(r => r.id === id);
const formOf = (rung, up, down) => checkRhyme(table, up, down, { kind: rung.kind, allow: rung.allow, free: en.free });

/* ════════ the form (scripts/rhyme.js) ════════ */

test('syllables: from the CMU table, every pronunciation a range; an unknown word by its spelling, ±1', () => {
  assert.deepEqual(syllablesOf(table, 'day'), { lo: 1, hi: 1, unknown: 0 });
  assert.equal(syllablesOf(table, 'Hope springs eternal in the human breast').lo, 10);
  const fire = syllablesOf(table, 'fire');
  assert.ok(fire.lo === 1 && fire.hi === 2, 'fire: one or two');
  assert.equal(soundsOf(table, 'zorblaxian'), null, 'not in the table');
  assert.equal(guessSyllables('zorblaxian'), 3);
  assert.deepEqual(syllablesOf(table, 'zorblaxian'), { lo: 2, hi: 4, unknown: 1 });
  assert.equal(guessSyllables('frame'), 1, 'a silent final e');
  assert.equal(guessSyllables('candle'), 2, '-le is sounded');
  // an old -'d is its -ed; a possessive its base and an s
  assert.deepEqual(soundsOf(table, "restor'd"), soundsOf(table, 'restored'));
  assert.equal(syllablesOf(table, "horse's").lo, 2);
  // words: quotes straightened, hyphens split, punctuation off
  assert.deepEqual(wordsOf('“Fire, burn; and cauldron—bubble.” lovers’ candle-light'), ['fire', 'burn', 'and', 'cauldron', 'bubble', 'lovers', 'candle', 'light']);
});

test('rhyme: on the last stressed syllable; the same word is no rhyme; an unknown word is never failed', () => {
  assert.equal(rhymeOf(table, 'night', 'light'), 'ok');
  assert.equal(rhymeOf(table, 'arise', 'eyes'), 'ok');
  assert.equal(rhymeOf(table, 'trouble', 'bubble'), 'ok', 'the unstressed tail alike');
  assert.equal(rhymeOf(table, 'feather', 'together'), 'ok', 'the stress, not the first syllable');
  assert.equal(rhymeOf(table, 'frog', 'dog'), 'ok', 'cot–caught merged');
  assert.equal(rhymeOf(table, 'love', 'prove'), 'bad', 'an eye rhyme is lost today');
  assert.equal(rhymeOf(table, 'eye', 'symmetry'), 'bad');
  assert.equal(rhymeOf(table, 'day', 'day'), 'bad');
  assert.equal(rhymeOf(table, 'day', 'zorblay'), 'ok', 'unknown, spelled alike');
  assert.equal(rhymeOf(table, 'day', 'zorblux'), 'unsure', 'unknown: never failed');
  assert.equal(rhymeOf(table, 'day', ''), 'wait');
});

test('the form of a line: syllables, rhyme, not copied — each told; short waits, long fails, unknown is unsure', () => {
  const heroic = rungOf('heroic');
  const up = 'Some praise at morning what they blame at night,';
  const ok = formOf(heroic, up, 'But always think the last opinion right.');
  assert.deepEqual(ok.checks, { len: 'ok', rhyme: 'ok', copy: 'ok' });
  assert.equal(ok.ok, true);
  assert.equal(ok.n, 10);
  const short = formOf(heroic, up, 'But always think');
  assert.equal(short.checks.len, 'wait');
  assert.equal(short.checks.rhyme, 'wait', 'no rhyme verdict on a half-typed line');
  assert.equal(short.ready, false);
  assert.equal(formOf(heroic, up, 'But always always think the last opinion right.').checks.len, 'bad');
  assert.equal(formOf(heroic, up, 'But always think the last opinion wrong today.').checks.rhyme, 'bad');
  // an unknown word: the count within its reach is unsure, and may be sent
  const unknown = formOf(heroic, up, 'But always think the zorblaxian is right.');
  assert.equal(unknown.checks.len, 'unsure');
  assert.equal(unknown.ready, true);
  assert.equal(unknown.ok, true);
  // copying: past the rung's allow; free words never count
  const pairs = rungOf('pairs');
  assert.equal(formOf(pairs, 'Red sky at night,', 'red sky delight').checks.copy, 'bad');
  assert.equal(formOf(pairs, 'Red sky at night,', 'red sun at its height').checks.copy, 'ok', 'one of his words, and the free ones');
});

test('the form of an opposite: one word, not a form of his', () => {
  const opp = rungOf('opposites');
  assert.deepEqual(formOf(opp, 'born', 'die').checks, { one: 'ok', copy: 'ok' });
  assert.equal(formOf(opp, 'born', 'die').ready, true);
  assert.equal(formOf(opp, 'born', 'to die').checks.one, 'bad');
  assert.equal(formOf(opp, 'kind', 'unkind').checks.copy, 'bad');
  assert.equal(formOf(opp, 'born', 'born').checks.copy, 'bad');
  assert.equal(formOf(opp, 'born', '').checks.one, 'wait');
  assert.equal(formOf(opp, 'born', 'zorblux').ok, true, 'an unknown word is not failed');
});

test('the reverse prompt: words and syllables, within the teacher\'s longest', () => {
  assert.deepEqual(checkPrompt(table, 'joy', 10), { n: 1, words: 1, kind: 'word', fits: true });
  assert.equal(checkPrompt(table, 'The moon is up above the sleeping town', 10).kind, 'line');
  assert.equal(checkPrompt(table, 'The moon is up above the sleeping town tonight again', 10).fits, false);
  assert.equal(checkPrompt(table, '', 10).fits, false);
});

/* ════════ the data ════════ */

test('data: four rungs, each pair holding its own form with every word known, its source given', () => {
  assert.deepEqual(en.rungs.map(r => r.id), ['opposites', 'pairs', 'short', 'heroic']);
  assert.deepEqual(en.teachers.chu, en.rungs.map(r => r.id));
  const zhIds = new Set(cfg.rungs.map(r => r.id));
  for (const rung of en.rungs) {
    assert.ok(!zhIds.has(rung.id), `${rung.id}: no Chinese rung shares the id (one save holds both)`);
    assert.ok(rung.ladder.length >= 8, `${rung.id}: a ladder long enough to not repeat soon`);
    assert.ok(rung.name.en && rung.name.zh);
    const ups = new Set();
    for (const [up, ref, src] of rung.ladder) {
      assert.ok(src, `${up}: its source`);
      assert.ok(!ups.has(up), `${up}: once`); ups.add(up);
      for (const w of wordsOf(`${up} ${ref}`)) assert.ok(soundsOf(table, w), `${w} (${up} / ${ref}) is in rhymes.json`);
      const form = formOf(rung, up, ref);
      assert.equal(form.ok, true, `${up} / ${ref} holds the form: ${JSON.stringify(form.checks)}`);
      assert.ok(!Object.values(form.checks).includes('unsure'), `${up} / ${ref}: known, not unsure`);
      if (rung.kind === 'word') assert.equal(wordsOf(up).length, 1);
      else assert.ok(syllablesOf(table, up).lo <= rung.n, `${up}: within the rung's ${rung.n}`);
    }
  }
  assert.equal(syllablesOf(table, rungOf('heroic').ladder[0][0]).lo, 10, 'heroic lines are ten');
});

test('the table: the CMU licence ships with it; trimmed, not the whole dictionary', () => {
  assert.match(table._licence, /Carnegie Mellon University/);
  assert.match(table._licence, /Redistribution and use in source and binary forms/);
  const words = new Set(Object.values(table.tails).flatMap(v => v.split(' ').map(e => e.replace(/\d+$/, ''))));
  assert.ok(words.size > 15000 && words.size < 40000, `${words.size} words`);
  for (const w of ['love', 'night', 'heaven', 'sword', 'mountain', 'river']) assert.ok(words.has(w), w);
});

/* ════════ the door ════════ */

test('the door: English at the 讲堂 opens the English ladder; the Chinese save the Chinese — never the other\'s', () => {
  const d = look(base, content, ctx()).duizi;
  assert.ok(d, 'offered in English');
  assert.equal(d.teacher, 'Master Chu');
  assert.deepEqual(d.rungs.map(r => [r.id, r.name, r.open]), [['opposites', 'Opposites', true], ['pairs', 'Rhyming pairs', false], ['short', 'Short lines', false], ['heroic', 'Heroic couplets', false]]);
  assert.equal(d.max, 10);
  assert.deepEqual(d.rubric.map(x => x.name), ['contrast', 'fit', 'wit']);
  const z = look(zh, content, ctx()).duizi;
  assert.deepEqual(z.rungs.map(r => r.id), ['one', 'two', 'three', 'five'], 'Chinese: the Chinese ladder');
  assert.equal(run(zh, { action: 'open', rung: 'opposites' }).r.refused, 'rung-shut', 'an English rung is not the Chinese teacher\'s');
  assert.equal(run(base, { action: 'open', rung: 'one' }).r.refused, 'rung-shut', 'a Chinese rung is not the English teacher\'s');
  assert.equal(look({ ...base, place: 'waimen' }, content, ctx()).duizi, undefined, 'not elsewhere');
  const before = { ...base, done_scenes: (base.done_scenes ?? []).filter(id => id !== 'wm-qianye') };
  assert.equal(look(before, content, ctx()).duizi, undefined, 'not before the lesson');
});

test('a round dealt in English stays out of the Chinese view, and the other way round', () => {
  const { s } = must(base, { action: 'open' });
  assert.equal(s.duizi.round.lang, 'en');
  assert.equal(look({ ...s, lang: 'zh' }, content, ctx()).duizi.round, undefined);
  const z = must({ ...s, lang: 'zh' }, { action: 'open' });
  assert.equal(z.s.duizi.round.lang, undefined, 'a Chinese round says no language, as before');
  assert.equal(look({ ...z.s, lang: 'en' }, content, ctx()).duizi.round, undefined);
});

/* ════════ a round ════════ */

test('a round: an opposite dealt, sent, graded by Ling — the same marks and pay as the Chinese', () => {
  const { s: opened, r } = must(base, { action: 'open' });
  const round = opened.duizi.round;
  assert.ok(rungOf('opposites').ladder.some(([up, ref]) => up === round.up && ref === round.ref));
  assert.equal(r.duizi.round.kind, 'word');
  // (Look has keys of its own that may spell the word — `fall` is a tune's — so its 对对子 is read, as values)
  for (const seen of [r.duizi, look(opened, content, ctx()).duizi, forLing(look(opened, content, ctx())).duizi]) {
    assert.ok(!JSON.stringify(seen).includes(`"${round.ref}"`), 'no classic answer before the grade');
    assert.ok(!JSON.stringify(seen).includes('"ref"') && !JSON.stringify(seen).includes('"reference"'));
  }
  // two words, or a form of his: refused or failed by the rules
  const two = run(opened, { action: 'submit', down: 'not this' });
  assert.equal(two.r.refused, 'not-matched');
  assert.match(two.r.error ?? two.r.message ?? JSON.stringify(two.r), /One word/);
  const { s: sent, r: sr } = must(opened, { action: 'submit', down: `  ${round.ref}  ` });
  assert.equal(sent.duizi.round.down, round.ref, 'kept trimmed');
  assert.equal(sr.duizi.round.pending, true);
  const lv = run(sent, { action: 'read' }, asLing()).r;
  assert.equal(lv.judge.reference, round.ref);
  assert.deepEqual(lv.judge.rubric.map(x => [x.id, x.name]), [['pos', 'contrast'], ['sense', 'fit'], ['art', 'wit']]);
  assert.match(lv.judge.note, /English/);
  assert.match(lv.voice, /Master Chu/);
  const before = sent.wealth;
  const { s: graded, r: gr } = must(sent, { action: 'grade', pos: 2, sense: 2, art: 1 }, asLing());
  assert.equal(gr.mark.id, 'gong');
  assert.equal(gr.mark.name, 'well matched');
  assert.equal(gr.mark.id, markFor(cfg, 5, true).id, 'the Chinese marks');
  assert.ok(graded.wealth > before, 'paid');
  assert.ok(graded.wealth - before <= content.rewards.tables.game.wealth, 'capped by the game table');
  const after = look(graded, content, ctx()).duizi.round;
  assert.equal(after.ref, round.ref);
  assert.ok(after.src);
  // the card, graded: the line and answer across, English words, English pay
  const html = cardHtml({ card: 'duizi' }, { look: look(graded, content, ctx()), words: WORDS.en, lang: 'en' });
  assert.match(html, /dzpair row/);
  assert.match(html, /well matched/);
  assert.match(html, /contrast/);
  assert.match(html, /The classic answer/);
  assert.match(html, /spirit stones/);
  assert.ok(!/修为|灵石|上联|下联/.test(html), 'no Chinese on the English card');
});

test('marks in English: a lower sum marks lower, a broken form never pays', () => {
  let s = must(base, { action: 'open' }).s;
  s = must(s, { action: 'submit', down: s.duizi.round.up }).s; // his own word: copied
  assert.equal(s.duizi.round.form.ok, false);
  const { s: g, r } = must(s, { action: 'grade', pos: 2, sense: 2, art: 2 }, asLing());
  assert.equal(r.mark.good, false);
  assert.equal(r.paid, undefined);
  assert.equal(g.wealth, s.wealth);
  assert.equal(g.duizi.good?.opposites ?? 0, 0, 'not counted on the ladder');
  let t = must(base, { action: 'open' }).s;
  t = must(t, { action: 'submit', down: t.duizi.round.ref }).s;
  assert.equal(must(t, { action: 'grade', pos: 1, sense: 1, art: 1 }, asLing()).r.mark.id, 'dui');
  assert.equal(must(t, { action: 'grade', pos: 1, sense: 1, art: 0 }, asLing()).r.mark.id, 'jin');
  assert.equal(must(t, { action: 'grade', pos: 0, sense: 0, art: 0 }, asLing()).r.mark.name, 'not a match');
});

test('the ladder in English: `need` good opposites open the rhyming pairs; a pair answered across the syllables', () => {
  let s = base, unlocked = null;
  for (let i = 0; i < cfg.need; i++) {
    const day = nextDay(i);
    let x = must(s, { action: 'open', rung: 'opposites' }, day).s;
    x = must(x, { action: 'submit', down: x.duizi.round.ref }, day).s;
    const g = must(x, { action: 'grade', pos: 2, sense: 1, art: 0 }, ctx({ reader: 'ling', now: day.now }));
    s = g.s;
    unlocked = g.r.unlocked ?? unlocked;
  }
  assert.deepEqual(unlocked, { id: 'pairs', name: 'Rhyming pairs' });
  const day = nextDay(cfg.need);
  assert.deepEqual(look(s, content, day).duizi.rungs.map(r => r.open), [true, true, false, false]);
  const o = must(s, { action: 'open', rung: 'pairs' }, day);
  const { up, ref } = o.s.duizi.round;
  assert.equal(o.r.duizi.round.kind, 'line');
  const tooShort = run(o.s, { action: 'submit', down: 'yes' }, day);
  assert.equal(tooShort.r.refused, 'not-matched');
  assert.match(JSON.stringify(tooShort.r), /syllables/);
  const sent = must(o.s, { action: 'submit', down: ref }, day);
  assert.equal(sent.s.duizi.round.form.ok, true, `${up} / ${ref}`);
  // the day's three rounds are the same three, whichever language
  assert.equal(look(s, content, nextDay(cfg.need - 1)).duizi.rounds_left, cfg.rounds - 1);
});

test('the day in English: three paid rounds, then refused in English', () => {
  let s = base;
  for (let i = 0; i < cfg.rounds; i++) {
    let x = must(s, { action: 'open' }).s;
    x = must(x, { action: 'submit', down: x.duizi.round.ref }).s;
    s = must(x, { action: 'grade', pos: 1, sense: 1, art: 1 }, asLing()).s;
  }
  const r = run(s, { action: 'open' }).r;
  assert.equal(r.refused, 'rounds-done');
  assert.match(JSON.stringify(r), /tomorrow/);
});

/* ════════ reverse, 银月, the card ════════ */

test('reverse in English: his line, the teacher\'s answer checked by syllables and rhyme; no pay', () => {
  assert.equal(run(base, { action: 'reverse', up: 'The moon is up above the sleeping town tonight again' }).r.refused, 'bad-upper');
  const { s, r } = must(base, { action: 'reverse', up: 'The moon is up above the sleeping town' });
  assert.equal(r.duizi.rev.kind, 'line');
  assert.equal(r.duizi.rev.n, 10);
  assert.equal(run(s, { action: 'answer', down: 'The sun is down' }, asLing()).r.refused, 'not-matched');
  const a = must(s, { action: 'answer', down: "And all the stars come out to gown the crown" }, asLing());
  assert.equal(a.r.answered, true);
  assert.equal(a.s.duizi.rev.form.checks.rhyme, 'ok');
  assert.equal(a.s.wealth, s.wealth, 'no pay');
  const w = must(a.s, { action: 'reverse', up: 'joy' });
  assert.equal(w.r.duizi.rev.kind, 'word');
  assert.equal(run(w.s, { action: 'answer', down: 'joyless' }, asLing()).r.duizi.rev.form.checks.copy, 'bad', 'not a form of his word — checked, shown');
  assert.equal(run(w.s, { action: 'reverse', up: 'grief' }).r.refused, 'pending');
});

test('银月 in English: her note in English, her answer checked by the English form, never scored', () => {
  const { s } = must(awake, { action: 'open' });
  const hv = run(s, { action: 'read' }, asHer()).r;
  assert.equal(Object.keys(hv)[0], 'how');
  assert.match(hv.how, /English couplets/);
  assert.ok(!JSON.stringify(hv).includes(`"${s.duizi.round.ref}"`), 'she never holds the classic answer');
  assert.equal(run(s, { action: 'offer', down: 'two words' }, asHer()).r.refused, 'not-matched');
  const o = must(s, { action: 'offer', down: s.duizi.round.ref }, asHer());
  assert.equal(o.r.offered, true);
  assert.equal(o.s.wealth, s.wealth);
});

test('the English card: across, English words, the input in English; its checks by rhyme.js, waiting for the table', () => {
  const offered = cardHtml({ card: 'duizi' }, { look: look(base, content, ctx()), words: WORDS.en, lang: 'en' });
  assert.match(offered, /Opposites · good 0\/3/);
  assert.match(offered, /Rhyming pairs \(not yet\)/);
  assert.match(offered, /Ask for a line/);
  const { s } = must(base, { action: 'open' });
  const L = look(s, content, ctx());
  const html = cardHtml({ card: 'duizi' }, { look: L, words: WORDS.en, lang: 'en' });
  assert.match(html, /Couplets · Master Chu/);
  assert.match(html, /lang="en"/);
  assert.match(html, /one word/);
  assert.ok(!html.includes('dzcol'), 'no hanging columns');
  assert.ok(!html.includes(`>${s.duizi.round.ref}<`));
  assert.ok(!/上联|下联|字数|平仄/.test(html));
  assert.equal(duiziTableOf(L.duizi, 'en'), 'rhymes.json');
  assert.equal(duiziTableOf(look(zh, content, ctx()).duizi, 'zh'), 'tones.json');
  assert.deepEqual(duiziFormOf(L.duizi, L.duizi.round.up, 'x', null).checks, { one: 'wait', copy: 'wait' });
  assert.equal(duiziFormOf(L.duizi, L.duizi.round.up, L.duizi.round.up, table).checks.copy, 'bad');
  // the Chinese card is the Chinese card still
  const z = must(zh, { action: 'open' }).s;
  const zhtml = cardHtml({ card: 'duizi' }, { look: look(z, content, ctx()), words: WORDS.zh, lang: 'zh' });
  assert.match(zhtml, /dzcol/);
  assert.match(zhtml, /lang="zh"/);
  assert.match(zhtml, /字数/);
});
