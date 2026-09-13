/**
 * 命中检测：返回给定世界坐标下可选中的图元
 */
import type { FloorElement, WallElement, DoorElement, WindowElement, FurnitureElement, DimensionElement, StructureElement } from '@/types'
import { bboxOf, pointInRect, pointPolylineDist, angleArc, type Pt } from './geometry'
import { openingPlacement, type Opening } from './openings'

export type HitKind = FloorElement['kind'] | 'door-swing' | 'dim-handle'

export interface HitResult {
  id: string
  kind: HitKind
  /** 门/窗的特殊手柄，或标注的端点 */
  handle?: 'start' | 'end' | 'offset' | 'vertex' | 'ray1' | 'ray2' | 'arc'
  dist: number
}

/** 旋转矩形（家具/结构）命中：世界点反旋转到局部轴对齐判定 */
function hitRotatedBox(
  b: { x: number; y: number; width: number; height: number; rotation: number },
  p: Pt
): boolean {
  const dx = p.x - b.x
  const dy = p.y - b.y
  const c = Math.cos(-b.rotation)
  const s = Math.sin(-b.rotation)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  return Math.abs(lx) <= b.width / 2 && Math.abs(ly) <= b.height / 2
}

function hitFurniture(f: FurnitureElement, p: Pt): boolean {
  return hitRotatedBox(f, p)
}

function hitStructure(s: StructureElement, p: Pt): boolean {
  return hitRotatedBox(s, p)
}

function hitAngleDimension(d: DimensionElement, p: Pt, tolMm: number): HitResult | null {
  if (!d.vertex || !d.ray1 || !d.ray2) return null
  const arc = angleArc(d.vertex, d.ray1, d.ray2, d.radius ?? 500)
  if (arc) {
    // 弧半径手柄（弧中点）
    const a1 = Math.atan2(arc.p1.y - d.vertex.y, arc.p1.x - d.vertex.x)
    const a2 = Math.atan2(arc.p2.y - d.vertex.y, arc.p2.x - d.vertex.x)
    let delta = a2 - a1
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const midAng = a1 + delta / 2
    const r = Math.max(50, d.radius ?? 500)
    const h = {
      x: d.vertex.x + Math.cos(midAng) * r,
      y: d.vertex.y + Math.sin(midAng) * r
    }
    if (Math.hypot(p.x - h.x, p.y - h.y) <= tolMm * 1.2) {
      return { id: d.id, kind: 'dim-handle', handle: 'arc', dist: 0 }
    }
    // 点落在弧上：半径差 ≤ tol 且角度在 a1/a2 区间
    const pv = Math.hypot(p.x - d.vertex.x, p.y - d.vertex.y)
    if (Math.abs(pv - r) <= tolMm) {
      const pa = Math.atan2(p.y - d.vertex.y, p.x - d.vertex.x)
      let t = (pa - a1) / delta
      if (t >= -0.05 && t <= 1.05) return { id: d.id, kind: 'dimension', dist: Math.abs(pv - r) }
    }
  }
  // 三条手柄点：顶点 / 射线1 / 射线2
  if (Math.hypot(p.x - d.vertex.x, p.y - d.vertex.y) <= tolMm)
    return { id: d.id, kind: 'dim-handle', handle: 'vertex', dist: 0 }
  if (Math.hypot(p.x - d.ray1.x, p.y - d.ray1.y) <= tolMm)
    return { id: d.id, kind: 'dim-handle', handle: 'ray1', dist: 0 }
  if (Math.hypot(p.x - d.ray2.x, p.y - d.ray2.y) <= tolMm)
    return { id: d.id, kind: 'dim-handle', handle: 'ray2', dist: 0 }
  // 两条射线（辅助线）
  const r1 = pointPolylineDist(p, [d.vertex, d.ray1], false)
  const r2 = pointPolylineDist(p, [d.vertex, d.ray2], false)
  if (r1 && r1.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r1.dist }
  if (r2 && r2.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r2.dist }
  return null
}

