// kapai.js — 斗法, the card fight (battle.js; design.md § 斗法 v3), as a small game: the one mount contract
// (games/mount.js) and the one shell (games/shell.js) every game wears (Hanli 10-21: 「看是否游戏系统可以统一外壳,
// 现在我们把卡牌战斗也放进来了」). The fight is the story's own — the same rules (battle.js begin · act · foeStep),
// the same room (battle-card.js battleHtml), the same strokes (battle-anim.js playLog) and the same drag
// (battle-drag.js) — mounted into a container instead of the story's focus column. It plays a fight given
// whole and settles with how it went; what a result means (the pay, the 所得, the way on) is never its own.
//
//   data: { setup, brief, next? }  a fight as the story's door gives it (rules/look.mjs duelBrief: the setup, the
//                                  foe's brief per language), or
//         { foe: key }             a fight of the 游戏厅's table (worlds/jiuding/levels/kapai.json, made by
//                                  tools/arcade-fights.mjs from the road the story deals): its setup and brief,
//                                  and the next foe in the book's order (下一关).
//
// Settles { won, outcome, stars?, next? } — outcome as the rules name it (won · lost · withdrew); a 试 passed is won.
// Nothing here writes: no verb, no save; the 游戏厅's wins pay nothing.
//
// The story mounts the same room (lingjing.js, once per fight, in a shell frame; Hanli 10-22: 「故事里的对战迁移可以开」)
// and hears it through `story` hooks — the room still plays and draws, the story keeps what a fight means:
//   data.st, data.catalog   the state as the story stands it (already replayed from the door's moves: never replayed here) and its cards
//   ctx(room)               what the story adds to the room's drawing (his name, 银月's card, the 丹囊, 问银月)
//   onMove(token)           every move the rules will replay (battle.js tokenOf; 'end' for a turn ended)
//   onStep()                after each step drawn (the beast's 杀招 let go, for her)
//   onPlayed({ before, mark, mine })   a move of his, or the beast's whole turn, played out (her cues)
//   onAsk()                 问银月 tapped (words only: nothing in the fight moves)
//   settle(st) → Promise<r> the rules' answer; the closing card waits for it, and a refusal (r.ok false) has none
//   holdMs(end)             how long the closing card stands (`end`: the foe's last word is in it)
// A story mount settles { …, r } — what the rules answered; the story's own pay and 所得 follow it.
import { act, begin, foeStep, foeTurn, idle, idleWhy, playerOffers as offers, replayInto, tokenOf, view } from '../battle.js';
import { WORDS as BATTLE_WORDS, battleHtml, boutSays, boutWords, cardFaceHtml, dropOf, endOf, pickOf } from '../battle-card.js';
import { banner, ghostsOf, hurry, playLog, since } from '../battle-anim.js';
import { wireDrag } from '../battle-drag.js';
import { wireWheel } from '../battle-wheel.js';
import { WORDS, duelTitle } from '../cards.js';

export const meta = {
  name: { zh: '斗法', en: 'Card duel' },
  how: { zh: '出牌、催随从、主灵根一击；打退对手，或撑过它的十二张。', en: 'Play cards, send your rank, strike with your root; drive it off, or outlast its twelve.' },
  // Turn-based, but the shell may pause it: the hand is put away and the beast's turn waits (shell.css).
  pause: true,
  // The 游戏厅 opens a foe picker before it (arcade.js): one fight a foe.
  pick: true,
  id: 'kapai',
  // Its sounds are the fight's log, entry by entry as it is drawn (battle.js acts; the card kit's row in sounds.json).
  sounds: ['drew', 'played', 'summoned', 'power', 'pill', 'hurt', 'hurt-minion', 'hurt-ally', 'heal', 'charge', 'unleash', 'dodged', 'withdrew', 'mana'],
};

