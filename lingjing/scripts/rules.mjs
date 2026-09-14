// The rules engine — the only writer of a player's state. Ling proposes by
// calling a verb; the rules check it against the state and the content and
// either apply it or refuse with a reason Ling can narrate.
//
//   node rules.mjs <verb> [--key value …]
//   verbs: init look resolve judge task win branch summarize move lang make enter leave undo
//
// Every verb prints one JSON object. A refusal is {ok:false, refused, say}
// and never changes state. Env: LINGJING_DATA, LINGJING_QUESTS, LINGJING_NOW.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST, MADE, lintMade, loadContent } from './content.mjs';
import {
  addXw, dayKey, fill, langOf, newState, normalizeAnswer, periodKey, periodStart, pick, rollDay,
  payOf, speedOf, stageName, threshold,
  addQi, qiReturnsAt, settleQi,
} from './state.mjs';

const STORY_WORDS = 300, STORY_CHARS = 600;

/* ── Reading the state ── */

/* The scene the player stands in: a made one when they have stepped into
   one, else the spine's. */
const inMade = state => Boolean(state.made?.at);
const sceneOf = (content, state) => (inMade(state)
  ? state.made.scenes[state.made.at] ?? null
  : content.chapters[state.chapter]?.scenes[state.scene] ?? null);
const creatureOf = (content, id) => content.creatures.creatures.find(c => c.id === id);
const taskOf = (content, id) => content.tasks.tasks.find(t => t.id === id);

/* A speaker's name in the player's language; Ling narrates, unnamed. */
const nameOf = (content, who, lang) => (who === 'ling' ? null : pick(CAST[who] ?? creatureOf(content, who)?.name, lang));
const spoken = (content, state, lines) => (lines ?? []).map(l => ({
  who: l.who, name: nameOf(content, l.who, state.lang), text: fill(pick(l.text, state.lang), state),
}));

function sceneBrief(content, state) {
  const scene = sceneOf(content, state);
  if (!scene) return null;
  const lang = state.lang, say = pair => fill(pick(pair, lang), state);
  const buttons = scene.buttons ?? [];
  return {
    id: scene.id,
    place: say(scene.place),
    setup: say(scene.setup),
    cast: (scene.cast ?? []).map(id => ({ id, name: nameOf(content, id, lang) })),
    show: scene.show ?? [],
    lines: spoken(content, state, scene.lines),
    buttons: buttons.map(id => ({ id, label: say(scene.exits.find(e => e.id === id).label) })),
    exits: scene.exits.map(e => exitBrief(content, state, e, buttons.includes(e.id))),
  };
}

function exitBrief(content, state, exit, button) {
  const brief = { id: exit.id, means: exit.means, button };
  if (exit.needs) brief.needs = exit.needs;
  if (exit.key) brief.riddle = content.riddles[state.lang].riddles[exit.key].q;
  if (exit.game) Object.assign(brief, { game: exit.game, won: Boolean(state.wins?.[exit.game]) });
  if (exit.value) brief.value = { field: exit.value.field, max_chars: exit.value.max_chars, offers: exit.value.offers.map(o => pick(o, state.lang)) };
  return brief;
}

function omen(content, now, lang) {
  const list = content.hexagrams.hexagrams;
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  const h = list[day % list.length];
  return { id: h.id, lines: h.lines, name: pick(h.name, lang), image: pick(h.image, lang) };
}

function tasksBrief(content, state, ctx) {
  const lang = state.lang;
  const tasks = Object.entries(state.tasks).map(([id, t]) => ({
    id, title: pick(taskOf(content, id).title, lang), kind: taskOf(content, id).kind, status: t.status,
    won: Boolean(state.wins?.[id]),
  }));
  const quests = (ctx.quests ?? []).filter(q => q.due || questDone(q, ctx.now)).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang),
    done: questDone(q, ctx.now), paid: state.quests[q.id]?.period === periodKey(q.period, ctx.now),
  }));
  return { tasks, quests };
}

/* The game's words in English — Ling's glossary for English play. Chinese
   play needs none: the words are the game's own. */
