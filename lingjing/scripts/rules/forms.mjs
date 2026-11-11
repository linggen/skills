// rules/forms.mjs — the FORM a beast or a sparring partner is fought in, rotated (Hanli 2026-11-10's 观里的事 design: 「妖兽出没
// and 切磋 rotate their FORM … declared in data, least-recent first. Keep their pay rules」). Part of the rules engine.
//
// worlds/<id>/happenings.json `forms.<event>`: `order` (the forms, the first the event's own), and per other form the
// creatures that may take it (`of`) and how it is played. A creature that may take only the event's own form is fought
// in it as before. Otherwise the form is the one fought least recently at that event, never the one just fought —
// from the save alone (`forms.<event> = { last, at: {form: iso}, n }`), so a reload or the other device meets the same.
//
// 妖兽出没 (rules/yaoshou.mjs): its own form is the card duel (world.mjs encounterOf); `wave` is a 守墙关 night of that one
// beast's kind (the 兽潮's tide maker, games/tide.js, `open` only that kind), played as the event's board
// (`forms.yaoshou.wave.task`, tasks/happenings.json). While the batch's fight is a wave the pool shows no duel (world.mjs
// encounterOf) and the tray opens the board; its win settles as the duel's would — the haunt table × the beast's day
// share × the batch's share, its drops, its card, the 秘境令's chance, the batch slot (rules/tasks.mjs yaoshouWaveDone).
import { seedOf } from '../state.mjs';
import { TIDES } from '../games/tide.js';
import { kitOf, beastOpen } from './reveal.mjs';
import { placeOf, rawEncounter } from './world.mjs';
import { yaoshouPlace } from './yaoshou.mjs';
import { levelOf } from './playpay.mjs';
import { clampTo } from './power.mjs';

const formsOf = (content, event) => content.happenings?.forms?.[event] ?? null;
/* The forms a creature may be fought in at an event: the event's own first, then each that names it. */
export function formsFor(content, event, cid) {
  const f = formsOf(content, event);
  if (!f) return [];
  return (f.order ?? []).filter((x, i) => i === 0 || (f[x]?.of ?? []).includes(cid));
}
/* The form fought least recently there, never the one just fought (the first form on a tie). */
export function nextForm(state, event, forms) {
  if (forms.length < 2) return forms[0] ?? null;
  const rec = state.forms?.[event] ?? {}, at = x => Date.parse(rec.at?.[x] ?? '') || 0;
  return forms.filter(x => x !== rec.last).sort((a, b) => at(a) - at(b) || forms.indexOf(a) - forms.indexOf(b))[0];
}
/* A form fought: stamped on `s` (mutated). */
export function stampForm(s, event, form, now) {
  const rec = s.forms?.[event] ?? {};
  s.forms = { ...(s.forms ?? {}), [event]: { last: form, at: { ...(rec.at ?? {}), [form]: now.toISOString() }, n: (rec.n ?? 0) + 1 } };
}

/* ── 妖兽出没 ── */
/* The wave's difficulty at his level: (clamp(L, band) − its floor) ÷ the band's span, 0…1 (0 at 零层 or with no band). */
export function waveTier(content, state) {
  const b = placeOf(content, state.place)?.levels, L = levelOf(content, state.tier, state.step ?? 0)?.level ?? 0;
  if (!Array.isArray(b) || !(L >= 1) || b[1] <= b[0]) return 0;
  return Math.round(((clampTo(L, b) - b[0]) / (b[1] - b[0])) * 1000) / 1000;
}
export const waveTask = content => (content.tasks?.tasks ?? []).find(t => t.id === formsOf(content, 'yaoshou')?.wave?.task) ?? null;
const MADE = new WeakMap();
/* The wave of this one beast's kind: the tide maker's night, seeded by the save and the forms fought so far (null: the
   kit makes none with it alone — then the duel). */
export function waveMade(content, state, cid) {
  const t = waveTask(content), maker = t ? TIDES[t.game] : null, kit = maker ? kitOf(content, t.game) : null;
  if (!kit) return null;
  // Its difficulty class (the maker's `tier`, 0…1 — the 兽潮's is its climb by nights): where his level stands in the band of
  // the place he meets it at (batch 3; until 2026-11-10 always 0) — at the band's floor the easiest, at its top the hardest.
  const tier = waveTier(content, state);
  const key = `${seedOf(state)}|${state.forms?.yaoshou?.n ?? 0}|${cid}|${tier}`, memo = MADE.get(content) ?? new Map();
  MADE.set(content, memo);
  if (!memo.has(key)) memo.set(key, maker.night(kit, { seed: `${seedOf(state)}|yaoshou|${state.forms?.yaoshou?.n ?? 0}`, tier, boss: false, open: k => k === cid && beastOpen(content, state, k) }) ?? null);
  return memo.get(key);
}
/* The batch's fight where he stands, in its form: `{ form, e }` (e: the pool's encounter), or null (no batch up here). */
export function yaoshouFormOf(content, state, now, e = rawEncounter(content, state, now)) {
  if (!e?.pool || !e.batch || !yaoshouPlace(content, placeOf(content, state.place))) return null;
  const form = nextForm(state, 'yaoshou', formsFor(content, 'yaoshou', e.creature.id)) ?? 'duel';
  return { form: form === 'wave' && !waveMade(content, state, e.creature.id) ? 'duel' : form, e };
}
export const yaoshouWave = (content, state, now, e) => yaoshouFormOf(content, state, now, e)?.form === 'wave';
/* The wave board is open where he stands: the batch's fight is a wave. */
export const waveHere = (content, state, id, now) => waveTask(content)?.id === id && yaoshouWave(content, state, now);
/* Look's tasks: the wave, offered. */
export function waveHosted(content, state, now) {
  const t = waveTask(content);
  return t && yaoshouWave(content, state, now) ? { [t.id]: { status: 'offered' } } : {};
}
/* …and its row: the beast's name on its title, the made night as its deal. */
export function waveRow(content, state, now, lang) {
  const f = yaoshouFormOf(content, state, now), t = waveTask(content);
  if (f?.form !== 'wave' || !t) return {};
  const made = waveMade(content, state, f.e.creature.id), title = `${(t.title?.[lang] ?? t.title?.zh ?? '').split(' · ')[0]} · ${f.e.creature.name}`;
  return { title, creature: f.e.creature.id, deal: { ...made.deal, ...(made.deal.over ? { over: { ...made.deal.over, title: { zh: title, en: title } } } : {}) } };
}
