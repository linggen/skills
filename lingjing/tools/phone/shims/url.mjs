// shims/url.mjs — `node:url` for the phone bundle. Every `import.meta.url` is rewritten at build time to
// `file:///lj/<path under lingjing/>`, so a module finds its own folder in the in-memory file system.
export const fileURLToPath = (u) => decodeURIComponent(String(u).replace(/^file:\/\//, ''));
export const pathToFileURL = (p) => ({ href: `file://${p}`, toString: () => `file://${p}` });
export default { fileURLToPath, pathToFileURL };
