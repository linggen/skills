---
type: design
guide: |
  Apple Shifu — the Mac skill and the Linggen Mobile phone surface as one
  product. What to build.
---

# Apple Shifu

Status: the rename shipped 2026-07-28 (see "Rename"), the **phone's System tab
shipped 2026-07-29** (see "Phone System tab — built"), and the **Mac UI
reshape shipped 2026-07-30** (see "Mac UI reshape — built"). The Mac's Files
tab and the phone's Files tab are still design only.

## Decisions

- **Mac Shifu → Apple Shifu.** One name across Mac and iPhone. Slug
  `apple-shifu`; `mac-shifu` stays as a compatibility slug.
- **The phone surface stays inside Linggen Mobile.** No separate App Store
  listing. Trade-off accepted: no standalone ASO entry for "photo cleaner"
  search traffic, in exchange for one account, one paywall, one codebase.
- **The product is Apple Shifu; the phone tab is just "Shifu."** On an iPhone
  the "Apple" half is redundant, and Apple's name on a prominent feature label
  inside a submitted binary is a review risk the Mac skill never carries. The
  Mac header, the doc and the site all still say Apple Shifu.
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
- OS version — shown; "behind latest" needs a source the device does not have,
  so no verdict is printed
- jailbreak — heuristic only, label it "suspected", never a verdict
- **photos not yet archived to the Mac** — the real data risk on a phone
- **sensitive photos in the roll** — IDs, bank cards, password screenshots.
  Waiting on the Mac's vision pass; not shipped, and not shown as a greyed row
  either (see "Phone System tab — built")

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

All three shipped 2026-07-30 — see below.

## Mac UI reshape — built 2026-07-30

The three changes above, on the Mac skill. `shifu-shell.js` owns the header
switch, the verb toolbar and the badge; a tab registers a provider and the
shell renders whatever comes back. Nothing in the shell knows what a tab does,
so a verb is added or retired in that tab's provider and nowhere else — the
same shape the phone's probe registry took.

**Back up means one thing under both sources**: archive the iPhone roll onto
this Mac. Time Machine was considered for the Mac source and rejected — the
verb changing meaning with the switch is worse than a Mac having no backup
verb of its own. On the System tab it hands off to Media rather than opening
the sheet itself, because the item list lives there; promising a count it
would not be the one to honour is the same defect as a stubbed field.

**A verb a tab cannot serve is greyed with the reason, never dropped.**
Position is the point. Blocked reasons name the missing precondition — check
some items, install the Media tools, re-index first.

**The System tab under 📱** shows what the Mac genuinely reads over lockdown —
device, model, iOS, capacity, free space, camera roll, battery level — and
greys the rest with "readable on the phone." Battery level came free: the
`com.apple.mobile.battery` domain answers `BatteryCurrentCapacity` and
`BatteryIsCharging`, absent keys stay absent.

Deliberately **no health score on that panel**. 7 of its 13 rows are readable
from a Mac, and a facet-dropout score off that slice would sit beside the
phone's own full score and disagree with it — two numbers, one subject. The
panel says where the score lives instead.

Three things the build corrected in itself, all the same defect — two surfaces
printing one fact:

- **The camera-roll figure now carries its provenance.** iOS 26 dropped
  `PhotoUsage` and leaves a residual `CameraUsage` that rounds to 0.0 GB, so
  the panel read "0 GB" for a roll it had not measured. It falls back to the
  last DCIM walk and labels the number "measured at the last USB sync";
  with neither source the row greys. "0 GB" and "could not measure" are not
  the same claim.
- **The archive row reads the badge at draw time**, never a value passed in.
  A lockdown probe takes seconds, and a figure captured before it painted a
  row saying "nothing synced" beside a badge saying "8 unarchived".
- **The Media toolbar's Back up hint names its pile.** It copies the checked
  subset while the badge always counts the whole roll; without saying so the
  two read as contradicting each other.

Verified against the live daemon with a real iPhone attached (headless Chrome
over CDP): the verb order is fixed across both tabs and both sources, the Scan
menu still carries all five original rescans, tab and source survive a reload,
the old in-panel action buttons are gone rather than duplicated, and the
archive row and the badge agree.

## iOS packages (pub.dev, surveyed 2026-07-28)

First tier — adopt:

