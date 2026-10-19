# 添加物品与地图

[返回项目首页](../README.md) · [贡献指南](CONTRIBUTING.md)

## 模块边界

地图与物品目录使用普通 JavaScript 数据。单人游戏和房主模拟读取相同配置，房间快照传递地图 ID 和种子，各客户端独立重建相同场景。

物品参数放在 [src/items/catalog.js](../src/items/catalog.js)，造型放在 [src/items/models.js](../src/items/models.js)，地图放在 [src/maps/](../src/maps/)。完整代码分工见[贡献指南](CONTRIBUTING.md#开发入口)。

## 添加使用现有模型的物品

在 `src/items/catalog.js` 的 `ITEM_CATALOG` 中新增一项：

```js
pebble: {
  name: '鹅卵石',
  model: 'stone',
  radius: .4,
  mass: 1,
  height: .6,
  color: '#c5c5c5',
},
```

在地图的 `placements` 中使用它：

```js
{ type: 'pebble', x: 3, z: 5 }
```

地图可覆盖 `color` 和 `rotation`。位置以世界单位表示；`rotation` 为绕竖直轴旋转的弧度。物品目录自动提供吞噬尺寸、积分、可吞噬提示、完整穿越尺寸包络和模型参数。

| 字段 | 含义 |
| --- | --- |
| `name` | 游戏内物品名称 |
| `model` | `MODEL_BUILDERS` 中的构造函数名称 |
| `radius` | 包住模型水平投影的半径，用于可吞噬提示、激活范围与完整穿越的保守包络 |
| `mass` | 吞噬后的成长质量，每单位质量计 10 分 |
| `height` | 覆盖模型最高点的高度，与 `radius` 一起防止尚未落完就计分 |
| `color` | 默认颜色，可由地图中的单件摆放覆盖 |

`radius` 与 `height` 描述造型的实际尺寸。已有模型各自决定几何体大小；调整尺寸参数后，应运行模型包络测试核对造型。

## 添加全新造型

在 `src/items/models.js` 的 `MODEL_BUILDERS` 中注册构造函数，再将物品目录的 `model` 指向这个名称：

```js
mailbox({ box }, item) {
  box('#71848a', 0, .45, 0, .12, .9, .12);
  box(item.color, 0, 1, 0, .6, .4, .45);
},
```

`box(color, x, y, z, width, height, depth)` 与 `shape(kind, ...)` 都将几何体添加到局部原点的模型中。可使用的基础形状见该文件的 `geometries`。

模型以地面为 `y=0`，向上为正。目录的 `radius` 要包住整个模型的水平投影，`height` 要覆盖最高点。`src/items/models.test.js` 会遍历实际模型顶点检查这两个条件。

新增造型时，也要在 `src/physics/shapes.js` 的 `proxyParts` 中定义对应的复合凸体，保留树干、支脚、车轮等真正接触地面的部分，并运行 `src/physics/shapes.test.js` 与 `src/physics/world.test.js`。物理造型是简化近似，见[物理说明](PHYSICS.md)。

`glow(color, x, y, z, width, height, depth)` 绘制发光长方体，可用于灯牌与车灯。发光强度作为材质缓存键的一部分，与同色普通材质分开复用。

渲染器将相同原型按材质合并、再实例化绘制。物体下落只更新实例矩阵。地图作者和模型作者沿用这条绘制路径即可。

## 添加地图

新建 `src/maps/courtyard.js`：

```js
export const courtyardMap = {
  id: 'courtyard',
  name: '午后庭院',
  preview: '/maps/courtyard.jpg',
  theme: 'light',
  bounds: 12,
  spawns: [
    { x: -4, z: -4 }, { x: 4, z: -4 },
    { x: -4, z: 4 }, { x: 4, z: 4 },
  ],
  sky: '#e4edf0',
  cameraOffset: [20, 30, 24],
  create(seed) {
    return {
      surfaces: [
        { color: '#a9c5b7', position: [0, -.12, 0], size: [26, .22, 26] },
      ],
      placements: [
        { type: 'stone', x: -3, z: -3 },
        { type: 'cone', x: 3, z: -3 },
        { type: 'bush', x: -3, z: 3 },
        { type: 'stone', x: 3, z: 3 },
      ],
    };
  },
};
```

该地图直接使用内置物品，可独立添加并完成清空。`surfaces` 描述静态地表：`position` 是中心，`size` 是 `[宽度, 高度, 深度]`；地面表层保持在 `y=0` 附近。`bounds` 是玩家活动区域的半边长，黑洞圆周保持在该范围内。地形底座可以略大于活动范围。

在 `src/maps/index.js` 导入并注册：

```js
import { courtyardMap } from './courtyard.js';
export const MAPS = {
  [townMap.id]: townMap,
  [courtyardMap.id]: courtyardMap,
};
```

开始页和房主大厅的地图浏览器自动列出所有注册地图。`name` 是完整显示名称，`preview` 指向 `public/maps/` 中的场景缩略图，`theme` 使用 `light` 或 `dark`。新增地图沿用这份元数据即可。房主可以在准备大厅更换地图，房间广播新的地图 ID 与种子，所有客户端一起重建场景，客人需要重新准备。开局后不能再换地图。联机中各客户端需要包含该地图的同一版本。

`spawns` 按玩家加入顺序提供出生点，建议为最多 4 位玩家分别提供位置。`sky` 设置背景颜色，`cameraOffset` 是相机相对跟随目标的 `[x, y, z]` 偏移。

同一种子应生成相同的地形、物品数量、摆放顺序与 ID。不要使用 `Math.random()`、当前时间或客户端状态生成地图；`src/maps/layout.js` 提供可复用的种子随机数和布局工具。

共享布局工具提供 `polygon(color, points, y)`、`path(color, points, width, y)` 和 `clearing(color, x, z, width, depth, y)`。多边形由 Three.js `ShapeGeometry` 三角化并参与地表合批；`points` 使用世界平面的 `[x, z]` 坐标，`y` 为地表高度。曲线路径使用一组连续折点生成岸线与小径。底层多边形 surface 保留 `position`、`size`，并通过归一化 `points` 描述轮廓。`nearPath` 可将物品限制在河岸或小径附近。

## 内置地图与密度

- 悠闲小镇：活动半边长 56，运河与桥、果园、市场、街区公园；通常约 540–610 件物品
- 秘境森林：活动半边长 58，弯曲溪流、林间空地、营地、池塘与古树；通常约 650–720 件物品
- 霓虹都市：活动半边长 54，商业街、夜市广场、货运轨道与外围高楼；通常约 540–610 件物品

数量随种子变化，不使用固定 212 件的假设。HUD、结算和同步读取实际 `items.length`。上述范围是常见布局数量，具体数量由确定性生成器决定。

可选的 `fog: [near, far]` 设置雾效距离。可选的 `lighting` 提供 `skyLight`、`groundLight`、`ambientIntensity`、`sunColor`、`sunIntensity`、`exposure`；不提供时使用默认日间灯光。`cameraOffset` 仍以世界单位表示，地图变大不代表固定缩远镜头。

布局工具为每个出生点保留同样的 24 件小物品和 6 件初始可吃的中型物品，其他生成物不侵占这片空地。每片空地的初始质量相同，足以解锁本地图汽车或巨石层级；每个象限也有独立的完整成长路径。小物品会补齐外围街区，确保每个 16×16 的活动片区至少有 6 件物品。

大物品先放置，再填充中、小物品，所有摆放按照目录半径避免重叠，并在边缘保留最终黑洞所需的空间。装饰路面、河流和桥都是可通行的静态地表，不形成碰撞墙。所有地表顶面必须低于 `y=.075`，避免遮住 `y=.092` 的黑洞；共享工具会压低装饰层的厚度，同时保留地形底座。

## 验证

```bash
npm test
npm run build
```

新增地图应检查：出生点位于活动区域内、初始可吃物体足够、每级成长能到达下一类物品、最大尺寸仍能覆盖角落最后一件物体。`src/maps/maps.test.js` 覆盖多种种子的确定性、数量变化、分区密度、四人公平开局、各象限成长路径、全图清空、末件可达性、不重叠与地表高度；`src/rules.test.js` 展示了完整成长路径与边角可达性检查。
