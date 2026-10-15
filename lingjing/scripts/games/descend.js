// 下崖 · 一根草也不长 — 古五, the 凶崖 in the 沉鼎秘境 (the room's board, 2026-10-15). The book:
// past the 凶 fissure a wet stair runs down to a drop, black below, only a drip to be heard — one,
// a long while, another; he rolls up his sleeves and climbs down the cliff, a hunter's trade, but
// not a blade of grass grows on it, the stone is cold to the bone, and the rib broken on the night of
// the twelfth is not knit — every pull is a needle. Here each reach down offers two holds, left and
// right; one is wet, where the drip runs, and slips him a reach back up with a stab in the rib. The
// drip can be listened for first (a turn): it falls on the wet side. Three stabs and he must hang
// still and breathe before he goes on. Grade steady · scraped, written as a mark.
// Pure module: newGame / html / act.
import { rng } from './seeded.js';
import { btn, n, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'descend',
  name: { zh: '下崖 · 一根草也不长', en: 'The drop · Not a blade of grass' },
  how: {
    zh: '每往下一步，左右各有一处落手。湿的那处，水正往下滴，一抓就滑。先听一听水滴落在哪边。肋骨疼到第三下，得停一停喘口气。',
    en: 'Each reach down has a hold on the left and the right. The wet one, where the drip runs, slips. Listen for which side the drip falls on first. At the third stab in your rib, hang still and breathe.',
  },
};

export const REACHES = 6; // holds from the lip to the ledge below
export const STABS = 3; //   the rib's limit before he must breathe

const T = {
  zh: {
    ready: '石阶走到头，是一道断崖。崖下黑洞洞的，只听得见底下的水滴：一滴，隔很久，又一滴。', start: '挽起袖子，往下爬',
    left: '抓左边', right: '抓右边', listen: '听水滴', breathe: '贴着崖壁喘口气', depth: '往下', rib: '肋骨',
    climb: '崖壁上一根草也不长，石头凉得透骨。往下够一步。', heardL: '「嗒。」——水滴落在左手边。', heardR: '「嗒。」——水滴落在右手边。',
    held: '干的，抓牢了。身子往下送了一步。', slipped: '湿的——手一滑，你往上一挣，左边肋骨像有人往里塞了一根针。',
    hurt: '肋骨疼得眼前发黑。不能再使劲了，先贴着崖壁喘一喘。', breathed: '喘匀了，针扎似的疼退下去一些。',
    steady: '脚底踩着了石台。你一回也没滑。', scraped: '脚底总算踩着了石台。左边肋骨还在跳着疼。',
    skipped: '你顺着崖壁，一寸一寸爬了下去。',
  },
  en: {
    ready: 'The stair ends at a drop. Below it is black; all you can hear is the drip — one, a long while, another.', start: 'Roll up your sleeves and climb down',
    left: 'Take the left', right: 'Take the right', listen: 'Listen for the drip', breathe: 'Hang still and breathe', depth: 'Down', rib: 'Rib',
    climb: 'Not a blade of grass on the cliff, and the stone cold to the bone. Reach down one more.', heardL: '"Tock." — the drip falls on your left.', heardR: '"Tock." — the drip falls on your right.',
    held: 'Dry, and it holds. You lower yourself one reach.', slipped: 'Wet — your hand slips, you heave up, and something drives a needle into your left rib.',
    hurt: 'The rib goes white behind your eyes. No more pulling — hang against the rock and breathe first.', breathed: 'Your breath comes back, and the needle eases a little.',
    steady: 'Your feet find the ledge. Not one slip.', scraped: 'At last your feet find the ledge. The left rib is still throbbing.',
    skipped: 'You climb down the cliff, inch by inch.',
  },
};

export function newGame(seed) {
  const rnd = rng(`descend:${seed}`);
  // The wet side of each reach: 0 left, 1 right.
  const wet = Array.from({ length: REACHES }, () => (rnd() < 0.5 ? 0 : 1));
  return { seed: String(seed), wet, at: 0, heard: null, stabs: 0, slips: 0, started: false, fx: null, t: 0, note: 'ready', won: false, grade: null };
}

const take = (s, side) => {
  if (!s.started || s.stabs >= STABS) return null;
  const t = s.t + 1;
  if (s.wet[s.at] === side) {
    const stabs = s.stabs + 1;
    return { ...s, t, heard: null, stabs, slips: s.slips + 1, at: Math.max(0, s.at - 1), fx: { at: t, slip: true }, note: stabs >= STABS ? 'hurt' : 'slipped' };
  }
  const at = s.at + 1;
  if (at >= REACHES) { const grade = s.slips === 0 ? 'steady' : 'scraped'; return { ...s, t, at, won: true, grade, note: grade }; }
  return { ...s, t, at, heard: null, fx: { at: t, slip: false }, note: 'held' };
};

const VERBS = {
  start: (s) => (s.started ? null : { ...s, started: true, note: 'climb' }),
  left: (s) => take(s, 0),
  right: (s) => take(s, 1),
  listen: (s) => (!s.started || s.heard != null || s.stabs >= STABS ? null : { ...s, heard: s.wet[s.at], t: s.t + 1, note: s.wet[s.at] === 0 ? 'heardL' : 'heardR' }),
  breathe: (s) => (s.stabs < STABS ? null : { ...s, stabs: 1, t: s.t + 1, note: 'breathed' }),
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the cliff face in ink top to bottom, the reaches as notches down it, his
   hand where he hangs, a drip falling on the side he listened for, a blot where he slipped. */
function cliffScene(state) {
  const face = '<path class="g-rock" d="M60 0 H260 V150 H60Z"/><path class="g-line" d="M60 0 V150 M260 0 V150"/><path class="g-line g-thin g-faint" d="M90 20 l10 14 M220 40 l-8 16 M120 90 l12 10 M200 120 l-10 8"/>';
  const step = 130 / REACHES;
  const notches = Array.from({ length: REACHES }, (_, i) => `<path class="g-line g-thin${i < state.at ? '' : ' g-faint'}" d="M130 ${n(14 + i * step)} h-14 M190 ${n(14 + i * step)} h14"/>`).join('');
  const y = n(14 + Math.min(state.at, REACHES - 1) * step);
  const hand = `<circle class="g-line" cx="160" cy="${y}" r="5" fill="none"/>`;
  const drip = state.heard == null ? '' : `<path class="g-line g-thin g-water" d="M${state.heard === 0 ? 116 : 204} ${n(Number(y) - 18)} v10"/>`;
  const blot = state.fx?.slip ? splash(160, Number(y), 300, { r: 9 }) : '';
  const done = state.won ? splash(160, 140, 300, { r: 10, seal: state.grade === 'steady' }) : '';
  return scene(320, 150, face + notches + hand + drip + blot + done);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-descend g-ink is-won">${cliffScene(state)}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  const meter = `<p class="g-meter small">${t.depth} ${state.at}/${REACHES} · ${t.rib} ${'●'.repeat(state.stabs)}${'○'.repeat(Math.max(0, STABS - state.stabs))}</p>`;
  const acts = !state.started ? btn(t.start, 'data-g="start"')
    : state.stabs >= STABS ? btn(t.breathe, 'data-g="breathe"')
      : `<div class="g-pair">${btn(t.left, 'data-g="left"')}${btn(t.right, 'data-g="right"')}</div>${state.heard == null ? btn(t.listen, 'data-g="listen"', 'soft') : ''}`;
  return `<div class="g-descend g-ink">${cliffScene(state)}${meter}<p class="g-line-say">${t[state.note] ?? ''}</p>${acts}</div>`;
}
