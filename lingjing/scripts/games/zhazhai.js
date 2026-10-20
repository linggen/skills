// zhazhai.js — 砸寨: the assault on the 黄鼠狼精's fort, the 游戏厅's Angry-Birds gold sample (Hanli 10-20:
// 「re-skin Angry Aliens」). The game itself is a re-skin of Angry Aliens (feliperyba/angry-aliens-phaser, MIT),
// kept as TypeScript under tools/zhazhai/ and bundled with Phaser 3.90.0 + matter-js 0.20.0 into one ESM file
// beside this one (games/zhazhai/zhazhai.min.mjs, with its worker, atlases, sounds and LICENSE.txt). This module
// only keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion }) → Promise<{ won, stars?, left? }>
//
// The fort to open: `data.lv` (a story's), else the page's `?lv=` (the 游戏厅: ?dev=1&game=zhazhai&lv=3) — straight
// into that fort, settling when it falls, with its stars. Without one: the game's own title screen and fort select,
// and the game owns 再来 / 下一寨 (it settles only when the player leaves it). Its progress and settings live in
// this browser's localStorage under `lingjing.zhazhai*` — never the save.
export const meta = {
  id: 'zhazhai',
  name: { zh: '砸寨', en: 'Smash the Fort' },
  how: {
    zh: '往后拉弹弓，松手，砸塌黄鼠狼精的寨子；飞行中点一下，各有一手。',
    en: 'Pull the slingshot back and let go: bring the weasel fort down. Tap in flight for each thing’s trick.',
  },
};

/** The fort a link or a story asks for: 1… (an unknown one: none, the title screen). */
export function levelAsked(data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const n = Number(lv);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'zhazhai-stage';
  box.style.cssText = 'width:100%;aspect-ratio:16/9;position:relative;overflow:hidden;border-radius:10px;background:#7cc4ef;touch-action:none';
  container.replaceChildren(box);
  const level = levelAsked(data, globalThis.location?.search);
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    const leave = () => {
      game?.destroy(true);
      game = null;
      finish({ won: false, left: true });
    };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    import('./zhazhai/zhazhai.min.mjs').then(({ start }) => {
      if (done) return;
      game = start({
        parent: box,
        base: new URL('./zhazhai/', import.meta.url).href,
        lang: lang === 'en' ? 'en' : 'zh',
        level,
        reducedMotion, // undefined: the game reads the system's setting itself
        // Asked for one fort: it settles when that fort falls (the game's own results stay up over it).
        onResult: (r) => { if (level && r.won && r.level === level) finish({ won: true, stars: r.stars }); },
        onLeave: leave,
      });
    }, () => { box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。'; finish({ won: false, left: true }); });
  });
}
