// Minimal markdown renderer for chat messages
// Handles: bold, italic, code, headings, lists, line breaks

export function renderMarkdown(text) {
  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into lines for block-level processing
  const lines = html.split('\n');
  const out = [];
  let inList = false;

  for (let line of lines) {
    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = headingMatch[1].length;
      out.push(`<h${level} class="md-h">${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // List items (- or *)
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) { out.push('<ul class="md-list">'); inList = true; }
      out.push(`<li>${inline(listMatch[1])}</li>`);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numMatch) {
      if (!inList) { out.push('<ol class="md-list">'); inList = true; }
      out.push(`<li>${inline(numMatch[1])}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList) {
      out.push(out[out.length - 1]?.startsWith('<li>') ? '</ul>' : '</ol>');
      inList = false;
    }

    // Empty line → break
    if (line.trim() === '') {
      out.push('<br>');
      continue;
    }

    // Regular paragraph
    out.push(`<p class="md-p">${inline(line)}</p>`);
  }

  if (inList) out.push('</ul>');

  return out.join('');
}

// Inline formatting: bold, italic, code, strikethrough
function inline(text) {
  return text
    // Code (backticks) — process first to avoid interfering with bold/italic
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
}
