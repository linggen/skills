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
import { ERASER, guessLoop, isBlindReply, letterGrade, matches, parseReply, pickWord, roundsOf, starsFor, strokeOp, stubReply } from './drawguess-rules.js';
import { askLing, askOnce, closeRound, declaredBlind, dropOpen, openRound, reachable } from './drawguess-ling.js';

export const meta = {
  id: 'drawguess',
  name: { zh: '画猜 · 你画我猜', en: 'Draw · they guess' },
  how: { zh: '照字画。手一停，猜的人就看一眼。', en: 'Draw the word. Rest your hand and they look.' },
  ai: true, // the other half is a model's (no bot plays it: tests/board-bots.test.mjs)
};

// She looks when the hand has rested 2 s, or at once on 「画好了」 (Hanli 10-19: 「玩家动作停止3秒或者点画完了的时候, 让yingyue猜」; then 「3秒太长, 2秒吧」).
export const ROUND_MS = 60000, IDLE_MS = 2000, MAX_LOOKS = 4, EXPORT_PX = 448;
const PAPER = '#e4cfab', INK = '#1d1813';

const T = {
  zh: {
    draw: '画', start: '开始', pen: '笔', eraser: '擦', clear: '清空', done: '画好了', who: '猜者', names: { ling: '灵', yinyue: '银月' },
    checking: '{who}在看纸……', looking: '{who}在看……', looks: '还能看 {n} 眼',
    blind: '这个模型看不见图，画猜开不了。', far: '连不上灵。', err: '{who}没看清，再画画。',
    absent: '还没遇见银月。', unavailable: '银月不在。', asleep: '银月在木牌里睡着，叫不应。',
    won: '对了，是「{w}」。', time: '时间到。是「{w}」。',
    next: '下一句', again: '再画一张', write: '就写字吧', off: '测试存档不叫银月。', plain: '这一句只写了字：「{w}」。',
  },
  en: {
    draw: 'Draw', start: 'Start', pen: 'Brush', eraser: 'Eraser', clear: 'Clear', done: 'Done', who: 'Guesser', names: { ling: 'Ling', yinyue: 'Yinyue' },
    checking: '{who} is looking at the paper…', looking: '{who} is looking…', looks: '{n} looks left',
    blind: 'This model can\'t see pictures, so this game can\'t start.', far: 'Ling can\'t be reached.', err: '{who} couldn\'t make it out. Keep drawing.',
    absent: 'You haven\'t met Yinyue yet.', unavailable: 'Yinyue isn\'t here.', asleep: 'Yinyue is asleep in the token and does not answer.',
    won: 'Right — {w}.', time: 'Time. It was {w}.',
    next: 'Next line', again: 'Draw another', write: 'Just write it', off: 'A scratch save does not call Yinyue.', plain: 'This line is in words only: {w}.',
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
.g-dg[data-phase=blind] .g-dg-say,.g-dg[data-phase=far] .g-dg-say,.g-dg[data-phase=absent] .g-dg-say,.g-dg[data-phase=off] .g-dg-say{visibility:hidden}
.g-dg-who{display:flex;align-items:center;gap:6px;width:100%;font-size:13px;color:var(--dim);font-family:var(--serif)}
.g-dg-who button{min-height:32px;padding:2px 14px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--dim);font:inherit;cursor:pointer}
.g-dg-who button.is-on{border-color:var(--ling);background:var(--ling-soft);color:var(--ling);font-weight:600}
.g-dg-who button:disabled{opacity:.5;cursor:default}
.g-dg-paper{position:relative;width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:radial-gradient(130% 100% at 40% 30%,#ecdabb,${PAPER} 60%,#d8bf98);box-shadow:0 6px 22px rgba(0,0,0,.16)}
.g-dg-paper canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21c1.5-.3 2.6-1 3.2-2.2L18.6 6.4a2 2 0 0 0-2.8-2.8L3.4 16C2.6 17 2.6 19 3 21z' fill='%23f3e6c8' stroke='%23332' stroke-width='1.3'/%3E%3Cpath d='M3 21c.9-.2 1.6-.6 2-1.3' stroke='%23111' stroke-width='2'/%3E%3C/svg%3E\") 2 22, crosshair}
.g-dg-paper.is-off canvas{cursor:default}
.g-dg-veil{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;font-family:var(--serif);color:#4a3d2c;font-size:15px;line-height:1.7;pointer-events:none}
.g-dg-bar{display:flex;gap:8px;width:100%}.g-dg-bar .g-btn-soft{flex:0 0 auto}.g-dg-bar .g-btn-main{flex:1;min-width:0}
.g-dg .g-btn:disabled{opacity:.45;cursor:default}
.g-dg-bar .g-dg-tool{padding:8px 12px;font-family:var(--serif);font-size:17px;background:transparent;border-color:var(--line);color:var(--dim)}
.g-dg-bar .g-dg-tool.is-on{border-color:var(--ling);background:var(--ling-soft);color:var(--ling);font-weight:600}
.g-dg-eraser{position:absolute;left:0;top:0;border:1.5px solid rgba(29,24,19,.7);border-radius:50%;background:rgba(244,232,210,.35);box-shadow:0 0 0 1px rgba(244,232,210,.6);pointer-events:none;transform:translate(-50%,-50%);display:none}
.g-dg-paper.is-erasing canvas{cursor:none}
.g-dg-foot{font-size:11px;color:var(--faint);font-family:var(--ui);min-height:1em}
.g-dg-letter{width:100%;box-sizing:border-box;padding:6px 10px;border-left:2px solid var(--line);font-family:var(--serif);font-size:15px;line-height:1.6;color:var(--text)}
.g-dg-letter:empty{display:none}.g-dg-letter .g-dg-ask{display:block;margin-top:4px;font-size:16px;color:var(--accent,#8a5a1f)}.g-dg-letter small{display:block;font-size:11px;color:var(--faint);font-family:var(--ui)}
.g-dg.is-fixed .g-dg-who{display:none}`;

function styleOnce(doc) {
  if (doc.getElementById('g-dg-style')) return;
  const el = doc.createElement('style');
  el.id = 'g-dg-style';
  el.textContent = STYLE;
  doc.head.append(el);
}

let rowP = null;
const rowData = () => (rowP ??= fetch(new URL('../../worlds/jiuding/games.json', import.meta.url)).then((r) => r.json())
  .then((reg) => reg.games.find((g) => g.id === 'drawguess')?.data ?? {}).catch(() => ({})));
async function wordsOf(data) {
  if (data?.words?.length) return data.words;
  return (await rowData()).words ?? [];
}
/** A set's rounds (`data.set`, games.json drawguess `data.sets`): the 家信's lines, each with its word. */
async function setOf(data) {
  if (!data?.set) return null;
  const row = await rowData();
  const rounds = roundsOf(row.sets?.[data.set], row.words ?? []);
  return rounds.length ? rounds : null;
}

// ── the brush and the eraser ───────────────────────────────────────────────────────────────
// A stroke is points in paper units (0..1) with their time; the width follows the speed (slow is
// wet and thick, fast is dry and thin) and a faint wider pass under it is the ink's bleed. An
// eraser stroke (`erase` set) rubs the ink out along its path, ERASER wide (drawguess-rules.js),
// on the ink layer only: the paper under it stays.

function eraseStroke(ctx, pts, size) {
  ctx.save();
  ctx.globalCompositeOperation = strokeOp(pts);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ERASER * size;
  ctx.beginPath();
  if (pts.length === 1) ctx.arc(pts[0][0] * size, pts[0][1] * size, (ERASER * size) / 2, 0, Math.PI * 2);
  else pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size)));
  if (pts.length === 1) ctx.fill(); else ctx.stroke();
  ctx.restore();
}

function drawStroke(ctx, pts, size) {
  if (!pts.length) return;
  if (pts.erase) return eraseStroke(ctx, pts, size);
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
  const ink = doc.createElement('canvas');
  ink.width = ink.height = px;
  const ictx = ink.getContext('2d');
  for (const s of strokes) drawStroke(ictx, s, px); // the eraser cuts the ink, never the paper
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(ink, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}

// ── what the guesser is asked ──────────────────────────────────────────────────────────────

export const GUESSERS = ['ling', 'yinyue'];
const HEAD = '[画猜] 小游戏试玩，与故事无关；不调用任何工具，不提游戏或模型。';
// In the story (a 家信, 本王考考你, a 秘境 奇遇, a 传闻's step) the round carries a line of facts
// (`data.context`: where they are, what the picture is for) in place of 「与故事无关」.
const headOf = (context) => (context ? `[画猜] ${context}；不调用任何工具，不提游戏或模型。` : HEAD);
const VOICE = {
  ling: '照你平常说话的样子',
  yinyue: '你是银月，骄傲的妖王，自称本王：画得糟就毒舌一句，猜中了才勉强满意，话要短',
};
export const askOpen = (who, context = null) => `${headOf(context)}纸还空着，小满要画一样东西给你猜。${VOICE[who]}。`
  + '只回两行：第一行一句中文开场，不超过十二字；第二行同一句的英文。';
export const askGuess = (who, prev, context = null) => `${headOf(context)}图上是小满用毛笔画的一样寻常东西，也许还没画完。${VOICE[who]}，猜它是什么。`
  + '只回三行：第一行一句中文，不超过二十字；第二行同一句的英文；第三行「猜：」加一个中文名词。'
  + (prev.length ? `你先前猜过：${prev.join('、')}。画添了笔，可以改口。` : '');

/* The reveal (Hanli 10-19: 「最后解释答案的时候, 让yingyue表达一下懊恼等感情, 评论一下作者的画. 把情绪价值拉满」):
   one more look at the finished picture, now with the answer — she owns the miss or crows over the hit,
   and says something about the drawing itself. */
export const askReveal = (who, word, prev, won, context = null) => `${headOf(context)}这一局小满画的是「${word}」。`
  + (prev.length ? `你先后猜过：${prev.join('、')}。` : '你一眼都没猜。')
  + (won ? '你猜中了。' : '你没猜中。')
  + `${VOICE[who]}。看着这张画，按你的性子把情绪说足，再具体点评他的画：`
  + (won ? '猜中了——惊喜又得意，顺口夸他一句，夸也要居高临下。' : '没猜中——懊恼、不服，把锅甩给他的画：说清这东西该怎么画才对（缺了哪一笔、哪一笔把你带偏了）；差一点的要说差一点。')
  + `口气参考（别照抄，用你自己的话）：猜中时像「哇，果然是${word}！小满，你这画在凡人里也算不赖了」；`
  + '猜错时像「你小子乱画什么！鸡要有尖嘴和爪子——凡人果然是凡人」。'
  + '只回两行：第一行一句中文，不超过四十字；第二行同一句的英文。';

// The engine's verdict on sight, once a page per guesser and model: { blind, line, model }. A
// refusal (`absent`, `unavailable`) is not kept: the save may meet her while the page is open.
const sight = new Map();
let lastWord = null; // the word just drawn on this page: never twice running

// Who guesses: always 银月 (Hanli 10-19: 「让yinyue猜吧, 不要选ling或者yinyue了」); `data.who` only for tests.
const WHO_KEY = 'lingjing.drawguess.who';
function whoKept(data) {
  return GUESSERS.includes(data?.who) ? data.who : 'yinyue';
}
function keepWho(who) { try { globalThis.localStorage?.setItem(WHO_KEY, who); } catch { /* no storage */ } }

async function lookFirst(doc, who, model, { open = true, seam = null, context = null } = {}) {
  // The scratch seam: a 测试存档 never calls her (`stub` answers on the page, `off` not at all).
  if (seam === 'stub') return { blind: false, model: { id: 'stub' } };
  if (seam) return { off: true };
  const key = `${who}|${model ?? ''}`;
  if (sight.has(key)) return sight.get(key);
  if (!(await reachable())) return { far: true };
  const named = model ? null : await declaredBlind().catch(() => null);
  if (named) return { blind: true, model: { id: named } };
  // In the story no opening look is spent (a look is ~8.7k tokens): the first guess says whether she can see.
  if (!open) return { blind: false, model: null };
  const png = paperPng(doc, [], 32), prompt = askOpen(who, context);
  log({ kind: 'sent', who, open: true }, { png, prompt });
  const r = await askOnce({ agent: who, png, prompt, model });
  log({ kind: 'open', who, ms: r.ms, model: r.model?.id, tools: r.tools, text: r.text, refused: r.refused });
  if (r.refused) return { refused: r.refused };
  const seen = isBlindReply(r.text) ? { blind: true, model: r.model, said: r.text } : { blind: false, model: r.model, line: parseReply(r.text) };
  sight.set(key, seen);
  return seen;
}

/** What each look cost and said, for the test page's console (and a live check's script). `full`
 *  (the picture and the words sent) goes to the tracers only — never into the console. */
function log(row, full = null) {
  const all = (globalThis.__drawguess ??= []);
  const at = Date.now();
  all.push({ at, ...row });
  console.info('[drawguess]', JSON.stringify(row));
  for (const fn of tracers) { try { fn({ at, ...row, ...full }); } catch { /* a tracer never breaks the round */ } }
}
// Who hears every look as it goes — the 游戏厅's side panel (arcade-trace.js): what was sent (the
// PNG, the words) and what came back, as it happened. In the story nobody listens.
const tracers = new Set();
/** Hear every row; answers the way to stop. */
export function onTrace(fn) { tracers.add(fn); return () => tracers.delete(fn); }

// ── the game ───────────────────────────────────────────────────────────────────────────────

export function mount(container, { data = {}, lang = 'zh', signal } = {}) {
  const doc = container.ownerDocument;
  const w = T[lang] ?? T.zh;
  styleOnce(doc);
  // In the story (`data.fixed`) the guesser is set — always 银月 — and no picker shows; no opening
  // look is spent (`data.open`), the round may say where it is (`data.context`), a 测试存档 never
  // calls her (`data.seam`: 'stub' answers on the page, 'off' not at all), the rules may hand the
  // word as the round begins (`data.begin()`), and a 家信 (`data.set`) is several lines in a row.
  const fixed = true; // no 猜者 picker: she always guesses (story or 游戏厅)
  const max = Math.max(1, Number(data.maxLooks) || MAX_LOOKS);
  const ctxLine = typeof data.context === 'string' ? data.context : null;
  const root = doc.createElement('div');
  root.className = `g-ink g-dg${fixed ? ' is-fixed' : ''}`;
  const names = w.names;
  const whoBtns = GUESSERS.map((k) => `<button type="button" data-who="${k}">${names[k]}</button>`).join('');
  root.innerHTML = `<div class="g-dg-who"><span>${w.who}</span>${whoBtns}</div><div class="g-dg-head"><span class="g-dg-word">${w.draw}<b></b></span><span class="g-dg-left"></span><span class="g-dg-sec"></span></div>`
    + '<div class="g-dg-time"><i></i></div>'
    + '<div class="g-dg-letter"></div>'
    + `<div class="g-dg-say is-wait"><b></b><span class="g-dg-line"></span><span class="g-dg-other"></span></div>`
    + '<div class="g-dg-paper is-off"><canvas></canvas><div class="g-dg-eraser"></div><div class="g-dg-veil"></div></div>'
    + `<div class="g-dg-bar"><button type="button" class="g-btn g-btn-soft g-dg-tool is-on" data-k="pen">${w.pen}</button>`
    + `<button type="button" class="g-btn g-btn-soft g-dg-tool" data-k="eraser">${w.eraser}</button>`
    + `<button type="button" class="g-btn g-btn-soft" data-k="clear">${w.clear}</button>`
    + `<button type="button" class="g-btn g-btn-main" data-k="go">${w.start}</button></div>`
    + '<div class="g-dg-foot"></div>';
  container.replaceChildren(root);
  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas'), paper = $('.g-dg-paper'), veil = $('.g-dg-veil'), goBtn = $('[data-k="go"]'), rub = $('.g-dg-eraser');

  const who0 = fixed && GUESSERS.includes(data.who) ? data.who : whoKept(data);
  const g = { phase: 'check', who: who0, tool: 'pen', word: null, strokes: [], cur: null, guesses: [], t0: 0, timer: null, loop: null, rounds: null, i: 0, got: 0 };
  let finish = () => {};
  root.dataset.phase = g.phase;
  const CHOOSE = new Set(['ready', 'blind', 'far', 'absent']); // the guesser may change only before a round
  const CANT = new Set(['blind', 'far', 'absent', 'off']); //     she cannot be asked: a 家信 may still be written (`data.fallback`)
  const setPhase = (p) => {
    g.phase = p;
    root.dataset.phase = p;
    paper.classList.toggle('is-off', p !== 'draw' && p !== 'ready');
    root.querySelectorAll('[data-who]').forEach((b) => { b.disabled = fixed || !CHOOSE.has(p); b.classList.toggle('is-on', b.dataset.who === g.who); });
    // 笔 · 擦 answer on fresh paper too: the first stroke starts the round.
    if (p === 'ready') root.querySelectorAll('.g-dg-tool').forEach((b) => { b.disabled = false; });
    // Free play: the word is dealt on fresh paper, so he sees what to draw before the first stroke.
    if (p === 'ready' && !g.rounds && !data.word && typeof data.begin !== 'function') {
      g.next = pickWord(g.words, Math.random, lastWord);
      $('.g-dg-word b').textContent = lang === 'en' ? `${g.next.zh} · ${g.next.en}` : g.next.zh;
    }
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
  const pickLang = (o) => (o ? (lang === 'en' ? o.en ?? o.zh : o.zh ?? o.en) : '');
  /* A 家信's line over the paper, and which of the lines it is. */
  const letter = () => {
    const r = g.rounds?.[g.i], el = $('.g-dg-letter');
    if (!r) { el.textContent = ''; return; }
    el.innerHTML = '';
    el.append(pickLang(r.line));
    // What to draw, said in the box itself (Hanli 10-19: 「这句话不清楚, 需要写明让画盆」).
    if (r.word) {
      const ask = doc.createElement('b');
      ask.className = 'g-dg-ask';
      ask.textContent = lang === 'en' ? `Beside it, draw a ${r.word.en} for Mother.` : `在这句旁边，画一个${r.word.zh}给娘看。`;
      el.append(ask);
    }
    const n = doc.createElement('small');
    n.textContent = `${g.i + 1} / ${g.rounds.length}`;
    el.append(n);
    // A line's word is his own, not a secret: shown before 开始 (Hanli 10-19: 「这个是让画什么?」).
    if (r.word) $('.g-dg-word b').textContent = lang === 'en' ? `${r.word.zh} · ${r.word.en}` : r.word.zh;
  };
  const tools = (on) => root.querySelectorAll('[data-k]').forEach((b) => { b.disabled = !on; });

  // The canvas follows its box at the device's pixel ratio; the strokes are kept in paper units.
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  };
  /* The next line (or another try) starts on clean paper: the strokes, the clock and her last answer go
     (Hanli 10-19: 「盆切换到弓时, 画布没有清空」). */
  const freshPaper = () => {
    g.strokes = [];
    g.cur = null;
    redraw();
    $('.g-dg-sec').textContent = '';
    $('.g-dg-left').textContent = '';
    say('……', '', true);
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
  // The eraser's ring follows the hand over the paper (a mouse hovering, a finger pressing), its
  // size the eraser's own: what is inside the ring is what rubs out.
  const ring = (e, show) => {
    const on = show && g.tool === 'eraser' && (g.phase === 'draw' || g.phase === 'ready');
    rub.style.display = on ? 'block' : 'none';
    if (!on) return;
    const r = canvas.getBoundingClientRect(), d = ERASER * r.width;
    rub.style.width = rub.style.height = `${d}px`;
    rub.style.left = `${e.clientX - r.left}px`;
    rub.style.top = `${e.clientY - r.top}px`;
  };
  canvas.addEventListener('pointerdown', async (e) => {
    if ((e.button ?? 0) !== 0) return;
    // A stroke on fresh paper starts the round itself (Hanli 10-19: 「我点了笔, 用鼠标不能画」).
    if (g.phase === 'ready' && !goBtn.disabled) { e.preventDefault(); await begin(); }
    if (g.phase !== 'draw') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the canvas still hears it */ }
    g.cur = [at(e)];
    if (g.tool === 'eraser') g.cur.erase = true;
    g.loop.stroke();
    ring(e, true);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    ring(e, Boolean(g.cur) || e.pointerType === 'mouse');
    if (!g.cur) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) g.cur.push(at(ev));
    redraw();
  });
  canvas.addEventListener('pointerleave', (e) => ring(e, false));
  const lift = (e) => {
    if (e?.pointerType !== 'mouse') ring(e, false);
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
    if (who && !fixed && CHOOSE.has(g.phase) && who !== g.who) { g.who = who; keepWho(who); start(); return; }
    const k = e.target.closest?.('[data-k]')?.dataset.k;
    if (k === 'go' && g.phase === 'ready') return begin();
    // She cannot be asked: a 家信 is written in words only, and goes on (never stuck on the model).
    if (k === 'go' && CANT.has(g.phase) && data.fallback) return writeOut();
    if (k === 'pen' || k === 'eraser') {
      g.tool = k;
      root.querySelectorAll('.g-dg-tool').forEach((b) => b.classList.toggle('is-on', b.dataset.k === k));
      paper.classList.toggle('is-erasing', k === 'eraser');
      return;
    }
    if (g.phase !== 'draw') return;
    if (k === 'clear' && g.strokes.length) { g.strokes = []; redraw(); g.loop.stroke(); }
    if (k === 'go') g.loop.now();
  });

  /* The engine ran no turn for her mid-round, or the model turned out blind on the first look. */
  const cannot = (phase, text) => {
    clearInterval(g.timer);
    g.loop?.stop();
    g.sid?.then((sid) => closeRound(sid), () => {});
    setPhase(phase);
    veil.textContent = text;
    foot('');
    tools(false);
    if (data.fallback) { goBtn.textContent = w.write; goBtn.disabled = false; }
  };
  const onReply = (r) => {
    if (r.refused) { log({ kind: 'refused', who: g.who, refused: r.refused }); return cannot('absent', (r.refused === 'absent' && fixed ? w.asleep : w[r.refused]) ?? w.absent); }
    if (isBlindReply(r.text)) { log({ kind: 'blind', who: g.who, text: r.text }); foot(r.text); return cannot('blind', w.blind); }
    const p = parseReply(r.text);
    const ok = p.guess != null && matches(p.guess, g.word);
    log({ kind: 'guess', who: g.who, word: g.word.zh, n: g.loop.calls, ms: r.ms, model: r.model?.id, guess: p.guess, ok, tools: r.tools, zh: p.zh, en: p.en }, { text: r.text });
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

  /* One look: the page's stub on a 测试存档 (`&her=stub`), else her turn through the engine. */
  const send = async () => {
    foot(sub(w.looking));
    if (data.seam === 'stub') {
      await new Promise((r) => setTimeout(r, 1200));
      return { text: stubReply(g.word, g.loop.calls), ms: 1200, model: { id: 'stub' }, tools: 0 };
    }
    const png = paperPng(doc, g.strokes), prompt = askGuess(g.who, g.guesses, ctxLine);
    log({ kind: 'sent', who: g.who, word: g.word.zh, n: g.loop.calls }, { png, prompt });
    return askLing({ sid: await g.sid, agent: g.who, png, prompt, model: data.model ?? null, signal });
  };

  const begin = async () => {
    goBtn.disabled = true;
    let word = g.rounds?.[g.i]?.word ?? data.word ?? null;
    // The rules may hand the round its word, and count it (本王考考你's night cap): refused, no round.
    if (typeof data.begin === 'function') {
      const r = await Promise.resolve(data.begin()).catch((e) => ({ ok: false, say: String(e?.message ?? e) }));
      if (!r?.ok) { foot(r?.say ?? ''); goBtn.disabled = Boolean(r?.done); return; }
      word = r.word ?? word;
    }
    g.word = word ?? g.next ?? pickWord(g.words, Math.random, lastWord);
    g.next = null;
    lastWord = g.word.zh;
    $('.g-dg-word b').textContent = lang === 'en' ? `${g.word.zh} · ${g.word.en}` : g.word.zh;
    g.strokes = [];
    g.guesses = [];
    veil.textContent = '';
    tools(true);
    goBtn.textContent = w.done;
    if (data.seam !== 'stub') { g.sid = openRound(); g.sid.catch(() => {}); } else g.sid = null;
    g.loop = guessLoop({
      max,
      idleMs: IDLE_MS,
      send,
      onReply,
      onError,
      onSettle: () => { if (g.phase === 'closing') end(false); },
    });
    log({ kind: 'begin', who: g.who, word: g.word.zh });
    setPhase('draw');
    g.t0 = performance.now();
    g.timer = setInterval(tick, 250);
    tick();
    redraw();
  };

  const reveal = async (won) => {
    const sidP = g.sid;
    try {
      if (data.seam === 'stub') {
        await new Promise((r) => setTimeout(r, 800));
        say(won ? `[stub] 哼，本王一眼就看出是${g.word.zh}。` : `[stub] 这是${g.word.zh}？……你画得也太随意了。`, '');
      } else if (sidP && g.strokes.length) {
        foot(sub(w.looking));
        const png = paperPng(doc, g.strokes), prompt = askReveal(g.who, g.word.zh, g.guesses, won, ctxLine);
        log({ kind: 'sent', who: g.who, word: g.word.zh, reveal: true }, { png, prompt });
        const r = await Promise.race([askLing({ sid: await sidP, agent: g.who, png, prompt, model: data.model ?? null, signal }),
          new Promise((ok) => setTimeout(() => ok(null), 12000))]);
        if (r?.text) {
          const p = parseReply(r.text);
          log({ kind: 'reveal', who: g.who, word: g.word.zh, won, ms: r.ms, model: r.model?.id, zh: p.zh, en: p.en }, { text: r.text });
          sayParsed(p);
        }
        foot(fill(won ? w.won : (g.rounds ? w.plain : w.time), { w: lang === 'en' ? g.word.en : g.word.zh }));
      }
      await new Promise((r) => setTimeout(r, 2200)); // a beat to read her line
    } catch { /* no reaction: the board goes on */ }
    sidP?.then((sid) => closeRound(sid), () => {});
  };

  const end = (won) => {
    if (g.phase === 'over' || g.phase === 'between') return;
    clearInterval(g.timer);
    g.loop?.stop();
    lefts();
    const word = lang === 'en' ? g.word.en : g.word.zh;
    log({ kind: 'end', who: g.who, word: g.word.zh, won });
    // Her reaction to the answer, then the round's session goes; the board waits for it (at most ~12 s).
    const said = reveal(won);
    const after = (ms, fn) => said.then(() => setTimeout(fn, ms));
    const calls = g.loop?.calls ?? 0;
    // A 家信: the line is written whether she got its picture or not; then the next line, or the letter done.
    if (g.rounds) {
      if (won) g.got += 1;
      foot(fill(won ? w.won : w.plain, { w: word }));
      g.i += 1;
      if (g.i < g.rounds.length) {
        setPhase('between');
        tools(false);
        after(won ? 1400 : 900, () => { freshPaper(); letter(); goBtn.textContent = w.next; setPhase('ready'); goBtn.disabled = false; });
        return;
      }
      setPhase('over');
      tools(false);
      if (g.got) root.classList.add('is-won');
      const grade = letterGrade(g.got, g.rounds.length);
      after(1600, () => finish({ won: true, stars: g.got, grade }));
      return;
    }
    foot(fill(won ? w.won : w.time, { w: word }));
    // In the story a miss is another try (a new word, a new round the rules may count), never the end.
    if (fixed && !won && data.retry !== false) {
      setPhase('between');
      tools(false);
      after(900, () => { freshPaper(); goBtn.textContent = w.again; setPhase('ready'); goBtn.disabled = false; });
      return;
    }
    setPhase('over');
    tools(false);
    if (won) root.classList.add('is-won');
    // In the story a grade is a mark id the task may name (`look1` · `look2` …: how many looks it took).
    after(won ? 1800 : 600, () => finish(won ? { won: true, stars: starsFor(calls), grade: fixed ? `look${calls}` : `${calls}` } : { won: false, grade: `${word}` }));
  };
  /* She cannot be asked: the 家信 goes in words only (`written`), so the story never waits on a model. */
  const writeOut = () => {
    setPhase('over');
    tools(false);
    finish({ won: true, stars: 0, grade: 'written' });
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
    tools(true);
    goBtn.disabled = true;
    g.words = await wordsOf(data);
    g.rounds = await setOf(data);
    letter();
    let s;
    try { s = await lookFirst(doc, who, data.model ?? null, { open: data.open ?? !fixed, seam: data.seam ?? null, context: ctxLine }); } catch (e) { s = { far: true, err: e }; }
    if (who !== g.who) return; // the guesser changed while this one was asked
    g.model = s.model?.id ?? null;
    foot(modelLine());
    if (s.off) return cannot('off', w.off);
    if (s.far) { log({ kind: 'far', who }); return cannot('far', w.far); }
    if (s.refused) return cannot('absent', s.refused === 'absent' && fixed ? w.asleep : w[s.refused]);
    if (s.blind) {
      cannot('blind', w.blind);
      foot(s.said ?? '');
      if (!data.fallback) tools(false);
      return;
    }
    if (s.line?.zh || s.line?.en) sayParsed(s.line); else say('……', '', true);
    setPhase('ready');
    goBtn.disabled = false;
  }
}
