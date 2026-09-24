// state.js — what the DJ page is showing, shared by its modules, and the UI
// prefs restored across restarts (one versioned localStorage blob).

import { makeToast } from './ui.js';

const UI_KEY = 'dj:ui';
const loadUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } };
export const savedUi = loadUi();
export const saveUi = (patch) => {
  Object.assign(savedUi, patch);
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch, v: 1 })); } catch { /* private mode */ }
};

export const state = {
  config: {},
  library: { tracks: [], playlists: [], phone: { files: [], playlists: [] } },
  phone: [], // paired phones with their fetch ledgers (phone.js)
  queue: [], // data/queue.json items
  // 'mac' is everything this machine holds, with the playlists played here;
  // 'phone' is what a phone carries — references to those same songs, filed
  // into playlists of its own. Two curations, not two copies.
  view: savedUi.view === 'phone' ? 'phone' : 'mac',
  set: null, // the proposed tracklist
  // all | recent | playlist (+ name) — validated against the library at boot.
  collection: savedUi.collection?.kind ? savedUi.collection : { kind: 'all' },
  query: '',
  filter: { lyrics: false },
  shuffle: !!savedUi.shuffle,
  selected: new Set(), // selected track keys
};

export const setCollection = (c) => {
  state.collection = c;
  saveUi({ collection: c });
};

export const toast = makeToast('toast');
