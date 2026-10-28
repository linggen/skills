// wayline.js — a way to grow stronger (rules/strengthen.mjs) as ONE short fact line: what the thing is, what it does,
// and the odds against the fight he lost, before → after (Hanli 2026-10-27: 「去执事堂 · 买铁蒺藜, 如果是推荐玩家变强,
// 应该让yinyue解释一下, 为什么要买东西? 能增强什么」). Facts, never her words: the 主页 shows it under its row, the
// rules hand it on Look (`way.line`, for the phone), and 银月 is given the same facts to say why (hersay.js wayFacts).
// Pure and import-free: the page, the rules and the phone's Look all read the one formatter.
//
//   wayLine(o, lang) → '铁蒺藜 · 1 灵力 · 打 1 点，抽 1 张 · 对赤狐 20% → 40%' | null
//   wayDoes(o, lang) → the middle: what it is and does, without the name or the odds
//   shortWords(o, lang) → '差 20 · 可砍价' for a buy he is short of, '' else

const EL = { zh: { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' }, en: { metal: 'Metal', wood: 'Wood', water: 'Water', fire: 'Fire', earth: 'Earth' } };
const SLOT = { zh: { weapon: '法器', robe: '法衣', pendant: '佩' }, en: { weapon: 'Weapon', robe: 'Robe', pendant: 'Pendant' } };
const L = lang => (lang === 'en' ? 'en' : 'zh');

/* A card's effect, as the card's face says it (battle-card.js sayEffect, kept short). */
function effectWords(e = {}, zh) {
  const b = [];
  if (e.damage != null) b.push(zh ? `打 ${e.damage} 点` : `${e.damage} damage`);
  if (e.sweep != null) b.push(zh ? `敌阵前每个 ${e.sweep} 点` : `${e.sweep} to each foe in rank`);
  if (e.heal != null) b.push(zh ? `回 ${e.heal} 气血` : `heal ${e.heal}`);
  if (e.draw != null) b.push(zh ? `抽 ${e.draw} 张` : `draw ${e.draw}`);
  if (e.buff) b.push(zh ? `一个 +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}` : `one ally +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}`);
  if (e.rally) b.push(zh ? `全体 +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}` : `all allies +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}`);
  if (e.summon) b.push(zh ? `召来 ${e.summon.n ?? 1} 个` : `summon ${e.summon.n ?? 1}`);
  if (e.chain != null) b.push(zh ? '锁敌阵前一个一回合' : 'chain a foe a turn');
  if (e.swallow != null) b.push(zh ? `吞敌阵前攻 ≤${e.swallow} 的一个` : `swallow a foe of attack ≤ ${e.swallow}`);
  if (e.drain != null) b.push(zh ? `敌下回合灵力 −${e.drain}` : `foe Force −${e.drain} next turn`);
  if (e.drought != null) b.push(zh ? `大旱：每回合末敌阵前每个 ${e.drought} 点` : `drought: ${e.drought} to each foe each turn`);
  return b.join(zh ? '，' : ', ');
}

/* What worn gear lends in a fight (cards.js gearFight's words: 主灵根一击 · 护体 · 抗). */
function gearWords(a = {}, zh) {
  const b = [];
  if (a.atk) b.push(zh ? `主灵根一击 +${a.atk}` : `Root Strike +${a.atk}`);
  if (a.def) b.push(zh ? `护体 ${a.def}` : `Shield ${a.def}`);
  for (const [el, n] of Object.entries(a.ward ?? {})) b.push(zh ? `抗${EL.zh[el] ?? el} ${n}` : `wards ${EL.en[el] ?? el} ${n}`);
  if (a.root) b.push(zh ? `借${EL.zh[a.root] ?? a.root}` : `lends ${EL.en[a.root] ?? a.root}`);
  return b.join(zh ? '，' : ', ');
}

/* A pill's fight effect (items.json `effect.fight`). */
function pillWords(f = {}, zh) {
  const b = [];
  if (f.heal) b.push(zh ? `斗法中回 ${f.heal} 气血` : `heals ${f.heal} in a fight`);
  if (f.mana) b.push(zh ? `灵力 +${f.mana}` : `Force +${f.mana}`);
  if (f.armor) b.push(zh ? `护体 ${f.armor}` : `Shield ${f.armor}`);
  return b.join(zh ? '，' : ', ');
}

export function wayDoes(o, lang = 'zh') {
  const zh = L(lang) === 'zh', d = o?.does;
  if (!o || !d) return '';
  if (o.kind === 'buy') {
    const body = d.card_kind === 'minion' ? `${d.atk ?? 0}/${d.hp ?? 0}` : '';
    const key = (d.keywords ?? []).includes('taunt') ? (zh ? '护主' : 'Guard') : '';
    return [zh ? `${d.cost} 灵力` : `${d.cost} Force`, body, key, effectWords(d.effect, zh)].filter(Boolean).join(' · ');
  }
  if (o.kind === 'wear') return [SLOT[L(lang)][o.slot] ?? '', gearWords(d, zh)].filter(Boolean).join(' · ');
  if (o.kind === 'pills') return pillWords(d, zh);
  return '';
}

/* The odds part — only when the step helps: a worse or same number is no reason, and never shown. */
export function oddsWords(o, lang = 'zh') {
  const zh = L(lang) === 'zh', od = o?.odds;
  if (!od || !(od.after > od.before)) return '';
  const pct = x => `${Math.round(x * 100)}%`;
  const foe = o.for?.name ?? '';
  return zh ? `对${foe} ${pct(od.before)} → ${pct(od.after)}` : `vs ${foe} ${pct(od.before)} → ${pct(od.after)}`;
}

/* Short of the list price, and 砍价 there could close it (rules/strengthen.mjs `short` · `haggle`): 「差 20 · 可砍价」. */
export function shortWords(o, lang = 'zh') {
  if (!(o?.short > 0)) return '';
  const zh = L(lang) === 'zh';
  return zh ? `差 ${o.short}${o.haggle ? ' · 可砍价' : ''}` : `${o.short} short${o.haggle ? ' · haggle it down' : ''}`;
}

export function wayLine(o, lang = 'zh') {
  if (!o || !['wear', 'buy', 'pills'].includes(o.kind)) return null;
  const name = o.kind === 'pills' ? `${o.name} ×${o.n}` : o.name;
  return [name, wayDoes(o, lang), oddsWords(o, lang), shortWords(o, lang)].filter(Boolean).join(' · ');
}
