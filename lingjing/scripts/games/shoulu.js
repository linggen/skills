// shoulu.js — 守炉: tower defense, the 游戏厅's main game (Hanli 10-20: 「塔防这个好玩, 可以作为主力游戏」).
// 小满 lays talismans by the road — 剑阵 · 火符 · 寒符 · 雷符 — and 银月 is the hero, played as in 魔兽争霸 III:
// select her (click, 1 / F1, her portrait), right-click the ground to move her (her guard post) or a beast to attack it,
// shift to queue; on the phone tap her, then tap. Her skills: Q 啸月 · W 月影扑 · E 狐火 · R 狐毛. Waves come on a
// countdown, never by a tap; calling one early pays 灵石 for the seconds left. Each level opens with
// its lead-in, brings one new thing, and is harder than the last.
//
// Split as: shoulu/core.js (the engine, pure and seeded, with the headless balance sim), shoulu/draw.js
// (the canvas), shoulu/shoulu.css, and this module — the small-game contract (games/mount.js) with the play's own
// HUD, build menu, hero bar and level select:
//
//   mount(container, { lang, data, signal, reducedMotion, shell }) → Promise<{ won, stars?, left? }>
//
// In the one shell (games/shell.js, `shell`; Hanli 10-20: 「确保所有小游戏一套外壳」): a level's story lines (its lead
// up to the 兽潮来袭 banner) are the shell's lead card, read on the drawn board before its clock starts; the banner,
// the tips after it and the first wave's countdown stay on the board. The pause is the shell's (it stops the clock,
// the beasts, 银月's orders, the talismans and the countdown), and the result is the shell's: a level settles
// { won, stars } won or lost, and 再来 deals it again (back to the level select when no level was asked).
// Without a shell, as before:
//
// The levels: `data.levels` (a story's), else the `shoulu` row of worlds/jiuding/games.json. A level with a
// `story` (its scene) is a story level, played once at its 回 (Hanli 10-20: 守炉 is the main game; each 回 from
// 古四 on gets one new level at its climax): never on the 游戏厅's ladder (the select, `lv=<n>`, 下一关), opened
// by its id — the story task's `deal.lv`, or `?lv=<id>`. A level with a `realm` (the 秘境's short 守炉, 10-20) stands
// off the ladder the same way, dealt by the 秘境's board as it climbs (rules/climb.mjs). The level to open: `data.lv` (1… on the ladder, or a
// level's id), else the page's `?lv=` (the 游戏厅: ?dev=1&game=shoulu&lv=3) — straight into it, settling
// { won, stars } when it is won (the game stays up, its own card over it). Without one: the level select, and
// the game owns 再来 / 下一关; it settles only when taken down. Stars live in this browser's localStorage
// (`lingjing.shoulu.stars`), never the save.
import { BEASTS, EARLY_RATE, H, HERO, SKEYS, SKILLS, TOWERS, TORDER, W, build, callWave, canBuild, cleared, keepSel, levelsFrom, locked, newGame, noSel,
  pointer, pressKey, pressSkill, refund, sell, skillState, starsOf, step, toggleAuto, upgrade, upgradeCost, waves } from './shoulu/core.js';
import { beastArtReady, beastIcon, draw, loadArt, makePaper, markEvent, portraitStyle, stepFx } from './shoulu/draw.js';

export const meta = {
  id: 'shoulu',
  pause: true, // the shell's bar pauses the play (its own loop reads `shell.onPause`)
  tall: true, // its field plays tall: on a Mac the shell's bar stands beside it (games/shell.js tallOf)
  bot: 'scripts/games/shoulu/core.js', // its human-like hand (`human`, headless): tests/game-shoulu.test.mjs plays every story level with it
  name: { zh: '守炉', en: 'Guard the Furnace' },
  how: {
    zh: '点虚线圈布符，点符升级或拆。选中银月（点她或按 1），右键地面移动、右键野兽攻击；手机上点她再点。QWER 放技能。兽潮按时自来，守到最后一波。',
    en: 'Tap a dashed ring to lay a talisman; tap one to upgrade or remove it. Select Yinyue (click her or press 1), right-click ground to move, a beast to attack; on a phone, tap her, then tap. QWER: her skills. Hold to the last wave.',
  },
};

