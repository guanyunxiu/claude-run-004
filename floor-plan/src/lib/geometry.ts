/**
 * 自研几何工具类
 * - Vec2 二维向量
 * - 线段相交 / 点到线段距离
 * - 正交锁定、端点吸附
 * - 鞋带公式：多边形面积 / 周长 / 形心
 * - 连续折线双线轮廓（miter 斜接偏移）
 * 所有坐标单位：毫米 (mm)，屏幕坐标系 y 轴向下
 */

export interface Pt {
  x: number
  y: number
}

export const EPS = 1e-6

export class Vec2 {
  constructor(
    public x: number,
    public y: number
  ) {}

  static from(p: Pt): Vec2 {
    return new Vec2(p.x, p.y)
  }

  static angle(v: Vec2): number {
    return Math.atan2(v.y, v.x)
  }

  static dist(a: Pt, b: Pt): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y)
  }

  toPt(): Pt {
    return { x: this.x, y: this.y }
  }

  add(v: Pt): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y)
  }

  sub(v: Pt): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y)
  }

  mul(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s)
  }

  div(s: number): Vec2 {
    return new Vec2(this.x / s, this.y / s)
  }

  neg(): Vec2 {
    return new Vec2(-this.x, -this.y)
  }

  len(): number {
    return Math.hypot(this.x, this.y)
  }

  len2(): number {
    return this.x * this.x + this.y * this.y
  }

  norm(): Vec2 {
    const l = this.len()
    return l < EPS ? new Vec2(0, 0) : new Vec2(this.x / l, this.y / l)
  }

  /** 左侧法向量（y 向下时为几何意义的左侧） */
  perp(): Vec2 {
    return new Vec2(-this.y, this.x)
  }

  dot(v: Pt): number {
    return this.x * v.x + this.y * v.y
  }

  cross(v: Pt): number {
    return this.x * v.y - this.y * v.x
  }

  rotate(rad: number): Vec2 {
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c)
  }

  rotate90(): Vec2 {
    return new Vec2(-this.y, this.x)
  }

  round(precision = 0): Pt {
    const f = 10 ** precision
    return { x: Math.round(this.x * f) / f, y: Math.round(this.y * f) / f }
  }
}

// ---------------------------------------------------------------------------
// 线段相交
// ---------------------------------------------------------------------------

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y)
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  )
}

/** 线段是否相交（含端点接触与共线重叠） */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (Math.abs(o1) < EPS && onSegment(a, b, c)) return true
  if (Math.abs(o2) < EPS && onSegment(a, b, d)) return true
  if (Math.abs(o3) < EPS && onSegment(c, d, a)) return true
  if (Math.abs(o4) < EPS && onSegment(c, d, b)) return true
  return o1 * o2 < 0 && o3 * o4 < 0
}

export interface CrossResult {
  point: Pt
  t: number // a + t*(b-a)
  u: number // c + u*(d-c)
  collinear: boolean
}

/** 计算两线段交点，无交点返回 null */
export function segmentCrossPoint(a: Pt, b: Pt, c: Pt, d: Pt): CrossResult | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const denom = cross(rx, ry, sx, sy)
  const qpx = c.x - a.x
  const qpy = c.y - a.y

  if (Math.abs(denom) < EPS) {
    // 共线：返回重叠段中点
    if (Math.abs(cross(rx, ry, qpx, qpy)) > EPS) return null
    const pts = [a, b, c, d]
    const order = orient(a, b, c) === 0 && onSegment(a, b, c)
    void order
    // 投影到 r 方向排序，取中间两点中点
    const proj = (p: Pt) => ((p.x - a.x) * rx + (p.y - a.y) * ry) / (rx * rx + ry * ry || 1)
    const ts = pts.map(proj).sort((x, y) => x - y)
    const t0 = Math.max(0, Math.min(ts[1], ts[2]))
    const t1 = Math.min(1, Math.max(ts[1], ts[2]))
    if (t1 < t0 - EPS) return null
    const t = (t0 + t1) / 2
    return {
      point: { x: a.x + rx * t, y: a.y + ry * t },
      t,
      u: 0,
      collinear: true
    }
  }

  const t = cross(qpx, qpy, sx, sy) / denom
  const u = cross(qpx, qpy, rx, ry) / denom
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return {
    point: { x: a.x + rx * t, y: a.y + ry * t },
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u)),
    collinear: false
  }
}

