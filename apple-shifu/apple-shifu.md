---
type: design
guide: |
  Apple Shifu — the Mac skill and the Linggen Mobile phone surface as one
  product. What to build.
---

# Apple Shifu

Status: the rename shipped 2026-07-28 (see "Rename"), the **phone's System tab
shipped 2026-07-29** (see "Phone System tab — built"), and the **Mac UI
reshape and the Mac's Files tab shipped 2026-07-30** (see the two "built"
sections). Still design only, both settled 2026-07-30: the **device readout**
the phone's System tab grows into, and the **agent layer** that reads it. The
phone's Files tab was cancelled the same day — see "Files tab".

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
- **Mac: three tabs — System / Media / Files. Phone: two — System / Media.**
- **Four verbs, same order, in every tab: scan → report → back up → clean.**
- **Honest by construction.** A category unreachable on this end is still
  shown — greyed, with the reason. Never hidden, never filled with a made-up
  number. Competing cleaners advertise system-junk figures iOS cannot produce;
  saying so plainly is the product's position.
- **No Files tab on the phone.** Cancelled 2026-07-30, both halves on their own
  terms. See "Files tab".
- **No video compression on the phone.** The category leads with re-encoding
  because it is their only way to free gigabytes without deleting a memory. We
  have the Mac: back up, then delete returns the whole file instead of half of
  it, and skips the new-asset penalty compression and Live Photo de-motion both
  carry.
- **Where we cannot clean, we measure and advise.** The phone's System tab
  becomes a full device readout and the agent explains it. See "Device readout"
  and "Ask Shifu".

## Categories

Same vocabulary on both ends. Each row: reachability, and the one cleanup
posture the category is allowed.

| Category | iPhone | Mac | Posture |
|---|---|---|---|
| Photos | PhotoKit | media pipeline | back up, then delete |
| Videos | PhotoKit | media pipeline | back up, then delete |
| Live Photo motion | unverified | yes | back up, then delete |
| Documents | **no** (sandbox) | full disk | back up, then delete |
| Downloads | **no** (sandbox) | `~/Downloads`, Trash | delete, backup optional |
| Applications | **no** (sandbox) | yes | report only / Mac deletes leftovers |
| Caches & logs | **not cleaned** (ours only, tens of MB) | full | delete, no backup |
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
- **CPU clock speed** — `hw.cpufrequency` returns 0 on Apple silicon. CPU-Z's
  headline number does not exist on iOS.
- **Per-app storage** — Settings › General › iPhone Storage ranks apps by size;
  no API exposes that ranking. Storage is one bar and nothing itemises it.
- **A folder's size before the grant** — iOS cannot stat a directory the user
  has not picked, so a granted-folder view can only say "point me at a folder",
  never "here is what we found".

This narrows, but does not reverse, the 2026-07-27 decision against an iOS
disk cleaner: the photo-library route was always the reachable half.

Checked against the market 2026-07-30. Every credible iOS cleaner —
CleanMy®Phone, Clever Cleaner, Cleanor, MobileClean — lives entirely inside the
photo library, and not one ships a folder-grant storage scanner. Cleanor
publishes a page explaining the sandbox and stating it will not pretend to
cross it, which is the position this doc already took. Two moves of theirs are
worth having and stay inside PhotoKit: a **heaviest** pile (assets by size,
descending — their answer to "find large files", scoped to where the gigabytes
actually are) and **swipe triage** month by month instead of a checkbox list.

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

### Device readout — settled 2026-07-30

The tab is also the device's spec sheet, at the coverage a CPU-Z clone gives:
uptime, CPU model and core counts, cache sizes, CPU load, RAM total and
breakdown, storage, battery, network addresses and throughput, GPU, display,
camera, sensors, Bluetooth. Each is a probe declaring **no `ScoreFacet`** —
readout only, no effect on the composite.

Every reading carries where it came from, and the panel shows it:

- **measured**, read from this device — uptime `kern.boottime`; load
  `host_processor_info`; core counts, byte order and L1/L2 cache sizes from
  sysctl; RAM `ProcessInfo.physicalMemory` plus `host_statistics64`; storage
  `disk_space_2`; battery level, charging, low-power mode; interface addresses
  and throughput from `getifaddrs` deltas; **GPU name verbatim from
  `MTLDevice.name`** ("Apple A17 Pro GPU"); Face ID and proximity as capability
  checks.
- **looked up**, true of this model but not read from this unit — camera sensor
  size and pixel pitch, display nits and panel type, body dimensions, Bluetooth
  and Wi-Fi generation, and the marketing name of the chip. "Apple A17 Pro" is
  a table lookup on `hw.machine`, not a register.
