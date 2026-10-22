// shims/process.mjs — the `process` the rules engine reads: env (it is how the host sets the clock and the
// language), a pid for the lock file, and no argv, so the file's command-line block never runs.
const env = {};
export const process = { env, pid: 1, argv: [], execArgv: [], platform: 'phone', kill: () => { const e = new Error('ESRCH'); e.code = 'ESRCH'; throw e; }, exitCode: 0, exit() {}, cwd: () => '/' };
