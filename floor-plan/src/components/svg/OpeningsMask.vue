<script setup lang="ts">
/**
 * 墙体开洞遮罩：白色通铺 + 每个门窗洞口位置黑色矩形，
 * 所有墙路径 fill 时引用此 mask，实现真实洞口。
 */
import { computed } from 'vue'
import type { WallElement, DoorElement, WindowElement } from '@/types'
import { openingPlacement } from '@/lib/openings'

const props = defineProps<{
  walls: WallElement[]
  doors: DoorElement[]
  windows: WindowElement[]
}>()

interface Cut {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

const cuts = computed<Cut[]>(() => {
  const out: Cut[] = []
  const map = new Map(props.walls.map((w) => [w.id, w]))
  for (const op of [...props.doors, ...props.windows]) {
    const wall = map.get(op.wallId)
    if (!wall) continue
    const pl = openingPlacement(wall, op)
    if (!pl) continue
    out.push({
      x: pl.pStart.x,
      y: pl.pStart.y,
      width: op.width,
      height: wall.thickness + 4,
      angle: (pl.angle * 180) / Math.PI
    })
  }
  return out
})
</script>

<template>
  <defs>
    <mask
      id="wall-openings-mask"
      maskUnits="userSpaceOnUse"
      maskContentUnits="userSpaceOnUse"
    >
      <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="white" />
      <rect
        v-for="(c, i) in cuts"
        :key="i"
        :x="c.x"
        :y="c.y - c.height / 2"
        :width="c.width"
        :height="c.height"
        :transform="`rotate(${c.angle} ${c.x} ${c.y})`"
        fill="black"
      />
    </mask>
  </defs>
</template>
