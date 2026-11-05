// fighter.js — 格斗: the arcade 1v1 (Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」; v2 10-27:
// 「用wasd控制 … 组合技什么的都加一下」, then 「出招键可以右边一些, 变成okl;」; doc/games.md § 格斗).
// The rules are fighter/core.js (pure, seeded: the bot and the tests play them in node), the picture fighter/draw.js
// (ink shadow-puppets on one canvas); this module keeps the small-game contract (games/mount.js):
//
//   mount(container, { data, lang, seed, signal, shell, peek, winHold }) → Promise<{ won, grade?, stars?, left? }>
//
// The level: `data.levels[0]` (the story deals the games.json row that names its task, rules/look.mjs dealOf), a level
// object as `data.level`, else the registry's level named `data.level`. A level is data only — its fighters (names,
// bars, looks, faces, the numbers laid on the kit's: `me.rules`, `foe.rules`), its stage, its lines — so a later bout
// adds a row, never code.
//
// Hands: its own, not mountPure's (which keeps one held pointer): every on-screen button is its own pointer, held
// ones (◀ ▶ ▼) by pointer id, so a thumb walks while the other strikes; presses act on pointerdown and nothing listens
// to the click after it (live-games.js tapGate's lesson: a fast tap is acted on once). Keys by `event.code` (the same
// keys on any layout): W A S D move — A/D walk, W jump, S crouch; held away from her, a guard — and KOF '97's four
// (Hanli 10-27: 「97那个就4个key?」): K A 轻拳 · L B 轻腿 · O C 重拳 · ; D 重腿; K+L a roll (迎), O+; a blowback; specials
// are motions + 拳. Arrows and Space are quiet aliases. The phone: one round pad under the left thumb (Hanli 10-31: 「方向键
// 不好操作, 请改成圆盘」 · 「最好能8个方向」 — the thumb's angle from its middle is one of 8, a diagonal two at once: ↖ walk
// left + jump, ↙ left + crouch), the four in a diamond, and 技 (掌心火; with ▶ 升勾; a stock full, the 绝). Turned on its
// side, the field fills the page and the hands lie over its lower corners (「横屏可以占全屏, 按钮叠加上去就好了」). The fighters are painted frame by frame (tools/fighter-frames.py → one sheet each; fighter/draw.js plays the clips).
// In the shell: its pause stops the clock and the hands and shows the move list; its lead card reads the level's
// `ready` and the keys; every step sounds what it made (games/kit/heard.js, the names in sounds.json `fighter`).
// Lost, it settles { won: false } and the host deals it again (the story) or offers 再来 (the 游戏厅).
import { sounded } from './kit/heard.js';
import { inputKind, forInput } from './kit/device.js';
import { painter, makeSheet, FIELD, cueText } from './fighter/draw.js';
import * as core from './fighter/core.js';
import * as self from './fighter.js';

export { newGame, act, tick, sounds, stuck } from './fighter/core.js';

export const meta = {
  id: 'fighter',
  name: { zh: '格斗', en: 'Fight' },
  how: {
    zh: { desk: 'WASD 走跳蹲，背向她按住是挡；K 轻拳 · L 轻腿 · O 重拳 · ; 重腿 · J 技；I 飞剑 · U 符文。', touch: '左边走跳蹲（背向她按住是挡）；右边拳 腿 重拳 重腿，技，剑 飞剑 · 符 符文。' },
    en: { desk: 'WASD walk, jump, crouch; hold away from her to guard. K light punch · L light kick · O heavy punch · ; heavy kick · J skill; I flying sword · U talisman.', touch: 'Left: walk, jump, crouch (hold away to guard). Right: LP punch, LK kick, HP heavy punch, HK heavy kick, SP skill; FS flying sword · TL talisman.' },
  },
  pause: true, // its own loop reads the shell's pause
  beat: 'mount', // the story mounts it (its hands are its own)
  wide: true,
  sounds: core.SOUNDS,
  bot: 'scripts/games/bots/fighter.js',
};

const say = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
/* A bout to stand through, her 血 emptied before her last move: the level's own words, else her name and 「够了」. */
export const sheathe = (level) => level?.lines?.sheathe ?? {
  zh: `${say(level?.foe?.name, 'zh')}收势：「够了。」`,
  en: `${say(level?.foe?.name, 'en')} draws back: "Enough."`,
};
const LINE_MS = 2600;
const SLOW = { ms: 900, rate: 0.35 }; // the KO in slow motion

