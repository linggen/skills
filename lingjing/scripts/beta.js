// The same quiet notice in the game bar and Settings.
const BETA = {
  zh: { tag: '测试版', sentence: '灵境还在测试。内容会调整，进度可能不保留。' },
  en: { tag: 'Beta', sentence: 'Lingjing is in beta. The game is still changing, and progress may not carry over.' },
};
export const betaWords = (lang) => BETA[lang] ?? BETA.zh;
export function paintBeta(doc, lang) {
  const { tag, sentence } = betaWords(lang);
  const button = doc.getElementById('betaTag');
  button.textContent = tag;
  button.title = sentence;
  doc.getElementById('betaNote').textContent = sentence;
}
