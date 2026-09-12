/**
 * 编辑器全局状态：文档模型、历史栈、视图、模式、选中集
 */
import { computed, reactive, shallowRef, watch } from 'vue'
import type {
  DimensionElement,
  DocModel,
  DocSettings,
  DoorElement,
  FloorElement,
  FurnitureElement,
  RoomFace,
  ToolMode,
  WallElement,
  WindowElement
} from '@/types'
import { uid } from '@/lib/uid'
import { extractRooms } from '@/lib/walls'
import type { Pt } from '@/lib/geometry'
import { polylineLength } from '@/lib/geometry'
import { syncDimensions, migrateDimension } from '@/lib/dimensionSync'
import {
  batchEditWalls,
  healWalls,
  rehomeOpenings,
  trimWallsAtIntersections,
  type OpeningLike
} from '@/lib/wallOps'
import { pasteElements, setClipboard } from '@/lib/clipboard'
import { bringToFront, sendToBack, moveUp, moveDown } from '@/lib/layering'

const DEFAULT_SETTINGS: DocSettings = {
  wallColor: '#303133',
  wallThickness: 120,
  dimColor: '#f56c6c',
  dimStrokeWidth: 1,
  bgColor: '#ffffff',
  gridColor: '#dfe4ea',
  showGrid: true,
  showRulers: true,
  ortho: true,
  angleLock45: false,
  snapEnabled: true,
  snapTol: 12,
  snapEndpoint: true,
  snapMidpoint: true,
  snapIntersection: true,
  autoTrim: false
}

function createDoc(): DocModel {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    elements: []
  }
}

interface Viewport {
  scale: number
  /** 世界原点在屏幕坐标系中的位置（考虑标尺边距） */
  tx: number
  ty: number
}

interface EditorState {
  doc: DocModel
  mode: ToolMode
  selection: Set<string>
  viewport: Viewport
  /** 标尺占用边距 */
  rulerSize: number
  /** 鼠标在世界坐标的位置（状态条/吸附提示用） */
  cursorWorld: Pt | null
  /** 临时测距结果（不落库） */
  measure: { p1: Pt; p2: Pt } | null
  /** 画墙进行中的临时点 */
  wallDraft: Pt[]
  /** 画墙时的吸附点（屏幕层高亮） */
  snapMarker: (Pt & { kind?: 'endpoint' | 'midpoint' | 'intersection' }) | null
}

const state = reactive<EditorState>({
  doc: createDoc(),
  mode: 'select',
  selection: new Set(),
  viewport: { scale: 0.28, tx: 460, ty: 360 },
  rulerSize: 24,
  cursorWorld: null,
  measure: null,
  wallDraft: [],
  snapMarker: null
})

// ---------------------------------------------------------------------------
// 历史栈：对 doc 做深拷贝快照
// ---------------------------------------------------------------------------
const undoStack: DocModel[] = []
const redoStack: DocModel[] = []
const HISTORY_LIMIT = 80

function cloneDoc(doc: DocModel): DocModel {
  return JSON.parse(JSON.stringify(doc)) as DocModel
}

function pushHistory() {
  undoStack.push(cloneDoc(state.doc))
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
  refreshHistoryFlags()
}

const canUndo = shallowRef(false)
const canRedo = shallowRef(false)

function refreshHistoryFlags() {
  canUndo.value = undoStack.length > 0
  canRedo.value = redoStack.length > 0
}

function undo() {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(cloneDoc(state.doc))
  state.doc = prev
  pruneSelection()
  refreshHistoryFlags()
}

function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(cloneDoc(state.doc))
  state.doc = next
  pruneSelection()
  refreshHistoryFlags()
}

function pruneSelection() {
  const ids = new Set(state.doc.elements.map((e) => e.id))
  for (const id of [...state.selection]) {
    if (!ids.has(id)) state.selection.delete(id)
  }
}

