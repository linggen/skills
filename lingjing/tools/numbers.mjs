// numbers.mjs — 数值系统, phase 1: one validator for every number in the world (Hanli 2026-10-27: 「所有物品, 任务的数值
// 请写一个工具进行校验. 要统一服务游戏时长, 经济等… 全局校验游戏数值, 平衡战斗力, 游戏难易, 时长的」; design.md § 数值系统).
//
// It loads the world as the rules do (content.mjs withBalance) and puts every number in the system's own units:
//   - 修为 as a share of the layer where he meets it, and as the minutes of board play it equals at that layer;
//   - 灵石 as minutes of the typical player's income there, and against what the shops ask;
//   - fight power as the careful bot's win rate against the band for that beat (tools/story-fights.mjs);
//   - time per 回 and per layer from the model players (tools/balance.mjs).
// Nothing is re-derived here: every pay is asked of the rules themselves (core.mjs paysOf, playpay.mjs playGrant ·
// errandGrant · chorePlay) on a save standing at that layer, so a change to the pay rules shows up without a change
// here. It changes no number (phase 2 is `--apply`, design.md § 数值系统).
//
//   node tools/numbers.mjs              the summary: the layers, the 回, the red list
//   node tools/numbers.mjs --write      worlds/jiuding/levels/numbers.json for the 游戏厅's 数值 page (fights weighed)
//   node tools/numbers.mjs --fights N   weigh the fights over N deals (default 30 with --write; slow: ~2 min)
//   node tools/numbers.mjs --check      hard errors only (a NaN, a negative price…): exit 1 (tests/numbers.test.mjs)
//   node tools/numbers.mjs --json       the report as JSON on stdout
//   node tools/numbers.mjs --apply      phase 2: what the master table (balance.json `master`, tools/master.mjs) derives,
//                                       as a diff against balance.json — a dry run; with --write it is written, then the
//                                       model's 回 days and the red list are run again on it (and numbers.json written)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContent, withBalance } from '../scripts/content.mjs';
import { paysOf } from '../scripts/rules/core.mjs';
import { chorePlay, errandGrant, pillBelow, playGrant, secludeHour } from '../scripts/rules/playpay.mjs';
import { huiOrder, huiLabel, huiOf, chapterHuis } from '../scripts/rules/hui.mjs';
import { runsPay } from '../scripts/rules/rerun.mjs';
import { chances, realmOf } from '../scripts/rules/fantong.mjs';
import { BALANCE_FILE, balanceText, grindLayers, play, table as paceTable } from './balance.mjs';
import { derive, diffOf, fitHours, setPath } from './master.mjs';

export const OUT = new URL('../worlds/jiuding/levels/numbers.json', import.meta.url);
const FIXTURE = new URL('../tests/fixtures/saves/waimen.json', import.meta.url);
const NOW = new Date('2026-10-27T03:00:00Z');

/* The targets the numbers are judged against — phase 2's master table (design.md § 数值系统). balance.json
   `play_pay.hours` and `play_pay.games` win where the world declares them (2026-10-27); these are the fallbacks.
   `hours`: 练气一层's play hours and the step a layer (ling-mem 3m6p5mNIpx); `games`: the small games' share of a
   layer's 修为 and of its time; `band`: a story fight's first meeting, bare (tests/fight-band.test.mjs BARE), and a
   pool's (fight-band-pools.test.mjs BARE) — the fight bands live in those tests, not in balance.json. */
export const TARGET = {
  hours: { first: 2, step: 1 },
  games: { xiuwei: 0.6, time: 0.35 },
  band: { story: [0.3, 0.62], pool: [0.25, 0.68] },
};
/* Where a number turns red. */
export const LIMITS = {
  thing_pct: 0.1, // one pill, board or errand worth more than this share of the layer he meets it on
  hours_off: 0.5, // a layer's hours more than this far (×) from the target
  claim_off: 0.33, // a text's stated amount more than this far (×) from the number
  gear_off: 2, // an arm's 灵石 a point more than this many times (or under 1/this) its kind's median
  card_off: 3,
  shop_wait: 2, // a shop's thing the typical player has earned only this many 古 回 after it is sold // a minion's 攻+血 this far over its cost's median
  fight_slack: 0.08, // a fight's bot win rate outside its band by more than this (the deals' noise)
  gate_wait: 40, // a stage quest's wait, minutes of play — about one sitting (Hanli 2026-10-27, 古五's 渡口)
};

const round = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const zh = v => (typeof v === 'string' ? v : v?.zh ?? '');
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/* ── where he stands ── */

const tierOf = (content, id) => content.ladder.tiers.find(t => t.id === id);
/* A layer as the book names it (练气 counts from 零层) → the state's step. */
const stepOf = (content, tier, layer) => layer - (tierOf(content, tier)?.zero ? 0 : 1);
const layerName = (content, tier, step) => `${zh(tierOf(content, tier)?.name) || tier}${tierOf(content, tier)?.zero ? step : step + 1}层`;
const keyOf = at => `${at.tier}:${at.step}`;
/* 零层 takes no 修为: a thing met there is weighed on the first layer that pays it. */
const paying = (content, at) => (at && tierOf(content, at.tier)?.zero && at.step === 0 ? { ...at, step: 1 } : at);

/* A save standing at the start of a layer: the fixture past 入门, nothing locked. */
function saveAt(base, at) {
  const s = structuredClone(base);
  Object.assign(s, { tier: at.tier, step: at.step, progress: 0 });
  delete s.stretch; delete s.plays;
  return s;
}

/* Every 回 of 卷一 in the book's order. */
function huisOf(content) {
  const ids = new Set();
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) for (const h of chapterHuis(content, ch)) ids.add(h);
  return [...ids].sort((a, b) => huiOrder(content, a) - huiOrder(content, b));
}

/* The layer each 回 holds him on: its stage quest's (the lowest gate), else its cap; a 今 interlude takes the 古 回
   before it; before the first cap, 零层. */
function huiLayers(content) {
  const caps = content.ladder.caps?.hui ?? {}, out = {};
  let last = { tier: content.ladder.tiers[0].id, step: 0 };
  for (const h of huisOf(content)) {
    const c = huiOf(content, h)?.line === 'gu' ? caps[h] : null;
    if (c) {
      const gates = (c.gates ?? []).map(g => ({ tier: g.tier ?? c.tier, step: stepOf(content, g.tier ?? c.tier, g.layer) }));
      last = gates.length ? gates.sort((a, b) => a.step - b.step)[0] : { tier: c.tier, step: stepOf(content, c.tier, c.layer) };
    }
    out[h] = last;
  }
  return out;
}

/* ── the units, layer by layer ── */

