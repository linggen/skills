// fantong-puzzle.js — the 饭桶's feed as a 割绳子 puzzle, on the page (2026-10-16). The pouch pane
// redraws its HTML whenever it changes, so a game living in it would die on every redraw: the puzzle
// is mounted ONCE into a node of its own (games/fantongcut.js through the small-game contract) and
// that node is laid into whatever host `[data-ft-puzzle]` the redraw made (beat-host.js's
// way). The level is made from the rules' seed (the brief's `puzzle`) — ahead of time, while he is
// still choosing — so the puzzle opens at once. The result goes back to the page: fed (with its
// stars) or left. Nothing here knows the rules.

export function fantongPuzzle({ onDone, doc = globalThis.document }) {
  const made = new Map(); // seed → the generated level (rope-gen.js)
  let cur = null; //        { id, node, ctrl }

  async function levelFor(p) {
    if (!made.has(p.seed)) {
      const { generate } = await import('./games/rope-gen.js');
      if (!made.has(p.seed)) made.set(p.seed, generate(p.seed, { tier: p.tier, els: p.els, must: p.must }));
    }
    return made.get(p.seed);
  }

  return {
    /** Make the next puzzle's level while he chooses (an idle moment after the brief is read). */
    prepare(fb) {
      const p = fb?.puzzle;
      if (p && !made.has(p.seed)) setTimeout(() => { levelFor(p).catch(() => {}); }, 120);
    },
    /** Hang `item` ({ id, name, art }) for the brief's puzzle; settles through onDone(id, result). */
    async start(fb, item, { lang, reducedMotion }) {
      this.stop();
      const p = fb.puzzle, node = doc.createElement('div'), ctrl = new AbortController();
      node.className = 'g-mountnode';
      cur = { id: item.id, node, ctrl };
      const [{ mount }, lv] = await Promise.all([import('./games/fantongcut.js'), levelFor(p)]);
      if (cur?.node !== node) return;
      const data = { level: structuredClone(lv.level), plan: lv.plan, item: { name: item.name, art: item.art }, must: p.must,
        teach: p.teach ?? null, max_misses: p.max_misses };
      this.attach();
      const result = await mount(node, { data, lang, reducedMotion, seed: p.seed, signal: ctrl.signal, winHold: 500 });
      if (cur?.node === node) cur = null;
      if (!result?.left) onDone(item.id, result);
    },
    /** Lay the live puzzle into the host the latest redraw made. */
    attach() {
      const host = doc.querySelector('[data-ft-puzzle]');
      if (host && cur && host.firstChild !== cur.node) host.replaceChildren(cur.node);
    },
    stop() { if (cur) { const c = cur; cur = null; c.ctrl.abort(); } },
    get id() { return cur?.id ?? null; },
  };
}
