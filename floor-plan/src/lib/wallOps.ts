/**
 * 墙体批量几何操作：
 * - trimWallsAtIntersections：墙体相交自动裁剪（删除伸入其它墙体内部的端头段）
 * - healWalls：断线修复（端点吸附、共线断线合并）
 * - batchEditWalls：批量编辑墙厚/颜色
 */
import type { DoorElement, WallElement, WindowElement } from '@/types'
import { type Pt, EPS, Vec2, polylineLength, segmentCrossPoint } from './geometry'

export interface OpeningLike {
  wallId: string
  offset: number
  width: number
}

export interface WallOpsResult {
  /** 操作后的墙体（顺序保持：保留 id 的墙在前，新拆分墙在后） */
  walls: WallElement[]
  /** 被删除的墙 id */
  removedIds: string[]
  /** 新产生的墙 id（由拆分产生） */
  newIds: string[]
  /** id 映射：被拆分原墙 -> 保留链 id（通常等于自身） */
  idMap: Record<string, string>
  /** 每面保留墙被裁掉的起始/末端长度（mm，用于门窗 offset 平移） */
  trims: Record<string, { head: number; tail: number }>
  changed: boolean
}

interface AtomSeg {
  a: Pt
  b: Pt
  wallId: string
  /** 沿原墙起点方向的长度区间 */
  d0: number
  d1: number
}

/** 展开墙为中心线原子线段（带沿墙距离） */
function flattenWall(w: WallElement): AtomSeg[] {
  const out: AtomSeg[] = []
  const n = w.closed ? w.points.length : w.points.length - 1
  let acc = 0
  for (let i = 0; i < n; i++) {
    const a = w.points[i]
    const b = w.points[(i + 1) % w.points.length]
    const len = Vec2.dist(a, b)
    if (len > EPS) out.push({ a: { ...a }, b: { ...b }, wallId: w.id, d0: acc, d1: acc + len })
    acc += len
  }
  return out
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const l2 = rx * rx + ry * ry
  if (l2 < EPS) return Vec2.dist(p, a)
  let t = ((p.x - a.x) * rx + (p.y - a.y) * ry) / l2
  t = Math.max(0, Math.min(1, t))
  return Vec2.dist(p, { x: a.x + rx * t, y: a.y + ry * t })
}

/** 点到折线距离 */
function distToPolyline(p: Pt, pts: Pt[], closed: boolean): number {
  let best = Infinity
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    best = Math.min(best, distToSeg(p, pts[i], pts[(i + 1) % pts.length]))
  }
  return best
}

/**
 * 墙体相交自动裁剪。
 * 语义（对齐 CAD「端头修剪」）：仅当开放墙的 *端头* 落在其它墙体厚度内部时，
 * 从该端头到最近交点的悬挑段删除；交点另一侧的正常墙身不动。
 * 因此 T 形接入会剪掉伸入的小端头，而十字贯穿（两端都在墙外）保持完整。
 * 整面墙（如闭合短墙）完全埋入其它墙时删除。
 */
