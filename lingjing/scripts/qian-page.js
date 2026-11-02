// qian-page.js — 问签's page side (rules/fortune.mjs; the card is qian-card.js + qian-reading.js): the shake (a tap on
// the Mac; on a phone the device's own shake, asked for on iOS inside the tap, or a tap), the draw through the rules,
// 银月's one line as facts (qian-facts.js; her rules: guide/qian.md § 银月 · 解签 — the facts are the rules', the words
// hers), kept on the card for the day (this browser's, never the save), 替人求签, the share image (qian-share.js) made
// before any tap, the evening's 应验 question once, and the 签谱. lingjing.js makes one with its own helpers.
import { friendFacts, herLineClean, qianFacts } from './qian-facts.js';
import { copyPng, savePng, shareBlob, shareCan, shareLines, sharePng } from './qian-share.js';


const SHAKE_MS = 1300; //    the tube shakes this long before the 签 drops
const JOLT = 18; //          m/s² over gravity, twice within the window, counts as a shake
const JOLT_WINDOW_MS = 900;
const STUCK_MS = 45000; //   a shake never answered by then (the channel's own timeout is 30 s) is taken as lost

export { qianFacts };

/* 银月's line on a card, this browser's, by save · day · whose — her words are never written into the save. */
const lineKey = (who, d) => `lingjing:qian-her:${who}:${d?.day ?? ''}:${d?.n ?? ''}`;

