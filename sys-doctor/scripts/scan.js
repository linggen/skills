// Client-side system scanner — runs bash commands directly via /api/bash,
// parses output into structured data for the dashboard. No model involved.

/** Escape a string for safe use inside single-quoted shell arguments. */
function shellEsc(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function bash(command, sessionId) {
  const body = { project_root: '/tmp', command };
  if (sessionId) body.session_id = sessionId;
  const resp = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseSystemInfo(swVersOut, cpuBrandOut, cpuCountOut, memOut, vmOut, uptimeOut, archOut, hostOut, cpuUsageOut) {
  const os = extractLine(swVersOut, 'ProductName:') || 'Unknown';
  const osVersion = extractLine(swVersOut, 'ProductVersion:') || '';
  const cpuBrand = cpuBrandOut.trim() || 'Unknown';
  const cpuCores = parseInt(cpuCountOut.trim()) || 0;
  const memBytes = parseInt(memOut.trim()) || 0;
  const memTotalGb = +(memBytes / (1024 ** 3)).toFixed(1);

  // Parse vm_stat for memory usage
  const pageSize = 16384;
  const active = parseInt(extractLine(vmOut, 'Pages active:')?.replace(/\D/g, '') || '0');
  const wired = parseInt(extractLine(vmOut, 'Pages wired')?.replace(/\D/g, '') || '0');
  const compressed = parseInt(extractLine(vmOut, 'Pages occupied by compressor:')?.replace(/\D/g, '') || '0');
  const memUsedGb = +((active + wired + compressed) * pageSize / (1024 ** 3)).toFixed(1);
  const memPercent = memTotalGb > 0 ? Math.round((memUsedGb / memTotalGb) * 100) : 0;

  // Parse uptime
  const uptimeMatch = uptimeOut.match(/up\s+(.+?),\s+\d+\s+user/);
  const uptime = uptimeMatch ? uptimeMatch[1].trim() : uptimeOut.trim().split(',')[0];

  // Parse CPU usage from top output: "CPU usage: 23.0% user, 9.0% sys, 68.0% idle"
  let cpuUsage = 0;
  const usageMatch = cpuUsageOut.match(/(\d+\.\d+)%\s+user.*?(\d+\.\d+)%\s+sys/);
  if (usageMatch) cpuUsage = Math.round(parseFloat(usageMatch[1]) + parseFloat(usageMatch[2]));

  // Parse load averages from uptime
  const loadMatch = uptimeOut.match(/load averages?:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  const loadAvg = loadMatch ? [+loadMatch[1], +loadMatch[2], +loadMatch[3]] : [];

  return {
    os: `${os} ${osVersion}`.trim(),
    cpuBrand,
    cpuCores,
    cpuUsage,
    loadAvg,
    memory: { total_gb: memTotalGb, used_gb: memUsedGb, percent: memPercent },
    uptime,
    hostname: hostOut.trim(),
    arch: archOut.trim(),
  };
}

function parseGpuInfo(profilerOut) {
  const cores = extractLine(profilerOut, 'Total Number of Cores:')?.trim() || '';
  const metal = extractLine(profilerOut, 'Metal Support:')?.trim() || '';
  const chipset = extractLine(profilerOut, 'Chipset Model:')?.trim() || '';
  return {
    chipset: chipset || null,
    cores: parseInt(cores) || 0,
    metal: metal || null,
  };
}

function parseBatteryInfo(pmsetOut) {
  // "Now drawing from 'AC Power'"
  // " -InternalBattery-0 (id=...)	100%; charged; 0:00 remaining present: true"
  const sourceMatch = pmsetOut.match(/drawing from '(.+?)'/);
  const source = sourceMatch ? sourceMatch[1] : null;
  const pctMatch = pmsetOut.match(/(\d+)%/);
  const percent = pctMatch ? parseInt(pctMatch[1]) : null;
  const statusMatch = pmsetOut.match(/;\s*(charging|charged|discharging|finishing charge)/i);
  const status = statusMatch ? statusMatch[1] : null;
  const timeMatch = pmsetOut.match(/(\d+:\d+)\s+remaining/);
  const remaining = timeMatch ? timeMatch[1] : null;
  // cycle count from ioreg
  return { percent, status, source, remaining };
}

function parseBatteryCycles(ioregOut) {
  const match = ioregOut.match(/"CycleCount"\s*=\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseNetworkInfo(ipOut, wifiOut, ifconfigOut) {
  const ip = ipOut.trim() || null;
  // "Current Wi-Fi Network: MyNetwork" or "You are not associated with an AirPort network."
  const wifiMatch = wifiOut.match(/Current Wi-Fi Network:\s*(.+)/);
  const wifi = wifiMatch ? wifiMatch[1].trim() : null;
  // Detect active interface
  const iface = ip ? 'en0' : null;
  return { ip, wifi, iface };
}

function parseIoStats(iostatOut) {
  // "              disk0       cpu    load average"
  // "    KB/t  tps  MB/s  us sy id   1m   5m   15m"
  // "   10.67  948  9.88  23  9 68  6.02 6.22 6.05"
  const lines = iostatOut.trim().split('\n');
  if (lines.length < 3) return null;
  const parts = lines[2].trim().split(/\s+/);
  return {
    kb_per_transfer: parseFloat(parts[0]) || 0,
    transfers_per_sec: parseInt(parts[1]) || 0,
    mb_per_sec: parseFloat(parts[2]) || 0,
  };
}

function parseDiskUsage(dfOut) {
  const lines = dfOut.trim().split('\n');
  if (lines.length < 2) return null;
  const parts = lines[1].split(/\s+/);
  return {
    total_gb: parseSize(parts[1] || ''),
    used_gb: parseSize(parts[2] || ''),
    free_gb: parseSize(parts[3] || ''),
    percent: parseInt(parts[4] || '0') || 0,
  };
}

function parseDirSizes(duOut) {
  return duOut.trim().split('\n').filter(Boolean).map(line => {
    const match = line.trim().match(/^([\d.]+[KMGTPE]i?)\s+(.+)$/);
    if (!match) return null;
    return { size_gb: parseSize(match[1]), path: match[2] };
  }).filter(Boolean).sort((a, b) => b.size_gb - a.size_gb);
}

// ---------------------------------------------------------------------------
// Size parsing
// ---------------------------------------------------------------------------

function parseSize(str) {
  if (!str) return 0;
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  const unit = str.replace(/[\d.]/g, '').replace(/i$/i, '').trim().toUpperCase();
  if (unit.startsWith('T')) return +(num * 1024).toFixed(1);
  if (unit.startsWith('G')) return +num.toFixed(2);
  if (unit.startsWith('M')) return +(num / 1024).toFixed(3);
  if (unit.startsWith('K')) return +(num / (1024 * 1024)).toFixed(6);
  if (unit.startsWith('B') || unit === '') {
    return num > 10000 ? +(num / (1024 ** 3)).toFixed(3) : num;
  }
  return num;
}

function extractLine(text, prefix) {
  const line = text.split('\n').find(l => l.includes(prefix));
  return line ? line.split(prefix).pop().trim() : null;
}

// ---------------------------------------------------------------------------
// Scan orchestrator
// ---------------------------------------------------------------------------

export async function runScan(mode, sessionId, onProgress) {
  const results = {};
  const rawOutputs = [];

  // ── System + Hardware info (quick + full) ──
  if (mode === 'quick' || mode === 'full') {
    onProgress('system', 'start');
    const [swVers, cpuBrand, cpuCount, mem, vm, uptime, arch, host, cpuUsage, gpuInfo, battery, cycles, ip, wifi, iostat, hwModel, hwAge, installedApps] = await Promise.all([
      bash('sw_vers 2>/dev/null || cat /etc/os-release 2>/dev/null | head -5', sessionId),
      bash('sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu 2>/dev/null | grep "Model name" | sed "s/.*: //"', sessionId),
      bash('sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null', sessionId),
      bash('sysctl -n hw.memsize 2>/dev/null || grep MemTotal /proc/meminfo 2>/dev/null', sessionId),
      bash('vm_stat 2>/dev/null | head -10', sessionId),
      bash('uptime', sessionId),
      bash('uname -m', sessionId),
      bash('hostname', sessionId),
      bash('top -l 1 -n 0 -s 0 2>/dev/null | grep "CPU usage"', sessionId),
      bash('system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset|Total Number of Cores|Metal Support"', sessionId),
      bash('pmset -g batt 2>/dev/null', sessionId),
      bash('ioreg -r -c AppleSmartBattery 2>/dev/null | grep CycleCount', sessionId),
      bash('ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk "{print \\$1}"', sessionId),
      bash('networksetup -getairportnetwork en0 2>/dev/null || iwgetid -r 2>/dev/null', sessionId),
      bash('iostat -c 1 2>/dev/null | tail -1', sessionId),
      // Hardware model + age
      bash('system_profiler SPHardwareDataType 2>/dev/null | grep -E "Model Name|Model Identifier|Serial|Memory|Chip"', sessionId),
      bash('sysctl -n kern.boottime 2>/dev/null', sessionId),
      // Usage pattern detection (which apps/tools are present)
      bash('ls /Applications 2>/dev/null | head -40; echo "---"; which docker xcode-select code brew node python3 ollama 2>/dev/null', sessionId),
    ]);

    results.system = parseSystemInfo(
      swVers.stdout, cpuBrand.stdout, cpuCount.stdout, mem.stdout, vm.stdout,
      uptime.stdout, arch.stdout, host.stdout, cpuUsage.stdout,
    );
    results.gpu = parseGpuInfo(gpuInfo.stdout);
    results.battery = parseBatteryInfo(battery.stdout);
    results.battery.cycleCount = parseBatteryCycles(cycles.stdout);
    results.network = parseNetworkInfo(ip.stdout, wifi.stdout, '');
    results.io = parseIoStats(iostat.stdout);
    results.hardware = parseHardwareModel(hwModel.stdout, hwAge.stdout, cpuBrand.stdout, arch.stdout);
    results.usage = parseUsagePattern(installedApps.stdout);

    rawOutputs.push(
      `=== System ===\n${swVers.stdout}\nCPU: ${cpuBrand.stdout} (${cpuCount.stdout} cores)\nUsage: ${cpuUsage.stdout}\nMemory: ${mem.stdout}\nVM: ${vm.stdout}\nUptime: ${uptime.stdout}`,
      `=== GPU ===\n${gpuInfo.stdout}`,
      `=== Battery ===\n${battery.stdout}\nCycles: ${cycles.stdout}`,
      `=== Network ===\nIP: ${ip.stdout}\nWifi: ${wifi.stdout}`,
      `=== IO ===\n${iostat.stdout}`,
    );
    onProgress('system', results.system);
  }

  // ── Disk usage (all modes) ──
  onProgress('disk', 'start');
  const [df, homeDirs, caches] = await Promise.all([
    bash('df -h /System/Volumes/Data 2>/dev/null || df -h /', sessionId),
    bash('du -sh ~/Desktop ~/Documents ~/Downloads ~/Library ~/Pictures ~/Music ~/Movies 2>/dev/null', sessionId),
    bash([
      'du -sh ~/.Trash 2>/dev/null',
      'du -sh ~/Library/Caches 2>/dev/null',
      'du -sh ~/Library/Developer/Xcode/DerivedData 2>/dev/null',
      'du -sh ~/Library/Developer/CoreSimulator 2>/dev/null',
    ].join('; '), sessionId),
  ]);

  const disk = parseDiskUsage(df.stdout);
  const dirs = parseDirSizes(homeDirs.stdout);
  const cacheEntries = parseDirSizes(caches.stdout);

  if (disk) {
    disk.top_dirs = dirs;
    results.disk = disk;
  }
  results.caches = cacheEntries;
  rawOutputs.push(`=== Disk ===\n${df.stdout}\n=== Home Dirs ===\n${homeDirs.stdout}\n=== Caches ===\n${caches.stdout}`);
  onProgress('disk', results.disk);

  // ── Garbage scan (full + deep) ──
  if (mode === 'full' || mode === 'deep') {
    onProgress('garbage', 'start');
    const [nodeModules, targets, oldDownloads] = await Promise.all([
      bash('find ~ -maxdepth 4 -name node_modules -type d -prune 2>/dev/null | while read d; do du -sh "$d" 2>/dev/null; done | sort -rh | head -10', sessionId),
      bash('find ~ -maxdepth 3 -name target -type d -prune 2>/dev/null | while read d; do du -sh "$d" 2>/dev/null; done | sort -rh | head -5', sessionId),
      bash('find ~/Downloads -maxdepth 1 -mtime +180 -type f 2>/dev/null | wc -l', sessionId),
    ]);
    results.garbage = [
      ...parseDirSizes(nodeModules.stdout).map(d => ({ ...d, category: 'node_modules', risk: 'review' })),
      ...parseDirSizes(targets.stdout).map(d => ({ ...d, category: 'rust_target', risk: 'review' })),
      ...cacheEntries.map(d => ({ ...d, category: 'cache', risk: 'safe' })),
    ];
    const oldCount = parseInt(oldDownloads.stdout.trim()) || 0;
    if (oldCount > 0) {
      results.garbage.push({ path: '~/Downloads (>6mo)', size_gb: 0, category: 'old_downloads', risk: 'review', count: oldCount });
    }
    rawOutputs.push(`=== Garbage ===\n${nodeModules.stdout}\n${targets.stdout}\nOld downloads: ${oldDownloads.stdout}`);
    onProgress('garbage', results.garbage);
  }

  // ── Security scan (full + deep) ──
  if (mode === 'full' || mode === 'deep') {
    onProgress('security', 'start');
    results.security = await runSecurityScan(sessionId);
    rawOutputs.push(`=== Security ===\n${JSON.stringify(results.security)}`);
    onProgress('security', results.security);
  }

  // ── Performance scan (full + deep) ──
  if (mode === 'full' || mode === 'deep') {
    onProgress('performance', 'start');
    results.performance = await runPerformanceScan(sessionId);
    rawOutputs.push(`=== Performance ===\n${JSON.stringify(results.performance)}`);
    onProgress('performance', results.performance);
  }

  // ── Deep file scan (deep only) ──
  if (mode === 'deep') {
    onProgress('deep_files', 'start');
    results.deepFiles = await runDeepFileScan(sessionId, (phase, data) => {
      onProgress(`deep_${phase}`, data);
    });
    rawOutputs.push(`=== Deep File Scan ===\n${JSON.stringify(results.deepFiles)}`);
    onProgress('deep_files', results.deepFiles);
  }

  results.summary = rawOutputs.join('\n\n');
  return results;
}

// ---------------------------------------------------------------------------
// Security scan
// ---------------------------------------------------------------------------

async function runSecurityScan(sessionId) {
  const [gatekeeper, sip, firewall, filevault, ports, remoteLogin] = await Promise.all([
    bash('spctl --status 2>/dev/null', sessionId),
    bash('csrutil status 2>/dev/null', sessionId),
    bash('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null', sessionId),
    bash('fdesetup status 2>/dev/null', sessionId),
    bash('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | tail -n +2 | head -20', sessionId),
    bash('systemsetup -getremotelogin 2>/dev/null', sessionId),
  ]);

  const checks = [];

  // Gatekeeper
  const gkOn = gatekeeper.stdout.toLowerCase().includes('enabled') ||
               gatekeeper.stdout.toLowerCase().includes('assessments enabled');
  checks.push({ label: 'Gatekeeper', status: gkOn ? 'green' : 'red', detail: gkOn ? 'enabled' : 'disabled' });

  // SIP
  const sipOn = sip.stdout.toLowerCase().includes('enabled');
  checks.push({ label: 'SIP', status: sipOn ? 'green' : 'red', detail: sipOn ? 'enabled' : 'disabled' });

  // Firewall
  const fwOn = firewall.stdout.toLowerCase().includes('enabled');
  checks.push({ label: 'Firewall', status: fwOn ? 'green' : 'yellow', detail: fwOn ? 'enabled' : 'off' });

  // FileVault
  const fvOn = filevault.stdout.toLowerCase().includes('on');
  checks.push({ label: 'FileVault', status: fvOn ? 'green' : 'yellow', detail: fvOn ? 'on' : 'off' });

  // Open ports
  const portLines = ports.stdout.trim().split('\n').filter(Boolean);
  const portCount = portLines.length;
  checks.push({
    label: 'Open ports',
    status: portCount > 10 ? 'yellow' : 'green',
    detail: portCount === 0 ? 'none' : `${portCount} listening`,
  });

  // Remote login
  const rlOff = remoteLogin.stdout.toLowerCase().includes('off');
  checks.push({ label: 'Remote Login', status: rlOff ? 'green' : 'yellow', detail: rlOff ? 'disabled' : 'enabled' });

  const passing = checks.filter(c => c.status === 'green').length;
  return { checks, passing, total: checks.length, ports: portLines.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Performance scan
// ---------------------------------------------------------------------------

async function runPerformanceScan(sessionId) {
  const [topMem, topCpu, launchAgentCount, swap] = await Promise.all([
    bash('ps axo rss,comm 2>/dev/null | sort -k1 -rn | head -10', sessionId),
    bash('ps axo %cpu,comm 2>/dev/null | sort -k1 -rn | head -10', sessionId),
    bash('ls ~/Library/LaunchAgents 2>/dev/null | wc -l', sessionId),
    bash('sysctl vm.swapusage 2>/dev/null', sessionId),
  ]);

  // Parse top memory processes
  const memProcs = topMem.stdout.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    const rssKb = parseInt(parts[0]) || 0;
    const name = parts.slice(1).join(' ').split('/').pop();
    return { name, memory_mb: Math.round(rssKb / 1024) };
  }).filter(p => p.memory_mb > 50);

  // Parse top CPU processes
  const cpuProcs = topCpu.stdout.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    const cpu = parseFloat(parts[0]) || 0;
    const name = parts.slice(1).join(' ').split('/').pop();
    return { name, cpu_percent: cpu };
  }).filter(p => p.cpu_percent > 1);

  // Launch agents count
  const launchAgents = parseInt(launchAgentCount.stdout.trim()) || 0;

  // Swap usage
  let swapUsedMb = 0;
  const swapMatch = swap.stdout.match(/used\s*=\s*([\d.]+)M/);
  if (swapMatch) swapUsedMb = parseFloat(swapMatch[1]);

  return { memProcs, cpuProcs, launchAgents, swapUsedMb };
}

// ---------------------------------------------------------------------------
// Deep file scan
// ---------------------------------------------------------------------------

// File type categories by extension
const FILE_CATEGORIES = {
  photos: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'raw', 'cr2', 'nef', 'tiff', 'tif', 'bmp', 'webp', 'svg', 'ico'],
  videos: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp'],
  audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'aiff'],
  documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'pages', 'numbers', 'key', 'csv', 'md'],
  archives: ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso', 'pkg', 'xip', 'deb', 'rpm'],
  code: ['js', 'ts', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'swift', 'rb', 'php', 'css', 'html', 'json', 'yaml', 'toml', 'sh'],
  databases: ['db', 'sqlite', 'sqlite3', 'mdb'],
};

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#3b82f6', '#06b6d4', '#374151'];

