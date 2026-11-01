import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkLoaders,
  checkManifest,
  classify,
  compareVersions,
  diffFindings,
  grade,
  oneLine,
  satisfies,
} from '../lib/core.js'

test('compareVersions：基本大小与预发布', () => {
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1)
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1)
})

test('satisfies：^ ~ >= || x 都认', () => {
  assert.ok(satisfies('1.4.0', '^1.2.0'))
  assert.ok(!satisfies('2.0.0', '^1.2.0'))
  assert.ok(satisfies('1.2.9', '~1.2.0'))
  assert.ok(!satisfies('1.3.0', '~1.2.0'))
  assert.ok(satisfies('0.2.1', '>=0.2.0'))
  assert.ok(satisfies('1.5.0', '>=2.0.0 || >=1.4.0'))
  assert.ok(satisfies('9.9.9', '*'))
  assert.ok(satisfies('1.2.7', '1.2.x'))
  assert.ok(!satisfies('1.3.0', '1.2.x'))
  // 0.x 的 ^ 只允许同 minor
  assert.ok(satisfies('0.2.5', '^0.2.1'))
  assert.ok(!satisfies('0.3.0', '^0.2.1'))
})

test('checkManifest：没有 dsh.bundle 直接判死', () => {
  const f = checkManifest({ manifest: { name: 'x', dsh: { client: { platform: 'web' } } } })
  const hit = f.find((x) => x.code === 'no-bundle')
  assert.ok(hit)
  assert.equal(hit.severity, 'error')
  assert.equal(grade(f).blocked, true)
})

test('checkManifest：引擎版本不匹配', () => {
  const f = checkManifest({
    manifest: { name: 'x', version: '1.0.0', dsh: { bundle: { patch: './p.yml' } }, engines: { dsh: '>=0.3.0' } },
    hostVersion: '0.2.1',
  })
  assert.ok(f.some((x) => x.code === 'engine-mismatch'))
  assert.equal(grade(f).level, 'high')
})

test('checkManifest：peer 冲突', () => {
  const f = checkManifest({
    manifest: {
      name: 'x',
      version: '1.0.0',
      dsh: { bundle: { patch: './p.yml' } },
      peerDependencies: { '@deepseek-ai/dsh-tools': '^0.3.0' },
    },
    installed: { '@deepseek-ai/dsh-tools': '0.2.1' },
  })
  const hit = f.find((x) => x.code === 'peer-mismatch')
  assert.ok(hit)
  assert.equal(hit.severity, 'warn')
  assert.equal(grade(f).level, 'medium')
})

test('checkManifest：原生编译与安装脚本报警', () => {
  const f = checkManifest({
    manifest: {
      name: 'x',
      version: '1.0.0',
      dsh: { bundle: { patch: './p.yml' } },
      scripts: { postinstall: 'node-gyp rebuild' },
      dependencies: { 'node-pty': '^1.0.0' },
    },
  })
  assert.ok(f.some((x) => x.code === 'native-build'))
})

test('checkManifest：平台不支持', () => {
  const f = checkManifest({
    manifest: { name: 'x', version: '1.0.0', dsh: { bundle: { patch: './p.yml' } }, os: ['darwin'] },
    platform: 'win32',
  })
  assert.ok(f.some((x) => x.code === 'platform-mismatch'))
})

test('checkLoaders：抓到跨包同名 loader', () => {
  const f = checkLoaders(
    [{ id: 'archify-skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' }],
    [{ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', source: '@deepseek-ai/dsh-base' }],
  )
  assert.equal(f.length, 1)
  assert.equal(f[0].code, 'loader-collision')
  assert.equal(grade(f).blocked, false) // 撞名是高风险但不属于「装不上」
  assert.equal(grade(f).level, 'high')
})

test('checkLoaders：不撞就安静', () => {
  assert.deepEqual(checkLoaders([{ id: 'a', name: 'dsh-a' }], [{ id: 'b', name: 'dsh-b' }]), [])
})

test('diffFindings：新版本引入了新问题', () => {
  const before = [{ code: 'engine-ok', severity: 'info', title: 'ok' }]
  const after = [
    { code: 'engine-ok', severity: 'info', title: 'ok' },
    { code: 'peer-mismatch', severity: 'warn', title: 'peer 冲突' },
  ]
  const d = diffFindings(before, after)
  assert.equal(d.newly.length, 1)
  assert.equal(d.regression, false) // 没有 error 级回归
})

test('grade：没问题是低风险', () => {
  const g = grade([{ severity: 'info' }])
  assert.equal(g.level, 'low')
  assert.equal(g.label, '低风险')
})

test('classify：从名字/描述/关键词推断分类', () => {
  assert.deepEqual(classify({ name: 'dsh-better-sidebar', description: 'sidebar panel' }), ['ui'])
  assert.ok(classify({ name: 'dsh-fish-memory', description: 'long term memory', keywords: ['记忆'] }).includes('memory'))
  assert.ok(classify({ name: 'dsh-tts-bridge', description: 'voice tts' }).includes('voice'))
})

test('oneLine：列表摘要', () => {
  assert.equal(
    oneLine({ version: '1.2.3', dsh: { bundle: {}, client: {} }, peerDependencies: { a: '1' } }),
    'v1.2.3 · bundle · client · peer 1',
  )
})
