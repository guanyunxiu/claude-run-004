/**
 * 统一吸附：端点、墙段中点、墙中心线交点
 * 容差以屏幕像素配置，内部换算为世界单位 mm。
 */
import type { WallElement } from '@/types'
import { type Pt, Vec2, segmentCrossPoint } from './geometry'

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection'

export interface SnapTarget {
  point: Pt
  kind: SnapKind
  ownerId?: string
}

export interface SnapOptions {
  tolMm: number
  endpoint?: boolean
  midpoint?: boolean
  intersection?: boolean
  /** 排除某条墙自身的候选（拖墙顶点时避免自吸） */
  excludeWallId?: string
}

export interface SnapHit extends SnapTarget {
  dist: number
}

/** 从所有墙中心线收集吸附候选点 */
export function collectSnapTargets(walls: WallElement[], opts: SnapOptions): SnapTarget[] {
  const targets: SnapTarget[] = []
  const segOf: { a: Pt; b: Pt; wallId: string }[] = []

  for (const w of walls) {
    if (opts.excludeWallId && w.id === opts.excludeWallId) continue
    const n = w.closed ? w.points.length : w.points.length - 1
    for (let i = 0; i < n; i++) {
      const a = w.points[i]
      const b = w.points[(i + 1) % w.points.length]
      if (Vec2.dist(a, b) < 1e-3) continue
      if (opts.endpoint !== false) {
        targets.push({ point: { ...a }, kind: 'endpoint', ownerId: w.id })
        targets.push({ point: { ...b }, kind: 'endpoint', ownerId: w.id })
      }
      if (opts.midpoint) {
        targets.push({
          point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          kind: 'midpoint',
          ownerId: w.id
        })
      }
      segOf.push({ a, b, wallId: w.id })
    }
  }

  if (opts.intersection) {
    // 两两墙段求交（同一条墙相邻段交于端点，跳过）
    for (let i = 0; i < segOf.length; i++) {
      for (let j = i + 1; j < segOf.length; j++) {
        const s1 = segOf[i]
        const s2 = segOf[j]
        if (s1.wallId === s2.wallId) {
          // 同一墙内相邻段共享端点，不算交点
          continue
        }
        const r = segmentCrossPoint(s1.a, s1.b, s2.a, s2.b)
        if (!r || r.collinear) continue
        const inner =
          r.t > 1e-6 && r.t < 1 - 1e-6 && r.u > 1e-6 && r.u < 1 - 1e-6
        if (inner) {
          targets.push({ point: { ...r.point }, kind: 'intersection' })
        }
      }
    }
  }

  return targets
}

/**
 * 在候选中找距离 p 最近且在容差内的吸附点。
 * 优先级：距离最近；同距离下端点 > 中点 > 交点。
 */
export function findSnap(p: Pt, targets: SnapTarget[], tolMm: number): SnapHit | null {
  let best: SnapHit | null = null
  const rank: Record<SnapKind, number> = { endpoint: 0, midpoint: 1, intersection: 2 }
  for (const t of targets) {
    const d = Vec2.dist(p, t.point)
    if (d > tolMm) continue
    if (!best || d < best.dist - 1e-6 || (Math.abs(d - best.dist) <= 1e-6 && rank[t.kind] < rank[best.kind])) {
      best = { ...t, dist: d }
    }
  }
  return best
}

/** 便捷封装：收集 + 查找一步完成 */
export function snapPoint(
  p: Pt,
  walls: WallElement[],
  opts: SnapOptions
): SnapHit | null {
  return findSnap(p, collectSnapTargets(walls, opts), opts.tolMm)
}
