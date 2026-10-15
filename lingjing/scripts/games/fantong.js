// 喂饭桶 — the shared 饭桶 board (the per-回 plan, 2026-10-15). The book's 饭桶 is the copper
// furnace in the woodshed that will not open until it feels like it (按了一回，没开；两回，三回……),
// and once open eats what it is fed — each thing a mouthful of his own qi — and spits out
// something else: 喂凡物，多半出凡物. Here: press the lid till it gives, then feed it from what he
// has, the 丹田 bar going down a mouthful a feed; a thing the stop keeps for last (`last`) waits
// till the rest are fed — he did not dare throw it in first. What comes out is the book's.
// No grade: it ends when everything is fed.
// A stop is data (STOPS): 'qianye' is 古六's 开炉夜 (wm-zhaojing). 古四's first feeding, 古五's
// 「给我一样保命的」, 古七's 火柴 and 古八's 九节聚气 are meant to be added the same way.
// Pure: makeFantong(stop) → { meta, newGame, act, html, stuck }; fantongqianye.js is the stop's module.
import { btn, n, scene, skipped, splash } from './ink.js';

export const STOPS = {
  qianye: {
    press: 4, // 按到第四回，「咔哒」，盖子松了一条缝
    name: { zh: '喂饭桶 · 开炉夜', en: 'Feeding the Rice Bucket · The night before' },
    how: { zh: '先按盖子，按到它开。再一样一样地喂——一样吸你一口灵气。', en: 'Press the lid till it opens. Then feed it, one thing at a time — each takes a mouthful of your qi.' },
    feeds: [
      { id: 'hair', zh: ['一撮红毛', '小狰换下的'], en: ['A pinch of red fur', 'the little zheng shed it'],
        out: { zh: '「咔哒」，飘出一张黄纸，朱砂画着一只鼻孔朝天的鼻子，符脚两行朱字：喷嚏符；一缕清气，通窍。', en: '*Click*: out floats a yellow paper, a nose drawn on it in cinnabar, nostrils to the sky, and two red lines at its foot: *Sneezing Talisman; a breath of clear air, clears the passages.*' } },
      { id: 'whisker', zh: ['一根胡子', '小狰的——拔的时候，它拿独角顶了他一下'], en: ['A whisker', 'the little zheng\'s — it butted him with its horn'],
        out: { zh: '吐出来三根针，细得像牛毛，插在一张小红纸片上：痒痒针；一针见笑。', en: 'Out come three needles, fine as an ox\'s hair, stuck in a slip of red paper: *Tickle Needles; one prick, one laugh.*' } },
      { id: 'mirror', zh: ['一面裂手镜', '伙房大娘扔在泔水桶边上的'], en: ['A cracked hand mirror', 'the kitchen woman threw it out by the slops'],
        out: { zh: '吐出来一面巴掌大的铜镜，缺一个角，磨得锃亮，谁照都是小满的脸。银月钻出来，眯着眼睛照了一照：「……本王的脸呢？」背面刻着：自拍镜；照人，先照己。', en: 'Out comes a copper mirror the size of a palm, a corner missing, polished bright, and whoever looks in it sees Xiaoman\'s face. Yinyue squints into it: "…Where\'s this queen\'s face?" On the back: *Selfie Mirror; before you show others, show yourself.*' } },
      { id: 'sandal', zh: ['一双草鞋', '他脚上那双，磨穿了底'], en: ['A pair of straw sandals', 'the ones on his feet, worn through'],
        out: { zh: '饭桶「嗝」了一声，什么也没吐。', en: 'The Rice Bucket goes *burp*, and spits out nothing.' } },
      { id: 'stone', last: true, zh: ['一块灵石', '腊月初一领的那一块'], en: ['A spirit stone', 'the one from the first of the month'],
        wish: { zh: '他两只手按着铜肚子，心里念的是：给我一样打得过内门的。', en: 'He presses both hands to the copper belly, thinking: give me something that can beat the inner court.' },
        out: { zh: '「咔哒」，一张黄纸，朱砂画着一只肥猪，背上插着两对蜻蜓翅膀：猪蜻蜓；乘风而起，见木而栖。想要的是打得过内门的，开出来的是这个。', en: '*Click*: a yellow paper, a fat pig drawn on it in cinnabar with two pairs of dragonfly wings on its back: *Pig Dragonfly; rises on the wind, roosts where there are trees.* He asked for something to beat the inner court, and this is what came out.' } },
    ],
    zh: {
      ready: '饭桶在柴垛底下，盖子合得死死的。他叹了一口气：「饭桶啊饭桶。明天，有人要拿镜子照我了。」', press: '按盖子', shut: ['按了一回，没开。', '两回，没开。', '三回，没开。'], open: '按到第四回，「咔哒」，盖子松了一条缝。喂凡物，多半出凡物——先喂凡物。',
      wait: '灵石只剩这一块，攥在手心里，他没舍得先扔。', qi: '丹田', feed: '喂',
      done: '五样下去，饭桶吸了他五口，丹田见了底，扶着柴垛站不起来。银月蹲在柴墩上，看看地上那一溜，懒懒地道：「……收破烂的。」',
      skipped: '那一夜，饭桶开了。五样下去，丹田见了底。',
    },
    en: {
      ready: 'The Rice Bucket sits under the woodpile, its lid shut tight. He sighs: "Rice Bucket, oh, Rice Bucket. Tomorrow someone\'s going to shine a mirror on me."', press: 'Press the lid', shut: ['One press. Shut.', 'Two. Shut.', 'Three. Shut.'], open: 'At the fourth press, *click*, the lid loosens a crack. Feed it common things, get common things — common things first.',
      wait: 'The spirit stone is the only one he has, clutched in his palm; he can\'t bring himself to throw it in first.', qi: 'Dantian', feed: 'Feed',
      done: 'Five things in, five mouthfuls drawn from him; his dantian is bare, and he cannot get up off the woodpile. Yinyue, squatting on the chopping block, looks at the row on the floor: "…A rag-and-bone man."',
      skipped: 'That night the Rice Bucket opened. Five things in, and his dantian was bare.',
    },
  },
};

