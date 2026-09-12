<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useEditor } from '@/store/useEditor'
import { useViewport } from '@/composables/useViewport'
import {
  Vec2,
  bboxOf,
  angleLockPoint,
  pointInRect,
  pointSegmentDist,
  pointPolylineDist,
  angleArc,
  type Pt
} from '@/lib/geometry'
import { snapPoint, type SnapHit } from '@/lib/snapping'
import { anchorFromSnap } from '@/lib/dimensionSync'
import { hasClipboard } from '@/lib/clipboard'
import { hitTest, boxSelect, type HitResult } from '@/lib/hit'
import { clampOffset, openingPlacement, projectPointToWall } from '@/lib/openings'
import { wallOutlinePath } from '@/lib/geometry'
import { uid } from '@/lib/uid'
import { formatLength } from '@/lib/format'
import GridLayer from './GridLayer.vue'
import Rulers from './Rulers.vue'
import WorldElement from '@/components/svg/WorldElement.vue'
import RoomFaceShape from '@/components/svg/RoomFace.vue'
import OpeningsMask from '@/components/svg/OpeningsMask.vue'
import type {
  DimensionElement,
  DoorElement,
  FurnitureElement,
  WallElement,
  WindowElement
} from '@/types'

const editor = useEditor()
const { state, rawState } = editor
const { screenToWorld, zoomAt, worldToScreen, zoomByFactor, fitWorld } = useViewport()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const viewW = ref(window.innerWidth)
const viewH = ref(window.innerHeight)
const hover = ref<HitResult | null>(null)
const marquee = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const dimensionHover = ref<{ p1: Pt; p2: Pt } | null>(null)
const angleDimHover = ref<{ vertex: Pt; r1: Pt; r2: Pt } | null>(null)

/** 标记本次指针拖拽是否已提交历史快照（拖拽开始入栈一次） */
let dragHistPushed = false
/** Shift 是否临时禁用角度锁定（自由角度微调）；ref 以便画墙角度标签响应 */
const freeAngle = ref(false)
function beginDragMutation() {
  if (!dragHistPushed) {
    editor.pushHistory()
    dragHistPushed = true
  }
}

const scale = computed(() => state.viewport.scale)
const rulerSize = computed(() => state.rulerSize)
const showRulers = computed(() => state.doc.settings.showRulers)

// 统一内容 transform（标尺边距作为额外平移）
const contentTransform = computed(
  () =>
    `translate(${state.viewport.tx + (showRulers.value ? rulerSize.value : 0)} ${
      state.viewport.ty + (showRulers.value ? rulerSize.value : 0)
    }) scale(${state.viewport.scale})`
)

const contentTx = computed(() => rawState.viewport.tx + (showRulers.value ? rulerSize.value : 0))
const contentTy = computed(() => rawState.viewport.ty + (showRulers.value ? rulerSize.value : 0))

const walls = computed(() => state.doc.elements.filter((e): e is WallElement => e.kind === 'wall'))
const doors = computed(() => state.doc.elements.filter((e): e is DoorElement => e.kind === 'door'))
const windows = computed(() => state.doc.elements.filter((e): e is WindowElement => e.kind === 'window'))
const dims = computed(() => state.doc.elements.filter((e): e is DimensionElement => e.kind === 'dimension'))
const furniture = computed(() => state.doc.elements.filter((e): e is FurnitureElement => e.kind === 'furniture'))

const wallMap = computed(() => new Map(walls.value.map((w) => [w.id, w])))

/** 渲染顺序即文档数组顺序（层级调整据此生效，跨类型也成立） */
const orderedElements = computed(() => state.doc.elements)

// ---------------------------------------------------------------------------
// 指针交互状态机
// ---------------------------------------------------------------------------
type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number }
  | {
      kind: 'move'
      ids: string[]
      startWorld: Pt
      origins: { id: string; x: number; y: number; points?: Pt[]; p1?: Pt; p2?: Pt; vertex?: Pt }[]
    }
  | { kind: 'wall-vertex'; wallId: string; index: number; startWorld: Pt }
  | { kind: 'wall-body'; wallId: string; startWorld: Pt; points: Pt[] }
  | { kind: 'opening'; id: string; startOffset: number; startWorld: Pt }
  | {
      kind: 'dim-handle'
      id: string
      handle: 'start' | 'end' | 'offset' | 'vertex' | 'ray1' | 'ray2' | 'arc'
      startWorld: Pt
    }
  | { kind: 'fur-rotate'; id: string; cx: number; cy: number; free: boolean }
  | { kind: 'fur-scale'; id: string; startWorld: Pt; w: number; h: number }
  | { kind: 'marquee'; x0: number; y0: number; additive: boolean }
  | { kind: 'measure-first'; p: Pt }

const drag = reactive<{ current: DragState }>({ current: { kind: 'none' } })

let spaceDown = false

// 切换工具时重置各工具的局部草稿
watch(
  () => state.mode,
  () => {
    dimFirst.value = null
    dimensionHover.value = null
    resetAngleDim()
    angleDimHover.value = null
    measureFirst.value = null
    rawState.snapMarker = null
    freeAngle.value = false
  }
)

function getRect(): DOMRect {
  return containerRef.value!.getBoundingClientRect()
}

function toWorld(e: PointerEvent | WheelEvent): Pt {
  return screenToWorld(e.clientX, e.clientY, getRect())
}

function snapTolMm(): number {
  return state.doc.settings.snapTol / state.viewport.scale
}

/** 统一吸附：端点 / 中点 / 交点（可在全局设置中分别开关） */
function applySnap(p: Pt, excludeWallId?: string): { point: Pt; snapped: boolean; hit: SnapHit | null } {
  const s = state.doc.settings
  if (!s.snapEnabled) return { point: p, snapped: false, hit: null }
  const hit = snapPoint(p, walls.value, {
    tolMm: snapTolMm(),
    endpoint: s.snapEndpoint,
    midpoint: s.snapMidpoint,
    intersection: s.snapIntersection,
    excludeWallId
  })
  if (hit) return { point: { ...hit.point }, snapped: true, hit }
  return { point: p, snapped: false, hit: null }
}

function setSnapMarker(hit: SnapHit | null) {
  rawState.snapMarker = hit ? { ...hit.point, kind: hit.kind } : null
}

