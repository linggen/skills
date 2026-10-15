// rules/sealed.mjs — 秘境 mode: what Look carries inside a sealed instance, and the verbs it refuses.
// Part of the rules engine; rules.mjs is its one door.
//
// A key beat that declares `sealed` (chapter.json; world.mjs sealedOf) is an
// instance. While he is inside, the world outside is frozen, not lost: the
// errands in hand, the 令, the chores and 开府, the 货郎, the 机缘, the
// festival, the 节气 and the sky stay out of Look, and their verbs are refused
// with the instance's own line. Look carries `sealed` instead — the label, the
// book's day or night, the room — and the goal line is the scene's own goal.
// Nothing here names an instance: the data declares it.
import { pick } from '../state.mjs';
import { placeOf, sealedOf } from './world.mjs';

const ZH_N = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/* The book's own marker for the scene: 第一夜 · 第三日 / Night 1 · Day 3. */
const dayName = (day, lang) => (lang === 'zh'
  ? `第${ZH_N[day.n] ?? day.n}${day.unit === 'night' ? '夜' : '日'}`
  : `${day.unit === 'night' ? 'Night' : 'Day'} ${day.n}`);

/* Look's `sealed`: {id, label, day, header, where, goal, say}, or null outside. */
export function sealedBrief(content, state) {
  const sealed = sealedOf(content, state);
  if (!sealed) return null;
  const lang = state.lang, label = pick(sealed.label, lang), day = sealed.run ? null : sealed.days?.[state.scene] ?? null;
  const when = day ? dayName(day, lang) : null;
  // The room's own short name: 「沉鼎秘境 · 石室」 → 石室.
  const where = pick(placeOf(content, state.place)?.name, lang)?.split(' · ').pop() ?? null;
  // A rerun (rules/rerun.mjs) has one goal for the whole run.
  const goal = pick(sealed.run ? sealed.goal : sealed.goals?.[state.scene], lang) ?? null;
  return {
    id: sealed.beat, label, header: [label, when].filter(Boolean).join(' · '), ...(sealed.run ? { run: true } : {}),
    ...(day ? { day: { n: day.n, unit: day.unit, name: when } } : {}),
    ...(where ? { where } : {}), ...(goal ? { goal } : {}), say: pick(sealed.say, lang),
  };
}

/* The fields of Look the world outside fills — frozen while sealed. */
const OUTSIDE = ['offers', 'work', 'visitors', 'chance', 'lundao', 'haggle', 'case', 'tale', 'known', 'story_due', 'story_why', 'handed', 'quests', 'kaifu', 'weather', 'season', 'wind'];

/* A reading with the outside taken out and `sealed` in. The goal line (the
   waypoint) is the scene's goal; the 事 book holds nothing from outside. */
export function withoutSealed(content, state, brief) {
  const sealed = sealedBrief(content, state);
  if (!sealed) return brief;
  const out = { ...brief, sealed, book: [] };
  for (const key of OUTSIDE) delete out[key];
  if (out.today) out.today = { ...out.today, festival: null, term: null, jieqi: null };
  if (out.place) { const { pass, meet, ...place } = out.place; out.place = place; }
  // A rerun (rules/rerun.mjs): the story outside waits — its boards too; only what the run's rooms host stands.
  if (sealed.run && out.tasks) out.tasks = out.tasks.filter(t => t.hosted);
  // A rerun's goal points nowhere outside: the story's road waits, frozen.
  if (sealed.goal) out.waypoint = sealed.run ? { text: sealed.goal, sealed: true } : { ...(brief.waypoint ?? {}), text: sealed.goal, sealed: true };
  return out;
}

/* The verbs of the world outside: an errand taken or handed in, a rumour, the
   road's meet, a chore checked, 闭关, 论道, 御剑 away. */
const OUTSIDE_VERBS = new Set(['quest', 'tale', 'meet', 'seclude', 'lundao', 'fly', 'haggle', 'case']);
const outsideVerb = (verb, args) => OUTSIDE_VERBS.has(verb) || (verb === 'task' && args?.action === 'check');

/* The refusal for a verb of the world outside while sealed, or null. */
export function sealedVerb(content, state, verb, args = {}) {
  if (!outsideVerb(verb, args)) return null;
  const sealed = sealedOf(content, state);
  if (!sealed) return null;
  return { state: null, result: { ok: false, refused: 'sealed', say: pick(sealed.say, state.lang) ?? null } };
}