function termsEn(content) {
  const words = Object.fromEntries(Object.entries(content.terms.terms).map(([id, t]) => [id, t.en]));
  return {
    ...words,
    realms: content.realms.realms.map(r => r.name.en),
    provinces: Object.values(content.terms.provinces).map(p => p.en),
  };
}

export function look(state, content, ctx) {
  const lang = state.lang;
  state = clone(state);
  settleQi(content, state, ctx.now);
  const root = state.root && {
    ids: state.root,
    elements: state.root.map(e => pick(content.roots.elements[e], lang)),
    name: pick(content.roots.names[String(state.root.length)], lang),
    speed: speedOf(content, state),
  };
  const chapter = content.chapters[state.chapter];
  return {
    ok: true, lang, daohao: state.daohao,
    realm: { id: state.realm, stage: state.stage + 1, name: stageName(content, state.realm, state.stage, lang) },
    xw: state.xw, next: threshold(content, state), ls: state.ls,
    root, bag: state.bag,
    beasts: state.beasts.map(id => ({ id, name: pick(creatureOf(content, id).name, lang) })),
    chapter: { id: chapter.id, title: pick(chapter.title, lang) },
    scene: sceneBrief(content, state),
    ended: state.ended, branch: state.branch, story: state.story,
    omen: omen(content, ctx.now, lang),
    qi: qiBrief(content, state, ctx.now),
    made: { at: state.made?.at ?? null, scenes: Object.keys(state.made?.scenes ?? {}) },
    ...(lang === 'en' ? { terms: termsEn(content) } : {}),
    ...tasksBrief(content, state, ctx),
  };
}

/* The 丹田 as the scene draws it: what is there, the top, and — when a story
   step is out of reach — the hour it returns. */
function qiBrief(content, state, now) {
  const q = content.rewards.qi;
  const empty = state.qi < q.cost.step;
  return { now: state.qi, max: q.max, step: q.cost.step, empty, returns_at: empty ? qiReturnsAt(content, state, q.cost.step).toISOString() : null };
}

/* ── Changing it ── */

const refuse = (refused, say, extra = {}) => ({ state: null, result: { ok: false, refused, say: say ?? null, ...extra } });
const clone = state => structuredClone(state);

function meets(state, needs) {
  if (needs.bag && !(state.bag[needs.bag] > 0)) return false;
  if (needs.task && state.tasks[needs.task]?.status !== 'done') return false;
  return true;
}

/* Pay a grant: the table capped it when it was authored, the root speeds 修为,
   the day caps both — all in base 修为 — and the realm's `pay` scales what
   is finally added, so a later realm's task pays like one. */
function pay(content, state, ctx, grant) {
  rollDay(state, ctx.now);
  const table = content.rewards.tables[grant.table];
  const day = content.rewards.day;
  const want = Math.round(Math.min(grant.xw ?? 0, table.xw) * speedOf(content, state));
  const base = Math.max(0, Math.min(want, day.xw - state.day.xw));
  const xw = base * payOf(content, state);
  const ls = Math.max(0, Math.min(grant.ls ?? 0, table.ls, day.ls - state.day.ls));
  state.day.xw += base; state.day.ls += ls; state.ls += ls;
  const { levels, hold } = addXw(content, state, xw);
  if (grant.beast && !state.beasts.includes(grant.beast)) state.beasts.push(grant.beast);
  const named = levels.map(l => ({ from: stageName(content, l.from.realm, l.from.stage, state.lang), to: stageName(content, l.to.realm, l.to.stage, state.lang) }));
  return { xw, ls, beast: grant.beast ?? null, levels: named, hold, capped: base < want };
}

function judgeAnswer(content, key, answer) {
  const said = normalizeAnswer(answer);
  if (!said) return false;
  return ['zh', 'en'].some(lang => content.riddles[lang].riddles[key].a.some(a => normalizeAnswer(a) === said));
}

const hourOf = (at, lang) => at.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' });

/* An action costs 灵气 — settled by the clock first. Refused, it says when
   the 丹田 holds enough again, and the state is untouched. */