/** 画墙角度锁定：45° 锁定优先，其次 90° 正交；Shift 临时放开自由微调 */
function applyAngleLock(prev: Pt, raw: Pt, shift: boolean): Pt {
  if (shift) return raw
  const s = state.doc.settings
  if (s.angleLock45) return angleLockPoint(prev, raw, true, 45, 15)
  if (s.ortho) return angleLockPoint(prev, raw, true, 90, 18)
  return raw
}

// ---------------------------------------------------------------------------
// 滚轮缩放 / 平移
// ---------------------------------------------------------------------------
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = getRect()
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const ruler = state.doc.settings.showRulers ? rulerSize.value : 0
  // 内容在屏幕上的位置 = tx + rulerSize，zoomAt 操作的是 tx/ty，
  // 因此锚点要扣除标尺边距，缩放中心才会跟随光标。
  const sx = e.clientX - rect.left - ruler
  const sy = e.clientY - rect.top - ruler
  zoomAt(sx, sy, factor)
}

// ---------------------------------------------------------------------------
// 指针按下
// ---------------------------------------------------------------------------
function onPointerDown(e: PointerEvent) {
  dragHistPushed = false
  if (e.button === 1 || (e.button === 0 && spaceDown) || state.mode === 'pan') {
    containerRef.value?.setPointerCapture?.(e.pointerId)
    drag.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      tx: rawState.viewport.tx,
      ty: rawState.viewport.ty
    }
    return
  }
  if (e.button !== 0) return
  const w = toWorld(e)
  freeAngle.value = e.shiftKey
  containerRef.value?.setPointerCapture?.(e.pointerId)

  switch (state.mode) {
    case 'select':
      handleSelectDown(e, w)
      break
    case 'wall':
      handleWallClick(e, w)
      break
    case 'door':
    case 'window':
      placeOpening(e, w, state.mode)
      break
    case 'dimension':
      handleDimensionClick(w)
      break
    case 'angle-dim':
      handleAngleDimClick(w)
      break
    case 'measure':
      handleMeasureClick(w)
      break
  }
}

