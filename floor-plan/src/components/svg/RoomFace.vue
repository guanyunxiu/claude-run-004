<script setup lang="ts">
/**
 * 闭合房间：填充（默认浅色或自定义）+ 名称/面积标签（可拖动位置）
 */
import { computed } from 'vue'
import type { RoomFace } from '@/types'
import { polygonCentroid } from '@/lib/geometry'
import { formatPerimeter } from '@/lib/format'
import { roomLabelText } from '@/lib/roomMeta'

const props = defineProps<{
  room: RoomFace
  scale: number
  selected?: boolean
}>()

const centroid = computed(() => polygonCentroid(props.room.points) ?? { x: 0, y: 0 })
const labelPos = computed(() => props.room.meta?.labelPos ?? centroid.value)
const polyPoints = computed(() => props.room.points.map((p) => `${p.x},${p.y}`).join(' '))
const fontSize = computed(() => 15 / props.scale)
const smallSize = computed(() => 11 / props.scale)
const hasName = computed(() => !!props.room.meta?.name?.trim())

// 净面积（柱/烟道扣减）与建筑面积
const areaText = computed(() => roomLabelText(props.room, props.room.netArea < props.room.area - 1))
const showNet = computed(() => props.room.netArea < props.room.area - 1)
const grossText = computed(() => `${(props.room.area / 1e6).toFixed(1).replace(/\.0$/, '')}㎡`)
</script>

<template>
  <g class="room-face">
    <polygon
      :points="polyPoints"
      :fill="room.meta?.fill || 'rgba(64, 158, 255, 0.08)'"
      :stroke="room.meta?.fill ? 'rgba(0,0,0,0.25)' : 'rgba(64, 158, 255, 0.65)'"
      :stroke-width="1 / scale"
      :stroke-dasharray="room.meta?.fill ? 'none' : `${6 / scale} ${5 / scale}`"
    />
    <text
      :x="labelPos.x"
      :y="labelPos.y"
      :font-size="hasName ? fontSize * 1.05 : fontSize"
      :fill="room.meta?.fill ? (selected ? '#1d6fe0' : '#303133') : '#337ecc'"
      text-anchor="middle"
      dominant-baseline="central"
      :style="{ fontWeight: selected ? 800 : 700 }"
    >
      {{ areaText }}
    </text>
    <text
      v-if="hasName || showNet"
      :x="labelPos.x"
      :y="labelPos.y + fontSize * 1.15"
      :font-size="smallSize"
      fill="#909399"
      text-anchor="middle"
      dominant-baseline="central"
    >
      <template v-if="showNet">建筑 {{ grossText }} · </template>周长 {{ formatPerimeter(room.perimeter) }}
    </text>
  </g>
</template>
