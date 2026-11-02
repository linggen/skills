// quest.mjs — Health's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is Health's MENU; each
// entry's `done_at` is Health's own record of the last time it was done, and
// `due` says whether it can be done now — a row Health cannot offer (no step
// data, no letter this week, no new doctor's note) publishes `due: false`, and
// a game hides it.
//
//   health-steps   5,000 steps today: the phone says so (fact `health-steps`,
//                  HealthKit's own de-duplicated day total — the mirror holds
//                  Watch and iPhone samples that overlap, so it never sums
//                  them). Due while the mirror holds steps from the last 2 days
//                  and a phone has said it once — a phone that cannot send the
//                  fact never gets a chore it cannot finish.
//   health-sleep   last night ≥ 7 h asleep: the phone says so (fact
//                  `health-sleep`). Due while the mirror holds sleep from the
//                  last 2 days (no Watch at night, no chore) and a phone has
//                  said it once.
//   health-report  this week's letter read: the `opened_at` the phone stamps
//                  on letters/<week>.json. Due while a letter is under 8 days old.
//   health-doctor  a new doctor's note read on the phone (fact `health-doctor`).
//                  Due when the newest review (≤ 2 days old) holds a finding
//                  worth a doctor, written after the last read — event-driven.
//
//   node quest.mjs stamp <id> <at>   the engine's door for a phone fact (SKILL.md
//                  `quests:`): done at <at>, never moving a done time back;
//                  exit 0 once held, else 1.
//
// Only the fact crosses — due, done, when — never a count, an hour, a heart
// rate or a word of the letter. Rows this menu retired leave the file; an
// entry it does not know stays as it is. Written whole (tmp + rename).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLines } from './store.js';

const OPEN = '/apps/health/scripts/index.html';
const DAY = 864e5;
export const STEPS_TYPE = 'HKQuantityTypeIdentifierStepCount';
export const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';

/// Retired rows: they leave the file, done or not (2026-11-02: the workout
/// became 5,000 steps).
export const RETIRED = ['health-workout'];

export const MENU = [
  {
    id: 'health-steps', kind: 'body', period: 'day', reward: 20, device: 'phone', open: OPEN,
    title: { zh: '炼体 · 走满 5000 步', en: 'Temper the body · walk 5,000 steps' },
    how: { zh: '带着手机或手表走路，今天满 5000 步即成', en: 'Walk with your phone or Watch; 5,000 steps today' },
  },
  {
    id: 'health-sleep', kind: 'rest', period: 'day', reward: 20, device: 'phone', open: OPEN,
    title: { zh: '养神 · 昨晚睡够 7 小时', en: 'Rest the spirit · sleep 7 hours last night' },
    how: { zh: '戴着手表睡觉，昨夜睡满 7 小时即成', en: 'Sleep with your Watch on; 7 hours asleep counts' },
  },
  {
    id: 'health-report', kind: 'heal', period: 'week', reward: 20, device: 'phone', pool: true, open: OPEN,
    title: { zh: '问诊 · 看本周健康报告', en: "See the physician · read this week's health letter" },
    how: { zh: '在手机的健康里打开本周来信', en: "Open this week's letter in Health on your phone" },
  },
  {
    id: 'health-doctor', kind: 'heal', period: 'week', reward: 20, device: 'phone', pool: true, open: OPEN,
    title: { zh: '求医问药 · 看新医嘱', en: "Consult the healer · read the new doctor's note" },
    how: { zh: '在手机的健康里打开「给医生看的」', en: "Open 'For your doctor' in Health on your phone" },
  },
];

/// Rows only a stamp (a phone fact) marks done.
const STAMPED = new Set(['health-steps', 'health-sleep', 'health-doctor']);

/// Where quest facts live. A mirror kept elsewhere (HEALTH_DIR — a test) writes
/// beside itself, so it can never overwrite the real one.
export const questsDir = (env = process.env) =>
  env.HEALTH_QUESTS ||
  (env.HEALTH_DIR
    ? path.join(env.HEALTH_DIR, 'data', 'quests')
    : path.join(env.HOME || '', '.linggen', 'quests'));

const time = (t) => {
  const at = typeof t === 'string' ? Date.parse(t) : NaN;
  return Number.isNaN(at) ? null : at;
};
const valid = (t) => (time(t) === null ? null : t);

const newest = (times, now) => {
  let done = null;
  for (const t of times) {
    const at = time(t);
    if (at === null || at > now.getTime()) continue;
    if (done === null || at > done) done = at;
  }
  return done === null ? null : new Date(done).toISOString();
};

