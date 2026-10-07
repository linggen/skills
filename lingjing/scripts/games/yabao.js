// 押宝 — 钱掌柜's board at the 坊市 (the book's 古六 / 古八: 「明码标价，童叟无欺」;
// 「我这儿只出一道纹」). A 宝盒 with four 门; he turns the 宝 inside and sets it down;
// you 押 a 门. Three 押 a sitting. He has two habits, and a miss shows them: he never
// turns the 宝 to a 门 it has already pointed at this sitting, and never to the 门
// your hand went to last (he watches hands — that is his living). The first 押 is a
// guess; the second is one of two; the third, read right, is a sure thing — and a
// careless third loses the sitting (come back tomorrow). The prize is a 聚气丹 of
// one ring: the market's (tasks/world.json `yabao`).
// Pure module: newGame / html / act. The host routes [data-g] clicks to act().

export const meta = {
  id: 'yabao',
  name: { zh: '押宝 · 钱掌柜的摊子', en: 'The bet · Money Qian’s stall' },
  how: {
    zh: '宝盒四门，押中一门便赢。他转过的门不再转，你刚押过的门他也不转。三押为限。',
    en: 'Four doors on the box; hit the one the token points at. He never turns it to a door it has pointed at, nor to the one you just bet. Three bets a sitting.',
  },
};

export const DOORS = ['long', 'hu', 'que', 'wu'];
export const TRIES = 3;
const NAMES = {
  zh: { long: '青龙', hu: '白虎', que: '朱雀', wu: '玄武' },
  en: { long: 'Azure Dragon', hu: 'White Tiger', que: 'Vermilion Bird', wu: 'Black Tortoise' },
};
const T = {
  zh: {
    sign: '木板顶上钉着八个字：明码标价，童叟无欺。',
    ask: ['第一押', '第二押', '第三押'],
    pick: '押一门。',
    miss: '你押{pick}。盒盖一掀——宝指着{way}。钱掌柜拨了一下算盘：「押出去的，照押出去的算。」',
    habit: '他转盒子的时候，眼睛一直在你手上。',
    hit: '你押{pick}。盒盖一掀——宝正指着{pick}。钱掌柜看了你半天，从柜底摸出一个油纸包：一颗聚气丹，一道纹。「我这儿，只出一道纹。」',
    lost: '三押都落了空。钱掌柜把盒子收进袖子里：「明儿再来。」',
    won: '押中了。',
    pointed: '指过',
    bet: '刚押',
  },
  en: {
    sign: 'Eight characters nailed above the board: Fair prices, no one cheated.',
    ask: ['First bet', 'Second bet', 'Third bet'],
    pick: 'Bet on a door.',
    miss: 'You bet on the {pick}. The lid comes up — the token points at the {way}. Money Qian flicks a bead on his abacus: "A bet made is a bet counted."',
    habit: 'All the while he turns the box, his eyes are on your hand.',
    hit: 'You bet on the {pick}. The lid comes up — the token points right at the {pick}. Money Qian studies you a long while, then takes an oiled-paper packet from under the counter: one qi pill, one ring. "I only ever give one ring."',
    lost: 'Three bets, three misses. Money Qian slips the box into his sleeve: "Come back tomorrow."',
    won: 'A hit.',
    pointed: 'pointed',
    bet: 'just bet',
  },
};

function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

/* The doors he may turn it to now: none it has pointed at, not the one you bet last. */
export function allowed(state) {
  const last = state.log.length ? state.log[state.log.length - 1].pick : null;
  return DOORS.filter(d => !state.pointed.includes(d) && d !== last);
}

/* Where the 宝 points this 押 — fixed by the seed and the bets before, never by this one. */
export function wayOf(state) {
  const open = allowed(state);
  return open.length ? open[hash(`yabao:${state.seed}:${state.n}`) % open.length] : null;
}

export function newGame(seed, level = 1) {
  return { seed: String(seed), level: Number(level) || 1, n: 1, pointed: [], log: [], won: false, lost: false };
}

function bet(state, pick) {
  if (!DOORS.includes(pick) || state.won || state.lost) return null;
  const way = wayOf(state) ?? pick;
  const log = [...state.log, { n: state.n, pick, way, hit: way === pick }];
  if (way === pick) return { ...state, won: true, log };
  return { ...state, n: state.n + 1, pointed: [...state.pointed, way], log, lost: state.n >= TRIES };
}

const VERBS = { bet: (s, d) => bet(s, String(d.door ?? '')) };

export function act(state, data = {}) {
  if (!state || state.won || state.lost) return { state, won: false };
  const next = VERBS[data.g]?.(state, data) ?? null;
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

const fillIn = (text, lang, e) => text.replaceAll('{way}', NAMES[lang][e.way]).replaceAll('{pick}', NAMES[lang][e.pick]);

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const over = state.won || state.lost;
  const head = state.won ? t.won : state.lost ? t.lost : `${t.ask[Math.min(state.n, TRIES) - 1]} — ${t.pick}`;
  const last = state.log.length ? state.log[state.log.length - 1].pick : null;
  const doors = DOORS.map((d) => {
    const tags = [state.pointed.includes(d) ? t.pointed : '', !over && d === last ? t.bet : ''].filter(Boolean);
    const cls = `g-shouye-spot${state.pointed.includes(d) ? ' is-used' : ''}${d === last ? ' is-watched' : ''}`;
    return `<button type="button" class="${cls}" data-g="bet" data-door="${d}"${over ? ' disabled' : ''}><b>${NAMES[lang][d]}</b>${tags.length ? `<small>${tags.join(' · ')}</small>` : ''}</button>`;
  }).join('');
  const log = state.log.map((e, i) => `<p class="${e.hit ? 'g-shouye-caught' : 'g-shouye-miss'}">${fillIn(e.hit ? t.hit : t.miss, lang, e)}${!e.hit && i === 0 ? ` ${t.habit}` : ''}</p>`).join('');
  return `<div class="g-shouye g-yabao${state.won ? ' is-won' : ''}">
    <div class="g-shouye-head">${head}</div>
    <div class="g-shouye-sign">${t.sign}</div>
    <div class="g-shouye-spots">${doors}</div>
    <div class="g-shouye-log">${log}</div>
  </div>`;
}
