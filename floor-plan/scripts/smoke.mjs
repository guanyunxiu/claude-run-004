import { chromium } from 'playwright'

const errors = []
const libs =
  '/tmp/chromelibs/usr/lib/aarch64-linux-gnu:/tmp/chromelibs/lib/aarch64-linux-gnu'
const browser = await chromium.launch({
  env: { ...process.env, LD_LIBRARY_PATH: libs },
  args: ['--use-gl=angle', '--use-angle=swiftshader']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

// 调整初始视图，让工作区中心对应世界 (0,0) 附近：scale=0.5
// 工作区屏幕范围约 x:[300,1300]（避开家具库和属性面板），y:[80,940]
await page.evaluate(() => {
  const fp = window.__fp
  fp.rawState.viewport.scale = 0.5
  fp.rawState.viewport.tx = 276
  fp.rawState.viewport.ty = 76
})
// 屏幕 = 300 + wx*0.5 (含 ruler24), 100 + wy*0.5
const s = (x, y) => [300 + x * 0.5, 100 + y * 0.5]

// 4m x 3m 房间
await page.keyboard.press('w')
const room = [[0, 0], [2000, 0], [2000, 1600], [0, 1600]]
for (const [x, y] of room) {
  await page.mouse.move(...s(x, y))
  await page.waitForTimeout(120)
  await page.mouse.click(...s(x, y))
  await page.waitForTimeout(120)
}
await page.mouse.click(...s(0, 0)) // 闭合
await page.waitForTimeout(500)

const body = await page.textContent('body')
console.log('房间面积 12 m²:', body.includes('3.2 m²'), '| 周长 14 m:', body.includes('7.2 m'))

// 门
await page.keyboard.press('d')
await page.waitForTimeout(120)
await page.mouse.click(...s(1000, 0))
await page.waitForTimeout(300)
console.log('门图元数量:', await page.locator('.door-shape').count())

// 窗
await page.keyboard.press('c')
await page.waitForTimeout(120)
await page.mouse.click(...s(2000, 800))
await page.waitForTimeout(300)
console.log('窗图元数量:', await page.locator('.window-shape').count())

// 家具：从面板拖一个茶几到房间中心 (1000,800)
const libBox = await page.locator('.lib-panel .item', { hasText: '茶几' }).boundingBox()
await page.mouse.move(libBox.x + libBox.width / 2, libBox.y + libBox.height / 2)
await page.mouse.down()
await page.mouse.move(...s(1000, 800), { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(300)
console.log('家具图元数量:', await page.locator('.furniture-shape').count())

// 线性标注
await page.keyboard.press('l')
await page.waitForTimeout(120)
await page.mouse.click(...s(0, 1600))
await page.waitForTimeout(150)
await page.mouse.click(...s(2000, 1600))
await page.waitForTimeout(400)
console.log('标注数量:', await page.locator('.dimension-shape').count(),
  '| 文本:', (await page.locator('.dimension-shape text').textContent())?.trim())

// 撤销两次
await page.keyboard.press('Control+z')
await page.waitForTimeout(120)
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
console.log('撤销两次后 家具+标注（期望 0）:',
  await page.locator('.furniture-shape, .dimension-shape').count())
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(200)

// 对角 2561mm
await page.keyboard.press('m')
await page.mouse.click(...s(0, 0))
await page.waitForTimeout(120)
await page.mouse.move(...s(2000, 1600))
await page.waitForTimeout(300)
console.log('测距文本:', (await page.locator('.measure-layer text').textContent())?.replace(/\s+/g, ' ').trim())
await page.keyboard.press('Escape')

// 框选 + 删除
await page.keyboard.press('v')
await page.mouse.move(310, 70)
await page.mouse.down()
await page.mouse.move(1290, 920, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const selCount = await page.evaluate(() => window.__fp.state.selection.size)
console.log('框选数量:', selCount)
await page.keyboard.press('Delete')
await page.waitForTimeout(300)
console.log('删除后墙体数量（期望 0）:', await page.locator('.wall-shape').count())
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
console.log('撤销删除后墙体数量（期望 1）:', await page.locator('.wall-shape').count())

// 导出 PNG
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.getByRole('button', { name: '导出 PNG' }).click()
])
console.log('导出文件:', download.suggestedFilename())
await download.saveAs('/tmp/fp-export.png')

await page.screenshot({ path: '/tmp/fp-shot.png' })
console.log('运行时错误:', errors.length ? errors : '无')
await browser.close()
