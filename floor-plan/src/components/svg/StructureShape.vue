<script setup lang="ts">
/**
 * 结构构件：柱（实心方块 + 对角交叉线）、烟道（方框 + 烟道符号）、地台（浅色填充 + 虚线）。
 * 与家具一致以中心定位、支持旋转、命中/框选/复制/层级/阵列。
 */
import { computed } from 'vue'
import type { StructureElement } from '@/types'

const props = defineProps<{
  el: StructureElement
  selected: boolean
  scale: number
}>()

const transform = computed(
  () => `translate(${props.el.x} ${props.el.y}) rotate(${(props.el.rotation * 180) / Math.PI})`
)
const sw = computed(() => 1.4 / props.scale)
const fs = computed(() => Math.min(props.el.width, props.el.height) * 0.28)
</script>

<template>
  <g class="structure-shape" :transform="transform">
    <!-- 柱子：实心填充 + 白边交叉线 -->
    <template v-if="el.structKind === 'column'">
      <rect
        :x="-el.width / 2"
        :y="-el.height / 2"
        :width="el.width"
        :height="el.height"
        :fill="el.color"
        stroke="#1f2d3d"
        :stroke-width="sw"
      />
      <line :x1="-el.width / 2" :y1="-el.height / 2" :x2="el.width / 2" :y2="el.height / 2" stroke="#fff" :stroke-width="sw" opacity="0.7" />
      <line :x1="el.width / 2" :y1="-el.height / 2" :x2="-el.width / 2" :y2="el.height / 2" stroke="#fff" :stroke-width="sw" opacity="0.7" />
    </template>

    <!-- 烟道/管井：空心框 + 对角线 + 文字 -->
    <template v-else-if="el.structKind === 'flue'">
      <rect
        :x="-el.width / 2"
        :y="-el.height / 2"
        :width="el.width"
        :height="el.height"
        fill="#f4f6f9"
        :stroke="el.color"
        :stroke-width="2 / scale"
      />
      <line :x1="-el.width / 2" :y1="-el.height / 2" :x2="el.width / 2" :y2="el.height / 2" :stroke="el.color" :stroke-width="sw" />
      <line :x1="el.width / 2" :y1="-el.height / 2" :x2="-el.width / 2" :y2="el.height / 2" :stroke="el.color" :stroke-width="sw" />
      <text
        :x="0"
        :y="0"
        :font-size="fs"
        fill="#606266"
        text-anchor="middle"
        dominant-baseline="central"
        style="font-weight: 600"
      >烟道</text>
    </template>

    <!-- 地台：浅色填充 + 虚线边 -->
    <template v-else>
      <rect
        :x="-el.width / 2"
        :y="-el.height / 2"
        :width="el.width"
        :height="el.height"
        :fill="el.color"
        fill-opacity="0.35"
        :stroke="el.color"
        :stroke-width="sw"
        :stroke-dasharray="`${10 / scale} ${6 / scale}`"
      />
    </template>

    <!-- 选中框 + 旋转/缩放手柄（与家具一致） -->
    <template v-if="selected">
      <rect
        data-selected-ui
        :x="-el.width / 2 - 4 / scale"
        :y="-el.height / 2 - 4 / scale"
        :width="el.width + 8 / scale"
        :height="el.height + 8 / scale"
        fill="none"
        stroke="#409eff"
        :stroke-width="sw"
        :stroke-dasharray="`${6 / scale} ${5 / scale}`"
      />
      <g data-selected-ui>
        <line :x1="0" :y1="-el.height / 2 - 4 / scale" :x2="0" :y2="-el.height / 2 - 22 / scale" stroke="#409eff" :stroke-width="sw" />
        <circle cx="0" :cy="-el.height / 2 - 26 / scale" :r="5 / scale" fill="#fff" stroke="#409eff" :stroke-width="sw" />
        <rect
          :x="el.width / 2 + 2 / scale"
          :y="el.height / 2 + 2 / scale"
          :width="8 / scale"
          :height="8 / scale"
          fill="#fff"
          stroke="#409eff"
          :stroke-width="sw"
        />
      </g>
    </template>
  </g>
</template>
