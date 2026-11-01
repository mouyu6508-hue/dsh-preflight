/**
 * dsh-preflight 浏览器端：标题栏一个「体检」按钮，点开是装机面板。
 *
 * 数据来自 host 注册的只读接口：
 *   GET /api/dsh-preflight/inventory   分类清单
 *   GET /api/dsh-preflight/updates     更新与风险
 */
window.__ModuleLoader__.load({
  id: 'dsh-preflight',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    // ── 极简状态容器：按钮和面板共用 ──────────────────────────────
    const store = {
      open: false,
      tab: 'inventory', // 'inventory' | 'updates'
      inventory: null,
      updates: null,
      loading: false,
      error: null,
      query: '',
      listeners: new Set(),
    }
    const emit = () => store.listeners.forEach((fn) => { try { fn() } catch { /* noop */ } })
    const subscribe = (fn) => { store.listeners.add(fn); return () => store.listeners.delete(fn) }

    async function loadInventory() {
      store.loading = true
      store.error = null
      emit()
      try {
        const res = await fetch('/api/dsh-preflight/inventory')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
        store.inventory = data
      } catch (e) {
        store.error = String((e && e.message) || e)
      } finally {
        store.loading = false
        emit()
      }
    }

    async function loadUpdates() {
      store.loading = true
      store.error = null
      emit()
      try {
        const res = await fetch('/api/dsh-preflight/updates')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
        store.updates = data
      } catch (e) {
        store.error = String((e && e.message) || e)
      } finally {
        store.loading = false
        emit()
      }
    }

    // ── 配色 ────────────────────────────────────────────────────
    const C = {
      bg: 'var(--dsh-surface, #0d1117)',
      fg: 'var(--dsh-text, #e6edf3)',
      muted: 'var(--dsh-text-secondary, #8b949e)',
      line: 'var(--dsh-border, #30363d)',
      accent: 'var(--dsh-accent, #58a6ff)',
      high: '#f85149',
      medium: '#d29922',
      low: '#3fb950',
    }

    const styles = {
      overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      },
      panel: {
        width: 'min(860px, 92vw)', maxHeight: '82vh', overflow: 'hidden',
        background: C.bg, color: C.fg, border: '1px solid ' + C.line,
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,.5)', fontSize: 13,
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '1px solid ' + C.line,
      },
      body: { overflow: 'auto', padding: '10px 16px 18px' },
      tab: (on) => ({
        padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
        border: '1px solid ' + (on ? C.accent : C.line),
        color: on ? C.accent : C.muted, background: 'transparent',
      }),
      search: {
        width: '100%', margin: '10px 0 4px', padding: '7px 10px', borderRadius: 8,
        border: '1px solid ' + C.line, background: 'transparent', color: C.fg, outline: 'none',
      },
      cat: { marginTop: 14, fontSize: 11, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' },
      row: {
        display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0',
        borderBottom: '1px dashed ' + C.line,
      },
      name: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      ver: { color: C.muted, fontVariantNumeric: 'tabular-nums' },
      pill: (color) => ({
        fontSize: 10, padding: '1px 6px', borderRadius: 999,
        border: '1px solid ' + color, color,
      }),
      badge: (level) => ({
        alignSelf: 'flex-start', marginTop: 10, padding: '8px 12px', borderRadius: 8,
        border: '1px solid ' + (level === 'high' ? C.high : level === 'medium' ? C.medium : C.low),
        color: level === 'high' ? C.high : level === 'medium' ? C.medium : C.low,
      }),
      btn: {
        padding: '4px 10px', borderRadius: 8, border: '1px solid ' + C.line,
        background: 'transparent', color: C.fg, cursor: 'pointer', fontSize: 12,
      },
    }

    // ── 面板 ────────────────────────────────────────────────────
    function Panel() {
      const [, force] = React.useReducer((x) => x + 1, 0)
      React.useEffect(() => subscribe(force), [])
      React.useEffect(() => {
        if (!store.inventory && !store.loading) loadInventory()
      }, [])

      if (!store.open) return null

      const close = () => { store.open = false; emit() }
      const inv = store.inventory
      const up = store.updates

      const filtered = (items) => {
        const q = store.query.trim().toLowerCase()
        if (!q) return items
        return items.filter((it) => (it.bundle + ' ' + (it.categories || []).join(' ')).toLowerCase().includes(q))
      }

      const invView = inv
        ? h('div', null,
            h('div', { style: { color: C.muted, marginBottom: 6 } },
              `已装 ${inv.total} 个插件 · ${inv.loaderCount} 条 loader · ${inv.dir}`),
            inv.groups.map((g) => {
              const items = filtered(g.items)
              if (!items.length) return null
              return h('div', { key: g.category },
                h('div', { style: styles.cat }, `${g.category} · ${items.length}`),
                items.map((it) => h('div', { key: it.bundle, style: styles.row },
                  h('span', { style: styles.name, title: it.summary }, it.bundle),
                  it.hasClient ? h('span', { style: styles.pill(C.accent) }, 'UI') : null,
                  it.disabled ? h('span', { style: styles.pill(C.muted) }, '停用') : null,
                  h('span', { style: styles.ver }, 'v' + it.version),
                )),
              )
            }),
            inv.missing && inv.missing.length
              ? h('div', { style: { ...styles.cat, textTransform: 'none' } }, `宿主自带：${inv.missing.join(' · ')}`)
              : null,
          )
        : null

      const upView = up
        ? h('div', null,
            h('div', { style: { color: C.muted, marginBottom: 8 } },
              `${up.checked} 个插件：${up.outdated.length} 个有更新，${up.current} 个已是最新`),
            up.outdated.length === 0 ? h('div', { style: styles.cat }, '没有需要更新的') : null,
            up.outdated.map((u) => h('div', { key: u.bundle, style: { padding: '8px 0', borderBottom: '1px dashed ' + C.line } },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
                h('span', { style: styles.name }, u.bundle),
                h('span', { style: styles.ver }, `${u.current} → ${u.latest}`),
                h('span', { style: styles.pill(u.grade.level === 'high' ? C.high : u.grade.level === 'medium' ? C.medium : C.low) }, u.grade.label),
              ),
              (u.newly || []).slice(0, 4).map((f, i) => h('div', { key: i, style: { color: C.muted, marginTop: 4 } }, '+ ' + f.title)),
            )),
            up.unknown && up.unknown.length
              ? h('div', { style: { ...styles.cat, textTransform: 'none' } }, `非 npm 发布：${up.unknown.join(' · ')}`)
              : null,
          )
        : null

      return h('div', { style: styles.overlay, onClick: close },
        h('div', { style: styles.panel, onClick: (e) => e.stopPropagation() },
          h('div', { style: styles.head },
            h('b', null, '插件体检'),
            h('span', { style: { flex: 1 } }),
            h('button', { style: styles.tab(store.tab === 'inventory'), onClick: () => { store.tab = 'inventory'; emit(); if (!store.inventory) loadInventory() } }, '装机清单'),
            h('button', { style: styles.tab(store.tab === 'updates'), onClick: () => { store.tab = 'updates'; emit(); loadUpdates() } }, '更新风险'),
            h('button', { style: styles.btn, onClick: store.tab === 'updates' ? loadUpdates : loadInventory }, store.loading ? '…' : '刷新'),
            h('button', { style: styles.btn, onClick: close }, '关闭'),
          ),
          h('div', { style: styles.body },
            store.error ? h('div', { style: styles.badge('high') }, store.error) : null,
            store.tab === 'inventory'
              ? h('input', {
                  style: styles.search, placeholder: '搜索插件名 / 分类…',
                  value: store.query,
                  onChange: (e) => { store.query = e.target.value; emit() },
                })
              : null,
            store.loading && !inv && !up ? h('div', { style: styles.cat }, '读取中…') : null,
            store.tab === 'inventory' ? invView : upView,
          ),
        ),
      )
    }

    // ── 标题栏按钮 ──────────────────────────────────────────────
    function Trigger() {
      const [, force] = React.useReducer((x) => x + 1, 0)
      React.useEffect(() => subscribe(force), [])
      return h('button', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
          borderRadius: 999, border: '1px solid ' + C.line, background: 'transparent',
          color: C.muted, cursor: 'pointer', fontSize: 11,
        },
        title: '插件体检：装了什么、能不能更新',
        onClick: () => { store.open = true; emit(); if (!store.inventory) loadInventory() },
      }, '🩺 体检'
        + (store.inventory ? ' ' + store.inventory.total : ''))
    }

    return {
      apply(ctx) {
        const slots = ctx.get('slots')
        if (!slots) return
        slots.inject('conversation.session.header.utilities', () =>
          slots.register({ name: 'conversation.session.header.utilities', id: 'dsh-preflight-trigger', order: -5 }, Trigger),
        )
        slots.inject('shell.overlay', () =>
          slots.register({ name: 'shell.overlay', id: 'dsh-preflight-panel', order: 20 }, Panel),
        )
      },
    }
  },
})
