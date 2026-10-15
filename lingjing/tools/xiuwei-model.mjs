// xiuwei-model.mjs — 卷一's 修为 budget per 回 (Hanli, 2026-10-15: 「让游戏修为和故事
// match」; 「得到奖励应该有变化……确保用户交差能看到提升」).
//
// `node tools/xiuwei-model.mjs` prints, per 古 回 and for two players, what the
// 回 offers and where it leaves the realm beside the book's layer (ladder.json
// `caps.hui`): EVERYTHING does every task on offer at a natural pace; NOTHING
// only walks the story. `--try=0,200,400,…` runs other 练气 thresholds.
// tests/xiuwei-pace.test.mjs runs the same model on the world, so a task or a
// threshold that lets the realm run ahead of the book (or a layer fill in a
// 回's first half) fails there.
//
// The ladder as the rules run it (state.mjs addProgress / stepUp, core.mjs riseTo):
//   - 零层 takes nothing; a layer whose next is shut (the 回's cap, the realm's
//     top) fills and the 修为 keeps coming past its mark — nothing is held;
//   - a step up (grinding the cap allows, the story's rise, the throw) carries
//     the 修为 over the mark in whole, and the new layer asks
//     `overflow_stretch` of it more;
//   - the story's floor: a rise first fills the layer he stands on if he is
//     short of it, so NOTHING is never behind the book.
// The sources, in the book's scene order (each chapter's first_scene, then each
// scene's first `next`):
//   - the story: a scene's best exit grant (after its rise), its boards' grants;
//   - EVERYTHING also: per real day (one per SCENES_PER_SESSION scenes, rounded
//     up) the day's 功课 (`gongke`), FIGHTS pool fights (`haunt`), TALE of a
//     今日传闻, ROAD road-meets; the errands that pay 修为 or a pill (ERRANDS_AT)
//     and the story's own pills, eaten at once; PILLS_BOUGHT market pills a 回;
//     the errand lump lands a third of the way in, the days spread over its scenes;
//   - a sealed instance's rooms (chapter.json beat `sealed`, places' `has`; roomsPay): what a
//     guarded room asks (its pool fights `won.n`, its board) every player pays on the way — the
//     story's; its other boards (one-offs) and one fight at each other pool room (EVERYTHING),
//     landing as the instance is entered;
//   - 杂役 errands, 开府 and the day's pick pay 灵石 only: nothing here.
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';

/* A natural day's play in 卷一 (rewards.json `_economy_2026_10_15`): a sitting
   reads about five scenes; each day the workout, two pool fights, half a
   rumor and one road-meet that pays; one market pill a 回 where one is sold (by the
   province's `sold` — inside the walled 观 the 货郎 at the 演武场 sells the 聚气丹 every
   third day, places xu.json yanwu `has.visitor`, so the count holds for 外门 too). */
export const EVERYTHING = { SCENES_PER_SESSION: 5, GONGKE: 1, FIGHTS: 2, TALE: 0.5, ROAD: 1, ERRANDS: true, PILLS: true, PILLS_BOUGHT: 1, SPEED: 1 };
/* Only the story: its scenes' grants, no task, no pill, no day's play. */
export const NOTHING = { ...EVERYTHING, GONGKE: 0, FIGHTS: 0, TALE: 0, ROAD: 0, ERRANDS: false, PILLS: false, PILLS_BOUGHT: 0, BOARDS: false };
/* The story, its boards and the errands — no repeatables: one-offs alone. */
export const ONE_OFFS = { ...EVERYTHING, GONGKE: 0, FIGHTS: 0, TALE: 0, ROAD: 0, PILLS_BOUGHT: 0 };
export const PLAY = EVERYTHING;

