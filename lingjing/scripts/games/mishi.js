// 密室 — the hidden room (Hanli, 2026-10-15), the first of the popular AI games. The page shows the
// mechanisms; 银月 reads the old pages in her own tool result (never here) — they solve it by talking.
// Unlike every other board, this one never judges itself: each try goes to the rules (`send`, the
// `mishi` verb), which hold the seeded solution, answer right or wrong, and pay on escape. What the
// room is comes from the rules' view (`fromLook`: Look's `mishi`, no page of hers in it).
// Pure module: newGame / fromLook / html / act / heard / tick (live only while it waits on her —
// live-games.js). The page routes [data-g] taps here and runs what `act` hands back:
// `send` — a rules verb to run, its answer fed to `heard`; `her` — turn to 银月 (the ask bar).
import { btn, n, scene } from './ink.js';
import { WEN } from './wen.js';

// The painted room, dial and bronze hand (tools/paint-mishi-flux.py, Hanli 10-20: 「代码画的都查一下, 用flux画吧」):
// the puzzle stays text and buttons over the paint.
const art = (name) => new URL(`./mishi/${name}.webp`, import.meta.url).href;

export const meta = {
  id: 'mishi',
  sounds: ['turn', 'pick', 'open', 'good', 'bad'], // what it names (games/kit/audio/sounds.json; tests/game-sound.test.mjs)
  name: { zh: '密室', en: 'The hidden room' },
  how: {
    zh: '机关你看得见，古籍只有银月读得懂。不会玩，就点「问银月」。',
    en: 'You see the mechanisms; only Yinyue reads the old pages. Stuck? Tap "Ask Yinyue".',
  },
  // The card's 问询 on this board is hers (cards.js): the room's play and the next hint, never the scenery again.
  askHer: (state) => (state?.view && !state.view.door && !state.view.done ? 'her' : null),
};

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const NEED = { hand: 3, luoshu: 3, stars: 1, scroll: 2 };

const T = {
  zh: {
    door: '书架后头，有一块木板敲着是空的。', open: '推开看看', none: '今天不进暗室了，明天再来。',
    step: '第{k}道 · 共{of}道', try: '试一试', clear: '重来', her: '问银月', herAsleep: '木牌温温的', tier: '提示 {n}/{of}', turned: '已扣转 {n} 年', from: '从{y}起',
    readAt: { dial: '铜盘停在：', scroll: '卷上念出：' }, yinyue: '银月',
    waiting: '等她开口……', herSaid: '银月说完了。机关还在那儿。', hintBtn: '翻看古籍残页', hintHead: '残页上写着',
    asleep: '木牌温温的，她睡着。古籍上的字，等一等也许会自己浮出来。',
    wrong: '机关纹丝不动。', skip: '跳过这一道', skipped: '这一道跳过了。',
    outer: '外圈', inner: '内圈', both: '扣转', reads: '盘上此刻：', picks: '按下的：',
    escaped: '出来了。', unpaid: '你从暗处出来——撬开的机关，什么也没留下。', pay: '所得：', ls: '灵石', repeat: '这间暗室这几天来过，只剩些零碎。',
    read: '卷上念出：', busy: '……', leave: '出去',
    refused: { 'too-soon': '再等一等。', 'not-stuck': '还没到撬的时候。', 'limit-today': '今天不进暗室了，明天再来。', 'not-here': '这里没有暗门。', stale: '机关已经变了。' },
  },
  en: {
    door: 'Behind the shelves, one board rings hollow when you knock.', open: 'Push it', none: 'No more hidden rooms today; come back tomorrow.',
    step: 'Mechanism {k} of {of}', try: 'Try it', clear: 'Again', her: 'Ask Yinyue', herAsleep: 'The token is warm', tier: 'hint {n}/{of}', turned: 'turned locked {n} years', from: 'from {y}',
    readAt: { dial: 'The dial stopped on: ', scroll: 'Read off the scroll: ' }, yinyue: 'Yinyue',
    waiting: 'Waiting for her to speak…', herSaid: 'Yinyue has spoken. The mechanism waits.', hintBtn: 'Read the torn page', hintHead: 'The torn page says',
    asleep: 'The token is warm; she sleeps. Wait a little — the old words may surface by themselves.',
    wrong: 'The mechanism does not move.', skip: 'Skip this one', skipped: 'Skipped.',
    outer: 'Outer', inner: 'Inner', both: 'Locked', reads: 'The dial reads: ', picks: 'Pressed: ',
    escaped: 'Out.', unpaid: 'You come out of the dark — the mechanism you forced left nothing.', pay: 'Found: ', ls: 'spirit stones', repeat: 'You were in this room days ago; only scraps are left.',
    read: 'Read off the scroll: ', busy: '…', leave: 'Go out',
    refused: { 'too-soon': 'Wait a little longer.', 'not-stuck': 'Not yet — keep at it.', 'limit-today': 'No more hidden rooms today; come back tomorrow.', 'not-here': 'No hidden door here.', stale: 'The mechanism has moved on.' },
  },
};
const say = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : v[k]));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function newGame(seed) {
  return { seed: String(seed), task: null, view: null, present: false, dial: { s: 0, b: 0 }, turned: 0, from: null, picks: [], note: null, wait: 0, live: false, hinted: false, spoke: false, busy: false, won: false };
}