// ---------------------------------------------------------------------------
// 选择模式按下：命中检测 / 框选 / 各类拖拽
// ---------------------------------------------------------------------------
function handleSelectDown(e: PointerEvent, w: Pt) {
  const hit = hitTest(state.doc.elements, w, snapTolMm())
  hover.value = hit

  if (!hit) {
    if (!e.shiftKey) editor.selectOnly([])
    drag.current = { kind: 'marquee', x0: w.x, y0: w.y, additive: e.shiftKey }
    marquee.value = { x0: w.x, y0: w.y, x1: w.x, y1: w.y }
    containerRef.value?.setPointerCapture?.(e.pointerId)
    return
  }

  // 选中处理
  const isSel = state.selection.has(hit.id)
  if (e.shiftKey) {
    editor.toggleSelect(hit.id)
  } else if (!isSel) {
    editor.selectOnly([hit.id])
  }

  containerRef.value?.setPointerCapture?.(e.pointerId)
  const el = editor.getElement(hit.id)
  if (!el) return

  // 墙端点手柄：优先检查
  if (el.kind === 'wall') {
    const vIdx = el.points.findIndex((p) => Vec2.dist(p, w) <= snapTolMm())
    if (vIdx >= 0) {
        drag.current = { kind: 'wall-vertex', wallId: el.id, index: vIdx, startWorld: w }
      return
    }
  }
  if (el.kind === 'dimension') {
    if (hit.kind === 'dim-handle' && hit.handle) {
      drag.current = {
        kind: 'dim-handle',
        id: el.id,
        handle: hit.handle as 'start' | 'end' | 'offset' | 'vertex' | 'ray1' | 'ray2' | 'arc',
        startWorld: w
      }
      return
    }
  }
  if (el.kind === 'furniture') {
    // 旋转手柄（屏幕距离判定）
    const rotHandle = furnitureRotHandle(el)
    if (rotHandle && Vec2.dist(rotHandle, w) <= snapTolMm() * 1.2) {
        drag.current = { kind: 'fur-rotate', id: el.id, cx: el.x, cy: el.y, free: e.shiftKey }
      return
    }
    const scHandle = furnitureScaleHandle(el)
    if (scHandle && Vec2.dist(scHandle, w) <= snapTolMm() * 1.2) {
        drag.current = { kind: 'fur-scale', id: el.id, startWorld: w, w: el.width, h: el.height }
      return
    }
  }
  if (el.kind === 'door' || el.kind === 'window') {
    drag.current = { kind: 'opening', id: el.id, startOffset: el.offset, startWorld: w }
    return
  }

  // 整体移动（墙、家具、标注）
  beginDragMutation()
  const ids = state.selection.has(el.id) ? [...state.selection] : [el.id]
  const origins = ids
    .map((id) => editor.getElement(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => {
      if (x.kind === 'wall') {
        return { id: x.id, x: 0, y: 0, points: x.points.map((p) => ({ ...p })) }
      }
      if (x.kind === 'furniture') {
        return { id: x.id, x: x.x, y: x.y }
      }
      if (x.kind === 'dimension') {
        if (x.dimType === 'angle') {
          return { id: x.id, x: 0, y: 0, vertex: x.vertex ? { ...x.vertex } : undefined, p1: x.ray1 ? { ...x.ray1 } : undefined, p2: x.ray2 ? { ...x.ray2 } : undefined }
        }
        // 保存两个端点的绝对起始位置，拖动时整体平移
        return { id: x.id, x: 0, y: 0, p1: { ...x.p1 }, p2: { ...x.p2 } }
      }
      return { id: x.id, x: 0, y: 0 }
    })
  drag.current = { kind: 'move', ids, startWorld: w, origins }
}

function furnitureRotHandle(f: FurnitureElement): Pt | null {
  // 与 FurnitureShape 中手柄位置一致（未旋转世界坐标）
  const lx = 0
  const ly = -f.height / 2 - 26 / state.viewport.scale
  const c = Math.cos(f.rotation)
  const s = Math.sin(f.rotation)
  return { x: lx * c - ly * s + f.x, y: lx * s + ly * c + f.y }
}
function furnitureScaleHandle(f: FurnitureElement): Pt | null {
  const lx = f.width / 2 + 6 / state.viewport.scale
  const ly = f.height / 2 + 6 / state.viewport.scale
  const c = Math.cos(f.rotation)
  const s = Math.sin(f.rotation)
  return { x: lx * c - ly * s + f.x, y: lx * s + ly * c + f.y }
}

// ---------------------------------------------------------------------------
// 画墙
// ---------------------------------------------------------------------------
function handleWallClick(e: PointerEvent, wRaw: Pt) {
  const draft = rawState.wallDraft
  let w = wRaw
  if (draft.length > 0) {
    const prev = draft[draft.length - 1]
    w = applyAngleLock(prev, w, e.shiftKey)
    const s = applySnap(w)
    w = s.point
    setSnapMarker(s.hit)

    // 点击到起点 => 闭合
    if (draft.length >= 3 && Vec2.dist(w, draft[0]) <= snapTolMm()) {
      finishWall(true)
      return
    }
  } else {
    const s = applySnap(w)
    w = s.point
    setSnapMarker(s.hit)
  }
  // 避免重复点
  if (draft.length === 0 || Vec2.dist(draft[draft.length - 1], w) > 1) {
    draft.push({ ...w })
  }
}

function updateWallHover(e: PointerEvent, wRaw: Pt) {
  const draft = rawState.wallDraft
  freeAngle.value = e.shiftKey
  if (draft.length === 0) {
    const s = applySnap(wRaw)
    setSnapMarker(s.hit)
    wallCursor.value = s.point
    return
  }
  const prev = draft[draft.length - 1]
  let w = applyAngleLock(prev, wRaw, e.shiftKey)
  const s = applySnap(w)
  w = s.point
  setSnapMarker(s.hit)
  wallCursor.value = w

  // 靠近起点时提示闭合
  if (draft.length >= 3 && Vec2.dist(w, draft[0]) <= snapTolMm()) {
    rawState.snapMarker = { ...draft[0], kind: 'endpoint' }
  }
}

function finishWall(closed: boolean) {
  const pts = rawState.wallDraft
  if (pts.length >= 2) {
    const wall = editor.makeWall(pts, closed)
    editor.addElement(wall)
    editor.selectOnly([wall.id])
    // 自动裁剪：伸入已有墙体的端头段
    if (state.doc.settings.autoTrim) {
      editor.trimIntersectingWalls()
    }
  }
  rawState.wallDraft = []
  wallCursor.value = null
  rawState.snapMarker = null
}

// ---------------------------------------------------------------------------
// 门窗放置
// ---------------------------------------------------------------------------
function placeOpening(e: PointerEvent, w: Pt, kind: 'door' | 'window') {
  // 找最近的墙
  let bestWall: WallElement | null = null
  let best: ReturnType<typeof projectPointToWall> = null
  for (const wall of walls.value) {
    const rr = projectPointToWall(w, wall)
    if (rr && (!best || rr.dist < best.dist)) {
      best = rr
      bestWall = wall
    }
  }
  if (!bestWall || !best) return
  const width = kind === 'door' ? 800 : 1200
  const offset = clampOffset(bestWall, best.offset - width / 2, width)
  const id = uid(kind)
  if (kind === 'door') {
    const el: DoorElement = {
      id,
      kind: 'door',
      wallId: bestWall.id,
      offset,
      width,
      hinge: 'start',
      swingSide: 1,
      color: state.doc.settings.wallColor
    }
    editor.addElement(el)
    editor.selectOnly([id])
  } else {
    const el: WindowElement = {
      id,
      kind: 'window',
      wallId: bestWall.id,
      offset,
      width,
      color: '#303133'
    }
    editor.addElement(el)
    editor.selectOnly([id])
  }
  editor.setMode('select')
}

// ---------------------------------------------------------------------------
// 线性标注
// ---------------------------------------------------------------------------
const dimFirst = ref<Pt | null>(null)
const dimFirstSnap = ref<{ kind: SnapHit['kind'] | null; ownerId?: string }>({ kind: null })

function handleDimensionClick(w: Pt) {
  const s = applySnap(w)
  w = s.point
  if (!dimFirst.value) {
    dimFirst.value = { ...w }
    dimFirstSnap.value = { kind: s.hit?.kind ?? null, ownerId: s.hit?.ownerId }
  } else {
    const p1 = dimFirst.value
    const p2 = { ...w }
    if (Vec2.dist(p1, p2) > 10) {
      const dim = editor.makeDimension(p1, p2, 400)
      dim.ref1 = anchorFromSnap(p1, dimFirstSnap.value.kind, dimFirstSnap.value.ownerId, walls.value, snapTolMm())
      dim.ref2 = anchorFromSnap(p2, s.hit?.kind ?? null, s.hit?.ownerId, walls.value, snapTolMm())
      editor.addElement(dim)
    }
    dimFirst.value = null
    dimensionHover.value = null
    editor.setMode('select')
  }
}

// ---------------------------------------------------------------------------
// 角度标注：顶点 -> 射线1 -> 射线2
// ---------------------------------------------------------------------------
const angStep = ref<0 | 1 | 2>(0)
const angVertex = ref<Pt | null>(null)
const angR1 = ref<Pt | null>(null)
const angSnapV = ref<{ kind: SnapHit['kind'] | null; ownerId?: string }>({ kind: null })
const angSnap1 = ref<{ kind: SnapHit['kind'] | null; ownerId?: string }>({ kind: null })

function resetAngleDim() {
  angStep.value = 0
  angVertex.value = null
  angR1.value = null
}

function handleAngleDimClick(w: Pt) {
  const s = applySnap(w)
  w = s.point
  if (angStep.value === 0) {
    angVertex.value = { ...w }
    angSnapV.value = { kind: s.hit?.kind ?? null, ownerId: s.hit?.ownerId }
    angStep.value = 1
  } else if (angStep.value === 1) {
    if (Vec2.dist(angVertex.value!, w) <= 10) return
    angR1.value = { ...w }
    angSnap1.value = { kind: s.hit?.kind ?? null, ownerId: s.hit?.ownerId }
    angStep.value = 2
  } else {
    if (Vec2.dist(angVertex.value!, w) <= 10) return
    const dim = editor.makeAngleDimension(angVertex.value!, angR1.value!, w, 500)
    dim.refV = anchorFromSnap(dim.vertex!, angSnapV.value.kind, angSnapV.value.ownerId, walls.value, snapTolMm())
    dim.ref1 = anchorFromSnap(dim.ray1!, angSnap1.value.kind, angSnap1.value.ownerId, walls.value, snapTolMm())
    dim.ref2 = anchorFromSnap(w, s.hit?.kind ?? null, s.hit?.ownerId, walls.value, snapTolMm())
    editor.addElement(dim)
    resetAngleDim()
    angleDimHover.value = null
    editor.setMode('select')
  }
}

// ---------------------------------------------------------------------------
// 临时测距
// ---------------------------------------------------------------------------
const measureFirst = ref<Pt | null>(null)

function handleMeasureClick(w: Pt) {
  if (!measureFirst.value) {
    measureFirst.value = { ...w }
    rawState.measure = { p1: { ...w }, p2: { ...w } }
  } else {
    measureFirst.value = null
    // 保留结果直到下一次点击/Esc
  }
}

// ---------------------------------------------------------------------------
// 移动
// ---------------------------------------------------------------------------
function onPointerMove(e: PointerEvent) {
  const w = toWorld(e)
  rawState.cursorWorld = w

  const d = drag.current

  if (d.kind === 'pan') {
    rawState.viewport.tx = d.tx + (e.clientX - d.startX)
    rawState.viewport.ty = d.ty + (e.clientY - d.startY)
    return
  }

  if (state.mode === 'wall') {
    updateWallHover(e, w)
    return
  }

  if (state.mode === 'dimension' && dimFirst.value) {
    const s = applySnap(w)
    dimensionHover.value = { p1: { ...dimFirst.value }, p2: { ...s.point } }
    setSnapMarker(s.hit)
    return
  }
  if (state.mode === 'angle-dim') {
    const s = applySnap(w)
    setSnapMarker(s.hit)
    if (angStep.value === 1 && angVertex.value) {
      angleDimHover.value = { vertex: { ...angVertex.value }, r1: { ...s.point }, r2: { ...s.point } }
    } else if (angStep.value === 2 && angVertex.value && angR1.value) {
      angleDimHover.value = { vertex: { ...angVertex.value }, r1: { ...angR1.value }, r2: { ...s.point } }
    }
    return
  }
  if (state.mode === 'measure') {
    if (measureFirst.value) {
      rawState.measure = { p1: { ...measureFirst.value }, p2: { ...w } }
    }
    return
  }

  switch (d.kind) {
    case 'marquee':
      marquee.value = { x0: d.x0, y0: d.y0, x1: w.x, y1: w.y }
      break
    case 'move':
      doMove(w, d)
      break
    case 'wall-vertex':
      doWallVertex(e, w, d)
      break
    case 'wall-body':
      // 预留：拖动整段墙（多端点整体平移）
      break
    case 'opening':
      doOpeningMove(w, d)
      break
    case 'dim-handle':
      doDimHandle(w, d)
      break
    case 'fur-rotate':
      doFurRotate(e, w, d)
      break
    case 'fur-scale':
      doFurScale(e, w, d)
      break
  }

  if (state.mode === 'select' && d.kind === 'none') {
    hover.value = hitTest(state.doc.elements, w, snapTolMm())
  }
}

function doMove(w: Pt, d: Extract<DragState, { kind: 'move' }>) {
  beginDragMutation()
  const dx = w.x - d.startWorld.x
  const dy = w.y - d.startWorld.y
  for (const o of d.origins) {
    const el = editor.getElement(o.id)
    if (!el) continue
    if (el.kind === 'wall' && o.points) {
      el.points = o.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    } else if (el.kind === 'furniture') {
      el.x = o.x + dx
      el.y = o.y + dy
    } else if (el.kind === 'dimension') {
      if (el.dimType === 'angle' && o.vertex && o.p1 && o.p2) {
        el.vertex = { x: o.vertex.x + dx, y: o.vertex.y + dy }
        el.ray1 = { x: o.p1.x + dx, y: o.p1.y + dy }
        el.ray2 = { x: o.p2.x + dx, y: o.p2.y + dy }
        el.p1 = { ...el.ray1 }
        el.p2 = { ...el.ray2 }
        // 手动平移后解除墙关联
        el.refV = { kind: 'free' }
        el.ref1 = { kind: 'free' }
        el.ref2 = { kind: 'free' }
      } else if (o.p1 && o.p2) {
        // 从起始绝对位置整体平移，避免每帧增量叠加
        el.p1 = { x: o.p1.x + dx, y: o.p1.y + dy }
        el.p2 = { x: o.p2.x + dx, y: o.p2.y + dy }
        el.ref1 = { kind: 'free' }
        el.ref2 = { kind: 'free' }
      }
    }
  }
}

function doWallVertex(e: PointerEvent, w: Pt, d: Extract<DragState, { kind: 'wall-vertex' }>) {
  beginDragMutation()
  const wall = wallMap.value.get(d.wallId)
  if (!wall) return
  const s = applySnap(w, wall.id)
  let p = s.point
  setSnapMarker(s.hit)
  p = orthoVertex(e, wall, d.index, p)
  wall.points[d.index] = { ...p }
  // 顶点被拖动：依附该顶点的标注引用会由 watcher 自动更新；
  // 顶点本身的“新位置吸附到别的墙顶点”不重绑定，保持引用本墙顶点即可。
}

/** 拖动墙端点时，按 Shift/全局角度开关将相邻段锁定到固定方向 */
function orthoVertex(e: PointerEvent, wall: WallElement, index: number, p: Pt): Pt {
  if (e.shiftKey) return p
  const s = state.doc.settings
  const stepDeg = s.angleLock45 ? 45 : s.ortho ? 90 : 0
  if (!stepDeg) return p
  const prev = wall.points[index - 1]
  const next = wall.points[index + 1]
  if (prev && next) return p // 中间点不做锁定
  const ref = prev ?? next
  if (!ref) return p
  // 90° 模式保持原有水平/垂直强约束；45° 模式用角度吸附（阈值半步长）
  if (stepDeg === 90) {
    const dx = p.x - ref.x
    const dy = p.y - ref.y
    if (Math.abs(dx) > Math.abs(dy)) return { x: p.x, y: ref.y }
    return { x: ref.x, y: p.y }
  }
  return angleLockPoint(ref, p, true, 45, 15)
}

function doOpeningMove(w: Pt, d: Extract<DragState, { kind: 'opening' }>) {
  beginDragMutation()
  const el = editor.getElement(d.id)
  if (!el || (el.kind !== 'door' && el.kind !== 'window')) return
  const wall = wallMap.value.get(el.wallId)
  if (!wall) return
  const proj = projectPointToWall(w, wall)
  if (!proj) return
  el.offset = clampOffset(wall, proj.offset - el.width / 2, el.width)
}

function doDimHandle(w: Pt, d: Extract<DragState, { kind: 'dim-handle' }>) {
  beginDragMutation()
  const el = editor.getElement(d.id) as DimensionElement | undefined
  if (!el) return

  if (el.dimType === 'angle' && el.vertex && el.ray1 && el.ray2) {
    const setAnglePoint = (which: 'vertex' | 'ray1' | 'ray2', p: Pt, snap: ReturnType<typeof applySnap>) => {
      const np = { ...snap.point }
      if (which === 'vertex') {
        el.vertex = np
        el.refV = anchorFromSnap(np, snap.hit?.kind ?? null, snap.hit?.ownerId, walls.value, snapTolMm())
      } else if (which === 'ray1') {
        el.ray1 = np
        el.p1 = { ...np }
        el.ref1 = anchorFromSnap(np, snap.hit?.kind ?? null, snap.hit?.ownerId, walls.value, snapTolMm())
      } else {
        el.ray2 = np
        el.p2 = { ...np }
        el.ref2 = anchorFromSnap(np, snap.hit?.kind ?? null, snap.hit?.ownerId, walls.value, snapTolMm())
      }
    }
    if (d.handle === 'vertex' || d.handle === 'ray1' || d.handle === 'ray2') {
      const snap = applySnap(w)
      setSnapMarker(snap.hit)
      setAnglePoint(d.handle, w, snap)
    } else if (d.handle === 'arc') {
      // 拖弧中点调整半径
      el.radius = Math.max(150, Vec2.dist(el.vertex, w))
    }
    return
  }

  const s = applySnap(w)
  w = s.point
  setSnapMarker(s.hit)
  if (d.handle === 'start') {
    el.p1 = { ...w }
    el.ref1 = anchorFromSnap(w, s.hit?.kind ?? null, s.hit?.ownerId, walls.value, snapTolMm())
  } else if (d.handle === 'end') {
    el.p2 = { ...w }
    el.ref2 = anchorFromSnap(w, s.hit?.kind ?? null, s.hit?.ownerId, walls.value, snapTolMm())
  } else {
    // 拖动标注线改变偏移：以被测线中点到指针的法向投影
    const dx = el.p2.x - el.p1.x
    const dy = el.p2.y - el.p1.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const mid = { x: (el.p1.x + el.p2.x) / 2, y: (el.p1.y + el.p2.y) / 2 }
    el.offsetDistance = (w.x - mid.x) * nx + (w.y - mid.y) * ny
  }
}

function doFurRotate(e: PointerEvent, w: Pt, d: Extract<DragState, { kind: 'fur-rotate' }>) {
  beginDragMutation()
  const el = editor.getElement(d.id) as FurnitureElement | undefined
  if (!el) return
  const ang = Math.atan2(w.y - d.cy, w.x - d.cx)
  // 默认吸附 15°；Shift 或拖拽起始即为自由模式时不吸附（自由角度微调）
  const free = d.free || e.shiftKey
  if (free) {
    el.rotation = ang
  } else {
    const step = Math.PI / 12
    el.rotation = Math.round(ang / step) * step
  }
}

function doFurScale(
  e: PointerEvent,
  w: Pt,
  d: Extract<DragState, { kind: 'fur-scale' }>
) {
  beginDragMutation()
  const el = editor.getElement(d.id) as FurnitureElement | undefined
  if (!el) return
  // 将鼠标位置变换到家具局部坐标
  const c = Math.cos(-el.rotation)
  const s = Math.sin(-el.rotation)
  const lx = (w.x - el.x) * c - (w.y - el.y) * s
  void e
  let nw = Math.max(200, Math.abs(lx) * 2)
  let nh = d.h
  if (e.shiftKey) {
    // 等比
    nh = d.h * (nw / d.w)
  } else {
    const ly = (w.x - el.x) * s + (w.y - el.y) * c
    nh = Math.max(200, Math.abs(ly) * 2)
  }
  el.width = nw
  el.height = nh
}

// ---------------------------------------------------------------------------
// 抬起
// ---------------------------------------------------------------------------
function onPointerUp(e: PointerEvent) {
  containerRef.value?.releasePointerCapture?.(e.pointerId)
  const d = drag.current

  if (d.kind === 'marquee' && marquee.value) {
    const m = marquee.value
    const rect = bboxOf([
      { x: m.x0, y: m.y0 },
      { x: m.x1, y: m.y1 }
    ])
    if (rect.width > 2 || rect.height > 2) {
      const ids = boxSelect(state.doc.elements, rect, walls.value)
      if (d.additive) {
        // Shift 框选：与现有选中取并集（支持跨多次框选累积批量选中）
        for (const id of ids) state.selection.add(id)
      } else {
        editor.selectOnly(ids)
      }
    }
    marquee.value = null
  }

  // 非绘制拖拽结束后清除吸附标记
  if (state.mode === 'select') rawState.snapMarker = null
  drag.current = { kind: 'none' }
  void e
}

// ---------------------------------------------------------------------------
// 双击 / 右键 / 键盘
// ---------------------------------------------------------------------------
function onDoubleClick(e: MouseEvent) {
  if (state.mode === 'wall') {
    finishWall(false)
  }
  void e
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (state.mode === 'wall') {
    finishWall(false)
  } else if (state.mode === 'measure') {
    measureFirst.value = null
  }
}

function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  if (e.code === 'Space') {
    spaceDown = true
    e.preventDefault()
    return
  }
  if (e.key === 'Escape') {
    rawState.wallDraft = []
    wallCursor.value = null
    dimFirst.value = null
    resetAngleDim()
    measureFirst.value = null
    rawState.measure = null
    rawState.snapMarker = null
    dimensionHover.value = null
    angleDimHover.value = null
    if (state.mode !== 'select') editor.setMode('select')
    return
  }
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && (key === 'c' || key === 'x') && !e.altKey) {
    if (state.selection.size > 0) {
      e.preventDefault()
      editor.copySelected(key === 'x')
    }
    return
  }
  if (mod && key === 'v' && !e.altKey) {
    if (hasClipboard()) {
      e.preventDefault()
      editor.pasteAt()
    }
    return
  }
  if (mod && key === 'd') {
    e.preventDefault()
    editor.duplicateSelected()
    return
  }
  if (mod && key === ']') {
    e.preventDefault()
    editor.reorderSelected(e.shiftKey ? 'front' : 'up')
    return
  }
  if (mod && key === '[') {
    e.preventDefault()
    editor.reorderSelected(e.shiftKey ? 'back' : 'down')
    return
  }
  if (mod && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) editor.redo()
    else editor.undo()
    return
  }
  if (mod && key === 'y') {
    e.preventDefault()
    editor.redo()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selection.size > 0) {
      e.preventDefault()
      editor.removeElements([...state.selection])
    }
    return
  }
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    editor.selectOnly(state.doc.elements.map((x) => x.id))
    return
  }
  // 方向键微移 50mm
  const step = e.shiftKey ? 250 : 50
  let dx = 0
  let dy = 0
  if (e.key === 'ArrowLeft') dx = -step
  else if (e.key === 'ArrowRight') dx = step
  else if (e.key === 'ArrowUp') dy = -step
  else if (e.key === 'ArrowDown') dy = step
  if (dx || dy) {
    e.preventDefault()
    editor.pushHistory()
    for (const id of state.selection) {
      const el = editor.getElement(id)
      if (!el) continue
      if (el.kind === 'wall') el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      else if (el.kind === 'furniture') {
        el.x += dx
        el.y += dy
      } else if (el.kind === 'dimension') {
        if (el.dimType === 'angle' && el.vertex && el.ray1 && el.ray2) {
          el.vertex = { x: el.vertex.x + dx, y: el.vertex.y + dy }
          el.ray1 = { x: el.ray1.x + dx, y: el.ray1.y + dy }
          el.ray2 = { x: el.ray2.x + dx, y: el.ray2.y + dy }
          el.p1 = { ...el.ray1 }
          el.p2 = { ...el.ray2 }
          el.refV = el.ref1 = el.ref2 = { kind: 'free' }
        } else {
          el.p1 = { x: el.p1.x + dx, y: el.p1.y + dy }
          el.p2 = { x: el.p2.x + dx, y: el.p2.y + dy }
          el.ref1 = el.ref2 = { kind: 'free' }
        }
      }
    }
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown = false
  if (e.key === 'Shift') freeAngle.value = false
}

