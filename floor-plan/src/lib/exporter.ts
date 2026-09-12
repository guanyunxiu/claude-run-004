/**
 * 高清 PNG 导出
 *
 * 导出使用独立的离屏渲染器 ExportRenderer，以固定基准比例 EXPORT_SCALE 重新渲染，
 * 与当前视口缩放/标尺/网格/选中态无关，保证线宽、字体、尺寸恒定。
 * 流程：动态挂载渲染器 -> 等待渲染 -> 克隆 world-content 按包围盒平移 ->
 * 序列化 SVG -> Canvas 超采样（2x/3x）-> 导出 PNG。
 * 兜底：html2canvas 截取当前 DOM。
 */
import { createApp, h, nextTick } from 'vue'
import html2canvas from 'html2canvas'
import type { FloorElement } from '@/types'
import { bboxOf, type Pt } from './geometry'
import ExportRenderer, { EXPORT_SCALE } from '@/components/ExportRenderer.vue'

/** 计算所有图元覆盖的世界坐标包围盒 */
export function contentBBox(elements: FloorElement[], pad = 400) {
  const pts: Pt[] = []
  for (const el of elements) {
    if (el.kind === 'wall') pts.push(...el.points)
    else if (el.kind === 'furniture')
      pts.push(
        { x: el.x - el.width / 2, y: el.y - el.height / 2 },
        { x: el.x + el.width / 2, y: el.y + el.height / 2 }
      )
    else if (el.kind === 'dimension') {
      if (el.dimType === 'angle') {
        if (el.vertex) {
          const r = Math.max(50, el.radius ?? 500) + 400
          pts.push(
            { x: el.vertex.x - r, y: el.vertex.y - r },
            { x: el.vertex.x + r, y: el.vertex.y + r }
          )
        }
        if (el.ray1) pts.push(el.ray1)
        if (el.ray2) pts.push(el.ray2)
      } else {
        pts.push(el.p1, el.p2)
      }
    }
  }
  if (pts.length === 0) return { x: -3000, y: -3000, width: 6000, height: 6000 }
  return bboxOf(pts, pad)
}

export interface ExportOptions {
  /** 超采样倍数 */
  pixelRatio?: number
  background?: string
  /** 世界坐标包围盒 */
  bbox: { x: number; y: number; width: number; height: number }
  /** 宽高上限（像素，超采样前），避免超大图纸爆内存 */
  maxPixels?: number
}

/** 等待两帧，确保离屏 SVG 完成渲染 */
function waitFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    let i = 0
    const tick = () => (++i >= n ? resolve() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  })
}

/** 动态挂载离屏导出渲染器，返回根元素与卸载函数 */
function mountExportRenderer(): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '0'
  host.style.width = '10px'
  host.style.height = '10px'
  host.style.overflow = 'hidden'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)
  const app = createApp({ render: () => h(ExportRenderer) })
  app.mount(host)
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

export async function exportPng(_liveSvg: SVGSVGElement, opts: ExportOptions): Promise<void> {
  const ratio = opts.pixelRatio ?? 2
  const ppm = EXPORT_SCALE
  const maxSide = opts.maxPixels ?? 6000
  const baseW = Math.round(opts.bbox.width * ppm)
  const baseH = Math.round(opts.bbox.height * ppm)
  const scaleDown = Math.min(1, maxSide / Math.max(baseW, baseH))
  const usePpm = ppm * scaleDown

  // 挂载离屏渲染器并等待渲染
  const { unmount } = mountExportRenderer()
  try {
    await nextTick()
    await waitFrames(2)

    // 从离屏 DOM 中取出 world-content（固定 EXPORT_SCALE，无选中态/网格）
    const off = document.querySelector('.export-svg') as SVGSVGElement | null
    const srcContent = off?.querySelector('.world-content') as SVGGElement | null
    if (!srcContent) throw new Error('导出渲染未就绪')

    const NS = 'http://www.w3.org/2000/svg'
    const outW = Math.round(opts.bbox.width * usePpm)
    const outH = Math.round(opts.bbox.height * usePpm)
    const outSvg = document.createElementNS(NS, 'svg')
    outSvg.setAttribute('xmlns', NS)
    outSvg.setAttribute('width', String(outW))
    outSvg.setAttribute('height', String(outH))
    outSvg.setAttribute('viewBox', `0 0 ${outW} ${outH}`)

    const bg = document.createElementNS(NS, 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(outW))
    bg.setAttribute('height', String(outH))
    bg.setAttribute('fill', opts.background ?? '#ffffff')
    outSvg.appendChild(bg)

    // 复制 mask 定义
    const maskNode = srcContent.querySelector('#wall-openings-mask')
    if (maskNode) {
      const defs = document.createElementNS(NS, 'defs')
      defs.appendChild(maskNode.cloneNode(true))
      outSvg.appendChild(defs)
    }

    // 世界 -> 输出像素。离屏内容自身已含 scale(EXPORT_SCALE)，
    // 外层只需把 bbox 左上移到原点并按 usePpm/EXPORT_SCALE 补偿到目标比例，
    // 避免双重缩放。
    const k = usePpm / EXPORT_SCALE
    const group = document.createElementNS(NS, 'g')
    group.setAttribute(
      'transform',
      `translate(${-opts.bbox.x * usePpm} ${-opts.bbox.y * usePpm}) scale(${k})`
    )
    const clone = srcContent.cloneNode(true) as SVGGElement
    clone.querySelectorAll('[data-selected-ui]').forEach((n) => n.parentNode?.removeChild(n))
    group.appendChild(clone)
    outSvg.appendChild(group)

    const xml = new XMLSerializer().serializeToString(outSvg)
    const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
    const img = await svgStringToImage(svgText)

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(outW * ratio)
    canvas.height = Math.round(outH * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 Canvas 上下文')
    ctx.fillStyle = opts.background ?? '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(ratio, ratio)
    ctx.drawImage(img, 0, 0, outW, outH)

    const url = canvas.toDataURL('image/png')
    triggerDownload(url, `floorplan_${Date.now()}.png`)
  } finally {
    unmount()
  }
}

function svgStringToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** 兜底：html2canvas 截取容器 DOM */
export async function exportPngByDom(el: HTMLElement, pixelRatio = 2): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: pixelRatio,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false
  })
  triggerDownload(canvas.toDataURL('image/png'), `floorplan_${Date.now()}.png`)
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
