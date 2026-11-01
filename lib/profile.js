/**
 * 读真实的 profile：装了哪些插件、各自什么版本、patch 里插了哪些 loader、谁被停用了。
 * 只读文件系统，不改任何东西。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

export function resolveHome() {
  if (process.env.DSH_HOME) return path.resolve(process.env.DSH_HOME)
  return path.join(os.homedir(), '.dsh')
}

export function listProfiles(home = resolveHome()) {
  const dir = path.join(home, 'profiles')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 解析 patch 里的 loader 行（容错：不是合法 YAML 就当空） */
export function readPatchRows(file) {
  if (!fs.existsSync(file)) return []
  try {
    const doc = YAML.parse(fs.readFileSync(file, 'utf8').replace(/!!js\b/g, '!js'), { customTags: [{ tag: '!js', resolve: (v) => v, identify: () => false }] })
    const rows = []
    for (const item of Array.isArray(doc) ? doc : []) {
      if (Array.isArray(item?.insert)) rows.push(...item.insert)
      else if (item && typeof item === 'object') rows.push(item)
    }
    return rows.filter((r) => r?.id || r?.name)
  } catch {
    return []
  }
}

/**
 * 读一个 profile 的完整装机情况。
 * @param {{profile?: string, dir?: string, home?: string}} options
 */
export function readProfile(options = {}) {
  const home = options.home ?? resolveHome()
  const dir = options.dir ? path.resolve(options.dir) : path.join(home, 'profiles', options.profile ?? 'desktop')
  if (!fs.existsSync(dir)) throw new Error(`找不到 profile：${dir}`)

  const pkg = readJson(path.join(dir, 'package.json')) ?? {}
  const bundles = pkg?.dsh?.profile?.bundles ?? []
  const nm = path.join(dir, 'node_modules')

  // profile 自己那层补丁：谁被 disabled
  const ownRows = readPatchRows(path.join(dir, 'cordis.patch.yml'))
  const disabledIds = new Set(ownRows.filter((r) => r.disabled === true).map((r) => r.id))

  const plugins = []
  const loaderRows = []

  for (const bundle of bundles) {
    const pkgDir = path.join(nm, ...bundle.split('/'))
    const manifest = readJson(path.join(pkgDir, 'package.json'))
    if (!manifest) {
      plugins.push({ bundle, installed: false })
      continue
    }
    const dsh = manifest.dsh ?? {}
    const patchPath = path.join(pkgDir, dsh.bundle?.patch ?? 'cordis.patch.yml')
    const rows = readPatchRows(patchPath)
    for (const r of rows) if (r.name) loaderRows.push({ id: r.id, name: r.name, source: bundle })

    plugins.push({
      bundle,
      installed: true,
      version: manifest.version,
      description: manifest.description,
      keywords: manifest.keywords,
      hasBundle: Boolean(dsh.bundle?.patch),
      hasClient: Boolean(dsh.client),
      peer: manifest.peerDependencies ?? {},
      engines: manifest.engines ?? {},
      deps: Object.keys(manifest.dependencies ?? {}).length,
      patchRows: rows.length,
      manifests: manifest,
      dir: pkgDir,
      disabled: rows.some((r) => r.id && disabledIds.has(r.id)),
    })
  }

  return { dir, home, bundles, plugins, loaderRows, disabledIds }
}

/** host 版本：环境变量 → 返回 null（调用方自行降级） */
export function hostVersion() {
  return process.env.DSH_VERSION || null
}
