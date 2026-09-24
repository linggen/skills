// quest.mjs — Health's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is Health's MENU, each
// entry's `done_at` read from what the mirror already holds — the phone's own
// records, filed here by the same sync that brings everything else:
//
//   health-workout  a workout of twenty minutes or more: when the newest ended.
//                   The fixed daily — never in the one-chore-a-day `pool`.
//   health-report   this week's letter read: the `opened_at` the phone stamps
//                   on letters/<week>.json when its Letters screen opens it.
//
// Only the fact crosses — due, done, when — never a duration, a heart rate,
// the kind of workout or a word of the letter. An entry this menu does not
// know stays in the file as it is; written whole (tmp + rename).

import fs from 'node:fs';
import path from 'node:path';

import { parseLines } from './store.js';

export const MIN_WORKOUT_S = 20 * 60;

const OPEN = '/apps/health/scripts/index.html';

/// Where quest facts live. A mirror kept elsewhere (HEALTH_DIR — a test) writes
/// beside itself, so it can never overwrite the real one.
export const questsDir = (env = process.env) =>
  env.HEALTH_QUESTS ||
  (env.HEALTH_DIR
    ? path.join(env.HEALTH_DIR, 'data', 'quests')
    : path.join(env.HOME || '', '.linggen', 'quests'));

const newest = (times, now) => {
  let done = null;
  for (const t of times) {
    const at = new Date(t);
    if (Number.isNaN(at.getTime()) || at > now) continue;
    if (!done || at > done) done = at;
  }
  return done ? done.toISOString() : null;
};

/// The file's body. `rows` are workouts; `letters` the letter registers.
/// `held` is what the file holds now — its entries this menu does not know
/// are kept.
export function questOf(rows, now = new Date(), letters = [], held = null) {
  const workouts = rows.filter((r) => Number(r?.duration_s) >= MIN_WORKOUT_S).map((r) => r?.end);
  const menu = [
    {
      id: 'health-workout',
      period: 'day',
      due: true,
      reward: 20,
      stamina: 30, // stamina refilled in Lingjing — a kept workout sends the player back with breath
      device: 'phone',
      open: OPEN,
      done_at: newest(workouts, now),
      title: { zh: '炼体 · 运动二十分钟以上', en: 'Temper the body · a workout of twenty minutes or more' },
    },
    {
      id: 'health-report',
      period: 'week',
      due: true,
      reward: 20,
      stamina: 10,
      device: 'phone',
      pool: true,
      open: OPEN,
      done_at: newest(letters.map((l) => l?.opened_at).filter(Boolean), now),
      title: { zh: '问诊 · 看一次本周报告', en: "See the physician · read this week's letter" },
    },
  ];
  const mine = new Set(menu.map((m) => m.id));
  const others = Array.isArray(held?.quests)
    ? held.quests.filter((q) => q && typeof q === 'object' && !mine.has(q.id))
    : [];
  return { app: 'health', quests: [...menu, ...others] };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/// Write the facts from the newest two months of workouts — two, because a
/// month file is keyed by a workout's start and one can run past midnight —
/// and the newest letters beside them (`<data>/letters`).
export function writeQuest(samplesDir, dir = questsDir(), now = new Date()) {
  const held = path.join(samplesDir, 'workouts');
  const months = fs.existsSync(held)
    ? fs.readdirSync(held).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-2)
    : [];
  const rows = months.flatMap((m) => parseLines(fs.readFileSync(path.join(held, m), 'utf8')));
  const lettersDir = path.join(path.dirname(samplesDir), 'letters');
  const letters = fs.existsSync(lettersDir)
    ? fs.readdirSync(lettersDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-2)
        .map((f) => readJson(path.join(lettersDir, f)))
    : [];
  const file = path.join(dir, 'health.json');
  const body = questOf(rows, now, letters, readJson(file));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
  return body.quests[0];
}