/* The errands that pay 修为 (修行) or a pill, and the 回 they are done in;
   null: not reachable in 卷一 (its giver is on no 卷一 map). 药园巡夜's 狰 is
   古四's (wm-yaoyuan); 药园残株 follows it, in 古五; 后山's 野猪 (观内, open from
   古四 on) is taken in 古五 too; 彭城 and 柳湾 are on 冀's map only, so 蠪侄 and
   人鱼 are 古九's; 云龙山 is on none. Every such errand must be listed
   (tests/xiuwei-pace.test.mjs) — a new one names its 回 here. */
export const ERRANDS_AT = { 'xu-yaoyuan-shouye': 'h05', 'xu-yaoyuan-canzhu': 'h07', 'guan-houshan-yezhu': 'h07', 'xu-fuli-longzhi': 'h10', 'ji-liuwan-renyu': 'h10', 'xu-yunlong-herbs': null };

const tableCap = (content, grant) => Math.min(grant?.progress ?? 0, content.rewards.tables[grant?.table]?.progress ?? 0);
const itemOf = (content, id) => content.items.items.find(i => i.id === id);
/* What a thing pays eaten: a pill's (or a treasure's) capped `progress`; a breakthrough pill is kept for the throw. */
const BREAK_PILLS = content => new Set(Object.values(content.ladder.breakthrough?.pill?.items ?? {}).flat());
const pillOf = (content, id) => { const e = itemOf(content, id)?.effect; return id && e?.progress && !BREAK_PILLS(content).has(id) ? tableCap(content, e) : 0; };
/* What an errand pays toward 修为: its grant's, and the pill it hands over. */
export const errandPays = (content, q) => tableCap(content, q.grant) + pillOf(content, q.grant?.item);

/* A sealed instance's rooms (Hanli, 2026-10-15: 「秘境太短了, 里面多加点战斗和小游戏」): per 回 it
   is entered in, its first scene inside and what its rooms pay — `story` (a guarded room's fights
   and board: on the way, for everyone), `boards` (the rooms' other boards, once each) and `fights`
   (one fight at each other room with a pool). Read from the data, never named. */
export function roomsPay(content) {
  const out = {}, haunt = content.rewards.tables.haunt.progress;
  const placeOf = id => Object.values(content.places).flatMap(d => d.places).find(p => p.id === id);
  const taskOf = id => content.tasks.tasks.find(t => t.id === id);
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) {
    for (const b of (ch.beats ?? []).filter(x => x.sealed)) {
      const first = b.scenes[1], hui = ch.scenes[first]?.hui, r = { first, story: 0, boards: 0, fights: 0 };
      for (const p of b.sealed.places.map(placeOf).filter(Boolean)) {
        const g = p.has?.guard, guardTask = g?.task?.id;
        if (g?.won) r.story += g.won.n * haunt;
        if (guardTask) r.story += tableCap(content, taskOf(guardTask)?.grant);
        for (const id of (p.has?.games ?? []).filter(id => id !== guardTask)) r.boards += tableCap(content, taskOf(id)?.grant);
        if (p.has?.pool && !g?.won) r.fights += haunt;
      }
      if (hui) out[hui] = r;
    }
  }
  return out;
}

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

/* What one day of play pays at the ladder's base (before a tier's `pay`). */
export function dayIncome(content, play = EVERYTHING) {
  const t = content.rewards.tables, tale = content.rewards.tale.cap.progress;
  const rumor = Math.min(tale, 3 * t.tale.progress + t.tale_end.progress);
  return play.GONGKE * t.gongke.progress + play.FIGHTS * t.haunt.progress + play.TALE * rumor + play.ROAD * t.meet.progress;
}

/* Run 卷一 through the ladder for one player. A row per 回: scenes, days, what
   it offered (story · errands and pills · days), the realm at its close (tier,
   step, progress, need), the book's layer there (`book`: the story's reach, else
   the cap), what the story's floor filled, and the scene (0-based) at which the
   layer the 回 holds him on first stood full (null: never — the story lifted him). */
