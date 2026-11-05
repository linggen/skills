// tools/playbot/replay.mjs — a settled fight read back through the rules' own replay (the target checkout's
// scripts/battle.js `battle(actions, setup, catalog)`, as rules/tasks.mjs settles it): every play of his, the fight's
// state just before and just after. 灵力 spent on a play that changed nothing on the field — no 气血, 护体 or body moved
// on either side — is mana-waste, judged by the fight itself, never by a screenshot mid-animation (11-05: a 痒痒针
// that swept four minions away was flagged by the screen).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fieldOf = (v) => [v.you, v.foe].map((s) => ({ hp: s.hp, armor: s.armor ?? 0, ward: s.ward ?? null, allies: (s.allies ?? []).map((a) => [a.id, a.hp, a.gone]),
  board: s.board.map((m) => [m.id, m.uid, m.hp, m.atk, m.chained, m.taunt, m.drought]) }));

/** The plays of `picks` that spent 灵力 and moved nothing: [{ index, action, card, mana: [before, after] }]. */
export async function wastedPlays(skill, setup, picks) {
  const mod = (p) => import(pathToFileURL(path.join(skill, p)).href);
  const { battle } = await mod('scripts/battle.js');
  const { cardCatalog } = await mod('scripts/rules/cards.mjs');
  const { loadContent } = await mod('scripts/content.mjs');
  const content = loadContent();
  const catalog = cardCatalog(content);
  const actions = String(picks).split(',').map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (let k = 0; k < actions.length; k += 1) {
    if (!actions[k].startsWith('play:')) continue;
    const before = battle(actions.slice(0, k), setup, catalog);
    const after = battle(actions.slice(0, k + 1), setup, catalog);
    if (before.outcome !== 'open' || after.refused) continue;
    const len = (h) => (Array.isArray(h) ? h.length : Number(h));
    const spent = after.you.mana < before.you.mana && len(after.you.hand) === len(before.you.hand) - 1;
    if (spent && JSON.stringify(fieldOf(after)) === JSON.stringify(fieldOf(before))) {
      const index = Number(actions[k].slice(5).split('@')[0]);
      out.push({ index: k, action: actions[k], card: (() => { const c = Array.isArray(before.you.hand) ? before.you.hand[index] : null; return typeof c === 'string' ? c : c?.id ?? null; })(), mana: [before.you.mana, after.you.mana] });
    }
  }
  return out;
}

/** How many cards his hand holds at his first decision of a fight with this setup. */
export async function openingHand(skill, setup) {
  const { battle } = await import(pathToFileURL(path.join(skill, 'scripts/battle.js')).href);
  const { cardCatalog } = await import(pathToFileURL(path.join(skill, 'scripts/rules/cards.mjs')).href);
  const { loadContent } = await import(pathToFileURL(path.join(skill, 'scripts/content.mjs')).href);
  const v = battle([], setup, cardCatalog(loadContent()));
  return Array.isArray(v.you.hand) ? v.you.hand.length : Number(v.you.hand);
}
