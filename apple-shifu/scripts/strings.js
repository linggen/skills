// strings.js — Shifu's words, in the one language the person set (Settings →
// Language). CFO's shape, plus one thing a page this size needs: the page's
// English is the key. Its renderers write English as they always have, and
// translateDom() puts each text node, title and placeholder that matches a
// table entry into the person's language as it lands (a {slot} matches any
// run of text). Readings a model reads stay English at the source; the chat
// panel and anything marked data-no-i18n are never touched.

export const SUPPORTED = ['en', 'zh-Hans'];
let LANG = 'en';

/// "zh", "zh-CN", "zh-Hans-CN", "zh-TW"… → "zh-Hans"; anything else → "en".
/// Traditional Chinese folds into zh-Hans until it has its own table.
export function normalizeLanguage(tag) {
  const s = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
  if (!s) return 'en';
  if (s === 'zh' || s.startsWith('zh-')) return 'zh-Hans';
  return 'en';
}

export const language = () => LANG;
export function setLanguage(tag) {
  LANG = normalizeLanguage(tag);
  if (typeof document !== 'undefined') document.documentElement.lang = LANG;
  return LANG;
}

/// The Intl locale for dates and numbers in the active language.
export const intlLocale = () => (LANG === 'zh-Hans' ? 'zh-CN' : 'en-US');

/// Read the setting once: the engine's effective value, else the browser's.
export async function loadLanguage() {
  // ?lang=en|zh-Hans wins — a check can see either language without
  // touching the person's setting.
  let tag = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') || '' : '';
  if (tag) return setLanguage(tag);
  try {
    const res = await fetch('/api/user/language', { cache: 'no-store' });
    if (res.ok) tag = (await res.json())?.language || '';
  } catch { /* engine without the endpoint yet — fall back */ }
  if (!tag && typeof navigator !== 'undefined') tag = navigator.language || '';
  return setLanguage(tag);
}

const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));

function render(v, p) {
  if (typeof v === 'function') return v(p || {});
  if (v && typeof v === 'object') return fill(p && p.n === 1 ? v.one : v.other, p);
  return fill(v, p);
}

export function t(key, params) {
  const table = TABLES[LANG] || TABLES.en;
  const v = key in table ? table[key] : TABLES.en[key];
  if (v === undefined) return key;
  return render(v, params);
}

export const has = (key) => key in TABLES.en;
/// A built-in category in the active language; a category the person or Ling
/// made up stays exactly as written (it is their vocabulary, stored content).
export const catLabel = (c) => (c && has(`cat.${c}`) ? t(`cat.${c}`) : c);

/// Static chrome in the HTML: data-i18n (text), data-i18n-title,
/// data-i18n-placeholder, data-i18n-html (trusted markup from this table).
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

// ── Tables ────────────────────────────────────────────────────────────────

