// Shared game rail — the one menu across all game pages (the lobby page is
// gone). Include right after <body> on every game page. Injects the rail,
// highlights the current game, and remembers it in game-table:ui so
// index.html reopens the last game played.
(() => {
  const GAMES = [
    { file: 'xiangqi.html', label: '象棋' },
    { file: 'gomoku.html', label: '五子棋' },
    { file: 'snake.html', label: 'Snake' },
    { file: 'pong.html', label: 'Pong' },
    { file: 'tetris.html', label: 'Tetris' },
  ];
  const current = location.pathname.split('/').pop();

  const UI_KEY = 'game-table:ui';
  const loadUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } };
  const saveUi = (patch) => { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch, v: 1 })); } catch { /* ignore */ } };
  if (GAMES.some((g) => g.file === current)) saveUi({ game: current });

  const style = document.createElement('style');
  style.textContent = `
    /* Fixed so it survives any page's body layout (the arcade pages
       flex-center their body); pages get pushed down via body padding. */
    .game-rail {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      display: flex; align-items: center; gap: 4px;
      height: 44px; padding: 0 12px;
      background: #16213e; border-bottom: 1px solid #2a3a5c;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
    }
    body { padding-top: 44px !important; }
    .game-rail .rail-brand {
      color: #8899aa; font-size: 10px; font-weight: 700;
      letter-spacing: 2px; margin-right: 10px; user-select: none;
    }
    .game-rail a {
      display: flex; align-items: center; gap: 7px;
      padding: 0 12px; height: 32px; border-radius: 8px;
      color: #8899aa; text-decoration: none; font-size: 13px; font-weight: 600;
      transition: color .15s, background .15s;
    }
    .game-rail a:hover { color: #e0e0e0; background: rgba(255,255,255,.05); }
    .game-rail a.on { color: #fff; background: #0f3460; }
    .game-rail a:focus-visible { outline: 2px solid #e94560; outline-offset: 1px; }
    .game-rail .chip {
      width: 18px; height: 18px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      opacity: .75;
    }
    .game-rail a.on .chip, .game-rail a:hover .chip { opacity: 1; }
    /* Every game is a playing piece on the rail. */
    .chip-xiangqi {
      border-radius: 50%; background: #f3e9d2; border: 1.5px solid #c0392b;
      color: #c0392b; font-size: 11px; font-weight: 700; line-height: 1;
    }
    .chip-gomoku {
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #5a5a5a, #000 70%);
    }
    .chip-snake { border-radius: 4px; background: #39d353; width: 15px; height: 15px; }
    .chip-pong {
      border-radius: 3px; background: #1a1a2e; position: relative;
      box-shadow: inset 3px 0 0 #e0e0e0, inset -3px 0 0 #e0e0e0;
    }
    .chip-pong::after {
      content: ''; position: absolute; top: 7px; left: 7px;
      width: 4px; height: 4px; background: #e0e0e0;
    }
    .chip-tetris {
      border-radius: 3px; width: 16px; height: 16px;
      background: conic-gradient(#40c4ff 0 25%, #ffd740 0 50%, #ff5c8a 0 75%, #69f0ae 0);
    }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'game-rail';
  nav.innerHTML = '<span class="rail-brand">GAME TABLE</span>' + GAMES.map((g) => {
    const key = g.file.replace('.html', '');
    const glyph = key === 'xiangqi' ? '帅' : '';
    return `<a href="${g.file}" class="${g.file === current ? 'on' : ''}">` +
      `<span class="chip chip-${key}">${glyph}</span>${g.label}</a>`;
  }).join('');
  document.body.prepend(nav);
})();
