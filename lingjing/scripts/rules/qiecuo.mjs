// rules/qiecuo.mjs — 切磋 · 演武场: a daily bout with a fellow disciple, on 格斗's board — a plot the game alone has, beside
// 兽潮 (Hanli 2026-10-28: 「宗门大比的剧情过后, 可以弄一个每天一次的日常比武切磋, 让用户玩格斗…和兽潮并列的一个时间触发游戏,
// 冷却3小时」). Part of the rules engine; rules.mjs is its one door.
//
// Everything it knows is the task row's (tasks/world.json `qiecuo`): the cooldown (`every_h`, from balance.json
// `cooldowns.qiecuo_h`), the scene that opens it (`after`: the 大比 behind him), the places of 沉鼎观 where it is offered,
// the opponents (each a 格斗 level of games.json, `level`, open `after` a scene), the styles a bout is fought in (each the
// AI's knobs laid on the level), the climb by his realm (`climb`), the frame lines (`lines`: who challenges, and why) and
// 银月's one telling (`tell`, on the first bout until one is over). Its pay: balance.json `play_pay.qiecuo` — a fixed share
// of the layer a bout, × ★, the day's first `full` bouts in full and the rest a replay's falling share.
//
// THE BOUTS: bout n (the bouts over + 1) is dealt from the save's seed and n alone — the opponent met least, never last
// bout's when another is open; a style never last bout's — so a bout waiting is the same bout however long it waits
// (never two: one bout a cooldown), and leaving it cannot reroll it. A bout is over when won (paid), lost or put down
// (收手, skipped): each starts the cooldown, `every_h` from that moment.
import { dayKey, lockedOf, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { sideLine } from './hui.mjs';
import { needOf } from './playpay.mjs';
import { hashOf } from './travel.mjs';
import { beatOf, passed, sceneOf } from './world.mjs';
import { rulesOf } from '../games/fighter/core.js';

const boutTask = content => (content.tasks?.tasks ?? []).find(t => t.qiecuo) ?? null;
/* The bout's task (tasks.mjs asks it alone, never the generic period). */
export const isBout = (content, id) => boutTask(content)?.id === id;

/* ── The cooldown ── */
const HOUR = 3600_000;
/* Milliseconds until the next bout (0: one is up now): `every_h` from the last bout over. */
export function boutWait(state, t, now) {
  const last = state.qiecuo?.at;
  return last ? Math.max(0, Date.parse(last) + (t.qiecuo.every_h ?? 3) * HOUR - now.getTime()) : 0;
}
const cooling = (state, t, now) => boutWait(state, t, now) > 0;

/* ── Who may spar ── */
/* Past the 大比, standing at 沉鼎观, out of any instance, run, fight or key beat, on the 古 line. */
function boutUp(content, state, t) {
  const c = t.qiecuo;
  if (c.after && !passed(content, state, c.after)) return false;
  if (state.sealed || state.rerun || state.fight || beatOf(content, state)) return false;
  if (sideLine(content, sceneOf(content, state))) return false;
  if (!opponentsOpen(content, state, c).length) return false;
  return !c.places || c.places.includes(state.place);
}
/* Look's task list: the bout offered, out of the cooldown. */
export function qiecuoHosted(content, state, now) {
  const t = boutTask(content);
  if (!t || !boutUp(content, state, t) || cooling(state, t, now)) return {};
  return { [t.id]: { status: 'offered' } };
}
/* Its win may be played and counted: out of the cooldown. */
export function qiecuoHere(content, state, id, now) {
  const t = boutTask(content);
  return Boolean(t) && t.id === id && boutUp(content, state, t) && !cooling(state, t, now);
}
/* Its row waits (Look keeps it past midnight): where he may spar, inside the cooldown. */
export function qiecuoWaiting(content, state, id, now) {
  const t = boutTask(content);
  return Boolean(t) && t.id === id && boutUp(content, state, t) && cooling(state, t, now);
}
/* Look's `waits` row inside the cooldown: the bout's name, the world's line, the minutes left. */
export function qiecuoWait(content, state, now) {
  const t = boutTask(content);
  if (!t || !qiecuoWaiting(content, state, t.id, now)) return null;
  return { id: t.id, title: pick(t.qiecuo.title, state.lang), shut: pick(t.qiecuo.shut, state.lang) ?? null, wait_min: Math.ceil(boutWait(state, t, now) / 60_000) };
}
/* Inside the cooldown where he may spar: refused in the world's words, with the minutes left — else null. */
export function qiecuoShut(content, state, id, now) {
  const t = boutTask(content);
  if (!t || t.id !== id || !boutUp(content, state, t)) return null;
  const wait = boutWait(state, t, now);
  return wait > 0 ? refuse('shut', pick(t.qiecuo.shut, state.lang) ?? null, { left_min: Math.ceil(wait / 60_000) }) : null;
}

/* ── The bout ── */
/* The opponents open now: each one's scene behind him (`after`), its level in games.json. */
function opponentsOpen(content, state, c) {
  return (c.opponents ?? []).filter(o => (!o.after || passed(content, state, o.after)) && levelOf(content, o.level));
}
/* A 格斗 level of games.json by id. */
export function levelOf(content, id) {
  for (const g of content.games?.games ?? []) if (g.id === 'fighter') for (const l of g.levels ?? []) if (l.id === id) return l;
  return null;
}
const draw = (seed, n, key) => hashOf(`${seed}|qiecuo|${n}|${key}`);

/* Bout n: who, in what style, with what words — from the save's seed and n, and what the bouts before left. */
export function boutOf(content, state) {
  const t = boutTask(content);
  if (!t) return null;
  const c = t.qiecuo, held = state.qiecuo ?? {}, n = (held.n ?? 0) + 1, seed = seedOf(state), met = held.met ?? {};
  const open = opponentsOpen(content, state, c);
  if (!open.length) return null;
  const order = [...open].sort((a, b) => (met[a.id] ?? 0) - (met[b.id] ?? 0) || draw(seed, n, a.id) - draw(seed, n, b.id));
  const foe = (order.length > 1 ? order.find(o => o.id !== held.last?.foe) : null) ?? order[0];
  const styles = (c.styles ?? []).filter(s => !foe.styles || foe.styles.includes(s.id));
  const pool = styles.length > 1 ? styles.filter(s => s.id !== held.last?.style) : styles;
  const style = [...pool].sort((a, b) => draw(seed, n, a.id) - draw(seed, n, b.id))[0] ?? null;
  const lines = (c.lines ?? []).filter(l => l.who === foe.id && (!l.style || l.style === style?.id));
  const line = lines.length ? lines[draw(seed, n, 'line') % lines.length] : null;
  return { n, foe, style, line, climb: climbOf(content, state, c.climb) };
}

/* How far up his realm the bout stands, 0…1: the layers he has climbed past `climb.from` over `climb.span`. */
function layerIndex(content, tier, step) {
  let i = 0;
  for (const t of content.ladder?.tiers ?? []) { if (t.id === tier) return i + (step ?? 0); i += (t.thresholds ?? []).length || 10; }
  return i;
}
export function climbOf(content, state, k) {
  if (!k) return 0;
  const at = layerIndex(content, state.tier, state.step), from = layerIndex(content, k.from?.tier, k.from?.step);
  return Math.max(0, Math.min(1, (at - from) / Math.max(1, k.span ?? 10)));
}

const merge = (a, b) => {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) out[k] = a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v;
  return out;
};
const r3 = x => Math.round(x * 1000) / 1000;
/* The climb laid on her numbers (`climb.top`: what each knob is at the top of the climb, as factors or adds): her blows
   heavier, her reads quicker, her guard surer, her first soft moves fewer, her footing firmer. */
