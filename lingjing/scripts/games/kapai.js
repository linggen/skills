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
import { act, begin, foeStep, foeTurn, idle, offers, view } from '../battle.js';
import { WORDS as BATTLE_WORDS, battleHtml, boutSays, boutWords, cardFaceHtml, dropOf, endOf, pickOf } from '../battle-card.js';
import { banner, ghostsOf, playLog, since } from '../battle-anim.js';
import { wireDrag } from '../battle-drag.js';
import { WORDS, duelTitle } from '../cards.js';

export const meta = {
  name: { zh: '斗法', en: 'Card duel' },
  how: { zh: '出牌、催随从、主灵根一击；打退对手，或撑过它的十二张。', en: 'Play cards, send your rank, strike with your root; drive it off, or outlast its twelve.' },
  // Turn-based, but the shell may pause it: the hand is put away and the beast's turn waits (shell.css).
  pause: true,
  // The 游戏厅 opens a foe picker before it (arcade.js): one fight a foe.
  pick: true,
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
    ended: Boolean(room.ended), stake: brief.stake ?? null,
    says: { ...(boutSays(brief.says, room.st.outcome) ?? {}), foe: null, her: null }, herAsk: null,
  };
}

/** The fight the mount was handed: given whole, or a key of the table. */
async function fightFrom(data, lang) {
  const [catalog, table] = await Promise.all([catalogOf(), data.setup ? null : fightTable()]);
  const row = data.setup ? data : fightOf(table, data.foe);
  if (!row) throw new Error(`no fight ${data.foe}`);
  const brief = row.brief?.[lang] ?? row.brief?.zh ?? row.brief;
  return { catalog, table, setup: row.setup, brief, next: row.next ?? data.next ?? null };
}

