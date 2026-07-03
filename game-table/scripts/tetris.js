const TETRIS_COLUMNS = 10;
const TETRIS_ROWS = 20;
const TETRIS_BLOCK_SIZE = 30;
const TETRIS_PREVIEW_BLOCK_SIZE = 24;
const TETRIS_LEVEL_STEP = 10;

const TETROMINOES = {
    I: {
        color: '#38bdf8',
        shape: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ]
    },
    J: {
        color: '#60a5fa',
        shape: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ]
    },
    L: {
        color: '#fb923c',
        shape: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ]
    },
    O: {
        color: '#facc15',
        shape: [
            [1, 1],
            [1, 1]
        ]
    },
    S: {
        color: '#4ade80',
        shape: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ]
    },
    T: {
        color: '#c084fc',
        shape: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ]
    },
    Z: {
        color: '#f87171',
        shape: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ]
    }
};

let tetrisCanvas, tetrisCtx, nextPieceCanvas, nextPieceCtx;
let tetrisBoard = [];
let tetrisCurrentPiece = null;
let tetrisNextPiece = null;
let tetrisScore = 0;
let tetrisLines = 0;
let tetrisLevel = 1;
let tetrisDropAccumulator = 0;
let tetrisLastTimestamp = 0;
let tetrisAnimationFrameId = null;
let tetrisRunning = false;
let tetrisPaused = false;
let tetrisGameOver = false;
let tetrisPrimaryAction = 'start';

function createEmptyBoard() {
    return Array.from({ length: TETRIS_ROWS }, () => Array(TETRIS_COLUMNS).fill(null));
}

function cloneMatrix(matrix) {
    return matrix.map(row => [...row]);
}

function getRandomTetrominoType() {
    const types = Object.keys(TETROMINOES);
    return types[Math.floor(Math.random() * types.length)];
}

function createPiece(type = getRandomTetrominoType()) {
    const definition = TETROMINOES[type];
    return {
        type,
        color: definition.color,
        matrix: cloneMatrix(definition.shape),
        x: Math.floor((TETRIS_COLUMNS - definition.shape[0].length) / 2),
        y: 0
    };
}

function rotateMatrix(matrix) {
    return matrix[0].map((_, columnIndex) => matrix.map(row => row[columnIndex]).reverse());
}

function getDropInterval() {
    return Math.max(140, 900 - (tetrisLevel - 1) * 70);
}

function updateTetrisHud() {
    document.getElementById('tetrisScore').innerText = `Score: ${tetrisScore}`;
    document.getElementById('tetrisLines').innerText = `Lines: ${tetrisLines}`;
    document.getElementById('tetrisLevel').innerText = `Level: ${tetrisLevel}`;
}

function showTetrisOverlay(title, copy, actionLabel, action) {
    const overlay = document.getElementById('tetris-overlay');
    document.getElementById('tetrisOverlayTitle').innerText = title;
    document.getElementById('tetrisOverlayCopy').innerText = copy;
    document.getElementById('tetrisPrimaryButton').innerText = actionLabel;
    tetrisPrimaryAction = action;
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
}

function hideTetrisOverlay() {
    const overlay = document.getElementById('tetris-overlay');
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
}

function drawTetrisCell(ctx, x, y, color, size) {
    const px = x * size;
    const py = y * size;

    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(px + 2, py + 2, size - 4, 5);

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
}

function drawTetrisGrid() {
    const boardGradient = tetrisCtx.createLinearGradient(0, 0, tetrisCanvas.width, tetrisCanvas.height);
    boardGradient.addColorStop(0, '#08111f');
    boardGradient.addColorStop(1, '#111827');
    tetrisCtx.fillStyle = boardGradient;
    tetrisCtx.fillRect(0, 0, tetrisCanvas.width, tetrisCanvas.height);

    tetrisCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    tetrisCtx.lineWidth = 1;
    for (let x = 0; x <= TETRIS_COLUMNS; x += 1) {
        tetrisCtx.beginPath();
        tetrisCtx.moveTo(x * TETRIS_BLOCK_SIZE, 0);
        tetrisCtx.lineTo(x * TETRIS_BLOCK_SIZE, tetrisCanvas.height);
        tetrisCtx.stroke();
    }
    for (let y = 0; y <= TETRIS_ROWS; y += 1) {
        tetrisCtx.beginPath();
        tetrisCtx.moveTo(0, y * TETRIS_BLOCK_SIZE);
        tetrisCtx.lineTo(tetrisCanvas.width, y * TETRIS_BLOCK_SIZE);
        tetrisCtx.stroke();
    }
}

function drawBoard() {
    drawTetrisGrid();

    for (let y = 0; y < TETRIS_ROWS; y += 1) {
        for (let x = 0; x < TETRIS_COLUMNS; x += 1) {
            if (tetrisBoard[y][x]) {
                drawTetrisCell(tetrisCtx, x, y, tetrisBoard[y][x], TETRIS_BLOCK_SIZE);
            }
        }
    }
}

