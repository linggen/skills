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
// The opening pick (小满's main attack, Hanli 10-20 「可否上来先选一个基础攻击?」) comes between: lead card → pick → 3-2-1
// → wave 1; without the shell, the canvas's own lead-in lines → pick → 3-2-1 → wave 1.
//
// `data.lv` / the page's `?lv=` picks a level row by id or 1-based number: 1 the 山门, 2–5 the 药园 (talismans in
// lanes). A 药园 level in a landscape window gets option A (Hanli 10-20 「竖屏, 横屏可以切换?」「按A可以」): the same
// portrait field centred with side panels; turning the window flips it live. Nothing touches the save.
//
// 结印 (Hanli 10-21: 「让用户结印发火弹帮忙打怪」「放进去」, doc/games.md § 手势斗法): where a camera is, a 结印 button in
// the field's corner, lit only while a 大妖 is on the field; 手势斗法's casts (games/jieyin/helper.js on duel.js — the
// recognizers are the jieyin module's) do what the kit's `jieyin.moves` say (core.js castJieyin). The story hands in its marks
// (`data.marks`) and a move's `from` gate reads them: before 古六's lesson only the 小招; the 游戏厅 (no marks) has
// every move. No camera → no button, and the game is exactly the game without it. Dev: `?dev=1&feed=1` offers it
// without a camera (hands from the console), `&jy=always` offers spells on every wave.
export const meta = {
  id: 'shouqiang',
  pause: true, // the shell's bar pauses the play (tools/shouqiang/src/play.js setPaused)
  tall: true, // its field plays tall: on a Mac the shell's bar stands beside it (games/shell.js tallOf)
  aspect: 9 / 16, // the field's width : height — the story's card is as wide as the field at the stage's height
  bot: 'scripts/games/shouqiang/core.js', // its human-like hand (BOTS.human, headless): tests/game-shouqiang.test.mjs plays the story level (药园巡夜 · 开春) with it
  name: { zh: '守墙关', en: 'Hold the Wall' },
  how: {
    zh: '兽潮下山，小满和银月在墙上自动出手。每守住一波，三张符里挑一张；点一只兽，大家集火它。第二关起在药园布符：聚灵阵攒灵气，剑符守一畦。',
    en: 'Beasts pour down the road; Xiaoman and Yinyue fight on their own. After each wave pick 1 of 3 talismans; tap a beast to focus it. From level 2, set talismans in the herb garden: spirit arrays for qi, sword talismans for a bed.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/shouqiang.json', import.meta.url);
const SEALS = new URL('./jieyin/helper.js', import.meta.url);
import { leadWith } from './jieyin/lead.js';
const CREATURES = new URL('../../worlds/jiuding/creatures.json', import.meta.url); // each beast's element (五行相克)
const FONT = new URL('./shouqiang/font/zcool-kuaile.woff2', import.meta.url);

/** The level a story or link asks for: an id, or 1… ; anything else → the first. */
export function levelAsked(kit, data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const byId = kit.levels.find((l) => l.id === lv);
  const n = Number(lv);
  return byId ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

/** …and as the story deals it: `data.over` laid on the row — 兽潮's night (rules/shouchao.mjs: its title, its lead
    with 银月's telling, and past the table the rise's `difficulty` · `hpMul` · `growth` · `waves`). */
export const levelDealt = (kit, data, search) => (data?.over ? { ...levelAsked(kit, data, search), ...data.over } : levelAsked(kit, data, search));

/** The level a mount will play, before it mounts: the host's 台词预取 (games/prefetch.js) reads its moments. */
export const levelOf = (data, search = globalThis.location?.search ?? '') => fetch(LEVELS).then((r) => r.json()).then((kit) => ({ kit, level: levelDealt(kit, data, search) }));

async function loadFont(doc) {
  if (!globalThis.FontFace || !doc.fonts) return;
  if ([...doc.fonts].some((f) => f.family === 'SQKuaiLe')) return;
  const face = new FontFace('SQKuaiLe', `url(${FONT.href}) format('woff2')`);
  doc.fonts.add(await face.load().catch(() => face));
}

/** A move's `from` gate: open from the start, or once the save holds any of its marks; no marks given (the 游戏厅) → open. */
export const gateOpen = (row, marks) => !row.from || !Array.isArray(marks) || (row.from.marks ?? []).some((m) => marks.includes(m));

/** The 大妖's cue: the kit's line, and — when a move here overcomes its element — which (五行相克). */
export function callLine(c, root, moves, lang) {
  const t = (o) => o?.[lang] ?? o?.zh ?? '';
  const counter = root && moves.find((m) => c.beats?.[m.wuxing] === root);
  return counter && c.counterSay ? `${t(c.say)}${t(c.counterSay).replace('{root}', t(c.roots?.[root])).replace('{move}', t(counter.name))}` : t(c.say);
}

/** 结印's button in the field, where it may be offered (games/jieyin/helper.js decides; none → null, nothing drawn). */
export function offerJieyin(kit, box, { lang, game, shell, marks, feed = false, reading = () => false, load = () => import(SEALS.href) }) {
  const c = kit.jieyin, moves = (c?.moves ?? []).filter((m) => gateOpen(m, marks));
  if (!moves.length) return Promise.resolve(null);
  const say = (text) => (shell?.say ? shell.say('xiaoman', text, 2200) : game.say('xiaoman', text));
  return load().then(({ offerSeals }) => offerSeals({
    host: box, lang, feed, env: box.ownerDocument.defaultView ?? globalThis, moves: moves.map((m) => m.id), idle: c.idle, fastFps: c.armedFps,
    state: () => game.jieyinState(), cast: (e) => game.jieyin(e.move), say,
    call: () => callLine(c, game.jieyinState().boss, moves, lang),
    first: moves.some((m) => m.id === 'feijian') ? c.first : null,
    paused: () => Boolean(reading() || shell?.paused?.() || game.paused()), // reading: the lead card is up (the dock opens by itself after it)
    aside: () => game.picking(),
    dock: c.dock, onProgress: (p) => game.jieyinProgress?.(p), // where the frame stands (data); the hand's progress: his hand glows (hud.js SealGlow)
  })).catch((e) => { console.warn('[shouqiang] 结印', e); return null; });
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
    let game = null, done = false, seals = null;
    const finish = (r) => { if (!done) { done = true; seals?.then((h) => h?.close()); resolve(r); } };
    let onResize = null;
    const leave = () => { if (onResize) win.removeEventListener('resize', onResize); game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    const roots = fetch(CREATURES).then((r) => r.json()).then((j) => j.creatures ?? []).catch(() => []);
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./shouqiang/shouqiang.min.mjs'), import('./shouqiang/core.js'), loadFont(doc), roots]).then(async ([table, { start }, { openingOf, withRoots }, , creatures]) => {
      if (done) return;
      const kit = withRoots(table, creatures);
      let level = levelDealt(kit, data, search);
      if (dev && q.get('jy')) level = { ...level, jieyinWhen: q.get('jy') }; // the 游戏厅's dev: spells on every wave
      // In the shell: the story lines read on its lead card, over the field standing still; the canvas keeps the big
      // banners and its 3-2-1 (with an opening pick, the pick comes straight after the card and they follow it).
      const said = shell?.lead ? (level.lead ?? []).filter((l) => !l.big).map((l) => l[lang] ?? l.zh).join('') : '';
      if (said) level = { ...level, lead: (level.lead ?? []).filter((l) => l.big), leadSec: openingOf(kit, level) ? 0.5 : 3.4 };
      let landscape = shape(Boolean(level.grid));
      game = start({
        parent: box, base: new URL('./shouqiang/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level, seed: seed ?? `shouqiang|${Date.now()}`, reducedMotion, dev, showFps, lines, landscape, shell,
        // The level over: the camera off at once (the result card comes a beat later).
        onEvent: (f) => { if (f.t === 'end') seals?.then((h) => h?.close()); onEvent?.(f); },
        held: Boolean(said), // the field drawn behind the shell's lead card, standing still till it is read (Hanli 10-20: 「开场卡后面先画出画面」)
        onEnd: (r) => {
          if (onResize) win.removeEventListener('resize', onResize);
          // 下一关 (the shell's, off the story): the next of the ladder — a story level (`story`, 药园巡夜 · 开春) names none and is none.
          const here = levelAsked(kit, data, search), ladder = kit.levels.filter((l) => !l.story);
          const nx = data?.over || here.story ? null : ladder[ladder.indexOf(here) + 1];
          finish(r.won && nx ? { ...r, next: nx.id } : r);
        },
      });
      let reading = Boolean(said);
      seals = level.jieyin === false ? null : offerJieyin(kit, box, { lang, game, shell, marks: data?.marks, feed: dev && q.get('feed') === '1', reading: () => reading }); // a level may take no spell (守白菜)
      // the lead card says 结印 is here where it is (jieyin/lead.js)
      if (said) leadWith(said, seals, level.jieyinWhen ?? kit.jieyin?.when, lang).then((told) => !done && shell.lead(told, { auto: 'read', lang })).then(() => { reading = false; game?.go(); });
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
