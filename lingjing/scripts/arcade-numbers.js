// arcade-numbers.js — the 游戏厅's 数值 page (Hanli 2026-10-27: 「所有物品, 任务的数值请写一个工具进行校验」; design.md
// § 数值系统). It only draws worlds/jiuding/levels/numbers.json, which tools/numbers.mjs --write makes: per layer,
// per source, the curves (hours per layer, days per 回, 灵石 against the shelves, the fights against their band) and
// the red list. Nothing here computes a number. A test page: nothing without ?dev=1.
import { esc } from './esc.js';

const q = new URLSearchParams(location.search);
const root = document.getElementById('numbers');
const tip = document.getElementById('tip');
const SRC = { pills: '丹药', boards: '小游戏', errands: '差事', shops: '铺子', gear: '装备', cards: '卡牌', fights: '斗法', layers: '每层时长', paces: '每回天数', gates: '关口等待', claims: '文字 vs 数值' };
const back = () => `arcade.html?${new URLSearchParams({ dev: '1', ...(q.get('save') ? { save: q.get('save') } : {}), ...(q.get('from') ? { from: q.get('from') } : {}) })}`;
const pct = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
const v = (x) => (x == null || x === '' ? '—' : x);

/* ── a chart: one y axis, lines over named x positions, an optional band and loose dots; each mark carries its tip ── */
const W = 600, H = 220, PAD = { l: 44, r: 12, t: 12, b: 34 };
function chart({ xs, series = [], dots = [], band = null, bands = null, y0 = 0, unit = '' }) {
  const ys = [...series.flatMap((s) => s.values), ...dots.map((d) => d.y), ...(band ?? []), ...(bands ?? []).flat()].filter(Number.isFinite);
  const top = niceTop(Math.max(...ys, 1)), iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const X = (i) => PAD.l + (xs.length < 2 ? iw / 2 : (i * iw) / (xs.length - 1)), Y = (y) => PAD.t + ih - ((y - y0) / (top - y0)) * ih;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => { const y = y0 + f * (top - y0); return `<line class="gridl" x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${PAD.l - 6}" y="${Y(y) + 4}" text-anchor="end">${fmt(y)}${unit}</text>`; }).join('');
  const every = Math.ceil(xs.length / 12);
  const xl = xs.map((x, i) => (i % every ? '' : `<text x="${X(i)}" y="${H - PAD.b + 16}" text-anchor="middle">${esc(x)}</text>`)).join('');
  const bandRect = band ? `<rect x="${PAD.l}" width="${iw}" y="${Y(band[1])}" height="${Y(band[0]) - Y(band[1])}" fill="var(--band)"/>` : '';
  const bandEach = (bands ?? []).map((b, i) => (b ? `<rect x="${X(i) - 4}" width="8" y="${Y(b[1])}" height="${Y(b[0]) - Y(b[1])}" rx="2" fill="var(--band)"/>` : '')).join('');
  const lines = series.map((s) => {
    const pts = s.values.map((y, i) => (Number.isFinite(y) ? [X(i), Y(y), i, y] : null)).filter(Boolean);
    const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x},${y}`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`
      + pts.map(([x, y, i, val]) => `<circle cx="${x}" cy="${y}" r="7" fill="transparent" data-tip="${esc(`${xs[i]} · ${s.name}: ${fmt(val)}${unit}`)}"/><circle cx="${x}" cy="${y}" r="3" fill="${s.color}" pointer-events="none"/>`).join('');
  }).join('');
  const marks = dots.map((d) => `<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="4.5" fill="${d.red ? 'var(--red)' : d.color ?? 'var(--s2)'}" stroke="var(--card)" stroke-width="2" data-tip="${esc(d.tip)}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img"><line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(y0)}" y2="${Y(y0)}"/>${grid}${bandRect}${bandEach}${xl}${lines}${marks}</svg>`;
}
const niceTop = (m) => { const p = 10 ** Math.floor(Math.log10(m)), n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const fmt = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100);
const legend = (items) => `<div class="legend">${items.map(([name, color, extra = '']) => `<span><i style="background:${color}${extra}"></i>${esc(name)}</span>`).join('')}</div>`;

