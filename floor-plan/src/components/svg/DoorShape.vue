<script setup lang="ts">
/**
 * 门：
 * - swing 平开门：门框收口 + 门扇（合页旋转 90°）+ 开启弧线
 * - double 双开门：两扇对开，各转 90° + 双弧线
 * - sliding 推拉门：洞口内两扇错层搭接 + 中线
 */
import { computed } from 'vue'
import type { Pt } from '@/lib/geometry'
import type { DoorElement, WallElement } from '@/types'
import { openingPlacement } from '@/lib/openings'

const props = defineProps<{
  wall: WallElement
  door: DoorElement
  selected: boolean
  scale: number
}>()

interface HalfArc {
  hinge: Pt
  leaf: Pt
  arc: string
}

const geo = computed(() => {
  const g = openingPlacement(props.wall, props.door)
  if (!g) return null
  const t = props.wall.thickness / 2
  const style = props.door.doorStyle ?? 'swing'
  const ux = Math.cos(g.angle)
  const uy = Math.sin(g.angle)
  const nx = g.normal.x * props.door.swingSide
  const ny = g.normal.y * props.door.swingSide
  const W = props.door.width

  const hinge = props.door.hinge === 'start' ? g.pStart : g.pEnd
  const leafTip = { x: hinge.x + nx * W, y: hinge.y + ny * W }
  const closedTip = {
    x: hinge.x + ux * W * (props.door.hinge === 'start' ? 1 : -1),
    y: hinge.y + uy * W * (props.door.hinge === 'start' ? 1 : -1)
  }
  const arc = `M ${closedTip.x.toFixed(1)} ${closedTip.y.toFixed(1)} A ${W} ${W} 0 0 ${
    props.door.swingSide > 0 ? 1 : 0
  } ${leafTip.x.toFixed(1)} ${leafTip.y.toFixed(1)}`

  // 双开门：合页在洞口两端，向中间对开
  const halves: HalfArc[] = []
  if (style === 'double') {
    const half = W / 2
    const ends: [Pt, number][] = [
      [g.pStart, 1],
      [g.pEnd, -1]
    ]
    for (const [end, dirU] of ends) {
      const leaf = { x: end.x + nx * half, y: end.y + ny * half }
      const closed = { x: end.x + ux * half * dirU, y: end.y + uy * half * dirU }
      const sweep = dirU === 1 ? (props.door.swingSide > 0 ? 1 : 0) : props.door.swingSide > 0 ? 0 : 1
      const a = `M ${closed.x.toFixed(1)} ${closed.y.toFixed(1)} A ${half} ${half} 0 0 ${sweep} ${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}`
      halves.push({ hinge: end, leaf, arc: a })
    }
  }

  // 推拉门两扇错层
  const SLIDE_OFF = 18
  let slide: { a1: Pt; a2: Pt; b1: Pt; b2: Pt; m1: Pt; m2: Pt } | null = null
  if (style === 'sliding') {
    const half = W / 2
    slide = {
      a1: { x: g.pStart.x + nx * SLIDE_OFF, y: g.pStart.y + ny * SLIDE_OFF },
      a2: { x: g.pStart.x + ux * half + nx * SLIDE_OFF, y: g.pStart.y + uy * half + ny * SLIDE_OFF },
      b1: { x: g.pEnd.x - ux * half - nx * SLIDE_OFF, y: g.pEnd.y - uy * half - ny * SLIDE_OFF },
      b2: { x: g.pEnd.x - nx * SLIDE_OFF, y: g.pEnd.y - ny * SLIDE_OFF },
      m1: { x: g.pStart.x + ux * half - nx * SLIDE_OFF, y: g.pStart.y + uy * half - ny * SLIDE_OFF },
      m2: { x: g.pStart.x + ux * half + nx * SLIDE_OFF, y: g.pStart.y + uy * half + ny * SLIDE_OFF }
    }
  }

  return { t, style, hinge, leafTip, arc, jambs: [g.pStart, g.pEnd], g, halves, slide }
})
</script>

<template>
  <g v-if="geo" class="door-shape">
    <!-- 两侧收口（门框） -->
    <line
      v-for="(p, i) in geo.jambs"
      :key="i"
      :x1="p.x - geo.g.normal.x * geo.t"
      :y1="p.y - geo.g.normal.y * geo.t"
      :x2="p.x + geo.g.normal.x * geo.t"
      :y2="p.y + geo.g.normal.y * geo.t"
      :stroke="door.color"
      :stroke-width="2 / scale"
    />

    <!-- 平开门 -->
    <template v-if="geo.style === 'swing'">
      <path :d="geo.arc" fill="none" :stroke="door.color" :stroke-width="1.2 / scale" />
      <line
        :x1="geo.hinge.x" :y1="geo.hinge.y"
        :x2="geo.leafTip.x" :y2="geo.leafTip.y"
        :stroke="door.color" :stroke-width="2.4 / scale" stroke-linecap="round"
      />
      <circle :cx="geo.hinge.x" :cy="geo.hinge.y" :r="2.4 / scale" :fill="door.color" />
    </template>

    <!-- 双开门 -->
    <template v-else-if="geo.style === 'double'">
      <template v-for="(h, i) in geo.halves" :key="i">
        <path :d="h.arc" fill="none" :stroke="door.color" :stroke-width="1.2 / scale" />
        <line
          :x1="h.hinge.x" :y1="h.hinge.y"
          :x2="h.leaf.x" :y2="h.leaf.y"
          :stroke="door.color" :stroke-width="2.2 / scale" stroke-linecap="round"
        />
        <circle :cx="h.hinge.x" :cy="h.hinge.y" :r="2.2 / scale" :fill="door.color" />
      </template>
    </template>

    <!-- 推拉门 -->
    <template v-else-if="geo.slide">
      <line :x1="geo.g.pStart.x" :y1="geo.g.pStart.y" :x2="geo.g.pEnd.x" :y2="geo.g.pEnd.y"
            :stroke="door.color" :stroke-width="1 / scale" opacity="0.4" />
      <line :x1="geo.slide.a1.x" :y1="geo.slide.a1.y" :x2="geo.slide.a2.x" :y2="geo.slide.a2.y"
            :stroke="door.color" :stroke-width="2.2 / scale" stroke-linecap="round" />
      <line :x1="geo.slide.b1.x" :y1="geo.slide.b1.y" :x2="geo.slide.b2.x" :y2="geo.slide.b2.y"
            :stroke="door.color" :stroke-width="2.2 / scale" stroke-linecap="round" />
      <line :x1="geo.slide.m1.x" :y1="geo.slide.m1.y" :x2="geo.slide.m2.x" :y2="geo.slide.m2.y"
            :stroke="door.color" :stroke-width="1.2 / scale" />
    </template>

    <rect
      v-if="selected"
      data-selected-ui
      :x="Math.min(geo.g.pStart.x, geo.g.pEnd.x) - 6 / scale"
      :y="Math.min(geo.g.pStart.y, geo.g.pEnd.y) - 24 / scale"
      :width="Math.abs(geo.g.pEnd.x - geo.g.pStart.x) + 12 / scale"
      :height="Math.abs(geo.g.pEnd.y - geo.g.pStart.y) + 48 / scale"
      fill="none"
      stroke="#409eff"
      :stroke-width="1.2 / scale"
      :stroke-dasharray="`${5 / scale} ${4 / scale}`"
    />
  </g>
</template>
