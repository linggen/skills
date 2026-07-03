// Gomoku (五子棋) — board, validation, rendering, AI integration

// ── Constants ──────────────────────────────────────────────────────

const SIZE = 15;          // 15×15 board
const CELL = 40;          // px per cell
const MARGIN = 30;        // board margin
const STONE_R = 17;       // stone radius
const SKILL_NAME = 'game-table';
const GAME_KEY = 'gomoku';

const EMPTY = 0, BLACK = 1, WHITE = 2;

// ── State ──────────────────────────────────────────────────────────

let board = [];
let modelId = '';
let waitingForAI = false;
let gameOver = false;
let isBoardMove = false;
let retryCount = 0;
let retryTimer = null;
const MAX_RETRIES = 3;
let scorePlayer = 0;
let scoreAI = 0;
let lastMove = null;
let moveHistory = [];
let assistLevel = 2;

/** @type {Awaited<ReturnType<typeof LinggenUI.mount>> | null} */
let chat = null;

// ── DOM refs ───────────────────────────────────────────────────────

const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');
const chatPanel = document.getElementById('chat-panel');
const newGameBtn = document.getElementById('new-game-btn');
const scoreDisplay = document.getElementById('score-display');
const turnIndicator = document.getElementById('turn-indicator');
const assistLevelSel = document.getElementById('assist-level');

// ── Init ───────────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  modelId = params.get('model') || localStorage.getItem('game-table:model') || 'deepseek-v4-flash';

  // Restore the running match score for this game (game-table:ui).
  const savedScores = (window.GameTableUI?.loadUi().scores || {})[GAME_KEY];
  if (Array.isArray(savedScores)) [scorePlayer, scoreAI] = savedScores;
  assistLevelSel.addEventListener('change', () => {
    assistLevel = parseInt(assistLevelSel.value, 10);
  });
  newGameBtn.addEventListener('click', startNewGame);
  scoreDisplay.title = 'Match score — click to reset';
  scoreDisplay.style.cursor = 'pointer';
  scoreDisplay.addEventListener('click', () => { scorePlayer = 0; scoreAI = 0; updateScoreDisplay(); });
  canvas.addEventListener('click', onBoardClick);
  updateScoreDisplay();

  const saved = loadMatch();
  if (saved) await resumeMatch(saved);
  else await startNewGame();
}

// ── Match persistence — survive a game-rail switch mid-match ──────
// Every AI prompt carries the full board, so only the board needs to
// persist; the chat session stays a fresh throwaway. Saved at user-turn
// checkpoints (after the AI's stone lands), cleared on game end / New Game.

const MATCH_KEY = `game-table:${GAME_KEY}:match`;

function saveMatch() {
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify({ v: 1, board, moveHistory, lastMove }));
  } catch { /* ignore */ }
}

function clearMatch() {
  try { localStorage.removeItem(MATCH_KEY); } catch { /* ignore */ }
}

function loadMatch() {
  try {
    const m = JSON.parse(localStorage.getItem(MATCH_KEY));
    if (m?.v !== 1 || !Array.isArray(m.board) || m.board.length !== SIZE) return null;
    if (m.board.some(r => !Array.isArray(r) || r.length !== SIZE)) return null;
    if (!Array.isArray(m.moveHistory) || m.moveHistory.length === 0) return null;
    return m;
  } catch { return null; }
}

async function resumeMatch(saved) {
  board = saved.board;
  moveHistory = saved.moveHistory;
  lastMove = saved.lastMove || null;
  waitingForAI = false;
  gameOver = false;
  retryCount = 0;
  drawBoard();
  await mountFreshChat(`Match resumed after ${moveHistory.length} moves — your turn.`);
}

async function startNewGame() {
  clearMatch();
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  waitingForAI = false;
  gameOver = false;
  retryCount = 0;
  lastMove = null;
  moveHistory = [];
  drawBoard();
  await mountFreshChat('Welcome to Gomoku (五子棋)! Get 5 stones in a row to win. You play Black (first move). Click any intersection to place your stone.');
}

// Clean up any old session and mount a fresh chat panel.
async function mountFreshChat(welcome) {
  if (chat) {
    await chat.deleteSession();
    chat.destroy();
  }
  chat = await LinggenUI.mount(chatPanel, {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Chat',
    placeholder: 'Type a message...',
    lazy: true,
    deleteOnLeave: true,
    onStreamEnd: handleStreamEnd,
  });

  setTimeout(() => {
    chat.addMessage('ai', welcome);
  }, 500);
}

