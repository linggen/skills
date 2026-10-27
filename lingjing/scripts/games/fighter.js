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
// are motions + 拳. Arrows and Space are quiet aliases. The phone: ▲ ◀ ▼ ▶, the four in a diamond, and 技 (掌心火; with
// ▶ 升勾; a stock full, the 绝). The fighters are painted rigs (tools/paint-fighter.py; fighter/draw.js makeRig).
// In the shell: its pause stops the clock and the hands and shows the move list; its lead card reads the level's
// `ready` and the keys; every step sounds what it made (games/kit/heard.js, the names in sounds.json `fighter`).
// Lost, it settles { won: false } and the host deals it again (the story) or offers 再来 (the 游戏厅).
import { sounded } from './kit/heard.js';
import { inputKind, forInput } from './kit/device.js';
import { painter, makeRig, FIELD } from './fighter/draw.js';
import * as core from './fighter/core.js';
import * as self from './fighter.js';

export { newGame, act, tick, sounds, stuck } from './fighter/core.js';

export const meta = {
  id: 'fighter',
  name: { zh: '格斗', en: 'Fight' },
  how: {
    zh: { desk: 'WASD 走跳蹲，背向她按住是挡；K 轻拳 · L 轻腿 · O 重拳 · ; 重腿。', touch: '左边走跳蹲（背向她按住是挡）；右边拳 腿 重拳 重腿，技。' },
    en: { desk: 'WASD walk, jump, crouch; hold away from her to guard. K light punch · L light kick · O heavy punch · ; heavy kick.', touch: 'Left: walk, jump, crouch (hold away to guard). Right: punch, kick, heavy punch, heavy kick, and skill.' },
  },
  pause: true, // its own loop reads the shell's pause
  beat: 'mount', // the story mounts it (its hands are its own)
  wide: true,
  sounds: core.SOUNDS,
  bot: 'scripts/games/bots/fighter.js',
};

const say = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
const LINE_MS = 2600;
const SLOW = { ms: 900, rate: 0.35 }; // the KO in slow motion

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

/** The move list, as lines (the pause veil's note): each move's name, then its keys (desk) or its buttons (touch). */
export function moveLines(level = {}, lang = 'zh', kind = 'desk') {
  const names = level.moves ?? {};
  return core.MOVES.map((m) => `${say(names[m.k], lang) || m.k}　${kind === 'touch' ? m.touch : m.keys}`);
}

/* ── The page's pieces ── */
const CSS = `
.g-fighter { display: flex; flex-direction: column; gap: 8px; width: 100%; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
.g-fighter .gf-field { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #e4d6b8; }
.g-fighter canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.g-fighter .gf-pad { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; padding: 0 2px; }
.g-fighter .gf-dirs { display: grid; grid-template-columns: repeat(3, auto); gap: 6px; }
.g-fighter .gf-dirs [data-k=jump] { grid-column: 2; }
.g-fighter .gf-dirs [data-k=left] { grid-column: 1; grid-row: 2; }
.g-fighter .gf-dirs [data-k=crouch] { grid-column: 2; grid-row: 2; }
.g-fighter .gf-dirs [data-k=right] { grid-column: 3; grid-row: 2; }
.g-fighter .gf-acts { display: flex; gap: 10px; align-items: center; }
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
.g-fighter button small { position: absolute; bottom: -3px; right: -4px; font: 600 9px ui-monospace, monospace; background: #2a241c; color: #f3ead6; border-radius: 6px; padding: 1px 4px; white-space: nowrap; }
.g-fighter.is-touch button small { display: none; }
.g-fighter.is-touch button { width: 48px; height: 48px; font-size: 20px; }
html[data-board=fighter] #stage .g-fighter { height: 100%; justify-content: center; padding: 6px 8px calc(10px + env(safe-area-inset-bottom)); box-sizing: border-box; }
html[data-board=fighter] #stage .gf-field { width: min(100%, calc((100vh - 200px) * 16 / 9)); margin: auto; } /* the field in the middle, the buttons under the thumbs */
`;
function sheet(doc) {
  const old = doc.getElementById('g-fighter-css');
  if (old?.dataset.v === '2') return;
  old?.remove();
  const st = doc.createElement('style');
  st.id = 'g-fighter-css';
  st.dataset.v = '2';
  st.textContent = CSS;
  doc.head.append(st);
}

const BUTTONS = {
  jump: { face: '▲', key: 'W' }, left: { face: '◀', key: 'A' }, crouch: { face: '▼', key: 'S' }, right: { face: '▶', key: 'D' },
  light: { face: '拳', key: 'K' }, lkick: { face: '腿', key: 'L' }, hpunch: { face: '重拳', key: 'O' }, heavy: { face: '重腿', key: ';' },
  skill: { face: '技', key: 'SD+K' },
};
/* Keys by where they sit (event.code): any layout plays alike; `;` is Semicolon wherever it is printed. KOF '97's four:
   K A 轻拳 · L B 轻腿 · O C 重拳 · ; D 重腿. */
