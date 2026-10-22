#!/usr/bin/env node
// tools/phone-bundle.mjs — the rules engine and the world's content as ONE self-contained bundle for a JS engine
// with no Node (JavaScriptCore in the phone app, linggen-mobile). Two files into --out (default ./phone-bundle):
//
//   lingjing-rules.js   scripts/rules.mjs and everything it imports, as one script (esbuild, iife), with `node:fs`
//                       and friends answered by tools/phone/shims (an in-memory file system). Sets `Lingjing`
//                       (tools/phone/entry.mjs). The rules are NOT copied or ported: it is the same source.
//   lingjing-world.json { "/lj/worlds/jiuding/…": "<json text>" } — every JSON the rules read: the world's
//                       chapters, scenes, tasks, cards, creatures, games.json, levels/*.json …, and the book's
//                       index (story/), and battle.js as text (the fight engine's stamp). No art, no markdown. Minified.
//
// Usage: node tools/phone-bundle.mjs [--out <dir>]   (needs `npm ci` in tools/phone for esbuild)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..'); // lingjing/
const VIRTUAL = '/lj';
const SHIMS = path.join(HERE, 'phone/shims');
const NODE_SHIMS = { 'node:fs': 'fs', 'node:path': 'path', 'node:url': 'url', 'node:os': 'os', 'node:crypto': 'crypto', 'node:child_process': 'child_process' };

/** esbuild from tools/phone/node_modules (a dev dependency, never committed). */
export async function esbuildOf() {
  const require = createRequire(path.join(HERE, 'phone/package.json'));
  try { return await import(pathToFileURL(require.resolve('esbuild')).href); } catch { return null; }
}

/* `import.meta.url` of a source file: where that file stands in the in-memory file system. */
const virtualUrl = (file) => `file://${VIRTUAL}/${path.relative(SKILL, file).split(path.sep).join('/')}`;

/* rules.mjs ends in its command-line block (top-level await, process.argv): the phone calls `run` itself. */
const CLI_BLOCK = /\nif \(process\.argv\[1\] && path\.resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)\) \{[\s\S]*$/;
function plugin() {
  return {
    name: 'phone',
    setup(b) {
      b.onResolve({ filter: /^node:/ }, (a) => {
        if (!NODE_SHIMS[a.path]) throw new Error(`the rules import ${a.path}, which the phone bundle has no shim for`);
        return { path: path.join(SHIMS, `${NODE_SHIMS[a.path]}.mjs`) };
      });
      b.onLoad({ filter: /\.(mjs|js)$/ }, (a) => {
        if (a.path.includes(`${path.sep}node_modules${path.sep}`) || !a.path.startsWith(path.join(SKILL, 'scripts'))) return null;
        let text = fs.readFileSync(a.path, 'utf8');
        if (path.relative(SKILL, a.path) === path.join('scripts', 'rules.mjs')) {
          if (!CLI_BLOCK.test(text)) throw new Error('rules.mjs no longer ends in the command-line block tools/phone-bundle.mjs strips');
          text = `${text.replace(CLI_BLOCK, '\n')}\nexport { run };\n`;
        }
        // The content loaders lint with `import.meta.url` of their own file; in the bundle that is a virtual path.
        text = text.replace(/import\.meta\.url/g, JSON.stringify(virtualUrl(a.path)));
        return { contents: text, loader: 'js', resolveDir: path.dirname(a.path) };
      });
    },
  };
}

/** The world's files the rules read, by virtual path → minified JSON text. */
export function worldFiles({ world = 'jiuding' } = {}) {
  const out = {};
  const put = (file) => { out[`${VIRTUAL}/${path.relative(SKILL, file).split(path.sep).join('/')}`] = JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))); };
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) { if (name !== 'art') walk(file); } else if (name.endsWith('.json')) put(file);
    }
  };
  walk(path.join(SKILL, 'worlds', world));
  // The book the world is read from: story/index.json and the book.json it names (content.mjs loadBook).
  const index = path.join(SKILL, 'story/index.json');
  if (fs.existsSync(index)) {
    put(index);
    for (const id of JSON.parse(fs.readFileSync(index, 'utf8')).books ?? []) { const f = path.join(SKILL, 'story', id, 'book.json'); if (fs.existsSync(f)) put(f); }
  }
  // The fight engine's source, as text: rules/engine.mjs stamps the page's fight code with it (a stamp is read, never run).
  out[`${VIRTUAL}/scripts/battle.js`] = fs.readFileSync(path.join(SKILL, 'scripts/battle.js'), 'utf8');
  return out;
}

export async function buildPhoneBundle({ out = path.resolve('phone-bundle'), minify = true } = {}) {
  const esbuild = await esbuildOf();
  if (!esbuild) throw new Error('esbuild is not installed: run `npm ci` in lingjing/tools/phone');
  fs.mkdirSync(out, { recursive: true });
  const rules = path.join(out, 'lingjing-rules.js');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'phone/entry.mjs')], outfile: rules, bundle: true, format: 'iife', platform: 'neutral',
    mainFields: ['module', 'main'], target: 'es2022', minify, legalComments: 'none', logLevel: 'warning',
    inject: [path.join(SHIMS, 'process.mjs')], plugins: [plugin()],
    banner: { js: '/* The Lingjing rules for the phone — built by lingjing/tools/phone-bundle.mjs from scripts/rules.mjs; do not edit. */' },
  });
  const files = worldFiles();
  const world = path.join(out, 'lingjing-world.json');
  fs.writeFileSync(world, JSON.stringify(files));
  const size = (f) => { const b = fs.readFileSync(f); return { bytes: b.length, gzip: zlib.gzipSync(b).length }; };
  return { rules, world, files: Object.keys(files).length, sizes: { rules: size(rules), world: size(world) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await buildPhoneBundle({ out: i > 0 ? path.resolve(process.argv[i + 1]) : path.resolve('phone-bundle') });
  console.log(`rules ${r.sizes.rules.bytes} B (${r.sizes.rules.gzip} gz) → ${r.rules}\nworld ${r.sizes.world.bytes} B (${r.sizes.world.gzip} gz), ${r.files} files → ${r.world}`);
}
