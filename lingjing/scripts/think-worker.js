// The Worker half of ./think.js: loads the named game module (the same module the
// page plays) and answers its `think(state)` by ticket. Any failure is answered as
// an error, and the page thinks that one inline.
const GAME_ID = /^[a-z]+$/;

self.onmessage = async ({ data }) => {
  const { ticket, game, state } = data ?? {};
  try {
    if (!GAME_ID.test(String(game))) throw new Error(`bad game id ${game}`);
    const mod = await import(`./games/${game}.js`);
    self.postMessage({ ticket, move: mod.think(state) });
  } catch (e) {
    self.postMessage({ ticket, error: String(e?.message ?? e) });
  }
};
