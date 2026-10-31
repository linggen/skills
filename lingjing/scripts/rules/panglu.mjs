// rules/panglu.mjs — 旁炉 · 炸炉: the 丹房's side furnace he tends himself (design.md § 丹药; story DESIGN § 六·五
// 「凡人丹炉十炉炸七」; 09-laba: 「料你自己碾，火你自己看。炼糊了，碾了做药引。」). Part of the rules engine; rules.mjs is
// its one door.
//
// Everything is the world's table (worlds/<id>/panglu.json): where (a place `has.furnace`), from when (`after`, a
// scene done), what goes in (`herbs`, one a batch), the batches a day (`per_day`), the odds by how many batches this
// save has fired (`bands`: 炸 · 糊 · 一转 · 二转), the count at which 闵丹师 teaches 「首尾武，中间文」 (`lesson`, the
// step that lifts 二转) and what each comes to (`outs`). The roll is seeded by the save, the day and the count — firing
// again never re-rolls. A 炸 costs the herb and a little 体力 (rewards.json stamina.cost `panglu`), nothing more. The
// 饭桶 is another thing (rules/fantong.mjs): 老君's, a lottery, and it never 炸s; nothing here touches it.
import { dayKey, itemName, pick } from '../state.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { itemOf } from './errands.mjs';
import { hash, stream, weighted } from './fantong-roll.mjs';
import { pouchBrief, stow, storedLine } from './pouch.mjs';
import { placeOf } from './world.mjs';

export const OUTCOMES = ['zha', 'hu', 'yi', 'er'];
const tableOf = content => content.panglu ?? null;
const wordsOf = (t, lang) => t.words?.[lang] ?? t.words?.zh ?? {};
const fill = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* Given him: the scene that hands him the stool is done. */
export const pangluGiven = (content, state) => {
  const t = tableOf(content);
  return Boolean(t && (!t.after || (state.done_scenes ?? []).includes(t.after)));
};
/* Here: he stands where a furnace is. */
export const atFurnace = (content, state) => Boolean(placeOf(content, state.place)?.has?.furnace);
/* Open: given and here — the 物品 panel's 旁炉 tab shows. */
export const pangluOpen = (content, state) => pangluGiven(content, state) && atFurnace(content, state);

/* The band for the batch about to be fired: the last whose `from` he has reached. */
export function bandOf(t, fired) {
  const bands = [...(t.bands ?? [])].sort((a, b) => a.from - b.from);
  return bands.filter(b => b.from <= fired).at(-1) ?? bands[0] ?? { odds: { hu: 1 } };
}
/* One batch's outcome, pure: the same seed and count, the same batch. */
export function rollBatch(t, { seed, fired }) {
  const odds = bandOf(t, fired).odds ?? {};
  return weighted(stream(hash(seed))(), OUTCOMES.filter(k => odds[k] > 0).map(k => [k, odds[k]]));
}

const firedOf = state => state.panglu?.n ?? 0;
const todayOf = (state, now) => (state.panglu?.day === dayKey(now) ? state.panglu.today ?? 0 : 0);
const herbsHeld = (content, state, t) => (t.herbs ?? []).filter(id => (state.bag?.[id] ?? 0) > 0 && itemOf(content, id));

/* The panel's reading: the herbs he can put in, how many batches he has fired, today's left, the lesson heard. */
export function pangluBrief(content, state, now) {
  const t = tableOf(content);
  if (!t || !pangluOpen(content, state)) return null;
  const w = wordsOf(t, state.lang), fired = firedOf(state), left = Math.max(0, (t.per_day ?? Infinity) - todayOf(state, now));
  return {
    name: w.name, line: w.line, fire: w.fire, fired, ...(fired ? { fired_say: fill(w.fired, { n: fired }) } : {}),
    left: Number.isFinite(left) ? left : null, ready: left > 0, ...(left > 0 ? {} : { wait: w.full }),
    taught: fired >= (t.lesson ?? Infinity),
    herbs: herbsHeld(content, state, t).map(id => ({ id, name: itemName(itemOf(content, id), state, state.lang) ?? id, art: itemOf(content, id)?.art ?? null, n: state.bag[id] })),
    ...(herbsHeld(content, state, t).length ? {} : { empty: w.no_herb }),
  };
}

const ACTIONS = { look, fire };

/* Panglu — `look`, or `fire --id=<herb>`. */
export function panglu(state, content, ctx, args = {}) {
  const t = tableOf(content);
  if (!t) return refuse('no-panglu', null);
  const action = String(args.action ?? 'look');
  if (!ACTIONS[action]) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  const w = wordsOf(t, state.lang);
  if (!pangluGiven(content, state)) return refuse('not-yet', null);
  if (!atFurnace(content, state)) return refuse('not-here', w.not_here ?? null);
  return ACTIONS[action](state, content, ctx, args, t, w);
}

function look(state, content, ctx) {
  return { state: null, result: { ok: true, panglu: pangluBrief(content, state, ctx.now) } };
}

function fire(state, content, ctx, args, t, w) {
  const id = String(args.id ?? '').trim(), now = ctx.now, lang = state.lang;
  if (!id || !(t.herbs ?? []).includes(id)) return refuse('not-herb', w.not_herb ?? null, { id });
  if (!((state.bag?.[id] ?? 0) > 0)) return refuse('no-herb', w.no_herb ?? null, { id });
  if (todayOf(state, now) >= (t.per_day ?? Infinity)) return refuse('full', w.full ?? null);
  const fired = firedOf(state), today = dayKey(now);
  const outcome = rollBatch(t, { seed: `${state.world}|${state.name ?? ''}|panglu|${today}|${fired}|${id}`, fired });
  const s = clone(state);
  // A 炸: a little 体力 too (refused at an empty pool — nothing spent, and the same batch waits for him).
  if (outcome === 'zha') {
    const empty = spendStamina(content, s, ctx, 'panglu');
    if (empty) return empty;
  }
  s.bag[id] -= 1;
  if (s.bag[id] <= 0) delete s.bag[id];
  const out = t.outs?.[outcome] ?? null;
  const got = out?.item && itemOf(content, out.item) ? stow(content, s, out.item, out.n ?? 1) : null;
  const made = { ...(state.panglu?.made ?? {}), [outcome]: (state.panglu?.made?.[outcome] ?? 0) + 1 };
  s.panglu = { n: fired + 1, day: today, today: todayOf(state, now) + 1, made };
  const taught = fired + 1 === t.lesson;
  const name = got ? itemName(itemOf(content, out.item), s, lang) ?? out.item : null;
  const say = [fill(w.results?.[outcome], { name }), taught ? w.lesson : null, storedLine(s, got ? [got] : [])].filter(Boolean).join(' ');
  const item = got ? itemOf(content, out.item) : null;
  return { state: s, result: {
    ok: true, outcome, fed: { id, name: itemName(itemOf(content, id), s, lang) ?? id },
    ...(got ? { out: { id: out.item, name, n: out.n ?? 1, hint: pick(item?.hint, lang), art: item?.art ?? null, ...(item?.zhuan ? { zhuan: item.zhuan } : {}), ...(got.stored ? { stored: true } : {}), ...(got.new ? { new: true } : {}) } } : {}),
    ...(taught ? { lesson: w.lesson } : {}), say,
    panglu: pangluBrief(content, s, now), pouch: pouchBrief(content, s),
  } };
}