const CODES = {
  KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'crouch', KeyK: 'light', KeyL: 'lkick', KeyO: 'hpunch', Semicolon: 'heavy',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'crouch', Space: 'jump',
};
const HELD = new Set(['left', 'right', 'crouch']);
/* W is a press when it goes down (the jump) and a word when it comes up (let go soon: a short hop). */
const LIFT = { jump: 'jumpRelease' };

function padHtml(level, lang) {
  const names = level.me?.buttons ?? {};
  const b = (k) => {
    const face = say(names[k], lang) || BUTTONS[k].face;
    return `<button type="button" data-k="${k}" aria-label="${face}">${face}<small>${BUTTONS[k].key}</small></button>`;
  };
  return `<div class="gf-pad"><div class="gf-dirs">${b('jump')}${b('left')}${b('crouch')}${b('right')}</div>`
    + `<div class="gf-acts">${b('skill')}<div class="gf-diamond">${b('hpunch')}${b('light')}${b('heavy')}${b('lkick')}</div></div></div>`;
}

/** The small-game contract: this bout alone in a container (the 游戏厅, the story's card, the phone). */
export function mount(container, opts = {}) {
  const { data = {} } = opts;
  if (data.levels?.length || (data.level && typeof data.level === 'object')) return run(container, opts, data.levels?.[0] ?? data.level);
  return levelFor(data).then((level) => run(container, opts, level));
}

function run(container, { lang = 'zh', seed = String(Date.now()), signal, shell, peek, winHold = 0 } = {}, level = {}) {
  const doc = container.ownerDocument, win = doc.defaultView, kind = inputKind(doc);
  sheet(doc);
  const root = doc.createElement('div');
  root.className = `g-fighter${kind === 'touch' ? ' is-touch' : ''}`;
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
  // The painted rigs (art/games/fighter/<who>.webp + .json): drawn as soon as they come; the figure in code until then.
  const rigs = {};
  for (const who of ['me', 'foe']) {
    const look = level[who]?.look;
    if (!look?.rig) continue;
    const base = new URL(`../../worlds/jiuding/${look.rig}`, import.meta.url).href;
    const img = new win.Image();
    const loaded = new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
    img.src = `${base}.webp`;
    Promise.all([fetch(`${base}.json`).then((r) => r.json()), loaded])
      .then(([meta]) => { rigs[who] = makeRig(meta, img, look.height); })
      .catch((e) => console.warn('[fighter] rig', who, e));
  }
  const draw = painter(canvas, { art, rigs });
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
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.round((w * FIELD.h) / FIELD.w);
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
    if (HELD.has(k)) { held[k].add(who); sync(); return; }
    const btn = root.querySelector(`button[data-k="${k}"]`);
    btn?.classList.add('is-down');
    win.setTimeout(() => btn?.classList.remove('is-down'), 110);
    apply({ g: k });
  };
  const lift = (k, who) => { if (LIFT[k]) apply({ g: LIFT[k] }); if (HELD.has(k) && held[k].delete(who)) sync(); };
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
  const skillBtn = root.querySelector('button[data-k=skill]'), skillFace = skillBtn.firstChild;
  const skillNames = [say(level.me?.buttons?.skill, lang) || BUTTONS.skill.face, say(level.me?.buttons?.super, lang) || '绝'];
  const frame = (now) => {
    raf = win.requestAnimationFrame(frame);
    let dt = Math.min(50, last ? now - last : 16);
    last = now;
    if (started && !done && !shell?.paused?.() && doc.visibilityState === 'visible') {
      const s0 = g.state;
      if (s0.end && s0.t - s0.end.at < SLOW.ms) dt *= SLOW.rate; // the KO, slowed
      g.state = core.tick(s0, dt);
      if (g.state !== s0) sounded(shell, self, s0, g.state);
      const full = g.state.me.qi >= core.QI;
      if (skillBtn.classList.contains('is-ready') !== full) { skillBtn.classList.toggle('is-ready', full); skillFace.textContent = skillNames[full ? 1 : 0]; }
      skillBtn.classList.toggle('is-cool', !full && g.state.me.cdPf > 0);
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
  const leadText = [ready, hint].filter(Boolean).join('\n\n');
  Promise.resolve(shell?.lead && leadText ? shell.lead(leadText, { auto: 'read', lang }) : null).then(() => {
    if (done) return;
    started = true;
    last = 0;
    doc.activeElement?.blur?.(); // a focused shell button never takes the bout's Space
    shell?.sound?.('start');
  });
  return settled;
}