export function trimWallsAtIntersections(walls: WallElement[]): WallOpsResult {
  const result: WallOpsResult = {
    walls: [],
    removedIds: [],
    newIds: [],
    idMap: {},
    trims: {},
    changed: false
  }

  for (const w of walls) {
    if (w.closed) {
      // 闭合墙环不做端头裁剪
      result.walls.push(w)
      result.idMap[w.id] = w.id
      result.trims[w.id] = { head: 0, tail: 0 }
      continue
    }

    const segs = flattenWall(w)
    if (segs.length === 0) continue
    const total = polylineLength(w.points, false)

    // 端点是否埋入其它墙体内部（含一定公差）
    const buried = (p: Pt): boolean =>
      walls.some(
        (o) => o.id !== w.id && distToPolyline(p, o.points, o.closed) <= o.thickness / 2 + 1
      )
    const startBuried = buried(w.points[0])
    const endBuried = buried(w.points[w.points.length - 1])

    if (!startBuried && !endBuried) {
      result.walls.push(w)
      result.idMap[w.id] = w.id
      result.trims[w.id] = { head: 0, tail: 0 }
      continue
    }

    // 收集与其它墙的交点（沿墙距离）
    const crossDists: number[] = []
    for (const other of walls) {
      if (other.id === w.id) continue
      for (const s of segs) {
        for (const os of flattenWall(other)) {
          const r = segmentCrossPoint(s.a, s.b, os.a, os.b)
          if (!r || r.collinear) continue
          crossDists.push(s.d0 + r.t * (s.d1 - s.d0))
        }
      }
    }

    // 新起点：起始端头被埋 -> 取最靠近起点的交点；否则保留原起点
    let newStart = 0
    let newEnd = total
    if (startBuried) {
      const inner = crossDists.filter((d) => d > EPS)
      newStart = inner.length ? Math.min(...inner) : 0
    }
    if (endBuried) {
      const inner = crossDists.filter((d) => d < total - EPS)
      newEnd = inner.length ? Math.max(...inner) : total
    }
    if (newEnd - newStart <= EPS) {
      result.removedIds.push(w.id)
      result.changed = true
      continue
    }

    // 沿墙取 [newStart, newEnd] 的折线
    const pts = slicePolyline(w.points, newStart, newEnd)
    if (!pts || pts.length < 2) {
      result.removedIds.push(w.id)
      result.changed = true
      continue
    }
    result.walls.push({ ...w, points: pts, closed: false })
    result.idMap[w.id] = w.id
    result.trims[w.id] = { head: newStart, tail: total - newEnd }
    if (newStart > EPS || total - newEnd > EPS) result.changed = true
  }

  return result
}

/** 沿开放折线取 [d0,d1] 区间的点（必要时在两端插入裁剪点，中间顶点保留） */
function slicePolyline(pts: Pt[], d0: number, d1: number): Pt[] | null {
  const pointAt = (d: number): Pt => {
    let acc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const len = Vec2.dist(a, b)
      if (acc + len >= d - EPS) {
        const t = len < EPS ? 0 : Math.max(0, Math.min(1, (d - acc) / len))
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      }
      acc += len
    }
    return { ...pts[pts.length - 1] }
  }
  const mids: Pt[] = []
  let acc = 0
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Vec2.dist(pts[i - 1], pts[i])
    if (acc > d0 + EPS && acc < d1 - EPS) mids.push({ ...pts[i] })
  }
  return [pointAt(d0), ...mids, pointAt(d1)]
}

// ---------------------------------------------------------------------------
// 断线修复
// ---------------------------------------------------------------------------

export interface HealResult {
  walls: WallElement[]
  /** 被合并删除的墙 id */
  mergedAway: string[]
  /** 被整体删除的零长度墙 id */
  deletedIds: string[]
  mergedCount: number
  snappedCount: number
}

/** 三段共线判定（p1->p2 与 p2->p3 方向相同或相反均可，取连接点处夹角 ≈ 180°） */
function straightJoin(p1: Pt, p2: Pt, p3: Pt): boolean {
  const v1x = p2.x - p1.x
  const v1y = p2.y - p1.y
  const v2x = p3.x - p2.x
  const v2y = p3.y - p2.y
  const cross = v1x * v2y - v1y * v2x
  const l1 = Math.hypot(v1x, v1y)
  const l2 = Math.hypot(v2x, v2y)
  if (l1 < EPS || l2 < EPS) return false
  // 方向接近 180°（允许 0.5° 误差）
  return Math.abs(cross) / (l1 * l2) < Math.sin((0.5 * Math.PI) / 180)
}

/**
 * 断线修复：
 * 1) 删除零长度墙；
 * 2) 距离 ≤ tolMm 的开放墙端点聚为同一坐标（组内取多数/平均点）；
 * 3) 共点且共线的开放墙首尾合并（同墙厚），门窗 offset 自动跟随到新墙。
 */
