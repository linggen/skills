// xiuwei-model.mjs — 卷一's 修为 pace, as a natural player earns it (Hanli,
// 2026-10-15: 「让游戏修为和故事match」 — the realm tracks the book, each layer
// asks more, chores pay 灵石).
//
// `node tools/xiuwei-model.mjs` prints, per 古 回, what a player earns there
// without grinding and where that leaves the realm, beside the 回's cap (the
// book's layer, ladder.json `caps.hui`), and the scene at which the cap
// layer's bar first stood full. `--try=0,200,400,…` runs other 练气
// thresholds; `left` (the 修为 each 练气 layer held when the story took the
// save off it) is what a layer the book holds him on should ask. tests/xiuwei-pace.test.mjs
// runs the same model against ladder.json, so a reward or a threshold changed
// later that lets the realm run ahead of the book fails there.
//
// The cap is the hard ceiling: with 体力 off (Hanli, 2026-10-01) a grinder
// fills the cap layer whatever the thresholds, and the rest is held. The
// thresholds are for the player who plays the story: they set WHEN the cap
// layer fills, so it fills near the 回's close, not in its first scenes.
//
// The model, in order of the book's scenes (each chapter's first_scene, then
// each scene's first `next`):
//   - a scene's exits: the best `grant.progress` among them (capped by its
//     table), after its `rise` (the rise lands first, core.mjs resolve), and
//     its boards' task grants, before it; a `breakthrough` lands at 0, or full
//     when the pill it eats is the 九转 (09-qulao hands it over first);
//   - each 回's repeatables, spread evenly over its scenes: SESSIONS real
//     days of play (one per SCENES_PER_SESSION scenes, rounded up), each day
//     the day's 功课 (the fixed real-life chore, `gongke` table), FIGHTS pool
//     fights (`haunt` table), TALE of a 今日传闻 (steps + finale, its cap),
//     ROAD road-meets paid on the `meet` table;
//   - the 修行 errands on offer in that 回 (ERRANDS_AT — the giver's place in
//     the chapter's map, the chain's first done), paid when the 回 begins;
//   - 杂役 errands, 开府 and the day's pick pay 灵石 only: they add nothing.
// Every gain goes through the ladder as the rules do: 零层 takes nothing, a
// layer fills to the 回's cap and the rest is held, a rise carries what was
// held toward the next layer (short of its threshold).
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';

/* A natural day's play in 卷一 (rewards.json `_economy`): a sitting reads
   about five scenes; each day the workout, two pool fights, half a rumor and
   one road-meet that pays (a 路人问 riddle or the day's 机缘). */
export const PLAY = { SCENES_PER_SESSION: 5, GONGKE: 1, FIGHTS: 2, TALE: 0.5, ROAD: 1, SPEED: 1 };
/* No repeatables at all: the story and the errands alone. */
export const ONE_OFFS = { ...PLAY, GONGKE: 0, FIGHTS: 0, TALE: 0, ROAD: 0 };

/* The 修行 errands a 回 offers (the rest of 卷一's errands are 杂役: no 修为).
   药园巡夜's 狰 is 古四's (wm-yaoyuan); 彭城 and 柳湾 are on 冀's map only, so
   蠪侄 (after 彭城的药钱) and 人鱼 are 古九's. */
export const ERRANDS_AT = { 'xu-yaoyuan-shouye': 'h05', 'guan-houshan-yezhu': 'h06', 'xu-fuli-longzhi': 'h10', 'ji-liuwan-renyu': 'h10' };

const tableCap = (content, grant) => Math.min(grant?.progress ?? 0, content.rewards.tables[grant?.table]?.progress ?? 0);

/* 卷一's 古 scenes in the order a player meets them. */
export function bookScenes(content) {
  const out = [];
  const chapters = Object.values(content.chapters).filter(ch => ch.juan === 1).sort((a, b) => a.id.localeCompare(b.id));
  for (const ch of chapters) {
    const seen = new Set();
    for (let id = ch.first_scene; id && ch.scenes[id] && !seen.has(id);) {
      seen.add(id);
      const sc = ch.scenes[id];
      if (content.ladder.caps.hui[sc.hui]) out.push({ chapter: ch.id, ...sc });
      id = sc.exits.map(e => e.next).find(n => n && ch.scenes[n]);
    }
  }
  return out;
}

/* What one day of natural play pays at the ladder's base (before a tier's `pay`). */
export function dayIncome(content, play = PLAY) {
  const t = content.rewards.tables, tale = content.rewards.tale.cap.progress;
  const rumor = Math.min(tale, 3 * t.tale.progress + t.tale_end.progress);
  return play.GONGKE * t.gongke.progress + play.FIGHTS * t.haunt.progress + play.TALE * rumor + play.ROAD * t.meet.progress;
}

/* Run 卷一 through the ladder. `ladder` defaults to the world's. Returns a row
   per 回: scenes, days, earned (what was offered), where the realm stands at
   the close, and the scene index (0-based, within the 回) at which the cap
   layer's bar first stood full (null if never). */
