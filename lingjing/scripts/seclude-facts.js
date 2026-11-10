// seclude-facts.js — 闭关's facts as 银月 is handed them, one place for the Mac's page (lingjing.js emerge →
// voice.js `emerge`) and the phone's bundle (tools/phone/entry.mjs `Lingjing.her('emerge', look, {result})`).
// The rules' own numbers (rules/seclusion.mjs `seclude leave` → `emerged`), never a word of hers: her line is hers,
// and SILENT is hers to say too.
// Pure: no DOM, no fetch.

/* What a 闭关 works on, when the rules give no name of its own (the page's chooser says the same: cards.js WORDS). */
export const SECLUDE_FOCI = {
  zh: { card: '法术', progress: '修为', treasure: '本命法宝' },
  en: { card: 'a spell', progress: 'cultivation', treasure: 'the treasure' },
};

/* The focus as told: the spell's own name, else the focus's word. */
export const focusName = (e, zh) => (e?.focus === 'card' && e.card?.name ? e.card.name : SECLUDE_FOCI[zh ? 'zh' : 'en'][e?.focus] ?? e?.focus ?? '');

/* What 出关 grew, one fact each (each null when it did not grow) — a new kind of growth is a row here. */
const GREW = [
  (e, zh) => (e.grows && e.card && e.card.to > e.card.from ? (zh ? `${e.card.name}练到了${e.card.to}星` : `${e.card.name} reached ${e.card.to} star${e.card.to > 1 ? 's' : ''}`) : null),
  (e, zh) => (e.grows && e.progress?.paid ? (zh ? `修为 +${e.progress.paid}` : `cultivation +${e.progress.paid}`) : null),
  (e, zh) => (e.grows && e.treasure && e.treasure.to > e.treasure.from ? (zh ? `${e.treasure.name}长到了${e.treasure.to}重` : `${e.treasure.name} grew to layer ${e.treasure.to}`) : null),
  (e, zh) => (e.grows ? null : zh ? '时辰太短，没长什么' : 'too short for anything to grow'),
  (e, zh) => (e.rested ? (zh ? '体力回满' : 'stamina full') : null),
];

/* 出关's facts: the hours, the focus, and what grew. Null with no `emerged` in hand. */
export function emergeFacts(e, zh) {
  if (!e || e.hours == null) return null;
  const head = zh ? `玩家刚出关：闭关 ${e.hours} 小时，专心修${focusName(e, true)}` : `The player has just come out of seclusion: ${e.hours} h, working on ${focusName(e, false)}`;
  const parts = [head, ...GREW.map((f) => f(e, zh)).filter(Boolean)];
  return zh ? `${parts.join('，')}。` : `${parts.join('; ')}.`;
}
