// lesson.js — 师父传印 on the page: the master's weekly lesson (看 · 跟 · 考), the daily drill (a chain of the seals he has
// learned) and the errand's lesson step (Hanli 2026-11-10: 「结印是亮点」 · 「可以，按这个做」). Mounted by games/jieyin.js when a
// deal asks `lv: 'lesson' | 'drill' | 'step'` (tasks/happenings.json chuanyin-*). What to teach is the rules' (the `seals`
// verb, through the host's seams in `data`: sealBook · sealed · shared); how the steps go is flow.js; this draws them.
//
// THE CAMERA OR NONE (Hanli's hard rule: 「不开摄像头也要能完成」). Camera: the hand hint and the judge as the 讲堂 level
// has them. No camera, a refusal, a failing model, the player's own switch off (helper.js choiceStore) or "改用点选": the
// same steps by tapping the gesture figures — 看 plays the same demonstration, 跟 taps the figure shown, 考 and the chain tap
// them in order from a tray, against the clock. The pay is the same; mastery counts half (rules/seals.mjs). It is never a
// dead end — a time out is a try again — and the only mention of the camera is one quiet line: it counts double.
//
// The reports: a lesson passed → `sealed({action:'learn', id, how, via})` (the rules answer with the share card's facts);
// a drill passed → `sealed({action:'cast', casts:'id:1,…', how})`. A card drawn in code (seal-share.js: words and the seal's
// figures, never a camera frame) can be shared, copied or saved; the act is `shared()` — the day's 传音.
//
// Contract (games/mount.js): mountLesson(container, { lang, data, signal, shell, reducedMotion }) → Promise<{ won, left? }>
import { available, dropModel, loadModel, openEye } from './eye.js';
import { sealOf, stallTracker, emitStall } from './judge.js';
import { choiceStore, permissionOf } from './helper.js';
import { eyeFor, sealsFor, setOf } from './sets.js';
import { fits, progress, start, step } from './sequence.js';
import { iconSvg } from './pose.js';
import { facingLine, handHint } from './hint.js';
import { begin, castsOf, confirm, figuresOf, left as timeLeft, limit as timeLimit, next as nextStep, offerTap, switchTo, tick, timed, trayOf, wanted } from './flow.js';
import { copyPng, savePng, shareCan, sharePng, sealBlob, sealRows } from './seal-share.js';

