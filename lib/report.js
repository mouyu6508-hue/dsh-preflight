/**
 * 把 core / profile / sources 拼成三份报告：
 *   checkPlugin  装之前
 *   inventory    装之后
 *   updateRisks  更新前
 */

import { checkLoaders, checkManifest, classify, compareVersions, diffFindings, grade, oneLine } from './core.js'
import { readProfile, hostVersion as envHostVersion } from './profile.js'
import { loadTargetLoaders, resolveSpec } from './sources.js'

const LEVEL_ORDER = { high: 0, medium: 1, low: 2 }

/** 并发跑异步任务，最多 limit 个同时在飞 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      try {
        out[idx] = await fn(items[idx], idx)
      } catch (error) {
        out[idx] = { error: error.message }
      }
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * 装之前：这个 spec 能不能装、装完会不会出事。
 * @param {string} spec npm 包名 / github:owner/repo / 本地目录
 * @param {{profileDir?: string, hostVersion?: string}} options
 */
export async function checkPlugin(spec, options = {}) {
  const profile = options.profileDir ? readProfile({ dir: options.profileDir }) : null
  const installed = {}
  let loaderRows = []
  if (profile) {
    for (const p of profile.plugins) if (p.installed) installed[p.bundle] = p.version
    loaderRows = profile.loaderRows
  }

  const { manifest, resolved } = await resolveSpec(spec)
  const host = options.hostVersion ?? envHostVersion()

  const findings = checkManifest({
    manifest,
    hostVersion: host ?? undefined,
    installed,
    platform: process.platform,
    arch: process.arch,
  })

  const target = await loadTargetLoaders(manifest, resolved)
  if (target.note) findings.push({ severity: 'info', code: 'loader-skip', title: target.note, detail: '', hint: '' })
  const loaders = checkLoaders(target.rows, loaderRows)
  findings.push(...loaders)

  const g = grade(findings)
  return {
    spec,
    name: manifest.name,
    version: manifest.version,
    categories: classify(manifest),
    summary: oneLine(manifest),
    resolved,
    findings,
    grade: g,
    loaderRows: target.rows,
  }
}

/** 装之后：分好类的装机清单 */
export function inventory(options = {}) {
  const profile = readProfile(options)
  const groups = new Map()
  for (const p of profile.plugins) {
    if (!p.installed) continue
    const cats = classify(p.manifests)
    for (const c of cats.slice(0, 1)) {
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c).push({
        bundle: p.bundle,
        version: p.version,
        categories: cats,
        hasBundle: p.hasBundle,
        hasClient: p.hasClient,
        peer: Object.keys(p.peer).length,
        deps: p.deps,
        patchRows: p.patchRows,
        disabled: p.disabled,
        summary: oneLine(p.manifests),
      })
    }
  }
  const list = [...groups.entries()]
    .map(([category, items]) => ({ category, items: items.sort((a, b) => a.bundle.localeCompare(b.bundle)) }))
    .sort((a, b) => a.category.localeCompare(b.category))
  return {
    dir: profile.dir,
    total: profile.plugins.filter((p) => p.installed).length,
    missing: profile.plugins.filter((p) => !p.installed).map((p) => p.bundle),
    groups: list,
    loaderCount: profile.loaderRows.length,
  }
}

/** 更新前：有哪些更新、每个更新会不会引入新问题 */
export async function updateRisks(options = {}) {
  const profile = readProfile(options)
  const host = options.hostVersion ?? envHostVersion()
  const installedMap = {}
  for (const p of profile.plugins) if (p.installed) installedMap[p.bundle] = p.version

  const rows = await mapLimit(
    profile.plugins.filter((p) => p.installed),
    5,
    async (p) => {
      // 只查 npm 上有的；github 直装的包查不到就标 unknown
      const meta = await fetch(`https://registry.npmjs.org/${encodeURIComponent(p.bundle)}`, {
        headers: { 'user-agent': 'dsh-preflight', accept: 'application/json' },
      }).catch(() => null)
      if (!meta || !meta.ok) return { bundle: p.bundle, current: p.version, latest: null, status: 'unknown' }
      const data = await meta.json()
      const latest = data['dist-tags']?.latest
      if (!latest) return { bundle: p.bundle, current: p.version, latest: null, status: 'unknown' }
      if (compareVersions(latest, p.version) <= 0) return { bundle: p.bundle, current: p.version, latest, status: 'current' }

      const next = data.versions?.[latest]
      if (!next) return { bundle: p.bundle, current: p.version, latest, status: 'unknown' }

      const before = checkManifest({ manifest: p.manifests, hostVersion: host ?? undefined, installed: installedMap })
      const after = checkManifest({ manifest: next, hostVersion: host ?? undefined, installed: installedMap })
      const diff = diffFindings(before, after)
      const g = grade(after)
      return {
        bundle: p.bundle,
        current: p.version,
        latest,
        status: 'outdated',
        grade: g,
        newly: diff.newly,
        fixed: diff.fixed,
        categories: classify(next),
      }
    },
  )

  const outdated = rows.filter((r) => r.status === 'outdated')
  outdated.sort((a, b) => LEVEL_ORDER[a.grade.level] - LEVEL_ORDER[b.grade.level])
  return {
    dir: profile.dir,
    checked: rows.length,
    outdated,
    current: rows.filter((r) => r.status === 'current').length,
    unknown: rows.filter((r) => r.status === 'unknown').map((r) => r.bundle),
    errors: rows.filter((r) => r.error),
  }
}
