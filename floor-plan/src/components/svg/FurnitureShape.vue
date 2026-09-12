<script setup lang="ts">
/**
 * 家具图元：以中心定位，旋转 rotation；内部图形按 width/height 缩放。
 * 图形内容来自家具库的内联 SVG 片段（v-html），颜色用 currentColor。
 * 库图形基于 100x100 视口，描边为屏幕像素值；渲染时按家具尺寸换算为世界坐标线宽，
 * 这样无论缩放或导出，线条粗细都与家具本身成比例。
 */
import { computed } from 'vue'
import type { FurnitureElement } from '@/types'
import { getFurnitureDef } from '@/lib/furniture'

const props = defineProps<{
  furniture: FurnitureElement
  selected: boolean
  scale: number
}>()

const def = computed(() => getFurnitureDef(props.furniture.defId))

const transform = computed(
  () =>
    `translate(${props.furniture.x} ${props.furniture.y}) rotate(${(props.furniture.rotation * 180) / Math.PI})`
)

/**
 * 将库图形（100 视口，strokeWidth 为 1~3）中的描边宽度换算到世界坐标。
 * 取较小边做等比映射（保持细线观感），并限制在合理区间。
 */
function scaleStrokes(body: string, minMm: number, vb: number): string {
  const k = minMm / vb
  return body.replace(/stroke-width="([\d.]+)"/g, (_m, n: string) => {
    // 线宽约为图形尺寸的 2%~3%，限制在 8~30mm
    const world = Math.min(30, Math.max(8, Number(n) * k * 0.85))
    return `stroke-width="${world.toFixed(1)}"`
  })
}

const scaledBody = computed(() => {
  const d = def.value
  if (!d) return ''
  const minSide = Math.min(props.furniture.width, props.furniture.height)
  return scaleStrokes(d.body, minSide, d.vb)
})

const sw = computed(() => 1.4 / props.scale)
</script>

<template>
  <g v-if="def" class="furniture-shape" :transform="transform" color="#5a6472">
    <g :transform="`translate(${-furniture.width / 2} ${-furniture.height / 2}) scale(${furniture.width / def.vb} ${furniture.height / def.vb})`">
      <g v-html="scaledBody" />
    </g>
    <rect
      v-if="selected"
      data-selected-ui
      :x="-furniture.width / 2 - 4 / scale"
      :y="-furniture.height / 2 - 4 / scale"
      :width="furniture.width + 8 / scale"
      :height="furniture.height + 8 / scale"
      fill="none"
      stroke="#409eff"
      :stroke-width="sw"
      :stroke-dasharray="`${6 / scale} ${5 / scale}`"
    />
    <!-- 旋转手柄 -->
    <g v-if="selected" data-selected-ui>
      <line
        :x1="0"
        :y1="-furniture.height / 2 - 4 / scale"
        :x2="0"
        :y2="-furniture.height / 2 - 22 / scale"
        stroke="#409eff"
        :stroke-width="sw"
      />
      <circle
        cx="0"
        :cy="-furniture.height / 2 - 26 / scale"
        :r="5 / scale"
        fill="#fff"
        stroke="#409eff"
        :stroke-width="sw"
      />
      <!-- 缩放手柄 -->
      <rect
        :x="furniture.width / 2 + 2 / scale"
        :y="furniture.height / 2 + 2 / scale"
        :width="8 / scale"
        :height="8 / scale"
        fill="#fff"
        stroke="#409eff"
        :stroke-width="sw"
      />
    </g>
  </g>
</template>
