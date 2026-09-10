// The Mac's half of the composition: it validates what the phone composed,
// changes only the choice, refuses what the phone would refuse, and falls
// back to the review's own series for a phone that has not composed yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  cardsOf,
  changeFocus,
  dismissCard,
  homeOf,
  MAX_HIGHLIGHTS,
  selectedOf,
  validEntry,
  validHome,
  VERSION,
} from '../scripts/home.js';

const line = (subject, days = 14) => ({
  id: `${subject}#line${days}`,
  subject,
  kind: 'line',
  kinds: ['line'],
  title: subject === 'hrv' ? 'HRV' : 'Resting heart rate',
  question: `Is my ${subject} where it usually is?`,
  period: `Last ${days} days`,
  periods: [`${subject}#line14`, `${subject}#line28`],
  unit: subject === 'hrv' ? 'ms' : 'bpm',
  values: Array.from({ length: days }, (_, i) => (i % 5 === 3 ? null : 30 + (i % 4))),
  labels: Array.from({ length: days }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`),
  normal: 32,
  coverage: `${days - Math.floor(days / 5)} of ${days} days measured`,
  source: 'review/2026-09-08.json',
  relevance: 0.85,
  tier: 'ranked',
});
const energy = {
  id: 'energy#share28',
  subject: 'energy',
  kind: 'share',
  kinds: ['share', 'bars'],
  title: 'Activity balance',
  question: 'How is my activity energy divided between sports?',
  period: 'Last 28 days',
  periods: ['energy#share7', 'energy#share28'],
  unit: 'kcal',
  values: [1240, 840, 310],
  labels: ['Running', 'Functional strength training', 'Walking'],
  coverage: 'Estimated energy from 9 recorded workouts',
  source: 'workouts',
  relevance: 0.35,
  tier: 'ranked',
};
const nights = {
  id: 'sleep#nights14',
  subject: 'sleep',
  kind: 'nights',
  kinds: ['nights', 'line'],
  title: 'Sleep timing',
  question: 'How consistent is my bedtime?',
  period: 'Last 14 nights',
  periods: ['sleep#nights14'],
  unit: 'h',
  values: [7.1, null, 6.8, 7.4, null, 7.0, 6.5, 7.2, 7.3, null, 6.9, 7.1, 7.0, 6.7],
  labels: Array.from({ length: 14 }, (_, i) => `2026-08-${String(26 + i).padStart(2, '0')}`).map((d, i) =>
    i < 6 ? d : `2026-09-${String(i - 5).padStart(2, '0')}`),
  nights: [7.1, null, 6.8, 7.4, null, 7.0, 6.5, 7.2, 7.3, null, 6.9, 7.1, 7.0, 6.7].map((h) =>
    h == null ? null : { bed: 330, wake: 400, hours: h }),
  normal: 7.0,
  coverage: '11 of 14 nights recorded',
  source: 'sleep rows',
  relevance: 0.8,
  tier: 'goal',
};
const progress = {
  id: 'protein#progress',
  subject: 'protein',
  kind: 'progress',
  kinds: ['progress'],
  title: 'Protein',
  question: 'How am I doing against my protein target?',
  period: 'Today',
  periods: ['protein#progress'],
  unit: 'g',
  values: [61],
  labels: ['Today'],
  target: 169,
  target_source: '2.0 g/kg × 84.6 kg (bulking, serious)',
  coverage: 'Logged protein against the target in your plan',
  source: 'targets.json',
  relevance: 0.8,
  tier: 'goal',
};

const home = () => ({
  version: VERSION,
  composed_at: '2026-09-08T05:00:00.000Z',
  by: 'rules',
  catalog: [progress, nights, line('hrv'), line('hrv', 28), line('rhr'), energy],
  selected: 'protein#progress',
  selected_by: 'rules',
  selected_on: '2026-09-08',
  why: 'Your goal is bulking — this is the measure of it.',
  hidden: [],
  kinds: {},
  opened: {},
  attention: [{ kind: 'gap', subject: 'sleep', label: 'Sleep', text: '3 of the last 7 nights have no sleep data' }],
});

test('the validator refuses what the page cannot draw', () => {
  assert.equal(validEntry(line('hrv')), null);
  assert.match(validEntry({ ...line('hrv'), kind: 'pie', kinds: ['pie'] }), /unknown kind/);
  assert.match(validEntry({ ...line('hrv'), labels: ['one'] }), /disagree/);
  assert.match(validEntry({ ...line('hrv'), values: [NaN, 1, 2] }), /not a number|disagree/);
  assert.match(validEntry({ ...energy, values: [-1, 2, 3] }), /negative/);
  assert.match(validEntry({ ...energy, values: [1, 2, 3, 4, 5, 6, 7], labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), /six/);
  assert.match(validEntry({ ...progress, target: 0 }), /target/);
  assert.match(validEntry({ ...nights, nights: [null] }), /nights/);
  assert.equal(validHome(home()), null);
  assert.match(validHome({ ...home(), selected: 'nope' }), /selected/);
  assert.match(validHome({ ...home(), catalog: [energy, energy] }), /duplicate/);
  assert.match(validHome({ ...home(), version: 1 }), /version/);
});

test('a change chooses among the catalog and never touches a value', () => {
  const h = home();
  const picked = changeFocus(h, { action: 'select', id: 'sleep#nights14' });
  assert.equal(picked.selected, 'sleep#nights14');
  assert.equal(picked.selected_by, 'user');
  assert.equal(picked.why, 'You chose it.');
  assert.deepEqual(picked.catalog, h.catalog, 'the catalog is the phone\'s and stays so');
  const asBars = changeFocus(picked, { action: 'kind', id: 'energy#share28', kind: 'bars' });
  assert.equal(asBars.kinds['energy#share28'], 'bars');
  assert.throws(() => changeFocus(picked, { action: 'kind', id: 'energy#share28', kind: 'nights' }), /drawn as/);
  assert.throws(() => changeFocus(h, { action: 'select', id: 'nothing#here' }), /No "nothing#here"/);
  assert.throws(() => changeFocus(h, { action: 'delete', id: 'sleep#nights14' }), /Unknown action/);
});

test('the agent chooses with a why and is refused by a pin or a hide; the person\'s own choice lifts both', () => {
  const h = home();
  const agent = changeFocus(h, { action: 'agent', id: 'hrv#line14', why: 'Your HRV has been low.' });
  assert.equal(agent.selected, 'hrv#line14');
  assert.equal(agent.selected_by, 'agent');
  assert.equal(agent.why, 'Your HRV has been low.');
  const pinned = changeFocus(agent, { action: 'pin', id: 'rhr#line14' });
  assert.equal(pinned.pinned, 'rhr');
  assert.throws(() => changeFocus(pinned, { action: 'agent', id: 'hrv#line14' }), /pinned/);
  const hidden = changeFocus(changeFocus(pinned, { action: 'unpin' }), { action: 'hide', id: 'hrv#line14' });
  assert.deepEqual(hidden.hidden, ['hrv']);
  assert.throws(() => changeFocus(hidden, { action: 'agent', id: 'hrv#line14' }), /see less/);
  const back = changeFocus(hidden, { action: 'select', id: 'hrv#line14' });
  assert.deepEqual(back.hidden, []);
  assert.equal(back.pinned, undefined);
});

test('hiding the one on screen hands Focus to the next in the phone\'s order', () => {
  const h = home();
  const next = changeFocus(h, { action: 'hide', id: 'protein#progress' });
  assert.equal(next.selected, 'sleep#nights14');
  assert.equal(next.selected_by, 'rules');
  assert.match(next.why, /next in line/);
  assert.throws(() => changeFocus(next, { action: 'unhide', id: 'hrv' }), /not hidden/);
  assert.deepEqual(changeFocus(next, { action: 'unhide', id: 'protein' }).hidden, []);
});

test('a phone that has not composed yet still gets its fortnights drawn, never a guess', () => {
  const report = {
    today: '2026-09-08',
    review: {
      date: '2026-09-08',
      index: { picked: 'hrv' },
      verdicts: [
        { type: 'hrv', label: 'HRV', verdict: 'normal', unit: 'ms', normal: 32, series: [30, null, 33, 31], series_to: '2026-09-08' },
        { type: 'w', label: 'Weight', verdict: 'thin' },
        { type: 'x', label: 'One', verdict: 'normal', series: [1] },
      ],
    },
  };
  const h = homeOf(report);
  assert.equal(h.fallback, true);
  assert.equal(h.catalog.length, 1, 'thin and single-point series are not drawn');
  assert.equal(h.selected, 'hrv#line14');
  assert.deepEqual(h.catalog[0].values, [30, null, 33, 31], 'a gap stays a gap');
  assert.equal(h.catalog[0].labels[0], '2026-09-05');
  assert.equal(selectedOf(h).kind, 'line');
  assert.equal(homeOf({ layout: { home: home() } }).fallback, undefined, 'a valid composition is used as it is');
  assert.equal(homeOf({}).catalog.length, 0);
});

test('the writer files the change as the newer layout and undo puts the old one back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-home-'));
  try {
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(
      path.join(dir, 'data/layout.json'),
      JSON.stringify({ version: 4, cards: [], home: home(), written_at: '2026-09-08T05:00:00.000Z' }),
    );
    const run = (...args) => {
      const r = spawnSync(process.execPath, [new URL('../scripts/ingest.mjs', import.meta.url).pathname, 'focus', ...args], {
        env: { ...process.env, HEALTH_DIR: dir },
        encoding: 'utf8',
      });
      return JSON.parse(r.stdout.trim().split('\n').pop());
    };
    const picked = run('sleep#nights14', 'select');
    assert.equal(picked.ok, true);
    assert.equal(picked.layout.home.selected, 'sleep#nights14');
    assert.equal(picked.layout.by_device, 'mac');
    assert.ok(picked.layout.written_at > '2026-09-08T05:00:00.000Z', 'newer, so the phone adopts it');
    assert.match(picked.focus, /bedtime/);
    assert.deepEqual(picked.layout.home.catalog, home().catalog, 'not a value changed');
    const refused = run('hrv#line14', 'agent', 'none', 'because');
    assert.equal(refused.ok, true, 'nothing pinned or hidden, so the agent may');
    assert.equal(refused.layout.home.why, 'because');
    const undone = run('none', 'undo');
    assert.equal(undone.layout.home.selected, 'sleep#nights14');
    const bad = run('nothing#here', 'select');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /No "nothing#here"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Highlights: the composed page, and the hand that takes a card off it ─────
//
// The phone composes `candidates` + `highlights.cards`; this Mac renders that
// list and may dismiss from it. The rule here is the phone's
// `HealthHome.dismiss` written a second time, so the two must agree: a
// dismissal made here lands as the newer layout and the phone adopts it whole.

const composed = () => ({
  ...home(),
  candidates: [
    { id: 'brief', kind: 'brief', label: 'Brief', warning: false, dismissable: false, fact: '2026-09-08' },
    { id: 'warning:hrv', kind: 'warning', label: 'HRV', subject: 'hrv', warning: true, dismissable: false, fact: '2026-09-08:22' },
    { id: 'notice:letter', kind: 'notice', label: 'The Sunday letter', route: 'letters', warning: false, dismissable: true, fact: '2026-W36' },
    { id: 'focus:hrv#line14', kind: 'focus', label: 'HRV', subject: 'hrv', warning: false, dismissable: true, fact: 'hrv#line14:2026-09-08' },
    { id: 'finding:rhr', kind: 'finding', label: 'Resting heart rate', subject: 'rhr', warning: false, dismissable: true, fact: '2026-09-08:61' },
    { id: 'gap:sleep', kind: 'gap', label: 'Sleep', subject: 'sleep', warning: false, dismissable: true, fact: '2026-09-08' },
  ],
  highlights: { cards: ['brief', 'warning:hrv', 'notice:letter', 'focus:hrv#line14'], by: 'rules' },
  dismissed: {},
});

test('a dismissal takes the card off, remembers the fact, and refills the slot', () => {
  const next = dismissCard(composed(), 'notice:letter', new Date('2026-09-08T09:00:00.000Z'));
  assert.deepEqual(
    cardsOf(next),
    ['brief', 'warning:hrv', 'focus:hrv#line14', 'finding:rhr', 'gap:sleep'],
    'the freed slot is refilled from the rules’ order, never left as a hole',
  );
  assert.equal(next.dismissed['notice:letter'], '2026-W36', 'dismissed FOR ITS FACT');
  assert.equal(next.changed_at, '2026-09-08T09:00:00.000Z');
  // The same card comes back the moment the fact changes — a new week's letter
  // is not the one they waved away.
  const nextWeek = {
    ...next,
    candidates: next.candidates.map((c) =>
      c.id === 'notice:letter' ? { ...c, fact: '2026-W37' } : c,
    ),
  };
  const after = dismissCard(nextWeek, 'finding:rhr', new Date('2026-09-08T10:00:00.000Z'));
  assert.ok(cardsOf(after).includes('notice:letter'), 'a new fact is new news');
});

test('what must stay on the page cannot be dismissed', () => {
  assert.throws(() => dismissCard(composed(), 'warning:hrv'), /stays until it passes/);
  assert.throws(() => dismissCard(composed(), 'brief'), /stays until it passes/);
  assert.throws(() => dismissCard(composed(), 'nothing:here'), /is not on the page/);
});

test('the page never grows past what it may hold', () => {
  const many = composed();
  many.candidates = [
    ...many.candidates,
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `finding:x${i}`,
      kind: 'finding',
      label: `X${i}`,
      subject: `x${i}`,
      warning: false,
      dismissable: true,
      fact: `2026-09-08:${i}`,
    })),
  ];
  many.highlights = { cards: many.candidates.slice(0, MAX_HIGHLIGHTS).map((c) => c.id), by: 'rules' };
  const next = dismissCard(many, 'notice:letter');
  assert.equal(cardsOf(next).length, MAX_HIGHLIGHTS);
});

test('the writer files a dismissal as the newer layout, for the phone to adopt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-dismiss-'));
  try {
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(
      path.join(dir, 'data/layout.json'),
      JSON.stringify({ version: 4, cards: [], home: composed(), written_at: '2026-09-08T05:00:00.000Z' }),
    );
    const r = spawnSync(
      process.execPath,
      [new URL('../scripts/ingest.mjs', import.meta.url).pathname, 'dismiss', 'notice:letter'],
      { env: { ...process.env, HEALTH_DIR: dir }, encoding: 'utf8' },
    );
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(out.ok, true);
    assert.ok(!out.cards.includes('notice:letter'));
    assert.equal(out.layout.by_device, 'mac');
    assert.ok(out.layout.written_at > '2026-09-08T05:00:00.000Z', 'newer, so the phone adopts it');
    const filed = JSON.parse(fs.readFileSync(path.join(dir, 'data', out.layout.previous), 'utf8'));
    assert.ok(cardsOf(filed.home).includes('notice:letter'), 'the page it replaced is filed for undo');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
