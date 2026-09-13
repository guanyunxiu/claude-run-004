/**
 * 碰撞/重叠检测：
 * - 家具(旋转矩形 OBB) 与墙（折线，含墙厚胶囊）
 * - 家具与家具（OBB vs OBB，SAT 分离轴）
 * - 家具与结构构件
 */
import type { FurnitureElement, StructureElement, WallElement } from '@/types'
import { type Pt } from './geometry'

export interface Box {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/** 旋转矩形的 4 个角点（局部 y 向下） */
export function boxCorners(b: Box): [Pt, Pt, Pt, Pt] {
  const c = Math.cos(b.rotation)
  const s = Math.sin(b.rotation)
  const hx = b.width / 2
  const hy = b.height / 2
  const local: [Pt, Pt, Pt, Pt] = [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy }
  ]
  return local.map((p) => ({
    x: p.x * c - p.y * s + b.x,
    y: p.x * s + p.y * c + b.y
  })) as [Pt, Pt, Pt, Pt]
}

function projectCorners(corners: Pt[], axis: Pt): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of corners) {
    const d = p.x * axis.x + p.y * axis.y
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return [min, max]
}

/** 两个旋转矩形是否相交（SAT），触碰（边界相接）也算重叠 */
export function boxIntersectsBox(a: Box, b: Box, gap = 0): boolean {
  const ca = boxCorners(a)
  const cb = boxCorners(b)
  const axes: Pt[] = []
  const pushAxes = (corners: Pt[]) => {
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i]
      const q = corners[(i + 1) % corners.length]
      const dx = q.x - p.x
      const dy = q.y - p.y
      const len = Math.hypot(dx, dy) || 1
      // 边的法线作为候选分离轴
      axes.push({ x: -dy / len, y: dx / len })
    }
  }
  pushAxes(ca)
  pushAxes(cb)
  for (const axis of axes) {
    const [a0, a1] = projectCorners(ca, axis)
    const [b0, b1] = projectCorners(cb, axis)
    if (a1 < b0 - gap || b1 < a0 - gap) return false // 存在分离轴
  }
  return true
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const l2 = rx * rx + ry * ry
  let t = l2 === 0 ? 0 : ((p.x - a.x) * rx + (p.y - a.y) * ry) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + rx * t), p.y - (a.y + ry * t))
}

/** 点到墙中心线（折线）的最短距离 */
export function pointWallDist(p: Pt, w: WallElement): number {
  let best = Infinity
  const n = w.closed ? w.points.length : w.points.length - 1
  for (let i = 0; i < n; i++) {
    best = Math.min(best, pointSegDist(p, w.points[i], w.points[(i + 1) % w.points.length]))
  }
  return best
}

/** 旋转矩形是否与墙（按墙厚胶囊）重叠 */
export function boxIntersectsWall(b: Box, w: WallElement): boolean {
  const corners = boxCorners(b)
  // 1) 任一角点进入墙体厚度范围
  for (const c of corners) {
    if (pointWallDist(c, w) <= w.thickness / 2) return true
  }
  // 2) 墙边与墙中心线线段相交
  const n = w.closed ? w.points.length : w.points.length - 1
  for (let i = 0; i < n; i++) {
    const wa = w.points[i]
    const wb = w.points[(i + 1) % w.points.length]
    for (let k = 0; k < corners.length; k++) {
      if (segmentsCross(corners[k], corners[(k + 1) % corners.length], wa, wb)) return true
    }
  }
  return false
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function segmentsCross(p: Pt, q: Pt, a: Pt, b: Pt): boolean {
  const o1 = orient(p.x, p.y, q.x, q.y, a.x, a.y)
  const o2 = orient(p.x, p.y, q.x, q.y, b.x, b.y)
  const o3 = orient(a.x, a.y, b.x, b.y, p.x, p.y)
  const o4 = orient(a.x, a.y, b.x, b.y, q.x, q.y)
  return o1 * o2 <= 0 && o3 * o4 <= 0
}

export function furnitureBox(f: FurnitureElement): Box {
  return { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation }
}
export function structureBox(s: StructureElement): Box {
  return { x: s.x, y: s.y, width: s.width, height: s.height, rotation: s.rotation }
}

export interface CollisionReport {
  /** 与之碰撞的图元 id（墙/家具/结构） */
  targets: string[]
  hasCollision: boolean
}

/**
 * 检测目标家具/结构与场景中其他图元的碰撞。
 * @param selfId 自身 id（排除）
 * @param selfKind 'furniture' | 'structure'
 */
export function detectCollisions(
  self: Box,
  selfId: string,
  elements: {
    walls: WallElement[]
    boxes: { id: string; box: Box }[]
  }
): CollisionReport {
  const targets: string[] = []
  for (const w of elements.walls) {
    if (boxIntersectsWall(self, w)) targets.push(w.id)
  }
  for (const other of elements.boxes) {
    if (other.id === selfId) continue
    if (boxIntersectsBox(self, other.box, -1)) targets.push(other.id)
  }
  return { targets, hasCollision: targets.length > 0 }
}
