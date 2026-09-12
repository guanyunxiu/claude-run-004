/**
 * 简易图元层级：elements 数组顺序即渲染顺序（后者在上）。
 * 置顶/置底为跨类型移动；上移/下移在同类型图元内交换，避免家具压到墙体等异常。
 */
import type { FloorElement } from '@/types'

function swapOrMove(elements: FloorElement[], ids: Set<string>, dir: 'front' | 'back' | 'up' | 'down'): FloorElement[] {
  const arr = [...elements]
  const selected = arr.filter((e) => ids.has(e.id))
  if (selected.length === 0) return arr

  if (dir === 'front') {
    return [...arr.filter((e) => !ids.has(e.id)), ...selected]
  }
  if (dir === 'back') {
    return [...selected, ...arr.filter((e) => !ids.has(e.id))]
  }

  // 同类型内上移/下移
  for (let pass = 0; pass < selected.length; pass++) {
    if (dir === 'up') {
      for (let i = arr.length - 2; i >= 0; i--) {
        if (!ids.has(arr[i].id)) continue
        // 向后找第一个不同 id 的同类图元交换
        for (let j = i + 1; j < arr.length; j++) {
          if (ids.has(arr[j].id)) continue
          if (arr[j].kind === arr[i].kind) {
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
            break
          }
        }
      }
    } else {
      for (let i = 1; i < arr.length; i++) {
        if (!ids.has(arr[i].id)) continue
        for (let j = i - 1; j >= 0; j--) {
          if (ids.has(arr[j].id)) continue
          if (arr[j].kind === arr[i].kind) {
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
            break
          }
        }
      }
    }
  }
  return arr
}

export function bringToFront(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  return swapOrMove(elements, ids, 'front')
}
export function sendToBack(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  return swapOrMove(elements, ids, 'back')
}
export function moveUp(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  return swapOrMove(elements, ids, 'up')
}
export function moveDown(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  return swapOrMove(elements, ids, 'down')
}
