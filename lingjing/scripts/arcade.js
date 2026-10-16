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
  zh: { title: '游戏厅', note: '测试用 · 不存档、不结算', back: '← 游戏厅', again: '再来', won: '成', grade: '评', left: '离开', lang: 'En', loading: '……', missing: '这个游戏没找到' },
  en: { title: 'Arcade', note: 'Testing only · nothing saved, nothing paid', back: '← Arcade', again: 'Again', won: 'Won', grade: 'grade', left: 'Left', lang: '中', loading: '…', missing: 'No such game' },
};
const w = () => W[lang()];

const mods = new Map();
async function modOf(id) {
  if (!/^[a-z]+$/.test(id)) return null;
  if (!mods.has(id)) mods.set(id, import(`./games/${id}.js`).catch(() => null));
  return mods.get(id);
}
const mountOf = (mod) => mod?.mount ?? (mod?.html ? mountPure(mod) : null);
const nameOf = (mod, id) => mod?.meta?.name?.[lang()] ?? mod?.meta?.name?.zh ?? id;
const howOf = (mod) => mod?.meta?.how?.[lang()] ?? mod?.meta?.how?.zh ?? '';
const href = (extra = {}) => `?${new URLSearchParams({ dev: '1', ...(lang() === 'en' ? { lang: 'en' } : {}), ...extra })}`;

async function registry() {
  const r = await fetch('../worlds/jiuding/games.json').catch(() => null);
  return r?.ok ? r.json() : { groups: [], games: [] };
}

async function tileHtml(g, i) {
  const mod = await modOf(g.id);
  const where = [g.hui, g.scene].filter(Boolean).join(' · ');
  return `<a class="arcade-tile${mod ? '' : ' is-missing'}" href="${href({ game: g.id, n: String(i) })}">`
    + `<b>${esc(nameOf(mod, g.id))}</b><small>${esc(where || g.task || '')}</small></a>`;
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
    + `<a class="arcade-lang" href="${lang() === 'en' ? '?dev=1' : '?dev=1&lang=en'}">${esc(w().lang)}</a></header>${groups.join('')}`;
}

let stop = null;
async function playPage(id, n) {
  const reg = await registry();
  const row = reg.games[Number(n)]?.id === id ? reg.games[Number(n)] : reg.games.find((g) => g.id === id) ?? { id };
  const mod = await modOf(id), mount = mountOf(mod);
  root.innerHTML = `<header class="arcade-head"><a href="${href()}">${esc(w().back)}</a></header>`
    + `<article class="card gamecard scenegame arcade-play"><div class="cardtitle">${esc(nameOf(mod, id))}</div>`
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
