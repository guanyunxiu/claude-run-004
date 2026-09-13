/**
 * 家具布局辅助：
 * - 对齐（左/中/右、顶/中/底）与等距分布（水平/垂直）
 * - 阵列复制（沿 X/Y 按间距复制 N 个）
 * - 靠墙/家具边缘吸附
 * 所有变换直接作用于传入的可变对象，便于配合历史快照。
 */
import type { FurnitureElement, StructureElement, WallElement } from '@/types'
import { boxCorners } from './collision'

type Movable = FurnitureElement | StructureElement

/** 轴对齐包围盒（忽略旋转；对齐分布主要用于未旋转家具） */
function aabb(el: Movable): { minX: number; maxX: number; minY: number; maxY: number } {
  // 旋转家具用 OBB 角点求 AABB
  const cs = boxCorners({ x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation })
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of cs) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** 多选对齐：以参考包围盒（所有选中项的并集）对齐 */
export function alignElements(els: Movable[], mode: AlignMode): void {
  if (els.length < (mode === 'hcenter' || mode === 'vcenter' ? 1 : 2)) return
  const boxes = els.map(aabb)
  const minX = Math.min(...boxes.map((b) => b.minX))
  const maxX = Math.max(...boxes.map((b) => b.maxX))
  const minY = Math.min(...boxes.map((b) => b.minY))
  const maxY = Math.max(...boxes.map((b) => b.maxY))

  els.forEach((el, i) => {
    const b = boxes[i]
    switch (mode) {
      case 'left':
        el.x += minX - b.minX
        break
      case 'right':
        el.x += maxX - b.maxX
        break
      case 'hcenter':
        el.x += (minX + maxX) / 2 - (b.minX + b.maxX) / 2
        break
      case 'top':
        el.y += minY - b.minY
        break
      case 'bottom':
        el.y += maxY - b.maxY
        break
      case 'vcenter':
        el.y += (minY + maxY) / 2 - (b.minY + b.maxY) / 2
        break
    }
  })
}

export type DistributeMode = 'horizontal' | 'vertical'

/** 等距分布：两端项不动，中间项间距均匀 */
export function distributeElements(els: Movable[], mode: DistributeMode): void {
  if (els.length < 3) return
  const withBox = els.map((el) => ({ el, b: aabb(el) }))
  if (mode === 'horizontal') {
    withBox.sort((a, c) => a.b.minX - c.b.minX)
    const first = withBox[0]
    const last = withBox[withBox.length - 1]
    const totalGap = last.b.minX - first.b.maxX
    const gapSum = withBox.slice(1, -1).reduce((s, x) => s + (x.b.maxX - x.b.minX), 0)
    const gap = (totalGap - gapSum) / (withBox.length - 1)
    let cursor = first.b.maxX
    for (let i = 1; i < withBox.length - 1; i++) {
      cursor += gap
      const item = withBox[i]
      const w = item.b.maxX - item.b.minX
      const newMinX = cursor
      item.el.x += newMinX - item.b.minX
      cursor += w
    }
  } else {
    withBox.sort((a, c) => a.b.minY - c.b.minY)
    const first = withBox[0]
    const last = withBox[withBox.length - 1]
    const totalGap = last.b.minY - first.b.maxY
    const gapSum = withBox.slice(1, -1).reduce((s, x) => s + (x.b.maxY - x.b.minY), 0)
    const gap = (totalGap - gapSum) / (withBox.length - 1)
    let cursor = first.b.maxY
    for (let i = 1; i < withBox.length - 1; i++) {
      cursor += gap
      const item = withBox[i]
      const h = item.b.maxY - item.b.minY
      const newMinY = cursor
      item.el.y += newMinY - item.b.minY
      cursor += h
    }
  }
}

export interface ArrayOptions {
  axis: 'x' | 'y'
  /** 中心间距 mm */
  spacing: number
  /** 包含原件在内的总个数 */
  count: number
}

/**
 * 生成阵列副本（不含原件），返回深拷贝的新图元数组（id 已重新分配）。
 * 调用方负责入栈历史并 push 到文档。
 */
