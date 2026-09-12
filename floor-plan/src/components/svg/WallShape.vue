<script setup lang="ts">
import { computed } from 'vue'
import type { WallElement } from '@/types'
import { wallOutlinePath } from '@/lib/geometry'

const props = defineProps<{
  wall: WallElement
  selected: boolean
  scale: number
}>()

const d = computed(() => wallOutlinePath(props.wall.points, props.wall.thickness, props.wall.closed))
const handleR = computed(() => 6 / props.scale)
const handleFill = '#409eff'
</script>

<template>
  <g class="wall-shape">
    <path :d="d" :fill="wall.color" stroke="none" fill-rule="evenodd" mask="url(#wall-openings-mask)" />
    <template v-if="selected">
      <!-- 中心线 -->
      <polyline
        data-selected-ui
        :points="wall.points.map((p) => `${p.x},${p.y}`).join(' ')"
        fill="none"
        stroke="#409eff"
        stroke-width="1.5"
        :stroke-dasharray="`${8 / scale} ${6 / scale}`"
        opacity="0.9"
      />
      <!-- 端点手柄 -->
      <circle
        v-for="(p, i) in wall.points"
        :key="i"
        data-selected-ui
        :cx="p.x"
        :cy="p.y"
        :r="handleR"
        :fill="handleFill"
        stroke="#fff"
        :stroke-width="1.5 / scale"
      />
    </template>
  </g>
</template>
