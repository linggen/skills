// strings.js — the Memory page's words, in the one language the person set
// (Settings → Language). Same shape as CFO's: read once at start
// (loadLanguage), every renderer asks t(key, params) at render time.

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
  "mem.reviewQueue": "Review queue",
  "mem.dreamActivity": "Dream activity",
  "mem.aDreamRunIs": "A dream run is already in flight — the calendar updates as it works.",
  "mem.dreamMissionStartedRemembering": "Dream mission started — remembering undreamed days, then the forget sweep. The calendar updates as it works.",
  "mem.couldNotReachThe": "Could not reach the mission API — is the daemon running?",
  "mem.lastDreamAgeof": "last dream {ageOf}",
  "mem.lastDreamNever": "last dream: never",
  "mem.shortTermKeepsTtl": "short-term keeps {ttl_days}d",
  "mem.runDream": "Run dream",
  "mem.1DayIsWaiting": "1 day is waiting to be dreamed ({undreamed}).",
  "mem.lengthDaysAreWaiting": "{length} days are waiting to be dreamed — oldest {undreamed}.",
  "mem.1ReviewItemIs": "1 review item is waiting — the dream queued it for your judgment.",
  "mem.openissuesReviewItemsAre": "{openIssues} review items are waiting — the dream queued them for your judgment.",
  "mem.welcomeYourMemoryS": "Welcome — your memory's empty. It fills as you work; dream remembers each day.",
  "mem.browseAll": "Browse all ↗",
  "mem.allCaughtUpLast": "All caught up — last dream {ageOf}, {totalRows} rows across all tiers.",
  "mem.memoryHoldsTotalrowsRows": "Memory holds {totalRows} rows — nothing to dream tonight.",
  "mem.dreamRememberForgetEach": "Dream = remember + forget: each day's staging is judged once (durable signal promoted to long-term), then judged rows age out after the short-term window.",
  "mem.cancel": "Cancel",
  "mem.dreamRunning": "dream running…",
  "mem.noMemoryActivityOn": "No memory activity on this day.",
  "mem.newRowsArrivedAfter": "New rows arrived after the last dream.",
  "mem.close": "Close",
  "mem.today": "Today",
  "mem.hoverADayButton": "hover a day button for details · first click arms it, second click runs",
  "mem.workTheQueueWith": "Work the queue with the agent — evidence is gathered per item; you are asked one item at a time when your call is needed.",
  "mem.reviewQueueEmptyNothing": "Review queue empty — nothing needs your judgment.",
  "mem.chatBridgeUnavailable": "Chat bridge unavailable.",
  "mem.rowHasNoIdentifier": "Row has no identifier to delete by.",
  "mem.rowHasNoIdentifier2": "Row has no identifier to edit by.",
  "mem.start": "Start",
  "mem.dreamingInMission": "dreaming in mission →",
  "mem.dreamingInMission2": "dreaming in mission…",
  "mem.rowsRowsStagingToday": "{rows} rows staging today. Dreamable after midnight.",
  "mem.unjudgedOfRowsRows": "{unjudged} of {rows} rows await judgment.",
  "mem.dreamedPromotedPromotedRows": "Dreamed — {promoted} promoted, {rows} short-term rows kept.",
  "mem.dreamedPromotedPromotedForgotten": "Dreamed — {promoted} promoted, {forgotten} aged out.",
  "mem.isoNoMemoryActivity": "{iso} · no memory activity",
  "mem.isoTodayRowsRows": "{iso} · today · {rows} rows staging — dreamable after midnight",
  "mem.isoUndreamedUnjudgedRows": "{iso} · undreamed · {unjudged}/{rows} rows to judge — click for details",
  "mem.isoDreamedPromotedPromoted": "{iso} · dreamed · {promoted} promoted · {rows} short-term rows kept",
  "mem.isoScannedLogsWalked": "{iso} · scanned — logs walked, nothing awaiting judgment",
  "mem.isoNothingStagedTo": "{iso} · nothing staged to dream — scan first if you worked this day.",
  "mem.allFactsRestcount": "All facts ({restCount})",
  "mem.deleteFailedMessage": "Delete failed: {message}",
  "mem.editFailedMessage": "Edit failed: {message}",
  "mem.dow": "Sun|Mon|Tue|Wed|Thu|Fri|Sat",
  "mem.months": "January|February|March|April|May|June|July|August|September|October|November|December",
  "mem.memory": "Memory",
  "mem.dream": "📖 Dream",
  "mem.browse": "Browse ↗",
  "mem.rememberEveryPendingDay": "Remember every pending day (oldest first), then run the forget sweep.",
  "mem.openTheLingMem": "Open the ling-mem daemon's full data browser (filter / edit / delete row-level).",
};

