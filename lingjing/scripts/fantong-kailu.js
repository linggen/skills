// fantong-kailu.js — 喂饭桶 · 开炉 in the 物品 panel (Hanli 2026-10-20): the 饭桶's pane holds the game (games/kailu.js)
// in the one shell (games/shell.js), so 银月's line has its bubble. The pouch pane redraws its HTML whenever it changes,
// so a canvas living in it would die on every redraw: the game is mounted ONCE into a node of its own and that node is
// laid into whatever host `[data-ft-kailu]` the redraw made (beat-host.js's way). The game feeds through
// `feed(ids, lingshi, press)` — the page's `fantong feed`, the rules' roll — and shows what comes back; after 收下 it
// comes up again on the brief that feed answered with (full, until the cooldown is over). Nothing here knows the rules.
//
// One page, no 饭桶 tab (Hanli 11-03: 「可以, 按你说的做」): the 饭桶 docks in the 储物袋's own page (pouch.js) — beside the
// grid on the Mac and a phone on its side, under it (foldable, 开炉 always in sight) on a phone held upright. The grid is
// the 储物袋's; a tile's detail carries its own taps and 「放进饭桶」 (potOff says when it may not go in, in the rules'
// words); a drag on the Mac drops it straight in; a tap on a place takes it out. Where it cannot be fed (a cooldown, a
// day's cap, no 饭桶 yet) the dock still stands, dimmed, with the reason. While it chews and reveals the grid folds away
// and the 饭桶 has the page (`run`; never `busy`, the page's global disabled look — Hanli 11-03: 「开炉画面是灰色的」), and
// what came out is said under it with the detail's own lines.
import { forget, frameHtml, shellFor } from './games/shell.js';
import { esc } from './esc.js';
import { itemFactsHtml } from './pouch.js';

export const KAILU_SHELL = 'fantong-kailu';
// The game's module, fetched on first open — never a static import: the page's own modules must not declare the
// engine's helper names (`mount`) at the top level when the relay inlines the page (tests/pages.test.mjs).
let game = null;
const kailu = () => (game ??= import('./games/kailu.js'));
// Its name and how-to, the shell's bar (games/kailu.js `meta`, which the 游戏厅 reads).
const NAME = { zh: '喂饭桶 · 开炉', en: 'Feed the Rice Bucket' };
const HOW = {
  zh: '把最多三样东西拖进饭桶嘴里，可搭灵石。开炉后饭桶嚼着，盖子冒红烟、金烟——金烟冒起时按住压盖，品级升一档。',
  en: 'Drag up to three things into its mouth, add spirit stones if you like. As it chews the lid puffs red and gold — press it down on a gold puff to lift the grade a notch.',
};

const WORDS = {
  zh: { title: '饭桶', fire: '开 炉', stones: '灵石', have: '有 {n}', max: '最多三样', place: '空', none: '不能喂', inPot: '在饭桶里', put: '放进饭桶', spare: '可喂 {n}', most: '最多', fold: '收起', unfold: '展开', out: '开出来的' },
  en: { title: 'Rice Bucket', fire: 'Fire it', stones: 'Stones', have: 'have {n}', max: 'three at most', place: 'empty', none: "won't go in", inPot: 'in the pot', put: 'Into the bucket', spare: '{n} to spare', most: 'Max', fold: 'Fold', unfold: 'Open', out: 'Out of the pot' },
};
const say = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** What the pot may still take of each thing: the brief's spare count less what is in the pot now. */
export function potLeft(brief, pot) {
  const left = Object.fromEntries((brief?.inputs ?? []).map((i) => [i.id, i.n ?? 1]));
  for (const id of pot ?? []) if (left[id] != null) left[id] -= 1;
  return left;
}
/** May this thing go into the pot now: null yes; '' resting (a cooldown, the pot busy — no reason to say); else the
    reason, the rules' words where they have one (fantong brief `held_back`). The 储物袋's detail asks it for 放进饭桶. */