function spendQi(content, s, ctx, kind) {
  settleQi(content, s, ctx.now);
  const cost = content.rewards.qi.cost[kind] ?? 0;
  if (s.qi >= cost) { s.qi -= cost; return null; }
  const at = qiReturnsAt(content, s, cost);
  const say = s.lang === 'zh'
    ? `丹田已空，先去调息。${hourOf(at, 'zh')} 再来。`
    : `Your dantian is empty — go and rest. Come back at ${hourOf(at, 'en')}.`;
  return refuse('no-qi', say, { qi: s.qi, cost, returns_at: at.toISOString() });
}

function cleanValue(raw, rule) {
  const value = String(raw ?? '').trim();
  const length = [...value].length;
  return length >= 1 && length <= rule.max_chars ? value : null;
}

/* Entering a scene offers its tasks. */
function offerTasks(content, state) {
  const scene = sceneOf(content, state);
  for (const id of scene?.offers?.tasks ?? []) state.tasks[id] ??= { status: 'offered' };
}

/* After a chapter ends, the next one that has opened takes over. */
function advanceChapter(content, state, now) {
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return { waiting: null };
  if (next.opens && new Date(next.opens) > now) return { waiting: { chapter: next.id, opens: next.opens } };
  state.chapter = next.id; state.scene = next.first_scene;
  offerTasks(content, state);
  return { waiting: null };
}

export function resolve(state, content, ctx, args) {
  const scene = sceneOf(content, state);
  if (!scene) return refuse('no-scene', null);
  const exit = scene.exits.find(e => e.id === args.exit);
  if (!exit) return refuse('unknown-exit', null, { exits: scene.exits.map(e => e.id) });
  const s = clone(state), lang = s.lang;
  if (exit.needs && !meets(s, exit.needs)) return refuse('needs', pick(exit.refuse, lang));
  if (exit.key) {
    const riddle = content.riddles[lang].riddles[exit.key];
    if (args.answer == null) return refuse('needs-answer', riddle.q);
    if (!judgeAnswer(content, exit.key, args.answer)) return refuse('wrong-answer', null, { hint: riddle.hint });
  }
  if (exit.game && !s.wins?.[exit.game]) return refuse('game-not-won', null, { game: exit.game });
  if (exit.value) {
    const value = cleanValue(args.value, exit.value);
    if (!value) return refuse('value-invalid', null, { max_chars: exit.value.max_chars });
    s[exit.value.field] = value;
  }
  if (exit.next || exit.ends) {
    const empty = spendQi(content, s, ctx, 'step');
    if (empty) return empty;
  }
  if (exit.game) delete s.wins[exit.game];
  if (exit.take?.bag) {
    s.bag[exit.take.bag] -= 1;
    if (s.bag[exit.take.bag] <= 0) delete s.bag[exit.take.bag];
  }
  if (exit.set?.root === 'v1') s.root = [...content.roots.v1];
  const paid = exit.grant ? pay(content, s, ctx, exit.grant) : null;
  const beat = spoken(content, s, exit.beat);

  let waiting = null;
  if (inMade(s)) {
    // A made scene leads only to another made scene or back to the spine.
    if (exit.next) s.made.at = exit.next;
    if (exit.ends) s.made.at = null;
  } else {
    if (exit.next || exit.ends) s.done_scenes.push(scene.id);
    if (exit.next) { s.scene = exit.next; offerTasks(content, s); }
    if (exit.ends) { s.ended.push(exit.ends); s.scene = null; ({ waiting } = advanceChapter(content, s, ctx.now)); }
  }
  return {
    state: s,
    result: {
      ok: true, took: exit.id, beat, paid, show: exit.show ?? [], scene: sceneBrief(content, s), ended: exit.ends ?? null, waiting,
      summarize: Boolean(exit.next || exit.ends),
    },
  };
}

export function judge(state, content, ctx, args) {
  if (!content.riddles.zh.riddles[args.key]) return refuse('unknown-riddle', null);
  return { state: null, result: { ok: true, right: judgeAnswer(content, args.key, args.answer) } };
}