/* ── The picture: the copper furnace under the woodpile, three-legged, the little beast on its
   lid with its rump turned; the lid lifts a crack once it gives; what came out lies in a row on
   the floor, a seal for each (`seals`); the 丹田 a bowl drawn beside it, `left` of it full; `spit`
   the splash of a thing coming out (`seal`: with its seal). Exported for 喂饭桶's free play
   (fantong-free.js), so the story's stops and the free bucket are one drawing. */
export function drawBucket({ open = false, seals = 0, left = 1, spit = false, seal = true } = {}) {
  const lid = open ? -6 : 0;
  const pile = '<path class="g-line g-thin g-faint" d="M14 40 h90 M10 52 h100 M16 28 h80"/>';
  const pot = `<path class="g-line" d="M120 60 q0 44 40 44 q40 0 40 -44 Z"/><path class="g-line" d="M130 104 l-6 12 M190 104 l6 12 M160 104 v12"/>`
    + `<path class="g-line" d="M118 ${56 + lid} h84"/><path class="g-line g-thin" d="M150 ${50 + lid} q10 -10 20 0"/>`;
  const row = Array.from({ length: seals }, (_, i) => `<circle class="g-dot is-seal" cx="${n(222 + (i % 3) * 30)}" cy="${n(100 + Math.floor(i / 3) * 14)}" r="5"/>`).join('');
  const bowl = `<path class="g-line g-thin" d="M228 40 q24 30 48 0"/><path class="g-water" d="M${n(252 - 22 * left)} ${n(40 + 14 * (1 - left))} h${n(44 * left)}"/>`;
  const fx = spit ? splash(160, 52, 260, { r: 12, seal }) : '';
  return scene(320, 124, pile + pot + row + bowl + fx);
}

export function makeFantong(stop) {
  const S = STOPS[stop];
  const meta = { id: `fantong${stop}`, name: S.name, how: S.how };
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', presses: 0, fed: [], waits: 0, note: 'ready', won: false, grade: null });
  const ready = (s, f) => !f.last || S.feeds.every((x) => x.last || s.fed.includes(x.id));

  const VERBS = {
    press: (s) => {
      if (s.phase !== 'ready') return null;
      const presses = s.presses + 1;
      return presses < S.press ? { ...s, presses, note: `shut|${presses - 1}` } : { ...s, presses, phase: 'feed', note: 'open' };
    },
    feed: (s, d) => {
      const f = S.feeds.find((x) => x.id === d.f);
      if (s.phase !== 'feed' || !f || s.fed.includes(f.id)) return null;
      if (!ready(s, f)) return { ...s, waits: s.waits + 1, note: 'wait' };
      const fed = [...s.fed, f.id];
      return fed.length < S.feeds.length ? { ...s, fed, note: `out|${f.id}` } : { ...s, fed, won: true, note: `out|${f.id}` };
    },
    skip: (s) => skipped(s),
  };
  const act = (state, data = {}) => {
    if (!state || state.won) return { state, won: false };
    const next = VERBS[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  };

  /* ── The picture: the copper furnace under the woodpile (drawBucket, shared with free play). */
  const picture = (state) => drawBucket({ open: state.phase !== 'ready', seals: state.fed.length, left: 1 - state.fed.length / S.feeds.length,
    spit: String(state.note).startsWith('out'), seal: state.note !== 'out|sandal' });

  function html(state, lang = 'zh') {
    const t = S[lang] || S.zh;
    const [key, arg] = String(state.note).split('|');
    const f = S.feeds.find((x) => x.id === arg);
    const say = key === 'shut' ? t.shut[Number(arg)] : key === 'out' ? `${f.wish?.[lang] ?? ''}${f.out[lang] ?? f.out.zh}` : t[key] ?? '';
    const head = `<div class="g-head"><span>${t.qi}</span><span class="g-bar"><i style="width:${Math.round((1 - state.fed.length / S.feeds.length) * 100)}%"></i></span></div>`;
    if (state.won) return `<div class="g-fantong g-ink is-won">${picture(state)}${head}<p class="g-line-say">${state.fed.length < S.feeds.length ? t.skipped : `${say} ${t.done}`}</p></div>`;
    if (state.phase === 'ready') return `<div class="g-fantong g-ink">${picture(state)}<p class="g-line-say">${key === 'ready' ? t.ready : say}</p>${btn(t.press, 'data-g="press"')}</div>`;
    const pad = `<div class="g-tags">${S.feeds.map((x) => {
      const gone = state.fed.includes(x.id), [name, note] = x[lang] ?? x.zh;
      return `<button type="button" class="g-tag${gone ? ' is-tried' : ''}" data-g="feed" data-f="${x.id}"${gone ? ' disabled' : ''}>${name}<small>${note}</small></button>`;
    }).join('')}</div>`;
    return `<div class="g-fantong g-ink">${picture(state)}${head}<p class="g-line-say">${say}</p>${pad}</div>`;
  }

  const stuck = () => false; // nothing to fail: feeding always goes on
  return { meta, newGame, act, html, stuck };
}
