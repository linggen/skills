// tools/playbot/art.mjs — the play bot's picture checks, the pure parts (playbot.mjs listens, serve.mjs blocks). Only
// node builtins, so the tests run without a browser.
//
//   art-missing    a picture the page asked for and did not get: an image, a CSS background or a game texture
//                  (png, jpg, jpeg, webp, gif, svg, avif — by the request's resource type or the path's extension)
//                  answered with an HTTP error or failed on the way; or an <img> that fired `error` / ended with no
//                  natural size where the network showed no reason. One finding per picture per run.
//   Not counted: a request the page itself cancelled (net::ERR_ABORTED — a navigation away, a preload dropped).
//
// --art=core (the proof that the package's core pack is enough for the first chapter): the bot's server answers 404
// for every file under worlds/<world>/art/ that tools/art-packs.mjs does not place in `core`. Nothing is moved.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The first chapter's story fights (the scenes of 00-prologue and 00-waimen with a `duel` exit), each played by --art=core:
    00-longzhi at 山门, 00-fox in 银叶谷, wm-wangzuo in the 秘境's 断崖下. A test holds the list to the world's files. */
export const FIRST_STORY = ['00-longzhi', '00-fox', 'wm-wangzuo'];

export const PICTURE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

/** The picture's key: the decoded path of its URL, query and hash dropped (`/apps/lingjing/worlds/…/x.webp`). */
export function pictureKey(url) {
  try { return decodeURIComponent(new URL(url, 'http://x').pathname); } catch { return String(url).split(/[?#]/)[0]; }
}

/** A request for a picture: an image by its resource type (an <img>, a CSS background), or any request whose path
    ends in a picture's extension (a texture a game engine fetches). Never a data: or blob: URL. */
export function isPicture({ url, resourceType = null }) {
  if (/^(data|blob):/i.test(String(url))) return false;
  if (resourceType === 'image') return true;
  return PICTURE_EXTS.has(path.extname(pictureKey(url)).toLowerCase());
}

/** A failure the page made itself: the request cancelled (a navigation away, an aborted preload). */
export const isCancel = (failureText) => /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(String(failureText ?? ''));

/** One picture's miss → its row, or null when it is not one (not a picture, a cancel, a status under 400). */
export function missOf({ url, resourceType = null, status = null, failure = null }) {
  if (!isPicture({ url, resourceType })) return null;
  if (failure != null) return isCancel(failure) ? null : { path: pictureKey(url), why: String(failure) };
  if (status != null && status >= 400) return { path: pictureKey(url), why: `HTTP ${status}` };
  return null;
}

/** The run's misses, one per picture: `note` → true the first time a picture is seen missing, false after (its count,
    and the sizes it was missed at, go up). */
export function missLedger() {
  const seen = new Map();
  return {
    seen,
    note(miss, size = null) {
      const had = seen.get(miss.path);
      if (had) { had.count += 1; if (size && !had.sizes.includes(size)) had.sizes.push(size); return false; }
      seen.set(miss.path, { ...miss, count: 1, sizes: size ? [size] : [] });
      return true;
    },
  };
}

/** The pack listing (tools/art-packs.mjs --json) of a skill folder: the skill's own tool when it has one, else this
    checkout's (a packaged install leaves tools/ out). → [{ path, pack }] */
export function packListing(skill) {
  const own = path.join(skill, 'tools', 'art-packs.mjs');
  const tool = fs.existsSync(own) ? own : path.resolve(HERE, '..', 'art-packs.mjs');
  const r = spawnSync(process.execPath, [tool, '--json', '--skill', skill], { cwd: skill, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`playbot: art-packs.mjs failed: ${r.stderr || r.error}`);
  return JSON.parse(r.stdout).files.map((f) => ({ path: f.path, pack: f.pack }));
}

/** The core-only block, given a pack listing: a skill-relative path → true when it is art outside `core` (anything
    under worlds/<world>/art/ the listing does not put in core, listed elsewhere or not listed at all). */
export function coreBlock(files) {
  const core = new Set(files.filter((f) => f.pack === 'core').map((f) => f.path));
  const block = (rel) => {
    const p = path.posix.normalize(String(rel)).replace(/^\/+/, '');
    return /^worlds\/[^/]+\/art\//.test(p) && !core.has(p);
  };
  block.blocked = files.length - core.size;
  return block;
}

/** A picture's pack as the listing has it, from its served path (/apps/lingjing/worlds/…). */
export function packOfPath(files, key) {
  const rel = String(key).replace(/^\/(__pb\/)?apps\/lingjing\//, '');
  return files.find((f) => f.path === rel)?.pack ?? (/^worlds\/[^/]+\/art\//.test(rel) ? 'not listed' : 'not art');
}