// ── Board Rendering ────────────────────────────────────────────────

function drawBoard() {
  updateTurnIndicator();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#dcb35c';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i < SIZE; i++) {
    const pos = MARGIN + i * CELL;
    ctx.beginPath();
    ctx.moveTo(MARGIN, pos);
    ctx.lineTo(MARGIN + (SIZE - 1) * CELL, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, MARGIN);
    ctx.lineTo(pos, MARGIN + (SIZE - 1) * CELL);
    ctx.stroke();
  }

  const stars = [[3,3],[3,11],[7,7],[11,3],[11,11]];
  for (const [r, c] of stars) {
    ctx.beginPath();
    ctx.arc(MARGIN + c * CELL, MARGIN + r * CELL, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        drawStone(r, c, board[r][c]);
      }
    }
  }

  if (lastMove) {
    const [lr, lc] = lastMove;
    const x = MARGIN + lc * CELL;
    const y = MARGIN + lr * CELL;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = board[lr][lc] === BLACK ? '#fff' : '#e94560';
    ctx.fill();
  }
}

function drawStone(row, col, color) {
  const x = MARGIN + col * CELL;
  const y = MARGIN + row * CELL;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const grad = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, STONE_R);
  if (color === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ccc');
  }

  ctx.beginPath();
  ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

function drawStoneAt(x, y, color) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  const grad = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, STONE_R);
  if (color === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ccc');
  }

  ctx.beginPath();
  ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// ── Animation ──────────────────────────────────────────────────────

function animateDrop(row, col, color, callback) {
  const x = MARGIN + col * CELL;
  const yTarget = MARGIN + row * CELL;
  const yStart = yTarget - 30;
  const duration = 150;
  const start = performance.now();

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.6 ? (t / 0.6) * (t / 0.6) : 1 - Math.sin((t - 0.6) / 0.4 * Math.PI) * 0.08 * (1 - t);
    const cy = yStart + (yTarget - yStart) * Math.min(ease, 1);

    drawBoard();
    drawStoneAt(x, cy, color);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      callback();
    }
  }
  requestAnimationFrame(frame);
}

// ── Click Handling ─────────────────────────────────────────────────

function onBoardClick(e) {
  if (gameOver || waitingForAI) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const col = Math.round((mx - MARGIN) / CELL);
  const row = Math.round((my - MARGIN) / CELL);

  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;
  if (board[row][col] !== EMPTY) return;

  makeUserMove(row, col);
}

async function makeUserMove(row, col) {
  waitingForAI = true;

  await new Promise(resolve => {
    animateDrop(row, col, BLACK, resolve);
  });

  board[row][col] = BLACK;
  lastMove = [row, col];
  moveHistory.push({ row, col, who: 'black' });
  drawBoard();

  const colLabel = String.fromCharCode(65 + col);
  chat.addMessage('user', `${colLabel}${row + 1}`);

  if (checkWin(board, row, col, BLACK)) {
    gameOver = true;
    waitingForAI = false;
    chat.addMessage('system', 'Five in a row! You win!');
    showGameOverOverlay('player');
    return;
  }

  if (isBoardFull()) {
    gameOver = true;
    waitingForAI = false;
    chat.addMessage('system', 'Board is full — draw!');
    showGameOverOverlay('draw');
    return;
  }

  isBoardMove = true;
  const message = buildBoardMessage(row, col);
  chat.send(message);
}

// ── Board Message for AI ───────────────────────────────────────────

function buildBoardMessage(lastRow, lastCol) {
  if (assistLevel === 1) return buildBoardMessageL1(lastRow, lastCol);
  if (assistLevel === 3) return buildBoardMessageL3(lastRow, lastCol);
  return buildBoardMessageL2(lastRow, lastCol);
}

