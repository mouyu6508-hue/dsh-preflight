/**
 * dsh-preflight —— 插件入口。
 *
 * 三个工具对应插件生命周期的三个时刻：
 *   preflight_check     装之前：能不能装、装完会不会撞
 *   preflight_inventory 装之后：分好类的装机清单
 *   preflight_updates   更新前：哪些更新会引入新问题
 *
 * 全部只读：不装、不卸、不改任何插件的运行状态。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { checkPlugin, inventory, updateRisks } from './report.js'
import { listProfiles } from './profile.js'

export const name = 'dsh-preflight'
export const inject = ['tools']

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

const commonParams = (defaultProfile) => ({
  profile: { type: 'string', description: `profile 名（默认 ${defaultProfile}）` },
  dir: { type: 'string', description: '直接给 profile 目录，优先于 profile' },
})

export function apply(ctx, config = {}) {
  const defaultProfile = typeof config?.profile === 'string' ? config.profile : 'desktop'

  ctx.tools.register(
    defineTool({
      name: 'preflight_check',
      description:
        '装之前体检一个 DSH 插件：能不能装（有没有 dsh.bundle）、引擎/peer 依赖兼不兼容、要不要编译原生模块、' +
        '以及它的 patch 会不会和已装插件撞 loader 名（install-shadow 预判）。装之前用它，比装完起不来再查省事。',
      parameters: {
        spec: {
          type: 'string',
          required: true,
          description: 'npm 包名 / github:owner/repo / 本地目录',
        },
        ...commonParams(defaultProfile),
      },
      execute(args) {
        return checkPlugin(args.spec, { profile: args.profile ?? defaultProfile, dir: args.dir })
          .then((r) => ({
            ok: r.grade.level !== 'high',
            name: r.name,
            version: r.version,
            level: r.grade.level,
            report: [
              `检查：${r.name}@${r.version}`,
              `分类：${r.categories.join(' / ')}`,
              `结论：${r.grade.label}${r.grade.blocked ? '（装了也起不来）' : ''}`,
              '',
              renderFindings(r.findings),
            ].join('\n'),
          }))
          .catch((error) => ({ ok: false, name: args.spec, version: '?', level: 'high', report: `检查失败：${error.message}` }))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'preflight_inventory',
      description: '把当前 profile 已安装的插件按能力分类列出来（界面/工具/记忆/语音/计费/会话/市场…），每行带版本、是否带前端、peer 依赖数、是否被停用。',
      parameters: commonParams(defaultProfile),
      execute(args) {
        try {
          const inv = inventory({ profile: args.profile ?? defaultProfile, dir: args.dir })
          const lines = [`profile：${inv.dir}`, `已装：${inv.total} 个｜loader 行：${inv.loaderCount}`]
          for (const g of inv.groups) {
            lines.push(`\n【${g.category}】${g.items.length} 个`)
            for (const it of g.items) lines.push(`  ${it.bundle} ${it.summary}${it.disabled ? '（已停用）' : ''}`)
          }
          if (inv.missing.length) lines.push(`\n宿主自带（不在 node_modules）：${inv.missing.join(', ')}`)
          return { ok: true, total: inv.total, groups: inv.groups.length, report: lines.join('\n') }
        } catch (error) {
          return { ok: false, total: 0, groups: 0, report: `读取失败：${error.message}｜可用 profile：${listProfiles().join(', ')}` }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'preflight_updates',
      description: '列出已安装插件的可用更新，并对每个更新预判风险：把新版本的 manifest 跑一遍同样的兼容性检查，看它会不会引入新的引擎/peer 冲突或被废弃的依赖。',
      parameters: commonParams(defaultProfile),
      execute(args) {
        return updateRisks({ profile: args.profile ?? defaultProfile, dir: args.dir })
          .then((r) => {
            const lines = [`检查了 ${r.checked} 个：${r.outdated.length} 个有更新，${r.current} 个已是最新`]
            for (const u of r.outdated) {
              lines.push(`\n${u.bundle}：${u.current} → ${u.latest}  【${u.grade.label}】`)
              for (const f of u.newly.slice(0, 5)) lines.push(`  + ${f.title}`)
              for (const f of u.fixed.slice(0, 3)) lines.push(`  - 已修复：${f.title}`)
            }
            if (r.unknown.length) lines.push(`\n非 npm 发布、查不到版本：${r.unknown.join(', ')}`)
            return { ok: true, outdated: r.outdated.length, current: r.current, report: lines.join('\n') }
          })
          .catch((error) => ({ ok: false, outdated: 0, current: 0, report: `检查失败：${error.message}` }))
      },
    }),
  )
}
