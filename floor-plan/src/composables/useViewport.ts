import { computed } from 'vue'
import type { Pt } from '@/lib/geometry'
import { clamp } from '@/lib/geometry'
import { useEditor } from '@/store/useEditor'

const MIN_SCALE = 0.05
const MAX_SCALE = 20

/**
 * 视图变换组合式函数。
 * 世界 -> 屏幕：sx = wx * scale + tx（tx/ty 已含标尺边距）
 */
export function useViewport() {
  const { rawState, state } = useEditor()

  const worldTransform = computed(
    () => `translate(${rawState.viewport.tx} ${rawState.viewport.ty}) scale(${rawState.viewport.scale})`
  )

  function screenToWorld(clientX: number, clientY: number, containerRect: DOMRect): Pt {
    const x = clientX - containerRect.left - (state.doc.settings.showRulers ? rawState.rulerSize : 0)
    const y = clientY - containerRect.top - (state.doc.settings.showRulers ? rawState.rulerSize : 0)
    return {
      x: (x - rawState.viewport.tx) / rawState.viewport.scale,
      y: (y - rawState.viewport.ty) / rawState.viewport.scale
    }
  }

  function worldToScreen(p: Pt): Pt {
    return {
      x: p.x * rawState.viewport.scale + rawState.viewport.tx,
      y: p.y * rawState.viewport.scale + rawState.viewport.ty
    }
  }

  /** 以屏幕点为锚点缩放 */
  function zoomAt(screenX: number, screenY: number, factor: number) {
    const vp = rawState.viewport
    const newScale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE)
    const k = newScale / vp.scale
    vp.tx = screenX - (screenX - vp.tx) * k
    vp.ty = screenY - (screenY - vp.ty) * k
    vp.scale = newScale
  }

  function zoomByFactor(factor: number, center?: Pt) {
    const size = state.doc.settings.showRulers ? rawState.rulerSize : 0
    zoomAt((center?.x ?? 0) + size, (center?.y ?? 0) + size, factor)
  }

  /** 让指定世界包围盒适配视口 */
  function fitWorld(bbox: { x: number; y: number; width: number; height: number }, viewW: number, viewH: number) {
    const pad = 80
    const sx = (viewW - pad * 2) / Math.max(bbox.width, 1)
    const sy = (viewH - pad * 2) / Math.max(bbox.height, 1)
    rawState.viewport.scale = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE)
    rawState.viewport.tx =
      viewW / 2 - (bbox.x + bbox.width / 2) * rawState.viewport.scale
    rawState.viewport.ty =
      viewH / 2 - (bbox.y + bbox.height / 2) * rawState.viewport.scale
  }

  return {
    worldTransform,
    screenToWorld,
    worldToScreen,
    zoomAt,
    zoomByFactor,
    fitWorld,
    MIN_SCALE,
    MAX_SCALE
  }
}
