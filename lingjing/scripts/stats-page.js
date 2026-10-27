// stats-page.js — 游戏记录 (stats.html): the rules' `stats` report drawn, the model's targets beside the play.
// The builder's page: nothing without ?dev=1. Reads only; the one write is the log's own switch, which lives in Settings.
import { verb, SCRATCH } from './rules.js';
import { esc } from './esc.js';

const main = document.getElementById('main');
const DEV = new URLSearchParams(location.search).get('dev') === '1';

/* A moment in this machine's own time, as the player lived it: YYYY-MM-DD HH:MM. */
const when = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmt = (v, d = '—') => (v == null || Number.isNaN(v) ? d : String(v));
const pc = (v) => (v == null ? '—' : `${v}%`);
const OUTCOME = { won: '成', lost: '败', skipped: '跳过', left: '离开' };
const SOURCE = { story: '剧情', tray: '托盘', errand: '差事', today: '今日', tale: '传闻', arcade: '游戏厅', show: '灵展示' };
const CAT = { games: '小游戏', errands: '差事', fights: '斗法', story: '剧情', chores: '人间功课', seclusion: '闭关', shop: '买卖', other: '其他' };
const GATE = { cap: '回的修为上限', stamina: '体力耗尽' };

/* Real against a target: the bar is the real, the red tick the target; the scale fits both. */
function meter(real, target, max) {
  const top = Math.max(real ?? 0, Array.isArray(target) ? target[1] : target ?? 0, max ?? 0) || 1;
  const t = Array.isArray(target) ? target : target != null ? [target, target] : null;
  const ticks = t ? [...new Set(t)].map((x) => `<em style="left:calc(${(x / top) * 100}% - 1px)"></em>`).join('') : '';
  return `<div class="meter" title="实际 ${fmt(real)}${t ? ` · 目标 ${t[0] === t[1] ? t[0] : `${t[0]}–${t[1]}`}` : ''}"><i style="width:${Math.min(100, ((real ?? 0) / top) * 100)}%"></i>${ticks}</div>`;
}
const table = (head, rows, empty = '还没有记录') => (rows.length
  ? `<div class="wrap"><table><thead><tr>${head.map((h) => `<th class="${h.n ? 'n' : ''}">${esc(h.t ?? h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<p class="empty">${esc(empty)}</p>`);
const card = (title, note, body) => `<section class="card"><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}${body}</section>`;
const legend = '<p class="legend"><span><i></i>实际</span><span><em></em>设计目标</span></p>';

function tiles(rep) {
  const r = rep.retention;
  const t = [
    [r.days, '玩过的天数'], [r.sessions, '次数（坐下来玩）'], [fmt(r.sessions_per_day), '每天几次'], [fmt(r.active_min), '有效分钟（翻书也算 · 2 分钟无动静不计）'],
    [`${r.streak.current} / ${r.streak.longest}`, '连续天数 · 最长'], [pc(r.next_day), '次日还来'], [rep.income.xw, '修为（记录内）'], [rep.lines, '记录条数'],
  ];
  return `<div class="tiles">${t.map(([v, l]) => `<div class="tile"><b>${esc(fmt(v))}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
}

function daysCard(rep) {
  const d = rep.retention.per_day.slice(-30), top = Math.max(1, ...d.map((x) => x.active_min));
  const bars = d.length ? `<div class="days">${d.map((x) => `<i style="height:${Math.max(3, (x.active_min / top) * 100)}%" title="${esc(x.day)} · ${x.active_min} 分钟 · ${x.sessions} 次 · ${x.boards} 局 · ${x.fights} 斗"></i>`).join('')}</div>` : '';
  const rows = d.slice().reverse().slice(0, 10).map((x) => `<tr><td>${esc(x.day)}</td><td class="n">${x.sessions}</td><td class="n">${x.active_min}</td><td class="n">${x.boards}</td><td class="n">${x.fights}</td></tr>`);
  return card('每天', `最近 30 天的有效分钟（悬停看当天）；设计：每天约 ${fmt(rep.model?.perDay, 30)} 分钟`, bars + table(['日期', { t: '次', n: 1 }, { t: '分钟', n: 1 }, { t: '小游戏', n: 1 }, { t: '斗法', n: 1 }], rows));
}

function timeCard(rep, names) {
  const t = rep.time;
  const hui = t.hui.map((h) => `<tr><td>${esc(names.hui[h.hui] ?? h.hui ?? '—')}</td><td class="n">${h.active_min}</td><td>${meter(h.active_min, h.target_min)}</td><td class="n">${h.days}</td></tr>`);
  const layer = t.layer.map((l) => `<tr><td>${esc(`${names.tiers[l.tier] ?? l.tier}${l.layer}层`)}</td><td class="n">${l.active_min}</td><td>${meter(l.active_min, l.target_min)}</td><td class="n">${fmt(l.target_min)}</td><td class="n">${l.days}</td></tr>`);
  const ht = t.hui_target ? `${t.hui_target[0]}–${t.hui_target[1]}` : '—';
  return card('每回 · 每层的时间', `回的目标：普通玩家 ${ht} 分钟（balance.json bands × 每天分钟）；层的目标：练气一层 ${t.layer_rule.first} 小时，每层 +${t.layer_rule.per} 小时`,
    legend + table(['回', { t: '分钟', n: 1 }, '实际 vs 目标', { t: '天', n: 1 }], hui, '还没有计时')
    + table(['层', { t: '分钟', n: 1 }, '实际 vs 目标', { t: '目标分钟', n: 1 }, { t: '天', n: 1 }], layer, ''));
}

function boardsCard(rep, names) {
  const rows = rep.boards.map((b) => {
    const over = b.designed_min != null && b.median_min != null && b.median_min > b.designed_min * 1.5;
    const src = Object.entries(b.sources).map(([k, v]) => `${SOURCE[k] ?? k} ${v}`).join(' · ');
    return `<tr><td title="${esc(b.game)}">${esc(names.games[b.game] ?? b.game)}</td><td>${esc(b.mechanic ?? '')}</td><td class="n">${b.n}</td>`
      + `<td class="n${over ? ' over' : ''}">${fmt(b.median_min)}</td><td>${meter(b.median_min, b.designed_min)}</td><td class="n">${fmt(b.designed_min)}</td>`
      + `<td class="n">${pc(b.won)}</td><td class="n">${pc(b.lost)}</td><td class="n">${pc(b.skipped)}</td><td class="n">${pc(b.left)}</td><td class="n">${b.retries}</td><td class="n">${b.hints}</td><td>${esc(src)}</td></tr>`;
  });
  return card('小游戏', '中位有效分钟 vs 设计分钟（play_pay.minutes，按玩法）；红字 = 超过设计 1.5 倍', legend + table(['游戏', '玩法', { t: '局', n: 1 }, { t: '中位分钟', n: 1 }, '实际 vs 设计', { t: '设计', n: 1 }, { t: '成', n: 1 }, { t: '败', n: 1 }, { t: '跳过', n: 1 }, { t: '离开', n: 1 }, { t: '重来', n: 1 }, { t: '提示', n: 1 }, '从哪开'], rows));
}

function fightsCard(rep, names) {
  const rows = rep.fights.map((f) => {
    const off = f.bot != null && f.won != null && Math.abs(f.won - f.bot) >= 20;
    return `<tr><td>${esc(names.beasts[f.beast] ?? f.beast)}</td><td class="n" title="打完 ${f.fought} 场">${f.n}</td><td class="n${off ? ' over' : ''}">${pc(f.won)}</td><td>${meter(f.won, f.bot, 100)}</td><td class="n">${pc(f.bot)}</td><td>${esc(f.chip ?? '—')}</td><td class="n">${fmt(f.turns)}</td><td class="n">${fmt(f.hand)}</td><td class="n">${fmt(f.min)}</td></tr>`;
  });
  return card('斗法', '实际胜率 vs 机器人胜率（开打时牌上的难度：fightodds.js 的十局）；红字 = 相差 20 点以上', legend + table(['妖兽', { t: '场', n: 1 }, { t: '胜', n: 1 }, '实际 vs 机器人', { t: '机器人', n: 1 }, '难度', { t: '回合', n: 1 }, { t: '牌', n: 1 }, { t: '分钟', n: 1 }], rows));
}

function readingCard(rep) {
  const r = rep.reading;
  return card('读故事', `设计阅读速度 ${fmt(r.model_chars_per_min)} 字/分钟`,
    table(['段落', { t: '字', n: 1 }, { t: '读的分钟', n: 1 }, { t: '字/分钟', n: 1 }, { t: '跳过', n: 1 }], r.passages ? [`<tr><td>${r.passages}</td><td class="n">${r.chars}</td><td class="n">${r.minutes}</td><td class="n">${fmt(r.chars_per_min)}</td><td class="n">${pc(r.skipped)}</td></tr>`] : []));
}

function incomeCard(rep) {
  const i = rep.income;
  const rows = i.by.map((c) => `<tr><td>${esc(CAT[c.cat] ?? c.cat)}</td><td class="n">${c.xw}</td><td class="n">${pc(c.share)}</td><td>${meter(c.share, c.plan, 100)}</td><td class="n">${c.plan != null ? `${c.plan}%` : '—'}</td><td class="n">${c.ls}</td><td class="n">${c.n}</td></tr>`);
  return card('修为从哪来', `计划：小游戏约 ${i.plan.games * 100}%，差事约 ${i.plan.errands * 100}%，其余 ${i.plan.rest * 100}%（balance.json _play_pay）· 实际其余 ${pc(i.rest_share)} · 花掉灵石 ${i.ls_spent}`,
    legend + table(['来源', { t: '修为', n: 1 }, { t: '占比', n: 1 }, '实际 vs 计划', { t: '计划', n: 1 }, { t: '灵石', n: 1 }, { t: '次', n: 1 }], rows, '还没有收入'));
}

function stallsCard(rep, names) {
  const s = rep.stalls;
  const gates = s.gates.map((g) => `<tr><td>${esc(GATE[g.what] ?? g.what)}</td><td class="n">${g.waited_min}</td><td>${esc(names.hui[g.hui] ?? g.hui ?? '')}</td><td>${esc(g.scene ?? '')}</td><td>${esc(when(g.at))}</td></tr>`);
  const sig = s.signals.map((x) => `<tr><td>${esc(x.what === 'board-idle' ? '小游戏无操作' : x.what)}</td><td>${esc(x.board ?? '')}</td><td>${esc(x.scene ?? '')}</td><td class="n">${x.n}</td><td class="n">${x.idle_min}</td></tr>`);
  const ref = s.refusals.map((x) => `<tr><td>${esc(x.verb)}</td><td>${esc(x.why)}</td><td class="n">${x.n}</td><td class="n">${x.streak}</td></tr>`);
  const err = s.errors.map((x) => `<tr><td>${esc(x.where)}</td><td style="white-space:normal">${esc(x.msg)}</td><td class="n">${x.n}</td></tr>`);
  const ends = s.day_ends.slice().reverse().map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(when(d.at).slice(11))}</td><td>${esc(names.hui[d.hui] ?? d.hui ?? '')}</td><td>${esc(d.scene ?? '')}</td><td>${esc(d.kind)}${d.what ? ` · ${esc(d.what)}` : ''}${d.outcome ? ` · ${esc(OUTCOME[d.outcome] ?? d.outcome)}` : ''}</td></tr>`);
  return card('卡在哪', `等关口最久的（${s.gates_shut} 次进入）· 卡死信号 · 被拒的点击 · 页面报错 · 每天在哪停下`,
    table(['关口', { t: '等了分钟', n: 1 }, '回', '场景', '时间'], gates, '没有等过关口')
    + table(['信号', '小游戏', '场景', { t: '次', n: 1 }, { t: '最长分钟', n: 1 }], sig, '没有卡死信号')
    + table(['动作', '被拒原因', { t: '次', n: 1 }, { t: '最长连击', n: 1 }], ref, '没有被拒')
    + table(['哪里', '报错', { t: '次', n: 1 }], err, '没有报错')
    + table(['日期', '停在', '回', '场景', '最后做的'], ends, ''));
}

async function draw() {
  if (!DEV) { main.innerHTML = '<div class="gate">开发者页面 · ?dev=1</div>'; return; }
  let out;
  // The data channel may take a while to come up in a fresh tab (opened from the 游戏厅): one more try before saying so.
  try { out = await verb('stats').catch(() => verb('stats')); } catch (e) { main.innerHTML = `<div class="gate warn">${esc(String(e.message || e))}</div>`; return; }
  if (!out?.ok) { main.innerHTML = `<div class="gate warn">${esc(out?.refused ?? out?.error ?? '读不到')}</div>`; return; }
  const rep = out.report, names = out.names ?? { hui: {}, beasts: {}, games: {}, tiers: {} };
  const save = out.save === 'main' ? '主存档' : `测试存档 · ${out.save}`;
  const range = rep.retention.first ? `${rep.retention.first} → ${rep.retention.last}` : '还没有记录';
  main.innerHTML = `<header class="top"><h1>游戏记录</h1><span class="sub">${esc(save)} · ${esc(range)} · 设备 ${esc(rep.devices.join(' · ') || '—')}${out.off ? ' · <b class="warn">记录已关（设置）</b>' : ''} · 只在本机</span></header>`
    + tiles(rep)
    + `<div class="grid">${timeCard(rep, names)}${daysCard(rep)}${boardsCard(rep, names)}${fightsCard(rep, names)}${incomeCard(rep)}${readingCard(rep)}${stallsCard(rep, names)}</div>`;
}

draw();
