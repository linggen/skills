// duel.js — 斗法, the fight. Pure and shared: the page plays it turn by turn
// and the rules replay it to decide. No model, no dice — the same actions
// against the same creature always end the same way.
//
// His rules (2026-09-17): 所有攻击都消耗灵力。生命值耗尽，或者灵力耗尽，战斗失败。
// Round by round, the stronger side (战力) first; the creature stands at the
// player's own realm and step, and its lean — thick-hided, warded, quick,
// fierce — is what tells the two apart. On the player's turn: 法术, 物理攻击,
// 符箓 or 辅助. Mechanics learned from 凡人修仙传, never its names.
//
// 相克: 木克土 · 土克水 · 水克火 · 火克金 · 金克木 — a 法术 doubles into what
// its element overcomes and halves into what overcomes it.
//
// One truth, two readers: `legal` says what may come next, `offers` draws the
// buttons, `fight` replays the whole thing. The page shows only what may
// come; the rules refuse the rest.

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
export const BEATS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
// 相生: 木生火 · 火生土 · 土生金 · 金生水 · 水生木 — what 借势 borrows.
export const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };

/* The realm table — both sides read it, so a fight is an even match by birth
   and what wins is what the player brings. `def` is a creature's own hide:
   the player's 防 comes from what they wear. Tuned by the gate in
   tools/duel-sim.mjs; design.md § 斗法 holds the why. */
export const REALMS = {
  qi: { hp: 22, qi: 22, spell: 4, atk: 3, def: 3 },
  foundation: { hp: 32, qi: 32, spell: 6, atk: 4, def: 4 },
  core: { hp: 46, qi: 46, spell: 8, atk: 6, def: 6 },
  nascent: { hp: 62, qi: 62, spell: 11, atk: 8, def: 8 },
};
export const TIERS = Object.keys(REALMS);
export const PER_STEP = { hp: 2, qi: 2 };
/* A beast's breath is longer than a cultivator's — it does not run dry while
   the player hides behind 护体. Waiting a creature out is not a way to win
   (the gate in tools/duel-sim.mjs), so the pool it waits with is deeper. */
export const FOE_QI = 2;

/* What a turn spends. A 法术 costs what it is worth — its own 法术 — so one
   economy holds at every realm: a 法术 into nothing is 灵力 for 气血, one
   into what it overcomes is twice that, and a pool is one fight long. 符箓
   is free; it is the thing itself that is spent. */
export const costsOf = spell => ({
  cast: spell,
  strike: Math.max(1, Math.round(spell / 2)),
  talisman: 0,
  assist: Math.max(1, Math.round(spell / 4)),
  generate: Math.max(1, Math.round(spell / 4)),
  thunder: Math.round(spell * 1.5),
  twice: Math.round(spell * 0.75),
});
export const TALISMAN = 3; // 符箓: this much 法术, ignoring 防 and 抗 (12 at 练气)
export const CHARM_QI = 1.5; // 符水: a 符 cast gives back this much 法术 in 灵力
export const ARMOR = 2; // 甲: its 防 for one round
export const FOCUS = 1.5; // 聚势: the next attack
export const BORROW = 2; // 借器施法: a 法术 through the sword's root, weaker
export const THUNDER = 2; // 五雷法: 木 at this much 法术

/* A creature's lean, about a quarter either way. Its numbers, then this. */
export const LEANS = {
  hide: s => ({ ...s, hp: Math.round(s.hp * 1.25), def: s.def + 1, spell: Math.max(1, Math.floor(s.spell * 0.75)) }),
  ward: s => ({ ...s, ward: Math.max(1, Math.round(s.spell / 2)) }),
  quick: s => ({ ...s, atk: Math.max(1, Math.floor(s.atk * 0.75)), swift: true }),
  fierce: s => ({ ...s, atk: Math.ceil(s.atk * 1.25), def: Math.max(0, s.def - 1) }),
};
export const LEAN_IDS = Object.keys(LEANS);

/* What a creature does on its turn, cycled from a start drawn by the day.
   击 · 法术 · 蓄 · 护体 · 甲 — the last three stay on the card as its stance,
   so the player reads it before choosing. */
