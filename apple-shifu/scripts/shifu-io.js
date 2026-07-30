// Shared plumbing for the Apple Shifu tabs: shell calls, formatting, the
// confirm sheet and the toast. Extracted from media.js when the Files tab
// needed the same pieces — two copies of a confirm dialog is two chances to
// drift on what the user is told before something is deleted.
//
// This module imports nothing, so it can sit under both the shell and the
// tabs without a cycle.

// ── shell ──

export function shellEsc(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

let serverDownAt = 0;

/** Every pipeline call goes through here. A rejected fetch (daemon restarting
    or stopped) used to unwind the click handler with no trace — the button
    simply did nothing. Say so instead, and hand callers an empty result. */
export async function bash(command) {
  try {
    const resp = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_root: '/tmp', command }),
    });
    return await resp.json();
  } catch {
    if (Date.now() - serverDownAt > 5000) {   // one message per outage, not per call
      serverDownAt = Date.now();
      flashToast('Linggen server unreachable — try again in a moment');
    }
    return {};
  }
}

/** Write a JSON file under `dir` in chunks — /api/bash has a command-length
    ceiling, and a selection list can be thousands of paths. */
export async function writeJsonFile(dir, name, obj) {
  const json = JSON.stringify(obj);
  await bash(`mkdir -p "${dir}" && : > "${dir}/${name}"`);
  for (let i = 0; i < json.length; i += 40000) {
    await bash(`printf '%s' ${shellEsc(json.slice(i, i + 40000))} >> "${dir}/${name}"`);
  }
  await bash(`printf '\\n' >> "${dir}/${name}"`);
}

/** Write one path per line — the list format every files.sh subcommand takes. */
export async function writeLines(dir, name, lines) {
  await bash(`mkdir -p "${dir}" && : > "${dir}/${name}"`);
  const chunk = [];
  let len = 0;
  const flush = async () => {
    if (!chunk.length) return;
    await bash(`printf '%s\\n' ${chunk.map(shellEsc).join(' ')} >> "${dir}/${name}"`);
    chunk.length = 0;
    len = 0;
  };
  for (const line of lines) {
    chunk.push(line);
    len += line.length + 4;
    if (len > 30000) await flush();
  }
  await flush();
}

// ── formatting ──

export function fmtBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function abbrevPath(p) {
  return String(p).replace(/^\/Users\/[^/]+/, '~');
}

export function relAge(epochSeconds) {
  if (!epochSeconds) return '';
  const days = Math.round((Date.now() / 1000 - epochSeconds) / 86400);
  if (days > 365) return `${Math.round(days / 365)}yr`;
  if (days > 30) return `${Math.round(days / 30)}mo`;
  return `${Math.max(0, days)}d`;
}

// ── dialogs and toasts ──

export function confirmDialog(messageHtml, actionLabel, danger = false) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'media-lightbox';
    box.innerHTML = `
      <div class="media-confirm">
        <div>${messageHtml}</div>
        <div class="row">
          <button class="media-cta ghost sm" id="cf-no">Cancel</button>
          <button class="media-cta sm${danger ? ' danger' : ''}" id="cf-yes">${esc(actionLabel)}</button>
        </div>
      </div>`;
    const done = (v) => { box.remove(); resolve(v); };
    box.onclick = (e) => { if (e.target === box) done(false); };
    box.querySelector('#cf-no').onclick = () => done(false);
    box.querySelector('#cf-yes').onclick = () => done(true);
    document.body.appendChild(box);
  });
}

/** Lightweight bottom toast. Returns {update, done, close}. `done` swaps to a
    final message and auto-dismisses; pass an {label, fn} action to keep the
    toast up with a button (e.g. "Free up phone" after a backup). */
export function showToast(msg, spinner = false) {
  let el = document.getElementById('media-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'media-toast';
    el.className = 'media-toast';
    document.body.appendChild(el);
  }
  const render = (m, sp) => { el.innerHTML = `${sp ? '<span class="media-spin"></span>' : ''}<span>${esc(m)}</span>`; };
  render(msg, spinner);
  return {
    update: (m) => render(m, true),
    done: (m, action = null) => {
      render(m, false);
      if (action) {
        const btn = document.createElement('button');
        btn.className = 'media-cta sm';
        btn.style.margin = '0 0 0 10px';
        btn.textContent = action.label;
        btn.onclick = () => { el.remove(); action.fn(); };
        el.appendChild(btn);
        setTimeout(() => el.remove(), 30000);
      } else {
        setTimeout(() => el.remove(), 4500);
      }
    },
    close: () => el.remove(),
  };
}

export function flashToast(msg) {
  const t = showToast(msg);
  t.done(msg);
  return t;
}