/* ── The level ── */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ name: g.name, ...l })));
}
/** The level a mount plays: the deal's own, else the registry's named by `data.level` (else its first). */
export async function levelFor(data = {}, search = globalThis.location?.search) {
  if (data.levels?.length) return data.levels[0];
  if (data.level && typeof data.level === 'object') return data.level;
  const reg = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url)).then((r) => r.json()).catch(() => null);
  return pickLevel(reg, data, search);
}
/** The registry's level a deal names: `data.lv` or `?lv=` (the 游戏厅's chips: 1… on the row's own `levels`, or a level
    id), else `data.level` by id, else the first. */
export function pickLevel(reg, data = {}, search = '') {
  const all = ladderOf(reg), lv = data.lv ?? new URLSearchParams(search ?? '').get('lv');
  if (lv != null) {
    const row = (reg?.games ?? []).find((g) => g.id === meta.id && g.levels?.some((l) => l.id === data.level)) ?? null;
    const own = row?.levels ?? [];
    const byN = /^\d+$/.test(String(lv)) ? own[Number(lv) - 1] : null;
    const hit = byN ?? all.find((l) => l.id === String(lv));
    if (hit) return hit;
  }
  return all.find((l) => l.id === data.level) ?? all[0] ?? {};
}

/** The move list, as lines (the pause veil's note): each move's name, then its keys (desk) or its buttons (touch). */
export function moveLines(level = {}, lang = 'zh', kind = 'desk') {
  const names = level.moves ?? {};
  return core.MOVES.map((m) => `${say(names[m.k], lang) || say(m.name, lang) || m.k}　${say(kind === 'touch' ? m.touch : m.keys, lang)}`);
}

