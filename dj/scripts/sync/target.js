// target.js — the SyncTarget interface every phone-sync backend implements.
// VLC is the first; WebDAV and cloud-folder slot in later as sibling files
// with zero changes to the orchestrator (sync.js).
//
// A SyncTarget is a plain object:
//   {
//     name: string,
//     test(): Promise<boolean>          // is the target reachable right now?
//     push(file: string): Promise<true> // copy one local file across; throws on failure
//   }
//
// Factories take the saved target config ({ id, type, name, host, ... }) and
// return a SyncTarget. Register new types in sync.js#makeTarget.

export {}; // interface-only module (documentation + a stable import anchor)
