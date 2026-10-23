// sadoushou.js — 撒豆成兵 · 守山门: the DEFENCE crowd game, a second 撒豆成兵 beside the attack run (games/sadou.js),
// in the 游戏厅 (Hanli 10-21, of a crowd-gate ad: 「好像比我们的撒豆成兵好玩一点」, 「好, 做一版. 这个是在防守, 现在的撒豆成兵
// 是在进攻.」); not in the 秘境 pool. One story level (2026-10-22): 第一回's 收租, 守灶台 (`zaotai`, `story: "00-zaotai"`,
// task masan-zaotai) — a story level plays alone: off the ladder, no 下一关, and the ladder's last never points into it.
//
// The road has three columns (Hanli 10-21: 「一共3列, 要么打野猪, 要么打两边的+攻击的卡」): the 兽潮 comes down the
// middle, the sides are belts of + cards and stone walls coming down. 小满's squad fires on its own up the column he
// picks; a card's number grows with every hit and pays the squad, a wall breaks open, the beasts fall; then the 大妖
// walks down and charges the squad's column (a line shown first). The play is Phaser (games/sadoushou/sadoushou.min.mjs,
// built from tools/sadoushou/, loading the one shared scripts/vendor/phaser.min.mjs); the engine is games/sadoushou/core.js; the
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
  aspect: 760 / 960, // the field's width : height on a Mac (the wide board, tools/sadoushou/src/view.js); a phone plays 9 : 16
  bot: 'scripts/games/sadoushou/core.js', // its human-like hand (humanBot, headless): tests/game-sadoushou.test.mjs plays every level with it, the story's too
  name: { zh: '撒豆成兵 · 守山门', en: 'Beans into Soldiers · Hold the Gate' },
  how: {
    zh: '左右拖动选一列，豆兵自己会打：打两边的卡，卡上的数越打越大，接住它队伍就壮；打中间的兽，别让它们撞上山门；石墙打碎了有好东西。大妖冲哪一列，就躲开哪一列。',
    en: 'Drag left and right to pick a column; the soldiers fire on their own. Shoot the side cards — their numbers grow with every hit — and take them to grow the squad; shoot the beasts in the middle before they reach the gate; break the stone walls for what they hide. When the great beast charges a column, get off it.',
  },

};

const LEVELS = new URL('../../worlds/jiuding/levels/sadoushou.json', import.meta.url);
const FONT = new URL('./sadoushou/font/zcool-kuaile.woff2', import.meta.url);
const SEALS = new URL('./jieyin/helper.js', import.meta.url);
import { leadWith } from './jieyin/lead.js';
import { jieyinOf } from './sadoushou/core.js';

/** A move's `from` gate: open from the start, or once the save holds any of its marks; no marks given (the 游戏厅) → open. */
export const gateOpen = (row, marks) => !row.from || !Array.isArray(marks) || (row.from.marks ?? []).some((m) => marks.includes(m));

/** 结印's button in the field, where it may be offered (games/jieyin/helper.js decides: no camera → null, nothing drawn,
    and the game is exactly the game without it — Hanli 10-21: 「用户结印失败, 或者不愿意使用摄像头, 塔防游戏也能正常完成」).
    A cast strikes a beast (core.js beastFor): the 大妖 when out, else the nearest wave down the column the dock names
    (its lane: left · middle · right) or the squad's, else the nearest anywhere — never a card or a wall. */
export function offerJieyin(level, box, { lang, game, shell, marks, feed = false, reading = () => false, load = () => import(SEALS.href) }) {
  const c = level.jieyin, moves = (c?.moves ?? []).filter((m) => gateOpen(m, marks));
  if (!moves.length) return Promise.resolve(null);
  const t = (o) => o?.[lang] ?? o?.zh ?? '';
  const say = (text) => (shell?.say ? shell.say(lang === 'en' ? 'Xiaoman' : '小满', text, 2200) : game.say('xiaoman', text));
  return load().then(({ offerSeals }) => offerSeals({
    host: box, lang, feed, env: box.ownerDocument.defaultView ?? globalThis, moves, idle: c.idle, fastFps: c.armedFps,
    // the dock casts back an event (its move, the hand's lane): the row ids here are the 手势斗法 ids
    state: () => game.jieyinState(), cast: (e, lane) => game.jieyin(e?.move ?? e, e?.lane ?? lane?.lane ?? lane), fizzle: () => game.fizzle(), say,
    call: () => t(c.say), first: moves.some((m) => m.id === 'feijian' && !m.from) ? c.first : null,
    paused: () => Boolean(reading() || shell?.paused?.() || game.paused()), aside: () => game.picking(), // reading: the lead card is up
    dock: c.dock, onProgress: (p) => game.jieyinProgress?.(p), // where the frame stands (the kit's data); the hand's progress → 小满 glows
  })).catch((e) => { console.warn('[sadoushou] 结印', e); return null; });
}

