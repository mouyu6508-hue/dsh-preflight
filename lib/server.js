/**
 * host 侧的 HTTP 接口：给面板取数据用。
 * 只读，不改任何插件状态。
 */

import { inventory, updateRisks, checkPlugin } from './report.js'

const PREFIX = '/api/dsh-preflight'

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * 注册三条只读路由。
 * @param {any} ctx cordis 上下文（需要 ctx.webServer）
 * @param {{profile?: string}} config
 * @returns {Array<() => void>} 卸载函数
 */
export function registerRoutes(ctx, config = {}) {
  if (!ctx?.webServer || typeof ctx.webServer.register !== 'function') return []
  const profile = config.profile ?? 'desktop'
  const offs = []

  offs.push(
    ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/inventory`,
      handler(req, res) {
        try {
          json(res, 200, inventory({ profile }))
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
  )

  offs.push(
    ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/updates`,
      async handler(req, res) {
        try {
          json(res, 200, await updateRisks({ profile }))
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
  )

  offs.push(
    ctx.webServer.register({
      kind: 'prefix',
      path: `${PREFIX}/check`,
      async handler(req, res) {
        try {
          const url = new URL(req.url, 'http://localhost')
          const spec = url.searchParams.get('spec')
          if (!spec) return json(res, 400, { error: '缺少 spec 参数' })
          const result = await checkPlugin(spec, { profile })
          json(res, 200, {
            name: result.name,
            version: result.version,
            level: result.grade.level,
            blocked: result.grade.blocked,
            label: result.grade.label,
            categories: result.categories,
            findings: result.findings,
          })
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
  )

  return offs
}