- **unreadable**, shown with the reason, as everywhere else.

The distinction is the point. Every app in this category prints a camera's
sensor size beside a live CPU figure as though it read both off the hardware.
AVFoundation will never report a sensor size. We say which is which.

**No bundled spec table.** The looked-up rows are fetched by the agent for the
one model it is running on and cached, so there is nothing to re-maintain every
September. Until it can look them up — web search is cloud and signed-in —
those rows are simply absent, which is the honest state.

System-wide free RAM via `host_statistics64` is readable and shown, but label
it carefully: on iOS "free" means almost nothing to a user, and a big number
there invites the wrong conclusion.

## Media tab

Already shipped on both ends. The `📱 iPhone | 💻 Mac` source switch started
here and moved to the header in the 2026-07-30 reshape.

Two piles worth adding, both inside PhotoKit: **heaviest** (assets by size,
descending — the honest answer to "find my large files" on a phone, since the
photo library is where the gigabytes are) and **swipe triage**, a month at a
time, instead of working a checkbox list.

## Files tab

**Mac only.** Shipped 2026-07-30 — `~/Downloads`, large files, duplicate files,
caches. See "Mac Files tab — built".

**The phone half was cancelled 2026-07-30**, and with it the phone → Mac file
archive: the `~/Documents/iPhone Files/` tree, the `data/files/archive.jsonl`
ledger, the two-direction restore, and the granted-folder picker flow. That
design is gone from this doc rather than left standing, because a design nobody
will build reads as a plan.

Both halves failed on their own terms. Linggen's own container holds the user's
music, ledger and conversation — clearing that is data loss, not cleaning — and
what is left after removing it is caches, tmp and the hash index, tens of
megabytes. And iOS cannot size a folder before the grant, so a granted-folder
view could only ever ask the user to point at a folder, never report what it
found. Nothing on the App Store ships one either. If it returns it needs a new
premise, not this design.

**Backing up to a Mac is never required to clean.** Still true, now scoped to
Media: a standalone user deletes freely, since PhotoKit sends assets to Recently
Deleted, a 30-day net on its own. The archive gate applies only to the explicit
*back up, then delete* flow, where nothing is removed until it verifies. Never a
paywall on core function, and never a Mac gate on it.

## Ask Shifu — the agent layer, settled 2026-07-30

The readout is the instrument; the agent is what makes it a shifu. It reports,
summarises and advises — battery health, why the score is what it is, whether
it is time to buy a new phone. No app in this category answers the last one.

**One button per end, sending a message to that end's resident agent.** Phone →
Yinyue, Mac → ling. The skill names no agent; it emits a question and the host
routes it. No second chat surface and no new session model — the reply lands in
the conversation the user already has, so the button is pure UI. It types the
question for you.

**The agent pulls the readout; the button does not push it.** A get-info tool
has to exist regardless, because the user can ask "how is my phone" in chat
without ever opening Shifu, and pushing would be a second path bolted on top of
it. On the phone this is `get_environment` growing up: same call, now backed by
the probe registry, so a probe added later is visible to the agent with no extra
wiring and nothing hand-assembled can drift from the panel. One call returns
everything; there is no tool per probe. The Mac needs the equivalent for ling.

**Provenance travels with the readings, and the agent is held to it.** It may
say what is typical of a two-year-old A17 Pro; it may not print that as *your*
battery health. A row that is unreadable stays unreadable in the answer, and a
looked-up value is never described as measured.

**The report is written, not spoken.** Neither end reads it aloud. Yinyue's
short-spoken-sentences rule exists because she talks, and a written report is
not that — so the exception rides on the button's prompt for that one turn
rather than a rewrite of her persona.

**Advice is the agent's job, not a table of thresholds.** A phone with Optimize
Storage already on has no photo problem and should not be told to clean photos.
Where we measured, it quotes the number; where we could not, it names the
Settings path and reasons about what the user reports back —
`openSettingsURLString` reaches only our own page, so those paths stay text.
This is the measure-and-advise half of the product, and the agent is what makes
it more than a list of tips.

Open: Yinyue runs `gpt-5.4-mini` for fast companion replies, which is likely too
light for a buyer's-guide turn with web search behind it.

## UI changes

1. **Source switch goes global.** Today `📱 | 💻` lives inside Media. Move it
   to the Apple Shifu header so every tab follows one selected device.
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

