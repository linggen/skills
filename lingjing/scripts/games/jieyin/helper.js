// helper.js — 结印 as a HELPER inside another game: 守墙关's spells (Hanli 2026-10-21: 「可以在守墙里面, 让用户结印发火弹帮忙
// 打怪」「放进去」). The host game keeps playing as it always does; this adds one 结印 button in a corner of its field,
// lit only while the host offers spells (守墙关: a 大妖 on the field), and the camera and the shared hand hint docked
// there — opening BY ITSELF at the offer (Hanli 10-22: 「小游戏里结印那里, 可以省掉用户点击动作. 默认开摄像头开始结印」). The hands are read by 手势斗法 (duel.js: 小招 shape + thrust, 法术 文 → 扣 → 推, the
// 大招's seals, 灵力 — doc/games.md § 手势斗法); its cast events go to the host, which decides what they do.
//
//   offerSeals({ host, lang, moves, state, cast, say, call, first, idle, fastFps, paused, aside, env, feed, level, dock, onProgress, permission, store }) → Promise<{ close(), lead(pace), camera, wanted, auto } | null>
//     level() → a key for the level up now: the first time the dock opens for a key, a bubble on it says sealing is live
//             and where to switch it off (jieyin.json `helper.live`)
//   Consent (the camera opens by itself; the browser's own prompt the first time is unavoidable):
//     permission(win) → 'granted' | 'prompt' | 'denied' (the Permissions API; none, or a browser that cannot answer for
//             the camera — WebKit, Linggen.app's WKWebView — reads 'prompt'). denied → null, nothing drawn: the game as
//             without a camera (Hanli 10-21: 「没摄像头时, 就不用」). granted → the dock opens at each offer. prompt → it
//             opens only once the player has read that 结印 is on — the lead card's line (the handle's lead() said it)
//             or his own tap — so the browser's ask is no surprise; till then the button and its bubble (「点这里结印」).
//     store   the player's choice on this device ('on' | 'off'; localStorage, a refusal stores 'off'): off → never by
//             itself, the button stands as the switch back on. The dock's × and the button (while the camera is on)
//             switch it off; the button switches it on. A small red light on the dock and the button while it is on.
//   leadLine(kit, pace, lang) → the lead card's line that 结印 is here; the handle's lead(pace) says it (a handle is only
//     where a camera is and a move is offered) — a host joins it to its lead card with jieyin/lead.js leadWith
//   The button wears the next move's gesture; tapped, the dock's frame shows the gesture to make (as the right hand,
//   its facing words) beside the player's own ink hand (Hanli 10-21: 「有结印要告诉玩家啊」「结印要有个框提示手势的」).
//     moves   the move ids the host offers here (already past their `from` gate); a cast of any other is dropped
//     state() → { on, ready, cool, coolOf }   on: spells offered now · ready: one may fly now · cool: s of rest left
//     cast(event) → true when it flew        say(text): one short line in the host (the cues)
//     call() → the line when spells are first offered (a 大妖 out; 灵力 filled then)   first: the 小招's first-time line
//     idle    s ready with no hand raised before the camera closes itself · fastFps: the eye's rate while a 小招 is armed
//     dock    where the button and the frame stand in the host's field — its data says (Hanli 10-22, of 守灶台: 「结印的框会
//             挡住画面, 可以上面一点吗?」): { at: 'bottom' (the default: the bottom-left corner) | 'top' (the top-left, under
//             the host's top bar, over its backdrop — the far end of a road), w: a narrow frame, its width a share of the
//             field (the live hand beside the gesture, the words under both) }
//     onProgress(p) → the hand working on a seal (Hanli 10-22: 「结印的过程中, 可否让小满手指发光」), on each change:
//             p = { move, step, of, k, cast } — `step` of `of` done (a 小招: the shape held 1/2, the thrust 2/2; a 法术:
//             文 1/3 · 扣 2/3 · the push 3/3; a 大招: each seal), `k` 0…1 (a hand up and no shape yet is a little),
//             `cast: true` as one flies; null when no hand works (none in view, resting, the frame away). The host's 小满
//             shows it (his hand glows, a ring charges, a burst on the cast) — progressOf is the pure rule.
//   (`available` and `eyeOf` stand in for eye.js's in a test.)
//
// null — and NOTHING drawn — when 结印 cannot be offered (no camera API, no camera, no WebGL; eye.js `available`) or no
// move offered is one 手势斗法 knows: the host plays exactly as it does without it (Hanli 10-21: 「没摄像头时, 就不用」).
// No tap stand-in. A refused camera or a failed model after the tap takes the button away too.
//
// Rest most of the time (Hanli 10-21: 「别让用户太累」「让用户大部分时间在休息」): while `state().on` is false the button is
// hidden and the camera off; while the host's rest runs or 灵力 is short of the cheapest move, the frame steps away
// (nothing asks for the hand: the duel sees no hands, 灵力 still refills), the button shows the rest burning down
// (「歇一歇」) and the camera idles at its slow rate; ready → the frame is back, the button glows.
//
// The camera: on while the dock is wanted (opened at the offer, or by the button); off (its tracks) while `paused()`, while
// the page is hidden, when the host stops offering, after `idle` s with no hand (the next offer opens it again), and for
// good on close(); while it rests (nothing asks for a hand) the model reads at `eye.restFps`. No camera picture (Hanli 10-21: 「最好不显示摄像头」): the video stays off-screen.
// While `aside()` (the host's own modal, a card pick) the button and the frame step aside. All on the device.
//
// Dev only: `feed` (the host passes `?dev=1&feed=1`) offers it without a camera; hands from the console
// (`window.jieyinFeed(world, image?, handed?)`) — the live check's way to cast.
import { available as cameraHere, dropModel, openEye } from './eye.js';
import { duelFill, duelStart, duelStep } from './duel.js';
import { heldAt } from './spell.js';
import { handHint } from './hint.js';
import { iconSvg } from './pose.js';
import { eyeFor, sequenceFor, setOf } from './sets.js';

