<script setup lang="ts">
/**
 * 尺寸标注：
 * - linear 线性标注：被测点 p1-p2，标注线按法向偏移 offsetDistance，
 *   两端延伸线 + 斜端 tick + 中部长度文本；
 * - angle 角度标注：顶点 vertex、两射线 ray1/ray2，绘制圆弧 + 角度文本，
 *   数值随墙体改动自动更新（坐标由 dimensionSync 维护）。
 */
import { computed } from 'vue'
import type { DimensionElement } from '@/types'
import { Vec2, angleArc, type Pt } from '@/lib/geometry'
import { formatLength } from '@/lib/format'

const props = defineProps<{
  dim: DimensionElement
  selected: boolean
  scale: number
}>()

const linear = computed(() => {
  const dx = props.dim.p2.x - props.dim.p1.x
  const dy = props.dim.p2.y - props.dim.p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const off = props.dim.offsetDistance
  const q1 = { x: props.dim.p1.x + nx * off, y: props.dim.p1.y + ny * off }
  const q2 = { x: props.dim.p2.x + nx * off, y: props.dim.p2.y + ny * off }
  const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }
  const ext = 80
  const lenMm = Vec2.dist(props.dim.p1, props.dim.p2)
  return { q1, q2, mid, nx, ny, ext, lenMm }
})

const angle = computed(() => {
  const d = props.dim
  if (d.dimType !== 'angle' || !d.vertex || !d.ray1 || !d.ray2) return null
  const arc = angleArc(d.vertex, d.ray1, d.ray2, d.radius ?? 500)
  if (!arc) return null
  const r = Math.max(50, d.radius ?? 500)
  // 文本位于角平分线
  let midAng = Math.atan2(arc.p2.y - d.vertex.y, arc.p2.x - d.vertex.x)
  const a1 = Math.atan2(arc.p1.y - d.vertex.y, arc.p1.x - d.vertex.x)
  const a2 = Math.atan2(arc.p2.y - d.vertex.y, arc.p2.x - d.vertex.x)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  midAng = a1 + delta / 2
  const labelPos = {
    x: d.vertex.x + Math.cos(midAng) * (r + 220),
    y: d.vertex.y + Math.sin(midAng) * (r + 220)
  }
  const arcPath = `M ${arc.p1.x} ${arc.p1.y} A ${r} ${r} 0 ${arc.large} ${arc.sweep} ${arc.p2.x} ${arc.p2.y}`
  // 半径手柄（弧中点外侧）
  const handle = {
    x: d.vertex.x + Math.cos(midAng) * r,
    y: d.vertex.y + Math.sin(midAng) * r
  }
  // 弧端 tick：垂直于顶点->弧端的径向
  const tickLen = tickSkew.value
  const perp = (p: Pt) => {
    const vx = p.x - d.vertex!.x
    const vy = p.y - d.vertex!.y
    const l = Math.hypot(vx, vy) || 1
    const px = -vy / l
    const py = vx / l
    return {
      a: { x: p.x - px * tickLen, y: p.y - py * tickLen },
      b: { x: p.x + px * tickLen, y: p.y + py * tickLen }
    }
  }
  const tick1 = perp(arc.p1)
  const tick2 = perp(arc.p2)
  return { arc, r, arcPath, labelPos, handle, angleDeg: arc.angleDeg, tick1, tick2 }
})

const fontSize = computed(() => 13 / props.scale)
const sw = computed(() => props.dim.strokeWidth / props.scale)
const tickSkew = computed(() => 40 / props.scale)
const labelText = computed(() => (angle.value ? `${angle.value.angleDeg.toFixed(1)}°` : formatLength(linear.value.lenMm)))
</script>

