/**
 * 图元复制 / 粘贴剪贴板（模块级，跨组件共享）。
 * 复制内容为深拷贝，粘贴时重新分配 id，并重映射门窗对墙的依附。
 */
import type { FloorElement } from '@/types'
import { uid } from './uid'

let clipboard: FloorElement[] = []

export function setClipboard(elements: FloorElement[]): void {
  clipboard = JSON.parse(JSON.stringify(elements)) as FloorElement[]
}

export function hasClipboard(): boolean {
  return clipboard.length > 0
}

/**
 * 生成粘贴副本：
 * - 所有图元重新分配 id；
 * - 墙 id 重映射，依附被复制墙的门窗跟随；
 * - 依附未复制墙的门窗丢弃。
 */
export function pasteElements(offset: { x: number; y: number } = { x: 0, y: 0 }): FloorElement[] {
  const idMap = new Map<string, string>()
  const copiedWallIds = new Set(clipboard.filter((e) => e.kind === 'wall').map((e) => e.id))

  const out: FloorElement[] = []
  for (const src of clipboard) {
    const el: FloorElement = JSON.parse(JSON.stringify(src))
    const newId = uid(el.kind)
    idMap.set(src.id, newId)
    el.id = newId

    if (el.kind === 'wall') {
      for (const p of el.points) {
        p.x += offset.x
        p.y += offset.y
      }
    } else if (el.kind === 'furniture') {
      el.x += offset.x
      el.y += offset.y
    } else if (el.kind === 'dimension') {
      el.p1 = { x: el.p1.x + offset.x, y: el.p1.y + offset.y }
      el.p2 = { x: el.p2.x + offset.x, y: el.p2.y + offset.y }
      if (el.vertex) el.vertex = { x: el.vertex.x + offset.x, y: el.vertex.y + offset.y }
      if (el.ray1) el.ray1 = { x: el.ray1.x + offset.x, y: el.ray1.y + offset.y }
      if (el.ray2) el.ray2 = { x: el.ray2.x + offset.x, y: el.ray2.y + offset.y }
      // 粘贴后关联引用失效，保留坐标作为自由点
      el.ref1 = { kind: 'free' }
      el.ref2 = { kind: 'free' }
      el.refV = { kind: 'free' }
    } else if (el.kind === 'door' || el.kind === 'window') {
      if (!copiedWallIds.has(el.wallId)) continue
      el.wallId = idMap.get(el.wallId)!
    }
    out.push(el)
  }
  return out
}
