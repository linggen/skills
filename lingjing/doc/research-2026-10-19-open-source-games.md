# 开源 Web 游戏 / 套件调研（2026-10-19）

数据用 gh api 核过（stars / 最后 push / SPDX）；标 ⚠ 的是没核实的。

## Top 3：最能提升「像游戏」的三件事

1. **砸寨直接以 Angry Aliens 为底子，换皮**：feliperyba/angry-aliens-phaser（MIT）。实玩过 demo：有加载条、标题页、30 关选关、弹弓、轨迹、碎块，完成度高。代码里有 Verlet 皮筋、Voronoi 碎裂、5 种材质（玻璃/木/石/金属/TNT）、视差背景、转场、对象池、VFX 配置。我们拿走引擎层和关卡格式，美术全换成水墨，「鸟/猪」改成「法器/黄鼠狼精」。代价：它是 TS+Vite，要先打包成一个 ESM 文件才能放进我们的 iframe。
2. **立绘用 PixiJS v8 的 MeshPlane 做形变，让静态人物「活」起来**：PixiJS 是 MIT，v8.22.0 发布于 2026-10-01。可以做呼吸、摇摆、受击挤压。再配 pixi-filters（MIT）做冲击波、位移、辉光，revolt-fx（MIT，支持 Pixi v8，带可视化编辑器）做粒子。这是解决「美术不行」最便宜的一条路，不用重画，只让已有的画动起来。注意 Phaser 4 已经删掉了 Mesh/Plane（官方迁移文档写明），所以形变这条路选 Pixi。
3. **守炉参考 Princeton Tower Defense**：Kevin-Liu-01/Princeton-Tower-Defense（MIT，2026-10-16 还在更新）。实看过 demo，是 Kingdom Rush 级别的完成度：大地图、塔、英雄、法术、26 关。所有画面都用 Canvas 2D 代码画，没有贴图，正好适合改成水墨笔触。不能整个搬：它基于 Next.js+React。我们拿它的波次、升级、英雄、法术设计和渲染技巧（离屏缓存、雾、god rays）。名字和 Princeton 元素一律不用。

## 1. 弹弓 / 破坏（砸寨）