/* One task a play kind is played on (the rate a minute is asked of playGrant through it). */
function kindTasks(content) {
  const out = new Map();
  for (const g of content.games?.games ?? []) {
    const t = g.task && content.tasks.tasks.find(x => x.id === g.task);
    if (t && g.mechanic && !g.replaced && !out.has(g.mechanic)) out.set(g.mechanic, t);
  }
  return out;
}

/* 修为 a minute of board play here: the median over the kinds, each as playGrant pays a three-star first play. */
function playRate(content, s, kinds) {
  const rates = [...kinds.values()].map(t => playGrant(content, s, t.id, t, NOW, 3)).filter(g => g?.minutes).map(g => g.progress / g.minutes);
  return median(rates) ?? 0;
}

/* A day of sitting: one night's 闭关 (rewards.json seclusion `rest_hours`, an hour's share of the layer — rules/seclusion.mjs). */
function nightOf(content, s) {
  const r = content.rewards.seclusion;
  return paysOf(content, s, NOW, { table: 'seclusion', progress: Math.floor(r.rest_hours * (secludeHour(content, s) ?? 0)) })?.progress ?? 0;
}

/* The model's days on each layer, per player, and the typical player's 灵石 a minute there (the day's end layer). */
function modelLayers(content) {
  const out = {};
  for (const [who, p] of Object.entries(content.balance.model.players)) {
    let prev = 0;
    for (const [d, D] of play(content, p).ledger.entries()) {
      if (!D.at) continue;
      const k = keyOf(D.at), row = (out[k] ??= {});
      const minutes = d === 0 ? p.first_minutes : p.minutes;
      row[who] = row[who] ?? { days: 0, minutes: 0, ls: 0 };
      row[who].days += 1; row[who].minutes += minutes; row[who].ls += D.earned - prev;
      prev = D.earned;
    }
  }
  return out;
}

/* The target hours for a layer: 练气 only — the curve above it is phase 2's knob. */
function targetHours(content, at) {
  if (tierOf(content, at.tier)?.zero && at.step === 0) return null;
  const row = content.balance.play_pay?.hours?.[at.tier] ?? content.balance.play_pay?.hours?.default;
  if (row != null) return Array.isArray(row) ? row[at.step] ?? row.at(-1) : row;
  return at.tier === content.ladder.tiers[0].id ? TARGET.hours.first + (at.step - 1) * TARGET.hours.step : null;
}
/* The master table's curve for a layer, before the pace fit (tools/master.mjs fitHours). */
function curveHours(content, at) {
  const H = content.balance.master?.lines?.gu?.hours;
  if (!H || (tierOf(content, at.tier)?.zero && at.step === 0)) return null;
  return at.tier === content.ladder.tiers[0].id ? H.qi[at.step] ?? null : null;
}
const gamesOf = content => ({ xiuwei: content.balance.play_pay?.games?.share ?? TARGET.games.xiuwei, time: content.balance.play_pay?.games?.time ?? TARGET.games.time });

/* Every layer of 卷一 (练气一层…九层, 筑基's three) in its units. */
export function layersOf(content, base) {
  const kinds = kindTasks(content), model = modelLayers(content), out = [], G = gamesOf(content);
  const tiers = content.ladder.tiers.slice(0, 2);
  for (const t of tiers) for (let step = 0; step < t.thresholds.length; step++) {
    const at = { tier: t.id, step }, s = saveAt(base, at), need = t.thresholds[step], z = Boolean(t.zero && step === 0);
    const rate = playRate(content, s, kinds), m = model[keyOf(at)] ?? {};
    const ty = m.typical;
    // A minute of all play, by the play rule: the games' 60% of the 修为 over their 35% of the time.
    const perMin = rate * G.time / G.xiuwei, chore = chorePlay(content, s, 'day') ?? 0;
    const gamesHours = perMin && need ? need / perMin / 60 : null;
    // …and with one daily 功课 on top, at the typical player's minutes a day.
    const day = content.balance.model.players.typical.minutes, choreDays = perMin && need ? need / (day * perMin + chore) : null;
    out.push({
      key: keyOf(at), name: layerName(content, t.id, step), ...at, need, prev: out.at(-1) ? { name: out.at(-1).name, need: out.at(-1).need } : null,
      // 零层 takes no 修为 (state.mjs addProgress): nothing a layer pays lands there.
      zero: z, rate: z ? 0 : round(rate, 2), night: z ? 0 : nightOf(content, s),
      chore_day: chorePlay(content, s, 'day'), chore_week: chorePlay(content, s, 'week'), chore_month: chorePlay(content, s, 'month'),
      haunt: z ? 0 : paysOf(content, s, NOW, content.rewards.tables.haunt ? { table: 'haunt', progress: content.rewards.tables.haunt.progress } : null)?.progress ?? 0,
      errand: z ? 0 : errandGrant(content, s)?.progress ?? 0,
      target_h: targetHours(content, at), curve_h: curveHours(content, at), rule_h: round(gamesHours, 1), chore_h: round(choreDays && (choreDays * day) / 60, 1), chore_days: round(choreDays, 1),
      model_days: Object.fromEntries(Object.entries(m).map(([w, r]) => [w, r.days])),
      model_h: ty ? round(ty.minutes / 60, 1) : null,
      ls_min: ty?.minutes ? round(ty.ls / ty.minutes, 2) : null,
    });
  }
  return out;
}

/* ── where a thing is met ── */

const sceneHuiOf = content => { const m = new Map(); for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes)) m.set(sc.id, sc.hui ?? null); return m; };
const earliest = (content, huis) => huis.filter(Boolean).sort((a, b) => huiOrder(content, a) - huiOrder(content, b))[0] ?? null;

/* Each item's first 回 and how: a scene's grant, an errand's, a board's gift, a shop's shelf. */
function itemsMet(content) {
  const hui = sceneHuiOf(content), met = new Map(), add = (id, h, how) => { if (id && h) (met.get(id) ?? met.set(id, []).get(id)).push({ hui: h, how }); };
  for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes)) for (const e of sc.exits ?? []) {
    add(e.grant?.item, sc.hui, 'story');
    for (const id of Object.keys(e.grant?.more ?? {})) add(id, sc.hui, 'story');
  }
  for (const q of content.quests) add(q.grant?.item, content.balance.model.errands_at?.[q.id], 'errand');
  for (const g of content.games?.games ?? []) for (const id of Object.keys(content.tasks.tasks.find(t => t.id === g.task)?.gives?.bag ?? {})) add(id, hui.get(g.scene), 'board');
  for (const [id, h] of shopsMet(content)) add(id, h, 'shop');
  // The 饭桶's (开炉's) pools, from the scene that hands it over; a 秘境 rerun's drops, from its last scene.
  const fantong = idsIn(content.fantong?.pools), drops = idsIn(content.rewards.drop_tables);
  const runs = runsPay(content).map(r => hui.get(r.last));
  for (const i of content.items.items) {
    if (fantong.has(i.id)) add(i.id, hui.get(content.balance.model.fantong_from), 'fantong');
    if (drops.has(i.id)) for (const h of runs) add(i.id, h, 'rerun');
  }
  return id => { const all = met.get(id) ?? []; const h = earliest(content, all.map(x => x.hui)); return h ? { hui: h, how: all.find(x => x.hui === h).how, all: [...new Set(all.map(x => `${x.hui} ${x.how}`))] } : null; };
}

