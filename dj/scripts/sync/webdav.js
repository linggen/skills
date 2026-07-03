// webdav.js — push files to a WebDAV server (HTTP PUT). Evermusic and most
// cloud players connect to WebDAV and pull your library down (and download for
// offline). The .lrc sidecars ride along, so lyrics travel with the music.
// curl via /api/bash, like every other DJ network call.

import { runBash, sq } from '../bash.js';

const base = (u) => String(u || '').replace(/\/+$/, '');
const authArg = (cfg) => (cfg.username ? `-u ${sq(`${cfg.username}:${cfg.password || ''}`)}` : '');
const basename = (p) => String(p).split('/').pop();

// PROPFIND multistatus → the basenames it lists. Namespace prefixes vary by
// server (<D:href>, <d:href>, <href>) and hrefs arrive XML-escaped then
// percent-encoded, so unescape in that order.
export function parseDavListing(xml) {
  const unent = (s) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  return [...String(xml).matchAll(/<[^>]*?href[^>]*?>([^<]+)</gi)]
    .map((m) => {
      const raw = unent(m[1]).replace(/\/+$/, '');
      let path = raw;
      try {
        path = decodeURIComponent(raw);
      } catch {
        /* keep raw */
      }
      return basename(path);
    })
    .filter(Boolean);
}

export function webdavTarget(cfg) {
  const url = base(cfg.url);
  const auth = authArg(cfg);

  return {
    name: cfg.name || 'WebDAV',

    async test() {
      try {
        const code = (
          await runBash(`curl -fsS -m 8 ${auth} -o /dev/null -w '%{http_code}' ${sq(url + '/')}`)
        ).trim();
        return /^[23]/.test(code);
      } catch {
        return false;
      }
    },

    async push(file) {
      const remote = `${url}/${encodeURIComponent(basename(file))}`;
      const code = (
        await runBash(
          `curl -fsS -m 180 ${auth} -o /dev/null -w '%{http_code}' -T ${sq(file)} ${sq(remote)}`,
        )
      ).trim();
      if (!/^2/.test(code)) throw new Error(`WebDAV PUT HTTP ${code || '???'}`);
      return true;
    },

    // Evermusic's Wi-Fi Drive is a real WebDAV server, so a Depth-1 PROPFIND
    // at the root is a live listing — gives WebDAV the same incremental skip
    // VLC gets from its share page. A server that rejects PROPFIND makes this
    // throw; sync.js treats that as "listing unknown" and re-pushes every
    // track (safe, just not incremental).
    async list() {
      const xml = await runBash(
        `curl -fsS -m 15 ${auth} -X PROPFIND -H 'Depth: 1' ${sq(url + '/')}`,
      );
      return parseDavListing(xml);
    },
  };
}
