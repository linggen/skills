// fighter.js — 格斗: the arcade 1v1 (Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」; doc/games.md § 格斗).
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
// ones (◀ ▶ 挡) by pointer id, so a thumb walks while the other strikes; presses act on pointerdown and nothing
// listens to the click after it (live-games.js tapGate's lesson: a fast tap is acted on once). Keys: A/D or ← →
// walk, W/↑/Space jump, S/↓ guard (or hold away from her), J 拳, K 勾, L the spell.
// In the shell: its pause stops the clock and the hands; its lead card reads the level's `ready` before the bout;
// every step sounds what it made (games/kit/heard.js, the names in sounds.json `fighter`). Lost, it settles
// { won: false } and the host deals it again (the story) or offers 再来 (the 游戏厅).
import { sounded } from './kit/heard.js';
import { inputKind } from './kit/device.js';
import { painter, FIELD } from './fighter/draw.js';
import * as core from './fighter/core.js';
import * as self from './fighter.js';

export { newGame, act, tick, sounds, stuck } from './fighter/core.js';

export const meta = {
  id: 'fighter',
  name: { zh: '格斗', en: 'Fight' },
  how: {
    zh: { desk: 'A/D 走，W 或空格跳，S 或往后按住挡；J 拳，K 勾，L 法术。', touch: '左边走、跳；右边挡、拳、勾、法术。' },
    en: { desk: 'A/D walk, W or Space jump, S or hold back to guard; J jab, K hook, L spell.', touch: 'Left: walk and jump. Right: guard, jab, hook, spell.' },
  },
  pause: true, // its own loop reads the shell's pause
  beat: 'mount', // the story mounts it (its hands are its own)
  wide: true,
  sounds: core.SOUNDS,
  bot: 'scripts/games/bots/fighter.js',
};

const say = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
const LINE_MS = 2600;

/* ── The level ── */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ name: g.name, ...l })));
}
/** The level a mount plays: the deal's own, else the registry's named by `data.level` (else its first). */
export async function levelFor(data = {}) {
  if (data.levels?.length) return data.levels[0];
  if (data.level && typeof data.level === 'object') return data.level;
  const reg = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url)).then((r) => r.json()).catch(() => null);
  const all = ladderOf(reg);
  return all.find((l) => l.id === data.level) ?? all[0] ?? {};
}

/* ── The page's pieces ── */
const CSS = `
.g-fighter { display: flex; flex-direction: column; gap: 8px; width: 100%; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
.g-fighter .gf-field { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #e4d6b8; }
.g-fighter canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.g-fighter .gf-pad { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; padding: 0 4px; }
.g-fighter .gf-dirs, .g-fighter .gf-acts { display: flex; gap: 8px; align-items: flex-end; }
.g-fighter .gf-acts { flex-wrap: wrap; justify-content: flex-end; }
.g-fighter button { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; font: 600 20px "Songti SC","STSong","Noto Serif SC",serif;
  width: 54px; height: 54px; border-radius: 50%; border: 2px solid #2a241c; background: #f3ead6; color: #1c1a16; display: grid; place-items: center; position: relative; padding: 0; cursor: pointer; }
.g-fighter button.is-down { background: #2a241c; color: #f3ead6; }
.g-fighter button[data-k=heavy] { background: #e9d4b8; }
.g-fighter button[data-k=special] { background: #f0c9a8; }
.g-fighter button[data-k=special].is-cool { opacity: .5; }
.g-fighter button small { position: absolute; bottom: -2px; right: -2px; font: 600 10px ui-monospace, monospace; background: #2a241c; color: #f3ead6; border-radius: 6px; padding: 1px 4px; }
.g-fighter.is-touch button small { display: none; }
.g-fighter.is-touch button { width: 64px; height: 64px; font-size: 24px; }
html[data-board=fighter] #stage .g-fighter { height: 100%; justify-content: center; padding: 6px 8px calc(10px + env(safe-area-inset-bottom)); box-sizing: border-box; }
html[data-board=fighter] #stage .gf-field { width: min(100%, calc((100vh - 190px) * 16 / 9)); margin: auto; } /* the field in the middle, the buttons under the thumbs */
`;
function sheet(doc) {
  if (doc.getElementById('g-fighter-css')) return;
  const st = doc.createElement('style');
  st.id = 'g-fighter-css';
  st.textContent = CSS;
  doc.head.append(st);
}

const BUTTONS = {
  left: { zh: '◀', en: '◀', key: 'A' }, jump: { zh: '▲', en: '▲', key: 'W' }, right: { zh: '▶', en: '▶', key: 'D' },
  block: { zh: '挡', en: 'G', key: 'S' }, light: { zh: '拳', en: 'J', key: 'J' }, heavy: { zh: '勾', en: 'K', key: 'K' }, special: { zh: '法', en: 'L', key: 'L' },
};
const KEYS = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', arrowup: 'jump', ' ': 'jump', s: 'block', arrowdown: 'block', j: 'light', k: 'heavy', l: 'special' };
const HELD = new Set(['left', 'right', 'block']);