/* ── Tasks and quests ── */

function questDone(q, now) {
  if (!q.done_at) return false;
  const at = new Date(q.done_at);
  return at >= periodStart(q.period, now) && at <= now;
}

export function task(state, content, ctx, args) {
  if (args.action === 'list') return { state: null, result: { ok: true, ...tasksBrief(content, state, ctx) } };
  if (args.action === 'done') return taskDone(state, content, ctx, args.id);
  if (args.action === 'check') return questCheck(state, content, ctx, args.id);
  return refuse('unknown-action', null, { actions: ['list', 'done', 'check'] });
}

/* Offered, and not yet done this period. */
function taskOpen(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  if (!t || !held) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  if (!state.tasks[id]) return refuse('not-offered', null);
  if (!taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now) };
  if (t.gives?.bag) s.bag[t.gives.bag] = (s.bag[t.gives.bag] ?? 0) + 1;
  const paid = pay(content, s, ctx, t.grant);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang) } };
}

function questCheck(state, content, ctx, id) {
  const q = (ctx.quests ?? []).find(x => x.id === id);
  if (!q) return refuse('unknown-quest', null);
  const period = periodKey(q.period, ctx.now);
  if (state.quests[id]?.period === period) return refuse('already-paid', null);
  if (!questDone(q, ctx.now)) return refuse('not-done', null, { app: q.app });
  const s = clone(state);
  s.quests[id] = { period, paid_at: ctx.now.toISOString() };
  const paid = pay(content, s, ctx, { table: 'task', xw: q.reward ?? 0 });
  settleQi(content, s, ctx.now);
  const qi = addQi(content, s, q.qi ?? content.rewards.qi.refill.quest, ctx.now);
  return { state: s, result: { ok: true, quest: id, app: q.app, paid, qi } };
}

/* The page is the only witness to a board or a duel: it records the win here,
   and Resolve or Task done pays it. Never one of Ling's tools — a win Ling
   could claim would be a self-reported one. */
export function win(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const inScene = sceneOf(content, state)?.exits.some(e => e.game === id);
  if (!inScene && !taskOpen(content, state, id, ctx.now)) return refuse('not-here', null);
  const s = clone(state);
  s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  return { state: s, result: { ok: true, won: id } };
}

/* ── Branches, story, travel, language ── */

