#!/usr/bin/env node
// art-packs.mjs — which pack each file of worlds/jiuding/art/ belongs to (doc/asset-pack-spec.md in the
// engine repo: the package keeps what the first chapter needs and what the whole game shares; the rest is
// fetched in the background after install, in `order`).
//
//   node tools/art-packs.mjs            a table: per pack, files and MB; then the `unplaced` list and the other heavy things
//   node tools/art-packs.mjs --json     { files: [{ path, pack, order, bytes, why }] } — `path` is skill-relative
//                                       (worlds/jiuding/art/…), which is what scripts/build-assets-manifest.mjs wants
//   node tools/art-packs.mjs --check    exit 1 when any file is `unplaced` or a file the data names is missing
//   node tools/art-packs.mjs --heavy    only the report on the other heavy things (scripts/games assets, big vendored libraries)
//   --skill <dir>                       another skill folder (default: this one)
//
// PACKS. `core` (order 0): used by 00-prologue or 00-waimen, or shared by the whole game. `ch-<chapter id>`
// (order 10 × the chapter's step after 00-waimen: 00-zhuji 10, 01-ji 20, 02-yan 30 … 09-yu 100): first needed
// in that later chapter. `unplaced` (order 900): no reference at all, or one that cannot be attributed to a
// chapter — never guessed into one; `why` says what was found. A file's pack is its EARLIEST claim.
// The safe side is always `core`: a picture left out of the package is a hole offline, a picture kept in it
// only costs megabytes, and a wrong later chapter only changes the download order.
//
// THE RULES, per kind of art (each says where in the data or code it comes from):
//
//  places/        backdrops.json `places` (the stage's painting, scripts/placeart.js placeArtOf). A scene takes the
//                 entry placeArtOf picks for it (its `at`, the zh place name's spot tokens, a 今线 scene's `scape`);
//                 every scene of every chapter is run through the real placeArtOf, day and night, and the entry it
//                 returns is claimed for that scene's chapter. A place's OWN entry is also claimed when the place is
//                 first REACHABLE (see Reach below). A spot entry (`match`) that no scene's place name selects has no
//                 claim: `unplaced`. mijing.json `tiers[].backdrop` is claimed by the chapter of the tier's `after` scene.
//  Reach          (rules/world.mjs mapOf / onMap / leaveOf / roadFrom.) A place is reachable from the first chapter
//                 whose chapter.json `map.places` holds it, or that has a scene standing at it (`at`), or whose
//                 sealed beat lists it as a room (chapter.json beats[].sealed.places); plus the places on the shortest
//                 road to a scene standing off the map (石门) and on the road of a 令 (quests `pass: {to, also}`,
//                 posted at the quest's place, so reached when that place is). A place on no map and in no scene is
//                 reachable when the whole map opens: the first chapter that declares no `map.places` (02-yan), or its
//                 province's own first chapter if later. That last step is INFERRED from mapOf returning null for a
//                 map-less chapter; 02-yan and later are still unbuilt (`coming`).
//  backdrop/      weather painting per kind, day and night (backdrops.json `kinds`; atmos.js backdropOf): the sky of
//                 the real day decides, not the chapter → core.
//  jieqi/ festival/  the 节气 (backdrops.json `terms`) and the festivals (festivals.json `backdrop`) go by the calendar
//                 date → core.
//  setpiece/      scripts/setpieces/<id>.js names its paintings (`art/setpiece/…`, plus a place or another piece's
//                 painting it borrows); a piece is claimed by the chapter whose scenes play it (`{景=<id>}` in the
//                 passage, or an exit's `setpiece`).
//  map/           world.json `atlas` (the 禹贡九州图 card, always there) → core; places `plates[].file` (the painted
//                 观, art/map/guan.webp) → the chapter the plate's places are reached.
//  memories/      memories.json: the memory's own `chapter`.
//  codex/ and the pictures a 图鉴 entry sets (codex.json `image`, `source.scan`): the entry's `first.scene` chapter,
//                 else its `first.book` 回's chapter, else core (the entry is on show as soon as it is met).
//  people/        a person (people.json): the earliest chapter that names the id (people, cast, lines, tasks, an
//                 `注=` mark in the passage), or the chapter of its codex `first`; pictures other data names
//                 (party.json members, levels/kapai.json fights `hui`, a live games.json row's faces, the
//                 companion in world.json) claim at their context: a record with `hui` / `scene` → that chapter, else shared → core. Nothing names it but the catalog → unplaced.
//  creatures/ and the root art/<id>.webp   creatures.json: `juan` above 1 → that 卷's first chapter; else `hui`
//                 (the 回 it is first met) → that chapter; a story stand-in `foe-…` → the earliest chapter naming it;
//                 else core (a beast of the roads is met in any random fight). The root files are the 原图 (`art_plate`)
//                 of the same creature, so they follow it.
//  items/         items.json: `juan` above 1 → that 卷's first chapter; else core (a thing a player can hold).
//  items-comic/   icons by item id for the 开炉 / 饭桶 and the small games (games/items-comic.js comicArt): the kailu
//                 board's art dir (tools/phone/board-kit.json) → core. `src/` is the paint source and is never loaded.
//  cards/         cards.json: core (cards are the whole game's).
//  plates/        the untouched scans the woodcuts were cut from: only creatures.json `art_source` / CREDITS.md text
//                 names them, nothing loads them → unplaced, with what names them.
//  games/         games.json rows (a live row = no `replaced`, no `cut`): a row is reached at its `scene`'s chapter,
//                 else its hui group's (hNN → the chapter that has that 回), else core (daily / main / tide / seal /
//                 ai … groups are systems, not chapters). The art a live row names (art/…, or relative to art/games/,
//                 or a path stem for a sheet + its json) is claimed at the row. The rest of a board's art dir
//                 (tools/phone/board-kit.json games.<id>.dirs / files) is the board's base art, claimed by the
//                 board's earliest live row; art named only by cut/replaced rows is unplaced. Dirs no board lists and no
//                 row names (shouqiang, shoulu, sadoushou, zhazhai) are paint sources: the runtime copies live in
//                 scripts/games/<g>/art; unplaced.
//  anything else  a string in any other world data file that resolves to an art file claims it at its context: a
//                 chapter file → that chapter; a record with `hui` / `scene` → that; otherwise core (shared data).
//  art/CREDITS.md documentation beside the art → core.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { placeArtOf } from '../scripts/placeart.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SKILL = path.resolve(HERE, '..');
export const CORE_CHAPTERS = ['00-prologue', '00-waimen'];
export const STEP = 10;
export const UNPLACED_ORDER = 900;
// Dirs whose runtime reads only direct children: items-comic/src holds the paint sources (games/items-comic.js builds `${id}.webp` only).
const FLAT_DIRS = new Set(['items-comic']);
const SHARED = -1; // a claim from shared data: core whatever the chapter
const INFINITE = Number.POSITIVE_INFINITY;

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const posix = (p) => p.split(path.sep).join('/');
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), st = fs.statSync(p); // follows links, so a linked copy of a skill reads the same
      if (st.isDirectory()) walk(p); else if (st.isFile()) out.push(posix(path.relative(dir, p)));
    }
  };
  walk(dir);
  return out.sort(byCode);
}