export async function mount(container, { data = {}, lang = 'zh', seed = String(Date.now()), signal, shell } = {}) {
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.className = 'g-kapai';
  container.replaceChildren(host);
  const fight = await fightFrom(data, lang);
  const setup = { ...fight.setup, seed: `kapai|${seed}` };
  const room = { ...fight, setup, lang, st: begin(setup, fight.catalog), picked: null, openLog: false, help: false, note: null, busy: false, ended: false };
  const paused = () => Boolean(shell?.paused?.());
  const battle = () => host.querySelector('.battle');
  const name = (v) => (v && typeof v === 'object' ? v[lang] ?? v.zh : v);

  return new Promise((resolve) => {
    let done = false, idleTimer = null, release = null;
    const draw = () => { host.innerHTML = battleHtml(view(room.st), offers(room.st), ctxOf(room), room.picked, room.openLog, room.note, room.help); idleSoon(); };
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(idleTimer);
      offDrag();
      offPause?.();
      host.removeEventListener('click', onClick);
      resolve(r);
    };
    const gone = () => done;
    // The beast's turn waits while the shell is paused; so does a turn that would end itself.
    const unpaused = () => new Promise((go) => { const t = () => (gone() || !paused() ? go() : setTimeout(t, 120)); t(); });
    function idleSoon() {
      clearTimeout(idleTimer);
      const st = room.st;
      if (room.busy || room.picked || room.help || paused() || st.outcome !== 'open' || st.whose !== 'you' || !idle(st)) return;
      idleTimer = setTimeout(() => { if (!room.busy && !gone()) endTurn(); }, IDLE_MS);
    }

    async function playOut(mark, by = null) {
      room.busy = true;
      try {
        const ghosts = ghostsOf(battle(), since(room.st.log, mark), by);
        draw();
        const cx = ctxOf(room), sig = room.st.foe.signature?.name;
        await playLog(battle(), since(room.st.log, mark), { words: cx.words, ghosts, faceOf: (id) => cardFaceHtml(id, cx), sigName: name(sig) });
      } finally {
        room.busy = false;
      }
    }

    async function settle() {
      if (room.ended || gone()) return;
      room.ended = true;
      draw();
      const end = boutSays(fight.brief.says, room.st.outcome)?.end;
      if (end) shell?.say?.(fight.brief.creature.name, end, SEAL_MS);
      await new Promise((go) => { release = go; setTimeout(go, SEAL_MS); });
      finish({ ...resultOf(room.st), ...(fight.next ? { next: fight.next } : {}) });
    }

    async function doMove(out) {
      room.note = null;
      if (out.quit) return yieldFight();
      if (out.clear) { room.picked = null; return draw(); }
      if (out.pick) { room.picked = out.pick; return draw(); }
      if (out.action.kind === 'end') { room.picked = null; return endTurn(); }
      const mark = room.st.log.length, res = act(room.st, out.action, 'you');
      room.picked = null;
      if (!res.ok) { room.note = res.why; return draw(); }
      await playOut(mark, { who: 'you', action: out.action });
      if (gone()) return;
      if (room.st.outcome !== 'open') return settle();
      draw();
    }

    async function endTurn() {
      const st = room.st;
      if (room.busy || st.outcome !== 'open' || st.whose !== 'you') return;
      const mark = st.log.length;
      if (!act(st, { kind: 'end' }, 'you').ok) return;
      await playOut(mark);
      if (gone()) return;
      if (st.whose === 'foe' && st.outcome === 'open') {
        room.busy = true;
        try { if (battle()) await banner(battle(), `${fight.brief.creature.name}${lang === 'en' ? "'s turn" : '的回合'}`, 'foe'); } finally { room.busy = false; }
        for (let guard = 0; guard < 40 && !gone() && st.whose === 'foe' && st.outcome === 'open'; guard += 1) {
          await unpaused();
          if (gone()) return;
          const step = st.log.length, did = foeStep(st);
          await playOut(step, did ? { who: 'foe', action: did } : null);
          if (!did || did.kind === 'end') break;
        }
      }
      if (gone()) return;
      if (st.outcome !== 'open') return settle();
      draw();
    }

    // 认输: he passes every turn and the beast takes its own, to the end (the story's yieldBout).
    function yieldFight() {
      const st = room.st;
      for (let guard = 0; guard < 600 && st.outcome === 'open'; guard += 1) {
        if (st.whose === 'foe') { foeTurn(st); continue; }
        if (!act(st, { kind: 'end' }, 'you').ok) break;
      }
      return settle();
    }

    function onTap(spot) {
      if (spot.kind === 'close') return release?.();
      if (room.ended) return;
      if (spot.kind === 'help' || spot.kind === 'help-bg') { room.help = !room.help; return draw(); }
      if (spot.kind === 'more') { room.openLog = !room.openLog; return draw(); }
      if (paused()) return;
      if (spot.kind === 'quit') return yieldFight();
      if (room.busy || room.st.outcome !== 'open') return;
      if (spot.kind === 'stage' && !room.picked) return;
      return doMove(pickOf(room.picked, spot, view(room.st), room.catalog, offers(room.st)));
    }
    function onClick(e) {
      const el = e.target.closest?.('[data-spot]');
      if (!el || !host.contains(el)) return;
      e.stopPropagation();
      onTap({ kind: el.dataset.spot, index: Number(el.dataset.index ?? -1) });
    }
    host.addEventListener('click', onClick);
    const offDrag = wireDrag({
      room: host,
      active: () => !gone() && !paused() && !room.busy && room.st.outcome === 'open' && room.st.whose === 'you',
      onDrop: (from, to) => { if (room.busy || room.st.outcome !== 'open') return; room.picked = null; doMove(dropOf(from, to, view(room.st), room.catalog)); },
    });
    const offPause = shell?.onPause?.((on) => { if (on) { room.picked = null; clearTimeout(idleTimer); } else idleSoon(); });
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    // The bot's door (tests, the live check): the room's state and its move, as the story's probe gives them.
    host.kapai = { state: () => room.st, busy: () => room.busy, tap: onTap, move: (action) => (room.busy || gone() ? null : doMove({ action })) };
    draw();
    const open = fight.brief.says?.foe;
    if (open) shell?.say?.(fight.brief.creature.name, open);
  });
}
