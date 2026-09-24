// esc.js — the page's one HTML escape. Every word that reaches innerHTML from
// the save, the world or the model goes through it, once.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
