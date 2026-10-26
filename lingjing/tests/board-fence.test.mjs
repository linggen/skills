// A board takes only the taps that land on it (Hanli, 2026-10-26: the 事 popover open over 兽潮's 先选一门本事, 交 差
// tapped — 「这里点交差按钮时, 触发了小游戏的开始」). Phaser hears mousedown/mouseup/touch* on the window and hit-tests them
// in its canvas; the page's fence (board-fence.js) keeps from the window what lands over a field but not on it, and a
// board in time waits while a popover is open.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fenced, onField, over } from '../scripts/board-fence.js';

const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const PHASER = fs.readFileSync(new URL('../scripts/vendor/phaser.min.mjs', import.meta.url), 'utf8');
/* An element, as far as the fence asks: is it inside a field? */
const el = (inField) => ({ closest: (sel) => (inField && sel.includes('[data-mount]') ? {} : null) });
const FIELD = { left: 400, right: 800, top: 60, bottom: 700 };

test('why: Phaser listens on the window, and 守墙关 picks its talisman on pointerup', () => {
  assert.match(PHASER, /window\.addEventListener\("mouseup",this\.onMouseUpWindow/);
  assert.match(PHASER, /window\.addEventListener\("touchend",this\.onTouchEndWindow/);
  const hud = fs.readFileSync(new URL('../tools/shouqiang/src/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /c\.hit\.on\('pointerup'/);
});

test('the fence: over a field and not on it — a popover\'s button — is kept from the window; on it, or off every field, goes on', () => {
  assert.equal(fenced({ target: el(false), x: 600, y: 300, fields: [FIELD] }), true, '交差 in the popover over the board');
  assert.equal(fenced({ target: el(true), x: 600, y: 300, fields: [FIELD] }), false, 'a tap on the board itself');
  assert.equal(fenced({ target: el(false), x: 100, y: 300, fields: [FIELD] }), false, 'off the field (the chat\'s drags end on the window)');
  assert.equal(fenced({ target: el(false), x: 600, y: 300, fields: [FIELD], began: true }), false, 'its own drag, released over something else');
  assert.equal(fenced({ target: el(false), x: 600, y: 300, fields: [] }), false, 'no board up');
  assert.equal(onField(null), false);
  assert.equal(over(FIELD, 400, 700), true);
});

test('the page: the fence is wired once, and a board in time waits while a popover is open', () => {
  assert.match(PAGE, /import \{ fenceBoards \} from '\.\/board-fence\.js';/);
  assert.match(PAGE, /\nfenceBoards\(\);\n/);
  assert.match(PAGE, /const popOpen = \(\) => Boolean\(view\.bookOpen \|\| view\.gearOpen \|\| view\.shelfOpen \|\| view\.wxOpen \|\| view\.roadsOpen \|\| view\.luOpen \|\| view\.logOpen\);/);
  assert.match(PAGE, /wireLiveGames\(\{ boardFor, lang, paused: \(\) => popOpen\(\) \|\| anyPaused\(\),/);
  assert.match(PAGE, /holdForPops\(slots\);/);
  // only the boards the popover paused are let go again
  assert.match(PAGE, /for \(const id of popPaused\) setPaused\(id, false\);/);
});

// The fence sees only the page; Phaser's default `input.windowEvents` listens on window.top — the launcher shell
// when Lingjing runs inside it — so every Phaser game turns it off and hears off-canvas presses on its own window
// (tools/<game>/src/window-input.js). A new Phaser game must do the same; its bundle must be rebuilt with it.
test('every Phaser game hears off-canvas input on its own window, never the shell (window-input.js)', async () => {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const here = new URL('..', import.meta.url).pathname;
  const tools = join(here, 'tools'), games = join(here, 'scripts', 'games');
  const phaser = readdirSync(tools).filter((d) => existsSync(join(tools, d, 'src')) && readdirSync(join(tools, d, 'src'), { recursive: true })
    .some((f) => /\.(js|ts)$/.test(f) && /new Phaser\.Game\(/.test(readFileSync(join(tools, d, 'src', f), 'utf8')) && !/main\.ts$/.test(f)));
  assert.ok(phaser.length >= 5, `found ${phaser.join(', ')}`);
  const one = readFileSync(join(tools, 'shouqiang', 'src', 'window-input.js'), 'utf8');
  for (const d of phaser) {
    const ts = d === 'zhazhai';
    const helper = join(tools, d, 'src', ...(ts ? ['zhazhai', 'window-input.ts'] : ['window-input.js']));
    assert.ok(existsSync(helper), `${d}: no window-input`);
    if (!ts) assert.equal(readFileSync(helper, 'utf8'), one, `${d}: window-input.js differs from shouqiang's`);
    const bundle = readFileSync(join(games, d, `${d}.min.mjs`), 'utf8');
    assert.match(bundle, /windowEvents:!1/, `${d}: the bundle still listens on window.top — rebuild it`);
    assert.match(bundle, /onMouseUpWindow/, `${d}: the bundle does not hang Phaser's window handlers on the page`);
  }
});