// ---------------------------------------------------------------------------
// 标注随墙体自动更新：监听墙体几何签名，变化时按锚点引用同步标注
// ---------------------------------------------------------------------------
function wallSignature(): string {
  const parts: string[] = []
  for (const e of state.doc.elements) {
    if (e.kind !== 'wall') continue
    parts.push(
      e.id +
        '|' +
        e.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';') +
        '|' +
        (e.closed ? 'c' : 'o')
    )
  }
  return parts.join('///')
}

let lastWallSig = wallSignature()

watch(
  wallSignature,
  (sig) => {
    if (sig === lastWallSig) return
    lastWallSig = sig
    const dims = state.doc.elements.filter((e): e is DimensionElement => e.kind === 'dimension')
    const ws = state.doc.elements.filter((e): e is WallElement => e.kind === 'wall')
    if (dims.length) syncDimensions(dims, ws)
  }
)

// ---------------------------------------------------------------------------
// 元素操作
// ---------------------------------------------------------------------------
function addElement<T extends FloorElement>(el: T, record = true): T {
  if (record) pushHistory()
  state.doc.elements.push(el)
  return el
}

function updateElement(id: string, patch: Partial<FloorElement>, record = false) {
  const el = state.doc.elements.find((e) => e.id === id)
  if (!el) return
  if (record) pushHistory()
  Object.assign(el, patch)
}

function removeElements(ids: Set<string> | string[], record = true) {
  const idset = ids instanceof Set ? ids : new Set(ids)
  if (record) pushHistory()
  state.doc.elements = state.doc.elements.filter((e) => {
    if (idset.has(e.id)) return false
    // 依附墙体被删除时，门窗一并删除
    if ((e.kind === 'door' || e.kind === 'window') && idset.has(e.wallId)) return false
    return true
  })
  for (const id of idset) state.selection.delete(id)
  pruneSelection()
}

function getElement(id: string): FloorElement | undefined {
  return state.doc.elements.find((e) => e.id === id)
}

// ---------------------------------------------------------------------------
// 选择
// ---------------------------------------------------------------------------
function selectOnly(ids: string[] = []) {
  state.selection = new Set(ids)
}

function toggleSelect(id: string) {
  if (state.selection.has(id)) state.selection.delete(id)
  else state.selection.add(id)
}

const selectedElements = computed<FloorElement[]>(() =>
  state.doc.elements.filter((e) => state.selection.has(e.id))
)

// ---------------------------------------------------------------------------
// 房间（由墙体自动推导）
// ---------------------------------------------------------------------------
const walls = computed<WallElement[]>(() =>
  state.doc.elements.filter((e): e is WallElement => e.kind === 'wall')
)

const rooms = computed<RoomFace[]>(() => {
  try {
    return extractRooms(walls.value).map((r, i) => ({
      id: `room_${i}`,
      points: r.points,
      area: r.area,
      perimeter: r.perimeter,
      wallIds: r.wallIds
    }))
  } catch {
    return []
  }
})

// ---------------------------------------------------------------------------
// 便捷工厂
// ---------------------------------------------------------------------------
function makeWall(points: Pt[], closed = false): WallElement {
  return {
    id: uid('wall'),
    kind: 'wall',
    points: points.map((p) => ({ ...p })),
    closed,
    thickness: state.doc.settings.wallThickness,
    color: state.doc.settings.wallColor
  }
}

function makeFurniture(defId: string, x: number, y: number, width: number, height: number): FurnitureElement {
  return { id: uid('fur'), kind: 'furniture', defId, x, y, width, height, rotation: 0 }
}

function makeDimension(p1: Pt, p2: Pt, offsetDistance = 400): DimensionElement {
  return {
    id: uid('dim'),
    kind: 'dimension',
    dimType: 'linear',
    p1: { ...p1 },
    p2: { ...p2 },
    offsetDistance,
    color: state.doc.settings.dimColor,
    strokeWidth: state.doc.settings.dimStrokeWidth
  }
}

