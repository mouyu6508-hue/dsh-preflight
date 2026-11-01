/**
 * dsh-preflight 核心引擎（纯函数，不碰网络也不碰磁盘）。
 *
 * 三个时刻共用它：
 *   装之前 —— checkManifest + checkLoaders
 *   装之后 —— classify（给已装插件分类）
 *   更新前 —— 同一套检查跑在新版本 manifest 上，比出风险变化
 */

const CATEGORY_ORDER = [
  'ui', 'tools', 'memory', 'voice', 'model', 'usage', 'workflow',
  'session', 'market', 'dev', 'vision', 'docs', 'notify', 'fun',
]

// 只看 name / description / keywords —— 千万别把 peer 依赖名算进来，
// 否则每个插件都含 "@deepseek-ai/dsh-tools"，会被全部判成同一类。
const CATEGORY_RULES = {
  ui: ['sidebar', 'panel', 'theme', 'skin', 'layout', 'composer', 'widget', 'overlay', 'beautify', '界面'],
  tools: ['tool', 'multicad', 'cad', 'pdf', 'file', 'terminal', 'mcp', 'skill', '文件'],
  memory: ['memory', 'remember', 'recall', 'diary', '记忆'],
  voice: ['tts', 'speech', 'voice', 'asr', 'transcrib', 'audio', '语音'],
  model: ['model', 'provider', 'llm', 'vision', 'vision-model'],
  usage: ['cost', 'meter', 'token', 'balance', 'usage', 'price', '计费', '余额'],
  workflow: ['workflow', 'subagent', 'agent', 'goal', 'plan', 'task', '工作流'],
  session: ['session', 'context', 'compact', 'transcript', 'conversation', 'history', '上下文'],
  market: ['market', 'plugin-manager', 'catalog', '插件市场'],
  dev: ['diagnostic', 'doctor', 'preflight', 'conflict', 'fusion', 'debug', '开发'],
  vision: ['vision', 'image', 'ocr', 'lens', '识图'],
  docs: ['doc', 'markdown', 'render', 'export', '文档'],
  notify: ['notify', 'qq', 'wechat', 'message', 'bridge', 'push', '通知'],
  fun: ['pet', 'whale', 'mood', 'joke', 'meme', 'dafeiyu', '趣味'],
}

/** 拆版本号：1.2.3-beta.1 → [1,2,3] + pre */
export function parseVersion(v) {
  const s = String(v ?? '').trim().replace(/^v/, '')
  const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/)
  if (!m) return null
  return { major: +m[1], minor: +(m[2] ?? 0), patch: +(m[3] ?? 0), pre: m[4] ?? '' }
}

/** 比较两个版本：a<b 返回 -1，相等 0，a>b 返回 1 */
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1
  }
  // 有预发布标记的算小
  if (pa.pre && !pb.pre) return -1
  if (!pa.pre && pb.pre) return 1
  if (pa.pre === pb.pre) return 0
  return pa.pre < pb.pre ? -1 : 1
}

function cmp(op, left, right) {
  const c = compareVersions(left, right)
  switch (op) {
    case '>=': return c >= 0
    case '>': return c > 0
    case '<=': return c <= 0
    case '<': return c < 0
    case '=': return c === 0
    default: return false
  }
}

/** 单个比较式：^1.2.3 / ~1.2.3 / >=1.0.0 / 1.2.x / * / 1.2.3 */
function testComparator(version, token) {
  const t = token.trim()
  if (!t || t === '*' || t === 'x' || t === 'latest') return true

  const caret = t.match(/^\^(.+)$/)
  if (caret) {
    const base = parseVersion(caret[1])
    if (!base) return true
    if (compareVersions(version, caret[1]) < 0) return false
    // ^ 只允许在同一 major（0.x 时锁 minor）内
    const v = parseVersion(version)
    if (base.major === 0) {
      return v.major === 0 && v.minor === base.minor
    }
    return v.major === base.major
  }

  const tilde = t.match(/^~(.+)$/)
  if (tilde) {
    const base = parseVersion(tilde[1])
    if (!base) return true
    if (compareVersions(version, tilde[1]) < 0) return false
    const v = parseVersion(version)
    return v.major === base.major && v.minor === base.minor
  }

  const op = t.match(/^(>=|<=|>|<|=)\s*(.+)$/)
  if (op) return cmp(op[1], version, op[2])

  // 1.2.x / 1.x 这种
  if (/[xX*]/.test(t)) {
    const parts = t.split('.').map((p) => p.trim())
    const v = parseVersion(version)
    if (parts[0] && !/[xX*]/.test(parts[0]) && +parts[0] !== v.major) return false
    if (parts[1] && !/[xX*]/.test(parts[1]) && +parts[1] !== v.minor) return false
    return true
  }

  // 纯版本号：视为 >=
  if (parseVersion(t)) return compareVersions(version, t) >= 0
  return true
}

