# 交接文档：Claude Code for VS Code 全量汉化工程

> 交接时间：2026-11-20 17:20（Asia/Shanghai）
> 接手对象：任意具备 Node 与 VSCode 使用能力的工程 Agent
> 文档性质：**这是唯一入口**。读完这一份就能接手；细节指向的文档都在仓库里。

---

## 0. 三十秒版

**在做什么**：把 `Anthropic.claude-code`（Claude Code for VS Code）这个**没有官方中文版**的扩展，
在本机做全量简体中文汉化，并做成可分发的开源 VS Code 扩展。

**做到哪了**：
- 汉化引擎 + 开源仓库 + VSIX 安装包**已完成并联调通过**（6+1 次提交，工作树干净）
- 聊天界面（`webview/index.js`）**全量汉化**：2,285 处替换，中文字符 21,041
- VS Code 宿主侧（`extension.js`）**目前刻意只做保守范围**：35 处（只翻 `vscode.window.*` 实参）
- 用户报告过的 5 处漏译 + 二轮补的 95 条，均已实测生效

**当前最需要你关注的一件事**：宿主侧只敢翻一小部分，是**为了规避一个尚未定位到根因的崩溃**——
全量翻宿主会让扩展激活失败、面板一直转圈。详见[第 8 节](#8-未解决问题最重要)。

**用户最新状态**：上一次崩溃后我已执行「还原英文原版」→ 用户可正常使用 →
随后按安全范围重新应用（`已汉化 ✓`）。**用户下次开 VSCode 后需要 `Developer: Reload Window`。**

---

## 1. 立即上手（三条命令）

```powershell
cd "C:\Users\19722\Desktop\vs临时\claude-code-zhcn"

node tools/cli.js status      # 看：装的什么版本 / 汉化在不在 / 命令标题翻了多少
node tools/cli.js apply       # 应用汉化（幂等，可反复跑）
node tools/cli.js restore     # 一键还原官方英文（逐字节一致）
```

验证三件套（改了任何规则/词条后都要跑）：

```powershell
node tools/build.js           # 由 data/i18n-*.json 重建词典（merged-dict.json / dict-norm.json）
node tools/selftest.js        # 11 项断言：应用→断言→还原→断言→再应用
node tools/extension-smoke.js # 7 项断言：用 vscode 桩件加载 extension.js，验命令注册与状态栏
```

**重要**：`selftest.js` 只验文件层面（幂等、逐字节还原、语法可解析），**验不到运行时激活**。
任何涉及 `extension.js`（宿主侧）的改动，都必须让用户**真机重载窗口**验证。

---

## 2. 两个目录是什么关系（别搞混）

| 路径 | 角色 | 说明 |
|---|---|---|
| `C:\Users\19722\Desktop\vs临时\claude-code-zhcn\` | **正式仓库（唯一权威）** | git 仓库，7 次提交，工作树干净。开源项目 + VS Code 扩展本体 |
| `C:\Users\19722\Desktop\vs临时\zhcn-full\` | 开发脚手架 | 早期一次性排查用的分析工具与中间产物（含 `baseline/` 英文快照、`reports/`、二分/探针脚本）。**不作为交付物**，但里面有几个仍有用的探针，见第 9 节 |

**结论：以后只动 `claude-code-zhcn`。** 需要旧探针时从 `zhcn-full/tools/` 里挑。

---

## 3. 环境事实（都是实测值）

| 项 | 值 |
|---|---|
| Claude Code 版本 | **2.1.329**（`anthropic.claude-code-2.1.329-win32-x64`） |
| 扩展目录 | `C:\Users\19722\.vscode\extensions\anthropic.claude-code-2.1.329-win32-x64` |
| 英文快照 | `<repo>\.cache\baseline\2.1.329\`（含 `manifest.json` 与逐文件 SHA-256） |
| VSCode 扩展宿主日志 | `%APPDATA%\Code\logs\<最新时间戳>\window1\exthost\exthost.log` |
| Claude 自己的输出通道日志 | 同上目录下 `\Anthropic.claude-code\Claude VSCode.log` ← **排错首选** |
| Node | 24.x（零第三方依赖，不需要 `npm install`） |
| 打包 | `npx @vscode/vsce@^3 package --no-dependencies` |

**排错口诀**：面板打不开/一直转圈 → 先看 `Claude VSCode.log` 里的
`Activation failed:` 那一行和它下面的栈，别猜。

---

## 4. 架构与数据流

```
英文原文（快照，按版本隔离）
        │
        ├── data/i18n-*.json ──build.js──► merged-dict.json（精确词条）
        │                                └► dict-norm.json（归一化词条）
        ▼
lib/planner.js   界面位置识别（纯函数）
        │  输入：token 流 + 词典 + 标签白名单 + scope
        │  输出：哪些字面量位置是界面文案、该换成什么
        ▼
lib/engine.js    改写 + 结构自证 + 落盘
        │  ① 只改字面量内容 ② 引号/反引号/${} 配平 ③ 重新词法分析要求 token 序列不变
        ▼
webview/index.js · extension.js · package.json · resources/walkthrough/*.md
```

**模块职责**

| 文件 | 行数 | 职责 |
|---|---|---|
| `lib/lexer.js` | 197 | 手写 JS 词法器：字符串、模板字符串（含 `${}` 嵌套模板与内嵌正则）、正则字面量、注释、Unicode 标识符。313 万 token 零重叠 |
| `lib/planner.js` | ~220 | 界面位置识别 + 全部排除规则。CLI 与扩展共用同一份 |
| `lib/namepos.js` | 74 | 名称位置检测：`Object.defineProperty` 导出名、`obj["x"]`、`in` 判断、名字列表数组 |
| `lib/norm.js` | 48 | 归一化匹配：`${...}` 换成哨兵再比对，压缩变量名整体改名后译文仍可复用 |
| `lib/packageplan.js` | 66 | `package.json` 可见字段 + 演练 Markdown 的结构化本地化 |
| `lib/engine.js` | ~340 | 快照 / 应用 / 还原 / 状态 / 反推英文 |
| `extension.js` | 179 | VS Code 扩展入口：6 条命令 + 状态栏 |
| `tools/` | — | `cli` `build` `selftest` `audit` `gap` `gap-filtered` `verify-*` |

---

## 5. 必须守住的四层不变量（改规则前先读）

违反任何一条都会把用户的扩展搞坏。**这是本工程的核心资产。**

### 5.1 只改字面量内容，不改代码结构
替换必须落在同一个 string/template token 内部；引号不冲突、反引号不引入、`${}` 花括号配平。
每次写盘前重新词法分析，要求 **token 总数、每个位置的 token 类型、非替换位取值全部相同**，
否则整体放弃、不落盘。实现在 `lib/engine.js#patchSource`。

### 5.2 四类位置一律不动
1. 比较运算两侧（`===` `!==` `==` `!=` `<=` `>=`）
2. `case "…":`
3. `.includes(` / `.startsWith(` / `.indexOf(` / `.match(` / `.test(` 的实参
4. 对象键、成员访问基址（`"x".foo`）、**名称位置**（见 5.3）

### 5.3 名称位置绝对不动（事故换来的）
`lib/namepos.js` 拦：`Object.defineProperty(obj,"Name",…)` 的导出名、`obj["x"]` 计算成员、
`"x" in obj`、`["A","B","C"]` 名字列表数组。
> 真实事故：早期把 `Object.defineProperty(nn,"Name",…)` 里的 `"Name"` 翻成 `"名称"`，
> 模块不再导出 `Name` → `TypeError: t.Name is not a constructor` → 扩展激活失败。

### 5.4 单词串（不含空白）默认不翻
除非满足：处在**界面属性值 / 界面 API 实参 / 枚举标签映射 / 变量型标签**，
或已在 `data/i18n-labels.json` 白名单，并且**没有在全文任何地方被当作比较值**。
> 用户报的 `Ungrouped` / `Open` / `Closed` / `Working` 就是栽在这条上——当时保护太严，全被跳过。

---

## 6. 界面位置识别：什么算"界面文案"

`lib/planner.js` 认可的锚点（任一即可）：

| 锚点 | 例子 |
|---|---|
| UI 属性值 | `children:"Cancel"`、`title:"Close preview (Esc)"`、`placeholder:"Filter commands…"` |
| 宿主 API 实参 | `showInformationMessage("…")`、`showQuickPick([...])` |
| 三元 / 逻辑分支 | `return ok ? "Saved" : "Failed"` |
| 标签字典值 | `{cwd:"Working folder", "Peer address":"Messaging address"}` |
| 枚举标签映射 | `{open:"Open", closed:"Closed"}`（键小写标识符、值首字母大写或含空格，≥2 组） |
| 变量型标签 | `var A="Status"` 且 `A` 之后作界面属性值 |
| 已定译文案 | 词典里人工复核过的句子，在所有"非比较/非键"位置一致替换 |

不认的（因此需要 `gap.js` 兜底）：`zod .describe()` 实参（属设置清单文档面，不算扩展界面）。

---

## 7. 三次事故复盘（同一套排查套路）

### 7.1 「重启后没生效」——其实是扩展被自动升级覆盖
VSCode 自动把 2.1.328 升到 2.1.329 并**删掉了旧版本目录**，补丁随目录消失。
→ 对策：工具链版本自适应（扫 `anthropic.claude-code-*` 取最高版本）、词库归一化匹配、`cli.js reset`。

### 7.2 「面板打不开、一直转圈」①——导出名被当文案
`TypeError: t.Name is not a constructor`。
→ 对策：新增 `lib/namepos.js`；新增对比式运行时冒烟（英文 vs 汉化后行为必须一致）。

### 7.3 「面板打不开、一直转圈」②——zod 的 `new Function`
`Activation failed: SyntaxError (<string(17)>) at new Function`（未定位到具体那条）。
→ 现状：宿主侧收窄到 `vscode.window.*` 实参。**这是当前唯一未闭合的问题**，见第 8 节。

**通用排查套路（照做）**
1. 打开 `%APPDATA%\Code\logs\<最新>\window1\exthost\Anthropic.claude-code\Claude VSCode.log`
2. 找 `Activation failed:` + 紧跟的栈；把栈里的 `extension.js:<行>:<列>` 记下来
3. 用工作区的 `zhcn-full/tools/repro_ctx.js <行> <列>` 打印该位置周围 260+160 字符的**英文原文 vs 补丁后文本**
4. 用 `zhcn-full/tools/bisect_break.js` 二分定位到具体那一处替换（30 秒级）
5. 定下规则后**必须**同步加一条回归断言到 `tools/verify-*.js`

---

## 8. 未解决问题（最重要）

**现象**：全量改写 `extension.js`（约 580 处）后，扩展激活失败：

```
Activation failed: SyntaxError (<string(17)>)
    at new Function (<anonymous>)
    at wG.compile (extension.js:67:229)
    at e._zod.parse (extension.js:120:332)
    at s.a (extension.js:120:17314)
    at e._zod.parse (extension.js:70:8668)
    at ZodArray.safeParse (extension.js:122:21768)
    at _Re (extension.js:169:7090)
    at m6.getPanelTabSessions (extension.js:198:19938)
    at new aoe (extension.js:1161:38974)
```

**已知事实**
1. zod 4 的 `Exec.compile()`（约 `extension.js:67:229`）拼接源码片段后 `new Function(...)`；
   报错在**编译期**，说明生成出来的源码本身语法非法。
2. 触发路径 `getPanelTabSessions` 解析持久化的会话标签状态（`ZodArray.safeParse`）。
3. 第一次全量改写（546 处）**没炸**；扩到 580 处才炸 → 嫌疑在新加的 34 处宿主替换
   （`data/i18n-gap-2.1.329*.json` 里的宿主条目）。
4. `webview/index.js` 从未复现 → 与 `new Function` 无关。

**当前规避**：`data/scope.json` → `{"host": {"allowKinds": ["api"]}}`。
宿主替换 580 → 35 处；`engine.status()` 的 `patched` 判定已改为 scope 感知。

**建议的排查顺序（性价比从高到低）**
1. **二分定位**：把 `scope.json` 的 host 改回 `{"allowKinds": null}`，
   把 `i18n-gap-2.1.329*.json` 的宿主条目按每批 8~10 条装入，**每批让用户重载窗口验一次**。
   预期 3~5 轮内锁定。这比读 zod 内部实现快得多。
2. **静态收窄**：候选是"同时出现在 schema 构造实参里"的字符串。
   工作区有 `zhcn-full/tools/probe_zod_enum.js`（callee 识别还粗，需改进后使用）。
3. **彻底解法**：宿主侧改白名单式——只翻 `vscode.window.*` 实参、`registerCommand` 标题、
   状态栏文本、`withProgress` 标题，并在 README 写出明确覆盖率数字。
   会损失一部分通知文案，但**可证安全**。
4. **补测试缺口**：若要自动化验证激活，需要更完整的 vscode 桩件
   （`workspace.fs`、`globalState`、`ExtensionContext`、`WebviewPanel`），把 `activate()` 真正跑到底。
   这是本工程**最大的测试缺口**，值得投入。

---

## 9. 本次会话实测数据快照（可复现）

| 指标 | 值 |
|---|---|
| Claude Code 版本 | 2.1.329 |
| 聊天界面替换 | **2,285** 处，中文字符 **21,041** |
| 宿主界面替换 | **35** 处（api-only 安全范围），中文字符 526 |
| 命令标题 | **31/31** 全中文（右键菜单来源） |
| 演练 Markdown | 4 篇全译 |
| 词典 | `merged-dict.json` **3,050** 条；`dict-norm.json` **449** 条 |
| `selftest.js` | **11/11** |
| `extension-smoke.js` | **7/7** |
| `verify-reported.js` | **10/10**（用户报告的 5 处） |
| `verify-round2.js` | **12/12**（二轮补译抽查） |
| `gap.js` | webview 542 → **214**，host 320 → **309**（余下均第三方） |
| `audit.js` | 两个目标均「无遗留 Claude 界面文案」 |

**覆盖率口径**（`node tools/audit.js`，2.1.329）：
```
【webview】候选 3715 · 已汉化 1893 (51.0%) · 登记跳过 98 · 范围外 1510
【host】   候选  966 · 已汉化  451 (46.7%) · 登记跳过 16 · 范围外  190
```
> 分母含大量内嵌 Monaco 编辑器与第三方组件字符串，"51%"不等于"界面还有一半英文"。
> 真正的门槛是每个目标末尾那行：**无遗留 Claude 界面文案**。

---

## 10. 命令速查

```powershell
cd "C:\Users\19722\Desktop\vs临时\claude-code-zhcn"

# 日常
node tools/cli.js status         # 版本 / 汉化状态 / 命令标题覆盖率
node tools/cli.js apply          # 应用（幂等）
node tools/cli.js restore        # 还原英文（逐字节一致）
node tools/cli.js reset          # 丢弃当前版本的英文快照（升级后先用）

# 改词条后
node tools/build.js              # 重建词典（必须提交 merged-dict.json / dict-norm.json）
node tools/selftest.js
node tools/extension-smoke.js

# 适配新版本
node tools/cli.js reset
node tools/gap.js                # 按界面锚点列出未译条目（不靠关键词，最准）
node tools/gap.js --write        # 生成空译文模板 data/i18n-gap-<版本>.json
node tools/audit.js              # 覆盖率统计 + 含领域词的兜底清单
#   → 补词条 → build → selftest → 在 data/versions.json 与 docs/版本适配矩阵.md 登记

# 打包
npx --yes "@vscode/vsce@^3" package --no-dependencies --out claude-code-zhcn.vsix
```

---

## 11. 词库与登记表（改之前先看清用途）

| 文件 | 作用 |
|---|---|
| `data/i18n-webview*.json` / `i18n-host*.json` | 分批次译文词条（英文 → 中文） |
| `data/i18n-tm.json` | 从旧开源汉化包（zstings/claude-code-zh-cn, MIT）导入的翻译记忆，已过滤掉"把压缩变量名当键"的垃圾条目 |
| `data/i18n-labels.json` | **单词型标签白名单**：既是词条，也是"允许单词形态被替换"的许可清单 |
| `data/i18n-package.json` | `package.json` 可见字段译文（命令标题/设置描述/视图/演练） |
| `data/i18n-skip.json` | **逐条**登记"不翻译"及原因 |
| `data/i18n-outofscope.json` | **逐类**登记"范围外"及原因（内嵌 Monaco、KaTeX、ajv/zod 校验消息、SVG/CSS、模型日期、协议文本…） |
| `data/i18n-reviewed.json` | 已人工复核的「插值省略」例外（按归一化键匹配） |
| `data/scope.json` | **改写范围控制**（当前 host = api-only） |
| `data/versions.json` | 版本适配矩阵（`verified` / `untested` / `broken`） |
| `data/merged-dict.json`、`data/dict-norm.json` | 构建产物，运行时要用的就是这两个 |

**译文规范**：保留 `${...}` 原样；保留产品名（Claude / MCP / Bash / PowerShell / WebFetch）与按键名；
中文用全角标点；不逐字硬译，长句优先保证看得懂不歧义。

---

## 12. 有意不翻的部分（不是漏）

- 内嵌 Monaco/VS Code 编辑器组件（差异预览里的编辑器菜单、命令、设置项说明）
- KaTeX 公式组件
- 设置/插件清单的 JSON-Schema 说明（zod `describe()`，约 891 条）
- 发送给模型的提示词与工具协议（`<ide_selection>`、`<browser_instruction>` 等，翻了会改变模型行为）
- URL、路径、模型 ID、内部键、日志
- 专有名词与按键名

逐条/逐类原因见第 11 节的 `i18n-skip.json` 与 `i18n-outofscope.json`。**新增排除必须写原因。**

---

## 13. 发布流程

```powershell
git add -A
git commit -m "…"
npx --yes "@vscode/vsce@^3" package --no-dependencies --out claude-code-zhcn.vsix
```

仓库已有 `.github/workflows/release.yml`：打 `v*` tag 时自动重建词典 → 健全性检查 → 打包 VSIX → 附加到 Release。
**CI 里跑不了 `selftest.js`**（需要本机真实安装的 Claude Code），发布前必须本地跑通并附输出。

发 GitHub 前记得改 `package.json` 里的 `publisher`（现在是占位 `xiaohan-workspace`）与 `repository`。

---

## 14. 交接清单

### 待办（按优先级）
1. **定位并修掉 zod `new Function` 那条**，然后把宿主侧范围扩回去（第 8 节）。
2. **补运行时激活测试**：把 vscode 桩件做完整，让 `activate()` 能跑到底。
3. `gap.js` 的剩余 523 条缺口里，继续确认是否有 Claude 自有文案（工具已能按结构精确列出）。
4. 若 Claude Code 再升级：按第 10 节「适配新版本」流程走一遍，登记新版本。

### 不能做的事
- ❌ 不要为了覆盖率去翻单词串而不加白名单（会撞导出名/枚举值）
- ❌ 不要改宿主侧后只跑 `selftest.js` 就宣称通过（它验不到运行时激活）
- ❌ 不要把 `baseline/`、`.cache/` 里的英文原文提交进仓库（合规 + 体积）
- ❌ 不要在词条里留旧版压缩变量名（`k71=`、`Rz($,J=` 这类，正是旧包失效的原因）
- ❌ 不要静默扩大 `data/scope.json` 的 host 范围

### 用户侧的当前状态
- 本机扩展：**已按安全范围应用汉化**（webview 全量 + 宿主 api-only）
- 用户需要做：`Ctrl+Shift+P` → `Developer: Reload Window`
- 若再出现打不开：先 `node tools/cli.js restore`，用户立刻可用；再按第 8 节排查

---

## 15. 关键文件索引

```
claude-code-zhcn/
├─ README.md                 项目主页（为什么要做 / 安装 / 使用 / 适配流程 / 工作原理）
├─ CHANGELOG.md              含三次事故的「修复」条目
├─ CONTRIBUTING.md           译文规范 + 提交前自检清单
├─ LICENSE                   MIT + 第三方内容声明（不携带 Anthropic 代码）
├─ docs/
│  ├─ 版本适配矩阵.md        每版实测数据 + 英文基线 SHA-256 + 覆盖口径
│  └─ 技术说明.md            ⭐ 第 9 节 = 本交接第 8 节的详细版
├─ lib/                      引擎（见第 4 节表）
├─ tools/                    命令（见第 10 节）
├─ data/                     词库与登记表（见第 11 节）
└─ claude-code-zhcn.vsix     可安装包（当前 v2.0.1，38 文件 / 295 KB）
```

旧脚手架 `zhcn-full/` 里仍有价值的探针：
`tools/repro_ctx.js`（按行列号打印补丁前后对照）、`tools/bisect_break.js`（二分定位坏掉的那一处替换）、
`tools/probe_zod_enum.js`（列 schema 构造里的已译字面量）、`tools/runtime_smoke.js`（对比式运行时冒烟）。
