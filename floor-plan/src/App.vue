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
import { getFurnitureDef, addCustomFurniture, normalizeCustomBody } from '@/lib/furniture'
import type { Pt } from '@/lib/geometry'
import type { StructureKind } from '@/types'

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

const placeSeq = ref(0)

function placeFurniture(defId: string, world?: Pt) {
  const def = getFurnitureDef(defId)
  if (!def) return
  let x = world?.x ?? 0
  let y = world?.y ?? 0
  if (!world && canvasRef.value) {
    // 点击家具库按钮：放到当前视图中心，并带阶梯偏移避免多次放置完全重叠
    const el = canvasRef.value.containerRef as HTMLDivElement
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const w = useViewport().screenToWorld(cx, cy, rect)
    const step = (placeSeq.value % 6) * 120
    x = w.x + step
    y = w.y + step
    placeSeq.value++
  } else {
    placeSeq.value = 0
  }
  editor.pushHistory()
  const f = editor.makeFurniture(defId, x, y, def.width, def.height)
  editor.addElement(f, false)
  editor.setMode('select')
  editor.selectOnly([f.id])
}

// 结构构件放置（视图中心 + 阶梯偏移）
const structSeq = ref(0)
function placeStructure(kind: StructureKind) {
  if (!canvasRef.value) return
  const el = canvasRef.value.containerRef as HTMLDivElement
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const w = useViewport().screenToWorld(cx, cy, rect)
  const step = (structSeq.value % 6) * 120
  editor.pushHistory()
  const s = editor.makeStructure(kind, w.x + step, w.y + step)
  editor.addElement(s, false)
  structSeq.value++
  editor.setMode('select')
  editor.selectOnly([s.id])
}

// 自定义家具上传：读取 SVG 文件 + 弹框填写尺寸/名称
const fileInput = ref<HTMLInputElement | null>(null)
function onAddCustom() {
  fileInput.value?.click()
}
function onCustomFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const raw = String(reader.result || '')
    const body = normalizeCustomBody(raw)
    if (!body) return
    const name = window.prompt('家具名称', file.name.replace(/\.svg$/i, ''))
    if (!name) return
    const wStr = window.prompt('宽度（mm）', '800')
    const hStr = window.prompt('深度（mm）', '600')
    const width = Math.max(100, Number(wStr) || 800)
    const height = Math.max(100, Number(hStr) || 600)
    const id = `custom_${Date.now().toString(36)}`
    addCustomFurniture({ id, name, width, height, body })
    placeFurniture(id)
  }
  reader.readAsText(file)
  input.value = ''
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
    <FurnitureLibrary
      @place="(p) => placeFurniture(p.defId)"
      @place-structure="(p) => placeStructure(p.kind)"
      @add-custom="onAddCustom"
    />
    <input ref="fileInput" type="file" accept=".svg,image/svg+xml" style="display: none" @change="onCustomFile" />
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
