// doufa.js — 法术试炼, 手势斗法 played whole (doc/games.md § 手势斗法; Hanli 10-21: 「OK, 你写进文档, 然后可以开始做了」). A test
// field in the 游戏厅: beasts walk down three lanes toward 小满; the player's hands throw every tier — 小招 (a shape, then a
// jab or a push toward the camera), 法术 (文 → 扣 → a push), 大招 (the four seals fire themselves) — paid from the 灵力
// bar, the lane where the hand stands; the 五行 combos show. Not in the story.
//
// The parts: games/jieyin/duel.js (the moves, 灵力, strike: combos and the counter element), eye.js (the camera and the
// vendored model, on the device), hint.js (the hand hint: no camera picture; a held fist glows its element), field.js
// here (the beasts). Numbers: jieyin.json `doufa` (moves) and levels/doufa.json (the field).
// Camera only: none, refused, no WebGL or the model fails → one line, and the game leaves. Asked for only on 开始;
// off on pause, a hidden page, the end and leave.
// Contract (games/mount.js): mount(container, { lang, data, signal, reducedMotion, seed, shell }) → Promise<{ won, stars } | { left }>
// Dev only: `?dev=1&feed=1` runs without a camera, hands from the console (`window.doufaFeed(world, image, aspect,
// handed)`) — the live check's way; never a player's.
import { available, dropModel, loadModel, openEye } from './jieyin/eye.js';
import { duelFill, duelStart, duelStep, pacedKit } from './jieyin/duel.js';
import { handHint } from './jieyin/hint.js';
import { heldAt } from './jieyin/spell.js';
import { iconSvg } from './jieyin/pose.js';
import { eyeFor, sealsFor, sequenceFor, setOf } from './jieyin/sets.js';
import { applyCast, fieldStart, fieldTick } from './doufa/field.js';

export const meta = {
  id: 'doufa',
  sounds: ['cast', 'dry', 'fade', 'kou', 'boss', 'escape'], // the seal kit's (games/kit/audio/sounds.json)
  pause: true,
  camera: true,
  name: { zh: '法术试炼', en: 'Spell trial' },
  how: {
    zh: '手在摄像头左、中、右，招就打哪一路。剑诀戳是飞剑，单剑指戳是点穴，推掌推是掌风，握拳推是拳劲；掐文、握拳扣住、往前一拍放法术；四印连成火蛋自己飞。灵力不够就歇一歇。',
    en: 'Your hand\'s place — left, middle, right — is the lane. Jab a sword seal: flying sword; a single finger: pressure point; push a palm: palm wind; push a fist: fist force. Press a mark, close the fist, push: a spell. Four seals in a row: the fire egg. Out of spirit? Rest.',
  },
};

