/**
 * dsh-preflight —— 插件入口（诊断版：依赖全部动态加载，任何一步失败都写日志）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-preflight'
export const inject = ['tools', 'webServer']

const LOG = path.join(os.homedir(), '.dsh', 'preflight-boot.log')

function log(line) {
  try {
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* ignore */
  }
}

const ICON = { error: '✗', warn: '!', info: '·' }

function renderFindings(findings = []) {
  return findings
    .map((f) => {
      const head = `${ICON[f.severity] ?? '·'} ${f.title}`
      const detail = f.detail ? `\n    ${f.detail}` : ''
      const hint = f.hint ? `\n    → ${f.hint}` : ''
      return head + detail + hint
    })
    .join('\n')
}

const output = (key) => ({
  schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean', required: true }, report: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.report }],
})
const commonParams = (p) => ({
  profile: { type: 'string', description: `profile 名（默认 ${p}）` },
  dir: { type: 'string', description: '直接给 profile 目录，优先于 profile' },
})

export async function apply(ctx, config = {}) {
  log('apply() 进入')
  const defaultProfile = typeof config?.profile === 'string' ? config.profile : 'desktop'

  let defineTool
  let report
  let profileMod

  try {
    ;({ defineTool } = await import('@deepseek-ai/dsh-tools'))
    log('import dsh-tools OK')
  } catch (e) {
    log(`import dsh-tools 失败: ${e?.message ?? e}`)
    return
  }

  try {
    report = await import('./report.js')
    profileMod = await import('./profile.js')
    log('import report/profile OK')
  } catch (e) {
    log(`import report/profile 失败: ${e?.message ?? e}`)
    return
  }

  try {
    const server = await import('./server.js')
    const offs = server.registerRoutes(ctx, { profile: defaultProfile })
    log(`registerRoutes -> ${offs.length} 条`)
    if (offs.length) {
      ctx.effect(() => () => {
        for (const off of offs) {
          try {
            off()
          } catch {
            /* ignore */
          }
        }
      })
    }
  } catch (e) {
    log(`registerRoutes 失败: ${e?.message ?? e}`)
  }

  try {
    ctx.tools.register(
      defineTool({
        name: 'preflight_check',
        description:
          '装之前体检一个 DSH 插件：dsh.bundle、引擎/peer 兼容性、原生编译、平台限制，以及 patch 会不会和已装插件撞 loader 名。',
        output: output(),
        parameters: {
          spec: { type: 'string', required: true, description: 'npm 包名 / github:owner/repo / 本地目录' },
          ...commonParams(defaultProfile),
        },
        execute(args) {
          return report
            .checkPlugin(args.spec, { profile: args.profile ?? defaultProfile, dir: args.dir })
            .then((r) => ({
              ok: r.grade.level !== 'high',
              name: r.name,
              version: r.version,
              level: r.grade.level,
              report: [`检查：${r.name}@${r.version}`, `结论：${r.grade.label}`, '', renderFindings(r.findings)].join('\n'),
            }))
            .catch((e) => ({ ok: false, name: args.spec, version: '?', level: 'high', report: `检查失败：${e.message}` }))
        },
      }),
    )

    ctx.tools.register(
      defineTool({
        name: 'preflight_inventory',
        description: '把已安装插件按能力分类列出（界面/工具/记忆/语音/计费/会话…）。',
        output: output(),
        parameters: commonParams(defaultProfile),
        execute(args) {
          try {
            const inv = report.inventory({ profile: args.profile ?? defaultProfile, dir: args.dir })
            const lines = [`profile：${inv.dir}`, `已装：${inv.total} 个｜loader 行：${inv.loaderCount}`]
            for (const g of inv.groups) {
              lines.push(`\n【${g.category}】${g.items.length} 个`)
              for (const it of g.items) lines.push(`  ${it.bundle} ${it.summary}${it.disabled ? '（已停用）' : ''}`)
            }
            return { ok: true, total: inv.total, groups: inv.groups.length, report: lines.join('\n') }
          } catch (e) {
            return { ok: false, total: 0, groups: 0, report: `读取失败：${e.message}｜profile：${profileMod.listProfiles().join(', ')}` }
          }
        },
      }),
    )

    ctx.tools.register(
      defineTool({
        name: 'preflight_updates',
        description: '列出可用更新，并对每个更新预判风险（新版本 manifest 跑同一套检查）。',
        output: output(),
        parameters: commonParams(defaultProfile),
        execute(args) {
          return report
            .updateRisks({ profile: args.profile ?? defaultProfile, dir: args.dir })
            .then((r) => {
              const lines = [`检查了 ${r.checked} 个：${r.outdated.length} 个有更新，${r.current} 个已是最新`]
              for (const u of r.outdated) lines.push(`\n${u.bundle}：${u.current} → ${u.latest}  【${u.grade.label}】`)
              return { ok: true, outdated: r.outdated.length, current: r.current, report: lines.join('\n') }
            })
            .catch((e) => ({ ok: false, outdated: 0, current: 0, report: `检查失败：${e.message}` }))
        },
      }),
    )
    log('三个工具注册完成')
  } catch (e) {
    log(`注册工具失败: ${e?.message ?? e}`)
  }
}