// ---------------------------------------------------------------------------
// 距离 / 投影
// ---------------------------------------------------------------------------

export interface DistResult {
  dist: number
  q: Pt // 线段上的最近点（垂足）
  t: number // 参数 [0,1]
}

export function pointSegmentDist(p: Pt, a: Pt, b: Pt): DistResult {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const l2 = rx * rx + ry * ry
  let t = l2 < EPS ? 0 : ((p.x - a.x) * rx + (p.y - a.y) * ry) / l2
  t = Math.max(0, Math.min(1, t))
  const q = { x: a.x + rx * t, y: a.y + ry * t }
  return { dist: Vec2.dist(p, q), q, t }
}

export interface PolylineHit extends DistResult {
  segmentIndex: number
}

/** 点到折线（可闭合）的最近距离 */
export function pointPolylineDist(p: Pt, pts: Pt[], closed: boolean): PolylineHit | null {
  if (pts.length < 2) return null
  let best: PolylineHit | null = null
  const segCount = closed ? pts.length : pts.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const r = pointSegmentDist(p, a, b)
    if (!best || r.dist < best.dist) {
      best = { ...r, segmentIndex: i }
    }
  }
  return best
}

export function polylineLength(pts: Pt[], closed = false): number {
  if (pts.length < 2) return 0
  let sum = 0
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) sum += Vec2.dist(pts[i], pts[(i + 1) % pts.length])
  return sum
}

export interface AlongResult {
  point: Pt
  angle: number
  normal: Pt // 单位左法向量
  segmentIndex: number
}

/** 沿折线行走 dist 毫米后的位置与方向 */
export function pointAtPolylineDistance(pts: Pt[], dist: number, closed = false): AlongResult | null {
  if (pts.length < 2) return null
  const total = polylineLength(pts, closed)
  const d = Math.max(0, Math.min(dist, total))
  let acc = 0
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const segLen = Vec2.dist(a, b)
    if (segLen < EPS) continue
    if (acc + segLen + EPS >= d) {
      const t = (d - acc) / segLen
      const dir = new Vec2(b.x - a.x, b.y - a.y).norm()
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: Vec2.angle(dir),
        normal: dir.perp().toPt(),
        segmentIndex: i
      }
    }
    acc += segLen
  }
  const last = closed ? pts[0] : pts[pts.length - 1]
  const prev = pts[pts.length - (closed ? 1 : 2)]
  const dir = new Vec2(last.x - prev.x, last.y - prev.y).norm()
  return { point: { ...last }, angle: Vec2.angle(dir), normal: dir.perp().toPt(), segmentIndex: n - 1 }
}

// ---------------------------------------------------------------------------
// 多边形：鞋带公式
// ---------------------------------------------------------------------------

/** 鞋带公式有向面积（y 向下，顺时针为正） */
export function polygonAreaSigned(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function polygonArea(pts: Pt[]): number {
  return Math.abs(polygonAreaSigned(pts))
}

export function polygonPerimeter(pts: Pt[], closed = true): number {
  return polylineLength(pts, closed)
}

/** 面积加权形心 */
export function polygonCentroid(pts: Pt[]): Pt | null {
  if (pts.length < 3) return null
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    a += f
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  a /= 2
  if (Math.abs(a) < EPS) {
    const avg = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 })
    return { x: avg.x / pts.length, y: avg.y / pts.length }
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const hit = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------------------
// 包围盒
// ---------------------------------------------------------------------------

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export function bboxOf(pts: Pt[], pad = 0): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
}

export function pointInRect(p: Pt, r: BBox): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

// ---------------------------------------------------------------------------
// 吸附 & 正交
// ---------------------------------------------------------------------------