/* Every string under a node: the ids a pool or a drop table can hand out. */
const idsIn = (node, out = new Set()) => { if (typeof node === 'string') out.add(node); else if (node && typeof node === 'object') for (const v of Object.values(node)) idsIn(v, out); return out; };

/* Every shop's goods → the first 回 whose map holds the shop (a place's own `has.shop`, or its province's catalog). */
/* Each place → the first 回 whose chapter map holds it. */
function placesMet(content) {
  const firstHui = new Map();
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) {
    const h = earliest(content, chapterHuis(content, ch));
    for (const id of ch.map?.places ?? []) if (!firstHui.has(id) || huiOrder(content, h) < huiOrder(content, firstHui.get(id))) firstHui.set(id, h);
  }
  return firstHui;
}

function shopsMet(content) {
  const out = new Map(), firstHui = placesMet(content);
  for (const d of Object.values(content.places)) for (const p of d.places) {
    const h = firstHui.get(p.id), shop = p.has?.shop;
    if (!h || !shop) continue;
    const goods = shop === true ? content.items.items.filter(i => (i.sold ?? []).includes(d.province)).map(i => i.id) : shop.goods ?? [];
    for (const id of goods) if (!out.has(id) || huiOrder(content, h) < huiOrder(content, out.get(id))) out.set(id, h);
  }
  return out;
}

/* ── the sources ── */

/* A row in the layer's units: `xw` 修为 and `ls` 灵石 as paid at `at`. */
function inUnits(row, L) {
  const pct = L?.need ? row.xw / L.need : null;
  return { ...row, layer: L?.name ?? null, pct: round(pct, 3), play_min: L?.rate ? round(row.xw / L.rate, 1) : null, ls_min: L?.ls_min && row.ls ? round(row.ls / L.ls_min, 1) : null };
}

function pills(ctx) {
  const { content, layerAt, met, saveFor } = ctx;
  return content.items.items.filter(i => i.kind === 'pill' && i.effect?.progress && (i.juan ?? 1) <= 1).map(i => {
    const where = met(i.id), at = where ? paying(content, layerAt(where.hui)) : null;
    const xw = at ? paysOf(content, saveFor(at), NOW, { table: i.effect.table, progress: i.effect.progress, tier: i.effect.tier })?.progress ?? 0 : i.effect.progress;
    const L = at ? ctx.layer(at) : null;
    const price = i.buy ?? 0;
    const share = i.of ? content.balance.pills?.share?.[(i.zhuan ?? 1) - 1] : null;
    const want_pct = share != null && at ? share * pillBelow(content, saveFor(at), i.tier) : null;
    return { ...inUnits({ id: i.id, name: zh(i.name), hui: where?.hui ?? null, how: where?.how ?? null, sources: where?.all ?? [], xw, raw: i.effect.progress, table: i.effect.table, zhuan: i.zhuan ?? null, buy: price || null }, L), want_pct, price_min: price && L?.ls_min ? round(price / L.ls_min, 1) : null };
  });
}

function boards(ctx) {
  const { content, layerAt, saveFor } = ctx, hui = sceneHuiOf(content), mm = content.balance.play_pay?.minutes ?? {};
  return (content.games?.games ?? []).filter(g => g.task && !g.replaced).map(g => {
    const t = content.tasks.tasks.find(x => x.id === g.task);
    if (!t) return null;
    const h = hui.get(g.scene) ?? null, at = h ? layerAt(h) : null, s = at ? saveFor(at) : null;
    const paid = s ? paysOf(content, s, NOW, t.grant) : null, own = paid?.progress ?? 0, pp = s ? playGrant(content, s, t.id, t, NOW, 3) : null;
    const xw = own + (pp?.progress ?? 0);
    return inUnits({ id: t.id, name: zh(t.title), kind: g.mechanic, hui: h, xw, own, layer_need: at ? ctx.layer(at)?.need ?? null : null, play: pp?.progress ?? 0, minutes: pp?.minutes ?? mm[g.mechanic] ?? mm.default ?? null, ls: (paid?.wealth ?? 0) + (pp?.wealth ?? 0) }, at ? ctx.layer(at) : null);
  }).filter(Boolean);
}

/* What a pill pays eaten on this save's layer (0 for a thing that is not a 修为 pill). */
function pillAt(content, s, id) {
  const e = content.items.items.find(i => i.id === id)?.effect;
  return e?.progress ? paysOf(content, s, NOW, { table: e.table, progress: e.progress, tier: e.tier })?.progress ?? 0 : 0;
}

function errands(ctx) {
  const { content, layerAt, saveFor } = ctx, at0 = content.balance.model.errands_at ?? {}, places = placesMet(content);
  // Its 回: the model's (`errands_at`), else the first 回 whose map holds the place it is given at.
  return content.quests.map(q => {
    const h = at0[q.id] ?? places.get(q.from?.place) ?? null, at = h ? layerAt(h) : null, s = at ? saveFor(at) : null;
    const own = s ? paysOf(content, s, NOW, q.grant) : null, more = s && q.work ? errandGrant(content, s) : null;
    const pill = s ? pillAt(content, s, q.grant?.item) : 0;
    return inUnits({ id: q.id, name: zh(q.title), work: q.work, hui: h, item: q.grant?.item ?? null, xw: (own?.progress ?? 0) + (more?.progress ?? 0) + pill, pill, ls: (own?.wealth ?? 0) + (more?.wealth ?? 0) }, at ? ctx.layer(at) : null);
  });
}

/* The typical player's 灵石 earned by the end of each 回 (the model plays no 杂役 and no 开府: pessimistic). */
function earnedBy(content) {
  const out = {};
  for (const D of play(content, content.balance.model.players.typical).ledger) if (D.hui) out[D.hui] = D.earned;
  let last = 0;
  for (const h of huisOf(content)) { out[h] = Math.max(out[h] ?? 0, last); last = out[h]; }
  return out;
}

/* How many 古 回 lie between two 回 (a 今 interlude is not one). */
const gap = (content, a, b) => huisOf(content).filter(x => huiOf(content, x)?.line === 'gu' && huiOrder(content, x) > huiOrder(content, a) && huiOrder(content, x) <= huiOrder(content, b)).length;

