// Chinese Chess (Xiangqi) — board, validation, rendering, game flow
import { fetchModels, fetchDefaultModel } from './api.js';

// ── Constants ──────────────────────────────────────────────────────

const ROWS = 10, COLS = 9;
const CELL = 76;          // px per cell
const MARGIN = 40;        // board margin
const PIECE_R = 33;       // piece radius
const SKILL_NAME = 'game-table';

const INITIAL_BOARD = [
  ['r','h','e','a','k','a','e','h','r'],
  ['.','.','.','.','.','.','.','.','.'],
  ['.','c','.','.','.','.','.','c','.'],
  ['p','.','p','.','p','.','p','.','p'],
  ['.','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.'],
  ['P','.','P','.','P','.','P','.','P'],
  ['.','C','.','.','.','.','.','C','.'],
  ['.','.','.','.','.','.','.','.','.'],
  ['R','H','E','A','K','A','E','H','R'],
];

const PIECE_NAMES = {
  K: '帥', A: '仕', E: '相', R: '車', H: '馬', C: '炮', P: '兵',
  k: '將', a: '士', e: '象', r: '車', h: '馬', c: '砲', p: '卒',
};

// ── State ──────────────────────────────────────────────────────────

let board = [];
let selectedCell = null;  // [row, col] or null
let legalMoves = [];      // [[row,col], ...] for selected piece
let modelId = '';
let assistLevel = 2;
let waitingForAI = false;
let gameOver = false;      // blocks all board moves when game ends
let isBoardMove = false;   // true when waiting for AI response to a board move
let retryCount = 0;
let retryTimer = null;
const MAX_RETRIES = 3;
let scorePlayer = 0;
let scoreAI = 0;

/** @type {Awaited<ReturnType<typeof LinggenUI.mount>> | null} */
let chat = null;

// ── DOM refs ───────────────────────────────────────────────────────

const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');
const chatPanel = document.getElementById('chat-panel');
const modelSwitcher = document.getElementById('model-switcher');
const assistLevelSel = document.getElementById('assist-level');
const backBtn = document.getElementById('back-btn');
const newGameBtn = document.getElementById('new-game-btn');
const scoreDisplay = document.getElementById('score-display');
const turnIndicator = document.getElementById('turn-indicator');

// ── Init ───────────────────────────────────────────────────────────

async function init() {
  // Parse model and optional session from URL
  const params = new URLSearchParams(window.location.search);
  modelId = params.get('model') || '';

  // Load models for switcher, selecting URL param or user's default
  try {
    const [models, defaultModel] = await Promise.all([fetchModels(), fetchDefaultModel()]);
    const preferred = modelId || defaultModel;
    modelSwitcher.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id;
      if (m.id === preferred) opt.selected = true;
      modelSwitcher.appendChild(opt);
    }
    if (!modelId && preferred) modelId = preferred;
  } catch { /* ignore */ }

  modelSwitcher.addEventListener('change', () => {
    modelId = modelSwitcher.value;
    if (chat) chat.setOptions({ modelId });
  });
  assistLevelSel.addEventListener('change', () => {
    assistLevel = parseInt(assistLevelSel.value, 10);
  });
  backBtn.addEventListener('click', () => { window.location.href = 'index.html'; });
  newGameBtn.addEventListener('click', startNewGame);
  updateScoreDisplay();
  canvas.addEventListener('click', onBoardClick);

  await startNewGame();
}

async function startNewGame() {
  // Reset board
  board = INITIAL_BOARD.map(row => [...row]);
  selectedCell = null;
  legalMoves = [];
  waitingForAI = false;
  gameOver = false;
  retryCount = 0;
  drawBoard();

  // Clean up old session and mount fresh chat panel
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
    onSessionCreated: (sid) => {
      const url = new URL(window.location);
      url.searchParams.set('session', sid);
      history.replaceState(null, '', url);
    },
    onStreamEnd: handleStreamEnd,
  });

  // Wait for iframe to load, then show welcome
  setTimeout(() => {
    chat.addMessage('ai', 'Welcome! This is Chinese Chess (象棋). You play Red (bottom), I play Black. Click a piece to select it — green dots show where it can go. Your move first!');
  }, 500);
}

function updateScoreDisplay() {
  scoreDisplay.textContent = `${scorePlayer} : ${scoreAI}`;
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
  const isWin = winner === 'player';
  const isDraw = winner === 'draw';

  if (isWin) {
    scorePlayer++;
  } else if (!isDraw) {
    scoreAI++;
  }
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

// ── Move Animation ────────────────────────────────────────────────

/** Animate a piece sliding from [fromR,fromC] to [toR,toC], then call callback. */
function animateMove(fromR, fromC, toR, toC, piece, callback) {
  const x0 = MARGIN + fromC * CELL;
  const y0 = MARGIN + fromR * CELL;
  const x1 = MARGIN + toC * CELL;
  const y1 = MARGIN + toR * CELL;
  const duration = 200; // ms
  const start = performance.now();

  // Temporarily remove piece from board so drawBoard doesn't draw it at origin
  const origFrom = board[fromR][fromC];
  const origTo = board[toR][toC];
  board[fromR][fromC] = '.';

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t * (2 - t);
    const cx = x0 + (x1 - x0) * ease;
    const cy = y0 + (y1 - y0) * ease;

    drawBoard();
    drawPieceAt(cx, cy, piece);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      board[fromR][fromC] = origFrom;
      board[toR][toC] = origTo;
      callback();
    }
  }
  requestAnimationFrame(frame);
}

/** Draw a piece at arbitrary canvas coordinates (for animation). */
function drawPieceAt(x, y, piece) {
  const isRedPiece = piece === piece.toUpperCase();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.arc(x, y, PIECE_R, 0, Math.PI * 2);
  ctx.fillStyle = '#fdf6e3';
  ctx.fill();
  ctx.strokeStyle = isRedPiece ? '#c0392b' : '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowColor = 'transparent';

  ctx.beginPath();
  ctx.arc(x, y, PIECE_R - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isRedPiece ? '#c0392b' : '#1a1a1a';
  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PIECE_NAMES[piece] || piece, x, y + 1);
  ctx.restore();
}

// ── Board Rendering ────────────────────────────────────────────────