const LEVELS = new URL('../../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = { jieyinCss: new URL('./jieyin.css', import.meta.url), jieyinHelper: new URL('./helper.css', import.meta.url) }; // the hint's look, then the dock's
const SEEN = 'lingjing.jieyin.first'; // this device has had the first-time line (never the save)
const CHOICE = 'lingjing.jieyin.camera'; // the player's own switch on this device: 'on' | 'off' (none: on by itself)

export const WORDS = {
  zh: { btn: '结印', label: '对着摄像头结印', off: '收印', asking: '请允许摄像头……', rest: '歇一歇', ready: '好了，结印！', tapHere: '点这里结印', who: '小满', make: '照这个手势', camOn: '摄像头开着', camOff: '关掉摄像头', done: '成', camNow: '现在开摄像头' },
  en: { btn: 'Seals', label: 'Make hand seals at the camera', off: 'Stop', asking: 'Allow the camera…', rest: 'Rest', ready: 'Ready — make the seals!', tapHere: 'Tap here for hand seals', who: 'Xiaoman', make: 'Make this', camOn: 'The camera is on', camOff: 'Switch the camera off', done: 'Done', camNow: 'Camera on now' },
};

/** The lead card's line that 结印 is here (Hanli 10-21: 「有结印要告诉玩家啊」): jieyin.json `helper.lead` by the level's
    pace — a 守炉 pace (rest · intense) or a host's `when` (boss · waves · always, `helper.paceOf`). */
export function leadLine(kit, pace = 'rest', lang = 'zh') {
  const lead = kit?.helper?.lead ?? {}, l = lead[pace] ?? lead[kit?.helper?.paceOf?.[pace]] ?? lead.rest; // pace 'off': the player switched it off
  return l ? l[lang === 'en' ? 'en' : 'zh'] ?? l.zh : '';
}
export { cameraHere as available };
/** A move a host offers, as the 手势斗法 kit names it: an id, or a host row's `jieyin`, else its `id`. */
export const duelId = (m) => m?.jieyin ?? m?.id ?? m;
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The offered ids by 手势斗法's tier (xiao · fa · da); an id it does not know is left out. */
export function tiersOf(kit, ids) {
  const d = kit.doufa ?? {}, tier = (id) => (d.xiao?.[id] ? 'xiao' : d.fa?.includes(id) ? 'fa' : d.da?.[id] ? 'da' : null);
  const out = { xiao: [], fa: [], da: [] };
  for (const id of ids) { const t = tier(id); if (t) out[t].push(id); }
  return out;
}

/** 灵力 short of the cheapest offered tier: how far, 0 (enough) … 1 (none). */
export function shortOf(lingli, cost, tiers) {
  const cheapest = Math.min(...Object.keys(tiers).filter((t) => tiers[t].length).map((t) => cost[t] ?? 0));
  return Number.isFinite(cheapest) && cheapest > 0 ? Math.max(0, 1 - lingli.now / cheapest) : 0;
}

function loadCss(doc) {
  for (const [key, url] of Object.entries(CSS)) {
    if (doc.querySelector(`link[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) continue;
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = url.href;
    l.dataset[key] = '';
    doc.head.append(l);
  }
}

/** How far the hands are on a seal this frame (offerSeals' onProgress): the furthest of the offered moves, or null (no
    hand). `shapes` each hand's shape (duel.js), `spells` the duel's 法术 hands, `bigAt` the 大招's seals made of `bigOf`;
    `mem` keeps the 小招's shape steady across frames: held `hold` ms counts, a gap under `gap` ms keeps it. */
export function progressOf({ kit, tiers, hands = 0, shapes = [], spells = {}, bigId = null, bigAt = 0, bigOf = 0, now = 0, mem = {}, hold = 120, gap = 300 }) {
  if (!hands) { mem.since = null; return null; }
  const D = kit.doufa, cands = [];
  const xiao = tiers.xiao.find((id) => shapes.includes(D.xiao[id].shape)) ?? null;
  if (xiao) { if (mem.since == null || mem.move !== xiao || now - mem.seen > gap) mem.since = now; mem.move = xiao; mem.seen = now; }
  const on = mem.since != null && now - mem.seen <= gap ? mem.move : null;
  if (on) { const t = Math.min(1, (now - mem.since) / hold); cands.push({ move: on, step: t >= 1 ? 1 : 0, of: 2, k: 0.15 + 0.35 * t }); }
  else if (tiers.xiao.length) cands.push({ move: tiers.xiao[0], step: 0, of: 2, k: 0.12 });
  for (const h of Object.values(spells)) {
    if (!tiers.fa.includes(h.spell)) continue;
    if (h.phase === 'wen') cands.push({ move: h.spell, step: 1, of: 3, k: 1 / 3 });
    if (h.phase === 'kou') cands.push({ move: h.spell, step: 2, of: 3, k: 2 / 3 });
  }
  if (bigId && bigAt > 0) cands.push({ move: bigId, step: bigAt, of: bigOf, k: bigAt / bigOf });
  if (!cands.length && (tiers.fa.length || bigId)) cands.push({ move: tiers.fa[0] ?? bigId, step: 0, of: tiers.fa.length ? 3 : bigOf, k: 0.12 });
  return cands.reduce((a, c) => (!a || c.k > a.k ? c : a), null);
}

/** The camera's permission as the browser holds it, asking nothing: 'granted' | 'prompt' | 'denied'. A browser with no
    Permissions API, or one that cannot query the camera (WebKit throws), reads 'prompt'. */
export async function permissionOf(win = globalThis) {
  try {
    const st = await win.navigator?.permissions?.query?.({ name: 'camera' });
    return st?.state === 'granted' || st?.state === 'denied' ? st.state : 'prompt';
  } catch { return 'prompt'; }
}

/** The player's switch on this device (localStorage; a private window or blocked storage: none, on by itself). */
export const choiceStore = (win) => ({
  get: () => { try { return win.localStorage?.getItem(CHOICE) ?? null; } catch { return null; } },
  set: (v) => { try { win.localStorage?.setItem(CHOICE, v); } catch { /* not kept: this page only */ } },
});

/** The live bubble's words (jieyin.json `helper.live`), the next move's gesture named in it. */
export const liveLine = (kit, seal, lang = 'zh') => tr(kit?.helper?.live, lang).replace('{seal}', tr(kit?.seals?.[seal]?.name, lang) || (lang === 'en' ? 'seal' : '手印'));

/** The ready card's line (jieyin.json `helper.soon`), the next move's gesture named in it. */
export const soonLine = (kit, seal, lang = 'zh') => tr(kit?.helper?.soon, lang).replace('{seal}', tr(kit?.seals?.[seal]?.name, lang) || (lang === 'en' ? 'seal' : '手印'));
/** A move's own light (jieyin.json `helper.glow`, else its spell's `glow`), for the box's bloom when it flies. */
export const glowOf = (kit, move) => kit?.helper?.glow?.[move] ?? kit?.spells?.[move]?.glow ?? '#ffe7a0';
/** A move's one-line how (手势斗法's rows: a 小招's, a 大招's, else the 法术's). */
const howOf = (kit, move, lang) => tr(kit?.doufa?.xiao?.[move]?.how ?? kit?.doufa?.da?.[move]?.how ?? kit?.spells?.[move]?.how, lang);

/** Where the box stands (Hanli 10-28: 「结手印的框调整一下位置, 不要挡住游戏画面」): the shell's side, never the field —
    the frame's own (`data-shell-side`, games/shell.js frameHtml: the Mac's column under the title, else a strip under
    the stage), else the page's (the phone's board page); only a page with neither keeps it in the host's corner. */
export function sideOf(host, doc = host?.ownerDocument) {
  const frame = host?.closest?.('.gshell')?.querySelector?.(':scope > [data-shell-side]');
  return frame ?? doc?.body?.querySelector?.(':scope > [data-shell-side]') ?? null;
}

/** The ready card (Hanli 10-28: 「结手印前给一个提示, 让用户准备好」): the seal to make for the 大妖 the next wave brings —
    its picture and name, the line, the move's how, and a switch for a camera that will not open by itself. */
function soonEl(doc, w, kit, seal, move, lang) {
  const c = doc.createElement('div');
  c.className = 'jyh-soon';
  c.hidden = true;
  const icon = kit.seals?.[seal] ? iconSvg(kit.seals[seal], 44, { lang }) : '';
  c.innerHTML = `<span class="jyh-soon-icon">${icon}</span><div class="jyh-soon-text"><b class="jyh-soon-line">${plain(soonLine(kit, seal, lang))}</b>`
    + `<span class="jyh-soon-name">${plain(tr(kit.seals?.[seal]?.name, lang))}</span><span class="jyh-soon-how">${plain(howOf(kit, move, lang))}</span>`
    + `<button type="button" class="jyh-soon-on">${plain(w.camNow)}</button><i class="jyh-soon-cam">${plain(w.camOn)}</i></div>`;
  return c;
}

/** The button: the next move's gesture drawn on it (Hanli 10-21: 「结印要有个框提示手势的」), the word under it. */
function buttonEl(doc, w, icon = '') {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'jyh-btn';
  b.hidden = true;
  b.title = w.label;
  b.setAttribute('aria-label', w.label);
  b.innerHTML = `${icon ? `<span class="jyh-icon">${icon}</span>` : ''}<b class="jyh-word">${plain(w.btn)}</b><i class="jyh-cam" title="${plain(w.camOn)}"></i>`;
  return b;
}

/** A bubble in 小满's voice: on the dock the first time it opens in a level (sealing is live, where to switch it off), or
    on the button where the player's tap is still wanted first (「点这里结印」). */
function calloutEl(doc, w, text) {
  const c = doc.createElement('div');
  c.className = 'jyh-callout';
  c.hidden = true;
  c.innerHTML = `<b>${plain(w.who)}</b>${plain(text)}`;
  return c;
}

function dockEl(doc, w) {
  const d = doc.createElement('div');
  d.className = 'jyh-dock';
  d.hidden = true;
  d.innerHTML = `<div class="jyh-hint"></div><b class="jyh-state"></b><b class="jyh-done" aria-hidden="true">${plain(w.done)}</b><ol class="jyh-chips"></ol>`
    + `<button type="button" class="jyh-off" aria-label="${plain(w.camOff)}" title="${plain(w.camOff)}">×</button><i class="jyh-cam" title="${plain(w.camOn)}"></i>`
    + `<video class="jyh-video" playsinline muted></video>`;
  return d;
}

const firstTime = (win) => { try { if (win.localStorage?.getItem(SEEN)) return false; win.localStorage?.setItem(SEEN, '1'); return true; } catch { return false; } };

export async function offerSeals({ host, lang = 'zh', moves = [], state = () => ({ on: true, ready: true, cool: 0, coolOf: 0 }),
  cast = () => false, say = () => {}, call = () => null, first = null, idle = 60, fastFps = 30, paused = () => false, aside = () => false,
  env = globalThis, feed = false, available = cameraHere, eyeOf = openEye, level = null, dock: place = null, onProgress = null,
  permission = permissionOf, store = null } = {}) {
  moves = moves.map(duelId); // a host may hand its rows: each is its 手势斗法 id
  if (!moves.length || (!feed && !(await available(env)))) return null;
  const perm = feed ? 'granted' : await permission(host.ownerDocument?.defaultView ?? env);
  if (perm === 'denied') return null; // refused in the browser: no 结印, the game unchanged
  const kit = await fetch(LEVELS).then((r) => r.json());
  const tiers = tiersOf(kit, moves);
  if (!tiers.xiao.length && !tiers.fa.length && !tiers.da.length) return null;
  const doc = host.ownerDocument, win = doc.defaultView ?? env;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = WORDS[lang], set = setOf(kit, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' });
  loadCss(doc);

  // The gesture the button wears: the 小招's shape, else the 法术's 文, else the 大招's first seal — as the right hand.
  const D0 = kit.doufa, lead = tiers.xiao.map((id) => D0.xiao[id].shape)[0] ?? tiers.fa.map((id) => kit.spells?.[id]?.wen)[0]
    ?? (tiers.da[0] ? sequenceFor(kit, D0.da[tiers.da[0]].move, set)[0] : null);
  const btn = buttonEl(doc, w, kit.seals[lead] ? iconSvg(kit.seals[lead], 30, { lang }) : ''), dock = dockEl(doc, w);
  const callout = calloutEl(doc, w, w.tapHere), live = calloutEl(doc, w, liveLine(kit, lead, lang));
  const leadMove = tiers.xiao[0] ?? tiers.fa[0] ?? tiers.da[0];
  const soon = soonEl(doc, w, kit, lead, leadMove, lang);
  dock.append(live);
  for (const el of [btn, dock]) el.dataset.at = place?.at === 'top' ? 'top' : 'bottom'; // the host's data, where no side is: its corner
  if (place?.w) { dock.dataset.narrow = ''; dock.style.setProperty('--jyh-w', `${Math.round(place.w * 1000) / 10}%`); } // a narrow frame
  // In the shell's side (sideOf), every Look: the story lays its frame again and the side comes back empty, so each
  // frame puts the parts back where they belong (the bubble beside the button there, not over the field).
  let side = null, laid = false;
  const dockAt = () => {
    if (host.isConnected === false) return; // between two frames of a re-laid card
    const s = sideOf(host, doc);
    if (laid && s === side) return; // a re-laid frame brings a new side: they move into it
    side = s;
    laid = true;
    for (const el of [btn, dock, soon]) el.toggleAttribute?.('data-side', Boolean(s));
    if (s) s.append(btn, callout, dock, soon); else { btn.append(callout); host.append(btn, dock, soon); }
  };
  dockAt();
  const $ = (s) => dock.querySelector(s);
  for (const el of [btn, dock, soon]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
  const hint = handHint($('.jyh-hint'), { lang, size: 'dock', seals: kit.seals, knobs: kit.hint }); // the gesture frame: big enough to read

  const offered = new Set(moves), D = kit.doufa;
  const bigId = tiers.da[0] ?? null, bigSeq = bigId ? sequenceFor(kit, D.da[bigId].move, set) : [];
  const shape = tiers.xiao.map((id) => D.xiao[id].shape).find((s) => kit.seals[s]) ?? null; // the hint's rest target: the 小招's shape
  const need = eyeFor(kit, set, bigSeq);
  let duel = duelStart(kit, { set }), held = [], hands = [], image = [], handed = [], aspect = 4 / 3;
  let wanted = false, cam = 'off', gen = 0, closed = false, loop = 0, last = 0, tried = 0, wasOn = false, wasReady = false, fps = null, firstSaid = false, wasSoon = false;
  // A cast flown: the box holds a beat in the move's light with 「成」 (Hanli 10-28: 「现在手印成了, 框…很快消失, 没看到效果」).
  const HOLD = Math.max(0, kit.helper?.hold ?? 1300);
  let holdTill = 0;
  // The player's switch (store) and his consent for a 'prompt' camera: he has read the lead line, or tapped, or chose on.
  const choice = store ?? choiceStore(win);
  let auto = choice.get() !== 'off', told = perm === 'granted' || choice.get() === 'on';
  const choose = (on) => { auto = on; wanted = on; told = told || on; tried = win.performance.now(); choice.set(on ? 'on' : 'off'); };
  const video = $('video');
  const see = (r) => { hands = r.world ?? []; image = r.image ?? []; handed = r.handed ?? []; aspect = (video.videoWidth / video.videoHeight) || aspect; };
  const eye = feed ? null : eyeOf({ video, onHands: see, env: win, ...need, handedSwap: kit.orient?.handedSwap ?? true });

  // The camera: 'off' → 'asking' → 'on'. A pause while asking wins (eye.js); a refusal or a failed model ends it here.
  const gone = (why) => { console.warn('[jieyin]', why?.reason ?? why); if (why?.reason === 'denied') choice.set('off'); close(); }; // a refusal is his choice; a failed model is not
  const camera = (run) => {
    if (!eye) { cam = run ? 'on' : 'off'; return; } // the dev feed: no camera, the hands from the console
    if (run === (cam !== 'off')) return;
    const mine = (gen += 1);
    if (!run) { cam = 'off'; eye.pause(); hands = []; image = []; handed = []; return; }
    cam = 'asking';
    eye.start().then(() => { if (mine === gen && !closed) cam = 'on'; }, gone);
  };
  const rate = (n) => { if (n !== fps) { fps = n; eye?.setFps?.(n); } }; // armed · watching · resting (kit.eye.restFps)
  const restFps = Math.max(1, kit.eye?.restFps ?? 3);

  // The 大招 under way (two of its seals made — one alone is any 推掌): its seals as chips, its next seal the target.
  const bigAt = () => (bigId ? duel.big.find((b) => b.id === bigId)?.s.at ?? 0 : 0);
  const chips = (at) => {
    const ol = $('.jyh-chips'), on = at >= 2;
    if (ol.dataset.on !== String(on)) { ol.dataset.on = String(on); ol.innerHTML = on ? bigSeq.map((id) => `<li>${plain(kit.seals[id]?.glyph ?? '')}</li>`).join('') : ''; }
    ol.querySelectorAll('li').forEach((el, i) => { el.classList.toggle('is-done', i < at); el.classList.toggle('is-next', i === at); });
  };

  // The hand's progress on a seal, to the host (onProgress): only on a change, null once no hand works.
  let prog = null, progKey = 'null';
  const mem = {};
  const tell = (p) => {
    const key = p ? `${p.move}|${p.step}|${p.of}|${Math.round(p.k * 20)}|${p.cast ? 1 : 0}` : 'null';
    prog = p;
    if (key === progKey) return;
    progKey = key;
    try { onProgress?.(p); } catch (e) { console.warn('[jieyin] progress', e); }
  };

  let shownFor = null, liveFor = null, calloutT = 0, liveT = 0;
  const hud = (st, ready, rest, away = false, still = false, now = 0) => {
    const holding = now < holdTill;
    if (!holding && dock.classList.contains('is-cast')) dock.classList.remove('is-cast');
    btn.hidden = still || holding || !st.on || (wanted && ready); // still: the host is paused (its lead card, the shell's bar) — nothing shows
    dock.hidden = still || !((wanted && st.on && ready) || holding);
    // The ready card: between the waves, the next bringing the 大妖 (st.soon) — gone as that wave starts.
    soon.hidden = still || !st.soon || st.on || (away && !side);
    soon.classList.toggle('is-cam', wanted);
    soon.querySelector('.jyh-soon-on').hidden = wanted;
    // The first time in this level (`level()`, the host's key): where the tap is still wanted (a 'prompt' camera, no lead
    // line read) the bubble on the button points at it; once the dock is open, the bubble on it says sealing is live.
    const key = level?.() ?? 'one';
    if (!btn.hidden && !away && auto && !told && key !== shownFor) { shownFor = key; callout.hidden = false; calloutT = setTimeout(() => { callout.hidden = true; }, 6000); }
    if (btn.hidden || away || wanted) callout.hidden = true;
    if (!dock.hidden && !away && cam === 'on' && key !== liveFor) { liveFor = key; live.hidden = false; liveT = setTimeout(() => { live.hidden = true; }, 6000); }
    if (dock.hidden || away) live.hidden = true;
    const lit = cam !== 'off'; // the camera's light: on the dock and on the button, whichever shows
    btn.classList.toggle('is-cam', lit);
    dock.classList.toggle('is-cam', lit);
    btn.classList.toggle('is-off', !auto);
    const label = wanted ? w.camOff : w.label;
    if (btn.title !== label) { btn.title = label; btn.setAttribute('aria-label', label); }
    btn.classList.toggle('is-ready', ready);
    btn.classList.toggle('is-rest', rest > 0);
    btn.style.setProperty('--k', String(Math.min(1, rest)));
    btn.querySelector('.jyh-word').textContent = rest > 0 ? w.rest : w.btn;
    $('.jyh-state').textContent = cam === 'asking' ? w.asking : '';
    if (dock.hidden || holding) return; // holding: the gesture made stays as it was, in its light
    const at = bigAt(), next = at >= 2 ? bigSeq[at] : shape;
    chips(at);
    hint.update({ image, aspect, target: next, progress: prog?.k ?? 0, right: false, now: win.performance.now(), world: held.length || !next ? null : hands, handed, held: heldAt(held, handed, hands.length) });
  };

  // The cues: the host's line when spells are first offered (a 大妖 out: 灵力 filled), a short one when the rest is over,
  // and the 小招's first-time line once on this device.
  // The offer is the moment the dock opens by itself — where the player keeps it on and has read that it is (consent).
  const cues = (st, ready) => {
    if (st.on && !wasOn) {
      duel = duelFill(duel, kit, 'boss');
      const line = call(); if (line) say(line);
      if (auto && told) { wanted = true; tried = win.performance.now(); } else btn.classList.add('is-call');
    }
    if (!st.on || wanted) btn.classList.remove('is-call');
    if (st.on && ready && !wasReady && wasOn && wanted) say(w.ready);
    // the 小招's how, once on this device: after the live bubble has had its say, the dock still open
    if (!firstSaid && wanted && cam === 'on' && ready && shape && first && liveFor != null && live.hidden && !dock.hidden) { firstSaid = true; if (firstTime(win)) say(tr(first, lang)); }
    if (!st.on && wasOn) wanted = false;
    // The ready card is up: a camera that opens by itself opens now, warm for the 大妖 (its red light on the card).
    if (st.soon && !st.on && !wasSoon && auto && told) { wanted = true; tried = win.performance.now(); }
    wasSoon = Boolean(st.soon && !st.on);
    wasOn = st.on;
    wasReady = ready;
  };

  // Each frame: the cues, the camera (on while wanted, offered, not paused, page seen), the duel (hands only while a
  // move may fly; 灵力 refills either way), the casts to the host, the idle close.
  const tick = () => {
    if (closed) return;
    const now = win.performance.now(), dt = Math.min(100, now - last);
    last = now;
    const st = state(), away = aside(), rest = st.cool > 0 ? st.cool / (st.coolOf || st.cool) : shortOf(duel.lingli, D.lingli.cost, tiers);
    const ready = st.ready && rest <= 0;
    const still = paused();
    if (!still) cues(st, ready); // the 大妖's call waits for the play to run
    const warm = Boolean(st.soon) && !st.on; // the ready card's camera: on before the 大妖, reading at its rest rate
    const run = wanted && (st.on || warm) && !paused() && !doc.hidden;
    camera(run);
    dockAt();
    for (const el of [btn, dock]) el.classList.toggle('is-aside', away && !side); // in the side, a card pick covers nothing of it
    const live = run && ready && !away;
    rate(live ? (tiers.xiao.length ? fastFps : need.fps) : restFps);
    if (st.on && !paused()) {
      const r = duelStep(duel, live ? { world: hands, image, handed, aspect, t: now } : { t: now }, dt, kit);
      duel = r.state;
      held = r.held;
      const p = live ? progressOf({ kit, tiers, hands: hands.length, shapes: r.shapes, spells: duel.spells?.hands, bigId, bigAt: bigAt(), bigOf: bigSeq.length, now, mem }) : null;
      let flew = null;
      for (const e of r.events) if (e.type === 'cast' && offered.has(e.move) && cast(e)) flew = e.move;
      if (flew) flown(flew, p, now);
      else tell(p);
      if (live && hands.length) tried = now;
    }
    if (!live) { tried = now; if (!(st.on && !paused())) tell(null); }
    else if (now - tried > idle * 1000) wanted = false;
    hud(st, ready, rest, away, still, now);
    loop = win.requestAnimationFrame(tick);
  };
  // A cast flew: 小满's hand bursts (onProgress), and the box blooms in the move's light and holds 「成」 (helper.css .is-cast).
  function flown(move, p, now) {
    const of = p?.move === move ? p.of : tiers.xiao.includes(move) ? 2 : tiers.fa.includes(move) ? 3 : bigSeq.length || 1;
    tell({ move, step: of, of, k: 1, cast: true });
    mem.since = null;
    holdTill = now + HOLD;
    dock.style.setProperty('--jyh-glow', glowOf(kit, move));
    dock.classList.remove('is-cast');
    void dock.offsetWidth; // the bloom plays again for a second cast inside the hold
    dock.classList.add('is-cast');
  }
  const seen = () => { if (doc.hidden) camera(false); }; // a hidden page runs no frames: off now, back via tick

  // The button is the switch (on ⇄ off, kept for this device); the dock's × switches it off.
  btn.addEventListener('click', () => { if (!state().on) return; choose(!wanted); btn.classList.remove('is-call'); callout.hidden = true; });
  soon.querySelector('.jyh-soon-on').addEventListener('click', () => { choose(true); }); // warm before the 大妖 (a 'prompt' camera asks now)
  $('.jyh-off').addEventListener('click', () => { choose(false); });
  doc.addEventListener('visibilitychange', seen);
  if (feed) win.jieyinFeed = (h, img = h, which = []) => { see({ world: h, image: img, handed: which }); aspect = 4 / 3; };
  if (feed) win.jieyinFeed.state = () => duel;
  // …and a made seal straight from the console (the live check's camera-free cast): the same way as a cast the duel read.
  if (feed) win.jieyinFeed.cast = (move = moves[0]) => {
    if (!offered.has(move) || !state().ready || !cast({ type: 'cast', move, lane: 'middle' })) return false;
    flown(move, null, win.performance.now());
    return true;
  };
  last = win.performance.now();
  loop = win.requestAnimationFrame(tick);

  function close() {
    if (closed) return;
    closed = true;
    wanted = false;
    win.cancelAnimationFrame(loop);
    tell(null);
    doc.removeEventListener('visibilitychange', seen);
    eye?.close();
    hint.destroy();
    if (feed && win.jieyinFeed) delete win.jieyinFeed;
    btn.remove();
    callout.remove();
    dock.remove();
    soon.remove();
    clearTimeout(calloutT);
    clearTimeout(liveT);
    if (eye) dropModel();
  }
  // lead(pace): the line a host puts on its lead card — said, it is the player's warning that the camera will open
  return { close, lead: (pace) => { if (!auto) return leadLine(kit, 'off', lang); told = true; return leadLine(kit, pace, lang); },
    get camera() { return cam; }, get wanted() { return wanted; }, get auto() { return auto; } };
}
