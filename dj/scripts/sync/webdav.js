// webdav.js — push files to a WebDAV server (HTTP PUT). Evermusic and most
// cloud players connect to WebDAV and pull your library down (and download for
// offline). The .lrc sidecars ride along, so lyrics travel with the music.
// curl via /api/bash, like every other DJ network call.

import { runBash, sq } from '../bash.js';

const base = (u) => String(u || '').replace(/\/+$/, '');
const authArg = (cfg) => (cfg.username ? `-u ${sq(`${cfg.username}:${cfg.password || ''}`)}` : '');
const basename = (p) => String(p).split('/').pop();

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

    // PROPFIND listing varies by server; fall back to synced_to bookkeeping.
    async list() { return []; },
  };
}
