// 讲堂三日 · 掐、咒、扣 — 古六, the month before the 大比 (wm-qianye; the per-回 plan, 2026-10-15).
// The book: 「这一个月，褚先生在讲堂上教了五样最粗浅的法术」 — the first day the hand (the twelve
// 文 on the left hand, 「自四指根逐节数，共十二目」: 火弹 午, 冰锥 子, 木藤 卯, 金刃 酉, and 土
// 「在当中」, the middle finger's middle joint), the second the 咒 (eight lines and 「急急如律令」,
// one line a step — drop one and the qi stops half-way; 马小宝's 「快去」 gets a burp), the third
// the 扣 (the fire held in a closed fist for one stick of incense; sweat comes, and a fist that is not
// gripped tight leaks its light). Three stages, never a fail: a slip only costs the grade.
// Grade tight · loose, written as a mark. `stuck` once the slips pile up (the page's skip, 2026-10-15).
// Pure module: newGame / html / act / tick (live while the incense burns; live-games.js).
import { btn, n, scene, skipped, splash, still } from './ink.js';

export const meta = {
  id: 'qiajue',
  name: { zh: '讲堂三日 · 掐、咒、扣', en: 'Three days in the lecture hall · Pinch, chant, hold' },
  how: {
    zh: '头一天点文，第二天念咒，八句一句不落；第三天扣住，出汗了就攥严。',
    en: 'Day one, find the mark; day two, the chant, all eight lines in order; day three, hold it — grip tight when the sweat comes.',
  },
};

// The twelve 文 (玉册: from the ring finger's root, joint by joint) and the middle finger's middle joint.
// f: finger column (0 little … 3 index), lv: 0 root … 3 tip.
export const WEN = [
  { id: 'zi', ch: '子', f: 1, lv: 0 }, { id: 'chou', ch: '丑', f: 2, lv: 0 }, { id: 'yin', ch: '寅', f: 3, lv: 0 },
  { id: 'mao', ch: '卯', f: 3, lv: 1 }, { id: 'chen', ch: '辰', f: 3, lv: 2 }, { id: 'si', ch: '巳', f: 3, lv: 3 },
  { id: 'wu', ch: '午', f: 2, lv: 3 }, { id: 'wei', ch: '未', f: 1, lv: 3 }, { id: 'shen', ch: '申', f: 0, lv: 3 },
  { id: 'you', ch: '酉', f: 0, lv: 2 }, { id: 'xu', ch: '戌', f: 0, lv: 1 }, { id: 'hai', ch: '亥', f: 0, lv: 0 },
  { id: 'yuqing', ch: '中', f: 2, lv: 1.5 },
];
export const SPELLS = [{ id: 'fire', wen: 'wu' }, { id: 'ice', wen: 'zi' }, { id: 'vine', wen: 'mao' }, { id: 'blade', wen: 'you' }, { id: 'wall', wen: 'yuqing' }];
export const CHANT = ['天地自然', '丙丁涌出', '火郎火女', '从天降下', '南离正炁', '循臂而行', '聚于掌心', '一点成丸', '急急如律令'];
const CHANT_EN = ['Heaven and earth, as they are', 'Bing and ding well forth', 'Fire-lad, fire-lass', 'Come down from heaven', 'True qi of the southern Li', 'Run along the arm', 'Gather in the palm', 'One point becomes a ball', 'Swift as the statutes command'];
export const DECOY = 'kuaiqu';
export const INCENSE = 9000; // ms of the stick
export const WAVES = [1600, 4200, 6600]; // when the sweat comes (ms into the stick)
export const WAVE_MS = 1300;
const LEAK = 0.04, WAVE_LEAK = 0.55, SLIP = 0.12; // the fist's light, per second; a needless squeeze

