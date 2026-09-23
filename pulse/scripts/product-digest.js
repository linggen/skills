// Product digest — what the user's product actually is, read off disk and
// handed to the agent on every drafting goal. Pure functions (no DOM, no
// fetch) so pulse-app.js can build the block and node can test it.
//
// Why the page reads it: the agent was told to Read the workspace itself
// and never did (every Pulse session on disk through 2026-09-01 — zero
// workspace reads), so the page hands it over, the way it already hands
// over the brief and the mention policy.
//
// Config (config.json):
//   workspace_path — the workspace ROOT. Also the permission grant and the
//                    git-scan root, so it may well be a parent dir holding
//                    several repos and no README of its own.
//
// The repos are worked out from the root, never listed by hand (the
// product_repos setting was removed 2026-09-23 — the workspace already says
// where the work is): the root itself when it is a repo, else the repos
// directly inside it, most recently committed first, up to maxRepos. A
// launch is usually more than one repo (the app, the CLI, the site), and the
// sentence that answers a thread may live in any of them — so the digest
// carries all of them, each labelled.

export const DIGEST_LIMITS = Object.freeze({
  maxRepos: 6,        // a digest, not a library dump
  rawReadmeBytes: 8000,   // read this much off disk…
  rawChangelogBytes: 2000,
  readmeChars: 1200,  // …keep this much after the chrome is stripped
  changelogChars: 600,
});

export const REPO_MARK = '<<<PULSE-REPO ';
export const README_MARK = '<<<README>>>';
export const CHANGELOG_MARK = '<<<CHANGELOG>>>';

// ---- Which repos ---------------------------------------------------------

// The workspace root, the one place the repos are found from.
export function normalizeRepoPaths(cfg) {
  const ws = String(cfg?.workspace_path || '').trim().replace(/\/+$/, '');
  return ws ? [ws] : [];
}

// ---- Reading them --------------------------------------------------------

function quotePath(p) {
  const esc = (s) => s.replace(/(["\\$`])/g, '\\$1');
  if (p === '~') return '"$HOME"';
  if (p.startsWith('~/')) return `"$HOME/${esc(p.slice(2))}"`;
  return `"${esc(p)}"`;
}

// One /api/bash call. A root that is a repo (a .git or a README) is read
// itself; any other root is read through the repos directly inside it,
// newest commit first, up to maxRepos. Never ends with a newline — /api/bash
// rejects a command that does. The first `## ` block of CHANGELOG.md is the
// latest entry; `# Changelog` (one hash) does not match.
export function buildDigestCommand(paths, limits = DIGEST_LIMITS) {
  const list = paths.map(quotePath).join(' ');
  if (!list) return '';
  return [
    'emit() { d="$1";',
    ` printf '${REPO_MARK}%s>>>\\n' "$(basename "$d")";`,
    ' if [ -f "$d/README.md" ]; then',
    ` printf '${README_MARK}\\n'; head -c ${limits.rawReadmeBytes} "$d/README.md"; printf '\\n';`,
    ' fi;',
    ' if [ -f "$d/CHANGELOG.md" ]; then',
    ` printf '${CHANGELOG_MARK}\\n';`,
    ` awk '/^## /{n++} n==1{print} n==2{exit}' "$d/CHANGELOG.md" | head -c ${limits.rawChangelogBytes}; printf '\\n';`,
    ' fi; };',
    ` for r in ${list}; do`,
    ' [ -d "$r" ] || continue;',
    ' if [ -e "$r/.git" ] || [ -f "$r/README.md" ]; then emit "$r"; continue; fi;',
    ' for c in "$r"/*/; do c="${c%/}"; [ -e "$c/.git" ] || continue;',
    ' printf \'%s\\t%s\\n\' "$(git -C "$c" log -1 --format=%ct 2>/dev/null || echo 0)" "$c"; done',
    ` | sort -rn | head -n ${limits.maxRepos} | cut -f2-`,
    ' | while IFS= read -r c; do emit "$c"; done;',
    ' done',
  ].join('');
}

export function parseDigestOutput(stdout) {
  const text = String(stdout || '');
  if (!text.trim()) return [];
  const repos = [];
  let cur = null;
  let field = null;
  for (const line of text.split('\n')) {
    if (line.startsWith(REPO_MARK) && line.endsWith('>>>')) {
      cur = { repo: line.slice(REPO_MARK.length, -3), readme: [], changelog: [] };
      repos.push(cur);
      field = null;
      continue;
    }
    if (!cur) continue;
    if (line === README_MARK) { field = 'readme'; continue; }
    if (line === CHANGELOG_MARK) { field = 'changelog'; continue; }
    if (field) cur[field].push(line);
  }
  return repos.map(r => ({
    repo: r.repo,
    readme: r.readme.join('\n').trim(),
    changelog: r.changelog.join('\n').trim(),
  }));
}

// ---- Making it readable --------------------------------------------------

// A README head is mostly presentation: a centered logo block, a row of
// shields.io badges, a demo gif. Sliced raw, the first 1500 bytes of a
// polished README are all chrome and no product. Strip the chrome, keep the
// prose — general to any README, no per-repo special-casing.
export function cleanMarkdown(md) {
  let t = String(md || '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');                       // html comments
  t = t.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '');     // badge links
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');                  // images
  t = t.replace(/<[^>]+>/g, '');                               // html tags
  t = t.replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const lines = t.split('\n').map((l) => {
    const s = l.trim();
    if (!s) return '';                          // a stripped badge row is a blank line
    // Drop what a badge/nav row leaves behind — separators and rules — but
    // never a line that still carries content. ``` is a fence, not junk.
    return /^[·•|*_\-–—=+~^]+$/.test(s) ? '' : l;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Cut on a line boundary where one is close, so the digest never ends
// mid-sentence. Counted in CHARACTERS — byte slicing splits multibyte text.
export function trimToChars(text, max) {
  const t = String(text || '');
  if ([...t].length <= max) return t;
  const cut = [...t].slice(0, max).join('');
  const nl = cut.lastIndexOf('\n');
  return (nl > max * 0.6 ? cut.slice(0, nl) : cut).trimEnd() + '…';
}

export function renderDigestBlock(sections, limits = DIGEST_LIMITS) {
  const parts = [];
  for (const s of sections) {
    const readme = trimToChars(cleanMarkdown(s.readme), limits.readmeChars);
    const changelog = trimToChars(cleanMarkdown(s.changelog), limits.changelogChars);
    if (!readme && !changelog) continue;
    parts.push(`### ${s.repo}`);
    if (readme) parts.push(readme);
    if (changelog) parts.push(`— latest CHANGELOG entry —`, changelog);
    parts.push('');
  }
  if (!parts.length) return '';
  return [
    'PRODUCT DIGEST — my product, read off disk by the page from the repos I',
    'configured (Settings → Workspace). This is the ONLY grounded product',
    'knowledge in this goal: ground every product sentence in what is written',
    'here — what it does, what just shipped — and never in a guess. A thread',
    'this digest can answer concretely is exactly where the MENTION POLICY',
    'above allows a disclosed draft; if nothing here answers the thread, stay',
    'implicit rather than inventing a capability.',
    '',
    ...parts,
  ].join('\n');
}
