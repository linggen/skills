// rules/inquiry.mjs — What Ling's Look carries for the player's own words:
// `about` for a 问询 (说说X / 说说X：…) and `bout` for a fight just ended.
// Part of the rules engine; called for Ling's Look alone (guide.mjs withGuides),
// so the page's own reading never carries either.
//
// Seen live, 2026-09-25: 「说说雷神」 asked away from 雷泽 — Look carried no
// lore for an absent creature, and Ling said 「没有可靠记述」, took it for the
// 马腹 standing there and sent the player to "the beast panel". And after
// `[scene] won`, with no log and no spoils in Look, she made up the last blow
// and a 灵兽印记 to collect, and Showed cards the stage already held.
import fs from 'node:fs';
import path from 'node:path';
import { battle } from '../battle.js';
import { DEFAULT_WORLD, gameOf, knownWorld, loadWorld } from '../content.mjs';
import { pick } from '../state.mjs';
import { THEN_RECAP } from './ask.mjs';
import { cardCatalog } from './cards.mjs';
import { dataDir } from './files.mjs';
import { allPlaces, creatureOf } from './world.mjs';

/* ── 问询: a subject named ── */

/* 说说X / 说说X：… / Tell me about X: … — the subject before the colon. */
const ASKED = /^(?:说说|讲讲|问问|tell me about\s+|about\s+)(.+)$/i;
const subjectOf = said => {
  const w = String(said ?? '').trim();
  if (!w || /^[[@{]/.test(w)) return null;
  const m = w.match(ASKED);
  const head = (m ? m[1] : w).split(/[：:]/)[0];
  return { asked: Boolean(m), subject: head.replace(/[「」『』"“”？?！!。.，,\s]+$/g, '').replace(/^[「『"“]+/, '').trim() };
};
const norm = s => String(s ?? '').toLowerCase().replace(/^the\s+/, '').trim();
const namesOf = x => [x?.name?.zh, x?.name?.en].filter(Boolean);

/* Every named thing of the world: creatures first, then places, then items. */
function catalog(content) {
  return [
    ...content.creatures.creatures.map(c => ({ kind: 'creature', x: c })),
    ...allPlaces(content).map(p => ({ kind: 'place', x: p })),
    ...(content.items?.items ?? []).map(i => ({ kind: 'item', x: i })),
  ];
}

/* The one thing a subject names: its whole name, else the longest name held
   in it. Anywhere in the said only a creature counts — a one-character item
   (符) turns up inside too many words. */
function named(content, subject, loose) {
  const s = norm(subject);
  if (!s) return null;
  const all = catalog(content);
  const exact = all.find(e => namesOf(e.x).some(n => norm(n) === s));
  if (exact) return exact;
  let best = null, len = 0;
  for (const e of all) {
    if (loose && e.kind !== 'creature') continue;
    for (const n of namesOf(e.x).map(norm)) {
      if ((n.length >= 2 || e.kind === 'creature') && s.includes(n) && n.length > len) { best = e; len = n.length; }
    }
  }
  return best;
}

const ABOUT = {
  creature: (content, c, lang) => {
    const haunt = allPlaces(content).find(p => p.has?.creature === c.id);
    return {
      creature: c.id, name: pick(c.name, lang), source: pick(c.source, lang) ?? null, quote: pick(c.quote, lang) ?? null,
      look: pick(c.look, lang) ?? null, root: pick(content.traits.elements[c.root], lang) ?? null,
      haunt: haunt ? pick(haunt.name, lang) : null, ...(c.elite ? { elite: true } : {}),
    };
  },
  place: (content, p, lang) => ({ place: p.id, name: pick(p.name, lang), line: pick(p.line, lang) ?? null, province: p.province ?? null }),
  item: (content, i, lang) => ({ item: i.id, name: pick(i.name, lang), kind: pick(content.dictionary?.words?.[i.kind], lang) ?? i.kind ?? null, about: pick(i.about, lang) ?? null }),
};

export const THEN_ABOUT = 'A 问询 about `about.name`: answer the part after the colon (with none, tell of it) from `about` — what the old books say of it, how it looks, where it is — in the world, in a few lines, as its heritage tells it. Change nothing, call no other tool, and do NOT call AskUser. Never say there is no record; never point at the page, a card or a panel.';
export const THEN_ABOUT_NONE = 'A 问询 about something this world\'s books do not name: answer the part after the colon (with none, tell of it) briefly, in the world — from what Look carries here, else from the 山海经 and the old books. Never say there is no record, never take it for a creature that stands here, never point at the page, a card or a panel. Change nothing, and do NOT call AskUser.';

/* ── 斗法: the finish, told from the record ──
   The page settles a fight with `duel {id, picks}`; the settle is logged
   with the save it began from (its `fight.setup`) and the picks, so the
   fight is replayed here exactly as the rules decided it. The save after it
   is the next log line's `before`, or the save in play. */
function settleOf(id) {
  const file = path.join(dataDir(), 'log.jsonl');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"verb":"duel"')) continue;
    const e = JSON.parse(lines[i]);
    if (e.args?.id !== id || !e.args.picks || !e.before?.fight?.setup) continue;
    const after = lines[i + 1] ? JSON.parse(lines[i + 1]).before : null;
    return { entry: e, after };
  }
  return null;
}

const isDuel = (content, state, id) => id.startsWith('haunt:')
  || [...Object.values(content.chapters ?? {}).flatMap(ch => Object.values(ch.scenes ?? {})), ...Object.values(state.made?.scenes ?? {})]
    .some(sc => (sc.exits ?? []).some(e => gameOf(e)?.id === id && gameOf(e).kind === 'duel'));

const LINES = {
  zh: {
    you: '你', played: { spell: (w, n) => `${w}施出「${n}」`, minion: (w, n) => `${w}唤出「${n}」` },
    power: w => `${w}以主灵根一击`, unleash: (w, n) => `${w}使出杀招「${n}」`, charge: w => `${w}蓄势，杀招将至`,
    hurt: (w, from, down) => `${w}中了${{ spell: '法术', attack: '一扑', power: '主灵根一击', sweep: '余波', return: '反噬' }[from] ?? '一击'}${down ? '，气血尽了' : ''}`,
    withdrew: n => `「${n}」退下`, gone: w => `${w}牌已用尽，转身遁走`, heal: w => `${w}缓过一口气`,
  },
  en: {
    you: 'You', played: { spell: (w, n) => `${w} cast ${n}`, minion: (w, n) => `${w} called ${n}` },
    power: w => `${w} struck with the root's own blow`, unleash: (w, n) => `${w} unleashed ${n}`, charge: w => `${w} gathered for a killing move`,
    hurt: (w, from, down) => `${w} took ${{ spell: 'a spell', attack: 'a blow', power: 'the root\'s blow', sweep: 'the backwash', return: 'its own force' }[from] ?? 'a blow'}${down ? ' and fell' : ''}`,
    withdrew: n => `${n} withdrew`, gone: w => `${w} ran out of cards and fled`, heal: w => `${w} caught a breath`,
  },
};

/* The last two or three moments of the fight, in words — never a number. */
function lastLines(content, creature, played, lang) {
  const L = LINES[lang] ?? LINES.zh, cards = cardCatalog(content);
  const who = w => (w === 'you' ? L.you : pick(creature.name, lang));
  const card = id => pick(cards[id]?.name ?? creatureOf(content, id)?.name, lang) ?? id;
  const say = {
    played: e => L.played[e.kind === 'minion' ? 'minion' : 'spell'](who(e.who), card(e.id)),
    power: e => L.power(who(e.who)),
    unleash: e => L.unleash(who(e.who), pick(creature.signature?.name, lang) ?? card(e.id)),
    charge: e => L.charge(who(e.who)),
    hurt: e => L.hurt(who(e.who), e.from, e.hp <= 0),
    withdrew: e => L.withdrew(card(e.id)),
    'foe-withdrew': () => L.gone(pick(creature.name, lang)),
    heal: e => L.heal(who(e.who)),
  };
  const told = played.log.filter(e => say[e.act]).map(e => say[e.act](e));
  return told.filter((t, i) => t !== told[i - 1]).slice(-3);
}

/* What it left: what came into the bag, and a card newly held. */
function droppedOf(content, before, after, lang) {
  if (!after) return [];
  const items = Object.entries(after.bag ?? {}).filter(([id, n]) => n > (before.bag?.[id] ?? 0))
    .map(([id]) => pick(content.items.items.find(i => i.id === id)?.name, lang) ?? id);
  const had = new Set(before.cards ?? []), cards = cardCatalog(content);
  const dealt = (after.cards ?? []).filter(id => !had.has(id) && before.cards).map(id => pick(cards[id]?.name, lang) ?? id);
  return [...items, ...dealt];
}

const REPORT = /^\[scene\]\s+(won|lost|withdrew)\s+(\S+)/;

export const THEN_BOUT = 'The fight is over: tell its finish from `bout.last` in a line or two — the blow that landed, how close it was (`bout.close`) — never a number. Name what it left (`bout.dropped`) as a find, in a line. Never Show a card `stage` already lists. ';
export const THEN_BOUT_BARE = 'The fight is over (`bout.outcome`), and no record of it is kept: tell it in one plain line — never invent the blow or what it left. ';

function boutOf(content, state, outcome, id) {
  const creatureId = id.startsWith('haunt:') ? id.slice(6) : null;
  const found = settleOf(id);
  const after = found ? found.after ?? state : null;
  const cid = found?.entry.before.fight.creature ?? creatureId;
  const creature = cid ? creatureOf(content, cid) : null;
  const lang = state.lang;
  const bare = { outcome, ...(creature ? { name: pick(creature.name, lang) } : {}) };
  // The record must be of this fight: its outcome is the one the save kept.
  if (!found || !creature || after?.duels?.[creature.id]?.outcome !== outcome) return { bout: bare, told: null };
  if (state.guided?.bout === found.entry.at) return null; // told once already
  const played = battle(String(found.entry.args.picks).split(',').map(x => x.trim()).filter(Boolean), found.entry.before.fight.setup, cardCatalog(content));
  const replayed = played.outcome === outcome; // rules changed since: say only what the save holds
  const you = played.you ?? {};
  const bout = {
    outcome, name: pick(creature.name, lang), turns: played.turn ?? null,
    ...(replayed ? { last: lastLines(content, creature, played, lang), close: outcome === 'won' && you.hpMax > 0 && you.hp * 3 <= you.hpMax } : {}),
    dropped: droppedOf(content, found.entry.before, after, lang),
  };
  return { bout, told: found.entry.at };
}

/* Ling's Look, read for the player's words. Returns the answer with `about`
   or `bout` and its `then`, and `told` — the fight handed over, kept on the
   save (guided.bout) so it is told once. Null when the words ask neither. */
export function inquire({ said, result, state }) {
  if (!result?.ok || !state) return null;
  const world = state.world && knownWorld(state.world) ? state.world : DEFAULT_WORLD;
  const content = loadWorld(world);
  const lang = state.lang ?? 'zh';
  const base = typeof result.then === 'string' ? result.then : '';
  // 前情提要 is told first, whatever else this Look carries (rules.mjs).
  const recap = base.startsWith(THEN_RECAP) ? THEN_RECAP : '';

  const report = String(said ?? '').trim().match(REPORT);
  if (report) {
    const [, outcome, id] = report;
    if (!isDuel(content, state, id)) return null;
    const got = boutOf(content, state, outcome, id);
    if (!got) return null;
    const lead = got.bout.last ? THEN_BOUT : THEN_BOUT_BARE;
    return { result: { ...result, bout: got.bout, then: recap + lead + base.slice(recap.length) }, told: got.told };
  }

  const heard = subjectOf(said);
  if (!heard) return null;
  const hit = named(content, heard.subject, !heard.asked);
  const about = hit ? ABOUT[hit.kind](content, hit.x, lang) : null;
  // A tap, the day's reading or a steer already named its tool: that stands.
  const tapped = base.slice(recap.length).startsWith('The player ');
  if (!heard.asked || tapped) return about ? { result: { ...result, about }, told: null } : null;
  return { result: { ...result, ...(about ? { about } : {}), then: recap + (about ? THEN_ABOUT : THEN_ABOUT_NONE) }, told: null };
}
