// rules/qiyu.mjs — 奇遇 in a 秘境 rerun: a room may roll one small game from a pool, opened by a short
// story frame (Hanli 10-19: 「秘境里可以有随机游戏. 设计一个剧情触发一下了」).
// Part of the rules engine; rules.mjs is its one door.
//
// The pool, its odds and each entry's frames are data (worlds/<id>/qiyu.json, keyed by the rerun's
// beat id): as a run is entered (rules/rerun.mjs enterRun) each room rolls `chance`; a hit draws an
// entry by `weight` — never the game the room before it drew, nor the last one the previous run drew,
// and an entry that `needs: "her"` (你画我猜: 银月 names the picture) only once she is met and on her
// own line — asleep in the 木牌 too: the round wakes her (rules/hergame.mjs). The board stands in that room while the run is on (Look's tasks, `qiyu`); its
// win counted pays a find drawn from the run's own `finds` (as 拾遗 does) and, its first clear ever,
// the small-game 灵石 (balance.json `boards`, tasks.mjs boardPay). Nothing here names a 秘境.
import fs from 'node:fs';
import path from 'node:path';
import { pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { herNear } from './companion.mjs';
import { stow } from './pouch.mjs';
import { dealtOf } from './climb.mjs';
// rerun.mjs rolls the 奇遇 as a run is entered; its `draw` and `rerunsOf` are function declarations, safe across the cycle.
import { draw as drawOf, rerunsOf } from './rerun.mjs';

const cache = new Map();
export function qiyuData(content) {
  const dir = content?.dir;
  if (!dir) return null;
  if (!cache.has(dir)) {
    const file = path.join(dir, 'qiyu.json');
    cache.set(dir, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return cache.get(dir);
}
const poolOf = (content, rerunId) => qiyuData(content)?.[rerunId] ?? null;
const taskOf = (content, id) => (content.tasks?.tasks ?? []).find(t => t.id === id) ?? null;
// Met and on her own line, in the 木牌 or not: the drawing's round wakes her (rules/hergame.mjs).
const entryUp = (content, state, e) => e.needs !== 'her' || herNear(content, state);
const wordsOf = (content, e) => (e.words ? (content.games?.games ?? []).find(g => g.id === 'drawguess' && g.data?.[e.words])?.data[e.words] ?? [] : []);

const byWeight = (list, u) => {
  const all = list.reduce((t, x) => t + (x.weight ?? 1), 0);
  let at = u * all;
  return list.find(x => (at -= x.weight ?? 1) < 0) ?? list.at(-1);
};

/* One run's 奇遇, room by room: { room: { task, frame, word? } } — seeded by the run. `draw` is the
   rerun's own (a key → [0, 1)). `force` (a 测试存档's `rerun enter --qiyu=<task>`): that entry in the
   first room, whatever the roll. */
export function rollQiyu(content, state, { rerunId, rooms, seed, draw, force = null }) {
  const data = poolOf(content, rerunId);
  if (!data?.pool?.length) return {};
  const out = {};
  let last = state.reruns?.[rerunId]?.qiyu_last ?? null;
  rooms.forEach((room, i) => {
    const forced = force && i === 0 ? data.pool.find(e => e.task === force) : null;
    if (!forced && draw(`${seed}|${room}|qiyu`) >= (data.chance ?? 0)) return;
    // `retired` (10-19, 洛书): never drawn again, but kept so a run already holding it finds its frame.
    const pool = data.pool.filter(e => !e.retired && e.task !== last && entryUp(content, state, e) && taskOf(content, e.task));
    const e = forced ?? (pool.length ? byWeight(pool, draw(`${seed}|${room}|qiyu|pick`)) : null);
    if (!e) return;
    const frame = Math.floor(draw(`${seed}|${room}|qiyu|frame`) * e.frames.length);
    const words = wordsOf(content, e);
    const word = words.length ? words[Math.floor(draw(`${seed}|${room}|qiyu|word`) * words.length)].zh : null;
    out[room] = { task: e.task, frame, ...(word ? { word } : {}), done: false };
    last = e.task;
  });
  return out;
}
/* The game the run's last 奇遇 was (never the next run's first). */
export const lastQiyu = rolled => Object.values(rolled).at(-1)?.task ?? null;

/* The 奇遇 standing in the room he is in, while the run is on. */
const qiyuAt = state => (state?.rerun ? state.rerun.rooms?.[state.place]?.qiyu ?? null : null);
export const qiyuHere = (content, state, id) => { const q = qiyuAt(state); return Boolean(q && !q.done && q.task === id); };
export function qiyuHosted(content, state) {
  const q = qiyuAt(state);
  return q && !q.done && taskOf(content, q.task) ? { [q.task]: { status: 'offered' } } : {};
}
const entryOf = (content, state, task) => poolOf(content, state.rerun?.id)?.pool.find(e => e.task === task) ?? null;

/* The Look row's own: the frame as the board's line, and the game's deal (the word drawn, the thing hung). */
export function qiyuRow(content, state, id) {
  const q = qiyuAt(state), e = q?.task === id ? entryOf(content, state, id) : null;
  if (!e) return { qiyu: true };
  const lang = state.lang, frame = e.frames[q.frame] ?? e.frames[0], t = taskOf(content, id);
  const word = q.word ? wordsOf(content, e).find(w => w.zh === q.word) : null;
  const deal = {
    ...dealtOf(content, state, t),
    ...(word ? { word, context: `秘境外圈，${pick(frame, 'zh')}` } : {}),
    ...(frame.item ? { item: { ...(frame.item.id ? { id: frame.item.id } : {}), name: pick(frame.item, lang) } } : {}),
  };
  return { qiyu: true, how: pick(frame, lang), deal };
}

/* Its win handed in: the room's 奇遇 done, a find from the run's table, and its first clear's 灵石 (`boardPay`). */
export function qiyuDone(state, content, ctx, id, boardPay) {
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state), q = s.rerun.rooms[s.place].qiyu, t = taskOf(content, id);
  delete s.wins[id];
  q.done = true;
  const finds = Object.values(qiyuRerun(content, s)?.finds ?? {}).flat();
  const paid = { progress: 0, wealth: 0, item: null };
  const found = [];
  if (finds.length) {
    const f = byWeight(finds, drawOf(`${s.rerun.seed}|${s.place}|qiyu|find`));
    const [lo, hi] = f.n ?? [1, 1];
    const n = lo + Math.floor(drawOf(`${s.rerun.seed}|${s.place}|qiyu|n`) * (hi - lo + 1));
    found.push({ ...stow(content, s, f.item, n), got: n });
    paid.item = f.item;
    if (f.line) found.at(-1).line = pick(f.line, s.lang);
  }
  boardPay(s, t, paid);
  // Stars are the round's (a best ever is the story boards'): the next 奇遇 starts clean.
  if (s.stars) delete s.stars[id];
  return { state: s, result: { ok: true, done: id, paid, found, line: found[0]?.line ?? pick(t?.done_line, s.lang) ?? null, gives: null } };
}

/* The rerun's data for the run he is in (its `finds`). */
const qiyuRerun = (content, state) => rerunsOf(content).find(r => r.beat.id === state.rerun?.id)?.rerun ?? null;
