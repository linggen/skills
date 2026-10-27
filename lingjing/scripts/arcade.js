// arcade.js — 游戏厅: every small game in the registry (worlds/jiuding/games.json), tap to play.
// Hanli's test page, never a player's: the page draws nothing without ?dev=1, and nothing in the
// game links to it. Each game plays alone through its mount() contract (games/mount.js) — no save,
// no seeding, no pay; the result is shown, and 再来 deals a fresh one. A game the model plays (画猜,
// `meta.ai`) is tried on the REAL game page instead (arcade-board.js, Hanli 10-19): its own test save,
// its board on the stage, the real chat beside it — the same UI and logic as in the story. So is a game the
// rules stand on the stage themselves (a row's `stage`: 二十问, 讨价还价, 断案, 对对子, the 秘境 rerun —
// Hanli 10-21: the 游戏厅 holds every playable thing), on a save seeded where its card stands (tools/arcade-saves.mjs).
// A board the story cut (`replaced: 'cut'`) is listed under 旧版 with why, and opens nothing.
import { esc } from './esc.js';
import { forInput } from './games/kit/device.js';
import { mountPure } from './games/mount.js';
import { playAlone, restartOf, timedOf, tallOf } from './games/shell.js';
import { arcadePlayUrl, arcadeStageUrl, visitDays } from './arcade-board.js';
import { devPrefetch } from './games/prefetch-ling.js';

const q = new URLSearchParams(location.search);
export const devOnly = (params) => params.get('dev') === '1';
const lang = () => (q.get('lang') === 'en' ? 'en' : 'zh');
const root = document.getElementById('arcade');
const W = {
  zh: { title: '游戏厅', note: '测试用 · 不存档、不结算', all: '全部', back: '← 游戏厅', again: '再来', won: '成', grade: '评', left: '离开', lang: 'En', loading: '……', missing: '这个游戏没找到', home: '返回游戏', old: '旧版 · 已删或已被新游戏替换', levels: '关卡', cut: '已删', stage: '在游戏页试玩', pick: '换一个', pickNote: '挑一个对手 · 手牌与同行照剧情此时', rhythm: '节奏', stats: '游戏记录', numbers: '数值', rhythmNote: '沿主线：读了多少字、玩了什么 · 条越长读得越久，红的超过 {cap} 字', same: (k) => `连着两个${k}`, longest: '最长', roaming: '游荡斗法', side: '支线斗法', chars: '字' },
  en: { title: 'Arcade', note: 'Testing only · nothing saved, nothing paid', all: 'All', back: '← Arcade', again: 'Again', won: 'Won', grade: 'grade', left: 'Left', lang: '中', loading: '…', missing: 'No such game', home: 'Back to game', old: 'Old versions · cut or replaced', levels: 'Levels', cut: 'Cut', stage: 'Tried on the game page', pick: 'Pick another', pickNote: 'Pick a foe · your hand and party as the story has them there', rhythm: 'Rhythm', stats: 'Play log', numbers: 'Numbers', rhythmNote: 'Along the main line: what is read, what is played · a longer bar is a longer read; red is over {cap} characters', same: (k) => `Two ${k} in a row`, longest: 'longest', roaming: 'roaming fights', side: 'side fights', chars: 'chars' },
};
const w = () => W[lang()];
// A row's `mechanic` (games.json) is its type, in Chinese — what kind of game a tile is before it opens
// (Hanli, 10-19: 「能在游戏大厅标一下游戏类型吗, 是割绳子还是投掷等」). The English words live here.
const KIND_EN = {
  割绳子: 'Cut the rope', 投掷: 'Throw', 狩猎瞄准: 'Hunt & aim', 打地鼠: 'Whack-a-mole', 节奏: 'Rhythm', 开炉: 'Gacha',
  调息: 'Breath', 解谜: 'Puzzle', 棋牌: 'Board & table', 判断: 'Read & pick', 剧情: 'Story', 你画我猜: 'Draw & guess',
  塔防: 'Tower defense', 结印: 'Hand seals', 配对: 'Match pairs', 对话: 'Talk', 探索: 'Explore', 斗法: 'Card duel', 格斗: 'Fighting',
};
const kindOf = (g) => (lang() === 'en' ? KIND_EN[g.mechanic] ?? g.mechanic : g.mechanic) ?? '';