export const INTENTS = ['strike', 'cast', 'gather', 'guard', 'armor'];
const intentCost = (intent, c) => ({ strike: c.strike, cast: c.cast, gather: c.assist, guard: c.assist, armor: c.assist }[intent]);
const PATTERN = ['strike', 'cast', 'gather', 'strike', 'guard'];

/* An art is one effect in the fight, never a number in the catalog.
   generate      a 法术 may go out as the element its root generates (借势)
   thunder       a 法术 of 木 at double, ignoring 抗                  (五雷法)
   twice         物理攻击 strikes twice for one cost                  (御剑)
   survive       a blow that would end the fight leaves 1 气血, once  (遁法)
   charm-refills a 符 cast also gives back 灵力                       (符水) */
export const ART_EFFECTS = ['generate', 'thunder', 'twice', 'survive', 'charm-refills'];
const ACTION_ARTS = new Set(['thunder', 'twice']); // 借势 rides a cast, so it is not one
/* Once a fight. 借势 is not an art you play but a face a 法术 can wear, and
   it pays its own 灵力 every time — it is what a player born without a
   creature's counter reaches the counter with. */
const ONCE = new Set(['thunder', 'twice']);
const BORROWS = kit => Object.entries(kit.arts ?? {}).find(([, a]) => a.effect === 'generate' && a.ready)?.[0] ?? null;

