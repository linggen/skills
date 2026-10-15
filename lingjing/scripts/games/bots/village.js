// The human-like player for 石坳村 · 村里走一走 (games/village.js; shared by its three stops).
// Visit every seal: shoo each hen as it shows, read the print, pick the grey-backed leaf,
// price the wares (needle < cord < flint), answer the old tale; then go home.
import { STOPS } from '../village.js';

const spots = (s) => STOPS[s.stop].spots; // the seals the map shows
const PRICE = [1, 3, 5];
const TALE = { jingwei: 'stones', kuafu: 'sun' };

export function bot(s) {
  if (s.won) return null;
  const sub = s.sub;
  if (!sub) {
    const left = ['hens', 'prints', 'herb', 'peddler', 'tale'].find((id) => spots(s).includes(id) && !s.done.includes(id));
    return left ? { g: 'spot', id: left } : { g: 'home' };
  }
  if (sub.kind === 'hens') {
    const el = s.t - sub.t0, i = sub.hens.findIndex((h) => !h.gone && !h.pecked && el >= h.at);
    return i >= 0 ? { g: 'shoo', i } : null;
  }
  if (sub.kind === 'prints') return { g: 'pick', id: sub.list[sub.i] };
  if (sub.kind === 'herb') return { g: 'pick', id: 'ai' };
  if (sub.kind === 'peddler') return { g: 'price', p: PRICE[sub.i] };
  if (sub.kind === 'tale') return sub.answered ? { g: 'heard' } : { g: 'pick', id: TALE[sub.id] };
  return null;
}
