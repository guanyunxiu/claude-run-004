<script setup lang="ts">
/**
 * 单个图元的统一渲染包装。
 * CanvasView 与 ExportRenderer 都按 elements 数组顺序渲染本组件，
 * 从而使数组顺序即真实绘制顺序，层级调整（置顶/置底/上移/下移）跨类型生效。
 */
import type { FloorElement } from '@/types'
import type { PropType } from 'vue'
import WallShape from './WallShape.vue'
import DoorShape from './DoorShape.vue'
import WindowShape from './WindowShape.vue'
import FurnitureShape from './FurnitureShape.vue'
import StructureShape from './StructureShape.vue'
import DimensionShape from './DimensionShape.vue'
import type { WallElement } from '@/types'

const props = defineProps({
  el: { type: Object as PropType<FloorElement>, required: true },
  selected: { type: Boolean, required: true },
  scale: { type: Number, required: true },
  wallMap: { type: Map as PropType<Map<string, WallElement>>, required: true }
})
</script>

<template>
  <WallShape
    v-if="el.kind === 'wall'"
    :wall="el"
    :selected="selected"
    :scale="scale"
  />
  <DoorShape
    v-else-if="el.kind === 'door'"
    :wall="wallMap.get(el.wallId)!"
    :door="el"
    :selected="selected"
    :scale="scale"
  />
  <WindowShape
    v-else-if="el.kind === 'window'"
    :wall="wallMap.get(el.wallId)!"
    :win="el"
    :selected="selected"
    :scale="scale"
  />
  <FurnitureShape
    v-else-if="el.kind === 'furniture'"
    :furniture="el"
    :selected="selected"
    :scale="scale"
  />
  <StructureShape
    v-else-if="el.kind === 'structure'"
    :el="el"
    :selected="selected"
    :scale="scale"
  />
  <DimensionShape
    v-else-if="el.kind === 'dimension'"
    :dim="el"
    :selected="selected"
    :scale="scale"
  />
</template>