const WORLD = new URL('../../worlds/jiuding/', import.meta.url).href;
const IDLE_MS = 1400; // a turn with nothing left in it ends itself (the story's beat, lingjing.js render)
const SEAL_MS = 3000; // the closing card stands this long, or until 收起
const loaded = new Map();
const json = (file) => {
  if (!loaded.has(file)) loaded.set(file, fetch(`${WORLD}${file}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${file} ${r.status}`)))));
  return loaded.get(file);
};
/** The 游戏厅's fights, in the book's order (levels/kapai.json). */
export const fightTable = () => json('levels/kapai.json');
const catalogOf = async () => Object.fromEntries(((await json('cards.json')).cards ?? []).map((c) => [c.id, c]));

/** A fight of the table by key, with the next one after it (下一关). */
export function fightOf(table, key) {
  const i = (table?.fights ?? []).findIndex((f) => f.key === key);
  if (i < 0) return null;
  return { ...table.fights[i], next: table.fights[i + 1]?.key ?? null };
}

/* The picker's words: the story's fights by 回, then the beasts that roam (the 游荡 pools) by 回. */
const PICK = { zh: { story: '剧情', roam: '游荡', party: '同行' }, en: { story: 'The story', roam: 'Roaming', party: 'With' } };
/** The 游戏厅's picker (arcade.js): every fight of the table as a tile — key, name, portrait, one line, where it is
    met and who stands with him — in sections (the story's · the roaming beasts'), each by 回. */
export async function pickRows(lang = 'zh') {
  const t = await fightTable(), w = PICK[lang] ?? PICK.zh, at = (v) => (v && typeof v === 'object' ? v[lang] ?? v.zh : v) ?? '';
  const hui = Object.fromEntries(t.huis.map((h) => [h.id, at(h.label)]));
  return t.fights.map((f) => ({
    key: f.key, name: at(f.name), hint: at(f.hint), art: f.art ? `${WORLD}${f.art}` : null,
    section: f.story ? w.story : w.roam, group: hui[f.hui] ?? '', where: f.story ? '' : at(f.brief?.[lang]?.stake ?? f.brief?.zh?.stake),
    party: (f.setup.you?.party ?? []).length ? `${w.party} ${(f.setup.you.party).map((m) => at(m.name)).join(' · ')}` : '',
  }));
}
/** A fight's name by key (the shell's title in the 游戏厅). */
export async function pickName(key, lang = 'zh') {
  const f = fightOf(await fightTable(), key);
  return f ? (f.name?.[lang] ?? f.name?.zh ?? key) : null;
}

/** How it went, as the shell shows it: ★ by the 气血 he kept on a win (a 试 passed is a win). */
export function resultOf(st) {
  const end = endOf(st), won = end === 'won' || end === 'passed';
  if (!won) return { won: false, outcome: st.outcome };
  const left = st.you.hpMax ? st.you.hp / st.you.hpMax : 0;
  return { won: true, outcome: st.outcome, stars: left >= 2 / 3 ? 3 : left >= 1 / 3 ? 2 : 1 };
}

/** What the room draws itself from (the story's boutCtx, without the story: no chat, no 银月 to ask). */
function ctxOf(room) {
  const { brief, lang, catalog, table } = room, c = brief.creature, setup = room.setup;
  const pills = table?.pills ?? {};
  const name = (v) => (v && typeof v === 'object' ? v[lang] ?? v.zh : v);
  return {
    catalog, artBase: WORLD, lang, words: boutWords(BATTLE_WORDS[lang] ?? BATTLE_WORDS.zh, c, lang), board: room.st.mode.board,
    title: duelTitle(c, WORDS[lang] ?? WORDS.zh, lang), foeName: c.name, foeArt: c.art ? `${WORLD}${c.art}` : null,
    youName: (WORDS[lang] ?? WORDS.zh).you, herName: null, herCard: null,
    party: setup.you?.party ?? [], fresh: setup.you?.fresh ?? [],
    pillNames: Object.fromEntries(Object.entries(pills).map(([id, p]) => [id, name(p.name)])),
    pillArt: Object.fromEntries(Object.entries(pills).filter(([, p]) => p.art).map(([id, p]) => [id, p.art])),
    ended: Boolean(room.ended), omenOpen: Boolean(room.omenOpen), stake: brief.stake ?? null, way: room.result?.way?.[0] ?? null,
    says: { ...(boutSays(brief.says, room.st.outcome) ?? {}), foe: null, her: null }, herAsk: null,
  };
}

