// 格斗's clips: every clip a state asks for (draw.js meClip / foeClip, CLIP_STATES) resolves to a painted clip on each of
// the nine sheets, through each level's own `look.clips` (心魔 on 小满's sheet) — a state with its own clip on a sheet
// shows it (小满's backdash and throw, 秦雁's and 卢方's 震), one without falls back to the clip it showed before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CLIP_STATES, resolveClip } from '../scripts/games/fighter/draw.js';
import { loadContent } from '../scripts/content.mjs';

const ART = new URL('../worlds/jiuding/art/games/fighter/', import.meta.url);
const SHEETS = Object.fromEntries(readdirSync(ART).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(f, ART), 'utf8'))]));
const LEVELS = loadContent().games.games.filter((g) => g.mechanic === '格斗').flatMap((g) => g.levels ?? []);
const sheetOf = (look) => look?.sheet?.split('/').pop();
// a state that shows the idle clip by design on a sheet without its own (her landing, a burst on a robed sheet)
const IDLE_OK = { me: new Set(['idle']), foe: new Set(['idle', 'land', 'zhen', 'edge', 'glow', 'hold']) };

test('nine sheets, each with an idle clip', () => {
  assert.equal(Object.keys(SHEETS).length, 9);
  for (const [who, m] of Object.entries(SHEETS)) assert.ok(m.clips.idle, who);
});

test('CLIP_STATES names every clip meClip and foeClip return', () => {
  const src = readFileSync(new URL('../scripts/games/fighter/draw.js', import.meta.url), 'utf8');
  for (const [who, fn] of [['me', 'meClip'], ['foe', 'foeClip']]) {
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf('\n}\n', src.indexOf(`function ${fn}(`)));
    const said = new Set([...body.matchAll(/return \[\s*'(\w+)'/g)].map((x) => x[1]));
    for (const arr of body.matchAll(/\[((?:\s*'\w+',?)+)\]\.includes\(a\.k\)\) return \[a\.k/g)) for (const x of arr[1].matchAll(/'(\w+)'/g)) said.add(x[1]);
    for (const x of body.matchAll(/(\w+): '(\w+)'/g)) said.add(x[2]); // the palm's phases
    for (const x of said) assert.ok(CLIP_STATES[who].includes(x), `${fn} returns '${x}', not in CLIP_STATES.${who}`);
  }
});

test('every state resolves to a painted clip on every sheet, as each level binds it', () => {
  const roles = [];
  for (const name of Object.keys(SHEETS)) roles.push({ sheet: name, who: 'foe', look: null }, { sheet: name, who: 'me', look: null });
  for (const l of LEVELS) for (const who of ['me', 'foe']) if (sheetOf(l[who]?.look)) roles.push({ sheet: sheetOf(l[who].look), who, look: l[who].look.clips ?? null, level: l.id });
  for (const r of roles) {
    const meta = SHEETS[r.sheet];
    assert.ok(meta, `${r.level}: sheet ${r.sheet}`);
    for (const said of CLIP_STATES[r.who]) {
      const [name, clip] = resolveClip(meta, r.who, said, r.look);
      const at = `${r.sheet} as ${r.who}${r.level ? ` (${r.level})` : ''}: ${said} → ${name}`;
      assert.ok(clip?.frames?.length, at);
      for (const f of clip.frames) assert.ok(meta.frames[f], `${at}: frame ${f}`);
      // as a level plays it (小满's as him, every sheet as her), idle only where idle is meant
      if (r.level && r.who === 'me' && !IDLE_OK.me.has(said)) assert.notEqual(clip, meta.clips.idle, `${at}: fell to idle`);
      if (r.level && r.who === 'foe' && !IDLE_OK.foe.has(said)) assert.notEqual(clip, meta.clips.idle, `${at}: fell to idle`);
    }
  }
});

test('the painted gap clips show where the sheet has them, the old ones where it does not', () => {
  const xm = SHEETS.xiaoman, qy = SHEETS.qinyan, lf = SHEETS.lufang;
  assert.equal(resolveClip(xm, 'me', 'backdash')[1], xm.clips.backdash);
  assert.equal(resolveClip(xm, 'me', 'throw')[1], xm.clips.throw);
  assert.equal(resolveClip(xm, 'me', 'spin')[1], xm.clips.spin);
  assert.deepEqual(resolveClip(lf, 'me', 'spin'), resolveClip(lf, 'me', 'heavy'));
  assert.equal(resolveClip(lf, 'me', 'backdash')[1], lf.clips.back);
  assert.equal(resolveClip(qy, 'foe', 'zhen')[1], qy.clips.zhen);
  assert.equal(resolveClip(lf, 'foe', 'zhen')[1], lf.clips.zhen);
  const xinmo = LEVELS.find((l) => l.foe?.look?.sheet?.endsWith('xiaoman'))?.foe.look.clips;
  assert.equal(resolveClip(xm, 'foe', 'throw', xinmo)[1], xm.clips.throw);
  for (const m of [xm, qy]) assert.ok(m.frames.cutin, 'a cut-in frame on the sheet');
});