/* The rules' view, laid in on every draw (the page's boardFor): the room as Look has it. */
export function fromLook(state, look, { task = null, present = false } = {}) {
  const view = look?.mishi && (!task || look.mishi.task === task) ? look.mishi : null;
  if (view === state.view && present === state.present && task === state.task) return state;
  const step = view?.step ?? null, was = state.view?.step ?? null;
  // A new mechanism: its controls start clean.
  const fresh = step !== was ? { picks: [], dial: { s: 0, b: 0 }, turned: 0, from: null, wait: 0, live: false, hinted: false, spoke: false, said: null } : {};
  return { ...state, ...fresh, task, view, present };
}

const open = (v) => v?.puzzles?.find((p) => p.at === 'open') ?? null;
const inputOf = (state, p) => (p.kind === 'dial' ? `${state.dial.s},${state.dial.b}` : state.picks.join(','));
const ready = (state, p) => (p.kind === 'dial' ? true : state.picks.length === NEED[p.kind]);

export function act(state, d) {
  const v = state.view, p = open(v);
  if (state.busy) return { state };
  switch (d.g) {
    case 'open': return { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'open', task: v?.task ?? state.task } } };
    case 'turn': {
      if (!p || p.kind !== 'dial') return { state };
      const k = Number(d.d) || 0, ring = d.ring;
      const s = ring === 'inner' ? state.dial.s : (state.dial.s + k + 10) % 10;
      const b = ring === 'outer' ? state.dial.b : (state.dial.b + k + 12) % 12;
      // 扣转 counts its years from where it began (「已扣转 N 年」); a ring turned alone starts the count again.
      const locked = ring === 'both';
      const from = locked ? (state.turned ? state.from : { ...state.dial }) : null;
      return { state: { ...state, dial: { s, b }, turned: locked ? state.turned + k : 0, from, note: null } };
    }
    case 'pick': {
      if (!p || p.kind === 'dial') return { state };
      const i = d.i, need = NEED[p.kind], picks = state.picks;
      // A tap on the last one lifts it; a full row starts again from this one.
      const next = picks[picks.length - 1] === i ? picks.slice(0, -1) : picks.length >= need ? [i] : [...picks, i];
      return { state: { ...state, picks: next, note: null } };
    }
    case 'clear': return { state: { ...state, picks: [], note: null } };
    case 'try':
      if (!p || !ready(state, p)) return { state };
      return { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'try', step: v.step, input: inputOf(state, p) } } };
    // The page turns to her (the ask bar) and, once the words go, calls heard({her: 'asked'}).
    // 问银月: the rules open the next help tier and hand it back as facts for her (`ask`); the page gives them to her.
    // Nobody to say it (she sleeps, or the phone with no chat): `alone`, the tier is read off the page at once.
    case 'her': return p ? { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'ask', step: v.step, input: inputOf(state, p), turned: state.turned, ...(state.present ? {} : { alone: 1 }) } } } : { state };
    case 'hint': return { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'hint' } } };
    case 'skip': return { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'skip' } } };
    case 'leave': return { state: { ...state, busy: true }, send: { verb: 'mishi', args: { action: 'leave' } } };
    default: return { state };
  }
}

