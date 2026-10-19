// strings.js — DJ's words, in the one language the person set (Settings →
// Language). CFO's shape: read once at start, words at render time. Song
// titles, artists and playlist names are the person's — they never pass here.

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
  "dj.count.song": { one: "{n} song", other: "{n} songs" },
  "dj.count.new_song": { one: "{n} new song", other: "{n} new songs" },
  "dj.found": "{what} found",
  "dj.renamed": "{what} renamed",
  "dj.missingRemoved": "{n} missing removed",
  "dj.connectingToDj": "Connecting to DJ…",
  "dj.k.nothingYet": "Nothing to sing yet.",
  "dj.k.backLib": "← Back to library",
  "dj.noLyricsForThis": "No lyrics for this song — switching to a karaoke video.",
  "dj.findingAKaraokeVideo": "Finding a karaoke video…",
  "dj.findingKaraokeAudio": "Finding karaoke audio…",
  "dj.nothingFound": "Nothing found.",
  "dj.findingLyrics": "Finding lyrics…",
  "dj.noAudioFileFor": "No audio file for this song.",
  "dj.noLyricsFoundFor": "No lyrics found for “{title}”.",
  "dj.findLyrics": "🔎 Find lyrics",
  "dj.gotLyricsForTitle": "Got lyrics for “{title}”.",
  "dj.noKaraokeVideoFound": "No karaoke video found.",
  "dj.noKaraokeAudioFound": "No karaoke audio found.",
  "dj.karaoke": "Karaoke",
  "dj.vocalsRemoved": "vocals removed",
  "dj.karaokeVideo": "Karaoke video",
  "dj.lyricsOnScreen": "lyrics on screen",
  "dj.original": "Original",
  "dj.withVocals": "with vocals",
  "dj.karaokeVocalsRemoved": "🎤 Karaoke — vocals removed",
  "dj.originalWithVocals": "🎵 Original — with vocals",
  "dj.karaokeVideo2": "🎬 Karaoke video",
  "dj.switchVersion": "Switch version",
  "dj.micOn": "🎤 Mic on",
  "dj.micOff": "🎤 Mic off",
  "dj.micOnUseEarbuds": "Mic on — use earbuds or a separate speaker so it doesn’t echo.",
  "dj.micOn2": "Mic on.",
  "dj.micOff2": "Mic off.",
  "dj.micBlockedAllowMicrophone": "Mic blocked — allow microphone access for this page.",
  "dj.couldnTStartThe": "Couldn’t start the audio engine.",
  "dj.bluetoothAddsDelaySo": "⚠ Bluetooth adds delay, so your voice can echo. Wired is best.",
  "dj.thisBrowserCanT": "This browser can’t redirect output — pick the speaker in macOS Sound instead.",
  "dj.thisMac": "This Mac",
  "dj.phone": "Phone",
  "dj.upToDate": "up to date",
  "dj.notPaired": "not paired",
  "dj.syncSentToName": "Sync sent to {name}.",
  "dj.couldnTReachYour": "Couldn't reach your phone: {String}",
  "dj.allSongs": "All songs",
  "dj.recentlyAdded": "Recently added",
  "dj.mergedIntoNewname": "Merged into “{newName}”.",
  "dj.renamedToNewname": "Renamed to “{newName}”.",
  "dj.deletedPlaylistNameSongs": "Deleted playlist “{name}”. Songs kept.",
  "dj.onYourPhone": "on your phone",
  "dj.karaokeReady": "karaoke ready",
  "dj.removeFromPlaylist": "Remove from playlist",
  "dj.removeFromPhone": "Remove from phone",
  "dj.deleteFromLibrary": "Delete from library",
  "dj.pluralOnYourPhone": "{plural} on your phone — {name} is fetching.",
  "dj.pluralOffYourPhone": "{plural} off your phone — still on this Mac.",
  "dj.deletePluralFromYour": "Delete {plural} from your library?",
  "dj.delete": "Delete",
  "dj.nothingToSingHere": "Nothing to sing here.",
  "dj.nothingToPlayHere": "Nothing to play here.",
  "dj.lookingForAnotherSource": "Looking for another source for “{title}”.",
  "dj.titleIsAlreadyQueued": "“{title}” is already queued.",
  "dj.deleteTitleFromYour": "Delete “{title}” from your library?",
  "dj.play": "Play",
  "dj.addToPhone": "Add to phone",
  "dj.takeOffPhone": "Take off phone",
  "dj.showInFinder": "Show in Finder",
  "dj.findAnotherSource": "Find another source",
  "dj.removeFromThisPlaylist": "Remove from this playlist",
  "dj.inOrder": "→ In order",
  "dj.lookingForLyricsTitle": "Looking for lyrics — {title}",
  "dj.neverSynced": "never synced",
  "dj.justNow": "just now",
  "dj.justIn": "Just in",
  "dj.notPlayedInA": "Not played in a while",
  "dj.onYourPhone2": "On your phone",
  "dj.lastPlayedShortdate": "last played {shortDate}",
  "dj.neverPlayedHere": "never played here",
  "dj.noLyricsFoundFor2": "No lyrics found for this track.",
  "dj.noneOfThoseAre": "None of those are downloaded yet.",
  "dj.newSet": "New set",
  "dj.pluralQueuedTheyKeep": "{plural} queued — they keep downloading if you close DJ.",
  "dj.downloadsUnavailableYoutubeIs": "Downloads unavailable — YouTube is unreachable from this Mac",
  "dj.yourDiscJockey": "your disc jockey",
  "dj.karaokeSingOnThe": "Karaoke — sing on the big screen",
  "dj.karaoke2": "🎤 Karaoke",
  "dj.settings": "Settings",
  "dj.tellDjAVibe": "Tell DJ a vibe — it builds the set; Get pulls in clean MP3s with lyrics, ready for your phone.",
  "dj.makeAListOf": "Make a list of 90s English songs",
  "dj.build": "Build",
  "dj.orLetDjPick": "or let DJ pick:",
  "dj.aSetBuiltFrom": "A set built from what DJ knows about you",
  "dj.luckyFind": "✦ Lucky find",
  "dj.aSetFromWhat": "A set from what's popular right now",
  "dj.trendingFind": "⌁ Trending find",
  "dj.hongKong90sTop": "Hong Kong 90s top 50",
  "dj.bestOfBeyond": "Best of Beyond",
  "dj.rainySundayJazz": "Rainy-Sunday jazz",
  "dj.upbeatWorkoutMix": "Upbeat workout mix",
  "dj.playNow": "Play now",
  "dj.library": "Library",
  "dj.yourLibrary": "Your library",
  "dj.playThisList": "Play this list",
  "dj.play2": "▶ Play",
  "dj.playbackOrder": "Playback order",
  "dj.tellYourPhoneTo": "Tell your phone to fetch what it's missing",
  "dj.sync": "⇅ Sync",
  "dj.searchYourLibrary": "Search your library…",
  "dj.dragToResizeThe": "Drag to resize the chat — double-click to reset",
  "dj.backToLibrary": "Back to library",
  "dj.library2": "← Library",
  "dj.fullscreen": "Fullscreen",
  "dj.turnTheMicrophoneOn": "Turn the microphone on",
  "dj.micLevel": "Mic level",
  "dj.shiftTheSongS": "Shift the song's key to fit your range",
  "dj.lowerKey": "Lower key",
  "dj.raiseKey": "Raise key",
  "dj.previous": "Previous",
  "dj.playPause": "Play / pause",
  "dj.next": "Next",
  "dj.micMix": "Mic & mix",
  "dj.mix": "🎚 Mix",
  "dj.audioSetupMicSpeaker": "Audio setup — mic & speaker",
  "dj.audio": "⚙ Audio",
  "dj.switchVersionOriginalKaraoke": "Switch version — original, karaoke audio, or karaoke video",
  "dj.version": "🎛 Version",
  "dj.upNext": "Up next",
  "dj.close": "Close",
  "dj.turnTheMicOn": "Turn the mic on once to see device names.",
  "dj.set.songsOf": "{synced}/{total} songs",
  "dj.set.wireless": "wireless",
  "dj.set.carries": "Your phone carries the songs you add to it and fetches them itself.",
  "dj.set.recommended": "recommended",
  "dj.set.pitch": "Wireless sync, offline play, synced lyrics — no cables, no third-party player.",
  "dj.set.steps": "1. Get Linggen Mobile on your iPhone<br/>2. Scan this code with the Camera app<br/>3. Confirm on this Mac — music syncs itself",
  "dj.set.saved": "Saved ✓",
  "dj.djSettings": "DJ settings",
  "dj.libraryFolder": "Library folder",
  "dj.whereDownloadedMp3sAre": "Where downloaded MP3s are saved on this Mac.",
  "dj.quality": "Quality",
  "dj.bestAvailable": "Best available",
  "dj.karaokeSource": "Karaoke source",
  "dj.audioLighterDragLyrics": "Audio — lighter, drag lyrics to sync",
  "dj.videoLyricsOnScreen": "Video — lyrics on screen, guaranteed in sync",
  "dj.audioGrabsASmall": "Audio grabs a small instrumental MP3 and finds lyrics; video downloads the full karaoke clip. Audio syncs to your phone.",
  "dj.fileNaming": "File naming",
  "dj.checkingForPairedPhones": "Checking for paired phones…",
  "dj.save": "Save",
  "dj.default": "Default",
};

