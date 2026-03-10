let currentGameState = 'menu';

const menuPanel = document.getElementById('menuPanel');
const snakeGameContainer = document.getElementById('snakeGameContainer');
const pongGameContainer = document.getElementById('pongGameContainer');
const tetrisGameContainer = document.getElementById('tetrisGameContainer');

function stopCurrentGame() {
    if (currentGameState === 'snake') {
        stopSnake();
    } else if (currentGameState === 'pong') {
        stopPong();
    } else if (currentGameState === 'tetris') {
        stopTetris();
    }
}

function hideAllGames() {
    snakeGameContainer.style.display = 'none';
    pongGameContainer.style.display = 'none';
    tetrisGameContainer.style.display = 'none';
}

function showMenu() {
    stopCurrentGame();
    currentGameState = 'menu';
    hideAllGames();
    menuPanel.style.display = 'flex';
}

function selectGame(game) {
    stopCurrentGame();

    currentGameState = game;
    hideAllGames();
    menuPanel.style.display = 'none';

    if (game === 'snake') {
        snakeGameContainer.style.display = 'flex';
        initSnake();
    } else if (game === 'pong') {
        pongGameContainer.style.display = 'flex';
        initPong();
    } else if (game === 'tetris') {
        tetrisGameContainer.style.display = 'flex';
        initTetris();
    }
}
