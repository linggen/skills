// 守夜 — the night watch in the herb garden (第一章 · 外门; his ruling 2026-09-29:
// 「可以，不打」 — the herb thief is caught, never fought). Four ways in; pick
// where to wait. The thief has two rules, and a miss shows them: it never comes
// where you waited before (it smells you), and never the way it came before
// (「它在进步」). A second night is a fair guess between two; by the third it
// has learned every way but the one you are sitting in, and walks right into
// you. Nothing is lost by missing — within three nights it is caught.
// Pure module: newGame / html / act. No DOM, no listeners; the host routes [data-g] clicks to act().

export const meta = {
  id: 'shouye',
  name: { zh: '守夜 · 药园', en: 'The night watch · Herb garden' },
  how: {
    zh: '四处可进：挑一处蹲着等它。它不走你蹲过的地方，也不走它走过的路。',
    en: 'Four ways in: pick one and wait. It never comes where you waited before, nor the way it came before.',
  },
};

export const SPOTS = ['fence', 'ditch', 'cliff', 'gate'];
const NAMES = {
  zh: { fence: '篱笆缺口', ditch: '水渠', cliff: '崖顶', gate: '正门' },
  en: { fence: 'the gap in the fence', ditch: 'the water channel', cliff: 'the cliff top', gate: 'the front gate' },
};
const T = {
  zh: {
    night: ['第一夜 · 子时', '第二夜 · 子时', '第三夜 · 子时'],
    ask: '挑一处，蹲下等它。',
    sign: '正门上挂着一块牌子：「药园重地，偷者必究。」',
    missed: '咔嚓。它从{way}进来的，啃了一株，又走了。你在{pick}蹲了一夜，腿都麻了。',
    progress: '它在进步。',
    rules: '爪印告诉你两件事：它不走你蹲过的地方，也不走它走过的路。',
    unread: '它是从正门进来的，就从那块「偷者必究」底下。——贼不认字。',
    caught: '一团红毛从{way}钻了进来——一头撞进你怀里。五条尾巴，一只角，嘴里还叼着半株灵草。',
    cornered: '第三夜，它把路都走遍了，把你蹲过的地方也都闻遍了。它学会了躲开你蹲过的地方——没学会躲开你正蹲着的地方。一头撞进你怀里。',
    won: '逮住了。它看着你，你看着它。',
    waited: '蹲过',
    came: '爪印',
  },
  en: {
    night: ['First night · midnight', 'Second night · midnight', 'Third night · midnight'],
    ask: 'Pick a place and wait for it.',
    sign: 'A board hangs on the front gate: "Herb garden. Thieves will be pursued."',
    missed: 'Crunch. It came in by {way}, ate one plant and left. You spent the night at {pick}; your legs have gone numb.',
    progress: 'It is improving.',
    rules: 'The paw prints tell you two things: it never comes where you waited before, nor the way it came before.',
    unread: 'It came in by the front gate, right under "Thieves will be pursued." — Thieves cannot read.',
    caught: 'A ball of red fur slips in by {way} — and runs headlong into your arms. Five tails, one horn, half a spirit herb still in its mouth.',
    cornered: 'Third night: it has walked every way and smelled every place you waited. It learned to avoid where you had been — not where you are. It runs headlong into your arms.',
    won: 'Caught. It looks at you; you look at it.',
    waited: 'waited',
    came: 'paw prints',
  },
};

function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

/* The ways it may come tonight: none you waited at, none it came by. */
export function allowed(state) {
  return SPOTS.filter(s => !state.watched.includes(s) && !state.used.includes(s));
}

/* Where it comes tonight — fixed by the seed and the nights before, never by
   tonight's pick, so a guess is a guess and a deduction is a sure thing. */
export function wayOf(state) {
  const open = allowed(state);
  if (!open.length) return null;
  return open[hash(`shouye:${state.seed}:${state.night}`) % open.length];
}

export function newGame(seed, level = 1) {
  return { seed: String(seed), level: Number(level) || 1, night: 1, watched: [], used: [], log: [], won: false };
}

/* Wait at a spot for the night: caught, or a miss that teaches. */
function wait(state, spot) {
  if (!SPOTS.includes(spot) || state.won) return null;
  const way = wayOf(state);
  // The third night — or no way left it could take — it walks into the one place you are.
  if (state.night >= 3 || !way) return { ...state, won: true, log: [...state.log, { night: state.night, pick: spot, way: spot, caught: true, cornered: true }] };
  if (way === spot) return { ...state, won: true, log: [...state.log, { night: state.night, pick: spot, way, caught: true }] };
  return {
    ...state, night: state.night + 1,
    watched: [...new Set([...state.watched, spot])], used: [...new Set([...state.used, way])],
    log: [...state.log, { night: state.night, pick: spot, way, caught: false }],
  };
}

const VERBS = { wait: (s, d) => wait(s, String(d.spot ?? '')) };

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data) ?? null;
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

const fillIn = (text, lang, e) => text.replace('{way}', NAMES[lang][e.way]).replace('{pick}', NAMES[lang][e.pick]);

function logHtml(state, lang) {
  const t = T[lang] || T.zh;
  return state.log.map((e) => {
    if (e.caught) return `<p class="g-shouye-caught">${fillIn(e.cornered ? t.cornered : t.caught, lang, e)}</p>`;
    const lines = [fillIn(t.missed, lang, e), t.progress];
    if (e.way === 'gate') lines.push(t.unread);
    if (e.night === 1) lines.push(t.rules);
    return `<p class="g-shouye-miss">${lines.join(' ')}</p>`;
  }).join('');
}

function spotHtml(state, s, lang) {
  const t = T[lang] || T.zh;
  const tags = [state.watched.includes(s) ? t.waited : '', state.used.includes(s) ? t.came : ''].filter(Boolean);
  const off = state.won ? ' disabled' : '';
  const cls = `g-shouye-spot${state.watched.includes(s) ? ' is-watched' : ''}${state.used.includes(s) ? ' is-used' : ''}`;
  return `<button type="button" class="${cls}" data-g="wait" data-spot="${s}"${off}><b>${NAMES[lang][s]}</b>${tags.length ? `<small>${tags.join(' · ')}</small>` : ''}</button>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = state.won ? t.won : `${t.night[Math.min(state.night, 3) - 1]} — ${t.ask}`;
  return `<div class="g-shouye${state.won ? ' is-won' : ''}">
    <div class="g-shouye-head">${head}</div>
    <div class="g-shouye-sign">${t.sign}</div>
    <div class="g-shouye-spots">${SPOTS.map(s => spotHtml(state, s, lang)).join('')}</div>
    <div class="g-shouye-log">${logHtml(state, lang)}</div>
  </div>`;
}