function drawBoard() {
  updateTurnIndicator();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#f0d9b5';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;

  for (let r = 0; r < ROWS; r++) {
    const y = MARGIN + r * CELL;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(MARGIN + (COLS - 1) * CELL, y);
    ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    const x = MARGIN + c * CELL;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN);
    ctx.lineTo(x, MARGIN + 4 * CELL);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, MARGIN + 5 * CELL);
    ctx.lineTo(x, MARGIN + 9 * CELL);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(MARGIN, MARGIN + 4 * CELL);
  ctx.lineTo(MARGIN, MARGIN + 5 * CELL);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN + 8 * CELL, MARGIN + 4 * CELL);
  ctx.lineTo(MARGIN + 8 * CELL, MARGIN + 5 * CELL);
  ctx.stroke();

  ctx.strokeStyle = '#666';
  for (const [r1, c1, r2, c2] of [[0,3,2,5],[2,3,0,5],[7,3,9,5],[9,3,7,5]]) {
    ctx.beginPath();
    ctx.moveTo(MARGIN + c1 * CELL, MARGIN + r1 * CELL);
    ctx.lineTo(MARGIN + c2 * CELL, MARGIN + r2 * CELL);
    ctx.stroke();
  }

  ctx.fillStyle = '#666';
  ctx.font = '26px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = MARGIN + 4.5 * CELL;
  ctx.fillText('楚 河', MARGIN + 2 * CELL, riverY);
  ctx.fillText('汉 界', MARGIN + 6 * CELL, riverY);

  if (selectedCell) {
    const [sr, sc] = selectedCell;
    ctx.fillStyle = 'rgba(233, 69, 96, 0.3)';
    ctx.beginPath();
    ctx.arc(MARGIN + sc * CELL, MARGIN + sr * CELL, PIECE_R + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const [mr, mc] of legalMoves) {
    const piece = board[mr][mc];
    if (piece !== '.') {
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(MARGIN + mc * CELL, MARGIN + mr * CELL, PIECE_R + 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(233, 69, 96, 0.5)';
      ctx.beginPath();
      ctx.arc(MARGIN + mc * CELL, MARGIN + mr * CELL, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p === '.') continue;
      drawPiece(r, c, p);
    }
  }
}

function drawPiece(row, col, piece) {
  const x = MARGIN + col * CELL;
  const y = MARGIN + row * CELL;
  const isRedPiece = piece === piece.toUpperCase();

  ctx.beginPath();
  ctx.arc(x, y, PIECE_R, 0, Math.PI * 2);
  ctx.fillStyle = '#fdf6e3';
  ctx.fill();
  ctx.strokeStyle = isRedPiece ? '#c0392b' : '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, PIECE_R - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isRedPiece ? '#c0392b' : '#1a1a1a';
  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PIECE_NAMES[piece] || piece, x, y + 1);
}

// ── Board Click Handling ───────────────────────────────────────────