function drawPiece(ctx, piece, offsetX = 0, offsetY = 0, blockSize = TETRIS_BLOCK_SIZE) {
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value) {
                drawTetrisCell(ctx, piece.x + x + offsetX, piece.y + y + offsetY, piece.color, blockSize);
            }
        });
    });
}

function drawNextPiece() {
    nextPieceCtx.clearRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
    nextPieceCtx.fillStyle = '#020617';
    nextPieceCtx.fillRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);

    if (!tetrisNextPiece) {
        return;
    }

    const piece = {
        ...tetrisNextPiece,
        x: 0,
        y: 0
    };

    const pieceWidth = piece.matrix[0].length * TETRIS_PREVIEW_BLOCK_SIZE;
    const pieceHeight = piece.matrix.length * TETRIS_PREVIEW_BLOCK_SIZE;
    const offsetX = Math.floor((nextPieceCanvas.width - pieceWidth) / (2 * TETRIS_PREVIEW_BLOCK_SIZE));
    const offsetY = Math.floor((nextPieceCanvas.height - pieceHeight) / (2 * TETRIS_PREVIEW_BLOCK_SIZE));

    drawPiece(nextPieceCtx, piece, offsetX, offsetY, TETRIS_PREVIEW_BLOCK_SIZE);
}

function drawTetris() {
    drawBoard();
    if (tetrisCurrentPiece) {
        drawPiece(tetrisCtx, tetrisCurrentPiece);
    }
    drawNextPiece();
}

function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix[y].length; x += 1) {
            if (!matrix[y][x]) {
                continue;
            }

            const boardX = piece.x + x + offsetX;
            const boardY = piece.y + y + offsetY;

            if (boardX < 0 || boardX >= TETRIS_COLUMNS || boardY >= TETRIS_ROWS) {
                return true;
            }

            if (boardY >= 0 && tetrisBoard[boardY][boardX]) {
                return true;
            }
        }
    }
    return false;
}

function mergeCurrentPiece() {
    tetrisCurrentPiece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (!value) {
                return;
            }

            const boardY = tetrisCurrentPiece.y + y;
            const boardX = tetrisCurrentPiece.x + x;
            if (boardY >= 0) {
                tetrisBoard[boardY][boardX] = tetrisCurrentPiece.color;
            }
        });
    });
}

function clearCompletedLines() {
    let clearedLines = 0;

    for (let y = TETRIS_ROWS - 1; y >= 0; y -= 1) {
        if (tetrisBoard[y].every(cell => cell)) {
            tetrisBoard.splice(y, 1);
            tetrisBoard.unshift(Array(TETRIS_COLUMNS).fill(null));
            clearedLines += 1;
            y += 1;
        }
    }

    if (clearedLines > 0) {
        const scoring = [0, 100, 300, 500, 800];
        tetrisScore += scoring[clearedLines] * tetrisLevel;
        tetrisLines += clearedLines;
        tetrisLevel = Math.floor(tetrisLines / TETRIS_LEVEL_STEP) + 1;
        updateTetrisHud();
    }
}

function spawnNextPiece() {
    tetrisCurrentPiece = tetrisNextPiece || createPiece();
    tetrisCurrentPiece.x = Math.floor((TETRIS_COLUMNS - tetrisCurrentPiece.matrix[0].length) / 2);
    tetrisCurrentPiece.y = 0;
    tetrisNextPiece = createPiece();

    if (collides(tetrisCurrentPiece)) {
        handleTetrisGameOver();
    }
}

function lockPiece() {
    mergeCurrentPiece();
    clearCompletedLines();
    spawnNextPiece();
    drawTetris();
}

function movePiece(deltaX) {
    if (!tetrisRunning || tetrisPaused || tetrisGameOver) {
        return;
    }

    if (!collides(tetrisCurrentPiece, deltaX, 0)) {
        tetrisCurrentPiece.x += deltaX;
        drawTetris();
    }
}

function rotatePiece() {
    if (!tetrisRunning || tetrisPaused || tetrisGameOver) {
        return;
    }

    const rotated = rotateMatrix(tetrisCurrentPiece.matrix);
    const kicks = [0, -1, 1, -2, 2];

    for (const kick of kicks) {
        if (!collides(tetrisCurrentPiece, kick, 0, rotated)) {
            tetrisCurrentPiece.matrix = rotated;
            tetrisCurrentPiece.x += kick;
            drawTetris();
            return;
        }
    }
}

function softDrop() {
    if (!tetrisRunning || tetrisPaused || tetrisGameOver) {
        return;
    }

    if (!collides(tetrisCurrentPiece, 0, 1)) {
        tetrisCurrentPiece.y += 1;
        tetrisScore += 1;
        updateTetrisHud();
    } else {
        lockPiece();
    }

    drawTetris();
}

