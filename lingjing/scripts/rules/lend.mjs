// What 银月 lends after losses to one foe (design.md § 斗法 v4, the coach). Pure and import-free: the page reads it too.
export function lendOf(content, lost, lesson) {
  const k = content?.balance?.duel_lend ?? {}, n = Math.min(k.cap ?? 3, Math.max(0, Math.floor(lost || 0)));
  if (!n || !k.order?.length) return null;
  const cards = [k.by_lesson?.[lesson] ?? k.order[0]];
  if (n >= 2) cards.push(k.order.find(id => !cards.includes(id)));
  if (n >= 3) cards.push(k.ward);
  return { cards: cards.filter(Boolean) };
}