export function runJuan1(content, { ladder = content.ladder, play = PLAY } = {}) {
  const tiers = ladder.tiers, caps = ladder.caps.hui;
  const tierAt = id => tiers.find(t => t.id === id), rank = (tier, step) => tiers.findIndex(t => t.id === tier) * 100 + step;
  const stepOf = (tier, layer) => layer - (tierAt(tier).zero ? 0 : 1);
  const scenes = bookScenes(content);
  const byHui = new Map();
  for (const sc of scenes) byHui.set(sc.hui, [...(byHui.get(sc.hui) ?? []), sc]);
  const quests = new Map(content.quests.map(q => [q.id, q]));
  const day = dayIncome(content, play) * play.SPEED;
  const s = { tier: tiers[0].id, step: 0, progress: 0, pill9: false };
  const rows = [], left = {};
  // What a 练气 layer held when the story (or the book's close) took the save off it.
  const leave = () => { if (s.tier === tiers[0].id) left[s.step] = Math.max(left[s.step] ?? 0, s.progress); };
  let hui = null, row = null;
  const capAt = () => { const c = caps[hui]; return { grind: Math.max(rank(c.tier, stepOf(c.tier, c.layer)), rank(s.tier, s.step)), story: rank((c.story ?? c).tier, stepOf((c.story ?? c).tier, (c.story ?? c).layer)) }; };
  const gain = (n, k) => {
    if (n <= 0) return;
    const tier = tierAt(s.tier);
    if (tier.zero && s.step === 0) { row.lost += n; return; }
    s.progress += n * (tier.pay ?? 1);
    for (;;) {
      const need = tier.thresholds[s.step];
      if (s.progress < need) break;
      const last = s.step >= tier.thresholds.length - 1;
      if (last || rank(s.tier, s.step + 1) > capAt().grind) { row.held += s.progress - need; s.progress = need; if (row.full_at == null) row.full_at = k; break; }
      s.progress -= need; s.step += 1;
    }
  };
  scenes.forEach(sc => {
    if (sc.hui !== hui) {
      hui = sc.hui;
      const list = byHui.get(hui), days = Math.ceil(list.length / play.SCENES_PER_SESSION);
      row = { hui, scenes: list.length, days, story: 0, errands: 0, daily: days * day, lost: 0, held: 0, full_at: null, k: 0 };
      rows.push(row);
      for (const [id, at] of Object.entries(ERRANDS_AT)) if (at === hui && quests.has(id)) row.errands += tableCap(content, quests.get(id).grant) * play.SPEED;
      gain(row.errands, 0);
    }
    const k = row.k++;
    const boards = (sc.show ?? []).filter(c => c.card === 'board').map(c => content.tasks.tasks.find(t => t.id === c.id)).filter(Boolean);
    const b = boards.reduce((n, t) => n + tableCap(content, t.grant), 0);
    row.story += b; gain(b * play.SPEED, k);
    // The exit a player takes: the one that carries the story furthest, then pays most.
    const exits = sc.exits.filter(e => e.next || e.rise || e.breakthrough || e.grant);
    const best = exits.sort((a, c) => (Boolean(c.breakthrough) - Boolean(a.breakthrough)) || (Boolean(c.rise) - Boolean(a.rise)) || (tableCap(content, c.grant) - tableCap(content, a.grant)))[0];
    if (best?.grant?.item && /-9$/.test(best.grant.item) && content.items.items.find(i => i.id === best.grant.item)?.fill === 'full') s.pill9 = true;
    if (best?.breakthrough) {
      leave();
      const next = tiers[tiers.findIndex(t => t.id === s.tier) + 1];
      s.tier = next.id; s.step = 0; s.progress = s.pill9 ? next.thresholds[0] : 0;
    }
    if (best?.rise) {
      const layer = typeof best.rise === 'object' ? best.rise.layer : best.rise, full = typeof best.rise === 'object' && best.rise.full;
      const tier = tiers[0], top = Math.min(stepOf(tier.id, layer), tier.thresholds.length - 1);
      if (s.tier === tier.id && rank(tier.id, top) <= capAt().story && (s.step < top || (full && s.step === top))) {
        leave();
        s.step = top;
        s.progress = full ? tier.thresholds[top] : Math.max(0, Math.min(s.progress, tier.thresholds[top] - 1));
      }
    }
    const g = tableCap(content, best?.grant);
    row.story += g; gain(g * play.SPEED, k);
    gain(row.daily / row.scenes, k);
    row.end = { tier: s.tier, step: s.step, progress: s.progress, need: tierAt(s.tier).thresholds[s.step] };
  });
  leave();
  const out = rows.map(({ k, ...r }) => ({ ...r, cap: caps[r.hui] }));
  out.left = left;
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = loadContent();
  // `--try=0,200,400,…`: run the model on other 练气 thresholds, the world's left as they are.
  const tried = process.argv.find(a => a.startsWith('--try='));
  if (tried) content.ladder.tiers[0].thresholds = tried.slice(6).split(',').map(Number);
  console.log(`练气 thresholds ${JSON.stringify(content.ladder.tiers[0].thresholds)}`);
  const name = (tier, step) => `${content.ladder.tiers.find(t => t.id === tier).name.zh}${content.ladder.tiers.find(t => t.id === tier).steps.zh[step]}`;
  console.log(`a day of natural play pays ${dayIncome(content)} 修为 (练气, base)`);
  console.log('回    scenes days  story errands daily  lost  held  close                    cap         full at');
  for (const r of runJuan1(content)) {
    const capName = `${r.cap.tier === 'qi' ? '练气' : '筑基'}${r.cap.layer}${r.cap.story ? `→${r.cap.story.layer}` : ''}`;
    console.log(`${r.hui}  ${String(r.scenes).padStart(5)} ${String(r.days).padStart(4)} ${String(r.story).padStart(6)} ${String(r.errands).padStart(7)} ${String(r.daily).padStart(5)} ${String(r.lost).padStart(5)} ${String(Math.round(r.held)).padStart(5)}  ${`${name(r.end.tier, r.end.step)} ${Math.round(r.end.progress)}/${r.end.need}`.padEnd(24)} ${capName.padEnd(11)} ${r.full_at == null ? '—' : `scene ${r.full_at + 1}/${r.scenes}`}`);
  }
  console.log('left:', JSON.stringify(Object.fromEntries(Object.entries(runJuan1(content).left).map(([k, v]) => [k, Math.round(v)]))));
}