function shops(ctx) {
  const { content, layerAt } = ctx, sold = shopsMet(content), by = earnedBy(content);
  return [...sold].map(([id, h]) => {
    const i = content.items.items.find(x => x.id === id);
    if (!i?.buy) return null;
    const L = ctx.layer(layerAt(h));
    const afford = huisOf(content).find(x => huiOrder(content, x) >= huiOrder(content, h) && by[x] >= i.buy) ?? null;
    return { id, name: zh(i.name), kind: i.kind, hui: h, layer: L?.name ?? null, buy: i.buy, sell: i.sell ?? null, earned: round(by[h]), afford, wait: afford ? gap(content, h, afford) : null, ls_min: L?.ls_min && round(i.buy / L.ls_min, 1) };
  }).filter(Boolean).sort((a, b) => huiOrder(content, a.hui) - huiOrder(content, b.hui));
}

function gear(ctx) {
  const rows = ctx.content.items.items.filter(i => i.effect?.atk || i.effect?.def).map(i => ({ id: i.id, name: zh(i.name), kind: i.kind, atk: i.effect.atk ?? 0, def: i.effect.def ?? 0, buy: i.buy ?? null }));
  const per = r => (r.buy ? r.buy / (r.atk + r.def) : null);
  const mid = Object.fromEntries([...new Set(rows.map(r => r.kind))].map(k => [k, median(rows.filter(r => r.kind === k && per(r)).map(per))]));
  return rows.map(r => ({ ...r, per_point: round(per(r), 1), kind_median: round(mid[r.kind], 1) }));
}

function cards(ctx) {
  const minions = ctx.content.cards.cards.filter(c => c.kind === 'minion' && Number.isFinite(c.atk) && Number.isFinite(c.hp));
  const mid = cost => median(minions.filter(c => c.cost === cost).map(c => c.atk + c.hp));
  return minions.map(c => ({ id: c.id, name: zh(c.name), cost: c.cost, atk: c.atk, hp: c.hp, stats: c.atk + c.hp, cost_median: mid(c.cost), keywords: (c.keywords ?? []).length, effect: Boolean(c.effect) }));
}

/* Every fight weighed by the careful bot (tools/story-fights.mjs) — only when asked: it is slow. */
async function fights(ctx, deals) {
  const sf = await import('./story-fights.mjs'), { begin } = await import('../scripts/battle.js');
  const catalog = Object.fromEntries(ctx.content.cards.cards.map(c => [c.id, c]));
  return sf.FIGHTS.map(f => {
    const r = sf.rateOf(f, deals, 0, 'lookahead'), st = sf.stateAt(f.at), setup = sf.setupOf(f);
    // The bands are the master table's (`difficulty`); a fight may name its own (story-fights FIGHTS `band`).
    const D = ctx.content.balance.master?.difficulty ?? TARGET.band;
    const band = f.band ?? (f.pool ? D.pool : D.story), hui = f.at.replace(/^(h\d+).*/, '$1');
    // His side and the beast's as the door deals them: 气血, the deck, gear's 攻/甲.
    const opened = begin({ ...setup, seed: 'numbers' }, catalog);
    const you = { hp: opened.you?.hpMax ?? null, deck: (setup.you?.deck ?? []).length, armor: setup.you?.armor ?? 0 };
    return { key: sf.keyOf(f), id: f.id, name: f.name, at: f.at, hui, slack: D.slack ?? LIMITS.fight_slack, layer: ctx.layer({ tier: st.tier, step: st.step })?.name ?? null, pool: f.pool ?? null, band, win: round(r.win, 2), lost: round(r.lost, 2), turns: round(r.turns, 1), you, foe: { hp: opened.foe?.hpMax ?? null, deck: (setup.foe?.deck ?? []).length }, deals };
  });
}

function creatures(ctx, weighed) {
  const seen = new Set((weighed ?? []).map(f => f.id));
  return ctx.content.creatures.creatures.filter(c => !c._retired).map(c => ({ id: c.id, name: zh(c.name), hp: c.hp ?? null, deck: (c.deck ?? []).length, elite: Boolean(c.elite), weighed: seen.has(c.id) }));
}

/* ── 开炉: what a pot gives back against what went in (balance.json `kailu`; Hanli 2026-10-27: 扔草药出丹, 扔物品出装备,
   其他出符 — 「让玩家可以清空身上不用的物品」). Each family's sample pot, on a save standing at the 饭桶's first 回 and at
   卷一's last, at that 回's layer: its average return (the worth that comes out ÷ the worth that went in, items.json
   `sell` or the 品阶's worth) must sit in `kailu.band` — under it the bucket loses to the shop, over it the bucket is a
   farm — and a pot of junk must give something. Bought at the shop, a pot must never sell back for more than it cost. ── */
const KAILU_POTS = [
  { family: 'pill', name: '三味草药', ids: ['huangjing', 'fuling', 'chaihu'] },
  { family: 'gear', name: '三样兽材', ids: ['zhu-ya', 'chai-ya', 'lang-pi'] },
  { family: 'fu', name: '符与雄黄', ids: ['talisman', 'talisman', 'xionghuang'] },
  { family: 'mixed', name: '一药一牙一符', ids: ['huangjing', 'zhu-ya', 'talisman'] },
  { family: 'junk', name: '柴火石子枯叶', ids: ['chaihuo', 'shizi', 'kuye'] },
  { family: 'pill', name: '一颗九转丹', ids: ['qi-pill-9'] },
];
function kailu(ctx) {
  const { content } = ctx, t = content.fantong;
  if (!t?.worth) return [];
  const sceneOf = h => Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes ?? {})).find(sc => sc.hui === h) ?? null;
  const first = content.chapters[Object.keys(content.chapters).find(k => content.chapters[k].scenes?.[content.balance.model.fantong_from])]?.scenes?.[content.balance.model.fantong_from]?.hui;
  const huis = [...new Set([first, huisOf(content).at(-1)].filter(Boolean))];
  const items = new Map(content.items.items.map(i => [i.id, i]));
  const rows = [];
  for (const h of huis) {
    const at = paying(content, ctx.layerAt(h)), sc = sceneOf(h);
    if (!at || !sc) continue;
    const s = { ...ctx.saveFor(at), chapter: sc.chapter, scene: sc.id, bag: { danlu: 1 } };
    for (const pot of KAILU_POTS) {
      const o = chances(t, { ids: pot.ids, realm: realmOf(content, s, t), content, state: s });
      const buys = pot.ids.map(id => items.get(id)?.buy ?? 0);
      rows.push({ id: `${pot.family}@${h}`, name: pot.name, family: pot.family, leans: o.family, hui: h, layer: ctx.layer(at)?.name ?? null, ids: pot.ids,
        worth: round(o.worth, 1), value: round(o.value, 1), ratio: o.worth ? round(o.value / o.worth, 2) : null, buy: buys.every(b => b > 0) ? buys.reduce((a, b) => a + b, 0) : null });
    }
  }
  return rows;
}