// ---------------------------------------------------------------------------
// 悬停草稿（画墙预览线）
// ---------------------------------------------------------------------------
const wallCursor = ref<Pt | null>(null)
const draftWall = computed(() => {
  const pts = state.wallDraft
  if (pts.length === 0) return null
  const all = [...pts]
  if (wallCursor.value) all.push(wallCursor.value)
  if (all.length < 2) return null
  return {
    center: wallOutlinePath(all, state.doc.settings.wallThickness, false),
    line: all.map((p) => `${p.x},${p.y}`).join(' ')
  }
})

/** 画墙当前段的实时角度/长度（自由微调时可见角度变化） */
const draftSegInfo = computed(() => {
  const pts = state.wallDraft
  if (!pts.length || !wallCursor.value) return null
  const a = pts[pts.length - 1]
  const b = wallCursor.value
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1) return null
  const isFree = freeAngle.value
  // 与 applyAngleLock 相同的锁定结果，用于判断当前段是否被锁定
  const lockedPt = applyAngleLock(a, b, isFree)
  let lockedDeg = (Math.atan2(lockedPt.y - a.y, lockedPt.x - a.x) * 180) / Math.PI
  lockedDeg = ((lockedDeg % 180) + 180) % 180
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  deg = ((deg % 180) + 180) % 180
  const isLocked = !isFree && Math.abs(deg - lockedDeg) < 0.01
  return {
    len,
    deg,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    locked: isLocked
  }
})

