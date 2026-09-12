/**
 * 门窗依附墙体的几何计算
 */
import type { DoorElement, WallElement, WindowElement } from '@/types'
import {
  type Pt,
  Vec2,
  pointAtPolylineDistance,
  pointPolylineDist,
  polylineLength
} from './geometry'

export type Opening = DoorElement | WindowElement

export interface OpeningPlacement {
  /** 洞口中心（墙中心线上） */
  center: Pt
  /** 墙方向角 */
  angle: number
  /** 左法向量（单位） */
  normal: Pt
  /** 洞口起点 */
  pStart: Pt
  /** 洞口终点 */
  pEnd: Pt
  /** 墙总长度 */
  wallLength: number
}

/** 计算门窗在墙体上的实际位置；offset 越界时返回 null */
export function openingPlacement(
  wall: WallElement,
  opening: Opening,
  gap = 1
): OpeningPlacement | null {
  const total = polylineLength(wall.points, wall.closed)
  const d0 = opening.offset
  const d1 = opening.offset + opening.width
  if (d0 < -gap || d1 > total + gap) return null
  const c0 = pointAtPolylineDistance(wall.points, d0, wall.closed)
  const c1 = pointAtPolylineDistance(wall.points, d1, wall.closed)
  const cc = pointAtPolylineDistance(wall.points, d0 + opening.width / 2, wall.closed)
  if (!c0 || !c1 || !cc) return null
  return {
    center: cc.point,
    angle: cc.angle,
    normal: cc.normal,
    pStart: c0.point,
    pEnd: c1.point,
    wallLength: total
  }
}

/** 世界坐标点距墙中心线最近距离（mm） */
export function distanceToWall(p: Pt, wall: WallElement): number {
  const r = pointPolylineDist(p, wall.points, wall.closed)
  return r ? r.dist : Infinity
}

/**
 * 将世界坐标投影到墙中心线上，返回沿墙距离 offset
 * 用于放置门窗时确定依附位置
 */
export function projectPointToWall(
  p: Pt,
  wall: WallElement
): { offset: number; dist: number; point: Pt; angle: number; normal: Pt } | null {
  const hit = pointPolylineDist(p, wall.points, wall.closed)
  if (!hit) return null
  // 由最近段序号和 t 换算沿折线距离
  let offset = 0
  const n = wall.closed ? wall.points.length : wall.points.length - 1
  for (let i = 0; i < hit.segmentIndex && i < n; i++) {
    offset += Vec2.dist(wall.points[i], wall.points[(i + 1) % wall.points.length])
  }
  offset += hit.t * Vec2.dist(
    wall.points[hit.segmentIndex],
    wall.points[(hit.segmentIndex + 1) % wall.points.length]
  )
  const along = pointAtPolylineDistance(wall.points, offset, wall.closed)
  const dir = along
    ? new Vec2(Math.cos(along.angle), Math.sin(along.angle))
    : new Vec2(1, 0)
  return {
    offset,
    dist: hit.dist,
    point: hit.q,
    angle: along?.angle ?? 0,
    normal: dir.perp().toPt()
  }
}

/** 将 offset 限制在墙范围内（考虑洞口宽度） */
export function clampOffset(wall: WallElement, offset: number, width: number): number {
  const total = polylineLength(wall.points, wall.closed)
  return Math.max(0, Math.min(offset, Math.max(0, total - width)))
}