function categorizeExt(ext) {
  const lower = ext.toLowerCase();
  for (const [cat, exts] of Object.entries(FILE_CATEGORIES)) {
    if (exts.includes(lower)) return cat;
  }
  return 'other';
}

/**
 * Deep file scan — indexes files, detects types, finds large files and duplicates.
 * @param {string} sessionId
 * @param {function} onProgress - (phase, data) callback
 * @returns {Promise<object>}
 */
export async function runDeepFileScan(sessionId, onProgress) {
  const results = {};

  // Phase 1: File type breakdown (find + stat by extension)
  onProgress('indexing', 'start');

  // Get all files with size and extension in one pass
  // Output: "size_bytes path" per line
  const fileList = await bash(
    'find ~ -maxdepth 5 -type f -not -path "*/.*" -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/.Trash/*" 2>/dev/null | head -100000 | while read f; do stat -f "%z %N" "$f" 2>/dev/null || stat --format="%s %n" "$f" 2>/dev/null; done',
    sessionId
  );

  const files = [];
  const categoryTotals = {};
  let totalSize = 0;
  let fileCount = 0;

  for (const line of fileList.stdout.split('\n')) {
    if (!line.trim()) continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 1) continue;
    const sizeBytes = parseInt(line.substring(0, spaceIdx));
    const path = line.substring(spaceIdx + 1);
    if (isNaN(sizeBytes) || !path) continue;

    const sizeGb = sizeBytes / (1024 ** 3);
    const ext = (path.split('.').pop() || '').toLowerCase();
    const category = categorizeExt(ext);

    files.push({ path, sizeBytes, sizeGb, ext, category });
    categoryTotals[category] = (categoryTotals[category] || 0) + sizeGb;
    totalSize += sizeGb;
    fileCount++;
  }

  onProgress('indexing', { fileCount, totalSize });

  // Build file type breakdown for donut chart
  results.typeBreakdown = Object.entries(categoryTotals)
    .map(([cat, gb], i) => ({ label: cat.charAt(0).toUpperCase() + cat.slice(1), value: +gb.toFixed(2), color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    .sort((a, b) => b.value - a.value);
  results.totalFiles = fileCount;
  results.totalSizeGb = +totalSize.toFixed(1);

  // Phase 2: Large files (>50MB)
  onProgress('large_files', 'start');

  const largeFiles = files
    .filter(f => f.sizeBytes > 50 * 1024 * 1024)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 30);

  // Get last-accessed dates for large files
  if (largeFiles.length > 0) {
    const pathList = largeFiles.slice(0, 20).map(f => shellEsc(f.path)).join(' ');
    const ageResult = await bash(
      `for f in ${pathList}; do stat -f "%a %N" "$f" 2>/dev/null || stat --format="%X %n" "$f" 2>/dev/null; done`,
      sessionId
    );
    const ageMap = {};
    for (const line of ageResult.stdout.split('\n')) {
      if (!line.trim()) continue;
      const sp = line.indexOf(' ');
      if (sp < 1) continue;
      const ts = parseInt(line.substring(0, sp));
      const p = line.substring(sp + 1);
      if (!isNaN(ts)) ageMap[p] = ts;
    }

    const now = Date.now() / 1000;
    for (const f of largeFiles) {
      const ts = ageMap[f.path];
      if (ts) {
        const days = Math.round((now - ts) / 86400);
        f.ageDays = days;
        f.ageLabel = days > 365 ? `${Math.round(days / 365)}yr` : days > 30 ? `${Math.round(days / 30)}mo` : `${days}d`;
      }
    }
  }

  results.largeFiles = largeFiles.map(f => ({
    path: f.path.replace(/^\/Users\/\w+/, '~'),
    size: formatSizeBytes(f.sizeBytes),
    sizeGb: +f.sizeGb.toFixed(2),
    age: f.ageLabel || '?',
    ageDays: f.ageDays || 0,
    category: f.category,
    ext: f.ext,
  }));
  onProgress('large_files', results.largeFiles);

  // Phase 3: Duplicate detection (same size, then first-4KB hash)
  onProgress('duplicates', 'start');

  // Group files by size (only files > 1MB worth checking)
  const sizeGroups = {};
  for (const f of files) {
    if (f.sizeBytes < 1024 * 1024) continue;
    const key = f.sizeBytes.toString();
    if (!sizeGroups[key]) sizeGroups[key] = [];
    sizeGroups[key].push(f);
  }

  // Only groups with 2+ files of same size are candidates
  const candidates = Object.values(sizeGroups).filter(g => g.length >= 2);
  const duplicates = [];

  // Hash first 4KB of each candidate (batch to avoid too many bash calls)
  for (const group of candidates.slice(0, 50)) {
    const paths = group.map(f => f.path);
    const hashCmd = paths.map(p => {
      const sp = shellEsc(p);
      return `h=$(head -c 4096 ${sp} 2>/dev/null | md5 -q 2>/dev/null || head -c 4096 ${sp} 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1); printf '%s %s\\n' "$h" ${sp}`;
    }).join('; ');
    const hashResult = await bash(hashCmd, sessionId);

    const hashMap = {};
    for (const line of hashResult.stdout.split('\n')) {
      if (!line.trim()) continue;
      const sp = line.indexOf(' ');
      if (sp < 1) continue;
      const hash = line.substring(0, sp);
      const path = line.substring(sp + 1);
      if (hash.length < 8) continue;
      if (!hashMap[hash]) hashMap[hash] = [];
      hashMap[hash].push(path);
    }

    for (const [hash, paths] of Object.entries(hashMap)) {
      if (paths.length >= 2) {
        const sizeGb = group[0].sizeGb;
        duplicates.push({
          files: paths.map(p => p.replace(/^\/Users\/\w+/, '~')),
          copies: paths.length,
          sizeEach: formatSizeBytes(group[0].sizeBytes),
          wastedGb: +(sizeGb * (paths.length - 1)).toFixed(2),
          name: paths[0].split('/').pop(),
        });
      }
    }
  }

  duplicates.sort((a, b) => b.wastedGb - a.wastedGb);
  results.duplicates = duplicates.slice(0, 20);
  results.totalWastedGb = +(duplicates.reduce((s, d) => s + d.wastedGb, 0)).toFixed(1);

  onProgress('duplicates', results.duplicates);

  return results;
}

// ---------------------------------------------------------------------------
// Hardware model + age detection
// ---------------------------------------------------------------------------

function parseHardwareModel(profilerOut, bootTimeOut, cpuBrand, arch) {
  const result = { modelName: null, modelId: null, chip: null, year: null, age: null, isAppleSilicon: false };

  // Model name: "MacBook Pro" etc
  const nameMatch = profilerOut.match(/Model Name:\s*(.+)/);
  if (nameMatch) result.modelName = nameMatch[1].trim();

  // Model identifier: "Mac14,5" etc
  const idMatch = profilerOut.match(/Model Identifier:\s*(.+)/);
  if (idMatch) result.modelId = idMatch[1].trim();

  // Chip: "Apple M4 Pro" etc
  const chipMatch = profilerOut.match(/Chip:\s*(.+)/);
  if (chipMatch) result.chip = chipMatch[1].trim();

  // Determine Apple Silicon vs Intel
  result.isAppleSilicon = arch.trim() === 'arm64' || cpuBrand.includes('Apple');

  // Estimate year from model identifier or chip
  if (result.chip) {
    // Apple Silicon generation → approximate year
    const chipLower = result.chip.toLowerCase();
    if (chipLower.includes('m1')) result.year = 2020;
    else if (chipLower.includes('m2')) result.year = 2022;
    else if (chipLower.includes('m3')) result.year = 2023;
    else if (chipLower.includes('m4')) result.year = 2024;
    else if (chipLower.includes('m5')) result.year = 2025;
  }

  // Fallback: try to extract year from serial number or model id
  if (!result.year && result.modelId) {
    // Mac model identifiers don't directly encode year, but some patterns exist
    // For Intel Macs, use boot time as a rough proxy for when it was set up
    const btMatch = bootTimeOut.match(/sec\s*=\s*(\d+)/);
    if (btMatch) {
      // kern.boottime is last boot, not purchase date — not useful for age
      // Skip this; the model can infer from Intel chip generation
    }
  }

  // Calculate age
  if (result.year) {
    result.age = new Date().getFullYear() - result.year;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Usage pattern detection
// ---------------------------------------------------------------------------

function parseUsagePattern(appsOutput) {
  const result = { apps: [], tools: [], profile: 'general' };

  const parts = appsOutput.split('---');
  const appList = (parts[0] || '').trim().split('\n').filter(Boolean).map(a => a.replace('.app', '').trim());
  const toolPaths = (parts[1] || '').trim().split('\n').filter(Boolean);

  result.apps = appList;

  // Detect installed dev tools
  const tools = [];
  for (const t of toolPaths) {
    const name = t.split('/').pop();
    if (name) tools.push(name);
  }
  result.tools = tools;

  // Infer usage profile
  const hasXcode = appList.some(a => a.toLowerCase().includes('xcode')) || tools.includes('xcode-select');
  const hasDocker = tools.includes('docker');
  const hasVSCode = appList.some(a => a.toLowerCase().includes('visual studio code')) || tools.includes('code');
  const hasBrew = tools.includes('brew');
  const hasNode = tools.includes('node');
  const hasOllama = tools.includes('ollama');

  const devSignals = [hasXcode, hasDocker, hasVSCode, hasBrew, hasNode].filter(Boolean).length;
  if (devSignals >= 3) result.profile = 'developer';
  else if (devSignals >= 1) result.profile = 'technical';

  if (hasOllama) result.profile = 'ai-developer';

  const hasCreative = appList.some(a =>
    /photoshop|lightroom|premiere|final cut|logic pro|garageband|figma|sketch/i.test(a)
  );
  if (hasCreative && result.profile === 'general') result.profile = 'creative';

  result.summary = {
    isDeveloper: devSignals >= 2,
    hasXcode, hasDocker, hasVSCode, hasBrew, hasNode, hasOllama, hasCreative,
  };

  return result;
}

function formatSizeBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
