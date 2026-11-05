# dsh-preflight

> DSH 插件的「装前体检 / 装后盘点 / 更新前预判」三合一。

插件装多了，事故通常发生在三个时刻：**装之前不知道能不能装**、**装之后不知道装了些什么**、**点更新之前不知道会不会炸**。`dsh-preflight` 把这三个时刻串成一条：

```
装之前   preflight_check      能不能装？会和谁撞？
装之后   preflight_inventory  按能力分类的装机清单
更新前   preflight_updates    这次更新会引入什么问题？
```

## 装

```sh
dsh plugin --profile web add github:mouyu6508-hue/dsh-preflight
```

装好后会话标题栏会出现 **「🩺 体检」** 按钮，点开是面板（装机清单 / 更新风险，带搜索和分类筛选）。

## 三个工具

### `preflight_check(spec)` —— 装之前

```sh
dsh-preflight check github:owner/repo
```

会查：

| 检查 | 说明 |
|---|---|
| `no-bundle` | 没有 `dsh.bundle` —— 市场最常见的被拒原因，装不上 |
| `engine-mismatch` | `engines.dsh` 和当前版本不匹配 |
| `peer-mismatch` | peer 依赖和你已装的版本冲突（带 semver 判断） |
| `native-build` | 要 node-gyp / 编译工具链 |
| `install-script` | `postinstall` 会执行脚本 |
| `platform-mismatch` | 只支持别的系统 |
| **`loader-collision`** | **它的 patch 会和已装插件撞 loader 名 → 预判 install-shadow** |
| `prerelease` / `heavy-deps` | 预发布版、依赖过多 |

### `preflight_inventory()` —— 装之后

按能力分组列出已装插件：界面 / 工具 / 记忆 / 语音 / 计费 / 会话 / 市场 / 通知 / 趣味 …

每行带：版本、是否有 bundle、是否带前端、peer 依赖数、patch 行数、是否被停用。

### `preflight_updates()` —— 更新前

对每个已装插件：查 npm 最新版 → 取新版本 manifest → 跑一遍和装之前相同的检查 → 和当前版本对比，只报「新引入的问题」。

## 面板

标题栏「🩺 体检」打开浮层：

- **装机清单**：按能力分组，带搜索框和分类 chips
- **更新风险**：现查所有更新，按风险色标排序（红 / 黄 / 绿）

数据走 host 的三条只读路由：`/api/dsh-preflight/inventory|updates|check`。

## HTML 报告（不需要宿主）

```sh
dsh-preflight report --profile desktop
```

生成单文件 HTML 并自动打开，内容和面板一致。适合 DSH 起不来的时候用。

## CLI

```sh
dsh-preflight inventory --profile desktop
dsh-preflight check github:owner/repo
dsh-preflight updates --profile desktop
dsh-preflight report  --profile desktop [--no-updates] [--out 路径]
dsh-preflight profiles
```

加 `--json` 输出机器可读格式。**不启动 DSH 也能跑**。

## 已知限制

- **依赖 `webServer` 服务**：面板需要它，无 webServer 的 headless profile 里不会加载（CLI 不受影响）
- **只查 npm 上的更新**：GitHub 直装的包查不到版本，会标成「非 npm 发布」
- **配置里有 `!!js` 表达式时**只做字面比较，不执行表达式
- **读 profile 的 `package.json` 时容忍 BOM**（曾经因为 BOM 读到 0 个插件，已修）

## 开发

```sh
node --test          # 或者逐个跑 test/*.test.js
node bin/preflight.js inventory --profile desktop
```

| 文件 | 作用 |
|---|---|
| `lib/core.js` | 纯函数：semver、分类、manifest 检查、loader 撞名、风险定级 |
| `lib/profile.js` | 只读文件系统：插件清单、patch 行、停用状态 |
| `lib/sources.js` | 只碰网络：npm / GitHub（raw + API 兜底）/ 本地目录 |
| `lib/report.js` | 拼三份报告 |
| `lib/server.js` | 面板用的只读路由 |
| `lib/html.js` | 单文件 HTML 报告 |
| `lib/index.js` | 插件入口，注册三个工具 |
| `client.js` | 浏览器半边：标题栏按钮 + 面板 |
| `bin/preflight.js` | CLI |

MIT
