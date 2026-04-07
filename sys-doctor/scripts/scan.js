// Client-side system scanner — runs bash commands directly via /api/bash,
// parses output into structured data for the dashboard. No model involved.

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
    const [swVers, cpuBrand, cpuCount, mem, vm, uptime, arch, host, cpuUsage, gpuInfo, battery, cycles, ip, wifi, iostat] = await Promise.all([
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

  // ── Garbage scan (full only) ──
  if (mode === 'full') {
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

  results.summary = rawOutputs.join('\n\n');
  return results;
}