A fourth, found later the same day by running the panel with the cable
unplugged: **"not reported" and "nothing asked" are different claims.** With
no iPhone attached the rows read "Model — not reported", and the Device row
printed "iPhone" as though it were a reading. Rows that come off lockdown now
declare `cable: true` and go unreadable with "no iPhone on the cable" when
none is connected — one flag in the registry, no branch in the renderer.

Verified against the live daemon with a real iPhone attached (headless Chrome
over CDP): the verb order is fixed across both tabs and both sources, the Scan
menu still carries all five original rescans, tab and source survive a reload,
the old in-panel action buttons are gone rather than duplicated, and the
archive row and the badge agree.

## A Mac-side verb that needs the phone — settled 2026-07-30

The phone can only answer while it is awake. iOS suspends the app within
seconds of backgrounding, and a suspended process cannot run a probe —
`host_processor_info`, the sysctls and PhotoKit all need it executing. The peer
connection dies with it, and push notifications are deferred, so there is no
wake path. **Nothing on the Mac may promise a fresh reading from the phone on
demand.** Three kinds of verb follow from that:

- **Changes something on the phone → queue it.** Value does not decay:
  deleting forty photos tomorrow morning is as good as deleting them now. The
  Mac queues the request, badges the pending state, and the phone drains it on
  open. Photo deletion is the model — `request-delete` → `pendingDeletes` →
  amber ⏳ on the tile and the action bar → cleared by the status poll once the
  phone executes.
- **Reads something on the phone → no button at all.** A reading loses its
  value the moment the user looks away; a queued read lands hours later while
  nobody is at the Mac. The phone publishes its readout whenever it is alive
  anyway, and the Mac renders the last one with its age. Queuing the read
  would add a button, a pending badge and a round trip to produce exactly what
  the publish already produces.
- **Neither → hand off**, the way `backup` and `clean` already open the Media
  tab.

The verb is still never dropped from the row — it greys with its reason, per
the toolbar contract above.

**Scan under 📱 was the one mis-shaped verb.** `applySystemSource` already
probes over the cable on every switch into the phone source and on every
return to the System tab, so Scan re-ran the probe that had just drawn the
panel and rewrote the same values — nothing to see, which is exactly how it
reads. It greys with "readings come from the phone."

The probe itself is ~0.8 s warm but around twenty on the first read after the
daemon or the cable has been idle, and the panel only showed a loading state
when it had *no* prior reading — so a re-probe sat silent however long it
took. It now says it is reading, and concurrent callers share one device read
rather than stacking walks of the same device.

### How the phone's readout reaches the panel — built 2026-07-30

Device topics were a pure relay: `topic_publish` fanned out to whoever was
connected at that instant and nothing was kept. A skill page has no peer of its
own — its chat is an iframe to `/embed`, which owns the transport — so it could
publish and never subscribe, and there was nothing to poll.

So topics gained **retention**, in the engine, general to any surface: publish
with `retain: true` and the daemon keeps the last payload per topic and op
under `~/.linggen/topics/<topic>/<op>.json`, served from
`GET /api/topic/latest`. One value, overwritten, never a log — which is the
difference from the delete queue. A queue holds every item because each is work
to be done exactly once; a reading is worthless the moment a newer one exists.
The payload stays opaque to the daemon, as a live publish already was.

The phone publishes `shifu/readout` on connect (`ReadoutPublisher`, bound in
the shell rather than in the Shifu screen — the reading is for the Mac, and
waiting for the user to open that tab would mean it usually never arrives), and
again on a deliberate scan. Rate-limited to one sweep every two minutes so
reconnect flaps do not re-probe, which a deliberate scan overrides.

The Mac panel draws it in its **own section**, never blended into the cable
rows: one is what this Mac just read, the other is what the phone said earlier,
and a reader has to be able to tell which. The section is stamped with the age
of the reading and says plainly that the Mac cannot ask for a fresher one.
The phone's own score is shown there, which retires the "no score here" note —
the panel now says whose number it is rather than that there isn't one.

Which row wins when both ends have one: **the fresher**. A reading the Mac took
off the cable a second ago beats one the phone took an hour ago, so the phone's
copy stands down; a row the Mac could *not* read is the phone's to tell, so the
Mac's greyed version stands down instead. Either way the fact is printed once.

Defects found by running it, all the familiar shape:

- **Battery health printed twice** — the Mac lists it under Device and the
  phone also reports it, so standing down "the phone-only group" was not
  enough. Labels have to be matched too.
