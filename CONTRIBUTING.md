# 贡献指南

欢迎 PR。最缺人的地方是**新版本增量文案的翻译与复核**，其次是"误判/漏判"的规则修正。

## 环境

```bash
git clone <repo> && cd claude-code-zhcn
node --version      # 需要 Node 18+（用到 fs.rmSync / crypto、无第三方依赖）
```

本项目**零运行时依赖**：不需要 `npm install` 就能用 `tools/cli.js`。只有打包 VSIX 时才需要
`npx @vscode/vsce`。

## 三种典型贡献

### A. 补新版本的译文

```bash
node tools/cli.js reset     # 丢弃旧英文快照
node tools/audit.js         # 会输出「仍属 Claude 界面但未翻译」的清单
```

把清单里的条目补进 `data/i18n-webview.json`（对话界面）或 `data/i18n-host.json`（VS Code 宿主）：

```jsonc
{
  // 只写"文案本身"，插值一律原样保留
  "Failed to set model: ${d instanceof Error?d.message:String(d)}": "设置模型失败：${d instanceof Error?d.message:String(d)}",
  "Buy usage credits on claude.ai": "在 claude.ai 购买用量积分"
}
```

然后：

```bash
node tools/build.js        # 重建 merged-dict.json / dict-norm.json（必须提交这两个产物）
node tools/selftest.js     # 11 项断言必须全 PASS
node tools/audit.js        # 确认「遗留 Claude 界面文案 = 0」
```

**译文规范**

| 规则 | 说明 |
|---|---|
| 保留 `${...}` 原样 | 里面的表达式是活的代码，改动会破坏逻辑 |
| 保留产品名 | Claude / Claude Code / MCP / Bash / PowerShell / WebFetch |
| 保留按键名 | Ctrl / Alt / Shift / Tab / Esc / Enter |
| 中文用全角标点 | `：，。（）「」` |
| 语气 | 面向开发者的简洁祈使句，不口语化 |
| 不要逐字硬译 | 说明性长句优先保证"看得懂、不歧义" |

### B. 修规则（漏判/误判）

漏判：某处界面文案没被识别 → 在 `lib/planner.js` 增加锚点。
误判：某处不该改的被改了 → 在 `lib/namepos.js` 或 planner 的排除层加规则。

**任何规则改动都必须补一个回归样例**：`data/i18n-labels.json` 增删条目要在 PR 里说明原因。

### C. 适配并登记新版本

1. `node tools/selftest.js` 全绿
2. 在 `data/versions.json` 加一行（`status: verified`）
3. 在 `docs/版本适配矩阵.md` 追加日期、替换处数、结论、英文基线 SHA-256

## 提交前自检清单

```bash
node tools/build.js && node tools/selftest.js && node tools/audit.js
```

- [ ] `selftest.js` 11/11 PASS
- [ ] `audit.js` 两个 target 都显示「✓ 无遗留 Claude 界面文案」
- [ ] `data/merged-dict.json`、`data/dict-norm.json` 已一并提交
- [ ] 没有把英文原文（`baseline/`、`.cache/`）提交进仓库
- [ ] 没有在词条里留下旧版压缩变量名（`k71=`、`Rz($,J=` 这类）

## 代码风格

- 只用 CommonJS，无第三方依赖（扩展体积小、无供应链风险）
- 注释写"为什么"，不写"是什么"
- 破坏性规则（会让替换变少）必须在 PR 描述里说明取舍理由

## Issue 模板要点

反馈"界面还是英文"时请附：

1. Claude Code 版本（`node tools/cli.js status` 的第一行）
2. `node tools/audit.js` 的输出
3. 截图或那段英文原文

反馈"面板打不开"时请附：

1. `%APPDATA%\Code\logs\<时间戳>\window1\exthost\exthost.log` 里
   `Activating extension Anthropic.claude-code failed` 之后的第一条错误
2. 是否已跑过 `node tools/selftest.js`
