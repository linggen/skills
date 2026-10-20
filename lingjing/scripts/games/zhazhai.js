// zhazhai.js — 砸寨: the throw kit (Hanli 10-20: 「re-skin Angry Aliens」; 「射鹿可以用砸寨代替. 其他投掷类都用砸寨的不同关卡代替」).
// The assault on the 黄鼠狼精's forts (levels 1…5), and every throw of the story as a level of its own, by key: 射鹿
// `deer-wind`, 芦苇里那一等 `yishui-reed` (tools/zhazhai/src/data/throws.ts). The game itself is a re-skin of Angry Aliens (feliperyba/angry-aliens-phaser, MIT),
// kept as TypeScript under tools/zhazhai/ and bundled with Phaser 3.90.0 + matter-js 0.20.0 into one ESM file
// beside this one (games/zhazhai/zhazhai.min.mjs, with its worker, atlases, sounds and LICENSE.txt). This module
// only keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion }) → Promise<{ won, stars?, left? }>
//
// The level to open: `data.lv` (a story beat's, tasks/*.json `deal.lv`), else the page's `?lv=` (the 游戏厅:
// ?dev=1&game=zhazhai&lv=3, or &lv=deer-wind) — straight into it, settling when it is won, with its stars, and with
// the grade the task's marks read (`data.grades`: stars → grade). Without one: the game's own title screen and fort
// select, and the game owns 再来 / 下一寨 (it settles only when the player leaves it). Its progress and settings live
// in this browser's localStorage under `lingjing.zhazhai*` — never the save.
export const meta = {
  id: 'zhazhai',
  name: { zh: '砸寨', en: 'Smash the Fort' },
  how: {
    zh: '往后拉弹弓，松手，砸塌黄鼠狼精的寨子；飞行中点一下，各有一手。',
    en: 'Pull the slingshot back and let go: bring the weasel fort down. Tap in flight for each thing’s trick.',
  },
  // Its bot plays the built bundle in headless Chromium (tests/board-bots.test.mjs takes it for the module's bot).
  bot: 'tools/zhazhai/bot.mjs',
};

/** The level a link or a story asks for: a fort's number (1…), or a throw's key (`deer-wind`); else 0, the title
    screen (the game itself sends an unknown key there too). */
export function levelAsked(data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const n = Number(lv);
  if (Number.isInteger(n) && n > 0) return n;
  return typeof lv === 'string' && /^[a-z][a-z0-9-]*$/.test(lv) ? lv : 0;
}

/** The grade a won level carries for the story (the task's `marks` read it): `grades` maps stars → grade. */
export function gradeOf(grades, stars) {
  const g = grades?.[String(stars)];
  return typeof g === 'string' ? g : undefined;
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
        // Asked for one level: it settles when that level is won (the game's own results stay up over it).
        onResult: (r) => {
          if (!level || !r.won || (r.level !== level && r.key !== level)) return;
          const grade = gradeOf(data.grades, r.stars);
          finish({ won: true, stars: r.stars, ...(grade ? { grade } : {}) });
        },
        onLeave: leave,
      });
    }, () => { box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。'; finish({ won: false, left: true }); });
  });
}
