# DJ — product spec

Your personal Disc Jockey. Describe a vibe; DJ builds the set, downloads tagged
MP3s with lyrics into a library on your Mac, and your paired phone carries the
songs you choose, offline.

## Split

- **Agent curates.** NL brief → research → a proposed set (`PageUpdate`), and
  library tools (playlists, `AddToPhone`) when asked — never a download: the user taps Get. No file or
  shell tools of its own.
- **User gets.** Taps **Get** on the set; the page queues it on the Mac.
- **One writer.** Every library change — page, agent, phone — runs
  `actions.mjs`.

## Flow

1. User: "Hong Kong 90s top 50."
2. Agent: `ListLibrary` → `WebSearch` → `PageUpdate` with the set.
3. User taps **Get**. The songs join `data/queue.json`; a detached worker
   (`fetch.py worker`, its own session) drains it two at a time, so closing the
   page stops nothing. Each row shows queued / getting / error (Retry) / ✕.
4. Per song: `pick-source.py` chooses the upload (album track first, then the
   length lyrics agree on), yt-dlp downloads it named by `naming.py`,
   `lyrics_match.py` fits a `.lrc` to the file, and the song lands as a
   library row. Progress rides the retained `tasks` topic.
5. The phone carries what the user puts on it (`AddToPhone`, a phone
   playlist, or `for_phone`); it pulls the files itself over WebRTC.

A song that sounds wrong: ⋯ → **Find another source** re-picks, skipping the
uploads already tried, and replaces the file under the same name.

## The phone

The paired Linggen Mobile app. `library.json`'s `phone.{files, playlists}` is
what it carries and how it is filed there — a second curation, not a copy.
Phone edits come up as ops, the view comes down whole, plays come up as
`track-played` ops. Design: `linggen-mobile/doc/dj.md`.

## Dependencies

Nothing pre-installed. `bin-setup.sh` fetches **yt-dlp** and a pinned,
SHA-256-verified **ffmpeg** (or uses Homebrew's) into `~/.linggen/bin` on
first download. Code is plain ES modules, bash and stdlib Python — no build
step, no packages. Services: YouTube (yt-dlp), LRCLIB (lyrics, no key).

## Files

- `library.json` — `{ tracks[], playlists[{name, files[]}], phone{files[],
  playlists[]} }`, the store. Hourly backups in `data/backups/` (last 10).
- `data/queue.json` — the download queue. `data/op-ids.json` — applied
  phone ops.
- `config.json` — `library_dir`, `bitrate`, `naming_template`, `loudnorm`,
  `karaoke_source`.
- Music in `~/Music/DJ`; karaoke renders in `~/Music/DJ/.karaoke`.

## Not yet

Editing a set's songs on the page before Get — the agent re-curates instead.
