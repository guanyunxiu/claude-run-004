<script lang="ts">
/** 导出固定基准比例，与视口缩放无关 */
export const EXPORT_SCALE = 0.5
</script>

<script setup lang="ts">
/**
 * 离屏导出渲染器：以固定基准比例 EXPORT_SCALE 独立渲染一份纯图纸 SVG，
 * 与当前视口缩放/标尺/网格/选中态完全无关，保证导出线宽稳定一致。
 * 仅在导出时短暂挂载，放在屏幕外，不影响交互。
 */
import { computed } from 'vue'
import { useEditor } from '@/store/useEditor'
import type { DoorElement, WallElement, WindowElement } from '@/types'
import OpeningsMask from '@/components/svg/OpeningsMask.vue'
import WorldElement from '@/components/svg/WorldElement.vue'
import RoomFaceShape from '@/components/svg/RoomFace.vue'

const editor = useEditor()
const { state } = editor
const scale = computed(() => EXPORT_SCALE)

const walls = computed(() => state.doc.elements.filter((e): e is WallElement => e.kind === 'wall'))
const doors = computed(() => state.doc.elements.filter((e): e is DoorElement => e.kind === 'door'))
const windows = computed(() => state.doc.elements.filter((e): e is WindowElement => e.kind === 'window'))
const wallMap = computed(() => new Map(walls.value.map((w) => [w.id, w])))
</script>

<template>
  <svg
    class="export-svg"
    width="10"
    height="10"
    viewBox="0 0 10 10"
    style="position: fixed; left: -10000px; top: -10000px; width: 10px; height: 10px; pointer-events: none"
  >
    <!-- 导出时外层会把 transform 替换为 bbox 平移 + 固定缩放；此处先建立 world-content 结构 -->
    <g class="world-content" transform="scale(0.5)">
      <OpeningsMask :walls="walls" :doors="doors" :windows="windows" />
      <RoomFaceShape v-for="r in editor.rooms.value" :key="r.id" :room="r" :scale="scale" />
      <WorldElement
        v-for="el in state.doc.elements"
        :key="el.id"
        :el="el"
        :selected="false"
        :scale="scale"
        :wall-map="wallMap"
      />
    </g>
  </svg>
</template>
