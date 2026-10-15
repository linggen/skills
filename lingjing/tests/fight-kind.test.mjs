// Live 2026-10-15 (古五): 「你认了输，退下台来。」 closed every loss — 邹青松's chase in the 秘境 too, where
// there is no 台. A loss is said as its kind: a 试 not stood through, a 比试 stepped down from, a beast given ground to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, boutWords, fightKind } from '../scripts/battle-card.js';

test('the lose line by fight kind: trial, bout, beast — zh and en', () => {
  const trialPerson = { name: '邹青松', person: true, gender: 'male', goal: '撑到他出完每一招' };
  const trialBeast = { name: '冰夷双龙', goal: '撑到双龙出完招' };
  const bout = { name: '马小宝', person: true, gender: 'male' };
  const beast = { name: '蠪侄' };
  assert.deepEqual([trialPerson, trialBeast, bout, beast].map(fightKind), ['trial', 'trial', 'bout', 'beast']);
  for (const lang of ['zh', 'en']) {
    const lost = (c) => boutWords(WORDS[lang], c, lang).lostSay;
    const lines = [lost(trialPerson), lost(trialBeast), lost(bout), lost(beast)];
    assert.equal(lines[0], lines[1], `${lang}: a trial is a trial, whoever sets it`);
    assert.equal(new Set(lines.slice(1)).size, 3, `${lang}: three kinds, three lines`);
    assert.equal(lost(beast), WORDS[lang].lostSay);
  }
  assert.equal(boutWords(WORDS.zh, bout, 'zh').lostSay, '你认了输，退下台来。');
  assert.doesNotMatch(boutWords(WORDS.zh, trialPerson, 'zh').lostSay, /台/);
  // a trial with a person keeps the person's pronouns elsewhere
  assert.match(boutWords(WORDS.zh, trialPerson, 'zh').wonSay, /他/);
});