/** 是否满足 range（支持 `||`、空格表示 AND、以及常见前缀） */
export function satisfies(version, range) {
  if (!range) return true
  const groups = String(range).split('||').map((g) => g.trim())
  return groups.some((group) =>
    group
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => testComparator(version, token)),
  )
}

/** 给插件贴分类标签（可以多个） */
export function classify(manifest = {}) {
  const haystack = [manifest.name, manifest.description, ...(manifest.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const hits = []
  for (const [cat, words] of Object.entries(CATEGORY_RULES)) {
    if (words.some((w) => haystack.includes(w))) hits.push(cat)
  }
  if (!hits.length) hits.push('tools')
  return hits.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
}

/** 一条检查结论 */
function finding(severity, code, title, detail, hint) {
  return { severity, code, title, detail, hint }
}

/**
 * 检查一个 manifest 能不能装 / 装了会不会出事。
 * @param {object} options
 * @param {object} options.manifest 目标插件的 package.json
 * @param {string} [options.hostVersion] 当前 DSH 版本
 * @param {Record<string,string>} [options.installed] 已装包名 → 版本
 * @param {string} [options.platform] process.platform
 * @param {string} [options.arch] process.arch
 */
export function checkManifest({ manifest = {}, hostVersion, installed = {}, platform = process.platform, arch = process.arch }) {
  const out = []
  const dsh = manifest.dsh ?? {}

  // 1. 最致命的：没有 dsh.bundle 就装不上
  if (!dsh.bundle?.patch) {
    out.push(
      finding(
        'error',
        'no-bundle',
        '没有声明 dsh.bundle',
        dsh.client
          ? '只声明了 dsh.client —— 那是浏览器半边，单独存在无法安装'
          : 'package.json 里没有 dsh.bundle.patch，dsh plugin add 装不了',
        '在 package.json 加上 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }',
      ),
    )
  }

  // 2. 引擎版本
  const engineRange = manifest.engines?.dsh
  if (engineRange && hostVersion) {
    if (!satisfies(hostVersion, engineRange)) {
      out.push(
        finding(
          'error',
          'engine-mismatch',
          `要求 DSH ${engineRange}，当前是 ${hostVersion}`,
          '版本区间不匹配，装上也加载不起来',
          '要么升级 DSH，要么找支持当前版本的旧版本插件',
        ),
      )
    } else {
      out.push(finding('info', 'engine-ok', `DSH 版本兼容（${hostVersion} ∈ ${engineRange}）`, '', ''))
    }
  } else if (!engineRange) {
    out.push(finding('info', 'engine-unstated', '没有声明 engines.dsh', '兼容性未知，市场会显示「未知」', ''))
  }

  // 3. peer 依赖
  const peers = manifest.peerDependencies ?? {}
  for (const [name, range] of Object.entries(peers)) {
    const have = installed[name]
    if (!have) {
      // @deepseek-ai/* 由宿主自带，不算「缺失」，否则每个插件的报告都会被刷屏
      if (!name.startsWith('@deepseek-ai/')) {
        out.push(finding('info', 'peer-missing', `peer 依赖未安装：${name}`, `要求 ${range}`, '通常由宿主提供，装完再看有没有报错'))
      }
      continue
    }
    if (!satisfies(have, range)) {
      out.push(
        finding(
          'warn',
          'peer-mismatch',
          `peer 冲突：${name}`,
          `插件要求 ${range}，你装的是 ${have}`,
          '装之前先升级/降级这个依赖，否则可能加载失败',
        ),
      )
    }
  }

  // 4. 原生编译
  const scripts = manifest.scripts ?? {}
  const scriptText = Object.values(scripts).join(' ').toLowerCase()
  const nativeDeps = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}) })
  const looksNative =
    /node-gyp|node-pre-gyp|prebuild|cmake|gypfile/.test(scriptText) ||
    nativeDeps.some((d) => /(^|[-/])(nc|napi|node-addon|node-pty|sharp|canvas|onnxruntime)/.test(d))
  if (looksNative) {
    out.push(
      finding(
        'warn',
        'native-build',
        '需要编译原生模块',
        '安装时可能要 node-gyp / 编译工具链，Windows 上还要 VS Build Tools',
        '先在终端跑一次 `dsh plugin add`，把编译错误贴出来比在 GUI 里装好排查',
      ),
    )
  }

  // 5. 安装脚本（安全）
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    if (scripts[hook] && !/node-gyp/.test(scripts[hook])) {
      out.push(
        finding(
          'warn',
          'install-script',
          `${hook} 会执行脚本`,
          String(scripts[hook]).slice(0, 120),
          '插件代码本来就有完整权限，但安装脚本是最容易被忽略的执行点',
        ),
      )
    }
  }

  // 6. 平台限制
  const os = manifest.os
  const cpu = manifest.cpu
  if (Array.isArray(os) && os.length && !os.some((o) => (o.startsWith('!') ? platform !== o.slice(1) : o === platform))) {
    out.push(finding('error', 'platform-mismatch', `只支持 ${os.join('/')}`, `当前是 ${platform}`, '这个包在你的系统上装不了'))
  }
  if (Array.isArray(cpu) && cpu.length && !cpu.includes(arch)) {
    out.push(finding('error', 'arch-mismatch', `只支持 ${cpu.join('/')}`, `当前是 ${arch}`, ''))
  }

  // 7. 其他
  if (manifest.deprecated) {
    out.push(finding('error', 'deprecated', '已被标记废弃', String(manifest.deprecated), '换一个替代品'))
  }
  if (manifest.version && String(manifest.version).includes('-')) {
    out.push(finding('warn', 'prerelease', `预发布版本 ${manifest.version}`, '可能不稳定，市场对预发布处理更保守', ''))
  }
  const depCount = Object.keys(manifest.dependencies ?? {}).length
  if (depCount > 50) {
    out.push(finding('info', 'heavy-deps', `依赖较多（${depCount} 个）`, '安装慢、冲突面大', ''))
  }
  return out
}