export function runJuan1(content, { ladder = content.ladder, play = EVERYTHING } = {}) {
  const tiers = ladder.tiers, caps = ladder.caps.hui, ratio = ladder.overflow_stretch ?? 0;
  const tierAt = id => tiers.find(t => t.id === id), rank = (tier, step) => tiers.findIndex(t => t.id === tier) * 100 + step;
  const stepOf = (tier, layer) => layer - (tierAt(tier).zero ? 0 : 1);
  const scenes = bookScenes(content);
  const byHui = new Map();
  for (const sc of scenes) byHui.set(sc.hui, [...(byHui.get(sc.hui) ?? []), sc]);
  const quests = new Map(content.quests.map(q => [q.id, q]));
  const market = content.items.items.filter(i => i.effect?.progress && (i.sold ?? []).length && !BREAK_PILLS(content).has(i.id));
  const day = dayIncome(content, play) * play.SPEED;
  const rooms = roomsPay(content);
  const s = { tier: tiers[0].id, step: 0, progress: 0, stretch: 0, pill9: false };
  const need = () => tierAt(s.tier).thresholds[s.step] + s.stretch;
  const zero = () => tierAt(s.tier).zero && s.step === 0;
  const up = (tier, step, carry, stretch = true) => { const c = Math.max(0, carry); s.tier = tier; s.step = step; s.progress = c; s.stretch = stretch ? Math.round(c * ratio) : 0; };
  const rows = [];
  let hui = null, row = null, lump = 0;
  const capAt = () => { const c = caps[hui], st = c.story ?? c; return { grind: Math.max(rank(c.tier, stepOf(c.tier, c.layer)), rank(s.tier, s.step)), story: rank(st.tier, stepOf(st.tier, st.layer)) }; };
  const gain = (n, k) => {
    if (n <= 0) return;
    if (zero()) { row.lost += n; return; }
    s.progress += n * (tierAt(s.tier).pay ?? 1);
    for (;;) {
      if (s.progress < need()) break;
      const top = s.step >= tierAt(s.tier).thresholds.length - 1;
      if (!top && rank(s.tier, s.step + 1) <= capAt().grind) { up(s.tier, s.step + 1, s.progress - need()); continue; }
      if (row.full_at == null) row.full_at = k;
      break;
    }
  };
  scenes.forEach(sc => {
    if (sc.hui !== hui) {
      hui = sc.hui;
      const list = byHui.get(hui), days = Math.ceil(list.length / play.SCENES_PER_SESSION);
      row = { hui, scenes: list.length, days, story: 0, errands: 0, daily: days * day, lost: 0, filled: 0, full_at: null, k: 0 };
      rows.push(row);
      if (play.ERRANDS) for (const [id, at] of Object.entries(ERRANDS_AT)) if (at === hui && quests.has(id)) row.errands += errandPays(content, quests.get(id)) * play.SPEED;
      const sold = market.filter(i => i.sold.includes(content.chapters[sc.chapter]?.province)).map(i => tableCap(content, i.effect));
      if (sold.length) row.errands += play.PILLS_BOUGHT * Math.max(...sold) * play.SPEED;
      lump = row.errands;
    }
    const k = row.k++;
    // A sealed instance entered: its rooms' play lands (roomsPay) — what holds the way for all, the rest as played.
    const room = rooms[sc.hui]?.first === sc.id ? rooms[sc.hui] : null;
    if (room) {
      const extra = (play.BOARDS === false ? 0 : room.boards) + (play.FIGHTS > 0 ? room.fights : 0);
      row.story += room.story; row.rooms = room.story + extra;
      gain((room.story + extra) * play.SPEED, k);
    }
    const boards = play.BOARDS === false ? [] : (sc.show ?? []).filter(c => c.card === 'board').map(c => content.tasks.tasks.find(t => t.id === c.id)).filter(Boolean);
    const b = boards.reduce((n, t) => n + tableCap(content, t.grant), 0);
    row.story += b; gain(b * play.SPEED, k);
    // The exit a player takes: the one that carries the story furthest, then pays most.
    const exits = sc.exits.filter(e => e.next || e.rise || e.breakthrough || e.grant);
    const best = exits.sort((a, c) => (Boolean(c.breakthrough) - Boolean(a.breakthrough)) || (Boolean(c.rise) - Boolean(a.rise)) || (tableCap(content, c.grant) - tableCap(content, a.grant)))[0];
    if (best?.grant?.item && itemOf(content, best.grant.item)?.fill === 'full') s.pill9 = true;
    if (best?.breakthrough) {
      const next = tiers[tiers.findIndex(t => t.id === s.tier) + 1], over = Math.max(0, s.progress - need());
      up(next.id, 0, over);
      if (s.pill9) s.progress = next.thresholds[0] + over;
    }
    if (best?.rise) {
      const layer = typeof best.rise === 'object' ? best.rise.layer : best.rise, full = typeof best.rise === 'object' && best.rise.full;
      const tier = tiers[0], top = Math.min(stepOf(tier.id, layer), tier.thresholds.length - 1);
      if (s.tier === tier.id && rank(tier.id, top) <= capAt().story && (s.step < top || (full && s.step === top && s.progress < need()))) {
        if (!zero()) row.filled += Math.max(0, need() - s.progress);
        if (s.step < top) up(tier.id, top, s.progress - need(), !zero());
        if (full) s.progress = Math.max(s.progress, need());
      }
    }
    const g = tableCap(content, best?.grant) + (play.PILLS ? pillOf(content, best?.grant?.item) : 0);
    row.story += g; gain(g * play.SPEED, k);
    // The errands (and the 回's market pill) are done a third of the way in — once 零层 is behind him.
    if (lump && k >= Math.floor(row.scenes / 3) && !zero()) { gain(lump, k); lump = 0; }
    gain(row.daily / row.scenes, k);
    row.end = { tier: s.tier, step: s.step, progress: Math.round(s.progress), need: need() };
  });
  return rows.map(({ k, ...r }) => {
    const c = caps[r.hui], st = c.story ?? c;
    return { ...r, cap: c, book: { tier: st.tier, step: stepOf(st.tier, st.layer) } };
  });
}