function hardDrop() {
    if (!tetrisRunning || tetrisPaused || tetrisGameOver) {
        return;
    }

    let dropDistance = 0;
    while (!collides(tetrisCurrentPiece, 0, dropDistance + 1)) {
        dropDistance += 1;
    }

    tetrisCurrentPiece.y += dropDistance;
    tetrisScore += dropDistance * 2;
    updateTetrisHud();
    lockPiece();
}

function dropStep() {
    if (collides(tetrisCurrentPiece, 0, 1)) {
        lockPiece();
        return;
    }

    tetrisCurrentPiece.y += 1;
}

function handleTetrisGameOver() {
    tetrisRunning = false;
    tetrisGameOver = true;
    showTetrisOverlay('Game Over', `Final score: ${tetrisScore} · Lines cleared: ${tetrisLines}`, 'Play Again', 'restart');
}

function toggleTetrisPause() {
    if (tetrisGameOver || !tetrisCurrentPiece) {
        return;
    }

    tetrisPaused = !tetrisPaused;
    if (tetrisPaused) {
        tetrisRunning = false;
        showTetrisOverlay('Paused', 'Take a breather. Press Resume when you are ready.', 'Resume', 'resume');
    } else {
        hideTetrisOverlay();
        tetrisRunning = true;
        tetrisLastTimestamp = 0;
    }
}

function resetTetrisState() {
    tetrisBoard = createEmptyBoard();
    tetrisScore = 0;
    tetrisLines = 0;
    tetrisLevel = 1;
    tetrisDropAccumulator = 0;
    tetrisLastTimestamp = 0;
    tetrisPaused = false;
    tetrisGameOver = false;
    tetrisNextPiece = createPiece();
    spawnNextPiece();
    updateTetrisHud();
}

function startTetrisGame() {
    resetTetrisState();
    hideTetrisOverlay();
    tetrisRunning = true;
    drawTetris();
}

function onTetrisPrimaryAction() {
    if (tetrisPrimaryAction === 'start' || tetrisPrimaryAction === 'restart') {
        startTetrisGame();
    } else if (tetrisPrimaryAction === 'resume') {
        tetrisPaused = false;
        tetrisRunning = true;
        hideTetrisOverlay();
        tetrisLastTimestamp = 0;
    }
}

function handleTetrisKeydown(event) {
    const activeKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'p', 'P'];
    if (activeKeys.includes(event.key)) {
        event.preventDefault();
    }

    if (event.key === 'p' || event.key === 'P') {
        toggleTetrisPause();
        return;
    }

    if (!tetrisRunning || tetrisPaused || tetrisGameOver) {
        return;
    }

    if (event.repeat && ['ArrowUp', ' ', 'Spacebar'].includes(event.key)) {
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
            movePiece(-1);
            break;
        case 'ArrowRight':
            movePiece(1);
            break;
        case 'ArrowUp':
            rotatePiece();
            break;
        case 'ArrowDown':
            softDrop();
            break;
        case ' ':
        case 'Spacebar':
            hardDrop();
            break;
    }
}

function tetrisLoop(timestamp) {
    if (tetrisRunning && !tetrisPaused && !tetrisGameOver) {
        if (!tetrisLastTimestamp) {
            tetrisLastTimestamp = timestamp;
        }

        const delta = timestamp - tetrisLastTimestamp;
        tetrisLastTimestamp = timestamp;
        tetrisDropAccumulator += delta;

        if (tetrisDropAccumulator >= getDropInterval()) {
            tetrisDropAccumulator = 0;
            dropStep();
        }

        drawTetris();
    }

    tetrisAnimationFrameId = requestAnimationFrame(tetrisLoop);
}


function initTetris() {
    tetrisCanvas = document.getElementById('tetrisCanvas');
    nextPieceCanvas = document.getElementById('nextPieceCanvas');

    if (!tetrisCanvas || !nextPieceCanvas) {
        return;
    }

    tetrisCtx = tetrisCanvas.getContext('2d');
    nextPieceCtx = nextPieceCanvas.getContext('2d');
    tetrisCanvas.width = TETRIS_COLUMNS * TETRIS_BLOCK_SIZE;
    tetrisCanvas.height = TETRIS_ROWS * TETRIS_BLOCK_SIZE;

    document.removeEventListener('keydown', handleTetrisKeydown);
    document.addEventListener('keydown', handleTetrisKeydown);
    document.getElementById('tetrisPrimaryButton').onclick = onTetrisPrimaryAction;

    if (tetrisAnimationFrameId) {
        cancelAnimationFrame(tetrisAnimationFrameId);
    }

    tetrisRunning = false;
    tetrisPaused = false;
    tetrisGameOver = false;
    tetrisBoard = createEmptyBoard();
    tetrisNextPiece = createPiece();
    tetrisCurrentPiece = null;
    updateTetrisHud();
    drawTetrisGrid();
    drawNextPiece();
    showTetrisOverlay('Tetris', 'Press Start to begin stacking blocks.', 'Start Game', 'start');
    tetrisAnimationFrameId = requestAnimationFrame(tetrisLoop);
}
