// zhazhai.js — 砸寨 (WIP mount).
export const meta = { name: { zh: '砸寨', en: 'Smash the Fort' }, how: { zh: '拉弓弹射，砸塌黄鼠狼精的寨子。', en: 'Pull and fling: bring the weasel fort down.' } };
export function mount(container, opts = {}) {
  const box = container.ownerDocument.createElement('div');
  box.style.cssText = 'width:100%;aspect-ratio:16/9;position:relative;background:#222';
  container.replaceChildren(box);
  return import('./zhazhai/zhazhai.min.mjs').then(({ start }) => new Promise((resolve) => {
    const game = start({ parent: box, base: new URL('./zhazhai/', import.meta.url).href });
    opts.signal?.addEventListener('abort', () => { game.destroy(true); resolve({ won: false, left: true }); });
  }));
}
