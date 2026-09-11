// Loads Lingjing's authored content and checks it. Pure reads — nothing here
// writes. `node content.mjs lint` prints every problem and exits 1 on any.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');

/* Who speaks besides the creatures. Ling is the world's voice — narration,
   never a named speaker. */
export const CAST = { yinyue: { zh: '银月', en: 'Yinyue' } };
const SPEAKERS = new Set(['ling', ...Object.keys(CAST)]);
const CARDS = new Set(['creature', 'root', 'map', 'board', 'hexagram', 'gate', 'tribulation']);
const VALUE_FIELDS = new Set(['daohao']);
const SETTABLE = { root: new Set(['v1']) };

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function loadContent(dir = CONTENT_DIR) {
  const at = file => readJson(path.join(dir, file));
  return {
    dir,
    realms: at('realms.json'),
    roots: at('roots.json'),
    rewards: at('rewards.json'),
    creatures: at('creatures.json'),
    herbs: at('herbs.json'),
    hexagrams: at('hexagrams.json'),
    riddles: { zh: at('riddles/zh.json'), en: at('riddles/en.json') },
    tasks: at('tasks/world.json'),
    branches: at('branches.json'),
    terms: at('terms.json'),
    chapters: loadChapters(path.join(dir, 'chapters')),
  };
}

function loadChapters(root) {
  const chapters = {};
  for (const name of fs.readdirSync(root).sort()) {
    const base = path.join(root, name);
    if (!fs.statSync(base).isDirectory()) continue;
    const chapter = readJson(path.join(base, 'chapter.json'));
    chapter.scenes = {};
    for (const file of fs.readdirSync(path.join(base, 'scenes')).filter(f => f.endsWith('.json')).sort()) {
      const scene = readJson(path.join(base, 'scenes', file));
      chapter.scenes[scene.id] = scene;
    }
    chapters[chapter.id] = chapter;
  }
  return chapters;
}

/* ── Lint ── */

export function lint(content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const ids = {
    creatures: new Set(content.creatures.creatures.map(c => c.id)),
    herbs: new Set(content.herbs.herbs.map(h => h.id)),
    tasks: new Set(content.tasks.tasks.map(t => t.id)),
  };
  bilingual(content, 'content', bad);
  lintRealms(content.realms, bad);
  lintCreatures(content, bad);
  lintRiddles(content.riddles, bad);
  for (const task of content.tasks.tasks) lintTask(task, content, ids, bad);
  for (const b of content.branches.templates) {
    if (!content.rewards.tables[b.table]) bad(`branch ${b.kind}`, `unknown reward table ${b.table}`);
    if (!b.may_not?.includes('spine')) bad(`branch ${b.kind}`, 'must not touch the spine');
  }
  for (const chapter of Object.values(content.chapters)) lintChapter(chapter, content, ids, bad);
  return problems;
}

/* Every {zh, en} pair carries both, non-empty, and arrays of equal length. */
function bilingual(node, where, bad) {
  if (Array.isArray(node)) { node.forEach((x, i) => bilingual(x, `${where}[${i}]`, bad)); return; }
  if (!node || typeof node !== 'object') return;
  if ('zh' in node || 'en' in node) {
    const empty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty(node.zh) || empty(node.en)) bad(where, 'needs both zh and en');
    else if (Array.isArray(node.zh) && node.zh.length !== node.en.length) bad(where, 'zh and en differ in length');
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('_') || key === 'riddles') continue;
    bilingual(value, `${where}.${key}`, bad);
  }
}

function lintRealms(realms, bad) {
  for (const r of realms.realms) {
    const n = r.thresholds.length;
    if (r.stages.zh.length !== n) bad(`realm ${r.id}`, `${r.stages.zh.length} stages but ${n} thresholds`);
  }
}

function lintCreatures(content, bad) {
  for (const c of content.creatures.creatures) {
    if (!c.art || !c.art_source) { bad(`creature ${c.id}`, 'needs art and art_source'); continue; }
    if (!fs.existsSync(path.join(content.dir, c.art))) bad(`creature ${c.id}`, `art ${c.art} is missing`);
  }
}

function lintRiddles(riddles, bad) {
  const zh = Object.keys(riddles.zh.riddles), en = Object.keys(riddles.en.riddles);
  for (const key of zh) if (!en.includes(key)) bad(`riddle ${key}`, 'has no English');
  for (const key of en) if (!zh.includes(key)) bad(`riddle ${key}`, 'has no Chinese');
  for (const [lang, file] of Object.entries(riddles)) {
    for (const [key, r] of Object.entries(file.riddles)) {
      if (!r.q || !Array.isArray(r.a) || r.a.length === 0) bad(`riddle ${key} (${lang})`, 'needs q and at least one answer');
    }
  }
}

function lintTask(task, content, ids, bad) {
  const where = `task ${task.id}`;
  lintGrant(where, task.grant, content, ids, bad);
  if (task.gives?.bag && !ids.herbs.has(task.gives.bag)) bad(where, `gives unknown item ${task.gives.bag}`);
}

