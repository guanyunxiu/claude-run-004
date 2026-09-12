<script setup lang="ts">
/** 闭合房间：浅色填充 + 面积/周长标签（自动计算） */
import { computed } from 'vue'
import type { RoomFace } from '@/types'
import { polygonCentroid } from '@/lib/geometry'
import { formatArea, formatPerimeter } from '@/lib/format'

const props = defineProps<{
  room: RoomFace
  scale: number
}>()

const centroid = computed(() => polygonCentroid(props.room.points) ?? { x: 0, y: 0 })
const polyPoints = computed(() => props.room.points.map((p) => `${p.x},${p.y}`).join(' '))
const fontSize = computed(() => 15 / props.scale)
const smallSize = computed(() => 11 / props.scale)
</script>

<template>
  <g class="room-face">
    <polygon
      :points="polyPoints"
      fill="rgba(64, 158, 255, 0.08)"
      stroke="rgba(64, 158, 255, 0.65)"
      :stroke-width="1 / scale"
      :stroke-dasharray="`${6 / scale} ${5 / scale}`"
    />
    <text
      :x="centroid.x"
      :y="centroid.y"
      :font-size="fontSize"
      fill="#337ecc"
      text-anchor="middle"
      dominant-baseline="central"
      style="font-weight: 600"
    >
      {{ formatArea(room.area) }}
    </text>
    <text
      :x="centroid.x"
      :y="centroid.y + fontSize * 1.15"
      :font-size="smallSize"
      fill="#6ea3d8"
      text-anchor="middle"
      dominant-baseline="central"
    >
      周长 {{ formatPerimeter(room.perimeter) }}
    </text>
  </g>
</template>