/* What the rules answered (or `{her: 'spoke'}` from the page, when her line landed). */
export function heard(state, res) {
  // Asked: her clock starts (the rules were told too — `asked`); she spoke: it stops, no torn page.
  // (a second over the rules' wait: their clock starts when `asked` lands, a beat after this one)
  if (res?.her === 'asked') return { ...state, wait: ((state.view?.hint_wait_s ?? 25) + 1) * 1000, live: true, spoke: false, note: null };
  if (res?.her === 'spoke') return state.wait > 0 || state.live ? { ...state, wait: 0, live: false, spoke: true, note: res.text ? null : 'herSaid', said: res.text || state.said } : state;
  const s = { ...state, busy: false };
  // A help tier opened: her clock starts — the page shows the tier's words only if she lets it run out.
  if (res?.asked && res.hint) return { ...s, wait: 0, live: false, hinted: true, note: null };
  if (res?.asked) return { ...s, wait: ((state.view?.hint_wait_s ?? 25) + 1) * 1000, live: true, spoke: false, note: null };
  if (!res || res.ok === false) return { ...s, note: res?.refused ? `refused:${res.refused}` : null };
  if (res.right === false) return { ...s, picks: [], note: 'wrong' };
  if (res.hint) return { ...s, hinted: true, note: null };
  if (res.out) return { ...s, note: res.line ? `right:${res.line}` : null };
  if (res.left) return { ...s, note: null };
  if (res.right) return { ...s, note: `right:${res.line ?? ''}` };
  if (res.skipped) return { ...s, note: 'skipped' };
  return s;
}

/* The wait on her: when it runs out with no word from her, the torn page may be read. */
export function tick(state, ms) {
  if (!state.live || state.wait <= 0) return state;
  const wait = Math.max(0, state.wait - ms);
  return wait > 0 ? { ...state, wait } : { ...state, wait: 0, live: false };
}

/* ── drawing ── */
const hintOpen = (state, v) => !state.spoke && Boolean(v?.hint_at) && state.wait <= 0 && !state.live && Date.now() >= new Date(v.hint_at).getTime();

function roomScene(v) {
  // The painted room: the mechanisms in their painted niches — a shut one dimmed, the open one lit,
  // a seal pressed on each one done.
  const kinds = v.puzzles.map((p) => p.at);
  const niche = (x, i) => {
    const at = kinds[i], seal = at === 'solved' || at === 'skipped', now = at === 'open';
    return `<g class="g-mishi-niche${now ? ' is-now' : ''}${at === 'shut' ? ' is-shut' : ''}">${now ? `<circle class="g-mishi-glow" cx="${x}" cy="66" r="24"/>` : ''}<image href="${art('niche')}" x="${x - 22}" y="36" width="44" height="58" preserveAspectRatio="xMidYMax meet"/>${seal ? `<circle class="g-mishi-seal" cx="${x}" cy="66" r="7"/>` : ''}</g>`;
  };
  const xs = v.puzzles.map((_, i) => 80 + (i * 160) / Math.max(1, v.puzzles.length - 1));
  return scene(320, 116, `<image href="${art('room')}" width="320" height="116" preserveAspectRatio="xMidYMid slice"/>${xs.map(niche).join('')}`, 'g-mishi-room');
}

