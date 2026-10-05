// codex.js — 图鉴, the one picture system (Hanli, 2026-09-29: 「不用小人书的方式了，
// 图片作为图鉴，展示人物、生物、物品、武功、经脉、穴位等」; 「确保故事中的图片，在游戏
// 里可以直接用」). worlds/<world>/codex.json plus the files it links (people,
// creatures, items, arts) resolve here into one entry per subject, and one
// renderer draws an entry wherever it stands: the book's card and figure
// (read-md.js), the stage's first-appearance card and Ling's Show (cards.js),
// 录's 图鉴 (lu.js). The rules deal in ids; this file turns an id into a card.
//
// The hero has no entry and is never drawn. Pure: no DOM, no fetch.
import { esc } from './esc.js';
import { marksSvg } from './marks.js';

/// The kinds a subject is: a card with a portrait. Every other kind is
/// knowledge (经脉, 穴位, 洛书, 五行 …): a figure, marks and all.
export const SUBJECTS = ['人物', '生物', '物品', '武功'];
export const isSubject = (entry) => SUBJECTS.includes(entry?.kind);

const pickOf = (lang) => (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[lang] ?? v.zh ?? v.en : v);
const linesOf = (lang, v) => {
  const x = pickOf(lang)(v);
  return (Array.isArray(x) ? x : [x]).filter((l) => typeof l === 'string' && l.trim());
};

/* What each linked file gives an entry: its rows, a row's line(s), picture and credit. */
const LINKS = {
  // 今线's people (`line: "jin"`) are the interludes' alone: never in the 古 world's 图鉴 (同魂不同命, never said).
  people: { rows: (f) => (f.people?.people ?? []).filter((p) => p.line !== 'jin'), lines: (r) => [r.role], credit: () => null },
  // A creature's own classic line (山海经). Painted from that line since
  // 2026-09-29, its old woodcut kept as 「原图」 (`art_plate`) with the edition's name.
  creatures: {
    rows: (f) => (f.creatures?.creatures ?? []).filter((c) => !String(c.id).startsWith('foe-')), lines: (r) => [r.quote],
    // Repainted (Codex): no painter's line (his, 2026-09-29) — the classic it is drawn from, and 「原图」.
    credit: (r) => (r.art_plate ? r.source : r.art_caption ?? r.source),
    scan: (r) => r.art_plate ?? null,
  },
  items: { rows: (f) => f.items?.items ?? [], lines: (r) => [r.about], credit: () => null },
  arts: { rows: (f) => f.arts?.arts ?? [], lines: (r) => [r.about], credit: (r) => r.source },
};

/// What an item must be to have an entry (his, 2026-09-29: 「鹿皮就不用图鉴了」): a thing the
/// reader would not know, or a named story object — never an everyday thing.
export const ITEM_TAGS = ['法宝', '丹药', '功法', '信物'];
const TAG_EN = { 法宝: 'Treasure', 丹药: 'Elixir', 功法: 'Scripture', 信物: 'Token' };

/// The raw entries, linked and own, before any language: id → {id, kind, from?, row?, over}.
export function codexRaw(files = {}) {
  const codex = files.codex ?? {}, kinds = codex.kinds ?? {}, own = codex.entries ?? {};
  const out = new Map();
  for (const [kind, k] of Object.entries(kinds)) {
    const link = LINKS[k.from];
    if (!link) continue;
    // An item is linked only when the codex tags it; every other file links whole.
    for (const row of link.rows(files)) if (k.from !== 'items' || ITEM_TAGS.includes(own[row.id]?.tag)) out.set(row.id, { id: row.id, kind, from: k.from, row, over: own[row.id] ?? {} });
  }
  const linkedIds = new Set(Object.values(kinds).flatMap((k) => LINKS[k.from]?.rows(files).map((r) => r.id) ?? []));
  for (const [id, over] of Object.entries(own)) if (!out.has(id) && !linkedIds.has(id)) out.set(id, { id, kind: over.kind, from: null, row: null, over });
  return out;
}

