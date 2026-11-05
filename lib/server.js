/**
 * host 侧的 HTTP 接口：给面板取数据用。
 * 只读，不改任何插件状态。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inventory, updateRisks, checkPlugin } from './report.js'

const PREFIX = '/api/dsh-preflight'
const CLIENT_LOG = path.join(os.homedir(), '.dsh', 'preflight-client.log')

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
  // cordis 的 ctx.get 对未注入的服务返回 undefined，比直接取属性安全
  const webServer = (typeof ctx?.get === 'function' ? ctx.get('webServer') : null) ?? ctx?.webServer
  if (!webServer || typeof webServer.register !== 'function') return []
  const profile = config.profile ?? 'desktop'
  const offs = []

  // 浏览器半边探针：client.js 加载/apply 时打点，host 写文件
  offs.push(
    webServer.register({
      kind: 'exact',
      path: `${PREFIX}/ping`,
      handler(req, res) {
        try {
          const url = new URL(req.url, 'http://localhost')
          const stage = url.searchParams.get('stage') ?? '?'
          const extra = url.searchParams.get('extra') ?? ''
          fs.appendFileSync(CLIENT_LOG, `${new Date().toISOString()} ${stage} ${extra}\n`)
          json(res, 200, { ok: true })
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
  )

  offs.push(
    webServer.register({
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
    webServer.register({
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
    webServer.register({
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
