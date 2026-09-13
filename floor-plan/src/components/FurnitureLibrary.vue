<script setup lang="ts">
import { computed, ref } from 'vue'
import { FURNITURE_DEFS, getCustomFurniture, removeCustomFurniture, saveCustomFurniture, type FurnitureDef, type FurnitureCategory } from '@/lib/furniture'
import type { StructureKind } from '@/types'

const emit = defineEmits<{
  (e: 'place', payload: { defId: string; x: number; y: number }): void
  (e: 'place-structure', payload: { kind: StructureKind }): void
  (e: 'add-custom'): void
}>()

const structures: { kind: StructureKind; name: string; icon: string }[] = [
  { kind: 'column', name: '柱子', icon: '■' },
  { kind: 'flue', name: '烟道', icon: '⊠' },
  { kind: 'platform', name: '地台', icon: '▭' }
]

const groups: { key: FurnitureCategory; label: string }[] = [
  { key: 'bed', label: '卧室' },
  { key: 'sofa', label: '客厅' },
  { key: 'table', label: '桌椅' },
  { key: 'storage', label: '储物' },
  { key: 'kitchen', label: '厨房' },
  { key: 'bath', label: '卫浴' }
]

const customItems = ref<FurnitureDef[]>(getCustomFurniture())
const customFile = ref<HTMLInputElement | null>(null)

function removeCustom(e: Event, id: string) {
  e.stopPropagation()
  removeCustomFurniture(id)
  customItems.value = getCustomFurniture()
}

/** 导出全部自定义家具为 JSON 文件，便于迁移/分享 */
function exportCustom() {
  const data = JSON.stringify(getCustomFurniture(), null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'custom-furniture.json'
  a.click()
  URL.revokeObjectURL(a.href)
}
function onImportCustom(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const arr = JSON.parse(String(reader.result)) as FurnitureDef[]
      if (!Array.isArray(arr)) throw new Error('格式错误')
      // 合并写回（直接调用 saveCustomFurniture 全量保存）
      const merged = [...getCustomFurniture()]
      for (const d of arr) {
        if (!d.id || !d.body) continue
        const idx = merged.findIndex((x) => x.id === d.id)
        const full: FurnitureDef = { ...d, vb: 100, category: d.category ?? 'table' }
        if (idx >= 0) merged[idx] = full
        else merged.push(full)
      }
      saveCustomFurniture(merged)
      customItems.value = getCustomFurniture()
    } catch {
      /* 忽略非法文件 */
    }
  }
  reader.readAsText(file)
  input.value = ''
}

const grouped = computed(() =>
  groups.map((g) => ({
    label: g.label,
    items: FURNITURE_DEFS.filter((d) => d.category === g.key)
  }))
)

function onDragStart(e: DragEvent, defId: string) {
  e.dataTransfer?.setData('application/furniture', defId)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function clickPlace(defId: string) {
  emit('place', { defId, x: 0, y: 0 })
}
</script>

<template>
  <div class="lib-panel">
    <div class="title">家具库</div>
    <div class="tip">拖拽到画布放置，或点击放置到视图中心</div>

    <!-- 结构构件 -->
    <div class="group">
      <div class="group-title">结构构件</div>
      <div class="items">
        <div
          v-for="s in structures"
          :key="s.kind"
          class="item"
          :title="s.name"
          @click="emit('place-structure', { kind: s.kind })"
        >
          <span class="struct-icon">{{ s.icon }}</span>
          <span>{{ s.name }}</span>
        </div>
      </div>
    </div>

    <!-- 自定义家具 -->
    <div class="group">
      <div class="group-title custom-title">
        我的家具
        <span class="custom-actions">
          <button class="add-btn" title="上传自定义 SVG 家具" @click="emit('add-custom')">+ SVG</button>
          <button class="add-btn ghost" title="导入 JSON" @click="customFile?.click()">导入</button>
          <button class="add-btn ghost" title="导出为 JSON" @click="exportCustom">导出</button>
        </span>
      </div>
      <input ref="customFile" type="file" accept=".json,application/json" style="display:none" @change="onImportCustom" />
      <div class="items">
        <div
          v-for="d in customItems"
          :key="d.id"
          class="item custom-item"
          draggable="true"
          :title="`${d.name}（右键删除）`"
          @dragstart="onDragStart($event, d.id)"
          @click="clickPlace(d.id)"
        >
          <svg viewBox="0 0 100 100" width="34" height="34" color="#5a6472" v-html="d.body" />
          <span>{{ d.name }}</span>
          <button class="del-btn" title="删除" @click="removeCustom($event, d.id)">×</button>
        </div>
        <div v-if="customItems.length === 0" class="empty-custom">点击“上传”添加自定义 SVG</div>
      </div>
    </div>

    <div v-for="grp in grouped" :key="grp.label" class="group">
      <div class="group-title">{{ grp.label }}</div>
      <div class="items">
        <div
          v-for="d in grp.items"
          :key="d.id"
          class="item"
          draggable="true"
          :title="`${d.name} ${d.width}×${d.height}mm`"
          @dragstart="onDragStart($event, d.id)"
          @click="clickPlace(d.id)"
        >
          <svg viewBox="0 0 100 100" width="34" height="34" color="#5a6472" v-html="d.body" />
          <span>{{ d.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-panel {
  position: absolute;
  left: 92px;
  top: 12px;
  bottom: 12px;
  width: 196px;
  z-index: 19;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--fp-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 10px 12px;
  overflow-y: auto;
}
.title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.tip {
  font-size: 11px;
  color: #909399;
  margin: 4px 0 8px;
}
.group-title {
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  margin: 8px 0 4px;
}
.items {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: grab;
  background: #fff;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.18);
}
.item:active {
  cursor: grabbing;
}
.item span {
  font-size: 11px;
  color: #606266;
}
.struct-icon {
  font-size: 22px;
  color: #303133;
  line-height: 34px;
}
.custom-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.add-btn {
  border: 1px solid #409eff;
  background: #ecf5ff;
  color: #409eff;
  font-size: 10px;
  border-radius: 4px;
  padding: 1px 6px;
  cursor: pointer;
}
.add-btn:hover {
  background: #409eff;
  color: #fff;
}
.custom-actions {
  display: inline-flex;
  gap: 3px;
}
.add-btn.ghost {
  border-color: #c0c4cc;
  background: #fff;
  color: #606266;
}
.add-btn.ghost:hover {
  background: #f4f4f5;
  color: #303133;
}
.custom-item {
  position: relative;
}
.del-btn {
  position: absolute;
  top: 0;
  right: 2px;
  border: none;
  background: rgba(245, 108, 108, 0.9);
  color: #fff;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 10px;
  line-height: 14px;
  padding: 0;
  cursor: pointer;
}
.empty-custom {
  grid-column: 1 / -1;
  font-size: 10px;
  color: #c0c4cc;
  padding: 6px 0;
  text-align: center;
}
</style>
