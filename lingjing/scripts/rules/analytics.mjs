// rules/analytics.mjs — 数据埋点: the play log, local only (Hanli 2026-10-27, review.html 数据埋点与留存 1/5:
// 「没有任何游戏内统计：不知道每局时长、在哪里放弃、次日留存」 · 「先做数据埋点吧」).
//
//   track --events=<json array>     the page's batch: each {kind, t?, …fields}, kept as one line each
//   track --action=status|off|on    whether the log is kept; off keeps nothing from then on
//   stats                           the report over the log (scripts/stats.mjs) — the dev page's (stats.html)
//
// Where: `<dataDir>/analytics/<YYYY-MM>.jsonl` — data/analytics/ for the player's own save, data/saves/<name>/analytics/
// for a scratch save, so a live check never lands in the player's log and goes with its save. A month a file; a file
// stops growing at MONTH_CAP bytes; months older than KEEP_MONTHS are let go. On the phone (tools/phone/entry.mjs)
// the lines go to a sink the app drains into its own documents folder — never into the save the app keeps.
//
// What: anonymous facts only — ids, times, counts, outcomes. Every kind names the fields it may carry (FIELDS); a
// field not named, or a value that is not a number, a yes/no or a short id, is dropped here, whatever the page sent.
// Never chat text, a drawing, a typed name or answer, a birthday, health or money of the other apps. Nothing leaves the
// device: no verb here, nor anything the page does with it, goes online (ling-mem: skills don't phone home).
import fs from 'node:fs';
import path from 'node:path';
import { dayKey, layerNo } from '../state.mjs';
import { huiNow } from './hui.mjs';

export const MONTH_CAP = 4 * 1024 * 1024;
export const KEEP_MONTHS = 13;
/* One batch at most (a page's flush is far smaller; a phone's catch-up is sent in pieces). */
export const BATCH_MAX = 500;

/* The kinds, and what each may carry. `sid` (the sitting) and `t` (the moment, ms) on every page event. */
const ID = 'id', NUM = 'num', BOOL = 'bool', MSG = 'msg';
export const FIELDS = {
  // A sitting: start, and its end with the active time (input gaps over IDLE_CUT not counted) and the wall time.
  session: { op: ID, active_s: NUM, wall_s: NUM, why: ID },
  // A passage read on the stage: its scene, how many characters, how long it stood, skipped or read through.
  read: { scene: ID, chars: NUM, ms: NUM, active_s: NUM, skipped: BOOL, beats: NUM },
  // A board, open → end. `source`: story · tray · errand · today · tale · arcade · show.
  board: { id: ID, game: ID, level: ID, source: ID, scene: ID, task: ID, ms: NUM, active_s: NUM, outcome: ID, stars: NUM, grade: ID, retries: NUM, hints: NUM, asks: NUM, why: ID },
  // A fight: the beast, where, the hand, how it went, its turns, the odds chip the card showed.
  fight: { id: ID, beast: ID, place: ID, hand: NUM, outcome: ID, turns: NUM, chip: ID, odds: NUM, ms: NUM, active_s: NUM, source: ID },
  // A stage-gated wait (the 回's cap, 体力 spent, a cooldown): shut, then open with how long it held.
  gate: { what: ID, op: ID, waited_s: NUM },
  // 问询 / 问银月 tapped, and a board's hint.
  ask: { to: ID, what: ID, board: ID },
  hint: { board: ID, n: NUM },
  // Soft-lock signals: a board standing with no input, a refused tap streak, a page error.
  stall: { what: ID, board: ID, idle_s: NUM, scene: ID },
  refused: { verb: ID, why: ID, streak: NUM },
  error: { where: ID, msg: MSG },
  // What the rules paid (written here, never by the page): 修为 and 灵石 by source.
  pay: { src: ID, verb: ID, id: ID, xw: NUM, ls: NUM, errand_xw: NUM, errand_ls: NUM },
};
export const KINDS = Object.keys(FIELDS);
/* Fields every page event may carry. */
const COMMON = { sid: ID, t: NUM, dev: ID };