const mods = new Map();
async function modOf(id) {
  if (!/^[a-z]+$/.test(id)) return null;
  if (!mods.has(id)) mods.set(id, import(`./games/${id}.js`).catch(() => null));
  return mods.get(id);
}
const mountOf = (mod) => mod?.mount ?? (mod?.html ? mountPure(mod) : null);
const nameOf = (mod, id) => mod?.meta?.name?.[lang()] ?? mod?.meta?.name?.zh ?? id;
// A kit's rows (气走经脉, one level a row) carry their own `name`; else the module's.
const titleOf = (g, mod) => g?.name?.[lang()] ?? g?.name?.zh ?? nameOf(mod, g?.id);
// a row's own how-to first (a story level that plays its kit another way: 雪夜柴垛 has no talismans and no 银月), else the module's
const howOf = (mod, row) => forInput(row?.how?.[lang()] ?? row?.how?.zh ?? mod?.meta?.how?.[lang()] ?? mod?.meta?.how?.zh ?? '');
// Opened from the game (dev-arcade.js, the builder's chip): every page keeps `from=game` and shows the way back.
// A scratch save (`save=`) rides along so the way back lands on that save, not the player's own.
const fromGame = q.get('from') === 'game';
const save = /^[\w-]+$/.test(q.get('save') ?? '') ? q.get('save') : null;
// The 节奏 view keeps its place across the language switch; nothing else carries `view` (a game opened from it is a game).
const view = q.get('view') === 'rhythm' ? 'rhythm' : null;
const kept = (en = lang() === 'en') => ({ dev: '1', ...(en ? { lang: 'en' } : {}), ...(fromGame ? { from: 'game' } : {}), ...(save ? { save } : {}) });
const langHref = () => `?${new URLSearchParams({ ...kept(lang() !== 'en'), ...(view ? { view } : {}) })}`;
const href = (extra = {}) => `?${new URLSearchParams({ ...kept(), ...extra })}`;
const home = () => (fromGame ? `<a class="arcade-home" href="index.html${save ? `?save=${save}` : ''}">${esc(w().home)}</a>` : '');

async function registry() {
  const r = await fetch('../worlds/jiuding/games.json').catch(() => null);
  return r?.ok ? r.json() : { groups: [], games: [] };
}

/* A stage row's address: its save, and — a game a visiting shop holds — the clock moved on to the shop's day. */
async function stageUrl(stage) {
  const [prov, id] = String(stage.visitor ?? '').split('/');
  if (!id || !/^[a-z]+$/.test(prov)) return arcadeStageUrl(stage);
  const r = await fetch(`../worlds/jiuding/places/${prov}.json`).catch(() => null);
  const place = (r?.ok ? (await r.json()).places ?? [] : []).find((p) => p.id === id);
  return arcadeStageUrl(stage, visitDays(place?.has?.visitor?.visits));
}

/* A board the story cut: its name and why, nothing to open (its module is gone). */
function cutTile(g) {
  const why = g.why?.[lang()] ?? g.why?.zh ?? '';
  return `<div class="arcade-tile is-cut"><span class="arcade-tile-top"><b>${esc(titleOf(g, null))}</b><em class="arcade-kind">${esc(w().cut)}</em></span>`
    + `<small>${esc([g.cut, why].filter(Boolean).join(' · '))}</small></div>`;
}

