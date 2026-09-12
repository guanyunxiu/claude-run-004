# 户型图绘制与布局测量工具

基于 **Vue3 + TypeScript + Vite + 原生 SVG** 的户型图编辑器，Element Plus 提供 UI，
html2canvas 作为导出兜底。几何算法全部自研（向量、线段相交、吸附、鞋带公式、双线墙 miter 偏移、面环提取）。

## 功能

| 模块 | 能力 |
| --- | --- |
| SVG 画布 | 滚轮以光标为中心缩放、空格/中键/平移工具拖拽、250/1000mm 网格、随缩放自适应刻度的十字标尺 |
| 历史 | 撤销 / 重做（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y），拖拽只产生一条快照 |
| 选择 | 点选、Shift 多选、空白处框选、Shift 框选累积加选、Ctrl+A 全选、Delete 删除、方向键微移（Shift=250mm） |
| 墙体 | 连续双线墙、自定义墙厚/颜色、端点/中点/交点吸附（阈值与类型可配置）、90° 正交与 45° 角度锁定（Shift 临时放开自由微调）、顶点拖拽、单击起点/双击/右键结束 |
| 墙体工具 | 相交自动裁剪（端头埋入它墙的悬挑段删除，门窗跟随平移）、断线修复（端点吸附 + 共线断线合并，门窗 offset 重映射）、多墙批量改厚/改色 |
| 门窗 | 平开门（合页端、左右开启方向、门宽可调、开启弧线）与固定窗（四线）依附墙体，沿墙拖动，墙上真实开洞 |
| 家具 | 床/沙发/衣柜/餐桌/茶几/冰箱/灶台/洗菜盆/马桶/洗手盆/淋浴/浴缸/洗衣机，拖拽或点击放置、角点缩放、旋转（15° 吸附，Shift 自由旋转） |
| 测量 | 临时测距（长度+角度，不落库）、线性尺寸标注、角度标注（三点建弧）、闭合房间自动计算面积与周长 |
| 标注联动 | 标注锚点可绑定墙顶点/墙段中点，墙体改动后标注数值与位置自动更新；引用失效自动降级为自由点 |
| 编辑 | Ctrl+C/X/V 复制剪切粘贴（墙带上门窗、id 重映射）、Ctrl+D 快速副本、图元层级置顶/置底/上移/下移（Ctrl+]/[） |
| 样式 | 单墙/全局墙色墙厚、标注颜色线宽、背景色、网格/标尺/正交/45°/吸附开关 |
| 导出 | 按图纸包围盒自动裁剪、剔除 UI 与辅助层的高清 PNG（2x/3x 超采样），另有 JSON 导入/保存（旧版本自动迁移） |

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run typecheck
```

## 快捷键

| 按键 | 功能 |
| --- | --- |
| V / W / D / C / L / A / M / H | 选择 / 画墙 / 门 / 窗 / 线性标注 / 角度标注 / 测距 / 平移 |
| 空格（按住）/ 鼠标中键 | 临时平移 |
| Ctrl+Z / Ctrl+Shift+Z | 撤销 / 重做 |
| Ctrl+A | 全选 |
| Ctrl+C / Ctrl+X / Ctrl+V | 复制 / 剪切 / 粘贴 |
| Ctrl+D | 快速副本（偏移 200mm） |
| Ctrl+] / Ctrl+[ | 上移 / 下移一层（同类型内），加 Shift 置顶 / 置底 |
| Delete / Backspace | 删除选中 |
| 方向键 / Shift+方向键 | 微移 50mm / 250mm |
| Shift（画墙/旋转时按住） | 临时关闭角度锁定，自由角度微调 |
| Esc | 取消当前绘制/测距 |
| 双击 / 右键（画墙中） | 结束当前墙体（不闭合） |

## 目录结构

```
src/
├─ lib/
│  ├─ geometry.ts      # 向量、相交、投影、吸附角度锁定、鞋带公式、双线墙 miter 轮廓、角度弧
│  ├─ snapping.ts      # 端点 / 中点 / 交点统一吸附
│  ├─ walls.ts         # 中心线打断建图 + half-edge 面环遍历 -> 闭合房间
│  ├─ wallOps.ts       # 相交端头裁剪、断线修复（端点聚类+共线合并）、批量编辑、门窗迁移
│  ├─ dimensionSync.ts # 标注-墙锚点绑定，墙体改动后自动更新
│  ├─ clipboard.ts     # 复制粘贴（id 重映射、门窗跟随墙）
│  ├─ layering.ts      # 图元层级（置顶/底/上移/下移）
│  ├─ openings.ts      # 门窗依附墙体（沿墙距离/投影/夹取）
│  ├─ hit.ts           # 命中检测与框选（含角度标注）
│  ├─ furniture.ts     # 家具库定义（默认尺寸 + 归一化平面图形）
│  ├─ exporter.ts      # 高清 PNG 导出（SVG 序列化 + Canvas 超采样）
│  └─ format.ts / uid.ts
├─ store/useEditor.ts  # reactive 文档模型 + 快照历史 + 墙改联动 watcher
├─ composables/useViewport.ts  # 世界/屏幕坐标换算、缩放、适配
├─ components/
│  ├─ canvas/  CanvasView（交互状态机）/ GridLayer / Rulers
│  └─ svg/     Wall / Door / Window / Furniture / Dimension（线性+角度）/ RoomFace / OpeningsMask
└─ types.ts
```

## 核心算法说明

- **双线墙**：沿折线每点的切线求左/右法线，按 miter 斜接公式 `offset = (t/2)/dot(n_left,n_in)`
  计算两侧偏移点；夹角过尖（miter > 4×）回退为垂直切割，避免尖角过长。
- **闭合房间**：把所有墙中心线在交点处打断为原子线段（端点共用精确坐标，消除浮点碎点），
  构造无向 half-edge 图；在每个节点沿固定旋向（入射反向的顺时针首条出边）遍历得到面环，
  屏幕坐标系下顺时针环（鞋带有向面积 < 0）即为有界房间，周长由环边求和得到。
- **鞋带公式**：`S = |Σ(x_i·y_{i+1} − x_{i+1}·y_i)| / 2`，面积与形心一并计算。
- **墙上开洞**：所有墙路径共用一个 SVG `<mask>`，门窗洞口位置沿墙方向旋转出黑色矩形，
  双线墙填充时被真实挖空，门/窗图元再绘制在洞口处。
- **导出**：只挑选 `.wall-shape / .door-shape / ...` 等图元深拷贝进独立 SVG，
  按图纸包围盒设 viewBox，剥离选中手柄与网格，Canvas 按 2x/3x 超采样输出 PNG。

## 自动化测试

```bash
node scripts/features.test.mjs   # 吸附/角度锁定/裁剪/修复/标注联动/层级/剪贴板 算法单测（esbuild 即时转译）
node scripts/smoke.mjs           # Playwright 全链路冒烟
node scripts/regression.mjs      # Playwright 回归（导出稳定性、旋转命中、标注拖动、缩放跟随光标等）
```

`scripts/smoke.mjs` 使用 Playwright 完成「画闭合墙 → 自动面积/周长 → 门/窗/家具/标注 →
撤销重做 → 测距 → 框选删除 → 导出 PNG」的全链路校验：

```bash
# 需要先 npm i -D playwright && npx playwright install chromium
node scripts/smoke.mjs
```
