// Per-encounter proposal only: all changes are made to cloned setups in memory.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { encounters } from './duel-fit-report.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { FIGHTS, content, foeOf, keyOf } from './story-fights.mjs';
import { begin, act, foeStep, MODES } from '../scripts/battle.js';
import { carefulFor, plainFor, lookaheadFor } from '../scripts/fightline.js';

const cards = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const targets = { roaming: 65, story: 50, room: 55, xiong: 45, boss: 40 };
const labels = { roaming: '路上', story: '故事', room: '房间', xiong: '凶兽', boss: '大妖' };
const cost = deck => deck.reduce((s, id) => s + (cards[id]?.cost ?? 1), 0);
const fmt = n => n == null ? '—' : n.toFixed(1);
const band = (n, g, width) => Math.abs(n - targets[g]) <= width + 1e-9;
const name = id => `${cards[id]?.name?.zh ?? id}(${id})`;

export function measure(setup, line, seeds, from, first = null) {
  let wins = 0, losses = 0, near = 0, unfinished = 0;
  for (let k = from; k < from + seeds; k++) {
    const mode = MODES[setup.mode] ?? MODES.pve, saved = mode.youFirst;
    let st;
    try { if (first != null) mode.youFirst = first === 'you'; st = begin({ ...structuredClone(setup), seed: `band|${k}` }, cards); }
    finally { mode.youFirst = saved; }
    for (let n = 0; n < 300 && st.outcome === 'open'; n++) {
      if (st.whose === 'foe') foeStep(st);
      else if (!act(st, ({ careful: carefulFor, plain: plainFor, lookahead: lookaheadFor })[line](st, 'you') ?? { kind: 'end' }, 'you').ok) throw Error('illegal player move');
    }
    if (st.outcome === 'won') wins++;
    else if (st.outcome === 'lost') { losses++; if (st.foe.hp <= st.foe.hpMax * .25) near++; }
    else unfinished++;
  }
  return { win: 100 * wins / seeds, near: losses ? 100 * near / losses : null, unfinished };
}
function* combinations(xs, n, start = 0, prefix = []) {
  if (!n) { yield prefix; return; }
  for (let i = start; i <= xs.length - n; i++) yield* combinations(xs, n - 1, i + 1, [...prefix, xs[i]]);
}
function* removals(deck, n) {
  const ids = [...new Set(deck)], seen = new Set();
  for (const positions of combinations(deck.map((_, i) => i), n)) {
    const removed = positions.map(i => deck[i]);
    const kept = deck.filter((_, i) => !positions.includes(i));
    const slots = ids.filter(id => !removed.includes(id) && kept.filter(x => x === id).length === 1);
    for (const fill of combinations(slots, n)) {
      const result = [...kept, ...fill], key = [...result].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      yield { deck: result, description: `移除${removed.map(name).join('、')}，补入${fill.map(name).join('、')}各一张` };
    }
  }
}
function* swaps(deck, pool, n, ownCost) {
  const indexes = deck.map((_, i) => i);
  for (const positions of combinations(indexes, n)) {
    const base = deck.filter((_, i) => !positions.includes(i));
    function* fill(d, start, add) {
      if (add.length === n) {
        const sum = cost(d); if (sum >= .8 * ownCost && sum <= 1.15 * ownCost && add.every((id, i) => id !== deck[positions[i]])) yield { deck: d, description: `换出${positions.map(i => name(deck[i])).join('、')}；换入${add.map(name).join('、')}（妖/我牌费 ${sum}/${ownCost}）` };
        return;
      }
      for (let i = start; i < pool.length; i++) if (d.filter(x => x === pool[i]).length < 2) yield* fill([...d, pool[i]], i, [...add, pool[i]]);
    }
    yield* fill(base, 0, []);
  }
}
function poolFor(e) {
  const fight = FIGHTS.find(f => keyOf(f) === e.key), beast = e.creature ?? foeOf(fight), id = beast.id ?? beast.creature;
  return Object.values(cards).filter(c => !c._token && !c.lent && !c.gear && !c.pill && !c.mortal && !c.charm && !c.owner && (c.element === beast.root && beast.root != null || c.from?.some(f => f.creature === id))).map(c => c.id).sort();
}
export function fit(e, before) {
  const original = e.setup, ownCost = cost(original.you.deck), pool = poolFor(e);
  let count = 0, closest = null, found = null;
  function test(kind, description, setup, first = null) {
    if (count >= 150) return false;
    count++;
    const screening = measure(setup, 'careful', 40, 0, first);
    const candidate = { kind, description, screening, setup, first };
    if (!closest || Math.abs(screening.win - targets[e.group]) < Math.abs(closest.screening.win - targets[e.group])) closest = candidate;
    if (!band(screening.win, e.group, 12)) return false;
    const confirm = measure(setup, 'careful', 120, 10000, first);
    if (!band(confirm.win, e.group, 15)) return false;
    const plain = measure(setup, 'plain', 20, 20000, first);
    if (plain.win < 20) return false;
    const lookahead = measure(setup, 'lookahead', 20, 30000, first);
    found = { ...candidate, confirm, plain, lookahead }; return true;
  }
  if (test('先后手', '妖先手', original, 'foe')) return { found, closest, count };
  for (const delta of [-1, 1, -2, 2]) {
    const setup = structuredClone(original); setup.foe.hp_fixed += delta * (content.balance.duel_hp.per_level ?? 1);
    if (setup.foe.hp_fixed <= content.balance.duel_hp.base) continue;
    if (test('等级', `妖等级 ${delta > 0 ? '+' : ''}${delta}`, setup)) return { found, closest, count };
  }
  // Finite deterministic quotas leave room for each later kind, including the line.
  for (const [n, quota] of [[1, 20], [2, 20]]) {
    let tried = 0;
    for (const c of removals(original.foe.deck, n)) {
      if (tried++ >= quota) break;
      const setup = structuredClone(original); setup.foe.deck = c.deck;
      if (test('移除', c.description, setup)) return { found, closest, count };
    }
  }
  for (const [n, quota] of [[1, 35], [2, 35], [3, 34]]) {
    let tried = 0;
    for (const c of swaps(original.foe.deck, pool, n, ownCost)) {
      if (tried++ >= quota || count >= 149) break;
      const setup = structuredClone(original); setup.foe.deck = c.deck;
      if (test('换牌', c.description, setup)) return { found, closest, count };
    }
  }
  const setup = structuredClone(original), old = setup.foe.ai === 'careful' ? 'careful' : 'foe'; setup.foe.ai = old === 'foe' ? 'careful' : null;
  test('打法', `妖打法 ${old} → ${old === 'foe' ? 'careful' : 'foe'}`, setup);
  return { found, closest, count };
}
function clean(c) { if (!c) return null; const { setup, ...other } = c; return other; }
function report(rows) {
  const groups = Object.keys(targets), fitted = rows.filter(r => r.found), failed = rows.filter(r => r.searched && !r.found);
  const summaries = groups.map(g => { const rs = rows.filter(r => r.group === g); return { group:g, before:rs.filter(r => band(r.before.win,g,12)).length, after:rs.filter(r => !r.searched || r.found).length, total:rs.length }; });
  const mix = Object.fromEntries(['先后手','等级','移除','换牌','打法'].map(k => [k,fitted.filter(r => r.found.kind === k).length]));
  let text = '# 斗法逐场适配提案 · 2026-11-13\n\n## 摘要\n\n| 身份 | 搜索前 ±12 | 提案后（确认 ±15） |\n|---|---:|---:|\n';
  text += summaries.map(s => `| ${labels[s.group]} | ${s.before}/${s.total} | ${s.after}/${s.total} |`).join('\n');
  text += `\n\n未拟合 ${failed.length} 场；拟合改动：${Object.entries(mix).map(([k,v])=>`${k} ${v}`).join('，')}。提案后计数含原已达 ±12 的场次；新提案按独立确认 ±15 计数，两种口径不同。\n\n每场首次遭遇，公平规则仅进程内打开、双方等张数，谨慎玩家基线 40 局（band|0–39）；候选同种子筛选 ±12，独立 120 局（band|10000–10119）确认 ±15；plain 与诚实前瞻各独立 20 局（band|20000–20019、30000–30019），plain 低于 20% 则拒绝。险败为败局中妖剩余气血 ≤25% 的比例。原已达标未重新确认；未拟合不冒称改善。单人，不带丹。\n\n顺序为先手、等级（−1、+1、−2、+2）、移除 1/2 张牌并补其他牌第二张、换入同元素或该妖 from 的牌 1/2/3 张、打法。换牌牌费为我方 80%–115%，不含衍生、借牌、装备、伙伴专属、丹和符。每场至多 150 候选：移除各最多 20，换牌依次最多 35/35/34，保留最后一席给打法；字典序截断，故未拟合不代表不存在解，也不保证穷尽同一改动数。等级只改公平气血（每级一气血），不改牌组；先手在开局前改模式并立即还原。候选只作提案，不改内容。\n\n## 每场\n\n| 身份 / 遭遇 | 前 % | 提案 | 确认后 % | plain % | 前瞻 % | 险败前 / 后 % |\n|---|---:|---|---:|---:|---:|---:|\n`;
  for (const r of rows) { const f=r.found; text += `| ${labels[r.group]} ${r.name} (${r.key}) | ${fmt(r.before.win)} | ${f?.description ?? (r.searched ? '未拟合' : '原已达标')} | ${fmt(f?.confirm.win)} | ${fmt(f?.plain.win)} | ${fmt(f?.lookahead.win)} | ${fmt(r.before.near)} / ${fmt(f?.confirm.near)} |\n`; }
  text += '\n## 未拟合：筛选最接近目标的候选\n\n| 遭遇 | 最接近候选（40 局） | 候选胜率 % | 尝试数 |\n|---|---|---:|---:|\n';
  for (const r of failed) text += `| ${r.name} (${r.key}) | ${r.closest?.description ?? '无'} | ${fmt(r.closest?.screening.win)} | ${r.count} |\n`;
  fs.writeFileSync(new URL('../doc/duel-fit-proposal-2026-11-13.md', import.meta.url), text);
  return { summaries, unfitted:failed.length, mix, examples:fitted.slice(0,3).map(r=>({key:r.key,before:r.before.win,change:r.found.description,after:r.found.confirm.win,plain:r.found.plain.win,lookahead:r.found.lookahead.win})) };
}
export function run(log) {
  return withRules(true, () => {
    const rows = [];
    for (const e of encounters()) {
      const before = measure(e.setup, 'careful', 40, 0), searched = !band(before.win,e.group,12);
      const result = searched ? fit(e,before) : {};
      const row = { key:e.key, name:e.name, group:e.group, before, searched, ...result, found:clean(result.found), closest:clean(result.closest) };
      rows.push(row); fs.appendFileSync(log, `${rows.length} ${e.key} ${before.win}% ${searched ? row.found?.kind ?? 'unfitted' : 'in-band'} candidates=${row.count ?? 0}\n`);
    }
    fs.writeFileSync('/tmp/duel-fit-proposal-results.json', JSON.stringify(rows, null, 2) + '\n');
    return report(rows);
  }, FIT);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const index = process.argv.indexOf('--log'), log = index < 0 ? '/tmp/duel-fit-proposal.log' : process.argv[index + 1];
  fs.writeFileSync(log, ''); console.log(JSON.stringify(run(log), null, 2));
}