function onBoardClick(e) {
  if (waitingForAI || gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const col = Math.round((mx - MARGIN) / CELL);
  const row = Math.round((my - MARGIN) / CELL);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

  const piece = board[row][col];

  if (selectedCell) {
    if (legalMoves.some(([r, c]) => r === row && c === col)) {
      makeUserMove(selectedCell[0], selectedCell[1], row, col);
      return;
    }
    if (piece !== '.' && isRed(piece)) {
      selectedCell = [row, col];
      legalMoves = getLegalMoves(board, row, col);
      drawBoard();
      return;
    }
    selectedCell = null;
    legalMoves = [];
    drawBoard();
    return;
  }

  if (piece !== '.' && isRed(piece)) {
    selectedCell = [row, col];
    legalMoves = getLegalMoves(board, row, col);
    drawBoard();
  }
}

function isRed(piece) { return piece !== '.' && piece === piece.toUpperCase(); }
function isBlack(piece) { return piece !== '.' && piece === piece.toLowerCase(); }
function isOwn(piece, red) { return red ? isRed(piece) : isBlack(piece); }
function isEnemy(piece, red) { return red ? isBlack(piece) : isRed(piece); }

async function makeUserMove(fromR, fromC, toR, toC) {
  const movingPiece = board[fromR][fromC];
  const capturedPiece = board[toR][toC] !== '.' ? board[toR][toC] : null;

  selectedCell = null;
  legalMoves = [];
  waitingForAI = true;

  await new Promise(resolve => {
    animateMove(fromR, fromC, toR, toC, movingPiece, resolve);
  });

  board[toR][toC] = movingPiece;
  board[fromR][fromC] = '.';
  drawBoard();

  if (checkKingCaptured()) return;

  const blackHasMoves = hasAnyLegalMove(board, false);
  if (!blackHasMoves) {
    const inCheck = isKingInCheck(board, false);
    gameOver = true;
    waitingForAI = false;
    const msg = inCheck ? 'Checkmate! You win!' : 'Stalemate — draw!';
    chat.addMessage('system', msg);
    showGameOverOverlay(inCheck ? 'player' : 'draw');
    return;
  }

  // Show user's move in chat
  const userMoveDesc = capturedPiece
    ? `${PIECE_NAMES[movingPiece] || movingPiece} [${fromR},${fromC}] → [${toR},${toC}] captures ${PIECE_NAMES[capturedPiece] || capturedPiece}`
    : `${PIECE_NAMES[movingPiece] || movingPiece} [${fromR},${fromC}] → [${toR},${toC}]`;
  chat.addMessage('user', userMoveDesc);

  // Build board message
  const boardStr = boardToString(board);
  const message = buildBoardMessage(userMoveDesc, boardStr);

  isBoardMove = true;
  chat.send(message);
}

// ── Assist Level Message Builders ─────────────────────────────────

function buildBoardMessage(userMoveDesc, boardStr) {
  if (assistLevel === 1) return buildBoardMessageL1(userMoveDesc, boardStr);
  if (assistLevel === 3) return buildBoardMessageL3(userMoveDesc, boardStr);
  return buildBoardMessageL2(userMoveDesc, boardStr);
}

function buildBoardMessageL1(userMoveDesc, boardStr) {
  const checkWarning = isKingInCheck(board, false)
    ? '\n⚠️ **YOUR KING IS IN CHECK — you must resolve it this move!**'
    : '';
  return `[BOARD_MOVE]
## Chinese Chess (Xiangqi)
You play BLACK (lowercase). I play RED (uppercase).
10×9 board. Row 0=top, Row 9=bottom.
K/k=King, A/a=Advisor, E/e=Elephant, R/r=Rook, H/h=Horse, C/c=Cannon, P/p=Pawn. .=empty.

### Board
${boardStr}

### My Move
${userMoveDesc}${checkWarning}

Write analysis (1-2 sentences), then:
[MOVE]{"from":[r,c],"to":[r,c]}[/MOVE]`;
}

function buildBoardMessageL2(userMoveDesc, boardStr) {
  const material = materialSummary(board);
  const myThreats = threatenedPieces(board, false);
  const enemyThreats = threatenedPieces(board, true);

  return `[BOARD_MOVE]
## Chinese Chess (Xiangqi)
You play BLACK (lowercase). I play RED (uppercase).

### Rules
- 10×9 board. Row 0=top (Black), Row 9=bottom (Red).
- K=King, A=Advisor, E=Elephant, R=Rook, H=Horse, C=Cannon, P=Pawn.
  Uppercase=Red, lowercase=Black, .=empty.
- Piece values: R=9, C=4.5, H=4, A=2, E=2, P=1.
- King: 1 orthogonal, palace only. No flying general (kings facing).
- Advisor: 1 diagonal, palace only.
- Elephant: 2 diagonal (田), no river cross, blocked if 田-center occupied.
- Rook: any orthogonal.
- Horse: L-shape (日), blocked if adjacent orthogonal occupied.
- Cannon: moves like Rook, captures by jumping over exactly 1 piece.
- Pawn: before river 1 forward; after river also left/right. Never backward.

### Board
${boardStr}

### Material
${material}

### My Move
${userMoveDesc}
${isKingInCheck(board, false) ? '\n⚠️ **YOUR KING IS IN CHECK — you must resolve it this move!**' : ''}
${myThreats.length > 0 ? `\n### Your Pieces Under Threat\n${myThreats.join('\n')}` : ''}
${enemyThreats.length > 0 ? `\n### My Pieces You Can Target\n${enemyThreats.join('\n')}` : ''}

### Your Legal Moves
${legalMovesForSide(board, false)}

### Think Before You Move
Analyze the position step by step:
1. Check threats — are any of your pieces attacked? What did the opponent's last move threaten?
2. Look at captures — can you win material? Will your piece be safe after capturing?
3. Look for checks, forks (one piece attacking two), and pins.
4. Consider your opponent's responses — don't hang pieces.
5. If no tactics exist, improve your position (develop rooks, advance pawns across river, centralize horses).

Write your analysis (2-3 sentences), then your move:
[MOVE]{"from":[r,c],"to":[r,c]}[/MOVE]`;
}

function buildBoardMessageL3(userMoveDesc, boardStr) {
  const material = materialSummary(board);
  const myThreats = threatenedPieces(board, false);
  const enemyThreats = threatenedPieces(board, true);

  // Minimax engine — compute top 3 moves
  const topMoves = engineTopMoves(board, 3, 3);
  const engineSection = topMoves.length > 0
    ? topMoves.map((m, i) => `${i + 1}. ${m.desc}  (score: ${m.score > 0 ? '+' : ''}${m.score})`).join('\n')
    : '(no moves available)';

  // L3-specific analyses
  const blackMobility = computeMobilityTable(board, false);
  const redMobility = computeMobilityTable(board, true);
  const blackKingSafety = computeKingSafety(board, false);
  const redKingSafety = computeKingSafety(board, true);
  const centerControl = computeCenterControl(board);
  const pinnedBlack = findPins(board, false);
  const pinnedRed = findPins(board, true);
  const blackCaptures = evaluateCaptures(board, false);
  const tacticalPatterns = findTacticalPatterns(board, false);

  // Format mobility
  const mobDiff = blackMobility.totalMobility - redMobility.totalMobility;
  const mobSign = mobDiff >= 0 ? '+' : '';
  let mobilityStr = `Black total: ${blackMobility.totalMobility} | Red total: ${redMobility.totalMobility} (Black ${mobSign}${mobDiff})`;
  for (const entry of blackMobility.pieces) {
    const ratio = `${entry.moves}/${entry.maxMoves}`;
    let note = '';
    if (entry.moves <= 1) note = ' — trapped';
    else if (entry.moves <= entry.maxMoves * 0.3) note = ' — restricted';
    mobilityStr += `\n  ${PIECE_NAMES[entry.pieceChar] || entry.pieceChar}(${entry.pieceChar})[${entry.pos[0]},${entry.pos[1]}]: ${ratio}${note}`;
  }

  // Format king safety
  let kingSafetyStr = `Black: ${blackKingSafety.score}/10 | Red: ${redKingSafety.score}/10`;
  if (blackKingSafety.issues.length > 0) kingSafetyStr += `\n  Black issues: ${blackKingSafety.issues.join(', ')}`;
  if (redKingSafety.issues.length > 0) kingSafetyStr += `\n  Red issues: ${redKingSafety.issues.join(', ')}`;

  // Format center control
  const ccDiff = centerControl.black - centerControl.red;
  const ccAdv = ccDiff > 0 ? 'Black advantage' : ccDiff < 0 ? 'Red advantage' : 'Equal';
  const centerStr = `Black: ${centerControl.black} | Red: ${centerControl.red} (${ccAdv})`;

  // Format pins
  let pinsStr = '';
  const allPins = [...pinnedBlack.map(p => ({...p, side: 'Black'})), ...pinnedRed.map(p => ({...p, side: 'Red'}))];
  if (allPins.length > 0) {
    pinsStr = `\n\n### Pinned Pieces (do NOT move)\n`;
    for (const pin of allPins) {
      pinsStr += `  ${PIECE_NAMES[pin.pieceChar] || pin.pieceChar}(${pin.pieceChar})[${pin.pos[0]},${pin.pos[1]}] pinned — ${pin.pinnerDesc}\n`;
    }
  }

  // Format captures
  let capturesStr = '';
  if (blackCaptures.length > 0) {
    const safe = blackCaptures.filter(c => c.safe);
    const unsafe = blackCaptures.filter(c => !c.safe);
    capturesStr = '\n\n### Captures Available';
    for (const c of safe) {
      capturesStr += `\n  Safe: ${PIECE_NAMES[c.piece] || c.piece}(${c.piece})[${c.from[0]},${c.from[1]}] captures ${PIECE_NAMES[c.captured] || c.captured}(${c.captured})[${c.to[0]},${c.to[1]}]: ${c.delta >= 0 ? '+' : ''}${c.delta}`;
    }
    for (const c of unsafe) {
      capturesStr += `\n  Unsafe: ${PIECE_NAMES[c.piece] || c.piece}(${c.piece})[${c.from[0]},${c.from[1]}] captures ${PIECE_NAMES[c.captured] || c.captured}(${c.captured})[${c.to[0]},${c.to[1]}]: ${c.delta >= 0 ? '+' : ''}${c.delta}`;
    }
  }

  // Format tactical patterns
  let tacticsStr = '';
  if (tacticalPatterns.length > 0) {
    tacticsStr = '\n\n### Tactical Patterns';
    for (const t of tacticalPatterns) {
      tacticsStr += `\n  ${t}`;
    }
  }

  return `[BOARD_MOVE]
## Chinese Chess (Xiangqi)
You play BLACK (lowercase). I play RED (uppercase).

### Rules
- 10×9 board. Row 0=top (Black), Row 9=bottom (Red).
- K=King, A=Advisor, E=Elephant, R=Rook, H=Horse, C=Cannon, P=Pawn.
  Uppercase=Red, lowercase=Black, .=empty.
- Piece values: R=9, C=4.5, H=4, A=2, E=2, P=1.
- King: 1 orthogonal, palace only. No flying general (kings facing).
- Advisor: 1 diagonal, palace only.
- Elephant: 2 diagonal (田), no river cross, blocked if 田-center occupied.
- Rook: any orthogonal.
- Horse: L-shape (日), blocked if adjacent orthogonal occupied.
- Cannon: moves like Rook, captures by jumping over exactly 1 piece.
- Pawn: before river 1 forward; after river also left/right. Never backward.

### Board
${boardStr}

### Material
${material}

### My Move
${userMoveDesc}
${isKingInCheck(board, false) ? '\n⚠️ **YOUR KING IS IN CHECK — you must resolve it this move!**' : ''}
${myThreats.length > 0 ? `\n### Your Pieces Under Threat\n${myThreats.join('\n')}` : ''}
${enemyThreats.length > 0 ? `\n### My Pieces You Can Target\n${enemyThreats.join('\n')}` : ''}

### Your Legal Moves
${legalMovesForSide(board, false)}

### Mobility
${mobilityStr}

### King Safety
${kingSafetyStr}

### Center Control
${centerStr}${pinsStr}${capturesStr}${tacticsStr}

### ⭐ Engine Recommended Moves (depth-3 search)
${engineSection}

You SHOULD pick one of the engine-recommended moves above.
Write 1-2 sentences explaining your choice, then:
[MOVE]{"from":[r,c],"to":[r,c]}[/MOVE]`;
}

// ── L3 Analysis Functions ─────────────────────────────────────────

const MAX_MOVES = { R: 17, H: 8, C: 17, A: 4, E: 4, K: 4, P: 3 };

function computeMobilityTable(b, red) {
  const pieces = [];
  let totalMobility = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      const type = p.toUpperCase();
      if (type === 'K') continue; // skip king for mobility
      const moves = getLegalMoves(b, r, c);
      const maxMoves = MAX_MOVES[type] || 4;
      pieces.push({ piece: type, pieceChar: p, pos: [r, c], moves: moves.length, maxMoves });
      totalMobility += moves.length;
    }
  }
  return { pieces, totalMobility };
}

function computeKingSafety(b, red) {
  let score = 10;
  const issues = [];

  // Find king position
  const kingChar = red ? 'K' : 'k';
  let kr = -1, kc = -1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c] === kingChar) { kr = r; kc = c; }
    }
  }
  if (kr < 0) return { score: 0, issues: ['King not found'] };

  // Count advisors and elephants
  const advisorChar = red ? 'A' : 'a';
  const elephantChar = red ? 'E' : 'e';
  let advisors = 0, elephants = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c] === advisorChar) advisors++;
      if (b[r][c] === elephantChar) elephants++;
    }
  }
  if (advisors === 0) { score -= 3; issues.push('Both advisors lost'); }
  else if (advisors === 1) { score -= 1; issues.push('One advisor lost'); }
  if (elephants === 0) { score -= 2; issues.push('Both elephants lost'); }
  else if (elephants === 1) { score -= 1; issues.push('One elephant lost'); }

  // Check enemy rook on same column as king
  const enemyRookChar = red ? 'r' : 'R';
  for (let r = 0; r < ROWS; r++) {
    if (b[r][kc] === enemyRookChar) {
      let blocked = false;
      const minR = Math.min(r, kr), maxR = Math.max(r, kr);
      for (let mr = minR + 1; mr < maxR; mr++) {
        if (b[mr][kc] !== '.') { blocked = true; break; }
      }
      if (!blocked) { score -= 3; issues.push("Rook on king's file (open)"); }
      else { score -= 1; issues.push("Rook on king's file"); }
    }
  }

  // Check enemy cannon with jumping path to king
  const enemyCannonChar = red ? 'c' : 'C';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c] !== enemyCannonChar) continue;
      // Check same row
      if (r === kr) {
        let count = 0;
        const minC = Math.min(c, kc), maxC = Math.max(c, kc);
        for (let mc = minC + 1; mc < maxC; mc++) {
          if (b[r][mc] !== '.') count++;
        }
        if (count === 1) { score -= 2; issues.push(`Cannon at [${r},${c}] has jump path to king`); }
      }
      // Check same column
      if (c === kc) {
        let count = 0;
        const minR = Math.min(r, kr), maxR = Math.max(r, kr);
        for (let mr = minR + 1; mr < maxR; mr++) {
          if (b[mr][c] !== '.') count++;
        }
        if (count === 1) { score -= 2; issues.push(`Cannon at [${r},${c}] has jump path to king`); }
      }
    }
  }

  return { score: Math.max(0, score), issues };
}

function computeCenterControl(b) {
  let blackCount = 0, redCount = 0;
  // Center squares: rows 4-5, cols 3-5
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      const moves = getLegalMoves(b, r, c);
      for (const [tr, tc] of moves) {
        if (tr >= 4 && tr <= 5 && tc >= 3 && tc <= 5) {
          if (isBlack(p)) blackCount++;
          else if (isRed(p)) redCount++;
          break; // count piece once, not per target square
        }
      }
    }
  }
  return { black: blackCount, red: redCount };
}

function findPins(b, red) {
  const pins = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      if (p.toUpperCase() === 'K') continue; // skip king itself

      // Check if king is currently not in check
      if (isKingInCheck(b, red)) continue;

      // Temporarily remove piece and check if king becomes exposed
      const saved = b[r][c];
      b[r][c] = '.';
      const exposed = isKingInCheck(b, red);
      b[r][c] = saved;

      if (exposed) {
        // Find the pinner — look for enemy piece that now attacks the king
        let pinnerDesc = 'moving exposes king';
        const kingChar = red ? 'K' : 'k';
        let kr2 = -1, kc2 = -1;
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            if (b[rr][cc] === kingChar) { kr2 = rr; kc2 = cc; }
          }
        }
        if (kr2 >= 0) {
          b[r][c] = '.'; // temporarily remove again to find pinner
          for (let er = 0; er < ROWS; er++) {
            for (let ec = 0; ec < COLS; ec++) {
              const ep = b[er][ec];
              if (ep === '.' || !isEnemy(ep, red)) continue;
              const type = ep.toUpperCase();
              let attacks = [];
              const enemyRed = !red;
              switch (type) {
                case 'R': attacks = rookMoves(b, er, ec, enemyRed); break;
                case 'C': attacks = cannonMoves(b, er, ec, enemyRed); break;
                case 'H': attacks = horseMoves(b, er, ec, enemyRed); break;
              }
              if (attacks.some(([ar, ac]) => ar === kr2 && ac === kc2)) {
                pinnerDesc = `moving exposes king to ${PIECE_NAMES[ep] || ep}(${ep})[${er},${ec}]`;
                break;
              }
            }
          }
          b[r][c] = saved;
        }
        pins.push({ piece: p.toUpperCase(), pieceChar: p, pos: [r, c], pinnerDesc });
      }
    }
  }
  return pins;
}

function evaluateCaptures(b, red) {
  const captures = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      const moves = getLegalMoves(b, r, c);
      for (const [tr, tc] of moves) {
        const target = b[tr][tc];
        if (target === '.' || !isEnemy(target, red)) continue;
        const capturedValue = PIECE_VALUES[target.toUpperCase()] || 0;
        const captorValue = PIECE_VALUES[p.toUpperCase()] || 0;

        // Simple SEE: check if captor would be recaptured
        const savedFrom = b[r][c];
        const savedTo = b[tr][tc];
        b[tr][tc] = p;
        b[r][c] = '.';
        // Check if any enemy can recapture at [tr,tc]
        let recaptured = false;
        for (let er = 0; er < ROWS; er++) {
          for (let ec = 0; ec < COLS; ec++) {
            const ep = b[er][ec];
            if (ep === '.' || !isEnemy(ep, red)) continue;
            const eMoves = getLegalMoves(b, er, ec);
            if (eMoves.some(([mr, mc]) => mr === tr && mc === tc)) {
              recaptured = true;
              break;
            }
          }
          if (recaptured) break;
        }
        b[r][c] = savedFrom;
        b[tr][tc] = savedTo;

        const delta = recaptured ? capturedValue - captorValue : capturedValue;
        captures.push({
          piece: p,
          from: [r, c],
          to: [tr, tc],
          captured: target,
          capturedValue,
          captorValue,
          delta,
          safe: !recaptured || delta >= 0,
        });
      }
    }
  }
  // Sort: safe first, then by delta descending
  captures.sort((a, b2) => {
    if (a.safe !== b2.safe) return a.safe ? -1 : 1;
    return b2.delta - a.delta;
  });
  return captures;
}

function findTacticalPatterns(b, red) {
  const patterns = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      const moves = getLegalMoves(b, r, c);

      for (const [tr, tc] of moves) {
        // Check for forks: after moving to [tr,tc], how many enemy pieces are attacked?
        const savedFrom = b[r][c];
        const savedTo = b[tr][tc];
        b[tr][tc] = p;
        b[r][c] = '.';

        const attacked = [];
        // Get moves from new position
        const newMoves = getLegalMoves(b, tr, tc);
        for (const [ar, ac] of newMoves) {
          const target = b[ar][ac];
          if (target !== '.' && isEnemy(target, red) && target.toUpperCase() !== 'P') {
            attacked.push({ piece: target, pos: [ar, ac] });
          }
        }

        if (attacked.length >= 2) {
          const targets = attacked.map(a => `${PIECE_NAMES[a.piece] || a.piece}(${a.piece})[${a.pos[0]},${a.pos[1]}]`).join(' and ');
          patterns.push(`FORK: ${PIECE_NAMES[p] || p}(${p})[${r},${c}] → [${tr},${tc}] attacks ${targets}`);
        }

        // Check for discovery: does moving this piece reveal an attack by a piece behind it?
        // Look for friendly pieces that now attack new enemy targets they didn't before
        for (let fr = 0; fr < ROWS; fr++) {
          for (let fc = 0; fc < COLS; fc++) {
            const fp = b[fr][fc];
            if (fp === '.' || (fr === tr && fc === tc)) continue;
            if (red ? !isRed(fp) : !isBlack(fp)) continue;
            const type = fp.toUpperCase();
            if (type !== 'R' && type !== 'C') continue; // only sliding pieces create discoveries

            const newAttacks = getLegalMoves(b, fr, fc);
            // Restore to check old attacks
            b[r][c] = savedFrom;
            b[tr][tc] = savedTo;
            const oldAttacks = getLegalMoves(b, fr, fc);
            // Put back
            b[tr][tc] = p;
            b[r][c] = '.';

            for (const [na_r, na_c] of newAttacks) {
              const target = b[na_r][na_c];
              if (target === '.' || !isEnemy(target, red)) continue;
              if (target.toUpperCase() === 'P') continue;
              // Was this target already attacked before the move?
              const wasAttacked = oldAttacks.some(([oa_r, oa_c]) => oa_r === na_r && oa_c === na_c);
              if (!wasAttacked) {
                patterns.push(`DISCOVERY: ${PIECE_NAMES[p] || p}(${p})[${r},${c}] → [${tr},${tc}] reveals ${PIECE_NAMES[fp] || fp}(${fp})[${fr},${fc}] attack on ${PIECE_NAMES[target] || target}(${target})[${na_r},${na_c}]`);
              }
            }
          }
        }

        b[r][c] = savedFrom;
        b[tr][tc] = savedTo;
      }
    }
  }

  // Deduplicate
  return [...new Set(patterns)];
}

function boardToString(b) {
  return b.map(row => row.join(' ')).join('\n');
}

const PIECE_VALUES = { K: 0, A: 2, E: 2, R: 9, H: 4, C: 4.5, P: 1 };

function legalMovesForSide(b, red) {
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.' || isOwn(p, !red)) continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      const moves = getLegalMoves(b, r, c);
      if (moves.length === 0) continue;
      const name = PIECE_NAMES[p] || p;
      const targets = moves.map(([tr, tc]) => {
        const target = b[tr][tc];
        if (target !== '.' && isEnemy(target, red)) {
          const capName = PIECE_NAMES[target] || target;
          return `[${tr},${tc}](captures ${capName})`;
        }
        return `[${tr},${tc}]`;
      }).join(' ');
      lines.push(`${name}(${p}) at [${r},${c}] → ${targets}`);
    }
  }
  return lines.join('\n');
}

function materialSummary(b) {
  let redVal = 0, blackVal = 0;
  const redPieces = [], blackPieces = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      const v = PIECE_VALUES[p.toUpperCase()] || 0;
      const name = PIECE_NAMES[p] || p;
      if (isRed(p)) { redVal += v; redPieces.push(name); }
      else { blackVal += v; blackPieces.push(name); }
    }
  }
  const diff = blackVal - redVal;
  const advantage = diff > 1 ? 'Black ahead' : diff < -1 ? 'Red ahead' : 'Roughly equal';
  return `Red(${redVal}): ${redPieces.join(' ')}  |  Black(${blackVal}): ${blackPieces.join(' ')}  [${advantage}]`;
}

function threatenedPieces(b, red) {
  const threats = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.' || isOwn(p, !red)) continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      for (let er = 0; er < ROWS; er++) {
        for (let ec = 0; ec < COLS; ec++) {
          const ep = b[er][ec];
          if (ep === '.' || !isEnemy(ep, red)) continue;
          const eMoves = getLegalMoves(b, er, ec);
          if (eMoves.some(([tr, tc]) => tr === r && tc === c)) {
            const name = PIECE_NAMES[p] || p;
            const attacker = PIECE_NAMES[ep] || ep;
            threats.push(`${name} at [${r},${c}] threatened by ${attacker} at [${er},${ec}]`);
            break;
          }
        }
      }
    }
  }
  return threats;
}

function pickFallbackMove(b) {
  let best = null;
  let bestScore = -Infinity;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!isBlack(p)) continue;
      const moves = getLegalMoves(b, r, c);
      for (const [tr, tc] of moves) {
        let score = 0;
        const target = b[tr][tc];
        if (target !== '.' && isRed(target)) {
          score += (PIECE_VALUES[target.toUpperCase()] || 0) * 10;
        }
        const saved = b[tr][tc];
        b[tr][tc] = p; b[r][c] = '.';
        const endangered = threatenedPieces(b, false)
          .some(t => t.startsWith(`${PIECE_NAMES[p] || p} at [${tr},${tc}]`));
        b[r][c] = p; b[tr][tc] = saved;
        if (endangered) score -= (PIECE_VALUES[p.toUpperCase()] || 0) * 5;
        score += Math.random() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = [r, c, tr, tc];
        }
      }
    }
  }
  return best;
}

function hasAnyLegalMove(b, red) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      if (getLegalMoves(b, r, c).length > 0) return true;
    }
  }
  return false;
}

function checkKingCaptured() {
  let redKing = false, blackKing = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === 'K') redKing = true;
      if (board[r][c] === 'k') blackKing = true;
    }
  }
  if (!blackKing) {
    gameOver = true;
    waitingForAI = false;
    isBoardMove = false;
    chat.addMessage('system', 'You captured the general! You win!');
    drawBoard();
    showGameOverOverlay('player');
    return true;
  }
  if (!redKing) {
    gameOver = true;
    waitingForAI = false;
    isBoardMove = false;
    chat.addMessage('system', 'Your general was captured. You lose.');
    drawBoard();
    showGameOverOverlay('ai');
    return true;
  }
  return false;
}

// ── AI Response Handling ──────────────────────────────────────────

function handleStreamEnd(text) {
  if (!isBoardMove) return; // regular chat — iframe handles display
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  handleAIResponse(text);
}

/** Returns true if a retry was triggered. */
function handleAIResponse(text) {
  const moveMatch = text.match(/\[MOVE\]([\s\S]*?)\[\/MOVE\]/);
  if (!moveMatch) {
    retryIllegalMove('Response did not contain a [MOVE] tag. You must respond with a move.');
    return;
  }

  let fromR, fromC, toR, toC;
  let errorReason = '';
  let moveDesc = '';
  try {
    const move = JSON.parse(moveMatch[1].trim());
    [fromR, fromC] = move.from;
    [toR, toC] = move.to;

    if (fromR >= 0 && fromR < ROWS && fromC >= 0 && fromC < COLS &&
        toR >= 0 && toR < ROWS && toC >= 0 && toC < COLS &&
        isBlack(board[fromR][fromC])) {
      const legal = getLegalMoves(board, fromR, fromC);
      if (legal.some(([r, c]) => r === toR && c === toC)) {
        const pieceName = PIECE_NAMES[board[fromR][fromC]] || board[fromR][fromC];
        const captured = board[toR][toC] !== '.' ? PIECE_NAMES[board[toR][toC]] || board[toR][toC] : null;
        moveDesc = captured
          ? `${pieceName} [${fromR},${fromC}] → [${toR},${toC}] captures ${captured}`
          : `${pieceName} [${fromR},${fromC}] → [${toR},${toC}]`;
      } else {
        const pn = PIECE_NAMES[board[fromR][fromC]] || board[fromR][fromC];
        errorReason = `Illegal move: ${pn} [${fromR},${fromC}] → [${toR},${toC}] is not a legal move for that piece.`;
      }
    } else {
      errorReason = `Invalid move: no black piece at [${move.from}].`;
    }
  } catch {
    errorReason = 'Failed to parse [MOVE] JSON.';
  }

  if (errorReason) {
    retryIllegalMove(errorReason);
    return;
  }

  // Valid move — animate then apply
  const piece = board[fromR][fromC];
  retryCount = 0;

  let commentary = text.replace(/\[MOVE\][\s\S]*?\[\/MOVE\]/, '').trim();
  if (commentary) {
    const firstSentence = commentary.match(/^[^.!?]*[.!?]/);
    commentary = firstSentence ? firstSentence[0].trim() : commentary.slice(0, 80);
  }

  animateMove(fromR, fromC, toR, toC, piece, () => {
    board[toR][toC] = piece;
    board[fromR][fromC] = '.';
    drawBoard();
    checkKingCaptured();

    const aiMsg = commentary ? `${moveDesc} — ${commentary}` : moveDesc;
    chat.addMessage('ai', aiMsg);

    if (!gameOver && !hasAnyLegalMove(board, true)) {
      const inCheck = isKingInCheck(board, true);
      gameOver = true;
      const msg = inCheck ? 'Checkmate! AI wins!' : 'Stalemate — draw!';
      chat.addMessage('system', msg);
      showGameOverOverlay(inCheck ? 'ai' : 'draw');
    }
    waitingForAI = false;
    isBoardMove = false;
  });
}

async function retryIllegalMove(reason) {
  retryCount++;
  if (retryCount > MAX_RETRIES) {
    retryCount = 0;
    const fallback = pickFallbackMove(board);
    if (fallback) {
      const [fr, fc, tr, tc] = fallback;
      const piece = board[fr][fc];
      const name = PIECE_NAMES[piece] || piece;
      animateMove(fr, fc, tr, tc, piece, () => {
        board[tr][tc] = piece;
        board[fr][fc] = '.';
        drawBoard();
        chat.addMessage('ai', `${name} [${fr},${fc}] → [${tr},${tc}]`);
        checkKingCaptured();
        waitingForAI = false;
        isBoardMove = false;
      });
    } else {
      gameOver = true;
      waitingForAI = false;
      isBoardMove = false;
      chat.addMessage('system', 'Black has no legal moves. You win!');
      showGameOverOverlay('player');
    }
    return;
  }

  chat.addMessage('system', `AI made an invalid move (attempt ${retryCount}/${MAX_RETRIES}). Asking to retry...`);

  const boardStr = boardToString(board);
  const message = `[BOARD_MOVE]
[INVALID_MOVE] ${reason}

Your previous move was ILLEGAL. You MUST try again with a valid move.

### Current Board
${boardStr}

### Your Legal Moves
${legalMovesForSide(board, false)}

Pick one move from the list above. Respond ONLY with [MOVE]{"from":[row,col],"to":[row,col]}[/MOVE]. No commentary.`;

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (retryCount > 0) {
      retryIllegalMove(reason);
    }
  }, 30000);

  chat.send(message);
}

// ── Move Validation ────────────────────────────────────────────────

function getLegalMoves(b, row, col) {
  const piece = b[row][col];
  if (piece === '.') return [];
  const red = isRed(piece);
  const type = piece.toUpperCase();
  let candidates = [];

  switch (type) {
    case 'K': candidates = kingMoves(b, row, col, red); break;
    case 'A': candidates = advisorMoves(b, row, col, red); break;
    case 'E': candidates = elephantMoves(b, row, col, red); break;
    case 'R': candidates = rookMoves(b, row, col, red); break;
    case 'H': candidates = horseMoves(b, row, col, red); break;
    case 'C': candidates = cannonMoves(b, row, col, red); break;
    case 'P': candidates = pawnMoves(b, row, col, red); break;
  }

  candidates = candidates.filter(([r, c]) => !isOwn(b[r][c], red));

  return candidates.filter(([toR, toC]) => {
    const saved = b[toR][toC];
    b[toR][toC] = b[row][col];
    b[row][col] = '.';
    const inCheck = isKingInCheck(b, red);
    b[row][col] = b[toR][toC];
    b[toR][toC] = saved;
    return !inCheck;
  });
}

function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

function isKingInCheck(b, red) {
  const kingChar = red ? 'K' : 'k';
  let kr = -1, kc = -1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c] === kingChar) { kr = r; kc = c; break; }
    }
    if (kr >= 0) break;
  }
  if (kr < 0) return true;

  const enemyKing = red ? 'k' : 'K';
  for (let r = 0; r < ROWS; r++) {
    if (b[r][kc] === enemyKing) {
      let blocked = false;
      const minR = Math.min(r, kr), maxR = Math.max(r, kr);
      for (let mr = minR + 1; mr < maxR; mr++) {
        if (b[mr][kc] !== '.') { blocked = true; break; }
      }
      if (!blocked) return true;
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.' || !isEnemy(p, red)) continue;
      const enemyRed = !red;
      const type = p.toUpperCase();
      let attacks = [];
      switch (type) {
        case 'R': attacks = rookMoves(b, r, c, enemyRed); break;
        case 'H': attacks = horseMoves(b, r, c, enemyRed); break;
        case 'C': attacks = cannonMoves(b, r, c, enemyRed); break;
        case 'P': attacks = pawnMoves(b, r, c, enemyRed); break;
        case 'K': attacks = kingPalaceMoves(b, r, c, enemyRed); break;
        case 'A': attacks = advisorMoves(b, r, c, enemyRed); break;
        case 'E': attacks = elephantMoves(b, r, c, enemyRed); break;
      }
      if (attacks.some(([ar, ac]) => ar === kr && ac === kc)) return true;
    }
  }
  return false;
}

function kingPalaceMoves(b, r, c, red) {
  const moves = [];
  const palace = red ? { rMin: 7, rMax: 9, cMin: 3, cMax: 5 } : { rMin: 0, rMax: 2, cMin: 3, cMax: 5 };
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= palace.rMin && nr <= palace.rMax && nc >= palace.cMin && nc <= palace.cMax) {
      moves.push([nr, nc]);
    }
  }
  return moves;
}

function kingMoves(b, r, c, red) {
  return kingPalaceMoves(b, r, c, red);
}

function advisorMoves(b, r, c, red) {
  const moves = [];
  const palace = red ? { rMin: 7, rMax: 9, cMin: 3, cMax: 5 } : { rMin: 0, rMax: 2, cMin: 3, cMax: 5 };
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= palace.rMin && nr <= palace.rMax && nc >= palace.cMin && nc <= palace.cMax) {
      moves.push([nr, nc]);
    }
  }
  return moves;
}

function elephantMoves(b, r, c, red) {
  const moves = [];
  for (const [dr, dc] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
    const nr = r + dr, nc = c + dc;
    const blockR = r + dr / 2, blockC = c + dc / 2;
    if (!inBounds(nr, nc)) continue;
    if (red && nr < 5) continue;
    if (!red && nr > 4) continue;
    if (b[blockR][blockC] !== '.') continue;
    moves.push([nr, nc]);
  }
  return moves;
}

function rookMoves(b, r, c, red) {
  const moves = [];
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (b[nr][nc] === '.') {
        moves.push([nr, nc]);
      } else {
        if (isEnemy(b[nr][nc], red)) moves.push([nr, nc]);
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function horseMoves(b, r, c, red) {
  const moves = [];
  const offsets = [
    [-2, -1, -1, 0], [-2, 1, -1, 0],
    [2, -1, 1, 0],   [2, 1, 1, 0],
    [-1, -2, 0, -1],  [-1, 2, 0, 1],
    [1, -2, 0, -1],   [1, 2, 0, 1],
  ];
  for (const [dr, dc, blockDr, blockDc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (b[r + blockDr][c + blockDc] !== '.') continue;
    moves.push([nr, nc]);
  }
  return moves;
}

function cannonMoves(b, r, c, red) {
  const moves = [];
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let nr = r + dr, nc = c + dc;
    let jumped = false;
    while (inBounds(nr, nc)) {
      if (!jumped) {
        if (b[nr][nc] === '.') {
          moves.push([nr, nc]);
        } else {
          jumped = true;
        }
      } else {
        if (b[nr][nc] !== '.') {
          if (isEnemy(b[nr][nc], red)) moves.push([nr, nc]);
          break;
        }
      }
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function pawnMoves(b, r, c, red) {
  const moves = [];
  if (red) {
    if (inBounds(r - 1, c)) moves.push([r - 1, c]);
    if (r <= 4) {
      if (inBounds(r, c - 1)) moves.push([r, c - 1]);
      if (inBounds(r, c + 1)) moves.push([r, c + 1]);
    }
  } else {
    if (inBounds(r + 1, c)) moves.push([r + 1, c]);
    if (r >= 5) {
      if (inBounds(r, c - 1)) moves.push([r, c - 1]);
      if (inBounds(r, c + 1)) moves.push([r, c + 1]);
    }
  }
  return moves;
}

// ── Minimax Engine ────────────────────────────────────────────────
// Alpha-beta search for Chinese Chess. Used in Strategist mode (L3)
// to give the LLM pre-computed best moves.

// Positional bonus tables (row-major, Black's perspective: row 0=top)
// Encourages pieces toward strong squares.
const POS_BONUS = {
  // Rook: prefer open files, central, and deep penetration
  R: [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [2,4,4,6,8,6,4,4,2],
    [2,4,6,8,10,8,6,4,2],
    [4,6,8,10,12,10,8,6,4],
    [4,6,8,10,12,10,8,6,4],
    [2,4,6,8,10,8,6,4,2],
  ],
  // Horse: central, across river is strong
  H: [
    [0,0,0,0,0,0,0,0,0],
    [0,0,2,4,4,4,2,0,0],
    [0,2,4,6,6,6,4,2,0],
    [0,2,6,8,8,8,6,2,0],
    [0,4,6,8,10,8,6,4,0],
    [0,4,8,10,12,10,8,4,0],
    [0,2,6,8,10,8,6,2,0],
    [0,0,4,6,8,6,4,0,0],
    [0,0,2,4,4,4,2,0,0],
    [0,0,0,0,0,0,0,0,0],
  ],
  // Cannon: middle files, behind pieces for jumping
  C: [
    [0,0,2,4,4,4,2,0,0],
    [0,0,2,4,6,4,2,0,0],
    [0,2,4,6,6,6,4,2,0],
    [0,2,4,6,6,6,4,2,0],
    [0,2,4,6,6,6,4,2,0],
    [2,4,6,8,10,8,6,4,2],
    [2,4,4,6,8,6,4,4,2],
    [0,2,2,4,6,4,2,2,0],
    [0,0,0,2,4,2,0,0,0],
    [0,0,0,0,2,0,0,0,0],
  ],
  // Pawn: strong after crossing river, central pawns are best
  P: [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [2,0,4,0,6,0,4,0,2],
    [4,0,6,0,8,0,6,0,4],
    [6,8,10,12,14,12,10,8,6],
    [10,12,14,16,18,16,14,12,10],
    [14,16,18,20,22,20,18,16,14],
    [18,18,20,22,24,22,20,18,18],
    [0,0,0,0,0,0,0,0,0],
  ],
  // Advisor / Elephant / King: minimal — just keep them in place
  A: [
    [0,0,0,2,0,2,0,0,0],
    [0,0,0,0,4,0,0,0,0],
    [0,0,0,2,0,2,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  ],
  E: [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [2,0,0,0,4,0,0,0,2],
    [0,0,0,0,0,0,0,0,0],
    [0,0,2,0,0,0,2,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  ],
  K: [
    [0,0,0,0,2,0,0,0,0],
    [0,0,0,2,4,2,0,0,0],
    [0,0,0,2,4,2,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  ],
};

/** Static evaluation: positive = good for Black, negative = good for Red. */
function evaluateBoard(b) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      const type = p.toUpperCase();
      const baseVal = (PIECE_VALUES[type] || 0) * 100; // scale up for precision
      const posTable = POS_BONUS[type];
      if (isBlack(p)) {
        // Black pieces: row 0 is home
        score += baseVal + (posTable ? posTable[r][c] : 0);
      } else {
        // Red pieces: mirror row (9-r) for positional bonus
        score -= baseVal + (posTable ? posTable[9 - r][c] : 0);
      }
    }
  }
  // Bonus for check — attacking is good
  if (isKingInCheck(b, true)) score += 30;  // Red in check = good for Black
  if (isKingInCheck(b, false)) score -= 30; // Black in check = bad for Black
  return score;
}

/** Generate all legal moves for one side. Returns [[fromR,fromC,toR,toC], ...] */
function allLegalMoves(b, red) {
  const moves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      if (red ? !isRed(p) : !isBlack(p)) continue;
      for (const [tr, tc] of getLegalMoves(b, r, c)) {
        moves.push([r, c, tr, tc]);
      }
    }
  }
  return moves;
}

/** Order moves for better alpha-beta pruning: captures first, sorted by MVV-LVA. */
function orderMoves(b, moves) {
  return moves.sort((a, b2) => {
    const capA = b[a[2]][a[3]];
    const capB = b[b2[2]][b2[3]];
    const valA = capA !== '.' ? (PIECE_VALUES[capA.toUpperCase()] || 0) : 0;
    const valB = capB !== '.' ? (PIECE_VALUES[capB.toUpperCase()] || 0) : 0;
    return valB - valA; // higher capture value first
  });
}

/**
 * Alpha-beta minimax search.
 * @param {string[][]} b - board
 * @param {number} depth - remaining depth
 * @param {number} alpha - best Black can guarantee
 * @param {number} beta - best Red can guarantee
 * @param {boolean} maximizing - true = Black's turn (maximize)
 * @returns {number} evaluation score
 */
function alphabeta(b, depth, alpha, beta, maximizing) {
  if (depth === 0) return evaluateBoard(b);

  const red = !maximizing; // maximizing=Black, minimizing=Red
  const moves = orderMoves(b, allLegalMoves(b, red));

  if (moves.length === 0) {
    // No legal moves — checkmate or stalemate
    if (isKingInCheck(b, red)) {
      return maximizing ? -99999 + (3 - depth) : 99999 - (3 - depth);
    }
    return 0; // stalemate
  }

  if (maximizing) {
    let best = -Infinity;
    for (const [fr, fc, tr, tc] of moves) {
      const savedFrom = b[fr][fc];
      const savedTo = b[tr][tc];
      b[tr][tc] = savedFrom;
      b[fr][fc] = '.';
      const val = alphabeta(b, depth - 1, alpha, beta, false);
      b[fr][fc] = savedFrom;
      b[tr][tc] = savedTo;
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break; // prune
    }
    return best;
  } else {
    let best = Infinity;
    for (const [fr, fc, tr, tc] of moves) {
      const savedFrom = b[fr][fc];
      const savedTo = b[tr][tc];
      b[tr][tc] = savedFrom;
      b[fr][fc] = '.';
      const val = alphabeta(b, depth - 1, alpha, beta, true);
      b[fr][fc] = savedFrom;
      b[tr][tc] = savedTo;
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break; // prune
    }
    return best;
  }
}

/**
 * Find the top N moves for Black using alpha-beta search.
 * @param {string[][]} b - board
 * @param {number} depth - search depth (3 recommended)
 * @param {number} topN - how many moves to return
 * @returns {Array<{from:[number,number], to:[number,number], score:number, desc:string}>}
 */
function engineTopMoves(b, depth = 3, topN = 3) {
  const moves = orderMoves(b, allLegalMoves(b, false)); // Black's moves
  const scored = [];

  for (const [fr, fc, tr, tc] of moves) {
    const piece = b[fr][fc];
    const captured = b[tr][tc];
    const savedFrom = b[fr][fc];
    const savedTo = b[tr][tc];
    b[tr][tc] = savedFrom;
    b[fr][fc] = '.';
    // After Black moves, it's Red's turn (minimizing)
    const score = alphabeta(b, depth - 1, -Infinity, Infinity, false);
    b[fr][fc] = savedFrom;
    b[tr][tc] = savedTo;

    const pieceName = PIECE_NAMES[piece] || piece;
    let desc = `${pieceName}(${piece})[${fr},${fc}] → [${tr},${tc}]`;
    if (captured !== '.' && isRed(captured)) {
      desc += ` captures ${PIECE_NAMES[captured] || captured}`;
    }

    scored.push({ from: [fr, fc], to: [tr, tc], score, desc });
  }

  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, topN);
}

// ── Start ──────────────────────────────────────────────────────────

init();