export function healWalls(
  walls: WallElement[],
  openings: OpeningLike[],
  tolMm: number
): HealResult {
  const deletedIds: string[] = []
  let snappedCount = 0

  // 过滤零长度墙
  let work = walls.filter((w) => {
    if (polylineLength(w.points, w.closed) <= EPS) {
      deletedIds.push(w.id)
      return false
    }
    return true
  })

  if (work.length === 0) {
    return { walls: [], mergedAway: [], deletedIds, mergedCount: 0, snappedCount: 0 }
  }

  // ---------- 步骤 1：开放墙端点聚类吸附（并查集） ----------
  interface End {
    wallId: string
    which: 0 | 1 // 0=起点 1=终点
    p: Pt
  }
  const ends: End[] = []
  const byId = new Map(work.map((w) => [w.id, w]))
  for (const w of work) {
    if (w.closed) continue
    ends.push({ wallId: w.id, which: 0, p: w.points[0] })
    ends.push({ wallId: w.id, which: 1, p: w.points[w.points.length - 1] })
  }
  const keyOf = (e: End) => `${e.wallId}:${e.which}`
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let root = parent.get(k) ?? k
    if (root !== k) root = find(root)
    parent.set(k, root)
    return root
  }
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (Vec2.dist(ends[i].p, ends[j].p) <= tolMm) {
        const a = find(keyOf(ends[i]))
        const b = find(keyOf(ends[j]))
        if (a !== b) parent.set(a, b)
      }
    }
  }
  const groups = new Map<string, End[]>()
  for (const e of ends) {
    const root = find(keyOf(e))
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(e)
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue
    // 组内取频次最高的坐标，否则取平均
    const freq = new Map<string, { p: Pt; n: number }>()
    for (const e of list) {
      const k = `${Math.round(e.p.x * 10) / 10},${Math.round(e.p.y * 10) / 10}`
      const cur = freq.get(k)
      if (cur) cur.n++
      else freq.set(k, { p: { ...e.p }, n: 1 })
    }
    let anchor: Pt | null = null
    let maxN = 0
    for (const v of freq.values()) {
      if (v.n > maxN) {
        maxN = v.n
        anchor = v.p
      }
    }
    if (maxN <= 1) {
      anchor = {
        x: list.reduce((s, e) => s + e.p.x, 0) / list.length,
        y: list.reduce((s, e) => s + e.p.y, 0) / list.length
      }
    }
    for (const e of list) {
      const w = byId.get(e.wallId)!
      const target = e.which === 0 ? w.points[0] : w.points[w.points.length - 1]
      if (Vec2.dist(target, anchor!) > EPS) {
        target.x = anchor!.x
        target.y = anchor!.y
        snappedCount++
      }
    }
  }

  // ---------- 步骤 2：共点共线的开放墙合并为链 ----------
  // 链记录每个来源墙段，以便门窗 offset 重映射
  interface Span {
    wallId: string
    reversed: boolean
    origLen: number
  }
  interface Chain {
    pts: Pt[]
    spans: { start: number; span: Span }[]
    thickness: number
    color: string
  }
  const chains: Chain[] = []
  const chainOf = new Map<string, Chain>()
  for (const w of work) {
    if (w.closed) continue
    const len = polylineLength(w.points)
    const chain: Chain = {
      pts: w.points.map((p) => ({ ...p })),
      spans: [{ start: 0, span: { wallId: w.id, reversed: false, origLen: len } }],
      thickness: w.thickness,
      color: w.color
    }
    chains.push(chain)
    chainOf.set(w.id, chain)
  }

  const endPt = (c: Chain, which: 0 | 1): Pt =>
    which === 0 ? c.pts[0] : c.pts[c.pts.length - 1]
  const neighborPt = (c: Chain, which: 0 | 1): Pt =>
    which === 0 ? c.pts[1] : c.pts[c.pts.length - 2]

  let mergedCount = 0
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < chains.length; i++) {
      const c1 = chains[i]
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue
        const c2 = chains[j]
        if (c1.thickness !== c2.thickness) continue
        for (const e1 of [0, 1] as const) {
          for (const e2 of [0, 1] as const) {
            const p = endPt(c1, e1)
            const q = endPt(c2, e2)
            if (Vec2.dist(p, q) > EPS) continue
            // 共线：c1 连接点的邻点 -> p -> c2 连接点的邻点（越过 p 后应直行）
            if (!straightJoin(neighborPt(c1, e1), p, neighborPt(c2, e2))) continue

            // 统一方向：让 c1 正向（连接端为尾 e1=1），c2 正向（连接端为头 e2=0）
            const pts1 = e1 === 1 ? c1.pts : [...c1.pts].reverse()
            const pts2 = e2 === 0 ? c2.pts : [...c2.pts].reverse()
            const rev1 = e1 === 1
            const rev2 = e2 === 0
            const len1 = polylineLength(c1.pts)
            const len2 = polylineLength(c2.pts)

            const newPts = [...pts1, ...pts2.slice(1)]
            const newSpans: { start: number; span: Span }[] = []
            for (const s of c1.spans) {
              newSpans.push({ start: rev1 ? s.start : len1 - s.start - s.span.origLen + s.span.origLen, span: s.span })
            }
            // 上面的表达保持与 start 同向语义：重算更稳妥
            newSpans.length = 0
            const pushSpans = (c: Chain, reversed: boolean, base: number, total: number) => {
              for (const s of c.spans) {
                newSpans.push({
                  start: base + (reversed ? total - s.start - s.span.origLen : s.start),
                  span: { wallId: s.span.wallId, reversed: reversed ? !s.span.reversed : s.span.reversed, origLen: s.span.origLen }
                })
              }
            }
            pushSpans(c1, !rev1, 0, len1)
            pushSpans(c2, !rev2, len1, len2)

            c1.pts = newPts
            c1.spans = newSpans
            chains.splice(j, 1)
            mergedCount++
            merged = true
            break outer
          }
        }
      }
    }
  }

  // ---------- 输出：每条链保留首个来源墙的 id，其余并入 mergedAway ----------
  const mergedAway = new Set<string>()
  const out: WallElement[] = []
  // 闭合墙原样保留
  for (const w of work) if (w.closed) out.push(w)

  // span 起点排序便于 offset 映射
  const offsetMap = new Map<string, { wallId: string; start: number; reversed: boolean; origLen: number }>()
  for (const c of chains) {
    const spans = [...c.spans].sort((a, b) => a.start - b.start)
    const keepId = spans[0].span.wallId
    const keepWall = byId.get(keepId)!
    out.push({ ...keepWall, points: c.pts, closed: false })
    for (const s of spans) {
      if (s.span.wallId !== keepId) mergedAway.add(s.span.wallId)
      offsetMap.set(s.span.wallId, {
        wallId: keepId,
        start: s.start,
        reversed: s.span.reversed,
        origLen: s.span.origLen
      })
    }
  }

  // 门窗 offset 重映射；依附已删除/被合并墙的迁移
  for (const op of openings) {
    const m = offsetMap.get(op.wallId)
    if (!m) {
      if (deletedIds.includes(op.wallId)) op.wallId = '__deleted__'
      continue
    }
    const oldOffset = op.offset
    op.offset = m.start + (m.reversed ? m.origLen - op.width - oldOffset : oldOffset)
    op.wallId = m.wallId
  }

  return {
    walls: out,
    mergedAway: [...mergedAway],
    deletedIds,
    mergedCount,
    snappedCount
  }
}

