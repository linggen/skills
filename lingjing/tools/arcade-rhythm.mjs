// arcade-rhythm.mjs — the 游戏厅's 节奏 table (worlds/jiuding/levels/rhythm.json): along each chapter's main line
// (scripts/rhythm.mjs timelineOf — the walk the rhythm lint counts), what is read and what is played, 回 by 回
// (Hanli 10-22: 「是否可以给一个视图, 按照剧情列出小游戏+斗法. 如果简单的画」 · 「让我在游戏大厅里可以看到玩家游戏的节奏」).
//
// A read is one stretch between two beats (rhythm.mjs foldStretches — the lint's own numbers), cut where a 回 turns:
// `chars` its piece in this 回, `run` the whole stretch, `over` when the stretch passes RHYTHM_CAP. A beat is named
// for the page: a board by its task's title and its games.json row (`mechanic`, `n` the row to play), a fight by
// its foe in levels/kapai.json (`key` to play it), a set piece by its TITLE, a look by the thing it must find.
// `same`: a board or fight whose variety is the previous board's or fight's — a board's mechanic, except a 塔防's, which
// is its game (守墙关 · 守山门 · 守炉 …: Hanli 10-22 「塔防有多种子类型, 换着来就好了」); every fight 斗法 —
// riddles, looks, 突破 and set pieces between them do not part them, and neither does a long read (Hanli's rule,
// games-plan-juan1.md: no kit back to back). Per 回: counts by kind, the roaming fights (kapai story:false) and
// the story fights the main line does not walk through (`side`: a fight on a `stay` exit).
//
//   node tools/arcade-rhythm.mjs           write it
//   node tools/arcade-rhythm.mjs --check   exit 1 if the file is stale (tests/arcade-rhythm.test.mjs runs it)
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { RHYTHM_CAP, foldStretches, timelineOf } from '../scripts/rhythm.mjs';
import { huiLabel, huiOf } from '../scripts/rules/hui.mjs';

export const OUT = new URL('../worlds/jiuding/levels/rhythm.json', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const LANGS = ['zh', 'en'];
const both = (fn) => Object.fromEntries(LANGS.map((l) => [l, fn(l)]));
const pick = (v, l) => (v && typeof v === 'object' ? v[l] ?? v.zh : v) ?? null;
export const FIGHT_KIND = '斗法';
const PLAY = new Set(['board', 'fight']);
const KINDS = ['board', 'fight', 'riddle', 'seen', 'breakthrough', 'piece'];

/* Everything the labels are read off, once. */
async function sources() {
  const content = loadContent();
  const reg = read('../worlds/jiuding/games.json'), kapai = read('../worlds/jiuding/levels/kapai.json');
  const pieceIds = new Set(Object.values(content.chapters).flatMap((ch) => timelineOf(ch).filter((b) => b.kind === 'piece').map((b) => b.id)));
  const pieces = Object.fromEntries(await Promise.all([...pieceIds].map(async (id) => [id, (await import(`../scripts/setpieces/${id}.js`).catch(() => null))?.TITLE ?? null])));
  return { content, reg, kapai, pieces, tasks: new Map(content.tasks.tasks.map((t) => [t.id, t])) };
}

/* What may not come twice in a row: the mechanic, or for a kit with subtypes (塔防) the game itself. */
const BY_GAME = new Set(['塔防']);
const varietyOf = (mechanic, game) => (BY_GAME.has(mechanic) && game ? `${mechanic}·${game}` : mechanic);

/* A board: its task's title, and the row that plays it (the task's own game first; a row the story replaced never). */
function boardOf(src, b) {
  const task = src.tasks.get(b.id);
  const rows = src.reg.games.map((g, n) => ({ g, n })).filter(({ g }) => g.task === b.id && !g.replaced);
  const row = rows.find(({ g }) => g.id === (task?.game ?? b.id)) ?? rows[0];
  const mechanic = row?.g.mechanic ?? task?.game ?? b.id;
  return { title: both((l) => pick(task?.title, l) ?? pick(row?.g.name, l) ?? b.id), mechanic, variety: varietyOf(mechanic, row?.g.id), ...(row ? { game: row.g.id, n: row.n } : {}) };
}
function fightOf(src, b) {
  const key = `${b.id}@${b.scene}/${b.exit}`;
  const f = src.kapai.fights.find((x) => x.key === key);
  const c = (src.content.creatures.creatures ?? src.content.creatures).find?.((x) => x.id === b.id);
  return { title: both((l) => pick(f?.name ?? c?.name, l) ?? b.id), mechanic: FIGHT_KIND, variety: FIGHT_KIND, art: f?.art ?? c?.art ?? null, ...(f ? { key } : {}) };
}
const sceneOf = (src, id) => Object.values(src.content.chapters).map((ch) => ch.scenes?.[id]).find(Boolean) ?? {};
/* Each beat's words, by kind. */
const LABEL = {
  board: boardOf,
  fight: fightOf,
  piece: (src, b) => ({ title: both((l) => pick(src.pieces[b.id], l) ?? b.id) }),
  seen: (src, b) => ({ title: both((l) => pick((sceneOf(src, b.scene).look ?? []).find((x) => x.id === b.id)?.label, l) ?? b.id) }),
  riddle: () => ({}),
  breakthrough: () => ({}),
};

/* The 回 a scene is told in (an absorbed 回 read as the one that took it, h03 → h02); a chapter with no 回 yet, the chapter. */
function huiKey(src, ch, scene) {
  const h = huiOf(src.content, ch.scenes[scene]?.hui);
  return h ? { id: h.id, label: both((l) => huiLabel(src.content, h.id, l, 'short') ?? h.id) } : { id: ch.id, label: both((l) => pick(ch.title, l)) };
}

/* One chapter's items, labelled, each read carrying its whole stretch. */
function itemsOf(src, ch) {
  const line = timelineOf(ch), runs = foldStretches(line).map((s) => s.chars);
  let k = 0;
  return line.map((it) => {
    const hui = huiKey(src, ch, it.scene);
    if (it.read) return { hui, item: { kind: 'read', scene: it.scene, chars: it.read, run: runs[k], over: runs[k] > RHYTHM_CAP } };
    k += 1;
    const { at, ...beat } = it;
    return { hui, item: { ...beat, ...LABEL[it.kind](src, it) } };
  });
}

/* Reads next to each other in one 回 are one bar. */
function merged(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.kind === 'read' && last?.kind === 'read') { last.chars += it.chars; continue; }
    out.push(it.kind === 'read' ? { kind: it.kind, chars: it.chars, run: it.run, over: it.over } : it);
  }
  return out;
}