const T = {
  zh: {
    ready: '这一个月，褚先生在讲堂上教了五样最粗浅的法术。头一天他不教法术，先教手。', start: '摊开左手',
    fire: '「火在南，南是午。火弹，掐哪个文？」', ice: '「水在北。冰锥，掐哪个文？」', vine: '「木在东。木藤，掐哪个文？」', blade: '「金在西。金刃，掐哪个文？」', wall: '「那土掐在哪里？」——「土在当中。」',
    right: '戒尺点了点：「对。」', wrong: '「那是{w}文。」孙二狗在旁边数到小指根，数出来十三个，又从头数。',
    chantReady: '第二天他教咒。「手是沟，咒是赶水的人。一句话走一截路，八句话，正好从肩膀走到指头尖。」', chantGo: '抡胳膊',
    said: '一句一步——', dropped: '落了一句。那一截路没人赶，一颗火星子从胳膊肘上冒了出来，把袖子燎了一个洞。', burp: '「快去！」——指尖上什么也没有，倒打出一个嗝来。「差役不认得你。」',
    ball: '「急急如律令！」掌心里滚出一颗火弹，栗子大。',
    kouReady: '第三天，褚先生教的是扣。「先掐好，扣在手里，要用的时候，一松。」他点上一炷香。', kouGo: '掐好，扣住',
    hold: '拳心里透出一点红。香在烧……', sweat: '手心出汗了——指缝里漏出一线红光！', grip: '攥严了。一丝光也不漏。', slip: '攥得太死，手一抖，漏了一点。',
    out: '「噗」，灭了。白掐一回——从头再掐。', gripBtn: '攥严', kouAgain: '再掐一回',
    wen: '文', kou: '扣', chant: '咒', day: ['头一天', '第二天', '第三天'],
    tight: '香灰落尽的时候，只剩两只拳头还透着红：前排一个，憋得脸都紫了；最后一排，还有一只。', loose: '香灰落尽，拳心里那一点红还在，暗是暗了些。掐、咒、扣，三样都会了。',
    skipped: '这一个月，掐、咒、扣，你都学了个皮毛。',
  },
  en: {
    ready: 'That month Master Chu taught five of the simplest spells in the lecture hall. The first day he taught no spells, only the hand.', start: 'Open your left hand',
    fire: '"Fire is south, south is wu. The fireball — which mark?"', ice: '"Water is north. The ice spike — which mark?"', vine: '"Wood is east. The vine — which mark?"', blade: '"Metal is west. The metal blade — which mark?"', wall: '"And earth — where do you pinch for earth?" — "Earth is in the middle."',
    right: 'The ruler taps. "Right."', wrong: '"That is {w}." Beside you Sun Ergou counts to the root of his little finger, gets thirteen, and starts again.',
    chantReady: 'The second day he taught the chant. "The hand is the channel; the chant is the man who drives the water. Each line moves it a stretch — eight lines, shoulder to fingertip."', chantGo: 'Swing the arms',
    said: 'A line, a step —', dropped: 'A line dropped. That stretch had no one driving it; a spark popped out at the elbow and burned a hole in the sleeve.', burp: '"Go on!" — nothing at the fingertip, only a burp. "The runner doesn\'t know you."',
    ball: '"Swift as the statutes command!" A fireball rolls out of the palm, the size of a chestnut.',
    kouReady: 'The third day Master Chu taught the hold. "Pinch it first, keep it in the hand, and when you need it — let go." He lights a stick of incense.', kouGo: 'Pinch it, close the fist',
    hold: 'A little red shows through the fist. The incense burns…', sweat: 'The palm sweats — a thread of red light leaks through the fingers!', grip: 'Gripped tight. Not a thread of light leaks.', slip: 'Squeezed too hard; the hand trembles and a little leaks.',
    out: 'Puff — out. A pinch wasted; pinch it again.', gripBtn: 'Grip tight', kouAgain: 'Pinch it again',
    wen: 'mark', kou: 'Hold', chant: 'Chant', day: ['Day one', 'Day two', 'Day three'],
    tight: 'When the incense had burned down, only two fists still glowed red: one at the front, its owner purple in the face; and one in the back row.', loose: 'The incense burns down and the red is still in the fist, dimmer than it was. Pinch, chant, hold — you have all three.',
    skipped: 'That month you learned the skin of pinch, chant and hold.',
  },
};