/* A small stable hash: the same day, creature and 道号 draw the same start. */
export function hashOf(text) {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* ── Both sides' numbers ── */

/* 战力 — the one number on the card: the realm and step, the weapon's 攻, the
   法衣's 防 and the 法术. The higher moves first, all fight long. */
const powerOf = s => Math.round((s.rank * 9 + s.step + s.atk + s.def + s.spell) * (s.swift ? 1.25 : 1));

export function realmStats(tier, step = 0) {
  const rank = Math.max(0, TIERS.indexOf(tier));
  const r = REALMS[TIERS[rank]];
  const n = Math.max(0, Number(step) || 0);
  return { rank, step: n, hp: r.hp + n * PER_STEP.hp, qi: r.qi + n * PER_STEP.qi, spell: r.spell, atk: r.atk, def: r.def, ward: 0 };
}

/* What the player stands with: the realm, the weapon's 攻, the 法衣's 防 and
   the 佩's 抗. No gear is no 防 — a bare cultivator takes every blow whole. */
export function youOf(kit = {}) {
  const base = realmStats(kit.tier, kit.step);
  const s = { ...base, atk: base.atk + (kit.weapon?.atk ?? 0), def: kit.robe?.def ?? 0, ward: kit.pendant?.ward ?? {} };
  return { ...s, power: powerOf(s) };
}

/* The creature at the player's own level, leaning its own way. A made world
   writes neither lean nor pattern: its id draws them, and they hold. */
export function foeOf(creature, tier, step, seed = '') {
  const lean = LEANS[creature.lean] ? creature.lean : LEAN_IDS[hashOf(`${creature.id}|lean`) % LEAN_IDS.length];
  const written = (creature.pattern ?? []).filter(i => INTENTS.includes(i));
  const pattern = written.length ? written : PATTERN;
  const s = LEANS[lean](realmStats(tier, step));
  return {
    id: creature.id, root: creature.root, lean, pattern, start: hashOf(seed) % pattern.length,
    hp: s.hp, qi: Math.round(s.qi * FOE_QI), spell: s.spell, atk: s.atk, def: s.def, ward: s.ward, power: powerOf(s),
  };
}

/* ── Tokens ── */

const parse = token => {
  const [head, arg = null] = String(token).split(':');
  return { head, arg };
};
export const isArt = token => parse(token).head === 'art';
export const artId = token => parse(token).arg;
const hasArt = (kit, effect) => Object.values(kit.arts ?? {}).some(a => a.effect === effect && a.ready);
const clash = (element, root) => (BEATS[element] === root ? 2 : BEATS[root] === element ? 0.5 : 1);
const wardOf = (s, element) => (typeof s.ward === 'number' ? s.ward : s.ward?.[element] ?? 0);
/* A root of the player's own, or the one the worn weapon lends (借器施法). */
const castable = (element, kit) => (kit.roots ?? ELEMENTS).includes(element) || element === kit.sword;

/* What a token spends, at the player's own realm. */
function costOf(token, kit, c) {
  const { head, arg } = parse(token);
  if (head === 'art') return ACTION_ARTS.has(kit.arts?.[arg]?.effect) ? c[kit.arts[arg].effect] : null;
  if (head === 'borrow') return c.cast + c.generate;
  return c[head] ?? null;
}

/* Why a token may not come next, or null when it may. */
export function legal(token, st, kit = {}) {
  if (st.outcome !== 'open') return 'fight-over';
  const { head, arg } = parse(token);
  const c = costsOf(st.you.stats.spell);
  if (head === 'art') return artWhy(arg, st, kit, c);
  const cost = costOf(token, kit, c);
  if (cost == null) return 'bad-token';
  const why = {
    cast: () => (!ELEMENTS.includes(arg) ? 'bad-token' : castable(arg, kit) ? null : 'not-your-root'),
    // 借势 — the same 法术, sent out as the element its root generates.
    borrow: () => (!ELEMENTS.includes(arg) ? 'bad-token' : !BORROWS(kit) ? 'art-unknown' : castable(arg, kit) ? null : 'not-your-root'),
    strike: () => null,
    talisman: () => (!(kit.charm?.held > 0) ? 'no-charm' : st.you.charmed ? 'charm-used' : null),
    // 聚势 and 护体 are held, not stacked: already gathered, you must act.
    assist: () => (!['focus', 'guard'].includes(arg) ? 'bad-token' : st.you[arg] ? `already-${arg}` : null),
  }[head]();
  if (why) return why;
  return cost > st.you.qi ? 'no-qi' : null;
}

function artWhy(id, st, kit, c) {
  const art = kit.arts?.[id];
  if (!art) return 'art-unknown';
  if (!art.ready) return 'art-needs-tier';
  if (!ACTION_ARTS.has(art.effect)) return 'art-passive';
  if (ONCE.has(art.effect) && st.you.arts.includes(id)) return 'art-used';
  if (art.effect === 'twice' && !kit.weapon) return 'art-no-sword';
  return c[art.effect] > st.you.qi ? 'no-qi' : null;
}

/* ── The blows ── */

const half = n => Math.max(1, Math.round(n / 2));

/* The player's blow: 聚势 lifts it, then the creature's 护体, its 甲 (a
   strike) or its 抗 (a 法术) take their bite. 符箓 and 五雷法 pierce. */
function strikeFoe(st, foe, raw, { element = null, pierce = false } = {}) {
  let d = raw;
  if (st.you.focus) { d = Math.max(1, Math.round(d * FOCUS)); st.you.focus = false; }
  if (st.foe.guard) { d = half(d); st.foe.guard = false; }
  if (!pierce) d -= element ? wardOf(foe, element) : foe.def + st.foe.armor;
  d = Math.max(1, d);
  st.foe.hp = Math.max(0, st.foe.hp - d);
  return d;
}

/* The creature's blow: 蓄势 doubles it, 护体 halves it, the 日主's own element
   is halved once a fight, then 防 (a strike) or 抗 (a 法术) takes its bite.
   遁法 leaves the last breath. */
function strikeYou(st, kit, raw, { element = null } = {}) {
  let d = raw;
  if (st.foe.gather) { d *= 2; st.foe.gather = false; }
  if (st.you.guard) { d = half(d); st.you.guard = false; }
  if (element && kit.fate?.root === element && !st.you.fated) { d = half(d); st.you.fated = true; }
  d = Math.max(1, d - (element ? wardOf(st.you.stats, element) : st.you.stats.def));
  st.you.hp = Math.max(0, st.you.hp - d);
  if (st.you.hp <= 0 && !st.you.saved && hasArt(kit, 'survive')) { st.you.hp = 1; st.you.saved = true; }
  return d;
}

/* ── The player's turn ── */

/* 法术 — a root of their own, or the sword's at 借器施法. The day's cast
   lifts or lowers its element; 借势 sends it out as the one it generates. */
function castTurn(st, el, foe, kit, borrow = null) {
  const c = costsOf(st.you.stats.spell);
  st.you.qi -= borrow ? c.cast + c.generate : c.cast;
  const as = borrow ? GENERATES[el] : el;
  const art = borrow;
  if (borrow && !st.you.arts.includes(borrow)) st.you.arts.push(borrow);
  let spell = st.you.stats.spell;
  if (kit.fortune?.root === el) spell += kit.fortune.spell ?? 0;
  if (!(kit.roots ?? ELEMENTS).includes(el)) spell -= BORROW;
  const raw = Math.max(1, Math.round(Math.max(1, spell) * clash(as, foe.root)));
  const damage = strikeFoe(st, foe, raw, { element: as });
  st.log.push({ side: 'you', act: 'cast', element: el, ...(as !== el ? { as, art } : {}), damage, hp: st.foe.hp, qi: st.you.qi });
}

/* 物理攻击 — the worn weapon, or bare hands. 御剑 strikes twice for one cost. */
function strikeTurn(st, foe, kit, { twice = false, art = null } = {}) {
  const c = costsOf(st.you.stats.spell);
  st.you.qi -= twice ? c.twice : c.strike;
  const hits = [strikeFoe(st, foe, st.you.stats.atk)];
  if (twice) hits.push(strikeFoe(st, foe, st.you.stats.atk));
  st.log.push({ side: 'you', act: 'strike', ...(twice ? { hits: 2, art } : {}), damage: hits.reduce((a, b) => a + b, 0), hp: st.foe.hp, qi: st.you.qi });
}

/* 符箓 — the one shot anyone can carry: it ignores 防 and 抗, and is spent. */
function charmTurn(st, foe, kit) {
  st.you.charmed = true;
  const damage = strikeFoe(st, foe, Math.round(st.you.stats.spell * TALISMAN), { pierce: true });
  const back = hasArt(kit, 'charm-refills') ? Math.min(Math.round(st.you.stats.spell * CHARM_QI), st.you.stats.qi - st.you.qi) : 0;
  st.you.qi += back;
  st.log.push({ side: 'you', act: 'talisman', damage, ...(back ? { gave: back } : {}), hp: st.foe.hp, qi: st.you.qi });
}

/* 辅助 — 聚势 lifts the next attack, 护体 halves the next blow taken. */
function assistTurn(st, how) {
  st.you.qi -= costsOf(st.you.stats.spell).assist;
  st.you[how] = true;
  st.log.push({ side: 'you', act: 'assist', how, qi: st.you.qi });
}

function artTurn(st, id, foe, kit) {
  if (!st.you.arts.includes(id)) st.you.arts.push(id);
  if (kit.arts[id].effect === 'twice') return strikeTurn(st, foe, kit, { twice: true, art: id });
  st.you.qi -= costsOf(st.you.stats.spell).thunder;
  const raw = Math.max(1, Math.round(st.you.stats.spell * THUNDER * clash('wood', foe.root)));
  const damage = strikeFoe(st, foe, raw, { element: 'wood', pierce: true });
  return st.log.push({ side: 'you', act: 'art', id, element: 'wood', damage, hp: st.foe.hp, qi: st.you.qi });
}

function yourTurn(st, token, foe, kit) {
  const { head, arg } = parse(token);
  const turn = {
    cast: () => castTurn(st, arg, foe, kit),
    borrow: () => castTurn(st, arg, foe, kit, BORROWS(kit)),
    strike: () => strikeTurn(st, foe, kit),
    talisman: () => charmTurn(st, foe, kit),
    assist: () => assistTurn(st, arg),
    art: () => artTurn(st, arg, foe, kit),
  }[head];
  turn();
  // The finishing blow wins even when it empties the pool.
  if (st.foe.hp <= 0) st.outcome = 'won';
  else if (st.you.qi <= 0) st.outcome = 'lost';
}

/* ── The creature's turn ── */

const DO = {
  strike: (st, foe, kit) => {
    st.foe.qi -= costsOf(foe.spell).strike;
    st.log.push({ side: 'foe', act: 'strike', damage: strikeYou(st, kit, foe.atk), hp: st.you.hp, qi: st.foe.qi });
  },
  cast: (st, foe, kit) => {
    st.foe.qi -= costsOf(foe.spell).cast;
    st.log.push({ side: 'foe', act: 'cast', element: foe.root, damage: strikeYou(st, kit, foe.spell, { element: foe.root }), hp: st.you.hp, qi: st.foe.qi });
  },
  gather: (st, foe) => { st.foe.qi -= costsOf(foe.spell).assist; st.foe.gather = true; st.log.push({ side: 'foe', act: 'gather', qi: st.foe.qi }); },
  guard: (st, foe) => { st.foe.qi -= costsOf(foe.spell).assist; st.foe.guard = true; st.log.push({ side: 'foe', act: 'guard', qi: st.foe.qi }); },
  armor: (st, foe) => { st.foe.qi -= costsOf(foe.spell).assist; st.foe.armor = ARMOR; st.log.push({ side: 'foe', act: 'armor', qi: st.foe.qi }); },
};

/* Its 甲 held through the player's turn; what it cannot pay for becomes a
   guard, and a creature out of 灵力 is beaten like anyone else. */
function foeTurn(st, foe, kit) {
  if (st.outcome !== 'open') return;
  st.foe.armor = 0;
  const want = foe.pattern[(foe.start + st.foe.turn) % foe.pattern.length];
  DO[intentCost(want, costsOf(foe.spell)) <= st.foe.qi ? want : 'guard'](st, foe, kit);
  st.foe.turn += 1;
  if (st.you.hp <= 0) st.outcome = 'lost';
  else if (st.foe.qi <= 0) st.outcome = 'won';
}

/* ── The fight ── */

function start(foe, kit) {
  const stats = youOf(kit);
  return {
    you: { hp: stats.hp, qi: stats.qi, stats, guard: false, focus: false, charmed: false, arts: [], fated: false, saved: false },
    foe: { hp: foe.hp, qi: foe.qi, guard: false, gather: false, armor: 0, turn: 0 },
    log: [], outcome: 'open',
  };
}

function replay(actions, foe, kit) {
  const st = start(foe, kit);
  st.first = foe.power > st.you.stats.power ? 'foe' : 'you'; // a tie goes to the player
  if (st.first === 'foe') foeTurn(st, foe, kit);
  for (const token of actions ?? []) {
    if (st.outcome !== 'open') break; // an action after the end is not played, not refused
    const why = legal(token, st, kit);
    if (why) { st.refused = { token, why }; break; }
    yourTurn(st, token, foe, kit);
    foeTurn(st, foe, kit);
  }
  return st;
}

/* The fight so far: both sides as they stand, the turns as they fell, and
   the outcome — `open` while both still breathe. A token that may not come
   is `refused` with its why and the fight stops there. */
export function fight(actions, foe, kit = {}) {
  const st = replay(actions, foe, kit);
  const stats = st.you.stats;
  return {
    outcome: st.outcome, log: st.log, first: st.first, refused: st.refused ?? null,
    you: { hp: st.you.hp, qi: st.you.qi, hp_max: stats.hp, qi_max: stats.qi, power: stats.power, guard: st.you.guard, focus: st.you.focus, saved: st.you.saved },
    foe: { hp: st.foe.hp, qi: st.foe.qi, hp_max: foe.hp, qi_max: foe.qi, power: foe.power, guard: st.foe.guard, gather: st.foe.gather, armor: st.foe.armor },
    used: { charm: st.you.charmed, arts: st.you.arts },
  };
}

/* What may come next, for the card: every token the kit could offer, each ok
   or with its why and what it spends. */
export function offers(actions, foe, kit = {}) {
  const st = replay(actions, foe, kit);
  const mine = [...(kit.roots ?? ELEMENTS)];
  if (kit.sword && !mine.includes(kit.sword)) mine.push(kit.sword);
  const out = mine.map(el => ({ token: `cast:${el}`, kind: el === kit.sword && !(kit.roots ?? ELEMENTS).includes(el) ? 'sword' : 'root', element: el }));
  const borrows = BORROWS(kit);
  if (borrows) out.push(...mine.map(el => ({ token: `borrow:${el}`, kind: 'borrow', element: el, as: GENERATES[el], art: borrows })));
  out.push({ token: 'strike', kind: 'strike' });
  if (kit.charm) out.push({ token: 'talisman', kind: 'charm' });
  out.push({ token: 'assist:focus', kind: 'assist', how: 'focus' }, { token: 'assist:guard', kind: 'assist', how: 'guard' });
  for (const [id, art] of Object.entries(kit.arts ?? {})) {
    if (ACTION_ARTS.has(art.effect)) out.push({ token: `art:${id}`, kind: 'art', id, effect: art.effect });
  }
  const c = costsOf(st.you.stats.spell);
  return out.map(o => {
    const why = legal(o.token, st, kit);
    return { ...o, why, ok: why === null, cost: costOf(o.token, kit, c) ?? 0 };
  });
}