/** The room drawn again whole keeps the pictures it already shows: each new <img> gives its place to a drawn one of the
    same src (its attributes taken over), so no card's art is fetched or decoded again. Every move and every step of the
    beast's turn redraws the room; on the phone each redraw blanked the hand and the ranks for a frame — white cards
    with no art (Hanli 11-07, the beast's turn and a drag). A picture new to the room loads at once, never lazily. */
export function keepPictures(host, html) {
  if (typeof host.querySelectorAll !== 'function') { host.innerHTML = html; return; }
  const had = new Map();
  for (const img of host.querySelectorAll('img[src]')) {
    if (!img.complete || !img.naturalWidth) continue;
    const src = img.getAttribute('src');
    if (!had.has(src)) had.set(src, []);
    had.get(src).push(img);
  }
  host.innerHTML = html;
  for (const img of host.querySelectorAll('img[src]')) {
    const old = had.get(img.getAttribute('src'))?.shift();
    if (!old) { img.loading = 'eager'; img.decoding = 'sync'; continue; }
    for (const a of [...old.attributes]) if (!img.hasAttribute(a.name)) old.removeAttribute(a.name);
    for (const a of [...img.attributes]) if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
    img.replaceWith(old);
  }
}

/** The fight the mount was handed: given whole, or a key of the table. */
async function fightFrom(data, lang) {
  // The table is read for a fight handed whole too: its `pills` name the 丹囊's pills (the phone showed `mend-pill`).
  const [catalog, table] = await Promise.all([data.catalog ?? catalogOf(), data.setup ? fightTable().catch(() => null) : fightTable()]);
  const row = data.setup ? data : fightOf(table, data.foe);
  if (!row) throw new Error(`no fight ${data.foe}`);
  const brief = row.brief?.[lang] ?? row.brief?.zh ?? row.brief;
  return { catalog, table, setup: row.setup, brief, next: row.next ?? data.next ?? null };
}

