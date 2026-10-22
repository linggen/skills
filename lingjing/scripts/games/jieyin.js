// jieyin.js — 结印 (hand seals), a prototype in the 游戏厅 (Hanli 2026-10-21: 「做一个测试一下, 好玩的话, 可以在守墙里面,
// 让用户结印发火弹帮忙打怪」). The player makes seals at the camera; four in order cast a 火蛋 at the boar — on a phone
// 推掌 · 剑诀 · 申文 · 午文, on a Mac 双掌 · 双剑 · 申文 · 离火印 (two hands, each step also taken by its one-hand seal — judge.also; levels/jieyin.json `moves`) — three eggs drive it off. A wrong seal held = 走火: a charred egg and a puff, back to the first seal.
// The second level is 古六's 讲堂 teaching level (one seal at a time, 褚先生's line for each, then the four once at a
// straw dummy): in the story it is wm-qianye's board where a camera is (h08 `qianye-qiajue`'s `alt`, caps.js).
//
// The parts any other game can take (守墙关's helper later): games/jieyin/eye.js (camera + the vendored MediaPipe
// model, all on the device), judge.js (seal rules, data in worlds/jiuding/levels/jieyin.json), sequence.js (holds,
// order, 走火), pose.js (each seal's hand icon). No camera, no permission, no WebGL, or the model fails → 结印 is not
// offered: here one line says it needs a camera and the game leaves (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打」).
//
// The camera is asked for only on 开始, and stopped (its tracks) the moment the game pauses, ends or is left, or the
// page is hidden.
// Contract (games/mount.js): mount(container, { lang, data, signal, shell }) → Promise<{ won, stars } | { won: false, left: true }>
// A story board played this way where another stands behind it (`data.instead`: that board's title — caps.js, 古六's
// 讲堂; Hanli 10-21: 「用户结印失败, 或者不愿意使用摄像头…也能正常完成, 不会影响剧情推进」) never dead-ends: no camera,
// a camera refused or failing → `{ won: false, left: true, unable: 'camera' }` at once (no 'needs a camera' line); a
// few seals missed (`swapAfter`, default 3) → a 「改用…」 button → `{ won: false, left: true, instead: true }`. The page
// then deals the other board, same task and pay.
// Which seals: games/jieyin/sets.js — a phone (coarse pointer, small) only one-hand seals, a Mac both; `?dev=1&hands=1|2` picks.
// Dev only: `?dev=1&feed=1` runs without a camera, hands fed from the console (`window.jieyinFeed(hands, picture?)`) — the
// live check's way to play it through; never a player's.
import { available, dropModel, loadModel, openEye } from './jieyin/eye.js';
import { handsOf, sealOf } from './jieyin/judge.js';
import { bonusOf, eyeFor, sealsFor, sequenceFor, setOf } from './jieyin/sets.js';
import { expected, fits, progress, start, starsOf, step } from './jieyin/sequence.js';
import { iconSvg } from './jieyin/pose.js';
import { facingLine, handHint } from './jieyin/hint.js';