/* A small stable hash: the same day and name land on the same seed. */
function hashOf(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* The seed a 奇遇 grows from: the player's province, this kind, unused
   first; chosen by the day and the 道号, so a day reopens the same seed. A
   province with no seeds grows the tale from the template alone. */
function pickSeed(content, state, kind, now) {
  const province = content.chapters[state.chapter]?.province;
  const all = (content.seeds[province]?.seeds ?? []).filter(x => x.kind === kind);
  if (!all.length) return null;
  const used = new Set(state.seeds_used ?? []);
  const pool = all.some(x => !used.has(x.id)) ? all.filter(x => !used.has(x.id)) : all;
  const seed = pool[hashOf(`${dayKey(now)}|${state.daohao ?? ''}|${kind}`) % pool.length];
  return { id: seed.id, line: pick(seed.line, state.lang), source: pick(seed.source, state.lang), creature: seed.creature ?? null };
}

export function branch(state, content, ctx, args) {
  const s = clone(state);
  rollDay(s, ctx.now);
  if (args.action === 'open') {
    const template = content.branches.templates.find(b => b.kind === args.kind);
    if (!template) return refuse('unknown-branch', null, { kinds: content.branches.templates.map(b => b.kind) });
    if (s.branch) return refuse('branch-open', null, { open: s.branch.kind });
    if (s.day.branches >= content.branches.per_day) return refuse('branch-cap', null);
    const empty = spendQi(content, s, ctx, 'branch');
    if (empty) return empty;
    const seed = pickSeed(content, s, template.kind, ctx.now);
    s.branch = { kind: template.kind, turns: 0, opened: ctx.now.toISOString(), seed: seed?.id ?? null };
    if (seed) s.seeds_used = [...(s.seeds_used ?? []), seed.id];
    s.day.branches += 1;
    const show = seed?.creature ? [{ card: 'creature', id: seed.creature }] : [];
    return { state: s, result: { ok: true, opened: template.kind, max_turns: template.max_turns, may_not: template.may_not, seed, show } };
  }
  if (!s.branch) return refuse('no-branch', null);
  const template = content.branches.templates.find(b => b.kind === s.branch.kind);
  if (args.action === 'turn') {
    s.branch.turns += 1;
    return { state: s, result: { ok: true, turns: s.branch.turns, close_now: s.branch.turns >= template.max_turns } };
  }
  if (args.action === 'close') {
    const paid = pay(content, s, ctx, { table: template.table, xw: Number(args.xw) || 0, ls: Number(args.ls) || 0 });
    s.branch = null;
    return { state: s, result: { ok: true, closed: template.kind, paid, summarize: true } };
  }
  return refuse('unknown-action', null, { actions: ['open', 'turn', 'close'] });
}

export function summarize(state, content, ctx, args) {
  const text = String(args.text ?? '').trim();
  if (!text) return refuse('empty', null);
  const tooLong = state.lang === 'zh' ? [...text].length > STORY_CHARS : text.split(/\s+/).length > STORY_WORDS;
  if (tooLong) return refuse('too-long', null, { max_words: STORY_WORDS, max_zh_chars: STORY_CHARS });
  const s = clone(state);
  s.story = text;
  return { state: s, result: { ok: true, story: text } };
}

/* A province by its character (冀), its name (冀州) or its English (Ji). */
function provinceOf(content, raw) {
  const said = String(raw ?? '').trim().replace(/州$/, '').toLowerCase();
  return Object.keys(content.terms.provinces).find(k => k === said || content.terms.provinces[k].en.toLowerCase() === said) ?? null;
}

export function move(state, content, ctx, args) {
  const p = provinceOf(content, args.province);
  const here = content.chapters[state.chapter];
  if (p && here?.province === p) return { state: null, result: { ok: true, here: true } };
  const say = { zh: `${p ?? String(args.province ?? '').replace(/州$/, '')}州的路还没开。`, en: 'That road has not opened yet.' };
  return refuse('road-closed', pick(say, state.lang));
}

/* The player's words set the language. The result carries the scene in it,
   so one call switches and re-reads; asking for the language already in
   use changes nothing. */
export function lang(state, content, ctx, args) {
  if (!['zh', 'en'].includes(args.lang)) return refuse('unknown-lang', null, { langs: ['zh', 'en'] });
  const s = args.lang === state.lang ? state : { ...clone(state), lang: args.lang };
  const result = { ok: true, lang: s.lang, changed: s !== state, scene: sceneBrief(content, s) };
  return { state: s === state ? null : s, result };
}

/* The player's words set the language before any verb reads the state, so
   what Ling reads back is already in the language the player wrote. Ling's
   tools pass them as `said`. */
export function heed(state, said) {
  const lang = langOf(said);
  return lang && lang !== state.lang ? { ...clone(state), lang } : state;
}

/* ── Made scenes: the player's own, written by Ling from the template ── */

const strip = node => {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, strip(v)]));
};

/* No scene: the template and the rules of making. With one: check it as
   the lint checks authored content, and keep it with the player. */
export function make(state, content, ctx, args) {
  if (args.scene == null) {
    const t = content.templates.made;
    return { state: null, result: { ok: true, template: strip(t), rules: t._rules, cost: content.rewards.qi.cost.make, limits: MADE } };
  }
  let scene;
  try { scene = typeof args.scene === 'string' ? JSON.parse(args.scene) : args.scene; } catch { return refuse('not-json', null); }
  scene = strip(scene);
  const s = clone(state);
  s.made ??= { scenes: {}, at: null };
  const others = { ...s.made.scenes }; delete others[scene?.id];
  if (Object.keys(others).length >= MADE.max_scenes) return refuse('made-full', null, { max: MADE.max_scenes });
  const problems = lintMade(scene, others, content);
  if (problems.length) return refuse('not-playable', null, { problems });
  const empty = spendQi(content, s, ctx, 'make');
  if (empty) return empty;
  s.made.scenes[scene.id] = scene;
  return { state: s, result: { ok: true, made: scene.id, scenes: Object.keys(s.made.scenes) } };
}

