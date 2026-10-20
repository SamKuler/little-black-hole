<div align="center">

  <h1>🕳️ 小小黑洞</h1>
  <p><strong>Little Black Hole</strong></p>

  <p>
    <a href="LICENSE"><img src="docs/assets/badges/license.svg" alt="License: MIT" /></a>
    <a href="docs/CONTRIBUTING.md#开发入口"><img src="docs/assets/badges/threejs.svg" alt="Three.js: 3D" /></a>
    <a href="docs/DEPLOYMENT.md"><img src="docs/assets/badges/vite.svg" alt="Vite: Web" /></a>
    <a href="docs/DEPLOYMENT.md#联机运行条件"><img src="docs/assets/badges/multiplayer.svg" alt="WebRTC: 2–4 players" /></a>
  </p>

  <p>
    <a href="#玩法">游戏玩法</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="docs/EXTENDING.md">扩展地图</a> ·
    <a href="docs/DEPLOYMENT.md">部署指南</a>
  </p>

</div>

使用 Three.js、Vite 和 PeerJS 构建，支持 2–4 人好友房、物品与地图扩展，可部署为静态网站。

## 玩法

| 模式 | 人数 | 目标 |
| --- | --- | --- |
| 自由漫游 | 1 | 自由探索，清空所选地图 |
| 限时挑战 | 1 | 在 120 秒内获得更高吞噬得分 |
| 好友竞赛 | 2–4 | 争抢同一张地图的物品，120 秒后按得分排名 |
| 合作清空 | 2–4 | 共享洞口成长，一起清空地图，查看个人贡献 |

吞噬质量决定洞口大小，每单位质量计 10 分。洞口会移除地面支撑，物体在重力与洞缘接触力作用下倾倒、滑落或卡在边缘；完整穿过地面后才计分。物体保持原尺寸，洞口移开时可能重新接住尚未落完的物体；清空地图可提前结算。

物理使用简化复合刚体，处理物体与地面、洞缘的接触；暂不模拟物体之间的碰撞、堆叠或建筑破碎。实现与边界见[物理说明](docs/PHYSICS.md)。

## 三种地图

- **悠闲小镇**：112 × 112 米，沿运河逛果园、街角集市与不同街区。
- **秘境森林**：116 × 116 米，在树林、溪流与营地间寻找蘑菇、原木和木屋。
- **霓虹都市**：108 × 108 米，吞噬霓虹货箱、悬浮车与霓虹高楼，探索赛博朋克街区。

每张地图有不同的物品数量与随机布局，随地图面积保持充足密度；开始页显示本次地图的实际物体数。每个出生点都有公平的小物体与中型物体成长路线。单人模式可直接选图；好友房由房主选图，所有人使用相同地图与种子。

## 快速开始

推荐 Node.js 24 LTS，最低版本为 22.12.0。浏览器需要支持 WebGL2，并开启硬件加速。

在仓库目录执行：

```bash
npm ci
npm run dev
```

打开终端显示的地址即可游玩。使用 nvm 时可先运行 `nvm use`。

<details>
<summary>构建与预览生产版本</summary>

<br />

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。部署步骤见[部署指南](docs/DEPLOYMENT.md)。

</details>

## 操作与联机

- 鼠标或触屏：按住场景拖动，拖动方向决定移动方向，松手停止。
- 键盘：<kbd>WASD</kbd> 或方向键移动；<kbd>Space</kbd> / <kbd>Esc</kbd> 打开暂停菜单。
- 单人暂停：右上角暂停按钮；切换窗口也会自动暂停。
- 好友联机：选择「好友联机」与地图，填写昵称并创建房间，将邀请链接或 8 位房间号分享给朋友。房主也可在等待大厅换图；换图会同步给所有人，并要求客人重新准备。客人准备后，由房主开始。
- 联机暂停：房主可暂停整局；客人打开个人菜单时，其他人继续游戏。
- 再来一局：保留所选地图并生成新布局；好友房回到等待大厅，房主可继续换图。

好友房通过 PeerJS 公共信令服务建立 WebRTC 连接，由房主浏览器统一计算游戏状态。房主离开后房间结束；部分网络需要额外配置 TURN 中继。详细运行条件与排查步骤见[部署指南](docs/DEPLOYMENT.md#联机运行条件)。

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [贡献指南](docs/CONTRIBUTING.md) | 代码分工、验证流程、问题反馈与 Pull Request |
| [添加物品与地图](docs/EXTENDING.md) | 物品参数、模型构造、地图注册与示例 |
| [部署指南](docs/DEPLOYMENT.md) | Vercel、GitHub 自动部署、访问保护与联机排查 |
| [产品说明](docs/PRODUCT.md) | 产品定位、能力与约束 |
| [视觉约定](docs/DESIGN.md) | 场景、色彩、字体和交互状态 |
