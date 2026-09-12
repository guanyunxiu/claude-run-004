<script setup lang="ts">
/**
 * 平开门：
 * 门框两侧竖向收口线 + 门扇（合页旋转 90°）+ 开启弧线
 */
import { computed } from 'vue'
import type { DoorElement, WallElement } from '@/types'
import { openingPlacement } from '@/lib/openings'

const props = defineProps<{
  wall: WallElement
  door: DoorElement
  selected: boolean
  scale: number
}>()

const pl = computed(() => openingPlacement(props.wall, props.door))

const geo = computed(() => {
  const g = pl.value
  if (!g) return null
  const t = props.wall.thickness / 2
  const hinge = props.door.hinge === 'start' ? g.pStart : g.pEnd
  const ux = Math.cos(g.angle)
  const uy = Math.sin(g.angle)
  const nx = g.normal.x * props.door.swingSide
  const ny = g.normal.y * props.door.swingSide
  // 门扇开启 90° 时的门板端点
  const leafTip = { x: hinge.x + nx * props.door.width, y: hinge.y + ny * props.door.width }
  // 弧线终点（开启方向上的门板位），弧线起点是关闭状态门板位
  const closedTip = {
    x: hinge.x + ux * props.door.width * (props.door.hinge === 'start' ? 1 : -1),
    y: hinge.y + uy * props.door.width * (props.door.hinge === 'start' ? 1 : -1)
  }
  // 用 SVG arc 画四分之一圆
  const r = props.door.width
  const arc = `M ${closedTip.x.toFixed(1)} ${closedTip.y.toFixed(1)} A ${r} ${r} 0 0 ${
    props.door.swingSide > 0 ? 1 : 0
  } ${leafTip.x.toFixed(1)} ${leafTip.y.toFixed(1)}`
  return {
    t,
    hinge,
    leafTip,
    arc,
    jambs: [g.pStart, g.pEnd]
  }
})
</script>

<template>
  <g v-if="geo" class="door-shape">
    <!-- 两侧收口（门框） -->
    <line
      v-for="(p, i) in geo.jambs"
      :key="i"
      :x1="p.x - pl!.normal.x * geo.t"
      :y1="p.y - pl!.normal.y * geo.t"
      :x2="p.x + pl!.normal.x * geo.t"
      :y2="p.y + pl!.normal.y * geo.t"
      :stroke="door.color"
      :stroke-width="2 / scale"
    />
    <!-- 开启弧 -->
    <path :d="geo.arc" fill="none" :stroke="door.color" :stroke-width="1.2 / scale" />
    <!-- 门扇 -->
    <line
      :x1="geo.hinge.x"
      :y1="geo.hinge.y"
      :x2="geo.leafTip.x"
      :y2="geo.leafTip.y"
      :stroke="door.color"
      :stroke-width="2.4 / scale"
      stroke-linecap="round"
    />
    <circle :cx="geo.hinge.x" :cy="geo.hinge.y" :r="2.4 / scale" :fill="door.color" />
    <rect
      v-if="selected"
      data-selected-ui
      :x="Math.min(geo.hinge.x, geo.leafTip.x) - 4 / scale"
      :y="Math.min(geo.hinge.y, geo.leafTip.y) - 4 / scale"
      :width="Math.abs(geo.leafTip.x - geo.hinge.x) + 8 / scale"
      :height="Math.abs(geo.leafTip.y - geo.hinge.y) + 8 / scale"
      fill="none"
      stroke="#409eff"
      :stroke-width="1.2 / scale"
      :stroke-dasharray="`${5 / scale} ${4 / scale}`"
    />
  </g>
</template>