export function makeArrayCopies<T extends Movable>(proto: T, opts: ArrayOptions, genId: () => string): T[] {
  const out: T[] = []
  for (let i = 1; i < opts.count; i++) {
    const copy = JSON.parse(JSON.stringify(proto)) as T
    copy.id = genId()
    if (opts.axis === 'x') copy.x += opts.spacing * i
    else copy.y += opts.spacing * i
    out.push(copy)
  }
  return out
}

// ---------------------------------------------------------------------------
// 靠墙 / 家具边缘吸附（仅对未旋转或 90° 倍数的家具有效）
// ---------------------------------------------------------------------------

export interface WallSnapGuide {
  /** 吸附后家具中心 */
  x: number
  y: number
  /** 吸附类型，用于画布上绘制参考线 */
  kind: 'wall' | 'furniture'
  /** 吸附的边（轴对齐）：竖边 x=at 或横边 y=at */
  edge: 'x' | 'y'
  at: number
}

/** 计算未旋转家具相对墙线段的边缘吸附结果（最近的平行边对齐） */
export function snapFurnitureToWalls(
  el: Movable,
  walls: WallElement[],
  tolMm: number
): WallSnapGuide | null {
  if (Math.abs(Math.sin(el.rotation)) > 1e-3) return null // 仅轴对齐
  const b = aabb(el)
  let best: WallSnapGuide | null = null
  let bestDist = Infinity

  for (const w of walls) {
    const n = w.closed ? w.points.length : w.points.length - 1
    for (let i = 0; i < n; i++) {
      const p = w.points[i]
      const q = w.points[(i + 1) % w.points.length]
      const horizontal = Math.abs(q.y - p.y) <= Math.abs(q.x - p.x)
      if (horizontal) {
        // 墙近似水平：家具顶边/底边贴墙线 y
        for (const edgeY of [b.minY, b.maxY]) {
          const at = (p.y + q.y) / 2
          const d = Math.abs(edgeY - at)
          if (d < bestDist && d <= tolMm) {
            bestDist = d
            best = { x: el.x, y: el.y + (at - edgeY), kind: 'wall', edge: 'y', at }
          }
        }
      } else {
        for (const edgeX of [b.minX, b.maxX]) {
          const at = (p.x + q.x) / 2
          const d = Math.abs(edgeX - at)
          if (d < bestDist && d <= tolMm) {
            bestDist = d
            best = { x: el.x + (at - edgeX), y: el.y, kind: 'wall', edge: 'x', at }
          }
        }
      }
    }
  }
  return best
}

/** 家具之间的边缘吸附：轴对齐边对齐（最近的 x/x 或 y/y） */
export function snapFurnitureToOthers(
  el: Movable,
  others: Movable[],
  tolMm: number
): WallSnapGuide | null {
  if (Math.abs(Math.sin(el.rotation)) > 1e-3) return null
  const b = aabb(el)
  let best: WallSnapGuide | null = null
  let bestDist = Infinity
  const edgesSelf = [
    { edge: 'x' as const, v: b.minX },
    { edge: 'x' as const, v: b.maxX },
    { edge: 'y' as const, v: b.minY },
    { edge: 'y' as const, v: b.maxY }
  ]
  for (const o of others) {
    if (o.id === el.id || Math.abs(Math.sin(o.rotation)) > 1e-3) continue
    const ob = aabb(o)
    const edgesOther = [
      { edge: 'x' as const, v: ob.minX },
      { edge: 'x' as const, v: ob.maxX },
      { edge: 'y' as const, v: ob.minY },
      { edge: 'y' as const, v: ob.maxY }
    ]
    for (const es of edgesSelf) {
      for (const eo of edgesOther) {
        if (es.edge !== eo.edge) continue
        const d = Math.abs(es.v - eo.v)
        if (d <= tolMm && d < bestDist) {
          bestDist = d
          best = {
            x: el.x + (es.edge === 'x' ? eo.v - es.v : 0),
            y: el.y + (es.edge === 'y' ? eo.v - es.v : 0),
            kind: 'furniture',
            edge: es.edge,
            at: eo.v
          }
        }
      }
    }
  }
  return best
}
