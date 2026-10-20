// shouqiang.js — 守墙关 (wall defense): the 塔防 kit's second level type, a prototype (Hanli 10-20: 「可否加一个类似这个的
// 关卡, 让塔防多样性」, 「做原型吧」). Beasts pour down the 山道 at 沉鼎观's 山门; 小满 casts from the wall, 银月 beside him;
// after each wave, 1 of 3 cards. The play is Phaser (games/shouqiang/shouqiang.min.mjs, built from tools/shouqiang/,
// loading the one shared scripts/vendor/phaser.min.mjs); the engine is games/shouqiang/core.js; the level, waves and
// cards are data (worlds/jiuding/levels/shouqiang.json). This module keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion, seed, lines, onEvent, shell }) → Promise<{ won, stars, stats } | { left }>
//
// In the one shell (games/shell.js, `shell`): the level's story lines are the shell's lead card, its pause is the shell's,
// and the result is the shell's; the canvas keeps the big 「兽潮来袭！」 banners and its own 3-2-1 into the first wave.
//
// `data.lv` / the page's `?lv=` picks a level row by id or 1-based number: 1 the 山门, 2–5 the 药园 (talismans in
// lanes). A 药园 level in a landscape window gets option A (Hanli 10-20 「竖屏, 横屏可以切换?」「按A可以」): the same
// portrait field centred with side panels; turning the window flips it live. Nothing touches the save.
export const meta = {
  id: 'shouqiang',
  pause: true, // the shell's bar pauses the play (tools/shouqiang/src/play.js setPaused)
  name: { zh: '守墙关', en: 'Hold the Wall' },
  how: {
    zh: '兽潮下山，小满和银月在墙上自动出手。每守住一波，三张符里挑一张；点一只兽，大家集火它。第二关起在药园布符：聚灵阵攒灵气，剑符守一畦。',
    en: 'Beasts pour down the road; Xiaoman and Yinyue fight on their own. After each wave pick 1 of 3 talismans; tap a beast to focus it. From level 2, set talismans in the herb garden: spirit arrays for qi, sword talismans for a bed.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/shouqiang.json', import.meta.url);
const FONT = new URL('./shouqiang/font/zcool-kuaile.woff2', import.meta.url);

/** The level a story or link asks for: an id, or 1… ; anything else → the first. */
export function levelAsked(kit, data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const byId = kit.levels.find((l) => l.id === lv);
  const n = Number(lv);
  return byId ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

async function loadFont(doc) {
  if (!globalThis.FontFace || !doc.fonts) return;
  if ([...doc.fonts].some((f) => f.family === 'SQKuaiLe')) return;
  const face = new FontFace('SQKuaiLe', `url(${FONT.href}) format('woff2')`);
  doc.fonts.add(await face.load().catch(() => face));
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, seed, lines, onEvent, shell } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'shouqiang-stage';
  // Portrait 9:16, as tall as the window lets it (a phone fills its width; a desk gets a tall column). A 药园 level in
  // a landscape window: the field plus two side panels (W + 2·SIDE : H = 1040 : 960).
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#1a2416;touch-action:none;'
    + 'margin:0 auto;user-select:none;-webkit-user-select:none';
  const win = doc.defaultView ?? globalThis;
  const wide = () => (win.innerWidth ?? 0) > (win.innerHeight ?? 1) * 1.05;
  const shape = (lanes) => {
    const [a, b] = lanes && wide() ? [1040, 960] : [9, 16];
    box.style.aspectRatio = `${a}/${b}`;
    box.style.width = `min(100%, calc((100dvh - var(--game-reserve, 150px)) * ${a} / ${b}))`;
    box.dataset.landscape = String(Boolean(lanes && wide())); // the page around it widens for it (arcade.css)
    return lanes && wide();
  };
  shape(false);
  container.replaceChildren(box);
  const search = globalThis.location?.search ?? '';
  const q = new URLSearchParams(search);
  const dev = q.get('dev') === '1', showFps = dev && q.get('fps') === '1'; // the counter only on ?dev=1&fps=1
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    let onResize = null;
    const leave = () => { if (onResize) win.removeEventListener('resize', onResize); game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./shouqiang/shouqiang.min.mjs'), loadFont(doc)]).then(async ([kit, { start }]) => {
      if (done) return;
      let level = levelAsked(kit, data, search);
      // In the shell: the story lines read on its lead card, over the field standing still; the canvas keeps the big
      // banners and its 3-2-1.
      const said = shell?.lead ? (level.lead ?? []).filter((l) => !l.big).map((l) => l[lang] ?? l.zh).join('') : '';
      if (said) level = { ...level, lead: (level.lead ?? []).filter((l) => l.big), leadSec: 3.4 };
      let landscape = shape(Boolean(level.grid));
      game = start({
        parent: box, base: new URL('./shouqiang/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level, seed: seed ?? `shouqiang|${Date.now()}`, reducedMotion, dev, showFps, lines, onEvent, landscape, shell,
        held: Boolean(said), // the field drawn behind the shell's lead card, standing still till it is read (Hanli 10-20: 「开场卡后面先画出画面」)
        onEnd: (r) => {
          if (onResize) win.removeEventListener('resize', onResize);
          const nx = kit.levels[kit.levels.indexOf(levelAsked(kit, data, search)) + 1]; // 下一关 (the shell's, off the story)
          finish(r.won && nx ? { ...r, next: nx.id } : r);
        },
      });
      if (said) shell.lead(said, { auto: reducedMotion ? 2400 : 4200 }).then(() => game?.go());
      if (level.grid) {
        onResize = () => { const now = shape(true); if (now !== landscape) { landscape = now; game?.layout(now); } };
        win.addEventListener('resize', onResize);
      }
    }, () => {
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
