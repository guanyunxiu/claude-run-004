import { chromium } from 'playwright'

const libs =
  '/tmp/chromelibs/usr/lib/aarch64-linux-gnu:/tmp/chromelibs/lib/aarch64-linux-gnu'
const browser = await chromium.launch({
  env: { ...process.env, LD_LIBRARY_PATH: libs },
  args: ['--use-gl=angle', '--use-angle=swiftshader']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
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
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`)
  ok ? pass++ : fail++
}

// ---- Bug1: 撤销/重做按钮亮起 ----
const undoDisabled = () => page.locator('button[title^="撤销"]').isDisabled()
check('初始撤销按钮禁用', await undoDisabled())
await page.keyboard.press('w')
for (const [x, y] of [[0, 0], [2000, 0], [2000, 1600], [0, 1600], [0, 0]]) {
  await page.mouse.click(...s(x, y)); await page.waitForTimeout(80)
}
await page.waitForTimeout(200)
check('画墙后撤销按钮亮起', !(await undoDisabled()))

// ---- Bug5 准备：两个缩放级别下导出，比较尺寸/线宽 ----
async function doExport() {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: '导出 PNG' }).click()
  ])
  const path = '/tmp/reg-' + Math.random().toString(36).slice(2) + '.png'
  await dl.saveAs(path)
  return path
}
// 当前 scale 0.5 导出
const path1 = await doExport()
// 改变视口缩放后再导出（图纸内容不变）
await page.evaluate(() => { window.__fp.rawState.viewport.scale = 1.5 })
const path2 = await doExport()
const { statSync } = await import('node:fs')
// 视口缩放不应影响导出：两次文件大小应接近（同一图纸同基准比例）
const sz1 = statSync(path1).size
const sz2 = statSync(path2).size
const ratio = Math.max(sz1, sz2) / Math.min(sz1, sz2)
check('导出线宽/尺寸不随视口缩放变化', ratio < 1.15, `size1=${sz1} size2=${sz2}`)

// ---- Bug2: 旋转后的家具能点中 ----
await page.evaluate(() => {
  const fp = window.__fp
  fp.rawState.viewport.scale = 0.5
  fp.addElement({
    id: fp.uid('fur'), kind: 'furniture', defId: 'coffee-table',
    x: 1000, y: 800, width: 1200, height: 600, rotation: Math.PI / 4
  })
  fp.setMode('select')
})
await page.waitForTimeout(300)
// 点击旋转后矩形角部内侧（局部 (500,0) 旋转45° -> 世界 (1354,1154)）
await page.mouse.click(...s(1354, 1154))
await page.waitForTimeout(200)
const selAfterCorner = await page.evaluate(() => {
  const fur = window.__fp.state.doc.elements.find((e) => e.kind === 'furniture')
  return window.__fp.state.selection.has(fur.id)
})
check('旋转后点击角部可选中家具', selAfterCorner)
// 点击轴对齐包围盒内、但旋转矩形外的点（局部 (0,420) 世界 (702,1098) 附近应选不中）
await page.mouse.click(400, 400) // 空白
await page.waitForTimeout(100)
await page.mouse.click(...s(702, 1098))
await page.waitForTimeout(200)
const selOutside = await page.evaluate(() => {
  const fur = window.__fp.state.doc.elements.find((e) => e.kind === 'furniture')
  return window.__fp.state.selection.has(fur.id)
})
check('旋转矩形外不误选', !selOutside)

// ---- Bug3: 标注整体拖动不飞 ----
await page.evaluate(() => {
  const fp = window.__fp
  fp.pushHistory()
  fp.addElement(fp.makeDimension({ x: 400, y: 400 }, { x: 1400, y: 400 }, 200), false)
})
await page.waitForTimeout(200)
const dim = () => window.__fp.state.doc.elements.find((e) => e.kind === 'dimension')
// 标注 p1=(400,400),p2=(1400,400),offset=200，法向 (0,1)：
// 标注线在 y=600，起点延伸线 x=400、y∈[380,680]。点其中部 (400,500) 触发整体移动。
const getDim = () => page.evaluate(() => { const d = window.__fp.state.doc.elements.find(e => e.kind === 'dimension'); return [d.p1.x, d.p1.y, d.p2.x, d.p2.y] })
const before = await getDim()
await page.mouse.move(...s(400, 500))
await page.mouse.down()
await page.mouse.move(...s(700, 800), { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
const after = await getDim()
const moved = after.map((v, i) => Math.round(v - before[i]))
// 期望整体平移 (+300,+300,+300,+300)
const sane = moved.every((m) => Math.abs(m - 300) < 5)
check('标注整体平移不飞走', sane, JSON.stringify(moved))

// ---- Bug4: 开标尺时滚轮缩放跟随光标 ----
// 世界点 (1000,800) 屏幕位置，缩放后该世界点仍应在光标下
await page.keyboard.press('Escape')
await page.mouse.move(...s(1000, 800))
const beforeZoom = await page.evaluate(() => {
  const vp = window.__fp.state.viewport
  const ruler = 24
  // 反推屏幕坐标（与 toWorld 互逆）
  return { sx: (1000) * vp.scale + vp.tx + ruler, sy: (800) * vp.scale + vp.ty + ruler, scale: vp.scale }
})
await page.mouse.move(beforeZoom.sx, beforeZoom.sy)
await page.mouse.wheel(0, -400)
await page.waitForTimeout(200)
// node 侧校验：缩放前屏幕点对应的世界点仍应是 (1000,800)
const vpAfter = await page.evaluate(() => ({ ...window.__fp.state.viewport }))
const ruler = 24
const wx = (beforeZoom.sx - ruler - vpAfter.tx) / vpAfter.scale
const wy = (beforeZoom.sy - ruler - vpAfter.ty) / vpAfter.scale
const zoomErr = Math.hypot(wx - 1000, wy - 800)
check('滚轮缩放跟随光标', zoomErr < 3, `误差=${zoomErr.toFixed(2)}mm scale ${beforeZoom.scale}->${vpAfter.scale}`)

// ---- Bug1 续：撤销后重做亮起，撤销可用 ----
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
const redoEnabled = !(await page.locator('button[title^="重做"]').isDisabled())
check('撤销后重做按钮亮起', redoEnabled)

console.log(`\n${pass} passed, ${fail} failed`)
console.log('运行时错误:', errors.length ? errors : '无')
await browser.close()
process.exit(fail ? 1 : 0)
