// The bot of 喂饭桶 · 开炉 on the book's pot (the story board diyilu-tama, games/kailu.js storyPot): what a hand does is put
// the pot's own things in, and nothing else. tests/story-gains.test.mjs plays it against storyPot's roll.
export const potOf = (story) => [...(story.pot?.in ?? [])];
