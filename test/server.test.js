import assert from 'node:assert/strict'
import test from 'node:test'
import { registerRoutes } from '../lib/server.js'

function fakeCtx() {
  const routes = []
  return {
    routes,
    webServer: {
      register(opts) {
        routes.push(opts)
        return () => {
          const i = routes.indexOf(opts)
          if (i >= 0) routes.splice(i, 1)
        }
      },
    },
  }
}

function fakeRes() {
  const out = { status: null, body: null }
  return {
    out,
    writeHead(status) {
      out.status = status
    },
    end(text) {
      out.body = JSON.parse(text)
    },
  }
}

test('registerRoutes：没有 webServer 时安静返回空数组', () => {
  assert.deepEqual(registerRoutes({}, {}), [])
  assert.deepEqual(registerRoutes(null, {}), [])
})

test('registerRoutes：注册 ping + 三条只读路由', () => {
  const ctx = fakeCtx()
  const offs = registerRoutes(ctx, { profile: 'desktop' })
  assert.equal(offs.length, 4)
  assert.deepEqual(
    ctx.routes.map((r) => r.path),
    [
      '/api/dsh-preflight/ping',
      '/api/dsh-preflight/inventory',
      '/api/dsh-preflight/updates',
      '/api/dsh-preflight/check',
    ],
  )
  // 卸载函数可用
  offs[0]()
  assert.equal(ctx.routes.length, 3)
})

test('inventory 路由返回真实装机数据', () => {
  const ctx = fakeCtx()
  registerRoutes(ctx, { profile: 'desktop' })
  const route = ctx.routes.find((r) => r.path.endsWith('/inventory'))
  const res = fakeRes()
  route.handler({ method: 'GET', url: '/api/dsh-preflight/inventory' }, res)
  assert.equal(res.out.status, 200)
  assert.ok(res.out.body.total > 5, `应读到多个插件，实际 ${res.out.body.total}`)
  assert.ok(Array.isArray(res.out.body.groups))
})

test('inventory 路由能容忍带 BOM 的 package.json', () => {
  // 回归：曾经因为 profile/package.json 带 BOM 读到 0 个插件
  const ctx = fakeCtx()
  registerRoutes(ctx, { profile: 'desktop' })
  const route = ctx.routes.find((r) => r.path.endsWith('/inventory'))
  const res = fakeRes()
  route.handler({ method: 'GET', url: '/api/dsh-preflight/inventory' }, res)
  assert.ok(res.out.body.total > 0)
})

test('check 路由缺少 spec 时返回 400', async () => {
  const ctx = fakeCtx()
  registerRoutes(ctx, { profile: 'desktop' })
  const route = ctx.routes.find((r) => r.path.endsWith('/check'))
  const res = fakeRes()
  await route.handler({ method: 'GET', url: '/api/dsh-preflight/check' }, res)
  assert.equal(res.out.status, 400)
  assert.match(res.out.body.error, /spec/)
})
