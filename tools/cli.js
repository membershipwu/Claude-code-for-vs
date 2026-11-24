/**
 * 命令行前端（与 VS Code 扩展共用同一套引擎）。
 *
 *   node tools/cli.js status            查看版本 / 汉化状态 / 是否已适配
 *   node tools/cli.js apply             应用汉化
 *   node tools/cli.js restore           还原英文原版
 *   node tools/cli.js reset             重置当前版本的英文快照
 *   node tools/cli.js selftest          自检：应用→校验→还原→再应用，逐步断言
 *
 * 可选: --extensions-root <dir>  指定扩展目录（默认 ~/.vscode/extensions）
 *       --storage <dir>          指定快照目录（默认 <repo>/.cache）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine } = require('../lib/engine');

const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const cmd = process.argv[2] || 'status';
const engine = new Engine({
    extensionsRoot: arg('--extensions-root', path.join(os.homedir(), '.vscode', 'extensions')),
    storageDir: arg('--storage', path.join(ROOT, '.cache')),
    dataDir: path.join(ROOT, 'data'),
});

function printStatus(s) {
    if (!s.ok) { console.log('未找到已安装的 Claude Code 扩展。'); return; }
    console.log('Claude Code 版本 :', s.version);
    console.log('安装目录         :', s.dir);
    console.log('汉化状态         :', s.needsUpdate ? '有漏译，需重新应用汉化' : s.patched ? '已汉化 ✓' : '未汉化');
    if (s.needsUpdate) console.log('尚未应用的翻译   :', s.sessionLabels.missing.join('、'));
    console.log('版本适配         :', s.supported);
    console.log('聊天界面中文字符 :', s.cjkWebview);
    console.log('宿主界面中文字符 :', s.cjkHost);
    console.log('命令标题         :', `${s.commands.translated}/${s.commands.total} 已中文`);
    console.log('词典条目         :', s.dictSize);
    console.log('英文快照         :', s.hasSnapshot ? '已建立' : '未建立');
}

if (cmd === 'status') {
    printStatus(engine.status());
} else if (cmd === 'apply') {
    const r = engine.apply();
    console.log(`已应用：聊天界面 ${r.webview.changed} 处、宿主界面 ${r.host.changed} 处、清单 ${r.manifestChanges} 个字段、演练 ${r.markdown} 篇`);
    printStatus(engine.status());
    console.log('\n请执行 VS Code 命令: Developer: Reload Window');
} else if (cmd === 'restore') {
    const r = engine.restore();
    console.log(`已还原 ${r.version}（${r.restored} 个文件）`);
    console.log('\n请执行 VS Code 命令: Developer: Reload Window');
} else if (cmd === 'reset') {
    const s = engine.status();
    if (!s.ok) { console.error('未找到扩展'); process.exit(1); }
    if (s.patched) {
        console.error('当前安装仍处于汉化状态；请先运行 restore 并确认英文原版已恢复，再删除唯一可用的英文快照。');
        process.exit(1);
    }
    engine.dropSnapshot(s.version);
    console.log(`已删除 ${s.version} 的英文快照。`);
} else if (cmd === 'selftest') {
    require('./selftest');
} else {
    console.error('未知命令:', cmd);
    console.error('可用: status | apply | restore | reset | selftest');
    process.exit(1);
}