const zh = {
  "mem.reviewQueue": "待审队列",
  "mem.dreamActivity": "梦境活动",
  "mem.aDreamRunIs": "已有一次梦境在运行 — 日历会随之更新。",
  "mem.dreamMissionStartedRemembering": "梦境任务已开始 — 先记住未处理的日子，再做遗忘清理。日历会随之更新。",
  "mem.couldNotReachThe": "连不上任务接口 — 守护进程在运行吗？",
  "mem.lastDreamAgeof": "上次梦境 {ageOf}",
  "mem.lastDreamNever": "上次梦境：从未",
  "mem.shortTermKeepsTtl": "短期记忆保留 {ttl_days} 天",
  "mem.runDream": "运行梦境",
  "mem.1DayIsWaiting": "有 1 天等待梦境处理（{undreamed}）。",
  "mem.lengthDaysAreWaiting": "有 {length} 天等待梦境处理 — 最早 {undreamed}。",
  "mem.1ReviewItemIs": "有 1 项待审 — 梦境把它留给你判断。",
  "mem.openissuesReviewItemsAre": "有 {openIssues} 项待审 — 梦境把它们留给你判断。",
  "mem.welcomeYourMemoryS": "欢迎 — 你的记忆还是空的。它会随你的工作积累；梦境会记住每一天。",
  "mem.browseAll": "浏览全部 ↗",
  "mem.allCaughtUpLast": "都处理完了 — 上次梦境 {ageOf}，各层共 {totalRows} 条。",
  "mem.memoryHoldsTotalrowsRows": "记忆中有 {totalRows} 条 — 今晚没有要处理的。",
  "mem.dreamRememberForgetEach": "梦境 = 记住 + 遗忘：每天暂存的内容判断一次（持久的信号提升为长期记忆），判断过的行在短期窗口后淡出。",
  "mem.cancel": "取消",
  "mem.dreamRunning": "梦境运行中…",
  "mem.noMemoryActivityOn": "这天没有记忆活动。",
  "mem.newRowsArrivedAfter": "上次梦境之后有新行进来。",
  "mem.close": "关闭",
  "mem.today": "今天",
  "mem.hoverADayButton": "悬停在日期按钮上看详情 · 第一次点击准备，第二次点击运行",
  "mem.workTheQueueWith": "和智能体一起处理队列 — 每项都会收集证据；需要你决定时一次只问一项。",
  "mem.reviewQueueEmptyNothing": "待审队列为空 — 没有需要你判断的。",
  "mem.chatBridgeUnavailable": "聊天桥不可用。",
  "mem.rowHasNoIdentifier": "这一行没有可用于删除的标识。",
  "mem.rowHasNoIdentifier2": "这一行没有可用于编辑的标识。",
  "mem.start": "开始",
  "mem.dreamingInMission": "在任务中做梦 →",
  "mem.dreamingInMission2": "在任务中做梦…",
  "mem.rowsRowsStagingToday": "今天有 {rows} 条暂存。午夜后可处理。",
  "mem.unjudgedOfRowsRows": "{rows} 条中有 {unjudged} 条等待判断。",
  "mem.dreamedPromotedPromotedRows": "已处理 — 提升 {promoted} 条，保留 {rows} 条短期记忆。",
  "mem.dreamedPromotedPromotedForgotten": "已处理 — 提升 {promoted} 条，淡出 {forgotten} 条。",
  "mem.isoNoMemoryActivity": "{iso} · 没有记忆活动",
  "mem.isoTodayRowsRows": "{iso} · 今天 · {rows} 条暂存 — 午夜后可处理",
  "mem.isoUndreamedUnjudgedRows": "{iso} · 未处理 · {unjudged}/{rows} 条待判断 — 点击看详情",
  "mem.isoDreamedPromotedPromoted": "{iso} · 已处理 · 提升 {promoted} · 保留 {rows} 条短期记忆",
  "mem.isoScannedLogsWalked": "{iso} · 已扫描 — 日志已过一遍，没有待判断的",
  "mem.isoNothingStagedTo": "{iso} · 没有可处理的暂存 — 如果这天有工作，先扫描。",
  "mem.allFactsRestcount": "全部事实（{restCount}）",
  "mem.deleteFailedMessage": "删除失败：{message}",
  "mem.editFailedMessage": "编辑失败：{message}",
  "mem.dow": "日|一|二|三|四|五|六",
  "mem.months": "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
  "mem.memory": "记忆",
  "mem.dream": "📖 做梦",
  "mem.browse": "浏览 ↗",
  "mem.rememberEveryPendingDay": "记住每个待处理的日子（从最早开始），然后运行遗忘清理。",
  "mem.openTheLingMem": "打开 ling-mem 守护进程的完整数据浏览器（按行筛选 / 编辑 / 删除）。",
};

export const TABLES = { en, 'zh-Hans': zh };