/// One entry for a reader: `lang`, the hero's `gender` (an entry's `by_hero`
/// {male, female} follows it — none left since the hero is fixed, 2026-09-30),
/// `say` to fill a line's words ({伴·孩} …). The picture is null when the
/// codex refuses the linked art (`image: null`) or none is painted: a name card.
export function resolveEntry(raw, { lang = 'zh', gender = 'male', say = (t) => t } = {}) {
  if (!raw) return null;
  const pick = pickOf(lang), { row, over } = raw, link = LINKS[raw.from];
  const byHero = over.by_hero ? over.by_hero[gender === 'female' ? 'female' : 'male'] ?? null : undefined;
  const image = byHero !== undefined ? byHero : Object.hasOwn(over, 'image') ? over.image : row?.art ?? null;
  const lines = over.lines ? linesOf(lang, over.lines) : link ? link.lines(row).flatMap((v) => linesOf(lang, v)) : [];
  const credit = over.credit ?? link?.credit(row) ?? null;
  const scan = link?.scan?.(row);
  const source = over.source ?? (scan ? { scan } : null);
  return {
    id: raw.id, kind: raw.kind, from: raw.from,
    name: say(pick(over.name ?? row?.name) ?? raw.id),
    lines: lines.map(say),
    image: image || null,
    credit: credit ? pick(credit) : null,
    ...(source ? { source } : {}),
    ...(over.marks ? { marks: over.marks } : {}),
    ...(over.first ? { first: over.first } : {}),
    ...(over.tag ? { tag: over.tag } : {}),
    ...(over.becomes ? { becomes: over.becomes } : {}),
    ...(lang === 'zh' && raw.kind === '生物' && (over.pinyin ?? row?.pinyin) ? { pinyin: over.pinyin ?? row.pinyin } : {}),
  };
}

/// A creature's name with its pinyin over each character (his, 2026-10-02:
/// 「生僻字……给个拼音吧，在图里的字上」) — 蛫, 蠪侄, 狰 are not read at sight.
/// Only when there is one syllable per character; else the name as it is.
export function rubyName(entry) {
  const chars = [...(entry?.name ?? '')], sy = String(entry?.pinyin ?? '').trim().split(/\s+/);
  if (!entry?.pinyin || sy.length !== chars.length) return esc(entry?.name ?? '');
  return chars.map((c, i) => `<ruby>${esc(c)}<rt>${esc(sy[i])}</rt></ruby>`).join('');
}

/// A card's line with the name in it given its pinyin too (「名曰蛫」).
const rubyLine = (entry, line) => (entry?.pinyin && entry.name && line.includes(entry.name)
  ? line.split(entry.name).map(esc).join(rubyName(entry))
  : esc(line));

/// Every entry resolved: id → entry.
export function codexOf(files, opts = {}) {
  return new Map([...codexRaw(files)].map(([id, raw]) => [id, resolveEntry(raw, opts)]));
}

const KIND_EN = { 人物: 'Person', 生物: 'Creature', 物品: 'Thing', 武功: 'Art' };

/// The card: a portrait (or a clean name card) and beside it the name, the
/// kind and a line or two. A knowledge entry is its figure instead. `src(path)`
/// resolves a picture under the world; `first` marks a first appearance.
export function codexHtml(entry, { src = (p) => p, lang = 'zh', first = false } = {}) {
  if (!entry) return '';
  if (!isSubject(entry)) return codexFigure(entry, { src, lang });
  const pic = entry.image
    ? `<img src="${esc(src(entry.image))}" alt="${esc(entry.name)}" loading="lazy">`
    : `<span class="namecard" aria-hidden="true"><b>${esc(entry.name)}</b></span>`;
  const kind = entry.tag ? (lang === 'en' ? TAG_EN[entry.tag] : entry.tag) : lang === 'en' ? KIND_EN[entry.kind] ?? entry.kind : entry.kind;
  const lines = entry.lines.map((l) => `<span>${rubyLine(entry, l)}</span>`).join('');
  return `<figure class="codexcard${first ? ' first' : ''}" data-codex="${esc(entry.id)}" data-kind="${esc(entry.kind)}"><div class="cpic${entry.image ? '' : ' none'}">${pic}</div>`
    + `<figcaption><b>${rubyName(entry)}</b><i>${esc(kind)}</i>${lines}${entry.credit || entry.source?.scan ? `<small>${esc(entry.credit ?? '')}${scanButton(entry, src, lang)}</small>` : ''}</figcaption></figure>`;
}

