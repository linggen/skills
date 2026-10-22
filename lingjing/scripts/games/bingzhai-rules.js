// bingzhai-rules.js — 讨饼债, the pure half (Hanli 10-22, of the 二十问 it replaces: 「这个设计不太好. 太简单, 反倒不知道是答案.....
// 怎么改一下呢?」 → 「可以, 试一下」). Has HER line owned the debt? Checked here, on her own words — never a tag of hers.
//
// Her facts (tasks/world.json `yinyue-what` deal.context) ask her to concede only when truly cornered, and then in
// plain words (「本王欠你一张饼」); the page decides by this list. A line is cut into sentences (。！？!?；;): a sentence
// counts when an ADMIT pattern is in it and nothing guards it — a negation or an echo before the match (「本王才不欠你」,
// 「你说本王欠你一张饼」, "who says I owe you"), a scoff after it (「才怪」, "nothing"), or a bare question (「本王欠你一张饼？」
// unless it gives in: 「行了吧？」). One counted sentence anywhere is the debt owned (「不欠！……罢了，欠你一张饼。」).

/** What owning the debt sounds like (zh: on the text as written; en: lower-cased). Data: add a phrasing here, and a test. */
export const ADMIT = {
  zh: [
    /本王欠你[^，,。！？!?]{0,6}(饼|债|账|的)/, /算(本王|我)欠你/, /(我|本王)?欠(了)?你[^，,。！？!?]{0,4}饼/,
    /饼债[^。！？!?]{0,6}(认|记下|记着|算本王|是本王的)/,
    /(这|那)(一)?(张|块|个|口)?饼[^。！？!?]{0,8}(认了|认下|记下|记着|算本王的|算在本王)/,
    /本王认(了|下)?[^。！？!?]{0,4}(饼|债|账)/,
  ],
  en: [
    /\b(i|this queen)\s+(do\s+)?owes?\s+you\b[^.!?]{0,24}(bread|cake|debt|\bone\b)/, /\b(i|this queen)\s+(do\s+)?owes?\s+you\W*$/, /\bowe\s+you\s+(a|one|that|the|this|your)\s+(flat)?(bread|cake)/,
    /\b(bread|cake)\s+debt\b[^.!?]{0,30}\b(mine|i own|i admit|acknowledged?|noted|recorded)/,
    /\bi'?ll\s+(own|admit|acknowledge)\b[^.!?]{0,24}\b(debt|bread|cake)/, /\b(consider|call)\s+it\s+(a|my)\s+debt\b/,
  ],
};
// Before the match, in its sentence: not owning it, or only saying his words back.
const NOT_BEFORE = {
  zh: /(才不|不欠|没欠|哪里|何曾|岂会|岂能|怎么会|怎会|休想|别想|谁说|凭什么|难道|就算|即便|哪怕|如果|假如|要是|若是|除非|(你说|你以为|你当|你想)(本王|我)?(会|就)?欠)/,
  en: /\b(not|never|don't|doesn't|didn't|won't|why would|who says|as if|if|unless|you think|you say|you want|you wish|do you|suppose)\b/,
};
// After the match, in its sentence: a scoff.
const NOT_AFTER = { zh: /(才怪|做梦|休想|笑话|没门|想得美|门都没有)/, en: /^\W*(nothing|not\b|no\b)|\b(in your dreams|dream on|nonsense|as if)\b/ };
// A question that still gives in.
const GIVES_IN = { zh: /(行了吧|好了吧|满意了吧|成了吧|可以了吧|总行了吧|够了吧)/, en: /\b(happy|satisfied|there|fine|all right|alright|enough)\b/ };

const sentences = (text) => String(text ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").split(/(?<=[。！？!?；;\n])|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);

function owned(sentence, lang) {
  const s = lang === 'en' ? sentence.toLowerCase() : sentence;
  for (const re of ADMIT[lang]) {
    const m = re.exec(s);
    if (!m) continue;
    const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
    if (NOT_BEFORE[lang].test(before + m[0]) || NOT_AFTER[lang].test(after)) continue;
    if (/[？?]\s*$/.test(s) && !GIVES_IN[lang].test(s)) continue;
    return true;
  }
  return false;
}

/** Does her line own the debt? Either language's patterns (she may answer in either). */
export function admits(line) {
  return sentences(line).some((s) => owned(s, 'zh') || owned(s, 'en'));
}

/** Stars by how soon she owned it: ≤ 3 exchanges ★★★, ≤ 6 ★★, else ★. */
export const starsFor = (n) => (n <= 3 ? 3 : n <= 6 ? 2 : 1);
