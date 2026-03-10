const PONG_CANVAS_WIDTH = 600;
const PONG_CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;
const BALL_RADIUS = BALL_SIZE / 2;
const PADDLE_SPEED = 6;
const BALL_SPEED = 5;

let pongCanvas, pongCtx;
let player1Y, player2Y;
let ballX, ballY, ballDX, ballDY;
let player1Score, player2Score;
let upPressed, downPressed, wPressed, sPressed;
let animationFrameId;

function initPong() {
    pongCanvas = document.getElementById('pongCanvas');
    pongCtx = pongCanvas.getContext('2d');

    player1Y = (PONG_CANVAS_HEIGHT - PADDLE_HEIGHT) / 2;
    player2Y = (PONG_CANVAS_HEIGHT - PADDLE_HEIGHT) / 2;
    player1Score = 0;
    player2Score = 0;

    resetBall();

    upPressed = false;
    downPressed = false;
    wPressed = false;
    sPressed = false;

    updatePongScore();
    document.removeEventListener('keydown', pongKeyDown);
    document.removeEventListener('keyup', pongKeyUp);
    document.addEventListener('keydown', pongKeyDown);
    document.addEventListener('keyup', pongKeyUp);

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    drawPong();
    animationFrameId = requestAnimationFrame(pongGameLoop);
}

function resetBall(direction = Math.random() > 0.5 ? 1 : -1) {
    ballX = PONG_CANVAS_WIDTH / 2;
    ballY = PONG_CANVAS_HEIGHT / 2;
    ballDX = direction * BALL_SPEED;
    ballDY = (Math.random() > 0.5 ? 1 : -1) * (BALL_SPEED - 1);
}

function updatePongScore() {
    document.getElementById('player1Score').innerText = player1Score;
    document.getElementById('player2Score').innerText = player2Score;
}

function pongKeyDown(event) {
    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            upPressed = true;
            break;
        case 'ArrowDown':
            event.preventDefault();
            downPressed = true;
            break;
        case 'w':
        case 'W':
            wPressed = true;
            break;
        case 's':
        case 'S':
            sPressed = true;
            break;
    }
}

function pongKeyUp(event) {
    switch (event.key) {
        case 'ArrowUp':
            upPressed = false;
            break;
        case 'ArrowDown':
            downPressed = false;
            break;
        case 'w':
        case 'W':
            wPressed = false;
            break;
        case 's':
        case 'S':
            sPressed = false;
            break;
    }
}

function updatePong() {
    if (upPressed && player2Y > 0) {
        player2Y -= PADDLE_SPEED;
    }
    if (downPressed && player2Y < PONG_CANVAS_HEIGHT - PADDLE_HEIGHT) {
        player2Y += PADDLE_SPEED;
    }
    if (wPressed && player1Y > 0) {
        player1Y -= PADDLE_SPEED;
    }
    if (sPressed && player1Y < PONG_CANVAS_HEIGHT - PADDLE_HEIGHT) {
        player1Y += PADDLE_SPEED;
    }

    ballX += ballDX;
    ballY += ballDY;

    if (ballY - BALL_RADIUS <= 0) {
        ballY = BALL_RADIUS;
        ballDY = Math.abs(ballDY);
    } else if (ballY + BALL_RADIUS >= PONG_CANVAS_HEIGHT) {
        ballY = PONG_CANVAS_HEIGHT - BALL_RADIUS;
        ballDY = -Math.abs(ballDY);
    }

    const intersectsPlayer1Y = ballY + BALL_RADIUS >= player1Y && ballY - BALL_RADIUS <= player1Y + PADDLE_HEIGHT;
    const intersectsPlayer2Y = ballY + BALL_RADIUS >= player2Y && ballY - BALL_RADIUS <= player2Y + PADDLE_HEIGHT;

    if (ballDX < 0 && ballX - BALL_RADIUS <= PADDLE_WIDTH && intersectsPlayer1Y) {
        ballX = PADDLE_WIDTH + BALL_RADIUS;
        ballDX = Math.abs(ballDX);
    }

    if (ballDX > 0 && ballX + BALL_RADIUS >= PONG_CANVAS_WIDTH - PADDLE_WIDTH && intersectsPlayer2Y) {
        ballX = PONG_CANVAS_WIDTH - PADDLE_WIDTH - BALL_RADIUS;
        ballDX = -Math.abs(ballDX);
    }

    if (ballX + BALL_RADIUS < 0) {
        player2Score += 1;
        updatePongScore();
        resetBall(-1);
    } else if (ballX - BALL_RADIUS > PONG_CANVAS_WIDTH) {
        player1Score += 1;
        updatePongScore();
        resetBall(1);
    }
}

function drawPong() {
    pongCtx.clearRect(0, 0, PONG_CANVAS_WIDTH, PONG_CANVAS_HEIGHT);

    const background = pongCtx.createLinearGradient(0, 0, PONG_CANVAS_WIDTH, PONG_CANVAS_HEIGHT);
    background.addColorStop(0, '#020617');
    background.addColorStop(1, '#111c44');
    pongCtx.fillStyle = background;
    pongCtx.fillRect(0, 0, PONG_CANVAS_WIDTH, PONG_CANVAS_HEIGHT);

    pongCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    pongCtx.setLineDash([10, 12]);
    pongCtx.beginPath();
    pongCtx.moveTo(PONG_CANVAS_WIDTH / 2, 0);
    pongCtx.lineTo(PONG_CANVAS_WIDTH / 2, PONG_CANVAS_HEIGHT);
    pongCtx.stroke();
    pongCtx.setLineDash([]);

    pongCtx.fillStyle = '#f8fafc';
    pongCtx.fillRect(0, player1Y, PADDLE_WIDTH, PADDLE_HEIGHT);
    pongCtx.fillRect(PONG_CANVAS_WIDTH - PADDLE_WIDTH, player2Y, PADDLE_WIDTH, PADDLE_HEIGHT);

    pongCtx.beginPath();
    pongCtx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
    pongCtx.fill();
}

function pongGameLoop() {
    updatePong();
    drawPong();
    animationFrameId = requestAnimationFrame(pongGameLoop);
}

function stopPong() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    document.removeEventListener('keydown', pongKeyDown);
    document.removeEventListener('keyup', pongKeyUp);
    document.getElementById('pongGameContainer').style.display = 'none';
}