const zh = {
  "dj.count.song": "{n} 首歌",
  "dj.count.new_song": "{n} 首新歌",
  "dj.found": "发现 {what}",
  "dj.renamed": "重命名了 {what}",
  "dj.missingRemoved": "移除了 {n} 首丢失的歌",
  "dj.connectingToDj": "正在连接 DJ…",
  "dj.k.nothingYet": "还没有可唱的歌。",
  "dj.k.backLib": "← 返回曲库",
  "dj.noLyricsForThis": "这首歌没有歌词 — 切换到卡拉OK视频。",
  "dj.findingAKaraokeVideo": "正在找卡拉OK视频…",
  "dj.findingKaraokeAudio": "正在找卡拉OK伴奏…",
  "dj.nothingFound": "什么都没找到。",
  "dj.findingLyrics": "正在找歌词…",
  "dj.noAudioFileFor": "这首歌没有音频文件。",
  "dj.noLyricsFoundFor": "没找到“{title}”的歌词。",
  "dj.findLyrics": "🔎 找歌词",
  "dj.gotLyricsForTitle": "找到了“{title}”的歌词。",
  "dj.noKaraokeVideoFound": "没找到卡拉OK视频。",
  "dj.noKaraokeAudioFound": "没找到卡拉OK伴奏。",
  "dj.karaoke": "卡拉OK",
  "dj.vocalsRemoved": "去除人声",
  "dj.karaokeVideo": "卡拉OK视频",
  "dj.lyricsOnScreen": "屏幕显示歌词",
  "dj.original": "原唱",
  "dj.withVocals": "带人声",
  "dj.karaokeVocalsRemoved": "🎤 卡拉OK — 去除人声",
  "dj.originalWithVocals": "🎵 原唱 — 带人声",
  "dj.karaokeVideo2": "🎬 卡拉OK视频",
  "dj.switchVersion": "切换版本",
  "dj.micOn": "🎤 麦克风开",
  "dj.micOff": "🎤 麦克风关",
  "dj.micOnUseEarbuds": "麦克风已开 — 用耳机或单独的音箱，避免回声。",
  "dj.micOn2": "麦克风已开。",
  "dj.micOff2": "麦克风已关。",
  "dj.micBlockedAllowMicrophone": "麦克风被阻止 — 请允许这个页面使用麦克风。",
  "dj.couldnTStartThe": "音频引擎启动失败。",
  "dj.bluetoothAddsDelaySo": "⚠ 蓝牙有延迟，你的声音可能会有回声。有线最好。",
  "dj.thisBrowserCanT": "这个浏览器无法切换输出 — 请在 macOS 声音设置里选择音箱。",
  "dj.thisMac": "这台 Mac",
  "dj.phone": "手机",
  "dj.upToDate": "已是最新",
  "dj.notPaired": "未配对",
  "dj.syncSentToName": "已向 {name} 发送同步。",
  "dj.couldnTReachYour": "连不上你的手机：{String}",
  "dj.allSongs": "全部歌曲",
  "dj.recentlyAdded": "最近添加",
  "dj.mergedIntoNewname": "已合并到“{newName}”。",
  "dj.renamedToNewname": "已重命名为“{newName}”。",
  "dj.deletedPlaylistNameSongs": "已删除歌单“{name}”。歌曲保留。",
  "dj.onYourPhone": "在你的手机上",
  "dj.karaokeReady": "可唱卡拉OK",
  "dj.removeFromPlaylist": "从歌单移除",
  "dj.removeFromPhone": "从手机移除",
  "dj.deleteFromLibrary": "从曲库删除",
  "dj.pluralOnYourPhone": "{plural} 加到你的手机 — {name} 正在获取。",
  "dj.pluralOffYourPhone": "{plural} 已从手机移除 — 仍在这台 Mac 上。",
  "dj.deletePluralFromYour": "从曲库删除 {plural}？",
  "dj.delete": "删除",
  "dj.nothingToSingHere": "这里没有可唱的。",
  "dj.nothingToPlayHere": "这里没有可播放的。",
  "dj.lookingForAnotherSource": "正在为“{title}”寻找其他来源。",
  "dj.titleIsAlreadyQueued": "“{title}”已在队列中。",
  "dj.deleteTitleFromYour": "从曲库删除“{title}”？",
  "dj.play": "播放",
  "dj.addToPhone": "加到手机",
  "dj.takeOffPhone": "从手机拿掉",
  "dj.showInFinder": "在访达中显示",
  "dj.findAnotherSource": "寻找其他来源",
  "dj.removeFromThisPlaylist": "从这个歌单移除",
  "dj.inOrder": "→ 顺序播放",
  "dj.lookingForLyricsTitle": "正在找歌词 — {title}",
  "dj.neverSynced": "从未同步",
  "dj.justNow": "刚刚",
  "dj.justIn": "新到",
  "dj.notPlayedInA": "很久没放了",
  "dj.onYourPhone2": "在你的手机上",
  "dj.lastPlayedShortdate": "上次播放 {shortDate}",
  "dj.neverPlayedHere": "这里从没放过",
  "dj.noLyricsFoundFor2": "没找到这首歌的歌词。",
  "dj.noneOfThoseAre": "那些都还没下载。",
  "dj.newSet": "新歌单",
  "dj.pluralQueuedTheyKeep": "{plural} 已加入队列 — 关掉 DJ 也会继续下载。",
  "dj.downloadsUnavailableYoutubeIs": "无法下载 — 这台 Mac 连不上 YouTube",
  "dj.yourDiscJockey": "你的 DJ",
  "dj.karaokeSingOnThe": "卡拉OK — 在大屏幕上唱",
  "dj.karaoke2": "🎤 卡拉OK",
  "dj.settings": "设置",
  "dj.tellDjAVibe": "告诉 DJ 一种氛围 — 它来编歌单；“获取”会下载带歌词的干净 MP3，随时同步到手机。",
  "dj.makeAListOf": "来一份 90 年代英文歌",
  "dj.build": "编排",
  "dj.orLetDjPick": "或者让 DJ 来挑：",
  "dj.aSetBuiltFrom": "根据 DJ 对你的了解编一份歌单",
  "dj.luckyFind": "✦ 手气不错",
  "dj.aSetFromWhat": "当下流行的歌单",
  "dj.trendingFind": "⌁ 流行趋势",
  "dj.hongKong90sTop": "香港 90 年代 50 大金曲",
  "dj.bestOfBeyond": "Beyond 精选",
  "dj.rainySundayJazz": "下雨周日的爵士",
  "dj.upbeatWorkoutMix": "活力健身混音",
  "dj.playNow": "现在播放",
  "dj.library": "曲库",
  "dj.yourLibrary": "你的曲库",
  "dj.playThisList": "播放这个列表",
  "dj.play2": "▶ 播放",
  "dj.playbackOrder": "播放顺序",
  "dj.tellYourPhoneTo": "让手机获取缺少的歌",
  "dj.sync": "⇅ 同步",
  "dj.searchYourLibrary": "搜索你的曲库…",
  "dj.dragToResizeThe": "拖动调整聊天宽度 — 双击复原",
  "dj.backToLibrary": "返回曲库",
  "dj.library2": "← 曲库",
  "dj.fullscreen": "全屏",
  "dj.turnTheMicrophoneOn": "打开麦克风",
  "dj.micLevel": "麦克风音量",
  "dj.shiftTheSongS": "调整歌曲的调以适合你的音域",
  "dj.lowerKey": "降调",
  "dj.raiseKey": "升调",
  "dj.previous": "上一首",
  "dj.playPause": "播放 / 暂停",
  "dj.next": "下一首",
  "dj.micMix": "麦克风与混音",
  "dj.mix": "🎚 混音",
  "dj.audioSetupMicSpeaker": "音频设置 — 麦克风和音箱",
  "dj.audio": "⚙ 音频",
  "dj.switchVersionOriginalKaraoke": "切换版本 — 原唱、卡拉OK伴奏或卡拉OK视频",
  "dj.version": "🎛 版本",
  "dj.upNext": "接下来",
  "dj.close": "关闭",
  "dj.turnTheMicOn": "先打开一次麦克风才能看到设备名称。",
  "dj.set.songsOf": "{synced}/{total} 首",
  "dj.set.wireless": "无线",
  "dj.set.carries": "你加到手机的歌，手机会自己获取并保存。",
  "dj.set.recommended": "推荐",
  "dj.set.pitch": "无线同步、离线播放、同步歌词 — 不用数据线，不用第三方播放器。",
  "dj.set.steps": "1. 在 iPhone 上安装 Linggen Mobile<br/>2. 用相机扫描这个二维码<br/>3. 在这台 Mac 上确认 — 音乐会自动同步",
  "dj.set.saved": "已保存 ✓",
  "dj.djSettings": "DJ 设置",
  "dj.libraryFolder": "曲库文件夹",
  "dj.whereDownloadedMp3sAre": "下载的 MP3 保存在这台 Mac 上的位置。",
  "dj.quality": "音质",
  "dj.bestAvailable": "最佳可用",
  "dj.karaokeSource": "卡拉OK来源",
  "dj.audioLighterDragLyrics": "音频 — 更轻，拖动歌词来对齐",
  "dj.videoLyricsOnScreen": "视频 — 屏幕上有歌词，保证同步",
  "dj.audioGrabsASmall": "音频会下载一个小的伴奏 MP3 并找歌词；视频会下载完整的卡拉OK片段。音频可以同步到手机。",
  "dj.fileNaming": "文件命名",
  "dj.checkingForPairedPhones": "正在检查已配对的手机…",
  "dj.save": "保存",
  "dj.default": "默认",
};

export const TABLES = { en, 'zh-Hans': zh };
