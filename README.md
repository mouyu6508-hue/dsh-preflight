# dsh-preflight

> DSH 插件的「装前体检 / 装后盘点 / 更新前预判」三合一。

插件装多了，事故通常发生在三个时刻：**装之前不知道能不能装**、**装之后不知道装了些什么**、**点更新之前不知道会不会炸**。`dsh-preflight` 把这三个时刻串成一条：

```
装之前   preflight_check      能不能装？会和谁撞？
装之后   preflight_inventory  按能力分类的装机清单
更新前   preflight_updates    这次更新会引入什么问题？
```

## 三个工具

### `preflight_check(spec)` —— 装之前

```sh
dsh-preflight check github:mouyu6508-hue/dsh-fusion
```

会查：

| 检查 | 说明 |
|---|---|
| `no-bundle` | 没有 `dsh.bundle` —— 这是市场最常见的被拒原因，装不上 |
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

对每个已装插件：查 npm 最新版 → 取新版本 manifest → **跑一遍和装之前完全相同的检查** → 和当前版本对比，只报「新引入的问题」。

## 面板

装好之后，会话标题栏右侧会多一个 **「🩺 体检」** 按钮，点开是装机面板：

- **装机清单**：按能力分组的卡片列表，带搜索框；每行显示版本、是否带 UI、是否停用
- **更新风险**：点一下现查所有插件的更新，按风险色标排序（红=高风险 / 黄=需注意 / 绿=低风险）

数据走 host 注册的三条只读路由（`/api/dsh-preflight/inventory|updates|check`），面板本身不直接读文件。

## CLI

```sh
dsh-preflight inventory --profile desktop
dsh-preflight check github:owner/repo
dsh-preflight updates --profile desktop
dsh-preflight profiles
```

加 `--json` 给脚本用。**不启动 DSH 也能跑**（DSH 起不来时最有用）。

## 它和 dsh-fusion 的关系

| | 什么时候 | 干什么 |
|---|---|---|
| `dsh-fusion` | 出事之后 | 找出已经存在的冲突，合成补丁修掉 |
| `dsh-preflight` | 出事之前 | 在装/更新之前拦住 |

两个可以一起装。

## 环境

- Node.js 18+
- 能加载 bundle 插件的 DSH

## 开发

```sh
node --test          # 或者直接跑 test 下的文件
node bin/preflight.js inventory --profile desktop
```

| 文件 | 作用 |
|---|---|
| `lib/core.js` | 纯函数：semver、分类、manifest 检查、loader 撞名、风险定级 |
| `lib/profile.js` | 只读文件系统：读 profile 的插件清单和 loader 行 |
| `lib/sources.js` | 只碰网络：npm / github / 本地目录 → manifest |
| `lib/report.js` | 拼三份报告 |
| `lib/index.js` | 插件入口，注册三个工具 |
| `bin/preflight.js` | CLI |

MIT
