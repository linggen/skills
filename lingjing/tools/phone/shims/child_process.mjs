// shims/child_process.mjs — `node:child_process` for the phone bundle: the Mac-only verbs that shell out (the book
// reader's git, revert) are refused here; nothing the phone plays calls them.
export const execFileSync = () => { throw new Error('child_process is not available on the phone'); };
export default { execFileSync };
