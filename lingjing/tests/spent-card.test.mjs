// A turn refused on a spent allowance (the engine's `allowance_spent`, Hanli 2026-11-03: 「试用期到期后, 要有消息提示
// 用户订阅或者添加自己的模型」): the page's card says which allowance and the two ways on, in zh and en, and a side
// session's error row is never said as the character's line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../scripts/cards.js';
import { spentCardHtml, SUBSCRIBE_URL } from '../scripts/spent-card.js';
import { lineOrThrow, SPENT } from '../scripts/npc-ask.js';

test('the card names the allowance and both ways on, in each language', () => {
  const zh = spentCardHtml(WORDS.zh, 'trial');
  assert.match(zh, /免费额度用完了/);
  assert.match(zh, /订阅/);
  assert.match(zh, /用自己的模型/);
  assert.ok(zh.includes(SUBSCRIBE_URL));
  const en = spentCardHtml(WORDS.en, 'monthly');
  assert.match(en, /This month&#39;s tokens are used up/);
  assert.match(en, /Use your own model/);
  for (const k of ['spentTrial', 'spentMonthly', 'spentHow', 'spentSubscribe', 'spentOwn', 'spentAt', 'spentClose']) {
    assert.ok(WORDS.zh[k] && WORDS.en[k], k);
  }
});

test("a side session's refusal row throws, never reads as the character's line", () => {
  assert.equal(lineOrThrow('客官您好'), '客官您好');
  assert.throws(() => lineOrThrow('Error: BILLING_REQUIRED: trial_exhausted: Your free tokens are used up'), { message: `${SPENT}:trial` });
  assert.throws(() => lineOrThrow('Error: BILLING_REQUIRED: monthly_cap_exceeded: x'), { message: `${SPENT}:monthly` });
  assert.throws(() => lineOrThrow("Error: The model didn't answer this turn — try again."), /didn't answer/);
});