/// The card made small, for the stage when a scene card stands under it (his,
/// 2026-09-29: the choices must stay on screen): a little picture, and beside it
/// the name, the kind and the first line on one line; the whole is a tap that
/// opens the full card (`data-codex-big`).
export function codexCompactHtml(entry, { src = (p) => p, lang = 'zh' } = {}) {
  if (!entry || !isSubject(entry)) return '';
  const pic = entry.image
    ? `<img src="${esc(src(entry.image))}" alt="" loading="lazy">`
    : `<span class="namecard" aria-hidden="true"><b>${esc(entry.name.slice(0, 2))}</b></span>`;
  const kind = entry.tag ? (lang === 'en' ? TAG_EN[entry.tag] : entry.tag) : lang === 'en' ? KIND_EN[entry.kind] ?? entry.kind : entry.kind;
  const open = lang === 'en' ? 'Open the card' : '展开图鉴';
  return `<button class="codexcompact" data-codex-big="${esc(entry.id)}" data-kind="${esc(entry.kind)}" aria-label="${esc(`${entry.name} · ${open}`)}">`
    + `<span class="cpic">${pic}</span><span class="ccap"><b>${rubyName(entry)}</b><i>${esc(kind)}</i><span>${esc(entry.lines[0] ?? '')}</span></span><span class="cmore" aria-hidden="true">⤢</span></button>`;
}

/// 「原图」: the old print an entry was drawn from, opened large on a tap.
const scanButton = (entry, src, lang) => (entry.source?.scan ? ` <button class="origscan" data-scan="${esc(src(entry.source.scan))}">${lang === 'en' ? 'Original' : '原图'}</button>` : '');

/// A knowledge figure: its picture full width with its `marks` drawn over it
/// (marks.js), the name, its lines and credit. A traced figure with its own
/// original scan carries `source.scan`: the 「原图」 tap opens it.
export function codexFigure(entry, { src = (p) => p, lang = 'zh' } = {}) {
  const img = entry.image ? `<div class="pic"><img src="${esc(src(entry.image))}" alt="${esc(entry.name)}" loading="lazy">${marksSvg(entry.marks, lang)}</div>` : '';
  const lines = entry.lines.map((l) => `<span>${esc(l)}</span>`).join('');
  const foot = entry.credit || entry.source?.scan ? `<small>${esc(entry.credit ?? '')}${scanButton(entry, src, lang)}</small>` : '';
  return `<figure class="notefig" data-note="${esc(entry.id)}">${img}<figcaption><b>${esc(entry.name)}</b>${lines}${foot}</figcaption></figure>`;
}

/// 录's 图鉴: every entry by kind, met ones as cards, the rest as empty slots
/// (a count, never a name — what is unmet is unknown). `seen` is a Set of ids.
export function codexBookHtml(codex, seen, { src = (p) => p, lang = 'zh', kinds = {} } = {}) {
  const title = lang === 'en' ? 'Codex' : '图鉴';
  const groups = Object.keys(kinds).map((kind) => {
    // An entry that becomes another (the nameless fox → 银月) is no slot of its own.
    const all = [...codex.values()].filter((e) => e.kind === kind && (!e.becomes || seen.has(e.id)));
    if (!all.length) return '';
    const met = all.filter((e) => seen.has(e.id));
    const name = pickOf(lang)(kinds[kind]) ?? kind;
    const slots = all.length - met.length;
    return `<div class="codexkind" data-kind="${esc(kind)}"><h4>${esc(name)} <span class="dim">${met.length}/${all.length}</span></h4><div class="codexgrid">`
      + met.map((e) => codexMini(e, { src })).join('')
      + '<span class="codexslot" aria-hidden="true">？</span>'.repeat(slots)
      + '</div></div>';
  }).join('');
  return `<section class="lusec lucodex"><h3>${esc(title)}</h3>${groups}</section>`;
}