/* ── a table: columns [label, key | fn, {left}] over rows; a row on the red list is marked ── */
function tableHtml(cols, rows, redIds = new Set()) {
  const head = cols.map(([label, , o]) => `<th class="${o?.left ? 'l' : ''}">${esc(label)}</th>`).join('');
  const cell = (row, [, key, o]) => `<td class="${o?.left ? 'l' : ''}">${esc(String(v(typeof key === 'function' ? key(row) : row[key])))}</td>`;
  const body = rows.map((r) => `<tr class="${redIds.has(r.id ?? r.key) ? 'is-red' : ''}">${cols.map((c) => cell(r, c)).join('')}</tr>`).join('');
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const section = (title, body, open = false) => `<details class="card"${open ? ' open' : ''}><summary>${esc(title)}</summary>${body}</details>`;

/* ── the page's parts ── */

function headHtml(r) {
  const s = r.stamp;
  return `<div class="head"><a href="${esc(back())}">← 游戏厅</a><h1>数值</h1><span class="dim small">${esc(s.date)} · ${esc(s.commit ?? '?')} · 斗法 ${s.deals || '未算'}${s.deals ? ' 局/场' : ''}</span></div>`
    + `<p class="dim small">node tools/numbers.mjs --write 重算 · node tools/numbers.mjs --apply 由总表推出 · ${r.defs.caveats.map(esc).join(' · ')}</p>`;
}

function redHtml(r) {
  const errs = r.errors.map((e) => `<li><b>硬错</b>${esc(e.where)}: ${esc(e.say)}</li>`).join('');
  const counts = {};
  for (const x of r.red) counts[x.src] = (counts[x.src] ?? 0) + 1;
  const chips = `<div class="chips"><button type="button" data-src="" aria-pressed="true">全部 ${r.red.length}</button>${Object.entries(counts).map(([k, n]) => `<button type="button" data-src="${esc(k)}" aria-pressed="false">${esc(SRC[k] ?? k)} ${n}</button>`).join('')}</div>`;
  const items = r.red.map((x) => `<li data-src="${esc(x.src)}"><b>${esc(SRC[x.src] ?? x.src)}</b>${esc(x.say)}</li>`).join('');
  return `<section class="card"><h2>红单 · ${r.errors.length} 硬错 · ${r.red.length} 偏离</h2>${chips}<ul class="red">${errs}${items}</ul></section>`;
}

/* 总表: the master table's knobs (balance.json `master`), everything else derived from them by --apply, and the overrides. */
function masterHtml(r) {
  const m = r.master;
  if (!m) return '';
  const rows = [];
  const walk = (v, path) => { if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); else rows.push({ id: path, path, value: Array.isArray(v) ? v.join(' · ') : String(v) }); };
  walk(m.knobs, '');
  const knobs = tableHtml([['旋钮', 'path', { left: true }], ['值', 'value', { left: true }]], rows);
  const over = m.overrides.length ? tableHtml([['例外', 'path', { left: true }], ['值', (o) => JSON.stringify(o.value)], ['为何', 'why', { left: true }]], m.overrides.map((o) => ({ ...o, id: o.path })))
    : '<p class="dim small">无例外</p>';
  return section(`总表 · ${rows.length} 个旋钮 · ${m.overrides.length} 个例外`, `<p class="dim small">改旋钮后 node tools/numbers.mjs --apply (先看差) · --apply --write (写入, 再算一遍)。其余数值都由此推出。</p>${knobs}<h3>例外 (overrides)</h3>${over}`, true);
}

function hoursChart(r) {
  const L = r.layers.filter((l) => l.target_h);
  const xs = L.map((l) => l.name.replace('练气', ''));
  const body = chart({ xs, unit: 'h', series: [
    { name: '曲线', color: 'var(--muted)', values: L.map((l) => l.curve_h ?? null), dash: true },
    { name: '目标', color: 'var(--s1)', values: L.map((l) => l.target_h), dash: true },
    { name: '每日一功课', color: 'var(--s2)', values: L.map((l) => l.chore_h) },
    { name: '无功课', color: 'var(--s3)', values: L.map((l) => l.rule_h) },
  ] });
  return `<section class="card"><h2>每层要玩几小时</h2>${body}${legend([['总表曲线 (master hours)', 'var(--muted)'], ['目标 (play_pay.hours, 按每回目标带拟合)', 'var(--s1)'], ['每日交一功课, 30 分/日', 'var(--s2)'], ['无功课 (只玩小游戏)', 'var(--s3)']])}</section>`;
}

function pacesChart(r) {
  const xs = r.paces.map((p) => p.label.replace('第', '').replace('回', ''));
  const body = chart({ xs, unit: '天', band: r.paces[0]?.band, series: [
    { name: '轻', color: 'var(--s3)', values: r.paces.map((p) => p.light) },
    { name: '中', color: 'var(--s1)', values: r.paces.map((p) => p.typical) },
    { name: '重', color: 'var(--s2)', values: r.paces.map((p) => p.heavy) },
  ] });
  return `<section class="card"><h2>每回几天 · 模型玩家</h2>${body}${legend([['轻', 'var(--s3)'], ['中 (typical)', 'var(--s1)'], ['重', 'var(--s2)'], [`中的目标带 ${r.paces[0]?.band?.join('–') ?? ''}`, 'var(--band)', ';height:10px']])}</section>`;
}