export interface SnapResult {
  point: Pt
  index: number
  ownerId?: string
  dist: number
}

/** 从候选点中找距离最近且在容差内的点（端点吸附） */
export function snapToPoints(p: Pt, candidates: Pt[], tol: number, ownerId?: string): SnapResult | null {
  let best: SnapResult | null = null
  for (let i = 0; i < candidates.length; i++) {
    const d = Vec2.dist(p, candidates[i])
    if (d <= tol && (!best || d < best.dist)) {
      best = { point: { ...candidates[i] }, index: i, ownerId, dist: d }
    }
  }
  return best
}

/**
 * 角度锁定：把 prev->raw 的方向吸附到最近的固定步长方向
 * @param stepDeg 步长角度（90=正交，45=45° 锁定）
 */
export function angleLockPoint(
  prev: Pt,
  raw: Pt,
  enabled: boolean,
  stepDeg = 90,
  thresholdDeg?: number
): Pt {
  if (!enabled) return raw
  const dx = raw.x - prev.x
  const dy = raw.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return raw
  const ang = Math.atan2(dy, dx)
  const step = (stepDeg * Math.PI) / 180
  const nearest = Math.round(ang / step) * step
  // 默认阈值取半步长，接近固定方向时才吸附，中间角度保持自由微调
  const thr = ((thresholdDeg ?? stepDeg / 2) * Math.PI) / 180
  const diff = Math.abs(angleDelta(ang, nearest))
  if (diff <= thr) {
    return { x: prev.x + Math.cos(nearest) * len, y: prev.y + Math.sin(nearest) * len }
  }
  return raw
}

/**
 * 90° 正交锁定：当前方向接近水平/垂直时吸附到对应轴
 */
export function orthoPoint(prev: Pt, raw: Pt, enabled: boolean, thresholdDeg = 18): Pt {
  if (!enabled) return raw
  return angleLockPoint(prev, raw, true, 90, thresholdDeg)
}

/** 角度标注弧（≤180° 的较小弧），返回 SVG arc path 参数与显示角度 */
export function angleArc(
  v: Pt,
  a: Pt,
  b: Pt,
  radius: number
): { p1: Pt; p2: Pt; sweep: 0 | 1; large: 0 | 1; angleDeg: number } | null {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x)
  const a2 = Math.atan2(b.y - v.y, b.x - v.x)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  if (Math.hypot(a.x - v.x, a.y - v.y) < EPS || Math.hypot(b.x - v.x, b.y - v.y) < EPS) return null
  const r = Math.max(50, radius)
  const p1 = { x: v.x + Math.cos(a1) * r, y: v.y + Math.sin(a1) * r }
  const p2 = { x: v.x + Math.cos(a2) * r, y: v.y + Math.sin(a2) * r }
  return {
    p1,
    p2,
    sweep: delta >= 0 ? 1 : 0,
    large: 0,
    angleDeg: Math.abs((delta * 180) / Math.PI)
  }
}

// ---------------------------------------------------------------------------
// 双线墙轮廓：折线两侧 miter 斜接偏移
// ---------------------------------------------------------------------------

function joinTangent(points: Pt[], i: number, closed: boolean): Vec2 {
  const n = points.length
  if (closed) {
    const dIn = new Vec2(
      points[i].x - points[(i - 1 + n) % n].x,
      points[i].y - points[(i - 1 + n) % n].y
    ).norm()
    const dOut = new Vec2(
      points[(i + 1) % n].x - points[i].x,
      points[(i + 1) % n].y - points[i].y
    ).norm()
    return dIn.add(dOut).norm()
  }
  if (i === 0) {
    return new Vec2(points[1].x - points[0].x, points[1].y - points[0].y).norm()
  }
  if (i === n - 1) {
    return new Vec2(points[n - 1].x - points[n - 2].x, points[n - 1].y - points[n - 2].y).norm()
  }
  const dIn = new Vec2(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y).norm()
  const dOut = new Vec2(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y).norm()
  return dIn.add(dOut).norm()
}