/// One met entry in 录's grid: its picture or name card, and its name; a tap opens its card.
export function codexMini(entry, { src = (p) => p } = {}) {
  const pic = entry.image ? `<img src="${esc(src(entry.image))}" alt="" loading="lazy">` : `<span class="namecard"><b>${esc(entry.name)}</b></span>`;
  return `<button class="codexmini" data-codex-open="${esc(entry.id)}">${pic}<span>${esc(entry.name)}</span></button>`;
}

/// The codex's own checks, for the content lint and the tests. `exists(path)`
/// says whether a picture is on disk. Returns problem strings.
export function lintCodex(files, exists = () => true) {
  const bad = [];
  const codex = files.codex ?? {};
  const kinds = codex.kinds ?? {};
  for (const [id, e] of Object.entries(codex.entries ?? {})) {
    if (/^(hero|player|主角|你)$/i.test(id)) bad.push(`${id}: the hero has no entry`);
    if (e.kind && !kinds[e.kind]) bad.push(`${id}: unknown kind ${e.kind}`);
    if (e.image && !exists(e.image)) bad.push(`${id}: picture ${e.image} is missing`);
    for (const p of Object.values(e.by_hero ?? {})) if (p && !exists(p)) bad.push(`${id}: picture ${p} is missing`);
    if (e.by_hero && !(Object.hasOwn(e.by_hero, 'male') && Object.hasOwn(e.by_hero, 'female'))) bad.push(`${id}: by_hero names both male and female`);
    if (e.first && typeof e.first !== 'object') bad.push(`${id}: first is {book, scene}`);
    if (e.becomes != null && !(codex.entries ?? {})[e.becomes]) bad.push(`${id}: becomes ${e.becomes}, which is no entry`);
    const isItem = e.kind ? e.kind === '物品' : (files.items?.items ?? []).some((i) => i.id === id);
    if (isItem && !ITEM_TAGS.includes(e.tag)) bad.push(`${id}: an item's entry is tagged ${ITEM_TAGS.join(' · ')} — an everyday thing has none`);
  }
  const raw = codexRaw(files);
  const ids = new Map();
  for (const kind of Object.keys(kinds)) for (const row of LINKS[kinds[kind].from]?.rows(files) ?? []) {
    if (ids.has(row.id)) bad.push(`${row.id}: in both ${ids.get(row.id)} and ${kinds[kind].from}`);
    ids.set(row.id, kinds[kind].from);
  }
  for (const [id, r] of raw) {
    if (!r.kind || !kinds[r.kind]) bad.push(`${id}: no kind`);
    const e = resolveEntry(r);
    if (!(r.over.name ?? r.row?.name)?.zh) bad.push(`${id}: no name`);
    if (!r.row && !(Array.isArray(r.over.lines?.zh) && r.over.lines.zh.length && Array.isArray(r.over.lines?.en))) bad.push(`${id}: lines in zh and en`);
    if (r.row?.art && !Object.hasOwn(r.over, 'image') && !r.over.by_hero && !exists(r.row.art)) bad.push(`${id}: picture ${r.row.art} is missing`);
    if (!isSubject(e) && !(e.image && r.over.source?.url)) bad.push(`${id}: a knowledge figure needs its picture and source`);
  }
  return bad;
}

/// A line's address words ({伴·孩}, {伴·她} …, people.json `address`) for a
/// reader with no save of the rules at hand — the book. The rules fill with
/// state.mjs `fill`, which reads the same table.
export function addressSay(people, gender, lang = 'zh') {
  const g = gender === 'female' || gender === 'male' ? gender : 'none';
  // Fixed words since the hero is fixed (2026-09-30); an older world's by gender.
  const words = Object.entries(people?.address ?? {}).map(([k, v]) => [`{${k}}`, pickOf(lang)(typeof v?.zh === 'string' ? v : v?.[g]) ?? '']);
  const slot = people?.slots?.ban, banId = typeof slot === 'string' ? slot : slot?.[g] ?? 'ahe';
  const ban = pickOf(lang)((people?.people ?? []).find((p) => p.id === banId)?.name) ?? '';
  return (t) => [...words, ['{伴}', ban]].reduce((s, [k, w]) => String(s).replaceAll(k, w), t ?? '');
}