export function potOff(brief, pot, id, lang = 'zh', phase = 'fill') {
  const w = WORDS[lang === 'en' ? 'en' : 'zh'], left = potLeft(brief, pot), back = brief?.held_back?.[id];
  if (!brief) return '';
  if (back) return back.say || w.none;
  if (left[id] == null) return w.none;
  if (!(left[id] > 0)) return pot.includes(id) ? w.inPot : w.none;
  if (pot.length >= (brief.max_in ?? 3)) return w.max;
  return phase === 'fill' && brief.ready !== false ? null : '';
}
/** The 灵石 quick picks for what he may put in (`most`: the cap, or what he has if less): 0 · 10 · half · all,
    each once, in order. */
export function stoneChips(most) {
  const m = Math.max(0, Math.floor(most ?? 0));
  return [...new Set([0, 10, Math.round(m / 2), m])].filter((v) => v <= m).sort((a, b) => a - b);
}
/** The pot runs (chews, reveals): the 储物袋's grid folds away and the 饭桶 has the page. */
export const potRuns = (phase) => ['chew', 'wait', 'reveal', 'done'].includes(phase);

/** The 饭桶, docked in the 储物袋's page (Hanli 11-03: 「可以, 按你说的做」 — one page, no 饭桶 tab): the shell round the
    host the live game is laid into, its three places, 灵石, what came out (its kind · effect · about, the 储物袋's own
    lines) and 开炉, always in sight. Where it cannot be fed (a cooldown, a day's cap, no 饭桶 yet) it still stands,
    dimmed, with the rules' reason (`o.off`, or the brief's `wait`). `o`: { brief, off, bag, pot, lingshi, phase, fold,
    outs, look, words (cards.js), artBase }. */
export function kailuDockHtml(lang = 'zh', o = {}) {
  const L = lang === 'en' ? 'en' : 'zh', w = WORDS[L], b = o.brief ?? null, pot = o.pot ?? [], max = b?.max_in ?? 3;
  const ctx = { lang: L, words: o.words ?? {}, artBase: o.artBase ?? '', look: o.look ?? null };
  const phase = o.phase ?? 'fill', runs = potRuns(phase), filling = Boolean(b) && phase === 'fill' && b.ready !== false;
  const byId = new Map((o.bag ?? []).map((i) => [i.id, i]));
  const places = Array.from({ length: max }, (_, k) => {
    const id = pot[k], it = id ? byId.get(id) ?? b?.inputs?.find((i) => i.id === id) : null;
    return it ? `<button class="ftk-place on" data-ft-slot="${k}" aria-label="${esc(it.name)}">${it.art ? `<img src="${esc(ctx.artBase + it.art)}" alt="">` : ''}<span>${esc(it.name)}</span></button>`
      : `<span class="ftk-place">${esc(w.place)}</span>`;
  }).join('');
  const ls = b?.lingshi, lsMax = ls ? Math.min(ls.max ?? 0, ls.have ?? 0) : 0, n = o.lingshi ?? 0;
  // −/＋ a stone at a time, and quick picks that scale with what he may put in (Hanli 11-04: the cap is 10 a 层).
  const chips = stoneChips(lsMax).map((v) => `<button class="act quiet ftk-chip" data-ft-ls-set="${v}" aria-pressed="${n === v}"${!filling ? ' disabled' : ''}>${esc(v === lsMax && v > 0 ? w.most : v)}</button>`).join('');
  const stones = ls && ls.max > 0 ? `<div class="ftk-ls"><span>${esc(w.stones)}</span><button class="act quiet" data-ft-ls="-1"${!filling || n <= 0 ? ' disabled' : ''}>−</button><b>${esc(n)}</b><button class="act quiet" data-ft-ls="1"${!filling || n >= lsMax ? ' disabled' : ''}>＋</button><small class="dim">${esc(say(w.have, { n: ls.have }))}</small></div>`
    + (lsMax > 1 ? `<div class="ftk-chips">${chips}</div>` : '') : '';
  const why = !b ? o.off ?? '' : b.ready === false && !runs ? b.wait ?? '' : ''; // its own reveal first: the wait after it
  const wait = why ? `<p class="small dim ftk-wait">${esc(why)}</p>` : '';
  // What came out, as the 储物袋's detail says it (Hanli 11-03: 「开出来的物品, 显示一下详细信息」): the bag's own entry once
  // it has landed there, else what the pot said of it.
  const outs = runs && o.outs?.length ? `<div class="ftk-out" role="status"><b class="lbl">${esc(w.out)}</b>${o.outs.map((x) => {
    const it = byId.get(x.id) ?? x, art = it.art ? `<img src="${esc(ctx.artBase + it.art)}" alt="">` : '<i class="noart" aria-hidden="true"></i>';
    return `<div class="ftk-outrow">${art}<div class="pdbody"><b class="pdname">${esc(it.name ?? x.name ?? x.id)}</b>${x.n > 1 ? ` <span class="dim">×${esc(x.n)}</span>` : ''}${it.effect || it.about || it.kind ? itemFactsHtml(it, ctx) : ''}</div></div>`;
  }).join('')}</div>` : '';
  const frame = b ? frameHtml({ id: KAILU_SHELL, title: NAME[L], how: HOW[L], body: '<div class="gshell-slot" data-ft-kailu></div>', timed: false, lang: L }) : '';
  const head = `<header class="ftdock-head"><b>${esc(b?.name || w.title)}</b><button class="act quiet ftdock-fold" data-ft-fold aria-expanded="${!o.fold}">${esc(o.fold ? w.unfold : w.fold)}</button></header>`;
  const fire = `<button class="act primary ftk-fire" data-ft-fire${filling && pot.length ? '' : ' disabled'}>${esc(w.fire)}</button>`;
  const cls = `ftdock${runs ? ' run' : ''}${!filling && !runs ? ' rest' : ''}${!b ? ' none' : ''}${o.fold ? ' fold' : ''}`;
  return `<section class="${cls}" data-ft-dock data-ft-drop>${head}<div class="ftdock-body">${frame}<div class="ftk-ctl"><div class="ftk-places">${places}</div>${stones}</div></div>`
    + `${wait}${outs}<div class="ftk-go">${fire}</div></section>`;
}

