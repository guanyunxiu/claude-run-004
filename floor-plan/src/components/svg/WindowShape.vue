<script setup lang="ts">
/**
 * 固定窗：洞口四线（两条窗框 + 两条玻璃线）
 */
import { computed } from 'vue'
import type { WallElement, WindowElement } from '@/types'
import { openingPlacement } from '@/lib/openings'

const props = defineProps<{
  wall: WallElement
  win: WindowElement
  selected: boolean
  scale: number
}>()

const lines = computed(() => {
  const g = openingPlacement(props.wall, props.win)
  if (!g) return null
  const t = props.wall.thickness / 2
  const offsets = [-t, -t / 3, t / 3, t]
  return {
    g,
    segs: offsets.map((o) => ({
      x1: g.pStart.x + g.normal.x * o,
      y1: g.pStart.y + g.normal.y * o,
      x2: g.pEnd.x + g.normal.x * o,
      y2: g.pEnd.y + g.normal.y * o
    }))
  }
})
</script>

<template>
  <g v-if="lines" class="window-shape">
    <line
      v-for="(s, i) in lines.segs"
      :key="i"
      :x1="s.x1"
      :y1="s.y1"
      :x2="s.x2"
      :y2="s.y2"
      :stroke="i === 0 || i === 3 ? win.color : '#7a8aa0'"
      :stroke-width="(i === 0 || i === 3 ? 2 : 1.2) / scale"
    />
    <rect
      v-if="selected"
      data-selected-ui
      :x="Math.min(lines.g.pStart.x, lines.g.pEnd.x) - 5 / scale"
      :y="Math.min(lines.g.pStart.y, lines.g.pEnd.y) - 5 / scale"
      :width="Math.abs(lines.g.pEnd.x - lines.g.pStart.x) + 10 / scale"
      :height="Math.abs(lines.g.pEnd.y - lines.g.pStart.y) + 10 / scale"
      fill="none"
      stroke="#409eff"
      :stroke-width="1.2 / scale"
      :stroke-dasharray="`${5 / scale} ${4 / scale}`"
    />
  </g>
</template>