/* ── The page's pieces ── */
const CSS = `
.g-fighter { display: flex; flex-direction: column; gap: 8px; width: 100%; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
.g-fighter .gf-field { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #e4d6b8; }
.g-fighter canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* On a desk the field is as wide as its card and as tall as the page lets it (--gf-hm, set by the card's host: the
   story's games/shell.css, the 游戏厅's arcade.css), from 16:9 down to 2.4:1 (Hanli 11-03: 「mac上格斗的屏幕似乎也可以同样
   比例, 画面更大些」): wider than 16:9, more of the world at its sides (draw.js fieldOf), never stretched. With no
   --gf-hm, 16:9 as ever. */
.g-fighter:not(.is-touch) { container-type: inline-size; }
/* The keys over the field, never under it (Hanli 11-05: 「格斗的显示按键可以叠加到游戏上吗? 不要把游戏画面缩小. 按键可以默认显示」):
   the pad lies over the field's lower corners, see-through, on every surface — its box lets the field's taps through,
   only the buttons take theirs (and the canvas never hears them: they are not inside it). */
.g-fighter { position: relative; }
.g-fighter .gf-pad { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; pointer-events: none; padding: 0 12px 10px; box-sizing: border-box; }
.g-fighter .gf-pad > * { pointer-events: auto; opacity: .62; }
.g-fighter .gf-pad > :is(:hover, :has(.is-down)) { opacity: .85; }
.g-fighter.pad-off .gf-pad { display: none; }
.g-fighter .gf-padtoggle { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 3; width: auto; height: auto; border-radius: 6px; padding: 2px 9px;
  font: 600 12px "Songti SC","STSong","Noto Serif SC",serif; border: 1px solid rgba(42,36,28,.45); background: rgba(243,234,214,.72); color: #2a241c; opacity: .7; }
.g-fighter .gf-padtoggle:hover, .g-fighter .gf-padtoggle:focus-visible { opacity: 1; }
.g-fighter:not(.is-touch) .gf-field { aspect-ratio: auto; height: clamp(calc(100cqi / 2.4), var(--gf-hm, 56.25cqi), 56.25cqi); }
.g-fighter .gf-pad { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.g-fighter .gf-dirs { display: grid; grid-template-columns: repeat(3, auto); gap: 6px; }
.g-fighter .gf-dirs [data-k=jump] { grid-column: 2; }
.g-fighter .gf-dirs [data-k=left] { grid-column: 1; grid-row: 2; }
.g-fighter .gf-dirs [data-k=crouch] { grid-column: 2; grid-row: 2; }
.g-fighter .gf-dirs [data-k=right] { grid-column: 3; grid-row: 2; }
.g-fighter .gf-acts { display: flex; gap: 10px; align-items: center; }
/* the spells, stacked by 技: 剑 (飞剑) · 符 (符文) · 技 — a thumb's reach, never wider than the pad */
.g-fighter .gf-spells { display: flex; flex-direction: column; gap: 6px; }
.g-fighter button[data-k=feijian] { background: #cfe3ee; }
.g-fighter button[data-k=fuwen] { background: #efd98f; }
/* KOF on a phone: the four in a diamond — C 重拳 on top, A 轻拳 left, D 重腿 right, B 轻腿 below — and 技 beside it */
.g-fighter .gf-diamond { display: grid; grid-template-columns: repeat(3, auto); grid-template-rows: repeat(3, auto); gap: 0 4px; }
.g-fighter .gf-diamond [data-k=hpunch] { grid-column: 2; grid-row: 1; }
.g-fighter .gf-diamond [data-k=light] { grid-column: 1; grid-row: 2; }
.g-fighter .gf-diamond [data-k=heavy] { grid-column: 3; grid-row: 2; }
.g-fighter .gf-diamond [data-k=lkick] { grid-column: 2; grid-row: 3; }
.g-fighter button { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; font: 600 18px "Songti SC","STSong","Noto Serif SC",serif;
  width: 46px; height: 46px; border-radius: 50%; border: 2px solid #2a241c; background: #f3ead6; color: #1c1a16; display: grid; place-items: center; position: relative; padding: 0; cursor: pointer; }
.g-fighter button.is-down { background: #2a241c; color: #f3ead6; }
.g-fighter button[data-k=hpunch], .g-fighter button[data-k=heavy] { background: #e9d4b8; font-size: 15px; }
.g-fighter button[data-k=skill] { background: #f0c9a8; }
.g-fighter button[data-k=skill].is-ready { background: #e7b84a; box-shadow: 0 0 0 3px rgba(231,184,74,.45); } /* a stock full: 技 is the 绝 */
.g-fighter button.is-cool { opacity: .5; }
/* The cue as a button (touch): 迎 in her push, 勾 as she holds back — one tap, there only while its window is open */
.g-fighter.is-touch button.gf-cue { min-width: 76px; width: auto; padding: 0 14px; border-radius: 38px; height: 76px; font-size: 32px; font-weight: 800; background: #b22218; color: #f6eedc; border-color: #f6eedc;
  box-shadow: 0 0 0 4px rgba(178,34,24,.4); animation: gf-cue .5s ease-in-out infinite alternate; align-self: center; }
.g-fighter button.gf-cue[hidden] { display: none; }
@keyframes gf-cue { to { transform: scale(1.08); box-shadow: 0 0 0 9px rgba(178,34,24,.18); } }
html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch .gf-pad > :has(.gf-cue:not([hidden])) { opacity: 1; }
.g-fighter button small { position: absolute; bottom: -3px; right: -4px; font: 600 9px ui-monospace, monospace; background: #2a241c; color: #f3ead6; border-radius: 6px; padding: 1px 4px; white-space: nowrap; }
.g-fighter.is-touch button small { display: none; }
.g-fighter.is-touch button { width: 48px; height: 48px; font-size: 20px; }
html[data-board=fighter] #stage .g-fighter { height: 100%; justify-content: center; padding: 6px 8px calc(10px + env(safe-area-inset-bottom)); box-sizing: border-box; }
html[data-board=fighter] #stage .gf-field { width: min(100%, calc((100vh - 200px) * 16 / 9)); margin: auto; } /* the field in the middle, the buttons under the thumbs */
/* The round pad (touch): the thumb anywhere in it, its angle one of 8; the knob under the thumb, the way it points lit. */
.g-fighter .gf-dial { position: relative; width: 132px; height: 132px; border-radius: 50%; flex: none; touch-action: none;
  background: radial-gradient(circle, rgba(243,234,214,.92) 0 30%, rgba(228,214,184,.92) 31% 100%); border: 2px solid #2a241c; box-sizing: border-box; }
.g-fighter .gf-dial i { position: absolute; left: 50%; top: 50%; width: 0; height: 0; font: normal 600 13px/1 ui-sans-serif, system-ui, sans-serif; color: #2a241c; opacity: .55;
  transform: rotate(var(--a)) translateY(-50px) rotate(calc(-1 * var(--a))); display: grid; place-items: center; z-index: 1; } /* the lit way shows over the knob */
.g-fighter .gf-dial i::before { content: attr(data-f); position: absolute; transform: translate(-50%, -50%); }
.g-fighter .gf-dial i.is-on { opacity: 1; color: #b0412e; }
.g-fighter .gf-dial b { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
  background: #2a241c; opacity: .35; transform: translate(var(--x, 0px), var(--y, 0px)); pointer-events: none; }
.g-fighter .gf-dial.is-held b { opacity: .7; }
/* Turned on its side on a phone: the field as tall as the page (the app's bar above it holds ✕ and Ⅱ) and as wide as
   the screen, up to WIDE_MAX (2.4 : 1; Hanli 11-03: 「两边目前黑的比较多」) — the world drawn wider at its sides, the
   boards as they are (draw.js fieldOf) — the hands over its lower corners, see-through, clear of the notch and the home
   bar. The Mac and the upright phone as they were (16:9). */
@media (orientation: landscape) {
  html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch { --gf-h: min(calc(100dvh - var(--safe-b, 0px)), calc(100vw * 9 / 16)); position: relative; display: block; width: min(100%, calc(var(--gf-h) * 2.4)); height: auto; margin: auto; padding: 0; }
  html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch .gf-field { width: 100%; height: var(--gf-h); aspect-ratio: auto; margin: 0; border-radius: 0; }
  html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch .gf-pad { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: none;
    padding: 0 max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
  html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch .gf-pad > * { pointer-events: auto; opacity: .62; }
  html[data-board=fighter][data-input=touch] #stage .g-fighter.is-touch .gf-pad > :is(.is-held, :has(.is-down)) { opacity: .85; }
}
`;
function sheet(doc) {
  const old = doc.getElementById('g-fighter-css');
  if (old?.dataset.v === '9') return;
  old?.remove();
  const st = doc.createElement('style');
  st.id = 'g-fighter-css';
  st.dataset.v = '9';
  st.textContent = CSS;
  doc.head.append(st);
}

