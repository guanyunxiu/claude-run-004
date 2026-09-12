/**
 * 层级渲染顺序验证：
 * 模拟 WorldElement 统一渲染——SVG 后绘制者在上，因此 elements 数组顺序
 * 必须能被 bringToFront/sendToBack/moveUp/moveDown 跨类型改变。
 */
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPath = resolve(root, '.layer_entry.ts')
const bundlePath = resolve(root, '.layer_bundle.mjs')
writeFileSync(entryPath, `export { bringToFront, sendToBack, moveUp, moveDown } from './src/lib/layering'`)
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  absWorkingDir: root,
  logLevel: 'silent'
})
const L = await import(bundlePath)

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? '  ' + e : ''}`)
  c ? pass++ : fail++
}

// 典型场景：墙在下、家具在中、标注在上；把墙置顶后应在最上（覆盖家具/标注）
const els = [
  { id: 'wall1', kind: 'wall' },
  { id: 'door1', kind: 'door' },
  { id: 'fur1', kind: 'furniture' },
  { id: 'fur2', kind: 'furniture' },
  { id: 'dim1', kind: 'dimension' }
]

// SVG 绘制顺序：数组末尾 = 最上层
const order = (a) => a.map((e) => e.id).join(',')

{
  const r = L.bringToFront(els, new Set(['wall1']))
  check('跨类型置顶：墙到最上层（在家具/标注之后绘制）', r.at(-1).id === 'wall1', order(r))
}
{
  const r = L.sendToBack(els, new Set(['dim1']))
  check('跨类型置底：标注到最底层（最先绘制）', r[0].id === 'dim1', order(r))
}
{
  // 家具 fur1 上移一层，应越过 fur2
  const r = L.moveUp(els, new Set(['fur1']))
  check('上移一层：fur1 越过相邻的 fur2', order(r) === 'wall1,door1,fur2,fur1,dim1', order(r))
}
{
  // 家具 fur1 跨类型上移：把 door1 之后的 fur1 上移到 door 之前……
  // fur1 前面是 door1（非选中），下移 fur1 应越过 door1
  const r = L.moveDown(els, new Set(['fur1']))
  check('下移一层：fur1 跨类型越过 door1', order(r) === 'wall1,fur1,door1,fur2,dim1', order(r))
}
{
  // 多选一起置顶，保持相对顺序
  const r = L.bringToFront(els, new Set(['wall1', 'door1']))
  check('多选置顶保持组内相对顺序', order(r) === 'fur1,fur2,dim1,wall1,door1', order(r))
}

rmSync(entryPath)
rmSync(bundlePath)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