/** 角度标注工厂：顶点 + 两射线上的点 + 弧半径 */
function makeAngleDimension(vertex: Pt, r1: Pt, r2: Pt, radius = 500): DimensionElement {
  return {
    id: uid('dim'),
    kind: 'dimension',
    dimType: 'angle',
    p1: { ...r1 },
    p2: { ...r2 },
    offsetDistance: 0,
    vertex: { ...vertex },
    ray1: { ...r1 },
    ray2: { ...r2 },
    radius,
    color: state.doc.settings.dimColor,
    strokeWidth: state.doc.settings.dimStrokeWidth
  }
}

function setMode(mode: ToolMode) {
  state.mode = mode
  state.measure = null
  state.wallDraft = []
  state.snapMarker = null
  if (mode !== 'select') state.selection = new Set()
}

function updateSettings(patch: Partial<DocSettings>, record = false) {
  if (record) pushHistory()
  Object.assign(state.doc.settings, patch)
}

function clearAll() {
  pushHistory()
  state.doc.elements = []
  state.selection = new Set()
  state.measure = null
  state.wallDraft = []
}

// ---------------------------------------------------------------------------
// 墙体：相交裁剪 / 断线修复 / 批量编辑
// ---------------------------------------------------------------------------
function getWalls(): WallElement[] {
  return state.doc.elements.filter((e): e is WallElement => e.kind === 'wall')
}

/** 墙体相交自动裁剪（伸入其它墙体内部的端头段删除）；门窗就近迁移 */
function trimIntersectingWalls(): { changed: boolean; removed: number } {
  const before = getWalls()
  const ops = trimWallsAtIntersections(before)
  if (!ops.changed) return { changed: false, removed: 0 }
  pushHistory()
  const openings = state.doc.elements.filter(
    (e): e is DoorElement | WindowElement => e.kind === 'door' || e.kind === 'window'
  )
  const orphan = rehomeOpenings(openings, before, ops)
  const orphanSet = new Set(orphan.map((o) => o.id))
  const removedWallIds = new Set(ops.removedIds)
  const keptWallMap = new Map(ops.walls.map((w) => [w.id, w]))

  state.doc.elements = state.doc.elements.flatMap((e): FloorElement[] => {
    if (e.kind === 'wall') {
      if (removedWallIds.has(e.id)) return []
      return [keptWallMap.get(e.id) ?? e]
    }
    if ((e.kind === 'door' || e.kind === 'window') && orphanSet.has(e.id)) return []
    return [e]
  })

  pruneSelection()
  lastWallSig = wallSignature()
  return { changed: true, removed: ops.removedIds.length }
}

/** 断线修复：端点吸附 + 共线合并 */
function healBrokenWalls(tolMm = 150): { snapped: number; merged: number } {
  const walls = getWalls()
  const openings: OpeningLike[] = state.doc.elements
    .filter((e): e is DoorElement | WindowElement => e.kind === 'door' || e.kind === 'window')
    .map((o) => ({ wallId: o.wallId, offset: o.offset, width: o.width }))
  const res = healWalls(walls, openings, tolMm)
  if (res.snappedCount === 0 && res.mergedCount === 0 && res.deletedIds.length === 0) {
    return { snapped: 0, merged: 0 }
  }
  pushHistory()
  // openings 与 opEls 由同一 filter 顺序产生，按索引回写重映射结果
  const opEls = state.doc.elements.filter(
    (e): e is DoorElement | WindowElement => e.kind === 'door' || e.kind === 'window'
  )
  opEls.forEach((el, i) => {
    const o = openings[i]
    if (!o || o.wallId === '__deleted__') return
    el.wallId = o.wallId
    el.offset = o.offset
  })
  const removedWallIds = new Set([...res.mergedAway, ...res.deletedIds])
  const newWallMap = new Map(res.walls.map((w) => [w.id, w]))
  state.doc.elements = state.doc.elements.filter(
    (e) => !(e.kind === 'wall' && removedWallIds.has(e.id))
  )
  state.doc.elements = state.doc.elements.map((e) =>
    e.kind === 'wall' && newWallMap.has(e.id) ? newWallMap.get(e.id)! : e
  )
  // 删除依附墙不存在的门窗
  const wallIds = new Map(getWalls().map((w) => [w.id, true]))
  state.doc.elements = state.doc.elements.filter(
    (e) => !((e.kind === 'door' || e.kind === 'window') && !wallIds.has(e.wallId))
  )
  pruneSelection()
  lastWallSig = wallSignature()
  return { snapped: res.snappedCount, merged: res.mergedCount }
}