const nameOf = (content, tier, step) => { const t = content.ladder.tiers.find(x => x.id === tier); return `${t.name.zh}${t.steps.zh[step]}`; };

/* The two players' table, for the console and for a failing test's message. */
export function budgetTable(content, ladder = content.ladder) {
  const out = [`练气 ${JSON.stringify(ladder.tiers[0].thresholds)} · stretch ${ladder.overflow_stretch ?? 0} · a day of play ${dayIncome(content)} 修为`,
    '回    场 天 | 全做: 剧情 差事丹 每日  收尾                     满于    | 不做: 收尾                    剧情补 | 书中'];
  const all = runJuan1(content, { ladder, play: EVERYTHING }), none = runJuan1(content, { ladder, play: NOTHING });
  all.forEach((a, i) => {
    const n = none[i], end = r => `${nameOf(content, r.end.tier, r.end.step)} ${r.end.progress}/${r.end.need}`;
    out.push(`${a.hui} ${String(a.scenes).padStart(3)} ${a.days} | ${String(a.story).padStart(9)} ${String(a.errands).padStart(5)} ${String(a.daily).padStart(5)}  ${end(a).padEnd(22)} ${(a.full_at == null ? '—' : `${a.full_at + 1}/${a.scenes}`).padEnd(6)} | ${end(n).padEnd(22)} ${String(n.filled).padStart(5)} | ${nameOf(content, a.book.tier, a.book.step)}`);
  });
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = loadContent();
  // `--try=0,200,400,…`: run the model on other 练气 thresholds, the world's left as they are.
  const tried = process.argv.find(a => a.startsWith('--try='));
  if (tried) content.ladder.tiers[0].thresholds = tried.slice(6).split(',').map(Number);
  console.log(budgetTable(content));
}
