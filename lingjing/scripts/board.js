// board.js — 炼丹, the alchemy board. Pair each herb with its twin; when the
// last pair goes, the pill is made. No model and no 灵气: the rules only ever
// hear the win, through `win`.

const PAIRS = 8; // the task is "pair the eight spirit herbs"

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newBoard(herbs, taskId) {
  const set = herbs.slice(0, PAIRS);
  return { taskId, tiles: shuffle([...set, ...set]), gone: new Set(), sel: null, won: false };
}

/// A tap. Two of the same herb vanish together; a mismatch moves the
/// selection. Returns true when the board has just been cleared.
export function tap(board, i) {
  if (board.won || board.gone.has(i)) return false;
  if (board.sel === null || board.sel === i) {
    board.sel = board.sel === i ? null : i;
    return false;
  }
  if (board.tiles[board.sel].id === board.tiles[i].id) {
    board.gone.add(board.sel);
    board.gone.add(i);
    board.sel = null;
    board.won = board.gone.size === board.tiles.length;
    return board.won;
  }
  board.sel = i;
  return false;
}

export function boardHtml(board, words) {
  if (board.won) return `<div class="dim small">${words.boardDone}</div>`;
  const tiles = board.tiles.map((h, i) => {
    const gone = board.gone.has(i);
    const cls = `tile${gone ? ' gone' : ''}${board.sel === i ? ' sel' : ''}`;
    return `<button class="${cls}" data-tile="${i}" title="${h.label}" aria-label="${h.label}"${gone ? ' disabled' : ''}>${h.tile}</button>`;
  });
  return `<div class="dim small">${words.boardHint}</div><div class="board" data-board="${board.taskId}">${tiles.join('')}</div>`;
}
