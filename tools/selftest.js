/** Exercise apply/restore on a disposable copy of the installed extension. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine, readSnapshot, cjkCount, validateJavaScriptSyntax } = require('../lib/engine');

const ROOT = path.resolve(__dirname, '..');
function arg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const sourceEngine = new Engine({
    extensionsRoot: arg('--extensions-root', path.join(os.homedir(), '.vscode', 'extensions')),
    storageDir: arg('--storage', path.join(ROOT, '.cache')),
    dataDir: path.join(ROOT, 'data'),
});
let pass = 0;
let fail = 0;
function check(name, condition, detail) {
    console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
    if (condition) pass++; else fail++;
}

const installed = sourceEngine.installed();
if (!installed) {
    console.error('未找到已安装的 Claude Code 扩展。');
    process.exit(2);
}

const snapshot = readSnapshot(sourceEngine.storageDir, installed.version);
let english;
if (snapshot) english = snapshot.files;
else {
    english = {};
    for (const [key, file] of Object.entries(installed.files)) {
        if (key === 'walkthroughDir') continue;
        if (key === 'webview' || key === 'host' || key === 'pkg') english[key] = fs.readFileSync(file, 'utf8');
    }
    const walkthrough = fs.readdirSync(installed.files.walkthroughDir)
        .filter((name) => name.toLowerCase().endsWith('.md')).sort();
    for (const name of walkthrough) english['walkthrough/' + name] = fs.readFileSync(path.join(installed.files.walkthroughDir, name), 'utf8');
    if (cjkCount(english.webview) > 5000 || cjkCount(english.host) > 2000) {
        console.error('未找到经校验的英文快照，且当前安装含有大量中文。为避免修改真实安装，已停止自检。');
        process.exit(2);
    }
}

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-zhcn-selftest-'));
const extensionsRoot = path.join(TEMP, 'extensions');
const cloneDir = path.join(extensionsRoot, installed.name);
const storageDir = path.join(TEMP, 'storage');
const cloneFiles = {
    webview: path.join(cloneDir, 'webview', 'index.js'),
    host: path.join(cloneDir, 'extension.js'),
    pkg: path.join(cloneDir, 'package.json'),
    walkthroughDir: path.join(cloneDir, 'resources', 'walkthrough'),
};
const engine = new Engine({ extensionsRoot, storageDir, dataDir: path.join(ROOT, 'data') });

function destination(key) {
    if (key === 'webview' || key === 'host' || key === 'pkg') return cloneFiles[key];
    if (key.startsWith('walkthrough/')) return path.join(cloneFiles.walkthroughDir, key.slice('walkthrough/'.length));
    return null;
}

try {
    for (const [key, text] of Object.entries(english)) {
        const file = destination(key);
        if (!file) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text, 'utf8');
    }

    check('validated English baseline is available', !!english.webview && !!english.host && !!english.pkg, snapshot ? 'verified snapshot' : 'English installation copy');
    check('baseline contains no accidental localization', cjkCount(english.webview) < 5000 && cjkCount(english.host) < 2000,
        'webview ' + cjkCount(english.webview) + ' / host ' + cjkCount(english.host) + ' CJK characters');

    const firstApply = engine.apply();
    const firstStatus = engine.status();
    check('apply changes the localized webview', firstApply.webview.changed > 1000, firstApply.webview.changed + ' text edits');
    check('apply changes safe host strings', firstApply.host.changed > 0, firstApply.host.changed + ' text edits');
    const sourceCommands = (JSON.parse(english.pkg).contributes || {}).commands || [];
    const knownCommandCount = sourceCommands.filter((command) => sourceEngine.bundle.manifest.commands[command.command]).length;
    check('all known command labels are localized', knownCommandCount > 0 && firstStatus.commands.translated === knownCommandCount,
        firstStatus.commands.translated + '/' + firstStatus.commands.total + ' localized; ' + knownCommandCount + ' known');
    check('localized manifest remains valid JSON', (() => {
        try { JSON.parse(fs.readFileSync(cloneFiles.pkg, 'utf8')); return true; } catch (e) { return false; }
    })());
    check('localized host and webview remain syntactically valid', (() => {
        try { validateJavaScriptSyntax(fs.readFileSync(cloneFiles.webview, 'utf8')); validateJavaScriptSyntax(fs.readFileSync(cloneFiles.host, 'utf8')); return true; } catch (e) { return false; }
    })());

    const appliedFiles = Object.fromEntries(Object.keys(english).filter((key) => destination(key))
        .map((key) => [key, fs.readFileSync(destination(key), 'utf8')]));
    engine.apply();
    check('repeated application is idempotent', Object.entries(appliedFiles).every(([key, text]) => fs.readFileSync(destination(key), 'utf8') === text));

    engine.restore();
    check('restore exactly reproduces the English snapshot', Object.entries(english).filter(([key]) => destination(key))
        .every(([key, text]) => fs.readFileSync(destination(key), 'utf8') === text));
    check('restored webview is recognized as English', !engine.status().patched);

    const secondApply = engine.apply();
    check('a second apply succeeds after restoring the snapshot', secondApply.webview.changed > 1000 && secondApply.host.changed > 0);
} catch (error) {
    check('selftest completed without errors', false, String(error && error.stack || error));
} finally {
    fs.rmSync(TEMP, { recursive: true, force: true });
}

console.log('\n' + pass + ' passed / ' + fail + ' failed. All writes were limited to a temporary extension copy.');
process.exitCode = fail === 0 ? 0 : 1;