function buildBoardMessageL1(lastRow, lastCol) {
  const colLabel = String.fromCharCode(65 + lastCol);

  let boardStr = '   ' + Array.from({length: SIZE}, (_, i) => String.fromCharCode(65 + i)).join(' ') + '\n';
  for (let r = 0; r < SIZE; r++) {
    const label = String(r + 1).padStart(2);
    const row = board[r].map(c => c === EMPTY ? '.' : c === BLACK ? 'X' : 'O').join(' ');
    boardStr += `${label} ${row}\n`;
  }

  return `[BOARD_MOVE]
## Gomoku
You play WHITE (O). I play BLACK (X). 15×15 board. 5 in a row wins.

### Board
${boardStr}
### My Move
${colLabel}${lastRow + 1}

Write 1 sentence, then:
[MOVE]{"row":r,"col":c}[/MOVE]
(r and c are 0-14, position must be empty)`;
}

function buildBoardMessageL2(lastRow, lastCol) {
  const colLabel = String.fromCharCode(65 + lastCol);

  let boardStr = '   ' + Array.from({length: SIZE}, (_, i) => String.fromCharCode(65 + i)).join(' ') + '\n';
  for (let r = 0; r < SIZE; r++) {
    const label = String(r + 1).padStart(2);
    const row = board[r].map(c => c === EMPTY ? '.' : c === BLACK ? 'X' : 'O').join(' ');
    boardStr += `${label} ${row}\n`;
  }

  const playerThreats = findThreats(board, BLACK);
  const aiThreats = findThreats(board, WHITE);
  const urgentMoves = findUrgentMoves(board, WHITE);
  const emptyNeighbors = getEmptyNearStones(board);

  let urgentSection = '';
  if (urgentMoves.length > 0) {
    const lines = urgentMoves.map(m => `→ ${m.pos} (row ${m.row}, col ${m.col}): ${m.reason}`);
    urgentSection = `\n### ⚠ URGENT — You MUST play one of these:\n${lines.join('\n')}\nIf there is a WIN move, play it. Otherwise block the opponent!\n`;
  }

  return `[BOARD_MOVE]
## Gomoku (五子棋)
You play WHITE (O). I play BLACK (X). First to get 5 in a row wins.
Board is ${SIZE}×${SIZE}. Coordinates: column A-O, row 1-15.

### Board
${boardStr}
### My Move
${colLabel}${lastRow + 1}
${urgentSection}${playerThreats.length > 0 ? `\n### Black Threats\n${playerThreats.join('\n')}` : ''}
${aiThreats.length > 0 ? `\n### Your Patterns (White)\n${aiThreats.join('\n')}` : ''}

### How to Pick Your Move
1. If there are URGENT moves above, you MUST pick one of them.
2. Otherwise: extend your own lines, create forks, play near center.
3. Always play near existing stones.

Pick from these available positions: ${emptyNeighbors.join(' ')}

Write 1 sentence, then:
[MOVE]{"row":r,"col":c}[/MOVE]
where r is 0-14 and c is 0-14.`;
}

// ── L3 Strategist Helpers ─────────────────────────────────────────

function classifyLine(count, openEnds) {
  if (count >= 5) return { name: 'FIVE', score: 100000 };
  if (count === 4 && openEnds === 2) return { name: 'OPEN_FOUR', score: 10000 };
  if (count === 4 && openEnds === 1) return { name: 'CLOSED_FOUR', score: 5000 };
  if (count === 3 && openEnds === 2) return { name: 'OPEN_THREE', score: 1000 };
  if (count === 3 && openEnds === 1) return { name: 'CLOSED_THREE', score: 200 };
  if (count === 2 && openEnds === 2) return { name: 'OPEN_TWO', score: 100 };
  return null;
}

function scorePosition(b, r, c, color) {
  let total = 0;
  const patterns = [];
  for (const [dr, dc] of DIRS) {
    let count = 1;
    let openEnds = 0;

    // Count forward
    let fr = r + dr, fc = c + dc;
    while (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === color) {
      count++;
      fr += dr;
      fc += dc;
    }
    if (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === EMPTY) openEnds++;

    // Count backward
    let br_ = r - dr, bc = c - dc;
    while (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === color) {
      count++;
      br_ -= dr;
      bc -= dc;
    }
    if (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === EMPTY) openEnds++;

    const cl = classifyLine(count, openEnds);
    if (cl) {
      total += cl.score;
      patterns.push(`${cl.name}(${cl.score})`);
    }
  }
  return { total, patterns };
}

function getEmptyNearStonesPositions(b) {
  const near = [];
  const seen = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === EMPTY) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === EMPTY) {
            const key = nr * SIZE + nc;
            if (!seen.has(key)) {
              seen.add(key);
              near.push([nr, nc]);
            }
          }
        }
      }
    }
  }
  return near;
}

function getTopCandidates(b, n = 10) {
  const positions = getEmptyNearStonesPositions(b);
  const candidates = [];
  for (const [r, c] of positions) {
    b[r][c] = WHITE;
    const wScore = scorePosition(b, r, c, WHITE);
    b[r][c] = BLACK;
    const bScore = scorePosition(b, r, c, BLACK);
    b[r][c] = EMPTY;
    const combined = wScore.total + bScore.total * 1.1;
    candidates.push({
      r, c,
      label: coord(r, c),
      whitePatterns: wScore.patterns,
      blackPatterns: bScore.patterns,
      whiteScore: wScore.total,
      blackScore: bScore.total,
      combined,
    });
  }
  candidates.sort((a, b) => b.combined - a.combined);
  return candidates.slice(0, n);
}

function detectForks(b, color) {
  const positions = getEmptyNearStonesPositions(b);
  const forks = [];
  for (const [r, c] of positions) {
    b[r][c] = color;
    let threats = [];
    for (const [dr, dc] of DIRS) {
      let count = 1;
      let openEnds = 0;

      let fr = r + dr, fc = c + dc;
      while (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === color) {
        count++;
        fr += dr;
        fc += dc;
      }
      if (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === EMPTY) openEnds++;

      let br_ = r - dr, bc = c - dc;
      while (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === color) {
        count++;
        br_ -= dr;
        bc -= dc;
      }
      if (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === EMPTY) openEnds++;

      const cl = classifyLine(count, openEnds);
      if (cl && (cl.name === 'OPEN_THREE' || cl.name === 'CLOSED_FOUR' || cl.name === 'OPEN_FOUR' || cl.name === 'FIVE')) {
        threats.push(cl.name);
      }
    }
    b[r][c] = EMPTY;

    if (threats.length >= 2) {
      let type;
      const hasThree = threats.some(t => t.includes('THREE'));
      const hasFour = threats.some(t => t.includes('FOUR'));
      if (hasFour && hasThree) type = 'four-three';
      else if (hasFour) type = 'double-four';
      else type = 'double-three';
      forks.push({ pos: coord(r, c), row: r, col: c, type, threats });
    }
  }
  return forks;
}

function findMultiBlockMoves(b, aiColor) {
  const opponentColor = aiColor === WHITE ? BLACK : WHITE;
  const positions = getEmptyNearStonesPositions(b);
  const results = [];
  for (const [r, c] of positions) {
    // Count how many opponent threat lines this position blocks
    let blocked = 0;
    const reasons = [];
    b[r][c] = opponentColor;
    for (const [dr, dc] of DIRS) {
      let count = 1;
      let openEnds = 0;

      let fr = r + dr, fc = c + dc;
      while (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === opponentColor) {
        count++;
        fr += dr;
        fc += dc;
      }
      if (fr >= 0 && fr < SIZE && fc >= 0 && fc < SIZE && b[fr][fc] === EMPTY) openEnds++;

      let br_ = r - dr, bc = c - dc;
      while (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === opponentColor) {
        count++;
        br_ -= dr;
        bc -= dc;
      }
      if (br_ >= 0 && br_ < SIZE && bc >= 0 && bc < SIZE && b[br_][bc] === EMPTY) openEnds++;

      const cl = classifyLine(count, openEnds);
      if (cl && (cl.name === 'OPEN_THREE' || cl.name === 'CLOSED_FOUR' || cl.name === 'OPEN_FOUR')) {
        blocked++;
        reasons.push(cl.name);
      }
    }
    b[r][c] = EMPTY;

    if (blocked >= 2) {
      results.push({ pos: coord(r, c), row: r, col: c, blocked, reasons });
    }
  }
  return results;
}

function buildBoardMessageL3(lastRow, lastCol) {
  const colLabel = String.fromCharCode(65 + lastCol);

  let boardStr = '   ' + Array.from({length: SIZE}, (_, i) => String.fromCharCode(65 + i)).join(' ') + '\n';
  for (let r = 0; r < SIZE; r++) {
    const label = String(r + 1).padStart(2);
    const row = board[r].map(c => c === EMPTY ? '.' : c === BLACK ? 'X' : 'O').join(' ');
    boardStr += `${label} ${row}\n`;
  }

  const urgentMoves = findUrgentMoves(board, WHITE);
  const forks = detectForks(board, BLACK);
  const multiBlock = findMultiBlockMoves(board, WHITE);
  const topCandidates = getTopCandidates(board);
  const playerThreats = findThreats(board, BLACK);
  const aiThreats = findThreats(board, WHITE);
  const emptyNeighbors = getEmptyNearStones(board);

  let urgentSection = '';
  if (urgentMoves.length > 0) {
    const lines = urgentMoves.map(m => `→ ${m.pos} (row ${m.row}, col ${m.col}): ${m.reason}`);
    urgentSection += lines.join('\n') + '\n';
  }
  if (forks.length > 0) {
    urgentSection += forks.map(f => `⚠ Fork threat: ${f.pos} — ${f.type} (${f.threats.join(', ')})`).join('\n') + '\n';
  }
  if (multiBlock.length > 0) {
    urgentSection += multiBlock.map(m => `🛡 Multi-block: ${m.pos} blocks ${m.blocked} threats (${m.reasons.join(', ')})`).join('\n') + '\n';
  }

  let candidatesSection = '';
  if (topCandidates.length > 0) {
    candidatesSection = topCandidates.map((c, i) => {
      const wPat = c.whitePatterns.length > 0 ? c.whitePatterns.join(', ') : 'none';
      const bPat = c.blackPatterns.length > 0 ? c.blackPatterns.join(', ') : 'none';
      return `${i + 1}. ${c.label} — W: ${wPat} B: ${bPat} combined: ${Math.round(c.combined)}`;
    }).join('\n');
  }

  let threatSection = '';
  if (playerThreats.length > 0) threatSection += `\n### Black Threats\n${playerThreats.join('\n')}`;
  if (aiThreats.length > 0) threatSection += `\n### Your Patterns (White)\n${aiThreats.join('\n')}`;

  return `[BOARD_MOVE]
## Gomoku
You play WHITE (O). I play BLACK (X). 15×15 board. 5 in a row wins.

### Board
${boardStr}
### My Move
${colLabel}${lastRow + 1}

### ⚠ URGENT
${urgentSection || '(none)'}

### Top Candidates (by position score)
${candidatesSection || '(none)'}
${threatSection}

Pick from: ${emptyNeighbors.join(' ')}

Write 1 sentence, then:
[MOVE]{"row":r,"col":c}[/MOVE]
(r and c are 0-14, position must be empty)`;
}