// ---------------------------------------------------------------------------
// 批量编辑
// ---------------------------------------------------------------------------

/** 批量修改墙厚/颜色；返回修改的属性计数 */
export function batchEditWalls(
  walls: WallElement[],
  patch: { thickness?: number; color?: string }
): number {
  let n = 0
  for (const w of walls) {
    if (patch.thickness != null && w.thickness !== patch.thickness) {
      w.thickness = patch.thickness
      n++
    }
    if (patch.color != null && w.color !== patch.color) {
      w.color = patch.color
      n++
    }
  }
  return n
}

/**
 * 裁剪后处理依附门窗：
 * - 依附墙保留：按裁掉的头部长度平移 offset；洞口落到被删区间则返回为待删除；
 * - 依附墙被整体删除：在几何最近的保留墙上重新定位（拆链兜底，当前裁剪不拆链）。
 */
export function rehomeOpenings(
  openings: (DoorElement | WindowElement)[],
  before: WallElement[],
  ops: WallOpsResult
): (DoorElement | WindowElement)[] {
  const beforeMap = new Map(before.map((w) => [w.id, w]))
  const afterMap = new Map(ops.walls.map((w) => [w.id, w]))
  const removed = new Set(ops.removedIds)
  const orphan: (DoorElement | WindowElement)[] = []

  for (const op of openings) {
    // 依附墙保留：平移 offset
    if (!removed.has(op.wallId)) {
      const trim = ops.trims[op.wallId]
      if (!trim || trim.head === 0) continue
      const w = afterMap.get(op.wallId)
      const newTotal = w ? polylineLength(w.points, w.closed) : Infinity
      const newOffset = op.offset - trim.head
      if (newOffset < -1 || newOffset + op.width > newTotal + 1) {
        orphan.push(op)
      } else {
        op.offset = Math.max(0, newOffset)
      }
      continue
    }

    // 依附墙被整体删除：迁移到最近保留墙
    const src = beforeMap.get(op.wallId)
    if (!src) {
      orphan.push(op)
      continue
    }
    const total = polylineLength(src.points, src.closed)
    const d = Math.min(op.offset + op.width / 2, Math.max(0, total))

    let acc = 0
    let target: Pt = src.points[src.points.length - 1]
    const n = src.closed ? src.points.length : src.points.length - 1
    outer2: for (let i = 0; i < n; i++) {
      const a = src.points[i]
      const b = src.points[(i + 1) % src.points.length]
      const len = Vec2.dist(a, b)
      if (acc + len >= d - EPS) {
        const t = len < EPS ? 0 : (d - acc) / len
        target = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        break outer2
      }
      acc += len
    }

    let bestWall: WallElement | null = null
    let bestD = Infinity
    let bestOffset = 0
    for (const w of ops.walls) {
      const dd = distToPolyline(target, w.points, w.closed)
      if (dd < bestD) {
        bestD = dd
        bestWall = w
        let off = 0
        const nn = w.closed ? w.points.length : w.points.length - 1
        outer3: for (let i = 0; i < nn; i++) {
          const aa = w.points[i]
          const bb = w.points[(i + 1) % w.points.length]
          const ll = Vec2.dist(aa, bb)
          if (distToSeg(target, aa, bb) <= 1) {
            const rx = bb.x - aa.x
            const ry = bb.y - aa.y
            const l2 = rx * rx + ry * ry || 1
            const t = Math.max(0, Math.min(1, ((target.x - aa.x) * rx + (target.y - aa.y) * ry) / l2))
            off += t * ll
            bestOffset = off
            break outer3
          }
          off += ll
        }
      }
    }
    if (bestWall && bestD < Math.max(src.thickness, bestWall.thickness)) {
      op.wallId = bestWall.id
      const maxOff = Math.max(0, polylineLength(bestWall.points, bestWall.closed) - op.width)
      op.offset = Math.max(0, Math.min(bestOffset - op.width / 2, maxOff))
    } else {
      orphan.push(op)
    }
  }
  return orphan
}

