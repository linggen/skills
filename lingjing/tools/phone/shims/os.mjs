// shims/os.mjs — `node:os` for the phone bundle: there is no home folder; the engine's quests dir is set by env.
export const homedir = () => '/home';
export default { homedir };