const T = {
  zh: {
    fire: '炉火', stone: '灵石', wave: '波', first: '第一波', next: '下一波', sec: '秒', early: '提前',
    coming: (n) => `第${n}波来袭中…`, last: '最后一波', holdLast: '守住最后一波', won: '丹成', lost: '丹毁',
    banner: (n, last) => (last ? '最后一波' : `第${CN[n - 1] ?? n}波`), speed: '×', pause: '暂停', resume: '继续', again: '再来', pick: '选关',
    nextLevel: '下一关', build: '布符', tap: '点选', full: '已满', upg: '升级', sellFor: '拆', lv: ['一重', '二重', '三重'], nextLv: '下一重', maxed: '已至三重',
    dmg: '伤', range: '距', slow: '减速', unlockAt: (w) => `第${CN[w - 1]}波解锁`, poor: '灵石不足', lockedMsg: (w) => `第${CN[w - 1]}波方解锁`,
    hint: '选中银月，右键（手机：再点）一处或一兽', earlyPaid: (n) => `提前召唤 +${n} 灵石`, unlocked: (t) => `${TN.zh[t]}已解锁`,
    heroDown: (s) => `银月负伤退下，${s}息后归来`, heroUp: (l) => `银月 · ${['', '二重', '三重'][l]}`, cry: '合窳啼哭——护体灵光薄了，快打！',
    wonLine: (hp) => `炉火余 ${hp} / 10`, lostLine: (w, x) => `炉火熄灭于第 ${w} 波。已守 ${x} 息。`, select: '守炉 · 选关', newThing: '新',
    lastWave: '已是最后一波 · 守住即成', waveN: (n) => `第${n}波：`, xi: '息', paused: '暂 停',
    says: { back: '回来了。', grow: '月华更盛了。', howl: '嗷呜——！', cry: '啼哭中', paused: '暂 停' },
    yinyue: '银月', away: (s) => `${s}息后归来`, autoOn: '自动施放：开', autoOff: '自动施放：关', cooling: '还在冷却', noHair: '没有狐毛了',
    skillAt: (l) => `${['', '二重', '三重'][l]}解锁`, aimAt: (n, touch) => `${n}：点选目标 · ${touch ? '再点按钮取消' : '右键或 Esc 取消'}`,
  },
  en: {
    fire: 'Fire', stone: 'Stones', wave: 'wave', first: 'Wave 1', next: 'Next wave', sec: 's', early: 'early',
    coming: (n) => `Wave ${n} coming…`, last: 'Last wave', holdLast: 'Hold the last wave', won: 'The pill is done', lost: 'The fire is out',
    banner: (n, last) => (last ? 'Last wave' : `Wave ${n}`), speed: '×', pause: 'Pause', resume: 'Go on', again: 'Again', pick: 'Levels',
    nextLevel: 'Next level', build: 'Talisman', tap: 'pick one', full: 'Max', upg: 'Upgrade', sellFor: 'Remove', lv: ['I', 'II', 'III'], nextLv: 'Next', maxed: 'At III',
    dmg: 'dmg', range: 'range', slow: 'slow', unlockAt: (w) => `opens wave ${w}`, poor: 'Not enough stones', lockedMsg: (w) => `Opens on wave ${w}`,
    hint: 'Select Yinyue, then right-click (phone: tap) a place or a beast', earlyPaid: (n) => `Called early: +${n} stones`, unlocked: (t) => `${TN.en[t]} unlocked`,
    heroDown: (s) => `Yinyue is hurt; back in ${s}s`, heroUp: (l) => `Yinyue · ${['', 'II', 'III'][l]}`, cry: 'The heyu wails: its shield thins. Strike now!',
    wonLine: (hp) => `Fire left: ${hp} / 10`, lostLine: (w, x) => `The fire went out on wave ${w}, ${x} breaths held.`, select: 'Guard the Furnace · levels', newThing: 'new',
    lastWave: 'The last wave: hold it', waveN: (n) => `Wave ${n}:`, xi: 'breaths', paused: 'Paused',
    says: { back: 'Back.', grow: 'The moon grows in me.', howl: 'Awooo—!', cry: 'wailing', paused: 'Paused' },
    yinyue: 'Yinyue', away: (s) => `back in ${s}s`, autoOn: 'Autocast on', autoOff: 'Autocast off', cooling: 'Still cooling', noHair: 'No fox hair left',
    skillAt: (l) => `Opens at ${['', 'II', 'III'][l]}`, aimAt: (n, touch) => `${n}: pick a target · ${touch ? 'tap the button again to cancel' : 'right-click or Esc cancels'}`,
  },
};
/** Her skills' names and lines. */
const SK = {
  zh: { q: ['啸月', '震慑身周群兽，自动施放'], w: ['月影扑', '扑向一兽或一处，途中不受伤'], e: ['狐火', '一片蓝火，烧过路的兽'], r: ['狐毛', '破甲、破护体灵光数息'] },
  en: { q: ['Moon Howl', 'stuns all near; autocast'], w: ['Moon Pounce', 'dash to a beast or a place, untouchable'], e: ['Foxfire', 'blue fire that burns what walks through'], r: ['Fox Hair', 'armor and shield off for a while'] },
};
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const TN = { zh: { jian: '剑阵', huo: '火符', han: '寒符', lei: '雷符' }, en: { jian: 'Swords', huo: 'Fire', han: 'Frost', lei: 'Thunder' } };
const TD = {
  zh: { jian: '快·单体·可击飞禽', huo: '慢·溅射·不及飞禽', han: '范围减速', lei: '连锁三跳·可击飞禽' },
  en: { jian: 'fast · one · hits fliers', huo: 'slow · splash · ground only', han: 'slows all near', lei: 'chains thrice · hits fliers' },
};
const BN = { zh: { yezhu: '野猪', zheng: '狰', qiuyu: '犰狳', qique: '鬿雀', heyu: '合窳' }, en: { yezhu: 'Boar', zheng: 'Zheng', qiuyu: 'Qiuyu', qique: 'Qique', heyu: 'Heyu' } };
const INTRO = {
  zh: { zheng: '狰：快，银月拦不住，火符难沾身——寒符冻住它', qiuyu: '犰狳：一身硬甲，剑阵只伤四成', qique: '鬿雀：飞越山道，唯剑阵、雷符可击', heyu: '合窳来了！一蹄入炉，损三点炉火' },
  en: { zheng: 'Zheng: too quick to hold or burn. Frost it.', qiuyu: 'Qiuyu: hard hide; swords do 40%.', qique: 'Qique fly over the road: only swords and thunder reach them.', heyu: 'The heyu! One hoof in the furnace costs 3 fire.' },
};
const STARS_KEY = 'lingjing.shoulu.stars';
const loadStars = () => { try { return JSON.parse(globalThis.localStorage?.getItem(STARS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const keepStars = (id, n) => { try { const s = loadStars(); if ((s[id] ?? 0) < n) { s[id] = n; globalThis.localStorage?.setItem(STARS_KEY, JSON.stringify(s)); } } catch { /* a private window: this page only */ } };

/** The level a link or a story asks for: 1… on the ladder, or a level's id (a story level's); none: 0, the level select. */
export function levelAsked(data, search) {
  const raw = data?.lv ?? new URLSearchParams(search ?? '').get('lv');
  if (typeof raw === 'string' && /^[a-z][a-z0-9-]*$/.test(raw)) return raw;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
/** The 游戏厅's ladder: the levels with no `story`, in the order they climb. */
export const ladderOf = (levels) => levels.filter((l) => !l.story && !l.realm);
/** Where the asked level sits in `levels` (-1: none asked, or none such): an id anywhere, a number on the ladder. */
export function levelAt(levels, asked) {
  if (typeof asked === 'string') return levels.findIndex((l) => l.id === asked);
  const row = asked > 0 ? ladderOf(levels)[asked - 1] : null;
  return row ? levels.indexOf(row) : -1;
}
/** The ladder's next level after `levels[i]` (its 1-based ladder number), or 0: a story level, or the last. */
export function nextLv(levels, i) {
  const ladder = ladderOf(levels), k = ladder.indexOf(levels[i]);
  return k >= 0 && k + 1 < ladder.length ? k + 2 : 0;
}
/** The levels: a story's own, else the registry's `shoulu` row (the one that holds them). */
export async function levelsOf(data) {
  if (Array.isArray(data?.levels) && data.levels.length) return data.levels;
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return levelsFrom((await res.json()).games.find((g) => g.id === meta.id && Array.isArray(g.levels))); // each carries the row's global `difficulty`
}
function ensureCss(doc) {
  if (doc.getElementById('g-shoulu-css')) return;
  const l = doc.createElement('link');
  l.id = 'g-shoulu-css'; l.rel = 'stylesheet'; l.href = new URL('./shoulu/shoulu.css', import.meta.url).href;
  doc.head.appendChild(l);
}
const word = (o, lang) => o?.[lang] ?? o?.zh ?? '';

/** A level's lead split for the shell: its story (the lines before the first `big` banner) read on the lead card,
    and the rest (the banner, the tips) left for the board. */
export function leadSplit(lines, lang = 'zh') {
  const all = Array.isArray(lines) ? lines : [];
  const at = all.findIndex((l) => l?.big);
  const story = at < 0 ? all : all.slice(0, at);
  return { said: story.map((l) => word(l, lang)).filter(Boolean).join(lang === 'en' ? ' ' : ''), rest: at < 0 ? [] : all.slice(at) };
}

export async function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, shell } = {}) {
  lang = lang === 'en' ? 'en' : 'zh';
  const t = T[lang], doc = container.ownerDocument, win = doc.defaultView;
  ensureCss(doc);
  loadArt(doc);
  const levels = await levelsOf(data).catch(() => []);
  const asked = levelAsked(data, win?.location?.search), askedAt = levelAt(levels, asked);
  // a story level plays alone: no level select to wander off to from the story's board
  const solo = Boolean(levels[askedAt]?.story || levels[askedAt]?.realm), pickBtn = solo ? '' : `<button type="button" data-a="pick">${t.pick}</button>`;
  const root = doc.createElement('div');
  root.className = 'g-shoulu';
  root.innerHTML = `<div class="sl-hud"><span class="sl-stat sl-fire">${t.fire} <b data-k="hp">10</b></span><span class="sl-stat sl-stone">${t.stone} <b data-k="money">0</b></span>`
    + `<span class="sl-stat"><b data-k="wave">0</b>/<span data-k="waves">0</span> ${t.wave}</span><span class="sl-place" data-k="place"></span></div>`
    + `<div class="sl-stage"><canvas></canvas><div class="sl-menu" hidden></div><div class="sl-toast"></div><div class="sl-saga"><span></span></div><div class="sl-over" hidden><div class="sl-card"></div></div></div>`
    + `<div class="sl-herobar"><button type="button" class="sl-portrait" data-hero><span class="sl-face"></span><i class="sl-key">1</i>`
    + `<span class="sl-hinfo"><span><b>${t.yinyue}</b> <small data-k="hlv">${t.lv[0]}</small></span><span class="sl-hp"><span></span></span><small data-k="hstate"></small></span></button>`
    + `<div class="sl-skills">${SKEYS.map((k) => `<button type="button" class="sl-skill" data-skill="${k}" title="${SK[lang][k][0]} · ${SK[lang][k][1]}">`
      + `<b>${SK[lang][k][0]}</b><i class="sl-key">${k.toUpperCase()}</i><em class="sl-charges"></em><span class="sl-ring"></span></button>`).join('')}</div></div>`
    + `<div class="sl-preview"></div><div class="sl-controls"><button type="button" class="sl-main" data-a="next"></button><button type="button" data-a="speed">×1</button>`
    + `${shell ? '' : `<button type="button" data-a="pause">${t.pause}</button>`}${pickBtn}</div>`;
  container.replaceChildren(root);
  const $ = (s) => root.querySelector(s), cv = $('canvas'), ctx = cv.getContext('2d'), stage = $('.sl-stage'), menu = $('.sl-menu'), over = $('.sl-over'), card = $('.sl-card');
  const icons = {};
  const iconOf = (type) => (beastArtReady() ? (icons[type] ??= beastIcon(doc, type)) : beastIcon(doc, type));
  // S: the selection (core.js `pointer`): 银月 selected, the skill being aimed; `sel` is the spot whose menu is open (S.spot)
  // held: a level drawn but not started (the shell's lead card is up over it); frozen(): no clock, no orders
  let held = false, leadTok = 0;
  let g = null, li = -1, paper = null, speed = 1, paused = false, S = noSel(), aimAt = null, touchy = false, sel = -1, raf = 0, last = 0, acc = 0, shown = false, sc = 1, dpr = 1, previewKey = '';
  let AC = null;
  const sagaQ = [], toastQ = [];
  let sagaT = 0, toastT = 0;

  return new Promise((resolve) => {
    let done = false;
    const off = [];
    const on = (el, type, fn, o) => { el?.addEventListener(type, fn, o); off.push(() => el?.removeEventListener(type, fn, o)); };
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { win?.cancelAnimationFrame(raf); off.forEach((f) => f()); finish({ won: false, left: true }); };
    // the shell's pause is the play's: the same flag the old button set (its own button is not drawn in the shell)
    if (shell?.onPause) off.push(shell.onPause((on) => { paused = Boolean(on); }));
    if (shell?.paused?.()) paused = true;
    const frozen = () => paused || held;
    if (signal?.aborted) { leave(); return; }
    signal?.addEventListener('abort', leave, { once: true });
    if (!levels.length) { stage.textContent = lang === 'en' ? 'No levels.' : '没有关卡。'; return; }

    const blip = (f, d, type = 'sine', vol = 0.04) => {
      try { if (!AC) return; const o = AC.createOscillator(), gn = AC.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = vol; gn.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d); o.connect(gn).connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch { /* no audio */ }
    };
    let lastKill = 0;
    const SOUNDS = { build: () => blip(520, 0.12, 'triangle', 0.05), hit: () => blip(110, 0.35, 'sawtooth', 0.07), bite: () => blip(260, 0.05, 'square', 0.018),
      wave: () => { blip(330, 0.25, 'triangle', 0.05); setTimeout(() => blip(440, 0.3, 'triangle', 0.05), 120); },
      howl: () => { blip(420, 0.5, 'sine', 0.05); setTimeout(() => blip(640, 0.6, 'sine', 0.04), 140); },
      pounce: () => blip(300, 0.18, 'triangle', 0.05), foxfire: () => { blip(700, 0.3, 'sine', 0.035); setTimeout(() => blip(520, 0.4, 'sine', 0.03), 90); },
      hair: () => { blip(980, 0.25, 'sine', 0.03); setTimeout(() => blip(1240, 0.3, 'sine', 0.025), 110); } };
    const wake = () => { if (!AC) { try { AC = new (win.AudioContext || win.webkitAudioContext)(); } catch { AC = null; } } };

    const saga = (lines) => { sagaQ.length = 0; sagaT = 0; sagaQ.push(...lines); };
    const toast = (s) => toastQ.push(s);
    const pump = (dt) => {
      const sagaEl = $('.sl-saga'), toastEl = $('.sl-toast');
      sagaT -= dt;
      if (sagaT <= 0) {
        if (sagaQ.length) { const l = sagaQ.shift(); sagaEl.firstChild.textContent = word(l, lang) || l.s; sagaEl.classList.toggle('is-big', Boolean(l.big)); sagaEl.classList.add('is-on'); sagaT = l.d ?? (l.big ? 1.8 : 2.8); }
        else sagaEl.classList.remove('is-on');
      }
      toastT -= dt;
      if (toastT <= 0) { if (toastQ.length) { toastEl.textContent = toastQ.shift(); toastEl.classList.add('is-on'); toastT = 2.6; } else toastEl.classList.remove('is-on'); }
    };

    // The field takes the height its page gives it: the window's, or — in a Mac window, inside a box that scrolls
    // itself (the story's stage, #focus) — that box's, so the controls under it are in sight with no scroll (Hanli
    // 10-21). The phone keeps the window's (the breakpoint is shell.css's).
    const scroller = () => {
      if (!win.matchMedia?.('(min-width: 900px)').matches) return null;
      for (let a = root.parentElement; a && a !== doc.body; a = a.parentElement) if (/auto|scroll/.test(win.getComputedStyle(a).overflowY)) return a;
      return null;
    };
    // In that box the field is as tall as it is now plus the room the box has left over — all else in it (the cards
    // over it, the bar, the hero row and controls under it, the card's own edge) stays, whatever its height; the
    // room a centred card is given above it is not counted.
    const roomIn = (box) => {
      const cs = win.getComputedStyle(box), laid = [...box.children].filter((e) => e.getClientRects().length);
      const used = laid.length ? laid.at(-1).getBoundingClientRect().bottom - laid[0].getBoundingClientRect().top : 0;
      return stage.getBoundingClientRect().height + box.clientHeight - used - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    };
    function fit() {
      const wrapW = root.clientWidth || 360, box = scroller();
      const top = stage.getBoundingClientRect().top + (win.scrollY || 0);
      const below = Math.max(24, $('.sl-preview').offsetHeight) + $('.sl-controls').offsetHeight + $('.sl-herobar').offsetHeight + 40;
      const availH = Math.max(320, box ? roomIn(box) : (win.innerHeight || 800) - top - below);
      const w = Math.floor(Math.max(260, Math.min(wrapW, availH * W / H))), h = Math.floor(w * H / W);
      dpr = Math.min(2, win.devicePixelRatio || 1);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      stage.style.width = `${w}px`; stage.style.height = `${h}px`; sc = w / W;
      if (sel >= 0) openMenu(sel);
    }
    on(win, 'resize', fit);
    // …and again when the box itself changes (the chat opened beside the stage) or what shares it grows or goes (a
    // card laid over it after the field was fitted).
    const box = scroller(), Watch = win.ResizeObserver;
    if (box && Watch) {
      let queued = 0;
      const refit = () => { if (!queued) queued = win.requestAnimationFrame(() => { queued = 0; if (root.isConnected) fit(); }); };
      const sized = new Watch(refit), laid = new win.MutationObserver(() => { watch(); refit(); });
      const watch = () => { sized.disconnect(); sized.observe(box); for (const e of box.children) if (!e.contains(root)) sized.observe(e); };
      watch(); laid.observe(box, { childList: true });
      off.push(() => { sized.disconnect(); laid.disconnect(); win.cancelAnimationFrame(queued); });
    }

    function start(i) {
      li = i;
      const row = levels[i];
      root.classList.remove('is-picking');
      g = newGame(row, { seed: `shoulu|${Date.now()}` });
      paper = makePaper(doc, g.L, word(row.name, lang).split(' · ')[0]);
      S = noSel(); aimAt = null; shown = false; acc = 0; previewKey = '';
      if (!shell) { paused = false; $('[data-a="pause"]').textContent = t.pause; }
      closeMenu(); over.hidden = true; toastQ.length = 0;
      $('[data-k="place"]').textContent = word(row.name, lang);
      $('[data-k="waves"]').textContent = String(waves(g));
      fit();
      const { said, rest } = shell?.lead ? leadSplit(row.lead, lang) : { said: '', rest: row.lead ?? [] };
      const go = () => { held = false; saga(rest); toast(t.hint); };
      if (!said) { go(); return; }
      // in the shell: the story read on its lead card over the drawn board; the clock waits for it
      held = true; sagaQ.length = 0; sagaT = 0;
      const tok = ++leadTok;
      shell.lead(said, { auto: 'read', lang, reducedMotion }).then(() => { if (!done && tok === leadTok) go(); });
    }
    function pickLevels() {
      const stars = loadStars();
      g = null; held = false; leadTok += 1; closeMenu(); root.classList.add('is-picking');
      card.innerHTML = `<h3>${t.select}</h3><div class="sl-levels">${ladderOf(levels).map((l, n) => {
        const s = stars[l.id] ?? 0, nw = [l.new?.beast && BN[lang][l.new.beast], l.new?.tower && TN[lang][l.new.tower]].filter(Boolean).join(' · ');
        return `<button type="button" class="sl-level" data-lv="${levels.indexOf(l)}"><span>${n + 1}</span><b>${word(l.name, lang)}<br><small>${t.newThing}：${nw}</small></b><em>${'★'.repeat(s)}${'☆'.repeat(3 - s)}</em></button>`;
      }).join('')}</div>`;
      over.hidden = false;
    }
    on(card, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      wake();
      if (b.dataset.lv) start(Number(b.dataset.lv));
      else if (b.dataset.a === 'again') start(li);
      else if (b.dataset.a === 'nextlv' && nextLv(levels, li)) start(levelAt(levels, nextLv(levels, li)));
      else if (b.dataset.a === 'pick') pickLevels();
    });
    function showOver() {
      shown = true; closeMenu();
      const win_ = g.over === 'win', st = win_ ? starsOf(g.hp) : 0, row = levels[li];
      if (win_) keepStars(row.id, st);
      // in the shell: its foot shows the result and 再来, won or lost; the board stays up under it
      if (shell) { const pk = $('[data-a="pick"]'); if (pk) pk.disabled = true; finish(win_ ? { won: true, stars: st, ...(nextLv(levels, li) ? { next: nextLv(levels, li) } : {}) } : { won: false, stars: 0 }); return; }
      const more = nextLv(levels, li) > 0;
      card.innerHTML = win_
        ? `<h3>${t.won}</h3><div class="sl-stars">${'★'.repeat(st)}<s>${'★'.repeat(3 - st)}</s></div><p>${t.wonLine(g.hp)}</p>`
          + `<div class="sl-row">${more ? `<button type="button" class="sl-main" data-a="nextlv">${t.nextLevel}</button>` : ''}<button type="button" data-a="again">${t.again}</button>${pickBtn}</div>`
        : `<h3>${t.lost}</h3><p>${t.lostLine(g.wave, Math.round(49 * cleared(g) / waves(g)))}</p><div class="sl-row"><button type="button" class="sl-main" data-a="again">${t.again}</button>${pickBtn}</div>`;
      over.hidden = false;
      if (win_ && askedAt === li) finish({ won: true, stars: st });
    }

    // ── the board: 魔兽争霸's mouse on a Mac (left selects, right orders, shift queues), tap-tap on a phone ──
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc }; };
    const refuse = (k) => {
      const st = skillState(g, k), S_ = SKILLS[k];
      if (g.hero.dead > 0) toast(t.heroDown(Math.ceil(g.hero.dead)));
      else if (st.locked) toast(`${SK[lang][k][0]} · ${t.skillAt(S_.unlock)}`);
      else if (S_.charges && st.charges <= 0) toast(t.noHair);
      else toast(`${SK[lang][k][0]} · ${t.cooling}`);
    };
    /** What a click, a tap or a key did (core.js decides; the page shows it). */
    function apply(r, p, k) {
      S = r.sel;
      if (r.did === 'spot') openMenu(r.spot); else if (S.spot < 0 && sel >= 0) closeMenu();
      if ((r.did === 'move' || r.did === 'attack') && p) g.fx.push({ k: 'mark', x: p.x, y: p.y, life: 0.6, max: 0.6 });
      if (r.did === 'no' && k) refuse(k);
      if (r.did === 'aim') toast(t.aimAt(SK[lang][S.aim][0], touchy));
      if (r.did === 'centre') centre();
      cv.style.cursor = S.aim ? 'crosshair' : '';
    }
    function centre() {
      stage.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      g.fx.push({ k: 'ping', x: g.hero.x, y: g.hero.y, life: 0.7, max: 0.7 });
    }
    on(stage, 'contextmenu', (e) => e.preventDefault());
    on(cv, 'pointermove', (e) => { aimAt = toWorld(e); });
    on(cv, 'pointerdown', (e) => {
      wake();
      if (!g || g.over || frozen()) return;
      const right = e.button === 2 || (e.button === 0 && e.ctrlKey); // a Mac's ctrl-click is a right-click
      if (e.button !== 0 && e.button !== 2) return;
      const p = toWorld(e), aimed = S.aim;
      touchy = e.pointerType !== 'mouse';
      aimAt = p;
      apply(pointer(g, { ...S, spot: sel }, { ...p, button: right ? 2 : 0, shift: e.shiftKey, touch: e.pointerType !== 'mouse' }), p, aimed);
    });
    on(doc, 'keydown', (e) => {
      if (!g || g.over || done || frozen() || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''))) return;
      // by the key's place, so a Chinese input layout still finds Q W E R and 1
      const k = /^Key[QWER]$/.test(e.code) ? e.code[3].toLowerCase() : e.code === 'Digit1' ? '1' : e.key === 'Esc' ? 'Escape' : e.key;
      if (!['q', 'w', 'e', 'r', '1', 'F1', 'Escape'].includes(k)) return;
      e.preventDefault();
      if (k === 'Escape' && !S.hero && sel < 0 && !S.aim) return;
      apply(pressKey(g, { ...S, spot: sel }, k, performance.now() / 1000), null, k);
    });
    const bar = $('.sl-herobar');
    let touchAt = -1e9; // a phone's long press also fires contextmenu: let the press timer alone toggle
    on(bar, 'contextmenu', (e) => {
      e.preventDefault();
      if (performance.now() - touchAt < 1500) return;
      const k = e.target.closest('[data-skill]')?.dataset.skill;
      if (g && k && !frozen() && toggleAuto(g, k)) toast(`${SK[lang][k][0]} · ${g.hero.auto[k] ? t.autoOn : t.autoOff}`);
    });
    // a long press on a skill toggles its autocast on a phone, as the right-click does on a Mac (Hanli 10-20)
    let press = null, pressed = false;
    on(bar, 'pointerdown', (e) => {
      const k = e.target.closest('[data-skill]')?.dataset.skill;
      if (!k || e.pointerType === 'mouse') return;
      touchAt = performance.now();
      clearTimeout(press);
      press = setTimeout(() => {
        press = null;
        if (g && !frozen() && toggleAuto(g, k)) { pressed = true; toast(`${SK[lang][k][0]} · ${g.hero.auto[k] ? t.autoOn : t.autoOff}`); }
      }, 500);
    });
    const unpress = () => { clearTimeout(press); press = null; };
    on(bar, 'pointerup', unpress);
    on(bar, 'pointercancel', unpress);
    on(bar, 'pointerleave', unpress);
    on(bar, 'click', (e) => {
      wake();
      if (pressed) { pressed = false; return; } // the long press's own click
      if (!g || g.over || frozen()) return;
      if (e.target.closest('[data-hero]')) { apply(pressKey(g, { ...S, spot: sel }, '1', performance.now() / 1000)); return; }
      const k = e.target.closest('[data-skill]')?.dataset.skill;
      if (!k) return;
      touchy = e.pointerType ? e.pointerType !== 'mouse' : touchy;
      if (S.aim === k) { apply({ sel: { ...S, aim: null }, did: 'cancel' }); return; } // its button again: put it away
      apply(pressSkill(g, { ...S, spot: sel }, k), null, k);
    });
    on(bar, 'dblclick', (e) => { if (g && !frozen() && e.target.closest('[data-hero]') && g.hero.dead <= 0) { S = { ...S, hero: true }; centre(); } });
    function closeMenu() { sel = -1; S = { ...S, spot: -1 }; menu.hidden = true; menu.innerHTML = ''; }
    function openMenu(i) {
      sel = i; S = { ...S, spot: i, hero: false };
      const tw = g.towers[i];
      if (!tw) {
        menu.innerHTML = `<h4>${t.build}<span>${t.tap}</span></h4><div class="sl-grid">${TORDER.filter((k) => g.L.towers.includes(k)).map((k) => {
          const D = TOWERS[k], at = g.L.unlock[k];
          return `<button type="button" class="sl-opt" data-build="${k}"><b style="color:${D.color}">${D.glyph} ${TN[lang][k]}</b><i>${D.cost[0]} ${t.stone}</i>`
            + `<small>${at ? `<span data-lock>${t.unlockAt(at)} · </span>` : ''}${TD[lang][k]}</small></button>`;
        }).join('')}</div>`;
      } else {
        const D = TOWERS[tw.type], L = tw.lvl;
        const nx = L < 2 ? `${t.nextLv}: ${t.dmg} ${D.dmg[L + 1]}${D.slow ? `, ${t.slow} ${Math.round(D.slow[L + 1] * 100)}%` : ''}, ${t.range} ${D.range[L + 1]}` : t.maxed;
        menu.innerHTML = `<h4>${TN[lang][tw.type]} · ${t.lv[L]}<span>${t.dmg} ${D.dmg[L]} · ${t.range} ${D.range[L]}</span></h4><div class="sl-info">${TD[lang][tw.type]}<br>${nx}</div>`
          + `<div class="sl-row"><button type="button" data-up>${L < 2 ? `${t.upg} ${D.cost[L + 1]}` : t.full}</button><button type="button" data-sell>${t.sellFor} +${refund(tw)}</button></div>`;
      }
      menu.hidden = false;
      const [x, y] = g.L.spots[i], sx = x * sc, sy = y * sc, mw = menu.offsetWidth, mh = menu.offsetHeight, sw = stage.clientWidth, sh = stage.clientHeight;
      let top = sy - mh - 30 * sc;
      if (top < 4) top = sy + 30 * sc;
      if (top + mh > sh - 4) top = Math.max(4, sh - mh - 4);
      menu.style.left = `${Math.max(4, Math.min(sw - mw - 4, sx - mw / 2))}px`; menu.style.top = `${top}px`;
      refreshMenu();
    }
    function refreshMenu() {
      if (sel < 0 || !g) return;
      const tw = g.towers[sel];
      if (!tw) {
        for (const b of menu.querySelectorAll('[data-build]')) {
          const k = b.dataset.build, lk = b.querySelector('[data-lock]'), isLocked = locked(g, k);
          b.classList.toggle('is-off', isLocked || g.money < TOWERS[k].cost[0]);
          if (lk) lk.hidden = !isLocked;
        }
      } else { const up = menu.querySelector('[data-up]'); if (up) up.disabled = tw.lvl >= 2 || g.money < upgradeCost(tw); }
    }
    on(menu, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b || sel < 0 || !g || frozen()) return;
      const i = sel;
      if (b.dataset.build) {
        const k = b.dataset.build;
        if (build(g, i, k)) closeMenu();
        else if (!canBuild(g, i, k)) toast(locked(g, k) ? t.lockedMsg(g.L.unlock[k]) : t.poor);
      } else if (b.hasAttribute('data-up')) { if (upgrade(g, i)) openMenu(i); }
      else if (b.hasAttribute('data-sell')) { sell(g, i); closeMenu(); }
    });
    on($('.sl-controls'), 'click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      wake();
      if (a === 'next' && g && !frozen()) { sagaQ.length = 0; sagaT = 0; callWave(g, true); }
      else if (a === 'speed') { speed = speed === 1 ? 2 : 1; e.target.closest('button').textContent = `×${speed}`; }
      else if (a === 'pause' && g) { paused = !paused; e.target.closest('button').textContent = paused ? t.resume : t.pause; }
      else if (a === 'pick') pickLevels();
    });

    function onEvent(e) {
      if (e.sound === 'kill' || e.kill) { const n = performance.now(); if (n - lastKill > 70) { lastKill = n; blip(760 + Math.random() * 120, 0.06, 'sine', 0.025); } }
      if (e.sound && SOUNDS[e.sound]) SOUNDS[e.sound]();
      if (e.banner) saga([{ zh: t.banner(e.banner, e.banner === waves(g)), en: t.banner(e.banner, e.banner === waves(g)), big: true, d: 1.6 }]);
      if (e.intro && INTRO[lang][e.intro]) toast(INTRO[lang][e.intro]);
      if (e.unlocked) toast(t.unlocked(e.unlocked));
      if (e.early) toast(t.earlyPaid(e.early));
      if (e.heroDown) toast(t.heroDown(e.heroDown));
      if (e.heroUp) toast(t.heroUp(e.heroUp));
      if (e.cry) toast(t.cry);
      markEvent(g, e);
    }
    function hud() {
      $('[data-k="hp"]').textContent = String(g.hp);
      $('[data-k="money"]').textContent = String(g.money);
      $('[data-k="wave"]').textContent = String(g.wave);
      const nb = $('[data-a="next"]'), n = waves(g);
      if (g.over) { nb.disabled = true; nb.textContent = g.over === 'win' ? t.won : t.lost; }
      else if (g.wave >= n) { nb.disabled = true; nb.textContent = g.queue.length ? t.last : t.holdLast; }
      else if (g.queue.length) { nb.disabled = true; nb.textContent = t.coming(g.wave); }
      else { nb.disabled = false; nb.textContent = `${g.wave === 0 ? t.first : t.next} · ${Math.ceil(g.nextTimer)}${t.sec} (${t.early} +${Math.round(g.nextTimer * EARLY_RATE)})`; }
      const nw = g.wave < n && !g.over ? g.L.waves[g.wave] : null, key = `${li}:${nw ? g.wave : 'x'}`;
      if (key !== previewKey) {
        previewKey = key;
        const pv = $('.sl-preview');
        if (nw) {
          const cnt = {};
          for (const [ty, c] of nw) cnt[ty] = (cnt[ty] || 0) + c;
          pv.innerHTML = `<span>${t.waveN(g.wave + 1)}</span>${Object.keys(cnt).map((ty) => `<span class="sl-chip"><img src="${iconOf(ty)}" alt="">${BN[lang][ty]}×${cnt[ty]}</span>`).join('')}`;
        } else pv.innerHTML = g.over ? '' : `<span>${t.lastWave}</span>`;
      }
      refreshMenu();
      heroPanel();
    }
    // the hero panel: her face, 重, HP; the skill bar (cooldown rings, locks, autocast, 狐毛's charges)
    const panel = { face: false, hp: $('.sl-hp span'), lv: $('[data-k="hlv"]'), st: $('[data-k="hstate"]'), port: $('.sl-portrait'),
      sk: Object.fromEntries(SKEYS.map((k) => [k, bar.querySelector(`[data-skill="${k}"]`)])) };
    function heroPanel() {
      const h = g.hero;
      if (!panel.face) { const st = portraitStyle(44); if (st) { Object.assign($('.sl-face').style, st); panel.face = true; } }
      panel.hp.style.width = `${Math.max(0, h.hp / HERO.hp[h.lvl]) * 100}%`;
      panel.lv.textContent = t.lv[h.lvl];
      panel.st.textContent = h.dead > 0 ? t.away(Math.ceil(h.dead)) : `${Math.ceil(h.hp)} / ${HERO.hp[h.lvl]}`;
      panel.port.classList.toggle('is-on', S.hero);
      panel.port.classList.toggle('is-away', h.dead > 0);
      for (const k of SKEYS) {
        const st = skillState(g, k), b = panel.sk[k], S_ = SKILLS[k];
        b.classList.toggle('is-locked', Boolean(st.locked || (S_.charges && st.charges <= 0)));
        b.classList.toggle('is-ready', st.ready);
        b.classList.toggle('is-auto', st.auto);
        b.classList.toggle('is-aim', S.aim === k);
        b.style.setProperty('--cd', st.cd > 0 ? (st.cd / st.max).toFixed(3) : '0');
        const ch = b.querySelector('.sl-charges'), txt = S_.charges ? `×${st.charges}` : st.locked ? t.lv[S_.unlock] : '';
        if (ch.textContent !== txt) ch.textContent = txt;
      }
    }
    function frame(now) {
      if (done) return;
      raf = win.requestAnimationFrame(frame);
      const rdt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!g) return;
      const run = !frozen() && !g.over;
      if (run) { acc += rdt * speed; let n = 0; while (acc >= 1 / 60 && n < 12) { step(g, 1 / 60); acc -= 1 / 60; n += 1; } if (n >= 12) acc = 0; }
      stepFx(g, run ? rdt * speed : g.over ? rdt : 0);
      const was = S;
      S = keepSel(g, S); // she is away: not selected (nor reselected when she is back)
      if (S !== was) cv.style.cursor = '';
      for (const e of g.events) onEvent(e);
      g.events.length = 0;
      if (!frozen()) pump(rdt); // the banner and tips wait under the lead card and the pause
      draw(ctx, g, { paper, sc, dpr, t: now / 1000, heroSel: S.hero, sel, aim: S.aim ? { key: S.aim, x: aimAt?.x, y: aimAt?.y } : null, paused: !shell && paused, lang, says: t.says, bossName: BN[lang].heyu });
      hud();
      if (g.over && !shown) showOver();
    }
    // The page's hooks for a live check: the game now, and the hero's place.
    root.__shoulu = () => g;
    fit();
    if (askedAt >= 0) start(askedAt); else pickLevels();
    last = performance.now();
    raf = win.requestAnimationFrame(frame);
  });
}

// Re-exported for the tests and a later shell: the level-free numbers.
export { BEASTS, HERO, SKILLS, TOWERS };
