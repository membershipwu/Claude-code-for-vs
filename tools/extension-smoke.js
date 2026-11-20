/**
 * 扩展入口的无人值守冒烟：用 vscode 桩件加载 extension.js，跑 activate()，
 * 断言命令注册、状态栏刷新、状态查询都正常。用于发布前检查"扩展本身会不会崩"。
 *
 * 用法: node tools/extension-smoke.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STORAGE = path.join(ROOT, '.cache');

// ---- vscode 桩件 ----
function makeVscode() {
    const commands = new Map();
    const created = [];
    class ThemeColor { constructor(id) { this.id = id; } }
    class Uri {
        constructor(p) { this.fsPath = p; this.path = p; this.scheme = 'file'; }
        static file(p) { return new Uri(p); }
        toString() { return this.fsPath; }
    }
    const statusBarItem = () => ({
        text: '', tooltip: '', command: '', backgroundColor: null,
        show() { this._shown = true; }, hide() { this._shown = false; }, dispose() { },
    });
    const vscode = {
        StatusBarAlignment: { Left: 1, Right: 2 },
        ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
        ThemeColor,
        Uri,
        window: {
            createStatusBarItem() { const i = statusBarItem(); created.push(i); return i; },
            showInformationMessage: async () => undefined,
            showWarningMessage: async () => undefined,
            showErrorMessage: (m) => { console.error('[showErrorMessage]', m); },
            showTextDocument: async () => undefined,
            withProgress: async (_opts, task) => task({ report() { } }, { isCancellationRequested: false }),
        },
        commands: {
            registerCommand(id, fn) { commands.set(id, fn); return { dispose() { } }; },
            executeCommand: async () => undefined,
        },
        workspace: {
            getConfiguration: () => ({ get: (k, d) => d }),
        },
        extensions: {
            getExtension: (id) => {
                // 让扩展能找到真实的 Claude Code 目录
                const root = path.join(os.homedir(), '.vscode', 'extensions');
                const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((n) => /^anthropic\.claude-code-/i.test(n)) : [];
                if (!dirs.length) return undefined;
                dirs.sort();
                return { extensionPath: path.join(root, dirs[dirs.length - 1]) };
            },
        },
    };
    return { vscode, commands, created };
}

const { vscode, commands, created } = makeVscode();
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return origLoad.apply(this, arguments);
};

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); ok ? pass++ : fail++; };

(async () => {
    const ext = require(path.join(ROOT, 'extension.js'));
    check('extension.js 可加载', typeof ext.activate === 'function' && typeof ext.deactivate === 'function');

    const context = {
        subscriptions: [],
        extensionPath: ROOT,
        globalStorageUri: vscode.Uri.file(STORAGE),
    };
    ext.activate(context);
    check('activate 不抛错', true);
    check('6 条命令已注册', commands.size === 6, [...commands.keys()].join(','));
    check('状态栏条目已创建', created.length >= 1);
    check('状态栏文本已写入', !!(created[0] && created[0].text), created[0] && created[0].text);
    check('设置了状态栏命令', created[0] && created[0].command === 'claudeCodeZhcn.status');

    // 调用「检查状态」命令，确保整条链路可跑
    try {
        await commands.get('claudeCodeZhcn.status')();
        check('「检查状态」命令可执行', true);
    } catch (e) {
        check('「检查状态」命令可执行', false, String(e && e.message || e));
    }

    ext.deactivate();
    console.log(`\n${pass} 通过 / ${fail} 失败`);
    process.exit(fail === 0 ? 0 : 1);
})();
