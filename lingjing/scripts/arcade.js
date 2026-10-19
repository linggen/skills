// arcade.js — 游戏厅: every small game in the registry (worlds/jiuding/games.json), tap to play.
// Hanli's test page, never a player's: the page draws nothing without ?dev=1, and nothing in the
// game links to it. Each game plays alone through its mount() contract (games/mount.js) — no save,
// no seeding, no pay; the result is shown, and 再来 deals a fresh one.
import { esc } from './esc.js';
import { mountPure } from './games/mount.js';

const q = new URLSearchParams(location.search);
export const devOnly = (params) => params.get('dev') === '1';
const lang = () => (q.get('lang') === 'en' ? 'en' : 'zh');
const root = document.getElementById('arcade');
const W = {
  zh: { title: '游戏厅', note: '测试用 · 不存档、不结算', all: '全部', back: '← 游戏厅', again: '再来', won: '成', grade: '评', left: '离开', lang: 'En', loading: '……', missing: '这个游戏没找到', home: '返回游戏' },
  en: { title: 'Arcade', note: 'Testing only · nothing saved, nothing paid', all: 'All', back: '← Arcade', again: 'Again', won: 'Won', grade: 'grade', left: 'Left', lang: '中', loading: '…', missing: 'No such game', home: 'Back to game' },
};
const w = () => W[lang()];
// A row's `mechanic` (games.json) is its type, in Chinese — what kind of game a tile is before it opens
// (Hanli, 10-19: 「能在游戏大厅标一下游戏类型吗, 是割绳子还是投掷等」). The English words live here.
const KIND_EN = {
  割绳子: 'Cut the rope', 投掷: 'Throw', 狩猎瞄准: 'Hunt & aim', 打地鼠: 'Whack-a-mole', 时机: 'Timing', 节奏: 'Rhythm',
  调息: 'Breath', 解谜: 'Puzzle', 棋牌: 'Board & table', 判断: 'Read & pick', 剧情: 'Story', 你画我猜: 'Draw & guess',
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
  return `<a class="arcade-tile${mod ? '' : ' is-missing'}" data-kind="${esc(g.mechanic ?? '')}" href="${href({ game: g.id, n: String(i) })}">`
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

async function listPage() {
  const reg = await registry();
  const groups = await Promise.all(reg.groups.map(async (gr) => {
    const rows = reg.games.map((g, i) => [g, i]).filter(([g]) => g.group === gr.id);
    if (!rows.length) return '';
    const tiles = await Promise.all(rows.map(([g, i]) => tileHtml(g, i)));
    return `<section><h2>${esc(gr[lang()] ?? gr.zh)}</h2><div class="arcade-grid">${tiles.join('')}</div></section>`;
  }));
  root.innerHTML = `<header class="arcade-head"><h1>${esc(w().title)}</h1><span class="dim small">${esc(w().note)}</span>`
    + `<a class="arcade-lang" href="?${new URLSearchParams(kept(lang() !== 'en'))}">${esc(w().lang)}</a>${home()}</header>`
    + `${kindsHtml(reg.games)}${groups.join('')}`;
  for (const b of root.querySelectorAll('.arcade-kindchip')) b.onclick = () => filterBy(b.dataset.kind);
}

let stop = null;
async function playPage(id, n) {
  const reg = await registry();
  const row = reg.games[Number(n)]?.id === id ? reg.games[Number(n)] : reg.games.find((g) => g.id === id) ?? { id };
  const mod = await modOf(id), mount = mountOf(mod);
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a>${home()}</header>`
    + `<article class="card gamecard scenegame arcade-play"><div class="cardtitle">${esc(titleOf(row, mod))}</div>`
    + `<div class="small dim g-goal">${esc(howOf(mod))}</div><div class="arcade-slot" id="slot"></div>`
    + `<div class="arcade-result" id="result"></div></article>`;
  if (!mount) { document.getElementById('slot').textContent = w().missing; return; }
  deal(mount, row);
}
async function deal(mount, row) {
  stop?.abort();
  stop = new AbortController();
  const slot = document.getElementById('slot'), out = document.getElementById('result');
  out.innerHTML = '';
  const reducedMotion = Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const r = await mount(slot, { lang: lang(), reducedMotion, seed: `arcade|${Date.now()}`, data: row.data ?? {}, signal: stop.signal });
  if (r.left) return;
  out.innerHTML = `<span class="arcade-won">${esc(r.won ? w().won : w().left)}</span>`
    + (r.grade ? `<span class="dim small">${esc(w().grade)} · ${esc(r.grade)}</span>` : '')
    + (r.stars != null ? `<span>${'★'.repeat(r.stars)}${'☆'.repeat(Math.max(0, 3 - r.stars))}</span>` : '')
    + `<button type="button" class="g-btn g-btn-soft" id="again">${esc(w().again)}</button>`;
  document.getElementById('again').onclick = () => deal(mount, row);
}

if (devOnly(q)) {
  document.title = `灵境 · ${w().title}`;
  if (q.get('game')) playPage(q.get('game'), q.get('n')); else listPage();
} else root.textContent = '—';
