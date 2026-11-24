/** Verify the installed files by default; --baseline verifies a prospective patch separately. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine, patchSource } = require('../lib/engine');

const ROOT = path.resolve(__dirname, '..');
function arg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const engine = new Engine({
    extensionsRoot: arg('--extensions-root', path.join(os.homedir(), '.vscode', 'extensions')),
    storageDir: arg('--storage', path.join(ROOT, '.cache')),
    dataDir: path.join(ROOT, 'data'),
});
const installed = engine.installed();
if (!installed) {
    console.error('未找到已安装的 Claude Code 扩展。');
    process.exit(2);
}

const baselineMode = process.argv.includes('--baseline');
const english = baselineMode ? engine.englishFiles(installed).files.webview : null;
const localized = baselineMode
    ? patchSource(english, engine.bundle, 'webview').text
    : fs.readFileSync(installed.files.webview, 'utf8');
console.log('Checking ' + (baselineMode ? 'prospective baseline output' : 'ACTUAL INSTALLED FILE') + ': ' + installed.files.webview);
const checks = [
    ['left-rail ungrouped label', 'name:"Ungrouped"', 'name:"未分组"'],
    ['status-filter needs-input label', 'needs_input:"Needs input"', 'needs_input:"需要输入"'],
    ['status-filter working label', 'working:"Working"', 'working:"正在工作"'],
    ['status-filter completed label (formerly missing)', 'completed:"Completed"', 'completed:"已完成"'],
    ['tab-filter open label', 'open:"Open"', 'open:"打开"'],
    ['tab-filter closed label', 'closed:"Closed"', 'closed:"已关闭"'],
    ['status-filter heading', 'vHn="Status"', 'vHn="状态"'],
    ['tab-filter heading', '_Hn="Tabs"', '_Hn="标签页"'],
];
let failures = 0;
for (const [description, source, expected] of checks) {
    const ok = localized.includes(expected) && (baselineMode ? english.includes(source) : !localized.includes(source));
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + description);
    if (!ok) failures++;
}
console.log('\n' + (checks.length - failures) + '/' + checks.length + ' translated labels verified in ' +
    (baselineMode ? 'the prospective baseline output.' : 'the actual installed file.'));
if (failures) process.exitCode = 1;
