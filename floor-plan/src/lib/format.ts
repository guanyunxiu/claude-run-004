/** 单位与文本格式化 */

export function mm2m(mm: number, digits = 2): string {
  return trimZero((mm / 1000).toFixed(digits))
}

export function formatLength(mm: number): string {
  return `${Math.round(mm)} mm`
}

export function formatArea(mm2: number): string {
  return `${trimZero((mm2 / 1e6).toFixed(2))} m²`
}

export function formatPerimeter(mm: number): string {
  return `${mm2m(mm)} m`
}

function trimZero(s: string): string {
  return s.replace(/\.?0+$/, '')
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

export function rad2deg(r: number): number {
  return (r * 180) / Math.PI
}

/** 旋转角归一化到 [0,360) */
export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360
}
