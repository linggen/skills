// 机缘 dealt on one chapter's map, offered only while he may still walk there
// (live, 2026-10-15: 序章's 上山路 chance stood in 外门's 事 book with a 去上山路
// button, and the tap met 「外门弟子，无令不得下山」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const until = new Date(NOW.getTime() + 2 * 3600000).toISOString();
const opened = () => ({ ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), stamina: 100, stamina_at: NOW.toISOString() });
const lookOf = (s) => look(s, content, { now: NOW, quests: [] });

test('a chance whose place the chapter has shut is not offered — no book row, no 去 button', () => {
  const s = opened();
  const map = content.chapters[s.chapter].map?.places ?? [];
  assert.ok(map.length && !map.includes('shanlu'), '上山路 lies off 外门\'s map');
  const shut = lookOf({ ...s, chance: { day: '2026-09-29', place: 'shanlu', until } });
  assert.equal(shut.chance, undefined, JSON.stringify(shut.chance));
});

test('a chance on the open map is still offered', () => {
  const s = opened();
  const open = content.chapters[s.chapter].map.places.find((id) => id !== s.place);
  const r = lookOf({ ...s, chance: { day: '2026-09-29', place: open, until } });
  assert.equal(r.chance?.place?.id, open);
  assert.ok(r.chance.minutes_left > 0);
});
