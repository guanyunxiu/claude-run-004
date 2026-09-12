<script setup lang="ts">
/**
 * 网格层：100mm 细网格 + 500mm 主网格，始终覆盖视口，
 * 线宽按缩放补偿保证屏幕像素一致。
 */
import { computed } from 'vue'

const props = defineProps<{
  scale: number
  tx: number
  ty: number
  viewW: number
  viewH: number
  ruler: number
  color: string
}>()

const MINOR = 250
const MAJOR = 1000

const lines = computed(() => {
  const left = -props.tx / props.scale
  const top = -props.ty / props.scale
  const right = (props.viewW - props.tx) / props.scale
  const bottom = (props.viewH - props.ty) / props.scale

  const x0 = Math.floor(left / MINOR) * MINOR
  const x1 = Math.ceil(right / MINOR) * MINOR
  const y0 = Math.floor(top / MINOR) * MINOR
  const y1 = Math.ceil(bottom / MINOR) * MINOR

  const minor: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
  for (let x = x0; x <= x1; x += MINOR) {
    minor.push({ x1: x, y1: top, x2: x, y2: bottom, major: x % MAJOR === 0 })
  }
  for (let y = y0; y <= y1; y += MINOR) {
    minor.push({ x1: left, y1: y, x2: right, y2: y, major: y % MAJOR === 0 })
  }
  return { minor, left, top, right, bottom }
})
</script>

<template>
  <g class="grid-layer" data-export-hidden>
    <line
      v-for="(l, i) in lines.minor"
      :key="i"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      :stroke="l.major ? color : color"
      :stroke-opacity="l.major ? 0.55 : 0.2"
      :stroke-width="(l.major ? 1.4 : 0.7) / scale"
    />
  </g>
</template>
