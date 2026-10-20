// fantong-kailu.js — 喂饭桶 · 开炉 in the 物品 panel (Hanli 2026-10-20): the 饭桶's pane holds the game (games/kailu.js)
// in the one shell (games/shell.js), so 银月's line has its bubble. The pouch pane redraws its HTML whenever it changes,
// so a canvas living in it would die on every redraw: the game is mounted ONCE into a node of its own and that node is
// laid into whatever host `[data-ft-kailu]` the redraw made (fantong-puzzle.js's way, before it). The game feeds through
// `feed(ids, lingshi, press)` — the page's `fantong feed`, the rules' roll — and shows what comes back; after 收下 it
// comes up again on the brief that feed answered with (full, until the cooldown is over). Nothing here knows the rules.
import { esc } from './esc.js';
import { forget, frameHtml, shellFor } from './games/shell.js';
import { meta, mount } from './games/kailu.js';

export const KAILU_SHELL = 'fantong-kailu';
const BACK = { zh: '回储物袋', en: 'Back to the pouch' };

/** The pane: back to the pouch, then the shell round an empty host the live game is laid into. */
export function kailuPaneHtml(lang = 'zh') {
  const L = lang === 'en' ? 'en' : 'zh';
  return `<button class="act quiet pback" data-pouch-pane="">${esc(BACK[L])}</button><section class="psec ftong kailu" style="--game-reserve:230px">`
    + frameHtml({ id: KAILU_SHELL, title: meta.name[L], how: meta.how[L], body: '<div class="gshell-slot" data-ft-kailu></div>', timed: false, lang: L })
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
    mount(node, { lang: o.lang, data: { brief, roll }, signal: ctrl.signal, reducedMotion: o.reducedMotion, shell: shellFor(KAILU_SHELL), onGame: (g) => { me.game = g; } })
      .then((r) => { if (cur === me && !r?.left) start(latest ?? brief, o); }); // 收下: up again, on the brief the feed left
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
