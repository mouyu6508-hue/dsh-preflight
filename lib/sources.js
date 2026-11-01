import YAML from 'yaml'
/**
 * 把一个 spec 变成 manifest：
 *   npm 包名            react
 *   npm 包名@版本        dsh-fusion@0.1.0
 *   github:owner/repo   github:mouyu6508-hue/dsh-fusion（可带 #ref）
 *   本地目录            ./dsh-fusion 或 C:\path\to\plugin
 */

import fs from 'node:fs'
import path from 'node:path'

export function parseSpec(spec) {
  const s = String(spec ?? '').trim()
  if (!s) throw new Error('spec 为空')
  if (s.startsWith('github:')) {
    const body = s.slice('github:'.length)
    const [repoPart, ref = ''] = body.split('#')
    const [owner, repo] = repoPart.split('/')
    if (!owner || !repo) throw new Error(`github spec 不对：${s}（应形如 github:owner/repo）`)
    return { kind: 'github', owner, repo, ref }
  }
  if (s.startsWith('.') || s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s)) {
    return { kind: 'local', dir: path.resolve(s) }
  }
  const at = s.lastIndexOf('@')
  if (at > 0) return { kind: 'npm', name: s.slice(0, at), version: s.slice(at + 1) }
  return { kind: 'npm', name: s }
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': 'dsh-preflight', accept: 'application/json', ...headers } })
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`)
  return res.json()
}

/** npm：取指定版本或 latest 的完整 manifest */
export async function fetchNpm(spec) {
  const meta = await getJson(`https://registry.npmjs.org/${encodeURIComponent(spec.name).replace('%40', '@')}`)
  const version = spec.version || meta['dist-tags']?.latest
  if (!version) throw new Error(`${spec.name} 没有 latest 版本`)
  const manifest = meta.versions?.[version]
  if (!manifest) throw new Error(`${spec.name}@${version} 不存在`)
  return { manifest, resolved: { source: 'npm', name: spec.name, version } }
}

/** GitHub：读仓库根的 package.json */
export async function fetchGithub(spec) {
  const refs = spec.ref ? [spec.ref] : ['main', 'master']
  for (const ref of refs) {
    try {
      const manifest = await getJson(`https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${ref}/package.json`)
      return { manifest, resolved: { source: 'github', repo: `${spec.owner}/${spec.repo}`, ref } }
    } catch {
      /* 试下一个 ref */
    }
  }
  throw new Error(`读不到 ${spec.owner}/${spec.repo} 的 package.json（试过 ${refs.join(', ')}）`)
}

/** 本地目录 */
export function fetchLocal(spec) {
  const file = path.join(spec.dir, 'package.json')
  if (!fs.existsSync(file)) throw new Error(`目录里没有 package.json：${file}`)
  return { manifest: JSON.parse(fs.readFileSync(file, 'utf8')), resolved: { source: 'local', dir: spec.dir } }
}

/** 统一入口 */
export async function resolveSpec(spec) {
  const parsed = parseSpec(spec)
  if (parsed.kind === 'npm') {
    const r = await fetchNpm(parsed)
    return { ...r, spec: parsed }
  }
  if (parsed.kind === 'github') {
    const r = await fetchGithub(parsed)
    return { ...r, spec: parsed }
  }
  const r = fetchLocal(parsed)
  return { ...r, spec: parsed }
}

/**
 * 目标插件的 patch 行（用来做 loader 撞名预判）。
 * 本地直接读；GitHub 取 raw；npm 包不下载 tarball，返回空并说明原因。
 * @returns {Promise<{rows: Array<object>, note?: string}>}
 */
export async function loadTargetLoaders(manifest, resolved) {
  const patchRel = manifest?.dsh?.bundle?.patch ?? 'cordis.patch.yml'
  if (resolved?.source === 'local') {
    const { readPatchRows } = await import('./profile.js')
    return { rows: readPatchRows(path.join(resolved.dir, patchRel)) }
  }
  if (resolved?.source === 'github') {
    const [owner, repo] = resolved.repo.split('/')
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${resolved.ref}/${patchRel.replace(/^\.\//, '')}`
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'dsh-preflight' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { readPatchRows } = await import('./profile.js')
      return { rows: readPatchRowsFromText(await res.text()) }
    } catch {
      return { rows: [], note: `取不到 ${patchRel}，跳过 loader 撞名预判` }
    }
  }
  return { rows: [], note: 'npm 包需要下 tarball 才能看 patch，v0.1 先跳过撞名预判' }
}

function readPatchRowsFromText(text) {
  // 复用 profile.js 的解析逻辑：它只接受文件，这里临时写个最小实现
  try {
    const doc = YAML.parse(text.replace(/!!js\b/g, '!js'), {
      customTags: [{ tag: '!js', resolve: (v) => v, identify: () => false }],
    })
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