// ── Pattern Detection ──────────────────────────────────────────────

const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

function checkWin(b, row, col, color) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const r = row + dr * d, c = col + dc * d;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] === color) count++;
      else break;
    }
    for (let d = 1; d < 5; d++) {
      const r = row - dr * d, c = col - dc * d;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] === color) count++;
      else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

function coord(r, c) { return `${String.fromCharCode(65 + c)}${r + 1}`; }

function findThreats(b, color) {
  const seen = new Set();
  const threats = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] !== color) continue;
      for (const [dr, dc] of DIRS) {
        let count = 1;
        for (let d = 1; d < 5; d++) {
          const nr = r + dr * d, nc = c + dc * d;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === color) count++;
          else break;
        }
        if (count < 3) continue;
        const key = `${r},${c},${dr},${dc}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const endR = r + dr * count, endC = c + dc * count;
        const startR = r - dr, startC = c - dc;
        const endOpen = endR >= 0 && endR < SIZE && endC >= 0 && endC < SIZE && b[endR][endC] === EMPTY;
        const startOpen = startR >= 0 && startR < SIZE && startC >= 0 && startC < SIZE && b[startR][startC] === EMPTY;
        const openEnds = (endOpen ? 1 : 0) + (startOpen ? 1 : 0);
        if (openEnds === 0) continue;

        const label = color === BLACK ? 'X' : 'O';
        const blockPositions = [];
        if (endOpen) blockPositions.push(coord(endR, endC));
        if (startOpen) blockPositions.push(coord(startR, startC));

        if (count >= 4) {
          threats.push(`⚠ FOUR-in-a-row (${label}) — ${openEnds === 2 ? 'OPEN FOUR, wins next turn!' : 'block at ' + blockPositions.join(' or ')}`);
        } else {
          threats.push(`Three (${label}) at ${coord(r, c)} — open ends: ${blockPositions.join(', ')}`);
        }
      }
    }
  }
  return threats;
}

function findUrgentMoves(b, aiColor) {
  const opponentColor = aiColor === WHITE ? BLACK : WHITE;
  const urgent = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] !== EMPTY) continue;
      b[r][c] = aiColor;
      if (checkWin(b, r, c, aiColor)) {
        urgent.push({ pos: coord(r, c), row: r, col: c, priority: 0, reason: 'WIN — play here to get 5 in a row!' });
      }
      b[r][c] = EMPTY;
    }
  }
  if (urgent.length > 0) return urgent;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] !== EMPTY) continue;
      b[r][c] = opponentColor;
      if (checkWin(b, r, c, opponentColor)) {
        urgent.push({ pos: coord(r, c), row: r, col: c, priority: 1, reason: 'MUST BLOCK — opponent wins here next turn!' });
      }
      b[r][c] = EMPTY;
    }
  }
  if (urgent.length > 0) return urgent;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] !== EMPTY) continue;
      b[r][c] = opponentColor;
      for (const [dr, dc] of DIRS) {
        let count = 1;
        for (let d = 1; d < 5; d++) {
          const nr = r + dr * d, nc = c + dc * d;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === opponentColor) count++;
          else break;
        }
        for (let d = 1; d < 5; d++) {
          const nr = r - dr * d, nc = c - dc * d;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === opponentColor) count++;
          else break;
        }
        if (count >= 4) {
          urgent.push({ pos: coord(r, c), row: r, col: c, priority: 2, reason: 'Block — opponent creates four here' });
          break;
        }
      }
      b[r][c] = EMPTY;
    }
  }

  return urgent;
}

function getEmptyNearStones(b) {
  const near = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === EMPTY) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === EMPTY) {
            near.add(`${String.fromCharCode(65 + nc)}${nr + 1}`);
          }
        }
      }
    }
  }
  return [...near].sort();
}

function isBoardFull() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === EMPTY) return false;
    }
  }
  return true;
}

// ── AI Response Handling ──────────────────────────────────────────

function handleStreamEnd(text) {
  if (!isBoardMove) return; // regular chat — iframe handles display
  if (!waitingForAI) return; // already processed — ignore duplicate callbacks
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  handleAIResponse(text);
}

function handleAIResponse(text) {
  const moveMatch = text.match(/\[MOVE\]([\s\S]*?)\[\/MOVE\]/);
  if (!moveMatch) {
    retryIllegalMove('Response did not contain a [MOVE] tag.');
    return;
  }

  let row, col;
  let errorReason = '';
  try {
    const move = JSON.parse(moveMatch[1].trim());
    row = move.row;
    col = move.col;
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
      errorReason = `Position [${row},${col}] is out of bounds.`;
    } else if (board[row][col] !== EMPTY) {
      errorReason = `Position ${String.fromCharCode(65 + col)}${row + 1} is already occupied.`;
    }
  } catch {
    errorReason = 'Failed to parse [MOVE] JSON.';
  }

  if (errorReason) {
    retryIllegalMove(errorReason);
    return;
  }

  retryCount = 0;
  let commentary = text.replace(/\[MOVE\][\s\S]*?\[\/MOVE\]/, '').trim();
  if (commentary) {
    const firstSentence = commentary.match(/^[^.!?]*[.!?]/);
    commentary = firstSentence ? firstSentence[0].trim() : commentary.slice(0, 80);
  }

  animateDrop(row, col, WHITE, () => {
    board[row][col] = WHITE;
    lastMove = [row, col];
    moveHistory.push({ row, col, who: 'white' });

    waitingForAI = false;
    isBoardMove = false;
    drawBoard(); // must be after waitingForAI = false so turn indicator updates correctly

    const colLabel = String.fromCharCode(65 + col);
    const moveDesc = `${colLabel}${row + 1}`;
    const aiMsg = commentary ? `${moveDesc} — ${commentary}` : moveDesc;
    chat.addMessage('ai', aiMsg);

    if (checkWin(board, row, col, WHITE)) {
      gameOver = true;
      chat.addMessage('system', 'Five in a row! AI wins!');
      showGameOverOverlay('ai');
    } else {
      saveMatch();
    }
  });
}

async function retryIllegalMove(reason) {
  retryCount++;
  if (retryCount > MAX_RETRIES) {
    retryCount = 0;
    const fallback = pickFallbackMove();
    if (fallback) {
      const [row, col] = fallback;
      animateDrop(row, col, WHITE, () => {
        board[row][col] = WHITE;
        lastMove = [row, col];
        moveHistory.push({ row, col, who: 'white' });
        drawBoard();
        const colLabel = String.fromCharCode(65 + col);
        chat.addMessage('ai', `${colLabel}${row + 1}`);
        if (checkWin(board, row, col, WHITE)) {
          gameOver = true;
          chat.addMessage('system', 'Five in a row! AI wins!');
          showGameOverOverlay('ai');
        } else {
          saveMatch();
        }
        waitingForAI = false;
        isBoardMove = false;
      });
    } else {
      gameOver = true;
      waitingForAI = false;
      isBoardMove = false;
      chat.addMessage('system', 'Board is full — draw!');
      showGameOverOverlay('draw');
    }
    return;
  }

  chat.addMessage('system', `AI made an invalid move (attempt ${retryCount}/${MAX_RETRIES}). Retrying...`);

  let boardStr = '   ' + Array.from({length: SIZE}, (_, i) => String.fromCharCode(65 + i)).join(' ') + '\n';
  for (let r = 0; r < SIZE; r++) {
    const label = String(r + 1).padStart(2);
    const row = board[r].map(c => c === EMPTY ? '.' : c === BLACK ? 'X' : 'O').join(' ');
    boardStr += `${label} ${row}\n`;
  }

  const retryMsg = `[BOARD_MOVE]
