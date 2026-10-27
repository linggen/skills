#!/usr/bin/env node
// tools/analytics-read.mjs — the play log (rules/analytics.mjs) for the numbers (tools/numbers.mjs and any validator):
// measured minutes in place of modelled ones, once there is play to measure. Reads only; local files only.
//
//   import { readAnalytics, measuredMinutes } from './analytics-read.mjs';
//   const a = readAnalytics({ save: 'main' });          // { dir, lines, report }  (report: scripts/stats.mjs)
//   const m = measuredMinutes(a);                       // the shape below
//   node tools/analytics-read.mjs [--save=<name>] [--dir=<skill data dir>] [--min=3]   → that JSON on stdout
//
// measuredMinutes → {
//   save, lines, days, from, to,
//   boards:   { "<mechanic>": { n, median_min, designed_min } },   // balance.json play_pay.minutes, by kind
//   games:    { "<game id>":  { n, median_min, mechanic } },
//   fights:   { n, median_min, won: <0..1> },                       // model.minutes.fight, model.fight_win_rate
//   reading:  { chars_per_min },                                    // model.chars_per_min
//   per_day:  { median_min, sessions },                             // model.players.typical.minutes, sittings
//   hui:      { "<hui id>": { active_min, days } },
//   layer:    { "<tier>:<layer>": { active_min, days } },
//   fight_bands: { "<beast>": { n, won, bot } },                    // real win share beside the chip's bot share
// }
// A kind with fewer than `min` plays (default 3) is left out: too few to replace a model's number.
// Where: data/analytics/ for the player's own save (or LINGJING_DATA), data/saves/<name>/analytics/ for a test save.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, DEFAULT_WORLD } from '../scripts/content.mjs';
import { readLines } from '../scripts/rules/analytics.mjs';
import { median, report } from '../scripts/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DATA = () => process.env.LINGJING_DATA || path.resolve(HERE, '../data');

/** The log of one save, and the report over it. `dir`: the skill's data dir (data/). */
export function readAnalytics({ save = 'main', dir = SKILL_DATA(), world = DEFAULT_WORLD, now = new Date() } = {}) {
  const at = save && save !== 'main' ? path.join(dir, 'saves', save) : dir;
  const lines = readLines(at);
  const content = loadWorld(world);
  return { dir: path.join(at, 'analytics'), save, lines, content, report: report(lines, content, { now }) };
}

const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** The measured numbers, in the model's own units (minutes, shares, chars a minute). */
export function measuredMinutes(a, { min = 3 } = {}) {
  const { lines, report: rep, content } = a;
  const boards = {}, games = {};
  for (const b of rep.boards) {
    if (b.n >= min) games[b.game] = { n: b.n, median_min: b.median_min, mechanic: b.mechanic };
  }
  const byKind = new Map();
  for (const l of lines.filter((x) => x.kind === 'board')) {
    const g = rep.boards.find((b) => b.game === (l.game ?? l.id));
    const k = g?.mechanic ?? 'unknown';
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push((Number(l.active_s) || 0) / 60);
  }
  const pp = content?.balance?.play_pay;
  for (const [k, xs] of byKind) if (xs.length >= min) boards[k] = { n: xs.length, median_min: r1(median(xs)), designed_min: pp?.minutes?.[k] ?? pp?.minutes?.default ?? null };
  const f = lines.filter((x) => x.kind === 'fight' && (x.outcome === 'won' || x.outcome === 'lost'));
  const days = rep.retention.per_day;
  return {
    save: a.save, lines: rep.lines, days: rep.retention.days, from: rep.retention.first, to: rep.retention.last,
    boards, games,
    fights: f.length >= min ? { n: f.length, median_min: r1(median(f.map((x) => (Number(x.active_s) || 0) / 60))), won: r1(f.filter((x) => x.outcome === 'won').length / f.length * 100) / 100 } : null,
    reading: { chars_per_min: rep.reading.chars_per_min },
    per_day: days.length ? { median_min: r1(median(days.map((d) => d.active_min))), sessions: r1(median(days.map((d) => d.sessions))) } : null,
    hui: Object.fromEntries(rep.time.hui.map((h) => [h.hui, { active_min: h.active_min, days: h.days }])),
    layer: Object.fromEntries(rep.time.layer.map((l) => [`${l.tier}:${l.layer}`, { active_min: l.active_min, days: l.days }])),
    fight_bands: Object.fromEntries(rep.fights.filter((x) => x.n >= min).map((x) => [x.beast, { n: x.n, won: x.won, bot: x.bot }])),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const a = readAnalytics({ save: arg('save') ?? 'main', ...(arg('dir') ? { dir: arg('dir') } : {}) });
  console.log(JSON.stringify(measuredMinutes(a, { min: Number(arg('min') ?? 3) }), null, 2));
}
