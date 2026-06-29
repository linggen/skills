// folder.js — copy files into a local folder that's synced to the cloud
// (iCloud Drive, Dropbox, …). The cloud app uploads it; your phone player
// (Evermusic, etc.) pulls it down. The simplest, most robust "cloud" path:
// no server, no credentials — just a folder. The .lrc sidecars copy along too.

import { runBash, sq, resolvePath } from '../bash.js';

export function folderTarget(cfg) {
  return {
    name: cfg.name || 'Cloud folder',

    async test() {
      const dir = await resolvePath(cfg.path || '');
      if (!dir) return false;
      try {
        await runBash(`mkdir -p ${sq(dir)} && test -w ${sq(dir)}`);
        return true;
      } catch {
        return false;
      }
    },

    async push(file) {
      const dir = await resolvePath(cfg.path || '');
      await runBash(`mkdir -p ${sq(dir)} && cp ${sq(file)} ${sq(dir)}/`);
      return true;
    },
  };
}
