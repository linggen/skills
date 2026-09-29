// rules/festival.mjs — 节日 (design.md § 真实世界): the player's real calendar
// in the world. Part of the rules engine; rules.mjs is its one door.
//
// The day is reckoned on the device (calendar.js), in the player's local date.
// Look carries `today`: the date, the 节气 when one falls, and the festival —
// its name, Ling's opening `line` (handed to her once a day: rules.mjs marks
// `festival_told`), its one small task and its gift. The task is done in the
// chat; Practice `done festival` pays the gift once per festival per year
// (除夕 → 元宵 is one 春节: one gift) and writes it on the save.
import { dayOf, localDay, parseDay } from '../calendar.js';
import { fill, lockedOf, pick, rollDay } from '../state.mjs';
import { clone, refuse } from './core.mjs';

/* How many festival marks the save keeps (the newest). */
const KEEP = 40;

/* A festival's authored entry by id, or null. */
export const festivalEntry = (content, id) => (content.festivals?.festivals ?? []).find(f => f.id === id) ?? null;

/* The day the rules read: the clock's local date — or, for tests and the
   page's preview only, `--day=YYYY-MM-DD` (never a write: see festivalDone). */
export const dayFor = (ctx, args = {}) => parseDay(args.day) ?? localDay(ctx.now);

/* The marks: `<id>-<year>` for a task done, `gift:<span>` for a gift given. */
const marksOf = state => state.festivals ?? [];

/* `today` as Look tells it — for Ling (with the opening line until told) and the page. */
export function todayBrief(content, state, ctx, args = {}) {
  const day = dayOf(dayFor(ctx, args));
  const lang = state.lang;
  const out = { date: day.date, ...(day.term ? { term: { id: day.term.id, name: pick(day.term.name, lang) } } : {}) };
  const f = day.festival && festivalEntry(content, day.festival.id);
  if (!f) return out;
  const say = pair => fill(pick(pair, lang), state, content);
  const marks = marksOf(state);
  const done = marks.includes(day.festival.key), given = marks.includes(`gift:${day.festival.gift}`);
  const shut = lockedOf(content, state).includes('wealth');
  out.festival = {
    id: f.id, name: say(f.name),
    ...(day.festival.day ? { day: day.festival.day } : {}),
    ...(state.festival_told === day.date ? {} : { line: say(f.line) }),
    task: { id: 'festival', label: say(f.task.label), what: say(f.task.what), done },
    // Before the gate that opens 灵石, the day is kept without a gift.
    ...(shut ? {} : { gift: { wealth: f.gift.wealth, given } }),
    dressing: f.dressing ?? {},
  };
  return out;
}

/* Practice `done festival`: the day's task, done in the chat — marked, and
   the gift paid if this festival's has not been given this year. */
export function festivalDone(state, content, ctx) {
  const day = dayOf(localDay(ctx.now));
  const f = day.festival && festivalEntry(content, day.festival.id);
  if (!f) return refuse('no-festival', null);
  const marks = marksOf(state);
  if (marks.includes(day.festival.key)) return refuse('already-done', null);
  const s = clone(state);
  const giftKey = `gift:${day.festival.gift}`;
  const pays = !marks.includes(giftKey) && !lockedOf(content, state).includes('wealth');
  if (pays) {
    rollDay(s, ctx.now);
    s.wealth += f.gift.wealth;
    s.day.wealth += f.gift.wealth;
  }
  s.festivals = [...marks, day.festival.key, ...(pays ? [giftKey] : [])].slice(-KEEP);
  const lang = state.lang;
  return {
    state: s,
    result: { ok: true, done: 'festival', festival: f.id, wealth: pays ? f.gift.wealth : 0, ...(pays ? { gift: fill(pick(f.gift.line, lang), s, content) } : {}) },
  };
}
