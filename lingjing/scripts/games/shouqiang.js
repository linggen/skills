// shouqiang.js — 守墙关 (wall defense): the 塔防 kit's second level type, a prototype (Hanli 10-20: 「可否加一个类似这个的
// 关卡, 让塔防多样性」, 「做原型吧」). Beasts pour down the 山道 at 沉鼎观's 山门; 小满 casts from the wall, 银月 beside him;
// after each wave, 1 of 3 cards. The play is Phaser (games/shouqiang/shouqiang.min.mjs, built from tools/shouqiang/,
// loading the one shared scripts/vendor/phaser.min.mjs); the engine is games/shouqiang/core.js; the level, waves and
// cards are data (worlds/jiuding/levels/shouqiang.json). This module keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion, seed, lines, onEvent }) → Promise<{ won, stars, stats } | { left }>
//
// `data.lv` / the page's `?lv=` picks a level row by id or 1-based number (one level today). Nothing touches the save.
export const meta = {
  id: 'shouqiang',
  name: { zh: '守墙关 · 守山门', en: 'Hold the Wall' },
  how: {
    zh: '兽潮下山，小满和银月在墙上自动出手。每守住一波，三张符里挑一张；点一只兽，大家集火它。',
    en: 'Beasts pour down the road; Xiaoman and Yinyue fight on their own. After each wave pick 1 of 3 talismans; tap a beast to focus it.',
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

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, seed, lines, onEvent } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'shouqiang-stage';
  // Portrait 9:16, as tall as the window lets it (a phone fills its width; a desk gets a tall column).
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#1a2416;touch-action:none;'
    + 'aspect-ratio:9/16;width:min(100%, calc((100dvh - 150px) * 9 / 16));margin:0 auto;user-select:none;-webkit-user-select:none';
  container.replaceChildren(box);
  const search = globalThis.location?.search ?? '';
  const showFps = /(?:^|[?&])(?:fps|dev)=1/.test(search);
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./shouqiang/shouqiang.min.mjs'), loadFont(doc)]).then(([kit, { start }]) => {
      if (done) return;
      game = start({
        parent: box, base: new URL('./shouqiang/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level: levelAsked(kit, data, search), seed: seed ?? `shouqiang|${Date.now()}`, reducedMotion, showFps, lines, onEvent,
        onEnd: (r) => finish(r),
      });
    }, () => {
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
