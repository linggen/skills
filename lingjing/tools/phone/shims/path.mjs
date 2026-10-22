// shims/path.mjs — `node:path` (posix) for the phone bundle: only what the rules engine calls.
const norm = (p) => {
  const abs = p.startsWith('/'), out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length && out.at(-1) !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
};
export const sep = '/';
export const normalize = (p) => norm(String(p));
export const join = (...parts) => norm(parts.filter((x) => x !== '').join('/'));
export const isAbsolute = (p) => String(p).startsWith('/');
export const resolve = (...parts) => {
  let acc = '';
  for (const p of parts.map(String).reverse()) { acc = acc ? `${p}/${acc}` : p; if (p.startsWith('/')) break; }
  return norm(acc.startsWith('/') ? acc : `/${acc}`);
};
export const dirname = (p) => { const n = norm(String(p)); const i = n.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : n.slice(0, i); };
export const basename = (p, ext) => { const b = String(p).replace(/\/+$/, '').split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
export const extname = (p) => { const b = basename(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
export const relative = (from, to) => {
  const a = resolve(from).split('/').filter(Boolean), b = resolve(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
};
export default { sep, normalize, join, isAbsolute, resolve, dirname, basename, extname, relative };