- **Three signs left pointing at readings printed below them** — matching
  labels alone was not enough *either*, because the phone calls those rows
  Temperature, Lock and Integrity where the sign says Thermal state, Passcode
  & biometrics and Device integrity. Both rules are needed, and it took a
  screenshot to see it: the assertions were all green.
- **`where_to_look` was never rendered.** The phone sends the Settings path with
  every row it cannot read, and dropping it left the panel saying only that
  nobody knows — worse than the placeholder it replaced.
- **The phone's readout carried no `scanned_at`.** The Mac's had one from the
  start, so "one schema, two hosts" was not true, and the age — the whole
  difference between a reading and a claim about now — could not be shown.
- **"it reaches 1 rows"** — the note counted what the cable answered this time
  and framed it as a capability.

## Mac Files tab — built 2026-07-30

The third tab, on the Mac end. `files.sh` + `files.js`, and deliberately
**venv-free**: unlike the Media pipeline it needs nothing but the shell, so
Files works on a fresh install before the Media tools are ever set up.

Four piles, sorted by reclaimable bytes: Downloads · Large files · Duplicates ·
Caches.

**Two removal postures, and the difference is the point.** Downloads, large
files and duplicates go to the macOS Trash — the user's own data, so removal
stays recoverable, and the space frees when the Trash is emptied. Caches are
**deleted outright**, because a cache sitting in the Trash frees nothing until
then, and calling it reclaimed at that moment would be false. Caches
regenerate, so nothing of the user's is lost. The confirm sheet names which
one is about to happen.

**The purge guard lives in `files.sh`, not the UI.** It refuses any path
outside a known cache root, and refuses `~/Library/Caches` itself — only the
per-app children under it. A caller cannot talk it into deleting something
else. Verified by handing it a `~/Documents` path alongside a cache: the cache
went, the document was refused and left intact.

Build outputs (`node_modules`, `target/`) are **not** in the cache roots. They
regenerate too, but expensively and per-project; the System tab already
reports them.

Two defects fixed on the way, both older than this tab:

- **Duplicate detection compared only the first 4 KB** of same-size
  candidates. Fine for a report, not fine for a list with a delete button —
  two different large files can share a size and a first block. Both the tab
  and the agent's deep scan now confirm with full SHA-256.
- **`SKILL.md`'s permission warning claimed the app "cannot modify files"**,
  which stopped being true when the Media tab started trashing photos in
  2026-07. It now describes what actually happens and who does it.

**One enumerator, two consumers.** `runDeepFileScan` no longer runs its own
Spotlight query — it calls the same `files.sh large` the tab does, so the
agent's figures and the tab's list cannot disagree about what is on the disk.

**Reclaimed bytes come from the sizes already on screen.** `trash` and `purge`
write the paths that actually went to `<list>.done`, and the pane sums its own
row sizes over that list. Measuring again with `du` would report blocks on
disk while the listing reports apparent size, and a sparse or compressed file
makes those two numbers disagree about the very same file.

**Unmeasured piles show `…`, not `0`.** A scan fills the piles one at a time;
a chip reading "0 Caches" before anything looked would claim the pile is
empty. The same rule already applied to Duplicates, which stay unhashed until
the chip is opened.

**Under 📱 the tab is honest about being empty**: every verb is blocked with
the reason, and the panel says phone files need the Files section in Linggen
Mobile, which isn't built — plus the standing fact that most iPhone documents
live in other apps' sandboxes where iOS grants no access at all.

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
- `file_picker` ^11.0.2 — adopted for the Files tab's `getDirectoryPath()`,
  which went with the tab, but **the package stays**. Checked 2026-07-30: one
  other call site, CFO's bank-statement import
  (`FilePicker.pickFiles`, CSV and PDF, `lib/screens/cfo/cfo_screen.dart:227`)
  — load-bearing, not a leftover. So the `device_info_plus` ^12 ceiling below
  stays with it; cancelling Files did not lift it.
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
- **Backup and restore** — to a paired Mac and back, hash-verified, 30-day
  trash with per-item restore.
- **Device report** — storage and fill trend, thermal, low-power mode,
  passcode and OS-version checks, health score with history, plus the full
  hardware readout (CPU, GPU, RAM, battery, network, display, camera) with
  every row marked measured or looked-up.
- **Ask Shifu** — the report handed to the on-device agent, which summarises
  it, explains the score, reasons about battery health, and answers whether
  it is time to upgrade.
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

**Files was not made a third section**, on the grounds that a tab existing to be
empty lies about what the app can do. That held: it was cancelled outright on
2026-07-30 (see "Files tab"). System and Media are the phone's two sections.

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
