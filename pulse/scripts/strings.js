// strings.js — Pulse's page chrome, in the one language the person set
// (Settings → Language). CFO's shape: read once at start, words at render
// time. Drafts, threads and the brief are content — never translated here.

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
  "pu.sec.progress": "Local progress",
  "pu.sec.mentions": "Mentions",
  "pu.sec.replies": "Replies due",
  "pu.sec.discovery": "Discovery",
  "pu.sec.discoveryHint": "cold opportunities · matched against brief",
  "pu.tab.needs": "Needs you",
  "pu.tab.progress": "Progress",
  "pu.justNow": "just now",
  "pu.repliesToYou": "Replies to you",
  "pu.worthAComment": "Worth a comment",
  "pu.theTopTwoEvery": "the top two · every thread is under its source tab",
  "pu.noDataForThis": "No data for this session yet. Pick a chip above, or type a goal in chat to start.",
  "pu.draftPosts": "✎ Draft posts",
  "pu.checkReplies": "↻ Check replies",
  "pu.rescanX": "↻ Rescan X",
  "pu.rescanHn": "↻ Rescan HN",
  "pu.rescanReddit": "↻ Rescan Reddit",
  "pu.rescanBluesky": "↻ Rescan Bluesky",
  "pu.checkMentions": "↻ Check mentions",
  "pu.refreshProgress": "↻ Refresh progress",
  "pu.lastScanReltime": "last scan {relTime}",
  "pu.nothingNeedsYouNo": "Nothing needs you — no replies waiting, no thread worth a comment (scanned {relTime}).",
  "pu.nothingScannedYetRescan": "Nothing scanned yet — ↻ Rescan reads your sources.",
  "pu.nothingInLabelYet": "Nothing in {label} yet — run a gather, or type a goal in chat.",
  "pu.firstReply": "First reply",
  "pu.latestReply": "Latest reply",
  "pu.reply": "Reply",
  "pu.replied": "Replied",
  "pu.draftReply": "Draft reply",
  "pu.draftComment": "Draft comment",
  "pu.nothingToShowIn": "Nothing to show in this section.",
  "pu.draftReply2": "✎ Draft reply",
  "pu.draftReplies": "✎ Draft replies",
  "pu.draftStarter": "✎ Draft starter",
  "pu.draftPost": "✎ Draft post",
  "pu.replyBack": "✎ Reply back",
  "pu.copyUrl": "🔗 Copy URL",
  "pu.markPosted": "☐ Mark posted",
  "pu.redditKarma": "Reddit karma",
  "pu.hnKarma": "HN karma",
  "pu.blueskyFollowers": "Bluesky followers",
  "pu.noLocalActivityIn": "No local activity in window — try expanding or check workspace path.",
  "pu.connectionToTheAgent": "Connection to the agent lost — reconnecting. Cards will land if the run is still going.",
  "pu.whatLingFinishedWithout": "{what}: Ling finished without updating this section.",
  "pu.gatheringLocalActivity": "Gathering local activity…",
  "pu.gatheringWebActivity": "Gathering web activity…",
  "pu.noUrl": "No URL",
  "pu.pressCToCopy": "Press ⌘C to copy",
  "pu.nothingToCopy": "Nothing to copy",
  "pu.hitRescanForA": "Hit ↻ Rescan for a fresh brief, or type a goal in chat.",
  "pu.browserExtensionNotConnected": "Browser extension not connected",
  "pu.declinedInTheBrowser": "Declined in the browser",
  "pu.signInToX": "Sign in to x.com first",
  "pu.xComDidNot": "x.com did not answer in time",
  "pu.nothingToPost": "Nothing to post",
  "pu.noPostToReply": "No post to reply to",
  "pu.alreadyRepliedToThis": "Already replied to this",
  "pu.dragToResizeChat": "Drag to resize chat panel",
  "pu.initFailed": "Pulse failed to initialize: {err}",
  "pu.configureSourcesTargetsAnd": "Configure sources, targets, and brief",
  "pu.settings": "⚙ Settings",
  "pu.closeSettings": "Close settings",
  "pu.reRunTheDaily": "Re-run the daily brief — gather local activity, then web activity",
  "pu.setUpPulse": "Set up Pulse",
  "pu.tellPulseWhatYou": "Tell Pulse what you're building and where your code lives.",
  "pu.openSettings": "Open Settings",
  "pu.runningTodaySBrief": "Running today's brief…",
  "pu.stop": "Stop",
  "pu.loading": "Loading…",
  "pu.pulseSettings": "Pulse · Settings",
  "pu.resetToDefaults": "Reset to defaults",
  "pu.save": "Save",
  "pu.yourBrief": "Your brief",
  "pu.workspace": "Workspace",
  "pu.mentions": "Mentions",
  "pu.defaultRegister": "Default register",
  "pu.websites": "Websites",
  "pu.addCustomFeed": "+ Add custom feed",
  "pu.sameAsDefault": "same as default",
  "pu.site.worksWithNothingPublic": "Works with nothing — public, no account. Keywords find recent threads on your topics, each with a drafted comment; your username adds replies to you and drops threads you already answered. You post by hand.",
  "pu.site.discoveryKeywordsTopicsTo": "Discovery keywords (topics to search, not brand names)",
  "pu.site.myHnUsernameDrops": "My HN username (drops threads I've already commented on)",
  "pu.site.eGLinggenCase": "e.g. linggen — case-sensitive, no prefix",
  "pu.site.worksWithNothingPublic2": "Works with nothing — public, no account. Your handle adds mentions and replies to you; keywords (topics, not brand names) find threads in your space.",
  "pu.site.myBlueskyHandleFor": "My Bluesky handle (for mention monitoring)",
  "pu.site.eGYournameBsky": "e.g. yourname.bsky.social — without the @ prefix",
  "pu.site.searchKeywordsCategoriesNot": "Search keywords (categories, not brand names)",
  "pu.site.worksWithoutAnAccount": "Works without an account, but thinly: a few subreddits per scan, and no replies to you. Your private RSS token (free, steps below) unlocks replies to you and every subreddit on each scan.",
  "pu.site.subreddits": "Subreddits",
  "pu.site.myRedditUsernameFor": "My Reddit username (for mention monitoring)",
  "pu.site.eGLinggenWithout": "e.g. linggen — without the u/ prefix",
  "pu.site.privateRssFeedToken": "Private RSS feed token (replies, mentions & reliable discovery)",
  "pu.site.pasteTheWholeFeed": "paste the whole feed URL, or just the feed=… token",
  "pu.site.needsTheFreeLinggen": "Needs the free linggen-browser extension and you signed in to x.com — without it, X stays empty. With it: mentions, replies to you, and a roster of accounts worth replying to, built for you. Pulse drafts; nothing is posted without your tap.",
  "pu.site.myXHandlePulse": "My X handle — Pulse reads your following to build + tag the target roster, and tracks your follower growth.",
  "pu.site.eGLinggenWithout2": "e.g. linggen — without the @ prefix",
  "pu.site.lobsteRsNewestFeed": "Lobste.rs newest feed.",
  "pu.site.recentCsAiCs": "Recent CS.AI / CS.LG / CS.CL papers.",
  "pu.site.builtInRssAggregator": "Built-in RSS aggregator. Add feeds with \"+ Add custom feed\" below — each shows as its own row.",
  "pu.site.todaySLaunchesUseful": "Today's launches. Useful for spotting competing products.",
  "pu.site.midLengthArticle500": "Mid-length article, 500–1000 words.",
  "pu.site.longFormPostConfigurable": "Long-form post, configurable length.",
  "pu.site.words": "Words",
  "pu.site.professionalTonePost150": "Professional-tone post, ~150–350 words.",
  "pu.site.newsletterPost6001500": "Newsletter post, 600–1500 words.",
  "pu.cancel": "Cancel",
  "pu.partlyOn": "Partly on",
  "pu.enabled": "Enabled",
  "pu.remove": "Remove",
  "pu.invalidUrl": "Invalid URL",
  "pu.feedAlreadyAdded": "Feed already added",
  "pu.settingsSaved": "✓ Settings saved",
  "pu.saveFailedMessage": "Save failed: {message}",
  "pu.failedToLoadMessage": "Failed to load: {message}",
  "pu.resetBriefAndSite": "Reset brief and site configuration to defaults? Your edits will be lost.",
  "pu.resetToDefaultsNot": "Reset to defaults (not yet saved).",
  "pu.resetFailedMessage": "Reset failed: {message}",
};