// ===========================================================================
// 手动墙编辑：插入/删除顶点、打断、手动合并
// ===========================================================================

/** 在墙的某条边上距 p 最近处插入顶点，返回新顶点序号；未命中返回 -1 */
export function insertVertex(wall: WallElement, p: Pt, tolMm: number): number {
  if (wall.closed) {
    // 闭合墙在边上插入：把点插入到边的后一个顶点位置，保持闭合
    const n = wall.points.length
    let best = { i: -1, t: 0, d: Infinity }
    for (let i = 0; i < n; i++) {
      const a = wall.points[i]
      const b = wall.points[(i + 1) % n]
      const r = pointSegInfo(p, a, b)
      if (r.dist < best.d) best = { i, t: r.t, d: r.dist }
    }
    if (best.d > tolMm || best.i < 0) return -1
    const a = wall.points[best.i]
    const b = wall.points[(best.i + 1) % n]
    const np = { x: a.x + (b.x - a.x) * best.t, y: a.y + (b.y - a.y) * best.t }
    wall.points.splice(best.i + 1, 0, np)
    return best.i + 1
  }
  let best = { i: -1, t: 0, d: Infinity }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const r = pointSegInfo(p, wall.points[i], wall.points[i + 1])
    if (r.dist < best.d) best = { i, t: r.t, d: r.dist }
  }
  if (best.d > tolMm || best.i < 0) return -1
  const a = wall.points[best.i]
  const b = wall.points[best.i + 1]
  const np = { x: a.x + (b.x - a.x) * best.t, y: a.y + (b.y - a.y) * best.t }
  wall.points.splice(best.i + 1, 0, np)
  return best.i + 1
}

