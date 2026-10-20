// arcade.js — 游戏厅: every small game in the registry (worlds/jiuding/games.json), tap to play.
// Hanli's test page, never a player's: the page draws nothing without ?dev=1, and nothing in the
// game links to it. Each game plays alone through its mount() contract (games/mount.js) — no save,
// no seeding, no pay; the result is shown, and 再来 deals a fresh one. A game the model plays (画猜,
// `meta.ai`) is tried on the REAL game page instead (arcade-board.js, Hanli 10-19): its own test save,
// its board on the stage, the real chat beside it — the same UI and logic as in the story.
import { esc } from './esc.js';
import { mountPure } from './games/mount.js';
import { playAlone, timedOf } from './games/shell.js';
import { arcadePlayUrl } from './arcade-board.js';

const q = new URLSearchParams(location.search);
export const devOnly = (params) => params.get('dev') === '1';
const lang = () => (q.get('lang') === 'en' ? 'en' : 'zh');
const root = document.getElementById('arcade');
const W = {
  zh: { title: '游戏厅', note: '测试用 · 不存档、不结算', all: '全部', back: '← 游戏厅', again: '再来', won: '成', grade: '评', left: '离开', lang: 'En', loading: '……', missing: '这个游戏没找到', home: '返回游戏', old: '旧版 · 已被新游戏替换' },
  en: { title: 'Arcade', note: 'Testing only · nothing saved, nothing paid', all: 'All', back: '← Arcade', again: 'Again', won: 'Won', grade: 'grade', left: 'Left', lang: '中', loading: '…', missing: 'No such game', home: 'Back to game', old: 'Old versions · replaced' },
};
const w = () => W[lang()];
// A row's `mechanic` (games.json) is its type, in Chinese — what kind of game a tile is before it opens
// (Hanli, 10-19: 「能在游戏大厅标一下游戏类型吗, 是割绳子还是投掷等」). The English words live here.
const KIND_EN = {
  割绳子: 'Cut the rope', 投掷: 'Throw', 狩猎瞄准: 'Hunt & aim', 打地鼠: 'Whack-a-mole', 时机: 'Timing', 节奏: 'Rhythm',
  调息: 'Breath', 解谜: 'Puzzle', 棋牌: 'Board & table', 判断: 'Read & pick', 剧情: 'Story', 你画我猜: 'Draw & guess',
  塔防: 'Tower defense',
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
const howOf = (mod) => mod?.meta?.how?.[lang()] ?? mod?.meta?.how?.zh ?? '';
// Opened from the game (dev-arcade.js, the builder's chip): every page keeps `from=game` and shows the way back.
// A scratch save (`save=`) rides along so the way back lands on that save, not the player's own.
const fromGame = q.get('from') === 'game';
const save = /^[\w-]+$/.test(q.get('save') ?? '') ? q.get('save') : null;
const kept = (en = lang() === 'en') => ({ dev: '1', ...(en ? { lang: 'en' } : {}), ...(fromGame ? { from: 'game' } : {}), ...(save ? { save } : {}) });
const href = (extra = {}) => `?${new URLSearchParams({ ...kept(), ...extra })}`;
const home = () => (fromGame ? `<a class="arcade-home" href="index.html${save ? `?save=${save}` : ''}">${esc(w().home)}</a>` : '');

async function registry() {
  const r = await fetch('../worlds/jiuding/games.json').catch(() => null);
  return r?.ok ? r.json() : { groups: [], games: [] };
}

async function tileHtml(g, i) {
  const mod = await modOf(g.id);
  const where = [g.hui, g.scene].filter(Boolean).join(' · ');
  const kind = kindOf(g);
  const to = mod?.meta?.ai ? arcadePlayUrl(g.id) : href({ game: g.id, n: String(i) });
  return `<a class="arcade-tile${mod ? '' : ' is-missing'}" data-kind="${esc(g.mechanic ?? '')}" href="${esc(to)}">`
    + `<span class="arcade-tile-top"><b>${esc(titleOf(g, mod))}</b>${kind ? `<em class="arcade-kind">${esc(kind)}</em>` : ''}</span>`
    + `<small>${esc(where || g.task || '')}</small></a>`;
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
    + `<a class="arcade-lang" href="?${new URLSearchParams(kept(lang() !== 'en'))}">${esc(w().lang)}</a>${home()}</header>`
    + `${kindsHtml(reg.games.filter((g) => !g.replaced))}${groups.join('')}${await oldHtml(reg)}`;
  for (const b of root.querySelectorAll('.arcade-kindchip')) b.onclick = () => filterBy(b.dataset.kind);
}

// A wide scene (the throws: 480×300) plays as large as the window lets it, not in the phone-wide card
// (Hanli 10-19: 「射鹿…把画面调大一些, 就很像愤怒小鸟了」).
const WIDE = new Set(['投掷']);
// A tall board (守炉's 600×760) plays as tall as the window lets it.
const TALL = new Set(['塔防']);
const playClass = (m) => (WIDE.has(m) ? ' is-wide' : TALL.has(m) ? ' is-tall' : '');
async function playPage(id, n) {
  const reg = await registry();
  const row = reg.games[Number(n)]?.id === id ? reg.games[Number(n)] : reg.games.find((g) => g.id === id) ?? { id };
  const mod = await modOf(id), mount = mountOf(mod);
  // A game the model plays is the real page's (an old link to it lands there).
  if (mod?.meta?.ai) { location.replace(arcadePlayUrl(id)); return; }
  // The game plays in the one shell (games/shell.js) the story's card wears too: its title, type and how-to in
  // the bar (beside a tall board on a Mac, so the board gets the height — Hanli 10-20: 「mac上游戏画面可以大一点」),
  // pause for a game in time, the result and 再来 under it. A row's `lead` is its story lead-in, read first.
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a>${home()}</header>`
    + `<div class="arcade-solo"><article class="card gamecard scenegame arcade-play${playClass(row.mechanic)}"${row.aspect ? ` style="--ar:${Number(row.aspect)}"` : ''}></article></div>`;
  const card = root.querySelector('.arcade-play');
  if (!mount) { card.textContent = w().missing; return; }
  const reducedMotion = Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  playAlone(card, mount, {
    id: `arcade-${id}`, title: titleOf(row, mod), kind: kindOf(row), how: howOf(mod), timed: timedOf(mod), tall: TALL.has(row.mechanic), lang: lang(),
    leadLine: row.lead?.[lang()] ?? row.lead?.zh ?? '',
    opts: { reducedMotion, seed: `arcade|${Date.now()}`, data: row.data ?? {} },
    // 下一关: a game with levels names its next one when won (`r.next`); the page opens it by `lv`
    next: (lv) => { location.href = href({ game: id, n: String(n ?? ''), lv: String(lv) }); },
  });
}

if (devOnly(q)) {
  document.title = `灵境 · ${w().title}`;
  if (q.get('game')) playPage(q.get('game'), q.get('n')); else listPage();
} else root.textContent = '—';
