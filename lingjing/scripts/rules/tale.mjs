// rules/tale.mjs — 今日传闻: a small side story a day, Ling's words on the rules' numbers.
// Part of the rules engine; rules.mjs is its one door.
//
// His (2026-09-24): every day Ling designs a small side story, like a WoW
// dungeon — three to five steps that open in order, each a mini-game at a
// place, then a finale (a fight, or the hardest board) and a reward. The
// main story is untouched; it replaced 奇遇 (Branch), whose three open-and-
// close tales a day paid what Ling proposed.
//
// Ling writes WORDS: the title, the hook, the cast, each step's line and
// clue, a riddle or a 论道 prompt, the ending — and picks which game each
// step is and where. The rules own every NUMBER: the puzzle (the page deals
// it from the step's id, levelled by the realm), the pay (rewards.json §
// tale), the drop, the counts. A tale that asks for more is not played.
import { refusedNames } from '../content.mjs';
import { dayKey, normalizeAnswer, pick } from '../state.mjs';
import { giveCharm, growTreasure, tierRank } from './arms.mjs';
import { cardCatalog, gainCard, ownedCards, usable } from './cards.mjs';
import { clone, pay, paysOf, refuse, spendStamina } from './core.mjs';
import { HANDED_KEEP, itemOf, whereAt, withinRoads } from './errands.mjs';
import { gameLevel, lundaoForm } from './tasks.mjs';
import { hashOf } from './travel.mjs';
import { stow, storedLine } from './pouch.mjs';
import { allPlaces, atScene, creatureOf, placeName, placeOf, provinceOpen, tierIndex, tooHard } from './world.mjs';

const WORD_GAMES = new Set(['riddle', 'lundao']);
const cfgOf = content => content.tale;
const minutes = n => n * 60000;

/* ── What stands: today's, open, or none ── */

const liveTale = state => (state.tale && !state.tale.done_at ? state.tale : null);
const madeToday = (state, now) => state.tale?.day === dayKey(now);
/* One a day; an unfinished one stays until it is done or put down, and the
   next is offered only then — a missed day costs nothing. */
const canMakeTale = (state, now) => !liveTale(state) && !madeToday(state, now);
const linkOf = t => t.chain[t.n];
const boardId = (t, n = t.n) => `tale:${t.id}:${n}`;

/* 传闻 · 河伯之毒 · 2/5 — the dictionary's word, Ling's title, where it stands. */
function taleLabel(content, state, t, n = t.n) {
  const word = pick(content.dictionary.words.tale, state.lang);
  return `${word} · ${t.title} · ${Math.min(n + 1, t.chain.length)}/${t.chain.length}`;
}

/* ── The seed and the shape Ling writes to ── */

/* The seed a tale grows from: the province he stands in, unused first,
   chosen by the day and the 道号 — the same day hands back the same seed.
   A province with none written grows the tale from its heritage alone. */
function pickSeed(content, state, now) {
  const province = placeOf(content, state.place)?.province ?? content.chapters[state.chapter]?.province;
  const all = content.seeds[province]?.seeds ?? [];
  if (!all.length) return null;
  const used = new Set(state.seeds_used ?? []);
  const pool = all.some(x => !used.has(x.id)) ? all.filter(x => !used.has(x.id)) : all;
  const seed = pool[hashOf(`${dayKey(now)}|${state.name ?? ''}|tale`) % pool.length];
  const kind = cfgOf(content).seed_kinds?.[seed.kind];
  return { id: seed.id, line: pick(seed.line, state.lang), source: pick(seed.source, state.lang), creature: seed.creature ?? null, ...(kind ? { kind: pick(kind, state.lang) } : {}) };
}

const walkable = (content, state, p, now) => p && !tooHard(content, state, p) && provinceOpen(content, p.province, now);

/* The places a tale may use, around where he stands — and the beasts at
   their haunts a finale may be. Ids and names only: her context is not a map. */
function reachOf(content, state, now) {
  const here = placeOf(content, state.place), cfg = cfgOf(content);
  if (!here) return { places: [], haunts: [] };
  const ids = [here.id, ...withinRoads(content, state, here, now, cfg.reach * 3)];
  const places = ids.map(id => placeOf(content, id)).filter(p => walkable(content, state, p, now));
  const haunts = places.filter(p => p.has?.creature && !state.cast.includes(p.has.creature)).map(p => {
    const c = creatureOf(content, p.has.creature);
    return { creature: c.id, name: pick(c.name, state.lang), at: p.id, ...(c.elite ? { elite: true } : {}) };
  });
  return { places: places.map(p => placeName(content, state, p)), haunts };
}