/* ── the gates (Hanli 2026-10-27, at 古五's 渡口: a 修为 gate must never keep him where there is little to do) ── */
/* Each stage quest's way: how full the layer he needs stands when he comes to it — the typical player (30 min a day, 功课
   and 闭关) and the one who plays the book straight through (`model.session`) — and the wait there: the 修为 still owed ÷
   what a minute of what is reachable pays (the pool's fights and the boards he can play again, at the layer's games rate,
   a replay's falling share), with what is reachable listed. */
function gates(ctx) {
  const { content } = ctx, M = content.balance.model, kinds = kindTasks(content);
  const typ = play(content, M.players.typical).gates, ses = M.session ? play(content, M.session).gates : [];
  const reach = sceneId => {
    const ch = Object.values(content.chapters).find(c => c.scenes?.[sceneId]);
    const all = new Map(Object.values(content.places).flatMap(d => d.places).map(p => [p.id, p]));
    return (ch?.map?.places ?? []).map(id => all.get(id)).filter(p => p && (p.has?.pool || (p.has?.games ?? []).length))
      .map(p => `${zh(p.name) || p.id}${p.has?.pool ? ' 斗法' : ''}${(p.has?.games ?? []).length ? ` ${p.has.games.length} 局` : ''}`);
  };
  return typ.map(g => {
    const s2 = ses.find(x => x.scene === g.scene), at = g.layer, L = ctx.layer(at);
    // A minute of reachable play on a layer: the games' rate there (the median board's ★3 first play), at a replay's share.
    const rate = l => playRate(content, ctx.saveFor(l), kinds) * (M.practice?.factor ?? 0.6);
    // The minutes from where he stands to the gate's layer full: what his layer still asks, then each layer between, whole.
    const wait = x => {
      if (!x?.from) return null;
      const f = x.from, rows = ctx.layers.filter(l => l.tier === at.tier && l.step >= f.step && l.step <= at.step && !l.zero);
      if (f.tier !== at.tier) return null;
      const m = rows.reduce((n, l) => n + ((l.step === f.step ? Math.max(0, f.need - f.progress) : l.need) / (rate(l) || Infinity)), 0);
      return Number.isFinite(m) ? round(m) : null;
    };
    return { id: g.scene, scene: g.scene, hui: g.hui, label: huiLabel(content, g.hui, 'zh', 'short') ?? g.hui, layer: L?.name ?? null,
      typical: { pct: round(g.pct, 2), below: g.below, wait: wait(g), model_min: round(g.wait), days: round(g.days, 1), did: g.did },
      session: s2 ? { pct: round(s2.pct, 2), below: s2.below, wait: wait(s2), model_min: round(s2.wait), did: s2.did } : null,
      reach: reach(g.scene) };
  });
}

/* ── the pace: days per 回 against the base bands (not the widened `except`) ── */
function paces(content) {
  const bands = content.balance.model.bands, held = new Set(grindLayers(content).map(g => g.hui));
  // A 回's own band where one is decided (`bands.except`); `held`: it holds a stage quest (古九 has none: its days are its story's).
  return paceTable(content).map(r => ({ ...r, label: huiLabel(content, r.hui, 'zh', 'short') ?? r.hui, band: bands.except?.[r.hui]?.typical ?? bands.typical, own: Boolean(bands.except?.[r.hui]?.typical), held: held.has(r.hui), later: huiOrder(content, r.hui) >= huiOrder(content, content.balance.model.later) }));
}

/* ── text that states an amount (design.md § 数值系统: generated or checked) ── */

const CN = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN = { half: 0.5, a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, nine: 9, ten: 10 };
/* Claims the validator can evaluate: a duration of sitting a thing is worth. `days` turns the match into days. */
const CLAIMS = [
  { lang: 'zh', re: /抵(半|[一两二三四五六七八九十\d]+)(日|天|夜)/g, days: m => CN[m[1]] ?? Number(m[1]), unit: /打坐|闭关|坐/ },
  { lang: 'en', re: /(?:worth|this,|it,) (half|a|one|two|three|four|five|six|seven|nine|ten|\d+) (?:a )?(day|days|night|nights)(?:'s)?/gi, days: m => EN[m[1].toLowerCase()] ?? Number(m[1]), unit: /sitting|seclusion/i },
];
/* Amounts no rule here can evaluate: listed, never dropped. */
const LOOSE = [/修为\s*[+＋]?\s*\d+/, /\d+\s*(修为|灵石)/, /[一二三四五六七八九十百]+(时辰|刻)/];

/* Every text a player reads that may state an amount: items, errands, boards' lines, 人间功课, the story. */
function texts(content) {
  const out = [], put = (where, id, field, v, item = null) => { for (const lang of ['zh', 'en']) { const t = typeof v === 'string' ? (lang === 'zh' ? v : '') : v?.[lang]; if (t) out.push({ where, id, field, lang, text: t, item }); } };
  for (const i of content.items.items) { put('item', i.id, 'about', i.about, i.id); put('item', i.id, 'hint', i.hint, i.id); }
  for (const q of content.quests) { put('errand', q.id, 'say', q.say, q.grant?.item); put('errand', q.id, 'done', q.done, q.grant?.item); }
  for (const t of content.tasks.tasks) put('board', t.id, 'done_line', t.done_line);
  for (const [k, g] of Object.entries(content.gongke?.kinds ?? content.gongke ?? {})) if (g && typeof g === 'object') put('gongke', k, 'name', g.name);
  for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes)) {
    put('scene', sc.id, 'story', sc.story); put('scene', sc.id, 'story_after', sc.story_after);
    for (const e of sc.exits ?? []) put('scene', `${sc.id}/${e.id}`, 'exit', e.story, e.grant?.item);
  }
  return out;
}

/* The item a clause speaks of: the longest item name in it, else the text's own item. */
function subjectOf(content, clause, own) {
  const names = content.items.items.map(i => [i.id, zh(i.name)]).filter(([, n]) => n && clause.includes(n)).sort((a, b) => b[1].length - a[1].length);
  return names[0]?.[0] ?? own;
}

function claims(ctx) {
  const { content } = ctx, checked = [], loose = [];
  for (const t of texts(content)) {
    const rules = CLAIMS.filter(c => c.lang === t.lang && c.unit.test(t.text));
    let hit = false;
    for (const rule of rules) for (const clause of t.text.split(/[；;。.!?！？]/)) for (const m of clause.matchAll(rule.re)) {
      hit = true;
      checked.push(claimRow(ctx, t, rule.lang === 'zh' ? subjectOf(content, clause.slice(0, m.index), t.item) : t.item, rule.days(m), m[0]));
    }
    if (!hit && t.lang === 'zh' && t.where !== 'scene' && LOOSE.some(re => re.test(t.text))) loose.push({ where: t.where, id: t.id, field: t.field, text: t.text.slice(0, 80) });
  }
  // An English claim speaks of what the Chinese one in the same place does, in order (「坊市的聚气丹抵半日…；它抵三日」).
  const zhOf = new Map();
  for (const c of checked.filter(x => x.lang === 'zh')) (zhOf.get(`${c.where}|${c.id}|${c.field}`) ?? zhOf.set(`${c.where}|${c.id}|${c.field}`, []).get(`${c.where}|${c.id}|${c.field}`)).push(c);
  const seen = new Map();
  for (const c of checked.filter(x => x.lang === 'en')) {
    const k = `${c.where}|${c.id}|${c.field}`, n = seen.get(k) ?? 0, twin = zhOf.get(k)?.[n];
    seen.set(k, n + 1);
    if (twin) Object.assign(c, { subject: twin.subject, actual: twin.actual, ratio: c.claimed && twin.actual != null ? round(twin.actual / c.claimed, 2) : null });
  }
  return { checked, loose };
}

