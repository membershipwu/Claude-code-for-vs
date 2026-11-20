/**
 * Claude Code 简体中文汉化 —— VS Code 扩展入口
 *
 * 职责很窄：
 *   1) 定位已安装的 Claude Code（自动识别版本，不写死目录名）
 *   2) 首次应用时把英文原文快照到本扩展的 globalStorage（按版本隔离）
 *   3) 应用 / 还原 / 检查状态 / 重置快照
 *
 * 所有改动都是"只替换字面量内容"，并在写盘前做 token 结构自证；
 * 一旦自证失败就整体放弃，不会留下半汉化状态。
 */
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { Engine } = require('./lib/engine');

let statusItem = null;
let lastStatus = null;

/** 推断扩展安装根目录：优先由 Claude Code 扩展自身路径反推 */
function resolveExtensionsRoot() {
    const id = vscode.workspace.getConfiguration('claudeCodeZhcn').get('claudeCodeExtensionId') || 'Anthropic.claude-code';
    const ext = vscode.extensions.getExtension(id);
    const candidates = [];
    if (ext && ext.extensionPath) candidates.push(path.dirname(ext.extensionPath));
    candidates.push(path.join(os.homedir(), '.vscode', 'extensions'));
    candidates.push(path.join(os.homedir(), '.vscode-insiders', 'extensions'));
    for (const c of candidates) if (c && fs.existsSync(c)) return c;
    return candidates[0];
}

function makeEngine(context) {
    return new Engine({
        extensionsRoot: resolveExtensionsRoot(),
        storageDir: context.globalStorageUri.fsPath,
        dataDir: path.join(context.extensionPath, 'data'),
    });
}

function statusText(s) {
    if (!s.ok) return { text: '$(globe) Claude 汉化: 未安装', tip: '未找到已安装的 Claude Code 扩展。' };
    const mark = s.patched ? '已汉化' : '未汉化';
    const sup = s.supported === 'verified' ? '已适配' : s.supported === 'untested' ? '未测试版本' : '未知版本';
    return {
        text: `$(globe) Claude ${s.version} ${s.patched ? '✓' : '…'}`,
        tip: [
            `Claude Code 版本：${s.version}`,
            `汉化状态：${mark}`,
            `版本适配：${sup}`,
            `命令标题：${s.commands.translated}/${s.commands.total} 已中文`,
            `词典条目：${s.dictSize}`,
            s.hasSnapshot ? '英文快照：已建立' : '英文快照：未建立',
            '',
            '点击执行「检查状态」',
        ].join('\n'),
    };
}

function refreshStatus(context) {
    const cfg = vscode.workspace.getConfiguration('claudeCodeZhcn');
    if (!cfg.get('showStatusBar', true)) { if (statusItem) statusItem.hide(); return null; }
    let s;
    try { s = makeEngine(context).status(); } catch (e) { s = { ok: false, reason: String(e && e.message || e) }; }
    lastStatus = s;
    if (!statusItem) {
        statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        statusItem.command = 'claudeCodeZhcn.status';
        context.subscriptions.push(statusItem);
    }
    const t = statusText(s);
    statusItem.text = t.text;
    statusItem.tooltip = t.tip;
    statusItem.show();
    return s;
}

async function offerReload(msg) {
    const cfg = vscode.workspace.getConfiguration('claudeCodeZhcn');
    if (!cfg.get('notifyOnApply', true)) return;
    const pick = await vscode.window.showInformationMessage(msg, '立即重新加载', '稍后');
    if (pick === '立即重新加载') vscode.commands.executeCommand('workbench.action.reloadWindow');
}

async function apply(context) {
    const engine = makeEngine(context);
    const s = engine.status();
    if (!s.ok) { vscode.window.showErrorMessage('未找到已安装的 Claude Code 扩展。'); return; }
    if (s.supported === 'untested') {
        const pick = await vscode.window.showWarningMessage(
            `${s.version} 是尚未登记测试的 Claude Code 版本，汉化按通用规则尽力应用（未覆盖的新文案会保持英文）。`,
            '继续', '取消'
        );
        if (pick !== '继续') return;
    }
    try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `正在汉化 Claude Code ${s.version}…` }, async () => {
            const r = engine.apply();
            refreshStatus(context);
            await offerReload(`汉化已应用：聊天界面 ${r.webview.changed} 处、宿主界面 ${r.host.changed} 处、清单 ${r.manifestChanges} 个字段、演练 ${r.markdown} 篇。重新加载窗口后生效。`);
        });
    } catch (e) {
        vscode.window.showErrorMessage('汉化失败：' + (e && e.message || e));
    }
}