export const meta = {
  id: 'jieyin',
  pause: true, // the shell's pause stops the camera
  camera: true,
  name: { zh: '结印', en: 'Hand seals' },
  how: {
    zh: '对着摄像头结印：每个印稳住一下才算。四个印按次序结完，火蛋出手；结错一个，走火。',
    en: 'Make the seals at the camera, each held a moment. Four in order and the fire egg flies; a wrong one fizzles.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = new URL('./jieyin/jieyin.css', import.meta.url);
const ART = {
  bg: new URL('./shouqiang/art/bg.webp', import.meta.url).href, // 守墙关's 山道 and people (game-kit.md § Shared assets)
  xiaoman: new URL('./shouqiang/art/xiaoman-cast.webp', import.meta.url).href,
  egg: new URL('./jieyin/art/huodan.webp', import.meta.url).href, // local FLUX (tools/paint-jieyin-flux.py)
  burnt: new URL('./jieyin/art/fizzle.webp', import.meta.url).href,
};
const foeArt = (id, frame) => new URL(`./shouqiang/art/${id}-${frame}.webp`, import.meta.url).href;
const HERE = new URL('./jieyin/', import.meta.url);
/** A level's own stage (`art`: paths from games/jieyin/ — 讲堂's hall and straw dummy are 砸寨's), else 守墙关's. */
export const artOf = (level) => ({
  bg: level.art?.bg ? new URL(level.art.bg, HERE).href : ART.bg,
  foe: (frame) => (level.art?.foe ? new URL(level.art.foe, HERE).href : foeArt(level.foe, frame)),
});
/** What the 火蛋 is aimed at: a sequence level's foe, or a teaching level's closing `cast`. */
export const castOf = (level) => (level.mode === 'one' ? level.cast ?? null : level);

const W = {
  zh: { nocam: '结印要用摄像头，这里用不了。', fizzle: '噗——走火了。', hit: '中了！', won: '野猪跑了。', learned: '五个印都会了。', downed: '草人倒了。', demo: '转一转手——换个角度，让摄像头认出来', asking: '请允许使用摄像头……', loading: '……', next: '下一个', who: '小满' },
  en: { nocam: 'Hand seals need a camera — none here.', fizzle: 'Pfft — it fizzled.', hit: 'Hit!', won: 'The boar runs off.', learned: 'All five seals learned.', downed: 'The dummy is down.', demo: 'Turn your hand a little — find the angle the camera reads', asking: 'Allow the camera…', loading: '…', next: 'Next', who: 'Xiaoman' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';

/** The level a link asks for (`data.lv` / `?lv=`): an id, or 1…; else the first. */
export function levelAsked(kit, data, search = '') {
  const lv = data?.lv ?? new URLSearchParams(search).get('lv');
  const n = Number(lv);
  return kit.levels.find((l) => l.id === lv) ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

function loadCss(doc) {
  if (doc.querySelector('link[data-jieyin-css]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS.href;
  l.dataset.jieyinCss = '';
  doc.head.append(l);
}

/** The button that leaves 结印 for the board behind it (its title). */
export const swapLabel = (title, lang = 'zh') => (lang === 'en' ? `Play “${title}” instead` : `改用「${title}」`);

/** The one line when 结印 cannot be offered; nothing else is drawn. */
export function unavailableHtml(lang = 'zh') {
  return `<p class="jy-nocam" role="status">${plain(W[lang === 'en' ? 'en' : 'zh'].nocam)}</p>`;
}

function seqHtml(kit, level, lang) {
  return level.sequence.map((id, i) => {
    const s = kit.seals[id];
    // A two-hand step a one-hand seal also does (judge.also, Hanli 10-21: 「单手的识别准确率高一些」) says so under it.
    const alt = level.mode !== 'one' ? (kit.judge.also?.[id] ?? []).map((a) => tr(kit.seals[a]?.name, lang)).filter(Boolean) : [];
    const or = alt.length ? `<em class="jy-or">${plain(lang === 'en' ? `or ${alt.join(' / ')}` : `或 ${alt.join('、')}`)}</em>` : '';
    return `<li class="jy-slot${handsOf(s) === 2 ? ' is-two' : ''}" data-i="${i}" title="${plain(tr(s.how, lang))}"><span class="jy-glyph">${plain(s.glyph)}</span>${iconSvg(s, 34, { lang })}<small>${plain(tr(s.name, lang))}</small>${or}</li>`;
  }).join('');
}

function stageHtml(kit, level, lang) {
  const art = artOf(level), aim = castOf(level);
  const foe = aim ? `<div class="jy-foe${level.art?.foe ? ' is-still' : ''}"><img alt="" src="${art.foe('walk-1')}"><div class="jy-hp">${'<i></i>'.repeat(aim.hits)}</div></div>` : '';
  return `<div class="jy" data-mode="${plain(level.mode)}" data-set="${plain(level.set ?? '')}">`
    + `<div class="jy-field" style="background-image:url('${art.bg}')">${foe}<img class="jy-xm" alt="" src="${ART.xiaoman}">`
    // The camera's picture is never shown (Hanli 10-21: 「最好不显示摄像头」): the video only feeds the model; the hand
    // hint (jieyin/hint.js) docks in the corner instead.
    + `<video class="jy-eye" playsinline muted aria-hidden="true"></video><div class="jy-dock"></div><p class="jy-status"></p></div>`
    + `<ol class="jy-seq">${seqHtml(kit, level, lang)}</ol><p class="jy-hint"></p><p class="jy-face"></p></div>`;
}

/** A sprite flies from one element to another (the 火蛋). */
function fly(box, src, from, to, ms, scale = 1) {
  const r = box.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const img = box.ownerDocument.createElement('img');
  img.className = 'jy-egg';
  if (scale !== 1) img.style.width = `${13 * scale}%`;
  img.src = src;
  img.alt = '';
  box.append(img);
  const x0 = a.left + a.width * 0.7 - r.left, y0 = a.top + a.height * 0.3 - r.top;
  const x1 = b.left + b.width / 2 - r.left, y1 = b.top + b.height / 2 - r.top;
  const at = (k) => `translate(${x0 + (x1 - x0) * k}px, ${y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * r.height * 0.18}px) translate(-50%, -50%) rotate(${k * 540}deg)`;
  const anim = img.animate([0, 0.25, 0.5, 0.75, 1].map((k) => ({ transform: at(k) })), { duration: ms, easing: 'ease-in' });
  return anim.finished.catch(() => {}).then(() => img.remove());
}

/** A charred egg pops out and drops (走火). */
function burnt(box, from, reducedMotion) {
  const img = box.ownerDocument.createElement('img');
  img.className = 'jy-burnt';
  img.src = ART.burnt;
  img.alt = '';
  const r = box.getBoundingClientRect(), a = from.getBoundingClientRect();
  img.style.left = `${a.left + a.width * 0.7 - r.left}px`;
  img.style.top = `${a.top + a.height * 0.25 - r.top}px`;
  box.append(img);
  const anim = img.animate(reducedMotion ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-80%) scale(1.1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%,40%) scale(1) rotate(25deg)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  anim.finished.catch(() => {}).then(() => img.remove());
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, shell } = {}) {
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = W[lang];
  const q = new URLSearchParams(win.location?.search ?? '');
  const feedOnly = q.get('dev') === '1' && q.get('feed') === '1';
  loadCss(doc);
  return new Promise((resolve) => {
    let done = false, eye = null, offPause = null, offHide = null, loop = 0;
    const finish = (r) => {
      if (done) return;
      done = true;
      eye?.close();
      offPause?.();
      offHide?.();
      win.cancelAnimationFrame?.(loop);
      if (win.jieyinFeed) delete win.jieyinFeed;
      dropModel();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    const nocam = () => {
      if (data.instead) return finish({ won: false, left: true, unable: 'camera' });
      container.innerHTML = unavailableHtml(lang);
      leave();
    };
    const swap = () => finish({ won: false, left: true, instead: true });
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const kit = await fetch(LEVELS).then((r) => r.json());
      // The device's set (sets.js): a phone only the one-hand seals, a Mac both; the level's sequence for that set.
      const set = setOf(kit, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' });
      const asked = levelAsked(kit, data, win.location?.search ?? '');
      const level = { ...asked, set: set.id, sequence: sequenceFor(kit, asked, set) };
      const seals = sealsFor(kit, set);
      if (!feedOnly && !(await available(win))) return nocam();
      if (done) return;
      loadModel().catch(() => {}); // from disk while the lead card is read; the camera waits for 开始
      container.innerHTML = stageHtml(kit, level, lang);
      const box = container.querySelector('.jy');
      const $ = (s) => box.querySelector(s);
      const video = $('video');
      // The turn cue sooner where a level asks (`turnMs`: 古六's 讲堂 0.4 s; Hanli 10-21: 「需要转动一下手才能识别. 需要提示用户一下」).
      const orient = { ...kit.orient, ...(level.turnMs ? { turnMs: level.turnMs } : {}) };
      const hint = handHint($('.jy-dock'), { lang, size: level.mode === 'one' ? 'large' : 'compact', seals, knobs: { ...kit.hint, orient } });
      const art = artOf(level);
      let s = start(level), hands = [], picture = [], handed = [], aspect = 4 / 3, hp = castOf(level)?.hits ?? 0, busy = false, last = win.performance.now(), taught = 0;

      const hud = () => {
        const want = expected(s);
        box.querySelectorAll('.jy-slot').forEach((el, i) => {
          el.classList.toggle('is-done', s.done || i < s.at);
          el.classList.toggle('is-next', !s.done && i === s.at);
        });
        const right = fits(s, s.cur, kit.judge);
        const now = win.performance.now();
        hint.update({ image: picture, aspect, target: want, progress: right ? progress(s, kit.judge) : 0, right, now, world: hands, handed, held: [] });
        const next = want ? kit.seals[want] : null;
        $('.jy-hint').textContent = next ? (s.mode === 'one' ? `${tr(next.hint, lang)}　${tr(next.how, lang)}` : `${tr(next.name, lang)}：${tr(next.how, lang)}`) : '';
        // Which hand and which way it faces, before he tries (Hanli 10-21: 「告诉玩家, 用左手还是右手, 手掌朝自己还是摄像头」).
        $('.jy-face').textContent = next ? facingLine(next, lang) : '';
        demo(want, right, now);
      };
      // Teaching (`demoMs`): the seal wanted not made for a while → a small 「转一转」 — its icon turning, a line under it.
      let wantAt = null, wantOf = null;
      const demo = (want, right, now) => {
        if (want !== wantOf || right || !level.demoMs) { wantOf = want; wantAt = now; }
        const on = Boolean(level.demoMs && want && hands.length && now - wantAt >= level.demoMs);
        let el = box.querySelector('.jy-demo');
        if (!on) { el?.remove(); return; }
        if (el?.dataset.seal === want) return;
        el?.remove();
        el = doc.createElement('div');
        el.className = 'jy-demo';
        el.dataset.seal = want;
        el.innerHTML = `<span class="jy-demo-hand">${iconSvg(kit.seals[want], 54)}</span><small>${plain(w.demo)}</small>`;
        $('.jy-field').append(el);
      };
      const say = (text) => (shell?.say ? shell.say(w.who, text, 1800) : ($('.jy-status').textContent = text));

      const cast = async (used) => {
        busy = true;
        const foe = $('.jy-foe'), power = bonusOf(kit, level.move, used); // a two-hand finish stronger only when the move's bonus is on
        await fly(box, ART.egg, $('.jy-xm'), foe, reducedMotion ? 200 : 650, power.egg);
        if (done) return;
        hp = Math.max(0, hp - power.hits);
        foe.querySelectorAll('.jy-hp i').forEach((el, i) => el.classList.toggle('is-gone', i >= hp));
        foe.querySelector('img').src = art.foe('hit');
        foe.classList.add('is-hit');
        say(w.hit);
        await new Promise((r) => setTimeout(r, 420));
        foe.classList.remove('is-hit');
        if (hp > 0) { foe.querySelector('img').src = art.foe('walk-1'); busy = false; return; }
        foe.classList.add('is-gone');
        say(level.mode === 'one' ? w.downed : w.won);
        setTimeout(() => finish({ won: true, stars: starsOf(taught + s.misses + s.fizzles, level.stars) }), 1200);
      };

      // A teaching level's close (`cast`, 古六's 讲堂): the seals learned, the four at once at the dummy — its misses
      // and the lesson's counted together.
      // 「改用…」 once the seals keep missing (a story board with another behind it, `data.instead`).
      const offerSwap = (misses) => {
        if (misses < (data.swapAfter ?? 3) || box.querySelector('.jy-swap')) return;
        const b = doc.createElement('button');
        b.className = 'gshell-btn jy-swap';
        b.textContent = swapLabel(data.instead, lang);
        b.onclick = swap;
        box.append(b);
      };
      const castNext = () => {
        taught = s.misses;
        const close = { ...level.cast, mode: 'sequence', sequence: sequenceFor(kit, level.cast, set) };
        s = { ...start(close), last: s.last }; // the seal still in hand is no miss
        $('.jy-seq').innerHTML = seqHtml(kit, close, lang);
        say(tr(level.cast.say, lang) || w.learned);
      };
      const act = (ev) => {
        if (ev.type === 'seal') { const el = box.querySelector(`.jy-slot[data-i="${ev.at}"]`); el?.classList.remove('is-pop'); void el?.offsetWidth; el?.classList.add('is-pop'); }
        if (ev.type === 'cast') cast(ev.used);
        if (ev.type === 'fizzle') { burnt(box, $('.jy-xm'), reducedMotion); hint.fizzle(); say(w.fizzle); }
        if ((ev.type === 'miss' || ev.type === 'fizzle') && data.instead) offerSwap(taught + s.misses + s.fizzles);
        if (ev.type === 'miss') { const el = box.querySelector('.jy-slot.is-next'); el?.classList.remove('is-shake'); void el?.offsetWidth; el?.classList.add('is-shake'); }
        if (ev.type === 'done' && level.cast) castNext();
        else if (ev.type === 'done') { say(w.learned); setTimeout(() => finish({ won: true, stars: starsOf(s.misses, level.stars) }), 1200); }
      };

      // Each frame: the judge on the hands last seen, the sequence on with the time passed (still while paused or a
      // 火蛋 is in the air).
      const tick = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - last);
        last = now;
        if (!shell?.paused?.() && !busy) {
          const r = step(s, sealOf(hands, seals, kit.judge, s.cur, { image: picture, aspect }), dt, kit.judge);
          s = r.state;
          r.events.forEach(act);
        }
        hud();
        loop = win.requestAnimationFrame(tick);
      };

      const onHands = ({ world, image, handed: which }) => {
        hands = world;
        handed = which ?? [];
        picture = image;
        aspect = (video.videoWidth / video.videoHeight) || aspect;
      };
      hud();
      if (shell?.lead) await shell.lead(tr(level.lead, lang));
      else await new Promise((r) => { const b = doc.createElement('button'); b.className = 'gshell-btn is-main jy-go'; b.textContent = lang === 'en' ? 'Start' : '开始'; b.onclick = () => { b.remove(); r(); }; box.append(b); });
      if (done) return;
      if (feedOnly) {
        win.jieyinFeed = (h, img = h, a = 4 / 3, which = []) => { hands = h ?? []; picture = img ?? []; aspect = a; handed = which; }; // img: the picture's points, 0…1 of the frame; which: 'Left' | 'Right' each
        loadModel().then(() => { box.dataset.model = 'ready'; }, () => { box.dataset.model = 'failed'; });
      } else {
        eye = openEye({ video, onHands, env: win, ...eyeFor(kit, set, level.sequence, level.eye), handedSwap: kit.orient?.handedSwap ?? true });
        // Heard before the camera is asked for: a pause while the prompt is open keeps the camera off (eye.js).
        offPause = shell?.onPause?.((paused) => {
          if (done) return;
          if (paused) { eye.pause(); hands = []; picture = []; } else eye.start().catch(() => nocam());
        });
        // The page hidden (another tab, the window away): the camera off, its light with it; back in sight, on again
        // unless the shell holds it paused.
        const seen = () => {
          if (done) return;
          if (doc.hidden) { eye.pause(); hands = []; picture = []; } else if (!shell?.paused?.()) eye.start().catch(() => nocam());
        };
        doc.addEventListener?.('visibilitychange', seen);
        offHide = () => doc.removeEventListener?.('visibilitychange', seen);
        $('.jy-status').textContent = w.asking;
        try { await eye.start(); } catch (e) { console.warn('[jieyin]', e.reason ?? e); return nocam(); }
        if (done) return;
        $('.jy-status').textContent = '';
      }
      last = win.performance.now();
      tick();
    })().catch((e) => { console.warn('[jieyin]', e); if (!done) nocam(); });
  });
}