const en = {
  "sh.appleShifu": "Apple Shifu",
  "sh.system": "🩺 System",
  "sh.media": "📷 Media",
  "sh.files": "📁 Files",
  "sh.settings": "Settings",
  "sh.overview": "Overview",
  "sh.details": "Details",
  "sh.connectYourIphoneBy": "Connect your iPhone by USB — manage photos and videos on both Mac and iPhone",
  "sh.downloadsLargeFilesDuplicates": "Downloads, large files, duplicates and caches on this Mac",
  "sh.scan": "Scan",
  "sh.report": "Report",
  "sh.backUp": "Back up",
  "sh.clean": "Clean",
  "sh.thisMac": "This Mac",
  "sh.notAvailableForThis": "Not available for this device",
  "sh.linggenOpen": "Linggen open",
  "sh.lastConnectedHere": "last connected here",
  "sh.whicheverPhoneIsHere": "Whichever phone is here",
  "sh.noPhonePaired": "No phone paired",
  "sh.pairOneInSettings": "Pair one in Settings → Phone",
  "sh.notAvailableOnThis": "Not available on this tab",
  "sh.labelClickAgainTo": "{label} — click again to pick another phone",
  "sh.everythingArchived": "☁️ everything archived",
  "sh.everyItemOnThe": "Every item on the iPhone has a hash-verified copy on this Mac.",
  "sh.iphoneItemsWithNo": "iPhone items with no verified copy on this Mac yet.",
  "sh.notAvailableHere": "Not available here",
  "sh.filesIsThisMac": "Files is this Mac — iOS shows no app another app’s files",
  "sh.reRunASystem": "Re-run a system check",
  "sh.fullRescan": "↻ Full rescan",
  "sh.largeFiles": "📦 Large files",
  "sh.walksTheFilesystem": "walks the filesystem",
  "sh.findLargeFilesAnd": "Find large files and label them",
  "sh.writeUpWhatThe": "Write up what the last scan found",
  "sh.writtenReport": "📊 Written report",
  "sh.whatCanBeCleared": "What can be cleared, and whether it is safe — opens the Files tab",
  "sh.readingsComeFromThe": "Readings come from the phone — open Shifu in Linggen Mobile",
  "sh.writeUpWhatThis": "Write up what this Mac can see of the iPhone",
  "sh.iphoneCleanupIsPhotos": "iPhone cleanup is photos and videos — opens the Media tab",
  "sh.nothingSyncedFromAn": "Nothing synced from an iPhone yet — sync in the Media tab first",
  "sh.everyIphoneItemAlready": "Every iPhone item already has a verified copy on this Mac",
  "sh.aScanIsRunning": "A scan is running",
  "sh.askMeAnything": "Ask me anything...",
  "sh.scanFullRescanChecks": "↻ Scan → Full rescan checks disk, battery, security and performance.",
  "sh.systemInfo": "System info",
  "sh.diskUsage": "Disk usage",
  "sh.security": "Security",
  "sh.performance": "Performance",
  "sh.checkingYourSystem": "Checking your system...",
  "sh.justNow": "just now",
  "sh.weeklyCheckOnMondays": "Weekly check on — Mondays at 10:00.",
  "sh.weeklyCheckOff": "Weekly check off.",
  "sh.couldnTReachLinggen": "Couldn't reach Linggen — the weekly check is unchanged.",
  "sh.measuringTheDisk": "Measuring the disk…",
  "sh.checkingSecurity": "Checking security…",
  "sh.readingProcesses": "Reading processes…",
  "sh.aScanIsAlready": "A scan is already running.",
  "sh.deepScanningYourFiles": "Deep scanning your files...",
  "sh.indexingFiles": "Indexing files",
  "sh.findingLargeFiles": "Finding large files",
  "sh.checkingDuplicates": "Checking duplicates",
  "sh.aiAnalysis": "AI analysis",
  "sh.indexingFilesN": "Indexing files ({n})",
  "sh.foundNLargeFiles": "Found {n} large files...",
  "sh.nLargeFilesFound": "{n} large files found",
  "sh.largeFilesFound": "Large files found",
  "sh.nDuplicateSets": "{n} duplicate sets",
  "sh.sendingToAiFor": "Sending to AI for analysis...",
  "sh.clearable": "Clearable",
  "sh.downloads": "Downloads",
  "sh.largeFiles2": "Large files",
  "sh.duplicates": "Duplicates",
  "sh.findWhatCanBe": "Find what can be cleared, and re-read Downloads and large files",
  "sh.askLingWhatIs": "Ask Ling what is safe to clear",
  "sh.runAScanFirst": "Run a scan first — there is nothing to report on yet",
  "sh.backUpArchivesThe": "Back up archives the iPhone roll — Mac files are not archived, they go to the Trash",
  "sh.trash": "Trash",
  "sh.checkItemsToRemove": "Check items to remove them",
  "sh.askLingToWalk": "Ask Ling to walk through what is safe to clear",
  "sh.backUpArchivesThe2": "Back up archives the iPhone roll — Mac files are not archived",
  "sh.clear": "Clear",
  "sh.checkItemsToClear": "Check items to clear them",
  "sh.waitForTheScan": "Wait for the scan to finish",
  "sh.readingDownloads": "Reading Downloads…",
  "sh.findingLargeFiles2": "Finding large files…",
  "sh.syncedTrashingItDeletes": "Synced. Trashing it deletes it from your cloud drive on every device.",
  "sh.pythonEnvironmentRemovingIt": "Python environment. Removing it breaks that environment.",
  "sh.likelyTheOriginalKeep": "Likely the original. Keep at least one copy.",
  "sh.anIdenticalCopyStays": "An identical copy stays on this Mac.",
  "sh.yourFileItGoes": "Your file. It goes to the Trash, recoverable until you empty it.",
  "sh.moveToTrash": "Move to Trash",
  "sh.moveNToTrash": "Move {n} to Trash",
  "sh.movingToTrash": "Moving to Trash",
  "sh.clearing": "Clearing",
  "sh.clearableNotScannedClearing": "Clearable not scanned · clearing…",
  "sh.nDeletedOutrightThey": "{n} deleted outright — they regenerate",
  "sh.nMovedToThe": "{n} moved to the Trash — recoverable until you empty it",
  "sh.nCouldNotBe": "{n} could not be cleared",
  "sh.nAlreadyGone": "{n} already gone",
  "sh.eachRowClearsIts": "each row clears its own way: caches and build output deleted, your data to the Trash",
  "sh.checkedItemsGoTo": "checked items go to the macOS Trash — the space frees when you empty it",
  "sh.lookingForWhatCan": "Looking for what can be cleared…",
  "sh.nothingClearableFoundHit": "Nothing clearable found. Hit ↻ Scan to look again.",
  "sh.noDuplicatesAmongThe": "No duplicates among the files scanned — every same-size pair differed once hashed in full.",
  "sh.duplicatesAreCheckedOnce": "Duplicates are checked once the current job finishes — pick Duplicates again then.",
  "sh.biggestFirstSelectAll": "biggest first · Select all takes SAFE rows only",
  "sh.oldestCopyOfEach": "oldest copy of each group is left unchecked — it is the likely original",
  "sh.couldNotReachThe": "Could not reach the clipboard",
  "sh.deletedOutright": "deleted outright",
  "sh.toTheTrash": "to the Trash",
  "sh.byItsOwnTool": "by its own tool",
  "sh.showInFinder": "Show in Finder",
  "sh.copyCommand": "Copy command",
  "sh.dismiss": "Dismiss",
  "sh.dropLingSFind": "drop Ling’s find",
  "sh.mappingTheRestOf": "Mapping the rest of the disk for Ling…",
  "sh.findingFoldersByWhat": "Finding folders by what they are…",
  "sh.mMinAgo": "{m} min ago",
  "sh.foundByShifu": "Found by Shifu",
  "sh.newestFile": "newest file",
  "sh.notRebuiltGoesTo": "not rebuilt — goes to the Trash, recoverable",
  "sh.daysDaysAgo": "{days} days ago",
  "sh.notInTheCatalog": "Not in the catalog.",
  "sh.aProcessIsRunning": "a process is running from this project",
  "sh.notMeasuredTooBig": "not measured — too big to size in time",
  "sh.notMeasuredMacosWould": "not measured — macOS would not let Shifu read it",
  "sh.notMeasuredTheScan": "not measured — the scan ran out of time",
  "sh.notMeasured": "not measured",
  "sh.nothingClearableFoundYet": "Nothing clearable found yet.",
  "sh.aboutSafeCanBe": "About {safe} can be cleared safely, {review} more to review.",
  "sh.stillRunning": "still running",
  "sh.allMedia": "All media",
  "sh.notBackedUp": "Not backed up",
  "sh.onMac": "💾 On Mac",
  "sh.blurry": "Blurry",
  "sh.screenshots": "Screenshots",
  "sh.largeVideos": "Large videos",
  "sh.installTheMediaTools": "Install the Media tools first — the card on the Media tab does it",
  "sh.everythingCheckedIsAlready": "Everything checked is already backed up",
  "sh.everythingIsBackedUp": "Everything is backed up",
  "sh.sync": "Sync",
  "sh.pullNewPhotosAnd": "Pull new photos and videos off the iPhone",
  "sh.askLingToSummarise": "Ask Ling to summarise the roll",
  "sh.syncTheIphoneFirst": "Sync the iPhone first — there is nothing to report on yet",
  "sh.checkItemsToRemove2": "Check items to remove them from the iPhone",
  "sh.rebuildThisMacS": "Rebuild this Mac's photo index",
  "sh.askLingToSummarise2": "Ask Ling to summarise the Mac library",
  "sh.noMacPhotoIndex": "No Mac photo index yet — re-index first",
  "sh.checkFilesToMove": "Check files to move them to the macOS Trash",
  "sh.noIphoneSeenYet": "no iPhone seen yet",
  "sh.gbGbFree": "{gb} GB free",
  "sh.iphoneConnectedOverUsb": "iPhone connected over USB",
  "sh.iphonePairedOverWi": "iPhone paired over Wi-Fi",
  "sh.noIphoneConnected": "No iPhone connected",
  "sh.backingUp": "Backing up",
  "sh.removing": "Removing",
  "sh.aMomentAgo": "a moment ago",
  "sh.minsMinAgo": "{mins} min ago",
  "sh.freeSpaceUnknown": "free space unknown",
  "sh.noPhotoIndexYet": "No photo index yet — it is built during the first scan.",
  "sh.indexMacPhotos": "Index Mac photos",
  "sh.pullCameraRoll": "Pull camera roll",
  "sh.analyze": "Analyze",
  "sh.back": "Back",
  "sh.allByFolder": "All by folder",
  "sh.videos": "Videos",
  "sh.oldestOfEachGroup": "oldest of each group is likely the original — checked files go to the macOS Trash",
  "sh.checkedFilesGoTo": "checked files go to the macOS Trash (recoverable) — originals in ~/Pictures",
  "sh.selectDupesKeepOldest": "Select dupes — keep oldest ({n})",
  "sh.selectAllN": "Select all ({n})",
  "sh.movingToTrash2": "Moving to Trash…",
  "sh.moveThisBackupCopy": "Move this backup copy to the macOS Trash",
  "sh.moveThisFileTo": "Move this file to the macOS Trash",
  "sh.purgeNow": "Purge now",
  "sh.suggestedDuplicatesBestKept": "suggested = duplicates (best kept), blurry, dark, exact copies on Mac · check months below for a time range",
  "sh.noArchiveCopyYet": "no archive copy yet — check what you want, then Backup (top)",
  "sh.uncheckedKeptOnPhone": "unchecked = kept on phone",
  "sh.verifiedMacCopiesBackup": "verified Mac copies (backup or ~/Pictures) are safe to remove from the phone",
  "sh.theIphoneDeletesThese": "the iPhone deletes these next time Linggen opens there — still cancellable",
  "sh.checksFollowYouAcross": "checks follow you across filters — Remove (top) takes everything checked",
  "sh.exactByteDupes": "exact byte dupes",
  "sh.cancellingQueuedDeletions": "Cancelling queued deletions…",
  "sh.queueClearedNothingPending": "✓ Queue cleared — nothing pending on the iPhone",
  "sh.selectSuggestedN": "Select suggested ({n})",
  "sh.selectRecommendedN": "Select recommended ({n})",
  "sh.allOfTheseHave": "All of these have verified backup copies on this Mac — recoverable from the archive anytime.",
  "sh.recoverableOnThisMac": "Recoverable on this Mac for 30 days — restore anytime from the Removed tab.",
  "sh.checkedItemsNotBacked": "Checked items not backed up yet",
  "sh.everythingNotBackedUp": "Everything not backed up yet",
  "sh.thisMacPicturesIphone": "This Mac — ~/Pictures/iPhone Backup",
  "sh.chooseFolder": "📁 Choose folder…",
  "sh.unqueue": "Unqueue",
  "sh.cancelThePendingIphone": "Cancel the pending iPhone deletion",
  "sh.removeThisItemFrom": "Remove this item from the iPhone (recoverable for 30 days)",
  "sh.syncingOverUsb": "Syncing over USB…",
  "sh.refreshingFromYourMac": "Refreshing from your Mac…",
  "sh.icloudPhotosBlocksUsb": "iCloud Photos blocks USB deletion",
  "sh.iphoneNotConnected": "iPhone not connected",
  "sh.queueingPhoneDeletions": "Queueing phone deletions…",
  "sh.freeUpPhone": "Free up phone →",
  "sh.nothingToBackUp": "Nothing to back up yet — sync the iPhone or re-index the Mac first",
  "sh.copyingToDisk": "Copying to disk",
  "sh.nothingChecked": "Nothing checked",
  "sh.pickADestinationOn": "Pick a destination on the external disk",
  "sh.backUpToA": "Back up to a disk first — Clean frees only what the disk already holds",
  "sh.noVerifiedCopiesReachable": "No verified copies reachable — is the external disk connected?",
  "sh.nothingCleanableBackUp": "Nothing cleanable — back up to the disk first",
  "sh.cleaning": "Cleaning",
  "sh.unpin": "Unpin",
  "sh.pinToTheTop": "Pin to the top",
  "sh.hide": "Hide",
  "sh.bringItBackFrom": "bring it back from the foot of the page",
  "sh.diskNearlyFull": "Disk nearly full",
  "sh.spaceYouCanGet": "Space you can get back",
  "sh.notLookedForYet": "Not looked for yet",
  "sh.buildOutputCachesOld": "Build output, caches, old installers and logs",
  "sh.findWhatCanGo": "Find what can go",
  "sh.nothingMarkedSafe": "Nothing marked safe",
  "sh.gbMoreToReview": "{gb} more to review",
  "sh.reviewAndClear": "Review and clear",
  "sh.openClearable": "Open Clearable",
  "sh.iphoneBackup": "iPhone backup",
  "sh.nothingIsDeletedBefore": "Nothing is deleted before it has one",
  "sh.passingOfTotalChecks": "{passing} of {total} checks pass",
  "sh.remoteLogin": "Remote Login",
  "sh.openPorts": "Open ports",
  "sh.batteryIsPastIts": "Battery is past its rated lifespan. Consider replacement or plan for an upgrade.",
  "sh.batteryIsEnteringDecline": "Battery is entering decline zone. Monitor closely over the next few months.",
  "sh.batteryHealthIsGood": "Battery health is good.",
  "sh.charging": "Charging",
  "sh.charged": "Charged",
  "sh.onBattery": "On battery",
  "sh.battery": "Battery",
  "sh.memoryPressureP": "Memory pressure: {p}",
  "sh.live": "Live",
  "sh.noDataYet": "No data yet",
  "sh.noData": "No data",
  "sh.chip": "Chip",
  "sh.memory": "Memory",
  "sh.system2": "System",
  "sh.age": "Age",
  "sh.aboutNYearsFrom": "about {n} years (from the chip)",
  "sh.diskUsage2": "Disk Usage",
  "sh.theTrash": "The Trash",
  "sh.appCaches": "App caches",
  "sh.xcodeDeriveddata": "Xcode DerivedData",
  "sh.iosSimulators": "iOS simulators",
  "sh.cleanup": "Cleanup",
  "sh.appleBundledKeepIf": "Apple bundled — keep if you ever might use it.",
  "sh.paidSuiteCheckThe": "Paid suite — check the license before removing.",
  "sh.notOpenedRecently": "Not opened recently.",
  "sh.appsToReview": "Apps to Review",
  "sh.topProcesses": "Top processes",
  "sh.process": "Process",
  "sh.disk": "Disk",
  "sh.network": "Network",
  "sh.connected": "Connected",
  "sh.storageIo": "Storage IO",
  "sh.quitYourAppsFirst": "Quit your apps first. They rebuild these on next launch.",
  "sh.xcodeRebuildsItOn": "Xcode rebuilds it on the next build.",
  "sh.wipesTheAppsAnd": "Wipes the apps and data inside every simulator. The simulators stay.",
  "sh.npmDownloadsPackagesAgain": "npm downloads packages again when a project needs them.",
  "sh.permanentLookThroughThe": "Permanent. Look through the Trash first.",
  "sh.copy": "Copy",
  "sh.refresh": "Refresh",
  "sh.storage": "Storage",
  "sh.freeSpace": "Free space",
  "sh.cameraRoll": "Camera roll",
  "sh.notArchivedHere": "Not archived here",
  "sh.device": "Device",
  "sh.model": "Model",
  "sh.batteryHealth": "Battery health",
  "sh.onThePhoneOnly": "On the phone only",
  "sh.thermalState": "Thermal state",
  "sh.lowPowerMode": "Low Power Mode",
  "sh.thePasscodeCheck": "The passcode check",
  "sh.deviceIntegrity": "Device integrity",
  "sh.theIntegrityCheck": "The integrity check",
  "sh.libraryTidiness": "Library tidiness",
  "sh.duplicateAndScreenshotShare": "Duplicate and screenshot share",
  "sh.whatIsReadableOn": "{what} is readable on the phone — open Shifu in Linggen Mobile",
  "sh.noIphoneOnThe": "no iPhone on the cable — connect one by USB to read this",
  "sh.theIphoneDidNot": "the iPhone did not report its disk usage",
  "sh.ios26StoppedReporting": "iOS 26 stopped reporting photo usage — run a USB sync to measure it",
  "sh.measuredAtTheLast": "measured at the last USB sync",
  "sh.nothingSyncedFromThis": "nothing synced from this iPhone yet",
  "sh.nothingPending": "nothing pending",
  "sh.everyItemHasA": "every item has a verified copy",
  "sh.theIphoneDidNot2": "the iPhone did not report a name",
  "sh.theIphoneDidNot3": "the iPhone did not report a model identifier",
  "sh.theIphoneDidNot4": "the iPhone did not report an OS version",
  "sh.thisIphoneDoesNot": "this iPhone does not report battery level over the cable",
  "sh.pluggedIn": "plugged in",
  "sh.noPublicApiOn": "no public API on iOS — Settings › Battery › Battery Health",
  "sh.minsMinutesAgo": "{mins} minutes ago",
  "sh.readingTheIphoneOver": "Reading the iPhone over the cable…",
  "sh.safeToDelete": "Safe to delete",
  "sh.uptime": "Uptime",
  "sh.sinceTheLastRestart": "Since the last restart.",
  "sh.charge": "Charge",
  "sh.batteryCycles": "Battery cycles",
  "sh.appleRatesMostModern": "Apple rates most modern Mac batteries for 1,000 cycles.",
  "sh.ioregReportedNoCycle": "ioreg reported no cycle count on this machine.",
  "sh.thisScanDoesNot": "This scan does not read maximum capacity.",
  "sh.processor": "Processor",
  "sh.load": "Load",
  "sh.graphics": "Graphics",
  "sh.swap": "Swap",
  "sh.address": "Address",
  "sh.worthALook": "Worth a look.",
  "sh.steadySwapUnderLight": "Steady swap under light use is the sign worth acting on, not the number itself.",
  "sh.gbGbInUse": "{gb} GB in use",
  "sh.loadAverageAvg": "Load average {avg}",
};

