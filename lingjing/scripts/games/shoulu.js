// shoulu.js — 守炉: tower defense, the 游戏厅's main game (Hanli 10-20: 「塔防这个好玩, 可以作为主力游戏」).
// 小满 lays talismans by the road — 剑阵 · 火符 · 寒符 · 雷符 — and 银月 is the hero: tap her, then a place,
// and she runs there, holds two ground beasts and bites, and howls to stun a crowd. Waves come on a
// countdown, never by a tap; calling one early pays 灵石 for the seconds left. Each level opens with
// its lead-in, brings one new thing, and is harder than the last.
//
// Split as: shoulu/core.js (the engine, pure and seeded, with the headless balance sim), shoulu/draw.js
// (the canvas), shoulu/shoulu.css, and this module — the small-game contract (games/mount.js) and a
// minimal shell (HUD, build menu, level select, result card) until the shared small-game shell lands:
//
//   mount(container, { lang, data, signal }) → Promise<{ won, stars?, left? }>
//
// The levels: `data.levels` (a story's), else the `shoulu` row of worlds/jiuding/games.json. The level
// to open: `data.lv` (1…), else the page's `?lv=` (the 游戏厅: ?dev=1&game=shoulu&lv=3) — straight into it,
// settling { won, stars } when it is won (the game stays up, its own card over it). Without one: the level
// select, and the game owns 再来 / 下一关; it settles only when taken down. Stars live in this browser's
// localStorage (`lingjing.shoulu.stars`), never the save.
import { BEASTS, EARLY_RATE, H, HERO, TOWERS, TORDER, W, build, callWave, canBuild, cleared, locked, newGame, refund, sell, sendHero,
  starsOf, step, upgrade, upgradeCost, waves } from './shoulu/core.js';
import { beastIcon, draw, makePaper, markEvent, stepFx } from './shoulu/draw.js';

export const meta = {
  id: 'shoulu',
  name: { zh: '守炉', en: 'Guard the Furnace' },
  how: {
    zh: '点虚线圈布符，点符升级或拆。点银月，再点一处，调她迎敌。兽潮按时自来，守到最后一波。',
    en: 'Tap a dashed ring to lay a talisman; tap one to upgrade or remove it. Tap Yinyue, then a place, to send her. The waves come on their own: hold to the last.',
  },
};