function shapeOf(content, state, now) {
  const cfg = cfgOf(content), lang = state.lang;
  const games = Object.entries(cfg.games).map(([id, g]) => ({
    id, name: pick(g.name, lang), frames: g.frames.map(f => pick(f, lang)),
    ...(g.forms ? { forms: g.forms[lang] ?? g.forms.zh } : {}),
  }));
  return {
    steps: cfg.steps, cast: cfg.cast, reach: cfg.reach, kinds_min: cfg.kinds_min, finale: cfg.finale,
    riddle_choices: cfg.riddle.choices, lengths: cfg.lengths[lang] ?? cfg.lengths.zh, games,
    ...reachOf(content, state, now),
    ...(state.known?.length ? { known: knownBrief(content, state, cfg.known_max) } : {}),
    example: cfg.example[lang] ?? cfg.example.zh,
  };
}

/* ── The lint: a tale is played only in the rules' shape ── */

const FORBIDDEN = new Set(['progress', 'wealth', 'reward', 'rewards', 'grant', 'pays', 'drop', 'drops', 'item', 'card', 'level', 'n', 'count', 'stamina']);
const SLUG = /^[a-z][a-z0-9-]{1,23}$/;
const han = s => /\p{Script=Han}/u.test(s);

/* A line of Ling's: words, not too long, in the player's language. */
function textOk(v, max, lang) {
  if (typeof v !== 'string' || !v.trim()) return 'words';
  if ([...v.trim()].length > max) return `at most ${max} characters`;
  if (lang === 'zh' ? !han(v) : han(v)) return `in the player's language (${lang})`;
  return null;
}

