// i18n.ts — every word the game shows, in Chinese and English. Upstream's English literals are the keys: tr("PLAY")
// answers 开打 in Chinese, and the 砸寨 English (not upstream's) in English. A literal not listed shows as it is.
import { Runtime } from "./runtime";

const WORDS: Record<string, { zh: string; en: string }> = {
  "ANGRY ALIENS": { zh: "砸 寨", en: "SMASH THE FORT" },
  PLAY: { zh: "开 打", en: "PLAY" },
  SETTINGS: { zh: "设 置", en: "SETTINGS" },
  QUIT: { zh: "离 开", en: "LEAVE" },
  "QUIT GAME": { zh: "离开", en: "LEAVE" },
  "Are you sure you want to quit?": { zh: "不砸了？", en: "Done smashing?" },
  CANCEL: { zh: "再砸会儿", en: "STAY" },
  CONFIRM: { zh: "好", en: "OK" },
  "SELECT LEVEL": { zh: "选 寨", en: "PICK A FORT" },
  "LOADING...": { zh: "上弹弓……", en: "LOADING…" },
  "READY!": { zh: "开砸！", en: "READY!" },
  PAUSED: { zh: "歇 会", en: "PAUSED" },
  RESUME: { zh: "接着砸", en: "RESUME" },
  RESTART: { zh: "重 来", en: "RESTART" },
  MENU: { zh: "回 首 页", en: "MENU" },
  "LEVEL COMPLETE!": { zh: "寨子塌了！", en: "FORT DOWN!" },
  "LEVEL FAILED": { zh: "还 没 砸 塌", en: "STILL STANDING" },
  TOTAL: { zh: "总 分", en: "TOTAL" },
  DESTRUCTION: { zh: "砸 毁", en: "WRECKAGE" },
  BONUSES: { zh: "奖 励", en: "BONUSES" },
  "BIRDS LEFT": { zh: "余 弹", en: "SHOTS LEFT" },
  REPLAY: { zh: "再 来", en: "REPLAY" },
  NEXT: { zh: "下 一 寨", en: "NEXT" },
  HOME: { zh: "首 页", en: "HOME" },
  RETRY: { zh: "再 试", en: "RETRY" },
  INFO: { zh: "这 一 寨", en: "THIS FORT" },
  "HOW TO PLAY": { zh: "怎 么 玩", en: "HOW TO PLAY" },
  CONTROLS: { zh: "操 作", en: "CONTROLS" },
  "Focus:": { zh: "诀窍：", en: "Tip:" },
  Performance: { zh: "画质", en: "Quality" },
  Haptics: { zh: "震动", en: "Haptics" },
  "Hit Pause": { zh: "击中顿帧", en: "Hit pause" },
  "Slow Motion": { zh: "慢镜头", en: "Slow motion" },
  "Screen Flash": { zh: "闪屏", en: "Screen flash" },
  Music: { zh: "音乐", en: "Music" },
  "Sound Effects": { zh: "音效", en: "Sound effects" },
  "Please rotate your device": { zh: "请把手机横过来", en: "Please turn your phone sideways" },
  "Aim for the Aliens!": { zh: "瞄准黄鼠狼精！", en: "Aim for the weasels!" },
  "Some blocks are easier to break than others.": { zh: "瓦一碰就碎，石头可难啃。", en: "Tiles shatter; stone takes work." },
  "Friendly Aliens have different abilities.": { zh: "飞行中点一下：每样东西各有一手。", en: "Tap in flight: each thing has its trick." },
  "Higher scores earn more stars!": { zh: "砸得越狠，星越多！", en: "The bigger the wreck, the more stars!" },
  "Watch out for TNT crates!": { zh: "火药桶一点就炸！", en: "Powder kegs go off with a bang!" },
};

export function tr(s: string): string {
  const w = WORDS[s];
  return w ? w[Runtime.lang] : s;
}
