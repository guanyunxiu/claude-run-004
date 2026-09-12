/**
 * 墙体平面图结构分析
 *
 * 将所有墙体中心线在交点处打断，构造无向平面图（直边图），
 * 再用 half-edge 面环遍历，结合鞋带公式有向面积，
 * 从所有面环中剔除外部大面与零面积环，得到闭合房间面。
 */
import type { WallElement } from '@/types'
import { type Pt, EPS, Vec2, polygonAreaSigned, segmentCrossPoint } from './geometry'

interface Node {
  p: Pt
  edges: Edge[]
}

interface Edge {
  a: Node
  b: Node
  wallId: string
  twin: Edge
}

function ptKey(p: Pt): string {
  return `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`
}

interface RawSeg {
  a: Pt
  b: Pt
  wallId: string
}

/** 收集所有墙中心线线段（闭合墙补上最后一段） */
function collectSegments(walls: WallElement[]): RawSeg[] {
  const segs: RawSeg[] = []
  for (const w of walls) {
    const n = w.closed ? w.points.length : w.points.length - 1
    for (let i = 0; i < n; i++) {
      const a = w.points[i]
      const b = w.points[(i + 1) % w.points.length]
      if (Vec2.dist(a, b) > EPS) segs.push({ a: { ...a }, b: { ...b }, wallId: w.id })
    }
  }
  return segs
}

/** 在所有交点处打断线段，输出原子线段 */
function splitAtIntersections(segs: RawSeg[]): RawSeg[] {
  interface Cut {
    t: number
    p: Pt
  }
  const cutsPerSeg: Cut[][] = segs.map((s) => [
    { t: 0, p: { ...s.a } },
    { t: 1, p: { ...s.b } }
  ])

  const addCut = (i: number, t: number, p: Pt) => {
    const list = cutsPerSeg[i]
    if (list.some((c) => Math.abs(c.t - t) < 1e-7)) return
    list.push({ t, p })
  }

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    for (let j = i + 1; j < segs.length; j++) {
      const r = segmentCrossPoint(s.a, s.b, segs[j].a, segs[j].b)
      if (!r || r.collinear) continue
      const atIEnd = Math.abs(r.t) < 1e-7 || Math.abs(r.t - 1) < 1e-7
      const atJEnd = Math.abs(r.u) < 1e-7 || Math.abs(r.u - 1) < 1e-7
      let p = r.point
      if (atIEnd) {
        // 使用 i 侧的精确端点坐标作为两条线段的公共交点
        const ti = Math.round(r.t)
        p = ti === 0 ? { ...s.a } : { ...s.b }
        addCut(i, ti, p)
        addCut(j, Math.max(0, Math.min(1, r.u)), p)
      } else if (atJEnd) {
        const uj = Math.round(r.u)
        p = uj === 0 ? { ...segs[j].a } : { ...segs[j].b }
        addCut(j, uj, p)
        addCut(i, Math.max(0, Math.min(1, r.t)), p)
      } else {
        addCut(i, Math.max(0, Math.min(1, r.t)), p)
        addCut(j, Math.max(0, Math.min(1, r.u)), p)
      }
    }
  }

  const result: RawSeg[] = []
  for (let i = 0; i < segs.length; i++) {
    const cuts = cutsPerSeg[i]
    cuts.sort((a, b) => a.t - b.t)
    for (let k = 0; k < cuts.length - 1; k++) {
      const c0 = cuts[k]
      const c1 = cuts[k + 1]
      if (c1.t - c0.t < 1e-7) continue
      result.push({ a: { ...c0.p }, b: { ...c1.p }, wallId: segs[i].wallId })
    }
  }
  return result
}