/* No number anywhere, and no key that would carry a reward or a count. */
function numbersIn(node, at, bad) {
  if (typeof node === 'number') { bad(at, 'no numbers — the rules set every count and every reward'); return; }
  if (Array.isArray(node)) { node.forEach((x, i) => numbersIn(x, `${at}[${i}]`, bad)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (FORBIDDEN.has(k)) bad(`${at}.${k}`, 'the rules own this — leave it out');
    numbersIn(v, `${at}.${k}`, bad);
  }
}

/* The one place a step may stand: a real place, open, not beyond the realm,
   and within `reach` roads of the one before. */
function placeProblem(content, state, now, id, from) {
  const p = placeOf(content, id);
  if (!p) return `no place ${id}`;
  if (!walkable(content, state, p, now)) return `${id} is closed or beyond the player's realm`;
  if (from && id !== from.id && !withinRoads(content, state, from, now, cfgOf(content).reach).has(id)) return `${id} is more than ${cfgOf(content).reach} roads from ${from.id}`;
  return null;
}

const RIDDLE_OK = (content, lang, r, lim, bad, at) => {
  const cfg = cfgOf(content).riddle.choices;
  if (!r || typeof r !== 'object') { bad(at, 'a riddle step needs riddle {q, answers, choices}'); return; }
  const e = textOk(r.q, lim.q, lang);
  if (e) bad(`${at}.q`, e);
  const choices = Array.isArray(r.choices) ? r.choices : [];
  if (choices.length < cfg.min || choices.length > cfg.max) bad(`${at}.choices`, `${cfg.min}–${cfg.max} choices`);
  choices.forEach((c, i) => { const ce = textOk(c, lim.choice, lang); if (ce) bad(`${at}.choices[${i}]`, ce); });
  const said = new Set(choices.map(normalizeAnswer));
  const answers = Array.isArray(r.answers) ? r.answers : [];
  if (!answers.length || !answers.every(a => said.has(normalizeAnswer(a)))) bad(`${at}.answers`, 'each answer is one of the choices');
  if (answers.length && choices.every(c => answers.some(a => normalizeAnswer(a) === normalizeAnswer(c)))) bad(`${at}.choices`, 'at least one wrong choice');
};

/* A 论道 prompt the rules can judge against: a keyword (飞花令), an idiom to
   chain from (成语接龙), an upper line (对对联). */
const PROMPT_OK = {
  feihua: (p, lang) => (lang === 'zh' ? [...p].length <= 2 && han(p) : /^[a-z]+$/i.test(p)),
  chengyu: (p, lang) => (lang === 'zh' ? [...p].filter(c => han(c)).length === 4 : /^[a-z]{3,}$/i.test(p)),
  duilian: (p, lang) => lang === 'zh' && [...p].filter(c => han(c)).length >= 5 && [...p].length <= 11,
};
const LUNDAO_OK = (content, lang, l, bad, at) => {
  const forms = cfgOf(content).games.lundao.forms[lang] ?? [];
  if (!l || !forms.includes(l.form)) { bad(at, `a 论道 step needs lundao {form: ${forms.join('|')}, prompt}`); return; }
  if (typeof l.prompt !== 'string' || !PROMPT_OK[l.form](l.prompt.trim(), lang)) bad(`${at}.prompt`, `not a ${l.form} prompt`);
};

/* One step (or a board finale): its game, its place, who gives it, its words. */
function lintLink(content, state, now, link, at, from, castIds, bad, { finale = false } = {}) {
  const lang = state.lang, lim = cfgOf(content).lengths[lang] ?? cfgOf(content).lengths.zh, games = cfgOf(content).games;
  if (!link || typeof link !== 'object') { bad(at, 'a step is an object'); return null; }
  if (!games[link.game] || (finale && WORD_GAMES.has(link.game))) bad(`${at}.game`, `one of ${Object.keys(games).filter(g => !finale || !WORD_GAMES.has(g)).join(', ')}`);
  const where = placeProblem(content, state, now, link.at, from);
  if (where) bad(`${at}.at`, where);
  if (!castIds.has(link.giver)) bad(`${at}.giver`, 'one of the cast ids');
  for (const k of ['line', ...(finale ? [] : ['clue'])]) { const e = textOk(link[k], lim[k === 'clue' ? 'clue' : 'line'], lang); if (e) bad(`${at}.${k}`, e); }
  if (link.game === 'riddle') RIDDLE_OK(content, lang, link.riddle, lim, bad, `${at}.riddle`);
  if (link.game === 'lundao') LUNDAO_OK(content, lang, link.lundao, bad, `${at}.lundao`);
  return placeOf(content, link.at);
}

/* The finale's fight: a beast at its haunt, within reach, not one who walks with him. */
function lintDuel(content, state, now, f, from, castIds, bad) {
  const lang = state.lang, lim = cfgOf(content).lengths[lang] ?? cfgOf(content).lengths.zh;
  const c = creatureOf(content, f.creature);
  const haunt = c && allPlaces(content).find(p => p.has?.creature === c.id);
  if (!haunt) { bad('finale.creature', `a creature with a haunt — ${f.creature} is not`); return null; }
  if (state.cast.includes(c.id)) bad('finale.creature', `${c.id} walks with the player — no fight`);
  const where = placeProblem(content, state, now, haunt.id, from);
  if (where) bad('finale.creature', where);
  if (!castIds.has(f.giver)) bad('finale.giver', 'one of the cast ids');
  const e = textOk(f.line, lim.line, lang);
  if (e) bad('finale.line', e);
  lintBoss(f.boss, lim, lang, bad);
  return haunt;
}

/* The finale's beast speaks (redesign-v2 § 五): optional `boss` {open, won,
   lost} — its lines for this story, shown on the fight's card in place of
   its own. Each one a short line of words, never a digit. */
const BOSS_LINES = ['open', 'won', 'lost'];
function lintBoss(boss, lim, lang, bad) {
  if (boss === undefined) return;
  if (!boss || typeof boss !== 'object' || Array.isArray(boss)) { bad('finale.boss', `an object {${BOSS_LINES.join(', ')}}`); return; }
  for (const k of Object.keys(boss)) if (!BOSS_LINES.includes(k)) bad(`finale.boss.${k}`, `only ${BOSS_LINES.join(', ')}`);
  for (const k of BOSS_LINES) {
    if (!(k in boss)) continue;
    const e = textOk(boss[k], lim.boss, lang) ?? (/[0-9０-９]/.test(boss[k]) ? 'no digits — the beast speaks words' : null);
    if (e) bad(`finale.boss.${k}`, e);
  }
}
const bossOf = boss => (boss && typeof boss === 'object' ? Object.fromEntries(BOSS_LINES.filter(k => typeof boss[k] === 'string').map(k => [k, boss[k].trim()])) : null);

/* The cast: new people, or ones already met in a finished tale (`known`). */
function lintCast(content, state, cast, bad) {
  const lang = state.lang, cfg = cfgOf(content), lim = cfg.lengths[lang] ?? cfg.lengths.zh;
  const known = new Map((state.known ?? []).map(k => [k.id, k]));
  if (!Array.isArray(cast) || cast.length < cfg.cast.min || cast.length > cfg.cast.max) { bad('cast', `${cfg.cast.min}–${cfg.cast.max} people`); return []; }
  const out = cast.map((m, i) => {
    const at = `cast[${i}]`, old = known.get(m?.id);
    if (!SLUG.test(m?.id ?? '')) bad(`${at}.id`, 'a short id: lowercase letters, digits, dashes');
    const person = old ? { id: old.id, name: old.name, role: m.role ?? old.role, voice: m.voice ?? old.voice } : { id: m?.id, name: m?.name, role: m?.role, voice: m?.voice };
    for (const k of ['name', 'role', 'voice']) { const e = textOk(person[k], lim[k], lang); if (e) bad(`${at}.${k}`, e); }
    return person;
  });
  if (new Set(out.map(p => p.id)).size !== out.length) bad('cast', 'ids must differ');
  return out;
}

/* The steps' games: at least `kinds_min` different ones, never the same twice running. */
function lintVariety(content, chain, bad) {
  const games = chain.map(l => l.game), min = Math.min(cfgOf(content).kinds_min, games.length - 1);
  if (new Set(games.slice(0, -1)).size < min) bad('steps', `at least ${min} different games`);
  games.forEach((g, i) => { if (i && g === games[i - 1] && g !== 'duel') bad(`steps[${i}]`, `the same game as the step before (${g})`); });
}

function lintTale(content, state, now, raw) {
  const problems = [], bad = (where, msg) => problems.push(`${where}: ${msg}`);
  let t;
  try { t = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { problems: ['tale: not JSON'] }; }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { problems: ['tale: one object'] };
  const cfg = cfgOf(content), lang = state.lang, lim = cfg.lengths[lang] ?? cfg.lengths.zh;
  if (JSON.stringify(t).length > cfg.max_bytes) bad('tale', `over ${cfg.max_bytes} bytes`);
  numbersIn(t, 'tale', bad);
  refusedNames(t, content, 'tale', bad);
  for (const k of ['title', 'hook', 'ending']) { const e = textOk(t[k], lim[k], lang); if (e) bad(k, e); }
  const cast = lintCast(content, state, t.cast, bad);
  const castIds = new Set(cast.map(p => p.id));
  const steps = Array.isArray(t.steps) ? t.steps : [];
  if (steps.length < cfg.steps.min || steps.length > cfg.steps.max) bad('steps', `${cfg.steps.min}–${cfg.steps.max} steps`);
  let from = placeOf(content, state.place);
  const chain = [];
  steps.forEach((link, i) => {
    const p = lintLink(content, state, now, link, `steps[${i}]`, from, castIds, bad);
    chain.push(pickLink(link));
    if (p) from = p;
  });
  const f = t.finale ?? {};
  if (f.kind === 'duel') {
    const haunt = lintDuel(content, state, now, f, from, castIds, bad);
    const boss = bossOf(f.boss);
    chain.push({ game: 'duel', creature: f.creature, at: haunt?.id ?? null, giver: f.giver, line: f.line, end: true, ...(boss && Object.keys(boss).length ? { boss } : {}) });
  } else if (f.kind === 'board') {
    lintLink(content, state, now, f, 'finale', from, castIds, bad, { finale: true });
    chain.push({ ...pickLink(f), end: true });
  } else bad('finale.kind', `one of ${cfg.finale.join(', ')}`);
  lintVariety(content, chain, bad);
  if (problems.length) return { problems };
  return { tale: { title: t.title.trim(), hook: t.hook.trim(), ending: t.ending.trim(), cast, chain: chain.map(trimLink) } };
}

const pickLink = l => ({ game: l?.game, at: l?.at, giver: l?.giver, line: l?.line, ...(l?.clue ? { clue: l.clue } : {}), ...(l?.riddle ? { riddle: l.riddle } : {}), ...(l?.lundao ? { lundao: l.lundao } : {}) });
const trimLink = l => ({
  ...l, line: l.line.trim(), ...(l.clue ? { clue: l.clue.trim() } : {}),
  ...(l.riddle ? { riddle: { q: l.riddle.q.trim(), answers: l.riddle.answers.map(a => String(a).trim()), choices: l.riddle.choices.map(c => String(c).trim()) } } : {}),
  ...(l.lundao ? { lundao: { form: l.lundao.form, prompt: l.lundao.prompt.trim() } } : {}),
});

/* ── The numbers: the rules' own ── */

/* What each step and the finale pay: the tables' caps, and never more than
   the whole tale's cap — a fifth step eats into the finale. */
function grantsOf(content, steps) {
  const r = content.rewards, step = r.tables.tale, end = r.tables.tale_end, cap = r.tale.cap;
  const left = k => Math.max(0, Math.min(end[k], cap[k] - steps * step[k]));
  return { step: { table: 'tale', progress: step.progress, wealth: step.wealth }, end: { table: 'tale_end', progress: left('progress'), wealth: left('wealth') } };
}

/* The finale's one drop: an entry of the highest tier at or below his realm
   (a card only if he lacks it and has its root), picked by the tale's id. */
function dropOf(content, state, t) {
  const rank = tierIndex(content, state), catalog = cardCatalog(content), owned = new Set(ownedCards(content, state)), roots = new Set(state.traits ?? []);
  const fits = d => tierRank(content, d.tier) <= rank && (d.item ? itemOf(content, d.item) : catalog[d.card] && !owned.has(d.card) && usable(catalog[d.card], roots));
  const open = (content.rewards.tale?.drops ?? []).filter(fits);
  if (!open.length) return null;
  const top = Math.max(...open.map(d => tierRank(content, d.tier)));
  const pool = open.filter(d => tierRank(content, d.tier) === top);
  return pool[hashOf(`${t.id}|${state.name ?? ''}|drop`) % pool.length];
}

function giveDrop(content, s, d, from = null) {
  if (!d) return null;
  if (d.card) return gainCard(content, s, d.card, from);
  const got = stow(content, s, d.item);
  return { id: got.id, name: got.name, ...(got.stored ? { stored: true } : {}) };
}

/* ── Playing it ── */

/* A step met: paid, handed in where he stands, the next step opened — or,
   the finale, the drop given, the tale done and its cast remembered. A
   step's board costs a hosted game's 体力 when it is counted; empty, the win
   is kept (`won`) and counted once the pool is back. */
function settle(content, s, ctx) {
  const t = s.tale, link = linkOf(t), n = t.n;
  if (link.game !== 'duel') {
    const empty = spendStamina(content, s, ctx, 'game');
    if (empty) { t.won = true; return { kept: true, returns_at: empty.result.returns_at }; }
  }
  const paid = pay(content, s, ctx, link.end ? t.grants.end : t.grants.step);
  const at = ctx.now.toISOString();
  delete t.won; delete t.tried; delete t.lundao;
  let gives = null, grew = null, charm = null;
  if (link.end) {
    gives = giveDrop(content, s, dropOf(content, s, t), { how: 'tale', tale: t.id, title: t.title ?? null, day: dayKey(ctx.now) });
    // The finale also leaves a 符 and raises the 本命法宝 one 重 (rewards.json
    // `growth` — they grow with the story now, redesign-v2 § 四).
    charm = giveCharm(content, s);
    grew = growTreasure(content, s, 'tale_end');
    t.done_at = at;
    t.drop = gives;
    remember(content, s, t, ctx.now);
  } else {
    t.n += 1;
    t.step_at = at;
  }
  s.story_at = at;
  const given = [gives?.name, charm?.name].filter(Boolean).join(' · ');
  const h = { id: boardId(t, n), tale: true, n, place: s.place, at, paid, ...(link.end ? { end: true } : {}), ...(given ? { gives: given } : {}) };
  s.handed = [...(s.handed ?? []), h].slice(-HANDED_KEEP);
  const full = storedLine(s, [gives, charm]);
  return { handed: [taleHanded(content, s, h)], ...(full ? { pouch_full: full } : {}), ...(link.end ? { ended: true, ...(grew ? { treasure_grew: grew } : {}) } : { step: stepBrief(content, s, ctx.now) }) };
}

/* 相识 — the people of a finished tale are remembered, and may come back. */
function remember(content, s, t, now) {
  const last = placeOf(content, linkOf(t).at);
  const met = t.cast.map(p => ({ id: p.id, name: p.name, role: p.role, voice: p.voice, where: last?.id ?? null, from: t.title, last: dayKey(now) }));
  const ids = new Set(met.map(p => p.id));
  s.known = [...met, ...(s.known ?? []).filter(k => !ids.has(k.id))].slice(0, cfgOf(content).known_max);
}

/* What a won fight (or a taming) does to the finale: the event every verb
   hands to advance() — and only a fight or a taming can end a duel finale. */
function taleEvent(content, s, event, ctx) {
  const t = liveTale(s);
  if (!t || !ctx) return [];
  const link = linkOf(t);
  if (link.game !== 'duel' || !['subdue', 'tame'].includes(event.kind) || event.creature !== link.creature) return [];
  return settle(content, s, ctx).handed ?? [];
}

const here = (s, link) => s.place === link.at;
const notHere = (content, s, link) => refuse('not-here', null, { at: placeName(content, s, placeOf(content, link.at)) });

/* A board won on the page — the page is its only witness, as for every board. */
function winBoard(content, s, ctx, args) {
  const t = liveTale(s), link = t && linkOf(t);
  if (!t) return refuse('no-tale', null);
  if (String(args.board ?? '') !== boardId(t) || WORD_GAMES.has(link.game) || link.game === 'duel') return refuse('not-this-step', null, { step: boardId(t) });
  if (t.won) return refuse('won-already', null);
  if (!here(s, link)) return notHere(content, s, link);
  return { state: s, result: { ok: true, ...settle(content, s, ctx) } };
}

/* A riddle answered, or a 论道 line judged (`ok` is Ling's word on its meaning). */
function answerStep(content, s, ctx, args) {
  const t = liveTale(s), link = t && linkOf(t);
  if (!t) return refuse('no-tale', null);
  if (!WORD_GAMES.has(link.game)) return refuse('not-this-step', null, { game: link.game });
  if (!here(s, link)) return notHere(content, s, link);
  const answer = String(args.answer ?? '').trim();
  if (!answer) return refuse('needs-answer', null);
  return link.game === 'riddle' ? answerRiddle(content, s, ctx, t, link, answer) : answerLundao(content, s, ctx, t, link, answer, args);
}

function answerRiddle(content, s, ctx, t, link, answer) {
  if (link.riddle.answers.some(a => normalizeAnswer(a) === normalizeAnswer(answer))) return { state: s, result: { ok: true, answered: true, ...settle(content, s, ctx) } };
  t.tried = [...new Set([...(t.tried ?? []), answer])];
  return { state: s, result: { ok: false, refused: 'wrong-answer', say: null, step: stepBrief(content, s, ctx.now) } };
}

/* 论道 inside a tale: the rules check the form (tasks.mjs lundaoForm), Ling
   the meaning. Three misses and the round begins again — a tale never dead-ends. */
function answerLundao(content, s, ctx, t, link, answer, args) {
  const cfg = cfgOf(content).lundao, l = t.lundao ?? { good: 0, misses: 0, last: link.lundao.prompt, prompt: link.lundao.prompt, used: [link.lundao.prompt] };
  const form = lundaoForm(link.lundao.form, s.lang, l, answer);
  const good = !form && String(args.ok ?? '') === 'true';
  if (good) {
    l.good += 1; l.used.push(answer);
    const reply = String(args.reply ?? '').trim();
    l.last = link.lundao.form === 'chengyu' && reply && !lundaoForm('chengyu', s.lang, { ...l, last: answer }, reply) ? reply : answer;
  } else l.misses += 1;
  if (l.good >= cfg.need) return { state: s, result: { ok: true, good, ...settle(content, s, ctx) } };
  const again = l.misses >= cfg.misses;
  t.lundao = again ? { good: 0, misses: 0, last: link.lundao.prompt, prompt: link.lundao.prompt, used: [link.lundao.prompt] } : l;
  return { state: s, result: { ok: true, good, ...(form ? { form } : {}), ...(again ? { again: true } : {}), step: stepBrief(content, s, ctx.now) } };
}

/* A win kept while 体力 was empty, counted now it is back. */
function turnKept(content, s, ctx) {
  const t = liveTale(s);
  if (!t?.won) return refuse('not-done', null);
  delete t.won;
  const out = settle(content, s, ctx);
  if (out.kept) return refuse('no-stamina', null, { returns_at: out.returns_at });
  return { state: s, result: { ok: true, ...out } };
}

function makeTale(content, s, ctx, args) {
  if (liveTale(s)) return refuse('tale-open', null, { tale: taleBrief(content, s, ctx.now) });
  if (madeToday(s, ctx.now)) return refuse('tale-today', null);
  const linted = lintTale(content, s, ctx.now, args.tale);
  if (!linted.tale) return refuse('not-playable', null, { problems: linted.problems });
  const day = dayKey(ctx.now), seed = pickSeed(content, s, ctx.now), at = ctx.now.toISOString();
  s.tale = { id: day.replaceAll('-', ''), day, seed: seed?.id ?? null, ...linted.tale, n: 0, opened: at, step_at: at, grants: grantsOf(content, linted.tale.chain.length - 1) };
  if (seed) s.seeds_used = [...new Set([...(s.seeds_used ?? []), seed.id])];
  s.story_at = at;
  const g = s.tale.grants;
  return { state: s, result: { ok: true, tale: taleBrief(content, s, ctx.now), pays: { step: paysOf(content, s, ctx.now, g.step), end: paysOf(content, s, ctx.now, g.end) } } };
}

/* Tale — seed · make · info · drop for Ling; win · answer · turn from the page (and answer from Ling). */
const ACTIONS = {
  seed: (content, s, ctx) => {
    if (liveTale(s)) return refuse('tale-open', null, { tale: taleBrief(content, s, ctx.now) });
    if (madeToday(s, ctx.now)) return refuse('tale-today', null);
    return { state: null, result: { ok: true, seed: pickSeed(content, s, ctx.now), here: placeName(content, s, placeOf(content, s.place)), shape: shapeOf(content, s, ctx.now) } };
  },
  make: (content, s, ctx, args) => makeTale(content, clone(s), ctx, args),
  info: (content, s, ctx) => ({ state: null, result: { ok: true, ...taleInfo(content, s, ctx) } }),
  drop: (content, s, ctx) => {
    if (!liveTale(s)) return refuse('no-tale', null);
    const n = clone(s);
    n.tale = { ...n.tale, done_at: ctx.now.toISOString(), dropped: true };
    return { state: n, result: { ok: true, dropped: n.tale.id } };
  },
  win: (content, s, ctx, args) => winBoard(content, clone(s), ctx, args),
  answer: (content, s, ctx, args) => answerStep(content, clone(s), ctx, args),
  turn: (content, s, ctx) => turnKept(content, clone(s), ctx),
};

export function tale(state, content, ctx, args) {
  const act = ACTIONS[String(args.action ?? 'info')];
  if (!act) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  return act(content, state, ctx, args);
}

/* ── Telling it ── */

const castName = (t, id) => t.cast.find(p => p.id === id)?.name ?? null;
const gameName = (content, lang, id) => (id === 'duel' ? pick(content.dictionary.words.duel, lang) : pick(cfgOf(content).games[id]?.name, lang));

/* The step before him: its game and place, who gives it, the line — and
   what the page needs to deal its board, or ask its riddle. Never an answer. */
function stepBrief(content, state, now) {
  const t = liveTale(state);
  if (!t) return null;
  const link = linkOf(t), lang = state.lang, p = placeOf(content, link.at);
  const g = cfgOf(content).games[link.game];
  const brief = {
    n: t.n + 1, of: t.chain.length, game: link.game, game_name: gameName(content, lang, link.game), ...(link.end ? { finale: true } : {}),
    at: p ? { ...placeName(content, state, p), here: p.id === state.place } : null,
    giver: { id: link.giver, name: castName(t, link.giver) }, line: link.line,
    ...(t.won ? { won: true } : {}),
  };
  if (g?.page) brief.board = { id: boardId(t), page: g.page, level: Math.min(3, gameLevel(content, state) + (link.end ? 1 : 0)) };
  if (link.game === 'riddle') { const tried = new Set((t.tried ?? []).map(normalizeAnswer)); brief.riddle = { q: link.riddle.q, choices: link.riddle.choices.filter(c => !tried.has(normalizeAnswer(c))), tried: (t.tried ?? []).length }; }
  if (link.game === 'lundao') { const l = t.lundao; brief.lundao = { form: link.lundao.form, prompt: link.lundao.prompt, last: l?.last ?? link.lundao.prompt, good: l?.good ?? 0, need: cfgOf(content).lundao.need, misses: l?.misses ?? 0, max_misses: cfgOf(content).lundao.misses }; }
  if (link.game === 'duel') brief.creature = { id: link.creature, name: pick(creatureOf(content, link.creature)?.name, lang) };
  return brief;
}

/* Look's `tale`: what Ling tells from — the step open now, the cast and
   their voices, what earlier steps revealed; ended today, the ending to speak. */
function taleBrief(content, state, now) {
  const t = state.tale;
  // Done on an earlier day, it is history: only the known roster keeps it.
  if (!t || (t.done_at && dayKey(new Date(t.done_at)) !== dayKey(now))) return null;
  const clues = t.chain.slice(0, t.done_at ? t.chain.length : t.n).map(l => l.clue).filter(Boolean);
  const base = { id: t.id, title: t.title, label: taleLabel(content, state, t), ...(t.seed ? { seed: t.seed } : {}), ...(clues.length ? { clues } : {}) };
  if (t.dropped) return { ...base, dropped: true };
  if (t.done_at) return { ...base, ended: true, ending: t.ending, cast: t.cast.map(p => p.name), ...(t.drop ? { drop: t.drop.name } : {}) };
  return { ...base, hook: t.hook, cast: t.cast, step: stepBrief(content, state, now) };
}

/* The book's line: where the step is met, what it asks. It takes no slot —
   nobody took it from a giver; it is the day's own. */
function taleRow(content, state, ctx) {
  const t = liveTale(state);
  if (!t) return null;
  const link = linkOf(t), p = placeOf(content, link.at);
  const kind = link.game === 'duel' ? 'subdue' : WORD_GAMES.has(link.game) ? 'answer' : 'board';
  return { id: 'tale', tale: true, title: taleLabel(content, state, t), need: [{ kind, have: t.won ? 1 : 0, n: 1 }], ready: Boolean(t.won), where: p ? whereAt(content, state, p, state.lang, ctx.now) : null };
}

/* The book row opened (Quest info id tale): the hook, the step's giver and
   line, what a step and the finale pay. A read; never rides Look. */
function taleInfo(content, state, ctx) {
  const t = liveTale(state);
  if (!t) return { ok: false, refused: 'no-tale' };
  const link = linkOf(t);
  return { ok: true, id: 'tale', kind: 'tale', title: taleLabel(content, state, t), who: castName(t, link.giver), say: link.line, hook: t.hook,
    pays: paysOf(content, state, ctx.now, link.end ? t.grants.end : t.grants.step), ...(link.end ? {} : { next: gameName(content, state.lang, t.chain[t.n + 1].game) }),
    ...(taleRow(content, state, ctx) ?? {}) };
}

/* One step handed in, as the stage's 所得 and Ling tell it. */
function taleHanded(content, state, h) {
  const t = state.tale?.id && h.id.startsWith(`tale:${state.tale.id}:`) ? state.tale : null;
  if (!t) return { id: h.id, title: pick(content.dictionary.words.tale, state.lang), paid: h.paid };
  const link = t.chain[h.n], next = t.chain[h.n + 1];
  return { id: h.id, tale: true, title: taleLabel(content, state, t, h.n), who: castName(t, link.giver), paid: h.paid, ...(h.end ? { ended: true } : {}), ...(h.gives ? { gives: h.gives } : {}),
    ...(next && !t.dropped ? { next: { title: taleLabel(content, state, t, h.n + 1), took: true, at: placeName(content, state, placeOf(content, next.at)) } } : {}) };
}

/* Yinyue's one line of it (Progress). */
function taleLine(content, state, now) {
  const t = liveTale(state);
  if (t) return `${taleLabel(content, state, t)} · ${gameName(content, state.lang, linkOf(t).game)} · ${pick(placeOf(content, linkOf(t).at)?.name, state.lang) ?? ''}`;
  return madeToday(state, now) && !state.tale.dropped ? `${pick(content.dictionary.words.tale, state.lang)} · ${state.tale.title} · ✓` : null;
}

/* A tale's 论道 step open where the player stands — what the player has
   been shown of it (the prompt, the line to chain from, the misses). */
function taleLundao(content, state) {
  const t = liveTale(state), link = t && linkOf(t);
  if (!link || link.game !== 'lundao' || t.won || link.at !== state.place) return null;
  const l = t.lundao;
  return { game: link.lundao.form, prompt: link.lundao.prompt, last: l?.last ?? link.lundao.prompt, misses: l?.misses ?? 0, max_misses: cfgOf(content).lundao.misses };
}

/* The people met in finished tales, newest first — who Ling may bring back. */
function knownBrief(content, state, max = 5) {
  return (state.known ?? []).slice(0, max).map(k => ({ id: k.id, name: k.name, role: k.role, where: pick(placeOf(content, k.where)?.name, state.lang) ?? null, from: k.from }));
}

/* 该有点故事了 — nothing story-like for a while: no rumor yet today, or the
   open one quiet for `story_due_minutes`. Handed to Ling once in that span
   (`story_told`), and never mid-fight, mid-scene, or on an empty pool. */
function storyDue(content, state, ctx) {
  const n = minutes(cfgOf(content).story_due_minutes), now = ctx.now;
  if (state.fight || atScene(content, state) || state.resting) return null;
  if (state.story_told && now - new Date(state.story_told) < n) return null;
  if (canMakeTale(state, now)) return { why: 'no rumor yet today — offer it' };
  const t = liveTale(state);
  const since = t ? now - new Date(state.story_at ?? t.step_at) : 0;
  return t && since >= n ? { why: `quiet for ${Math.round(since / 60000)} minutes — the rumor's next step waits` } : null;
}

export { boardId, canMakeTale, knownBrief, lintTale, liveTale, pickSeed, storyDue, taleBrief, taleEvent, taleHanded, taleInfo, taleLine, taleLundao, taleRow };
