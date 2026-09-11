// quest.mjs — Health's quest fact, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). A workout of twenty minutes or
// more today: `done_at` is when the newest one ended, as the mirror holds it.
// Only the fact crosses — due, done, when — never a duration, a heart rate or
// the kind of workout.

import fs from 'node:fs';
import path from 'node:path';

import { parseLines } from './store.js';

export const MIN_WORKOUT_S = 20 * 60;

/// Where quest facts live. A mirror kept elsewhere (HEALTH_DIR — a test) writes
/// beside itself, so it can never overwrite the real one.
export const questsDir = (env = process.env) =>
  env.HEALTH_QUESTS ||
  (env.HEALTH_DIR
    ? path.join(env.HEALTH_DIR, 'data', 'quests')
    : path.join(env.HOME || '', '.linggen', 'quests'));

/// The file's body. `done_at` is the end of the newest workout long enough to
/// count and already over, or null.
export function questOf(rows, now = new Date()) {
  let done = null;
  for (const r of rows) {
    const end = new Date(r?.end);
    if (!(Number(r?.duration_s) >= MIN_WORKOUT_S) || Number.isNaN(end.getTime()) || end > now) continue;
    if (!done || end > done) done = end;
  }
  return {
    app: 'health',
    quests: [
      {
        id: 'health-workout',
        period: 'day',
        due: true,
        reward: 20,
        done_at: done ? done.toISOString() : null,
        title: { zh: '炼体 · 运动二十分钟以上', en: 'Temper the body · a workout of twenty minutes or more' },
      },
    ],
  };
}

/// Write the fact from the newest two months of workouts — two, because a
/// month file is keyed by a workout's start and one can run past midnight.
export function writeQuest(samplesDir, dir = questsDir(), now = new Date()) {
  const held = path.join(samplesDir, 'workouts');
  const months = fs.existsSync(held)
    ? fs.readdirSync(held).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-2)
    : [];
  const rows = months.flatMap((m) => parseLines(fs.readFileSync(path.join(held, m), 'utf8')));
  const body = questOf(rows, now);
  const file = path.join(dir, 'health.json');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
  return body.quests[0];
}