- `device_info_plus` — **^12.4.0, not ^13.2.0**, and an override does not fix
  it. 13.0.0 moved to win32 ^6 while `file_picker`'s latest (11.0.2) still pins
  win32 ^5.9.0. `dependency_overrides` looked free because the app has no
  `windows/` directory — but file_picker *exports its Windows implementation
  unconditionally*, so that file is compiled into an iOS build too, and win32 6
  breaks it outright (`COMObject`, `FOS_*`, `TEXT`, `HRESULT` all changed).
  Tried and reverted 2026-07-29. 12.4.0 has every field we read —
  `physicalRamSize`, `availableRamSize`, `modelName`, `systemVersion`,
  `isPhysicalDevice` — plus the 2026 iPhone identifiers, so nothing is lost.
  `package_info_plus` is held at ^8 for the same reason. Revisit when
  file_picker ships a win32 6 release.
- `battery_plus` ^7.1.1 — level, state stream, `isInBatterySaveMode` (iOS
  low-power mode).
- `local_auth` ^3.0.2 — biometrics; `isDeviceSupported()` for passcode-set.
- `file_picker` ^11.0.2 — `getDirectoryPath()` for the Files tab.
- `photo_manager` ^3.11.0 (already in use), `permission_handler`,
  `connectivity_plus`, `network_info_plus`.

**Not `app_settings`.** It was going to carry the deep links for everything we
can only point at, but on iOS its plugin always opens
`UIApplication.openSettingsURLString` — the app's *own* Settings page — for
every `AppSettingsType`. It cannot jump to Settings › Battery. A button using
it would promise a destination it never reaches, so the panel prints the path
as text instead, and `PhotoManager.openSetting()` still covers the one case
that genuinely works.

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
  `jailbreak`, `cydiaFound`, `fridaFound` and `tampered`. **Ignore `proxied`,
  `debugged` and `devMode`** — a VPN or a debugging proxy, a dev build and
  iOS 16+ Developer Mode are all normal states, and treating them as
  compromise is where this category earns its false-positive reputation. Never
  a verdict; always "suspected".

  `notRealDevice` needed one correction, found by running it: it is not an
  issue to ignore alongside the others, it **disqualifies the whole check**.
  The first simulator run reported `cydiaFound` and rendered "Tampering
  suspected" — the path checks were reading the host Mac's filesystem. So when
  `notRealDevice` is present the row goes unreadable with that reason rather
  than reporting a finding. A real phone never sets it.
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

## Phone System tab — built 2026-07-29

Shipped in `linggen-mobile`. The old Photos destination is now **Shifu**, with
System and Media as its two sections; Media's own views (All / To back up /
Duplicates / Videos / Mac asks) moved one level down into a chip row at the top
of the Media panel. Photos declares into Shifu's stand-in handle instead of the
shell's and is otherwise untouched — it does not know it stopped being a
destination.

**Files is not a third section yet.** A tab that exists to be empty lies about
what the app can do, so it lands with its own work.

Everything on the panel comes from a `Probe` in one registry
(`screens/shifu/system/`). A probe declares which group its rows appear in and,
optionally, which `ScoreFacet` they score; the panel renders whatever comes
back and the score sums whatever declared a facet. There is no switch anywhere
that knows the name of a row — adding a line means adding a probe and nothing
else.

The composite is the Mac's rule generalised. Facets are space 40 / security 25
/ tidiness 25 / device 10, and **a facet nothing readable landed in drops out
of the denominator**, with the card saying so out loud ("Scored on the 75% this
device could answer for"). Battery health and an unpaired Mac both fall out
that way with no special case for either. Verified live: the iPad run scored 31
on three facets while the roll was still loading, and the Library facet was
absent rather than zero.

Two things the build corrected in itself:

- **The battery probe degrades per row, not per probe.** A simulator has no
  battery, and the whole-probe guard was taking Low Power Mode and the
  battery-health row down with the charge reading. Each row is read on its own
  now.
- **`notRealDevice` disqualifies the integrity check** rather than being
  ignored — see the jailbreak note above.

Left out deliberately: **"sensitive photos in the roll"** (IDs, bank cards,
password screenshots). Nothing on the phone can classify them today — it needs
the Mac's vision pass — and a row saying "not built yet" is clutter, not
honesty. Honesty is for categories that are genuinely out of reach, like
battery health. This one is out of *scope*, and it comes back when there is a
classifier behind it. Same reasoning for "OS version behind latest": the
version is shown, the verdict is not, because nothing on the device knows what
the latest version is.

Covered by tests: the dropout rule and the ramps
(`shifu_health_score_test.dart`), the honesty path under a plugin-less
environment (`shifu_system_panel_test.dart`), and every integrity rule
including the simulator one (`shifu_integrity_test.dart`).

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
