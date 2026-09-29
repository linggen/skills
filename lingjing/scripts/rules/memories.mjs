// rules/memories.mjs — 银月的记忆是彩色的 (哇时刻 ③, Hanli 2026-09-29).
// Part of the rules engine; rules.mjs is its one door.
//
// Everything in the game is ink; only her memories are in colour. 一鼎一尾一段
// 记忆: eight 鼎 → eight tails → eight memories, and the finale is the ninth,
// which turns the whole ink world to colour (`state.colour`). The data is
// worlds/<id>/memories.json; the art is art/memories/, the one colour set.
//
// THE RULES. A memory comes only from the 鼎 — a chapter's key beat: the
// spine exit that brings a 鼎 home declares `memory: n` (grantMemory, from
// core.mjs resolve). Nothing else grants one: no verb, no grant table, no
// made scene. A fragment (a place's `fragment`, ink with ONE coloured thing)
// comes from exploring: found where the player stops (findFragment, from
// travel.mjs move). Look tells Ling which memories are unlocked — their
// title and what she may refer to — and never a word of one still locked.
//
// State: `memories` [n…] ascending; `memory_last` {n, at} (the page plays it
// once, when it sees a new `at`); `fragments` [id…]; `colour` true after the
// finale.
import fs from 'node:fs';
import path from 'node:path';
import { pick } from '../state.mjs';