const LEVELS = new URL('../../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = [new URL('./jieyin.css', import.meta.url), new URL('./lesson.css', import.meta.url)];
export const LESSONS = ['lesson', 'drill', 'step'];

const W = {
  zh: { asking: '请允许摄像头……', wrong: '不是这个。', who: '褚先生' },
  en: { asking: 'Allow the camera…', wrong: 'Not that one.', who: 'Master Chu' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const fill = (tpl, o) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

function loadCss(doc) {
  for (const url of CSS) {
    if (doc.querySelector(`link[data-lesson-css="${url.pathname.split('/').pop()}"]`)) continue;
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = url.href;
    l.dataset.lessonCss = url.pathname.split('/').pop();
    doc.head.append(l);
  }
}

/** The plan the board teaches: the rules' (`data.sealBook`), asked with the deal's intent. */
async function planOf(data) {
  if (typeof data.sealBook !== 'function') return { mode: 'none' };
  try { return await data.sealBook({ action: 'plan', intent: data.lv }); } catch { return { mode: 'none' }; }
}

const shuffleBy = (seed) => (list) => {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function mountLesson(container, { lang = 'zh', data = {}, signal, shell, reducedMotion = false } = {}) {
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  lang = lang === 'en' ? 'en' : 'zh';
  const w0 = W[lang];
  loadCss(doc);
  return new Promise((resolve) => {
    let done = false, eye = null, loop = 0, offHide = null, offPause = null, offClick = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      win.cancelAnimationFrame?.(loop);
      eye?.close();
      offHide?.();
      offPause?.();
      offClick?.();
      dropModel();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const [kit, plan] = await Promise.all([fetch(LEVELS).then((r) => r.json()), planOf(data)]);
      const w = plan.words ?? {};
      if (plan.mode === 'none' || !figuresOf(plan).length) {
        container.innerHTML = `<p class="jl-none" role="status">${plain(w.noLesson ?? '')}</p>`;
        setTimeout(leave, reducedMotion ? 0 : 1600);
        return;
      }
      const set = setOf(kit, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' }), seals = sealsFor(kit, set);
      const seal = (id) => kit.seals[id];
      // The input: the camera when it can be offered and the player has not switched it off; else the taps — from the first step.
      const store = choiceStore(win), feed = new URLSearchParams(win.location?.search ?? '').get('dev') === '1' && new URLSearchParams(win.location?.search ?? '').get('feed') === '1';
      const canSee = data.camera !== false && store.get() !== 'off' && (feed || (await available(win))) && (feed || (await permissionOf(win)) !== 'denied');
      let flow = begin(plan, { input: canSee ? 'camera' : 'tap', exam: plan.exam });
      const figs = flow.figures;
      const pool = Object.keys(plan.figures ?? {});
      const shuffle = shuffleBy(`${plan.seal?.id ?? plan.seals?.map((r) => r.id).join('+')}|${Math.floor(Date.now() / 86400000)}`);
      let tray = trayOf(flow, pool, 2, shuffle), swapOffered = false;

      // ── the page ──
      const lesson = flow.kind === 'lesson', row = plan.seal;
      const title = lesson ? row.name : fill(w.drillNames, { seals: plan.seals.map((r) => r.name).join(' → ') });
      container.innerHTML = `<div class="jl" data-kind="${flow.kind}" data-phase="${flow.phase}" data-input="${flow.input}">`
        + `<header class="jl-head"><b class="jl-name">${plain(lesson ? row.name : (w.cardHead ?? ''))}</b>`
        + (lesson ? `<span class="jl-phases">${['watch', 'follow', 'exam'].map((p) => `<i data-p="${p}">${plain(w.phase?.[p] ?? p)}</i>`).join('')}</span>` : '')
        + `</header>`
        + `<p class="jl-line" role="status"></p>`
        + `<div class="jl-stage"><span class="jl-big"></span><b class="jl-bigname"></b><small class="jl-bighow"></small></div>`
        + `<ol class="jl-figs"></ol><div class="jl-tray" hidden></div>`
        + `<div class="jl-clock" hidden><i class="jl-bar"></i></div>`
        + `<div class="jl-dock"></div><p class="jl-tip" hidden></p>`
        + `<button type="button" class="gshell-btn jl-swap" hidden>${plain(w.tapInstead ?? '')}</button>`
        + `<div class="jl-card" hidden></div><video class="jl-eye" playsinline muted aria-hidden="true"></video></div>`;
      const box = container.querySelector('.jl'), $ = (s) => box.querySelector(s);
      const say = (t) => { $('.jl-line').textContent = t; };
      if (!lesson) say(title);
      const sealName = (id) => tr(seal(id)?.name, lang);
      // A tapped test (or chain) hides the answer: the slots are numbered, the figures are on the tray to find in order.
      const masked = () => flow.input === 'tap' && timed(flow);
      const chips = () => {
        $('.jl-figs').innerHTML = figs.map((id, i) => `<li data-i="${i}" class="${i < flow.at && !(flow.phase === 'watch') ? 'is-done' : ''}${i === flow.at && flow.phase !== 'watch' ? ' is-next' : ''}${flow.phase === 'watch' && i === flow.at ? ' is-show' : ''}">`
          + (masked() ? `<span class="jl-slot">${i < flow.at ? '✓' : i + 1}</span>` : `<span>${iconSvg(seal(id), 38, { lang })}</span><small>${plain(sealName(id))}</small>`) + '</li>').join('');
      };

      // ── the camera (follow, exam, chain) ──
      const video = $('video');
      let hands = [], image = [], handed = [], aspect = 4 / 3, seq = null, hint = null, camState = 'off', lastT = win.performance.now();
      const trace = stallTracker(seals, kit.judge);
      const see = (r) => { hands = r.world ?? []; image = r.image ?? []; handed = r.handed ?? []; aspect = (video.videoWidth / video.videoHeight) || aspect;
        emitStall(trace.feed({ now: win.performance.now(), want: flow.input === 'camera' && camState === 'on' && !shell?.paused?.() ? wanted(flow) : null, judged: sealOf(hands, seals, kit.judge, seq?.cur, { image, aspect }), tracked: !!hands.length, landmarks: hands[0] }), win);
      };
      const orient = { ...kit.orient, turnMs: 400 };
      const newSeq = () => { seq = start({ mode: flow.phase === 'follow' ? 'one' : 'sequence', sequence: figs, forgive: true }); };
      const ensureCamera = async () => {
        if (flow.input !== 'camera' || camState !== 'off' || flow.phase === 'watch') return;
        if (!eye) {
          hint = handHint($('.jl-dock'), { lang, size: 'large', seals, knobs: { ...kit.hint, orient } });
          if (!feed) eye = openEye({ video, onHands: see, env: win, ...eyeFor(kit, set, figs), handedSwap: kit.orient?.handedSwap ?? true });
        }
        camState = 'asking';
        say(w0.asking);
        if (feed) { win.jieyinFeed = (h, img = h, a = 4 / 3, which = []) => { hands = h ?? []; image = img ?? []; aspect = a; handed = which; }; camState = 'on'; newSeq(); render(); return; }
        try { await eye.start(); camState = 'on'; newSeq(); render(); } catch (e) { console.warn('[lesson]', e?.reason ?? e); camState = 'off'; toTaps(); }
      };
      const camOff = () => { if (camState !== 'off') { eye?.pause(); camState = 'off'; hands = []; image = []; handed = []; trace.feed({ now: win.performance.now(), want: null, tracked: false }); } };
      // The camera let go, or put aside: the same step by tapping — in place, no restart.
      function toTaps() {
        flow = switchTo(flow, 'tap');
        camOff();
        hint?.destroy?.(); hint = null;
        tray = trayOf(flow, pool, 2, shuffle);
        render();
      }
      const sight = () => { if (done) return; if (doc.hidden) camOff(); else render(); };
      doc.addEventListener('visibilitychange', sight);
      offHide = () => doc.removeEventListener('visibilitychange', sight);
      offPause = shell?.onPause?.((paused) => { if (paused) camOff(); });
      if (flow.input === 'camera') loadModel().catch(() => {}); // from disk while the master is watched

      // ── drawing the step ──
      let wrongAt = 0;
      const render = () => {
        box.dataset.phase = flow.phase;
        box.dataset.input = flow.input;
        box.querySelectorAll('.jl-phases i').forEach((el) => el.classList.toggle('is-on', el.dataset.p === flow.phase));
        chips();
        const want = wanted(flow), at = flow.phase === 'watch' ? flow.figures[flow.at] : want;
        const s = seal(at);
        const hide = masked();
        $('.jl-big').innerHTML = s && !hide ? iconSvg(s, 150, { lang }) : '';
        $('.jl-bigname').textContent = hide ? `${Math.min(flow.at + 1, figs.length)} / ${figs.length}` : s ? `${s.glyph ?? ''} ${tr(s.name, lang)}`.trim() : '';
        $('.jl-bighow').textContent = s && !hide ? (flow.phase === 'watch' ? tr(s.hint, lang) : `${tr(s.how, lang)}　${facingLine(s, lang)}`) : '';
        $('.jl-stage').classList.toggle('is-masked', hide);
        if (camState === 'asking') say(w0.asking);
        else if (lesson) {
          if (flow.phase === 'watch') say(`${w.watchLine} ${row.line}`);
          else if (flow.phase === 'follow') say(flow.input === 'tap' ? w.tapFollow : w.followLine);
          else say(flow.input === 'tap' ? w.tapExam : w.examLine);
        } else say(flow.input === 'tap' ? w.tapExam : title);
        const timedNow = timed(flow);
        $('.jl-clock').hidden = !timedNow;
        // The tray (a tap exam or chain): every figure on offer, in the order the day shuffles them.
        const showTray = flow.input === 'tap' && timedNow;
        $('.jl-tray').hidden = !showTray;
        if (showTray) $('.jl-tray').innerHTML = tray.map((id) => `<button type="button" class="jl-t" data-f="${id}"><span>${iconSvg(seal(id), 52, { lang })}</span><small>${plain(sealName(id))}</small></button>`).join('');
        // Taps on the chips themselves carry the follow step (and the demonstration goes on at a tap).
        $('.jl-dock').hidden = flow.input !== 'camera' || flow.phase === 'watch';
        const tip = $('.jl-tip');
        // The one quiet line about the camera (it counts double): in the demonstration, tapping — never a nag, never an ask.
        tip.hidden = !(flow.input === 'tap' && flow.phase === 'watch' && w.cameraTip);
        tip.textContent = w.cameraTip ?? '';
        $('.jl-swap').hidden = !(flow.input === 'camera' && (offerTap(flow) || swapOffered));
        if (flow.input === 'camera') ensureCamera();
      };

      // ── events from the flow ──
      const apply = (r) => {
        const was = flow;
        flow = r.state;
        if (!r.events.length && flow.phase === was.phase && flow.at === was.at) return;
        for (const e of r.events) {
          shell?.sound?.(e.type === 'passed' ? 'done' : e.type === 'timeout' || e.type === 'wrong' ? 'miss' : 'seal');
          if (e.type === 'timeout') { swapOffered = swapOffered || offerTap(flow); if (flow.input === 'tap') tray = trayOf(flow, pool, 2, shuffle); }
          if (e.type === 'wrong') { const b = box.querySelector('.jl-figs li.is-next, .jl-tray'); b?.classList.remove('is-shake'); void b?.offsetWidth; b?.classList.add('is-shake'); }
        }
        if (flow.input === 'camera' && camState === 'on' && (flow.phase !== was.phase || r.events.some((e) => e.type === 'timeout'))) newSeq(); // a new phase or try: the hold counted again
        if (r.events.some((e) => e.type === 'passed')) { passed(); return; }
        render();
        if (r.events.some((e) => e.type === 'timeout') && w.timeout) say(w.timeout);
        if (r.events.some((e) => e.type === 'wrong')) say(w0.wrong);
      };

      // ── passed: the report, the card ──
      const how = () => (flow.input === 'tap' ? 'tap' : 'hands');
      async function passed() {
        camOff();
        let card = null;
        if (lesson) {
          const r = await Promise.resolve(data.sealed?.({ action: 'learn', id: row.id, how: how(), via: data.lv === 'step' ? 'step' : 'lesson' })).catch(() => null);
          card = r?.ok ? r.card ?? null : null;
          say(fill(w.passed, { name: row.name }));
        } else {
          await Promise.resolve(data.sealed?.({ action: 'cast', casts: castsOf(plan).map((id) => `${id}:1`).join(','), how: how() })).catch(() => null);
          say(w.drillDone);
        }
        $('.jl-tray').hidden = true; $('.jl-clock').hidden = true; $('.jl-dock').hidden = true; $('.jl-figs').hidden = false;
        await showCard(card);
      }
      async function showCard(card) {
        const el = $('.jl-card');
        el.hidden = false;
        const rows = card ? sealRows(card) : [];
        const can = shareCan(), parts = [];
        let blob = null;
        if (rows.length) { try { blob = await sealBlob(rows, doc); } catch { blob = null; } }
        if (blob) {
          if (data.shareImage || can.share) parts.push(['share', w.share]);
          if (!data.shareImage && can.copy) parts.push(['copy', w.copy]);
          if (!data.shareImage) parts.push(['save', w.save]);
        }
        // 「印谱」: the sheet of what he has learned, one tap from the card (the host opens it — the 储物袋's pane, the phone's sheet).
        if (typeof data.openBook === 'function') parts.push(['book', w.sheet]);
        el.innerHTML = parts.map(([k, t]) => `<button type="button" class="gshell-btn jl-act" data-act="${k}">${plain(t)}</button>`).join('') + `<button type="button" class="gshell-btn is-main jl-go">${plain(w.leave)}</button>`;
        el.querySelectorAll('.jl-act').forEach((b) => b.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (b.dataset.act === 'book') { Promise.resolve(data.openBook()).catch(() => {}); return; }
          try {
            if (b.dataset.act === 'share') { if (data.shareImage) await data.shareImage(blob, card); else await sharePng(blob, card); }
            else if (b.dataset.act === 'copy') await copyPng(blob);
            else savePng(blob, card, doc);
            Promise.resolve(data.shared?.()).catch(() => {});
          } catch { /* cancelled in the sheet: nothing counted */ }
        }));
        el.querySelector('.jl-go').addEventListener('click', (e) => { e.stopPropagation(); finish({ won: true }); });
      }

      // ── input ──
      const onClick = (e) => {
        if (done || flow.done) return;
        if (e.target.closest('.jl-swap')) { toTaps(); return; }
        const f = e.target.closest('[data-f]')?.dataset.f, li = e.target.closest('.jl-figs li');
        if (flow.phase === 'watch') { apply(nextStep(flow)); return; }
        if (flow.input !== 'tap') return;
        if (f) { apply(confirm(flow, f)); return; }
        if (li && flow.phase === 'follow') apply(confirm(flow, figs[Number(li.dataset.i)]));
      };
      box.addEventListener('click', onClick);
      offClick = () => box.removeEventListener('click', onClick);

      // ── the clock ──
      const frame = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - lastT);
        lastT = now;
        if (!shell?.paused?.() && !flow.done) {
          apply(tick(flow, dt));
          if (flow.input === 'camera' && camState === 'on' && seq && !flow.done) {
            const r = step(seq, sealOf(hands, seals, kit.judge, seq.cur, { image, aspect }), dt, kit.judge);
            seq = r.state;
            if (r.events.some((ev) => ev.type === 'seal')) trace.feed({ now, want: null, tracked: false });
            for (const ev of r.events) if (ev.type === 'seal') apply(confirm(flow));
            hint?.update({ image, aspect, target: wanted(flow), progress: fits(seq, seq.cur, kit.judge) ? progress(seq, kit.judge) : 0, right: fits(seq, seq.cur, kit.judge), now, world: hands, handed, held: [] });
          }
          if (timed(flow)) $('.jl-bar').style.width = `${Math.round((timeLeft(flow) / timeLimit(flow)) * 100)}%`;
          $('.jl-swap').hidden = !(flow.input === 'camera' && (offerTap(flow) || swapOffered));
        }
        loop = win.requestAnimationFrame(frame);
      };
      render();
      loop = win.requestAnimationFrame(frame);
    })().catch((e) => { console.warn('[lesson]', e); leave(); });
  });
}