function hash(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; }
function shuffled(list, seed) {
  const out = [...list]; let h = hash(seed);
  for (let i = out.length - 1; i > 0; i -= 1) { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function newGame(seed) {
  const s = String(seed);
  return { seed: s, phase: 'ready', order: shuffled(SPELLS.map((x) => x.id), `${s}|q`), k: 0, tiles: shuffled([...CHANT.map((_, i) => i), DECOY], `${s}|c`), said: 0,
    t: 0, light: 1, wave: -1, gripped: [], outs: 0, wrongs: 0, live: false, fx: null, note: 'ready', won: false, grade: null };
}

export const stuck = (s) => s.wrongs >= 6 || s.outs >= 2;
export const gradeOf = (s) => (s.wrongs <= 2 && s.outs === 0 ? 'tight' : 'loose');
const waveAt = (t) => WAVES.findIndex((w) => t >= w && t < w + WAVE_MS);

function pinch(s, d) {
  if (s.phase !== 'pinch') return null;
  const want = SPELLS.find((x) => x.id === s.order[s.k]).wen, w = WEN.find((x) => x.id === d.w);
  if (!w) return null;
  if (w.id !== want) return { ...s, wrongs: s.wrongs + 1, note: `wrong|${w.ch}`, fx: { at: s.wrongs, ok: false, w: w.id } };
  const k = s.k + 1;
  return k < SPELLS.length ? { ...s, k, note: 'right', fx: { ok: true, w: w.id } } : { ...s, k, phase: 'chant-ready', note: 'chantReady', fx: { ok: true, w: w.id } };
}

function say(s, d) {
  if (s.phase !== 'chant') return null;
  if (d.i === DECOY) return { ...s, said: 0, wrongs: s.wrongs + 1, note: 'burp' };
  const i = Number(d.i);
  if (i !== s.said) return { ...s, said: 0, wrongs: s.wrongs + 1, note: 'dropped' };
  const said = s.said + 1;
  return said < CHANT.length ? { ...s, said, note: 'said' } : { ...s, said, phase: 'kou-ready', note: 'ball' };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'pinch', note: s.order[0] } : s.phase === 'chant-ready' ? { ...s, phase: 'chant', note: 'chantReady2' }
    : s.phase === 'kou-ready' || s.phase === 'kou-out' ? { ...s, phase: 'kou', live: true, t: 0, light: 1, gripped: [], wave: -1, note: 'hold' } : null),
  pinch,
  say,
  grip: (s) => {
    if (s.phase !== 'kou') return null;
    const w = waveAt(s.t);
    if (w >= 0 && !s.gripped.includes(w)) return { ...s, gripped: [...s.gripped, w], note: 'grip' };
    return { ...s, light: Math.max(0, s.light - SLIP), note: 'slip' };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'kou' || ms <= 0) return state;
  const t = state.t + ms, w = waveAt(t), leaking = w >= 0 && !state.gripped.includes(w);
  const light = state.light - ((leaking ? WAVE_LEAK : LEAK) * ms) / 1000;
  if (light <= 0) return { ...state, t, light: 0, live: false, phase: 'kou-out', outs: state.outs + 1, note: 'out' };
  if (t >= INCENSE) { const grade = gradeOf(state); return { ...state, t: INCENSE, light, live: false, won: true, grade, note: grade }; }
  const note = leaking ? 'sweat' : ['grip', 'slip'].includes(state.note) && w >= 0 ? state.note : 'hold';
  return { ...state, t, light, wave: w, note };
}

/* ── The pictures: the left hand drawn in ink, palm out, the twelve marks on its joints (the one
   tapped wrong blotted, the right one sealed); the arm's eight steps as a row of brush dots; the
   closed fist with its glow and the stick of incense burning down beside it. */
const FX = [70, 120, 170, 220], LY = [138, 106, 74, 42];
const wenXY = (w) => [FX[w.f], w.lv === 1.5 ? (LY[1] + LY[2]) / 2 : LY[w.lv]];
function handScene(state) {
  const fingers = FX.map((x, f) => `<path class="g-line" d="M${x - 16} 150 V${LY[3] - 12 + (f === 0 ? 14 : f === 2 ? -6 : 0)} q16 -18 32 0 V150"/>`).join('');
  const thumb = '<path class="g-line" d="M240 150 q30 -10 44 -44 q8 -18 -8 -22 q-14 -2 -22 20 q-6 14 -18 18"/>';
  const palm = '<path class="g-line g-thin g-faint" d="M54 150 q90 26 186 0"/>';
  const marks = WEN.map((w) => {
    const [x, y] = wenXY(w), hot = state.fx?.w === w.id;
    return `<g class="g-wen"><circle class="g-spot${hot && state.fx.ok ? ' is-seal' : ''}" cx="${x}" cy="${n(y)}" r="9"/><text class="g-spotnum" x="${x}" y="${n(y + 4)}" text-anchor="middle">${w.ch}</text></g>`;
  }).join('');
  const blot = state.fx && !state.fx.ok ? splash(...wenXY(WEN.find((w) => w.id === state.fx.w)), 300, { r: 8 }) : '';
  return scene(320, 160, palm + fingers + thumb + marks + blot);
}
function chantScene(state) {
  const dots = CHANT.map((_, i) => `<circle class="g-dot${i < state.said ? ' is-seal' : ''}" cx="${30 + i * 32}" cy="${n(80 - i * 6)}" r="${i === CHANT.length - 1 ? 9 : 6}"/>`).join('');
  const arm = '<path class="g-line g-thin g-faint" d="M24 84 Q160 30 296 30"/>';
  const ball = state.said >= CHANT.length ? splash(296, 30, 200, { r: 12, seal: true }) : '';
  return scene(320, 100, arm + dots + ball);
}
function kouScene(state) {
  const glow = n(0.15 + state.light * 0.6, 2), leak = state.note === 'sweat' && !still() ? [0, 1, 2].map((k) => `<path class="g-markstroke" d="M${150 + k * 10} 60 l${-6 + k * 6} -22" opacity="${n(0.3 + 0.2 * Math.sin(state.t / 90 + k), 2)}"/>`).join('') : '';
  const fist = `<circle class="g-flame" cx="160" cy="84" r="${n(16 + state.light * 10)}" opacity="${glow}"/><path class="g-line" d="M134 104 q-6 -34 14 -42 q22 -8 36 6 q10 14 0 36 Z"/><path class="g-line g-thin" d="M146 72 h30 M144 84 h34 M146 96 h28"/>`;
  const left = Math.max(0, 1 - state.t / INCENSE);
  const stick = `<path class="g-line g-thin" d="M250 118 V${n(118 - 80 * left)}"/><circle class="g-ember" cx="250" cy="${n(118 - 80 * left)}" r="2.4"/><path class="g-line" d="M236 118 h28"/>`;
  return scene(320, 126, fist + leak + stick);
}

