# 贡献指南

[返回项目首页](../README.md) · [添加物品与地图](EXTENDING.md)

## 开发入口

按[快速开始](../README.md#快速开始)安装并启动项目。源码使用原生 JavaScript 模块，单人和联机共享游戏规则与地图配置。

| 文件或目录 | 职责 |
| --- | --- |
| [src/main.js](../src/main.js) | 页面交互、输入、音效与逐帧渲染调度 |
| [src/match.js](../src/match.js) | 游戏状态、吞噬归属、成长、计分、结算与暂停 |
| [src/rules.js](../src/rules.js) | 成长公式、吞噬尺寸与活动边界 |
| [src/room.js](../src/room.js) | PeerJS 连接、房间成员、输入传输与状态同步 |
| [src/items/](../src/items/) | 物品参数与 Three.js 模型构造 |
| [src/maps/](../src/maps/) | 地图配置、种子布局与注册表 |
| [src/fall.js](../src/fall.js) | 下落时长与逐帧姿态 |
| [src/render/](../src/render/) | 实例化绘制、资源释放与移动预测 |
| [src/style.css](../src/style.css)、[index.html](../index.html) | 界面样式与页面结构 |

新增物品与地图可从[扩展指南](EXTENDING.md)开始。界面改动参考[视觉约定](DESIGN.md)。

## 提交前验证

```bash
npm test
npm run build
```

测试覆盖成长路径、尺寸包络、边角可达性、地图确定性、计时结算、吞噬唯一归属、多人准备、输入边界、断线排名、暂停、移动预测与渲染资源释放。GitHub Actions 在推送和 Pull Request 时执行安装、测试与构建。

涉及交互或联机的改动还需要在浏览器中验证对应流程：

- 开始页、模式选择、开局、暂停、继续和结算。
- 分别选择小镇、森林与霓虹都市，检查实际物体数量、主题、每个出生点的成长路线与地图边缘。
- 鼠标拖动、键盘移动与窄屏触摸操作。
- 两个浏览器页面完成创建、邀请、准备和开局，观察位置、得分与排名同步。
- 房主在大厅换图，确认客人地图与物体数同步、选择器不可编辑、准备状态清除；重新准备后可开局。客人在换图后加入也应获得当前地图。
- 房主暂停时，全体移动和倒计时停止；客人打开菜单时，房间继续运行。
- 结算后再来一轮，以及客人退出、房主退出时的房间状态。
- 反复换图与再来一轮，确认地图保留、新布局生成、旧场景资源释放，窄屏面板能滚动到所有操作。

Node 测试覆盖游戏逻辑与渲染数据结构。WebRTC 连通性需在真实浏览器和目标网络中验证，排查方法见[部署指南](DEPLOYMENT.md#常见问题)。

## 问题反馈与 Pull Request

Issue 请说明浏览器及版本、设备、游戏模式、复现步骤、预期结果和实际结果。联机问题同时说明房主与客人的网络环境，可附控制台错误或截图。

Pull Request 请描述改动后的行为，并写明验证命令和浏览器检查结果。提交说明采用 `feat:`、`fix:`、`docs:` 等 Conventional Commits 前缀。

新增或升级运行时依赖时，同步更新 `package-lock.json`，核对依赖许可证，并更新 [public/THIRD_PARTY_NOTICES.txt](../public/THIRD_PARTY_NOTICES.txt) 中的版本及许可原文。该文件通过 Vite 的 `public/` 目录进入静态构建。

## 资源来源

场景由 Three.js 基础几何体构建，音效通过 Web Audio 本地合成。Noto Sans SC 从 Google Fonts 加载，加载失败时使用本地无衬线字体。