function wealthChart(r) {
  const hs = r.huis, at = new Map(hs.map((h, i) => [h.hui, i]));
  const dots = r.shops.filter((s) => at.has(s.hui)).map((s) => ({ x: at.get(s.hui), y: s.buy, red: s.wait >= r.stamp.limits.shop_wait || !s.afford, tip: `${s.name} ${s.buy} 灵石 · 自${s.hui}有卖 · 攒够: ${s.afford ?? '卷一内攒不够'}` }));
  const body = chart({ xs: hs.map((h) => h.label), unit: '', series: [{ name: '累计赚得 (中)', color: 'var(--s1)', values: hs.map((h) => h.earned) }], dots });
  return `<section class="card"><h2>灵石 · 赚得 vs 货架</h2>${body}${legend([['typical 玩家累计赚得 (未算杂役 · 开府)', 'var(--s1)'], ['货价 (在开卖的回)', 'var(--s2)', ';height:8px;width:8px;border-radius:50%'], ['等两回以上才攒够', 'var(--red)', ';height:8px;width:8px;border-radius:50%']])}</section>`;
}

function fightsChart(r) {
  if (!r.fights.length) return '<section class="card"><h2>斗法 · 胜率 vs 目标带</h2><p class="dim">未算: node tools/numbers.mjs --write</p></section>';
  const xs = r.fights.map((f) => f.at);
  const sl = r.stamp.limits.fight_slack;
  const dots = r.fights.map((f, i) => ({ x: i, y: f.win * 100, color: f.pool ? 'var(--s3)' : 'var(--s1)', red: f.win < f.band[0] - sl || f.win > f.band[1] + sl, tip: `${f.name} · ${f.layer}\n胜 ${pct(f.win)} (带 ${pct(f.band[0])}–${pct(f.band[1])})\n他 血${f.you?.hp} 牌${f.you?.deck} 甲${f.you?.armor} · 它 血${f.foe?.hp}` }));
  const body = chart({ xs, unit: '%', bands: r.fights.map((f) => [f.band[0] * 100, f.band[1] * 100]), dots });
  return `<section class="card"><h2>斗法 · 初遇胜率 vs 目标带 (lookahead bot)</h2>${body}${legend([['剧情斗法', 'var(--s1)', ';height:8px;width:8px;border-radius:50%'], ['游荡的怪', 'var(--s3)', ';height:8px;width:8px;border-radius:50%'], ['目标带', 'var(--band)', ';height:10px']])}</section>`;
}

function layersTable(r) {
  return section('每层 · 单位', tableHtml([
    ['层', 'name', { left: true }], ['门槛', 'need'], ['修为/分 (小游戏)', 'rate'], ['一夜闭关', 'night'], ['日功课', 'chore_day'], ['周功课', 'chore_week'], ['月功课', 'chore_month'],
    ['一场游荡斗法', 'haunt'], ['一件差事', 'errand'], ['目标 h', 'target_h'], ['功课 h', 'chore_h'], ['无功课 h', 'rule_h'],
    ['模型 h (中)', 'model_h'], ['模型天 轻·中·重', (l) => ['light', 'typical', 'heavy'].map((k) => l.model_days?.[k] ?? '—').join('·')], ['灵石/分 (中)', 'ls_min'],
  ], r.layers.map((l) => ({ ...l, id: l.key }))), true);
}

