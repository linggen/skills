// shims/crypto.mjs — `node:crypto` for the phone bundle: randomBytes (a run's id) and the sha1 the book reader
// (`changes`) uses for a revision tag — that verb is Mac-only, so the hash here is only a stand-in.
const bytes = (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i += 1) a[i] = Math.floor(Math.random() * 256); return a; };
export const randomBytes = (n) => { const a = bytes(n); a.toString = (enc) => (enc === 'hex' ? [...a].map((b) => b.toString(16).padStart(2, '0')).join('') : String(a)); return a; };
export const createHash = () => {
  let text = '';
  const h = { update: (t) => { text += t; return h; }, digest: () => { let x = 5381; for (let i = 0; i < text.length; i += 1) x = ((x * 33) ^ text.charCodeAt(i)) >>> 0; return x.toString(16).padStart(8, '0').repeat(5); } };
  return h;
};
export default { randomBytes, createHash };