export async function mount(container, { data = {}, lang = 'zh', seed = String(Date.now()), signal, shell, story = {} } = {}) {
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.className = 'g-kapai';
  container.replaceChildren(host);
  const fight = await fightFrom(data, lang);
  // A fight the story's door dealt keeps its seed: the rules replay the picks on it (the 游戏厅's rows carry none).
  const setup = { ...fight.setup, seed: fight.setup.seed ?? `kapai|${seed}` };
  // Reopened mid-fight (the door's `picks`): the moves already made are replayed, so it stands where it stood.
  const prior = Array.isArray(data.picks) ? data.picks : Array.isArray(data.brief?.picks) ? data.brief.picks : [];
  // Who replays is decided by what the host hands: a state (the Mac page, lingjing.js startDuel — already replayed from the
  // door's moves) stands as handed, and the brief's same moves are never laid on it again (playbot 11-07: a kept fight came
  // back a whole round ahead, 灵力 3 → 4, whenever no card of his had been played — an `end` replays, the next move is
  // refused); no state (the phone, games/phone/host.js) — the room deals it here and replays the moves, so a kept fight
  // never stands at turn 1 again (592712a1: the old `turn === 0` test never held there).
  const st0 = data.st ?? replayInto(begin(setup, fight.catalog), prior);
  // A fight reopened (the door's `resumed`, or the moves it hands back) is no first meeting.
  const resumed = Boolean(data.resumed) || prior.length > 0;
  const room = { ...fight, setup, lang, st: st0, picked: null, openLog: false, help: false, note: null, busy: false, mine: false, queue: [], ended: false, settling: false, yielded: false };
  const hook = (name, ...a) => { try { return story[name]?.(...a); } catch (e) { console.warn('[kapai]', name, e); return undefined; } };
  const ctx = () => { const base = ctxOf(room), more = hook('ctx', room) ?? {}; return { ...base, ...more, says: { ...base.says, ...(more.says ?? {}) } }; };
  const paused = () => Boolean(shell?.paused?.());
  const battle = () => host.querySelector('.battle');
  const name = (v) => (v && typeof v === 'object' ? v[lang] ?? v.zh : v);

  return new Promise((resolve) => {
    let done = false, idleTimer = null, release = null;
    const wheel = wireWheel(host);
    const draw = () => { if (done) return; keepPictures(host, battleHtml(view(room.st), offers(room.st), ctx(), room.picked, room.openLog, room.note, room.help)); wheel.apply(); idleSoon(); };
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(idleTimer);
      offDrag();
      wheel.off();
      offPause?.();
      host.removeEventListener('click', onClick);
      resolve(r);
    };
    // 认输 closes the room at any moment: a move or a beast's turn still being drawn stops where it is.
    const gone = () => done || room.yielded;
    // The beast's turn waits while the shell is paused; so does a turn that would end itself.
    const unpaused = () => new Promise((go) => { const t = () => (gone() || !paused() ? go() : setTimeout(t, 120)); t(); });
    function idleSoon() {
      clearTimeout(idleTimer);
      const st = room.st;
      if (done || room.busy || room.picked || room.help || paused() || st.outcome !== 'open' || st.whose !== 'you' || !idle(st)) return;
      idleTimer = setTimeout(() => { if (!room.busy && !gone()) endTurn(); }, IDLE_MS);
    }

    async function playOut(mark, by = null) {
      room.busy = true;
      // His own move being drawn: a tap meanwhile is taken at once (queued, the drawing hurried), never dropped.
      room.mine = by?.who === 'you';
      try {
        const ghosts = ghostsOf(battle(), since(room.st.log, mark), by);
        draw();
        const cx = ctx(), sig = room.st.foe.signature?.name;
        await playLog(battle(), since(room.st.log, mark), { words: cx.words, ghosts, faceOf: (id) => cardFaceHtml(id, cx, room.st), sigName: name(sig), onEntry: (t) => shell?.sound?.(t.act) });
      } finally {
        room.busy = false;
        room.mine = false;
      }
    }

    /* Taps while his own move is drawn (Hanli 11-07: 「斗法一张牌出手后要等1秒，才能点第二张…能优化一下，让用户能快速连着点击吗」):
       each is kept in order and the drawing runs to its end at once (battle-anim.js hurry), then each is taken as if
       tapped on the room as it now stands — the room drawn at the start of the move is already the rules' state, so the
       card played has left the hand and the indices are the room's. A tap the rules refuse says why (room.note) and the
       card stays in the hand; one taken after the fight is over, or after the turn ended, is let go. Each tap is taken
       once: shifted off the queue before it is acted on. */
    function queueTap(fn) {
      room.queue.push(fn);
      hurry();
    }
    /* A queued tap names WHAT was tapped, never only where: by the time it is taken, a tap queued before it may have
       played a card or driven off a body, and the index it was given points at another. A card is its id and which
       copy of it (the nth); a body its uid; a pill its id and copy. Taken, it is found again in the room as it then
       stands; gone, the tap is let go. Other spots (the beast, 结束回合, 主灵根一击) stand where they stood. */
    const copyAt = (list, i, idOf = (x) => x) => { const id = idOf(list[i]); return { id, nth: list.slice(0, i).filter((x) => idOf(x) === id).length }; };
    const copyIn = (list, { id, nth }, idOf = (x) => x) => {
      const at = list.map((x, i) => (idOf(x) === id ? i : -1)).filter((i) => i >= 0);
      return at.length ? at[Math.min(nth, at.length - 1)] : -1;
    };
    const pillId = (p) => p?.id ?? p;
    function heldOf(spot) {
      const st = room.st;
      if (!spot || spot.index == null || spot.index < 0) return { spot };
      if (spot.kind === 'hand') return st.you.hand[spot.index] == null ? { spot } : { spot, card: copyAt(st.you.hand, spot.index) };
      if (spot.kind === 'pill') return st.you.pouch?.[spot.index] == null ? { spot } : { spot, pill: copyAt(st.you.pouch, spot.index, pillId) };
      if (spot.kind === 'theirs' || spot.kind === 'mine') { const m = (spot.kind === 'theirs' ? st.foe : st.you).board[spot.index]; return m?.uid != null ? { spot, uid: m.uid } : { spot }; }
      return { spot };
    }
    function spotNow(h) {
      const st = room.st;
      if (h.card) { const i = copyIn(st.you.hand, h.card); return i < 0 ? null : { ...h.spot, index: i }; }
      if (h.pill) { const i = copyIn(st.you.pouch ?? [], h.pill, pillId); return i < 0 ? null : { ...h.spot, index: i }; }
      if (h.uid != null) { const i = (h.spot.kind === 'theirs' ? st.foe : st.you).board.findIndex((m) => m.uid === h.uid); return i < 0 ? null : { ...h.spot, index: i }; }
      return h.spot;
    }
    function drain() {
      if (gone() || room.busy || !room.queue.length) return;
      if (room.st.outcome !== 'open' || room.st.whose !== 'you') { room.queue.length = 0; return; }
      const next = room.queue.shift();
      next();
    }

    async function settle() {
      if (room.settling || done) return;
      room.settling = true;
      clearTimeout(idleTimer);
      // The story's rules answer first; the closing card waits for their word, not for the last blow.
      const r = story.settle ? await Promise.resolve().then(() => story.settle(room.st)).catch((e) => ({ ok: false, error: String(e?.message ?? e) })) : null;
      room.result = r;
      const out = { ...resultOf(room.st), ...(fight.next ? { next: fight.next } : {}), ...(r ? { r } : {}) };
      if (done) return;
      if (r && r.ok === false) return finish(out);
      room.ended = true;
      draw();
      // The beast's last word stands in the closing card itself (battle-card.js endHtml `says.end`), so it is never said
      // again over the room too (Hanli 11-07 on the phone: 「它拱开一片土…」 in the card and in a toast above it).
      const end = boutSays(fight.brief.says, room.st.outcome)?.end;
      const hold = hook('holdMs', end, r) ?? SEAL_MS;
      await new Promise((go) => { release = go; setTimeout(go, hold); });
      finish(room.go ? { ...out, go: room.go } : out);
    }

    async function doMove(out) {
      room.note = null;
      if (out.quit) return yieldFight();
      if (out.clear) { room.picked = null; draw(); return drain(); }
      if (out.pick) { room.picked = out.pick; draw(); return drain(); }
      if (out.action.kind === 'end') { room.picked = null; return endTurn(); }
      // A spell that would land on nothing is never played: its one line says what is missing (Hanli 11-04, 痒痒针).
      const nothing = out.action.kind === 'play' ? idleWhy(room.st, room.st.you, room.st.catalog?.[room.st.you.hand[out.action.index]]) : null;
      if (nothing) { room.picked = null; room.note = nothing; draw(); return drain(); }
      const mark = room.st.log.length, before = view(room.st), res = act(room.st, out.action, 'you');
      room.picked = null;
      if (!res.ok) { room.note = res.why; draw(); return drain(); }
      hook('onMove', tokenOf(out.action));
      await playOut(mark, { who: 'you', action: out.action });
      if (gone()) return;
      hook('onStep');
      hook('onPlayed', { before, mark, mine: true });
      if (room.st.outcome !== 'open') { room.queue.length = 0; return settle(); }
      draw();
      drain();
    }

    async function endTurn() {
      const st = room.st;
      if (room.busy || st.outcome !== 'open' || st.whose !== 'you') return;
      // A tap kept behind the end is for a turn that is over: let go.
      room.queue.length = 0;
      const mark = st.log.length, before = view(st);
      if (!act(st, { kind: 'end' }, 'you').ok) return;
      hook('onMove', 'end');
      await playOut(mark);
      if (gone()) return;
      hook('onStep');
      if (st.whose === 'foe' && st.outcome === 'open') {
        room.busy = true;
        try { if (battle()) await banner(battle(), `${fight.brief.creature.name}${lang === 'en' ? "'s turn" : '的回合'}`, 'foe'); } finally { room.busy = false; }
        for (let guard = 0; guard < 40 && !gone() && st.whose === 'foe' && st.outcome === 'open'; guard += 1) {
          await unpaused();
          if (gone()) return;
          const step = st.log.length, did = foeStep(st);
          await playOut(step, did ? { who: 'foe', action: did } : null);
          if (gone()) return;
          hook('onStep');
          if (!did || did.kind === 'end') break;
        }
      }
      if (gone()) return;
      hook('onPlayed', { before, mark, mine: false });
      if (st.outcome !== 'open') return settle();
      draw();
    }

    // 认输: he passes every turn and the beast takes its own, to the end (the story's yieldBout).
    function yieldFight() {
      const st = room.st;
      if (room.settling || room.yielded || done) return;
      room.yielded = true;
      room.picked = null;
      for (let guard = 0; guard < 600 && st.outcome === 'open'; guard += 1) {
        if (st.whose === 'foe') { foeTurn(st); continue; }
        if (!act(st, { kind: 'end' }, 'you').ok) break;
        hook('onMove', 'end');
      }
      return settle();
    }

    function onTap(spot) {
      if (spot.kind === 'close') return release?.();
      // The loss card's way forward (battle-card.js endHtml): the story takes it once the room is closed.
      if (spot.kind === 'way') { room.go = room.result?.way?.[0] ?? null; return release?.(); }
      if (room.ended) return;
      if (spot.kind === 'help' || spot.kind === 'help-bg') { room.help = !room.help; return draw(); }
      if (spot.kind === 'more') { room.openLog = !room.openLog; return draw(); }
      // 问银月: words only — nothing in the fight moves (fightsay.js); the story's.
      if (spot.kind === 'ask') { if (!room.yielded) hook('onAsk'); return; }
      if (paused()) return;
      if (spot.kind === 'quit') { room.queue.length = 0; return yieldFight(); }
      if (room.busy) {
        if (room.mine && !gone()) { const h = heldOf(spot); queueTap(() => { const now = spotNow(h); if (now) onTap(now); else drain(); }); }
        return;
      }
      if (room.st.outcome !== 'open') return;
      if (spot.kind === 'stage' && !room.picked) return;
      return doMove(pickOf(room.picked, spot, view(room.st), room.catalog, offers(room.st)));
    }
    function onClick(e) {
      // The folded panel under the beast (battle-card.js foldHtml): its own button, no spot — a card dropped on it is no move.
      if (e.target.closest?.('[data-omen-fold]') && host.contains(e.target)) { e.stopPropagation(); room.omenOpen = !room.omenOpen; draw(); host.querySelector('[data-omen-fold]')?.focus({ preventScroll: true }); return; }
      const el = e.target.closest?.('[data-spot]');
      if (!el || !host.contains(el)) return;
      e.stopPropagation();
      onTap({ kind: el.dataset.spot, index: Number(el.dataset.index ?? -1) });
    }
    host.addEventListener('click', onClick);
    const offDrag = wireDrag({
      room: host,
      active: () => !gone() && !paused() && (!room.busy || room.mine) && room.st.outcome === 'open' && room.st.whose === 'you',
      onDrop: (from, to) => {
        const go = () => { if (room.busy || room.st.outcome !== 'open') return; room.picked = null; doMove(dropOf(from, to, view(room.st), room.catalog)); };
        if (room.busy) {
          if (room.mine && !gone()) {
            const a = heldOf(from), b = heldOf(to);
            queueTap(() => { const f = spotNow(a), t = spotNow(b); if (f && t) { from = f; to = t; go(); } else drain(); });
          }
          return;
        }
        go();
      },
    });
    const offPause = shell?.onPause?.((on) => { if (on) { room.picked = null; clearTimeout(idleTimer); } else idleSoon(); });
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    // The bot's door (tests, the live check): the room's state and its move, as the story's probe gives them.
    host.kapai = { wheel, state: () => room.st, room: () => room, busy: () => room.busy, picked: () => room.picked, draw, tap: onTap, move: (action) => (room.busy || gone() ? null : doMove({ action })) };
    draw();
    // The beast's opening line when the fight first starts, never on a resume (the playbot's third run, 11-06 at 430: a kept
    // fight reopened said it again, and the bubble under the 杀招 panel lay over the corner of 火鸦 on the beast's row).
    const open = fight.brief.says?.foe;
    if (open && !resumed) shell?.say?.(fight.brief.creature.name, open);
  });
}