const cache = new Map();
/* memories.json of a world, or null — read once per folder. */
export function memoriesOf(content) {
  const dir = content?.dir;
  if (!dir) return null;
  if (!cache.has(dir)) {
    const file = path.join(dir, 'memories.json');
    cache.set(dir, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return cache.get(dir);
}
const entryOf = (content, n) => memoriesOf(content)?.memories?.find(m => m.n === n) ?? null;
const haveOf = state => (Array.isArray(state?.memories) ? state.memories.filter(n => Number.isInteger(n)) : []);

/* An exit's memory, kept on the save — once. Only a spine exit reaches here
   (core.mjs skips made scenes); `memory` names an entry of memories.json.
   Returns what the page and Ling are told, or null. */
export function grantMemory(content, s, exit, now) {
  const n = exit?.memory;
  const m = Number.isInteger(n) ? entryOf(content, n) : null;
  if (!m || haveOf(s).includes(n)) return null;
  s.memories = [...haveOf(s), n].sort((a, b) => a - b);
  s.memory_last = { n, at: now.toISOString() };
  if (m.colour) s.colour = true;
  return { n, tail: m.tail, title: pick(m.title, s.lang), say: pick(m.say, s.lang), ...(m.colour ? { colour: true } : {}) };
}

/* A fragment where the player stops: kept once. Returns it, or null. */
export function findFragment(content, s, place) {
  const f = place?.fragment;
  if (!f?.id || (s.fragments ?? []).includes(f.id)) return null;
  s.fragments = [...(s.fragments ?? []), f.id];
  const doc = memoriesOf(content);
  return { id: f.id, thing: pick(f.thing, s.lang), line: pick(doc?.found_line, s.lang) };
}

/* What Look carries: the unlocked memories (title, tail, what she knows), how
   many frames there are, fragments found, the colour flag, and the last one
   come back (the page plays it once). Null before anything is unlocked. */
export function memoriesLook(content, state) {
  const doc = memoriesOf(content), have = haveOf(state), frags = (state.fragments ?? []).length;
  if (!doc || (!have.length && !frags && !state.colour)) return null;
  const lang = state.lang;
  return {
    of: doc.frames,
    have: have.map(n => entryOf(content, n)).filter(Boolean).map(m => ({ n: m.n, tail: m.tail, title: pick(m.title, lang), knows: pick(m.knows, lang) })),
    ...(frags ? { fragments: frags } : {}),
    ...(state.colour ? { colour: true } : {}),
    ...(state.memory_last ? { last: state.memory_last } : {}),
  };
}

/* The album in 录 — 「银月的记忆」: eight frames, lit one by one. A lit frame
   carries its panels and her lines (to replay); a dark one only its tail.
   The finale is not a frame: `finale` says whether it has come. */
export function albumOf(content, state) {
  const doc = memoriesOf(content);
  if (!doc) return null;
  const lang = state.lang, have = new Set(haveOf(state));
  const frames = doc.memories.filter(m => !m.finale).slice(0, doc.frames).map(m => (have.has(m.n)
    ? { n: m.n, tail: m.tail, lit: true, title: pick(m.title, lang), panels: m.panels.map(p => ({ art: p.art, lines: pick(p.lines, lang) ?? [] })) }
    : { n: m.n, tail: m.tail, lit: false }));
  const found = new Set(state.fragments ?? []);
  const fragments = Object.values(content.places ?? {}).flatMap(d => d.places).filter(p => p.fragment && found.has(p.fragment.id))
    .map(p => ({ id: p.fragment.id, art: p.fragment.art, thing: pick(p.fragment.thing, lang), line: pick(doc.found_line, lang) }));
  const fin = doc.memories.find(m => m.finale);
  return { frames, fragments, finale: Boolean(fin && have.has(fin.n)), colour: Boolean(state.colour) };
}

/* A memory to play on the stage — its panels and lines — only once unlocked. */
export function playOf(content, state, n) {
  const m = entryOf(content, n);
  if (!m || !haveOf(state).includes(n)) return null;
  return { n, tail: m.tail, title: pick(m.title, state.lang), panels: m.panels.map(p => ({ art: p.art, lines: pick(p.lines, state.lang) ?? [] })) };
}

/* ── Lint ──
   memories.json in shape; each memory granted by at most one exit, in its
   own chapter, and only by a spine exit; a memory an exit grants has 1–3
   panels on disk under art/memories/ with her lines in both languages; the
   finale alone carries `colour`. Fragments: an id once, art under
   art/memories/fragments/ on disk, the thing in both languages. And the
   colour set stays shut: no other part of the world points into art/memories/. */
const MEM_ART = /^art\/memories\/[\w-]+\.webp$/;
const FRAG_ART = /^art\/memories\/fragments\/[\w-]+\.webp$/;
const pair = v => Boolean(v?.zh && v?.en);
export function lintMemories(content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const doc = memoriesOf(content);
  if (!doc) return problems;
  if (!Number.isInteger(doc.frames) || doc.frames < 1) bad('memories', 'frames is a whole number');
  if (!pair(doc.found_line)) bad('memories', 'found_line needs zh and en');
  const ns = doc.memories.map(m => m.n);
  if (ns.some((n, i) => n !== i + 1)) bad('memories', 'numbered 1, 2, 3 … in order');
  if (doc.memories.filter(m => m.finale).length !== 1 || !doc.memories.at(-1)?.finale) bad('memories', 'one finale, the last');
  if (doc.memories.filter(m => !m.finale).length !== doc.frames) bad('memories', `${doc.frames} frames, one memory each`);
  // Where every exit that grants a memory stands.
  const granted = {};
  for (const ch of Object.values(content.chapters ?? {})) for (const sc of Object.values(ch.scenes ?? {})) for (const e of sc.exits ?? []) {
    if (e.memory == null) continue;
    const where = `scene ${sc.id} exit ${e.id}`;
    if (!ns.includes(e.memory)) { bad(where, `memory ${e.memory} is not in memories.json`); continue; }
    (granted[e.memory] ??= []).push({ where, chapter: ch.id });
  }
  for (const m of doc.memories) {
    const at = `memory ${m.n}`;
    for (const k of ['title', 'say', 'knows']) if (!pair(m[k])) bad(at, `${k} needs zh and en`);
    if (!content.chapters?.[m.chapter]) bad(at, `chapter ${m.chapter} does not exist`);
    if (!Number.isInteger(m.tail) || m.tail < 2 || m.tail > 9) bad(at, 'tail is 2–9');
    if (m.colour && !m.finale) bad(at, 'only the finale turns the world to colour');
    if (!Array.isArray(m.panels) || m.panels.length > 3) bad(at, 'at most three panels');
    for (const p of m.panels ?? []) {
      if (!MEM_ART.test(p.art ?? '')) bad(at, `art ${p.art} must be art/memories/<id>.webp`);
      else if (!fs.existsSync(path.join(content.dir, p.art))) bad(at, `art ${p.art} is not on disk`);
      if (!Array.isArray(p.lines?.zh) || !Array.isArray(p.lines?.en) || !p.lines.zh.length || p.lines.zh.length > 3) bad(at, 'each panel has one to three of her lines, zh and en');
    }
    const by = granted[m.n] ?? [];
    if (by.length > 1) bad(at, `granted by ${by.length} exits — one 鼎, one memory`);
    for (const g of by) {
      if (g.chapter !== m.chapter) bad(g.where, `grants memory ${m.n}, which belongs to ${m.chapter}`);
      if (!(m.panels ?? []).length) bad(g.where, `grants memory ${m.n}, which has no panels yet`);
    }
  }
  const seen = new Set();
  for (const d of Object.values(content.places ?? {})) for (const p of d.places ?? []) {
    const f = p.fragment;
    if (!f) continue;
    const at = `place ${p.id} fragment`;
    if (!/^[a-z0-9-]+$/.test(f.id ?? '')) bad(at, 'needs a lowercase id');
    if (seen.has(f.id)) bad(at, `id ${f.id} twice`);
    seen.add(f.id);
    if (!FRAG_ART.test(f.art ?? '')) bad(at, 'art must be art/memories/fragments/<id>.webp');
    else if (!fs.existsSync(path.join(content.dir, f.art))) bad(at, `art ${f.art} is not on disk`);
    if (!pair(f.thing)) bad(at, 'thing needs zh and en');
    if (f.memory != null && !ns.includes(f.memory)) bad(at, `hints at unknown memory ${f.memory}`);
  }
  // The colour set is hers alone: nothing else in the world points into it.
  const { dir, chapters, places, ...rest } = content;
  const elsewhere = JSON.stringify([rest, chapters]);
  if (/art\/memories\//.test(elsewhere)) bad('content', 'only memories.json and a place\'s fragment may point into art/memories/');
  for (const d of Object.values(places ?? {})) for (const p of d.places ?? []) {
    const { fragment, ...own } = p;
    if (/art\/memories\//.test(JSON.stringify(own))) bad(`place ${p.id}`, 'points into art/memories/ outside its fragment');
  }
  return problems;
}