/* A chapter cut where its 回 turns. */
function sectionsOf(src, ch) {
  const out = [];
  for (const { hui, item } of itemsOf(src, ch)) {
    if (out[out.length - 1]?.id !== hui.id) out.push({ ...hui, items: [] });
    out[out.length - 1].items.push(item);
  }
  return out.map((s) => ({ ...s, items: merged(s.items) }));
}

/* `same` on a board or fight whose variety is the last one's, over the whole book in order. */
function markSame(chapters) {
  let last = null;
  for (const it of chapters.flatMap((c) => c.huis.flatMap((h) => h.items)).filter((x) => PLAY.has(x.kind))) {
    if (it.variety === last) it.same = true;
    last = it.variety;
  }
}

function tally(src, sec, done) {
  const counts = Object.fromEntries(KINDS.map((k) => [k, sec.items.filter((x) => x.kind === k).length]));
  const fights = src.kapai.fights.filter((f) => huiOf(src.content, f.hui)?.id === sec.id);
  const walked = new Set(sec.items.map((x) => x.key).filter(Boolean));
  const first = !done.has(sec.id);
  done.add(sec.id);
  const longest = Math.max(0, ...sec.items.filter((x) => x.kind === 'read').map((x) => x.run));
  return { ...sec, counts, longest, roaming: first ? fights.filter((f) => !f.story).length : 0, side: first ? fights.filter((f) => f.story && !walked.has(f.key)).map((f) => f.key) : [] };
}

export async function table() {
  const src = await sources();
  const chapters = Object.values(src.content.chapters).sort((a, b) => a.id.localeCompare(b.id))
    .map((ch) => ({ id: ch.id, juan: ch.juan ?? null, title: both((l) => pick(ch.title, l)), huis: sectionsOf(src, ch) }));
  markSame(chapters);
  const done = new Set();
  for (const c of chapters) c.huis = c.huis.map((h) => tally(src, h, done));
  return { _about: 'Generated by tools/arcade-rhythm.mjs from scripts/rhythm.mjs timelineOf — never edit by hand. The 游戏厅\'s 节奏 view: each chapter\'s main line, 回 by 回, what is read and what is played.', cap: RHYTHM_CAP, chapters };
}

export const text = async () => `${JSON.stringify(await table(), null, 1)}\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const want = await text();
  if (process.argv.includes('--check')) { if (now !== want) { console.error('levels/rhythm.json is stale: node tools/arcade-rhythm.mjs'); process.exit(1); } }
  else { fs.writeFileSync(OUT, want); console.log(`wrote ${OUT.pathname}`); }
}