/** 删除中间顶点（开放墙至少保留 2 点，闭合墙至少 3 点），返回是否删除 */
export function removeVertex(wall: WallElement, index: number): boolean {
  const minPts = wall.closed ? 3 : 2
  if (wall.points.length <= minPts) return false
  if (index < 0 || index >= wall.points.length) return false
  wall.points.splice(index, 1)
  return true
}

export interface SplitResult {
  /** 打断点（世界坐标） */
  point: Pt
  /** 沿墙距离 mm */
  dist: number
  segIndex: number
}

/** 找到 p 在墙上的打断位置（最近边投影），超出容差返回 null */
export function findSplitPoint(wall: WallElement, p: Pt, tolMm: number): SplitResult | null {
  let acc = 0
  const n = wall.closed ? wall.points.length : wall.points.length - 1
  let best: (SplitResult & { d: number }) | null = null
  for (let i = 0; i < n; i++) {
    const a = wall.points[i]
    const b = wall.points[(i + 1) % wall.points.length]
    const r = pointSegInfo(p, a, b)
    if (r.dist <= tolMm && (!best || r.dist < best.d)) {
      best = {
        point: { x: a.x + (b.x - a.x) * r.t, y: a.y + (b.y - a.y) * r.t },
        dist: acc + r.t * Vec2.dist(a, b),
        segIndex: i,
        d: r.dist
      }
    }
    acc += Vec2.dist(a, b)
  }
  return best
}

/**
 * 在指定沿墙距离处把一面开放墙打断成两面墙。
 * 门窗按 offset 归属到对应半墙并重映射；返回新墙（原墙被截断为前半段）。
 */
export function splitWallAt(
  wall: WallElement,
  dist: number,
  point: Pt,
  openings: OpeningLike[],
  genId: () => string
): WallElement {
  const total = polylineLength(wall.points, false)
  // 收集前半段点（在 dist 之前的顶点）+ 打断点
  const ptsA: Pt[] = []
  const ptsB: Pt[] = []
  let acc = 0
  ptsA.push({ ...wall.points[0] })
  let passed = false
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const len = Vec2.dist(a, b)
    if (!passed && acc + len >= dist - EPS) {
      ptsA.push({ ...point })
      ptsB.push({ ...point })
      // dist 之后的顶点归入 B
      for (let j = i + 1; j < wall.points.length; j++) ptsB.push({ ...wall.points[j] })
      passed = true
      break
    }
    ptsA.push({ ...b })
    acc += len
  }
  const lenA = dist
  const lenB = total - dist

  const newWall: WallElement = {
    id: genId(),
    kind: 'wall',
    points: ptsB.length >= 2 ? ptsB : [{ ...point }, { ...wall.points[wall.points.length - 1] }],
    closed: false,
    thickness: wall.thickness,
    color: wall.color
  }
  wall.points = ptsA
  wall.closed = false

  // 门窗归属：洞口中点 < dist => 留在 A；否则迁到 B（offset 减去 lenA）
  for (const op of openings) {
    const mid = op.offset + op.width / 2
    if (mid >= lenA - EPS) {
      op.wallId = newWall.id
      op.offset = Math.max(0, op.offset - lenA)
    }
  }
  void lenB
  return newWall
}