const BUTTONS = {
  jump: { face: '▲', key: 'W' }, left: { face: '◀', key: 'A' }, crouch: { face: '▼', key: 'S' }, right: { face: '▶', key: 'D' },
  light: { face: { zh: '拳', en: 'LP' }, key: 'K' }, lkick: { face: { zh: '腿', en: 'LK' }, key: 'L' }, hpunch: { face: { zh: '重拳', en: 'HP' }, key: 'O' }, heavy: { face: { zh: '重腿', en: 'HK' }, key: ';' },
  skill: { face: { zh: '技', en: 'SP' }, key: 'J' }, feijian: { face: { zh: '剑', en: 'FS' }, key: 'I' }, fuwen: { face: { zh: '符', en: 'TL' }, key: 'U' },
};
/** The 绝 when a level names none: the skill button's face with its stocks full. */
const SUPER = { zh: '绝', en: 'MAX' };
/* Keys by where they sit (event.code): any layout plays alike; `;` is Semicolon wherever it is printed. KOF '97's four:
   K A 轻拳 · L B 轻腿 · O C 重拳 · ; D 重腿. */
const CODES = {
  KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'crouch', KeyK: 'light', KeyL: 'lkick', KeyO: 'hpunch', Semicolon: 'heavy', KeyI: 'feijian', KeyU: 'fuwen', KeyJ: 'skill',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'crouch', Space: 'jump',
};
const HELD = new Set(['left', 'right', 'crouch']);
/* The desk's pad, shown or not, per browser: shown unless hidden (`0`) — over the field now, it costs the picture nothing
   (Hanli 11-05: 「按键可以默认显示」). */