const gateCell = (x) => (x ? (x.below ? '差一层' : `${pct(x.pct)} · 约${x.wait ?? '—'}分`) : '—');
const SOURCES = [
  ['关口 · 阶段任务', 'gates', [['回', 'label'], ['关口', 'scene', { left: true }], ['层', 'layer'], ['中: 到时 · 要等', (g) => gateCell(g.typical)], ['一口气玩: 到时 · 要等', (g) => gateCell(g.session)], ['模型等了 (中, 分·天)', (g) => `${g.typical?.model_min ?? '—'}·${g.typical?.days ?? '—'}`], ['那里能做', (g) => g.reach.join(' · '), { left: true }]]],
  ['丹药', 'pills', [['丹', 'name', { left: true }], ['转', 'zhuan'], ['初遇', 'hui'], ['来源', (p) => p.sources.join(' · '), { left: true }], ['层', 'layer'], ['修为', 'xw'], ['占层', (p) => pct(p.pct)], ['抵小游戏分', 'play_min'], ['价', 'buy'], ['价合几分收入', 'price_min']]],
  ['小游戏', 'boards', [['游戏', 'name', { left: true }], ['类型', 'kind'], ['回', 'hui'], ['层', 'layer'], ['分钟', 'minutes'], ['修为', 'xw'], ['其中任务', 'own'], ['其中时长', 'play'], ['占层', (b) => pct(b.pct)], ['灵石', 'ls']]],
  ['差事', 'errands', [['差事', 'name', { left: true }], ['类', 'work'], ['回', 'hui'], ['层', 'layer'], ['修为', 'xw'], ['其中丹', 'pill'], ['占层', (e) => pct(e.pct)], ['灵石', 'ls']]],
  ['铺子', 'shops', [['货', 'name', { left: true }], ['类', 'kind'], ['开卖', 'hui'], ['价', 'buy'], ['回收', 'sell'], ['那回末累计赚得', 'earned'], ['攒够于', 'afford'], ['等几回', 'wait'], ['合几分收入', 'ls_min']]],
  ['装备', 'gear', [['装备', 'name', { left: true }], ['类', 'kind'], ['攻', 'atk'], ['防', 'def'], ['价', 'buy'], ['每点灵石', 'per_point'], ['同类中位', 'kind_median']]],
  ['卡牌 · 随从', 'cards', [['牌', 'name', { left: true }], ['费', 'cost'], ['攻', 'atk'], ['血', 'hp'], ['攻+血', 'stats'], ['同费中位', 'cost_median'], ['词条', 'keywords'], ['效果', (c) => (c.effect ? '有' : '')]]],
  ['斗法', 'fights', [['斗法', 'name', { left: true }], ['处', 'at'], ['层', 'layer'], ['胜', (f) => pct(f.win)], ['败', (f) => pct(f.lost)], ['带', (f) => `${pct(f.band[0])}–${pct(f.band[1])}`], ['回合', 'turns'], ['他 血·牌·甲', (f) => `${f.you?.hp}·${f.you?.deck}·${f.you?.armor}`], ['它 血·牌', (f) => `${f.foe?.hp}·${f.foe?.deck}`]]],
];

function sourcesHtml(r) {
  const red = (src) => new Set(r.red.filter((x) => x.src === src).map((x) => x.id));
  return SOURCES.map(([title, key, cols]) => section(`${title} · ${r[key].length}`, tableHtml(cols, r[key], red(key)))).join('');
}

function claimsHtml(r) {
  const rows = r.claims.checked.filter((c) => c.lang === 'zh').map((c) => ({ ...c, drift: (c.drift ?? []).map((d) => `${d.layer.replace('练气', '')}×${d.ratio}`).join(' ') }));
  const checked = tableHtml([['出处', (c) => `${c.where} ${c.id}`, { left: true }], ['原文', 'said', { left: true }], ['说的是', 'subject', { left: true }], ['日', 'days'], ['层', 'layer'], ['一夜闭关', 'night'], ['照说', 'claimed'], ['实付', 'actual'], ['比', 'ratio'], ['各层的比', 'drift', { left: true }]], rows);
  const unweighed = r.creatures.filter((c) => !c.weighed).map((c) => c.name).join(' · ');
  return section(`文字 vs 数值 · ${rows.length} 处`, `${checked}<p class="dim small">一日打坐 = 一夜闭关 (${r.defs.night_h} 时) 照该层付的修为。别的写数的文字 (修为 +N、N 时辰): ${r.claims.loose.length ? r.claims.loose.map((l) => esc(`${l.id}: ${l.text}`)).join(' · ') : '无'}</p>`, true)
    + section('还没称过的怪', `<p>${esc(unweighed || '无')}</p>`);
}

/* ── the hover tip and the red list's filter ── */
function wire() {
  root.addEventListener('mousemove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.textContent = t.dataset.tip; tip.style.display = 'block';
    tip.style.left = `${Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`; tip.style.top = `${e.clientY + 14}px`;
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.chips button');
    if (!b) return;
    for (const x of root.querySelectorAll('.chips button')) x.setAttribute('aria-pressed', String(x === b));
    for (const li of root.querySelectorAll('.red li[data-src]')) li.hidden = Boolean(b.dataset.src) && li.dataset.src !== b.dataset.src;
  });
}

async function main() {
  if (q.get('dev') !== '1') return;
  const res = await fetch('../worlds/jiuding/levels/numbers.json').catch(() => null);
  if (!res?.ok) { root.innerHTML = '<p>没有 numbers.json — node tools/numbers.mjs --write</p>'; return; }
  const r = await res.json();
  root.innerHTML = headHtml(r) + redHtml(r) + masterHtml(r) + `<div class="grid2">${hoursChart(r)}${pacesChart(r)}${wealthChart(r)}${fightsChart(r)}</div>`
    + layersTable(r) + claimsHtml(r) + sourcesHtml(r);
  wire();
}
main();