const measureInfo = computed(() => {
  const m = state.measure
  if (!m) return null
  const dx = m.p2.x - m.p1.x
  const dy = m.p2.y - m.p1.y
  const dist = Math.hypot(dx, dy)
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  return {
    dist,
    angle: ((ang % 180) + 180) % 180,
    mid: { x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 }
  }
})

const dimPreview = computed(() => {
  if (!dimensionHover.value) return null
  const { p1, p2 } = dimensionHover.value
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const q1 = { x: p1.x + nx * 400, y: p1.y + ny * 400 }
  const q2 = { x: p2.x + nx * 400, y: p2.y + ny * 400 }
  return { p1, p2, q1, q2, len }
})

const angleDimPreview = computed(() => {
  const h = angleDimHover.value
  if (!h) return null
  const r = 500
  const arc = angleArc(h.vertex, h.r1, h.r2, r)
  if (!arc) return null
  const a1 = Math.atan2(h.r1.y - h.vertex.y, h.r1.x - h.vertex.x)
  let delta = Math.atan2(h.r2.y - h.vertex.y, h.r2.x - h.vertex.x) - a1
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const midAng = a1 + delta / 2
  const path = `M ${arc.p1.x} ${arc.p1.y} A ${r} ${r} 0 0 ${arc.sweep} ${arc.p2.x} ${arc.p2.y}`
  return {
    vertex: h.vertex,
    r1: h.r1,
    r2: h.r2,
    path,
    angleDeg: arc.angleDeg,
    labelPos: {
      x: h.vertex.x + Math.cos(midAng) * (r + 220),
      y: h.vertex.y + Math.sin(midAng) * (r + 220)
    }
  }
})