export function createQianPage({ write, refresh, show, keep, view, herLine, herHere, lang, refusal, failed, tellHer, saveKey = () => '', playerName = () => null }) {
  let motionOn = false, jolts = [];
  const store = {
    get: (k) => { try { return localStorage.getItem(`${saveKey()}|${k}`); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(`${saveKey()}|${k}`, v); } catch { /* a private window: the line lives this page only */ } },
  };

  /* A phone's shake: the motion listener, asked for (iOS) inside the tap that first wants it. */
  function onMotion(e) {
    const a = e.accelerationIncludingGravity ?? e.acceleration;
    if (!a || (view.qianShaking && Date.now() - (view.qianShakeAt ?? 0) < STUCK_MS) || !document.querySelector('[data-qian-shake]')) return;
    const g = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) - (e.accelerationIncludingGravity ? 9.8 : 0);
    const t = Date.now();
    if (g < JOLT) return;
    jolts = [...jolts.filter((x) => t - x < JOLT_WINDOW_MS), t];
    if (jolts.length >= 2) { jolts = []; shake(); }
  }
  async function listenMotion() {
    if (motionOn || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function' && (await DeviceMotionEvent.requestPermission()) !== 'granted') return;
    } catch { return; }
    window.addEventListener('devicemotion', onMotion);
    motionOn = true;
  }

  /* 摇签: the tube shakes, the rules draw, the 签 drops and its verse inks in; 银月 reads it if she is here.
     The draw is asked before anything is painted, and the shake always ends (live, Hanli 2026-11-02 「点按钮也没反应」:
     a shake that threw between its start and its end left `qianShaking` set, and every later tap returned at the
     first line). A shake older than STUCK_MS is taken as lost: the next tap draws again. What went wrong is said on
     the card itself. 问签 v2: nothing is asked first. */
  async function shake() {
    if (view.qianShaking && Date.now() - (view.qianShakeAt ?? 0) < STUCK_MS) return;
    keep({ qianShaking: true, qianShakeAt: Date.now(), qianNote: null });
    const drawing = Promise.resolve().then(() => write('divine', {})).catch(failed);
    try { show({}); } catch (e) { console.warn('[lingjing] qian paint', e); }
    let r = { ok: false };
    try {
      [r] = await Promise.all([drawing, new Promise((ok) => setTimeout(ok, SHAKE_MS))]);
    } finally {
      const note = r?.ok || r?.refused === 'cast-today' ? null : refusal(r ?? {});
      // The 签 drops into the top bar's popover: the stage gives the 签筒's place back, the verse inks in up there.
      keep({ qianShaking: false, qianShakeAt: 0, qianNote: note, ...(note ? { doNote: note } : {}), qianOpen: Boolean(r?.ok) || view.qianOpen });
    }
    await refresh();
  }
  /* The first tap also asks the phone for its motion (iOS wants it inside a tap); the tap itself shakes. */
  function tap() {
    listenMotion();
    return shake();
  }

  /* The share image of a card ('mine' | 'friend'), made as soon as the card can say all it says — before any tap
     (Safari shares and copies only inside the tap itself). */
  const pngs = {};
  async function prepare(who) {
    const d = who === 'friend' ? view.qianFriend : view.qianMine;
    if (!d?.poem) return;
    const her = who === 'friend' ? view.qianFriendHer : view.qianHer;
    const rows = shareLines(d, { friend: who === 'friend' ? d.name : null, her: her ?? null, lang: lang() });
    const key = JSON.stringify(rows);
    if (pngs[who]?.key === key) return;
    try {
      const blob = await shareBlob(rows);
      pngs[who] = { key, blob, d };
      show({ qianPngReady: { ...(view.qianPngReady ?? {}), [who]: true }, qianCan: shareCan() });
    } catch (e) { console.warn('[lingjing] qian png', e); }
  }

  /* 银月 reads the 签 just drawn — or, the card opened again, her line of today comes back from this browser. */
  async function reading(d, { fresh = false } = {}) {
    if (!d?.poem) return;
    keep({ qianMine: d });
    const had = store.get(lineKey('mine', d));
    if (had) { show({ qianHer: had, qianHerWaiting: false }); prepare('mine'); return; }
    prepare('mine');
    if (!fresh || !herHere()) return;
    const zh = lang() !== 'en', mood = { great: 'happy', even: 'relaxed', ill: 'sad' }[d.grade.tone] ?? 'neutral';
    show({ qianHerWaiting: true });
    const line = herLineClean(await herLine('reading', qianFacts(d, zh), mood), playerName());
    if (line) { store.set(lineKey('mine', d), line); show({ qianHer: line, qianHerWaiting: false }); prepare('mine'); } else show({ qianHerWaiting: false });
  }

  /* 替人求签: the form opened or closed; the 称呼, the birthday and 不保存 as typed (read when 求一签 is tapped). */
  function friendOpen(open) { show({ qianFriendOpen: open, qianFriendNote: null, ...(open ? {} : { qianFriendName: '', qianFriendBirth: '' }) }); }
  function friendBack() { show({ qianFriend: null, qianFriendHer: null, qianFriendOpen: false }); }
  async function friendAsk(name) {
    const birth = name ? '' : view.qianFriendBirth ?? '', who = (name ?? view.qianFriendName ?? '').trim();
    if (!who) return;
    const r = await write('divine', { action: 'friend', name: who, ...(birth ? { birth } : {}), keep: !view.qianFriendNoKeep }).catch(failed);
    if (!r.ok) { show({ qianFriendNote: refusal(r) }); return; }
    const f = r.friend, had = store.get(lineKey(`friend:${f.name}`, f));
    // The birthday typed is let go at once: it lives in the form only until the 签 is drawn.
    keep({ qianFriend: f, qianFriendHer: had ?? null, qianFriendFresh: true, qianFriendOpen: false, qianFriendName: '', qianFriendBirth: '', qianFriendNote: null });
    await refresh();
    prepare('friend');
    if (had || !herHere()) return;
    show({ qianFriendWaiting: true });
    const line = herLineClean(await herLine('reading', friendFacts(f, lang() !== 'en'), 'relaxed'), playerName());
    if (view.qianFriend?.name !== f.name) return;
    if (line) { store.set(lineKey(`friend:${f.name}`, f), line); show({ qianFriendHer: line, qianFriendWaiting: false }); prepare('friend'); } else show({ qianFriendWaiting: false });
  }
  async function friendForget(name) {
    const r = await write('divine', { action: 'forget_friend', name }).catch(failed);
    if (!r.ok) show({ qianFriendNote: refusal(r) }); else await refresh();
  }

  /* 分享 · 拷贝图片 · 保存图片 — inside the tap, with the picture already made. Whatever was done, the picture is
     shown too (a shell that saves nothing still lets him take it from there). */
  function shareTap(kind, who) {
    const p = pngs[who];
    if (!p) return;
    const done = (what) => show({ qianShareNote: { who, what }, qianShown: { who, url: shownUrl(p.blob) } });
    const fail = (e) => { if (e?.name !== 'AbortError') { console.warn('[lingjing] qian share', e); done('shareFail'); } };
    try {
      if (kind === 'share') sharePng(p.blob, p.d, who === 'friend').then(() => done('shared'), fail);
      else if (kind === 'copy') copyPng(p.blob).then(() => done('copied'), fail);
      // A sandboxed frame without allow-downloads (the launcher's, Linggen.app's) saves nothing: say so, show the picture.
      else if (!downloadsAllowed()) done('saveBlocked');
      else { savePng(p.blob, p.d, who === 'friend'); done('saved'); }
    } catch (e) { fail(e); }
  }
  function downloadsAllowed() {
    try { const sb = window.frameElement?.sandbox; return !sb || !sb.length || sb.contains('allow-downloads'); } catch { return true; }
  }
  let shown = null;
  function shownUrl(blob) { if (shown) URL.revokeObjectURL(shown); shown = URL.createObjectURL(blob); return shown; }

  /* The evening's 应验 question, once a day: she hears the day's 宜 and may ask; the rules mark it asked. */
  let askedOn = null;
  async function evening(look) {
    const d = look?.divination, yy = d?.yingyan;
    if (!yy?.open || yy.asked || !herHere() || askedOn === look?.today?.date) return;
    askedOn = look?.today?.date ?? 'today';
    const r = await write('divine', { action: 'asked' }).catch(() => ({ ok: false }));
    if (!r.ok) return;
    const zh = lang() !== 'en', yi = d.almanac?.yi?.map((x) => x.name).join('、');
    const what = zh
      ? `傍晚了。今天他抽的是第${d.n}签（${d.grade.name}），黄历宜：${yi || '无'}；游戏里宜${d.yi?.name ?? ''}。你可以轻轻问他一句：今天应验了吗？（比如「今天宜会友，见到谁了吗？」）只问一次；他答了，就用 Qian 工具 action verify、said 记下他的话。他不答也不追。`
      : `It is evening. Today he drew stick ${d.n} (${d.grade.name}); the almanac says good for: ${yi || 'nothing much'}; in the game, good for ${d.yi?.name ?? ''}. You may lightly ask him once whether it came true. If he answers, keep his words with the Qian tool (action verify, said). If not, let it go.`;
    tellHer('yingyan', what, what, { mood: 'relaxed' });
  }

  /* 签谱: read from the rules when opened. */
  async function book(open) {
    if (!open) { show({ qianBookOpen: false }); return; }
    const r = await write('divine', { action: 'book' }).catch(failed);
    show({ qianBookOpen: Boolean(r.ok), qianBook: r.ok ? r.book : null });
  }

  return { tap, shake, reading, evening, book, prepare, friendOpen, friendBack, friendAsk, friendForget, shareTap };
}
