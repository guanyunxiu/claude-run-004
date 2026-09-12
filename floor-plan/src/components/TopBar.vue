<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEditor } from '@/store/useEditor'
import { exportPng, exportPngByDom, contentBBox } from '@/lib/exporter'
import { formatArea } from '@/lib/format'

const props = defineProps<{
  getSvg: () => SVGSVGElement | null
  getCanvas: () => HTMLDivElement | null
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  fitAll: () => void
}>()

const editor = useEditor()
const { state } = editor
const exporting = ref(false)

const totalArea = () => {
  // 房间总面积（去重：同一闭合环不会重复，相邻房间共享墙体没问题）
  const sum = editor.rooms.value.reduce((s, r) => s + r.area, 0)
  return sum
}

async function doExport(ratio = 2) {
  if (exporting.value) return
  const svg = props.getSvg()
  if (!svg) {
    ElMessage.error('未找到画布')
    return
  }
  exporting.value = true
  try {
    const bbox = contentBBox(state.doc.elements)
    await exportPng(svg, {
      bbox,
      pixelRatio: ratio,
      background: state.doc.settings.bgColor
    })
    ElMessage.success(`已导出 ${ratio}x 高清 PNG`)
  } catch (err) {
    console.warn('SVG 导出失败，回退 html2canvas', err)
    try {
      const el = props.getCanvas()
      if (el) await exportPngByDom(el, ratio)
    } catch (e) {
      ElMessage.error('导出失败')
      console.error(e)
    }
  } finally {
    exporting.value = false
  }
}

async function clearDoc() {
  try {
    await ElMessageBox.confirm('确定清空画布？此操作可撤销。', '清空画布', { type: 'warning' })
    editor.clearAll()
  } catch {
    /* cancel */
  }
}

function exportJson() {
  const data = JSON.stringify(state.doc, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `floorplan_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importJson() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result))
        if (!Array.isArray(doc.elements)) throw new Error('格式不正确')
        editor.loadDoc(doc)
        ElMessage.success('已导入户型文件')
      } catch (e) {
        ElMessage.error('导入失败：' + (e as Error).message)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

function modeLabel(): string {
  const map: Record<string, string> = {
    select: '选择',
    pan: '平移',
    wall: '画墙',
    door: '放置门',
    window: '放置窗',
    dimension: '标注',
    'angle-dim': '角度',
    measure: '测距'
  }
  return map[state.mode] ?? state.mode
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1d6fe0" stroke-width="1.8">
        <path d="M3 10.5L12 3l9 7.5V21H3z" stroke-linejoin="round" />
        <path d="M9 21v-7h6v7" />
      </svg>
      <span>户型图绘制工具</span>
    </div>

    <div class="spacer" />

    <div class="rooms-info" v-if="editor.rooms.value.length">
      <el-tag size="small" type="success" effect="plain">
        房间 {{ editor.rooms.value.length }} 个 · 总面积 {{ formatArea(totalArea()) }}
      </el-tag>
    </div>

    <div class="zoom-group">
      <button class="zbtn" title="缩小" @click="zoomOut">−</button>
      <button class="zval" title="重置缩放" @click="zoomReset">{{ Math.round(state.viewport.scale * 100) }}%</button>
      <button class="zbtn" title="放大" @click="zoomIn">+</button>
      <button class="zbtn fit" title="适配视图" @click="fitAll">适</button>
    </div>

    <div class="actions">
      <button class="abtn" @click="importJson">导入</button>
      <button class="abtn" @click="exportJson">保存 JSON</button>
      <button class="abtn danger" @click="clearDoc">清空</button>
      <button class="abtn primary" :disabled="exporting" @click="doExport(2)">
        {{ exporting ? '导出中…' : '导出 PNG' }}
      </button>
      <button class="abtn primary" :disabled="exporting" @click="doExport(3)">3x</button>
    </div>

    <div class="mode-tag">
      <span class="dot" />{{ modeLabel() }}
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 48px;
  z-index: 30;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid var(--fp-border);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
  backdrop-filter: blur(6px);
}
.brand {
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.spacer {
  flex: 0 1 24px;
}
.zoom-group {
  display: flex;
  align-items: center;
  border: 1px solid var(--fp-border);
  border-radius: 7px;
  overflow: hidden;
}
.zbtn,
.zval {
  border: none;
  background: #fff;
  width: 34px;
  height: 28px;
  cursor: pointer;
  color: #4a5568;
  border-right: 1px solid var(--fp-border);
  font-size: 13px;
}
.zbtn:last-child {
  border-right: none;
}
.zbtn.fit {
  font-size: 12px;
}
.zval {
  width: 56px;
}
.zbtn:hover,
.zval:hover {
  background: #f0f5ff;
  color: #1d6fe0;
}
.actions {
  display: flex;
  gap: 6px;
}
.abtn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--fp-border);
  background: #fff;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: #4a5568;
}
.abtn:hover {
  border-color: #409eff;
  color: #1d6fe0;
}
.abtn.primary {
  background: #1d6fe0;
  color: #fff;
  border-color: #1d6fe0;
}
.abtn.primary:hover {
  background: #2f80ed;
  color: #fff;
}
.abtn.danger {
  color: #f56c6c;
}
.abtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mode-tag {
  position: absolute;
  right: 16px;
  bottom: -22px;
  background: #1d6fe0;
  color: #fff;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 0 0 8px 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}
.rooms-info {
  margin-right: 4px;
}
</style>