| 仓库 | ★ | 最后 push | 许可 | 技术栈 | 观感 | 拿什么 |
|---|---|---|---|---|---|---|
| [feliperyba/angry-aliens-phaser](https://github.com/feliperyba/angry-aliens-phaser) · [demo](https://feliperyba.github.io/angry-aliens-phaser/) | 3 | 2026-05-01 | MIT | Phaser 3.90 + Matter.js + TS/Vite | 实测精致，Kenney 风美术 | 整套引擎和关卡结构，换皮 |
| [phaserjs/phaser-box2d](https://github.com/phaserjs/phaser-box2d) | 164 | 2025-04-03 | MIT | Box2D v3 的 JS 版 | ⚠ 未看 demo | 如果 Matter 堆叠不稳，可换这个物理引擎 |
| [ncase/birds](https://github.com/ncase/birds) | 13 | 2014 | Unlicense | 原生 JS | 教学 demo | 只取思路 |
| [Mahdi7s/angrybirdsx](https://github.com/Mahdi7s/angrybirdsx) | 27 | 2024 | 无许可 | Cocos2d-html5 + Box2D | ⚠ | 不可用 |
| [seanpm2001/LibreFlock](https://github.com/seanpm2001/LibreFlock) | 7 | 2025 | GPL-3.0 | — | — | 只取思路 |

## 2. 塔防（守炉）

| 仓库 | ★ | 最后 push | 许可 | 技术栈 | 观感 | 拿什么 |
|---|---|---|---|---|---|---|
| [Kevin-Liu-01/Princeton-Tower-Defense](https://github.com/Kevin-Liu-01/Princeton-Tower-Defense) · [demo](https://princeton-tower-defense.vercel.app) | 12 | 2026-10-16 | MIT | Next.js/React + Canvas 2D 程序绘制 | 实测非常精致 | 设计、平衡数据、渲染技巧 |
| [maciej-trebacz/tower-of-time-game](https://github.com/maciej-trebacz/tower-of-time-game) | 377 | 2025-07 | MIT | TS | ⚠ 未看 | 只取思路（时间倒流机制） |
| [oldj/html5-tower-defense](https://github.com/oldj/html5-tower-defense) | 385 | 2019 | MIT | 原生 JS canvas | 简陋 | 只取基础寻路 |
| [pshenok/server-survival](https://github.com/pshenok/server-survival) | 6459 | 2026-10-19 | MIT | JS | ⚠ 未看 | 只取思路 |
| [yinhui1129754/towerDefense](https://github.com/yinhui1129754/towerDefense)（类保卫萝卜） | 31 | 2023 | 无许可 | Pixi + TS | — | 不可用 |

## 3. 绳索解谜（割绳子类）

找不到同时满足「有许可」和「精致」的仓库。

| 仓库 | ★ | 许可 | 说明 |
|---|---|---|---|
| [subprotocol/verlet-js](https://github.com/subprotocol/verlet-js) | 3793 | MIT（LICENSE 文本，GitHub 显示 NOASSERTION） | 小巧的 Verlet 引擎，绳子、布料都能做；2019 年后没再维护 |
| Angry Aliens 的 VerletBand | — | MIT | 现成的绳带代码 |
| planck.js / matter-js 的约束链 | 5298 / 18483 | MIT | 用引擎自带的链条约束做绳子 |
| [yell0wsuit/cuttherope-h5dx](https://github.com/yell0wsuit/cuttherope-h5dx)、Haddley/cuttherope | — | 无许可，且含 ZeptoLab 美术 | 不可用 |

## 4. 一键飞行（气走经脉）

| 仓库 | ★ | 许可 | 说明 |
|---|---|---|---|
| [nebez/floppybird](https://github.com/nebez/floppybird) | 599 | Apache-2.0 | 原生 JS，手感调校可参考 |
| [iterami/Jetpack-2D.htm](https://github.com/iterami/Jetpack-2D.htm) | 2 | CC0-1.0 | 很简陋，只取思路 |
| [daleharvey/helicopter](https://github.com/daleharvey/helicopter) | 93 | 无许可 | 不可用 |
| [ellisonleao/clumsy-bird](https://github.com/ellisonleao/clumsy-bird) | 1630 | GPL-3.0 | 只取思路 |

结论：这类玩法简单，不值得 fork。真正的差距在手感和美术上（视差、粒子拖尾、震屏）。

## 5. 打地鼠 / 五子棋 / 你画我猜

- 五子棋：[lihongxun945/gobang](https://github.com/lihongxun945/gobang) 1815★，**无许可**，只能参考它的教程思路。可用的是 [yyjhao/HTML5-Gomoku](https://github.com/yyjhao/HTML5-Gomoku)（MIT，85★）。
- 你画我猜：[scribble-rs](https://github.com/scribble-rs/scribble.rs)（BSD-3-Clause，665★，Go 写的服务端），只取思路。笔触推荐 [steveruizok/perfect-freehand](https://github.com/steveruizok/perfect-freehand)（MIT，5762★），压感笔画像毛笔，直接能用。
- 打地鼠：没找到值得拿的，自己写就行。

## 6. 框架与「游戏感」套件

| 项目 | ★ | 许可 | 版本 / 状态 | 用途 |
|---|---|---|---|---|
| [PixiJS](https://github.com/pixijs/pixijs) | 48421 | MIT | v8.22.0（2026-10-01） | 渲染；MeshPlane/MeshRope 让立绘做形变 |
| [Phaser](https://github.com/phaserjs/phaser) | 40507 | MIT | v4.2.1（2026-07-09） | 全功能框架；**v4 删除了 Mesh/Plane** |
| [Kaplay](https://github.com/kaplayjs/kaplay) | 1812 | MIT | 3001.0.19 | 上手简单，但观感偏卡通 |
| [matter-js](https://github.com/liabru/matter-js) / [planck.js](https://github.com/piqnt/planck.js) | 18483 / 5298 | MIT | 都还活跃 | 物理 |
| [pixi-filters](https://github.com/pixijs/filters) | 1139 | MIT | 6.x，支持 v8 | 冲击波、位移、辉光等屏幕效果 |
| [revolt-fx](https://github.com/bma73/revolt-fx) + [编辑器](https://github.com/bma73/revolt-fx-editor) | 66 / 23 | MIT | 支持 Pixi v8 | 粒子特效和编辑器 |
| [pixi particle-emitter](https://github.com/pixijs-userland/particle-emitter) | 851 | MIT | **只支持 Pixi v6/v7** | v8 上不能用 |
| [koreezgames/phaser3-particle-editor](https://github.com/koreezgames/phaser3-particle-editor) | 175 | MIT | 2020 年后停更 | Phaser 粒子编辑器 |
| [@pixi/ui](https://github.com/pixijs/ui)、[@pixi/layout](https://github.com/pixijs/layout)、[@pixi/sound](https://github.com/pixijs/sound) | 324 / 169 / 478 | MIT | 支持 v8 | 按钮、进度条、布局、音频 |
| [rexrainbow/phaser3-rex-notes](https://github.com/rexrainbow/phaser3-rex-notes) | 1332 | MIT | 活跃 | Phaser 的 UI、对话框、转场插件全家桶 |
| [tween.js](https://github.com/tweenjs/tween.js) | 10148 | MIT | 活跃 | 补间动画 |
| GSAP | 29482 | 自有免费许可，非 OSS | — | 能免费用，但不是开源许可，⚠ 需要先看条款 |
| [howler.js](https://github.com/goldfire/howler.js) / [ZzFX](https://github.com/KilledByAPixel/ZzFX) | 25398 / 804 | MIT | — | 音频；ZzFX 用代码生成音效 |
| [DragonBonesJS](https://github.com/DragonBones/DragonBonesJS) | 856 | MIT | 有 [pixi-dragonbones-runtime](https://github.com/h1ve2/pixi-dragonbones-runtime)（MIT，支持 Pixi v8） | 骨骼动画；编辑器免费但已停更，⚠ 未核实能否下载 |
| [Spine runtimes](https://github.com/EsotericSoftware/spine-runtimes) | 5325 | **Spine 专有许可** | 每个用户都要有 Spine 编辑器许可 | 不建议用 |
| [Rive](https://github.com/rive-app/rive-wasm) | 1008 | 运行时 MIT | 编辑器导出 .riv 需付费（Cadet 约 $9/月，⚠ 未核实当前价格） | 立绘骨骼和网格动画的可选方案 |
| [Lottie](https://github.com/airbnb/lottie-web) | 32249 | MIT | — | UI 动效 |

## 7. 素材

- Kenney（CC0）：Particle Pack、Smoke Particles、**Splat Pack**（可当墨渍）、UI Audio（50 个）、Interface Sounds（100 个）。⚠ 许可按 OpenGameArt 和 Godot 素材库上的说明，没在 kenney.nl 本站核对。
- itch.io 水墨类：[Xuanhuan Mood Art](https://willyee.itch.io/xuanhuan-mood-art) 是 CC0，24 张玄幻场景，**AI 生成**，偏写实上色，不是水墨。Ayeaka 的 [Ink Spill](https://ayeaka.itch.io/ink-spill-1) 和 [Stray Ink](https://ayeaka.itch.io/stray-ink) 是扫描的墨迹笔触，很合适，⚠ 许可未核实。
- 没找到 CC0 的成套中国水墨角色或 UI。结论：角色仍用我们自己的画，用 Kenney 的墨渍、烟雾和 UI 音效补足「游戏感」。

## 未核实

- Angry Aliens 用的 Kenney 美术许可（README 只写了致谢）。
- tower-of-time 和 server-survival 的 demo 没看过。
- DragonBones 编辑器能否下载。
- Rive 当前价格。
- Ayeaka 素材的许可。
- 原生 ESM iframe 方案下各库是否都有可直接加载的 ESM 构建（Phaser 和 Pixi 有）。
