/**
 * 图元层级：elements 数组顺序即渲染顺序（后者在上）。
 * 画布按数组顺序统一渲染，因此置顶/置底/上移/下移均跨类型生效。
 */
import type { FloorElement } from '@/types'

export function bringToFront(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  const selected = elements.filter((e) => ids.has(e.id))
  return [...elements.filter((e) => !ids.has(e.id)), ...selected]
}

export function sendToBack(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  const selected = elements.filter((e) => ids.has(e.id))
  return [...selected, ...elements.filter((e) => !ids.has(e.id))]
}

/** 每个选中图元与数组中后一个非选中图元交换，整体上移一层 */
export function moveUp(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  const arr = [...elements]
  for (let i = arr.length - 2; i >= 0; i--) {
    if (!ids.has(arr[i].id)) continue
    // 跳过连续的选中图元，与最近的非选中图元交换
    let j = i + 1
    while (j < arr.length && ids.has(arr[j].id)) j++
    if (j < arr.length) {
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
  return arr
}

/** 每个选中图元与数组中前一个非选中图元交换，整体下移一层 */
export function moveDown(elements: FloorElement[], ids: Set<string>): FloorElement[] {
  const arr = [...elements]
  for (let i = 1; i < arr.length; i++) {
    if (!ids.has(arr[i].id)) continue
    let j = i - 1
    while (j >= 0 && ids.has(arr[j].id)) j--
    if (j >= 0) {
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
  return arr
}
