<script setup lang="ts">
/**
 * 屏幕层标尺：上/左两条 canvas 绘制（屏幕坐标，不随世界缩放）。
 * 刻度随缩放选择合适步长（100/200/500/1000/2000/5000mm）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  scale: number
  tx: number
  ty: number
  viewW: number
  viewH: number
  size: number
}>()

const hRef = ref<HTMLCanvasElement | null>(null)
const vRef = ref<HTMLCanvasElement | null>(null)

const STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000]

function pickStep(scale: number): number {
  const targetPx = 80
  for (const s of STEPS) {
    if (s * scale >= targetPx) return s
  }
  return STEPS[STEPS.length - 1]
}

function draw() {
  const dpr = window.devicePixelRatio || 1
  const drawOne = (canvas: HTMLCanvasElement | null, horizontal: boolean) => {
    if (!canvas) return
    const w = horizontal ? props.viewW : props.size
    const h = horizontal ? props.size : props.viewH
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#fafbfc'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#dcdfe6'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (horizontal) ctx.moveTo(0, props.size - 0.5)
    else ctx.moveTo(props.size - 0.5, 0)
    if (horizontal) ctx.lineTo(props.viewW, props.size - 0.5)
    else ctx.lineTo(props.size - 0.5, props.viewH)
    ctx.stroke()

    const step = pickStep(props.scale)
    const origin = horizontal ? props.tx : props.ty
    const span = horizontal ? props.viewW : props.viewH
    const start = Math.floor(-origin / props.scale / step) * step
    const end = Math.ceil((span - origin) / props.scale / step) * step

    ctx.fillStyle = '#909399'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.strokeStyle = '#b6bbc4'
    ctx.lineWidth = 1
    for (let v = start; v <= end; v += step) {
      const pos = origin + v * props.scale
      ctx.beginPath()
      if (horizontal) {
        ctx.moveTo(pos + 0.5, props.size)
        ctx.lineTo(pos + 0.5, props.size - 6)
        ctx.stroke()
        ctx.fillText(`${Math.round(v / 100) / 10}m`, pos + 3, props.size - 9)
      } else {
        ctx.moveTo(props.size, pos + 0.5)
        ctx.lineTo(props.size - 6, pos + 0.5)
        ctx.stroke()
        ctx.save()
        ctx.translate(props.size - 8, pos + 3)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(`${Math.round(v / 100) / 10}m`, 0, 0)
        ctx.restore()
      }
    }
  }
  drawOne(hRef.value, true)
  drawOne(vRef.value, false)
}

const ro = new ResizeObserver(draw)
onMounted(() => {
  draw()
  if (hRef.value) ro.observe(hRef.value)
})
onBeforeUnmount(() => ro.disconnect())
watch(() => [props.scale, props.tx, props.ty, props.viewW, props.viewH], draw)
</script>

<template>
  <div class="rulers">
    <canvas ref="hRef" class="ruler-h" :style="{ left: `${size}px`, top: 0 }" />
    <canvas ref="vRef" class="ruler-v" :style="{ left: 0, top: `${size}px` }" />
    <div class="ruler-corner" :style="{ width: `${size}px`, height: `${size}px` }" />
  </div>
</template>

<style scoped>
.rulers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.ruler-h,
.ruler-v {
  position: absolute;
}
.ruler-corner {
  position: absolute;
  left: 0;
  top: 0;
  background: #fafbfc;
  border-right: 1px solid #dcdfe6;
  border-bottom: 1px solid #dcdfe6;
}
</style>
