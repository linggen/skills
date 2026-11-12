// A start never hides behind another live game.
export async function openStage({ fight, board, closeFight, closeBoard, note, open }) {
  if (fight === 'unfinished' || board === 'unfinished') {
    note(fight === 'unfinished' ? 'in-a-fight' : 'in-a-board');
    return false;
  }
  if (fight === 'finished') await closeFight();
  if (board === 'finished') await closeBoard();
  open();
  return true;
}
