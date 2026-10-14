// 喂饼 · 那张厚饼 — 古一, the cave (00-cave; Hanli 2026-10-14). The book: his
// mother's thick flatbread, the last of the Shens' white flour; he has eaten
// nothing all day; he breaks it, half to the fox, then a big piece of his own
// half, and wraps a corner for tomorrow's breakfast — the corner she eats at
// dawn, and the root of 「本王欠你一张饼」. Here the player breaks it: seven
// pieces, each one to the fox or to himself; the corner always goes in the
// bundle (the dawn needs it). How much the fox had is the `grade` — none ·
// little · half · most — and the scene's exits take it: none or a little is
// 自己吃, half or more is 分它一半; the rules write it as a mark the 恩仇簿 and
// the story can read. No clock, no fail: a choice with the hands.
// Pure module: newGame / html / act.

export const meta = {
  id: 'bread',
  name: { zh: '喂饼 · 那张厚饼', en: 'The flatbread · Breaking it' },
  how: {
    zh: '一块一块地掰：给它，还是自己吃。最后一个小角，留作明天的早饭。',
    en: 'Break it piece by piece: to the fox, or to yourself. The last corner is for tomorrow\'s breakfast.',
  },
};

export const PIECES = 7; // the corner is the eighth, always kept

const T = {
  zh: {
    start: '娘烙的那张厚饼，沈家最后的一点白面。你饿了一整天，它也是。',
    give: ['它闻了闻，看了你一眼，才慢慢地吃了下去。', '吃完了，它又看着你手里的饼。', '它不叫，也不抢，就那么看着你。', '它吃得很慢，像怕吃完。'],
    eat: ['你咬了一口。饿了一整天，这一口重得像一块金子。', '你又咬了一口。它在衣裳里看着你。', '饼进了肚子，肚子还在叫。'],
    toIt: '掰一块给它', toMe: '这一块我吃', rest: '剩下的我吃了',
    you: '你', it: '它', left: '还剩',
    end: '{g} 块给了它，{e} 块进了你的肚子；一个小角包好了，塞进包袱最底下。',
  },
  en: {
    start: "Your mother's thick flatbread, the last of the Shens' white flour. You have eaten nothing all day, and nor has it.",
    give: ['It sniffs, gives you a look, and eats it slowly.', 'When it has finished, it looks at the bread in your hand.', 'It does not whine, or snatch. It only looks at you.', 'It eats very slowly, as if afraid of finishing.'],
    eat: ['You take a bite. After a whole day hungry, it weighs like a lump of gold.', 'Another bite. It watches you from inside the jacket.', 'The bread goes down, and your stomach still growls.'],
    toIt: 'Break a piece for it', toMe: 'This piece is mine', rest: 'I\'ll eat the rest',
    you: 'You', it: 'It', left: 'Left',
    end: '{g} pieces to it, {e} into your own stomach; a little corner wrapped and pushed to the bottom of the bundle.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), given: 0, eaten: 0, note: 'start', won: false, grade: null };
}

/** How much the fox had: none · little (under half) · half · most. */
export const gradeOf = (given) => (given === 0 ? 'none' : given < 4 ? 'little' : given < 6 ? 'half' : 'most');
const left = (s) => PIECES - s.given - s.eaten;
const done = (s) => (left(s) > 0 ? s : { ...s, won: true, grade: gradeOf(s.given), note: 'end' });

const VERBS = {
  give: (s) => (left(s) > 0 ? done({ ...s, given: s.given + 1, note: 'give' }) : null),
  eat: (s) => (left(s) > 0 ? done({ ...s, eaten: s.eaten + 1, note: 'eat' }) : null),
  rest: (s) => (left(s) > 0 ? done({ ...s, eaten: s.eaten + left(s), note: 'eat' }) : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

function lineOf(s, t) {
  if (s.note === 'give') return t.give[Math.min(s.given, t.give.length) - 1];
  if (s.note === 'eat') return t.eat[Math.min(s.eaten, t.eat.length) - 1];
  if (s.note === 'end') return t.end.replace('{g}', String(s.given)).replace('{e}', String(s.eaten));
  return t.start;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const bits = Array.from({ length: PIECES + 1 }, (_, i) => {
    const who = i === PIECES ? 'corner' : i < state.given ? 'it' : i < state.given + state.eaten ? 'me' : 'whole';
    return `<i class="is-${who}"></i>`;
  }).join('');
  const tally = `<div class="g-bread-tally"><span>${t.it} <b>${state.given}</b></span><span>${t.you} <b>${state.eaten}</b></span><span>${t.left} <b>${left(state)}</b></span></div>`;
  const bread = `<div class="g-bread-cake" aria-hidden="true">${bits}</div>`;
  if (state.won) return `<div class="g-bread is-won">${bread}${tally}<p class="g-bread-line">${lineOf(state, t)}</p></div>`;
  return `<div class="g-bread">${bread}${tally}<p class="g-bread-line">${lineOf(state, t)}</p>`
    + `<div class="g-bread-acts"><button type="button" class="g-bread-btn" data-g="give">${t.toIt}</button><button type="button" class="g-bread-btn is-me" data-g="eat">${t.toMe}</button></div>`
    + (state.given + state.eaten ? `<button type="button" class="g-bread-quiet" data-g="rest">${t.rest}</button>` : '')
    + `</div>`;
}
