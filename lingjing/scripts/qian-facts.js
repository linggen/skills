// qian-facts.js — 问签 v2: the facts of a reading as 银月 is handed them (the Mac's qian-page.js and the phone's bundle,
// tools/phone/entry.mjs `Lingjing.her('qian' | 'qian_friend', …)`). Facts only, never a word of what they mean: her
// line is hers (guide/qian.md § 银月 · 解签). Her line lands on the card and on the share image, so she is told to use
// no name and nothing of his save — only the signs against today.
// Pure: no DOM, no fetch.

const list = (xs, zh) => (xs?.length ? xs.map((x) => x.name).join(zh ? '、' : ', ') : zh ? '无' : 'none');

/* The engine keeps 300 characters of a moment (src/server/api/yinyue.rs EVENT_TEXT_MAX), his 名字 line in front:
   the ask goes first and the facts after it, cut to fit. */
export const FACTS_MAX = 270;
const cut = (t, max = FACTS_MAX) => ([...t].length > max ? `${[...t].slice(0, max - 1).join('')}…` : t);

/* The day's 黄历, short. */
export function almanacFact(al, zh) {
  if (!al) return '';
  return zh
    ? `黄历：${al.ganzhi.day}日，${al.officer.name}日，冲${al.chong.name ?? al.chong.branch}；宜${list(al.yi, zh)}；忌${list(al.ji, zh)}。`
    : `Almanac: ${al.officer.name} day, clashes with the ${al.chong.name ?? al.chong.branch}; good for ${list(al.yi, zh)}; avoid ${list(al.ji, zh)}.`;
}

/* The 五项 as the card shows them. */
export const aspectsFact = (d, zh) => (d.aspects?.length ? (zh ? `五项：${d.aspects.map((a) => `${a.name}${a.line}`).join('；')}。` : `The five: ${d.aspects.map((a) => `${a.name}: ${a.line}`).join('; ')}.`) : '');

/* Whose signs, against today. */
function signsFact(d, zh, friend) {
  const who = friend ? (zh ? '那位朋友' : 'The friend') : zh ? '他' : 'He';
  if (!d.signs) return friend ? (zh ? '那位朋友没给生辰。' : 'No birthday given for the friend.') : zh ? '他没留生辰。' : 'He gave no birthday.';
  const s = d.signs;
  return zh
    ? `${who}属${s.zodiac.name}${s.sign ? `，${s.sign.name}` : ''}${d.clash ? `，今日正冲${s.zodiac.name}` : '，今日不冲'}。`
    : `${who} is a ${s.zodiac.name}${s.sign ? `, ${s.sign.name}` : ''}${d.clash ? '; today clashes with that animal' : '; no clash today'}.`;
}

const qianFact = (d, zh) => (zh ? `第${d.n}签，${d.grade.name}。` : `Stick ${d.n}, ${d.grade.name}.`);

/* What she is asked to write: ONE line, the signs against today (guide/qian.md § 银月 · 解签, in short). */
export function qianAsk(d, zh, { friend = false } = {}) {
  if (friend) {
    return zh
      ? '他替一位朋友求了签。替那位朋友解一句（「你那位朋友属牛……」）：朋友的生肖对今日黄历，落到下面五项的一件小事；只说宜忌，钱病讼只说宜谨慎；不过四十字，不提名字。'
      : 'He drew a stick for a friend. One line about the friend ("your friend, an Ox…"): their animal against today, landing on one of the five below; 宜/忌 only; ~20 words, no name.';
  }
  return zh
    ? '他刚摇了今日的签。给他解一句：拿他的生肖对今日黄历，落到下面五项的一件小事；下签也落到今天做得到的事；只说宜忌，钱病讼只说宜谨慎；不过四十字，不提名字。'
    : 'He just drew today\'s stick. One line: his animal against today\'s almanac, landing on one of the five below; a bad stick lands on something doable; 宜/忌 only; ~20 words, no name.';
}

/* His own reading, as she is handed it. */
export const qianFacts = (d, zh) => cut([qianAsk(d, zh), qianFact(d, zh), signsFact(d, zh, false), almanacFact(d.almanac, zh), aspectsFact(d, zh)].join(zh ? '' : ' '));
/* A friend's (替人求签): the friend's signs; the 称呼 never — the card says it itself. */
export const friendFacts = (f, zh) => cut([qianAsk(f, zh, { friend: true }), qianFact(f, zh), signsFact(f, zh, true), almanacFact(f.almanac, zh), aspectsFact(f, zh)].join(zh ? '' : ' '));

/* Her line as the card and the picture keep it: his 名字 never stands in it (the moment's text names him to her —
   rules of the chat — and the picture may go to others), put as 「你」/"you". */
export function herLineClean(line, name) {
  const t = String(line ?? '').trim();
  if (!t) return null;
  const n = String(name ?? '').trim();
  return n.length >= 1 && t.includes(n) ? t.split(n).join(/[\u4e00-\u9fff]/.test(t) ? '你' : 'you') : t;
}
