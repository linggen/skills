// rules/fortune.mjs — 起卦 and 命格: the day's cast by three coins, the lifelong base tone.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { hashOf } from './travel.mjs';

/* ── 起卦 — the day's cast, by three coins ── */

const TRIGRAM_OF = { 111: 'qian', 110: 'dui', 101: 'li', 100: 'zhen', '011': 'xun', '010': 'kan', '001': 'gen', '000': 'kun' };
const castToday = (state, now) => (state.divination?.day === dayKey(now) ? state.divination : null);

/* A seeded generator: the day's throws are the day's, however often asked. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 三钱法: three coins six times, the bottom line first. A face counts 3, the
   other 2: 9 old yang, 8 young yin, 7 young yang, 6 old yin — the old lines move. */
export function castThrows(seed) {
  const rand = prng(hashOf(seed));
  return Array.from({ length: 6 }, () => [0, 1, 2].map(() => (rand() < 0.5 ? 3 : 2)));
}
const hexagramOf = (content, lines) => content.hexagrams.hexagrams.find(h => h.lines.join('') === lines.join(''));

/* What today's cast does to what it was asked about — null when it was
   not cast, asked about something else, or is even. */
function fortuneOf(content, state, now, ask) {
  const cast = now && castToday(state, now);
  if (!cast || cast.ask !== ask) return null;
  const effect = content.hexagrams.effects[ask]?.[cast.grade] ?? {};
  return Object.keys(effect).length ? effect : null;
}

/* A cast asked about fights lifts — or lowers — the 法术 of the lower
   trigram's root, for the whole day. */
function boutFortune(content, state, now) {
  const effect = fortuneOf(content, state, now, 'bout');
  if (!effect) return null;
  const h = content.hexagrams.hexagrams.find(x => x.id === castToday(state, now).hexagram);
  return { root: content.hexagrams.trigram_roots[TRIGRAM_OF[h.lines.slice(0, 3).join('')]], ...effect };
}

/* Today's cast as Look and the card tell it, or null before it is made. */
export function divinationBrief(content, state, now) {
  const cast = castToday(state, now);
  if (!cast) return null;
  const lang = state.lang, book = content.hexagrams;
  const h = book.hexagrams.find(x => x.id === cast.hexagram);
  const to = cast.changed ? book.hexagrams.find(x => x.id === cast.changed) : null;
  const values = cast.throws.map(t => t[0] + t[1] + t[2]);
  const moving = values.flatMap((v, i) => (v === 6 || v === 9 ? [i] : []));
  const bout = cast.ask === 'bout' ? boutFortune(content, state, now) : null;
  return {
    ask: { id: cast.ask, name: pick(book.asks[cast.ask], lang) },
    throws: cast.throws, values, moving,
    hexagram: {
      id: h.id, name: pick(h.name, lang), lines: h.lines, judgment: pick(h.judgment, lang), image: pick(h.image, lang),
      ...(moving.length && lang === 'zh' && h.yaoci ? { moving_lines: moving.map(i => h.yaoci[i]) } : {}),
    },
    changed: to ? { id: to.id, name: pick(to.name, lang) } : null,
    grade: { id: cast.grade, name: pick(book.grades[cast.grade], lang) },
    ...(cast.fated ? { fated: true } : {}),
    effect: { ...(book.effects[cast.ask]?.[cast.grade] ?? {}), ...(bout ? { root: { id: bout.root, name: pick(content.traits.elements[bout.root], lang) } } : {}) },
  };
}

/* Divine: once a day. Without `ask` the rules ask what the cast is about;
   with it, the coins fall — the same for the day and the 道号, so undo
   cannot fish for another. */
