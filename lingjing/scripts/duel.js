// duel.js — 降妖, the 五行 bout. Pure and shared: the page plays it round by
// round and the rules replay it to decide. No model, no fighting numbers.
//
// 相克: 木克土 · 土克水 · 水克火 · 火克金 · 金克木. The player picks one of
// their roots each round; the creature's move is drawn for the day, leaning
// to its own root. Best of three won rounds, at most five; a draw counts for
// no one.
//
// 功法 (2026-09-16): the sequence may also carry a worn sword's root, a 符
// (the round is won outright, once) and `art:<id>` tokens — the learned
// arts, each one bout effect, each once. `legal` says what may come next;
// the page draws only that, the rules refuse the rest. One truth, two
// readers.

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
export const BEATS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
// 相生: 木生火 · 火生土 · 土生金 · 金生水 · 水生木 — what 借势 borrows.
export const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
export const ROUNDS = 5;
export const TO_WIN = 2;

/* What an art does in a bout; the catalog names one of these, never a number.
   draw-wins   the last round, a draw, is won            (五雷法)
   undo-loss   the last round, lost, is taken back to a draw (遁法)
   generate    the next pick counts as the root it generates (借势)
   sword-twice the worn sword's root may be picked two rounds running (御剑)
   charm-refills a 符 spent also refills stamina           (符水) — the rules pay it */
export const ART_EFFECTS = ['draw-wins', 'undo-loss', 'generate', 'sword-twice', 'charm-refills'];
const AFTER_ROUND = new Set(['draw-wins', 'undo-loss']);

