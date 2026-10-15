// 藏息 · 镜光扫过来 — the shared 藏息 board (the per-回 plan, 2026-10-15): a searching light sweeps
// along a row, place by place, and when it reaches him the token on his chest heats. 他爹's word on
// the woodpile — 「它听见的不是你喘，是你心慌」 — is the whole game: a long, slow out-breath (hold
// 吐) cools the token; breath held under the light, or let go in a panic, heats it, and a hot token
// keeps the light on him longer. When the light has passed, the token is cold. Never a fail: a
// token that flares only costs the grade (still · shaky, a mark per stop).
// A stop is data (STOPS): 'tongpu' is 古六's 大通铺 (马小宝's 照妖镜, wm-zhaojing); 古九's 柳树后头
// (老井's 神识, 'miao') is meant to be added the same way.
// Pure: makeMirror(stop) → { meta, newGame, act, tick, html, stuck }; mirrortongpu.js is the stop's module.
import { btn, n, scene, skipped, splash, still } from './ink.js';

const ON = 0.5; //          the light is on him within half a place
const DRAIN = 0.2, FILL = 0.45; // the breath out (a long one lasts five seconds), and back in
const COOL = 0.4, HEAT = 0.9, PANIC = 0.14; // the token, a second; a breath snatched under the light
const FLARE = 1, LINGER = 0.3; // a token this hot flares; while it is hot the light slows to this
const DWELL = 0.18, SLOW = 0.3; // 一个铺一个铺地照过去: over each bunk's middle the light slows

export const STOPS = {
  tongpu: {
    places: 9, you: 7, speed: 1.8, // places a second
    name: { zh: '藏息 · 镜光扫过来', en: 'Hide the breath · The mirror\'s light' },
    how: { zh: '镜光照到你的铺上时，按住「吐」——又长又慢。别憋，别慌。', en: 'When the light reaches your bunk, hold "Breathe out" — long and slow. Don\'t hold it in; don\'t panic.' },
    zh: {
      ready: '马小宝把镜子翻过来，镜面冲着大通铺，从这一头慢慢照到那一头，一个铺一个铺地照过去，嘴里念念有词：「照妖，照妖……」', start: '蒙着被子，听着',
      sweep: '照一个，跟班们笑一声。那镜面上的火光一路晃过来……', on: '晃到你的铺上——胸口的木牌「腾」地一烫。', cool: '它听见的不是你喘，是你心慌。——吐，又长又慢。',
      hot: '木牌越来越烫。', flare: '你一慌，镜面上的火光停住了，在你的铺上晃。', passed: '木牌凉了下去，凉得像一块冰。镜面上的火光晃了一晃，晃过去了。',
      breathe: '吐', place: '铺', still: '木牌凉了下去，凉得像一块冰。镜面上的火光晃了一晃，晃过去了。', shaky: '火光在你铺上停了一停，到底晃过去了。木牌凉了。',
      skipped: '镜面上的火光晃了一晃，晃过去了。',
    },
    en: {
      ready: 'Ma Xiaobao turns the mirror round, face to the long bunk, and shines it slowly from one end to the other, bunk by bunk, muttering: "Show the demon, show the demon…"', start: 'Under the quilt, listen',
      sweep: 'At each bunk his cronies laugh. The firelight on the mirror wavers along toward you…', on: 'It reaches your bunk — the token on your chest flares hot.', cool: 'It doesn\'t hear you breathe; it hears you panic. — Out, long and slow.',
      hot: 'The token grows hotter.', flare: 'You panic, and the light on the mirror stops, wavering on your bunk.', passed: 'The token cools, cold as ice. The light wavers once and moves on.',
      breathe: 'Breathe out', place: 'bunk', still: 'The token cools, cold as ice. The light wavers once and moves on.', shaky: 'The light stopped on your bunk a moment, but in the end it moved on. The token cools.',
      skipped: 'The light on the mirror wavers once and moves on.',
    },
  },
};

