// sky.js — 天气 on the page (design.md § 真实世界): the weather chip, its
// popover (the city, set or changed; the sense off or on) and a city row
// (it stood on the 名字 card until the hero was fixed, 2026-09-30; the chip's
// popover is where the city is set now). Pure markup; the page does the calls — the
// engine's weather sense (`/api/senses/weather`), never the skill itself.
import { esc } from './esc.js';

export const SKY_WORDS = {
  zh: {
    kinds: { clear: '晴', cloudy: '阴', fog: '雾', rain: '雨', snow: '雪', storm: '雷雨' },
    title: '天气',
    note: '填你所在的城市，灵境的天就跟着你那儿走；不填，便是蒙山的四季。',
    cityAsk: '你在哪座城？（选填，只用来看天气）',
    placeholder: '城市，如 哈尔滨',
    set: '就它', off: '关掉天气', on: '打开天气', clear: '不跟城市了',
    notFound: '没找到这座城。', failed: '天气这会儿读不到。',
    yours: '跟着：{city}', isOff: '天气已关，只有蒙山的四季。',
  },
  en: {
    kinds: { clear: 'Clear', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Storm' },
    title: 'Weather',
    note: 'Name your city and the sky here follows yours; leave it, and it is Mengshan\'s seasons.',
    cityAsk: 'Your city? (optional — only for the weather)',
    placeholder: 'A city, e.g. Harbin',
    set: 'Use it', off: 'Turn weather off', on: 'Turn weather on', clear: 'Forget my city',
    notFound: 'No city by that name.', failed: 'The weather can\'t be read just now.',
    yours: 'Following: {city}', isOff: 'Weather off — Mengshan\'s seasons only.',
  },
};

const wordsOf = (lang) => SKY_WORDS[lang] ?? SKY_WORDS.zh;
const say = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/// What the player has typed for a city, kept across repaints.
export const draft = { city: '' };

/// The chip: where, and the sky there.
export function wxChipHtml(weather, { lang = 'zh', open = false, sense = null, note = null } = {}) {
  if (!weather) return '';
  const w = wordsOf(lang);
  const temp = Number.isFinite(weather.temp_c) ? ` ${weather.temp_c}°` : '';
  const label = `${weather.where} · ${w.kinds[weather.kind] ?? weather.kind}${temp}`;
  return `<span class="bookwrap"><button class="bookchip wxchip" data-wx aria-expanded="${open}">${esc(label)}</button>${open ? wxPopHtml({ lang, sense, note }) : ''}</span>`;
}

/// The popover: the city followed, a field to change it, off · on · forget.
export function wxPopHtml({ lang = 'zh', sense = null, note = null } = {}) {
  const w = wordsOf(lang);
  const city = sense?.city?.name ?? null;
  const state = sense?.off ? w.isOff : city ? say(w.yours, { city }) : w.note;
  const toggles = city ? `<div class="acts"><button class="act quiet" data-wx-off="${sense?.off ? 'on' : 'off'}">${esc(sense?.off ? w.on : w.off)}</button><button class="act quiet" data-wx-clear>${esc(w.clear)}</button></div>` : '';
  return `<div class="bookpop wxpop" role="dialog"><div class="cardtitle">${esc(w.title)}</div><div class="small dim">${esc(state)}</div>
    <div class="fateform"><input type="text" id="wx-city" maxlength="40" autocomplete="off" placeholder="${esc(w.placeholder)}" value="${esc(draft.city)}"><button class="act" data-wx-set>${esc(w.set)}</button></div>
    ${toggles}${note ? `<div class="donote">${esc(note)}</div>` : ''}</div>`;
}

/// A city row (the 名字 card's until 2026-09-30; kept for a card that asks it).
export function cityRowHtml(lang = 'zh') {
  const w = wordsOf(lang);
  return `<div class="cityrow"><label class="small dim" for="city-text">${esc(w.cityAsk)}</label><input type="text" id="city-text" maxlength="40" autocomplete="off" placeholder="${esc(w.placeholder)}" value="${esc(draft.city)}"></div>`;
}

/// The page's note after setting a city: null when it took, else why not.
export function cityNote(res, lang = 'zh') {
  const w = wordsOf(lang);
  if (res?.ok) return null;
  return res?.status === 404 ? w.notFound : w.failed;
}
