/**
 * 房间自定义信息：命名、填充色、可拖动标签位置。
 * 房间由墙体推导，身份通过「点集签名」匹配——墙体轻微改动后多数点仍一致。
 */
import type { RoomFace, RoomMeta, StructureElement } from '@/types'
import { type Pt, polygonArea, pointInPolygon } from './geometry'

/** 房间点集签名：排序后量化坐标 */
export function roomSignature(points: Pt[]): string {
  const q = points
    .map((p) => `${Math.round(p.x / 5)},${Math.round(p.y / 5)}`)
    .sort()
    .join(';')
  return `r:${q}`
}

let metaSeq = 0
export function createRoomMeta(sig: string, name = ''): RoomMeta {
  metaSeq++
  return {
    id: `rm_${Date.now().toString(36)}_${metaSeq}`,
    sig,
    name,
    fill: '',
    labelPos: null
  }
}

/** 为推导房间绑定 meta（按 sig 精确匹配；失败时用包含锚点的最近面积房间兜底） */
export function attachRoomMeta(rooms: RoomFace[], metas: RoomMeta[]): void {
  const used = new Set<string>()
  for (const room of rooms) {
    let meta = metas.find((m) => m.sig === room.sig && !used.has(m.id))
    if (meta) used.add(meta.id)
    room.meta = meta
  }
}

/**
 * 计算房间净面积：扣掉完全位于房间内部的柱/烟道（deduct=true）。
 * 结构以轴对齐或旋转矩形面积近似（角点在房间内即视为属于该房间）。
 */
export function roomNetArea(room: Pt[], structures: StructureElement[]): number {
  let deduct = 0
  for (const s of structures) {
    if (!s.deduct) continue
    // 结构中心在房间内才扣减
    if (pointInPolygon({ x: s.x, y: s.y }, room)) {
      deduct += s.width * s.height
    }
  }
  return Math.max(0, polygonArea(room) - deduct)
}

/** 房间标签显示文本：「名称 面积」 */
export function roomLabelText(room: RoomFace, net = false): string {
  const area = net ? room.netArea : room.area
  const m2 = (area / 1e6).toFixed(1).replace(/\.0$/, '')
  const name = room.meta?.name?.trim()
  return name ? `${name} ${m2}㎡` : `${m2}㎡`
}
