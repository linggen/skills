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
      try {
        const code = (
          await runBash(`curl -fsS -m 5 -o /dev/null -w '%{http_code}' ${sq(base + '/')}`)
        ).trim();
        return /^[23]/.test(code);
      } catch {
        return false;
      }
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
  };
}