const zh = {
  "sh.appleShifu": "Apple Shifu",
  "sh.system": "🩺 系统",
  "sh.media": "📷 媒体",
  "sh.files": "📁 文件",
  "sh.settings": "设置",
  "sh.overview": "概览",
  "sh.details": "详情",
  "sh.connectYourIphoneBy": "用 USB 连接 iPhone — 管理 Mac 和 iPhone 上的照片和视频",
  "sh.downloadsLargeFilesDuplicates": "这台 Mac 上的下载、大文件、重复文件和缓存",
  "sh.scan": "扫描",
  "sh.report": "报告",
  "sh.backUp": "备份",
  "sh.clean": "清理",
  "sh.thisMac": "这台 Mac",
  "sh.notAvailableForThis": "这台设备不可用",
  "sh.linggenOpen": "Linggen 已打开",
  "sh.lastConnectedHere": "上次在这里连接",
  "sh.whicheverPhoneIsHere": "当前连接的手机",
  "sh.noPhonePaired": "没有配对手机",
  "sh.pairOneInSettings": "在 设置 → 手机 里配对",
  "sh.notAvailableOnThis": "这个标签页不可用",
  "sh.labelClickAgainTo": "{label} — 再点一次选择其他手机",
  "sh.everythingArchived": "☁️ 全部已归档",
  "sh.everyItemOnThe": "iPhone 上的每一项在这台 Mac 上都有校验过的副本。",
  "sh.iphoneItemsWithNo": "iPhone 上还没有在这台 Mac 上留下校验副本的项目。",
  "sh.notAvailableHere": "这里不可用",
  "sh.filesIsThisMac": "“文件”指这台 Mac — iOS 不让应用查看其他应用的文件",
  "sh.reRunASystem": "重新运行系统检查",
  "sh.fullRescan": "↻ 完整重新扫描",
  "sh.largeFiles": "📦 大文件",
  "sh.walksTheFilesystem": "遍历文件系统",
  "sh.findLargeFilesAnd": "找出大文件并标注",
  "sh.writeUpWhatThe": "写出上次扫描的发现",
  "sh.writtenReport": "📊 书面报告",
  "sh.whatCanBeCleared": "能清理什么、是否安全 — 打开“文件”标签页",
  "sh.readingsComeFromThe": "读数来自手机 — 在 Linggen Mobile 里打开 Shifu",
  "sh.writeUpWhatThis": "写出这台 Mac 能看到的 iPhone 情况",
  "sh.iphoneCleanupIsPhotos": "iPhone 清理指照片和视频 — 打开“媒体”标签页",
  "sh.nothingSyncedFromAn": "还没从 iPhone 同步过 — 先在“媒体”标签页同步",
  "sh.everyIphoneItemAlready": "iPhone 上每一项在这台 Mac 上都已有校验副本",
  "sh.aScanIsRunning": "正在扫描",
  "sh.askMeAnything": "有什么都可以问我…",
  "sh.scanFullRescanChecks": "↻ 扫描 → 完整重新扫描会检查磁盘、电池、安全和性能。",
  "sh.systemInfo": "系统信息",
  "sh.diskUsage": "磁盘用量",
  "sh.security": "安全",
  "sh.performance": "性能",
  "sh.checkingYourSystem": "正在检查你的系统…",
  "sh.justNow": "刚刚",
  "sh.weeklyCheckOnMondays": "每周检查已开启 — 每周一 10:00。",
  "sh.weeklyCheckOff": "每周检查已关闭。",
  "sh.couldnTReachLinggen": "连不上 Linggen — 每周检查没有变化。",
  "sh.measuringTheDisk": "正在测量磁盘…",
  "sh.checkingSecurity": "正在检查安全…",
  "sh.readingProcesses": "正在读取进程…",
  "sh.aScanIsAlready": "已经在扫描了。",
  "sh.deepScanningYourFiles": "正在深度扫描你的文件…",
  "sh.indexingFiles": "正在索引文件",
  "sh.findingLargeFiles": "正在查找大文件",
  "sh.checkingDuplicates": "正在检查重复文件",
  "sh.aiAnalysis": "AI 分析",
  "sh.indexingFilesN": "正在索引文件（{n}）",
  "sh.foundNLargeFiles": "找到 {n} 个大文件…",
  "sh.nLargeFilesFound": "找到 {n} 个大文件",
  "sh.largeFilesFound": "已找到大文件",
  "sh.nDuplicateSets": "{n} 组重复文件",
  "sh.sendingToAiFor": "正在发送给 AI 分析…",
  "sh.clearable": "可清理",
  "sh.downloads": "下载",
  "sh.largeFiles2": "大文件",
  "sh.duplicates": "重复文件",
  "sh.findWhatCanBe": "找出可清理的内容，并重新读取下载和大文件",
  "sh.askLingWhatIs": "问 Ling 什么可以安全清理",
  "sh.runAScanFirst": "请先扫描 — 还没有可报告的内容",
  "sh.backUpArchivesThe": "备份会归档 iPhone 相册 — Mac 文件不归档，会移到废纸篓",
  "sh.trash": "废纸篓",
  "sh.checkItemsToRemove": "勾选要移除的项目",
  "sh.askLingToWalk": "让 Ling 带你看看什么可以安全清理",
  "sh.backUpArchivesThe2": "备份会归档 iPhone 相册 — Mac 文件不归档",
  "sh.clear": "清理",
  "sh.checkItemsToClear": "勾选要清理的项目",
  "sh.waitForTheScan": "等扫描完成",
  "sh.readingDownloads": "正在读取下载…",
  "sh.findingLargeFiles2": "正在查找大文件…",
  "sh.syncedTrashingItDeletes": "已同步。移到废纸篓会把它从你所有设备的云盘里删除。",
  "sh.pythonEnvironmentRemovingIt": "Python 环境。移除会破坏这个环境。",
  "sh.likelyTheOriginalKeep": "可能是原件。至少保留一份。",
  "sh.anIdenticalCopyStays": "这台 Mac 上还留有一份相同的副本。",
  "sh.yourFileItGoes": "你的文件。会移到废纸篓，清空前都可以恢复。",
  "sh.moveToTrash": "移到废纸篓",
  "sh.moveNToTrash": "把 {n} 项移到废纸篓",
  "sh.movingToTrash": "正在移到废纸篓",
  "sh.clearing": "正在清理",
  "sh.clearableNotScannedClearing": "可清理项未扫描 · 清理中…",
  "sh.nDeletedOutrightThey": "{n} 项直接删除 — 它们会重新生成",
  "sh.nMovedToThe": "{n} 项移到废纸篓 — 清空前都可以恢复",
  "sh.nCouldNotBe": "{n} 项无法清理",
  "sh.nAlreadyGone": "{n} 项已不存在",
  "sh.eachRowClearsIts": "每一行按各自的方式清理：缓存和构建产物直接删除，你的数据移到废纸篓",
  "sh.checkedItemsGoTo": "勾选的项目会移到 macOS 废纸篓 — 清空后才释放空间",
  "sh.lookingForWhatCan": "正在查找可清理的内容…",
  "sh.nothingClearableFoundHit": "没有找到可清理的内容。点 ↻ 扫描再找一次。",
  "sh.noDuplicatesAmongThe": "扫描的文件里没有重复 — 大小相同的文件完整校验后都不一样。",
  "sh.duplicatesAreCheckedOnce": "当前任务完成后才会检查重复文件 — 到时再点“重复文件”。",
  "sh.biggestFirstSelectAll": "从大到小 · “全选”只选“安全”的行",
  "sh.oldestCopyOfEach": "每组中最早的那份不勾选 — 它可能是原件",
  "sh.couldNotReachThe": "无法访问剪贴板",
  "sh.deletedOutright": "直接删除",
  "sh.toTheTrash": "移到废纸篓",
  "sh.byItsOwnTool": "用它自己的工具",
  "sh.showInFinder": "在访达中显示",
  "sh.copyCommand": "复制命令",
  "sh.dismiss": "忽略",
  "sh.dropLingSFind": "去掉 Ling 的发现",
  "sh.mappingTheRestOf": "正在为 Ling 梳理磁盘其余部分…",
  "sh.findingFoldersByWhat": "正在按类型识别文件夹…",
  "sh.mMinAgo": "{m} 分钟前",
  "sh.foundByShifu": "Shifu 发现",
  "sh.newestFile": "最新文件",
  "sh.notRebuiltGoesTo": "不会重建 — 移到废纸篓，可恢复",
  "sh.daysDaysAgo": "{days} 天前",
  "sh.notInTheCatalog": "不在目录中。",
  "sh.aProcessIsRunning": "有进程正从这个项目运行",
  "sh.notMeasuredTooBig": "未测量 — 太大，来不及计算",
  "sh.notMeasuredMacosWould": "未测量 — macOS 不允许 Shifu 读取",
  "sh.notMeasuredTheScan": "未测量 — 扫描超时",
  "sh.notMeasured": "未测量",
  "sh.nothingClearableFoundYet": "还没找到可清理的内容。",
  "sh.aboutSafeCanBe": "大约 {safe} 可以安全清理，另有 {review} 待查看。",
  "sh.stillRunning": "仍在运行",
  "sh.allMedia": "全部媒体",
  "sh.notBackedUp": "未备份",
  "sh.onMac": "💾 在 Mac 上",
  "sh.blurry": "模糊",
  "sh.screenshots": "截图",
  "sh.largeVideos": "大视频",
  "sh.installTheMediaTools": "请先安装媒体工具 — “媒体”标签页里的卡片可以安装",
  "sh.everythingCheckedIsAlready": "勾选的都已备份",
  "sh.everythingIsBackedUp": "全部已备份",
  "sh.sync": "同步",
  "sh.pullNewPhotosAnd": "从 iPhone 拉取新的照片和视频",
  "sh.askLingToSummarise": "让 Ling 总结相册",
  "sh.syncTheIphoneFirst": "请先同步 iPhone — 还没有可报告的内容",
  "sh.checkItemsToRemove2": "勾选要从 iPhone 移除的项目",
  "sh.rebuildThisMacS": "重建这台 Mac 的照片索引",
  "sh.askLingToSummarise2": "让 Ling 总结 Mac 图库",
  "sh.noMacPhotoIndex": "还没有 Mac 照片索引 — 请先重新索引",
  "sh.checkFilesToMove": "勾选要移到 macOS 废纸篓的文件",
  "sh.noIphoneSeenYet": "还没看到 iPhone",
  "sh.gbGbFree": "可用 {gb} GB",
  "sh.iphoneConnectedOverUsb": "iPhone 已通过 USB 连接",
  "sh.iphonePairedOverWi": "iPhone 已通过 Wi-Fi 配对",
  "sh.noIphoneConnected": "没有连接 iPhone",
  "sh.backingUp": "正在备份",
  "sh.removing": "正在移除",
  "sh.aMomentAgo": "刚才",
  "sh.minsMinAgo": "{mins} 分钟前",
  "sh.freeSpaceUnknown": "可用空间未知",
  "sh.noPhotoIndexYet": "还没有照片索引 — 会在第一次扫描时建立。",
  "sh.indexMacPhotos": "索引 Mac 照片",
  "sh.pullCameraRoll": "拉取相册",
  "sh.analyze": "分析",
  "sh.back": "返回",
  "sh.allByFolder": "按文件夹",
  "sh.videos": "视频",
  "sh.oldestOfEachGroup": "每组最早的可能是原件 — 勾选的文件会移到 macOS 废纸篓",
  "sh.checkedFilesGoTo": "勾选的文件会移到 macOS 废纸篓（可恢复）— 原件在 ~/Pictures",
  "sh.selectDupesKeepOldest": "选择重复项 — 保留最早的（{n}）",
  "sh.selectAllN": "全选（{n}）",
  "sh.movingToTrash2": "正在移到废纸篓…",
  "sh.moveThisBackupCopy": "把这份备份副本移到 macOS 废纸篓",
  "sh.moveThisFileTo": "把这个文件移到 macOS 废纸篓",
  "sh.purgeNow": "立即清除",
  "sh.suggestedDuplicatesBestKept": "建议 = 重复项（保留最好的）、模糊、过暗、Mac 上的完全副本 · 勾选下面的月份选择时间范围",
  "sh.noArchiveCopyYet": "还没有归档副本 — 勾选想要的，然后点上方“备份”",
  "sh.uncheckedKeptOnPhone": "不勾选 = 留在手机上",
  "sh.verifiedMacCopiesBackup": "已校验的 Mac 副本（备份或 ~/Pictures）可以安全地从手机移除",
  "sh.theIphoneDeletesThese": "下次在 iPhone 上打开 Linggen 时会删除这些 — 仍可取消",
  "sh.checksFollowYouAcross": "勾选会跨筛选保留 — 上方“移除”会处理所有勾选项",
  "sh.exactByteDupes": "逐字节完全相同",
  "sh.cancellingQueuedDeletions": "正在取消排队的删除…",
  "sh.queueClearedNothingPending": "✓ 队列已清空 — iPhone 上没有待处理的",
  "sh.selectSuggestedN": "选择建议项（{n}）",
  "sh.selectRecommendedN": "选择推荐项（{n}）",
  "sh.allOfTheseHave": "这些在这台 Mac 上都有校验过的备份副本 — 随时可以从归档恢复。",
  "sh.recoverableOnThisMac": "在这台 Mac 上可恢复 30 天 — 随时从“已移除”标签恢复。",
  "sh.checkedItemsNotBacked": "勾选的未备份项目",
  "sh.everythingNotBackedUp": "所有未备份的项目",
  "sh.thisMacPicturesIphone": "这台 Mac — ~/Pictures/iPhone Backup",
  "sh.chooseFolder": "📁 选择文件夹…",
  "sh.unqueue": "取消排队",
  "sh.cancelThePendingIphone": "取消待处理的 iPhone 删除",
  "sh.removeThisItemFrom": "从 iPhone 移除这一项（30 天内可恢复）",
  "sh.syncingOverUsb": "正在通过 USB 同步…",
  "sh.refreshingFromYourMac": "正在从你的 Mac 刷新…",
  "sh.icloudPhotosBlocksUsb": "iCloud 照片会阻止 USB 删除",
  "sh.iphoneNotConnected": "iPhone 未连接",
  "sh.queueingPhoneDeletions": "正在排队手机删除…",
  "sh.freeUpPhone": "释放手机空间 →",
  "sh.nothingToBackUp": "还没有要备份的 — 请先同步 iPhone 或重新索引 Mac",
  "sh.copyingToDisk": "正在复制到磁盘",
  "sh.nothingChecked": "没有勾选",
  "sh.pickADestinationOn": "在外置磁盘上选择目标位置",
  "sh.backUpToA": "请先备份到磁盘 — “清理”只释放磁盘里已有的",
  "sh.noVerifiedCopiesReachable": "找不到已校验的副本 — 外置磁盘连上了吗？",
  "sh.nothingCleanableBackUp": "没有可清理的 — 请先备份到磁盘",
  "sh.cleaning": "正在清理",
  "sh.unpin": "取消固定",
  "sh.pinToTheTop": "固定到顶部",
  "sh.hide": "隐藏",
  "sh.bringItBackFrom": "可以从页面底部恢复",
  "sh.diskNearlyFull": "磁盘快满了",
  "sh.spaceYouCanGet": "可以腾出的空间",
  "sh.notLookedForYet": "还没找过",
  "sh.buildOutputCachesOld": "构建产物、缓存、旧安装包和日志",
  "sh.findWhatCanGo": "找出可以删的",
  "sh.nothingMarkedSafe": "没有标为安全的",
  "sh.gbMoreToReview": "另有 {gb} 待查看",
  "sh.reviewAndClear": "查看并清理",
  "sh.openClearable": "打开可清理",
  "sh.iphoneBackup": "iPhone 备份",
  "sh.nothingIsDeletedBefore": "在有副本之前不会删除任何东西",
  "sh.passingOfTotalChecks": "{total} 项检查通过 {passing} 项",
  "sh.remoteLogin": "远程登录",
  "sh.openPorts": "开放端口",
  "sh.batteryIsPastIts": "电池已超过额定寿命。考虑更换或计划升级。",
  "sh.batteryIsEnteringDecline": "电池开始衰退。接下来几个月请留意。",
  "sh.batteryHealthIsGood": "电池健康良好。",
  "sh.charging": "正在充电",
  "sh.charged": "已充满",
  "sh.onBattery": "使用电池",
  "sh.battery": "电池",
  "sh.memoryPressureP": "内存压力：{p}",
  "sh.live": "实时",
  "sh.noDataYet": "还没有数据",
  "sh.noData": "没有数据",
  "sh.chip": "芯片",
  "sh.memory": "内存",
  "sh.system2": "系统",
  "sh.age": "机龄",
  "sh.aboutNYearsFrom": "约 {n} 年（按芯片推断）",
  "sh.diskUsage2": "磁盘用量",
  "sh.theTrash": "废纸篓",
  "sh.appCaches": "应用缓存",
  "sh.xcodeDeriveddata": "Xcode DerivedData",
  "sh.iosSimulators": "iOS 模拟器",
  "sh.cleanup": "清理",
  "sh.appleBundledKeepIf": "Apple 自带 — 以后可能用就留着。",
  "sh.paidSuiteCheckThe": "付费套件 — 移除前检查授权。",
  "sh.notOpenedRecently": "最近没打开过。",
  "sh.appsToReview": "待查看的应用",
  "sh.topProcesses": "占用最高的进程",
  "sh.process": "进程",
  "sh.disk": "磁盘",
  "sh.network": "网络",
  "sh.connected": "已连接",
  "sh.storageIo": "存储 IO",
  "sh.quitYourAppsFirst": "请先退出应用。下次启动时它们会重建这些。",
  "sh.xcodeRebuildsItOn": "Xcode 下次构建时会重建。",
  "sh.wipesTheAppsAnd": "清除每个模拟器里的应用和数据。模拟器本身保留。",
  "sh.npmDownloadsPackagesAgain": "项目需要时 npm 会重新下载包。",
  "sh.permanentLookThroughThe": "永久删除。请先看看废纸篓。",
  "sh.copy": "复制",
  "sh.refresh": "刷新",
  "sh.storage": "存储",
  "sh.freeSpace": "可用空间",
  "sh.cameraRoll": "相册",
  "sh.notArchivedHere": "未在这里归档",
  "sh.device": "设备",
  "sh.model": "型号",
  "sh.batteryHealth": "电池健康",
  "sh.onThePhoneOnly": "只在手机上",
  "sh.thermalState": "温度状态",
  "sh.lowPowerMode": "低电量模式",
  "sh.thePasscodeCheck": "密码检查",
  "sh.deviceIntegrity": "设备完整性",
  "sh.theIntegrityCheck": "完整性检查",
  "sh.libraryTidiness": "图库整洁度",
  "sh.duplicateAndScreenshotShare": "重复和截图占比",
  "sh.whatIsReadableOn": "{what}可以在手机上读取 — 在 Linggen Mobile 里打开 Shifu",
  "sh.noIphoneOnThe": "数据线上没有 iPhone — 用 USB 连接一台来读取",
  "sh.theIphoneDidNot": "iPhone 没有报告磁盘用量",
  "sh.ios26StoppedReporting": "iOS 26 不再报告照片用量 — 运行一次 USB 同步来测量",
  "sh.measuredAtTheLast": "在上次 USB 同步时测得",
  "sh.nothingSyncedFromThis": "还没从这台 iPhone 同步过",
  "sh.nothingPending": "没有待处理的",
  "sh.everyItemHasA": "每一项都有校验副本",
  "sh.theIphoneDidNot2": "iPhone 没有报告名称",
  "sh.theIphoneDidNot3": "iPhone 没有报告型号标识",
  "sh.theIphoneDidNot4": "iPhone 没有报告系统版本",
  "sh.thisIphoneDoesNot": "这台 iPhone 不通过数据线报告电量",
  "sh.pluggedIn": "已接电源",
  "sh.noPublicApiOn": "iOS 没有公开接口 — 设置 › 电池 › 电池健康",
  "sh.minsMinutesAgo": "{mins} 分钟前",
  "sh.readingTheIphoneOver": "正在通过数据线读取 iPhone…",
  "sh.safeToDelete": "可安全删除",
  "sh.uptime": "运行时间",
  "sh.sinceTheLastRestart": "自上次重启以来。",
  "sh.charge": "电量",
  "sh.batteryCycles": "电池循环次数",
  "sh.appleRatesMostModern": "Apple 给大多数新款 Mac 电池的额定循环次数是 1000 次。",
  "sh.ioregReportedNoCycle": "ioreg 没有报告这台机器的循环次数。",
  "sh.thisScanDoesNot": "这次扫描不读取最大容量。",
  "sh.processor": "处理器",
  "sh.load": "负载",
  "sh.graphics": "图形",
  "sh.swap": "交换",
  "sh.address": "地址",
  "sh.worthALook": "值得一看。",
  "sh.steadySwapUnderLight": "轻度使用下持续使用交换才值得处理，数字本身不重要。",
  "sh.gbGbInUse": "已用 {gb} GB",
  "sh.loadAverageAvg": "平均负载 {avg}",
};