function dialHtml(state, p, t, lang) {
  const { s, b } = state.dial;
  const ring = (labels, r, at, cls) => labels.map((ch, i) => {
    const a = ((i - at) / labels.length) * Math.PI * 2 - Math.PI / 2, x = 160 + r * Math.cos(a), y = 90 + r * Math.sin(a);
    return `<text class="g-mishi-ch ${cls}${i === at ? ' is-top' : ''}" x="${n(x)}" y="${n(y + 5)}" text-anchor="middle">${ch}</text>`;
  }).join('');
  const pic = scene(320, 180, `<image href="${art('dial')}" x="70" y="0" width="180" height="180"/><path class="g-mishi-pointer" d="M160 2 l-6 -0 l6 10 l6 -10 z"/>${ring(STEMS, 71, s, 'is-stem')}${ring(BRANCHES, 46, b, 'is-branch')}`, 'g-mishi-dial');
  const turn = (ring, d, label) => `<button type="button" class="g-nudgebtn" data-g="turn" data-ring="${ring}" data-d="${d}" aria-label="${esc(label)}">${d < 0 ? '‹' : '›'}</button>`;
  const row = (ring, label) => `<div class="g-nudge"><span class="g-nudgesay">${esc(label)}</span>${turn(ring, -1, `${label} −1`)}${turn(ring, 1, `${label} +1`)}</div>`;
  const turned = state.turned ? `<p class="g-mishi-turned">${esc(say(t.from, { y: `${STEMS[state.from?.s ?? 0]}${BRANCHES[state.from?.b ?? 0]}` }))} · ${esc(say(t.turned, { n: state.turned }))}</p>` : '';
  return `${pic}<p class="g-mishi-read">${esc(t.reads)}<b>${STEMS[s]}${BRANCHES[b]}</b></p>${turned}${row('outer', t.outer)}${row('inner', t.inner)}${row('both', t.both)}`;
}

function handHtml(state, p, t) {
  // The bronze hand: thirteen studs, unmarked (the names are on her page).
  // Where the old 讲堂三日 board drew each 文 (FX 70…220 of 320, LY 138…42 of 160), as a share of the picture.
  const FXp = [21.9, 37.5, 53.1, 68.8], LYp = [86.3, 66.3, 46.3, 26.3];
  const at = (w) => [FXp[w.f], w.lv === 1.5 ? 56.3 : LYp[w.lv]];
  // painted by an edit pass from the old drawing, so the fingers sit where the studs are
  const pic = scene(320, 160, `<image href="${art('hand')}" width="320" height="160"/>`, 'g-mishi-handpic');
  // Each stud wears its worn character (Hanli 10-27: 「玩家不可能知道怎么掐」) — the clue is then 「按 子 卯 申」, no 掌诀 to know.
  const studs = WEN.map((w) => {
    const [x, y] = at(w), k = state.picks.indexOf(w.id);
    return `<button type="button" class="g-mishi-stud${k >= 0 ? ' is-on' : ''}" style="left:${x}%;top:${y}%" data-g="pick" data-i="${w.id}" aria-label="${w.ch}${k >= 0 ? ` ${k + 1}` : ''}"><span class="g-mishi-wen">${w.ch}</span>${k >= 0 ? `<i>${k + 1}</i>` : ''}</button>`;
  }).join('');
  return `<div class="g-mishi-hand">${pic}${studs}</div>`;
}

const dots = (k) => {
  // 洛书's own marks: odd white rings, even black dots, laid in a small ring.
  const odd = k % 2 === 1;
  const pts = Array.from({ length: k }, (_, i) => { const a = (i / k) * Math.PI * 2 - Math.PI / 2, r = k === 1 ? 0 : 11; return [n(20 + r * Math.cos(a)), n(20 + r * Math.sin(a))]; });
  return scene(40, 40, pts.map(([x, y]) => `<circle class="${odd ? 'g-mishi-white' : 'g-mishi-black'}" cx="${x}" cy="${y}" r="3.4"/>`).join(''), 'g-mishi-dots');
};
function luoshuHtml(state, p) {
  const cells = p.page.grid.map((k, i) => { const at = state.picks.indexOf(i); return `<button type="button" class="g-mishi-cell${at >= 0 ? ' is-on' : ''}" data-g="pick" data-i="${i}" aria-label="${k}">${dots(k)}${at >= 0 ? `<i>${at + 1}</i>` : ''}</button>`; }).join('');
  return `<div class="g-mishi-grid">${cells}</div>`;
}