// ---------------------------------------------------------------------------
// 对外：缩放按钮、适配视图、导出钩子
// ---------------------------------------------------------------------------
function zoomIn() {
  zoomByFactor(1.2, { x: viewW.value / 2, y: viewH.value / 2 })
}
function zoomOut() {
  zoomByFactor(1 / 1.2, { x: viewW.value / 2, y: viewH.value / 2 })
}
function zoomReset() {
  rawState.viewport.scale = 0.28
  rawState.viewport.tx = 460
  rawState.viewport.ty = 360
}
function fitAll() {
  if (state.doc.elements.length === 0) return
  const pts: Pt[] = []
  for (const el of state.doc.elements) {
    if (el.kind === 'wall') pts.push(...el.points)
    else if (el.kind === 'furniture')
      pts.push(
        { x: el.x - el.width, y: el.y - el.height },
        { x: el.x + el.width, y: el.y + el.height }
      )
    else if (el.kind === 'dimension') {
      if (el.dimType === 'angle') {
        if (el.vertex) pts.push({ x: el.vertex.x - (el.radius ?? 500), y: el.vertex.y - (el.radius ?? 500) }, { x: el.vertex.x + (el.radius ?? 500), y: el.vertex.y + (el.radius ?? 500) })
      } else pts.push(el.p1, el.p2)
    }
  }
  if (pts.length === 0) return
  fitWorld(bboxOf(pts, 200), viewW.value, viewH.value)
}