function climbed(rules, d, top = {}) {
  if (!d) return rules;
  const out = structuredClone(rules ?? {});
  const ai = out.ai ?? {}, moves = out.moves ?? {};
  for (const m of Object.values(moves)) if (m && typeof m.dmg === 'number') m.dmg = r3(m.dmg * (1 + (top.dmg ?? 0.5) * d));
  ai.think = Math.round((ai.think ?? 300) * (1 - (top.think ?? 0.3) * d));
  ai.block = r3(Math.min(0.75, (ai.block ?? 0.3) + (top.block ?? 0.2) * d));
  ai.soft = Math.round((ai.soft ?? 10) * (1 - d));
  out.bal = Math.round((out.bal ?? 100) * (1 + (top.bal ?? 0.3) * d));
  return { ...out, ai, moves };
}

/* The level bout n plays: the opponent's games.json level, the style's knobs and the climb laid on her rules; the frame
   line as its `ready` (the lead card reads it), 银月's one telling before it the first time. */
export function boutLevel(content, state, bout, t = boutTask(content)) {
  const base = levelOf(content, bout.foe.level), c = t.qiecuo;
  const fold = (rules) => {
    const withStyle = merge(rules ?? {}, bout.style?.foe ?? {});
    // climbed from her whole numbers (the kit's, the level's, the style's), so a knob the level leaves to the kit climbs too
    return bout.climb ? climbed(rulesOf({ foe: { rules: withStyle } }).foe, bout.climb, c.climb?.top) : withStyle;
  };
  const lead = [...(state.qiecuo?.told ? [] : c.tell ?? []), ...(bout.line ? [bout.line] : [])];
  const ready = lead.length ? Object.fromEntries(['zh', 'en'].map(l => [l, lead.map(x => pick(x, l)).join('\n\n')])) : base.ready;
  return { ...base, ready, foe: { ...base.foe, rules: fold(base.foe?.rules) }, bout: { n: bout.n, foe: bout.foe.id, style: bout.style?.id ?? null, climb: r3(bout.climb) } };
}

/* Look's row for the bout: its title (the opponent, the style), the deal (one level; `once`: a loss is the bout's end,
   never dealt again in place), and inside the cooldown the minutes left. */
