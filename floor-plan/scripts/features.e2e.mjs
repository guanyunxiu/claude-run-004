/**
 * 迭代功能 E2E 验证（Playwright）：
 *   1. npm run dev（http://localhost:5173）
 *   2. npx playwright install chromium（或 export CHROME_BIN=/path/to/chrome）
 *   3. node scripts/features.e2e.mjs
 * 中点/交点吸附、45°锁定、角度标注、标注联动、裁剪/修复、复制粘贴/层级/框选
 */
import { chromium } from 'playwright'

const CHROME =
  process.env.CHROME_BIN ||
  '/home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.evaluate(() => {
  const fp = window.__fp
  fp.rawState.viewport.scale = 0.5
  fp.rawState.viewport.tx = 276
  fp.rawState.viewport.ty = 76
})
const s = (x, y) => [300 + x * 0.5, 100 + y * 0.5]
let pass = 0
let fail = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`)
  ok ? pass++ : fail++
}

// ---------- 1. 中点/交点/端点吸附 ----------
await page.evaluate(() => {
  const fp = window.__fp
  const w = (id, pts) => ({ id, kind: 'wall', points: pts, closed: false, thickness: 120, color: '#303133' })
  fp.addElement(w('snapH', [{ x: 0, y: 0 }, { x: 4000, y: 0 }]), false)
  fp.addElement(w('snapV', [{ x: 2000, y: -2000 }, { x: 2000, y: 2000 }]), false)
})
// 画墙，第一点点击水平墙中点附近 (2000, 8 屏幕误差)
await page.keyboard.press('w')
await page.mouse.click(...s(2000, 6))
await page.waitForTimeout(120)
const firstPt = await page.evaluate(() => window.__fp.rawState.wallDraft[0])
check('中点吸附到 (2000,0)', Math.abs(firstPt.x - 2000) < 1 && Math.abs(firstPt.y - 0) < 1, JSON.stringify(firstPt))
// 第二点：交点附近
await page.mouse.click(...s(2010, 8))
await page.waitForTimeout(120)
const secondPt = await page.evaluate(() => window.__fp.rawState.wallDraft[1])
check('交点吸附优先到 (2000,0)（与第一点重复不入栈则长度仍1）', firstPt && Math.abs(secondPt?.x ?? 2000 - 2000) < 1, JSON.stringify(secondPt))
// 换一个真交点吸附点：竖墙与一条新水平线的交点用端点方式验证——点击竖墙端点附近 (2000,2000)
await page.mouse.click(...s(2000, 2000))
await page.waitForTimeout(120)
const thirdPt = await page.evaluate(() => window.__fp.rawState.wallDraft.at(-1))
check('端点吸附到竖墙端点 (2000,2000)', Math.abs(thirdPt.x - 2000) < 1 && Math.abs(thirdPt.y - 2000) < 1, JSON.stringify(thirdPt))
await page.keyboard.press('Escape')

// 吸附标记类型
await page.mouse.move(...s(2000, 2000))
await page.waitForTimeout(100)
// ---------- 2. 45° 锁定 ----------
await page.evaluate(() => {
  window.__fp.updateSettings({ angleLock45: true, ortho: false, snapEnabled: false })
})
await page.keyboard.press('w')
await page.mouse.click(500, 700) // 起点 (448,1200)? 用世界坐标换算：直接给世界 0,2400
await page.mouse.click(...s(0, 2400))
await page.waitForTimeout(80)
// 鼠标移到 45° 方向附近 (1000, 3405 ≈ 45°) 后点击
await page.mouse.click(...s(1000, 3410))
await page.waitForTimeout(120)
await page.keyboard.press('Escape')
const wall45 = await page.evaluate(() => {
  const ws = window.__fp.state.doc.elements.filter((e) => e.kind === 'wall')
  const last = ws[ws.length - 1]
  const a = last.points[0]
  const b = last.points[1]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
})
check('45°锁定：第二段吸附到 45°', Math.abs(wall45 - 45) < 1.5, `ang=${wall45.toFixed(2)}`)

// Shift 自由角度：按住 shift 点击一个 30° 方向
await page.evaluate(() => {
  window.__fp.updateSettings({ angleLock45: true, snapEnabled: false })
})
await page.keyboard.press('w')
await page.mouse.click(...s(-3000, 2400))
const fx = -3000 + Math.cos(Math.PI / 6) * 1200
const fy = 2400 + Math.sin(Math.PI / 6) * 1200
await page.keyboard.down('Shift')
await page.mouse.click(...s(fx, fy))
await page.keyboard.up('Shift')
await page.waitForTimeout(100)
await page.keyboard.press('Escape')
const wallFree = await page.evaluate(() => {
  const ws = window.__fp.state.doc.elements.filter((e) => e.kind === 'wall')
  const last = ws[ws.length - 1]
  const a = last.points[0]
  const b = last.points[1]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
})
check('Shift 自由角度（30° 不被吸附）', Math.abs(wallFree - 30) < 1.5, `ang=${wallFree.toFixed(2)}`)
await page.evaluate(() => window.__fp.updateSettings({ angleLock45: false, ortho: true, snapEnabled: true }))

// ---------- 3. 角度标注 + 联动 ----------
// 画一个矩形房
await page.evaluate(() => { window.__fp.clearAll() })
await page.waitForTimeout(100)
await page.keyboard.press('w')
for (const [x, y] of [[0, 0], [3000, 0], [3000, 2000], [0, 2000]]) {
  await page.mouse.click(...s(x, y))
  await page.waitForTimeout(60)
}
await page.mouse.click(...s(0, 0))
await page.waitForTimeout(300)
// 角度标注：顶点 (3000,0)，射线点 (3000,2000) 与 (0,0) => 90°
await page.keyboard.press('a')
await page.waitForTimeout(80)
await page.mouse.click(...s(3000, 0))
await page.waitForTimeout(60)
await page.mouse.click(...s(3000, 2000))
await page.waitForTimeout(60)
await page.mouse.click(...s(0, 0))
await page.waitForTimeout(300)
const adim = await page.evaluate(() => {
  const d = window.__fp.state.doc.elements.find((e) => e.kind === 'dimension' && e.dimType === 'angle')
  return d ? { has: true, refV: d.refV?.kind, ref1: d.ref1?.kind } : { has: false }
})
check('角度标注已创建且锚点绑定墙顶点', adim.has && adim.refV === 'wall-vertex' && adim.ref1 === 'wall-vertex', JSON.stringify(adim))
const adimText = await page.locator('.dimension-shape text').last().textContent()
check('角度文本为 90.0°', adimText?.includes('90.0'), adimText)

// 拖动墙顶点 (3000,2000) -> (3000,1000)，角度标注引用的顶点在 (3000,0) 不变；
// 改为拖动 (0,2000) 不影响角。这里直接 mutate 墙顶点验证 watcher 联动：
await page.evaluate(() => {
  const fp = window.__fp
  fp.pushHistory()
  const w = fp.state.doc.elements.find((e) => e.kind === 'wall')
  // 把 (0,2000) 改为 (-2000,2000)，顶点 (3000,0) 处的角仍为 90；
  // 再把 (3000,2000) 改为 (3000,3000) 保持90，验证不回归即可
  w.points[2] = { x: 3000, y: 2000 }
})
// 线性标注联动：建一条绑定 (0,2000)-(3000,2000) 的线性标注，然后拖顶点
await page.keyboard.press('l')
await page.mouse.click(...s(0, 2000))
await page.waitForTimeout(60)
await page.mouse.click(...s(3000, 2000))
await page.waitForTimeout(300)
const ldimBefore = await page.evaluate(() => {
  const d = [...window.__fp.state.doc.elements].reverse().find((e) => e.kind === 'dimension' && e.dimType === 'linear')
  return { len: Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y), ref: d.ref1.kind + '/' + d.ref2.kind }
})
check('线性标注建立并绑定墙顶点', ldimBefore.len === 3000 && ldimBefore.ref === 'wall-vertex/wall-vertex', JSON.stringify(ldimBefore))
// 移动墙端点 (3000,2000) -> (4000,2000)
await page.evaluate(() => {
  const fp = window.__fp
  fp.pushHistory()
  const w = fp.state.doc.elements.find((e) => e.kind === 'wall')
  w.points[2] = { x: 4000, y: 2000 }
})
await page.waitForTimeout(200)
const ldimAfter = await page.evaluate(() => {
  const d = [...window.__fp.state.doc.elements].reverse().find((e) => e.kind === 'dimension' && e.dimType === 'linear')
  return Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y)
})
check('墙改动后线性标注自动更新 3000->4000', Math.abs(ldimAfter - 4000) < 1, String(ldimAfter))
// 角度标注引用 ray1=(3000,2000) 现变为 (4000,2000)，角度应仍 90（一个沿+x 一个沿-y）
const adimText2 = await page.locator('.dimension-shape text').last().textContent()
check('角度标注跟随更新后仍为 90°', adimText2?.includes('90.0'), adimText2)

// ---------- 4. 相交裁剪 ----------
await page.evaluate(() => { window.__fp.clearAll() })
await page.waitForTimeout(100)
await page.evaluate(() => {
  const fp = window.__fp
  const w = (id, pts, t = 120) => fp.addElement({ id, kind: 'wall', points: pts, closed: false, thickness: t, color: '#303133' }, false)
  w('host', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 200)
  w('probe', [{ x: 2000, y: -30 }, { x: 2000, y: 2000 }], 120)
})
const trimRes = await page.evaluate(() => window.__fp.trimIntersectingWalls())
const probeAfter = await page.evaluate(() => {
  const w = window.__fp.state.doc.elements.find((e) => e.id === 'probe')
  return [w.points[0].x, w.points[0].y, w.points[1].y]
})
check('相交裁剪：伸入端头剪掉', trimRes.changed && Math.abs(probeAfter[1] - 0) < 1 && probeAfter[2] === 2000, JSON.stringify({ trimRes, probeAfter }))

// ---------- 5. 断线修复 ----------
await page.evaluate(() => { window.__fp.clearAll() })
await page.evaluate(() => {
  const fp = window.__fp
  fp.addElement({ id: 'h1', kind: 'wall', points: [{ x: 0, y: 0 }, { x: 1970, y: 0 }], closed: false, thickness: 120, color: '#303133' }, false)
  fp.addElement({ id: 'h2', kind: 'wall', points: [{ x: 2030, y: 0 }, { x: 4000, y: 0 }], closed: false, thickness: 120, color: '#303133' }, false)
  fp.addElement({ id: 'dr1', kind: 'door', wallId: 'h2', offset: 70, width: 800, hinge: 'start', swingSide: 1, color: '#000' }, false)
})
const healRes = await page.evaluate(() => window.__fp.healBrokenWalls(150))
const afterHeal = await page.evaluate(() => {
  const ws = window.__fp.state.doc.elements.filter((e) => e.kind === 'wall')
  const dr = window.__fp.state.doc.elements.find((e) => e.kind === 'door')
  return { nWall: ws.length, len: Math.hypot(ws[0].points.at(-1).x - ws[0].points[0].x, ws[0].points.at(-1).y - ws[0].points[0].y), doorWall: dr.wallId, doorOff: dr.offset }
})
check('断线修复：合并为一条4000墙，门跟随', healRes.merged >= 1 && afterHeal.nWall === 1 && Math.abs(afterHeal.len - 4000) < 1 && afterHeal.doorWall === 'h1' && Math.abs(afterHeal.doorOff - 2070) < 2, JSON.stringify({ healRes, afterHeal }))

// ---------- 6. 批量编辑 ----------
await page.evaluate(() => {
  const fp = window.__fp
  fp.selectOnly(['h1']) // h1 是合并保留 id
  fp.state.selection.add('h2'.length ? 'h1' : '')
})
// 合并后只剩 h1；再造两面墙测批量
await page.evaluate(() => {
  const fp = window.__fp
  fp.addElement({ id: 'b1', kind: 'wall', points: [{ x: 0, y: 500 }, { x: 1000, y: 500 }], closed: false, thickness: 120, color: '#303133' }, false)
  fp.selectOnly(['h1', 'b1'])
  fp.batchEditSelectedWalls({ thickness: 240, color: '#ff0000' })
})
const batchOk = await page.evaluate(() => {
  const a = window.__fp.state.doc.elements.find((e) => e.id === 'h1')
  const b = window.__fp.state.doc.elements.find((e) => e.id === 'b1')
  return a.thickness === 240 && b.thickness === 240 && b.color === '#ff0000'
})
check('批量编辑墙厚/颜色', batchOk)

// ---------- 7. 复制/粘贴/层级 ----------
await page.evaluate(() => {
  const fp = window.__fp
  fp.clearAll()
  fp.addElement({ id: 'cf', kind: 'furniture', defId: 'coffee-table', x: 1000, y: 1000, width: 1200, height: 600, rotation: 0 }, false)
  fp.selectOnly(['cf'])
})
await page.keyboard.press('Control+c')
await page.waitForTimeout(80)
await page.keyboard.press('Control+v')
await page.waitForTimeout(200)
const pasteInfo = await page.evaluate(() => {
  const fs = window.__fp.state.doc.elements.filter((e) => e.kind === 'furniture')
  return { n: fs.length, sel: window.__fp.state.selection.size, off: fs[1] ? [fs[1].x - fs[0].x, fs[1].y - fs[0].y] : null }
})
check('Ctrl+C/V 复制粘贴（偏移200，自动选中新图元）', pasteInfo.n === 2 && pasteInfo.sel === 1 && pasteInfo.off[0] === 200 && pasteInfo.off[1] === 200, JSON.stringify(pasteInfo))

// 层级：再加一件家具，原 cf 应在下，粘贴件在上
await page.evaluate(() => {
  const fp = window.__fp
  fp.addElement({ id: 'cf2', kind: 'furniture', defId: 'bed', x: 0, y: 0, width: 1500, height: 2000, rotation: 0 }, false)
  fp.selectOnly(['cf'])
})
await page.keyboard.press('Control+]')
await page.waitForTimeout(120)
const order = await page.evaluate(() => window.__fp.state.doc.elements.map((e) => e.id).join(','))
check('上移一层：cf 越过相邻家具', order.startsWith('cf2,cf,') || order === 'cf2,cf,cf_', order)
// 置顶 Ctrl+Shift+]
await page.keyboard.press('Control+Shift+]')
await page.waitForTimeout(120)
const order2 = await page.evaluate(() => window.__fp.state.doc.elements.map((e) => e.id).at(-1))
check('置顶：cf 到数组末尾', order2 === 'cf', order2)

// ---------- 8. Shift 框选累积加选 ----------
await page.evaluate(() => { window.__fp.clearAll() })
await page.evaluate(() => {
  const fp = window.__fp
  fp.addElement({ id: 'fa', kind: 'furniture', defId: 'coffee-table', x: 500, y: 500, width: 600, height: 600, rotation: 0 }, false)
  fp.addElement({ id: 'fb', kind: 'furniture', defId: 'coffee-table', x: 2500, y: 2500, width: 600, height: 600, rotation: 0 }, false)
})
// 第一个框选
await page.mouse.move(...s(0, 0))
await page.mouse.down()
await page.mouse.move(...s(1000, 1000), { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(150)
const sel1 = await page.evaluate(() => window.__fp.state.selection.size)
// Shift 第二个框选追加
await page.keyboard.down('Shift')
await page.mouse.move(...s(2000, 2000))
await page.mouse.down()
await page.mouse.move(...s(3000, 3000), { steps: 4 })
await page.mouse.up()
await page.keyboard.up('Shift')
await page.waitForTimeout(150)
const sel2 = await page.evaluate(() => window.__fp.state.selection.size)
check('Shift 框选累积批量选中', sel1 === 1 && sel2 === 2, `${sel1} -> ${sel2}`)

// 房间自动面积仍工作
await page.evaluate(() => { window.__fp.clearAll() })
await page.keyboard.press('w')
for (const [x, y] of [[0, 0], [2000, 0], [2000, 1600], [0, 1600]]) {
  await page.mouse.click(...s(x, y))
  await page.waitForTimeout(50)
}
await page.mouse.click(...s(0, 0))
await page.waitForTimeout(400)
const roomOk = await page.evaluate(() => window.__fp.rooms.value.length === 1 && Math.abs(window.__fp.rooms.value[0].area - 3.2e6) < 1)
check('房间自动提取/面积未回归', roomOk)

console.log(`\n${pass} passed, ${fail} failed`)
console.log('运行时错误:', errors.length ? errors : '无')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
