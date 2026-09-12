/**
 * 标注与墙体的关联绑定 & 墙体改动后自动更新标注数值/位置。
 *
 * 线性标注两端、角度标注三点都可锚定到：
 *  - 墙顶点（wall-vertex）
 *  - 墙段中点（wall-mid）
 *  - 自由点（free）
 * 命中吸附创建/拖拽手柄时写入引用；墙体几何变化时按引用刷新坐标。
 */
import type { DimensionElement, DimAnchorRef, WallElement } from '@/types'
import { type Pt, Vec2 } from './geometry'

export interface AnchorResolve {
  p: Pt
  ref: DimAnchorRef
}

/** 根据墙当前几何解析锚点坐标，找不到返回 null */
export function resolveAnchor(ref: DimAnchorRef | undefined, walls: WallElement[]): Pt | null {
  if (!ref || ref.kind === 'free') return null
  const w = walls.find((x) => x.id === ref.wallId)
  if (!w) return null
  if (ref.kind === 'wall-vertex') {
    const p = w.points[ref.index]
    return p ? { ...p } : null
  }
  // wall-mid：第 index 段中点
  const n = w.closed ? w.points.length : w.points.length - 1
  if (ref.index < 0 || ref.index >= n) return null
  const a = w.points[ref.index]
  const b = w.points[(ref.index + 1) % w.points.length]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** 在所有墙顶点 / 墙段中点中找与 p 重合（≤tolMm）的锚点 */
export function findAnchorAt(p: Pt, walls: WallElement[], tolMm: number): DimAnchorRef {
  let bestRef: DimAnchorRef | null = null
  let bestD = Infinity
  const consider = (d: number, ref: DimAnchorRef) => {
    if (d <= tolMm && d < bestD) {
      bestD = d
      bestRef = ref
    }
  }
  for (const w of walls) {
    for (let i = 0; i < w.points.length; i++) {
      consider(Vec2.dist(p, w.points[i]), { kind: 'wall-vertex', wallId: w.id, index: i })
    }
    const n = w.closed ? w.points.length : w.points.length - 1
    for (let i = 0; i < n; i++) {
      const a = w.points[i]
      const b = w.points[(i + 1) % w.points.length]
      consider(
        Vec2.dist(p, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        { kind: 'wall-mid', wallId: w.id, index: i }
      )
    }
  }
  return bestRef ?? { kind: 'free' }
}

/** 依据吸附命中结果生成锚点引用（交点吸附/无命中 => free） */
export function anchorFromSnap(
  snapped: Pt,
  kind: 'endpoint' | 'midpoint' | 'intersection' | null,
  ownerId: string | undefined,
  walls: WallElement[],
  tolMm: number
): DimAnchorRef {
  if (kind === 'endpoint' && ownerId) {
    const w = walls.find((x) => x.id === ownerId)
    if (w) {
      const idx = w.points.findIndex((p) => Vec2.dist(p, snapped) <= tolMm)
      if (idx >= 0) return { kind: 'wall-vertex', wallId: ownerId, index: idx }
    }
  }
  if (kind === 'midpoint' && ownerId) {
    const w = walls.find((x) => x.id === ownerId)
    if (w) {
      const n = w.closed ? w.points.length : w.points.length - 1
      for (let i = 0; i < n; i++) {
        const a = w.points[i]
        const b = w.points[(i + 1) % w.points.length]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (Vec2.dist(mid, snapped) <= tolMm) return { kind: 'wall-mid', wallId: ownerId, index: i }
      }
    }
  }
  // 交点吸附与未命中：尝试就近匹配，否则自由点
  return findAnchorAt(snapped, walls, tolMm)
}

/**
 * 墙体改动后刷新所有关联标注的坐标。
 * 失效引用（墙/顶点已不存在）降级为 free 并保留当前坐标。
 * @returns 是否有任意标注被更新
 */
export function syncDimensions(dims: DimensionElement[], walls: WallElement[]): boolean {
  let changed = false

  const applyPoint = (ref: DimAnchorRef | undefined, get: () => Pt | undefined, set: (p: Pt) => void, drop: () => void) => {
    if (!ref || ref.kind === 'free') return
    const q = resolveAnchor(ref, walls)
    if (q) {
      const cur = get()
      if (!cur || Vec2.dist(cur, q) > 1e-6) {
        set(q)
        changed = true
      }
    } else {
      // 引用失效：降级为自由点，坐标保持不变
      drop()
      changed = true
    }
  }

  for (const d of dims) {
    if (d.dimType === 'angle') {
      applyPoint(d.refV, () => d.vertex, (p) => (d.vertex = { ...p }), () => (d.refV = { kind: 'free' }))
      applyPoint(
        d.ref1,
        () => d.ray1,
        (p) => {
          d.ray1 = { ...p }
          d.p1 = { ...p }
        },
        () => (d.ref1 = { kind: 'free' })
      )
      applyPoint(
        d.ref2,
        () => d.ray2,
        (p) => {
          d.ray2 = { ...p }
          d.p2 = { ...p }
        },
        () => (d.ref2 = { kind: 'free' })
      )
    } else {
      applyPoint(d.ref1, () => d.p1, (p) => (d.p1 = { ...p }), () => (d.ref1 = { kind: 'free' }))
      applyPoint(d.ref2, () => d.p2, (p) => (d.p2 = { ...p }), () => (d.ref2 = { kind: 'free' }))
    }
  }
  return changed
}

/** 为历史文档（无 dimType / 无引用）补默认值，并就近尝试绑定顶点 */
export function migrateDimension(d: DimensionElement, walls: WallElement[], tolMm: number): void {
  if (!d.dimType) d.dimType = 'linear'
  if (d.dimType === 'linear') {
    if (!d.ref1) d.ref1 = findAnchorAt(d.p1, walls, tolMm)
    if (!d.ref2) d.ref2 = findAnchorAt(d.p2, walls, tolMm)
  } else {
    if (!d.refV && d.vertex) d.refV = findAnchorAt(d.vertex, walls, tolMm)
    if (!d.ref1 && d.ray1) {
      d.ref1 = findAnchorAt(d.ray1, walls, tolMm)
      d.p1 = { ...d.ray1 }
    }
    if (!d.ref2 && d.ray2) {
      d.ref2 = findAnchorAt(d.ray2, walls, tolMm)
      d.p2 = { ...d.ray2 }
    }
  }
}
