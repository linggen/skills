// 今's 聊天 (games/jinchat.js · jinchat-rules.js; Hanli 10-22, the 调息 sweep: 「你说的1-6 都是好主意, 按你说的改一遍.
// 关键是能留住玩家」): one chat game for every 今 board, driven by data; the book's lines verbatim; Ling's words
// handed facts only; the rules count and decide; never stuck on a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { castOf, outcome, parseChat, stubReply, TAG, turnLine } from '../scripts/games/jinchat-rules.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const reg = JSON.parse(read('../worlds/jiuding/games.json'));
const base = reg.games.find((g) => g.id === 'jinchat' && !g.task);
const CHATS = base.data.chats;
const tasks = JSON.parse(read('../worlds/jiuding/tasks/world.json')).tasks;
const peopleRaw = JSON.parse(read('../worlds/jiuding/people.json'));
const PEOPLE = Object.fromEntries((Array.isArray(peopleRaw.people) ? peopleRaw.people : Object.values(peopleRaw.people ?? peopleRaw)).filter((p) => p?.id).map((p) => [p.id, p]));
const BOOK_ZH = ['01', '02', '03', '04'].map((n) => read(`../story/jiuding-lu/今线/插曲${n}.md`)).join('\n');
const BOOK_EN = ['j01', 'j04', 'j07', 'j09'].map((n) => read(`../story/jiuding-lu/en/${n}.md`)).join('\n');
const flat = (s) => s.replace(/\[([^\]]+)\]\{[^}]+\}/g, '$1').replace(/\*/g, '');

test('every 今 chat board: a task on the jinchat game with its own chat, a story row naming it, paying nothing', () => {
  const rows = reg.games.filter((g) => g.id === 'jinchat' && g.task);
  assert.equal(rows.length, 4, 'one a 今 interlude');
  for (const row of rows) {
    assert.equal(row.group, 'jin');
    assert.equal(row.mechanic, '对话');
    const t = tasks.find((x) => x.id === row.task);
    assert.ok(t, row.task);
    assert.equal(t.game, 'jinchat');
    assert.equal(t.deal.chat, row.data.chat, `${row.task}: the row and the task deal the same chat`);
    assert.ok(CHATS[t.deal.chat], `${row.task}: its chat ${t.deal.chat}`);
    assert.deepEqual(t.grant, { table: 'task' }, '不跨线: the 今 lifts nothing of the 古');
    assert.ok(t.how?.zh && t.how?.en, `${row.task}: the goal said to him in the shell's bar`);
    assert.ok(t.replay?.zh && t.replay?.en, `${row.task}: a line to offer it again, left`);
  }
});

test('the chats: who is in each, the book\'s own lines verbatim (zh and en), the facts and goal in both tongues', () => {
  for (const [id, c] of Object.entries(CHATS)) {
    assert.ok(['phone', 'call', 'dark'].includes(c.look), `${id}: look`);
    for (const k of ['title', 'when', 'facts', 'goal']) assert.ok(c[k]?.zh && c[k]?.en, `${id}: ${k}`);
    assert.ok(c.turns >= 3 && c.turns <= 6, `${id}: 3–6 lines (short)`);
    const cast = castOf(c, PEOPLE, 'zh');
    assert.ok(cast.length >= 1);
    for (const p of cast) assert.ok(p.name && p.voice, `${id}: ${p.id} has a name and a voice`);
    const ids = new Set(['me', ...cast.map((p) => p.id)]);
    const lines = [...(c.open ?? []), ...(c.book ?? []), ...(c.chips ?? []).map((t) => ({ who: 'me', text: t }))];
    assert.ok(lines.length, `${id}: something of the book on the screen`);
    for (const l of lines) {
      assert.ok(ids.has(l.who), `${id}: ${l.who} is in the chat`);
      assert.ok(BOOK_ZH.includes(l.text.zh), `${id}: 「${l.text.zh}」 is the book's (今线/插曲*.md)`);
      assert.ok(flat(BOOK_EN).includes(l.text.en), `${id}: "${l.text.en}" is the book's (en/j*.md)`);
    }
  }
});