export function fantongKailu({ feed, onFed = () => {}, onPhase = () => {}, onStart = () => {}, doc = globalThis.document }) {
  let cur = null; // { node, ctrl, brief, game }
  let latest = null; // the newest brief a feed answered with
  const host = () => doc.querySelector('[data-ft-kailu]');
  function stop() {
    if (!cur) return;
    const c = cur; cur = null;
    c.ctrl.abort();
    forget(KAILU_SHELL);
  }
  function start(brief, o) {
    stop();
    const node = doc.createElement('div'), ctrl = new AbortController();
    node.className = 'g-mountnode';
    const me = { node, ctrl, brief, game: null };
    cur = me;
    onStart(brief); // a fresh pot: the page's places and 灵石 empty again
    attach();
    const roll = async (ids, lingshi, press) => {
      const r = await feed(ids, lingshi, press);
      if (r?.fantong) latest = r.fantong;
      onFed(r);
      return r;
    };
    kailu().then(({ mount }) => (cur === me ? mount(node, { lang: o.lang, data: { brief, roll, outside: true, onPhase: (p) => { if (cur === me) onPhase(p); } }, signal: ctrl.signal, reducedMotion: o.reducedMotion, shell: shellFor(KAILU_SHELL, 'kailu'), onGame: (g) => { me.game = g; } }) : { left: true }))
      .then((r) => { if (cur === me && !r?.left) start(latest ?? brief, o); }) // 收下: up again, on the brief the feed left
      .catch((e) => console.warn('[kailu]', e));
  }
  function attach() {
    const h = host();
    if (h && cur && h.firstChild !== cur.node) { h.replaceChildren(cur.node); cur.game?.refresh?.(); }
  }
  return {
    /** The pane is drawn with this brief: start the game, or start it again when the 饭桶 is ready once more. */
    show(brief, o = {}) {
      if (!brief) return;
      if (!cur || (cur.brief.ready === false && brief.ready)) { latest = brief; start(brief, o); return; }
      attach();
    },
    attach, stop,
    /** The page's pot and 灵石 into the live pot; 开炉. */
    setPot: (ids, lingshi) => cur?.game?.setPot?.(ids, lingshi),
    fire: () => cur?.game?.fire?.(),
    get live() { return Boolean(cur); },
  };
}
