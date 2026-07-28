---
type: design
guide: |
  Apple Shifu — the Mac skill and the Linggen Mobile phone surface as one
  product. What to build.
---

# Apple Shifu

Status: design, 2026-07-28. The rename has shipped (see "Rename" below);
nothing else here is built yet.

## Decisions

- **Mac Shifu → Apple Shifu.** One name across Mac and iPhone. Slug
  `apple-shifu`; `mac-shifu` stays as a compatibility slug.
- **The phone surface stays inside Linggen Mobile.** No separate App Store
  listing. Trade-off accepted: no standalone ASO entry for "photo cleaner"
  search traffic, in exchange for one account, one paywall, one codebase.
- **Three tabs on both ends: System / Media / Files.**
- **Four verbs, same order, in every tab: scan → report → back up → clean.**
- **Honest by construction.** A category unreachable on this end is still
  shown — greyed, with the reason. Never hidden, never filled with a made-up
  number. Competing cleaners advertise system-junk figures iOS cannot produce;
  saying so plainly is the product's position.

## Categories

Same vocabulary on both ends. Each row: reachability, and the one cleanup
posture the category is allowed.

| Category | iPhone | Mac | Posture |
|---|---|---|---|
| Photos | PhotoKit | media pipeline | back up, then delete |
| Videos | PhotoKit | media pipeline | back up, then delete |
| Live Photo motion | unverified | yes | back up, then delete |
| Documents | user-granted folder | full disk | back up, then delete |
| Downloads | user-granted folder | `~/Downloads`, Trash | delete, backup optional |
| Applications | **no** (sandbox) | yes | report only / Mac deletes leftovers |
| Caches & logs | **only Linggen's own** | full | delete, no backup |
| Capacity readouts | yes | yes | report only |

Photo sub-piles: duplicate groups, bursts, screenshots, receipts and document
shots, blurry rejects, memes, RAW+JPEG pairs. Video sub-piles: oversized,
screen recordings, slow-mo originals, repeated clips.

Result lists sort by **reclaimable bytes, not item count** — 1,200 screenshots
may be 800 MB while 12 clips are 20 GB.

## Unreachable on iOS — do not re-propose

Absent APIs, not permissions:

- Other apps' storage, caches, and attachments (WeChat/WhatsApp included).
- System junk, "deep clean", process/CPU/memory rankings, launch agents.
- Gatekeeper / SIP / firewall / FileVault — absent or unreadable.
- Battery health (maximum capacity %) — no public API; deep-link to Settings.
- **Recently Deleted album contents** — Apple confirms no PhotoKit access.
  What we do instead: after a delete, report "N GB is still held in Recently
  Deleted" and deep-link to Photos.

This narrows, but does not reverse, the 2026-07-27 decision against an iOS
disk cleaner: the photo-library route was always the reachable half.

## System tab

Mac keeps its four scan lines (disk, security, performance, battery). The
phone fills what it can read and greys the rest.

Performance, iPhone:
- thermal state, low-power mode, battery level and charging state
- total / available RAM, app footprint, uptime
- network constrained / expensive
- **space fill trend** — daily free-space samples → "full in N days". Same
  shape as the Mac's disk fill rate; the most useful number on the panel.

Security, iPhone:
- passcode or biometric set
- OS version behind latest
- jailbreak — heuristic only, label it "suspected", never a verdict
- **photos not yet archived to the Mac** — the real data risk on a phone
- **sensitive photos in the roll** — IDs, bank cards, password screenshots

Health score — the existing Mac Shifu 0–100 composite (`health-score.js`;
today disk 30 / memory 15 / battery 15 / security 20 / garbage 10 /
freshness 10). Both ends share one function; a component that cannot be read
on this device gets **weight 0 and drops out of the denominator**, which is
already how a desktop Mac handles battery. iPhone battery health falls out by
that same rule, no special case.

**Pairing is never scored.** Whether a Mac is connected says nothing about
the health of this device, and scoring it would leave every standalone user
permanently short of 100. Phone weights:

- free space 40%
- security baseline 25%
- library tidiness 25% (duplicate + screenshot share)
- device state 10% (thermal, low-power mode)

## Media tab

Already shipped on both ends. Keeps the `📱 iPhone | 💻 Mac` source switch,
which becomes the model for Files.

## Files tab

New, both ends, same shape as Media.

- iPhone: user-granted directories (On My iPhone, Downloads, iCloud Drive
  local) plus Linggen's own container — DJ audio, karaoke video, thumbnail
  cache, CFO store.
- Mac: `~/Downloads`, large files, duplicate files, caches.
- Phone → Mac archiving reuses the media `manifest → ingest → verify`
  pipeline unchanged; only the content type widens from assets to files.
  Verification semantics stay identical: SHA-256 and an archive ledger.

**Backing up to a Mac is never required to clean.** A standalone user deletes
freely — PhotoKit sends assets to Recently Deleted, which is a 30-day net on
its own, and our own trash covers files. The archive gate applies only to the
explicit *back up, then delete* flow: there, nothing is removed until it
verifies. Never a paywall on core function, and never a Mac gate on it.

On iPhone the Files tab is often nearly empty, because most documents live
inside other apps' sandboxes where iOS grants no access. Say that in the
empty state rather than showing a blank panel that reads as broken.

### Where phone files land on the Mac

Their own tree, separate from the media archive. Files carry a meaningful
path and photos do not; merging the two would mean inventing a fake path for
every photo or a fake date for every file.

- Default root `~/Documents/iPhone Files/`, mirroring
  `~/Pictures/iPhone Backup/`. Destination is configurable through the same
  native folder picker and remembered default the Media tab already uses.
- Layout `<root>/<device>/<granted-folder>/<original relative path>` — the
  phone-side path is preserved, because restore has somewhere real to put the
  file back. (Photos file by capture year/month instead; that stays.)
- Same SHA-256 + path is a no-op, so re-running is idempotent. Same path with
  different content keeps both, the later one suffixed with a short hash.
- Ledger `data/files/archive.jsonl`, same schema as the media archive plus
  `device` and `rel_path`.

Restore, two directions:

- **To the Mac** — `~/Documents/iPhone Files Restored/`, whole tree or single
  file, mirroring `~/Pictures/iPhone Restored`.
- **To the phone** — written back to its original relative path, but only
  inside a directory the user has granted. Anything outside a granted
  directory can be restored to the Mac only; say so in the UI rather than
  failing at write time.

Deleted files go to `data/files/trash/` with the media tab's 30-day expiry
and per-item restore, so accident recovery works the same way on both tabs.

Directory access on iOS: `getDirectoryPath()`, then persist a bookmark. The
user points at a folder once; no full-disk scan exists on iOS. Note iOS 18
removed the system picker's own long-press delete — the delete UI is ours.

## UI changes

1. **Source switch goes global.** Today `📱 | 💻` lives inside Media. Move it
   to the Apple Shifu header so all three tabs follow one selected device.
2. **The four verbs become a fixed toolbar** at the top of every tab:
   `↻ Scan · 📊 Report · ☁️ Back up · 🧹 Clean`. Same position, same order,
   contents differ per tab.
