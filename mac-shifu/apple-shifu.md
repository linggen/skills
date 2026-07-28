---
type: design
guide: |
  Apple Shifu — the Mac Shifu skill and the Linggen Mobile phone surface as one
  product. What to build. Not scheduled, not started.
---

# Apple Shifu

Status: design, 2026-07-28. Nothing implemented; the rename has not run.

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

Health score, phone weights (the Mac's disk-30/battery-15 does not transfer —
battery health is unreadable and space is the phone's actual pain):

- free space 40%
- backup coverage 25%
- security baseline 20%
- library tidiness 15% (duplicate + screenshot share)

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
  Verification semantics stay identical: SHA-256, archive ledger, and
  **nothing is deletable until it verifies**.

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

Second tier — pick or hand-roll:

- Disk space: `disk_space_2` ^1.0.13 exists, but `device_info_plus` already
  reports free/total. If used, confirm which iOS figure it reads
  (importantUsage / opportunistic / raw) — they differ by gigabytes.
- Thermal: `thermal` ^1.2.2 claims iOS but its docs never map
  `ProcessInfo.thermalState`. Read the source; if unconfirmed, hand-roll —
  it is a public API and about twenty lines.
- Jailbreak: `flutter_rasp` ^7.1.0, `jailbreak_root_detection` ^1.2.0, or
  `device_safety_info` ^1.2.0. **Not** `flutter_jailbreak_detection` —
  popular but unmaintained since 2023-01.
- `system_info2` is high-traffic but has no iOS support.

## To verify before promising

- Live Photo "de-motion" (export still, delete original) — space saved and
  metadata preserved.
- Jailbreak heuristics' false-positive rate.
- `thermalState` availability in the background.
- Which free-space figure to show, and that it matches Settings.

## Open

- **Where phone files land on the Mac** — merged into the media archive tree
  (by device/date) or a separate `files/` tree. Decides the manifest schema
  and the Mac-side Files browser.

## Rename checklist

From the 2026-07-16 `sys-doctor → mac-shifu` sweep, which the first pass got
wrong:

- Five trees: `skills/`, `linggen-app/`, engine, `linggensite/`, and local
  `~/.linggen/`.
- Engine Launcher hard-codes skill names (`LauncherApp`, `LauncherSettings`,
  `PREFERRED_ORDER`, `HAS_SETTINGS`).
- Billing and telemetry must accept old and new ids together.
- **User data files carry absolute paths** — `removals.jsonl` held 193 paths
  into the old directory; restore/purge breaks without a rewrite.
- Grep case variants, not just the folder name.
- Keep `install-mac-shifu.sh` as an alias.