export function divine(state, content, ctx, args) {
  if (castToday(state, ctx.now)) return refuse('cast-today', null, { divination: divinationBrief(content, state, ctx.now) });
  const ask = String(args.ask ?? '').trim();
  if (!content.hexagrams.effects[ask]) return refuse('needs-ask', null, { asks: Object.keys(content.hexagrams.effects) });
  const s = clone(state);
  const throws = castThrows(`${dayKey(ctx.now)}|${s.name ?? ''}|cast`);
  const values = throws.map(t => t[0] + t[1] + t[2]);
  const lines = values.map(v => v % 2);
  const moved = lines.map((b, i) => (values[i] === 6 || values[i] === 9 ? 1 - b : b));
  const h = hexagramOf(content, lines);
  const to = moved.join('') === lines.join('') ? null : hexagramOf(content, moved);
  // A lower trigram of one's own 日主 element leans the grade one's way:
  // a good one to great, an ill one softer; an even one stays even.
  const fated = Boolean(s.fate?.element) && content.hexagrams.trigram_roots[TRIGRAM_OF[lines.slice(0, 3).join('')]] === s.fate.element;
  const grade = fated ? { great: 'great', good: 'great', even: 'even', ill: 'even', dire: 'ill' }[h.grade] : h.grade;
  s.divination = { day: dayKey(ctx.now), ask, throws, hexagram: h.id, changed: to?.id ?? null, grade, ...(fated ? { fated: true } : {}), at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, divination: divinationBrief(content, s, ctx.now) } };
}

/* ── 命格 — the player's lifelong base tone ── */

const jdn = (y, m, d) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};

/* 生肖 and 日主 from a birth date (YYYY-MM-DD): the year turns at 立春, by
   the day; the day's stem is its place in the sixty. Null for a date that
   is not one, or outside the 立春 table. */
export function fateOf(content, birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  const f = content.traits.fate, lichun = f.lichun.days[y - f.lichun.from];
  if (!lichun) return null;
  const pillar = mo > 2 || (mo === 2 && d >= Number(lichun)) ? y : y - 1;
  const stem = f.stems[(jdn(y, mo, d) + 9) % 10];
  return { zodiac: f.zodiac[(((pillar - 1984) % 12) + 12) % 12].id, stem: stem.id, element: stem.element };
}

/* The 命格 as Look and the card tell it; `{declined}` when the player let it be. */
export function fateBrief(content, state) {
  const f = state.fate;
  if (!f) return null;
  if (!f.zodiac) return { declined: true };
  const book = content.traits.fate, lang = state.lang;
  const stem = book.stems.find(s => s.id === f.stem);
  return {
    zodiac: { id: f.zodiac, name: pick(book.zodiac.find(z => z.id === f.zodiac), lang) },
    stem: { id: f.stem, name: pick(stem, lang) },
    element: { id: f.element, name: pick(content.traits.elements[f.element], lang) },
    source: f.source,
  };
}

/* The page's alone, never a tool: the birthday is typed on the card and
   read here, on this machine; only what it gives is kept. Once set, it
   stays for life; `random` draws one by the 道号; `decline` lets it be. */
export function fate(state, content, ctx, args) {
  if (state.fate?.zodiac) return refuse('fate-set', null, { fate: fateBrief(content, state) });
  const s = clone(state);
  if (args.decline) {
    s.fate = { declined: true };
    return { state: s, result: { ok: true, declined: true } };
  }
  let found;
  if (args.random) {
    const book = content.traits.fate, h = hashOf(`${s.name ?? ''}|${s.created ?? ''}|fate`);
    const stem = book.stems[h % book.stems.length];
    found = { zodiac: book.zodiac[Math.floor(h / book.stems.length) % book.zodiac.length].id, stem: stem.id, element: stem.element, source: 'random' };
  } else {
    const got = fateOf(content, args.birth);
    if (!got || new Date(`${args.birth}T00:00:00`) > ctx.now) return refuse('birth-invalid', null);
    found = { ...got, source: 'birth' };
  }
  s.fate = { ...found, at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, fate: fateBrief(content, s) } };
}

export { boutFortune, fortuneOf };
