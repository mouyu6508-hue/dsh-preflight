#!/usr/bin/env node
/**
 * dsh-preflight CLI —— 不启动 DSH 也能体检。
 *
 *   dsh-preflight inventory [--profile desktop] [--json]
 *   dsh-preflight check github:owner/repo [--profile desktop] [--json]
 *   dsh-preflight updates [--profile desktop] [--json]
 */

import { checkPlugin, inventory, updateRisks } from '../lib/report.js'
import { listProfiles } from '../lib/profile.js'

function parseArgs(argv) {
  const args = { _: [], json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--profile') args.profile = argv[++i]
    else if (a === '--dir') args.dir = argv[++i]
    else if (a.startsWith('-')) throw new Error(`不认识的参数：${a}`)
    else args._.push(a)
  }
  return args
}

const ICON = { error: '✗', warn: '!', info: '·' }

function printFindings(findings) {
  for (const f of findings) {
    const mark = ICON[f.severity] ?? '·'
    console.log(`  ${mark} ${f.title}`)
    if (f.detail) console.log(`      ${f.detail}`)
    if (f.hint) console.log(`      → ${f.hint}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  const profileOptions = { profile: args.profile, dir: args.dir }

  if (cmd === 'profiles') {
    console.log(listProfiles().join('\n') || '(没有 profile)')
    return
  }

  if (cmd === 'inventory') {
    const inv = inventory(profileOptions)
    if (args.json) return console.log(JSON.stringify(inv, null, 2))
    console.log(`profile：${inv.dir}`)
    console.log(`已装：${inv.total} 个插件｜loader 行：${inv.loaderCount}`)
    for (const g of inv.groups) {
      console.log(`\n【${g.category}】${g.items.length} 个`)
      for (const it of g.items) {
        const flag = it.disabled ? '（已停用）' : ''
        console.log(`  ${it.bundle.padEnd(34)} v${String(it.version).padEnd(9)} ${it.summary}${flag}`)
      }
    }
    if (inv.missing.length) {
      console.log(`\n⚠ 没在 node_modules 里找到（通常由宿主自带）：${inv.missing.join(', ')}`)
    }
    return
  }

  if (cmd === 'check') {
    const spec = args._[1]
    if (!spec) throw new Error('要检查什么？例：dsh-preflight check github:owner/repo')
    const r = await checkPlugin(spec, profileOptions)
    if (args.json) return console.log(JSON.stringify(r, null, 2))
    console.log(`检查：${r.name}@${r.version}`)
    console.log(`分类：${r.categories.join(' / ')}`)
    console.log(`结论：${r.grade.label}${r.grade.blocked ? '（装了也起不来）' : ''}\n`)
    printFindings(r.findings)
    return
  }

  if (cmd === 'updates') {
    const r = await updateRisks(profileOptions)
    if (args.json) return console.log(JSON.stringify(r, null, 2))
    console.log(`检查了 ${r.checked} 个插件：${r.outdated.length} 个有更新，${r.current} 个已是最新`)
    for (const u of r.outdated) {
      console.log(`\n${u.bundle}：${u.current} → ${u.latest}  【${u.grade.label}】`)
      for (const f of u.newly.slice(0, 5)) console.log(`  + ${f.title}${f.detail ? '：' + f.detail : ''}`)
      for (const f of u.fixed.slice(0, 3)) console.log(`  - 已修复：${f.title}`)
    }
    if (r.unknown.length) console.log(`\n查不到版本信息（非 npm 发布）：${r.unknown.join(', ')}`)
    return
  }

  console.log(`dsh-preflight

  inventory [--profile desktop]      看装了哪些插件、各自提供什么
  check <spec> [--profile desktop]   装之前体检（npm 包名 / github:owner/repo / 本地目录）
  updates [--profile desktop]        看更新，并预判更新后会不会出问题
  profiles                           列出本机 profile

  加 --json 输出机器可读格式`)
  if (cmd) process.exitCode = 1
}

main().catch((error) => {
  console.error('出错了：', error.message)
  process.exitCode = 1
})