Your previous move was INVALID: ${reason}
You MUST pick an empty position (marked . on the board).

### Board
${boardStr}
### Available Positions Near Existing Stones
${getEmptyNearStones(board).join(' ')}

Pick a valid empty position. Respond with:
[MOVE]{"row":r,"col":c}[/MOVE]`;

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (retryCount > 0) {
      retryIllegalMove(reason);
    }
  }, 30000);

  chat.send(retryMsg);
}

function pickFallbackMove() {
  let best = null;
  let bestScore = -Infinity;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue;
      let score = 0;
      const distCenter = Math.abs(r - 7) + Math.abs(c - 7);
      score -= distCenter;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] !== EMPTY) {
            score += 5;
          }
        }
      }
      score += Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
  }
  return best;
}

// ── Score & Game Over ──────────────────────────────────────────────

function updateScoreDisplay() {
  scoreDisplay.textContent = `${scorePlayer} : ${scoreAI}`;
  const scores = window.GameTableUI?.loadUi().scores || {};
  scores[GAME_KEY] = [scorePlayer, scoreAI];
  window.GameTableUI?.saveUi({ scores });
}

function updateTurnIndicator() {
  if (gameOver) {
    turnIndicator.textContent = 'Game Over';
    turnIndicator.className = 'turn-indicator game-over';
  } else if (waitingForAI) {
    turnIndicator.textContent = 'AI thinking...';
    turnIndicator.className = 'turn-indicator ai-turn';
  } else {
    turnIndicator.textContent = 'Your turn';
    turnIndicator.className = 'turn-indicator';
  }
}

function showGameOverOverlay(winner) {
  clearMatch();
  const isWin = winner === 'player';
  const isDraw = winner === 'draw';
  if (isWin) scorePlayer++;
  else if (!isDraw) scoreAI++;
  updateScoreDisplay();

  if (isWin) spawnConfetti();

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.innerHTML = `
    <div class="game-over-card">
      <div class="result-icon">${isWin ? '🎉' : isDraw ? '🤝' : '😔'}</div>
      <div class="result-text">${isWin ? 'You Win!' : isDraw ? 'Draw!' : 'You Lose!'}</div>
      <div class="result-sub">Score: ${scorePlayer} – ${scoreAI}</div>
      <button class="btn btn-primary" id="overlay-new-game">New Game</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#overlay-new-game').addEventListener('click', () => {
    overlay.remove();
    document.querySelector('.confetti-container')?.remove();
    startNewGame();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      document.querySelector('.confetti-container')?.remove();
    }
  });
}

function spawnConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6b9d','#c084fc','#fb923c'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.animationDelay = Math.random() * 1.5 + 's';
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 5000);
}

// ── Start ──────────────────────────────────────────────────────────

init();
