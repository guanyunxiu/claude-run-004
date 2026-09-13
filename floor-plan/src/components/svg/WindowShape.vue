<script setup lang="ts">
/**
 * 窗：
 * - fixed 固定窗：洞口四线
 * - sliding 推拉窗：三线 + 中间搭接竖梃
 * - casement 平开窗：中线 + 两扇开启三角符号
 */
import { computed } from 'vue'
import type { Pt } from '@/lib/geometry'
import type { WallElement, WindowElement } from '@/types'
import { openingPlacement } from '@/lib/openings'

const props = defineProps<{
  wall: WallElement
  win: WindowElement
  selected: boolean
  scale: number
}>()

const geo = computed(() => {
  const g = openingPlacement(props.wall, props.win)
  if (!g) return null
  const t = props.wall.thickness / 2
  const style = props.win.winStyle ?? 'fixed'
  const ux = Math.cos(g.angle)
  const uy = Math.sin(g.angle)
  const nx = g.normal.x
  const ny = g.normal.y

  const at = (u: number, n: number): Pt => ({
    x: g.pStart.x + ux * u + nx * n,
    y: g.pStart.y + uy * u + ny * n
  })

  return { g, t, style, ux, uy, nx, ny, at, W: Math.hypot(g.pEnd.x - g.pStart.x, g.pEnd.y - g.pStart.y) }
})
</script>

<template>
  <g v-if="geo" class="window-shape">
    <!-- 固定窗：四线 -->
    <template v-if="geo.style === 'fixed'">
      <line
        v-for="(o, i) in [-geo.t, -geo.t / 3, geo.t / 3, geo.t]"
        :key="i"
        :x1="geo.g.pStart.x + geo.nx * o"
        :y1="geo.g.pStart.y + geo.ny * o"
        :x2="geo.g.pEnd.x + geo.nx * o"
        :y2="geo.g.pEnd.y + geo.ny * o"
        :stroke="i === 0 || i === 3 ? win.color : '#7a8aa0'"
        :stroke-width="(i === 0 || i === 3 ? 2 : 1.2) / scale"
      />
    </template>

    <!-- 推拉窗：外框两线 + 中缝两条错层线 -->
    <template v-else-if="geo.style === 'sliding'">
      <line :x1="geo.g.pStart.x + geo.nx * geo.t" :y1="geo.g.pStart.y + geo.ny * geo.t"
            :x2="geo.g.pEnd.x + geo.nx * geo.t" :y2="geo.g.pEnd.y + geo.ny * geo.t"
            :stroke="win.color" :stroke-width="2 / scale" />
      <line :x1="geo.g.pStart.x - geo.nx * geo.t" :y1="geo.g.pStart.y - geo.ny * geo.t"
            :x2="geo.g.pEnd.x - geo.nx * geo.t" :y2="geo.g.pEnd.y - geo.ny * geo.t"
            :stroke="win.color" :stroke-width="2 / scale" />
      <!-- 两扇中缝，各占一半并轻微错层 -->
      <line
        :x1="geo.at(0, geo.t * 0.25).x" :y1="geo.at(0, geo.t * 0.25).y"
        :x2="geo.at(geo.W / 2, geo.t * 0.25).x" :y2="geo.at(geo.W / 2, geo.t * 0.25).y"
        stroke="#7a8aa0" :stroke-width="1.2 / scale"
      />
      <line
        :x1="geo.at(geo.W / 2, -geo.t * 0.25).x" :y1="geo.at(geo.W / 2, -geo.t * 0.25).y"
        :x2="geo.at(geo.W, -geo.t * 0.25).x" :y2="geo.at(geo.W, -geo.t * 0.25).y"
        stroke="#7a8aa0" :stroke-width="1.2 / scale"
      />
    </template>

    <!-- 平开窗：外框 + 中线 + 两扇三角开启符号 -->
    <template v-else>
      <line :x1="geo.g.pStart.x + geo.nx * geo.t" :y1="geo.g.pStart.y + geo.ny * geo.t"
            :x2="geo.g.pEnd.x + geo.nx * geo.t" :y2="geo.g.pEnd.y + geo.ny * geo.t"
            :stroke="win.color" :stroke-width="2 / scale" />
      <line :x1="geo.g.pStart.x - geo.nx * geo.t" :y1="geo.g.pStart.y - geo.ny * geo.t"
            :x2="geo.g.pEnd.x - geo.nx * geo.t" :y2="geo.g.pEnd.y - geo.ny * geo.t"
            :stroke="win.color" :stroke-width="2 / scale" />
      <!-- 中梃 -->
      <line
        :x1="geo.at(geo.W / 2, -geo.t).x" :y1="geo.at(geo.W / 2, -geo.t).y"
        :x2="geo.at(geo.W / 2, geo.t).x" :y2="geo.at(geo.W / 2, geo.t).y"
        :stroke="win.color" :stroke-width="1.4 / scale"
      />
      <!-- 两扇开启三角形（向 normal 两侧） -->
      <polygon
        :points="`${geo.at(0, 0).x},${geo.at(0, 0).y} ${geo.at(geo.W / 2, geo.t).x},${geo.at(geo.W / 2, geo.t).y} ${geo.at(geo.W / 2, 0).x},${geo.at(geo.W / 2, 0).y}`"
        fill="none" :stroke="win.color" :stroke-width="1.2 / scale"
      />
      <polygon
        :points="`${geo.at(geo.W, 0).x},${geo.at(geo.W, 0).y} ${geo.at(geo.W / 2, -geo.t).x},${geo.at(geo.W / 2, -geo.t).y} ${geo.at(geo.W / 2, 0).x},${geo.at(geo.W / 2, 0).y}`"
        fill="none" :stroke="win.color" :stroke-width="1.2 / scale"
      />
    </template>

    <rect
      v-if="selected"
      data-selected-ui
      :x="Math.min(geo.g.pStart.x, geo.g.pEnd.x) - 5 / scale"
      :y="Math.min(geo.g.pStart.y, geo.g.pEnd.y) - 5 / scale"
      :width="Math.abs(geo.g.pEnd.x - geo.g.pStart.x) + 10 / scale"
      :height="Math.abs(geo.g.pEnd.y - geo.g.pStart.y) + 10 / scale"
      fill="none"
      stroke="#409eff"
      :stroke-width="1.2 / scale"
      :stroke-dasharray="`${5 / scale} ${4 / scale}`"
    />
  </g>
</template>