/* Step into a made scene; the spine keeps its place for the return. */
export function enter(state, content, ctx, args) {
  const id = String(args.scene ?? '');
  if (!state.made?.scenes?.[id]) return refuse('unknown-scene', null, { scenes: Object.keys(state.made?.scenes ?? {}) });
  const s = clone(state);
  s.made.at = id;
  return { state: s, result: { ok: true, scene: sceneBrief(content, s), summarize: true } };
}

/* Back to the spine, wherever the made scene stood. */
export function leave(state, content) {
  if (!inMade(state)) return refuse('not-in-made', null);
  const s = clone(state);
  s.made.at = null;
  return { state: s, result: { ok: true, scene: sceneBrief(content, s), summarize: true } };
}

export const VERBS = { look: (s, c, x) => ({ state: null, result: look(s, c, x) }), resolve, judge, task, win, branch, summarize, move, lang, make, enter, leave };

/* ── Files and the command line ── */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dataDir = () => process.env.LINGJING_DATA || path.resolve(HERE, '../data');
const questsDir = () => process.env.LINGJING_QUESTS || path.join(os.homedir(), '.linggen', 'quests');
const clock = () => (process.env.LINGJING_NOW ? new Date(process.env.LINGJING_NOW) : new Date());

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readQuests() {
  const dir = questsDir();
  if (!fs.existsSync(dir)) return [];
  const quests = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const q of doc.quests ?? []) quests.push({ ...q, app: doc.app });
    } catch { /* an app's half-written file is skipped, never fatal */ }
  }
  return quests;
}

/* `--key=value` (what SKILL.md's templates send: an omitted arg arrives as an
   empty `--key=`, never a missing token) or `--key value` by hand. An empty
   value or a placeholder the agent left unfilled ({{x}}) is dropped. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const joined = /^--([^=]+)=([\s\S]*)$/.exec(argv[i] ?? '');
    const key = joined ? joined[1] : argv[i]?.replace(/^--/, '');
    const raw = joined ? joined[2] : argv[++i];
    if (!key || raw == null || raw === '' || /^\{\{.*\}\}$/.test(raw)) continue;
    args[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return args;
}

function run(verb, args) {
  const content = loadContent();
  const stateFile = path.join(dataDir(), 'state.json');
  const logFile = path.join(dataDir(), 'log.jsonl');
  const now = clock();
  const saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;

  if (verb === 'undo') return undo(stateFile, logFile);
  const state = verb === 'init' || !saved ? newState(content, args.lang, now) : saved;
  if (verb === 'init' || !saved) writeAtomic(stateFile, JSON.stringify(state));
  if (verb === 'init') return look(state, content, { now, quests: readQuests() });

  const fn = VERBS[verb];
  if (!fn) return { ok: false, refused: 'unknown-verb', verbs: ['init', ...Object.keys(VERBS), 'undo'] };
  const heard = heed(state, args.said);
  const out = fn(heard, content, { now, quests: readQuests() }, args);
  const next = out.state ?? (heard !== state ? heard : null);
  if (next) {
    next.updated = now.toISOString();
    writeAtomic(stateFile, JSON.stringify(next));
    fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: state }) + '\n');
  }
  return heard !== state ? { ...out.result, lang_set: heard.lang } : out.result;
}

function undo(stateFile, logFile) {
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  if (!lines.length) return { ok: false, refused: 'nothing-to-undo' };
  const last = JSON.parse(lines.pop());
  writeAtomic(stateFile, JSON.stringify(last.before));
  writeAtomic(logFile, lines.length ? lines.join('\n') + '\n' : '');
  return { ok: true, undid: last.verb, at: last.at };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    console.log(JSON.stringify(run(verb ?? 'look', parseArgs(rest))));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) }));
    process.exit(1);
  }
}
