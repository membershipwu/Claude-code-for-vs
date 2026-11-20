# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.0] - 2026-11-20

首个以「VS Code 扩展」形态发布的全量汉化版本。相比早期的工作区脚本，这一版把汉化做成了
可分发、可还原、可审计的产品。

### 新增

- **VS Code 扩展形态**：命令面板四条命令（应用 / 还原 / 检查状态 / 重置快照）、状态栏状态指示、四条设置项
- **版本自适应**：自动扫描 `anthropic.claude-code-*` 取最高版本，不再写死版本目录名
- **按版本隔离的英文快照**：首次应用时把用户本机英文文件快照到 `globalStorage/baseline/<version>/`，
  含逐文件 SHA-256；仓库本身不携带 Anthropic 代码
- **归一化词条**（`data/dict-norm.json`）：把 `${...}` 换成哨兵后再匹配，压缩变量名整体改名
  （`Cp→Ep`、`Ke→Je`、`wa→Sa`、`sv→cv`）后译文仍可复用
- **名称位置检测**（`lib/namepos.js`）：`Object.defineProperty` 导出名、`obj["x"]`、`"x" in obj`、
  名字列表数组一律不动
- **单词型标签白名单**（`data/i18n-labels.json`）：`未分组`、`状态`、`标签页`、`打开`、`已关闭` 等
- **枚举标签映射识别**：`{open:"Open", closed:"Closed"}` 这类"键是协议值、值才是文案"的映射
- **覆盖率审计工具**（`tools/audit.js`）：精确列出仍未汉化且属于 Claude 界面的文案
- **回归自检**（`tools/selftest.js`）：真实安装上 11 项断言，含幂等性与逐字节还原

### 修复

- **扩展激活失败（`TypeError: t.Name is not a constructor`）**：早期版本把
  `Object.defineProperty(nn,"Name",…)` 里的导出名当文案翻译，导致模块不再导出 `Name`，
  面板一直转圈。已由名称位置检测 + 运行时冒烟门禁根治
- **左侧会话栏「未分组」未汉化**：`m(Comp,{name:"Ungrouped",…})` 的 `name` 属性不在常规 UI 属性表内
- **状态面板「运行中 / 已完成 / 标签页 / 打开 / 已关闭」未汉化**：这类值是枚举标签映射的值，
  且是单词形态，被单词串保护规则整体跳过

### 已知限制

- 内嵌 Monaco/VS Code 编辑器组件、KaTeX、JSON-Schema 文档、发送给模型的提示词不翻译（逐类登记原因）
- 修改 `package.json` 后必须 `Developer: Reload Window` 才生效
- 未登记的新版本仍可应用，但新增文案会保持英文，需跑 `tools/audit.js` 补齐

## [2.1.329 适配记录] - 2026-11-20

- 聊天界面替换 2,175 处、宿主界面 546 处、清单 78 个字段、演练 4 篇
- 命令标题 31/31 全中文
- `selftest.js` 11/11 PASS；`audit.js` 两个 target 均「无遗留 Claude 界面文案」

## [2.1.328 适配记录] - 2026-11-20

- 首次全量适配：聊天界面替换 1,698 处、宿主界面 476 处
- 15 项静态校验全通过