const zh = {
  "pu.sec.progress": "本地进展",
  "pu.sec.mentions": "提及",
  "pu.sec.replies": "待回复",
  "pu.sec.discovery": "发现",
  "pu.sec.discoveryHint": "新机会 · 按简报匹配",
  "pu.tab.needs": "待你处理",
  "pu.tab.progress": "进展",
  "pu.justNow": "刚刚",
  "pu.repliesToYou": "回复你的",
  "pu.worthAComment": "值得评论",
  "pu.theTopTwoEvery": "前两个 · 每个帖子都在对应来源的标签下",
  "pu.noDataForThis": "这个会话还没有数据。选上面的一个选项，或在聊天里输入目标开始。",
  "pu.draftPosts": "✎ 起草帖子",
  "pu.checkReplies": "↻ 检查回复",
  "pu.rescanX": "↻ 重新扫描 X",
  "pu.rescanHn": "↻ 重新扫描 HN",
  "pu.rescanReddit": "↻ 重新扫描 Reddit",
  "pu.rescanBluesky": "↻ 重新扫描 Bluesky",
  "pu.checkMentions": "↻ 检查提及",
  "pu.refreshProgress": "↻ 刷新进展",
  "pu.lastScanReltime": "上次扫描 {relTime}",
  "pu.nothingNeedsYouNo": "没有需要你处理的 — 没有待回复，也没有值得评论的帖子（扫描于 {relTime}）。",
  "pu.nothingScannedYetRescan": "还没扫描过 — ↻ 重新扫描会读取你的来源。",
  "pu.nothingInLabelYet": "{label}里还没有内容 — 运行一次收集，或在聊天里输入目标。",
  "pu.firstReply": "第一条回复",
  "pu.latestReply": "最新回复",
  "pu.reply": "回复",
  "pu.replied": "已回复",
  "pu.draftReply": "起草回复",
  "pu.draftComment": "起草评论",
  "pu.nothingToShowIn": "这一部分没有可显示的内容。",
  "pu.draftReply2": "✎ 起草回复",
  "pu.draftReplies": "✎ 起草回复",
  "pu.draftStarter": "✎ 起草开场",
  "pu.draftPost": "✎ 起草帖子",
  "pu.replyBack": "✎ 回复",
  "pu.copyUrl": "🔗 复制链接",
  "pu.markPosted": "☐ 标为已发布",
  "pu.redditKarma": "Reddit karma",
  "pu.hnKarma": "HN karma",
  "pu.blueskyFollowers": "Bluesky 关注者",
  "pu.noLocalActivityIn": "时间范围内没有本地活动 — 试试扩大范围，或检查工作区路径。",
  "pu.connectionToTheAgent": "与智能体的连接断开 — 正在重连。如果运行还在继续，卡片会陆续出现。",
  "pu.whatLingFinishedWithout": "{what}：Ling 结束了，但没有更新这一部分。",
  "pu.gatheringLocalActivity": "正在收集本地活动…",
  "pu.gatheringWebActivity": "正在收集网络动态…",
  "pu.noUrl": "没有链接",
  "pu.pressCToCopy": "按 ⌘C 复制",
  "pu.nothingToCopy": "没有可复制的",
  "pu.hitRescanForA": "点 ↻ 重新扫描获取新简报，或在聊天里输入目标。",
  "pu.browserExtensionNotConnected": "浏览器扩展未连接",
  "pu.declinedInTheBrowser": "在浏览器中被拒绝",
  "pu.signInToX": "请先登录 x.com",
  "pu.xComDidNot": "x.com 没有及时响应",
  "pu.nothingToPost": "没有可发布的",
  "pu.noPostToReply": "没有可回复的帖子",
  "pu.alreadyRepliedToThis": "已经回复过了",
  "pu.dragToResizeChat": "拖动调整聊天面板宽度",
  "pu.initFailed": "Pulse 初始化失败：{err}",
  "pu.configureSourcesTargetsAnd": "配置来源、目标和简报",
  "pu.settings": "⚙ 设置",
  "pu.closeSettings": "关闭设置",
  "pu.reRunTheDaily": "重新运行每日简报 — 先收集本地活动，再收集网络动态",
  "pu.setUpPulse": "设置 Pulse",
  "pu.tellPulseWhatYou": "告诉 Pulse 你在做什么、代码放在哪里。",
  "pu.openSettings": "打开设置",
  "pu.runningTodaySBrief": "正在运行今天的简报…",
  "pu.stop": "停止",
  "pu.loading": "加载中…",
  "pu.pulseSettings": "Pulse · 设置",
  "pu.resetToDefaults": "恢复默认",
  "pu.save": "保存",
  "pu.yourBrief": "你的简报",
  "pu.workspace": "工作区",
  "pu.mentions": "提及",
  "pu.defaultRegister": "默认语气",
  "pu.websites": "网站",
  "pu.addCustomFeed": "+ 添加自定义订阅源",
  "pu.sameAsDefault": "与默认相同",
  "pu.site.worksWithNothingPublic": "无需任何东西 — 公开，无需账号。关键词会找出你话题下的近期帖子，每条附一份评论草稿；填上用户名会加入回复你的内容，并去掉你已回答过的帖子。由你亲手发布。",
  "pu.site.discoveryKeywordsTopicsTo": "发现关键词（要搜索的话题，不是品牌名）",
  "pu.site.myHnUsernameDrops": "我的 HN 用户名（去掉我评论过的帖子）",
  "pu.site.eGLinggenCase": "例如 linggen — 区分大小写，无前缀",
  "pu.site.worksWithNothingPublic2": "无需任何东西 — 公开，无需账号。填上你的账号会加入提及和回复你的内容；关键词（话题，不是品牌名）会找出你领域里的帖子。",
  "pu.site.myBlueskyHandleFor": "我的 Bluesky 账号（用于监测提及）",
  "pu.site.eGYournameBsky": "例如 yourname.bsky.social — 不带 @ 前缀",
  "pu.site.searchKeywordsCategoriesNot": "搜索关键词（类别，不是品牌名）",
  "pu.site.worksWithoutAnAccount": "没有账号也能用，但比较有限：每次扫描几个子版块，且看不到回复你的内容。你的私有 RSS 令牌（免费，步骤见下）可以解锁回复你的内容，并在每次扫描时覆盖所有子版块。",
  "pu.site.subreddits": "子版块",
  "pu.site.myRedditUsernameFor": "我的 Reddit 用户名（用于监测提及）",
  "pu.site.eGLinggenWithout": "例如 linggen — 不带 u/ 前缀",
  "pu.site.privateRssFeedToken": "私有 RSS 订阅令牌（回复、提及和可靠的发现）",
  "pu.site.pasteTheWholeFeed": "粘贴完整的订阅链接，或只粘贴 feed=… 令牌",
  "pu.site.needsTheFreeLinggen": "需要免费的 linggen-browser 扩展，并且你已登录 x.com — 否则 X 会是空的。装上之后：提及、回复你的内容，以及为你整理的值得回复的账号名单。Pulse 只起草；不经你点击不会发布任何内容。",
  "pu.site.myXHandlePulse": "我的 X 账号 — Pulse 会读取你的关注列表来建立并标记目标名单，并追踪你的粉丝增长。",
  "pu.site.eGLinggenWithout2": "例如 linggen — 不带 @ 前缀",
  "pu.site.lobsteRsNewestFeed": "Lobste.rs 最新订阅。",
  "pu.site.recentCsAiCs": "最近的 CS.AI / CS.LG / CS.CL 论文。",
  "pu.site.builtInRssAggregator": "内置 RSS 聚合器。用下面的“+ 添加自定义订阅源”添加 — 每个单独一行。",
  "pu.site.todaySLaunchesUseful": "今天发布的产品。适合发现竞品。",
  "pu.site.midLengthArticle500": "中等长度文章，500–1000 词。",
  "pu.site.longFormPostConfigurable": "长文，长度可配置。",
  "pu.site.words": "词数",
  "pu.site.professionalTonePost150": "专业语气的帖子，约 150–350 词。",
  "pu.site.newsletterPost6001500": "通讯文章，600–1500 词。",
  "pu.cancel": "取消",
  "pu.partlyOn": "部分开启",
  "pu.enabled": "已开启",
  "pu.remove": "移除",
  "pu.invalidUrl": "无效的链接",
  "pu.feedAlreadyAdded": "订阅源已添加",
  "pu.settingsSaved": "✓ 设置已保存",
  "pu.saveFailedMessage": "保存失败：{message}",
  "pu.failedToLoadMessage": "加载失败：{message}",
  "pu.resetBriefAndSite": "把简报和站点配置恢复为默认？你的修改会丢失。",
  "pu.resetToDefaultsNot": "已恢复默认（尚未保存）。",
  "pu.resetFailedMessage": "恢复失败：{message}",
};

export const TABLES = { en, 'zh-Hans': zh };

const BY_EN = Object.fromEntries(Object.entries(en).map(([k, v]) => [v, k]));
/// Words declared as English data (the site list) in the person's language;
/// text this table does not know reads as written.
export const say = (text) => (text in BY_EN ? t(BY_EN[text]) : text);
