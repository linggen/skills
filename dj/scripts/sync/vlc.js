// vlc.js — push files to VLC for iOS over its "Sharing via WiFi" server.
// Uploading COPIES the file into VLC's on-device library, so it plays offline
// afterwards (WiFi is needed only during the transfer). We POST via curl
// through /api/bash, NOT a browser fetch: VLC sends no CORS headers, so a
// cross-origin fetch from the :9898 page would be blocked.

import { runBash, sq } from '../bash.js';

const baseUrl = (host) =>
  (/^https?:\/\//.test(host) ? host : `http://${host}`).replace(/\/+$/, '');

export function vlcTarget(cfg) {
  const base = baseUrl(cfg.host || '');
  // VLC's web UI POSTs uploads to /upload.json with a `files[]` file field.
  // This is the app's internal endpoint, not a public contract — verify
  // against a live phone at build time (probe the upload <form> = fast-follow).
  const uploadUrl = cfg.upload_path ? base + cfg.upload_path : `${base}/upload.json`;
  const field = cfg.field || 'files[]';

  return {
    name: cfg.name || 'VLC',

    async test() {
      // .local (mDNS) lookups can be slow/cold — give it room and retry once.
      for (let i = 0; i < 2; i++) {
        try {
          const code = (
            await runBash(`curl -fsS -m 9 -o /dev/null -w '%{http_code}' ${sq(base + '/')}`)
          ).trim();
          if (/^[23]/.test(code)) return true;
        } catch { /* retry */ }
      }
      return false;
    },

    async push(file) {
      const code = (
        await runBash(
          `curl -fsS -m 180 -o /dev/null -w '%{http_code}' ` +
            `-F ${sq(`${field}=@${file};type=audio/mpeg`)} ${sq(uploadUrl)}`,
        )
      ).trim();
      if (!/^2/.test(code)) throw new Error(`VLC upload HTTP ${code || '???'}`);
      return true;
    },

    // Filenames already in VLC's library — its page lists them as
    // href="download/…/Documents/<url-encoded name>". Used to skip dupes.
    async list() {
      try {
        const html = await runBash(`curl -fsS -m 8 ${sq(base + '/')}`);
        const out = [];
        for (const m of html.matchAll(/href="download\/[^"]*\/([^"/]+\.[a-z0-9]+)"/gi)) {
          try { out.push(decodeURIComponent(m[1])); } catch { out.push(m[1]); }
        }
        return [...new Set(out)];
      } catch {
        return [];
      }
    },
  };
}