<template>
  <g class="dimension-shape">
    <!-- ============ 角度标注 ============ -->
    <template v-if="dim.dimType === 'angle' && angle">
      <line
        :x1="dim.vertex!.x"
        :y1="dim.vertex!.y"
        :x2="angle.arc.p1.x"
        :y2="angle.arc.p1.y"
        :stroke="dim.color"
        :stroke-width="sw"
        opacity="0.55"
      />
      <line
        :x1="dim.vertex!.x"
        :y1="dim.vertex!.y"
        :x2="angle.arc.p2.x"
        :y2="angle.arc.p2.y"
        :stroke="dim.color"
        :stroke-width="sw"
        opacity="0.55"
      />
      <path :d="angle.arcPath" fill="none" :stroke="dim.color" :stroke-width="sw" />
      <!-- 弧端 tick（垂直于径向） -->
      <line
        :x1="angle.tick1.a.x"
        :y1="angle.tick1.a.y"
        :x2="angle.tick1.b.x"
        :y2="angle.tick1.b.y"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <line
        :x1="angle.tick2.a.x"
        :y1="angle.tick2.a.y"
        :x2="angle.tick2.b.x"
        :y2="angle.tick2.b.y"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <rect
        :x="angle.labelPos.x - labelText.length * fontSize * 0.34"
        :y="angle.labelPos.y - fontSize * 0.7"
        :width="labelText.length * fontSize * 0.68"
        :height="fontSize * 1.4"
        fill="#ffffff"
        opacity="0.9"
      />
      <text
        :x="angle.labelPos.x"
        :y="angle.labelPos.y"
        :font-size="fontSize"
        :fill="dim.color"
        text-anchor="middle"
        dominant-baseline="central"
        style="font-family: ui-monospace, Menlo, Consolas, monospace"
      >{{ labelText }}</text>

      <template v-if="selected">
        <circle data-selected-ui :cx="dim.vertex!.x" :cy="dim.vertex!.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
        <circle data-selected-ui :cx="dim.ray1!.x" :cy="dim.ray1!.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
        <circle data-selected-ui :cx="dim.ray2!.x" :cy="dim.ray2!.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
        <circle data-selected-ui :cx="angle.handle.x" :cy="angle.handle.y" :r="5 / scale" fill="#e6a23c" stroke="#fff" :stroke-width="sw" />
      </template>
    </template>

    <!-- ============ 线性标注 ============ -->
    <template v-else>
      <!-- 延伸线 -->
      <line
        :x1="dim.p1.x - linear.nx * 20"
        :y1="dim.p1.y - linear.ny * 20"
        :x2="linear.q1.x + linear.nx * linear.ext"
        :y2="linear.q1.y + linear.ny * linear.ext"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <line
        :x1="dim.p2.x - linear.nx * 20"
        :y1="dim.p2.y - linear.ny * 20"
        :x2="linear.q2.x + linear.nx * linear.ext"
        :y2="linear.q2.y + linear.ny * linear.ext"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <!-- 标注线 -->
      <line :x1="linear.q1.x" :y1="linear.q1.y" :x2="linear.q2.x" :y2="linear.q2.y" :stroke="dim.color" :stroke-width="sw" />
      <!-- 端点斜 tick -->
      <line
        :x1="linear.q1.x + linear.nx * tickSkew"
        :y1="linear.q1.y + linear.ny * tickSkew"
        :x2="linear.q1.x - linear.nx * tickSkew"
        :y2="linear.q1.y - linear.ny * tickSkew"
        :transform="`rotate(30 ${linear.q1.x} ${linear.q1.y})`"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <line
        :x1="linear.q2.x + linear.nx * tickSkew"
        :y1="linear.q2.y + linear.ny * tickSkew"
        :x2="linear.q2.x - linear.nx * tickSkew"
        :y2="linear.q2.y - linear.ny * tickSkew"
        :transform="`rotate(30 ${linear.q2.x} ${linear.q2.y})`"
        :stroke="dim.color"
        :stroke-width="sw"
      />
      <!-- 文本底色（mask 挖白） -->
      <rect
        :x="linear.mid.x - formatLength(linear.lenMm).length * fontSize * 0.32"
        :y="linear.mid.y - fontSize * 0.7"
        :width="formatLength(linear.lenMm).length * fontSize * 0.64"
        :height="fontSize * 1.4"
        :fill="'#ffffff'"
        opacity="0.9"
      />
      <text
        :x="linear.mid.x"
        :y="linear.mid.y"
        :font-size="fontSize"
        :fill="dim.color"
        text-anchor="middle"
        dominant-baseline="central"
        style="font-family: ui-monospace, Menlo, Consolas, monospace"
      >{{ formatLength(linear.lenMm) }}</text>

      <!-- 选中手柄 -->
      <template v-if="selected">
        <circle data-selected-ui :cx="dim.p1.x" :cy="dim.p1.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
        <circle data-selected-ui :cx="dim.p2.x" :cy="dim.p2.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
      </template>
    </template>
  </g>
</template>
