let snakeCanvas, snakeCtx;
const SNAKE_GRID_SIZE = 20;
const SNAKE_STEP_DELAY = 100;
let snake = [{ x: 10, y: 10 }];
let food = {};
let direction = 'right';
let changingDirection = false;
let score = 0;
let snakeGameIntervalId;

function generateFood() {
    let newFood;
    do {
        newFood = {
            x: Math.floor(Math.random() * (snakeCanvas.width / SNAKE_GRID_SIZE)),
            y: Math.floor(Math.random() * (snakeCanvas.height / SNAKE_GRID_SIZE))
        };
    } while (snake.some(part => part.x === newFood.x && part.y === newFood.y));
    food = newFood;
}

function drawSnakePart(snakePart, index) {
    snakeCtx.fillStyle = index === 0 ? '#8aff8a' : '#39d353';
    snakeCtx.strokeStyle = '#14532d';
    snakeCtx.lineWidth = 2;
    snakeCtx.fillRect(snakePart.x * SNAKE_GRID_SIZE, snakePart.y * SNAKE_GRID_SIZE, SNAKE_GRID_SIZE, SNAKE_GRID_SIZE);
    snakeCtx.strokeRect(snakePart.x * SNAKE_GRID_SIZE, snakePart.y * SNAKE_GRID_SIZE, SNAKE_GRID_SIZE, SNAKE_GRID_SIZE);
}

function drawFood() {
    const foodX = food.x * SNAKE_GRID_SIZE;
    const foodY = food.y * SNAKE_GRID_SIZE;
    snakeCtx.fillStyle = '#ff6b6b';
    snakeCtx.beginPath();
    snakeCtx.roundRect(foodX + 2, foodY + 2, SNAKE_GRID_SIZE - 4, SNAKE_GRID_SIZE - 4, 6);
    snakeCtx.fill();
}

function clearCanvas() {
    const gradient = snakeCtx.createLinearGradient(0, 0, snakeCanvas.width, snakeCanvas.height);
    gradient.addColorStop(0, '#08141f');
    gradient.addColorStop(1, '#15364d');
    snakeCtx.fillStyle = gradient;
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height);

    snakeCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    snakeCtx.lineWidth = 1;
    for (let x = 0; x <= snakeCanvas.width; x += SNAKE_GRID_SIZE) {
        snakeCtx.beginPath();
        snakeCtx.moveTo(x, 0);
        snakeCtx.lineTo(x, snakeCanvas.height);
        snakeCtx.stroke();
    }
    for (let y = 0; y <= snakeCanvas.height; y += SNAKE_GRID_SIZE) {
        snakeCtx.beginPath();
        snakeCtx.moveTo(0, y);
        snakeCtx.lineTo(snakeCanvas.width, y);
        snakeCtx.stroke();
    }
}

function updateSnakeScore() {
    document.getElementById('score').innerText = `Score: ${score}`;
}

function draw() {
    clearCanvas();
    drawFood();
    snake.forEach((part, index) => drawSnakePart(part, index));
    updateSnakeScore();
}

function advanceSnake() {
    const head = { x: snake[0].x, y: snake[0].y };

    switch (direction) {
        case 'up':
            head.y -= 1;
            break;
        case 'down':
            head.y += 1;
            break;
        case 'left':
            head.x -= 1;
            break;
        case 'right':
            head.x += 1;
            break;
    }

    if (head.x < 0) {
        head.x = snakeCanvas.width / SNAKE_GRID_SIZE - 1;
    } else if (head.x >= snakeCanvas.width / SNAKE_GRID_SIZE) {
        head.x = 0;
    }

    if (head.y < 0) {
        head.y = snakeCanvas.height / SNAKE_GRID_SIZE - 1;
    } else if (head.y >= snakeCanvas.height / SNAKE_GRID_SIZE) {
        head.y = 0;
    }

    snake.unshift(head);

    const didEatFood = snake[0].x === food.x && snake[0].y === food.y;
    if (didEatFood) {
        score += 10;
        generateFood();
    } else {
        snake.pop();
    }
}

function changeDirection(event) {
    if (![ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes(event.key)) {
        return;
    }

    event.preventDefault();

    if (changingDirection) return;
    changingDirection = true;

    const goingUp = direction === 'up';
    const goingDown = direction === 'down';
    const goingLeft = direction === 'left';
    const goingRight = direction === 'right';

    if (event.key === 'ArrowLeft' && !goingRight) {
        direction = 'left';
    }

    if (event.key === 'ArrowUp' && !goingDown) {
        direction = 'up';
    }

    if (event.key === 'ArrowRight' && !goingLeft) {
        direction = 'right';
    }

    if (event.key === 'ArrowDown' && !goingUp) {
        direction = 'down';
    }
}

function checkSelfCollision() {
    for (let i = 4; i < snake.length; i++) {
        if (snake[i].x === snake[0].x && snake[i].y === snake[0].y) return true;
    }
    return false;
}

function showSnakeGameOver() {
    clearTimeout(snakeGameIntervalId);
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').style.display = 'flex';
}

function main() {
    changingDirection = false;
    snakeGameIntervalId = setTimeout(function onTick() {
        advanceSnake();

        if (checkSelfCollision()) {
            draw();
            showSnakeGameOver();
            return;
        }

        draw();
        main();
    }, SNAKE_STEP_DELAY);
}

function resetSnakeState() {
    snake = [{ x: 10, y: 10 }];
    direction = 'right';
    changingDirection = false;
    score = 0;
    generateFood();
    updateSnakeScore();
}

function restartGame() {
    clearTimeout(snakeGameIntervalId);
    document.getElementById('game-over-screen').style.display = 'none';
    resetSnakeState();
    draw();
    main();
}

function stopSnake() {
    clearTimeout(snakeGameIntervalId);
    document.removeEventListener('keydown', changeDirection);
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('snakeGameContainer').style.display = 'none';
}

function initSnake() {
    snakeCanvas = document.getElementById('snakeCanvas');
    snakeCtx = snakeCanvas.getContext('2d');

    snakeCanvas.width = 600;
    snakeCanvas.height = 600;

    clearTimeout(snakeGameIntervalId);
    document.removeEventListener('keydown', changeDirection);
    document.addEventListener('keydown', changeDirection);
    document.getElementById('restart-button').onclick = restartGame;
    document.getElementById('game-over-screen').style.display = 'none';

    resetSnakeState();
    draw();
    main();
}