/** 共线重叠的原子线段去重 */
function dedupEdges(segs: RawSeg[]): RawSeg[] {
  const seen = new Set<string>()
  const out: RawSeg[] = []
  for (const s of segs) {
    const ka = ptKey(s.a)
    const kb = ptKey(s.b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function buildGraph(segs: RawSeg[]): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>()
  const getNode = (p: Pt): Node => {
    const k = ptKey(p)
    let n = nodeMap.get(k)
    if (!n) {
      n = { p, edges: [] }
      nodeMap.set(k, n)
    }
    return n
  }

  const edges: Edge[] = []
  for (const s of segs) {
    const a = getNode(s.a)
    const b = getNode(s.b)
    if (a === b) continue
    if (a.edges.some((e) => e.b === b)) continue
    const stub = {} as Edge
    const e1: Edge = { a, b, wallId: s.wallId, twin: stub }
    const e2: Edge = { a: b, b: a, wallId: s.wallId, twin: e1 }
    e1.twin = e2
    a.edges.push(e1)
    b.edges.push(e2)
    edges.push(e1, e2)
  }
  return { nodes: [...nodeMap.values()], edges }
}

/**
 * 面环遍历：到达节点后，在出边中取「入射方向顺时针旋转遇到的第一条边」
 * （屏幕坐标 y 向下），该规则保证所有面环朝向一致：
 * 有界面（房间）顺时针行走 -> 鞋带有向面积为负。
 */
function traceFaces(edges: Edge[]): { ring: Pt[]; wallIds: Set<string> }[] {
  const used = new Set<Edge>()
  const faces: { ring: Pt[]; wallIds: Set<string> }[] = []

  for (const start of edges) {
    if (used.has(start)) continue
    const ring: Pt[] = []
    const wallIds = new Set<string>()
    let cur = start
    let complete = true
    do {
      if (used.has(cur)) break
      used.add(cur)
      ring.push({ ...cur.a.p })
      wallIds.add(cur.wallId)
      const at = cur.b

      // 从当前节点指回来源节点的方向
      const bx = cur.a.p.x - at.p.x
      const by = cur.a.p.y - at.p.y

      let next: Edge | null = null
      let bestDelta = Infinity
      for (const e of at.edges) {
        if (e === cur.twin) continue
        const dx = e.b.p.x - at.p.x
        const dy = e.b.p.y - at.p.y
        // 从「指回来源」方向旋转到候选出边的有向夹角，归一化到 (0, 2π]
        let delta = Math.atan2(bx * dy - by * dx, bx * dx + by * dy)
        if (delta <= 0) delta += Math.PI * 2
        // 最小正角 = 顺时针相邻边（屏幕 y 向下），保持墙面在同一侧
        if (delta < bestDelta) {
          bestDelta = delta
          next = e
        }
      }
      if (!next) {
        // 悬挂边（开放墙端）：环不完整，丢弃
        complete = false
        break
      }
      cur = next
    } while (cur !== start)

    if (complete && ring.length >= 3) faces.push({ ring, wallIds })
  }
  return faces
}

export interface ExtractedRoom {
  points: Pt[]
  area: number
  perimeter: number
  wallIds: string[]
}

/** DEBUG: 返回所有面环有向面积 */
export function _debugFaceAreas(walls: WallElement[]): number[] {
  return _debugFaces(walls).map((f) => Math.round(polygonAreaSigned(f.ring)))
}

/** DEBUG: 返回所有面环点 */
export function _debugFaces(walls: WallElement[]): { ring: Pt[]; wallIds: string[] }[] {
  const raw = collectSegments(walls)
  const split = splitAtIntersections(raw)
  const segs = dedupEdges(split)
  const { edges } = buildGraph(segs)
  return traceFaces(edges).map((f) => ({ ring: f.ring, wallIds: [...f.wallIds] }))
}

/** 从墙体集合提取闭合房间（面环面积为负的有界面） */
export function extractRooms(walls: WallElement[]): ExtractedRoom[] {
  const raw = collectSegments(walls)
  if (raw.length < 3) return []
  const split = splitAtIntersections(raw)
  const segs = dedupEdges(split)
  const { edges } = buildGraph(segs)
  const faces = traceFaces(edges)

  // 屏幕坐标系下顺时针面环有向面积为负 => 有界面；
  // 面积为正的是外部大面；面积为 0 是退化环。
  type Candidate = { ring: Pt[]; wallIds: Set<string>; signedArea: number }
  const candidates: Candidate[] = []
  for (const f of faces) {
    const signedArea = polygonAreaSigned(f.ring)
    if (signedArea < -EPS) candidates.push({ ring: f.ring, wallIds: f.wallIds, signedArea })
  }
  if (candidates.length === 0) return []

  // 嵌套墙场景：内环与外环之间的「走廊环」在拓扑上也是有界面，
  // 但用户语义中它属于外部。其特征：面环包围盒与整图包围盒几乎重合。
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  const spanX = Math.max(maxX - minX, EPS)
  const spanY = Math.max(maxY - minY, EPS)
  const tol = 0.99

  const rooms: ExtractedRoom[] = []
  for (const c of candidates) {
    let cx0 = Infinity
    let cy0 = Infinity
    let cx1 = -Infinity
    let cy1 = -Infinity
    for (const p of c.ring) {
      cx0 = Math.min(cx0, p.x)
      cy0 = Math.min(cy0, p.y)
      cx1 = Math.max(cx1, p.x)
      cy1 = Math.max(cy1, p.y)
    }
    // 若面环几乎贴着整图外边界，则视为外部面剔除
    const touchesOuter =
      (cx0 - minX) / spanX < 1 - tol &&
      (cy0 - minY) / spanY < 1 - tol &&
      (maxX - cx1) / spanX < 1 - tol &&
      (maxY - cy1) / spanY < 1 - tol
    if (touchesOuter && candidates.length > 1) continue

    const pts = c.ring
    const perim = pts.reduce((sum, p, i) => {
      const q = pts[(i + 1) % pts.length]
      return sum + Vec2.dist(p, q)
    }, 0)
    rooms.push({
      points: pts,
      area: Math.abs(c.signedArea),
      perimeter: perim,
      wallIds: [...c.wallIds]
    })
  }
  return rooms
}
