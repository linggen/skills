// couplet.js — 对对子's form, checked the same on the page (as he types) and in
// the rules (on submit): rules/duizi.mjs imports it, and so does the card. No
// file, no network: the 平仄 table is worlds/<id>/tones.json, handed in.
//
// 新韵: tones 1–2 are 平, 3–4 仄 (tools/tone-table.py). A polyphone that may be
// either (`B`) or a character the table does not know is never failed — when
// unsure, the player is not. Each check says `ok`, `bad`, `unsure` or `wait`
// (nothing to check yet); the form holds when none is `bad`.

const HAN = /\p{Script=Han}/u;
export const hanOf = (s) => [...String(s ?? '')].filter((c) => HAN.test(c));

/* The table as a lookup, built once per table. */
const LOOKUP = new WeakMap();
function lookupOf(tones) {
  if (!tones || typeof tones !== 'object') return new Map();
  if (!LOOKUP.has(tones)) {
    const m = new Map();
    for (const side of ['P', 'Z', 'B']) for (const c of String(tones[side] ?? '')) m.set(c, side);
    LOOKUP.set(tones, m);
  }
  return LOOKUP.get(tones);
}
/* 'P' 平 · 'Z' 仄 · 'B' either · null unknown. */
export const toneOf = (tones, ch) => lookupOf(tones).get(ch) ?? null;
/* The tail's verdict for a line that should end on `want` ('P' or 'Z'). */
const TAIL = { P: { P: 'ok', Z: 'bad' }, Z: { Z: 'ok', P: 'bad' } };
export const tailOf = (tones, ch, want) => (ch ? TAIL[want][toneOf(tones, ch)] ?? 'unsure' : 'wait');

/* The 上联's characters the 下联 reuses — distinct, past the free ones. */
export const sharedOf = (up, down, free = '') => [...new Set(down.filter((c) => up.includes(c) && !free.includes(c)))];

/* Each check, by id, over {up, down, tones, allow, free} (han arrays). */
const CHECKS = [
  { id: 'len', of: (x) => (x.down.length === x.up.length ? 'ok' : x.down.length < x.up.length ? 'wait' : 'bad') },
  { id: 'tail', of: (x) => (x.down.length === x.up.length ? tailOf(x.tones, x.down.at(-1), 'P') : 'wait') },
  { id: 'same', of: (x) => (x.down.some((c, i) => c === x.up[i]) ? 'bad' : x.down.length ? 'ok' : 'wait') },
  { id: 'copy', of: (x) => (sharedOf(x.up, x.down, x.free).length > x.allow ? 'bad' : x.down.length ? 'ok' : 'wait') },
];
export const CHECK_IDS = CHECKS.map((c) => c.id);

/* The form of a 下联 against its 上联: each check's verdict, the characters
   shared, and whether it holds (`ok`: none bad, none waiting). */
export function checkCouplet(tones, up, down, { allow = 0, free = '' } = {}) {
  const x = { up: hanOf(up), down: hanOf(down), tones, allow, free };
  const checks = Object.fromEntries(CHECKS.map((c) => [c.id, c.of(x)]));
  const verdicts = Object.values(checks);
  return { n: x.up.length, have: x.down.length, checks, shared: sharedOf(x.up, x.down, free), ok: !verdicts.includes('bad') && !verdicts.includes('wait'), ready: checks.len === 'ok' };
}

/* A 上联 he gives (the reverse game): its length and its tail, which should
   be 仄 — told, never refused. */
export function checkUpper(tones, up, max) {
  const u = hanOf(up);
  return { n: u.length, fits: u.length >= 1 && u.length <= max, tail: u.length ? tailOf(tones, u.at(-1), 'Z') : 'wait' };
}