function starsHtml(state, p) {
  // Four parts around the ring, each its Symbol's name and seven clusters from its notch.
  const { order, sizes, labels } = p.page;
  const btns = [], marks = [];
  order.forEach((q, slot) => {
    const a0 = slot * 90 - 90 + 8;
    const mid = ((slot * 90 - 45) * Math.PI) / 180;
    marks.push(`<text class="g-mishi-sym" x="${n(160 + 34 * Math.cos(mid))}" y="${n(110 + 34 * Math.sin(mid) + 5)}" text-anchor="middle">${esc(labels[q])}</text>`);
    const na = (a0 * Math.PI) / 180;
    marks.push(`<path class="g-mishi-notch" d="M${n(160 + 66 * Math.cos(na))} ${n(110 + 66 * Math.sin(na))} L${n(160 + 100 * Math.cos(na))} ${n(110 + 100 * Math.sin(na))}"/>`);
    for (let k = 0; k < 7; k += 1) {
      // On the band between the two rings (r 84 of the 320×220 picture), as a share of it.
      const a = ((a0 + 6 + k * 11) * Math.PI) / 180, x = ((160 + 84 * Math.cos(a)) / 320) * 100, y = ((110 + 84 * Math.sin(a)) / 220) * 100;
      const id = q * 7 + k, on = state.picks[0] === id;
      const stars = Array.from({ length: sizes[q][k] }, (_, j) => `<i style="--j:${j}"></i>`).join('');
      btns.push(`<button type="button" class="g-mishi-cluster${on ? ' is-on' : ''}" style="left:${n(x)}%;top:${n(y)}%" data-g="pick" data-i="${id}" aria-label="${esc(labels[q])} ${k + 1}">${stars}</button>`);
    }
  });
  const pic = scene(320, 220, `<circle class="g-line g-thin" cx="160" cy="110" r="104" fill="none"/><circle class="g-line g-thin g-faint" cx="160" cy="110" r="64" fill="none"/>${marks.join('')}`, 'g-mishi-starpic');
  return `<div class="g-mishi-stars">${pic}${btns.join('')}</div>`;
}

function scrollHtml(state, p) {
  // Columns written top to bottom, read from the right.
  const cols = p.page.cols.map((col, c) => `<div class="g-mishi-col">${col.map((ch, r) => {
    const i = c * 5 + r, at = state.picks.indexOf(i);
    return `<button type="button" class="g-mishi-char${at >= 0 ? ' is-on' : ''}" data-g="pick" data-i="${i}">${esc(ch)}${at >= 0 ? `<i>${at + 1}</i>` : ''}</button>`;
  }).join('')}</div>`).join('');
  return `<div class="g-mishi-scroll">${cols}</div>`;
}

const MECH = { dial: dialHtml, hand: handHtml, luoshu: luoshuHtml, stars: starsHtml, scroll: scrollHtml };

function noteOf(state, t) {
  const note = String(state.note ?? '');
  if (!note) return '';
  if (note.startsWith('right:')) return note.slice(6);
  if (note.startsWith('refused:')) return t.refused[note.slice(8)] ?? '';
  return t[note] ?? '';
}