async function tileHtml(g, i) {
  if (g.replaced === 'cut') return cutTile(g);
  // A stage row has no module to load: the rules stand it on the game page.
  const mod = g.stage ? null : await modOf(g.id);
  const where = [g.hui, g.scene].filter(Boolean).join(' · ');
  const kind = kindOf(g);
  const to = g.stage ? await stageUrl(g.stage) : mod?.meta?.ai ? arcadePlayUrl(g.id, mod.meta.rows ? g.task : null) : href({ game: g.id, n: String(i) });
  const top = `<span class="arcade-tile-top"><b>${esc(titleOf(g, mod))}</b>${kind ? `<em class="arcade-kind">${esc(kind)}</em>` : ''}</span>`
    + `<small>${esc(where || g.task || (g.stage ? w().stage : ''))}</small>`;
  const lvs = await levelsOf(g);
  if (lvs.length < 2) return `<a class="arcade-tile${mod || g.stage ? '' : ' is-missing'}" data-kind="${esc(g.mechanic ?? '')}" href="${esc(to)}">${top}</a>`;
  // A game with a level table: each level straight from its tile (Hanli 10-20, of 守墙关's 药园: 「这个放到游戏大厅了吗?」)
  const chips = lvs.map((l, k) => `<a class="arcade-lv" href="${esc(href({ game: g.id, n: String(i), lv: l.lv }))}" title="${esc(l.name)}">${k + 1}</a>`).join('');
  return `<div class="arcade-tile has-lv${mod ? '' : ' is-missing'}" data-kind="${esc(g.mechanic ?? '')}"><a class="arcade-tile-main" href="${esc(to)}">${top}</a>`
    + `<nav class="arcade-lvs" aria-label="${esc(w().levels)}">${chips}</nav></div>`;
}

/* A game's levels, by name in the reader's language, each with the `lv` its chip opens: the registry row's own
   (`levels`, 守炉), else its level file (worlds/jiuding/levels/<id>.json: 守墙关, 撒豆成兵) — numbered 1…; or the
   ids a row's `ladder` names in that file (兽潮's nights), opened by id. None for the rest. */
async function levelsOf(g) {
  const name = (l) => { const n = l?.title ?? l?.name; return typeof n === 'string' ? n : n?.[lang()] ?? n?.zh ?? l?.id ?? ''; };
  const kitOf = async () => { const r = await fetch(`../worlds/jiuding/levels/${g.id}.json`).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };
  if (Array.isArray(g.ladder)) {
    const kit = await kitOf();
    return g.ladder.map((id) => ({ lv: id, name: name((kit?.levels ?? []).find((l) => l.id === id) ?? { id }) }));
  }
  if (g.group !== 'main') return []; // the main games' ladders; a board's own deals are not levels to pick
  const numbered = (ls) => ls.map((l, k) => ({ lv: String(k + 1), name: name(l) }));
  if (Array.isArray(g.levels)) return numbered(g.levels.filter((l) => !l.story && !l.realm)); // a story level (守炉's 药园巡夜) has its own tile, off the ladder
  return numbered(((await kitOf())?.levels ?? []).filter((l) => !l.story)); // 守墙关's story level (药园巡夜 · 开春) is the story's, off the ladder
}