/* One claim weighed: `days` of sitting at the layer the text is met (the text's own item's), against the subject's 修为. */
function claimRow(ctx, t, subject, days, said) {
  const where = t.item ? ctx.met(t.item) : null, at = where ? paying(ctx.content, ctx.layerAt(where.hui)) : null, L = at ? ctx.layer(at) : null;
  const pill = ctx.content.items.items.find(i => i.id === subject);
  const xw = pill?.effect?.progress && at ? paysOf(ctx.content, ctx.saveFor(at), NOW, { table: pill.effect.table, progress: pill.effect.progress, tier: pill.effect.tier })?.progress ?? null : null;
  const claimed = L ? days * L.night : null;
  // The same claim read on every 练气 layer: 闭关 grows with the layer (layer_pay), a pill does not.
  const drift = pill?.effect?.progress ? ctx.layers.filter(l => l.tier === ctx.content.ladder.tiers[0].id && l.need).map(l => {
    const x = paysOf(ctx.content, ctx.saveFor(l), NOW, { table: pill.effect.table, progress: pill.effect.progress, tier: pill.effect.tier })?.progress ?? 0;
    return { layer: l.name, ratio: l.night ? round(x / (days * l.night), 2) : null };
  }) : [];
  return { drift, where: t.where, id: t.id, field: t.field, lang: t.lang, said, subject, days, layer: L?.name ?? null, night: L?.night ?? null, claimed, actual: xw, ratio: claimed && xw != null ? round(xw / claimed, 2) : null, text: t.text };
}

/* ── hard errors: what no balance makes right ── */

function walkNumbers(node, path, out) {
  if (typeof node === 'number') { if (!Number.isFinite(node)) out.push({ where: path, say: `${path} is ${node}` }); else if (node < 0) out.push({ where: path, say: `${path} is negative (${node})` }); return; }
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) walkNumbers(v, `${path}.${k}`, out);
}

export function hardErrors(content) {
  const out = [], items = new Set(content.items.items.map(i => i.id)), b = content.balance ?? {};
  for (const k of ['layers', 'pay', 'prices', 'pills', 'play_pay', 'cooldowns', 'convert', 'boards', 'layer_pay', 'dandu', 'kailu']) walkNumbers(b[k], `balance.${k}`, out);
  for (const i of content.items.items) walkNumbers({ effect: i.effect, buy: i.buy, sell: i.sell }, `item ${i.id}`, out);
  for (const c of content.creatures.creatures) if (c.hp != null && !(c.hp > 0)) out.push({ where: `creature ${c.id}`, say: `hp ${c.hp}` });
  for (const id of Object.keys(b.prices ?? {})) if (!items.has(id)) out.push({ where: `balance.prices.${id}`, say: `a price for ${id}, which items.json does not hold` });
  for (const [id, p] of Object.entries(b.prices ?? {})) if (p.buy && p.sell > p.buy) out.push({ where: `balance.prices.${id}`, say: `sells back for ${p.sell}, over its price ${p.buy}` });
  for (const t of content.ladder.tiers) t.thresholds.forEach((n, k) => { if (k > (t.zero ? 1 : 0) && n < t.thresholds[k - 1]) out.push({ where: `layers.${t.id}[${k}]`, say: `${n} under the layer below (${t.thresholds[k - 1]})` }); });
  return out;
}

/* ── the red list: one table of rules a source's rows are read by ── */