function paidLine(paid, t, lang) {
  if (!paid) return '';
  const bits = [paid.wealth ? `${t.ls} +${paid.wealth}` : '', paid.item ? `${paid.item_name ?? paid.item}${paid.n > 1 ? ` ×${paid.n}` : ''}` : '', paid.rare ? `${paid.rare_name ?? paid.rare}` : ''].filter(Boolean);
  return `${paid.repeat ? `<p class="g-line-say g-mishi-dim">${esc(t.repeat)}</p>` : ''}${bits.length ? `<p class="g-mishi-pay">${esc(t.pay)}${esc(bits.join(' · '))}</p>` : ''}`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, v = state.view;
  const wrap = (inner, cls = '') => `<div class="g-mishi g-ink${cls}">${inner}</div>`;
  if (!v) return wrap(`<p class="g-line-say">${esc(t.busy)}</p>`);
  if (v.door) {
    const none = !v.left_today;
    return wrap(`<p class="g-line-say">${esc(none ? t.none : t.door)}</p>${none ? '' : btn(t.open, 'data-g="open"')}${noteOf(state, t) ? `<p class="g-mishi-note">${esc(noteOf(state, t))}</p>` : ''}`);
  }
  // Out: the last mechanism's line, what the room held, and 出去 (the board goes for the day).
  if (v.done) {
    const last = noteOf(state, t);
    return wrap(`<div class="g-head"><span>${esc(v.room.name)}</span><span>${esc(t.escaped)}</span></div>${roomScene(v)}${last ? `<p class="g-line-say">${esc(last)}</p>` : ''}<p class="g-line-say">${esc(v.escaped ? v.escape ?? t.escaped : t.unpaid)}</p>${v.escaped ? paidLine(v.paid, t, lang) : ''}${btn(t.leave, 'data-g="leave"')}`, ' is-won');
  }
  const p = open(v);
  const head = `<div class="g-head"><span>${esc(v.room.name)}</span><span>${esc(say(t.step, { k: v.step + 1, of: v.of }))}</span></div>`;
  const behind = v.puzzles.filter((x) => x.at === 'solved' || x.at === 'skipped').map((x) => `<p class="g-mishi-done">${esc(x.at === 'solved' ? x.right : t.skipped)}${x.read ? ` <b>${esc(t.readAt[x.kind] ?? t.read)}${esc(x.read)}</b>` : ''}</p>`).join('');
  const intro = v.step === 0 && !state.picks.length && !state.note ? `<p class="g-line-say g-mishi-dim">${esc(v.room.line)}</p>` : '';
  if (!p) return wrap(head + roomScene(v));
  const mech = MECH[p.kind]?.(state, p, t, lang) ?? '';
  // The line of the mechanism just opened already stands above (its `right`): not said twice.
  const note = String(state.note ?? '').startsWith('right:') ? '' : noteOf(state, t);
  const tier = p.tier ?? 0, more = tier < 3 ? ` · ${say(t.tier, { n: tier + 1, of: 3 })}` : '';
  const herBtn = btn(`${state.present ? t.her : t.herAsleep}${more}`, 'data-g="her"', 'main', state.live ? 'is-wait' : '');
  const goal = p.goal ? `<p class="g-mishi-goal">${esc(p.goal)}</p>` : '';
  // Her last word on this mechanism, on the board (the chat may be shut).
  const said = state.said ? `<p class="g-mishi-said"><b>${esc(t.yinyue)}</b>${esc(state.said)}</p>` : '';
  const waitLine = state.live ? `<p class="g-mishi-wait">${esc(state.present ? t.waiting : t.asleep)} <b>${Math.ceil(state.wait / 1000)}</b></p>` : '';
  const hint = p.hint ? `<div class="g-mishi-hint"><b>${esc(t.hintHead)}</b>${esc(p.hint)}</div>` : hintOpen(state, v) ? btn(t.hintBtn, 'data-g="hint"', 'soft') : '';
  const tryRow = `<div class="g-pair">${p.kind === 'dial' ? '' : btn(t.clear, 'data-g="clear"', 'soft')}${btn(t.try, `data-g="try"${ready(state, p) ? '' : ' disabled'}`)}</div>`;
  const skip = v.can_skip ? `<div class="g-mishi-skip">${btn(t.skip, 'data-g="skip"', 'quiet')}</div>` : '';
  return wrap(`${head}${roomScene(v)}${behind}${intro}<p class="g-mishi-his">${esc(p.his)}</p>${goal}${mech}${note ? `<p class="g-mishi-note${state.note === 'wrong' ? ' is-wrong' : ''}">${esc(note)}</p>` : ''}${tryRow}${said}<div class="g-mishi-ask">${herBtn}${hint}</div>${waitLine}${skip}`);
}

/** What a step sounded (games/kit/heard.js): a dial turned (turn), a glyph picked (pick), the room opened (open), a
    mechanism given way (good) or not (bad). The rules' answers sound through `heard`, laid in by the page. */
export function sounds(b, a) {
  if (!b || !a) return [];
  if (a.note !== b.note && a.note === 'wrong') return ['bad'];
  if (a.note !== b.note && /^right:/.test(a.note ?? '')) return ['good'];
  if (!b.view?.step && a.view?.step) return ['open'];
  if (a.dial?.s !== b.dial?.s || a.dial?.b !== b.dial?.b) return ['turn'];
  return (a.picks?.length ?? 0) !== (b.picks?.length ?? 0) ? ['pick'] : [];
}
