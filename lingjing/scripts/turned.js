// turned.js — what a 交差 paid, said where it was tapped (live, 2026-10-15: inside the 事
// book a 开府 milestone handed in changed nothing he could see — the 灵石 rose under the
// popover, and a 修为 held by the realm's cap was never said). Pure: no DOM.

/// How long the line stands in the book after the tap.
export const TURNED_MS = 4500;
/// How long the stage's 所得 card stands before it goes by itself (Hanli, 2026-10-15: an old
/// 「交差 · 修屋顶」 card stood on through several taps).
export const HANDED_STAY_MS = 7000;

const WORDS = {
  zh: { held: '修为已满，未入' },
  en: { held: 'cultivation full — not added' },
};

/// The pay of one hand-in, as a line: what came in, and the 修为 the cap held back.
export function turnedPays(paid, w, lang) {
  const t = WORDS[lang] ?? WORDS.zh, p = paid ?? {};
  return [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : '', p.hold?.held ? t.held : ''].filter(Boolean);
}

/// The 所得 card has stood long enough: every row on it older than HANDED_STAY_MS.
export const handedStale = (handed, ageOf) => (handed ?? []).length > 0 && handed.every((h) => ageOf(h.id) > HANDED_STAY_MS);
