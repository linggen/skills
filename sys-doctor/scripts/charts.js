// Minimal chart library for sys-doctor (zero dependencies)

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c084fc',
  '#e879f9', '#f472b6', '#fb7185', '#f87171',
  '#fb923c', '#fbbf24', '#a3e635', '#4ade80',
];

/**
 * Draw horizontal bar chart for disk usage.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{path: string, size_gb: number}>} dirs
 * @param {number} totalGb
 */
export function drawDiskBars(canvas, dirs, totalGb) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!dirs || dirs.length === 0) {
    ctx.fillStyle = '#71717a';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', W / 2, H / 2);
    return;
  }

  const barH = 26;
  const gap = 6;
  const labelW = 130;
  const sizeW = 70;
  const barAreaW = W - labelW - sizeW - 20;
  const maxGb = totalGb || Math.max(...dirs.map(d => d.size_gb));

  dirs.forEach((dir, i) => {
    const y = i * (barH + gap) + 12;
    const barW = Math.max(2, (dir.size_gb / maxGb) * barAreaW);

    // Label
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const label = dir.path
      .replace(/^\/Users\/\w+/, '~')
      .replace(/^\/home\/\w+/, '~');
    ctx.fillText(label, labelW - 10, y + barH / 2);

    // Bar
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.beginPath();
    roundRect(ctx, labelW, y, barW, barH, 4);
    ctx.fill();

    // Size label
    ctx.fillStyle = '#d4d4d8';
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(formatSize(dir.size_gb), labelW + barW + 8, y + barH / 2);
  });
}

/**
 * Draw a donut chart showing used vs free disk.
 * @param {HTMLCanvasElement} canvas
 * @param {number} usedGb
 * @param {number} totalGb
 */
export function drawDiskDonut(canvas, usedGb, totalGb) {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const lineW = 14;
  const pct = totalGb > 0 ? usedGb / totalGb : 0;

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Used ring
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + pct * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = pct > 0.9 ? '#ef4444' : pct > 0.75 ? '#eab308' : '#6366f1';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center text
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '700 20px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(pct * 100)}%`, cx, cy - 6);
  ctx.fillStyle = '#71717a';
  ctx.font = '11px system-ui';
  ctx.fillText(`${formatSize(usedGb)} / ${formatSize(totalGb)}`, cx, cy + 14);
}

function formatSize(gb) {
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb * 1024)} MB`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
