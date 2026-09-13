/**
 * Store 集成测试（node + 真实 Vue reactivity）：
 *   node scripts/store.test.mjs
 * 验证标注自动更新 watcher、裁剪/修复/粘贴/层级/迁移等命令在真实 store 上的行为。
 */
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPath = resolve(root, '.store_entry.ts')
const bundlePath = resolve(root, '.store_bundle.mjs')

writeFileSync(
  entryPath,
  `export { useEditor } from './src/store/useEditor'
export { nextTick } from 'vue'`
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
const { useEditor, nextTick } = await import(bundlePath)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`)
  cond ? pass++ : fail++
}

const editor = useEditor()
const { state } = editor
const approx = (a, b, eps = 2) => Math.abs(a - b) <= eps

// 每次测试前清空文档（不依赖 undo 历史）
function reset() {
  state.doc.elements = []
  state.selection = new Set()
}

const wall = (id, pts, thickness = 120, closed = false) =>
  editor.addElement(
    { id, kind: 'wall', points: pts, closed, thickness, color: '#303133' },
    false
  )
const flush = () => new Promise((r) => setTimeout(r, 0))

// ----------------------------------------------------------- 1. 标注 watcher 联动
reset()
wall('w1', [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1600 },
  { x: 0, y: 1600 }
])
const d = editor.makeDimension({ x: 0, y: 0 }, { x: 2000, y: 0 }, 300)
d.ref1 = { kind: 'wall-vertex', wallId: 'w1', index: 0 }
d.ref2 = { kind: 'wall-vertex', wallId: 'w1', index: 1 }
editor.addElement(d, false)
// 拖动墙顶点
{
  const w = state.doc.elements.find((e) => e.id === 'w1')
  w.points[1] = { x: 2400, y: 0 }
}
await flush()
check('watcher: 拖墙顶点后标注 p2 自动到 2400', approx(d.p2.x, 2400), JSON.stringify(d.p2))
check('标注文本数值随之变化（长度 2400）', approx(Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y), 2400))

// 中点锚点
reset()
wall('w1', [{ x: 0, y: 0 }, { x: 3000, y: 0 }])
const d2 = editor.makeDimension({ x: 1500, y: 0 }, { x: 1500, y: -600 }, 0)
d2.ref1 = { kind: 'wall-mid', wallId: 'w1', index: 0 }
editor.addElement(d2, false)
editor.pushHistory()
state.doc.elements.find((e) => e.id === 'w1').points[1] = { x: 5000, y: 0 }
await flush()
check('watcher: 墙段中点锚点跟随', approx(d2.p1.x, 2500), String(d2.p1.x))

// 撤销后标注也回退（快照完整）
editor.undo()
{
  const wRestored = state.doc.elements.find((e) => e.id === 'w1')
  const dRestored = state.doc.elements.find((e) => e.id === d2.id)
  check('撤销后墙恢复', wRestored.points[1].x === 3000)
  check('撤销后标注坐标回退', approx(dRestored.p1.x, 1500), String(dRestored.p1.x))
}
editor.redo()

// 删墙后引用降级为 free，坐标保持
reset()
wall('gone', [{ x: 0, y: 0 }, { x: 1000, y: 0 }])
const d3 = editor.makeDimension({ x: 0, y: 0 }, { x: 1000, y: 0 })
d3.ref1 = { kind: 'wall-vertex', wallId: 'gone', index: 0 }
d3.ref2 = { kind: 'wall-vertex', wallId: 'gone', index: 1 }
editor.addElement(d3, false)
editor.removeElements(['gone'])
await flush()
check('watcher: 墙删除后引用降级 free 且坐标保留', d3.ref1.kind === 'free' && d3.ref2.kind === 'free' && d3.p1.x === 0 && d3.p2.x === 1000)

// ----------------------------------------------------------- 2. 相交裁剪 + 门跟随
reset()
wall('host', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 200)
wall('probe', [{ x: 2000, y: -30 }, { x: 2000, y: 2000 }], 120)
editor.addElement(
  { id: 'door1', kind: 'door', wallId: 'probe', offset: 100, width: 800, hinge: 'start', swingSide: 1, color: '#000' },
  false
)
const r = editor.trimIntersectingWalls()
const probe = state.doc.elements.find((e) => e.id === 'probe')
const door1 = state.doc.elements.find((e) => e.id === 'door1')
check('裁剪: 端头剪到交点', r.changed && approx(probe.points[0].y, 0) && approx(probe.points[1].y, 2000))
check('裁剪: 门 offset 跟随 (-30)', approx(door1.offset, 70), String(door1.offset))
editor.undo()
check('裁剪可撤销', state.doc.elements.find((e) => e.id === 'probe').points[0].y === -30)
editor.redo()

// ----------------------------------------------------------- 3. 断线修复
reset()
wall('h1', [{ x: 0, y: 0 }, { x: 1970, y: 0 }])
wall('h2', [{ x: 2030, y: 0 }, { x: 4000, y: 0 }])
editor.addElement(
  { id: 'dr1', kind: 'door', wallId: 'h2', offset: 70, width: 800, hinge: 'start', swingSide: 1, color: '#000' },
  false
)
const hr = editor.healBrokenWalls(150)
const ws3 = state.doc.elements.filter((e) => e.kind === 'wall')
const dr1 = state.doc.elements.find((e) => e.id === 'dr1')
check('修复: 合并为一条墙', hr.merged >= 1 && ws3.length === 1, JSON.stringify(hr))
check('修复: 总长 4000', Math.hypot(ws3[0].points.at(-1).x - ws3[0].points[0].x, ws3[0].points.at(-1).y) === 4000)
check('修复: 门挂到保留墙且 offset=2070', dr1.wallId === ws3[0].id && approx(dr1.offset, 2070), `${dr1.wallId} ${dr1.offset}`)

// ----------------------------------------------------------- 4. 批量编辑
reset()
wall('b1', [{ x: 0, y: 0 }, { x: 1000, y: 0 }], 100)
wall('b2', [{ x: 0, y: 500 }, { x: 1000, y: 500 }], 100)
editor.selectOnly(['b1', 'b2'])
const n = editor.batchEditSelectedWalls({ thickness: 240, color: '#ff0000' })
check('批量编辑: 返回修改数 >= 2', n >= 2)
check('批量编辑: 两墙都改', state.doc.elements.every((e) => e.thickness === 240 && e.color === '#ff0000'))

// ----------------------------------------------------------- 5. 复制/粘贴/剪切
reset()
wall('cp1', [{ x: 0, y: 0 }, { x: 1000, y: 0 }])
editor.addElement(
  { id: 'cpd', kind: 'door', wallId: 'cp1', offset: 0, width: 800, hinge: 'start', swingSide: 1, color: '#000' },
  false
)
editor.selectOnly(['cp1', 'cpd'])
editor.copySelected(false)
const pasted = editor.pasteAt({ x: 300, y: 300 })
check('粘贴: 2 个图元', pasted.length === 2, String(pasted.length))
const pw = pasted.find((e) => e.kind === 'wall')
const pd = pasted.find((e) => e.kind === 'door')
check('粘贴: 门跟随新墙', pd.wallId === pw.id)
check('粘贴: 墙偏移 (300,300)', approx(pw.points[0].x, 300) && approx(pw.points[0].y, 300))
// 剪切：连同原墙+门一起剪下，文档只剩 2 个副本
editor.selectOnly(['cp1', 'cpd'])
// 重新装入原墙+门到剪贴板（paste 已覆盖剪贴板）
editor.copySelected(false)
editor.copySelected(true)
check('剪切后选中原图元删除', state.doc.elements.length === 2)
// 再粘贴：墙和门成对复制回来（门依附新墙）
const rePasted = editor.pasteAt({ x: 0, y: 0 })
check('剪切板内容可再次粘贴（墙+门成对）', rePasted.length === 2)
check('粘贴后门窗依附重映射的新墙', rePasted.find((e) => e.kind === 'door').wallId === rePasted.find((e) => e.kind === 'wall').id)

// Ctrl+D 快速副本：只选墙，副本必须自动带上依附的门窗
reset()
wall('dup1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
editor.addElement(
  { id: 'dupd', kind: 'door', wallId: 'dup1', offset: 0, width: 800, hinge: 'start', swingSide: 1, color: '#000' },
  false
)
editor.addElement(
  { id: 'dupw', kind: 'window', wallId: 'dup1', offset: 1000, width: 600, color: '#000' },
  false
)
editor.selectOnly(['dup1'])
editor.duplicateSelected()
{
  const walls = state.doc.elements.filter((e) => e.kind === 'wall')
  const doors = state.doc.elements.filter((e) => e.kind === 'door')
  const wins = state.doc.elements.filter((e) => e.kind === 'window')
  check('Ctrl+D 复制墙: 2 面墙', walls.length === 2, String(walls.length))
  check('Ctrl+D 复制墙: 门/窗各 2（随墙带上）', doors.length === 2 && wins.length === 2, `door=${doors.length} win=${wins.length}`)
  const newWall = walls.find((x) => x.id !== 'dup1')
  const newDoor = doors.find((x) => x.id !== 'dupd')
  const newWin = wins.find((x) => x.id !== 'dupw')
  check('Ctrl+D: 副本门窗依附副本墙', newDoor.wallId === newWall.id && newWin.wallId === newWall.id)
  check('Ctrl+D: 副本带 200 偏移', approx(newWall.points[0].x, 200))
}

// ----------------------------------------------------------- 6. 层级
reset()
const fa = editor.addElement({ id: 'fa', kind: 'furniture', defId: 'bed', x: 0, y: 0, width: 100, height: 100, rotation: 0 }, false)
const fb = editor.addElement({ id: 'fb', kind: 'furniture', defId: 'bed', x: 0, y: 0, width: 100, height: 100, rotation: 0 }, false)
void fa
void fb
editor.selectOnly(['fa'])
editor.reorderSelected('up')
check('上移: fa 到 fb 之后', state.doc.elements.map((e) => e.id).join() === 'fb,fa')
editor.reorderSelected('front')
check('置顶: fa 在末尾', state.doc.elements.at(-1).id === 'fa')

// ----------------------------------------------------------- 7. 旧文档迁移
reset()
// 构造旧版本文档（缺少新增的 settings 字段）
const oldDoc = {
  version: 1,
  settings: {
    wallColor: '#303133',
    wallThickness: 120,
    dimColor: '#f56c6c',
    dimStrokeWidth: 1,
    bgColor: '#fff',
    gridColor: '#ddd',
    showGrid: true,
    showRulers: true,
    ortho: true,
    snapEnabled: true,
    snapTol: 12
  },
  elements: [
    { id: 'ow', kind: 'wall', points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], closed: false, thickness: 120, color: '#303133' },
    // 旧标注：无 dimType/ref
    { id: 'od', kind: 'dimension', p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, offsetDistance: 200, color: '#f56c6c', strokeWidth: 1 }
  ]
}
editor.loadDoc(oldDoc)
const od = state.doc.elements.find((e) => e.id === 'od')
check('迁移: 旧标注补 dimType=linear', od.dimType === 'linear', String(od.dimType))
check('迁移: 旧标注就近绑定墙顶点', od.ref1?.kind === 'wall-vertex' && od.ref2?.kind === 'wall-vertex', `${od.ref1?.kind}/${od.ref2?.kind}`)
check('迁移: 新设置补默认值', state.doc.settings.snapMidpoint === true && state.doc.settings.angleLock45 === false && state.doc.settings.autoTrim === false)

// ----------------------------------------------------------- 8. 角度标注联动
reset()
wall('a1', [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 2000 }
])
const ad = editor.makeAngleDimension({ x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 0 }, 500)
ad.refV = { kind: 'wall-vertex', wallId: 'a1', index: 1 }
ad.ref1 = { kind: 'wall-vertex', wallId: 'a1', index: 2 }
ad.ref2 = { kind: 'wall-vertex', wallId: 'a1', index: 0 }
editor.addElement(ad, false)
editor.pushHistory()
// 初始：vertex=(2000,0)，ray1 指向 (2000,2000)（角 90°）；
// 把第 2 个顶点改为 (0,2000) 后，两射线方向 135° 与 180° => 夹角 45°
state.doc.elements.find((e) => e.id === 'a1').points[2] = { x: 0, y: 2000 }
await flush()
{
  const v = ad.vertex
  const a1v = Math.atan2(ad.ray1.y - v.y, ad.ray1.x - v.x)
  const a2v = Math.atan2(ad.ray2.y - v.y, ad.ray2.x - v.x)
  let delta = Math.abs(a1v - a2v)
  if (delta > Math.PI) delta = Math.PI * 2 - delta
  const deg = (delta * 180) / Math.PI
  check('角度标注随墙变化 90° -> 45°', approx(deg, 45, 0.5), `${deg.toFixed(2)}°`)
}

// 角度标注整体平移后解除关联（模拟方向键微移）
editor.pushHistory()
ad.vertex = { x: ad.vertex.x + 100, y: ad.vertex.y }
ad.ray1 = { x: ad.ray1.x + 100, y: ad.ray1.y }
ad.ray2 = { x: ad.ray2.x + 100, y: ad.ray2.y }
check('角度标注仍可存在（三点完整）', !!ad.vertex && !!ad.ray1 && !!ad.ray2)

process.on('exit', () => {
  try {
    rmSync(entryPath)
    rmSync(bundlePath)
  } catch {}
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
