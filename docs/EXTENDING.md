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

地图可覆盖 `color` 和 `rotation`。位置以世界单位表示；`rotation` 为绕竖直轴旋转的弧度。物品目录自动提供吞噬尺寸、积分、可吞噬提示、下落时长和模型参数。

| 字段 | 含义 |
| --- | --- |
| `name` | 游戏内物品名称 |
| `model` | `MODEL_BUILDERS` 中的构造函数名称 |
| `radius` | 包住模型水平投影的半径，用于吞噬尺寸及完整进入洞口的判断 |
| `mass` | 吞噬后的成长质量，每单位质量计 10 分 |
| `height` | 覆盖模型最高点的高度，与 `radius` 一起决定下落时长 |
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

渲染器将相同原型按材质合并、再实例化绘制。物体下落只更新实例矩阵。地图作者和模型作者沿用这条绘制路径即可。

## 添加地图

新建 `src/maps/courtyard.js`：

```js
export const courtyardMap = {
  id: 'courtyard',
  name: '午后庭院',
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

该地图直接使用内置物品，可独立添加并完成清空。`surfaces` 描述静态长方体：`position` 是中心，`size` 是 `[宽度, 高度, 深度]`；地面表层保持在 `y=0` 附近。`bounds` 是玩家活动区域的半边长，黑洞圆周保持在该范围内。地形底座可以略大于活动范围。

在 `src/maps/index.js` 导入并注册：

```js
import { courtyardMap } from './courtyard.js';
export const MAPS = {
  [townMap.id]: townMap,
  [courtyardMap.id]: courtyardMap,
};
```

注册第二张地图后，开始页自动显示地图选择。房主创建房间时锁定所选地图。联机中各客户端需要包含该地图的同一版本。

`spawns` 按玩家加入顺序提供出生点，建议为最多 4 位玩家分别提供位置。`sky` 设置背景颜色，`cameraOffset` 是相机相对跟随目标的 `[x, y, z]` 偏移。

同一种子应生成相同的地形与摆放。需要随机布局时，在地图内使用以 `seed` 初始化的伪随机数生成器；小镇文件提供了可直接复用的写法。

## 验证

```bash
npm test
npm run build
```

新增地图应检查：出生点位于活动区域内、初始可吃物体足够、每级成长能到达下一类物品、最大尺寸仍能覆盖角落最后一件物体。`src/maps/maps.test.js` 展示了将新地图接入同一引擎的测试；`src/rules.test.js` 展示了完整成长路径与边角可达性检查。
