// 画猜 · 你画，灵猜 — a Pictionary / Quick, Draw! prototype (Hanli 2026-10-16: 「玩家画AI猜, 试一下吧」).
// In the 游戏厅 only; no story beat embeds it yet. A word from 卷一 (games.json `drawguess`
// `data.words`, each with the spellings that count), sixty seconds, a brush in ink on rice paper.
// When the hand rests, or on 「画好了」, the paper goes to Ling as a picture (drawguess-ling.js: the
// engine's chat with `images`) and she guesses in a line, zh and en; the guess is checked HERE
// against the word and its spellings (drawguess-rules.js) — the model never says it was right.
// One look at a time, at most four a round. If the bound model cannot see, the engine's vision
// gate says so on the first look (a blank sheet, her opening line): the game says it plainly and
// does not start. A 画符 mode (draw a talisman's strokes in order) is a note in doc/games.md only.
// The paper and the player's own strokes are the only things drawn here; nothing is painted in code.
import { guessLoop, isBlindReply, matches, parseReply, pickWord, starsFor } from './drawguess-rules.js';
import { askLing, askOnce, closeRound, declaredBlind, dropOpen, openRound, reachable } from './drawguess-ling.js';

export const meta = {
  id: 'drawguess',
  name: { zh: '画猜 · 你画，灵猜', en: 'Draw · Ling guesses' },
  how: { zh: '照字画。手一停，灵就看一眼。', en: 'Draw the word. Rest your hand and Ling looks.' },
};

export const ROUND_MS = 60000, IDLE_MS = 2500, MAX_LOOKS = 4, EXPORT_PX = 448;
const PAPER = '#e4cfab', INK = '#1d1813';