const pct = x => `${Math.round(x * 100)}%`;
let KAILU_BAND = () => [0.85, 1.6];
const offLayers = r => (r.drift ?? []).filter(d => d.ratio != null && Math.abs(Math.log(d.ratio)) > Math.log(1 + LIMITS.claim_off)).filter((d, k, a) => k === 0 || k === a.length - 1);
const RED = {
  pills: [
    // A 修为 pill is its 转's share of the layer (balance.json pills, from the master table): red where it is not.
    [r => r.want_pct != null && r.pct != null && Math.abs(r.pct / r.want_pct - 1) > 0.1, r => `${r.name}: 修为 ${r.xw} = ${pct(r.pct)} of ${r.layer}, its ${r.zhuan}转's share is ${pct(r.want_pct)}`],
    [r => r.price_min != null && r.play_min != null && r.price_min < r.play_min, r => `${r.name}: buys ${r.play_min} min of play's 修为 for ${r.price_min} min of 灵石 — faster than playing`],
    [r => !r.hui, r => `${r.name}: met nowhere in 卷一 that the validator finds`],
  ],
  // A board's play pay is its minutes at the layer's rate (play_pay): one over the limit is the layer's hours, told once a
  // layer (below, redList); only its own authored grant is the board's.
  boards: [[r => r.own && r.layer_need && r.own / r.layer_need > LIMITS.thing_pct, r => `${r.name} (${r.kind}, ${r.hui}): its own grant ${r.own} = ${pct(r.own / r.layer_need)} of ${r.layer}`]],
  errands: [
    // Its own pay (the pill it hands over is weighed as a pill).
    [r => r.pct != null && r.xw && ((r.xw - (r.pill ?? 0)) / r.xw) * r.pct > LIMITS.thing_pct, r => `${r.name} (${r.hui}): 修为 ${r.xw - (r.pill ?? 0)} = ${pct(((r.xw - (r.pill ?? 0)) / r.xw) * r.pct)} of ${r.layer}${r.pill ? ` (and its pill ${r.pill})` : ''}`],
    [r => !r.hui, r => `${r.name}: on no 卷一 map (errands_at) — not weighed`],
  ],
  shops: [
    [r => !r.afford, r => `${r.name} (${r.buy} 灵石, sold from ${r.hui}): the typical player never earns it in 卷一`],
    [r => r.wait >= LIMITS.shop_wait, r => `${r.name} (${r.buy} 灵石, sold from ${r.hui}): the typical player has earned it only by ${r.afford}, ${r.wait} 回 later`],
  ],
  gear: [[r => r.per_point && r.kind_median && (r.per_point > r.kind_median * LIMITS.gear_off || r.per_point < r.kind_median / LIMITS.gear_off), r => `${r.name} (${r.kind}): ${r.per_point} 灵石 a point, its kind's median ${r.kind_median}`]],
  cards: [[r => r.cost_median != null && r.stats - r.cost_median >= LIMITS.card_off && !r.keywords && !r.effect, r => `${r.name} (cost ${r.cost}): 攻${r.atk}+血${r.hp}, its cost's median ${r.cost_median}`]],
  fights: [[r => r.win < r.band[0] - (r.slack ?? LIMITS.fight_slack) || r.win > r.band[1] + (r.slack ?? LIMITS.fight_slack), r => `${r.name} (${r.at}, ${r.layer}): bot wins ${pct(r.win)}, band ${pct(r.band[0])}–${pct(r.band[1])}`]],
  layers: [
    [r => r.prev && r.need && r.need < r.prev.need, r => `${r.name} asks ${r.need} 修为, under ${r.prev.name}'s ${r.prev.need} — the next realm is cheaper than the last layer of this one`],
    [r => r.target_h && r.chore_h && Math.abs(r.chore_h / r.target_h - 1) > LIMITS.hours_off, r => `${r.name}: with one 功课 a day its ${r.need} 修为 fill in ${r.chore_h} h of play (${r.chore_days} days at 30 min) — target ${r.target_h} h; the 功课 carries ${pct(1 - r.chore_h / r.rule_h)} of it`],
    // A rarer 功课 pays more: a day's < a week's < a month's (balance.json play_pay.chore).
    [r => !r.zero && [r.chore_day, r.chore_week, r.chore_month].filter(x => x != null).some((x, i, a) => i && x <= a[i - 1]), r => `${r.name}: a day's · a week's · a month's 功课 pay ${r.chore_day} · ${r.chore_week} · ${r.chore_month} — a rarer one should pay more`],
    [r => r.target_h && r.rule_h && r.rule_h / r.target_h > 1 + LIMITS.hours_off, r => `${r.name}: with no 功课 (a plain install) ${r.rule_h} h of play — ${round(r.rule_h / r.target_h, 1)}× the target ${r.target_h} h`],
  ],
  kailu: [
    [r => r.ratio != null && r.ratio < KAILU_BAND()[0], r => `开炉 ${r.name} (${r.hui}, ${r.layer}): gives back ${pct(r.ratio)} of what went in (${r.value} of ${r.worth} 灵石) — under ${pct(KAILU_BAND()[0])}, the shop pays better`],
    [r => r.ratio != null && r.ratio > KAILU_BAND()[1], r => `开炉 ${r.name} (${r.hui}, ${r.layer}): gives back ${pct(r.ratio)} of what went in — over ${pct(KAILU_BAND()[1])}, a farm`],
    [r => !r.worth && !(r.value > 0), r => `开炉 ${r.name} (${r.hui}): a pot of junk gives nothing`],
    [r => r.buy && r.value >= r.buy, r => `开炉 ${r.name} (${r.hui}): bought for ${r.buy}, it gives back ${r.value} — a farm`],
    [r => r.family !== 'junk' && r.leans !== r.family, r => `开炉 ${r.name}: leans to ${r.leans}, meant for ${r.family}`],
  ],
  // A gate he comes to well short, or below its layer, waits longer than a sitting where only the pool and a few boards stand.
  gates: [[r => [r.typical, r.session].some(x => x && (x.wait ?? 0) > LIMITS.gate_wait), r => `${r.label} ${r.scene} (${r.layer}): ${[['typical', r.typical], ['straight through', r.session]].filter(([, x]) => x).map(([w, x]) => `${w} comes ${x.below ? 'a layer short' : `${pct(x.pct)} full`}, ~${x.wait} min of play`).join(' · ')} — reachable: ${r.reach.join(' · ') || 'nothing'}`]],
  paces: [[r => r.later && r.held && r.typical != null && (r.typical < r.band[0] || r.typical > r.band[1]), r => `${r.label}: typical ${r.typical} days, band ${r.band[0]}–${r.band[1]}${r.own ? ' (its own, balance.json model.bands.except)' : ''}`]],
  claims: [
    [r => r.ratio != null && Math.abs(Math.log(r.ratio)) <= Math.log(1 + LIMITS.claim_off) && offLayers(r).length, r => `${r.id} says 「${r.said}」 of ${r.subject}: true at ${r.layer}, but 闭关 grows with the layer — ${offLayers(r).map(d => `${d.layer} ×${d.ratio}`).join(' · ')}`],
    [r => r.ratio != null && Math.abs(Math.log(r.ratio)) > Math.log(1 + LIMITS.claim_off), r => `${r.id} says 「${r.said}」 of ${r.subject}: ${r.days} × a night's 闭关 at ${r.layer} (${r.night}) = ${r.claimed}, it pays ${r.actual}`]],
};

function redList(report) {
  const out = [];
  // Boards past the limit by the layer's hours: one row a layer.
  const by = new Map();
  for (const b of report.boards ?? []) if (b.pct > LIMITS.thing_pct) (by.get(b.layer) ?? by.set(b.layer, []).get(b.layer)).push(b);
  for (const [layer, bs] of by) {
    const L = report.layers.find(l => l.name === layer), top = bs.sort((a, b) => b.pct - a.pct)[0];
    out.push({ src: 'layers', id: L?.key ?? layer, say: `${layer}: ${L?.target_h} h of play a layer — ${bs.length} boards pay over ${pct(LIMITS.thing_pct)} of it each (${top.name}, ${top.minutes} min: ${pct(top.pct)})${L?.curve_h != null && L.curve_h !== L.target_h ? ` — the curve's ${L.curve_h} h, fitted down so the 回 holding it lands in its band` : ''}` });
  }
  for (const [src, rules] of Object.entries(RED)) for (const row of src === 'claims' ? report.claims.checked.filter(c => c.lang === 'zh') : report[src] ?? []) for (const [when, say] of rules) if (when(row)) out.push({ src, id: row.id ?? row.key ?? row.hui, say: say(row) });
  return out;
}

/* ── the master table: its knobs (no `_` notes) and the overrides, as the page lists them ── */
const knobs = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, knobs(x)])) : v);
function masterOf(content) {
  const b = content.balance ?? {};
  return b.master ? { knobs: knobs(b.master), overrides: (b.overrides ?? []).map(o => ({ ...o })) } : null;
}

/* ── the report ── */

const commit = () => { try { return execSync('git rev-parse --short HEAD', { cwd: fileURLToPath(new URL('.', import.meta.url)) }).toString().trim(); } catch { return null; } };