export function makeMirror(stop) {
  const S = STOPS[stop];
  const meta = { id: `mirror${stop}`, name: S.name, how: S.how };
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', live: false, t: 0, p: -1, breath: 1, heat: 0, out: false, flares: 0, snatched: 0, note: 'ready', won: false, grade: null });
  const onYou = (s) => Math.abs(s.p - S.you) < ON;

  const VERBS = {
    start: (s) => (s.phase === 'ready' ? { ...s, phase: 'sweep', live: true, note: 'sweep' } : null),
    hold: (s) => (s.phase === 'sweep' ? { ...s, out: true } : null),
    release: (s) => (s.phase !== 'sweep' ? null : onYou(s) ? { ...s, out: false, heat: s.heat + PANIC, snatched: s.snatched + 1 } : { ...s, out: false }),
    skip: (s) => skipped(s),
  };
  const act = (state, data = {}) => {
    if (!state || state.won) return { state, won: false };
    const next = VERBS[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  };

  function tick(state, ms) {
    if (!state.live || state.won || ms <= 0) return state;
    const dt = ms / 1000, on = onYou(state), exhaling = state.out && state.breath > 0;
    const breath = Math.max(0, Math.min(1, state.breath + (exhaling ? -DRAIN : state.out ? 0 : FILL) * dt));
    let heat = on ? Math.max(0, state.heat + (exhaling ? -COOL : HEAT) * dt) : Math.max(0, state.heat - COOL * dt);
    let flares = state.flares, note = on ? (exhaling ? 'cool' : heat > 0.5 ? 'hot' : 'on') : state.p > S.you ? 'passed' : 'sweep';
    if (heat >= FLARE) { flares += 1; heat = 0.6; note = 'flare'; }
    const atBunk = Math.abs(state.p - Math.round(state.p)) < DWELL;
    const p = state.p + S.speed * dt * (atBunk ? SLOW : 1) * (on && heat > 0.45 ? LINGER : 1);
    const s = { ...state, t: state.t + ms, p, breath, heat, flares, note: state.note === 'flare' && on && heat > 0.5 ? 'flare' : note };
    if (p < S.places) return s;
    const grade = flares === 0 && state.snatched <= 1 ? 'still' : 'shaky';
    return { ...s, live: false, won: true, grade, note: grade };
  }

  /* ── The picture: the long bunk in ink, a row of quilts; his own by the door; the mirror's
     light a pale cone sweeping along it; the token on his chest glowing as it heats. */
  function picture(state) {
    const w = 300 / S.places;
    const bunk = '<path class="g-line" d="M10 96 H310 M10 112 H310"/>';
    const quilts = Array.from({ length: S.places }, (_, i) => `<path class="g-line g-thin${i === S.you ? '' : ' g-faint'}" d="M${n(14 + i * w)} 96 q${n(w * 0.45)} -16 ${n(w - 8)} 0"/>`).join('');
    const x = 10 + (Math.max(0, Math.min(S.places - 0.01, state.p)) + 0.5) * w;
    const light = state.phase === 'sweep' && state.p >= 0 ? `<path class="g-glow" d="M${n(x - 8)} 10 L${n(x - w * 0.6)} 96 L${n(x + w * 0.6)} 96 L${n(x + 8)} 10 Z" opacity="${n(still() ? 0.5 : 0.4 + 0.2 * Math.sin(state.t / 120), 2)}"/>` : '';
    const tx = 10 + (S.you + 0.5) * w;
    const token = `<rect class="g-line g-thin" x="${n(tx - 5)}" y="76" width="10" height="13" rx="2"/><circle class="g-flame" cx="${n(tx)}" cy="82" r="${n(3 + state.heat * 9)}" opacity="${n(Math.min(0.85, state.heat), 2)}"/>`;
    const mirror = `<circle class="g-line" cx="${n(x)}" cy="10" r="7"/>`;
    const flare = state.note === 'flare' ? splash(tx, 80, 250, { r: 10, seal: true }) : '';
    return scene(320, 120, bunk + quilts + light + token + (state.phase === 'sweep' ? mirror : '') + flare);
  }

  function html(state, lang = 'zh') {
    const t = S[lang] || S.zh;
    if (state.won) return `<div class="g-mirror g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
    if (state.phase === 'ready') return `<div class="g-mirror g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
    const meter = `<div class="g-meter"><span>${t.breathe}</span><span class="g-bar"><i style="width:${Math.round(state.breath * 100)}%"></i></span></div>`;
    return `<div class="g-mirror g-ink">${picture(state)}<p class="g-line-say">${t[state.note] ?? ''}</p>${meter}`
      + `${btn(t.breathe, `data-g-hold="1"`, 'main', `g-hold${state.out ? ' is-held' : ''}`)}</div>`;
  }

  const stuck = (s) => s.flares >= 3;
  return { meta, newGame, act, tick, html, stuck };
}
