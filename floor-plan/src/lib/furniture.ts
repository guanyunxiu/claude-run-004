/**
 * 家具库：默认尺寸（mm，宽 x 深/高）与 100x100 归一化平面图形。
 * 渲染时由 FurnitureShape 按 width/height 做 preserveAspectRatio="none" 缩放，
 * stroke 统一使用 non-scaling-stroke 思路的外框线宽（在世界坐标下给出）。
 */
export type FurnitureCategory = 'bed' | 'sofa' | 'storage' | 'table' | 'kitchen' | 'bath'

export interface FurnitureDef {
  id: string
  name: string
  category: FurnitureCategory
  width: number
  height: number
  /** 图形视口（归一化，一般 100x100） */
  vb: number
  /** 图形主体，viewBox 为 0 0 vb vb */
  body: string
}

const VB = 100

export const FURNITURE_DEFS: FurnitureDef[] = [
  {
    id: 'bed-double',
    name: '双人床',
    category: 'bed',
    width: 1800,
    height: 2000,
    vb: VB,
    body: `
      <rect x="4" y="4" width="92" height="92" rx="4" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <rect x="8" y="8" width="84" height="26" rx="3" fill="#e8ecf1" stroke="currentColor" stroke-width="1.8"/>
      <line x1="50" y1="8" x2="50" y2="34" stroke="currentColor" stroke-width="1.2"/>
      <rect x="10" y="44" width="34" height="48" rx="3" fill="#f4f6f9" stroke="currentColor" stroke-width="1.4"/>
      <rect x="56" y="44" width="34" height="48" rx="3" fill="#f4f6f9" stroke="currentColor" stroke-width="1.4"/>
    `
  },
  {
    id: 'bed-single',
    name: '单人床',
    category: 'bed',
    width: 1200,
    height: 2000,
    vb: VB,
    body: `
      <rect x="8" y="4" width="84" height="92" rx="4" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <rect x="12" y="8" width="76" height="24" rx="3" fill="#e8ecf1" stroke="currentColor" stroke-width="1.8"/>
      <rect x="14" y="42" width="72" height="50" rx="3" fill="#f4f6f9" stroke="currentColor" stroke-width="1.4"/>
    `
  },
  {
    id: 'sofa',
    name: '三人沙发',
    category: 'sofa',
    width: 2200,
    height: 900,
    vb: VB,
    body: `
      <rect x="4" y="26" width="92" height="62" rx="8" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <rect x="4" y="10" width="92" height="22" rx="6" fill="#e8ecf1" stroke="currentColor" stroke-width="2"/>
      <rect x="2" y="26" width="12" height="52" rx="5" fill="#e8ecf1" stroke="currentColor" stroke-width="2"/>
      <rect x="86" y="26" width="12" height="52" rx="5" fill="#e8ecf1" stroke="currentColor" stroke-width="2"/>
      <line x1="35" y1="34" x2="35" y2="82" stroke="currentColor" stroke-width="1.4"/>
      <line x1="65" y1="34" x2="65" y2="82" stroke="currentColor" stroke-width="1.4"/>
      <line x1="6" y1="88" x2="14" y2="88" stroke="currentColor" stroke-width="3"/>
      <line x1="86" y1="88" x2="94" y2="88" stroke="currentColor" stroke-width="3"/>
    `
  },
  {
    id: 'sofa-l',
    name: 'L 型沙发',
    category: 'sofa',
    width: 2400,
    height: 1600,
    vb: VB,
    body: `
      <path d="M4 30 h92 v50 h-30 v16 h-62 z" fill="#ffffff" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="4" y="12" width="92" height="22" rx="6" fill="#e8ecf1" stroke="currentColor" stroke-width="2"/>
      <line x1="35" y1="34" x2="35" y2="78" stroke="currentColor" stroke-width="1.4"/>
      <line x1="66" y1="34" x2="66" y2="78" stroke="currentColor" stroke-width="1.4"/>
    `
  },
  {
    id: 'wardrobe',
    name: '衣柜',
    category: 'storage',
    width: 2000,
    height: 600,
    vb: VB,
    body: `
      <rect x="4" y="14" width="92" height="72" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <line x1="50" y1="14" x2="50" y2="86" stroke="currentColor" stroke-width="1.8"/>
      <line x1="46" y1="50" x2="50" y2="50" stroke="currentColor" stroke-width="1.8"/>
      <line x1="50" y1="50" x2="54" y2="50" stroke="currentColor" stroke-width="1.8"/>
      <line x1="10" y1="26" x2="42" y2="26" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>
      <line x1="58" y1="26" x2="90" y2="26" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>
    `
  },
  {
    id: 'cabinet',
    name: '储物柜',
    category: 'storage',
    width: 900,
    height: 450,
    vb: VB,
    body: `
      <rect x="6" y="18" width="88" height="64" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <line x1="6" y1="40" x2="94" y2="40" stroke="currentColor" stroke-width="1.6"/>
      <line x1="6" y1="62" x2="94" y2="62" stroke="currentColor" stroke-width="1.6"/>
    `
  },
  {
    id: 'dining-table',
    name: '餐桌',
    category: 'table',
    width: 1400,
    height: 800,
    vb: VB,
    body: `
      <rect x="12" y="26" width="76" height="48" rx="6" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="20" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="80" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="20" cy="86" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="86" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="80" cy="86" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
    `
  },
  {
    id: 'coffee-table',
    name: '茶几',
    category: 'table',
    width: 1200,
    height: 600,
    vb: VB,
    body: `
      <rect x="10" y="24" width="80" height="52" rx="4" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
    `
  },
  {
    id: 'fridge',
    name: '冰箱',
    category: 'kitchen',
    width: 700,
    height: 700,
    vb: VB,
    body: `
      <rect x="14" y="6" width="72" height="88" rx="3" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <line x1="14" y1="34" x2="86" y2="34" stroke="currentColor" stroke-width="1.8"/>
      <line x1="78" y1="16" x2="78" y2="30" stroke="currentColor" stroke-width="2"/>
      <line x1="78" y1="42" x2="78" y2="80" stroke="currentColor" stroke-width="2"/>
    `
  },
  {
    id: 'stove',
    name: '灶台',
    category: 'kitchen',
    width: 800,
    height: 600,
    vb: VB,
    body: `
      <rect x="8" y="18" width="84" height="64" rx="3" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="32" cy="42" r="11" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="68" cy="42" r="11" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="32" cy="68" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="68" cy="68" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
    `
  },
  {
    id: 'sink',
    name: '洗菜盆',
    category: 'kitchen',
    width: 800,
    height: 500,
    vb: VB,
    body: `
      <rect x="8" y="22" width="84" height="56" rx="4" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <rect x="16" y="30" width="68" height="34" rx="3" fill="#f4f6f9" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="50" cy="76" r="3" fill="currentColor"/>
    `
  },
  {
    id: 'toilet',
    name: '马桶',
    category: 'bath',
    width: 450,
    height: 750,
    vb: VB,
    body: `
      <rect x="30" y="6" width="40" height="22" rx="3" fill="#ffffff" stroke="currentColor" stroke-width="2.2"/>
      <ellipse cx="50" cy="60" rx="26" ry="30" fill="#ffffff" stroke="currentColor" stroke-width="2.2"/>
      <ellipse cx="50" cy="62" rx="16" ry="20" fill="#f4f6f9" stroke="currentColor" stroke-width="1.4"/>
    `
  },
  {
    id: 'basin',
    name: '洗手盆',
    category: 'bath',
    width: 600,
    height: 480,
    vb: VB,
    body: `
      <ellipse cx="50" cy="56" rx="34" ry="26" fill="#ffffff" stroke="currentColor" stroke-width="2.2"/>
      <ellipse cx="50" cy="56" rx="22" ry="16" fill="#f4f6f9" stroke="currentColor" stroke-width="1.4"/>
      <circle cx="50" cy="16" r="4" fill="currentColor"/>
      <line x1="50" y1="20" x2="50" y2="30" stroke="currentColor" stroke-width="2.2"/>
    `
  },
  {
    id: 'shower',
    name: '淋浴间',
    category: 'bath',
    width: 900,
    height: 900,
    vb: VB,
    body: `
      <rect x="6" y="6" width="88" height="88" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="5 4"/>
      <circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="24" y1="31" x2="24" y2="42" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="72" r="4" fill="currentColor"/>
      <path d="M 34 50 l8 8 M 46 46 l10 10 M 58 42 l12 12 M 70 38 l14 14"
            stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    `
  },
  {
    id: 'bathtub',
    name: '浴缸',
    category: 'bath',
    width: 1700,
    height: 750,
    vb: VB,
    body: `
      <rect x="6" y="20" width="88" height="60" rx="14" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <rect x="14" y="28" width="60" height="44" rx="10" fill="#f4f6f9" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="82" cy="32" r="3.5" fill="currentColor"/>
    `
  },
  {
    id: 'washer',
    name: '洗衣机',
    category: 'bath',
    width: 600,
    height: 600,
    vb: VB,
    body: `
      <rect x="12" y="6" width="76" height="88" rx="3" fill="#ffffff" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="50" cy="56" r="22" fill="#f4f6f9" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="56" r="12" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <rect x="20" y="12" width="60" height="8" rx="2" fill="#e8ecf1" stroke="currentColor" stroke-width="1.2"/>
    `
  }
]

const defMap = new Map(FURNITURE_DEFS.map((d) => [d.id, d]))

export function getFurnitureDef(id: string): FurnitureDef | undefined {
  return defMap.get(id)
}