3. **Backup state becomes a persistent global badge** ("1,204 items unarchived
   · 8.2 GB"), not a per-tab detail — "no delete before backup" is a
   product-wide floor.

## iOS packages (pub.dev, surveyed 2026-07-28)

First tier — adopt:

- `device_info_plus` ^13.2.0 — covers most of the System tab alone:
  `physicalRamSize`, `availableRamSize`, `freeDiskSize`, `totalDiskSize`,
  `modelName`, `systemVersion`, `isPhysicalDevice`, `identifierForVendor`.
- `battery_plus` ^7.1.1 — level, state stream, `isInBatterySaveMode` (iOS
  low-power mode).
- `local_auth` ^3.0.2 — biometrics; `isDeviceSupported()` for passcode-set.
- `file_picker` ^11.0.2 — `getDirectoryPath()` for the Files tab.
- `app_settings` ^8.0.3 — deep links to Settings and Photos for everything we
  can only point at.
- `photo_manager` ^3.11.0 (already in use), `permission_handler`,
  `package_info_plus`, `connectivity_plus`, `network_info_plus`.

Second tier — settled by reading the plugin sources:

- **Disk space: use `disk_space_2` ^1.0.13 for the number we display, not
  `device_info_plus`.** They do not measure the same thing.
  `device_info_plus` reads `NSFileSystemFreeSize` — raw free bytes —
  while `disk_space_2` reads
  `URLResourceKey.volumeAvailableCapacityForImportantUsageKey`, which counts
  purgeable space and is what iOS Settings shows the user. Reporting the raw
  figure means our "free space" disagrees with Settings by gigabytes, and on
  a cleaner that reads as a bug.
- **Thermal: `thermal` ^1.2.2 is real on iOS.** `SwiftThermalPlugin.swift`
  reads `ProcessInfo.processInfo.thermalState` and observes
  `thermalStateDidChangeNotification`; states map nominal→0, fair→1,
  serious→3, critical→4 (2 is unused — index by name, not position). Battery
  temperature is Android-only, so don't promise a temperature reading.
- **Jailbreak: `jailbreak_root_detection` ^1.2.0**, because it returns a list
  of `JailbreakIssue` values rather than one boolean. Surface only
  `jailbreak`, `cydiaFound`, `fridaFound` and `tampered`. **Ignore
  `proxied`, `debugged`, `devMode` and `notRealDevice`** — a VPN or a
  debugging proxy, a dev build, iOS 16+ Developer Mode and the simulator are
  all normal states, and treating them as compromise is where this category
  earns its false-positive reputation. Never a verdict; always "suspected".
- **Not** `flutter_jailbreak_detection` — popular but unmaintained since
  2023-01. `system_info2` is high-traffic but has no iOS support.

## App Store listing

Decided 2026-07-28: keywords go in at submission. Store name stays
**Linggen**; the subtitle and keyword field carry the search terms, since
nobody searches the brand. Primary category **Utilities** (where cleaners
live), secondary Productivity.

Draft subtitle (30 chars max):

```
Photo & File Cleaner + Backup
```

Draft keyword field (100 chars, comma-separated, no spaces after commas,
singular forms, never repeat a word already in the name or subtitle):

```
duplicate,storage,space,cleanup,screenshot,gallery,sync,mac,downloads,music,karaoke,budget
```

Everything the app does, for the description and for mining more terms:

- **Photos** — duplicate groups, bursts, screenshots, receipts and document
  shots, blurry rejects, memes, RAW+JPEG pairs; batch delete via PhotoKit.
- **Videos** — oversized, screen recordings, slow-mo originals, repeats.
- **Live Photo** — motion component (pending verification).
- **Files** — granted folders, downloads, large files, Linggen's own data.
- **Backup and restore** — to a paired Mac and back, hash-verified, 30-day
  trash with per-item restore.
- **Device report** — storage and fill trend, thermal, low-power mode,
  passcode and OS-version checks, health score with history.
- **DJ** — background music player, lock-screen and Control Center controls,
  offline library, synced lyrics, karaoke; library sync from the Mac.
- **CFO** — bank export import via the share sheet, categories, budgets,
  reports, trends, import history with undo; local-first, no cloud account.
- **Yinyue** — on-phone agent chat with photo, player and note tools; the
  Mac's `ling` session when paired.
- **Games** — Chinese Chess, Gomoku, Snake, Pong, Tetris.
- **Pairing** — QR, Bonjour on the LAN, relay from anywhere; linggen.dev
  sign-in.
- Later: Apple Watch companion, CarPlay for DJ.

### Money

Decided 2026-07-28: **purchases stay on linggen.dev via Stripe.** No IAP.
Zero Apple commission, one subscription across Mac, web and phone.

What that forces, and it is not a detail:

- Outside the US storefront the app must not advertise the external purchase
  at all. The app shows **Sign in**, never "subscribe on our site". The US
  storefront may link out, commission-free.
- The listing cannot say where to buy either.
- So a cold download never enters a purchase funnel inside the app. Every
  in-app conversion benchmark — trial-to-paid, paywall view-to-payment —
  simply does not apply here.

Which fixes what this surface is for: **the free cleanup is acquisition and
retention, not the thing being sold.** Cleaning photos, videos and files
works fully free and fully standalone, with no Mac and no account. Revenue
happens later, on the Linggen suite subscription, when someone wants the Mac
side. Plan the funnel that way — a phone-side paywall would earn nothing and
break the "never a paywall on core function" promise at the same time.

## Verified 2026-07-28

Three of the four are settled from the plugin sources and recorded above:
which free-space figure to show, that `thermalState` is genuinely readable on
iOS, and a concrete jailbreak rule instead of a hoped-for false-positive rate.

**Live Photo de-motion** is viable, with caveats worth knowing before it is
promised in the UI. `AssetEntity.isLivePhoto` identifies them (PhotoKit
subtype bit), `originBytes` gives the still, and
`PhotoManager.editor.saveImage` accepts `creationDate`, `latitude`,
`longitude`, `orientation` and `title`, so the capture date and place
survive. What does not survive: the result is a **new** asset, so album
membership, favourite flag and edit history are lost, and its date-added is
now. And the original goes to Recently Deleted — **the space is not
reclaimed for 30 days**, which the UI has to say plainly, since "free 4 GB"
that changes nothing today is exactly the dishonesty this product is
positioned against.

Still needs a device, not a source read:

- Bytes actually saved per Live Photo on a real roll.
- Whether re-saving `originBytes` is byte-identical or silently transcodes.
- `thermalState` while backgrounded — readable whenever our code runs, but
  the notification only fires in-process; irrelevant for a foreground scan,
  worth knowing before any background job depends on it.

## Rename — done 2026-07-28

Five trees swept: `skills/` (a166ddb), `linggen-app/` (939719d), engine
(83d34e1, 4dab8de), `linggensite/` (10b0be0), and the local `~/.linggen/`
install.

What the 2026-07-16 `sys-doctor → mac-shifu` sweep got wrong, fixed at the
root this time rather than by hand:

- **Renames are declarative now.** A skill lists `renamed-from:` in its
  frontmatter and the engine migrates whichever old slug is on disk, before
  load, so no stale copy registers as a second skill. The engine names no
  app. `apple-shifu` declares `[mac-shifu, sys-doctor]`.
- **Migration rewrites absolute paths.** `removals.jsonl` held 193 paths into
  the old directory; a move alone leaves restore and purge dangling.
  `rewrite_slug_paths` fixes the text state files and skips binaries.
- **Browser state carries too** — `api.js` migrates the `mac-shifu:*`
  localStorage keys, so score history survives.

Verified on the live install: 1,962 removal rows and 2,972 archive rows
intact, all 193 rewritten trash paths resolve on disk, 2,729 thumbnails and
the venv unharmed, 924 MB moved, and `media.sh info` answers from the new
location.

Both older ids stay accepted where an unmigrated install can still be seen:
the billing product matcher, the telemetry install-source probe, the
launcher's display-name maps, and the site's `AppId` / `Product` /
`KNOWN_APPS` / `VALID_PRODUCTS` lists and Stripe price map.
`install-mac-shifu.sh` and `install-sys-doctor.sh` remain working aliases.

Still stale: **Linggen.app bundles the old skill folder** in
`Contents/Resources/app-resources/skills/mac-shifu`, so launching the app
re-creates an empty `~/.linggen/skills/mac-shifu`. Harmless — it carries no
data and the next daemon start deletes it again — but it clears for good on
the app's next build from the bumped vendor.
