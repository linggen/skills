// sadou.js — 撒豆成兵 (the crowd run): a 塔防-family level type, a prototype (Hanli 10-20: 「对, 做一个撒豆成兵的关卡」).
// 小满 scatters beans that become a squad of bean soldiers; drag left/right to steer them up the 山道 through 符门
// gates (+ × grow the crowd, − ÷ are traps), past hazards, through the 兽潮 hordes, to 合窳. The play is Phaser
// (games/sadou/sadou.min.mjs, built from tools/sadou/, loading the one shared scripts/vendor/phaser.min.mjs); the
// engine is games/sadou/core.js; the level is data (worlds/jiuding/levels/sadou.json). The small-game contract:
//
//   mount(container, { lang, data, signal, reducedMotion, seed, lines, onEvent, shell }) → Promise<{ won, stars, stats } | { left }>
//
// In the one shell (games/shell.js, `shell`): the level's story lines are the shell's lead card, its pause is the shell's,
// and the result is the shell's; the canvas keeps the big 「撒豆成兵！」 with its scatter and its own 3-2-1 into the run.
//
// `data.lv` / the page's `?lv=` picks a level row by id or 1-based number (five, 山道 → 黑松岭); a won level names the
// next one (`next`, its id) so the shell offers 下一关. Nothing touches the save.
export const meta = {
  id: 'sadou',
  pause: true, // the shell's bar pauses the play (tools/sadou/src/play.js setPaused)
  lines: 'one', // 台词预取: the play reads one line a moment (play.js say: a string), not a pool
  name: { zh: '撒豆成兵', en: 'Beans into Soldiers' }, // the game's name; the level's own (山道) is the canvas's top bar
  how: {
    zh: '左右拖动，带豆兵穿过加倍的符门，躲开陷阱，撞翻兽潮，最后打倒合窳。',
    en: 'Drag left and right: lead the bean soldiers through the gates that multiply, dodge the traps, crash through the beasts, and bring down the Heyu.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/sadou.json', import.meta.url);
const FONT = new URL('./sadou/font/zcool-kuaile.woff2', import.meta.url);

/** The level a story or link asks for: an id, or 1… ; anything else → the first. */
export function levelAsked(kit, data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const byId = kit.levels.find((l) => l.id === lv);
  const n = Number(lv);
  return byId ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

/** The level a mount will play, before it mounts: the host's 台词预取 (games/prefetch.js) reads its moments. */
export const levelOf = (data, search = globalThis.location?.search ?? '') => fetch(LEVELS).then((r) => r.json()).then((kit) => ({ kit, level: levelAsked(kit, data, search) }));

async function loadFont(doc) {
  if (!globalThis.FontFace || !doc.fonts) return;
  if ([...doc.fonts].some((f) => f.family === 'SDKuaiLe')) return;
  const face = new FontFace('SDKuaiLe', `url(${FONT.href}) format('woff2')`);
  doc.fonts.add(await face.load().catch(() => face));
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, seed, lines, onEvent, shell } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'sadou-stage';
  // Portrait 9:16, as tall as the window lets it (a phone fills its width; a desk gets a tall column).
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#22301c;touch-action:none;'
    + 'aspect-ratio:9/16;width:min(100%, calc((100dvh - var(--game-reserve, 150px)) * 9 / 16));margin:0 auto;user-select:none;-webkit-user-select:none';
  container.replaceChildren(box);
  const search = globalThis.location?.search ?? '';
  // the 游戏厅's dev page exposes the game for a live check; the FPS counter shows only with ?dev=1&fps=1
  const dev = /(?:^|[?&])dev=1/.test(search);
  const showFps = dev && /(?:^|[?&])fps=1/.test(search);
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./sadou/sadou.min.mjs'), loadFont(doc)]).then(([kit, { start }]) => {
      if (done) return;
      let level = levelAsked(kit, data, search);
      // In the shell: the story lines read on its lead card, over the road standing still; the canvas keeps the big line
      // (the beans fly) and its 3-2-1.
      const said = shell?.lead ? (level.lead ?? []).filter((l) => !l.big).map((l) => l[lang] ?? l.zh).join(lang === 'en' ? ' ' : '') : '';
      if (said) level = { ...level, lead: (level.lead ?? []).filter((l) => l.big), leadSec: 1.6 };
      game = start({
        parent: box, base: new URL('./sadou/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level, seed: seed ?? `sadou|${Date.now()}`, reducedMotion, dev, showFps, lines, onEvent, shell,
        held: Boolean(said), // the road drawn behind the shell's lead card, standing still till it is read (Hanli 10-20: 「开场卡后面先画出画面」)
        onEnd: (r) => {
          const nx = kit.levels[kit.levels.indexOf(levelAsked(kit, data, search)) + 1]; // 下一关 (the shell's, off the story)
          finish(r.won && nx ? { ...r, next: nx.id } : r);
        },
      });
      if (said) shell.lead(said, { auto: reducedMotion ? 2400 : 4200 }).then(() => game?.go());
    }, () => {
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
