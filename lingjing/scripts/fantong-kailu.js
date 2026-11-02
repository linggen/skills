// fantong-kailu.js — 喂饭桶 · 开炉 in the 物品 panel (Hanli 2026-10-20): the 饭桶's pane holds the game (games/kailu.js)
// in the one shell (games/shell.js), so 银月's line has its bubble. The pouch pane redraws its HTML whenever it changes,
// so a canvas living in it would die on every redraw: the game is mounted ONCE into a node of its own and that node is
// laid into whatever host `[data-ft-kailu]` the redraw made (beat-host.js's way). The game feeds through
// `feed(ids, lingshi, press)` — the page's `fantong feed`, the rules' roll — and shows what comes back; after 收下 it
// comes up again on the brief that feed answered with (full, until the cooldown is over). Nothing here knows the rules.
//
// The bag and the 饭桶 on one page (Hanli 11-02: the tray paged 8 at a time hid what could not go in — 「东西不见了」):
// the right (or below, on a phone held upright) is the SAME bag as the 储物袋's (pouch.js bagGridHtml) — its tabs, its
// tiles, one scrolling grid; what may not go in stays, dimmed, with the rules' reason (fantong brief `held_back`). The
// left is the 饭桶: the canvas (play.js `outside`), its three places, the 灵石 and 开炉 in HTML. A tap on a tile puts it
// in the first empty place (a drag on the Mac too), a tap on a place takes it out. While it chews and reveals the bag
// folds away and the 饭桶 has the page (`ftk busy`), then the bag comes back.
import { forget, frameHtml, shellFor, toolHtml } from './games/shell.js';
import { esc } from './esc.js';
import { bagGridHtml, tileHtml } from './pouch.js';

export const KAILU_SHELL = 'fantong-kailu';
// The ✕ goes where the head's 储物袋 segment goes (pouch.js), and says so in that segment's word.
const BACK = { zh: '储物袋', en: 'Storage Pouch' };
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
  zh: { fire: '开 炉', stones: '灵石', have: '有 {n}', max: '最多三样', place: '空', none: '不能喂' },
  en: { fire: 'Fire it', stones: 'Stones', have: 'have {n}', max: 'three at most', place: 'empty', none: "won't go in" },
};
const say = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** What the pot may still take of each thing: the brief's spare count less what is in the pot now. */
export function potLeft(brief, pot) {
  const left = Object.fromEntries((brief?.inputs ?? []).map((i) => [i.id, i.n ?? 1]));
  for (const id of pot ?? []) if (left[id] != null) left[id] -= 1;
  return left;
}

/** The pane: the 饭桶 (the shell round the host the live game is laid into, its places, 灵石 and 开炉) and the bag.
    `o`: { brief, bag (the gear read's), pot, lingshi, phase, tab, words (cards.js), artBase }. Back to the pouch is the
    bar's ✕, as every board's way out is (Hanli 10-27: 「全局统一改」). */
export function kailuPaneHtml(lang = 'zh', o = {}) {
  const L = lang === 'en' ? 'en' : 'zh', w = WORDS[L], b = o.brief, pot = o.pot ?? [], max = b?.max_in ?? 3;
  const ctx = { lang: L, words: o.words ?? {}, artBase: o.artBase ?? '' };
  const frame = frameHtml({ id: KAILU_SHELL, title: NAME[L], how: HOW[L], body: '<div class="gshell-slot" data-ft-kailu></div>', timed: false, lang: L, close: toolHtml('close', BACK[L], 'data-pouch-pane=""') });
  const byId = new Map((o.bag ?? []).map((i) => [i.id, i]));
  const filling = (o.phase ?? 'fill') === 'fill' && b?.ready !== false;
  const places = Array.from({ length: max }, (_, k) => {
    const id = pot[k], it = id ? byId.get(id) ?? b?.inputs?.find((i) => i.id === id) : null;
    return it ? `<button class="ftk-place on" data-ft-slot="${k}" aria-label="${esc(it.name)}">${it.art ? `<img src="${esc(ctx.artBase + it.art)}" alt="">` : ''}<span>${esc(it.name)}</span></button>`
      : `<span class="ftk-place">${esc(w.place)}</span>`;
  }).join('');
  const ls = b?.lingshi, lsMax = ls ? Math.min(ls.max ?? 0, ls.have ?? 0) : 0, n = o.lingshi ?? 0;
  const stones = ls && ls.max > 0 ? `<div class="ftk-ls"><span>${esc(w.stones)}</span><button class="act quiet" data-ft-ls="-1"${!filling || n <= 0 ? ' disabled' : ''}>−</button><b>${esc(n)}</b><button class="act quiet" data-ft-ls="1"${!filling || n >= lsMax ? ' disabled' : ''}>＋</button><small class="dim">${esc(say(w.have, { n: ls.have }))}</small></div>` : '';
  const fire = `<button class="act primary ftk-fire" data-ft-fire${filling && pot.length ? '' : ' disabled'}>${esc(w.fire)}</button>`;
  const wait = b?.ready === false && b.wait ? `<p class="small dim ftk-wait">${esc(b.wait)}</p>` : '';
  const left = potLeft(b, pot), full = pot.length >= max;
  const tile = (i) => {
    const back = b?.held_back?.[i.id];
    const off = back ? back.say || w.none : left[i.id] == null ? w.none : !(left[i.id] > 0) ? w.none : full ? w.max : null;
    const shown = left[i.id] != null ? { ...i, n: left[i.id] } : i;
    return tileHtml(shown, ctx, { attr: 'data-ft-add', off, g: null }).replace('<button class="ptile', `<button draggable="${off ? 'false' : 'true'}" class="ptile`);
  };
  const { tabs, grid } = bagGridHtml(o.bag ?? [], ctx, { tab: o.tab, tile });
  return `<section class="psec ftong kailu ftk${filling ? '' : ' busy'}">`
    + `<div class="ftk-pot" data-ft-drop>${frame}<div class="ftk-ctl"><div class="ftk-places">${places}</div>${stones}${wait}</div></div>`
    + `<div class="ftk-bag">${tabs}${grid}</div><div class="ftk-go">${fire}</div></section>`;
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
