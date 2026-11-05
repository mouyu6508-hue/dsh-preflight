import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const selfDir = path.join(here, '..')

let plugin = null
try {
  plugin = await import('../lib/index.js')
} catch {
  plugin = null
}
const skip = plugin ? false : '没有 @deepseek-ai/dsh-tools（宿主不在本机）'

async function boot() {
  const tools = []
  await plugin.apply({ tools: { register: (t) => tools.push(t) }, effect: () => {} }, {})
  return Object.fromEntries(tools.map((t) => [t.name, t]))
}

test('apply：注册三个工具', { skip }, async () => {
  const tools = await boot()
  assert.deepEqual(Object.keys(tools).sort(), ['preflight_check', 'preflight_inventory', 'preflight_updates'])
})

test('每个工具都带 output.render（defineTool 必需）', { skip }, async () => {
  const tools = await boot()
  for (const t of Object.values(tools)) {
    assert.equal(typeof t.output?.render, 'function', `${t.name} 缺少 output.render`)
    assert.equal(typeof t.output?.schema, 'object', `${t.name} 缺少 output.schema`)
  }
})

test('preflight_inventory：能读出真实 profile', { skip }, async () => {
  const tools = await boot()
  const r = tools.preflight_inventory.execute({ profile: 'desktop' })
  assert.equal(r.ok, true)
  assert.ok(r.total > 5, `应该读到多个插件，实际 ${r.total}`)
  assert.match(r.report, /【/)
})

test('preflight_check：本地目录（本插件自己）判为可装', { skip }, async () => {
  const tools = await boot()
  const r = await tools.preflight_check.execute({ spec: selfDir })
  assert.equal(r.name, 'dsh-preflight')
  assert.equal(r.level, 'low', r.report)
  assert.match(r.report, /结论：低风险/)
})

test('preflight_check：没有 dsh.bundle 的目录会被拦下', { skip }, async () => {
  const tools = await boot()
  const r = await tools.preflight_check.execute({ spec: path.join(here, 'fixtures', 'no-bundle') })
  assert.equal(r.ok, false)
  assert.equal(r.level, 'high')
  assert.match(r.report, /没有声明 dsh\.bundle/)
})
