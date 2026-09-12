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
import type { DimensionElement, DoorElement, FurnitureElement, WallElement, WindowElement } from '@/types'
import OpeningsMask from '@/components/svg/OpeningsMask.vue'
import WallShape from '@/components/svg/WallShape.vue'
import DoorShape from '@/components/svg/DoorShape.vue'
import WindowShape from '@/components/svg/WindowShape.vue'
import FurnitureShape from '@/components/svg/FurnitureShape.vue'
import DimensionShape from '@/components/svg/DimensionShape.vue'
import RoomFaceShape from '@/components/svg/RoomFace.vue'

const editor = useEditor()
const { state } = editor
const scale = computed(() => EXPORT_SCALE)

const walls = computed(() => state.doc.elements.filter((e): e is WallElement => e.kind === 'wall'))
const doors = computed(() => state.doc.elements.filter((e): e is DoorElement => e.kind === 'door'))
const windows = computed(() => state.doc.elements.filter((e): e is WindowElement => e.kind === 'window'))
const dims = computed(() => state.doc.elements.filter((e): e is DimensionElement => e.kind === 'dimension'))
const furniture = computed(() => state.doc.elements.filter((e): e is FurnitureElement => e.kind === 'furniture'))
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
      <WallShape v-for="w in walls" :key="w.id" :wall="w" :selected="false" :scale="scale" />
      <DoorShape
        v-for="d in doors"
        :key="d.id"
        :wall="wallMap.get(d.wallId)!"
        :door="d"
        :selected="false"
        :scale="scale"
      />
      <WindowShape
        v-for="win in windows"
        :key="win.id"
        :wall="wallMap.get(win.wallId)!"
        :win="win"
        :selected="false"
        :scale="scale"
      />
      <FurnitureShape
        v-for="f in furniture"
        :key="f.id"
        :furniture="f"
        :selected="false"
        :scale="scale"
      />
      <DimensionShape
        v-for="dim in dims"
        :key="dim.id"
        :dim="dim"
        :selected="false"
        :scale="scale"
      />
    </g>
  </svg>
</template>
