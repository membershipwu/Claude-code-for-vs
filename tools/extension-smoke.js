/** End-to-end smoke of our VS Code extension against an isolated fake install. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const { Engine, writeSnapshot } = require('../lib/engine');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-zhcn-smoke-'));
const extensionsRoot = path.join(TEMP, 'extensions');
const extensionDir = path.join(extensionsRoot, 'anthropic.claude-code-2.1.329-win32-x64');
const walkthroughDir = path.join(extensionDir, 'resources', 'walkthrough');
const storageDir = path.join(TEMP, 'storage');
const files = {
    webview: path.join(extensionDir, 'webview', 'index.js'),
    host: path.join(extensionDir, 'extension.js'),
    pkg: path.join(extensionDir, 'package.json'),
};

function writeFixture() {
    fs.mkdirSync(path.dirname(files.webview), { recursive: true });
    fs.mkdirSync(walkthroughDir, { recursive: true });
    fs.mkdirSync(storageDir, { recursive: true });
    const source = {
        webview: '/* ' + '汉'.repeat(5100) + ' */\nconst view={title:"Cancel",label:"Ungrouped"};const filter={needs_input:"Needs input",working:"Working",completed:"Completed"};',
        host: 'function notify(){return vscode.window.showInformationMessage("Cancel")}',
        pkg: JSON.stringify({
            displayName: 'Claude Code for VS Code',
            description: 'Claude Code for VS Code: Harness the power of Claude Code without leaving your IDE',
            contributes: { commands: [{ command: 'claude-vscode.newConversation', title: 'Claude Code: New Conversation' }] },
        }, null, 2) + '\n',
    };
    fs.writeFileSync(files.webview, source.webview);
    fs.writeFileSync(files.host, source.host);
    fs.writeFileSync(files.pkg, source.pkg);
    writeSnapshot(storageDir, '2.1.329', source);
}

function makeVscode(overrides = {}) {
    const commands = new Map();
    const created = [];
    const informationMessages = [];
    const configuration = Object.assign({ checkOnStartup: true, showStatusBar: true, notifyOnApply: true }, overrides);
    let onConfigurationChange = null;
    class ThemeColor { constructor(id) { this.id = id; } }
    class Uri {
        constructor(filePath) { this.fsPath = filePath; this.path = filePath; this.scheme = 'file'; }
        static file(filePath) { return new Uri(filePath); }
    }
    const vscode = {
        StatusBarAlignment: { Left: 1, Right: 2 },
        ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
        ThemeColor,
        Uri,
        window: {
            createStatusBarItem() {
                const item = {
                    text: '', tooltip: '', command: '', backgroundColor: null,
                    show() { this._shown = true; }, hide() { this._shown = false; }, dispose() {},
                };
                created.push(item);
                return item;
            },
            showInformationMessage: async (...args) => { informationMessages.push(args); return undefined; },
            showWarningMessage: async () => undefined,
            showErrorMessage(message) { throw new Error('unexpected VS Code error notification: ' + message); },
            showTextDocument: async () => undefined,
            withProgress: async (_options, callback) => callback({ report() {} }, { isCancellationRequested: false }),
        },
        commands: {
            registerCommand(id, callback) { commands.set(id, callback); return { dispose() {} }; },
            executeCommand: async () => undefined,
        },
        workspace: {
            getConfiguration: () => ({ get: (key, fallback) => Object.prototype.hasOwnProperty.call(configuration, key) ? configuration[key] : fallback }),
            onDidChangeConfiguration(callback) { onConfigurationChange = callback; return { dispose() {} }; },
        },
        extensions: {
            getExtension(id) {
                return id.toLowerCase() === 'anthropic.claude-code'
                    ? { extensionPath: extensionDir, packageJSON: { version: '2.1.329' } }
                    : undefined;
            },
        },
    };
    return {
        vscode, commands, created, informationMessages,
        setConfiguration(key, value) {
            configuration[key] = value;
            onConfigurationChange({ affectsConfiguration(name) { return name === 'claudeCodeZhcn.' + key; } });
        },
    };
}

async function main() {
    writeFixture();
    const { vscode, commands, created, setConfiguration, informationMessages } = makeVscode({ checkOnStartup: false });
    const previousLoad = Module._load;
    const messages = [];
    let checks = 0;
    const check = (name, condition, detail) => {
        checks++;
        console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
        if (!condition) messages.push(name);
    };

    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') return vscode;
        return previousLoad.call(this, request, parent, isMain);
    };
    try {
        const entryPath = path.join(ROOT, 'extension.js');
        delete require.cache[require.resolve(entryPath)];
        const extension = require(entryPath);
        check('extension entry point loads', typeof extension.activate === 'function' && typeof extension.deactivate === 'function');
        const context = { subscriptions: [], extensionPath: ROOT, globalStorageUri: vscode.Uri.file(storageDir) };
        extension.activate(context);
        check('activate completes and registers every command', commands.size === 6, [...commands.keys()].join(', '));
        check('status-bar entry stays visible when startup checks are disabled', created[0] && created[0]._shown);

        setConfiguration('showStatusBar', false);
        check('status-bar setting hides the entry immediately', created[0] && !created[0]._shown);
        setConfiguration('showStatusBar', true);
        check('status-bar setting restores the entry immediately', created[0] && created[0]._shown);

        await commands.get('claudeCodeZhcn.apply')();
        const engine = new Engine({ extensionsRoot, storageDir, dataDir: path.join(ROOT, 'data') });
        check('apply command translates the isolated installation', engine.status().patched);
        check('apply updates the status-bar label', !!(created[0] && created[0].text.includes('✓')));

        fs.writeFileSync(files.webview, fs.readFileSync(files.webview, 'utf8').replace('completed:"已完成"', 'completed:"Completed"'));
        await commands.get('claudeCodeZhcn.status')();
        check('an older localized file is shown as needing translation', created[0].text.includes('待补译') && !created[0].text.includes('✓'));
        const prompt = informationMessages.at(-1);
        check('status offers application when a label is missing', prompt[0].includes('Completed') && prompt.includes('应用汉化'));
        await commands.get('claudeCodeZhcn.apply')();
        check('reapplication fixes the actual installation label', fs.readFileSync(files.webview, 'utf8').includes('completed:"已完成"') && engine.status().patched);

        await commands.get('claudeCodeZhcn.restore')();
        check('restore command restores all installation files', !engine.status().patched);
        await commands.get('claudeCodeZhcn.status')();
        check('status command executes', true);

        extension.deactivate();
        check('extension context subscriptions are disposable', context.subscriptions.every((item) => typeof item.dispose === 'function'));
    } finally {
        Module._load = previousLoad;
        delete require.cache[require.resolve(path.join(ROOT, 'extension.js'))];
        fs.rmSync(TEMP, { recursive: true, force: true });
    }

    console.log('\n' + (checks - messages.length) + ' checks passed; ' + messages.length + ' failed.');
    if (messages.length) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error && error.stack || error);
    fs.rmSync(TEMP, { recursive: true, force: true });
    process.exitCode = 1;
});
