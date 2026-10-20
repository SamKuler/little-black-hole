# 部署指南

[返回项目首页](../README.md) · [贡献指南](CONTRIBUTING.md)

项目为静态 Vite 应用。单人游戏和好友直连均在浏览器运行，房间状态存于房主浏览器。生产环境使用 HTTPS。

## Vercel 构建设置

仓库根目录包含 [vercel.json](../vercel.json)，配置如下：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 仓库根目录 |
| Node.js Version | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

当前应用直接使用公共信令服务，可在默认配置下运行。

## 通过 GitHub 自动部署

1. 将源码、锁文件及配置上传到 GitHub。
2. 打开已有 Vercel 项目的 **Settings → Git → Connect Git Repository**。首次部署可从 **Add New → Project** 导入仓库。
3. 连接 GitHub 账号，为 Vercel GitHub App 授予目标仓库访问权限，然后选择仓库。
4. 按上表核对构建设置，将生产分支设为 `main`。
5. 触发部署，在 Deployments 中检查日志与构建结果，然后打开正式站验证。

后续推送或合并到生产分支会更新正式站，其他分支和 Pull Request 会生成预览部署。Fork 提交的预览部署可能需要维护者授权。见 [Vercel GitHub 集成文档](https://vercel.com/docs/git/vercel-for-github)。

GitHub Actions 的测试与 Vercel 的部署构建分别运行。发布时同时查看两边结果；需要将测试结果设为发布门禁时，可进一步配置 [Deployment Checks](https://vercel.com/docs/deployment-checks)。

## 通过 CLI 部署

先在本地验证构建：

```bash
npm ci
npm test
npm run build
```

登录 Vercel 并关联项目：

```bash
npx vercel login
npx vercel link
```

关联已有项目时选择对应团队和项目。`.vercel/` 保存本机关联信息，已由 `.gitignore` 排除。

创建预览部署：

```bash
npx vercel
```

发布正式站：

```bash
npx vercel --prod
```

命令说明见 [Vercel 部署文档](https://vercel.com/docs/cli/deploy)。

## 正式站公开与预览保护

在项目的 **Settings → Deployment Protection** 中配置访问保护。需要让玩家直接访问正式站、同时保留预览保护时，可为 Vercel Authentication 选择 **Standard Protection** 并保存。

Standard Protection 公开正式站域名，同时保护预览和生成的部署地址。分享游戏时使用项目 Domains 中的正式站域名。保存后用未登录 Vercel 的浏览器检查正式站访问。见 [Vercel 访问保护文档](https://vercel.com/docs/deployment-protection)。

## 联机运行条件

PeerJS 使用公共 PeerJS Cloud 交换连接信令，游戏状态通过 WebRTC DataChannel 在浏览器间传输。房主统一计算位置、吞噬、成长、计时和得分；客人发送移动方向及准备状态。

房主在等待大厅选图，快照携带地图 ID、种子与轮次，各客户端重建完全相同的物体及地形。更换地图会重置客人准备状态；旧轮次的准备消息不会意外启动新地图。再来一局保留地图，但更新种子与轮次。

刚体物理版本使用 `little-black-hole-v4-` 房间命名空间，与旧版房间不互通，防止旧版客户端继续播放定时下落动画。所有玩家需刷新到同一版本，再创建或加入房间；已有旧版房间需要重新创建。

房主关闭页面或离开房间后，本房间结束。房主保持页面运行可获得更稳定的同步频率；后台节流、网络延迟与设备性能都会影响游玩体验。

公共信令服务可用性及双方网络决定连接结果。对称 NAT、部分企业或校园网络需要额外的 TURN 中继。当前版本使用 PeerJS 默认 ICE 配置，适合好友直连。跨任意网络稳定连接需要部署 TURN，在短期凭据服务配合下将 ICE 配置接入 [src/room.js](../src/room.js) 的 Peer 构造过程。

好友房适用于熟人游戏。公开竞技的专用服务器裁决、账号和长期战绩需要独立的服务端基础设施。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 正式站要求 Vercel 登录 | 检查 Deployment Protection 的范围，并确认使用项目的正式站域名 |
| 页面可打开，房间连接失败 | 确认双方使用同一版本、房间仍在等待开局，再检查公共信令服务、网络限制与 TURN 需求 |
| 房主切换窗口后同步变慢 | 保持房主页面运行，并在目标设备与网络上重新验证 |
| 3D 场景无法显示 | 检查浏览器 WebGL2 支持、硬件加速及控制台错误 |
| 字体加载慢 | Google Fonts 加载失败时页面会使用本地无衬线字体 |