export const TABLES = { en, 'zh-Hans': zh };

// ── The page's English, put into the person's language in place ───────────

const SKIP = 'script, style, textarea, input, [contenteditable], #chat-panel, [data-no-i18n]';
const ATTRS = ['title', 'placeholder', 'aria-label'];
let exact = null;
let patterns = null;

function index() {
  exact = new Map();
  patterns = [];
  for (const [k, v] of Object.entries(en)) {
    if (typeof v !== 'string') continue;
    const names = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (!names.length) { exact.set(v, k); continue; }
    const re = new RegExp(`^${v.split(/\{\w+\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)')}$`);
    patterns.push({ re, names, k });
  }
}

/// The person's words for one piece of the page's English, or null.
export function translate(text) {
  if (LANG === 'en') return null;
  if (!exact) index();
  const s = text.trim();
  if (!s) return null;
  const k = exact.get(s);
  if (k) return t(k);
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (m) return t(p.k, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])));
  }
  return null;
}

function swapText(node) {
  const said = translate(node.nodeValue);
  if (said == null) return;
  const lead = node.nodeValue.match(/^\s*/)[0];
  const tail = node.nodeValue.match(/\s*$/)[0];
  node.nodeValue = lead + said + tail;
}

function swapAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v) continue;
    const said = translate(v);
    if (said != null) el.setAttribute(a, said);
  }
}

export function translateDom(root = document.body) {
  if (LANG === 'en' || !root) return;
  if (root.nodeType === 3) {
    if (!root.parentElement?.closest(SKIP)) swapText(root);
    return;
  }
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  swapAttrs(root);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === 3) swapText(n);
    else swapAttrs(n);
  }
}

/// Translate now, and everything the page renders from here on.
export function watchDom(root = document.body) {
  if (LANG === 'en' || !root) return;
  translateDom(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateDom(m.target);
      else if (m.type === 'attributes') swapAttrs(m.target);
      else m.addedNodes.forEach((n) => translateDom(n));
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
