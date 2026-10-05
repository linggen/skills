// 晨脉 · 坑填平了才许摸球 — 今 · 三 (j07-guan; Hanli 2026-10-05: 练太猛晨脉报警).
// 十一月二十九日 出院: 阿禾's paper, three lines — 晨脉回到七十以下，才许摸球. Each
// morning he lies still and counts his own pulse; then 摸球 or 歇着. 「练完是挖坑。
// 吃饱睡足，坑填平了，还多出一截——晨脉高一截，就是坑还没填平。」 A morning at
// seventy or over, the ball touched: the pit is dug again and the pulse is back
// up tomorrow; three such and he is on the ward again — from the first morning.
// Rest and it comes down — 七十六，七十二 — and under seventy the ball is his:
// 出关了. No pay to the 古 line.
// Pure module: newGame / html / act. No clock.

export const meta = {
  id: 'pulse',
  name: { zh: '晨脉 · 坑填平了才许摸球', en: 'The morning pulse · Not till the pit is filled' },
  how: {
    zh: '每天早上先数晨脉。七十以下，才许摸球；高一截，就是坑还没填平。',
    en: 'Count the morning pulse first. Under seventy, the ball is yours; a pulse that is up means the pit is not filled.',
  },
};

export const LIMIT = 70;
export const START = 76;
export const SLIPS = 3;
const TRAIN_UP = 6;
/* A day's rest takes it down as the book counts it: 七十六，七十二 … 六十九. */
const rested = (p) => p - (p > 72 ? 4 : 3);

const T = {
  zh: {
    morning: '早上六点，他两根指头搭在腕子上，数了两遍：',
    unit: '下',
    rest: '歇着',
    train: '摸球',
    rested: '什么也不许干，只许吃、睡、躺着。歇着也要咬牙。',
    dug: '他偷偷去露天场子投了一百个。夜里腿又硬了——坑还没填平，又往下挖了一截。',
    ward: '腿疼得碰不得，尿又深了。他又躺回了十七床。阿禾的纸上那三条，从头来。',
    ahead: '晨脉',
    won: '七十以下了。他一骨碌坐起来，脑袋「咚」地撞在上铺床板上。「出关了。」阿禾回了一个字：「记。」',
  },
  en: {
    morning: 'Six in the morning: two fingers on his wrist, he counted twice:',
    unit: 'beats',
    rest: 'Rest',
    train: 'Pick up the ball',
    rested: 'Nothing allowed but eating, sleeping, lying down. Even resting took gritted teeth.',
    dug: 'He slipped out to the open court and shot a hundred. By night his legs were stiff again — the pit not filled, and dug deeper.',
    ward: 'His legs hurt to touch and his urine darkened again. Back in bed seventeen. The three lines on Ahe\'s paper, from the top.',
    ahead: 'Morning pulse',
    won: 'Under seventy. He sat bolt upright and banged his head on the bunk above. "Out of seclusion." Ahe answered with one word: "Noted."',
  },
};

export function newGame(seed = '') {
  return { seed: String(seed), day: 1, pulse: START, slips: 0, note: 'morning', won: false };
}

const VERBS = {
  rest: (s) => ({ ...s, day: s.day + 1, pulse: rested(s.pulse), note: 'rested' }),
  train: (s) => {
    if (s.pulse < LIMIT) return { ...s, won: true, note: 'won' };
    const slips = s.slips + 1;
    if (slips >= SLIPS) return { ...newGame(s.seed), note: 'ward' };
    return { ...s, day: s.day + 1, slips, pulse: s.pulse + TRAIN_UP, note: 'dug' };
  },
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-jin g-pulse is-won"><p class="g-jin-line">${t.won}</p></div>`;
  const before = state.note === 'morning' ? '' : `<p class="g-jin-line">${t[state.note]}</p>`;
  return `<div class="g-jin g-pulse">${before}<p class="g-jin-line">${t.morning}</p>`
    + `<div class="g-jin-hr${state.pulse >= LIMIT ? ' is-fast' : ''}"><b>${state.pulse}</b><span>${t.unit}</span></div>`
    + `<div class="g-jin-pair"><button type="button" class="g-jin-btn" data-g="rest">${t.rest}</button>`
    + `<button type="button" class="g-jin-btn" data-g="train">${t.train}</button></div></div>`;
}