const within = (t, now, days) => {
  const at = time(t);
  return at !== null && at <= now.getTime() + 5 * 60e3 && now.getTime() - at <= days * DAY;
};

/// Whether each row can be done now, from what the mirror holds.
/// `facts`: { stepsAt, sleepAt (newest sample ends), letters, reviews }.
export function dueOf(facts, now, held = new Map()) {
  const review = (facts.reviews || [])
    .filter((r) => r && within(r.written_at || r.at, now, 2))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .pop();
  const read = time(held.get('health-doctor'));
  const note = review && Number(review.doc) > 0 ? time(review.written_at || review.at) : null;
  return {
    // A phone that never sent the fact cannot finish the row: hidden until it has.
    'health-steps': within(facts.stepsAt, now, 2) && held.get('health-steps') != null,
    'health-sleep': within(facts.sleepAt, now, 2) && held.get('health-sleep') != null,
    'health-report': (facts.letters || []).some((l) => l && within(l.written_at, now, 8)),
    'health-doctor': note !== null && (read === null || read < note),
  };
}

/// The file's body: the menu with `due` from `facts` (or as `held` had it, for
/// a row `facts` does not speak to), `done_at` from the letters or as held.
/// Retired rows leave; unknown ones stay.
export function questOf(facts, now = new Date(), held = null) {
  const kept = Array.isArray(held?.quests) ? held.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(kept.map((q) => [q.id, q]));
  const doneHeld = new Map(kept.map((q) => [q.id, valid(q.done_at)]));
  const due = facts ? dueOf(facts, now, doneHeld) : {};
  const menu = MENU.map((m) => {
    const read = m.id === 'health-report' && facts ? newest((facts.letters || []).map((l) => l?.opened_at), now) : null;
    const done = STAMPED.has(m.id) ? doneHeld.get(m.id) ?? null : later(doneHeld.get(m.id), read);
    const d = m.id in due ? due[m.id] : was.get(m.id)?.due === true;
    return { ...m, due: d, done_at: done };
  });
  const mine = new Set([...MENU.map((m) => m.id), ...RETIRED]);
  return { app: 'health', quests: [...menu, ...kept.filter((q) => !mine.has(q.id))] };
}

const later = (a, b) => {
  const ta = time(a), tb = time(b);
  if (ta === null) return tb === null ? null : b;
  if (tb === null) return a;
  return tb > ta ? b : a;
};

const STAMP_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/// Stamp a phone fact's row done at `at`, never moving it back; `due` stays as
/// the file holds it (the mirror's next write recomputes it). Exit code.
export function stamp(id, at, dir = questsDir()) {
  const when = new Date(at);
  if (!STAMPED.has(id) || !STAMP_AT.test(String(at || '')) || Number.isNaN(when.getTime())) return 1;
  const file = path.join(dir, 'health.json');
  const held = readJson(file);
  const body = questOf(null, when, held);
  const row = body.quests.find((q) => q.id === id);
  row.done_at = later(row.done_at, when.toISOString());
  try {
    writeWhole(dir, file, body);
    return 0;
  } catch {
    return 1;
  }
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const writeWhole = (dir, file, body) => {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
};

/// The newest sample end of a type, from its newest month file.
function newestEnd(samplesDir, type, now) {
  const dir = path.join(samplesDir, type);
  if (!fs.existsSync(dir)) return null;
  const months = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-1);
  const rows = months.flatMap((m) => parseLines(fs.readFileSync(path.join(dir, m), 'utf8')));
  return newest(rows.map((r) => r?.end), new Date(now.getTime() + 5 * 60e3));
}

/// The newest `n` dated JSON files of a folder (`YYYY-MM-DD.json`).
const dated = (dir, n) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-n)
        .map((f) => readJson(path.join(dir, f))).filter(Boolean)
    : [];

/// What the mirror holds that the menu reads: `<data>/samples`, `letters`, `review`.
export function factsOf(samplesDir, now = new Date()) {
  const data = path.dirname(samplesDir);
  return {
    stepsAt: newestEnd(samplesDir, STEPS_TYPE, now),
    sleepAt: newestEnd(samplesDir, SLEEP_TYPE, now),
    letters: dated(path.join(data, 'letters'), 2),
    reviews: dated(path.join(data, 'review'), 2),
  };
}

/// Write the file from what the mirror holds. Returns the body.
export function writeQuest(samplesDir, dir = questsDir(), now = new Date()) {
  const file = path.join(dir, 'health.json');
  const body = questOf(factsOf(samplesDir, now), now, readJson(file));
  writeWhole(dir, file, body);
  return body;
}

const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url)) && process.argv[2] === 'stamp') {
  process.exitCode = stamp(process.argv[3], process.argv[4]);
}