function padHtml(level, lang) {
  const names = level.me?.buttons ?? {};
  const b = (k) => `<button type="button" data-k="${k}" aria-label="${say(names[k], lang) || k}">${say(names[k], lang) || BUTTONS[k][lang] || BUTTONS[k].zh}<small>${BUTTONS[k].key}</small></button>`;
  return `<div class="gf-pad"><div class="gf-dirs">${b('left')}${b('jump')}${b('right')}</div><div class="gf-acts">${b('block')}${b('light')}${b('heavy')}${b('special')}</div></div>`;
}

/** The small-game contract: this bout alone in a container (the 游戏厅, the story's card, the phone). */
export function mount(container, opts = {}) {
  const { data = {}, signal } = opts;
  if (data.levels?.length || (data.level && typeof data.level === 'object')) return run(container, opts, data.levels?.[0] ?? data.level);
  return levelFor(data).then((level) => run(container, opts, level));
}

function run(container, { lang = 'zh', seed = String(Date.now()), signal, shell, peek, winHold = 0 } = {}, level = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  sheet(doc);
  const root = doc.createElement('div');
  root.className = `g-fighter${inputKind(doc) === 'touch' ? ' is-touch' : ''}`;
  root.innerHTML = `<div class="gf-field"><canvas></canvas></div>${padHtml(level, lang)}`;
  container.replaceChildren(root);
  const canvas = root.querySelector('canvas');
  const art = {};
  for (const who of ['me', 'foe']) {
    const face = level[who]?.face;
    if (!face) continue;
    const img = new win.Image();
    img.src = new URL(`../../worlds/jiuding/${face}`, import.meta.url).href;
    art[who] = img;
  }
  const draw = painter(canvas, { art });
  const g = { state: core.newGame(seed, 1, { levels: [level] }) };
  peek?.(() => g.state);
  root.__fighter = () => g.state; // the builder's look at the bout (a live check drives it as a hand would)
  let started = false, done = false, raf = 0, last = 0, line = null;
  const off = [];
  const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };

  /* Size the canvas to its box, at the screen's pixels. */
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, win.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.round((w * FIELD.h) / FIELD.w);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(fit) : null;
  ro?.observe(canvas);
  fit();

  /* ── Hands ── */
  const held = { left: new Set(), right: new Set(), block: new Set() }; // who holds each: pointer ids and 'key'
  const apply = (d) => {
    if (!started || done || shell?.paused?.()) return;
    const was = g.state;
    g.state = core.act(g.state, d).state ?? g.state;
    sounded(shell, self, was, g.state);
  };
  const sync = () => {
    const dir = (held.right.size ? 1 : 0) - (held.left.size ? 1 : 0);
    if (dir !== g.state.in.dir) apply({ g: 'walk', dir });
    const blk = held.block.size > 0;
    if (blk !== g.state.in.block) apply({ g: 'block', on: blk });
    for (const b of root.querySelectorAll('button[data-k]')) b.classList.toggle('is-down', Boolean(held[b.dataset.k]?.size));
  };
  const press = (k, who) => {
    if (HELD.has(k)) { held[k].add(who); sync(); return; }
    const btn = root.querySelector(`button[data-k="${k}"]`);
    btn?.classList.add('is-down');
    win.setTimeout(() => btn?.classList.remove('is-down'), 110);
    apply({ g: k });
  };
  const lift = (k, who) => { if (HELD.has(k) && held[k].delete(who)) sync(); };
  const liftAll = () => { for (const s of Object.values(held)) s.clear(); sync(); };
  const pads = new Map(); // pointer id → the button it went down on
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
  on(doc, 'keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable]') || !root.isConnected) return;
    const k = KEYS[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    if (e.repeat && !HELD.has(k)) return;
    press(k, 'key');
  });
  on(doc, 'keyup', (e) => { const k = KEYS[e.key.toLowerCase()]; if (k) lift(k, 'key'); });
  on(win, 'blur', liftAll);
  on(doc, 'visibilitychange', liftAll);
  const offPause = shell?.onPause?.((p) => { if (p) liftAll(); });
  if (offPause) off.push(offPause);

  /* ── The loop ── */
  const textNow = (s) => {
    if (s.won) return say(level.won?.[s.grade], lang);
    if (s.lost || s.end?.kind === 'down') return say(level.lines?.lost, lang);
    if (s.end?.kind === 'out') return say(level.lines?.[s.palmLanded ? 'outClumsy' : 'out'], lang);
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
  const frame = (now) => {
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(50, last ? now - last : 16);
    last = now;
    if (started && !done && !shell?.paused?.() && doc.visibilityState === 'visible') {
      const was = g.state;
      g.state = core.tick(g.state, dt);
      if (g.state !== was) sounded(shell, self, was, g.state);
      const cool = root.querySelector('button[data-k=special]');
      cool?.classList.toggle('is-cool', g.state.me.cd > 0);
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
  const ready = say(level.ready, lang);
  Promise.resolve(shell?.lead && ready ? shell.lead(ready, { auto: 'read', lang }) : null).then(() => {
    if (done) return;
    started = true;
    last = 0;
    shell?.sound?.('start');
  });
  return settled;
}
