// physics.js — the small games' physics (design.md § 新小游戏, Hanli 2026-10-16): matter.js,
// vendored (scripts/vendor/matter-0.20.0.min.js, MIT), never a CDN. Its UMD bundle is a classic
// script: the page loads it by a script tag (window.Matter); node — the board bots and the
// tests — requires it as CommonJS (scripts/vendor/package.json). Loaded once, the first time a
// game that needs it is imported (the module waits on it: top-level await).

const BUNDLE = '../vendor/matter-0.20.0.min.js';

function fromPage() {
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = new URL(BUNDLE, import.meta.url).href;
    s.onload = () => (globalThis.Matter ? ok(globalThis.Matter) : no(new Error('matter.js did not define Matter')));
    s.onerror = () => no(new Error('matter.js did not load'));
    document.head.appendChild(s);
  });
}

async function fromNode() {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)(BUNDLE);
}

/* A module worker (rope-worker.js, a level made off the page's thread) has no script tag and no
   require: the bundle's text is wrapped as a module, its CommonJS branch taking it. */
async function fromWorker() {
  const src = await (await fetch(new URL(BUNDLE, import.meta.url))).text();
  const wrapped = `const module = { exports: {} }; const exports = module.exports;\n${src}\nexport default module.exports;`;
  const url = URL.createObjectURL(new Blob([wrapped], { type: 'text/javascript' }));
  try { return (await import(url)).default; } finally { URL.revokeObjectURL(url); }
}

async function load() {
  if (globalThis.Matter) return globalThis.Matter;
  if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) return fromWorker();
  return typeof document === 'undefined' ? fromNode() : fromPage();
}

export const Matter = await load();
