// Localized effect wording and button label for a usable item.
export function useVerb(item, lang) {
  const en = lang === 'en';
  const declared = item?.use?.verb?.[en ? 'en' : 'zh'];
  if (declared) return { effect: declared, button: declared };
  if (item?.kind === 'pill') return en ? { effect: 'Taken', button: 'Use' } : { effect: '服下', button: '服用' };
  return en ? { effect: 'Used', button: 'Use' } : { effect: '用了', button: '使用' };
}