export async function measure(content = loadContent(), { deals = 0, keep = null } = {}) {
  const base = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), layers = layersOf(content, base);
  const hl = huiLayers(content), byKey = new Map(layers.map(l => [l.key, l]));
  const ctx = { content, layers, met: itemsMet(content), layerAt: h => hl[h] ?? null, saveFor: at => saveAt(base, at), layer: at => (at ? byKey.get(keyOf(at)) ?? null : null) };
  const P = pills(ctx);
  const F = deals ? await fights(ctx, deals) : keep?.fights ?? [];
  const report = {
    stamp: { date: new Date().toISOString().slice(0, 10), commit: commit(), deals: deals || keep?.stamp?.deals || 0, target: { ...TARGET, games: gamesOf(content) }, limits: LIMITS },
    defs: { night_h: content.rewards.seclusion.rest_hours, caveats: ['The model plays practice boards only while a stage quest holds him (balance.json model.practice): its days per 回 run long.', 'The model plays no 杂役 errands and no 开府: 灵石 earned is low, affordability pessimistic.', 'A 回 holds him on its stage quest\'s layer (else its cap); a 今 interlude takes the 古 before it.', 'A day of sitting = one night of 闭关 (rewards.json seclusion rest_hours) at the layer, as the rules pay it.'] },
    layers, huis: Object.entries(hl).map(([h, at]) => ({ hui: h, label: huiLabel(content, h, 'zh', 'short') ?? h, layer: ctx.layer(at)?.name ?? layerName(content, at.tier, at.step), earned: null })),
    paces: paces(content), gates: gates(ctx), kailu: kailu(ctx), pills: P, boards: boards(ctx), errands: errands(ctx), shops: shops(ctx), gear: gear(ctx), cards: cards(ctx),
    fights: F, creatures: creatures(ctx, F), claims: claims(ctx), errors: hardErrors(content),
    // The master table's knobs and the overrides laid on what it derives (tools/master.mjs; the 数值 page's 总表).
    master: masterOf(content),
  };
  const by = earnedBy(content);
  for (const h of report.huis) h.earned = round(by[h.hui]);
  KAILU_BAND = () => content.balance?.kailu?.band ?? [0.85, 1.6];
  report.red = redList(report);
  return report;
}

/* ── the command line ── */

function summary(r) {
  const lines = [`数值 ${r.stamp.date} @${r.stamp.commit ?? '?'} — ${r.errors.length} hard errors · ${r.red.length} red`];
  lines.push('层          need  修为/min  night  功课/day  功课/mo  rule h  target h  model h (typical days)');
  for (const l of r.layers) lines.push(`${l.name.padEnd(8)} ${String(l.need).padStart(6)} ${String(l.rate).padStart(8)} ${String(l.night).padStart(6)} ${String(l.chore_day ?? '—').padStart(8)} ${String(l.chore_month ?? '—').padStart(8)} ${String(l.rule_h ?? '—').padStart(7)} ${String(l.target_h ?? '—').padStart(9)} ${String(l.model_h ?? '—').padStart(8)} (${l.model_days.typical ?? '—'})`);
  lines.push('回 days (light · typical · heavy): ' + r.paces.map(p => `${p.hui} ${p.light}·${p.typical}·${p.heavy}`).join('  '));
  for (const e of r.errors) lines.push(`ERROR ${e.where}: ${e.say}`);
  const bySrc = {};
  for (const x of r.red) (bySrc[x.src] ??= []).push(x);
  for (const [src, xs] of Object.entries(bySrc)) { lines.push(`── ${src} (${xs.length})`); for (const x of xs.slice(0, 8)) lines.push(`  ${x.say}`); if (xs.length > 8) lines.push(`  … ${xs.length - 8} more`); }
  if (!r.fights.length) lines.push('(fights not weighed: --fights N, or --write)');
  return lines.join('\n');
}

/* The master table's world against balance.json as it stands: the rows that would change (tests/numbers.test.mjs holds it empty). */
const WORLD = new URL('../worlds/jiuding/', import.meta.url);
export function applied() {
  const read = f => JSON.parse(fs.readFileSync(new URL(f, WORLD), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(BALANCE_FILE, 'utf8'));
  const next = derive(raw, { ladder: read('ladder.json'), items: read('items.json').items });
  // The pace fit plays the model on the derived world (master.mjs fitHours): the hours of the layers a 回 holds.
  const world = withBalance({ ...loadContent(), balance: structuredClone(next) });
  const fit = fitHours(world, { grindLayers, table: paceTable, play });
  next.play_pay.hours.qi = fit.qi;
  for (const o of next.overrides ?? []) if (o.path.startsWith('play_pay.hours')) setPath(next, o.path, structuredClone(o.value));
  return { raw, next, fit, diff: diffOf(raw, next) };
}

const arg = (name, d) => { const i = process.argv.indexOf(name); return i < 0 ? null : Number(process.argv[i + 1]) || d; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = process.argv.includes('--apply') ? null : loadContent();
  if (process.argv.includes('--check')) {
    const errs = hardErrors(content);
    for (const e of errs) console.error(`ERROR ${e.where}: ${e.say}`);
    console.log(errs.length ? `${errs.length} hard errors` : 'numbers: no hard errors');
    process.exit(errs.length ? 1 : 0);
  }
  const write = process.argv.includes('--write');
  if (process.argv.includes('--apply')) {
    const { next, diff, fit } = applied();
    for (const f of fit.fitted) console.log(`fit ${f.hui}: 层 ${f.layers.join('·')} ${f.curve.join('·')} h → ${f.hours.join('·')} h (typical ${round(f.days_were, 1)} → ${round(f.days, 1)} days)${f.gate ? ' — cut for its gates' : ''}${f.out ? ` — OUT of its band ${f.out.join('–')}` : ''}`);
    for (const w of fit.waits) console.log(`gate ${w.hui}: ${w.say}`);
    for (const f of fit.unfit) console.log(f.short ? `short ${f.hui}: 层 ${f.layers.join('·')} — typical ${round(f.days, 1)} days, under its band; kept at the curve (dearer layers would only lengthen its gates)` : `unfit ${f.hui}: 层 ${f.layers.join('·')} at ${round(f.days, 1)} days; no hours reach the band (${f.reach.map(x => round(x, 1)).join(' – ')})`);
    for (const d of diff) console.log(`${d.path}: ${JSON.stringify(d.was)} → ${JSON.stringify(d.now)}`);
    console.log(diff.length ? `${diff.length} rows ${write ? 'written' : 'would change (dry run: --write to write)'}` : 'the master table and balance.json agree');
    for (const o of next.overrides ?? []) console.log(`override ${o.path} = ${JSON.stringify(o.value)} — ${o.why}`);
    if (!write) process.exit(0);
    if (diff.length) fs.writeFileSync(BALANCE_FILE, balanceText(next));
  }
  const world = content ?? loadContent();
  const keep = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const report = await measure(world, { deals: arg('--fights', 30) ?? (write ? 30 : 0), keep });
  if (write) { fs.writeFileSync(OUT, JSON.stringify(report) + '\n'); console.log(`→ ${fileURLToPath(OUT)}`); }
  console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 1) : summary(report));
}
