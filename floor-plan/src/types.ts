import type { Pt } from '@/lib/geometry'

export type ToolMode =
  | 'select'
  | 'pan'
  | 'wall'
  | 'door'
  | 'window'
  | 'dimension'
  | 'angle-dim'
  | 'measure'

/** 门型 */
export type DoorStyle = 'swing' | 'sliding' | 'double'
/** 窗型 */
export type WindowStyle = 'fixed' | 'sliding' | 'casement'
/** 结构构件类型 */
export type StructureKind = 'column' | 'flue' | 'platform'

export interface DocSettings {
  wallColor: string
  wallThickness: number // mm
  dimColor: string
  dimStrokeWidth: number // px（屏幕分辨率下的标注线宽）
  bgColor: string
  gridColor: string
  showGrid: boolean
  showRulers: boolean
  /** 90° 正交锁定（画墙） */
  ortho: boolean
  /** 45° 角锁定（0/45/90/135…，开启时优先于 ortho） */
  angleLock45: boolean
  snapEnabled: boolean
  snapTol: number // px
  /** 各类吸附开关 */
  snapEndpoint: boolean
  snapMidpoint: boolean
  snapIntersection: boolean
  /** 画墙结束后自动裁剪伸入其他墙体的端头段 */
  autoTrim: boolean
  /** 家具靠墙/靠家具边缘吸附 */
  furnitureSnap: boolean
  /** 碰撞/重叠时禁止落下（仅提示高亮 vs 阻止） */
  collisionBlock: boolean
}

/** 标注锚点与墙体的关联（墙体改动后据此自动更新标注） */
export type DimAnchorRef =
  | { kind: 'wall-vertex'; wallId: string; index: number }
  | { kind: 'wall-mid'; wallId: string; index: number }
  | { kind: 'free' }

export interface WallElement {
  id: string
  kind: 'wall'
  points: Pt[]
  closed: boolean
  thickness: number
  color: string
}

export interface DoorElement {
  id: string
  kind: 'door'
  wallId: string
  /** 沿墙中心线距起点的距离 mm */
  offset: number
  /** 门洞宽度 mm */
  width: number
  /** 合页位于洞口的起点端还是终点端（平开门/双开门） */
  hinge: 'start' | 'end'
  /** 门扇开启方向（相对左法向量的一侧） */
  swingSide: 1 | -1
  /** 门型：平开门 / 推拉门 / 双开门 */
  doorStyle?: DoorStyle
  color: string
}

export interface WindowElement {
  id: string
  kind: 'window'
  wallId: string
  offset: number
  width: number
  /** 窗型：固定窗 / 推拉窗 / 平开窗 */
  winStyle?: WindowStyle
  color: string
}

export interface DimensionElement {
  id: string
  kind: 'dimension'
  /** 标注类型：线性 / 角度 */
  dimType: 'linear' | 'angle'
  /** 线性标注：被测线段两端 */
  p1: Pt
  p2: Pt
  /** 线性标注线相对被测线段的偏移距离 mm（正负决定方向） */
  offsetDistance: number
  /** 角度标注：顶点 / 起始射线上一点 / 终止射线上一点 */
  vertex?: Pt
  ray1?: Pt
  ray2?: Pt
  /** 角度标注弧半径 mm */
  radius?: number
  /** 三个锚点与墙体的关联引用 */
  ref1?: DimAnchorRef
  ref2?: DimAnchorRef
  refV?: DimAnchorRef
  color: string
  strokeWidth: number
}

export interface FurnitureElement {
  id: string
  kind: 'furniture'
  defId: string
  x: number
  y: number
  width: number
  height: number
  /** 旋转角（弧度，屏幕坐标系），仅 0/90/180/270 参与对齐吸附 */
  rotation: number
  label?: string
}

/**
 * 结构构件：柱子 / 烟道 / 地台。
 * 矩形（旋转角 rotation），可被吸附、可命中、可框选、可复制层级。
 * deduct=true（柱、烟道）参与房间净面积扣减；地台不扣减。
 */
export interface StructureElement {
  id: string
  kind: 'structure'
  structKind: StructureKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  /** 是否参与房间净面积扣减 */
  deduct: boolean
  label?: string
}

export type FloorElement =
  | WallElement
  | DoorElement
  | WindowElement
  | DimensionElement
  | FurnitureElement
  | StructureElement

export type ElementKind = FloorElement['kind']

/** 房间自定义信息（以房间点集签名匹配，墙体改动后仍能尽量保持） */
export interface RoomMeta {
  id: string
  /** 房间点集签名（排序后坐标哈希），用于与推导房间匹配 */
  sig: string
  name: string
  /** 填充色（含透明度），空串=默认 */
  fill: string
  /** 标签锚点（世界坐标），可拖拽；null=使用形心 */
  labelPos: Pt | null
}

export interface DocModel {
  version: number
  settings: DocSettings
  elements: FloorElement[]
  roomMeta?: RoomMeta[]
}

/** 从墙体中心线推导的闭合房间 */
export interface RoomFace {
  id: string
  points: Pt[]
  area: number
  perimeter: number
  wallIds: string[]
  /** 点集签名（用于匹配 RoomMeta） */
  sig: string
  /** 结构构件扣减后的净面积 */
  netArea: number
  /** 绑定的自定义信息 */
  meta?: RoomMeta
}

export interface SelectionBox {
  id: string
}