test('parseChat: a name and colon say who; a one-person chat strips it; narration and the tag are never bubbles', () => {
  const two = castOf(CHATS['617'], PEOPLE, 'zh');
  const p = parseChat('老蔡：明天？我盼你一口气跑完。\n**眼镜**：我查了，补测不许外人进场。\n（他扶了扶眼镜）\n【成】', two);
  assert.equal(p.met, true);
  assert.deepEqual(p.lines, [{ who: 'jin-laocai', text: '明天？我盼你一口气跑完。' }, { who: 'jin-yanjing', text: '我查了，补测不许外人进场。' }]);
  const one = castOf(CHATS.ahe, PEOPLE, 'zh');
  const q = parseChat('阿禾：「记一笔。」\n怕什么？', one);
  assert.equal(q.met, false);
  assert.deepEqual(q.lines, [{ who: 'jin-ahe', text: '记一笔。' }, { who: 'jin-ahe', text: '怕什么？' }]);
  assert.equal(parseChat('[done]', one).lines.length, 0, 'a tag alone is no bubble');
  assert.equal(parseChat('[done]', one).met, true);
  assert.equal(parseChat('a\nb\nc\nd\ne\nf', one).lines.length, 4, 'at most four bubbles');
});

test('the rules decide: the goal met after he spoke is 3 stars; his lines used up is 1; neither, the chat goes on', () => {
  assert.deepEqual(outcome({ met: true, sent: 1, turns: 5 }), { over: true, won: true, grade: 'met', stars: 3 });
  assert.deepEqual(outcome({ met: true, sent: 0, turns: 5 }), { over: false }, 'never before he speaks');
  assert.deepEqual(outcome({ met: false, sent: 5, turns: 5 }), { over: true, won: true, grade: 'talked', stars: 1 });
  assert.deepEqual(outcome({ met: false, sent: 2, turns: 5 }), { over: false });
});

test('the hidden line: facts and the goal first, short after; never shown (HIDDEN), never a tool', () => {
  const c = CHATS.dark, cast = castOf(c, PEOPLE, 'zh');
  const shown = c.open.map((l) => ({ who: l.who, text: l.text.zh }));
  const first = turnLine(c, { k: 1, text: '小宝哥，先别吸，跟着我吐', cast, shown, lang: 'zh' });
  assert.match(first, /^\[HIDDEN\] \[jinchat\] /);
  assert.match(first, /不 Look，不调用任何工具/);
  assert.ok(first.includes(c.facts.zh) && first.includes(c.goal.zh), 'the facts and the goal, as data says them');
  assert.ok(first.includes('马小宝：「我手麻了……嘴也麻了……我是不是要死了……」'), 'what is on the screen');
  assert.match(first, /第1条（共6条）。他发来：「小宝哥，先别吸，跟着我吐」$/);
  assert.ok(!first.includes('名字加冒号'), 'one person: no names asked for');
  const later = turnLine(c, { k: 3, text: '吐——', cast, lang: 'zh' });
  assert.equal(later, '[HIDDEN] [jinchat] 黑地里·第3条（共6条）。他发来：「吐——」（他做到了：另起一行【成】。）', 'the tag\'s rule on every line');
  assert.match(turnLine(c, { k: 6, text: 'x', cast, lang: 'zh' }), /最后一条/, 'the last line asks for an ending');
  const group = turnLine(CHATS['617'], { k: 1, text: 'x', cast: castOf(CHATS['617'], PEOPLE, 'zh'), lang: 'zh' });
  assert.match(group, /每行以说话人的名字加冒号开头/);
  const en = turnLine(CHATS.ahe, { k: 1, text: 'hi', cast: castOf(CHATS.ahe, PEOPLE, 'en'), lang: 'en' });
  assert.ok(en.includes(CHATS.ahe.goal.en) && /no tool at all/.test(en));
  assert.match(stubReply(cast, 2), new RegExp(TAG), 'the stub meets the goal on his second line');
});

test('the module: mount() on the contract, ai (no bot), one way to the model (drawguess-ling.js), the book when no one answers', () => {
  const src = read('../scripts/games/jinchat.js');
  assert.match(src, /export function mount\(container, \{ data = \{\}, lang = 'zh', signal, shell \} = \{\}\)/);
  assert.match(src, /ai: true/);
  assert.match(src, /import \{ askInChat, reachable \} from '\.\/drawguess-ling\.js'/, 'never a second transport');
  assert.match(src, /agent: 'ling'/, 'Ling writes their words (今 is never 银月\'s)');
  assert.match(src, /cannot\(w\.off\)/, 'chat=off plays the book');
  assert.match(src, /e\.isComposing/, 'an IME\'s Enter composes, never sends');
  assert.match(read('../SKILL.md'), /`\[jinchat\]`: their reply only, no tool\./, 'Ling is told what a [jinchat] line is');
  const turn = read('../scripts/games/drawguess-ling.js');
  assert.match(turn, /\.\.\.\(png \? \{ images: \[png\] \} : \{\}\)/, 'a turn with no picture sends no images');
});