defineExpose({ svgRef, containerRef, zoomIn, zoomOut, zoomReset, fitAll })

function onResize() {
  viewW.value = containerRef.value?.clientWidth ?? window.innerWidth
  viewH.value = containerRef.value?.clientHeight ?? window.innerHeight
}

let ro: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  onResize()
  ro = new ResizeObserver(onResize)
  if (containerRef.value) {
    ro.observe(containerRef.value)
    // 非 passive 才能 preventDefault 阻止页面缩放
    containerRef.value.addEventListener('wheel', onWheel, { passive: false })
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  containerRef.value?.removeEventListener('wheel', onWheel)
  ro?.disconnect()
})

function cursorClass(): string {
  if (spaceDown || state.mode === 'pan') return 'cursor-grab'
  if (state.mode === 'wall') return 'cursor-crosshair'
  if (state.mode === 'door' || state.mode === 'window' || state.mode === 'dimension' || state.mode === 'measure')
    return 'cursor-crosshair'
  return 'cursor-default'
}

const svgWidth = computed(() => viewW.value)
const svgHeight = computed(() => viewH.value)

// 为模板使用提供的工具
function pSegDist(p: Pt, a: Pt, b: Pt) {
  return pointSegmentDist(p, a, b).dist
}
function pPolyDist(p: Pt, pts: Pt[]) {
  return pointPolylineDist(p, pts, false)?.dist ?? 0
}
const openingPl = openingPlacement
function inRect(p: Pt, r: { x: number; y: number; width: number; height: number }) {
  return pointInRect(p, r)
}
</script>

