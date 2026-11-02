// qian-page.js — 问签's page side (rules/fortune.mjs; the card is qian-card.js): the shake (a tap on the Mac; on a
// phone the device's own shake, asked for on iOS inside the tap, or a tap), the draw through the rules, 银月's reading
// as facts (her rules: guide/qian.md § 银月 · 解签 — the facts are the rules', the words hers), the evening's 应验
// question once, and the 签谱. lingjing.js makes one with its own helpers.

const SHAKE_MS = 1300; //    the tube shakes this long before the 签 drops
const JOLT = 18; //          m/s² over gravity, twice within the window, counts as a shake
const JOLT_WINDOW_MS = 900;

/* 银月's rules for the reading, read once from guide/qian.md (the section `## 银月 · 解签`); a short fallback inline. */
const FALLBACK = '解签：一句，≤80字，俏皮；游戏里说今日修为倍数与宜的玩法；生活里只说宜/忌，钱、病、官司只说宜谨慎；下签也落到一件今天做得到的小事上。';
let rules = null;
async function herRules() {
  if (rules) return rules;
  try {
    const text = await (await fetch('../guide/qian.md')).text();
    const m = /## 银月 · 解签\n([\s\S]*?)(?=\n## |$)/.exec(text);
    rules = m ? m[1].trim() : FALLBACK;
  } catch { rules = FALLBACK; }
  return rules;
}

/* The facts of the day's 签, as the rules gave them — never a word of what they mean. */
export function qianFacts(d, zh) {
  const al = d.almanac;
  const list = (xs) => (xs?.length ? xs.map((x) => x.name).join('、') : zh ? '无' : 'none');
  const day = al ? (zh
    ? `黄历：${al.ganzhi.year}年 ${al.ganzhi.month}月 ${al.ganzhi.day}日，${al.officer.name}日，冲${al.chong.name ?? al.chong.branch}，煞${al.sha.name}；宜：${list(al.yi)}；忌：${list(al.ji)}。`
    : `Almanac: ${al.ganzhi.day} day of ${al.ganzhi.month} month, ${al.ganzhi.year} year; officer ${al.officer.name}; clashes with the ${al.chong.name ?? al.chong.branch}; 煞 ${al.sha.name}; good for: ${list(al.yi)}; avoid: ${list(al.ji)}.`) : '';
  const signs = d.signs ? (zh
    ? `他属${d.signs.zodiac.name}${d.signs.sign ? `，${d.signs.sign.name}` : ''}${d.clash ? `（今日正冲${d.signs.zodiac.name}）` : ''}。`
    : `He is a ${d.signs.zodiac.name}${d.signs.sign ? `, ${d.signs.sign.name}` : ''}${d.clash ? ' (today clashes with his animal)' : ''}.`) : (zh ? '他没留生辰。' : 'He gave no birthday.');
  const asked = d.ask || d.ask_text ? (zh ? `他问的是：${[d.ask?.name, d.ask_text].filter(Boolean).join('·')}。` : `He asked about: ${[d.ask?.name, d.ask_text].filter(Boolean).join(' · ')}.`) : (zh ? '他没说问什么。' : 'He asked nothing in particular.');
  const game = zh
    ? `游戏里：今日修为 ×${d.speed}${d.yi ? `；宜${d.yi.name}（${d.yi.games}），这类玩法修为 ×${d.yi.pay}` : ''}。`
    : `In the game: cultivation ×${d.speed} today${d.yi ? `; good for ${d.yi.name} (${d.yi.games}), that kind pays ×${d.yi.pay}` : ''}.`;
  const poem = zh ? `签诗：${d.poem.join('，')}。` : `The verse: ${d.poem.join(' / ')}${d.gloss ? ` (plainly: ${d.gloss})` : ''}.`;
  return zh
    ? `他刚摇了今日的签：第${d.n}签，${d.grade.name}。${poem}${day}${signs}${asked}${game}`
    : `He has just drawn today's fortune stick: no. ${d.n}, ${d.grade.name}. ${poem} ${day} ${signs} ${asked} ${game}`;
}

export function createQianPage({ write, refresh, show, keep, view, askHer, tellHer, herHere, lang, refusal, failed }) {
  let motionOn = false, jolts = [];

  /* A phone's shake: the motion listener, asked for (iOS) inside the tap that first wants it. */
  function onMotion(e) {
    const a = e.accelerationIncludingGravity ?? e.acceleration;
    if (!a || view.qianShaking || !document.querySelector('[data-qian-shake]')) return;
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

  /* 摇签: the tube shakes, the rules draw, the 签 drops and its verse inks in; 银月 reads it if she is here. */
  async function shake() {
    if (view.qianShaking) return;
    show({ qianShaking: true });
    const args = { ...(view.qianAsk ? { ask: view.qianAsk } : {}), ...(view.qianAskText ? { ask_text: view.qianAskText } : {}) };
    const [r] = await Promise.all([write('divine', args).catch(failed), new Promise((ok) => setTimeout(ok, SHAKE_MS))]);
    if (!r.ok && r.refused !== 'cast-today') keep({ doNote: refusal(r) });
    // The 签 drops into the top bar's popover: the stage gives the 签筒's place back, the verse inks in up there.
    keep({ qianShaking: false, qianAsk: null, qianAskText: '', qianOpen: Boolean(r.ok) || view.qianOpen });
    await refresh();
  }
  /* The first tap also asks the phone for its motion (iOS wants it inside a tap); the tap itself shakes. */
  function tap() {
    listenMotion();
    return shake();
  }

  /* 银月 reads the 签 just drawn: the facts, and her rules from the guide. Not here: the card stands alone. */
  async function reading(d) {
    if (!d?.poem || !herHere()) return;
    const zh = lang() !== 'en', how = await herRules(), facts = qianFacts(d, zh);
    const layers = zh
      ? `替他解这支签：一段话，两层——先一句游戏里的（照着说：今日修为 ×${d.speed}${d.yi ? `、宜${d.yi.name}` : ''}）；再一句生活里的（拿他的生肖对今天的黄历：冲不冲、宜什么忌什么，再落到他问的事上）。像平时逗他那样俏皮，总共不过八十字。`
      : `Read this stick for him in one short paragraph, two layers: first the game (say it as given: cultivation ×${d.speed} today${d.yi ? `, good for ${d.yi.name}` : ''}); then life (his animal against today's almanac — a clash or not, what is good or to avoid — landing on what he asked). Playful, as you tease him; about 40 words.`;
    const text = `${facts}\n${layers}\n${zh ? '解签的规矩' : 'How to read it'}：${how}`;
    const mood = { great: 'happy', even: 'relaxed', ill: 'sad' }[d.grade.tone] ?? 'neutral';
    askHer('reading', text, text, mood);
  }

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

  return { tap, shake, reading, evening, book };
}