const T = {
  zh: {
    fire: '炉火', stone: '灵石', wave: '波', first: '第一波', next: '下一波', sec: '秒', early: '提前',
    coming: (n) => `第${n}波来袭中…`, last: '最后一波', holdLast: '守住最后一波', won: '丹成', lost: '丹毁',
    banner: (n, last) => (last ? '最后一波' : `第${CN[n - 1] ?? n}波`), speed: '×', pause: '暂停', resume: '继续', again: '再来', pick: '选关',
    nextLevel: '下一关', build: '布符', tap: '点选', full: '已满', upg: '升级', sellFor: '拆', lv: ['一重', '二重', '三重'], nextLv: '下一重', maxed: '已至三重',
    dmg: '伤', range: '距', slow: '减速', unlockAt: (w) => `第${CN[w - 1]}波解锁`, poor: '灵石不足', lockedMsg: (w) => `第${CN[w - 1]}波方解锁`,
    hint: '点银月，再点一处，调她迎敌', earlyPaid: (n) => `提前召唤 +${n} 灵石`, unlocked: (t) => `${TN.zh[t]}已解锁`,
    heroDown: (s) => `银月负伤退下，${s}息后归来`, heroUp: (l) => `银月 · ${['', '二重', '三重'][l]}`, cry: '合窳啼哭——护体灵光薄了，快打！',
    wonLine: (hp) => `炉火余 ${hp} / 10`, lostLine: (w, x) => `炉火熄灭于第 ${w} 波。已守 ${x} 息。`, select: '守炉 · 选关', newThing: '新',
    lastWave: '已是最后一波 · 守住即成', waveN: (n) => `第${n}波：`, xi: '息', paused: '暂 停',
    says: { back: '回来了。', grow: '月华更盛了。', howl: '嗷呜——！', cry: '啼哭中', paused: '暂 停' },
  },
  en: {
    fire: 'Fire', stone: 'Stones', wave: 'wave', first: 'Wave 1', next: 'Next wave', sec: 's', early: 'early',
    coming: (n) => `Wave ${n} coming…`, last: 'Last wave', holdLast: 'Hold the last wave', won: 'The pill is done', lost: 'The fire is out',
    banner: (n, last) => (last ? 'Last wave' : `Wave ${n}`), speed: '×', pause: 'Pause', resume: 'Go on', again: 'Again', pick: 'Levels',
    nextLevel: 'Next level', build: 'Talisman', tap: 'pick one', full: 'Max', upg: 'Upgrade', sellFor: 'Remove', lv: ['I', 'II', 'III'], nextLv: 'Next', maxed: 'At III',
    dmg: 'dmg', range: 'range', slow: 'slow', unlockAt: (w) => `opens wave ${w}`, poor: 'Not enough stones', lockedMsg: (w) => `Opens on wave ${w}`,
    hint: 'Tap Yinyue, then a place, to send her', earlyPaid: (n) => `Called early: +${n} stones`, unlocked: (t) => `${TN.en[t]} unlocked`,
    heroDown: (s) => `Yinyue is hurt; back in ${s}s`, heroUp: (l) => `Yinyue · ${['', 'II', 'III'][l]}`, cry: 'The heyu wails: its shield thins. Strike now!',
    wonLine: (hp) => `Fire left: ${hp} / 10`, lostLine: (w, x) => `The fire went out on wave ${w}, ${x} breaths held.`, select: 'Guard the Furnace · levels', newThing: 'new',
    lastWave: 'The last wave: hold it', waveN: (n) => `Wave ${n}:`, xi: 'breaths', paused: 'Paused',
    says: { back: 'Back.', grow: 'The moon grows in me.', howl: 'Awooo—!', cry: 'wailing', paused: 'Paused' },
  },
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

/** The level a link or a story asks for: 1… (none: 0, the level select). */
export function levelAsked(data, search) {
  const n = Number(data?.lv ?? new URLSearchParams(search ?? '').get('lv'));
  return Number.isInteger(n) && n > 0 ? n : 0;
}
/** The levels: a story's own, else the registry's `shoulu` row. */
export async function levelsOf(data) {
  if (Array.isArray(data?.levels) && data.levels.length) return data.levels;
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return (await res.json()).games.find((g) => g.id === meta.id)?.levels ?? [];
}
function ensureCss(doc) {
  if (doc.getElementById('g-shoulu-css')) return;
  const l = doc.createElement('link');
  l.id = 'g-shoulu-css'; l.rel = 'stylesheet'; l.href = new URL('./shoulu/shoulu.css', import.meta.url).href;
  doc.head.appendChild(l);
}
const word = (o, lang) => o?.[lang] ?? o?.zh ?? '';

export async function mount(container, { lang = 'zh', data = {}, signal } = {}) {
  lang = lang === 'en' ? 'en' : 'zh';
  const t = T[lang], doc = container.ownerDocument, win = doc.defaultView;
  ensureCss(doc);
  const levels = await levelsOf(data).catch(() => []);
  const asked = levelAsked(data, win?.location?.search);
  const root = doc.createElement('div');
  root.className = 'g-shoulu';
  root.innerHTML = `<div class="sl-hud"><span class="sl-stat sl-fire">${t.fire} <b data-k="hp">10</b></span><span class="sl-stat sl-stone">${t.stone} <b data-k="money">0</b></span>`
    + `<span class="sl-stat"><b data-k="wave">0</b>/<span data-k="waves">0</span> ${t.wave}</span><span class="sl-place" data-k="place"></span></div>`
    + `<div class="sl-stage"><canvas></canvas><div class="sl-menu" hidden></div><div class="sl-toast"></div><div class="sl-saga"><span></span></div><div class="sl-over" hidden><div class="sl-card"></div></div></div>`
    + `<div class="sl-preview"></div><div class="sl-controls"><button type="button" class="sl-main" data-a="next"></button><button type="button" data-a="speed">×1</button>`
    + `<button type="button" data-a="pause">${t.pause}</button><button type="button" data-a="pick">${t.pick}</button></div>`;
  container.replaceChildren(root);
  const $ = (s) => root.querySelector(s), cv = $('canvas'), ctx = cv.getContext('2d'), stage = $('.sl-stage'), menu = $('.sl-menu'), over = $('.sl-over'), card = $('.sl-card');
  const icons = {};
  const iconOf = (type) => (icons[type] ??= beastIcon(doc, type));
  let g = null, li = -1, paper = null, speed = 1, paused = false, heroSel = false, sel = -1, raf = 0, last = 0, acc = 0, shown = false, sc = 1, dpr = 1, previewKey = '';
  let AC = null;
  const sagaQ = [], toastQ = [];
  let sagaT = 0, toastT = 0;

  return new Promise((resolve) => {
    let done = false;
    const off = [];
    const on = (el, type, fn, o) => { el?.addEventListener(type, fn, o); off.push(() => el?.removeEventListener(type, fn, o)); };
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { win?.cancelAnimationFrame(raf); off.forEach((f) => f()); finish({ won: false, left: true }); };
    if (signal?.aborted) { leave(); return; }
    signal?.addEventListener('abort', leave, { once: true });
    if (!levels.length) { stage.textContent = lang === 'en' ? 'No levels.' : '没有关卡。'; return; }

    const blip = (f, d, type = 'sine', vol = 0.04) => {
      try { if (!AC) return; const o = AC.createOscillator(), gn = AC.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = vol; gn.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d); o.connect(gn).connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch { /* no audio */ }
    };
    let lastKill = 0;
    const SOUNDS = { build: () => blip(520, 0.12, 'triangle', 0.05), hit: () => blip(110, 0.35, 'sawtooth', 0.07), bite: () => blip(260, 0.05, 'square', 0.018),
      wave: () => { blip(330, 0.25, 'triangle', 0.05); setTimeout(() => blip(440, 0.3, 'triangle', 0.05), 120); },
      howl: () => { blip(420, 0.5, 'sine', 0.05); setTimeout(() => blip(640, 0.6, 'sine', 0.04), 140); } };
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

    function fit() {
      const wrapW = root.clientWidth || 360;
      const top = stage.getBoundingClientRect().top + (win.scrollY || 0);
      const below = Math.max(24, $('.sl-preview').offsetHeight) + $('.sl-controls').offsetHeight + 34;
      const availH = Math.max(320, (win.innerHeight || 800) - top - below);
      const w = Math.floor(Math.max(260, Math.min(wrapW, availH * W / H))), h = Math.floor(w * H / W);
      dpr = Math.min(2, win.devicePixelRatio || 1);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      stage.style.width = `${w}px`; stage.style.height = `${h}px`; sc = w / W;
      if (sel >= 0) openMenu(sel);
    }
    on(win, 'resize', fit);

    function start(i) {
      li = i;
      const row = levels[i];
      root.classList.remove('is-picking');
      g = newGame(row, { seed: `shoulu|${Date.now()}` });
      paper = makePaper(doc, g.L, word(row.name, lang).split(' · ')[0]);
      paused = false; heroSel = false; shown = false; acc = 0; previewKey = '';
      $('[data-a="pause"]').textContent = t.pause;
      closeMenu(); over.hidden = true; toastQ.length = 0;
      $('[data-k="place"]').textContent = word(row.name, lang);
      $('[data-k="waves"]').textContent = String(waves(g));
      saga(row.lead ?? []);
      toast(t.hint);
      fit();
    }
    function pickLevels() {
      const stars = loadStars();
      g = null; closeMenu(); root.classList.add('is-picking');
      card.innerHTML = `<h3>${t.select}</h3><div class="sl-levels">${levels.map((l, i) => {
        const s = stars[l.id] ?? 0, nw = [l.new?.beast && BN[lang][l.new.beast], l.new?.tower && TN[lang][l.new.tower]].filter(Boolean).join(' · ');
        return `<button type="button" class="sl-level" data-lv="${i}"><span>${i + 1}</span><b>${word(l.name, lang)}<br><small>${t.newThing}：${nw}</small></b><em>${'★'.repeat(s)}${'☆'.repeat(3 - s)}</em></button>`;
      }).join('')}</div>`;
      over.hidden = false;
    }
    on(card, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      wake();
      if (b.dataset.lv) start(Number(b.dataset.lv));
      else if (b.dataset.a === 'again') start(li);
      else if (b.dataset.a === 'nextlv') start(li + 1);
      else if (b.dataset.a === 'pick') pickLevels();
    });
    function showOver() {
      shown = true; closeMenu();
      const win_ = g.over === 'win', st = win_ ? starsOf(g.hp) : 0, row = levels[li];
      if (win_) keepStars(row.id, st);
      const more = li + 1 < levels.length;
      card.innerHTML = win_
        ? `<h3>${t.won}</h3><div class="sl-stars">${'★'.repeat(st)}<s>${'★'.repeat(3 - st)}</s></div><p>${t.wonLine(g.hp)}</p>`
          + `<div class="sl-row">${more ? `<button type="button" class="sl-main" data-a="nextlv">${t.nextLevel}</button>` : ''}<button type="button" data-a="again">${t.again}</button><button type="button" data-a="pick">${t.pick}</button></div>`
        : `<h3>${t.lost}</h3><p>${t.lostLine(g.wave, Math.round(49 * cleared(g) / waves(g)))}</p><div class="sl-row"><button type="button" class="sl-main" data-a="again">${t.again}</button><button type="button" data-a="pick">${t.pick}</button></div>`;
      over.hidden = false;
      if (win_ && asked === li + 1) finish({ won: true, stars: st });
    }

    // ── the board's taps: 银月 (tap her, then a place), a spot (its menu) ──
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc }; };
    on(cv, 'pointerdown', (e) => {
      wake();
      if (!g || g.over) return;
      const p = toWorld(e), h = g.hero;
      if (!h.dead && Math.hypot(p.x - h.x, p.y - (h.y - 6)) < 30) { heroSel = !heroSel; closeMenu(); return; }
      if (heroSel) { heroSel = false; sendHero(g, p.x, p.y); g.fx.push({ k: 'mark', x: h.tx, y: h.ty, life: 0.6, max: 0.6 }); return; }
      let hit = -1, bd = 34 * 34;
      g.L.spots.forEach(([x, y], i) => { const dx = p.x - x, dy = p.y - (g.towers[i] ? y - 12 : y), d = dx * dx + dy * dy; if (d < bd) { bd = d; hit = i; } });
      if (hit >= 0 && hit !== sel) { sel = hit; openMenu(hit); } else closeMenu();
    });
    function closeMenu() { sel = -1; menu.hidden = true; menu.innerHTML = ''; }
    function openMenu(i) {
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
      if (!b || sel < 0 || !g) return;
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
      if (a === 'next' && g) { sagaQ.length = 0; sagaT = 0; callWave(g, true); }
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
    }
    function frame(now) {
      if (done) return;
      raf = win.requestAnimationFrame(frame);
      const rdt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!g) return;
      const run = !paused && !g.over;
      if (run) { acc += rdt * speed; let n = 0; while (acc >= 1 / 60 && n < 12) { step(g, 1 / 60); acc -= 1 / 60; n += 1; } if (n >= 12) acc = 0; }
      stepFx(g, run ? rdt * speed : g.over ? rdt : 0);
      if (g.hero.dead > 0) heroSel = false;
      for (const e of g.events) onEvent(e);
      g.events.length = 0;
      pump(rdt);
      draw(ctx, g, { paper, sc, dpr, t: now / 1000, heroSel, sel, paused, lang, says: t.says, bossName: BN[lang].heyu });
      hud();
      if (g.over && !shown) showOver();
    }
    // The page's hooks for a live check: the game now, and the hero's place.
    root.__shoulu = () => g;
    fit();
    if (asked && asked <= levels.length) start(asked - 1); else pickLevels();
    last = performance.now();
    raf = win.requestAnimationFrame(frame);
  });
}

// Re-exported for the tests and a later shell: the level-free numbers.
export { BEASTS, HERO, TOWERS };
