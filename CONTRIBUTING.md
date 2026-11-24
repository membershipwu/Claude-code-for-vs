# 贡献指南

欢迎通过 Issue 和 Pull Request 帮忙报告漏译、误译或兼容性问题。

## 环境

- Node.js 24（自动化检查所用版本）
- VS Code 1.85 或更新版本
- 本地开发与测试不需要安装第三方运行时依赖；打包脚本会通过 npx 获取 VSCE。

## 更新或审核翻译

在已安装受支持 Claude Code 版本并存在经校验的英文基线时，检查待译 UI 锚点：

~~~sh
node tools/cli.js status
node tools/gap.js
node tools/audit.js
~~~

把已人工审核的译文加入 data/i18n-webview*.json、data/i18n-host*.json 或 data/i18n-labels.json，然后运行：

~~~sh
npm run build
npm run verify
npm run package
~~~

node tools/selftest.js 是可选的本机集成回归：必须已有有效的英文基线；测试仅在临时扩展副本上应用和还原。它没有在实际 VS Code 窗口中视觉检查每条 UI 文案。

### 翻译规范

- 原样保留 JavaScript 插值内的表达式、属性名、枚举值、事件名称和产品名。
- 不更改模型提示词、工具协议、链接、路径及内部 key。
- 对单词标签，仅在确认其为可见的界面文案、且不会修改代码值时加入白名单。
- 用简洁的简体中文和自然的全角标点；不确定含义的条目交由审查，不猜测。
- 对新 Claude Code 版本先取得和确认干净英文基线；不能将已翻译的安装目录当作基线。

### 改进改写规则

任何改动 lib/lexer.js、lib/planner.js、lib/namepos.js 或 lib/engine.js 的 Pull Request，均应增加可执行回归并运行 npm run verify。宿主改写范围在 data/scope.json 配置，目前有意限于受保护的消息 API；不要因为覆盖率数字直接扩大这个范围。

## Pull Request 检查清单

- [ ] npm run build 成功，生成的词典已提交。
- [ ] npm run verify 全部通过。
- [ ] 记录实际检查过的 Claude Code 版本；未复现的版本标记为 untested。
- [ ] 变更没有修改用户安装的 Claude Code 或提交其代码、快照、日志和 VSIX。
- [ ] README 和版本适配矩阵中的覆盖范围与实际校验一致。

## 问题报告

报告漏译时附 Claude Code 版本、文案所在位置和必要时的截图。报告无法打开面板时，附扩展宿主日志里 Claude Code 激活失败错误附近的脱敏内容；先移除 API key、token、会话内容、本机用户名、用户目录、项目路径和工作区数据。日志不应包含身份凭据。