/* A short id: letters, digits, CJK, and the few marks ids use. Never a sentence: no spaces past one word's worth. */
const ID_RE = /^[\w㐀-鿿·:.\-/+#]{1,64}$/u;
/* An error's message, cut, with anything quoted in it put away — a quote could hold what someone typed. */
const cleanMsg = (s) => String(s).replace(/(["'`「『])[\s\S]*?(["'`」』]|$)/g, '$1…$2').replace(/\s+/g, ' ').slice(0, 120);

function cleanValue(type, v) {
  if (type === NUM) return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  if (type === BOOL) return typeof v === 'boolean' ? v : undefined;
  if (type === MSG) return typeof v === 'string' && v ? cleanMsg(v) : undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && ID_RE.test(v) ? v : undefined;
}

/** One event as it may be kept, or null: a known kind, and only its named fields with clean values. */
export function cleanEvent(e) {
  if (!e || typeof e !== 'object' || !FIELDS[e.kind]) return null;
  const allowed = { ...COMMON, ...FIELDS[e.kind] }, out = { kind: e.kind };
  for (const [k, type] of Object.entries(allowed)) {
    if (!(k in e)) continue;
    const v = cleanValue(type, e[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/* Where the save stands, stamped on every line: tier, layer, 回, scene, chapter. Read without the lock: the state is
   written by an atomic rename, so a read sees one whole save or the one before. */
export function standing(content, state) {
  if (!state || !content) return {};
  const out = { tier: state.tier ?? null, layer: null, hui: null, chapter: state.chapter ?? null, at_scene: state.scene ?? null };
  try { out.layer = layerNo(content, state.tier, state.step ?? 0); } catch { /* an unknown tier: no layer */ }
  try { out.hui = huiNow(content, state); } catch { /* a chapter with no 回 */ }
  return out;
}

/* The moment an event happened: the page's `t` when it is sane (a week back at most, never ahead), else now. */
const WEEK = 7 * 86_400_000;
function momentOf(t, now) {
  const n = now.getTime();
  return typeof t === 'number' && t > n - WEEK && t <= n + 60_000 ? new Date(t) : now;
}

/** The lines a batch becomes: cleaned, stamped, at most BATCH_MAX. `stamp` is standing(); `save` the save's name. */
export function linesOf(events, { now, save = 'main', stamp = {}, dev = 'mac' } = {}) {
  const out = [];
  for (const raw of (Array.isArray(events) ? events : []).slice(0, BATCH_MAX)) {
    const e = cleanEvent(raw);
    if (!e) continue;
    const { t, ...rest } = e;
    out.push({ at: momentOf(t, now).toISOString(), save, ...stamp, dev: rest.dev ?? dev, ...rest });
  }
  return out;
}

/* The stamp a kept line carries (linesOf), each checked again when a line comes from another device. */
const STAMP = { save: ID, tier: ID, layer: NUM, hui: ID, chapter: ID, at_scene: ID };
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A line another device kept (the phone's, carried over): its event cleaned as any, its stamp checked, `dev` fixed. */
export function cleanLine(l, dev) {
  const e = cleanEvent(l);
  if (!e || typeof l.at !== 'string' || !ISO_RE.test(l.at)) return null;
  const { t, dev: _d, ...rest } = e;
  const stamp = {};
  for (const [k, type] of Object.entries(STAMP)) { const v = k in l ? cleanValue(type, l[k]) : undefined; if (v !== undefined) stamp[k] = v; }
  return { at: l.at, save: 'main', ...stamp, dev, ...rest };
}

/* ── The files ── */

export const monthOf = (iso) => String(iso).slice(0, 7);
const dirOf = (dataDir) => path.join(dataDir, 'analytics');
const offFile = (dataDir) => path.join(dirOf(dataDir), 'off');

/* The phone keeps its own (tools/phone/entry.mjs): the lines wait here for the app to drain, never in the save. */
const sink = [];
const sinking = () => process.env.LINGJING_TRACK_SINK === '1';
export const drainSink = () => sink.splice(0, sink.length);

/** Whether the log is kept: off by the file (the Mac's settings) or by the host (the phone's, LINGJING_TRACK_OFF). */
export function isOff(dataDir) {
  if (process.env.LINGJING_TRACK_OFF === '1') return true;
  if (sinking()) return false;
  try { return fs.existsSync(offFile(dataDir)); } catch { return false; }
}

export function setOff(dataDir, off) {
  fs.mkdirSync(dirOf(dataDir), { recursive: true });
  if (off) fs.writeFileSync(offFile(dataDir), 'off\n');
  else fs.rmSync(offFile(dataDir), { force: true });
  return isOff(dataDir);
}

/* Months older than KEEP_MONTHS (by name, YYYY-MM) are let go. */
function prune(dir, now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (KEEP_MONTHS - 1), 1));
  const oldest = d.toISOString().slice(0, 7);
  for (const f of fs.readdirSync(dir)) {
    const m = /^(\d{4}-\d{2})\.jsonl$/.exec(f);
    if (m && m[1] < oldest) fs.rmSync(path.join(dir, f), { force: true });
  }
}

/** Append lines to their months' files. Answers how many were kept (a full month keeps no more). */
export function appendLines(dataDir, lines, now = new Date()) {
  if (!lines.length || isOff(dataDir)) return 0;
  if (sinking()) { sink.push(...lines); return lines.length; }
  const dir = dirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const byMonth = new Map();
  for (const l of lines) { const m = monthOf(l.at); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(JSON.stringify(l)); }
  let kept = 0;
  for (const [m, rows] of byMonth) {
    const file = path.join(dir, `${m}.jsonl`);
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* a new month */ }
    const fit = [];
    for (const r of rows) { if (size + r.length + 1 > MONTH_CAP) break; fit.push(r); size += r.length + 1; }
    if (fit.length) fs.appendFileSync(file, fit.join('\n') + '\n');
    kept += fit.length;
  }
  prune(dir, now);
  return kept;
}

/* The phone's batches already kept (their ids, newest last): a batch sent again after a lost answer is kept once. */
const SEEN_KEEP = 200;
const seenFile = (dataDir) => path.join(dirOf(dataDir), 'batches.json');

/** Whether a batch was kept already (a batch sent again after a lost answer is kept once), and its marking. */
export function batchSeen(dataDir, batch) {
  if (!batch || sinking()) return false;
  try { return JSON.parse(fs.readFileSync(seenFile(dataDir), 'utf8')).includes(batch); } catch { return false; }
}
export function markBatch(dataDir, batch) {
  if (!batch || sinking()) return;
  let seen = [];
  try { seen = JSON.parse(fs.readFileSync(seenFile(dataDir), 'utf8')); } catch { /* none yet */ }
  fs.mkdirSync(dirOf(dataDir), { recursive: true });
  fs.writeFileSync(seenFile(dataDir), JSON.stringify([...seen, batch].slice(-SEEN_KEEP)) + '\n');
}

/** Lines another device kept (`track --action=put`), in batch `batch`: kept once, as theirs. Answers how many. */
export function putLines(dataDir, lines, { batch, dev = 'phone', now = new Date() } = {}) {
  if (isOff(dataDir)) return { kept: 0, off: true };
  if (batchSeen(dataDir, batch)) return { kept: 0, again: true };
  const clean = (Array.isArray(lines) ? lines : []).slice(0, BATCH_MAX).map((l) => cleanLine(l, dev)).filter(Boolean);
  const kept = appendLines(dataDir, clean, now);
  markBatch(dataDir, batch);
  return { kept };
}

/** Every line kept, oldest month first; a torn line is skipped. */
export function readLines(dataDir) {
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.jsonl$/.test(x)).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* half a line from a crash */ }
    }
  }
  return out;
}

/* ── What the rules paid ── */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/* 修为 a result says it paid: its own `paid`, a 闭关's, and the errands it handed in (kept apart). */
function xwOf(result) {
  const own = num(result?.paid?.progress) + num(result?.progress?.paid);
  const errands = (Array.isArray(result?.handed) ? result.handed : []).reduce((a, h) => a + num(h?.paid?.progress), 0);
  const errandLs = (Array.isArray(result?.handed) ? result.handed : []).reduce((a, h) => a + num(h?.paid?.wealth), 0);
  return { own, errands, errandLs };
}

/** The pay line of one verb that changed the save, or null when it paid nothing. `before`/`after` are the save; the
    source is the verb, its action and the thing it was for (a task, a beast …) — never what was said. */
export function payEvent({ verb, args = {}, result, before, after }) {
  if (!after || !result || result.ok === false) return null;
  const { own, errands, errandLs } = xwOf(result);
  // 修为 off the result; when it says none but the bar moved within one layer, the move (a grant without `paid`).
  const sameStep = before && before.tier === after.tier && before.step === after.step;
  const moved = sameStep ? num(after.progress) - num(before?.progress) : 0;
  const xw = own || (moved > 0 && !errands ? moved : 0);
  const ls = num(after.wealth) - num(before?.wealth);
  if (!xw && !ls && !errands) return null;
  const action = typeof args.action === 'string' ? args.action : null;
  const id = [args.id, args.exit, args.board, args.place, args.material].find((v) => typeof v === 'string' && ID_RE.test(v)) ?? null;
  return cleanEvent({ kind: 'pay', src: action ? `${verb}:${action}` : verb, verb, ...(id ? { id } : {}), xw, ls: ls - errandLs, ...(errands ? { errand_xw: errands } : {}), ...(errandLs ? { errand_ls: errandLs } : {}) });
}

/* The day key the pay landed on is the line's `at`; dayKey is re-exported for the report's days. */
export { dayKey };