export const PAD_KEY = 'lingjing.fighter.pad';
const padShown = (win) => { try { return win.localStorage.getItem(PAD_KEY) !== '0'; } catch { return true; } };
/* W is a press when it goes down (the jump) and a word when it comes up (let go soon: a short hop). */
const LIFT = { jump: 'jumpRelease' };

/* The round pad's 8 ways, clockwise from → (screen angles, y down): each the held directions it presses. */
const DIAL = [['right'], ['right', 'crouch'], ['crouch'], ['left', 'crouch'], ['left'], ['left', 'jump'], ['jump'], ['right', 'jump']];
const DIAL_FACE = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
/** The directions a thumb at (dx, dy) from the pad's middle presses (screen px, y down; `r` the pad's radius): none in
    the dead zone (`dead` of the radius), else one of 8 by its angle — a diagonal two at once. */
export function dialDirs(dx, dy, r = 66, dead = 0.28) {
  if (Math.hypot(dx, dy) < r * dead) return [];
  return DIAL[dialWay(dx, dy)];
}
const dialWay = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;

function padHtml(level, lang, kind = 'desk') {
  const names = level.me?.buttons ?? {};
  const b = (k) => {
    const face = say(names[k], lang) || say(BUTTONS[k].face, lang);
    return `<button type="button" data-k="${k}" aria-label="${face}">${face}<small>${BUTTONS[k].key}</small></button>`;
  };
  const dial = `<div class="gf-dial" role="group" aria-label="${lang === 'en' ? 'Move' : '方向'}">${DIAL_FACE.map((f, i) => `<i data-w="${i}" data-f="${f}" style="--a:${i * 45 + 90}deg"></i>`).join('')}<b></b></div>`;
  return `<div class="gf-pad">${kind === 'touch' ? dial : `<div class="gf-dirs">${b('jump')}${b('left')}${b('crouch')}${b('right')}</div>`}`
    + `<div class="gf-acts">${kind === 'touch' ? '<button type="button" class="gf-cue" data-k="cue" hidden></button>' : ''}<div class="gf-spells">${b('feijian')}${b('fuwen')}${b('skill')}</div><div class="gf-diamond">${b('hpunch')}${b('light')}${b('heavy')}${b('lkick')}</div></div></div>`;
}

/** A sheet washed in one colour once, on its own canvas (心魔: 小满's own frames in shadow) — no per-frame filter, which
    the phone's web view may not have. `tint`: [r, g, b, strength 0…1]. */
