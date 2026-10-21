// sadoushou.js — 撒豆成兵 · 守山门: the DEFENCE crowd game, a second 撒豆成兵 beside the attack run (games/sadou.js),
// test-only in the 游戏厅 for comparing (Hanli 10-21, of a crowd-gate ad: 「好像比我们的撒豆成兵好玩一点」, 「好, 做一版.
// 这个是在防守, 现在的撒豆成兵是在进攻.」). Not in the story, not in the 秘境 pool.
//
// 小满 stands on the 山门 at the foot of the road; the 兽潮 marches DOWN it, its count big from the start, the 大妖
// behind. He aims left and right and HOLDS to scatter beans: each runs up the road as a 豆兵, and the lanes are walled
// with gates — a safe lane of small +1s, a 符门 in the middle, a rich lane of +99 that the tide runs past — so where
// he aims is what he gets. The stream grinds the waves down unit by unit; then the 大妖 steps out, walks down, and
// charges down a line it shows first. The play is Phaser (games/sadoushou/sadoushou.min.mjs, built from
// tools/sadoushou/, loading the one shared scripts/vendor/phaser.min.mjs); the engine is games/sadoushou/core.js; the
// levels are data (worlds/jiuding/levels/sadoushou.json). The small-game contract:
//
//   mount(container, { lang, data, signal, reducedMotion, seed, lines, onEvent, shell }) → Promise<{ won, stars, stats } | { left }>
//
// `data.lv` / the page's `?lv=` picks a level by id or 1-based number; a won level names the next (`next`) so the shell
// offers 下一关. Nothing touches the save.
export const meta = {
  id: 'sadoushou',
  pause: true, // the shell's bar pauses the play (tools/sadoushou/src/play.js setPaused)
  tall: true, // its field plays tall: on a Mac the shell's bar stands beside it (games/shell.js tallOf)
  aspect: 9 / 16,
  name: { zh: '撒豆成兵 · 守山门', en: 'Beans into Soldiers · Hold the Gate' },
  how: {
    zh: '左右瞄准，按住撒豆：豆兵往上冲，穿过门就变多。挡住兽潮，别让它们撞上山门；大妖冲下来前，躲开那条线。',
    en: 'Aim left and right and hold to scatter beans: the soldiers charge up the road and every gate they pass makes more. Stop the tide before it hits the gate; when the great beast charges, get off its line.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/sadoushou.json', import.meta.url);
const FONT = new URL('./sadoushou/font/zcool-kuaile.woff2', import.meta.url);

/** The level a link asks for: an id, or 1… ; anything else → the first. */
export function levelAsked(kit, data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const byId = kit.levels.find((l) => l.id === lv);
  const n = Number(lv);
  return byId ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

async function loadFont(doc) {
  if (!globalThis.FontFace || !doc.fonts) return;
  if ([...doc.fonts].some((f) => f.family === 'SDKuaiLe')) return;
  const face = new FontFace('SDKuaiLe', `url(${FONT.href}) format('woff2')`);
  doc.fonts.add(await face.load().catch(() => face));
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, seed, lines, onEvent, shell } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'sadoushou-stage';
  // portrait 9:16, as tall as the window lets it (a phone fills its width; a desk gets a tall column)
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#cfd3c6;touch-action:none;'
    + 'aspect-ratio:9/16;width:min(100%, calc((100dvh - var(--game-reserve, 150px)) * 9 / 16));margin:0 auto;user-select:none;-webkit-user-select:none';
  container.replaceChildren(box);
  const search = globalThis.location?.search ?? '';
  const dev = /(?:^|[?&])dev=1/.test(search);
  const showFps = dev && /(?:^|[?&])fps=1/.test(search);
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./sadoushou/sadoushou.min.mjs'), loadFont(doc)]).then(([kit, { start }]) => {
      if (done) return;
      const asked = levelAsked(kit, data, search);
      let level = asked;
      // In the shell: the story lines read on its lead card, over the road standing still; the canvas keeps the big line and its 3-2-1.
      const said = shell?.lead ? (level.lead ?? []).filter((l) => !l.big).map((l) => l[lang] ?? l.zh).join(lang === 'en' ? ' ' : '') : '';
      if (said) level = { ...level, lead: (level.lead ?? []).filter((l) => l.big), leadSec: 1.6 };
      game = start({
        parent: box, base: new URL('./sadoushou/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level, seed: seed ?? `sadoushou|${Date.now()}`, reducedMotion, dev, showFps, lines, onEvent, shell,
        held: Boolean(said),
        onEnd: (r) => {
          const nx = kit.levels[kit.levels.indexOf(asked) + 1]; // 下一关 (the shell's)
          finish(r.won && nx ? { ...r, next: nx.id } : r);
        },
      });
      if (said) shell.lead(said, { auto: 'read', lang }).then(() => game?.go());
    }, () => {
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
