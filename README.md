# Claude Code 简体中文汉化（claude-code-zhcn）

> 为 **Claude Code for VS Code** 提供**全量简体中文汉化**的 VS Code 扩展。
> 自动识别已安装版本 · 按版本隔离的英文快照 · 一键应用与还原 · 每次改完都做结构自证。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.328%20%7C%202.1.329-brightgreen)

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [功能特性](#功能特性)
- [安装](#安装)
- [使用](#使用)
- [版本适配矩阵](#版本适配矩阵)
- [适配新版 Claude Code](#适配新版-claude-code)
- [工作原理](#工作原理)
- [哪些内容不翻译](#哪些内容不翻译)
- [常见问题](#常见问题)
- [目录结构](#目录结构)
- [贡献](#贡献)
- [许可与免责](#许可与免责)

---

## 它解决什么问题

市面上已有的 Claude Code 汉化包有一个共同的结构性缺陷：**把旧版本压缩后的变量名当成了词条的键**。

例如旧包里存在这样的规则：

```
k71="Set model to "        →  KR5="当前模型："   ← 把压缩变量名一起写进了匹配串
Rz($,J="From")             →  Rz($,J="来自")
```

Claude Code 发布新版本时，打包器会整体重命名变量（`Cp→Ep`、`Ke→Je`、`wa→Sa`、`sv→cv`…），
这类规则**一夜之间全部失配**，于是你看到的就是"一块中文、一块英文"。

本项目的做法完全不同：

1. **词条只记"文案本身"**，插值一律用占位符归一化（`${Je} may already…` 与 `${Ke} may already…`
   落到同一个键），压缩变量名怎么改都不影响。
2. **不做全局字符串替换**，而是用自建 JS 词法器做 **token 级精确改写**，只动"被证明是界面文案"的字面量。
3. **扩展升级不会偷偷失效**：检测到新版本会在状态栏提示，一条命令重打；英文原文快照按版本隔离，
   随时可逐字节还原。

## 功能特性

| 能力 | 说明 |
|---|---|
| 自动识别版本 | 扫描 `anthropic.claude-code-*` 取最高版本，不写死目录名 |
| 全量覆盖 | 聊天界面、权限弹窗、插件与市场、会话与状态、用量积分、错误提示、按钮与占位符；VS Code 宿主通知/选择框/输入框；命令面板与**右键菜单**全部 31 条标题；设置项描述；4 篇入门演练 |
| 结构自证 | 改完重新词法分析，要求 token 数量、类型、非替换位取值**完全一致**，否则整体放弃、不落盘 |
| 四类安全防护 | 比较值 / 对象键 / 成员访问 / **名称位置**（`Object.defineProperty` 的导出名等）一律不动 |
| 单词标签白名单 | `未分组`、`状态`、`标签页`、`打开`、`已关闭` 等单词型标签，用显式白名单放行，避免误伤枚举值 |
| 幂等 + 可还原 | 始终从英文快照出发重打；还原与官方英文**逐字节一致** |
| 自检 | `tools/selftest.js` 在真实安装上跑 应用→断言→还原→断言→再应用，11 项断言 |

## 安装

### 方式一：装 VSIX（推荐）

```bash
# 在仓库根目录打包
npx @vscode/vsce package --no-dependencies
code --install-extension claude-code-zhcn-2.0.0.vsix
```

也可以从 [Releases](../../releases) 直接下载 `*.vsix` 后，在 VS Code 里
「扩展 → ⋯ → 从 VSIX 安装」。

### 方式二：命令行直接用（不装扩展）

```bash
git clone <this-repo> && cd claude-code-zhcn
node tools/build.js        # 由 data/i18n-*.json 生成运行时词典（仓库已内置生成结果，可跳过）
node tools/cli.js apply    # 应用汉化
```

之后在 VS Code 执行 `Developer: Reload Window`。

### 方式三：源码调试

用 VS Code 打开本仓库，按 `F5` 启动扩展开发宿主。

## 使用

安装后命令面板（`Ctrl+Shift+P`）输入 `Claude Code 汉化`：

| 命令 | 作用 |
|---|---|
| `Claude Code 汉化: 应用汉化` | 按当前安装版本生成并写入汉化 |
| `Claude Code 汉化: 还原英文原版` | 从快照逐字节还原 |
| `Claude Code 汉化: 检查状态` | 版本 / 汉化状态 / 命令标题覆盖率 / 词典条数 |
| `Claude Code 汉化: 重置英文快照` | 扩展升级导致快照失效时使用 |
| `Claude Code 汉化: 打开汉化报告` | 查看版本适配矩阵 |

状态栏右侧会显示 `$(globe) Claude 2.1.329 ✓`：

- `✓` 已汉化；`…` 未汉化（鼠标悬停看详情）
- 版本未登记测试时，状态栏变黄并在应用前弹确认框

**应用/还原后需要 `Developer: Reload Window` 才会生效**（扩展宿主会缓存 `package.json` 与 webview 资源）。

## 版本适配矩阵

| Claude Code | 状态 | 说明 |
|---|---|---|
| 2.1.329 | ✅ verified | 补齐增量文案；修复「导出名被当文案」导致激活失败；新增单词标签白名单 |
| 2.1.328 | ✅ verified | 首次全量适配 |
| 其它 | ⚠️ untested | 按通用规则尽力适配，未覆盖的新文案保持英文，并在 `tools/audit.js` 中列出 |

完整记录见 [`docs/版本适配矩阵.md`](docs/版本适配矩阵.md)（含两版实测替换数与校验结论）。

## 适配新版 Claude Code

Claude Code 升级后，本扩展不会自动改写文件（避免在你不知情时动手）。标准流程：

```bash
# 1. 看差距：列出新版本里仍未汉化的 Claude 界面文案
node tools/cli.js reset          # 丢弃旧快照
node tools/audit.js              # 输出「仍属 Claude 界面但未翻译」清单

# 2. 把清单里的条目补进 data/i18n-webview.json（或新建 data/i18n-<版本>.json）
#    注意：只写"文案本身"，插值保持 ${...} 原样

# 3. 重建词典
node tools/build.js

# 4. 回归：应用→断言→还原→断言→再应用
node tools/selftest.js

# 5. 登记版本
#    在 data/versions.json 里加一行，并把结论写进 docs/版本适配矩阵.md
```

## 工作原理

```
        ┌────────────────────────────┐
        │  英文快照（按版本隔离）      │  ← 首次应用时从你本机安装目录复制
        └─────────────┬──────────────┘
                      │
   data/i18n-*.json   │   data/dict-norm.json
        └──────┬───────┴────────┬─────────────┘
               ▼                ▼
        ┌──────────────────────────────┐
        │ lib/planner.js  界面位置识别   │  自建词法器 + 锚点判定 + 四类防护
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │ lib/engine.js   改写 + 结构自证 │  只改字面量内容；token 序列必须不变
        └──────────────┬───────────────┘
                       ▼
        webview/index.js · extension.js · package.json · walkthrough/*.md
```

**词法层**（`lib/lexer.js`）：正确处理字符串、模板字符串（含 `${}` 嵌套模板与内嵌正则）、
正则字面量、注释、Unicode 标识符。2.1.329 的两个 bundle 共 **313.7 万 token**，
0 处重叠、0 个字面量解析错误。

**规划层**（`lib/planner.js`）：一个字面量算不算界面文案，取决于它是否落在这些锚点上——
UI 属性值（`children:`/`title:`/`label:`/`placeholder:`…）、宿主 API 实参（`showInformationMessage(`…）、
三元或逻辑分支（`return c ? "A" : "B"`）、标签字典值、枚举标签映射（`{open:"Open"}`）、
变量型标签（`var A="Status"` 且 `A` 用作界面属性值）、以及已人工复核过的句子。

**排除层**（`lib/namepos.js` + planner 内联规则）：比较运算、`case` 标签、`includes` 参数、
对象键、成员访问基址、`obj["x"]`、`"x" in obj`、`Object.defineProperty` 的导出名、名字列表数组、
不含空白的单词串（除白名单与界面位置外）——统统不动。

> 这一点是踩坑换来的：早期版本把 `Object.defineProperty(nn,"Name",…)` 里的 `"Name"`
> 当成文案翻成了 `"名称"`，模块不再导出 `Name`，`new t.Name(...)` 抛错，扩展激活失败、
> 面板一直转圈。现在这类位置有专门的检测器，且 `selftest.js` 会做运行时冒烟对比。

**自证层**（`lib/engine.js`）：替换前逐处校验（落在同一字面量内、引号不冲突、`${}` 配平），
替换后重新词法分析并要求 token 序列与英文原文**逐一相同**（只允许计划内位置取值变化），
最后 `new Function(src)` 做语法校验。任一条不满足 → 整体放弃，不写盘。

## 哪些内容不翻译

不是漏，是**明确不翻并登记了原因**，见 `data/i18n-skip.json`（逐条）与 `data/i18n-outofscope.json`（逐类）：

| 类别 | 原因 |
|---|---|
| 内嵌 Monaco / VS Code 编辑器组件 | 差异预览里嵌入的编辑器菜单、命令、设置项说明，属第三方组件 |
| KaTeX 公式组件 | 词法与 CLI 文案，不进对话界面 |
| 设置/插件清单的 JSON-Schema 说明（zod `describe()`） | `.claude/settings.json` 的悬停文档，属开发文档面 |
| 发送给模型的提示词 / 工具协议 | `<ide_selection>`、`<browser_instruction>` 等，翻译会改变模型行为 |
| URL、路径、模型 ID、内部键、日志 | 非展示文案 |
| 专有名词与按键名 | Claude / MCP / Bash / PowerShell / WebFetch / Ctrl / Alt / Tab / Esc 等 |
| 单词型风险词 | 未在 `data/i18n-labels.json` 白名单内的单词串一律不动（它们常同时是导出名/枚举值） |

## 常见问题

**Q：Claude Code 升级后界面又变英文了？**
正常。VS Code 会删除旧版本目录并解出新版本，汉化随旧目录一起消失。跑一次
`Claude Code 汉化: 重置英文快照` → `应用汉化` 即可，或命令行 `node tools/cli.js reset && node tools/cli.js apply`。
想彻底避免可对该扩展右键 **Ignore Updates**。

**Q：面板打不开 / 一直转圈？**
说明扩展宿主激活失败。查看 `%APPDATA%\Code\logs\<时间戳>\window1\exthost\exthost.log`
里 `Activating extension Anthropic.claude-code failed` 之后的第一条错误。
先用「还原英文原版」恢复可用，再把错误发到 Issues。本项目每次发布都会跑
`selftest.js`（含运行时冒烟对比），此类问题在发布前会被拦住。

**Q：能还原成官方英文吗？**
能，且是**逐字节一致**（`selftest.js` 有该断言）。快照在扩展的 globalStorage 里，按版本隔离。

**Q：为什么不做成「运行时注入」而不是改文件？**
运行时注入无法覆盖 VS Code 宿主侧的通知/选择框/命令标题/设置面板，而这些正是"一块英文一块中文"的重灾区。

## 目录结构

```
claude-code-zhcn/
├─ extension.js             扩展入口（命令 / 状态栏）
├─ package.json             扩展清单（命令、设置、元数据）
├─ lib/
│  ├─ lexer.js              JS 词法器
│  ├─ planner.js            界面位置识别（纯函数，CLI 与扩展共用）
│  ├─ namepos.js            名称位置检测（导出名 / 计算成员 / 名字列表）
│  ├─ norm.js               归一化匹配（抗压缩变量名变动）
│  ├─ placeholders.js       ${...} 数据完整性分析
│  ├─ packageplan.js        package.json / 演练 Markdown 结构化本地化
│  └─ engine.js             快照 / 应用 / 还原 / 状态
├─ data/
│  ├─ i18n-*.json           译文词库（按批次）
│  ├─ i18n-labels.json      单词型标签白名单（同时是词条）
│  ├─ i18n-skip.json        逐条登记"不翻译"及原因
│  ├─ i18n-outofscope.json  逐类登记"范围外"及原因
│  ├─ i18n-reviewed.json    已复核的插值省略例外
│  ├─ i18n-package.json     package.json 可见字段译文
│  ├─ versions.json         版本适配矩阵
│  ├─ merged-dict.json      构建产物：精确词条
│  └─ dict-norm.json        构建产物：归一化词条
├─ tools/
│  ├─ build.js              合并词库
│  ├─ cli.js                status / apply / restore / reset / selftest
│  ├─ audit.js              覆盖率审计（适配新版本的主力工具）
│  ├─ selftest.js           真实安装上的回归自检（11 项断言）
│  └─ import-tm.js          从旧开源汉化包导入翻译记忆（已执行，产物为 i18n-tm.json）
└─ docs/
   ├─ 版本适配矩阵.md
   └─ 技术说明.md
```

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。最缺人的地方是**新版本增量文案**的翻译与复核——
`node tools/audit.js` 会精确告诉你缺哪些。

## 许可与免责

- 本项目以 **MIT** 发布。
- **不包含、不分发** Anthropic 的 Claude Code 代码或二进制；英文基线只在你本机生成、只存于你本机。
- "Claude"、"Claude Code" 是 Anthropic PBC 的商标。本项目为社区非官方汉化，与 Anthropic 无隶属关系。
- 修改的是你本机已安装的扩展文件，风险自负；随时可用「还原英文原版」恢复。