async function restore(context) {
    const engine = makeEngine(context);
    try {
        const r = engine.restore();
        refreshStatus(context);
        await offerReload(`已还原 ${r.version} 的英文原版（${r.restored} 个文件）。重新加载窗口后生效。`);
    } catch (e) {
        vscode.window.showErrorMessage('还原失败：' + (e && e.message || e));
    }
}

async function showStatus(context) {
    const s = refreshStatus(context);
    if (!s || !s.ok) { vscode.window.showWarningMessage('未找到已安装的 Claude Code 扩展。'); return; }
    const action = await vscode.window.showInformationMessage(
        [
            `Claude Code ${s.version} · ${s.patched ? '已汉化' : '未汉化'}`,
            `命令标题 ${s.commands.translated}/${s.commands.total} 已中文 · 词典 ${s.dictSize} 条 · 版本适配：${s.supported}`,
            `聊天界面中文字符 ${s.cjkWebview} · 宿主界面 ${s.cjkHost}`,
        ].join('\n'),
        s.patched ? '还原英文原版' : '应用汉化'
    );
    if (action === '应用汉化') await apply(context);
    if (action === '还原英文原版') await restore(context);
}

async function resetSnapshot(context) {
    const engine = makeEngine(context);
    const s = engine.status();
    if (!s.ok) { vscode.window.showErrorMessage('未找到已安装的 Claude Code 扩展。'); return; }
    const pick = await vscode.window.showWarningMessage(
        `将删除 ${s.version} 的英文快照。若当前文件已被汉化，下次应用会以「当前文件」为基线，导致无法还原英文。\n建议先执行「还原英文原版」。`,
        { modal: true },
        '我已还原，继续', '取消'
    );
    if (pick !== '我已还原，继续') return;
    engine.dropSnapshot(s.version);
    refreshStatus(context);
    vscode.window.showInformationMessage(`已重置 ${s.version} 的英文快照。`);
}

async function openReport(context) {
    // 文档不随 VSIX 分发（仅随源码）；没有文档时直接展示版本适配矩阵的内容
    const file = path.join(context.extensionPath, 'docs', '版本适配矩阵.md');
    if (fs.existsSync(file)) {
        await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
        return;
    }
    let versions = {};
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'data', 'versions.json'), 'utf8'));
        versions = raw.versions || {};
    } catch (e) { versions = {}; }
    const rows = Object.entries(versions)
        .sort()
        .reverse()
        .map(([v, info]) => `${v}  ${info.status === 'verified' ? '✅ 已实测' : info.status === 'broken' ? '⛔ 不兼容' : '⚠️ 未测试'}  ${info.since || ''}`);
    const s = lastStatus || makeEngine(context).status();
    vscode.window.showInformationMessage(
        [
            `版本适配矩阵（当前已安装 ${s.version}）`,
            ...rows,
            '',
            '完整矩阵与适配方法见仓库 docs/版本适配矩阵.md',
        ].join('\n'),
        { modal: true }
    );
}

function activate(context) {
    const cfg = vscode.workspace.getConfiguration('claudeCodeZhcn');
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeCodeZhcn.apply', () => apply(context)),
        vscode.commands.registerCommand('claudeCodeZhcn.restore', () => restore(context)),
        vscode.commands.registerCommand('claudeCodeZhcn.status', () => showStatus(context)),
        vscode.commands.registerCommand('claudeCodeZhcn.resetSnapshot', () => resetSnapshot(context)),
        vscode.commands.registerCommand('claudeCodeZhcn.openReport', () => openReport(context)),
        vscode.commands.registerCommand('claudeCodeZhcn.openSettings', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', 'claudeCodeZhcn'))
    );

    if (cfg.get('checkOnStartup', true)) {
        try {
            const s = refreshStatus(context);
            if (s && s.ok && (!s.patched || s.supported === 'untested')) {
                // 只提示，不自动改写文件
                statusItem && (statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground'));
            }
        } catch (e) { /* 启动期不打扰 */ }
    }
}

function deactivate() { }

module.exports = { activate, deactivate };
