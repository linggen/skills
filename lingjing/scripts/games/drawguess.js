// 画猜 · 你画，灵猜 — a Pictionary / Quick, Draw! prototype (Hanli 2026-10-16: 「玩家画AI猜, 试一下吧」).
// In the 游戏厅 only; no story beat embeds it yet. A word from 卷一 (games.json `drawguess`
// `data.words`, each with the spellings that count), sixty seconds, a brush in ink on rice paper.
// When the hand rests, or on 「画好了」, the paper goes to Ling as a picture (drawguess-ling.js: the
// engine's chat with `images`) and she guesses in a line, zh and en; the guess is checked HERE
// against the word and its spellings (drawguess-rules.js) — the model never says it was right.
// One look at a time, at most four a round. If the bound model cannot see, the engine's vision
// gate says so on the first look (a blank sheet, her opening line): the game says it plainly and
// does not start. A 画符 mode (draw a talisman's strokes in order) is a note in doc/games.md only.
// 猜者 (Hanli 10-16: 「游戏里可以让yinyue猜」): Ling, or 银月 — her guest turn at Lingjing's table
// (SKILL.md `place.yinyue`: her tools there are Voice · AppTool · Story, no memory), in her proud
// 妖王 voice, her lines on the paper only. She is gated as in the world: until the save has met her
// (`absent_until`) the engine runs no turn and answers `absent` — the game says so and won't start.
// The paper and the player's own strokes are the only things drawn here; nothing is painted in code.
import { guessLoop, isBlindReply, matches, parseReply, pickWord, starsFor } from './drawguess-rules.js';
import { askLing, askOnce, closeRound, declaredBlind, dropOpen, openRound, reachable } from './drawguess-ling.js';

export const meta = {
  id: 'drawguess',
  name: { zh: '画猜 · 你画我猜', en: 'Draw · they guess' },
  how: { zh: '照字画。手一停，猜的人就看一眼。', en: 'Draw the word. Rest your hand and they look.' },
};

export const ROUND_MS = 60000, IDLE_MS = 2500, MAX_LOOKS = 4, EXPORT_PX = 448;
const PAPER = '#e4cfab', INK = '#1d1813';

