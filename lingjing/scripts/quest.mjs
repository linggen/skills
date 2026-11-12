// quest.mjs — Lingjing's own menu for the apps' quest files (the rules read ~/.linggen/quests/*.json): the one chore
// the game witnesses itself, 传音 — a share (Hanli, 2026-11-10: 「分享动作就给奖励」). The file is this menu, and the
// entry's `done_at` is the latest time a share was seen: made on the Mac page (rules/share.mjs, the page-only
// `quest share`) or on a paired phone (a fact the engine hands to `stamp`, SKILL.md `quests:`). `kind` is the plain word
// the world reads (worlds/jiuding/gongke.json); what it pays is the world's, not this file's.
//
//   quest.mjs due               write the menu if it is not there; stamps nothing
//   quest.mjs stamp <id> <at>   the engine's door for a phone fact: done at <at> (2026-11-10T14:03:11Z); exit 0 once
//                               the file holds it or a later time, else 1
//
// Read-merge-write, whole file by tmp + rename. A stamp never moves a `done_at` back; an entry this menu does not know
// stays as it is. A failure never fails what it follows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP = 'lingjing';
export const SHARE = 'lingjing-share';

/* `reward` 0: the row pays by its kind's `own` (rules/chores.mjs ownOf), never by a number here. `open: false`: no link
   out — the game is the place. `go: 'qian'` names the page action the row's one button runs (rules/chores.mjs choreGo):
   the page and the phone each map the word to opening today's 签 card, the place the 分享 is (Hanli 11-10: 「手机上今天的签
   抽过了, 没有地方能分享了」). */
export const MENU = [
  {
    id: SHARE, kind: 'share', period: 'day', reward: 0, device: 'both', open: false, go: 'qian',
    turns: [
      { title: { zh: '传音 · 分享今日的签', en: "Send word · share today's fortune" }, how: { zh: '分享今日的签；健康里的卡片也算', en: 'Share your fortune; a health card counts too' } },
      { title: { zh: '传音 · 分享一张健康卡片', en: 'Send word · share a health card' }, how: { zh: '在手机的健康里分享一张卡片；今日的签也算', en: 'Share a card from Health on your phone; your fortune counts too' } },
    ],
  },
];

export const questsDir = (env = process.env) => env.LINGJING_QUESTS || path.join(env.HOME || os.homedir(), '.linggen', 'quests');

/* The later of two times, either possibly missing or unreadable. */
export function later(a, b) {
  const t = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
  if (Number.isNaN(t(a))) return Number.isNaN(t(b)) ? null : b;
  if (Number.isNaN(t(b))) return a;
  return t(b) > t(a) ? b : a;
}

export const turnOf = (now) => ((Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000) % 2) + 2) % 2;

export function worded(row, now = new Date()) {
  const turns = MENU.find(m => m.id === row?.id)?.turns;
  return turns ? { ...row, ...turns[turnOf(now) % turns.length] } : row;
}

/* The file's next body: the menu, each `done_at` the later of what the file held and `stamps` (id → time); `due` always. */
export function merged(doc, stamps = {}, menu = MENU, now = new Date()) {
  // A held `done_at` past now was never a share (a wrong clock, a test's stamp): dropped, so a real one can replace it.
  const sane = (q) => (typeof q.done_at === 'string' && Date.parse(q.done_at) > now.getTime() ? { ...q, done_at: null } : q);
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object').map(sane) : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app: APP,
    quests: [
      ...menu.map(({ turns, ...m }) => ({ ...m, ...(turns ? turns[turnOf(now) % turns.length] : {}), due: true, done_at: m.id in stamps ? later(was.get(m.id)?.done_at ?? null, stamps[m.id]) : was.get(m.id)?.done_at ?? null })),
      ...held.filter((q) => !mine.has(q.id)),
    ],
  };
}

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

function write(stamps, dir) {
  // The wall clock, not the stamp's own time: a phone's fact may be older than a time already held, and still not move it.
  const file = path.join(dir, `${APP}.json`), held = readJson(file), body = merged(held, stamps);
  if (JSON.stringify(held) === JSON.stringify(body)) return body; // nothing moved: nothing written
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
  return body;
}

/* Stamp `id` done at `now`; throws on an id the menu does not know (nothing written). Answers the row. */
export function stamp(id, { dir = questsDir(), now = new Date() } = {}) {
  if (!MENU.some((m) => m.id === id)) throw new Error(`unknown quest ${id}`);
  return write({ [id]: now.toISOString() }, dir).quests.find((q) => q.id === id);
}

/* The menu put in the file if it is not there (or moved on). */
export const publish = ({ dir = questsDir() } = {}) => write({}, dir);

const STAMP_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/* The engine's door: `stamp <id> <at>` → the exit code. */
export function stampCli(id, at, { dir = questsDir() } = {}) {
  const when = new Date(at);
  if (!STAMP_AT.test(String(at || '')) || Number.isNaN(when.getTime())) return 1;
  try { stamp(id, { dir, now: when }); return 0; } catch { return 1; }
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  if (process.argv[2] === 'stamp') process.exitCode = stampCli(process.argv[3], process.argv[4]);
  else if (process.argv[2] === 'due') {
    try { publish(); console.log(JSON.stringify({ ok: true })); } catch (e) { console.log(JSON.stringify({ ok: false, error: String(e?.message || e) })); }
  }
}