/**
 * 返回折线两侧的偏移轮廓点（miter 斜接，夹角过尖时回退为垂直切割）
 */
export function offsetOutline(
  points: Pt[],
  thickness: number,
  closed: boolean
): { left: Pt[]; right: Pt[] } {
  const h = thickness / 2
  const n = points.length
  const left: Pt[] = []
  const right: Pt[] = []
  if (n < 2) return { left: points.map((p) => ({ ...p })), right: points.map((p) => ({ ...p })) }

  for (let i = 0; i < n; i++) {
    const p = points[i]
    const t = joinTangent(points, i, closed)
    const nl = t.perp()
    const isEnd = !closed && (i === 0 || i === n - 1)
    if (isEnd) {
      left.push({ x: p.x + nl.x * h, y: p.y + nl.y * h })
      right.push({ x: p.x - nl.x * h, y: p.y - nl.y * h })
      continue
    }
    // 入射方向与左法线，用于计算 miter 长度
    const prevIdx = closed ? (i - 1 + n) % n : i - 1
    const dIn = new Vec2(p.x - points[prevIdx].x, p.y - points[prevIdx].y).norm()
    const nIn = dIn.perp()
    const dot = nl.dot(nIn)
    const maxMiter = 4
    if (Math.abs(dot) > EPS && Math.abs(1 / dot) <= maxMiter) {
      const l = h / dot
      left.push({ x: p.x + nl.x * l, y: p.y + nl.y * l })
      right.push({ x: p.x - nl.x * l, y: p.y - nl.y * l })
    } else {
      left.push({ x: p.x + nIn.x * h, y: p.y + nIn.y * h })
      right.push({ x: p.x - nIn.x * h, y: p.y - nIn.y * h })
    }
  }
  return { left, right }
}

/** 双线墙轮廓 SVG path */
export function wallOutlinePath(points: Pt[], thickness: number, closed: boolean): string {
  if (points.length < 2) return ''
  const { left, right } = offsetOutline(points, thickness, closed)
  const fmt = (v: number) => Math.round(v * 100) / 100

  if (closed) {
    // 闭合墙：内、外环是两个独立子路径，中间必须抬笔（M），
    // 否则连接对角线段会破坏 evenodd 填充
    let d = `M ${fmt(left[0].x)} ${fmt(left[0].y)}`
    for (let i = 1; i < left.length; i++) d += ` L ${fmt(left[i].x)} ${fmt(left[i].y)}`
    d += ' Z'
    d += ` M ${fmt(right[right.length - 1].x)} ${fmt(right[right.length - 1].y)}`
    for (let i = right.length - 2; i >= 0; i--) d += ` L ${fmt(right[i].x)} ${fmt(right[i].y)}`
    d += ' Z'
    return d
  }

  // 开口墙：单条连续路径（左线 -> 端帽 -> 右线返回 -> 端帽）
  let d = `M ${fmt(left[0].x)} ${fmt(left[0].y)}`
  for (let i = 1; i < left.length; i++) d += ` L ${fmt(left[i].x)} ${fmt(left[i].y)}`
  for (let i = right.length - 1; i >= 0; i--) d += ` L ${fmt(right[i].x)} ${fmt(right[i].y)}`
  d += ' Z'
  return d
}

/** 折线中心线 path */
export function polylinePath(points: Pt[], closed = false): string {
  if (points.length < 2) return ''
  const fmt = (v: number) => Math.round(v * 100) / 100
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`
  for (let i = 1; i < points.length; i++) d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`
  if (closed) d += ' Z'
  return d
}

/** 角度归一化到 [0, 2π) */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2
  return ((a % twoPi) + twoPi) % twoPi
}

/** 角度差（最短方向），返回 [-π, π] */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 世界坐标 -> 局部坐标（用于旋转家具拖拽） */
export function worldToLocal(p: Pt, center: Pt, rotationRad: number): Pt {
  const c = Math.cos(-rotationRad)
  const s = Math.sin(-rotationRad)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}
