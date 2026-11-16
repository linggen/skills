// world.js — what Health gives the world block (SKILL.md `world-line`) and the
// activity log (`activity-verbs`). Pure functions, no I/O: ingest.mjs reads the
// files and writes the results, so these are unit-testable without a phone.
//
// The world is DATA: a reading with the person's own usual beside it, and the
// day it was taken. Nothing here says low, poor or recovered — the review's
// verdict words, its counts and the status score are judgements and stay out;
// what to make of a number is the agent's. The engine copies each value as
// written and never compares, so the "usual" is written here, by the skill that
// holds it.
//
//   health: steps 6240 on 11-15, usual 7100 · sleep 7.1 h, usual 7.0 · … · 12m ago
//
// Where the figures come from: the newest `review/<day>.json` the phone wrote
// (its `verdicts[]` carry each type's `now`, `normal`, `unit` and the day the
// reading belongs to, `series_to`) and the newest row of the mirrored workouts.
// A day's total (steps) belongs to the last whole day, so its day is said; the
// other readings are the review's own day and carry none unless that differs.

const DAY_MS = 86_400_000;

/// The measurements the line carries, in the order it shows them. `unit` says
/// whether the review's unit is written (a step count and a heart rate need no
/// unit beside their name).
export const MEASURES = [
  { key: 'steps', type: 'HKQuantityTypeIdentifierStepCount', unit: false, dp: 0 },
  { key: 'sleep', type: 'HKCategoryTypeIdentifierSleepAnalysis', unit: true, dp: 1 },
  { key: 'resting_hr', type: 'HKQuantityTypeIdentifierRestingHeartRate', unit: false, dp: 0 },
  { key: 'hrv', type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: true, dp: 0 },
];

export const WORKOUT_TYPE = 'workouts';

/// The keys the world file may hold, in the order SKILL.md declares them.
export const FIELDS = [...MEASURES.map((m) => m.key), 'workout'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/// A number as a person would write it: `dp` decimals at most, none when whole.
export const figure = (v, dp = 1) => `${Math.round(v * 10 ** dp) / 10 ** dp}`;

const pad = (n) => String(n).padStart(2, '0');

/// `MM-DD` of a date in the machine's own calendar, or null.
export function monthDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/// `MM-DD` of a review's `series_to` (`YYYY-MM-DD`), or null.
const dayOf = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(5, 10) : null);

/// One measurement as text: `6240 on 11-15, usual 7100`. `shownDay` is the day
/// to write when it is not the review's own.
function reading(measure, verdict, shownDay) {
  if (!verdict || !isNum(verdict.now)) return null;
  const unit = measure.unit && typeof verdict.unit === 'string' && verdict.unit ? ` ${verdict.unit}` : '';
  const on = shownDay ? ` on ${shownDay}` : '';
  const usual = isNum(verdict.normal) ? `, usual ${figure(verdict.normal, measure.dp)}` : '';
  return `${figure(verdict.now, measure.dp)}${unit}${on}${usual}`;
}

/// The last workout as text: `running 42 min on 11-14`, or null.
export function workoutText(workout, kind = null) {
  if (!workout || !isNum(workout.minutes)) return null;
  const name = kind ?? String(workout.activity || 'workout').replace(/_/g, ' ').trim();
  const day = workout.day ? ` on ${workout.day}` : '';
  return `${name} ${Math.round(workout.minutes)} min${day}`;
}

/// What the app's name and the engine's age leave of the 160-character line
/// (`health: ` before, ` · 59m ago` and a margin after).
export const FIELDS_BUDGET = 141;

/// The characters the fields take once the engine joins them.
const joined = (world) =>
  Object.entries(world).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ').length;

/// A long kind of workout is the one thing here that can push the line past
/// what the engine carries (it then drops the last field whole, and the
/// workout is last). Words come off the end of the kind until the line fits.
function fitted(world, workout) {
  if (!world.workout) return world;
  const words = String(workout.activity || 'workout').replace(/_/g, ' ').trim().split(/\s+/);
  while (joined(world) > FIELDS_BUDGET && words.length > 1) {
    words.pop();
    world.workout = workoutText(workout, words.join(' '));
  }
  return world;
}

/// The world file's body from the newest review and the last workout. A field
/// whose figure is not there is absent — never zero, never "n/a". `{}` when
/// there is nothing to say.
///
/// A reading is dated only when its day differs from the review's own date: the
/// phone reads a day's total (steps) for the last whole day, everything else
/// for the review's day.
export function worldOf({ review, workout } = {}) {
  const world = {};
  const verdicts = Array.isArray(review?.verdicts) ? review.verdicts : [];
  const reviewDay = typeof review?.date === 'string' ? review.date.slice(5, 10) : null;
  for (const m of MEASURES) {
    const v = verdicts.find((x) => x?.type === m.type);
    const day = dayOf(v?.series_to);
    const text = reading(m, v, day && day !== reviewDay ? day : null);
    if (text) world[m.key] = text;
  }
  const last = workoutText(workout);
  if (last) world.workout = last;
  return fitted(world, workout);
}

/// The newest workout among mirrored rows: `{activity, minutes, day, end}`.
/// A row retired by a `{"del": uuid}` line anywhere in `rows` does not count.
export function lastWorkout(rows) {
  const gone = new Set(rows.filter((r) => r?.del).map((r) => r.del));
  let best = null;
  for (const r of rows) {
    if (!r || r.del || (r.uuid && gone.has(r.uuid)) || !isNum(r.duration_s)) continue;
    const end = Date.parse(r.end || r.start);
    if (Number.isNaN(end) || (best && end <= best.end)) continue;
    best = { activity: r.activity, minutes: r.duration_s / 60, day: monthDay(end), end };
  }
  return best;
}

/// How recent a workout must be to be news. A phone's first sync sends years of
/// them, and a log that says "finished a workout" for each would bury the day.
export const NEWS_MS = DAY_MS;
/// At most this many in one batch.
export const NEWS_MAX = 3;

/// The activity records for the workouts a batch just filed: `workout`, the
/// kind and length in `detail`. Only rows that ended within a day of `now`.
/// (No `detail.seconds`: the engine reads that as time spent in a page and
/// keeps the record out of "since you last looked".)
export function workoutRecords(addedRows, now = new Date()) {
  return addedRows
    .filter((r) => r && !r.del && r.type === WORKOUT_TYPE && isNum(r.duration_s))
    .filter((r) => {
      const age = now.getTime() - Date.parse(r.end || r.start);
      return age >= -5 * 60e3 && age <= NEWS_MS;
    })
    .slice(0, NEWS_MAX)
    .map((r) => {
      const activity = String(r.activity || 'workout').replace(/_/g, ' ').trim();
      const minutes = Math.round(r.duration_s / 60);
      return {
        by: 'user',
        app: 'health',
        verb: 'workout',
        object: `${activity} ${minutes} min`,
        detail: { kind: activity, minutes },
      };
    });
}
