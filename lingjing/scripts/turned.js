// turned.js — what a 交差 paid, said where it was tapped (live, 2026-10-15: inside the 事
// book a 开府 milestone handed in changed nothing he could see — the 灵石 rose under the
// popover, and a 修为 held by the realm's cap was never said). Pure: no DOM.

/// How long the line stands in the book after the tap.
export const TURNED_MS = 4500;
/// How long the stage's 所得 card stands before it goes by itself (Hanli, 2026-10-15: an old
/// 「交差 · 修屋顶」 card stood on through several taps).
export const HANDED_STAY_MS = 7000;

/* Since 8f112416 a full mark holds nothing back (state.mjs addProgress: `held` 0, the bar counts
   on past it); the one 修为 still not taken is 零层's, before the 小周天 (`hold.zero`). */
const WORDS = {
  zh: { zero: '零层 · 修为未入' },
  en: { zero: 'Stage zero · cultivation not taken' },
};

/// The pay of one hand-in, as a line: what came in, and the 修为 零层 does not take.
export function turnedPays(paid, w, lang) {
  const t = WORDS[lang] ?? WORDS.zh, p = paid ?? {};
  return [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : '', p.hold?.zero && p.hold.held ? t.zero : ''].filter(Boolean);
}

/// The 所得 card has stood long enough: every row on it older than HANDED_STAY_MS.
export const handedStale = (handed, ageOf) => (handed ?? []).length > 0 && handed.every((h) => ageOf(h.id) > HANDED_STAY_MS);