const JIEYIN = new URL('../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const LEVELS = new URL('../../worlds/jiuding/levels/doufa.json', import.meta.url);
const CSS = [new URL('./jieyin/jieyin.css', import.meta.url), new URL('./doufa/doufa.css', import.meta.url)];
const art = (p) => new URL(p, import.meta.url).href;
const ART = {
  bg: art('./shouqiang/art/bg.webp'), xiaoman: art('./shouqiang/art/xiaoman-cast.webp'),
  beast: (id, frame) => art(`./shouqiang/art/${id}-${frame}.webp`), // 守墙关's beasts (game-kit.md § Shared assets)
  fx: (id) => art(`./jieyin/art/${id}.webp`), // local FLUX (tools/paint-jieyin-flux.py)
};
// Which sprite a move throws.
const SPRITE = { feijian: 'feijian', dianxue: 'dianxue', zhangfeng: 'zhangfeng', quanjin: 'quanjin', huodan: 'huodan', bingzhui: 'bingzhui', jinren: 'jinren', muteng: 'muteng', tuqiang: 'tuqiang', huodan4: 'huodan' };

const W = {
  zh: { nocam: '结印要用摄像头，这里用不了。', asking: '请允许使用摄像头……', lingli: '灵力', dry: '灵力不够，歇一歇', boss: '大妖出来了！灵力满了', kills: '击退', got: '漏过', counter: '克', fade: '扣久了，散了', who: '小满', tiers: { xiao: '小招', fa: '法术', da: '大招' }, kou: '扣住了', wen: '文成' },
  en: { nocam: 'Hand seals need a camera — none here.', asking: 'Allow the camera…', lingli: 'Spirit', dry: 'Not enough spirit — rest a moment', boss: 'A great beast! Spirit full', kills: 'Down', got: 'Got by', counter: 'counter', fade: 'Held too long — it leaked away', who: 'Xiaoman', tiers: { xiao: 'Small', fa: 'Spell', da: 'Big' }, kou: 'Held', wen: 'Mark made' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';

function loadCss(doc) {
  for (const href of CSS) {
    if (doc.querySelector(`link[href="${href.href}"]`)) continue;
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = href.href;
    doc.head.append(l);
  }
}

/** The moves, by tier, as a legend under the field: icon, name, how. */
function legendHtml(kit, set, lang) {
  const d = kit.doufa, row = (icon, name, how) => `<li>${icon}<b>${plain(name)}</b><small>${plain(how)}</small></li>`;
  const sp = (id) => `<img alt="" src="${ART.fx(SPRITE[id])}">`;
  const xiao = Object.entries(d.xiao).map(([id, x]) => row(iconSvg(kit.seals[x.shape] ?? kit.seals.zhang, 26, { lang }), tr(x.name, lang), tr(x.how, lang)));
  const fa = d.fa.map((id) => row(sp(id), tr(kit.spells[id].name, lang), tr(kit.spells[id].how, lang).replace(/松|open$/, lang === 'en' ? 'push' : '拍')));
  const da = Object.entries(d.da).map(([id, x]) => row(sp(id), tr(x.name, lang), sequenceFor(kit, x.move, set).map((s) => tr(kit.seals[s].name, lang)).join(' → ')));
  const w = W[lang];
  return `<div class="df-legend"><section><h4>${w.tiers.xiao} · ${d.lingli.cost.xiao}</h4><ul>${xiao.join('')}</ul></section>`
    + `<section><h4>${w.tiers.fa} · ${d.lingli.cost.fa}</h4><ul>${fa.join('')}</ul></section>`
    + `<section><h4>${w.tiers.da} · ${d.lingli.cost.da}</h4><ul>${da.join('')}</ul></section></div>`;
}

function stageHtml(kit, set, lang) {
  return `<div class="df"><div class="df-field" style="background-image:url('${ART.bg}')">`
    + '<div class="df-lanes"><i></i><i></i><i></i></div><div class="df-walls"></div><div class="df-beasts"></div><div class="df-fx"></div>'
    + `<img class="df-xm" alt="" src="${ART.xiaoman}">`
    + `<div class="df-bar"><span>${W[lang].lingli}</span><b><i></i></b><em></em></div><p class="df-say"></p>`
    + '<video class="jy-eye" playsinline muted aria-hidden="true"></video><div class="df-dock"></div></div>'
    + `${legendHtml(kit, set, lang)}</div>`;
}

const laneX = (lane) => `${((lane + 0.5) / 3) * 100}%`;

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, seed, shell } = {}) {
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
      if (win.doufaFeed) delete win.doufaFeed;
      dropModel();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    const nocam = () => { container.innerHTML = `<p class="jy-nocam" role="status">${plain(w.nocam)}</p>`; leave(); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const [raw, lv] = await Promise.all([fetch(JIEYIN).then((r) => r.json()), fetch(LEVELS).then((r) => r.json())]);
      const level = lv.levels.find((l) => l.id === data.lv) ?? lv.levels[0];
      const kit = pacedKit(raw, level.pace); // rest (the trial) unless the level says intense
      const set = setOf(kit, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' });
      if (!feedOnly && !(await available(win))) return nocam();
      if (done) return;
      loadModel().catch(() => {});
      container.innerHTML = stageHtml(kit, set, lang);
      const box = container.querySelector('.df'), $ = (s) => box.querySelector(s);
      const video = $('video');
      const hint = handHint($('.df-dock'), { lang, size: 'compact', seals: sealsFor(kit, set), knobs: kit.hint });
      let duel = duelStart(kit, { set }), field = fieldStart(level, seed ?? `doufa|${Date.now()}`);
      let hands = [], picture = [], handed = [], aspect = 4 / 3, focus = null, last = win.performance.now(), held = [], sayT = 0;
      const bigSeq = sequenceFor(kit, Object.values(kit.doufa.da)[0].move, set);

      const say = (text, ms = 1600) => { const el = $('.df-say'); el.textContent = text; el.classList.add('is-on'); clearTimeout(sayT); sayT = setTimeout(() => el.classList.remove('is-on'), ms); };
      const nameOf = (c) => tr(kit.doufa.xiao[c.move]?.name ?? kit.spells[c.move]?.name ?? kit.doufa.da[c.move]?.name, lang);

      // Beasts drawn from the field: one element each, kept by id (a redraw only moves them).
      const drawBeasts = () => {
        const host = $('.df-beasts'), seen = new Set();
        for (const b of field.beasts) {
          seen.add(String(b.id));
          let el = host.querySelector(`[data-id="${b.id}"]`);
          if (!el) {
            el = doc.createElement('button');
            el.type = 'button';
            el.className = `df-beast${b.boss ? ' is-boss' : ''}`;
            el.dataset.id = b.id;
            el.innerHTML = `<img alt="" src="${ART.beast(b.kind, 'walk-1')}"><span class="df-hp"><i></i></span><span class="df-st"></span>`;
            el.onclick = () => { focus = focus === b.id ? null : b.id; };
            host.append(el);
          }
          el.style.left = laneX(b.lane);
          el.style.top = `${b.y * 100}%`;
          el.querySelector('.df-hp i').style.width = `${Math.max(0, b.hp / b.max) * 100}%`;
          const on = (s) => (b.status[s] ?? 0) > field.t;
          el.classList.toggle('is-focus', b.id === focus);
          el.dataset.st = ['rooted', 'chilled', 'frozen', 'stunned'].filter(on).join(' ');
        }
        for (const el of [...host.children]) if (!seen.has(el.dataset.id)) el.remove();
        $('.df-walls').innerHTML = field.walls.map((t, lane) => (t > field.t ? `<img class="df-wall" alt="" src="${ART.fx('tuqiang')}" style="left:${laneX(lane)};top:${level.wallY * 100}%">` : '')).join('');
      };

      /** A sprite from 小满 to a beast (or up its lane), then the cast lands. */
      const fly = (move, lane, targetId, big = false) => new Promise((res) => {
        const fx = $('.df-fx'), img = doc.createElement('img');
        img.className = `df-shot${big ? ' is-big' : ''}`;
        img.src = ART.fx(SPRITE[move] ?? 'huodan');
        img.alt = '';
        fx.append(img);
        const b = field.beasts.find((x) => x.id === targetId);
        const to = { x: b ? (b.lane + 0.5) / 3 : (lane + 0.5) / 3, y: b ? b.y : 0.35 };
        const a = img.animate([{ left: '50%', top: '88%', transform: 'translate(-50%,-50%) scale(.6)' }, { left: `${to.x * 100}%`, top: `${to.y * 100}%`, transform: 'translate(-50%,-50%) scale(1)' }],
          { duration: reducedMotion ? 120 : 320, easing: 'ease-in' });
        a.finished.catch(() => {}).then(() => { img.remove(); res(); });
      });
      const puff = (src, lane, y, cls = '') => {
        const img = doc.createElement('img');
        img.className = `df-puff ${cls}`;
        img.src = src;
        img.alt = '';
        img.style.left = laneX(lane);
        img.style.top = `${y * 100}%`;
        $('.df-fx').append(img);
        setTimeout(() => img.remove(), 1100);
      };
      const float = (text, lane, y, cls = '') => {
        const el = doc.createElement('b');
        el.className = `df-num ${cls}`;
        el.textContent = text;
        el.style.left = laneX(lane);
        el.style.top = `${y * 100}%`;
        $('.df-fx').append(el);
        setTimeout(() => el.remove(), 1000);
      };

      const land = async (c) => {
        const target = c.tier === 'xiao' && kit.doufa.effects[c.move]?.lane ? null : field.beasts.find((b) => b.id === focus)?.id ?? null;
        const pre = applyCast(field, c, kit, focus); // where it goes, before it flies
        await fly(c.move, c.laneIndex, pre.show.target ?? target, c.tier === 'da');
        if (done) return;
        const before = new Map(field.beasts.map((b) => [b.id, b]));
        const r = applyCast(field, c, kit, focus);
        field = r.field;
        for (const h of r.hits) {
          const b = before.get(h.id);
          if (!b) continue;
          float(`${h.dmg ? `-${+h.dmg.toFixed(1)}` : '·'}${h.counter ? ` ${w.counter}` : ''}`, b.lane, b.y, h.counter ? 'is-counter' : '');
          if (h.combo) say(tr(kit.doufa.combos.find((x) => x.id === h.combo)?.name, lang), 2000);
        }
        if (r.show.steam) puff(ART.fx('steam'), r.show.lane, 0.4, 'is-steam');
        if (c.move === 'quanjin') puff(ART.fx('quanjin'), c.laneIndex, 0.72);
        if (c.move === 'zhangfeng') puff(ART.fx('zhangfeng'), c.laneIndex, 0.5);
        if (c.move === 'muteng' || c.move === 'dianxue') { const b = before.get(r.show.target); if (b) puff(ART.fx(c.move), b.lane, b.y, 'is-stay'); }
      };

      const act = (e) => {
        shell?.sound?.(e.type); // the seal kit's (games/kit/audio/sounds.json)
        if (e.type === 'cast') { say(`${w.tiers[e.tier]} · ${nameOf(e)}`); land(e); }
        if (e.type === 'dry') say(w.dry);
        if (e.type === 'fade') say(w.fade);
        if (e.type === 'kou') say(`${w.kou} · ${tr(kit.spells[e.spell].name, lang)}`);
      };

      const hud = () => {
        const L = duel.lingli;
        $('.df-bar b i').style.width = `${(L.now / L.max) * 100}%`;
        $('.df-bar em').textContent = `${w.kills} ${field.kills} · ${w.got} ${field.escaped} · ${Math.max(0, Math.ceil(level.seconds - field.t / 1000))}s`;
        box.classList.toggle('is-full', L.now >= kit.doufa.lingli.cost.da);
        // The 大招 under way (two of its seals made — one alone is any 推掌): its next seal. No turn cue while a fist holds a spell.
        const next = (duel.big[0]?.s.at ?? 0) >= 2 ? bigSeq[duel.big[0].s.at] : null;
        hint.update({ image: picture, aspect, target: next, progress: 0, right: false, now: win.performance.now(), world: held.length || !next ? null : hands, handed, held: heldAt(held, handed, hands.length) });
      };

      const tick = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - last);
        last = now;
        if (!shell?.paused?.()) {
          const fr = fieldTick(field, dt, level);
          field = fr.field;
          for (const e of fr.events) if (e.type === 'boss' || e.type === 'escape') shell?.sound?.(e.type);
          for (const e of fr.events) if (e.type === 'boss') { duel = duelFill(duel, kit, 'boss'); say(w.boss, 2400); }
          const r = duelStep(duel, { world: hands, image: picture, handed, aspect, t: now }, dt, kit);
          duel = r.state;
          held = r.held;
          r.events.forEach(act);
          drawBeasts();
          if (field.t >= level.seconds * 1000) {
            const stars = level.stars.filter((n) => field.kills >= n).length;
            say(tr(level.end, lang), 2000);
            setTimeout(() => finish({ won: stars > 0, stars }), 1400);
            return;
          }
        }
        hud();
        loop = win.requestAnimationFrame(tick);
      };

      const onHands = ({ world, image, handed: which }) => {
        hands = world;
        picture = image;
        handed = which ?? [];
        aspect = (video.videoWidth / video.videoHeight) || aspect;
      };
      drawBeasts();
      hud();
      if (shell?.lead) await shell.lead(tr(level.lead, lang));
      if (done) return;
      if (feedOnly) {
        win.doufaFeed = (h, img = h, a = 4 / 3, which = []) => { hands = h ?? []; picture = img ?? []; aspect = a; handed = which; };
        win.doufaFeed.state = () => ({ duel, field, focus });
      } else {
        eye = openEye({ video, onHands, env: win, ...eyeFor(kit, set, bigSeq, level.eye), handedSwap: kit.orient?.handedSwap ?? true });
        offPause = shell?.onPause?.((paused) => {
          if (done) return;
          if (paused) { eye.pause(); hands = []; picture = []; } else eye.start().catch(() => nocam());
        });
        const seen = () => {
          if (done) return;
          if (doc.hidden) { eye.pause(); hands = []; picture = []; } else if (!shell?.paused?.()) eye.start().catch(() => nocam());
        };
        doc.addEventListener?.('visibilitychange', seen);
        offHide = () => doc.removeEventListener?.('visibilitychange', seen);
        say(w.asking, 4000);
        try { await eye.start(); } catch (e) { console.warn('[doufa]', e.reason ?? e); return nocam(); }
        if (done) return;
      }
      last = win.performance.now();
      tick();
    })().catch((e) => { console.warn('[doufa]', e); if (!done) nocam(); });
  });
}