/** 两面开放墙是否可在端点处合并（共享端点或端点在容差内） */
export function canJoinWalls(a: WallElement, b: WallElement, tolMm: number): boolean {
  if (a.closed || b.closed) return false
  if (Math.abs(a.thickness - b.thickness) > EPS) return false
  const ae = [a.points[0], a.points[a.points.length - 1]]
  const be = [b.points[0], b.points[b.points.length - 1]]
  for (const x of ae) for (const y of be) if (Vec2.dist(x, y) <= tolMm) return true
  return false
}

export interface ManualJoinResult {
  wall: WallElement
  removedId: string
}

/**
 * 手动合并两面开放墙（端点相接即可，允许折线、不要求共线）。
 * 依附被并墙 b 的门窗 offset 重映射到合并墙；返回保留墙 a（已修改）与被删 id。
 */
export function joinWalls(
  a: WallElement,
  b: WallElement,
  openings: OpeningLike[]
): ManualJoinResult | null {
  if (a.closed || b.closed) return null
  const a0 = a.points[0]
  const a1 = a.points[a.points.length - 1]
  const b0 = b.points[0]
  const b1 = b.points[b.points.length - 1]
  const D = (p: Pt, q: Pt) => Vec2.dist(p, q)
  // 选择连接组合，使拼接点为 a 端与 b 端
  let aPts = a.points
  let bPts = b.points
  let joinAEnd: 0 | 1 = 1
  let joinBEnd: 0 | 1 = 0
  let best = Infinity
  const combos: [0 | 1, 0 | 1][] = [
    [1, 0],
    [1, 1],
    [0, 0],
    [0, 1]
  ]
  for (const [ea, eb] of combos) {
    const pa = ea === 0 ? a0 : a1
    const pb = eb === 0 ? b0 : b1
    const d = D(pa, pb)
    if (d < best) {
      best = d
      joinAEnd = ea
      joinBEnd = eb
    }
  }
  aPts = joinAEnd === 0 ? [...a.points].reverse() : a.points.map((p) => ({ ...p }))
  // b 需要从连接端开始走向另一端
  bPts = (joinBEnd === 0 ? b.points : [...b.points].reverse()).map((p) => ({ ...p }))
  // 拼接点统一用 a 的端点坐标，去掉 b 的首点
  const merged = [...aPts, ...bPts.slice(1)]
  const lenA = polylineLength(aPts, false)
  const lenB = polylineLength(bPts, false)
  // a 被反向时，依附 a 的门窗 offset 翻转
  const aReversed = joinAEnd === 0
  for (const op of openings) {
    if (op.wallId === b.id) {
      // bPts 沿走向 offset 即原 b offset（joinBEnd=0 正向；=1 反向）
      const along = joinBEnd === 0 ? op.offset : lenB - op.width - op.offset
      op.wallId = a.id
      op.offset = lenA + along
    } else if (op.wallId === a.id && aReversed) {
      op.offset = lenA - op.width - op.offset
    }
  }
  a.points = merged
  a.closed = false
  return { wall: a, removedId: b.id }
}

/** 点到线段信息：最近距离与参数 t */
function pointSegInfo(p: Pt, a: Pt, b: Pt): { dist: number; t: number } {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const l2 = rx * rx + ry * ry
  let t = l2 === 0 ? 0 : ((p.x - a.x) * rx + (p.y - a.y) * ry) / l2
  t = Math.max(0, Math.min(1, t))
  const qx = a.x + rx * t
  const qy = a.y + ry * t
  return { dist: Math.hypot(p.x - qx, p.y - qy), t }
}