/** 批量编辑选中墙（或指定墙）的厚度/颜色 */
function batchEditSelectedWalls(patch: { thickness?: number; color?: string }): number {
  const ws = selectedElements.value.filter((e): e is WallElement => e.kind === 'wall')
  if (ws.length === 0) return 0
  pushHistory()
  return batchEditWalls(ws, patch)
}

// ---------------------------------------------------------------------------
// 复制 / 粘贴 / 层级
// ---------------------------------------------------------------------------
function copySelected(cut = false) {
  const els = state.doc.elements.filter((e) => state.selection.has(e.id))
  if (els.length === 0) return
  // 复制墙时带上依附其上的门窗
  const wallIds = new Set(els.filter((e) => e.kind === 'wall').map((e) => e.id))
  const attached = state.doc.elements.filter(
    (e) => (e.kind === 'door' || e.kind === 'window') && wallIds.has(e.wallId)
  )
  setClipboard([...els, ...attached.filter((a) => !state.selection.has(a.id))])
  if (cut) removeElements([...state.selection])
}

function pasteAt(offset?: Pt): FloorElement[] {
  const els = pasteElements(offset ?? { x: 200, y: 200 })
  if (els.length === 0) return []
  pushHistory()
  state.doc.elements.push(...els)
  selectOnly(els.map((e) => e.id))
  return els
}

function duplicateSelected(): void {
  const els = state.doc.elements.filter((e) => state.selection.has(e.id))
  if (els.length === 0) return
  setClipboard(els)
  pasteAt({ x: 200, y: 200 })
}

function reorderSelected(dir: 'front' | 'back' | 'up' | 'down') {
  const ids = new Set(state.selection)
  if (ids.size === 0) return
  pushHistory()
  const fn = dir === 'front' ? bringToFront : dir === 'back' ? sendToBack : dir === 'up' ? moveUp : moveDown
  state.doc.elements = fn(state.doc.elements, ids)
}

// ---------------------------------------------------------------------------
// 文档加载 / 迁移
// ---------------------------------------------------------------------------
function loadDoc(doc: DocModel) {
  pushHistory()
  // 旧版本设置兼容
  doc.settings = { ...DEFAULT_SETTINGS, ...doc.settings }
  // 标注迁移：补 dimType、就近绑定墙顶点
  const ws = doc.elements.filter((e): e is WallElement => e.kind === 'wall')
  for (const e of doc.elements) {
    if (e.kind === 'dimension') migrateDimension(e, ws, 30)
  }
  state.doc = doc
  pruneSelection()
  lastWallSig = wallSignature()
}

export function useEditor() {
  return {
    state,
    rawState: state,
    walls,
    rooms,
    selectedElements,
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    refreshHistoryFlags,
    addElement,
    updateElement,
    removeElements,
    getElement,
    selectOnly,
    toggleSelect,
    makeWall,
    makeFurniture,
    makeDimension,
    makeAngleDimension,
    setMode,
    updateSettings,
    clearAll,
    loadDoc,
    cloneDoc,
    // 墙体优化
    trimIntersectingWalls,
    healBrokenWalls,
    batchEditSelectedWalls,
    // 复制粘贴 / 层级
    copySelected,
    pasteAt,
    duplicateSelected,
    reorderSelected,
    uid
  }
}
