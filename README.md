# Claude Code 简体中文汉化

为 **Claude Code for VS Code** 提供非官方简体中文界面翻译。该扩展以 VSIX 安装；由你明确执行“应用汉化”后，才会改写已安装 Claude Code 中的用户界面文件，并提供英文原版还原功能。

![MIT](https://img.shields.io/badge/license-MIT-green) ![VS%20Code](https://img.shields.io/badge/VS%20Code-%E2%89%A51.85-blue) ![Claude%20Code](https://img.shields.io/badge/Claude%20Code-2.1.329%20%E5%B7%B2%E9%AA%8C%E8%AF%81-brightgreen)

## 安装

### 从 VSIX 安装

1. 在本项目 [Releases](https://github.com/membershipwu/Claude-code-for-vs/releases) 页面下载最新的 claude-code-zhcn VSIX。
2. 在 VS Code 打开扩展视图，选择“从 VSIX 安装”，再选中下载的文件。
3. 确认已安装官方的 **Claude Code for VS Code** 扩展。
4. 在命令面板运行“Claude Code 汉化: 应用汉化”。应用后按提示重新加载窗口。

也可以从命令行安装：

~~~sh
code --install-extension claude-code-zhcn-2.0.3.vsix
~~~

源码打包需要 Node.js 18 或更新版本与网络连接：

~~~sh
npm run build
npm run verify
npm run package
~~~

生成的 VSIX 默认位于仓库根目录。手动从 VSIX 安装与在 Visual Studio Marketplace 发布是两种不同的分发方式；发布到 Marketplace 还需要有效的 publisher 账号。

## 使用

安装扩展后，在命令面板中搜索“Claude Code 汉化”：

| 命令 | 作用 |
|---|---|
| 应用汉化 | 根据当前安装的 Claude Code 版本应用已审核的翻译。首次运行会保存英文基线。 |
| 还原英文原版 | 校验基线后还原 Claude Code 的英文原文件。 |
| 检查状态 | 查看版本、汉化状态、命令标题覆盖情况和基线状态。 |
| 重置英文快照 | 清除选定版本的英文基线。命令运行前要求确认；请先还原英文或重新安装 Claude Code。 |
| 打开汉化报告 | 查看受支持版本的已知适配记录。 |
| 打开设置 | 配置启动提示、状态栏显示和 Claude Code 扩展标识。 |

安装或升级本汉化扩展后，需要运行一次“应用汉化”再重新加载窗口；仅安装 VSIX 或重启 VS Code 不会更新已有补丁。发现状态筛选仍有英文时，状态栏会显示“待补译”，点击后可应用；已汉化时也可选择“重新应用汉化”。

汉化扩展不会在后台自动改写 Claude Code。改写只发生在“应用汉化”命令运行时。原文件与校验清单保存在此汉化扩展的 VS Code **globalStorage**，不会打包进仓库或 VSIX。备份校验失败时，应用与还原都会停止并提示如何恢复。

Claude Code 更新后，原来的补丁可能随新版本安装而消失。运行“应用汉化”会按新版本建立独立基线，并提示尚未测试的版本。遇到面板无法打开时，先运行“还原英文原版”，再重新加载窗口。

## 汉化范围与兼容性

扩展安装包包含经过审查的简体中文词库，不包含 Claude Code 的代码或二进制。词法器只修改已识别为界面文案的 JavaScript 字面量，并在写入前验证代码 token 与 JavaScript 语法；package.json 通过 JSON 解析验证。

为避免改变 Claude Code 宿主端的 schema、导出名和协议值，目前宿主侧仅翻译识别到的 VS Code 消息 API 中的文字；聊天 webview 使用较完整的界面规则。少量原本位于通知 API 参数中的单词可能仍保留英文。翻译范围经过保守限制，因为扩大宿主侧范围曾导致 Claude Code 启动时的 schema 代码生成错误。

会话状态筛选中的 **Needs input / Working / Completed** 分组现分别映射为 **需要输入 / 正在工作 / 已完成**。另有 **Status / Tabs、Open / Closed、Ungrouped** 等标签的回归检查。具体翻译随目标扩展版本及其界面规则变化；版本适配记录见仓库内的 docs/版本适配矩阵.md。

当前确认适配 Claude Code **2.1.329**。其他版本可能会保留未识别的新英文文案。应用未知版本前，扩展会要求确认。翻译版本与用户安装包版本彼此独立；运行时版本号见 package.json。

不翻译 Claude Code 发给模型的提示词与工具协议、代码中的属性名与枚举值、链接、路径、模型 ID、日志，以及内嵌编辑器和第三方组件的界面。

## 开发与检查

常用命令：

~~~sh
node tools/cli.js status
node tools/cli.js apply
node tools/cli.js restore
npm run verify
node tools/selftest.js
node tools/verify-reported.js
~~~

npm run verify 在隔离的测试夹具上检查翻译规则、快照完整性、还原与多文件故障回退，并启动扩展入口的命令和应用流程测试。它不会修改用户已安装的 Claude Code。node tools/selftest.js 会把当前安装版复制到临时目录，再以本机英文基线进行幂等、还原和再次应用验证；原安装目录不参与写入。首次适配新版时如没有可信的英文基线，自检会停止，而不会猜测性地把中文当作英文原文。

node tools/verify-reported.js 默认只读检查实际安装文件，确认状态筛选等八项文案已落盘；加 --baseline 则只检查从英文快照计算的预期结果。两种结果分开报告，避免把词库已补齐误报为用户环境已生效。

修改词库后重建并检查：

~~~sh
node tools/build.js
npm run verify
~~~

贡献翻译之前请阅读仓库中的 CONTRIBUTING.md。本项目通过 GitHub Actions 运行 Node.js 测试与 VSIX 打包检查。版本发布会生成可下载的 VSIX；GitHub 仓库和发行版本需要由项目维护者创建。

## 隐私与许可

- 翻译扩展不收集 Claude Code 会话内容或凭据，也不发送翻译文件；汉化工作流在本机完成。
- 本项目采用 MIT 许可证，许可全文见仓库中的 LICENSE 文件。
- 本项目与 Anthropic 无隶属关系；Claude 与 Claude Code 为其各自所有者的商标。
