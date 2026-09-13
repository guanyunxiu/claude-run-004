/**
 * 二期功能算法单测：碰撞、对齐/分布/阵列、手动墙编辑、房间净面积/命名
 *   node scripts/features2.test.mjs
 */
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPath = resolve(root, '.f2_entry.ts')
const bundlePath = resolve(root, '.f2_bundle.mjs')

writeFileSync(
  entryPath,
  `export { boxIntersectsBox, boxIntersectsWall, detectCollisions, boxCorners } from './src/lib/collision'
export { alignElements, distributeElements, makeArrayCopies, snapFurnitureToWalls, snapFurnitureToOthers } from './src/lib/layout'
export { insertVertex, removeVertex, splitWallAt, joinWalls, canJoinWalls, findSplitPoint } from './src/lib/wallOps'
export { openingPlacement } from './src/lib/openings'
export { roomSignature, roomNetArea, roomLabelText, createRoomMeta } from './src/lib/roomMeta'
export { useEditor } from './src/store/useEditor'
export { nextTick } from 'vue'
`
)
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  absWorkingDir: root,
  logLevel: 'silent'
})
const lib = await import(bundlePath)

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? '  ' + e : ''}`)
  c ? pass++ : fail++
}
const approx = (a, b, eps = 2) => Math.abs(a - b) <= eps

const wall = (id, pts, t = 120, closed = false) => ({ id, kind: 'wall', points: pts, closed, thickness: t, color: '#000' })
const box = (id, x, y, w, h, r = 0) => ({ id, kind: 'furniture', defId: 'x', x, y, width: w, height: h, rotation: r })

// ----------------------------------------------------------- 0. 整墙平移门窗跟随
{
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
  const door = { id: 'd', wallId: 'w1', offset: 500, width: 800 }
  const before = lib.openingPlacement(w, door)
  // 整墙平移 (+300, +400)
  w.points = w.points.map((p) => ({ x: p.x + 300, y: p.y + 400 }))
  const after = lib.openingPlacement(w, door)
  check('整墙平移:门窗中心跟随 +300,+400', approx(after.center.x - before.center.x, 300) && approx(after.center.y - before.center.y, 400), `${after.center.x},${after.center.y}`)
}

// ----------------------------------------------------------- 1. 碰撞检测
{
  // 两个轴对齐矩形重叠
  check('OBB 重叠', lib.boxIntersectsBox({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }, { x: 80, y: 0, width: 100, height: 100, rotation: 0 }))
  check('OBB 分离', !lib.boxIntersectsBox({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }, { x: 300, y: 0, width: 100, height: 100, rotation: 0 }))
  // 旋转 45° 的矩形与轴对齐
  check('旋转矩形重叠', lib.boxIntersectsBox({ x: 0, y: 0, width: 200, height: 200, rotation: Math.PI / 4 }, { x: 60, y: 0, width: 40, height: 40, rotation: 0 }))
}
{
  // 家具矩形与墙（水平线 y=0，厚120）
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }], 120)
  check('家具压墙 => 碰撞', lib.boxIntersectsWall({ x: 1000, y: 0, width: 400, height: 400, rotation: 0 }, w))
  check('家具离墙 => 不碰撞', !lib.boxIntersectsWall({ x: 1000, y: 1000, width: 400, height: 400, rotation: 0 }, w))
}
{
  // detectCollisions 汇总
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }], 120)
  const others = [{ id: 'f2', box: { x: 80, y: 0, width: 100, height: 100, rotation: 0 } }]
  const r = lib.detectCollisions({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }, 'f1', { walls: [w], boxes: others })
  check('碰撞报告含墙与家具', r.hasCollision && r.targets.includes('w1') && r.targets.includes('f2'), JSON.stringify(r.targets))
}

// ----------------------------------------------------------- 2. 对齐
{
  const a = box('a', 0, 0, 100, 100)
  const b = box('b', 500, 300, 100, 100)
  lib.alignElements([a, b], 'left')
  // minX 对齐到 -50（两者并集最小）
  check('左对齐', approx(a.x, 0) && approx(b.x, 0), `${a.x},${b.x}`)
}
{
  const a = box('a', 0, 0, 100, 200)
  const b = box('b', 500, 500, 100, 200)
  lib.alignElements([a, b], 'top')
  check('顶对齐', approx(a.y, 0) && approx(b.y, 0))
}
// 等距分布
{
  const a = box('a', 0, 0, 100, 100)
  const b = box('b', 200, 0, 100, 100)
  const c = box('c', 600, 0, 100, 100) // 间距：a-b 100，b-c 300
  lib.distributeElements([a, b, c], 'horizontal')
  // 总空隙 = 700-(-50) - (50) ... 直接验证 b 在中间等距
  const gap1 = b.x - a.x
  const gap2 = c.x - b.x
  check('水平等距', approx(gap1, gap2, 1), `${gap1},${gap2}`)
}

// ----------------------------------------------------------- 3. 阵列复制
{
  const proto = box('p', 0, 0, 400, 400)
  const copies = lib.makeArrayCopies(proto, { axis: 'x', spacing: 500, count: 4 }, () => 'n' + Math.random())
  check('阵列数量=3', copies.length === 3)
  check('阵列间距', approx(copies[0].x, 500) && approx(copies[2].x, 1500))
  check('阵列副本是深拷贝且新id', copies.every((c) => c.id !== proto.id) && new Set(copies.map((c) => c.id)).size === 3)
}

// ----------------------------------------------------------- 4. 靠墙吸附
{
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 4000, y: 0 }])
  // 家具中心 (1000,210)、高400 => 顶边 y=10，距墙线 10mm，吸附后顶边对齐 y=0 => 中心 y=200
  const f = box('f1', 1000, 210, 400, 400)
  const g = lib.snapFurnitureToWalls(f, [w], 50)
  const ny = g ? g.y : null
  check('水平墙边缘吸附', !!g && g.edge === 'y' && approx(ny, 200) && approx(ny - 200, 0), JSON.stringify(g))
}
{
  // 家具间 x 边缘对齐：b 在 a 右侧且垂直错开，避免顶边重合
  const a = box('a', 0, 0, 400, 400) // 右边 x=200
  const b = box('b', 405, 300, 400, 400) // 左边 x=205，距 a 右边 5
  const g = lib.snapFurnitureToOthers(b, [a], 50)
  check('家具边缘 x 吸附', !!g && g.edge === 'x' && approx(g.x, 400), g ? JSON.stringify(g) : 'null')
}

// ----------------------------------------------------------- 5. 手动墙编辑
{
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }])
  const idx = lib.insertVertex(w, { x: 500, y: 5 }, 100)
  check('插入顶点', idx === 1 && w.points.length === 4 && approx(w.points[1].x, 500) && approx(w.points[1].y, 0), `${idx} ${JSON.stringify(w.points)}`)
  const removed = lib.removeVertex(w, 1)
  check('删除中间顶点', removed && w.points.length === 3)
  // 开放墙至少 2 点
  const w2 = wall('w2', [{ x: 0, y: 0 }, { x: 100, y: 0 }])
  check('两点墙不能再删', !lib.removeVertex(w2, 0))
}
{
  // 打断
  const w = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
  const openings = [{ wallId: 'w1', offset: 1500, width: 400 }]
  const sp = lib.findSplitPoint(w, { x: 1000, y: 3 }, 100)
  check('查找打断点', !!sp && approx(sp.dist, 1000), JSON.stringify(sp))
  const nw = lib.splitWallAt(w, sp.dist, sp.point, openings, () => 'newW')
  check('打断后前段到1000', approx(w.points.at(-1).x, 1000))
  check('打断后新段从1000到2000', approx(nw.points[0].x, 1000) && approx(nw.points[1].x, 2000))
  check('打断后门窗归后半段并平移', openings[0].wallId === 'newW' && approx(openings[0].offset, 500), JSON.stringify(openings[0]))
}
{
  // 合并折线墙（非共线）
  const a = wall('a', [{ x: 0, y: 0 }, { x: 1000, y: 0 }])
  const b = wall('b', [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }])
  check('可合并判定', lib.canJoinWalls(a, b, 50))
  const openings = [{ wallId: 'b', offset: 200, width: 400 }]
  const r = lib.joinWalls(a, b, openings)
  check('合并折线墙', r && a.points.length === 3 && approx(a.points[2].y, 1000), JSON.stringify(a.points))
  check('合并后门窗 offset=1000+200', openings[0].wallId === 'a' && approx(openings[0].offset, 1200), JSON.stringify(openings[0]))
}

// ----------------------------------------------------------- 6. 房间签名/净面积/标签
{
  const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1600 }, { x: 0, y: 1600 }]
  const sig1 = lib.roomSignature(pts)
  const sig2 = lib.roomSignature([...pts].reverse()) // 顺序不同但点集相同
  check('房间签名对点序不敏感', sig1 === sig2)
}
{
  const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }]
  const col = { id: 'c', x: 500, y: 500, width: 400, height: 400, deduct: true }
  const net = lib.roomNetArea(pts, [col])
  check('柱子扣减净面积', approx(net, 4e6 - 0.16e6), String(net))
  const platform = { id: 'p', x: 500, y: 500, width: 400, height: 400, deduct: false }
  const net2 = lib.roomNetArea(pts, [platform])
  check('地台不扣减', approx(net2, 4e6))
}
{
  const room = { id: 'r0', points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], area: 2e6, perimeter: 6000, wallIds: [], sig: 's', netArea: 2e6, meta: { id: 'm', sig: 's', name: '主卧', fill: '', labelPos: null } }
  check('命名标签「主卧 2㎡」', lib.roomLabelText(room) === '主卧 2㎡', lib.roomLabelText(room))
  const room2 = { ...room, meta: { ...room.meta, name: '' } }
  check('无名标签仅面积', lib.roomLabelText(room2) === '2㎡', lib.roomLabelText(room2))
}
{
  // 小数面积保留 1 位小数
  const room = { id: 'r', points: [], area: 2.3e6, perimeter: 0, wallIds: [], sig: 's', netArea: 2.3e6, meta: { id: 'm', sig: 's', name: '主卧', fill: '', labelPos: null } }
  check('命名标签小数「主卧 2.3㎡」', lib.roomLabelText(room) === '主卧 2.3㎡', lib.roomLabelText(room))
}

// ----------------------------------------------------------- 7. store 集成：结构/房间/阵列
{
  const editor = lib.useEditor()
  const { state } = editor
  state.doc.elements = []
  const col = editor.makeStructure('column', 100, 100)
  editor.addElement(col, false)
  check('结构构件工厂', col.kind === 'structure' && col.structKind === 'column' && col.deduct === true)
  // 房间净面积（矩形房 + 柱）
  editor.addElement(wall('r1', [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }], 120, true), false)
  await lib.nextTick()
  const rooms = editor.rooms.value
  check('房间被推导', rooms.length === 1, `rooms=${rooms.length}`)
  if (rooms.length === 1) {
    check('净面积扣除柱子', rooms[0].netArea < rooms[0].area - 1, `net=${rooms[0].netArea} gross=${rooms[0].area}`)
    editor.setRoomName(rooms[0], '主卧')
    const room2 = editor.rooms.value.find((r) => r.id === rooms[0].id)
    check('房间命名绑定', room2.meta?.name === '主卧')
  }
  // 阵列 store
  const f = editor.makeFurniture('coffee-table', 0, 0, 400, 400)
  editor.addElement(f, false)
  editor.selectOnly([f.id])
  const n = editor.arraySelected({ axis: 'y', spacing: 600, count: 3 })
  check('store 阵列复制 2 个', n === 2)
  check('store 对齐命令存在', typeof editor.alignSelected === 'function')
}

rmSync(entryPath)
rmSync(bundlePath)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
