<script setup lang="ts">
import { computed } from 'vue'
import { useEditor } from '@/store/useEditor'
import { formatLength } from '@/lib/format'

const editor = useEditor()
const { state } = editor

const pos = computed(() => {
  const p = state.cursorWorld
  if (!p) return '—'
  return `X ${Math.round(p.x)}　Y ${Math.round(p.y)} mm`
})

const selectionInfo = computed(() => {
  const n = state.selection.size
  if (!n) return '未选中'
  const kinds: Record<string, string> = {
    wall: '墙',
    door: '门',
    window: '窗',
    furniture: '家具',
    dimension: '标注'
  }
  const arr = [...state.selection]
    .map((id) => state.doc.elements.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => kinds[e!.kind] ?? e!.kind)
  const counts: Record<string, number> = {}
  arr.forEach((k) => (counts[k] = (counts[k] ?? 0) + 1))
  return Object.entries(counts)
    .map(([k, v]) => `${k}×${v}`)
    .join(' ')
})

const hints: Record<string, string> = {
  select:
    '左键点选 / Shift 加选 / 空白处框选(Shift=追加) · Ctrl+C/X/V 复制剪切粘贴 · Ctrl+D 原地副本 · Ctrl+]/[ 层级 · Delete 删除 · 方向键微移(Shift=250mm)',
  pan: '拖拽平移，或在任意模式按住空格临时平移 · 滚轮以光标为中心缩放',
  wall: '单击依次添加顶点（端点/中点/交点吸附）· 45° 锁定下吸附 45° 倍数，按住 Shift 自由角度 · 单击起点或双击/右键结束 · Esc 取消',
  door: '在墙体上点击放置平开门（可在属性面板调整门宽/合页/开启方向）',
  window: '在墙体上点击放置固定窗',
  dimension: '依次点击两点创建线性标注（可吸附墙顶点，墙改动后数值自动更新）',
  'angle-dim': '依次点击 顶点 → 起始边点 → 终止边点 创建角度标注（自动跟随墙体更新）',
  measure: '依次点击两点进行临时测距（不落库，Esc 清除）'
}
</script>

<template>
  <footer class="statusbar">
    <span class="hint">{{ hints[state.mode] }}</span>
    <span class="sep" />
    <span>{{ selectionInfo }}</span>
    <span class="sep" />
    <span class="mono">{{ pos }}</span>
  </footer>
</template>

<style scoped>
.statusbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 26px;
  z-index: 30;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--fp-border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  color: #606266;
  gap: 10px;
}
.hint {
  color: #909399;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.sep {
  width: 1px;
  height: 12px;
  background: #dcdfe6;
}
</style>
