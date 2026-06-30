# DJ — product spec

Your personal Disc Jockey. Describe a vibe; DJ builds the set, downloads tagged
MP3s into a local library, and copies them to your phone for offline play.

## Split

- **Agent curates.** NL brief → researches → proposes a tracklist (`PageUpdate`).
  No file or shell tools.
- **User gets.** Taps Get (download) and Sync to phone (copy). Page runs it
  locally via `/api/bash`.

## Flow

1. User: "Hong Kong 90s top 50."
2. Agent: `ListLibrary` → `WebSearch` → `PageUpdate` with the set.
3. Page renders the set (editable). User taps **Get all**.
4. `yt-dlp -x --audio-format mp3 "ytsearch1:Artist Title"` per track → tagged MP3
   in the library dir → recorded in `library.json`.
5. User taps **Sync to phone** → `curl` push to VLC's WiFi server → offline.

## Dependencies

A fresh user needs **nothing pre-installed** — `bin-setup.sh` provisions the two
runtime binaries into `~/.linggen/bin` on first download:

- **yt-dlp** — fetched from GitHub releases (standalone macOS binary, Python
  frozen inside → no system Python), self-updating.
- **ffmpeg** — prefers a system/Homebrew install; if absent, fetches a
  **version-pinned, SHA-256-verified** native static build (per-arch: arm64 /
  x86_64), refusing to run on checksum mismatch.

Both are de-quarantined + ad-hoc-codesigned for Gatekeeper. Neither is bundled
or system-installed.

- **Code:** none — no npm/node_modules, no Python packages, no build step. Plain
  HTML/CSS/JS (ES modules) + bash; the audio engine, pitch shifter, and lyrics
  parser are hand-rolled on native browser APIs.
- **System tools** (macOS built-ins): `curl`, `openssl`, `unzip`, `bash`.
- **Browser:** Web Audio, `getUserMedia`, `setSinkId`, `enumerateDevices`,
  `Blob`/`createObjectURL` (karaoke). No JS libraries.
- **Services:** YouTube (via yt-dlp); LRCLIB (lyrics, free/no-key).
- **Optional:** VLC for iOS — only for the phone-sync target.

## Sync targets

`SyncTarget` adapter (`test` / `push`). **VLC** first (push to `/upload.json`).
WebDAV and cloud-folder are later adapters. Discovery: manual IP/`.local` +
Test connection. mDNS auto-discovery is a fast-follow.

## Files

- `library.json` — `{ tracks[], playlists[] }`, the source of truth (also read by
  `ListLibrary`).
- `config.json` — `library_dir`, `bitrate`, `naming_template`, `sync_targets[]`.
- Library MP3s default to `~/Music/DJ`.
- Taste → DJ-scoped memory.

## Not in v1

mDNS discovery; playlist management UI; per-track re-download.