const T = {
  zh: {
    draw: '画', start: '开始', undo: '撤一笔', clear: '清空', done: '画好了', who: '猜者', names: { ling: '灵', yinyue: '银月' },
    checking: '{who}在看纸……', looking: '{who}在看……', looks: '还能看 {n} 眼',
    blind: '这个模型看不见图，画猜开不了。', far: '连不上灵。', err: '{who}没看清，再画画。',
    absent: '还没遇见银月。', unavailable: '银月不在。',
    won: '对了，是「{w}」。', time: '时间到。是「{w}」。',
  },
  en: {
    draw: 'Draw', start: 'Start', undo: 'Undo', clear: 'Clear', done: 'Done', who: 'Guesser', names: { ling: 'Ling', yinyue: 'Yinyue' },
    checking: '{who} is looking at the paper…', looking: '{who} is looking…', looks: '{n} looks left',
    blind: 'This model can\'t see pictures, so this game can\'t start.', far: 'Ling can\'t be reached.', err: '{who} couldn\'t make it out. Keep drawing.',
    absent: 'You haven\'t met Yinyue yet.', unavailable: 'Yinyue isn\'t here.',
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
.g-dg[data-phase=blind] .g-dg-say,.g-dg[data-phase=far] .g-dg-say,.g-dg[data-phase=absent] .g-dg-say{visibility:hidden}
.g-dg-who{display:flex;align-items:center;gap:6px;width:100%;font-size:13px;color:var(--dim);font-family:var(--serif)}
.g-dg-who button{min-height:32px;padding:2px 14px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--dim);font:inherit;cursor:pointer}
.g-dg-who button.is-on{border-color:var(--ling);background:var(--ling-soft);color:var(--ling);font-weight:600}
.g-dg-who button:disabled{opacity:.5;cursor:default}
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

// ── what the guesser is asked ──────────────────────────────────────────────────────────────

export const GUESSERS = ['ling', 'yinyue'];
const HEAD = '[画猜] 小游戏试玩，与故事无关；不调用任何工具，不提游戏或模型。';
const VOICE = {
  ling: '照你平常说话的样子',
  yinyue: '你是银月，骄傲的妖王，自称本王：画得糟就毒舌一句，猜中了才勉强满意，话要短',
};
export const askOpen = (who) => `${HEAD}纸还空着，小满要画一样东西给你猜。${VOICE[who]}。`
  + '只回两行：第一行一句中文开场，不超过十二字；第二行同一句的英文。';
export const askGuess = (who, prev) => `${HEAD}图上是小满用毛笔画的一样寻常东西，也许还没画完。${VOICE[who]}，猜它是什么。`
  + '只回三行：第一行一句中文，不超过二十字；第二行同一句的英文；第三行「猜：」加一个中文名词。'
  + (prev.length ? `你先前猜过：${prev.join('、')}。画添了笔，可以改口。` : '');

// The engine's verdict on sight, once a page per guesser and model: { blind, line, model }. A
// refusal (`absent`, `unavailable`) is not kept: the save may meet her while the page is open.
const sight = new Map();
let lastWord = null; // the word just drawn on this page: never twice running

// Who guesses: `data.who`, else the viewer's last pick (a per-viewer convenience), else Ling.
const WHO_KEY = 'lingjing.drawguess.who';
function whoKept(data) {
  if (GUESSERS.includes(data?.who)) return data.who;
  try { const k = globalThis.localStorage?.getItem(WHO_KEY); if (GUESSERS.includes(k)) return k; } catch { /* no storage */ }
  return 'ling';
}
function keepWho(who) { try { globalThis.localStorage?.setItem(WHO_KEY, who); } catch { /* no storage */ } }

async function lookFirst(doc, who, model) {
  const key = `${who}|${model ?? ''}`;
  if (sight.has(key)) return sight.get(key);
  if (!(await reachable())) return { far: true };
  const named = model ? null : await declaredBlind().catch(() => null);
  if (named) return { blind: true, model: { id: named } };
  const r = await askOnce({ agent: who, png: paperPng(doc, [], 32), prompt: askOpen(who), model });
  log({ kind: 'open', who, ms: r.ms, model: r.model?.id, tools: r.tools, text: r.text, refused: r.refused });
  if (r.refused) return { refused: r.refused };
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
  const names = w.names;
  const whoBtns = GUESSERS.map((k) => `<button type="button" data-who="${k}">${names[k]}</button>`).join('');
  root.innerHTML = `<div class="g-dg-who"><span>${w.who}</span>${whoBtns}</div><div class="g-dg-head"><span class="g-dg-word">${w.draw}<b></b></span><span class="g-dg-left"></span><span class="g-dg-sec"></span></div>`
    + '<div class="g-dg-time"><i></i></div>'
    + `<div class="g-dg-say is-wait"><b></b><span class="g-dg-line"></span><span class="g-dg-other"></span></div>`
    + '<div class="g-dg-paper is-off"><canvas></canvas><div class="g-dg-veil"></div></div>'
    + `<div class="g-dg-bar"><button type="button" class="g-btn g-btn-soft" data-k="undo">${w.undo}</button>`
    + `<button type="button" class="g-btn g-btn-soft" data-k="clear">${w.clear}</button>`
    + `<button type="button" class="g-btn g-btn-main" data-k="go">${w.start}</button></div>`
    + '<div class="g-dg-foot"></div>';
  container.replaceChildren(root);
  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas'), paper = $('.g-dg-paper'), veil = $('.g-dg-veil'), goBtn = $('[data-k="go"]');

  const g = { phase: 'check', who: whoKept(data), word: null, strokes: [], cur: null, guesses: [], t0: 0, timer: null, loop: null };
  let finish = () => {};
  root.dataset.phase = g.phase;
  const CHOOSE = new Set(['ready', 'blind', 'far', 'absent']); // the guesser may change only before a round
  const setPhase = (p) => {
    g.phase = p;
    root.dataset.phase = p;
    paper.classList.toggle('is-off', p !== 'draw');
    root.querySelectorAll('[data-who]').forEach((b) => { b.disabled = !CHOOSE.has(p); b.classList.toggle('is-on', b.dataset.who === g.who); });
  };
  const sub = (s) => fill(s, { who: names[g.who] });

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
    const who = e.target.closest?.('[data-who]')?.dataset.who;
    if (who && CHOOSE.has(g.phase) && who !== g.who) { g.who = who; keepWho(who); start(); return; }
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
    if (r.refused) return onError(new Error(r.refused));
    log({ kind: 'guess', who: g.who, word: g.word.zh, n: g.loop.calls, ms: r.ms, model: r.model?.id, guess: p.guess, ok, tools: r.tools, zh: p.zh, en: p.en });
    g.note = '';
    if (p.guess) g.guesses.push(p.guess);
    sayParsed(p.zh || p.en ? p : { zh: p.guess, en: null });
    if (ok) end(true);
  };
  const onError = (e) => {
    log({ kind: 'error', message: String(e?.message ?? e) });
    g.note = sub(w.err);
  };

  const tick = () => {
    const left = Math.max(0, ROUND_MS - (performance.now() - g.t0));
    $('.g-dg-sec').textContent = String(Math.ceil(left / 1000));
    $('.g-dg-time i').style.transform = `scaleX(${left / ROUND_MS})`;
    lefts();
    foot(g.loop?.busy ? sub(w.looking) : g.note || modelLine());
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
        foot(sub(w.looking));
        const png = paperPng(doc, g.strokes), prompt = askGuess(g.who, g.guesses);
        return askLing({ sid: await g.sid, agent: g.who, png, prompt, model: data.model ?? null, signal });
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

  function modelLine() { return g.model ? `${names[g.who]} · ${g.model}` : ''; }

  async function start() {
    const who = g.who;
    setPhase('check');
    $('.g-dg-say b').textContent = names[who];
    say('……', '', true);
    foot(sub(w.checking));
    veil.textContent = '';
    root.querySelectorAll('[data-k]').forEach((b) => { b.disabled = false; });
    goBtn.disabled = true;
    g.words = await wordsOf(data);
    let s;
    try { s = await lookFirst(doc, who, data.model ?? null); } catch (e) { s = { far: true, err: e }; }
    if (who !== g.who) return; // the guesser changed while this one was asked
    g.model = s.model?.id ?? null;
    foot(modelLine());
    if (s.far) { setPhase('far'); veil.textContent = w.far; return; }
    if (s.refused) { setPhase('absent'); veil.textContent = w[s.refused]; foot(''); return; }
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
