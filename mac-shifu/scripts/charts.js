// Minimal chart library for mac-shifu (zero dependencies)

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
 * Draw a donut chart from items.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label: string, value: number, color: string}>} items
 */
export function drawDonut(canvas, items) {
  const dpr = window.devicePixelRatio || 1;
  const size = 140;
  canvas.width = size * 2 * dpr;
  canvas.height = size * 2 * dpr;
  canvas.style.width = `${size * 2}px`;
  canvas.style.height = `${size * 2}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = size, cy = size, r = size - 20, inner = r * 0.6;
  const total = items.reduce((s, i) => s + (i.value || 0), 0);
  if (total === 0) {
    ctx.fillStyle = '#71717a';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cx, cy);
    return;
  }

  let angle = -Math.PI / 2;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const slice = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.arc(cx, cy, inner, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = item.color || COLORS[i % COLORS.length];
    ctx.fill();
    angle += slice;
  }
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