/* A small stable hash: the same day, creature and name draw the same bout. */
export function hashOf(text) {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* The creature's five moves for the day: its own root six times in ten,
   else any element. Given the player's roots, at least two of the five are
   moves those roots overcome — a bout is always winnable by reading the
   creature, never lost by birth (a 木水火土 player before a 木 creature
   could only draw or lose, 2026-09-16). Which rounds open is drawn too. */
export function creatureMoves(root, seed, roots = []) {
  const moves = Array.from({ length: ROUNDS }, (_, r) => {
    const h = hashOf(`${seed}|${r}`);
    return h % 10 < 6 ? root : ELEMENTS[Math.floor(h / 10) % ELEMENTS.length];
  });
  const beatable = roots.map((e) => BEATS[e]).filter(Boolean);
  if (!beatable.length) return moves;
  let open = moves.filter((m) => beatable.includes(m)).length;
  const from = hashOf(`${seed}|open`) % ROUNDS;
  for (let k = 0; k < ROUNDS && open < TO_WIN; k += 1) {
    const r = (from + k) % ROUNDS;
    if (beatable.includes(moves[r])) continue;
    moves[r] = beatable[hashOf(`${seed}|open|${r}`) % beatable.length];
    open += 1;
  }
  return moves;
}

/* One round: the player's pick against the creature's move. */
export function roundOf(pick, move) {
  if (BEATS[pick] === move) return 'won';
  if (BEATS[move] === pick) return 'lost';
  return 'draw';
}

export const isArt = (token) => String(token).startsWith('art:');
export const artId = (token) => String(token).slice(4);

const tally = (rounds) => ({
  won: rounds.filter((r) => r.result === 'won').length,
  lost: rounds.filter((r) => r.result === 'lost').length,
});

/* `open` while neither side has two and rounds remain. */
function outcomeOf(rounds) {
  const { won, lost } = tally(rounds);
  if (won >= TO_WIN) return 'won';
  if (lost >= TO_WIN) return 'lost';
  if (rounds.length >= ROUNDS) return won > lost ? 'won' : 'lost';
  return 'open';
}

const fresh = () => ({ rounds: [], charmUsed: false, artsUsed: [], pending: null, lastSword: false });

/* The kit is what the player brings to the bout:
   roots       their own elements (absent = every element is theirs)
   sword       the worn weapon's root, or null
   charm       {id, held} — the 符 in the catalog and how many are held
   arts        {id: {effect, ready}} — the arts they know; `ready` when the tier allows
   Why a token may not come next, or null when it may. */
export function legal(token, st, kit = {}) {
  const decided = outcomeOf(st.rounds) !== 'open';
  const last = st.rounds[st.rounds.length - 1];
  if (isArt(token)) {
    const art = kit.arts?.[artId(token)];
    if (!art) return 'art-unknown';
    if (!art.ready) return 'art-needs-tier';
    if (st.artsUsed.includes(artId(token))) return 'art-used';
    if (art.effect === 'draw-wins') return last?.result === 'draw' && !last.art ? null : 'art-no-draw';
    if (art.effect === 'undo-loss') return last?.result === 'lost' && !last.art ? null : 'art-no-loss';
    if (art.effect === 'generate') return decided ? 'bout-over' : st.pending ? 'art-pending' : null;
    return 'art-passive';
  }
  if (decided) return 'bout-over';
  if (kit.charm && token === kit.charm.id) return !kit.charm.held ? 'no-charm' : st.charmUsed ? 'charm-used' : null;
  if (!ELEMENTS.includes(token)) return 'bad-token';
  if (!kit.roots || kit.roots.includes(token)) return null;
  if (token !== kit.sword) return 'not-your-root';
  if (st.lastSword && !swordTwice(kit)) return 'sword-twice';
  return null;
}

const swordTwice = (kit) => Object.values(kit.arts ?? {}).some((a) => a.effect === 'sword-twice' && a.ready);

function apply(token, st, kit, move) {
  if (isArt(token)) {
    const id = artId(token), effect = kit.arts[id].effect, last = st.rounds[st.rounds.length - 1];
    st.artsUsed.push(id);
    if (effect === 'draw-wins') { last.result = 'won'; last.art = id; }
    else if (effect === 'undo-loss') { last.result = 'draw'; last.art = id; }
    else if (effect === 'generate') st.pending = id;
    return;
  }
  if (kit.charm && token === kit.charm.id) {
    st.charmUsed = true;
    st.lastSword = false;
    st.rounds.push({ pick: token, move, result: 'won', charm: true });
    return;
  }
  const round = { pick: token, move, result: null };
  if (st.pending) { round.as = GENERATES[token]; round.art = st.pending; st.pending = null; }
  round.result = roundOf(round.as ?? token, move);
  st.lastSword = Boolean(kit.roots) && !kit.roots.includes(token) && token === kit.sword;
  st.rounds.push(round);
}

/* The bout so far: each round as it fell, the tally, and the outcome —
   `open` while neither side has two and rounds remain. A token that may
   not come is `refused` with its why and the bout stops there. `rescue`
   is true when the bout is decided but an art could still turn the last
   round — the page waits for the player's word before settling. */
export function bout(picks, moves, kit = {}) {
  const st = fresh();
  let refused = null;
  for (const token of picks) {
    const why = legal(token, st, kit);
    if (why === 'bout-over') break; // a pick after the decision is not played, not refused
    if (why) { refused = { token, why }; break; }
    apply(token, st, kit, moves[st.rounds.length]);
  }
  const outcome = outcomeOf(st.rounds);
  const rescue = outcome !== 'open' && !refused && Object.keys(kit.arts ?? {}).some((id) => legal(`art:${id}`, st, kit) === null);
  return { rounds: st.rounds, ...tally(st.rounds), outcome, refused, rescue, used: { charm: st.charmUsed, arts: st.artsUsed }, pending: st.pending };
}

/* What may come next, for the card: every token the kit could offer, each
   ok or with its why. */
export function offers(picks, moves, kit = {}) {
  const st = fresh();
  for (const token of picks) {
    if (legal(token, st, kit)) break;
    apply(token, st, kit, moves[st.rounds.length]);
  }
  const out = [];
  for (const id of kit.roots ?? []) out.push({ token: id, kind: 'root', why: legal(id, st, kit) });
  if (kit.sword && !(kit.roots ?? []).includes(kit.sword)) out.push({ token: kit.sword, kind: 'sword', why: legal(kit.sword, st, kit) });
  if (kit.charm) out.push({ token: kit.charm.id, kind: 'charm', why: legal(kit.charm.id, st, kit) });
  for (const id of Object.keys(kit.arts ?? {})) {
    if (AFTER_ROUND.has(kit.arts[id].effect) || kit.arts[id].effect === 'generate') out.push({ token: `art:${id}`, kind: 'art', why: legal(`art:${id}`, st, kit) });
  }
  return out.map((o) => ({ ...o, ok: o.why === null }));
}