<template>
  <div
    ref="containerRef"
    class="canvas-root"
    :class="cursorClass()"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @dblclick="onDoubleClick"
    @contextmenu="onContextMenu"
  >
    <svg
      ref="svgRef"
      class="world-svg"
      :width="svgWidth"
      :height="svgHeight"
      :data-export-hidden="false"
    >
      <!-- 背景 -->
      <rect
        x="-1000000"
        y="-1000000"
        width="2000000"
        height="2000000"
        :fill="state.doc.settings.bgColor"
      />
      <g class="world-content" :transform="contentTransform">
        <GridLayer
          v-if="state.doc.settings.showGrid"
          :scale="scale"
          :tx="contentTx"
          :ty="contentTy"
          :view-w="viewW"
          :view-h="viewH"
          :ruler="rulerSize"
          :color="state.doc.settings.gridColor"
        />

        <OpeningsMask :walls="walls" :doors="doors" :windows="windows" />

        <!-- 房间面（最底层） -->
        <RoomFaceShape v-for="r in editor.rooms.value" :key="r.id" :room="r" :scale="scale" />

        <!-- 所有图元：严格按 elements 数组顺序绘制，数组顺序即层级 -->
        <WorldElement
          v-for="el in orderedElements"
          :key="el.id"
          :el="el"
          :selected="state.selection.has(el.id)"
          :scale="scale"
          :wall-map="wallMap"
        />

        <!-- 画墙预览 -->
        <g v-if="draftWall" class="wall-draft" data-export-hidden>
          <path :d="draftWall.center" :fill="state.doc.settings.wallColor" opacity="0.35" />
          <polyline
            :points="draftWall.line"
            fill="none"
            stroke="#409eff"
            :stroke-width="1.5 / scale"
            :stroke-dasharray="`${8 / scale} ${6 / scale}`"
          />
          <g v-if="draftSegInfo">
            <rect
              :x="draftSegInfo.mid.x - 360"
              :y="draftSegInfo.mid.y - 150"
              width="720"
              height="240"
              rx="40"
              :fill="draftSegInfo.locked ? 'rgba(64,158,255,0.92)' : 'rgba(103,194,58,0.92)'"
            />
            <text
              :x="draftSegInfo.mid.x"
              :y="draftSegInfo.mid.y - 30"
              :font-size="150"
              fill="#fff"
              text-anchor="middle"
              dominant-baseline="central"
            >{{ Math.round(draftSegInfo.len) }}　{{ draftSegInfo.deg.toFixed(1) }}°{{ draftSegInfo.locked ? ' · 锁定' : ' · 自由' }}</text>
          </g>
        </g>

        <!-- 吸附标记：端点=方框，中点=菱形，交点=十字圆 -->
        <g v-if="state.snapMarker" data-export-hidden>
          <template v-if="state.snapMarker.kind === 'midpoint'">
            <rect
              :x="state.snapMarker.x - 6 / scale"
              :y="state.snapMarker.y - 6 / scale"
              :width="12 / scale"
              :height="12 / scale"
              :transform="`rotate(45 ${state.snapMarker.x} ${state.snapMarker.y})`"
              fill="#fff"
              stroke="#e6a23c"
              :stroke-width="2 / scale"
            />
          </template>
          <template v-else-if="state.snapMarker.kind === 'intersection'">
            <circle
              :cx="state.snapMarker.x"
              :cy="state.snapMarker.y"
              :r="7 / scale"
              fill="none"
              stroke="#67c23a"
              :stroke-width="2 / scale"
            />
            <line
              :x1="state.snapMarker.x - 12 / scale"
              :y1="state.snapMarker.y"
              :x2="state.snapMarker.x + 12 / scale"
              :y2="state.snapMarker.y"
              stroke="#67c23a"
              :stroke-width="1 / scale"
            />
            <line
              :x1="state.snapMarker.x"
              :y1="state.snapMarker.y - 12 / scale"
              :x2="state.snapMarker.x"
              :y2="state.snapMarker.y + 12 / scale"
              stroke="#67c23a"
              :stroke-width="1 / scale"
            />
          </template>
          <template v-else>
            <rect
              :x="state.snapMarker.x - 6 / scale"
              :y="state.snapMarker.y - 6 / scale"
              :width="12 / scale"
              :height="12 / scale"
              fill="#fff"
              stroke="#e6a23c"
              :stroke-width="2 / scale"
            />
          </template>
        </g>

        <!-- 标注预览 -->
        <g v-if="dimPreview" data-export-hidden>
          <line
            :x1="dimPreview.p1.x"
            :y1="dimPreview.p1.y"
            :x2="dimPreview.q1.x"
            :y2="dimPreview.q1.y"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1 / scale"
            stroke-dasharray="4 4"
          />
          <line
            :x1="dimPreview.p2.x"
            :y1="dimPreview.p2.y"
            :x2="dimPreview.q2.x"
            :y2="dimPreview.q2.y"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1 / scale"
            stroke-dasharray="4 4"
          />
          <line
            :x1="dimPreview.q1.x"
            :y1="dimPreview.q1.y"
            :x2="dimPreview.q2.x"
            :y2="dimPreview.q2.y"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1.5 / scale"
            stroke-dasharray="6 4"
          />
        </g>

        <!-- 角度标注预览 -->
        <g v-if="angleDimPreview" data-export-hidden>
          <line
            :x1="angleDimPreview.vertex.x"
            :y1="angleDimPreview.vertex.y"
            :x2="angleDimPreview.r1.x"
            :y2="angleDimPreview.r1.y"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1 / scale"
            stroke-dasharray="4 4"
          />
          <line
            :x1="angleDimPreview.vertex.x"
            :y1="angleDimPreview.vertex.y"
            :x2="angleDimPreview.r2.x"
            :y2="angleDimPreview.r2.y"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1 / scale"
            stroke-dasharray="4 4"
          />
          <path
            :d="angleDimPreview.path"
            fill="none"
            :stroke="state.doc.settings.dimColor"
            :stroke-width="1.5 / scale"
            stroke-dasharray="6 4"
          />
          <circle :cx="angleDimPreview.vertex.x" :cy="angleDimPreview.vertex.y" :r="4 / scale" fill="#f56c6c" />
          <text
            :x="angleDimPreview.labelPos.x"
            :y="angleDimPreview.labelPos.y"
            :font-size="240"
            fill="#f56c6c"
            text-anchor="middle"
            dominant-baseline="central"
          >{{ angleDimPreview.angleDeg.toFixed(1) }}°</text>
        </g>

        <!-- 临时测距 -->
        <g v-if="state.measure" class="measure-layer" data-export-hidden>
          <line
            :x1="state.measure.p1.x"
            :y1="state.measure.p1.y"
            :x2="state.measure.p2.x"
            :y2="state.measure.p2.y"
            stroke="#67c23a"
            :stroke-width="2 / scale"
          />
          <circle :cx="state.measure.p1.x" :cy="state.measure.p1.y" :r="4 / scale" fill="#67c23a" />
          <circle :cx="state.measure.p2.x" :cy="state.measure.p2.y" :r="4 / scale" fill="#67c23a" />
          <g v-if="measureInfo">
            <rect
              :x="measureInfo.mid.x - 900"
              :y="measureInfo.mid.y - 260"
              width="1800"
              height="520"
              rx="60"
              fill="rgba(103,194,58,0.92)"
            />
            <text
              :x="measureInfo.mid.x"
              :y="measureInfo.mid.y - 40"
              :font-size="260"
              fill="#fff"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {{ formatLength(measureInfo.dist) }}　{{ measureInfo.angle.toFixed(1) }}°
            </text>
          </g>
        </g>

        <!-- 墙草稿已有顶点（绘制中的已确认点） -->
        <g v-if="state.wallDraft.length > 0 && state.mode === 'wall'" data-export-hidden>
          <circle
            v-for="(p, i) in state.wallDraft"
            :key="i"
            :cx="p.x"
            :cy="p.y"
            :r="4 / scale"
            fill="#409eff"
            stroke="#fff"
            :stroke-width="1 / scale"
          />
        </g>
      </g>

      <!-- 框选矩形（屏幕层） -->
      <rect
        v-if="marquee"
        :x="Math.min(marquee.x0, marquee.x1) * scale + contentTx"
        :y="Math.min(marquee.y0, marquee.y1) * scale + contentTy"
        :width="Math.abs(marquee.x1 - marquee.x0) * scale"
        :height="Math.abs(marquee.y1 - marquee.y0) * scale"
        fill="rgba(64,158,255,0.12)"
        stroke="#409eff"
        stroke-width="1"
        stroke-dasharray="4 3"
        data-export-hidden
      />
    </svg>

    <Rulers
      v-if="showRulers"
      :scale="scale"
      :tx="state.viewport.tx"
      :ty="state.viewport.ty"
      :view-w="viewW - rulerSize"
      :view-h="viewH - rulerSize"
      :size="rulerSize"
    />
  </div>
</template>

<style scoped>
.canvas-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #fff;
}
.world-svg {
  display: block;
  touch-action: none;
}
/* 世界内容不接收指针事件：命中检测全部由 JS hitTest 完成 */
.world-content {
  pointer-events: none;
}
.world-svg [data-export-hidden] {
  pointer-events: none;
}
.cursor-grab {
  cursor: grab;
}
.cursor-grab:active {
  cursor: grabbing;
}
.cursor-crosshair {
  cursor: crosshair;
}
</style>
