<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CanvasView from '@/components/canvas/CanvasView.vue'
import Toolbar from '@/components/Toolbar.vue'
import FurnitureLibrary from '@/components/FurnitureLibrary.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import TopBar from '@/components/TopBar.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useEditor } from '@/store/useEditor'
import { useViewport } from '@/composables/useViewport'
import { getFurnitureDef } from '@/lib/furniture'
import type { Pt } from '@/lib/geometry'

const editor = useEditor()
const canvasRef = ref<InstanceType<typeof CanvasView> | null>(null)

// 快捷键 -> 模式
const keyToMode: Record<string, Parameters<typeof editor.setMode>[0]> = {
  v: 'select',
  w: 'wall',
  d: 'door',
  c: 'window',
  l: 'dimension',
  a: 'angle-dim',
  m: 'measure',
  h: 'pan'
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
  // Ctrl/Cmd/Alt 组合键（复制粘贴等）不触发工具切换
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const mode = keyToMode[e.key.toLowerCase()]
  if (mode) editor.setMode(mode)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  ;(window as unknown as { __fp?: unknown }).__fp = editor
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// 家具拖放
function onDrop(e: DragEvent) {
  e.preventDefault()
  const defId = e.dataTransfer?.getData('application/furniture')
  if (!defId || !canvasRef.value) return
  const def = getFurnitureDef(defId)
  if (!def) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const { screenToWorld } = useViewport()
  const w = screenToWorld(e.clientX, e.clientY, rect)
  placeFurniture(defId, w)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function placeFurniture(defId: string, world?: Pt) {
  const def = getFurnitureDef(defId)
  if (!def) return
  let x = world?.x ?? 0
  let y = world?.y ?? 0
  if (!world && canvasRef.value) {
    // 点击家具库按钮：放到当前视图中心
    const el = canvasRef.value.containerRef as HTMLDivElement
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const w = useViewport().screenToWorld(cx, cy, rect)
    x = w.x
    y = w.y
  }
  editor.pushHistory()
  const f = editor.makeFurniture(defId, x, y, def.width, def.height)
  editor.addElement(f, false)
  editor.setMode('select')
  editor.selectOnly([f.id])
}
</script>

<template>
  <div class="app" @drop="onDrop" @dragover="onDragOver">
    <TopBar
      :get-svg="() => canvasRef?.svgRef ?? null"
      :get-canvas="() => canvasRef?.containerRef ?? null"
      :zoom-in="() => canvasRef?.zoomIn()"
      :zoom-out="() => canvasRef?.zoomOut()"
      :zoom-reset="() => canvasRef?.zoomReset()"
      :fit-all="() => canvasRef?.fitAll()"
    />
    <CanvasView ref="canvasRef" />
    <Toolbar />
    <FurnitureLibrary @place="(p) => placeFurniture(p.defId)" />
    <PropertyPanel />
    <StatusBar />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