const fillW = (line, w) => line.replace('{w}', w);
function lineOf(state, t) {
  const [key, w] = String(state.note).split('|');
  if (key === 'wrong') return `${fillW(t.wrong, w)} ${t[state.order[state.k]]}`;
  if (key === 'right') return `${t.right} ${t[state.order[state.k]]}`;
  if (key === 'chantReady2') return t.said;
  if (key === 'said') return `${t.said}${CHANT.slice(0, state.said).join('——')}——`;
  return t[key] ?? '';
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, day = ['ready', 'pinch'].includes(state.phase) ? 0 : ['chant-ready', 'chant'].includes(state.phase) ? 1 : 2;
  const head = `<div class="g-head"><span>${t.day[day]}</span><span>${[t.wen, t.chant, t.kou].map((x, i) => (i < day ? `<b>${x}</b>` : x)).join(' · ')}</span></div>`;
  const say = `<p class="g-line-say">${lineOf(state, t)}</p>`;
  if (state.won) return `<div class="g-qiajue g-ink is-won">${kouScene(state)}${head}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  const wrap = (pic, controls) => `<div class="g-qiajue g-ink">${pic}${head}${say}${controls}</div>`;
  if (state.phase === 'ready') return wrap(handScene(state), btn(t.start, 'data-g="start"'));
  if (state.phase === 'pinch') {
    const pad = `<div class="g-tags">${WEN.map((w) => `<button type="button" class="g-tag" data-g="pinch" data-w="${w.id}">${w.ch}<small>${w.id === 'yuqing' ? (lang === 'en' ? 'middle joint' : '中指中节') : t.wen}</small></button>`).join('')}</div>`;
    return wrap(handScene(state), pad);
  }
  if (state.phase === 'chant-ready' || state.phase === 'kou-ready' || state.phase === 'kou-out') {
    const go = state.phase === 'chant-ready' ? t.chantGo : state.phase === 'kou-out' ? t.kouAgain : t.kouGo;
    return wrap(state.phase === 'chant-ready' ? handScene(state) : kouScene(state), `${state.phase === 'kou-ready' ? `<p class="g-line-say">${t.kouReady}</p>` : ''}${btn(go, 'data-g="start"')}`);
  }
  if (state.phase === 'chant') {
    const words = lang === 'en' ? CHANT_EN : CHANT;
    const pad = `<div class="g-tags">${state.tiles.map((i) => (i === DECOY ? `<button type="button" class="g-tag" data-g="say" data-i="${DECOY}">${lang === 'en' ? 'Go on!' : '快去'}</button>`
      : `<button type="button" class="g-tag${i < state.said ? ' is-on' : ''}" data-g="say" data-i="${i}"${i < state.said ? ' disabled' : ''}>${words[i]}</button>`)).join('')}</div>`;
    return wrap(chantScene(state), pad);
  }
  return wrap(kouScene(state), btn(t.gripBtn, 'data-g="grip"'));
}