function lintGrant(where, grant, content, ids, bad) {
  if (!grant) return;
  const table = content.rewards.tables[grant.table];
  if (!table) { bad(where, `unknown reward table ${grant.table}`); return; }
  for (const [key, cap] of Object.entries(table)) {
    if ((grant[key] ?? 0) > cap) bad(where, `${key} ${grant[key]} is over the ${grant.table} cap of ${cap}`);
  }
  if (grant.beast && !ids.creatures.has(grant.beast)) bad(where, `grants unknown creature ${grant.beast}`);
}

function lintChapter(chapter, content, ids, bad) {
  const where = `chapter ${chapter.id}`;
  if (!chapter.scenes[chapter.first_scene]) bad(where, `first_scene ${chapter.first_scene} does not exist`);
  for (const scene of Object.values(chapter.scenes)) lintScene(scene, chapter, content, ids, bad);
  for (const id of unreachable(chapter)) bad(`scene ${id}`, 'cannot be reached from the first scene');
  if (!endsSomewhere(chapter)) bad(where, 'no exit ends the chapter');
}

function lintScene(scene, chapter, content, ids, bad) {
  const where = `scene ${scene.id}`;
  if (scene.chapter !== chapter.id) bad(where, `says chapter ${scene.chapter}, lives in ${chapter.id}`);
  const speakers = new Set([...SPEAKERS, ...ids.creatures]);
  for (const line of scene.lines ?? []) if (!speakers.has(line.who)) bad(where, `unknown speaker ${line.who}`);
  for (const card of scene.show ?? []) lintCard(where, card, ids, bad);
  for (const t of scene.offers?.tasks ?? []) if (!ids.tasks.has(t)) bad(where, `offers unknown task ${t}`);

  const exitIds = scene.exits.map(e => e.id);
  if (new Set(exitIds).size !== exitIds.length) bad(where, 'repeats an exit id');
  for (const b of scene.buttons ?? []) {
    const exit = scene.exits.find(e => e.id === b);
    if (!exit) bad(where, `button ${b} is not an exit`);
    else if (!exit.label) bad(`${where} exit ${b}`, 'a button needs a label');
  }
  for (const exit of scene.exits) lintExit(`${where} exit ${exit.id}`, exit, chapter, content, ids, speakers, bad);
}

function lintExit(where, exit, chapter, content, ids, speakers, bad) {
  if (!exit.means || typeof exit.means !== 'string') bad(where, 'needs plain-words means');
  const ways = ['next', 'stay', 'ends'].filter(k => exit[k] != null);
  if (ways.length !== 1) bad(where, 'needs exactly one of next, stay, ends');
  if (exit.next && !chapter.scenes[exit.next]) bad(where, `next ${exit.next} does not exist`);
  if (exit.ends && exit.ends !== chapter.id) bad(where, `ends ${exit.ends}, not its own chapter`);
  for (const rule of [exit.needs, exit.take]) {
    if (rule?.bag && !ids.herbs.has(rule.bag)) bad(where, `unknown item ${rule.bag}`);
    if (rule?.task && !ids.tasks.has(rule.task)) bad(where, `unknown task ${rule.task}`);
  }
  if (exit.take && !exit.needs) bad(where, 'takes what it never checks for');
  if (exit.needs && !exit.refuse) bad(where, 'a need needs a refusal line');
  if (exit.key && !content.riddles.zh.riddles[exit.key]) bad(where, `unknown riddle ${exit.key}`);
  if (exit.value && !VALUE_FIELDS.has(exit.value.field)) bad(where, `cannot set ${exit.value.field}`);
  for (const [field, value] of Object.entries(exit.set ?? {})) {
    if (!SETTABLE[field]?.has(value)) bad(where, `cannot set ${field} to ${value}`);
  }
  for (const card of exit.show ?? []) lintCard(where, card, ids, bad);
  for (const line of exit.beat ?? []) if (!speakers.has(line.who)) bad(where, `unknown speaker ${line.who}`);
  lintGrant(where, exit.grant, content, ids, bad);
}

function lintCard(where, card, ids, bad) {
  if (!CARDS.has(card.card)) bad(where, `unknown card ${card.card}`);
  if (card.card === 'creature' && !ids.creatures.has(card.id)) bad(where, `shows unknown creature ${card.id}`);
}

function unreachable(chapter) {
  const seen = new Set();
  const walk = id => {
    if (!id || seen.has(id) || !chapter.scenes[id]) return;
    seen.add(id);
    for (const exit of chapter.scenes[id].exits) walk(exit.next);
  };
  walk(chapter.first_scene);
  return Object.keys(chapter.scenes).filter(id => !seen.has(id));
}

function endsSomewhere(chapter) {
  return Object.values(chapter.scenes).some(s => s.exits.some(e => e.ends === chapter.id));
}

/* ── CLI ── */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb] = process.argv.slice(2);
  if (verb !== 'lint') { console.error('usage: node content.mjs lint'); process.exit(2); }
  const problems = lint(loadContent());
  for (const p of problems) console.log(p);
  console.log(problems.length ? `${problems.length} problem(s)` : 'content ok');
  process.exit(problems.length ? 1 : 0);
}
