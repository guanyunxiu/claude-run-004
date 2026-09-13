/**
 * 迭代功能算法单测（node 直跑，esbuild 即时转译 TS）：
 *   node scripts/features.test.mjs
 * 覆盖：中点/交点吸附、45° 角度锁定、相交裁剪、断线修复、标注自动更新、层级/剪贴板
 */
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPath = resolve(root, '.fp_entry.ts')
const bundlePath = resolve(root, '.fp_bundle.mjs')

const entry = `
export { snapPoint, collectSnapTargets } from './src/lib/snapping'
export { angleLockPoint, angleArc } from './src/lib/geometry'
export { trimWallsAtIntersections, healWalls, batchEditWalls, rehomeOpenings } from './src/lib/wallOps'
export { syncDimensions, findAnchorAt, anchorFromSnap } from './src/lib/dimensionSync'
export { bringToFront, sendToBack, moveUp, moveDown } from './src/lib/layering'
export { setClipboard, pasteElements, hasClipboard } from './src/lib/clipboard'
export { hitTest } from './src/lib/hit'
export { nearestWallForOpening } from './src/lib/openings'
`
writeFileSync(entryPath, entry)

await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  absWorkingDir: root,
  logLevel: 'silent'
})
const lib = await import(pathToFileUrl(bundlePath))
function pathToFileUrl(p) {
  return 'file://' + p
}
process.on('exit', () => {
  try {
    rmSync(entryPath)
    rmSync(bundlePath)
  } catch {}
})

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`)
  cond ? pass++ : fail++
}
const approx = (a, b, eps = 2) => Math.abs(a - b) <= eps

// 测试用墙
const wall = (id, pts, thickness = 120, closed = false) => ({
  id,
  kind: 'wall',
  points: pts,
  closed,
  thickness,
  color: '#000'
})
const dim = (id, p1, p2) => ({
  id,
  kind: 'dimension',
  dimType: 'linear',
  p1,
  p2,
  offsetDistance: 200,
  color: '#f00',
  strokeWidth: 1
})

// ---------------------------------------------------------------- 1. 吸附
// T 形两墙：水平墙 (0,0)-(4000,0)，竖直墙 (2000,-2000)-(2000,2000)
const tWalls = [
  wall('w1', [
    { x: 0, y: 0 },
    { x: 4000, y: 0 }
  ]),
  wall('w2', [
    { x: 2000, y: -2000 },
    { x: 2000, y: 2000 }
  ])
]
// 中点：水平墙中点 (2000,0)
{
  const hit = lib.snapPoint({ x: 2003, y: 5 }, tWalls, { tolMm: 50, endpoint: false, midpoint: true, intersection: false })
  check('中点吸附命中', hit && hit.kind === 'midpoint', JSON.stringify(hit?.point))
}
// 交点 (2000,0)
{
  const hit = lib.snapPoint({ x: 2004, y: 6 }, tWalls, { tolMm: 50, endpoint: false, midpoint: false, intersection: true })
  check('交点吸附命中', hit && hit.kind === 'intersection' && approx(hit.point.x, 2000) && approx(hit.point.y, 0))
}
// 端点
{
  const hit = lib.snapPoint({ x: 3, y: 2 }, tWalls, { tolMm: 50, endpoint: true, midpoint: false, intersection: false })
  check('端点吸附命中', hit && hit.kind === 'endpoint')
}
// 关闭某类吸附
{
  const hit = lib.snapPoint({ x: 2003, y: 5 }, tWalls, { tolMm: 50, endpoint: false, midpoint: false, intersection: false })
  check('吸附全关时不命中', hit === null)
}

// ---------------------------------------------------------------- 2. 45° 锁定
{
  const p = lib.angleLockPoint({ x: 0, y: 0 }, { x: 1000, y: 180 }, true, 45)
  // 10.2° 接近 0°，应吸附到水平（长度保持）
  const len = Math.hypot(p.x, p.y)
  check('45°锁定:10°吸附到0°', approx(p.y, 0) && approx(len, Math.hypot(1000, 180)), JSON.stringify(p))
}
{
  const p = lib.angleLockPoint({ x: 0, y: 0 }, { x: 1000, y: 1000 }, true, 45)
  check('45°锁定:45°保持', approx(p.x, 1000) && approx(p.y, 1000))
}
{
  // 30° 距 0°/45° 均为 15°/15°，取中点附近 28°（距两者均 >15° 中最近 0° 为 28°）=> 保持自由
  const raw = { x: Math.cos((28 * Math.PI) / 180) * 1000, y: Math.sin((28 * Math.PI) / 180) * 1000 }
  const p = lib.angleLockPoint({ x: 0, y: 0 }, raw, true, 45, 15)
  check('45°锁定:中间角度自由微调', approx(p.x, raw.x, 1) && approx(p.y, raw.y, 1), JSON.stringify(p))
}
{
  // 8° 距 0° 小于 15° => 吸附到水平
  const p = lib.angleLockPoint({ x: 0, y: 0 }, { x: 1000, y: 140 }, true, 45, 15)
  check('45°锁定:阈值内吸附到固定方向', approx(p.y, 0, 1), JSON.stringify(p))
}

// ---------------------------------------------------------------- 3. 相交裁剪
// 十字贯穿：两墙端头都在对方墙外 -> 均完整保留（只剪埋入端头，不剪墙身）
{
  const res = lib.trimWallsAtIntersections(tWalls)
  check('十字互相贯穿:墙身完整保留', res.walls.length === 2 && res.removedIds.length === 0 && res.changed === false, `walls=${res.walls.length}`)
}
// T 形：B 仅一端伸入 A（B 从 (2000,0) 到 (2000,2000) 不伸入；改 B 起点在 A 内部附近）
// B: (2000,-30) 起点位于 A 厚度内 -> 首段应被裁，保留 (2000,0)-(2000,2000)
{
  const a = wall('A', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 200)
  const b = wall('B', [{ x: 2000, y: -30 }, { x: 2000, y: 2000 }], 120)
  const res = lib.trimWallsAtIntersections([a, b])
  const bb = res.walls.find((w) => w.id === 'B')
  check('T形:伸入端头被裁剪', !!bb && approx(bb.points[0].y, 0, 2) && approx(bb.points[1].y, 2000), bb ? JSON.stringify(bb.points) : 'B removed')
  const aa = res.walls.find((w) => w.id === 'A')
  check('T形:被接入墙完整保留', !!aa && aa.points.length === 2)
}
// 端头裁剪后门窗 offset 跟随平移
{
  const a = wall('A', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 200)
  const b = wall('B', [{ x: 2000, y: -30 }, { x: 2000, y: 2000 }], 120)
  // 模拟 store 流程：裁剪 + rehome
  const res = lib.trimWallsAtIntersections([a, b])
  // 构造一个挂在 B 上 offset=100 的门（裁剪掉头部 30 后应变 70）
  const door = { id: 'door1', kind: 'door', wallId: 'B', offset: 100, width: 800, hinge: 'start', swingSide: 1, color: '#000' }
  const orphan = lib.rehomeOpenings([door], [a, b], res)
  check('裁剪后门窗 offset 平移', approx(door.offset, 70, 2), `offset=${door.offset} orphan=${orphan.length}`)
}
// 两墙十字但只单向贯穿：A=(0,0)-(4000,0), B=(2000,-2000)-(2000,2000)，A 更厚
// 已在上面覆盖；再测无相交时不变
{
  const a = wall('A', [{ x: 0, y: 0 }, { x: 1000, y: 0 }])
  const b = wall('B', [{ x: 0, y: 2000 }, { x: 1000, y: 2000 }])
  const res = lib.trimWallsAtIntersections([a, b])
  check('不相交墙:不产生改动', res.changed === false)
}

// ---------------------------------------------------------------- 4. 断线修复
{
  // 两段共线断线，端点间隙 60mm
  const a = wall('A', [{ x: 0, y: 0 }, { x: 1970, y: 0 }], 120)
  const b = wall('B', [{ x: 2030, y: 0 }, { x: 4000, y: 0 }], 120)
  const openings = [{ wallId: 'B', offset: 70, width: 800 }]
  const res = lib.healWalls([a, b], openings, 150)
  check('断线吸附+合并:得到1条墙', res.walls.length === 1, `n=${res.walls.length}`)
  const merged = res.walls[0]
  check('合并后总长 4000', merged && Math.hypot(
    merged.points[merged.points.length - 1].x - merged.points[0].x,
    merged.points[merged.points.length - 1].y - merged.points[0].y
  ) === 4000)
  check('门窗跟随到新墙', openings[0].wallId === merged.id && approx(openings[0].offset, 2000 + 70, 2), JSON.stringify(openings[0]))
}
{
  // 不共线的断线只吸附不合并
  const a = wall('A', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
  const b = wall('B', [{ x: 2040, y: 40 }, { x: 2000, y: 2000 }])
  const res = lib.healWalls([a, b], [], 150)
  check('非共线断线:吸附但保留两墙', res.walls.length === 2 && res.snappedCount >= 1 && res.mergedCount === 0)
}
{
  // 批量编辑
  const a = wall('A', [{ x: 0, y: 0 }, { x: 1000, y: 0 }], 100)
  const b = wall('B', [{ x: 0, y: 500 }, { x: 1000, y: 500 }], 100)
  lib.batchEditWalls([a, b], { thickness: 240, color: '#abc' })
  check('批量改墙厚颜色', a.thickness === 240 && b.color === '#abc')
}

// ---------------------------------------------------------------- 5. 标注自动更新
{
  const w1 = wall('w1', [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: 1600 },
    { x: 0, y: 1600 }
  ], 120, true)
  // 标注绑定 w1 的第0、第1顶点
  const d = dim('d1', { x: 0, y: 0 }, { x: 2000, y: 0 })
  d.ref1 = { kind: 'wall-vertex', wallId: 'w1', index: 0 }
  d.ref2 = { kind: 'wall-vertex', wallId: 'w1', index: 1 }
  // 模拟拖动墙顶点 1
  w1.points[1] = { x: 2400, y: 0 }
  const changed = lib.syncDimensions([d], [w1])
  check('墙改动后标注自动更新', changed && approx(d.p2.x, 2400), `p2=${JSON.stringify(d.p2)}`)
}
{
  // 中点绑定
  const w1 = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
  const d = dim('d1', { x: 1000, y: 0 }, { x: 1000, y: -500 })
  d.ref1 = { kind: 'wall-mid', wallId: 'w1', index: 0 }
  w1.points[1] = { x: 4000, y: 0 }
  lib.syncDimensions([d], [w1])
  check('中点锚点跟随更新', approx(d.p1.x, 2000), `p1=${d.p1.x}`)
}
{
  // 引用失效降级为 free
  const d = dim('d1', { x: 0, y: 0 }, { x: 100, y: 0 })
  d.ref1 = { kind: 'wall-vertex', wallId: 'gone', index: 0 }
  lib.syncDimensions([d], [])
  check('失效引用降级自由点', d.ref1.kind === 'free' && approx(d.p1.x, 0))
}
{
  // findAnchorAt / anchorFromSnap
  const w1 = wall('w1', [{ x: 0, y: 0 }, { x: 2000, y: 0 }])
  const ref = lib.findAnchorAt({ x: 2, y: -1 }, [w1], 20)
  check('就近绑定墙顶点', ref.kind === 'wall-vertex' && ref.index === 0)
  const ref2 = lib.anchorFromSnap({ x: 1000, y: 0 }, 'midpoint', 'w1', [w1], 20)
  check('吸附中点 -> wall-mid 引用', ref2.kind === 'wall-mid' && ref2.index === 0)
}

// ---------------------------------------------------------------- 6. 角度标注弧
{
  const arc = lib.angleArc({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }, 500)
  check('角度弧 90°', arc && approx(arc.angleDeg, 90, 0.01), `ang=${arc?.angleDeg}`)
  const arc2 = lib.angleArc({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 707, y: -707 }, 500)
  check('角度弧 45°', arc2 && approx(arc2.angleDeg, 45, 0.01))
}

// ---------------------------------------------------------------- 7. 层级
{
  const els = [
    { id: 'a', kind: 'furniture' },
    { id: 'b', kind: 'furniture' },
    { id: 'c', kind: 'furniture' }
  ]
  const front = lib.bringToFront(els, new Set(['a'])).map((e) => e.id)
  check('置顶', front.join('') === 'bca')
  const back = lib.sendToBack(els, new Set(['c'])).map((e) => e.id)
  check('置底', back.join('') === 'cab')
  const up = lib.moveUp(els, new Set(['a'])).map((e) => e.id)
  check('上移一层', up.join('') === 'bac')
  // 跨类型也应交换（画布按数组顺序统一渲染）
  const mixed = [
    { id: 'w', kind: 'wall' },
    { id: 'f', kind: 'furniture' }
  ]
  const moved = lib.moveUp(mixed, new Set(['w'])).map((e) => e.id)
  check('上移可跨类型', moved.join('') === 'fw')
  const movedDown = lib.moveDown(
    [
      { id: 'w', kind: 'wall' },
      { id: 'f', kind: 'furniture' }
    ],
    new Set(['f'])
  ).map((e) => e.id)
  check('下移可跨类型', movedDown.join('') === 'fw')
}

// ---------------------------------------------------------------- 8. 剪贴板
{
  const els = [
    wall('w1', [{ x: 0, y: 0 }, { x: 1000, y: 0 }]),
    { id: 'd1', kind: 'door', wallId: 'w1', offset: 0, width: 800, hinge: 'start', swingSide: 1, color: '#000' },
    { id: 'f1', kind: 'furniture', defId: 'bed', x: 0, y: 0, width: 100, height: 100, rotation: 0 }
  ]
  lib.setClipboard(els)
  check('剪贴板有内容', lib.hasClipboard())
  const pasted = lib.pasteElements({ x: 200, y: 200 })
  check('粘贴数量=3', pasted.length === 3)
  const pw = pasted.find((e) => e.kind === 'wall')
  const pd = pasted.find((e) => e.kind === 'door')
  check('粘贴:墙重映射+偏移', pw.id !== 'w1' && approx(pw.points[1].x, 1200))
  check('粘贴:门窗跟随新墙', pd.wallId === pw.id)
  // 孤门窗（依附墙未复制）应被丢弃
  lib.setClipboard([{ id: 'd2', kind: 'window', wallId: 'nope', offset: 0, width: 500, color: '#000' }])
  check('孤立门窗粘贴被丢弃', lib.pasteElements().length === 0)
}

// ---------------------------------------------------------------- 9. 角度标注命中
{
  const d = {
    id: 'ad', kind: 'dimension', dimType: 'angle',
    p1: { x: 1000, y: 0 }, p2: { x: 0, y: 1000 },
    vertex: { x: 0, y: 0 }, ray1: { x: 1000, y: 0 }, ray2: { x: 0, y: 1000 },
    radius: 500, offsetDistance: 0, color: '#f00', strokeWidth: 1
  }
  const hitV = lib.hitTest([d], { x: 0, y: 0 }, 30)
  check('角度标注命中顶点手柄', hitV?.handle === 'vertex')
  // 弧中点（45°，半径500）≈ (353.5,353.5)
  const hitArc = lib.hitTest([d], { x: 354, y: 354 }, 30)
  check('角度标注命中弧半径手柄', hitArc?.handle === 'arc', JSON.stringify(hitArc))
}

// ---------------------------------------------------------------- 10. 门窗放置距离
{
  const w1 = wall('pw', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 120)
  // 紧贴墙（60mm 半墙厚内）
  check('近墙可放置', !!lib.nearestWallForOpening({ x: 1000, y: 100 }, [w1]))
  // 半墙厚 60 + 容差 250 = 310 以内
  check('310mm 内可放置', !!lib.nearestWallForOpening({ x: 1000, y: 305 }, [w1]))
  // 离墙 1000mm 不允许
  check('离墙 1000mm 拒绝放置', lib.nearestWallForOpening({ x: 1000, y: 1000 }, [w1]) === null)
  // 无墙时拒绝
  check('无墙拒绝放置', lib.nearestWallForOpening({ x: 0, y: 0 }, []) === null)
}

// ---------------------------------------------------------------- 11. 标注偏移线命中
{
  // p1=(0,0) p2=(2000,0)，offsetDistance=400，法向 (0,1)：标注线在 y=400
  const d = {
    id: 'ld', kind: 'dimension', dimType: 'linear',
    p1: { x: 0, y: 0 }, p2: { x: 2000, y: 0 },
    offsetDistance: 400, color: '#f00', strokeWidth: 1
  }
  // 点中偏移线（非端点）应返回 kind=dimension, handle=offset（用于拖偏移，而非整体平移）
  const hitLine = lib.hitTest([d], { x: 1000, y: 400 }, 20)
  check('点标注线 => offset 拖拽', hitLine?.id === 'ld' && hitLine?.handle === 'offset', JSON.stringify(hitLine))
  // 端点手柄优先
  const hitP1 = lib.hitTest([d], { x: 0, y: 0 }, 20)
  check('点端点 => start 手柄', hitP1?.handle === 'start')
  // 引线也能拖整体（无 handle）
  const hitExt = lib.hitTest([d], { x: 0, y: 200 }, 20)
  check('点引线 => 整段移动(无offset handle)', hitExt?.id === 'ld' && hitExt?.handle !== 'offset', JSON.stringify(hitExt))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