/* Every string value (and every key) of a JSON value, with its path of keys; `_`-prefixed keys are notes,
   never data, and are skipped. visit(value, keys, ancestors). */
function walkJson(v, visit, keys = [], anc = []) {
  if (typeof v === 'string') { visit(v, keys, anc); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walkJson(x, visit, [...keys, i], [...anc, v])); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k.startsWith('_')) continue;
      visit(k, [...keys, `<key>${k}`], [...anc, v]);
      walkJson(x, visit, [...keys, k], [...anc, v]);
    }
  }
}

/* The ids a passage names by mark: {注=id} (a 图鉴 card), {景=id} (a set piece). */
const MARKS = /[注景]=([\w-]+)/g;

export function loadWorld(skill, worldId = 'jiuding') {
  const world = path.join(skill, 'worlds', worldId);
  const w = { skill, worldId, world, art: path.join(world, 'art') };
  w.json = (rel) => { const p = path.join(world, rel); return fs.existsSync(p) ? readJson(p) : null; };
  const chaptersDir = path.join(world, 'chapters');
  w.chapters = fs.readdirSync(chaptersDir).filter((d) => fs.statSync(path.join(chaptersDir, d)).isDirectory()).sort(byCode).map((id, rank) => {
    const dir = path.join(chaptersDir, id);
    const chapter = readJson(path.join(dir, 'chapter.json'));
    const scenesDir = path.join(dir, 'scenes');
    const scenes = fs.existsSync(scenesDir)
      ? fs.readdirSync(scenesDir).filter((f) => f.endsWith('.json')).sort(byCode).map((f) => ({ ...readJson(path.join(scenesDir, f)), _chapter: id, _rank: rank }))
      : [];
    return { id, rank, chapter, scenes };
  });
  w.rankOf = new Map(w.chapters.map((c) => [c.id, c.rank]));
  w.coreMax = Math.max(...CORE_CHAPTERS.map((c) => w.rankOf.get(c)));
  w.sceneRank = new Map();
  w.huiRank = new Map();
  for (const c of w.chapters) {
    for (const s of c.scenes) {
      w.sceneRank.set(s.id, c.rank);
      if (s.hui && !(w.huiRank.get(s.hui) <= c.rank)) w.huiRank.set(s.hui, c.rank);
    }
  }
  w.juanRank = (n) => (n > 1 ? w.chapters.find((c) => (c.chapter.juan ?? 1) === n)?.rank ?? INFINITE : INFINITE);
  return w;
}

/* The earliest chapter whose files hold `id` as a string, key or mark (notes skipped) — INFINITE when none. */
function mentionIndex(w) {
  const idx = new Map(); // id -> min rank
  const note = (s, rank) => { if (!(idx.get(s) <= rank)) idx.set(s, rank); };
  for (const c of w.chapters) {
    for (const doc of [c.chapter, ...c.scenes]) {
      walkJson(doc, (s) => {
        note(s, c.rank);
        for (const m of s.matchAll(MARKS)) note(m[1], c.rank);
      });
    }
  }
  return (id) => idx.get(id) ?? INFINITE;
}