function tinted(doc, img, [r, g, b, k = 0.7]) {
  const c = doc.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = k;
  x.fillStyle = `rgb(${r},${g},${b})`;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The small-game contract: this bout alone in a container (the 游戏厅, the story's card, the phone). */
export function mount(container, opts = {}) {
  const { data = {} } = opts;
  if (data.levels?.length || (data.level && typeof data.level === 'object')) return run(container, opts, data.levels?.[0] ?? data.level);
  return levelFor(data).then((level) => run(container, opts, level));
}

function run(container, { lang = 'zh', seed = String(Date.now()), signal, shell, peek, winHold = 0, data = {} } = {}, level = {}) {
  const doc = container.ownerDocument, win = doc.defaultView, kind = inputKind(doc);
  sheet(doc);
  const root = doc.createElement('div');
  root.className = `g-fighter${kind === 'touch' ? ' is-touch' : ''}`;
  // The pad over the field (Hanli 11-05: 「不要把游戏画面缩小. 按键可以默认显示」), shown by default; on a desk 「收起按键」
  // hides it (the keys are named in the how line), remembered in this browser. A touch screen keeps it: it is how it plays.
  const padOn = kind === 'touch' || padShown(win);
  root.classList.toggle('pad-off', !padOn);
  const padWord = (on) => (lang === 'en' ? (on ? 'Hide keys' : 'Show keys') : (on ? '收起按键' : '显示按键'));
  root.innerHTML = `<div class="gf-field"><canvas></canvas>${kind === 'touch' ? '' : `<button type="button" class="gf-padtoggle" data-pad aria-pressed="${padOn}">${padWord(padOn)}</button>`}</div>${padHtml(level, lang, kind)}`;
  container.replaceChildren(root);
  root.querySelector('[data-pad]')?.addEventListener('click', (e) => {
    const on = root.classList.contains('pad-off');
    root.classList.toggle('pad-off', !on);
    e.currentTarget.textContent = padWord(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    try { win.localStorage.setItem(PAD_KEY, on ? '1' : '0'); } catch { /* this load only */ }
    e.currentTarget.blur(); // Space and the keys stay the bout's
  });
  const canvas = root.querySelector('canvas');
  const art = {};
  for (const who of ['me', 'foe']) {
    const face = level[who]?.face;
    if (!face) continue;
    const img = new win.Image();
    img.src = new URL(`../../worlds/jiuding/${face}`, import.meta.url).href;
    art[who] = img;
  }
  // The painted frames (art/games/fighter/<who>.webp, one sheet, + .json): drawn as soon as they come; the figure in
  // code until then. Reduced motion (the OS's setting) plays fewer frames.
  const sheets = {};
  const still = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  // 飞剑's blade: the 结印's own painting (games/jieyin/art/feijian.webp), the same sword the 兽潮 boards fly
  art.feijian = new win.Image();
  art.feijian.src = new URL('./jieyin/art/feijian.webp', import.meta.url).href;
  for (const who of ['me', 'foe']) {
    const look = level[who]?.look;
    if (!look?.sheet) continue;
    const base = new URL(`../../worlds/jiuding/${look.sheet}`, import.meta.url).href;
    const img = new win.Image();
    const loaded = new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
    img.src = `${base}.webp`;
    Promise.all([fetch(`${base}.json`).then((r) => r.json()), loaded])
      .then(([meta]) => { sheets[who] = makeSheet(meta, look.tint ? tinted(doc, img, look.tint) : img, look.height); })
      .catch((e) => console.warn('[fighter] frames', who, e));
  }
  const draw = painter(canvas, { art, sheets, kind, calm: () => Boolean(still?.matches) });
  const cueBtn = root.querySelector('button.gf-cue');
  const g = { state: core.newGame(seed, 1, { levels: [level] }) };
  peek?.(() => g.state);
  root.__fighter = () => g.state; // the builder's look at the bout (a live check drives it as a hand would)
  root.__fighterSet = (fn) => { g.state = fn(structuredClone(g.state)) ?? g.state; }; // …and sets a moment up (a live check of the 绝, the palm)
  shell?.note?.(moveLines(level, lang, kind)); // the move list under the pause
  let started = false, done = false, raf = 0, last = 0, line = null;
  const off = [];
  const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };

  /* Size the canvas to its box, at the screen's pixels (2× at most: the phone keeps 60 frames). */
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, win.devicePixelRatio || 1);
    // its box's own shape (a phone on its side gives a wider one: draw.js fieldOf draws more of the world, never stretched)
    const w = Math.max(320, Math.round(r.width * dpr)), h = r.height > 0 ? Math.max(180, Math.round(r.height * dpr)) : Math.round((w * FIELD.h) / FIELD.w);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(fit) : null;
  ro?.observe(canvas);
  fit();

  /* ── Hands ── */
  const held = { left: new Set(), right: new Set(), crouch: new Set(), block: new Set() }; // who holds each: pointer ids and 'key'
  const apply = (d) => {
    if (!started || done || shell?.paused?.()) return;
    const was = g.state;
    g.state = core.act(g.state, d).state ?? g.state;
    sounded(shell, self, was, g.state);
  };
  const sync = () => {
    const dir = (held.right.size ? 1 : 0) - (held.left.size ? 1 : 0);
    if (dir !== g.state.in.dir) apply({ g: 'walk', dir });
    for (const k of ['crouch', 'block']) if ((held[k].size > 0) !== g.state.in[k]) apply({ g: k, on: held[k].size > 0 });
    for (const b of root.querySelectorAll('button[data-k]')) if (HELD.has(b.dataset.k)) b.classList.toggle('is-down', Boolean(held[b.dataset.k]?.size));
  };
  const press = (k, who) => {
    if (k === 'cue') { const c = g.state.cue?.k; if (c) apply({ g: c === 'ying' ? 'ying' : 'hook' }); return; } // the cue's button: 迎 · 升勾
    if (HELD.has(k)) { held[k].add(who); sync(); return; }
    const btn = root.querySelector(`button[data-k="${k}"]`);
    btn?.classList.add('is-down');
    win.setTimeout(() => btn?.classList.remove('is-down'), 110);
    apply({ g: k });
  };
  const lift = (k, who) => { if (LIFT[k]) apply({ g: LIFT[k] }); if (HELD.has(k) && held[k].delete(who)) sync(); };
  const liftAll = () => { dialOff(); for (const s of Object.values(held)) s.clear(); sync(); };
  const pads = new Map(); // pointer id → the button it went down on
  /* The round pad: one thumb on it at a time (its pointer id); what it presses changes only as the way does, through
     press/lift as the buttons do — ↑ to ↖ keeps the jump (no second one), ← to ↙ adds the crouch. */
  const dial = root.querySelector('.gf-dial'), knob = dial?.querySelector('b');
  let dialBy = null, dialOn = [];
  const dialTo = (dirs, way, x = 0, y = 0) => {
    const who = `dial:${dialBy}`;
    for (const k of dialOn) if (!dirs.includes(k)) lift(k, who);
    for (const k of dirs) if (!dialOn.includes(k)) press(k, who);
    dialOn = dirs;
    knob?.style.setProperty('--x', `${x}px`); knob?.style.setProperty('--y', `${y}px`);
    for (const i of dial.querySelectorAll('i')) i.classList.toggle('is-on', Number(i.dataset.w) === way);
  };
  const dialAt = (e) => {
    const r = dial.getBoundingClientRect(), rad = r.width / 2;
    const dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + rad), far = Math.hypot(dx, dy), k = far > rad * 0.62 ? (rad * 0.62) / far : 1;
    const dirs = dialDirs(dx, dy, rad);
    dialTo(dirs, dirs.length ? dialWay(dx, dy) : -1, dx * k, dy * k);
  };
  const dialOff = () => { if (dialBy == null) return; dialTo([], -1); dialBy = null; dial.classList.remove('is-held'); };
  if (dial) {
    on(dial, 'pointerdown', (e) => {
      e.preventDefault();
      if (dialBy != null && dialBy !== e.pointerId) dialOff();
      dialBy = e.pointerId;
      try { dial.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
      dial.classList.add('is-held');
      dialAt(e);
    });
    on(dial, 'pointermove', (e) => { if (e.pointerId === dialBy) dialAt(e); });
    const dialUp = (e) => { if (e.pointerId === dialBy) dialOff(); };
    on(dial, 'pointerup', dialUp);
    on(dial, 'pointercancel', dialUp);
    on(dial, 'lostpointercapture', dialUp);
  }
  on(root, 'pointerdown', (e) => {
    const b = e.target.closest?.('button[data-k]');
    if (!b) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
    pads.set(e.pointerId, b.dataset.k);
    press(b.dataset.k, e.pointerId);
  });
  const up = (e) => { const k = pads.get(e.pointerId); if (k == null) return; pads.delete(e.pointerId); lift(k, e.pointerId); };
  on(root, 'pointerup', up);
  on(root, 'pointercancel', up);
  on(root, 'lostpointercapture', up);
  on(root, 'contextmenu', (e) => e.preventDefault());
  on(root, 'click', (e) => { if (e.target.closest?.('button[data-k]')) e.preventDefault(); }); // acted on as it went down
  const keyOf = (e) => (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable]') || !root.isConnected ? null : CODES[e.code] ?? null);
  on(doc, 'keydown', (e) => {
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    press(k, `key:${e.code}`);
  });
  // …and its keyup kept too: Space on a focused shell button (Ⅱ, 🔊) would click it as the key comes up.
  on(doc, 'keyup', (e) => { const k = keyOf(e); if (!k) return; e.preventDefault(); lift(k, `key:${e.code}`); });
  on(win, 'blur', liftAll);
  on(doc, 'visibilitychange', liftAll);
  const offPause = shell?.onPause?.((p) => { if (p) liftAll(); });
  if (offPause) off.push(offPause);

  /* ── The loop ── */
  const textNow = (s) => {
    if (s.won && s.end?.early) return say(level.won?.early || sheathe(level), lang); // emptied early: her words, never 「第二十招上」
    if (s.won) return say((s.end?.kind === 'spent' && level.won?.spent) || level.won?.[s.grade], lang); // 稳 emptied: he went down at last
    if (s.lost || s.end?.kind === 'down') return say(level.lines?.lost, lang);
    if (s.end?.kind === 'out') return say(level.lines?.[s.palmLanded ? 'outClumsy' : 'out'], lang);
    if (s.end?.kind === 'outlast') return say(s.end.early ? sheathe(level) : level.lines?.outlast, lang); // emptied early: she sheathes
    if (s.end?.kind === 'spent') return say(level.lines?.spent, lang);
    if (!started) return shell?.lead ? '' : say(level.ready, lang); // the lead card reads it where there is one
    const l = s.line;
    if (l && l !== line?.from) line = { from: l, text: say(level.lines?.[l.key], lang), at: performance.now() };
    return line && performance.now() - line.at < LINE_MS ? line.text : '';
  };
  let resolve;
  const settled = new Promise((r) => { resolve = r; });
  const finish = (r) => {
    if (done) return;
    done = true;
    off.forEach((f) => f());
    ro?.disconnect();
    win.cancelAnimationFrame(raf);
    draw(g.state, lang, textNow(g.state)); // the last frame stays
    resolve(r);
  };
  const skillBtn = root.querySelector('button[data-k=skill]'), skillFace = skillBtn.firstChild;
  const spellBtn = { feijian: root.querySelector('button[data-k=feijian]'), fuwen: root.querySelector('button[data-k=fuwen]') };
  const skillNames = [say(level.me?.buttons?.skill, lang) || say(BUTTONS.skill.face, lang), say(level.me?.buttons?.super, lang) || say(SUPER, lang)];
  const frame = (now) => {
    raf = win.requestAnimationFrame(frame);
    let dt = Math.min(50, last ? now - last : 16);
    last = now;
    if (started && !done && !shell?.paused?.() && doc.visibilityState === 'visible') {
      const s0 = g.state;
      if (s0.end && s0.t - s0.end.at < SLOW.ms) dt *= SLOW.rate; // the KO, slowed
      g.state = core.tick(s0, dt);
      if (g.state !== s0) sounded(shell, self, s0, g.state);
      const full = core.superReady(g.state); // a stock, 爆气, or 绝境
      if (skillBtn.classList.contains('is-ready') !== full) { skillBtn.classList.toggle('is-ready', full); skillFace.textContent = skillNames[full ? 1 : 0]; }
      skillBtn.classList.toggle('is-cool', !full && g.state.me.cdPf > 0);
      for (const [k, cd] of [['feijian', 'cdFj'], ['fuwen', 'cdFw']]) spellBtn[k]?.classList.toggle('is-cool', (g.state.me[cd] ?? 0) > 0);
      if (cueBtn) { const t = g.state.cue && !g.state.end ? cueText(g.state, lang, 'touch') : ''; if (cueBtn.hidden !== !t) cueBtn.hidden = !t; if (t && cueBtn.textContent !== t) { cueBtn.textContent = t; cueBtn.setAttribute('aria-label', t); } }
      if (g.state.won) { const s = g.state; win.setTimeout(() => finish({ won: true, grade: s.grade, stars: s.stars }), winHold); started = false; }
      else if (g.state.lost) { win.setTimeout(() => finish({ won: false }), 500); started = false; }
    }
    draw(g.state, lang, textNow(g.state));
  };
  raf = win.requestAnimationFrame(frame);
  if (signal) {
    if (signal.aborted) finish({ won: false, left: true });
    else signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
  }
  // The lead card: the book's line, then (smaller) the keys or the buttons.
  const ready = say(level.ready, lang), hint = forInput(level.hint?.[lang] ?? level.hint?.zh ?? '', kind);
  // …and what he learned that bears on this foe (the deal's `hints`: 阿禾's 底册, 相克 — rules/look.mjs dealOf, by his marks)
  const learned = (data.hints ?? []).join('\n');
  const leadText = [ready, learned, hint].filter(Boolean).join('\n\n');
  Promise.resolve(shell?.lead && leadText ? shell.lead(leadText, { auto: 'read', lang }) : null).then(() => {
    if (done) return;
    started = true;
    last = 0;
    g.state = core.withIntro(g.state); // the bout's call: 「比武」…「开始！」
    doc.activeElement?.blur?.(); // a focused shell button never takes the bout's Space
    shell?.sound?.('start');
  });
  return settled;
}