/** The 游戏厅's ladder: the levels with no `story`, in the order they climb. */
export const ladderOf = (kit) => kit.levels.filter((l) => !l.story);

/** The level a link or the story asks for: an id (a story level's too), or 1… on the ladder; anything else → the first. */
export function levelAsked(kit, data, search) {
  const lv = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  const byId = kit.levels.find((l) => l.id === lv), ladder = ladderOf(kit);
  const n = Number(lv);
  return byId ?? (Number.isInteger(n) && n >= 1 && n <= ladder.length ? ladder[n - 1] : ladder[0]);
}

/** 下一关 after a won level: the next of the ladder — a story level names none and is none. */
export function nextOf(kit, level) {
  if (level.story) return null;
  const ladder = ladderOf(kit);
  return ladder[ladder.indexOf(level) + 1] ?? null;
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
  // As tall as the window lets it. A phone (a portrait window) plays 9:16 and fills its width; a landscape window gets
  // the wider 760:960 board (Hanli 10-21: 「目前画面有点拥挤, 可以宽一些吗」): the road spans more, the columns breathe.
  // Picked once here: the board is drawn at its size for the whole level.
  const win = doc.defaultView ?? globalThis;
  const wide = (win.innerWidth ?? 0) > (win.innerHeight ?? 1) * 1.05;
  const [a, b] = wide ? [760, 960] : [9, 16];
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#cfd3c6;touch-action:none;'
    + `aspect-ratio:${a}/${b};width:min(100%, calc((100dvh - var(--game-reserve, 150px)) * ${a} / ${b}));margin:0 auto;user-select:none;-webkit-user-select:none`;
  container.replaceChildren(box);
  const search = globalThis.location?.search ?? '';
  const dev = /(?:^|[?&])dev=1/.test(search);
  const showFps = dev && /(?:^|[?&])fps=1/.test(search);
  return new Promise((resolve) => {
    let game = null, done = false, seals = null;
    const finish = (r) => { if (!done) { done = true; seals?.then((h) => h?.close()); resolve(r); } };
    const leave = () => { game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    Promise.all([fetch(LEVELS).then((r) => r.json()), import('./sadoushou/sadoushou.min.mjs'), loadFont(doc)]).then(([kit, { start }]) => {
      if (done) return;
      const asked = levelAsked(kit, data, search);
      let level = { ...asked, jieyin: jieyinOf(kit, asked) }; // its moves from the kit's named set (story: simple; ladder: full)
      if (dev && /(?:^|[?&])jy=(always|waves|boss)/.test(search)) level = { ...level, jieyin: level.jieyin && { ...level.jieyin, when: search.match(/jy=(\w+)/)[1] } }; // the 游戏厅's dev
      // In the shell: the story lines read on its lead card, over the road standing still; the canvas keeps the big line and its 3-2-1.
      const said = shell?.lead ? (level.lead ?? []).filter((l) => !l.big).map((l) => l[lang] ?? l.zh).join(lang === 'en' ? ' ' : '') : '';
      if (said) level = { ...level, lead: (level.lead ?? []).filter((l) => l.big), leadSec: 1.6 };
      game = start({
        parent: box, base: new URL('./sadoushou/', import.meta.url).href, lang: lang === 'en' ? 'en' : 'zh',
        kit, level, seed: seed ?? `sadoushou|${Date.now()}`, reducedMotion, dev, showFps, lines, shell, wide,
        onEvent: (f) => { if (f.t === 'end') seals?.then((h) => h?.close()); onEvent?.(f); }, // the level over: the camera off at once
        held: Boolean(said),
        onEnd: (r) => {
          const nx = nextOf(kit, asked); // 下一关 (the shell's): the ladder's, never a story level
          finish(r.won && nx ? { ...r, next: nx.id } : r);
        },
      });
      let reading = Boolean(said);
      seals = offerJieyin(level, box, { lang, game, shell, marks: data?.marks, feed: dev && /(?:^|[?&])feed=1/.test(search), reading: () => reading });
      // the lead card says 结印 is here where it is (jieyin/lead.js)
      if (said) leadWith(said, seals, level.jieyin?.when, lang).then((told) => !done && shell.lead(told, { auto: 'read', lang })).then(() => { reading = false; game?.go(); });
    }, () => {
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