export function qiecuoRow(content, state, now) {
  const t = boutTask(content), bout = boutOf(content, state);
  if (!t || !bout) return {};
  const lang = state.lang, c = t.qiecuo;
  const name = pick(levelOf(content, bout.foe.level)?.foe?.name, lang) ?? bout.foe.id;
  const wait = boutWait(state, t, now);
  if (wait > 0) return { tide: true, qiecuo: true, bout: bout.n - 1, title: pick(c.title, lang), wait_min: Math.ceil(wait / 60_000), shut: pick(c.shut, lang) ?? null };
  const style = bout.style ? pick(bout.style.name, lang) : null;
  const title = [pick(c.title, lang), name, style].filter(Boolean).join(' · ');
  return {
    tide: true, qiecuo: true, bout: bout.n, foe: bout.foe.id, ...(bout.style ? { style: bout.style.id } : {}), title,
    ...(bout.line ? { call: pick(bout.line, lang) } : {}),
    deal: { levels: [boutLevel(content, state, bout, t)], once: true },
  };
}

/* ── Pay ── */
/* The day's share (balance.json `play_pay.qiecuo.full` bouts in full, then `play_pay.replay`'s falling share). */
export function boutShare(content, state, now) {
  const pp = content.balance?.play_pay ?? {}, full = pp.qiecuo?.full ?? Infinity, fall = pp.replay ?? [1];
  const held = state.qiecuo ?? {}, today = held.day?.key === dayKey(now) ? held.day.count ?? 0 : 0;
  return today < full ? 1 : fall[Math.min(today - full + 1, fall.length - 1)];
}
/* A bout won's grant: `play_pay.qiecuo.share` of the layer he stands on × ★ × the day's share; 灵石 as a 格斗 board's. */
export function boutGrant(content, state, now, stars = 3) {
  const pp = content.balance?.play_pay;
  if (!pp?.qiecuo) return null;
  const star = pp.stars?.[String(stars)] ?? 1, f = star * boutShare(content, state, now);
  const progress = Math.round((pp.qiecuo.share ?? 0) * needOf(content, state) * f);
  const wealth = Math.round((pp.wealth?.['格斗'] ?? pp.wealth?.default ?? 0) * f);
  return { table: 'play', progress, wealth, share: boutShare(content, state, now) };
}

/* ── Over ── */
/* The bout over, whatever its end: the cooldown starts now, the next bout is the next n, the opponent met. */
function overOn(s, bout, ctx, id, outcome, paid) {
  const held = s.qiecuo ?? {}, key = dayKey(ctx.now);
  s.qiecuo = {
    ...held, n: bout.n, at: ctx.now.toISOString(), told: true,
    met: { ...(held.met ?? {}), [bout.foe.id]: (held.met?.[bout.foe.id] ?? 0) + 1 },
    last: { foe: bout.foe.id, style: bout.style?.id ?? null, outcome },
    // the bouts paid today (the falling share's count)
    day: paid ? { key, count: (held.day?.key === key ? held.day.count ?? 0 : 0) + 1 } : held.day?.key === key ? held.day : { key, count: 0 },
  };
  s.tasks[id] = { status: 'done', period: key, done_at: ctx.now.toISOString(), ...(outcome !== 'won' ? { outcome } : {}) };
}
/* Its win handed in (tasks.mjs taskDone): the bout's 灵气, the pay by stars and the day's share, the next bout. */
export function qiecuoDone(state, content, ctx, id) {
  const t = boutTask(content), c = t.qiecuo;
  if (!state.wins?.[id]) return refuse('not-won', null);
  const bout = boutOf(content, state);
  if (!bout) return refuse('not-here', null);
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, c.cost ?? 'game');
  if (empty) return empty;
  delete s.wins[id];
  const stars = Math.max(1, Math.min(3, Number(s.stars?.[id] ?? 1) || 1));
  if (s.stars) delete s.stars[id];
  const g = boutGrant(content, state, ctx.now, stars);
  const locked = lockedOf(content, s).includes('wealth');
  const paid = g ? pay(content, s, ctx, { table: g.table, progress: g.progress, wealth: locked ? 0 : g.wealth }) : {};
  overOn(s, bout, ctx, id, 'won', true);
  return { state: s, result: { ok: true, done: id, bout: bout.n, foe: bout.foe.id, style: bout.style?.id ?? null, stars, paid, ...(g && g.share < 1 ? { share: g.share } : {}), gives: null, line: pick(t.done_line, s.lang) } };
}
/* Lost (`task --action=lost`, the page as the bout ends unwon) or put down (收手): over, unpaid, the cooldown started. */
export function qiecuoOver(state, content, ctx, id, outcome) {
  if (!qiecuoHere(content, state, id, ctx.now)) return qiecuoShut(content, state, id, ctx.now) ?? refuse('not-here', null);
  const bout = boutOf(content, state);
  if (!bout) return refuse('not-here', null);
  const s = clone(state);
  delete s.wins?.[id];
  overOn(s, bout, ctx, id, outcome, false);
  const t = boutTask(content);
  return { state: s, result: { ok: true, over: id, outcome, bout: bout.n, foe: bout.foe.id, ...(outcome === 'skipped' ? { left: id } : {}), line: pick(t.qiecuo[outcome === 'lost' ? 'lost_line' : 'left_line'], s.lang) ?? null } };
}
