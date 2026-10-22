// build.mjs — the shared sound bank (doc/game-kit.md § Sound; Hanli 10-22: 「开吧. 统一做进外壳」).
// Reads sources.json: fetches each CC0 pack and track once (sha256-checked, cached in tools/sound/.cache), cuts the
// sprite (every short sound end to end, mono, a gap between) and one music bed per kit, each in Ogg Vorbis and AAC
// (the page picks what the browser decodes), into scripts/games/kit/audio/, and writes bank.json (where each sound sits)
// and CREDITS.md (who made it, where it came from, its licence). Needs ffmpeg + unzip. Run: node tools/sound/build.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../scripts/games/kit/audio');
const cache = join(here, '.cache');
const src = JSON.parse(readFileSync(join(here, 'sources.json'), 'utf8'));
const RATE = 44100, LEAD = 0.05, GAP = 0.12;
mkdirSync(cache, { recursive: true });
mkdirSync(join(out, 'music'), { recursive: true });

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 30 });

/** One source file, fetched once and checked against its sha256. */
async function fetched(row) {
  const file = join(cache, row.sha256);
  if (!existsSync(file)) {
    const r = await fetch(row.url);
    if (!r.ok) throw new Error(`${row.url}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const got = sha(readFileSync(file));
  if (got !== row.sha256) throw new Error(`${row.url}: sha256 ${got}, expected ${row.sha256}`);
  return file;
}

/** A clip as mono float samples at RATE. */
function samples(file) {
  const raw = ff(['-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-']);
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function wav(path, data) {
  const pcm = Buffer.alloc(data.length * 2);
  data.forEach((s, i) => pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}

const encode = (from, base, { q = 3, k = 80 } = {}) => {
  ff(['-i', from, '-ac', '1', '-c:a', 'libvorbis', '-q:a', String(q), `${base}.ogg`]);
  ff(['-i', from, '-ac', '1', '-c:a', 'aac', '-b:a', `${k}k`, '-movflags', '+faststart', `${base}.m4a`]);
};
const round = (x) => Math.round(x * 10000) / 10000;

// ── the sprite ──
const zips = {};
for (const [id, p] of Object.entries(src.packs)) zips[id] = await fetched(p);
const tmp = join(cache, 'clip');
const parts = [new Float32Array(Math.round(LEAD * RATE))], map = {};
let at = parts[0].length;
for (const row of src.sprite) {
  writeFileSync(tmp, execFileSync('unzip', ['-p', zips[row.pack], row.path], { maxBuffer: 1 << 28 }));
  const s = samples(tmp);
  map[row.id] = [round(at / RATE), round(s.length / RATE)];
  parts.push(s, new Float32Array(Math.round(GAP * RATE)));
  at += s.length + Math.round(GAP * RATE);
}
const all = new Float32Array(at);
let o = 0;
for (const p of parts) { all.set(p, o); o += p.length; }
wav(join(cache, 'sfx.wav'), all);
encode(join(cache, 'sfx.wav'), join(out, 'sfx'));
rmSync(tmp, { force: true });

// ── one bed per kit ──
const music = {};
for (const [kit, row] of Object.entries(src.music)) {
  const file = await fetched(row);
  const secs = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  const len = Math.min(secs, row.max ?? 100);
  const flat = join(cache, `${kit}.wav`);
  ff(['-i', file, '-t', String(len), '-ac', '1', '-ar', String(RATE),
    '-af', `loudnorm=I=-20:TP=-3:LRA=11,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, len - 1)}:d=1`, flat]);
  encode(flat, join(out, 'music', kit), { q: 1, k: 56 });
  music[kit] = { ogg: `music/${kit}.ogg`, m4a: `music/${kit}.m4a`, seconds: round(len) };
}

writeFileSync(join(out, 'bank.json'), `${JSON.stringify({
  _about: 'Built by tools/sound/build.mjs from tools/sound/sources.json — do not edit. sprite.map: id → [start s, length s] in sfx.ogg / sfx.m4a.',
  sprite: { ogg: 'sfx.ogg', m4a: 'sfx.m4a', map }, music,
}, null, 1)}\n`);

// ── the credits ──
const lines = ['# Sound credits — the small games\' shared bank', '',
  'Built by `tools/sound/build.mjs` from `tools/sound/sources.json`. Every file is CC0 1.0 (public domain); each pack\'s or',
  'track\'s page was checked for its licence on 2026-10-22 and the downloads are pinned by sha256 in `sources.json`.',
  'Generated effects (the `zzfx` rows of `sounds.json`) are made on the spot by ZzFX 1.4.0 (MIT, Frank Force;',
  '`scripts/vendor/zzfx-1.4.0.mjs`) — no recording.', '', '## Effects — `sfx.ogg` / `sfx.m4a` (the sprite)', '',
  '| Sounds | Pack | Author | Licence | Source |', '|---|---|---|---|---|'];
for (const [id, p] of Object.entries(src.packs)) {
  const ids = src.sprite.filter((r) => r.pack === id).map((r) => r.id);
  lines.push(`| ${ids.join(', ')} | ${p.title} | ${p.author} | ${p.licence} | ${p.page} (${p.url}) |`);
}
lines.push('', '## Music beds — `music/<kit>.ogg` / `.m4a` (mono, loudness-levelled, faded at the ends)', '',
  '| Kit | Track | Author | Licence | Source | Why |', '|---|---|---|---|---|---|');
for (const [kit, r] of Object.entries(src.music)) lines.push(`| ${kit} | ${r.title} | ${r.author} | ${r.licence} | ${r.page} (${r.url}) | ${r.why} |`);
writeFileSync(join(out, 'CREDITS.md'), `${lines.join('\n')}\n`);
console.log('built →', out, Object.keys(map).length, 'sounds,', Object.keys(music).length, 'beds');
