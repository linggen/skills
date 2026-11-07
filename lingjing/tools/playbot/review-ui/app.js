// 试玩台 — the play bot's review page. Routes: #/ 首页 · #/run/<id>[?size=] 一轮 · #/shot/<id>/<n> 一张 · #/selftest 自检.
// Everything comes from review-server.mjs; the only write is an answer (POST /api/answer).
'use strict';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;
const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

const VERDICT = { pass: '过', fail: '不过', pending: '待定' };
const WHY = {
  'no-review': '还没有审看', 'other-run': '审看属于另一轮', 'hard-findings': '有硬伤', 'note-fail': '有截图不过', 'reviewer-fail': '审看判不过',
  'claude-not-done': 'Claude 还没看完', 'waiting-for-hanli': '等你看', pass: '',
};
const KIND = { play: '试玩', gate: 'gate', selftest: '自检', part: '自检' };
const ST = { caught: '抓到', clean: '干净', missed: '漏掉', false: '误报', 'not-run': '没跑' };
const pill = (v, extra = '') => `<span class="pill ${esc(v)}">${esc(VERDICT[v] ?? v)}${extra ? ` · ${esc(extra)}` : ''}</span>`;
const when = (at) => (at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const shotUrl = (run, file) => `/shot?id=${enc(run)}&f=${enc(file)}`;

/** A shot with its flags drawn on it: red a hard finding, yellow a layout warn, blue dashed where Claude asks to look. */
function thumb(run, s, { flags = [], box = null, cls = '', style = '', badge = '' } = {}) {
  const [W, H] = s.px ?? (/(\d+)x(\d+)/.exec(s.size ?? '') ?? [0, 430, 932]).slice(1).map(Number);
  const pct = (x, y, w, h) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%`;
  const rects = [];
  for (const f of flags) {
    if (Array.isArray(f.rect) && f.rect.length === 4) rects.push(`<i class="flag ${f.hard ? 'hard' : ''}" style="${pct(...f.rect)}"></i>`);
    else if (f.why === 'blank-band' && f.top != null) rects.push(`<i class="flag" style="${pct(0, f.top, W, f.height)}"></i>`);
  }
  if (box && [box.x, box.y, box.w, box.h].every((n) => typeof n === 'number')) rects.push(`<i class="flag ask" style="${pct(box.x, box.y, box.w, box.h)}"></i>`);
  const hard = flags.some((f) => f.hard), any = flags.length > 0;
  const lbadge = any ? `<span class="badge l ${hard ? '' : 'warnonly'}">${hard ? '硬伤' : '提示'}</span>` : '';
  return `<span class="thumb ${cls}" style="aspect-ratio:${W}/${H};--r:${W / H};${style}"><img loading="lazy" src="${shotUrl(run, s.file)}" alt="${esc(s.file)}">${rects.join('')}${lbadge}${badge}</span>`;
}

/** The badge for Claude's call and Hanli's answer on a shot. */
function noteBadge(state) {
  if (!state) return '';
  if (state.hanli) return `<span class="badge ${state.hanli.ok ? 'ok' : 'fail'}">你：${state.hanli.ok ? '行' : '不行'}</span>`;
  if (state.result === 'waiting') return '<span class="badge unsure">待你看</span>';
  if (state.result === 'fail') return '<span class="badge fail">不过</span>';
  return '';
}

/** 行 / 不行 with a line. `onDone` gets the server's answer. */
function answerBar(run, shot, current, onDone) {
  const id = `a${Math.random().toString(36).slice(2)}`;
  setTimeout(() => {
    const root = document.getElementById(id);
    if (!root) return;
    root.querySelectorAll('button[data-ok]').forEach((b) => b.addEventListener('click', async () => {
      root.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      const said = root.querySelector('input').value.trim();
      try {
        const r = await fetch('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run, shot, ok: b.dataset.ok === '1', said }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        onDone(j);
      } catch (e) {
        root.querySelector('.err').textContent = `没存上：${e.message}`;
        root.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      }
    }));
  });
  const was = current ? `<div class="small muted">你答过：${current.ok ? '行' : '不行'}${current.said ? ` — ${esc(current.said)}` : ''}（${esc(when(current.at))}）</div>` : '';
  return `<div class="answerbar" id="${id}">${was}<input type="text" maxlength="200" placeholder="一句话（可不写）" value="${esc(current?.said ?? '')}">
    <div class="btns"><button class="yes" data-ok="1">行</button><button class="no" data-ok="0">不行</button></div><div class="err small" style="color:var(--fail)"></div></div>`;
}

/* ── 首页 ── */
async function home() {
  const d = await get('/api/home');
  const q = d.queue;
  const qhtml = q.length ? `<div class="queue">${q.map((it, i) => `
    <div class="qitem" id="q${i}">
      <a href="#/shot/${enc(it.run)}/${it.idx}">${thumb(it.run, it.shot, { flags: it.flags, box: it.box })}</a>
      <div class="qbody">
        <div class="small muted">${esc(it.run_name)} · ${esc(it.shot.where || it.shot.size)} · ${esc(it.shot.tag)}</div>
        <div class="ask">${esc(it.ask || '这张行不行？')}</div>
        ${it.answer ? `<div class="small muted">Claude：${esc(it.answer)}</div>` : ''}
        ${it.before.length ? `<div class="small">以前同样的问题，你说：${it.before.map((b) => `${b.ok ? '行' : '不行'}${b.said ? `（${esc(b.said)}）` : ''}`).join('；')}</div>` : ''}
        ${answerBar(it.run, it.shot.file, null, () => { const el = document.getElementById(`q${i}`); el.classList.add('done'); el.querySelector('.answerbar').innerHTML = '<b>记下了</b>'; })}
      </div>
    </div>`).join('')}</div>` : '<p class="box muted">没有要你看的。</p>';

  const rows = d.runs.map((r) => {
    if (r.kind === 'selftest') {
      return `<tr><td data-k="一轮"><a href="#/selftest/${enc(r.id)}">${esc(r.name)}</a><div class="small muted">${esc(when(r.at))}</div></td><td data-k="类型"><span class="pill kind">自检</span></td><td data-k="版本">—</td>
        <td data-k="结论">${pill(r.verdict)}</td><td data-k="玩了" class="num" colspan="4">${r.caught}/${r.ran} 对 · 共 ${r.total} 个种子 bug</td></tr>`;
    }
    const why = r.verdict === 'pending' && r.why === 'waiting-for-hanli' ? `等你 ${r.waiting}` : (WHY[r.why] ?? '');
    return `<tr><td data-k="一轮"><a href="#/run/${enc(r.id)}">${esc(r.name)}</a><div class="small muted">${esc(when(r.at))}</div></td>
      <td data-k="类型"><span class="pill kind">${esc(KIND[r.kind])}</span></td>
      <td data-k="版本">${r.ref ? `<code>${esc(r.ref.slice(0, 10))}</code>` : '<span class="muted">—</span>'}</td>
      <td data-k="结论">${pill(r.verdict, why)}</td>
      <td data-k="玩了 / 没玩成" class="num">${r.played ?? '—'} / ${r.unplayable ?? '—'}</td>
      <td data-k="硬伤" class="num">${r.hard ? `<b style="color:var(--fail)">${r.hard}</b>` : 0}</td>
      <td data-k="审看">${esc(r.reviewer ?? '—')}</td>
      <td data-k="进度" class="num">${r.shots_answered ?? 0}/${r.shots_total ?? '?'} 张${r.unsure ? ` · 待你 ${r.waiting}/${r.unsure}` : ''}${r.hanli ? ` · 你答了 ${r.hanli}` : ''}</td></tr>`;
  }).join('');
  app.innerHTML = `<h1>待你看 <span class="muted small">${q.length} 项 · 你已答过 ${d.rulings} 次</span></h1>${qhtml}
    <h2>每一轮</h2><table class="stack"><thead><tr><th>一轮</th><th>类型</th><th>版本</th><th>结论</th><th>玩了 / 没玩成</th><th>硬伤</th><th>审看</th><th>进度</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ── 一轮 ── */
async function run(id, size) {
  const d = await get(`/api/run?id=${enc(id)}`);
  const s = d.summary;
  const sizes = [...new Set(d.shots.map((x) => x.size))];
  const on = sizes.includes(size) ? size : sizes[0];
  const played = d.played?.played ?? [];
  const outcome = (where) => {
    const p = played.filter((x) => x.where === where || x.where.startsWith(`${where} · `));
    return p.map((x) => [x.kind, x.outcome ?? x.answer ?? '', x.steps ? `${x.steps} 步` : (x.taps ? `${x.taps} 次` : '')].filter(Boolean).join(' · ')).join('；');
  };
  const fights = [];
  d.shots.forEach((x, i) => {
    if (x.size !== on) return;
    let f = fights.find((g) => g.where === x.where);
    if (!f) fights.push(f = { where: x.where, shots: [] });
    f.shots.push({ ...x, i });
  });
  const why = s.why === 'waiting-for-hanli' ? `等你 ${s.waiting} 项` : (WHY[s.why] ?? '');
  const fact = (label, v) => `<div class="fact"><span class="small muted">${esc(label)}</span><b>${v}</b></div>`;
  app.innerHTML = `
    <div class="small"><a href="#/">首页</a> ›</div>
    <h1>${esc(s.name)} <span class="small muted">${esc(KIND[s.kind])} · run_id <code>${esc(s.run_id)}</code>${s.ref ? ` · skills <code>${esc(s.ref)}</code>` : ''}</span></h1>
    <div class="facts">${fact('结论', pill(s.verdict, why))}${fact('玩了 / 没玩成', `${s.played ?? '—'} / ${s.unplayable ?? '—'}`)}${fact('硬伤 / 提示', `${s.hard} / ${s.warn}`)}
      ${fact('审看', `${esc(s.reviewer ?? '—')} · ${s.shots_answered ?? 0}/${s.shots_total ?? '?'}`)}${fact('待你看', `${s.waiting} / ${s.unsure}`)}</div>
    ${s.review_run_id && s.review_run_id !== s.run_id ? `<p class="box" style="border-color:var(--pend)">review.json 写的是 <code>${esc(s.review_run_id)}</code>，不是这一轮的 <code>${esc(s.run_id)}</code> —— 不算数。</p>` : ''}
    ${d.review_summary ? `<p class="box small">${esc(d.review_summary)}</p>` : ''}
    <div class="tabs">${sizes.map((z) => `<a href="#/run/${enc(id)}?size=${enc(z)}" class="${z === on ? 'on' : ''}">${esc(z)} <span class="muted">${d.shots.filter((x) => x.size === z).length}</span></a>`).join('')}</div>
    ${fights.map((f) => `<section class="fight"><div class="head"><b>${esc(f.where.replace(`${on} · `, '') || '—')}</b><span class="small muted">${esc(outcome(f.where))}</span></div>
      <div class="strip">${f.shots.map((x) => `<a href="#/shot/${enc(id)}/${x.i}">${thumb(id, x, { flags: x.flags, box: x.note?.box, badge: noteBadge(x.state) })}<span class="cap">${esc(x.tag || x.file.replace('shots/', ''))}</span></a>`).join('')}</div></section>`).join('')}
    ${d.loose.length ? `<h2>不在截图上的发现</h2><div class="wide"><table><thead><tr><th>种类</th><th>哪里</th><th>细节</th></tr></thead><tbody>${d.loose.map((f) => `<tr><td>${f.hard ? '<b style="color:var(--fail)">硬伤</b> ' : ''}${esc(f.kind)}</td><td>${esc(f.where ?? '')}</td><td class="small"><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k]) => !['kind', 'hard', 'where', 'size'].includes(k)))))}</code></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h2>拒绝（refusals.json） <span class="small muted">${d.refusals?.refusals?.length ?? 0}</span></h2>
    ${d.refusals?.refusals?.length ? `<div class="wide"><table><thead><tr><th>哪里</th><th>动作</th><th>原因</th><th>页面说</th></tr></thead><tbody>${d.refusals.refusals.map((r) => `<tr><td>${esc(r.where)}</td><td><code>${esc(r.verb)}</code></td><td><code>${esc(r.refused)}</code></td><td>${esc(r.say ?? '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">没有。</p>'}
    <h2>玩了什么（played.json）</h2>
    <div class="wide"><table><thead><tr><th>哪里</th><th>什么</th><th>结果</th></tr></thead><tbody>${played.map((p) => `<tr><td>${esc(p.where)}</td><td>${esc(p.kind)}</td><td>${esc(p.outcome ?? p.answer ?? '')}${p.steps ? ` · ${p.steps} 步` : ''}${p.taps ? ` · ${p.taps} 次` : ''}${p.fed ? ` · 喂 ${esc(p.fed.join('、'))}` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${(d.played?.unplayable ?? []).length ? `<h3>没玩成</h3><ul>${d.played.unplayable.map((u) => `<li>${esc(typeof u === 'string' ? u : `${u.where ?? ''} — ${u.why ?? JSON.stringify(u)}`)}</li>`).join('')}</ul>` : ''}`;
}

/* ── 一张 ── */
let keyNav = null;
async function shot(id, n) {
  const d = await get(`/api/run?id=${enc(id)}`);
  const i = Math.max(0, Math.min(d.shots.length - 1, n));
  const x = d.shots[i];
  if (!x) { app.innerHTML = '<p>这一轮没有截图。</p>'; return; }
  const [W, H] = x.px ?? [430, 932];
  const note = x.note, st = x.state;
  const show = { flags: localGet('pb-flags', '1') === '1', box: localGet('pb-box', '1') === '1' };
  const cert = d.summary.legacy ? '旧格式的审看：没有逐张分「确定 / 拿不准」，结论按它写的' : !note ? '没写备注（算作 Claude 看过、过）' : `${st.certainty === 'unsure' ? '拿不准' : '确定'}${note.fail ? ' · 判不过' : (st.certainty === 'sure' ? ' · 过' : '')}`;
  const isUnsure = st?.certainty === 'unsure';
  const bar = answerBar(id, x.file, st?.hanli ?? null, () => route());
  app.innerHTML = `
    <div class="small"><a href="#/">首页</a> › <a href="#/run/${enc(id)}?size=${enc(x.size)}">${esc(d.summary.name)}</a> ›</div>
    <div class="navrow" style="margin:8px 0">
      <a href="#/shot/${enc(id)}/${i - 1}"><button ${i === 0 ? 'disabled' : ''}>← 上一张</button></a>
      <b>${i + 1} / ${d.shots.length}</b>
      <a href="#/shot/${enc(id)}/${i + 1}"><button ${i === d.shots.length - 1 ? 'disabled' : ''}>下一张 →</button></a>
      <span class="toggles small"><label><input type="checkbox" id="tf" ${show.flags ? 'checked' : ''}> 标记</label><label><input type="checkbox" id="tb" ${show.box ? 'checked' : ''}> Claude 的框</label></span>
    </div>
    <div class="shotview">
      <div class="big ${show.flags ? '' : 'noflags'} ${show.box ? '' : 'nobox'}" id="big">${thumb(id, x, { flags: x.flags, box: note?.box, badge: noteBadge(st), style: `width:min(100%, ${W}px, calc(78vh * ${W / H}))` })}</div>
      <div class="side">
        <div class="box"><div class="small muted">${esc(x.where)} · ${esc(x.tag)}</div><code class="small">${esc(x.file)}</code></div>
        ${x.flags.length ? `<div class="box"><b>标记</b><ul class="flaglist">${x.flags.map((f) => `<li class="${f.hard ? 'hard' : ''}">${f.hard ? '硬伤' : '提示'} · ${esc(f.kind)}${f.why ? ` / ${esc(f.why)}` : ''}${f.el ? ` — <code>${esc(f.el)}</code>` : ''}${f.by ? ` 被 <code>${esc(f.by)}</code> 盖住` : ''}${f.height ? ` · ${f.height}px` : ''}</li>`).join('')}</ul></div>` : ''}
        <div class="box"><b>Claude</b> <span class="small muted">${esc(cert)}</span>${note?.answer ? `<p style="margin:6px 0 0">${esc(note.answer)}</p>` : ''}</div>
        ${isUnsure ? `<div class="box" style="border-color:var(--pend)"><div class="ask">${esc(note.ask || '这张行不行？')}</div>${bar}</div>`
          : `<details class="box" ${st?.hanli ? 'open' : ''}><summary>你要推翻这张吗？</summary>${bar}</details>`}
      </div>
    </div>`;
  const big = document.getElementById('big');
  document.getElementById('tf').addEventListener('change', (e) => { big.classList.toggle('noflags', !e.target.checked); localSet('pb-flags', e.target.checked ? '1' : '0'); });
  document.getElementById('tb').addEventListener('change', (e) => { big.classList.toggle('nobox', !e.target.checked); localSet('pb-box', e.target.checked ? '1' : '0'); });
  keyNav = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft' && i > 0) location.hash = `#/shot/${enc(id)}/${i - 1}`;
    if (e.key === 'ArrowRight' && i < d.shots.length - 1) location.hash = `#/shot/${enc(id)}/${i + 1}`;
  };
}
document.addEventListener('keydown', (e) => keyNav?.(e));
function localGet(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } }

/* ── 自检 ── */
async function selftest(id) {
  const d = await get(`/api/selftest${id ? `?id=${enc(id)}` : ''}`);
  const want = (b) => Object.entries(b.expect).map(([k, v]) => `${k}=${v}`).join(' · ');
  app.innerHTML = `<div class="small"><a href="#/">首页</a> ›</div><h1>自检 <span class="small muted">${esc(d.name)}</span></h1>
    <p class="small muted">每个种子 bug：一个旧版本（或补丁），机器人必须报出它；「对照」是同一局没有这个 bug，必须不报。</p>
    <div class="wide"><table class="stack"><thead><tr><th>种子 bug</th><th>版本</th><th>必须报出</th><th>结果</th><th>截图</th></tr></thead><tbody>
    ${d.rows.map((b) => `<tr><td><b>${esc(b.id)}</b><div class="small muted">${esc(b.note)}</div></td><td data-k="版本"><code>${esc(b.ref)}</code>${b.patch ? `<div class="small"><code>+ ${esc(b.patch)}</code></div>` : ''}</td>
      <td data-k="必须报出" class="small">${b.absent ? '对照：不报 ' : ''}<code>${esc(want(b))}</code></td><td data-k="结果" class="st-${esc(b.status)}">${esc(ST[b.status] ?? b.status)}</td>
      <td data-k="截图">${b.shot && b.idx >= 0 ? `<a href="#/shot/${enc(b.part)}/${b.idx}">${esc(b.shot.replace('shots/', ''))}</a>` : (b.part ? `<a href="#/run/${enc(b.part)}">这一轮</a>` : '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function route() {
  keyNav = null;
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = h.split('?');
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (parts[0] === 'run') await run(parts[1], new URLSearchParams(qs ?? '').get('size'));
    else if (parts[0] === 'shot') await shot(parts.slice(1, -1).join('/'), Number(parts.at(-1)));
    else if (parts[0] === 'selftest') await selftest(parts.slice(1).join('/') || null);
    else await home();
    window.scrollTo(0, 0);
  } catch (e) {
    app.innerHTML = `<p class="box" style="border-color:var(--fail)">读不出来：${esc(e.message)}</p>`;
  }
}
window.addEventListener('hashchange', route);
route();