export function buildArtPacks(skill = DEFAULT_SKILL, opts = {}) {
  const w = loadWorld(skill, opts.world ?? 'jiuding');
  const artRels = listFiles(w.art);
  const artSet = new Set(artRels);
  const claims = new Map(artRels.map((r) => [r, []]));
  const missing = [];
  const notes = new Map(); // rel -> [text] — what was found about a file that could not be placed
  const note = (rel, text) => { (notes.get(rel) ?? notes.set(rel, []).get(rel)).push(text); };
  const claim = (rel, rank, why) => { if (claims.has(rel)) claims.get(rel).push({ rank, why }); };
  const claimAll = (rels, rank, why) => { for (const r of rels) claim(r, rank, why); };
  const rankName = (r) => (r === SHARED ? 'shared data' : w.chapters[r]?.id ?? '?');
  const scene = new Map(w.chapters.flatMap((c) => c.scenes.map((s) => [s.id, s])));
  const mention = mentionIndex(w);
  const j = w.json;

  /* An art string → the files it names (relative to art/), or []. `rel` bases try the string under art/games/ too. */
  function artOf(str, { games = false } = {}) {
    let s = String(str).trim();
    if (!s || /[\s<>*{}]/.test(s)) return [];
    s = s.replace(/^worlds\/[\w-]+\//, '').replace(/^\.\//, '');
    const tries = s.startsWith('art/') ? [s.slice(4)] : games && s.includes('/') ? [s, `games/${s}`] : [];
    for (const t of tries) {
      if (artSet.has(t)) return [t];
      if (!/\.\w{2,4}$/.test(t)) { const stem = [`${t}.webp`, `${t}.json`].filter((x) => artSet.has(x)); if (stem.length) return stem; }
    }
    return [];
  }

  /* ── Reach: when a place can first be stood in ─────────────────────────────────────────────────────────── */
  const placesDir = path.join(w.world, 'places');
  const places = new Map(); // id -> { id, roads, province, file }
  for (const f of fs.readdirSync(placesDir).filter((x) => x.endsWith('.json')).sort(byCode)) {
    const doc = readJson(path.join(placesDir, f));
    for (const p of doc.places ?? []) places.set(p.id, { ...p, province: doc.province, file: f });
  }
  const openProvinces = new Set(w.chapters.filter((c) => (c.chapter.juan ?? 1) <= 1 && !c.chapter.coming).map((c) => c.chapter.province));
  const neighbours = new Map();
  for (const p of places.values()) {
    for (const r of p.roads ?? []) {
      if (!places.has(r)) continue;
      (neighbours.get(p.id) ?? neighbours.set(p.id, new Set()).get(p.id)).add(r);
      (neighbours.get(r) ?? neighbours.set(r, new Set()).get(r)).add(p.id);
    }
  }
  /* The shortest road on the raw road graph (open provinces, the map ignored) from any of `from` to `to`:
     the places after the start (rules/world.mjs roadFrom). */
  function roadFrom(from, to) {
    const back = new Map([...from].map((id) => [id, null])), queue = [...from];
    while (queue.length) {
      const id = queue.shift();
      if (id === to) { const way = []; for (let at = id; back.get(at) !== null; at = back.get(at)) way.unshift(at); return way; }
      for (const n of [...(neighbours.get(id) ?? [])].sort(byCode)) {
        if (!back.has(n) && openProvinces.has(places.get(n)?.province)) { back.set(n, id); queue.push(n); }
      }
    }
    return [];
  }
  const reach = new Map(); // place id -> { rank, why }
  const reachAt = (id, rank, why) => { if (!(reach.get(id)?.rank <= rank)) reach.set(id, { rank, why }); };
  for (const c of w.chapters) for (const p of c.chapter.map?.places ?? []) reachAt(p, c.rank, `on ${c.id}'s map.places`);
  for (const c of w.chapters) for (const s of c.scenes) if (s.at) reachAt(s.at, c.rank, `scene ${s.id} of ${c.id} stands there`);
  for (const c of w.chapters) {
    walkJson(c.chapter, (_s, keys, anc) => {
      const sealed = anc.find((a) => a && typeof a === 'object' && !Array.isArray(a) && Array.isArray(a.places) && a.home && a.opens !== undefined);
      if (sealed && keys.includes('sealed')) for (const p of sealed.places) reachAt(p, c.rank, `a sealed room of ${c.id}'s beat`);
    });
    for (const b of c.chapter.beats ?? []) for (const p of b.sealed?.places ?? []) reachAt(p, c.rank, `a sealed room of ${c.id}'s beat`);
  }
  for (const c of w.chapters) { // a scene off the chapter's map: the road to it (leaveOf)
    const m = c.chapter.map?.places;
    if (!m) continue;
    const start = new Set(m);
    for (const s of c.scenes) {
      if (!s.at || start.has(s.at) || !places.has(s.at)) continue;
      for (const p of roadFrom(start, s.at)) reachAt(p, c.rank, `the road to scene ${s.id} off ${c.id}'s map`);
    }
  }
  const questsDir = path.join(w.world, 'quests');
  const quests = fs.existsSync(questsDir) ? fs.readdirSync(questsDir).filter((f) => f.endsWith('.json')).sort(byCode).flatMap((f) => (readJson(path.join(questsDir, f)).quests ?? []).map((q) => ({ ...q, _file: f }))) : [];
  for (const q of quests) { // a 令: the road to the quest's destinations, from the map holding the place it is posted at
    const at = q.from?.place;
    if (!q.pass || !at || !reach.has(at)) continue;
    const rank = reach.get(at).rank, home = w.chapters[rank].chapter.map?.places ?? [at];
    for (const to of [q.pass.to, ...(q.pass.also ?? [])]) {
      if (!places.has(to)) continue;
      reachAt(to, rank, `令 of quest ${q.id} (posted at ${at})`);
      for (const p of roadFrom(new Set(home), to)) reachAt(p, rank, `on the road of 令 ${q.id} to ${to}`);
    }
  }
  const mapless = w.chapters.find((c) => c.rank > w.coreMax && !c.chapter.map?.places);
  const provinceRank = (prov) => w.chapters.find((c) => c.chapter.province === prov)?.rank ?? INFINITE;
  for (const p of places.values()) { // on no map, in no scene: when the whole map opens (INFERRED)
    if (reach.has(p.id) || !mapless) continue;
    reachAt(p.id, Math.max(mapless.rank, provinceRank(p.province)), `inferred: on no map and in no scene; open once ${mapless.id} (no map.places) and province ${p.province} are`);
  }

  /* ── places: backdrops.json ───────────────────────────────────────────────────────────────────────────── */
  const bd = j('backdrops.json') ?? {};
  for (const [kind, e] of Object.entries(bd.kinds ?? {})) for (const f of [e.day, e.night]) claimAll(artOf(f), SHARED, `weather: ${kind} sky by day / night — the real sky decides, not the chapter (atmos.js backdropOf)`);
  for (const [term, f] of Object.entries(bd.terms ?? {})) claimAll(artOf(f), SHARED, `节气 ${term}: goes by the calendar date (atmos.js stageArt)`);
  const table = { places: bd.places ?? {} };
  const entryFiles = (e) => [e.day, e.night].filter(Boolean).flatMap((f) => artOf(f));
  const selected = new Set(); // entry ids a scene selects
  for (const c of w.chapters) {
    for (const s of c.scenes) {
      const jin = /^j\d/.test(s.hui ?? '');
      const q = { at: s.at ?? null, name: s.place?.zh ?? '', scape: jin ? s.scape ?? null : null };
      for (const day of [true, false]) {
        const pick = placeArtOf(table, q, day);
        if (!pick || selected.has(`${c.rank}:${pick.id}`)) continue;
        selected.add(`${c.rank}:${pick.id}`); selected.add(pick.id);
        claimAll(entryFiles(table.places[pick.id]), c.rank, `places: '${pick.id}' is what placeArtOf picks for scene ${s.id} (${c.id})`);
      }
    }
  }
  for (const [id, e] of Object.entries(table.places)) {
    const files = entryFiles(e);
    if (!Array.isArray(e.match) || !e.match.length) {
      const r = e.at ? reach.get(e.at) : null;
      if (r) claimAll(files, r.rank, `places: '${id}' (place ${e.at}) — ${r.why}`);
    } else if (!selected.has(id)) {
      for (const f of files) note(f, `spot painting '${id}' of place ${e.at} (match ${e.match.join('/')}): no scene's place name holds those words`);
    }
    if (e.scape && !selected.has(id)) for (const f of files) note(f, `scape painting '${id}' (${[].concat(e.scape).join('/')}): no scene has that scape`);
  }
  for (const t of j('mijing.json')?.tiers ?? []) {
    const r = scene.has(t.after) ? w.sceneRank.get(t.after) : SHARED;
    claimAll(artOf(t.backdrop), r, `秘境探险 tier ${t.id}: opens after scene ${t.after ?? '(none)'}`);
  }
  for (const f of fs.readdirSync(placesDir).filter((x) => x.endsWith('.json')).sort(byCode)) {
    const doc = readJson(path.join(placesDir, f));
    for (const [pid, pl] of Object.entries(doc.plates ?? {})) {
      if (!pl.file) continue;
      const members = (doc.places ?? []).filter((p) => p.plate === pid).map((p) => reach.get(p.id)?.rank ?? INFINITE);
      const r = Math.min(...members, INFINITE);
      claimAll(artOf(pl.file), r === INFINITE ? SHARED : r, `map plate '${pid}' (places ${f}): the 去往 list opens on it`);
    }
  }

  /* ── festivals, the world atlas, memories, codex ─────────────────────────────────────────────────────────── */
  for (const fe of j('festivals.json')?.festivals ?? []) claimAll(artOf(fe.backdrop), SHARED, `festival ${fe.id ?? ''}: goes by the calendar date`);
  const atlas = j('world.json')?.atlas ?? {};
  for (const f of [atlas.file, atlas.paint]) claimAll(artOf(f), SHARED, 'the 九州 atlas card (world.json atlas): the map is the whole game\'s');
  for (const m of j('memories.json')?.memories ?? []) claimAll(artOf(m.art), w.rankOf.get(m.chapter) ?? SHARED, `memory ${m.n}: granted in ${m.chapter ?? 'its chapter'}`);
  const codexRank = (entry) => {
    const f = entry.first ?? {};
    if (f.scene && w.sceneRank.has(f.scene)) return [w.sceneRank.get(f.scene), `first seen at scene ${f.scene}`];
    if (f.book && w.huiRank.has(f.book)) return [w.huiRank.get(f.book), `first seen in 回 ${f.book}`];
    return [SHARED, 'no `first`: shown whenever met'];
  };
  const codex = j('codex.json') ?? {};
  for (const [id, e] of Object.entries(codex.entries ?? {})) {
    const [r, why] = codexRank(e);
    for (const f of [e.image, e.source?.scan]) claimAll(artOf(f), r, `图鉴 entry ${id}: ${why}`);
  }

  /* ── setpieces: scripts/setpieces/<id>.js names the paintings; scenes name the pieces ──────────────────── */
  const pieceDir = path.join(skill, 'scripts', 'setpieces');
  const pieceRank = new Map(); // id -> min rank
  for (const c of w.chapters) {
    for (const s of c.scenes) {
      walkJson(s, (str, keys) => {
        for (const m of str.matchAll(/景=([\w-]+)/g)) pieceRank.set(m[1], Math.min(pieceRank.get(m[1]) ?? INFINITE, c.rank));
        if (keys.at(-1) === 'setpiece' || (keys.at(-1) === 'id' && keys.at(-2) === 'setpiece')) pieceRank.set(str, Math.min(pieceRank.get(str) ?? INFINITE, c.rank));
      });
    }
  }
  if (fs.existsSync(pieceDir)) {
    for (const f of fs.readdirSync(pieceDir).filter((x) => x.endsWith('.js')).sort(byCode)) {
      const id = f.replace(/\.js$/, ''), src = fs.readFileSync(path.join(pieceDir, f), 'utf8');
      const r = pieceRank.get(id);
      for (const m of src.matchAll(/['"`](art\/[A-Za-z0-9_\-./]+\.(?:webp|png|jpg|svg))['"`]/g)) {
        if (!artSet.has(m[1].slice(4))) { missing.push({ path: m[1], named: `scripts/setpieces/${f}` }); continue; }
        if (r !== undefined) claim(m[1].slice(4), r, `set piece '${id}' (scripts/setpieces/${f}) is played by a scene of ${rankName(r)}`);
        else note(m[1].slice(4), `named by scripts/setpieces/${f}, but no scene plays the piece '${id}'`);
      }
    }
  }

  /* ── games: games.json rows + the boards' art dirs (tools/phone/board-kit.json) ───────────────────────── */
  const gamesDoc = j('games.json') ?? { games: [] };
  const alive = (g) => !g.replaced && !g.cut;
  const rowRank = (g) => {
    if (g.scene && w.sceneRank.has(g.scene)) return [w.sceneRank.get(g.scene), `scene ${g.scene}`];
    if (/^h\d+$/.test(g.group ?? '') && w.huiRank.has(g.group)) return [w.huiRank.get(g.group), `hui group ${g.group}`];
    return [SHARED, `group ${g.group ?? '-'} is a system, not a chapter`];
  };
  const rowNamed = new Map(); // rel -> { alive: [{rank, why}], dead: [label] }
  gamesDoc.games.forEach((g, i) => {
    const label = `${g.id}/${g.task ?? g.group ?? i}`;
    const [rank, how] = rowRank(g);
    walkJson(g, (s) => {
      for (const rel of artOf(s, { games: true })) {
        const e = rowNamed.get(rel) ?? rowNamed.set(rel, { alive: [], dead: [], boards: new Set() }).get(rel);
        e.boards.add(g.id);
        if (alive(g)) e.alive.push({ rank, why: `games.json row ${label} (${how})` }); else e.dead.push(`${label} (${g.replaced ? `replaced: ${g.replaced}` : `cut ${g.cut}`})`);
      }
    });
  });
  for (const [rel, e] of rowNamed) {
    for (const a of e.alive) claim(rel, a.rank, a.why);
    if (!e.alive.length) note(rel, `named only by cut / replaced rows: ${[...new Set(e.dead)].slice(0, 3).join(', ')}`);
  }
  const gameRank = (id) => gamesDoc.games.filter((g) => g.id === id && alive(g)).reduce((m, g) => Math.min(m, rowRank(g)[0]), INFINITE);
  const kitPath = path.join(skill, 'tools', 'phone', 'board-kit.json');
  const kit = fs.existsSync(kitPath) ? readJson(kitPath) : { games: {} };
  const worldArt = `worlds/${w.worldId}/art/`;
  const kitFiles = (spec) => {
    const out = [];
    for (const d of [...(spec.dirs ?? []), ...(spec.files ?? [])]) {
      if (!d.startsWith(worldArt)) continue;
      const rel = d.slice(worldArt.length);
      if (artSet.has(rel)) out.push(rel); else for (const a of artRels) if (a.startsWith(`${rel}/`) && !(FLAT_DIRS.has(rel) && a.slice(rel.length + 1).includes('/'))) out.push(a);
      if (!artSet.has(rel) && !artRels.some((a) => a.startsWith(`${rel}/`))) missing.push({ path: d, named: 'tools/phone/board-kit.json' });
    }
    return out;
  };
  for (const [gid, spec] of Object.entries(kit.games ?? {})) {
    if (gid.startsWith('piece-')) continue;
    const r = gameRank(gid);
    for (const rel of kitFiles(spec)) {
      if (rowNamed.get(rel)?.boards.has(gid)) continue; // a row of this very board names it: that row decides
      if (r === INFINITE) note(rel, `board '${gid}' (board-kit.json) has no live games.json row`);
      else claim(rel, r, `board '${gid}' base art (board-kit.json); its earliest live row is at ${r === SHARED ? 'a system group (daily / main / tide …)' : rankName(r)}`);
    }
  }

  /* ── people, creatures, items, cards ─────────────────────────────────────────────────────────────────── */
  /* Who/what quests and tasks name: a quest at the place it is posted (its reach); a task at the earliest chapter
     that offers it or live row that plays it, else shared (a daily / system task). */
  const named = new Map(); // id -> min rank
  const nameAt = (s, rank) => { if (!(named.get(s) <= rank)) named.set(s, rank); };
  for (const q of quests) walkJson(q, (s) => nameAt(s, reach.get(q.from?.place)?.rank ?? SHARED));
  const taskFiles = fs.existsSync(path.join(w.world, 'tasks')) ? fs.readdirSync(path.join(w.world, 'tasks')).filter((f) => f.endsWith('.json')).sort(byCode) : [];
  for (const f of taskFiles) {
    for (const t of readJson(path.join(w.world, 'tasks', f)).tasks ?? []) {
      const rows = gamesDoc.games.filter((g) => g.task === t.id && alive(g)).map((g) => rowRank(g)[0]);
      const r = Math.min(mention(t.id), ...rows);
      walkJson(t, (s) => nameAt(s, r === INFINITE ? SHARED : r));
    }
  }
  const mention1 = mention;
  const mentionAll = (id) => Math.min(mention1(id), named.get(id) ?? INFINITE);
  const peopleDoc = j('people.json') ?? { people: [] };
  const codexFirst = (id) => { const e = codex.entries?.[id]; return e ? codexRank(e)[0] : INFINITE; };
  for (const p of peopleDoc.people) {
    const r = Math.min(mentionAll(p.id), codexFirst(p.id) === SHARED ? INFINITE : codexFirst(p.id));
    if (r === INFINITE) note(artOf(p.art)[0] ?? '', `person ${p.id}: no chapter, quest or task names the id${p.home ? ` (home ${p.home}, reached at ${reach.has(p.home) ? rankName(reach.get(p.home).rank) : 'no chapter'})` : ''}`);
    else claimAll(artOf(p.art), r, `person ${p.id}: first named in ${rankName(r)}`);
  }
  const creatures = j('creatures.json')?.creatures ?? [];
  for (const c of creatures) {
    let r, how;
    if ((c.juan ?? 1) > 1) { r = Math.min(w.juanRank(c.juan), mentionAll(c.id)); how = `juan ${c.juan}, or earlier where a chapter names it`; }
    else if (c.hui && w.huiRank.has(c.hui)) { r = w.huiRank.get(c.hui); how = `first met in 回 ${c.hui}`; }
    else if (String(c.id).startsWith('foe-')) { r = mentionAll(c.id); how = 'a story stand-in, named by'; if (r === INFINITE) { note(artOf(c.art)[0] ?? '', `stand-in ${c.id}: no chapter names it`); continue; } }
    else { r = SHARED; how = 'a beast of the roads, met in any random fight'; }
    for (const f of [c.art, c.art_plate]) claimAll(artOf(f), r === INFINITE ? SHARED : r, `creature ${c.id}: ${how}`);
  }
  for (const it of j('items.json')?.items ?? []) {
    const r = (it.juan ?? 1) > 1 ? Math.min(w.juanRank(it.juan), mentionAll(it.id)) : SHARED;
    claimAll(artOf(it.art), r === INFINITE ? SHARED : r, `item ${it.id}: ${(it.juan ?? 1) > 1 ? `juan ${it.juan}` : 'a thing a player can hold'}`);
  }
  for (const c of j('cards.json')?.cards ?? []) claimAll(artOf(c.art), SHARED, `card ${c.id}: the whole game's`);

  /* ── everything else in the world data: a string that names an art file claims it at its context ───────── */
  const catalogs = new Set(['items.json', 'people.json', 'creatures.json', 'cards.json', 'backdrops.json', 'festivals.json', 'games.json', 'memories.json', 'mijing.json', 'codex.json']);
  const dataFiles = listFiles(w.world).filter((f) => f.endsWith('.json') && !f.startsWith('art/'));
  for (const f of dataFiles) {
    if (catalogs.has(f)) continue;
    const doc = readJson(path.join(w.world, f));
    const chapterId = f.startsWith('chapters/') ? f.split('/')[1] : null;
    walkJson(doc, (s, keys, anc) => {
      const isArtRef = /^(?:worlds\/[\w-]+\/)?art\//.test(s) && /\.\w{2,4}$/.test(s) && !/[\s<>*]/.test(s);
      if (isArtRef && !artOf(s).length) { missing.push({ path: s, named: `worlds/${w.worldId}/${f}` }); return; }
      const files = artOf(s);
      if (!files.length) return;
      let rank = SHARED, why = `${f}: shared data`;
      if (chapterId) { rank = w.rankOf.get(chapterId); why = `${f}`; }
      else {
        for (const a of [...anc].reverse()) {
          if (a && typeof a === 'object' && !Array.isArray(a)) {
            if (a.hui && w.huiRank.has(a.hui)) { rank = w.huiRank.get(a.hui); why = `${f} (record of hui ${a.hui})`; break; }
            if (a.scene && w.sceneRank.has(a.scene)) { rank = w.sceneRank.get(a.scene); why = `${f} (record of scene ${a.scene})`; break; }
          }
        }
      }
      claimAll(files, rank, `${why}: ${keys.filter((k) => typeof k === 'string').slice(-2).join('.')}`);
    });
  }
  // names the catalogs hold that point at a file that is not there
  for (const f of catalogs) {
    const doc = j(f);
    if (!doc) continue;
    walkJson(doc, (s) => {
      if (/^(?:worlds\/[\w-]+\/)?art\//.test(s) && /\.(?:webp|png|jpg|jpeg|svg)$/.test(s) && !/[\s<>*]/.test(s) && !artOf(s).length) missing.push({ path: s, named: `worlds/${w.worldId}/${f}` });
    });
  }
  // levels/*.json name a few pictures from the game's own folder (../zhazhai/art/…): scripts/games/<game>/…
  for (const f of dataFiles.filter((x) => x.startsWith('levels/'))) {
    walkJson(readJson(path.join(w.world, f)), (s) => {
      if (!s.startsWith('../') || !/\.(?:webp|png|jpg|svg)$/.test(s)) return;
      const base = path.join(skill, 'scripts', 'games', path.basename(f, '.json'));
      if (!fs.existsSync(path.resolve(base, s))) missing.push({ path: s, named: `worlds/${w.worldId}/${f}` });
    });
  }
  // the page's own literal pictures (top-level scripts/*.js, not a dev page)
  for (const f of fs.readdirSync(path.join(skill, 'scripts')).filter((x) => x.endsWith('.js')).sort(byCode)) {
    const src = fs.readFileSync(path.join(skill, 'scripts', f), 'utf8');
    for (const m of src.matchAll(/['"`](art\/[A-Za-z0-9_\-./]+\.(?:webp|png|jpg|svg))['"`]/g)) {
      if (/^(fx-alive|fighter-preview)/.test(f)) continue;
      if (artSet.has(m[1].slice(4))) claim(m[1].slice(4), SHARED, `scripts/${f} names it (the page's own code)`);
      else if (!/<|\$\{/.test(m[1])) missing.push({ path: m[1], named: `scripts/${f}` });
    }
  }
  claim('CREDITS.md', SHARED, 'documentation beside the art; never loaded');

  /* ── what names an unplaced file, in the data (for the report) ─────────────────────────────────────────── */
  const corpus = [];
  for (const f of dataFiles) {
    const doc = readJson(path.join(w.world, f));
    const visit = (v, k) => {
      if (typeof v === 'string') { if (v.includes('art/')) corpus.push([`${f} ${k}`, v]); }
      else if (Array.isArray(v)) v.forEach((x) => visit(x, k));
      else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) visit(x, kk);
    };
    visit(doc, '');
  }
  const codeText = [];
  const scan = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') scan(p); } else if (/\.(?:js|mjs|html|css)$/.test(e.name) && !/\.min\.mjs$/.test(e.name)) codeText.push([posix(path.relative(skill, p)), fs.readFileSync(p, 'utf8')]); } };
  scan(path.join(skill, 'scripts'));
  const mentionsOf = (rel) => [...corpus.filter(([, t]) => t.includes(`art/${rel}`)).map(([f]) => f), ...codeText.filter(([, t]) => t.includes(rel.replace(/^games\//, ''))).map(([f]) => f)];

  /* ── the answer ─────────────────────────────────────────────────────────────────────────────────────── */
  const packName = (rank) => (rank === INFINITE ? 'unplaced' : rank <= w.coreMax ? 'core' : `ch-${w.chapters[rank].id}`);
  const files = artRels.map((rel) => {
    const list = claims.get(rel);
    const eff = (c) => (c.rank <= w.coreMax ? 0 : c.rank); // every claim inside the package is the same pack; the first one told stays the reason
    const best = list.reduce((b, c) => (b === null || eff(c) < eff(b) ? c : b), null);
    const rank = best ? (best.rank === SHARED ? -1 : best.rank) : INFINITE;
    const pack = packName(rank);
    let why;
    if (best) why = best.why;
    else {
      const found = [...(notes.get(rel) ?? []), ...mentionsOf(rel).map((f) => `text of ${f}`).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3)];
      why = found.length ? `no run-time reference; found: ${found.join('; ')}` : 'no reference at all';
    }
    return {
      path: `worlds/${w.worldId}/art/${rel}`, pack,
      order: pack === 'core' ? 0 : pack === 'unplaced' ? UNPLACED_ORDER : (rank - w.coreMax) * STEP,
      bytes: fs.statSync(path.join(w.art, rel)).size, why,
    };
  });
  const uniqMissing = [...new Map(missing.map((m) => [`${m.path}|${m.named}`, m])).values()].sort((a, b) => byCode(a.path, b.path));
  return { files, missing: uniqMissing, world: w };
}

/* ── the other heavy things (reported, never moved) ──────────────────────────────────────────────────────── */
export function heavyReport(skill = DEFAULT_SKILL) {
  const size = (p) => { const st = fs.statSync(p); if (!st.isDirectory()) return st.size; return fs.readdirSync(p).reduce((n, e) => n + size(path.join(p, e)), 0); };
  const out = { games: [], vendor: [], big: [] };
  const gdir = path.join(skill, 'scripts', 'games');
  for (const e of fs.readdirSync(gdir, { withFileTypes: true }).sort((a, b) => byCode(a.name, b.name))) {
    if (!e.isDirectory()) continue;
    const dir = path.join(gdir, e.name);
    const parts = {};
    for (const s of fs.readdirSync(dir, { withFileTypes: true })) parts[s.name] = size(path.join(dir, s.name));
    const total = size(dir), art = parts.art ?? 0;
    if (total >= 256 * 1024) out.games.push({ game: e.name, bytes: total, art, other: Object.entries(parts).filter(([k, v]) => k !== 'art' && v >= 128 * 1024).map(([k, v]) => `${k} ${(v / 1048576).toFixed(1)} MB`) });
  }
  out.games.sort((a, b) => b.bytes - a.bytes);
  const vdir = path.join(skill, 'scripts', 'vendor');
  if (fs.existsSync(vdir)) for (const e of fs.readdirSync(vdir, { withFileTypes: true }).sort((a, b) => byCode(a.name, b.name))) out.vendor.push({ name: e.name, bytes: size(path.join(vdir, e.name)) });
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (fs.statSync(p).size > 5 * 1048576 && !p.includes(`${path.sep}art${path.sep}`)) out.big.push({ path: posix(path.relative(skill, p)), bytes: fs.statSync(p).size }); } };
  walk(skill);
  out.big.sort((a, b) => byCode(a.path, b.path));
  return out;
}

const mb = (n) => (n / 1048576).toFixed(1);

export function renderTable({ files, missing }, heavy) {
  const by = new Map();
  for (const f of files) { const e = by.get(f.pack) ?? by.set(f.pack, { order: f.order, n: 0, bytes: 0 }).get(f.pack); e.n++; e.bytes += f.bytes; }
  const rows = [...by.entries()].sort((a, b) => a[1].order - b[1].order);
  const lines = ['pack                files      MB   order'];
  for (const [p, e] of rows) lines.push(`${p.padEnd(18)} ${String(e.n).padStart(6)} ${mb(e.bytes).padStart(7)} ${String(e.order).padStart(7)}`);
  lines.push(`${'total'.padEnd(18)} ${String(files.length).padStart(6)} ${mb(files.reduce((n, f) => n + f.bytes, 0)).padStart(7)}`);
  const un = files.filter((f) => f.pack === 'unplaced').sort((a, b) => b.bytes - a.bytes || byCode(a.path, b.path));
  if (un.length) {
    lines.push('', `unplaced (${un.length} files, ${mb(un.reduce((n, f) => n + f.bytes, 0))} MB) — not guessed into a chapter; a play test decides:`);
    for (const f of un) lines.push(`  ${(f.bytes / 1024).toFixed(0).padStart(6)} KB  ${f.path.replace(/^worlds\/[\w-]+\/art\//, '')}  — ${f.why.length > 150 ? `${f.why.slice(0, 147)}...` : f.why}`);
  }
  if (missing.length) {
    lines.push('', `named in the data / code but missing on disk (${missing.length}):`);
    for (const m of missing) lines.push(`  ${m.path}  (${m.named})`);
  }
  if (heavy) lines.push('', ...renderHeavy(heavy));
  return lines.join('\n');
}

export function renderHeavy(h) {
  const lines = ['other heavy things (reported, not moved):', '  scripts/games/ by small game (the game kit\'s own assets, beside its code):'];
  for (const g of h.games) lines.push(`    ${g.game.padEnd(12)} ${mb(g.bytes).padStart(5)} MB  (art ${mb(g.art)} MB${g.other.length ? `; ${g.other.join(', ')}` : ''})`);
  lines.push('  scripts/vendor/ by entry:');
  for (const v of h.vendor.filter((x) => x.bytes >= 128 * 1024).sort((a, b) => b.bytes - a.bytes)) lines.push(`    ${v.name.padEnd(28)} ${mb(v.bytes).padStart(5)} MB`);
  lines.push('  single files over 5 MB under the skill (art excluded):');
  for (const b of h.big) lines.push(`    ${b.path}  ${mb(b.bytes)} MB`);
  return lines;
}

function main(argv) {
  const flag = (n) => argv.includes(n);
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const skill = val('--skill') ? path.resolve(val('--skill')) : DEFAULT_SKILL;
  if (flag('--heavy')) { process.stdout.write(`${renderHeavy(heavyReport(skill)).join('\n')}\n`); return 0; }
  const res = buildArtPacks(skill);
  if (flag('--json')) {
    process.stdout.write(`${JSON.stringify({ files: res.files }, null, 2)}\n`);
  } else if (!flag('--check')) {
    process.stdout.write(`${renderTable(res, heavyReport(skill))}\n`);
  }
  const unplaced = res.files.filter((f) => f.pack === 'unplaced');
  if (flag('--check')) {
    for (const f of unplaced) process.stderr.write(`unplaced: ${f.path} — ${f.why}\n`);
    for (const m of res.missing) process.stderr.write(`missing: ${m.path} (named by ${m.named})\n`);
    process.stderr.write(`${unplaced.length} unplaced, ${res.missing.length} missing\n`);
    return unplaced.length || res.missing.length ? 1 : 0;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2)); // not process.exit(): a piped stdout would be cut at 64 KB
