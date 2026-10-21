// 炼丹 · 配一炉丹 — the first board (board.js: pair each herb with its twin), on the small-game contract for the
// 游戏厅 (Hanli 2026-10-21: the 游戏厅 holds every playable thing). The story page deals this board itself
// (lingjing.js: a `lianliankan` task is never imported from here) — this module is only the 游戏厅's door to it:
// the same board, the same eight herbs (worlds/jiuding/herbs.json), the same words.
import { boardHtml, newBoard, tap } from '../board.js';

export const meta = {
  id: 'lianliankan',
  name: { zh: '炼丹 · 配一炉丹', en: 'Alchemy · A furnace of pills' },
  how: { zh: '成对点选，八味灵草配齐即丹成。', en: 'Tap pairs. When all eight herbs are paired, the pill is made.' },
};

const WORDS = {
  zh: { boardHint: '成对点选，八味灵草配齐即丹成。', boardDone: '丹成。' },
  en: { boardHint: 'Tap pairs. When all eight herbs are paired, the pill is made.', boardDone: 'The pill is made.' },
};

async function herbs(lang) {
  const res = await fetch(new URL('../../worlds/jiuding/herbs.json', import.meta.url));
  return ((await res.json()).herbs ?? []).map((h) => ({ id: h.id, tile: h.tile, label: h.name?.[lang] ?? h.name?.zh ?? h.id }));
}

/** mount(container, { lang, signal }) → Promise<{ won }> (games/mount.js). */
export async function mount(container, { lang = 'zh', signal } = {}) {
  const words = WORDS[lang] ?? WORDS.zh;
  const board = newBoard(await herbs(lang), 'lianliankan');
  const draw = () => { container.innerHTML = boardHtml(board, words); };
  draw();
  return new Promise((resolve) => {
    const stop = () => container.removeEventListener('click', onTap);
    function onTap(e) {
      const tile = e.target.closest?.('[data-tile]');
      if (!tile || !container.contains(tile)) return;
      const won = tap(board, Number(tile.dataset.tile));
      draw();
      if (won) { stop(); resolve({ won: true }); }
    }
    container.addEventListener('click', onTap);
    signal?.addEventListener('abort', () => { stop(); resolve({ won: false, left: true }); }, { once: true });
  });
}