// The type filter: one chip a type (with its count), 全部 first; a tap hides the other tiles and any
// group left empty. Page-only — nothing kept in the address.
function kindsHtml(games) {
  const n = new Map();
  for (const g of games) if (g.mechanic) n.set(g.mechanic, (n.get(g.mechanic) ?? 0) + 1);
  const chip = (k, label, count) => `<button type="button" class="arcade-kindchip" data-kind="${esc(k)}" aria-pressed="${k ? 'false' : 'true'}">`
    + `${esc(label)}${count ? ` <span>${count}</span>` : ''}</button>`;
  return `<nav class="arcade-kinds">${chip('', w().all, games.length)}`
    + [...n].map(([k, c]) => chip(k, kindOf({ mechanic: k }), c)).join('') + '</nav>';
}
function filterBy(kind) {
  for (const b of root.querySelectorAll('.arcade-kindchip')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  for (const t of root.querySelectorAll('.arcade-tile')) t.hidden = Boolean(kind) && t.dataset.kind !== kind;
  for (const s of root.querySelectorAll('section')) s.hidden = !s.querySelector('.arcade-tile:not([hidden])');
}

/* Boards a newer game replaced in the story (a row's `replaced`: the new game's id, 'cut', or 'setpiece' — a 大场面 plays it now): kept for
   comparison, folded at the end, never mixed in with what plays now (Hanli 10-19 opened the old 拽 by mistake). */
async function oldHtml(reg) {
  const rows = reg.games.map((g, i) => [g, i]).filter(([g]) => g.replaced);
  if (!rows.length) return '';
  const tiles = await Promise.all(rows.map(([g, i]) => tileHtml(g, i)));
  return `<details class="arcade-old"><summary>${esc(w().old)} <span class="dim small">${rows.length}</span></summary><div class="arcade-grid">${tiles.join('')}</div></details>`;
}

async function listPage() {
  const reg = await registry();
  const groups = await Promise.all(reg.groups.map(async (gr) => {
    const rows = reg.games.map((g, i) => [g, i]).filter(([g]) => g.group === gr.id && !g.replaced);
    if (!rows.length) return '';
    const tiles = await Promise.all(rows.map(([g, i]) => tileHtml(g, i)));
    return `<section><h2>${esc(gr[lang()] ?? gr.zh)}</h2><div class="arcade-grid">${tiles.join('')}</div></section>`;
  }));
  root.innerHTML = `<header class="arcade-head"><h1>${esc(w().title)}</h1><span class="dim small">${esc(w().note)}</span>`
    + `<a class="arcade-view" href="${href({ view: 'rhythm' })}">${esc(w().rhythm)}</a>`
    // 数值 (tools/numbers.mjs's report, Hanli 10-27: 「全局校验游戏数值」): its own page, the 游戏厅's dev gate kept.
    + `<a class="arcade-view" href="arcade-numbers.html${href()}">${esc(w().numbers)}</a>`
    // 游戏记录 (stats.html): the play log read back — the save's own when the arcade came from a test save.
    + `<a class="arcade-view" href="stats.html?dev=1${save ? `&save=${encodeURIComponent(save)}` : ''}">${esc(w().stats)}</a>`
    + `<a class="arcade-lang" href="${langHref()}">${esc(w().lang)}</a>${home()}</header>`
    + `${kindsHtml(reg.games.filter((g) => !g.replaced))}${groups.join('')}${await oldHtml(reg)}`;
  for (const b of root.querySelectorAll('.arcade-kindchip')) b.onclick = () => filterBy(b.dataset.kind);
}

// A wide scene (the throws: 480×300; 结印's 4:3 field with the camera in its corner) plays as large as the window lets it, not in the phone-wide card
// (Hanli 10-19: 「射鹿…把画面调大一些, 就很像愤怒小鸟了」).
const WIDE = new Set(['投掷', '结印', '格斗']);
// A game that takes the window's height whole (斗法's room: `meta.pick`, one foe a deal) plays in a full-height card.
const FILL = (mod) => Boolean(mod?.meta?.pick);
// A tall board (守炉's 600×760) plays as tall as the window lets it — the module says so (`meta.tall`, games/shell.js).
const playClass = (m, mod) => (FILL(mod) ? ' is-fill' : WIDE.has(m) ? ' is-wide' : tallOf(mod) ? ' is-tall' : '');
async function playPage(id, n) {
  const reg = await registry();
  const row = reg.games[Number(n)]?.id === id ? reg.games[Number(n)] : reg.games.find((g) => g.id === id) ?? { id };
  // A game the rules stand on the stage is the real page's, as is one the model plays (an old link to either lands there).
  if (row.stage) { location.replace(await stageUrl(row.stage)); return; }
  if (row.replaced === 'cut') { root.textContent = w().missing; return; }
  const mod = await modOf(id), mount = mountOf(mod);
  if (mod?.meta?.ai) { location.replace(arcadePlayUrl(id)); return; }
  // A row with a ladder (兽潮's nights) deals its own level unless a chip named one (`lv`): the module reads `data.lv` first.
  const data = row.ladder && q.get('lv') ? { ...(row.data ?? {}), lv: q.get('lv') } : row.data ?? {};
  // A game played against one of many (斗法: every foe of the book, `meta.pick`) opens on its picker; `foe` plays it.
  const foe = mod?.meta?.pick ? q.get('foe') : null;
  if (mod?.meta?.pick && !/^[\w@/-]+$/.test(foe ?? '')) { pickPage(id, n, row, mod); return; }
  // The game plays in the one shell (games/shell.js) the story's card wears too: its title, type and how-to in
  // the bar (beside a tall board on a Mac, so the board gets the height — Hanli 10-20: 「mac上游戏画面可以大一点」),
  // pause for a game in time, the result and 再来 under it. A row's `lead` is its story lead-in, read first.
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a>${foe ? `<a href="${href({ game: id, n: String(n ?? '') })}">${esc(w().pick)}</a>` : ''}${home()}</header>`
    + `<div class="arcade-solo"><article class="card gamecard scenegame arcade-play${playClass(row.mechanic, mod)}"${row.aspect ? ` style="--ar:${Number(row.aspect)}"` : ''}></article></div>`;
  const card = root.querySelector('.arcade-play');
  if (!mount) { card.textContent = w().missing; return; }
  const reducedMotion = Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  playAlone(card, mount, {
    id: `arcade-${id}`, game: id, title: [titleOf(row, mod), foe ? await mod.pickName(foe, lang()) : null].filter(Boolean).join(' · '), kind: kindOf(row), how: howOf(mod, row), timed: timedOf(mod), tall: tallOf(mod), restart: restartOf(mod), lang: lang(),
    leadLine: row.lead?.[lang()] ?? row.lead?.zh ?? '',
    opts: { reducedMotion, seed: `arcade|${Date.now()}`, data: { ...data, ...(foe ? { foe } : {}) } },
    // 下一关: a game with levels names its next one when won (`r.next`); the page opens it by `lv` (斗法: the next foe, by `foe`)
    next: (lv) => { location.href = href({ game: id, n: String(n ?? ''), ...(foe ? { foe: String(lv) } : { lv: String(lv) }) }); },
    // 台词预取 off the story only on `?prefetch=1` (a dev check); else the level's own lines.
    prefetch: devPrefetch(mod, { data, lang: lang() }),
  });
}

/* The foe picker (斗法): the module's rows (`pickRows`), each a tile with its portrait and one line, in sections by
   回 — the story's fights, then the beasts that roam. A tile plays that fight. */
async function pickPage(id, n, row, mod) {
  const rows = await mod.pickRows(lang());
  const tile = (r) => `<a class="arcade-tile arcade-foe" href="${esc(href({ game: id, n: String(n ?? ''), foe: r.key }))}" data-foe="${esc(r.key)}">`
    + (r.art ? `<img class="arcade-foe-art" src="${esc(r.art)}" alt="" loading="lazy">` : '<i class="arcade-foe-art"></i>')
    + `<span class="arcade-foe-text"><b>${esc(r.name)}</b><small>${esc(r.hint)}</small>`
    + `${r.where || r.party ? `<em class="arcade-foe-tag">${esc([r.where, r.party].filter(Boolean).join(' · '))}</em>` : ''}</span></a>`;
  const by = (list, key) => [...new Map(list.map((r) => [r[key], list.filter((x) => x[key] === r[key])]))];
  const sections = by(rows, 'section').map(([title, list]) => `<section><h2>${esc(title)}</h2>`
    + by(list, 'group').map(([g, items]) => `<h3 class="arcade-foe-hui">${esc(g)}</h3><div class="arcade-grid">${items.map(tile).join('')}</div>`).join('') + '</section>');
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a><h1>${esc(titleOf(row, mod))}</h1>`
    + `<span class="dim small">${esc(w().pickNote)}</span>${home()}</header>${sections.join('')}`;
}

/* 节奏 (Hanli 10-22: 「让我在游戏大厅里可以看到玩家游戏的节奏」): each chapter's main line, 回 by 回, as a strip —
   a read a thin bar as long as its characters (red past the cap), a game a chip in its type's colour, a fight 斗法's,
   a set piece · riddle · look · 突破 muted; a game of the type just played says so. worlds/jiuding/levels/rhythm.json
   (tools/arcade-rhythm.mjs) holds every word and number; the page only draws it. */
const BEAT = {
  zh: { piece: '大场面', riddle: '谜', seen: '察看', breakthrough: '突破' },
  en: { piece: 'Set piece', riddle: 'Riddle', seen: 'Look', breakthrough: 'Breakthrough' },
};
const COUNTED = { zh: { board: '小游戏', fight: '斗法', piece: '大场面', riddle: '谜' }, en: { board: 'games', fight: 'fights', piece: 'set pieces', riddle: 'riddles' } };
const pickL = (v) => v?.[lang()] ?? v?.zh ?? '';
const LINK = {
  board: (it) => (it.game ? href({ game: it.game, n: String(it.n) }) : null),
  fight: (it) => (it.key ? href({ game: 'kapai', foe: it.key }) : null),
};
const barPx = (chars) => Math.max(4, Math.min(220, Math.round(chars / 25)));
function readHtml(it, cap) {
  const n = it.run > it.chars ? `${it.chars} / ${it.run}` : String(it.chars);
  return `<li class="rh-read${it.over ? ' is-over' : ''}" title="${esc(`${it.run} ${w().chars}${it.over ? ` > ${cap}` : ''}`)}">`
    + `<i style="height:${barPx(it.chars)}px"></i><span>${esc(n)}</span></li>`;
}
function beatHtml(it) {
  const kind = it.mechanic ? kindOf(it) : BEAT[lang()][it.kind];
  const name = pickL(it.title) || (it.kind === 'riddle' ? it.id : '');
  const to = LINK[it.kind]?.(it);
  const tag = to ? 'a' : 'span';
  const chip = `<${tag} class="rh-chip${LINK[it.kind] ? '' : ' is-muted'}" data-kind="${esc(it.mechanic ?? '')}"${to ? ` href="${esc(to)}"` : ''}>`
    + `${it.art ? `<img src="../worlds/jiuding/${esc(it.art)}" alt="" loading="lazy">` : ''}<b>${esc(name || kind)}</b>${name && kind ? `<em>${esc(kind)}</em>` : ''}</${tag}>`;
  return `<li class="rh-beat">${chip}${it.same ? `<span class="rh-same">⚠ ${esc(w().same(kind))}</span>` : ''}</li>`;
}
function huiHead(h) {
  const counts = Object.entries(COUNTED[lang()]).filter(([k]) => h.counts[k]).map(([k, label]) => `${label} ${h.counts[k]}`);
  const extra = [h.roaming ? `${w().roaming} ${h.roaming}` : '', h.side.length ? `${w().side} ${h.side.length}` : '', h.longest ? `${w().longest} ${h.longest}` : ''];
  return `<h3 class="rh-hui-head">${esc(pickL(h.label))}<span>${esc([...counts, ...extra].filter(Boolean).join(' · '))}</span></h3>`;
}
const huiHtml = (h, cap) => `<div class="rh-hui">${huiHead(h)}<ol class="rh-strip">${h.items.map((it) => (it.kind === 'read' ? readHtml(it, cap) : beatHtml(it))).join('')}</ol></div>`;
async function rhythmPage() {
  const r = await fetch('../worlds/jiuding/levels/rhythm.json').catch(() => null);
  const t = r?.ok ? await r.json() : { cap: 1500, chapters: [] };
  const chapters = t.chapters.filter((c) => c.huis.some((h) => h.items.length)).map((c) => `<section class="rh-chapter"><h2>${esc(pickL(c.title))}</h2>`
    + `<div class="rh-huis">${c.huis.map((h) => huiHtml(h, t.cap)).join('')}</div></section>`);
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a><h1>${esc(w().rhythm)}</h1>`
    + `<a class="arcade-lang" href="${langHref()}">${esc(w().lang)}</a>${home()}</header>`
    + `<p class="dim small rh-note">${esc(w().rhythmNote.replace('{cap}', t.cap))}</p>${chapters.join('')}`;
}

const PAGES = { rhythm: rhythmPage };
if (devOnly(q)) {
  document.title = `灵境 · ${w().title}`;
  if (q.get('game')) playPage(q.get('game'), q.get('n')); else (PAGES[view] ?? listPage)();
} else root.textContent = '—';
