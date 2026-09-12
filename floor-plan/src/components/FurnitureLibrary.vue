<script setup lang="ts">
import { computed } from 'vue'
import { FURNITURE_DEFS, type FurnitureCategory } from '@/lib/furniture'

const emit = defineEmits<{
  (e: 'place', payload: { defId: string; x: number; y: number }): void
}>()

const groups: { key: FurnitureCategory; label: string }[] = [
  { key: 'bed', label: '卧室' },
  { key: 'sofa', label: '客厅' },
  { key: 'table', label: '桌椅' },
  { key: 'storage', label: '储物' },
  { key: 'kitchen', label: '厨房' },
  { key: 'bath', label: '卫浴' }
]

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
</style>