function hitDimension(d: DimensionElement, p: Pt, tolMm: number): HitResult | null {
  if (d.dimType === 'angle') return hitAngleDimension(d, p, tolMm)
  // 端点手柄
  if (Math.hypot(p.x - d.p1.x, p.y - d.p1.y) <= tolMm) {
    return { id: d.id, kind: 'dim-handle', handle: 'start', dist: 0 }
  }
  if (Math.hypot(p.x - d.p2.x, p.y - d.p2.y) <= tolMm) {
    return { id: d.id, kind: 'dim-handle', handle: 'end', dist: 0 }
  }
  // 标注线（p1/p2 的平行线，偏移 offsetDistance）
  const dx = d.p2.x - d.p1.x
  const dy = d.p2.y - d.p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const q1 = { x: d.p1.x + nx * d.offsetDistance, y: d.p1.y + ny * d.offsetDistance }
  const q2 = { x: d.p2.x + nx * d.offsetDistance, y: d.p2.y + ny * d.offsetDistance }
  const r = pointPolylineDist(p, [q1, q2], false)
  if (r && r.dist <= tolMm) {
    return { id: d.id, kind: 'dimension', handle: 'offset', dist: r.dist }
  }
  // 引线
  const r1 = pointPolylineDist(p, [d.p1, q1], false)
  const r2 = pointPolylineDist(p, [d.p2, q2], false)
  if (r1 && r1.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r1.dist }
  if (r2 && r2.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r2.dist }
  return null
}

function hitOpening(wall: WallElement, op: Opening, p: Pt, tolMm: number): HitResult | null {
  const pl = openingPlacement(wall, op)
  if (!pl) return null
  // 洞口中心线段（沿整墙厚度方向都可点中）
  const r = pointPolylineDist(p, [pl.pStart, pl.pEnd], false)
  if (r && r.dist <= tolMm + wall.thickness / 2) {
    return { id: op.id, kind: op.kind, dist: r.dist }
  }
  return null
}
/**
 * 命中检测主入口
 * @param tolMm 容差（世界坐标 mm）
 */
export function hitTest(elements: FloorElement[], p: Pt, tolMm: number): HitResult | null {
  // 反向遍历（后绘制的在上层）
  const wallMap = new Map<string, WallElement>()
  for (const e of elements) if (e.kind === 'wall') wallMap.set(e.id, e)

  const hits: HitResult[] = []
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (el.kind === 'furniture') {
      if (hitFurniture(el, p)) hits.push({ id: el.id, kind: 'furniture', dist: 0 })
    } else if (el.kind === 'structure') {
      if (hitStructure(el, p)) hits.push({ id: el.id, kind: 'structure', dist: 0 })
    } else if (el.kind === 'dimension') {
      const h = hitDimension(el, p, tolMm)
      if (h) hits.push(h)
    } else if (el.kind === 'wall') {
      const r = pointPolylineDist(p, el.points, el.closed)
      if (r && r.dist <= tolMm + el.thickness / 2) {
        hits.push({ id: el.id, kind: 'wall', dist: r.dist })
      }
    } else if (el.kind === 'door' || el.kind === 'window') {
      const wall = wallMap.get(el.wallId)
      if (wall) {
        const h = hitOpening(wall, el as DoorElement | WindowElement, p, tolMm)
        if (h) hits.push(h)
      }
    }
  }

  // 小图元（门窗、标注）优先于墙
  const priority: Record<HitKind, number> = {
    'dim-handle': 0,
    door: 1,
    window: 1,
    dimension: 2,
    furniture: 3,
    structure: 3,
    wall: 4,
    'door-swing': 1
  }
  hits.sort((a, b) => priority[a.kind] - priority[b.kind] || a.dist - b.dist)
  return hits[0] ?? null
}

/** 框选：返回落在矩形内（点命中）的元素 id */
export function boxSelect(elements: FloorElement[], rect: { x: number; y: number; width: number; height: number }, walls: WallElement[]): string[] {
  const ids: string[] = []
  for (const el of elements) {
    if (el.kind === 'wall') {
      if (el.points.some((p) => pointInRect(p, rect))) ids.push(el.id)
    } else if (el.kind === 'furniture' || el.kind === 'structure') {
      const bb = bboxOf([
        { x: el.x - el.width / 2, y: el.y - el.height / 2 },
        { x: el.x + el.width / 2, y: el.y + el.height / 2 }
      ])
      if (
        pointInRect({ x: bb.x, y: bb.y }, rect) ||
        pointInRect({ x: bb.x + bb.width, y: bb.y + bb.height }, rect) ||
        pointInRect({ x: el.x, y: el.y }, rect)
      ) {
        ids.push(el.id)
      }
    } else if (el.kind === 'dimension') {
      if (el.dimType === 'angle') {
        const ps = [el.vertex, el.ray1, el.ray2].filter((x): x is Pt => !!x)
        if (ps.some((pp) => pointInRect(pp, rect))) ids.push(el.id)
      } else if (pointInRect(el.p1, rect) || pointInRect(el.p2, rect)) {
        ids.push(el.id)
      }
    } else if (el.kind === 'door' || el.kind === 'window') {
      const wall = walls.find((x) => x.id === el.wallId)
      if (wall) {
        const pl = openingPlacement(wall, el)
        if (pl && pointInRect(pl.center, rect)) ids.push(el.id)
      }
    }
  }
  return ids
}