const T = {
  zh: {
    draw: '画', start: '开始', undo: '撤一笔', clear: '清空', done: '画好了', ling: '灵',
    checking: '灵在看纸……', looking: '灵在看……', looks: '还能看 {n} 眼',
    blind: '这个模型看不见图，画猜开不了。', far: '连不上灵。', err: '灵没看清，再画画。',
    won: '对了，是「{w}」。', time: '时间到。是「{w}」。',
  },
  en: {
    draw: 'Draw', start: 'Start', undo: 'Undo', clear: 'Clear', done: 'Done', ling: 'Ling',
    checking: 'Ling is looking at the paper…', looking: 'Ling is looking…', looks: '{n} looks left',
    blind: 'This model can\'t see pictures, so this game can\'t start.', far: 'Ling can\'t be reached.', err: 'Ling couldn\'t make it out. Keep drawing.',
    won: 'Right — {w}.', time: 'Time. It was {w}.',
  },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

const STYLE = `.g-dg{gap:8px}.g-dg-head{display:flex;align-items:baseline;gap:10px;width:100%;font-family:var(--serif)}
.g-dg-word{font-size:15px;color:var(--dim)}.g-dg-word b{font-size:26px;color:var(--text);letter-spacing:.1em;margin-left:4px}
.g-dg-left{margin-left:auto;font-size:12px;color:var(--faint);font-family:var(--ui)}.g-dg-sec{font-size:18px;font-variant-numeric:tabular-nums;color:var(--ling);min-width:2.2em;text-align:right}
.g-dg-time{width:100%;height:3px;border-radius:2px;background:var(--line);overflow:hidden}.g-dg-time i{display:block;height:100%;background:var(--ling);transform-origin:left;transition:transform .25s linear}
.g-dg-say{width:100%;box-sizing:border-box;min-height:52px;padding:8px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);position:relative}
.g-dg-say::after{content:'';position:absolute;left:22px;bottom:-6px;width:10px;height:10px;background:inherit;border-right:1px solid var(--line);border-bottom:1px solid var(--line);transform:rotate(45deg)}
.g-dg-say b{font-family:var(--serif);color:var(--ling);margin-right:6px}.g-dg-say .g-dg-other{display:block;font-size:12px;color:var(--faint);margin-top:2px}
.g-dg-say.is-wait{color:var(--faint)}
.g-dg-paper{position:relative;width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:radial-gradient(130% 100% at 40% 30%,#ecdabb,${PAPER} 60%,#d8bf98);box-shadow:0 6px 22px rgba(0,0,0,.16)}
.g-dg-paper canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.g-dg-paper.is-off canvas{cursor:default}
.g-dg-veil{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;font-family:var(--serif);color:#4a3d2c;font-size:15px;line-height:1.7;pointer-events:none}
.g-dg-bar{display:flex;gap:8px;width:100%}.g-dg-bar .g-btn-soft{flex:0 0 auto}.g-dg-bar .g-btn-main{flex:1;min-width:0}
.g-dg .g-btn:disabled{opacity:.45;cursor:default}
.g-dg-foot{font-size:11px;color:var(--faint);font-family:var(--ui);min-height:1em}`;

function styleOnce(doc) {
  if (doc.getElementById('g-dg-style')) return;
  const el = doc.createElement('style');
  el.id = 'g-dg-style';
  el.textContent = STYLE;
  doc.head.append(el);
}

let wordsP = null;
async function wordsOf(data) {
  if (data?.words?.length) return data.words;
  wordsP ??= fetch(new URL('../../worlds/jiuding/games.json', import.meta.url)).then((r) => r.json())
    .then((reg) => reg.games.find((g) => g.id === 'drawguess')?.data?.words ?? []).catch(() => []);
  return wordsP;
}

// ── the brush ──────────────────────────────────────────────────────────────────────────────
// A stroke is points in paper units (0..1) with their time; the width follows the speed (slow is
// wet and thick, fast is dry and thin) and a faint wider pass under it is the ink's bleed.

function drawStroke(ctx, pts, size) {
  if (!pts.length) return;
  const base = size * 0.016;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(pts[0][0] * size, pts[0][1] * size, base * 0.7, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  let w = base;
  for (const pass of [{ k: 2.1, a: 0.08 }, { k: 1, a: 0.9 }]) {
    ctx.strokeStyle = INK;
    ctx.globalAlpha = pass.a;
    w = base;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0, t0] = pts[i - 1], [x1, y1, t1] = pts[i];
      const v = Math.hypot(x1 - x0, y1 - y0) / Math.max(1, t1 - t0) * 1000; // paper widths a second
      w += (base * Math.max(0.45, 1.3 - v * 0.55) - w) * 0.35;
      ctx.lineWidth = w * pass.k;
      const mx0 = i > 1 ? (pts[i - 2][0] + x0) / 2 : x0, my0 = i > 1 ? (pts[i - 2][1] + y0) / 2 : y0;
      ctx.beginPath();
      ctx.moveTo(mx0 * size, my0 * size);
      ctx.quadraticCurveTo(x0 * size, y0 * size, ((x0 + x1) / 2) * size, ((y0 + y1) / 2) * size);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The paper as Ling sees it: opaque paper, the strokes, EXPORT_PX square; bare base64 PNG. */
export function paperPng(doc, strokes, px = EXPORT_PX) {
  const c = doc.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, px, px);
  for (const s of strokes) drawStroke(ctx, s, px);
  return c.toDataURL('image/png').split(',')[1];
}

// ── what she is asked ──────────────────────────────────────────────────────────────────────

const ASK_OPEN = '[画猜] 小游戏试玩，与故事无关；不调用任何工具，不提游戏或模型。纸还空着，小满要画一样东西给你猜。'
  + '只回两行：第一行一句中文开场，不超过十二字，照你平常说话的样子；第二行同一句的英文。';
const askGuess = (prev) => '[画猜] 小游戏试玩，与故事无关；不调用任何工具，不提游戏或模型。图上是小满用毛笔画的一样寻常东西，也许还没画完。'
  + '照你平常说话的样子猜它是什么。只回三行：第一行一句中文，不超过二十字；第二行同一句的英文；第三行「猜：」加一个中文名词。'
  + (prev.length ? `你先前猜过：${prev.join('、')}。画添了笔，可以改口。` : '');

// The engine's verdict on sight, once a page per model asked: { blind, line, model }.
const sight = new Map();
let lastWord = null; // the word just drawn on this page: never twice running

async function lookFirst(doc, model) {
  const key = model ?? '';
  if (sight.has(key)) return sight.get(key);
  if (!(await reachable())) return { far: true };
  const named = model ? null : await declaredBlind().catch(() => null);
  if (named) return { blind: true, model: { id: named } };
  const r = await askOnce({ png: paperPng(doc, [], 32), prompt: ASK_OPEN, model });
  log({ kind: 'open', ms: r.ms, model: r.model?.id, tools: r.tools, text: r.text });
  const seen = isBlindReply(r.text) ? { blind: true, model: r.model, said: r.text } : { blind: false, model: r.model, line: parseReply(r.text) };
  sight.set(key, seen);
  return seen;
}

/** What each look cost and said, for the test page's console (and a live check's script). */
function log(row) {
  const all = (globalThis.__drawguess ??= []);
  all.push({ at: Date.now(), ...row });
  console.info('[drawguess]', JSON.stringify(row));
}

// ── the game ───────────────────────────────────────────────────────────────────────────────

export function mount(container, { data = {}, lang = 'zh', signal } = {}) {
  const doc = container.ownerDocument;
  const w = T[lang] ?? T.zh;
  styleOnce(doc);
  const root = doc.createElement('div');
  root.className = 'g-ink g-dg';
  root.innerHTML = `<div class="g-dg-head"><span class="g-dg-word">${w.draw}<b></b></span><span class="g-dg-left"></span><span class="g-dg-sec"></span></div>`
    + '<div class="g-dg-time"><i></i></div>'
    + `<div class="g-dg-say is-wait"><b>${w.ling}</b><span class="g-dg-line"></span><span class="g-dg-other"></span></div>`
    + '<div class="g-dg-paper is-off"><canvas></canvas><div class="g-dg-veil"></div></div>'
    + `<div class="g-dg-bar"><button type="button" class="g-btn g-btn-soft" data-k="undo">${w.undo}</button>`
    + `<button type="button" class="g-btn g-btn-soft" data-k="clear">${w.clear}</button>`
    + `<button type="button" class="g-btn g-btn-main" data-k="go">${w.start}</button></div>`
    + '<div class="g-dg-foot"></div>';
  container.replaceChildren(root);
  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas'), paper = $('.g-dg-paper'), veil = $('.g-dg-veil'), goBtn = $('[data-k="go"]');

  const g = { phase: 'check', word: null, strokes: [], cur: null, guesses: [], t0: 0, timer: null, loop: null };
  let finish = () => {};
  root.dataset.phase = g.phase;
  const setPhase = (p) => { g.phase = p; root.dataset.phase = p; paper.classList.toggle('is-off', p !== 'draw'); };

  const say = (line, other = '', wait = false) => {
    $('.g-dg-line').textContent = line ?? '';
    $('.g-dg-other').textContent = other ?? '';
    $('.g-dg-say').classList.toggle('is-wait', wait);
  };
  const sayParsed = (p) => say(lang === 'en' ? (p.en ?? p.zh) : (p.zh ?? p.en), lang === 'en' ? p.zh : p.en);
  const foot = (t) => { $('.g-dg-foot').textContent = t; };
  const lefts = () => { $('.g-dg-left').textContent = g.loop ? fill(w.looks, { n: g.loop.left }) : ''; };

  // The canvas follows its box at the device's pixel ratio; the strokes are kept in paper units.
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  };
  const redraw = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of g.strokes) drawStroke(ctx, s, canvas.width);
    if (g.cur) drawStroke(ctx, g.cur, canvas.width);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);

  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), e.timeStamp || performance.now()];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (g.phase !== 'draw' || (e.button ?? 0) !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the canvas still hears it */ }
    g.cur = [at(e)];
    g.loop.stroke();
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!g.cur) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) g.cur.push(at(ev));
    redraw();
  });
  const lift = () => {
    if (!g.cur) return;
    g.strokes.push(g.cur);
    g.cur = null;
    redraw();
    g.loop?.stroke();
    g.loop?.rest();
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  root.addEventListener('click', (e) => {
    const k = e.target.closest?.('[data-k]')?.dataset.k;
    if (k === 'go' && g.phase === 'ready') return begin();
    if (g.phase !== 'draw') return;
    if (k === 'undo' && g.strokes.length) { g.strokes.pop(); redraw(); g.loop.stroke(); g.loop.rest(); }
    if (k === 'clear' && g.strokes.length) { g.strokes = []; redraw(); g.loop.stroke(); }
    if (k === 'go') g.loop.now();
  });

  const onReply = (r) => {
    const p = parseReply(r.text);
    const ok = p.guess != null && matches(p.guess, g.word);
    log({ kind: 'guess', word: g.word.zh, n: g.loop.calls, ms: r.ms, model: r.model?.id, guess: p.guess, ok, tools: r.tools, zh: p.zh, en: p.en });
    g.note = '';
    if (p.guess) g.guesses.push(p.guess);
    sayParsed(p.zh || p.en ? p : { zh: p.guess, en: null });
    if (ok) end(true);
  };
  const onError = (e) => {
    log({ kind: 'error', message: String(e?.message ?? e) });
    g.note = w.err;
  };

  const tick = () => {
    const left = Math.max(0, ROUND_MS - (performance.now() - g.t0));
    $('.g-dg-sec').textContent = String(Math.ceil(left / 1000));
    $('.g-dg-time i').style.transform = `scaleX(${left / ROUND_MS})`;
    lefts();
    foot(g.loop?.busy ? w.looking : g.note || (g.model ? `Ling · ${g.model}` : ''));
    if (left <= 0 && g.phase === 'draw') closing();
  };
  const closing = () => {
    setPhase('closing');
    g.cur = null;
    g.loop.close();
    if (!g.loop.busy) end(false);
  };

  const begin = () => {
    g.word = pickWord(g.words, Math.random, lastWord);
    lastWord = g.word.zh;
    $('.g-dg-word b').textContent = lang === 'en' ? `${g.word.zh} · ${g.word.en}` : g.word.zh;
    g.strokes = [];
    g.guesses = [];
    veil.textContent = '';
    g.sid = openRound();
    g.sid.catch(() => {});
    g.loop = guessLoop({
      max: MAX_LOOKS,
      idleMs: IDLE_MS,
      send: async () => {
        foot(w.looking);
        const png = paperPng(doc, g.strokes), prompt = askGuess(g.guesses);
        return askLing({ sid: await g.sid, png, prompt, model: data.model ?? null, signal });
      },
      onReply,
      onError,
      onSettle: () => { if (g.phase === 'closing') end(false); },
    });
    goBtn.textContent = w.done;
    setPhase('draw');
    g.t0 = performance.now();
    g.timer = setInterval(tick, 250);
    tick();
    redraw();
  };

  const end = (won) => {
    if (g.phase === 'over') return;
    clearInterval(g.timer);
    g.loop?.stop();
    g.sid?.then((sid) => closeRound(sid), () => {});
    setPhase('over');
    lefts();
    root.querySelectorAll('[data-k]').forEach((b) => { b.disabled = true; });
    const word = lang === 'en' ? g.word.en : g.word.zh;
    if (won) root.classList.add('is-won');
    foot(fill(won ? w.won : w.time, { w: word }));
    const calls = g.loop?.calls ?? 0;
    setTimeout(() => finish(won ? { won: true, stars: starsFor(calls), grade: `${calls}` } : { won: false, grade: `${word}` }), won ? 1800 : 600);
  };

  return new Promise((resolve) => {
    let settled = false;
    finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(g.timer);
      g.loop?.stop();
      ro.disconnect();
      resolve(result);
    };
    signal?.addEventListener('abort', () => { finish({ won: false, left: true }); dropOpen(); }, { once: true });
    globalThis.addEventListener?.('pagehide', () => dropOpen(), { once: true });
    start();
  });

  async function start() {
    say('……', '', true);
    foot(w.checking);
    veil.textContent = '';
    goBtn.disabled = true;
    g.words = await wordsOf(data);
    let s;
    try { s = await lookFirst(doc, data.model ?? null); } catch (e) { s = { far: true, err: e }; }
    g.model = s.model?.id ?? null;
    foot(g.model ? `Ling · ${g.model}` : '');
    if (s.far) { setPhase('far'); veil.textContent = w.far; return; }
    if (s.blind) {
      setPhase('blind');
      veil.textContent = w.blind;
      foot(s.said ?? '');
      root.querySelectorAll('[data-k]').forEach((b) => { b.disabled = true; });
      return;
    }
    if (s.line?.zh || s.line?.en) sayParsed(s.line); else say('……', '', true);
    setPhase('ready');
    goBtn.disabled = false;
  }
}
