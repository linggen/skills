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

## Binaries

`yt-dlp` fetched to `~/.linggen/bin` on first download, self-updating. `ffmpeg`
preferred from system/Homebrew, downloaded only as fallback. Never bundled,
never a system install.

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

mDNS discovery; WebDAV/cloud sync adapters; playlist management UI; per-track
re-download; pinned/checksummed ffmpeg arm64 build.