/**
 * 预判「装上去会不会和现有 loader 撞名」。
 * @param {Array<{id?: string, name?: string}>} incoming 目标插件 patch 里要插的行
 * @param {Array<{id?: string, name?: string, source?: string}>} existing 现有 loader 行
 */
export function checkLoaders(incoming = [], existing = []) {
  const out = []
  const byName = new Map()
  for (const e of existing) {
    if (!e.name) continue
    if (!byName.has(e.name)) byName.set(e.name, [])
    byName.get(e.name).push(e)
  }
  for (const row of incoming) {
    if (!row.name) continue
    const clash = byName.get(row.name)
    if (clash?.length) {
      out.push(
        finding(
          'error',
          'loader-collision',
          `会和已装的 loader 撞名：${row.name}`,
          `已存在：${clash.map((c) => c.id ?? '(无 id)').join(', ')}（来自 ${clash.map((c) => c.source ?? '未知').join(' + ')}）`,
          '这就是 install-shadow：同一个模块会被挂两次，装完可能起不来',
        ),
      )
    }
  }
  return out
}

/** 按最严重的结论定级 */
export function grade(findings = []) {
  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const level = errors.length ? 'high' : warns.length ? 'medium' : 'low'
  const blocked = errors.some((f) => ['no-bundle', 'engine-mismatch', 'platform-mismatch', 'arch-mismatch'].includes(f.code))
  return {
    level,
    blocked,
    errors: errors.length,
    warnings: warns.length,
    label: { high: '高风险', medium: '需注意', low: '低风险' }[level],
  }
}

/**
 * 更新预检：把新旧两次检查放在一起，找出「新版本新增的问题」。
 * @param {object[]} before 当前版本跑出来的 findings
 * @param {object[]} after 新版本跑出来的 findings
 */
export function diffFindings(before = [], after = []) {
  const key = (f) => f.code + '|' + f.title
  const beforeSet = new Set(before.map(key))
  const beforeErrors = before.filter((f) => f.severity === 'error').length
  const afterErrors = after.filter((f) => f.severity === 'error').length

  return {
    newly: after.filter((f) => !beforeSet.has(key(f))),
    fixed: before.filter((f) => !after.some((a) => key(a) === key(f))),
    regression: afterErrors > beforeErrors,
  }
}

/** 一行摘要，给列表用 */
export function oneLine(manifest = {}) {
  const dsh = manifest.dsh ?? {}
  return [
    `v${manifest.version ?? '?'}`,
    dsh.bundle ? 'bundle' : '无 bundle',
    dsh.client ? 'client' : '无 client',
    `peer ${Object.keys(manifest.peerDependencies ?? {}).length}`,
  ].join(' · ')
}
