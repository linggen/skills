// fantong-kailu.js — 喂饭桶 · 开炉 in the 物品 panel (Hanli 2026-10-20): the 饭桶's pane holds the game (games/kailu.js)
// in the one shell (games/shell.js), so 银月's line has its bubble. The pouch pane redraws its HTML whenever it changes,
// so a canvas living in it would die on every redraw: the game is mounted ONCE into a node of its own and that node is
// laid into whatever host `[data-ft-kailu]` the redraw made (beat-host.js's way). The game feeds through
// `feed(ids, lingshi, press)` — the page's `fantong feed`, the rules' roll — and shows what comes back; after 收下 it
// comes up again on the brief that feed answered with (full, until the cooldown is over). Nothing here knows the rules.
import { forget, frameHtml, shellFor, toolHtml } from './games/shell.js';

export const KAILU_SHELL = 'fantong-kailu';
const BACK = { zh: '回储物袋', en: 'Back to the pouch' };
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

/** The pane: the shell round an empty host the live game is laid into; back to the pouch is the bar's ✕, as every
    board's way out is (Hanli 10-27: 「全局统一改」). */
export function kailuPaneHtml(lang = 'zh') {
  const L = lang === 'en' ? 'en' : 'zh';
  return `<section class="psec ftong kailu" style="--game-reserve:230px">`
    + frameHtml({ id: KAILU_SHELL, title: NAME[L], how: HOW[L], body: '<div class="gshell-slot" data-ft-kailu></div>', timed: false, lang: L, close: toolHtml('close', BACK[L], 'data-pouch-pane=""') })
    + '</section>';
}

export function fantongKailu({ feed, onFed = () => {}, doc = globalThis.document }) {
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
    attach();
    const roll = async (ids, lingshi, press) => {
      const r = await feed(ids, lingshi, press);
      if (r?.fantong) latest = r.fantong;
      onFed(r);
      return r;
    };
    kailu().then(({ mount }) => (cur === me ? mount(node, { lang: o.lang, data: { brief, roll }, signal: ctrl.signal, reducedMotion: o.reducedMotion, shell: shellFor(KAILU_SHELL, 'kailu'), onGame: (g) => { me.game = g; } }) : { left: true }))
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
    get live() { return Boolean(cur); },
  };
}
