/**
 * 引擎自检：在真实安装的 Claude Code 上跑一遍
 *   英文原文 → 应用汉化 → 断言 → 还原 → 断言 → 再应用 → 断言
 * 任何一步不满足就非零退出。用于发布前回归，也用于新版本适配后的验收。
 *
 * 用法: node tools/selftest.js [--extensions-root <dir>] [--storage <dir>]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine, cjkCount } = require('../lib/engine');

const ROOT = path.resolve(__dirname, '..');
function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const engine = new Engine({
    extensionsRoot: arg('--extensions-root', path.join(os.homedir(), '.vscode', 'extensions')),
    storageDir: arg('--storage', path.join(ROOT, '.cache')),
    dataDir: path.join(ROOT, 'data'),
});

let pass = 0, fail = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
    ok ? pass++ : fail++;
}

const info = engine.installed();
if (!info) { console.error('未找到已安装的 Claude Code 扩展。'); process.exit(2); }
console.log(`目标: ${info.name}\n`);

/* --- 1. 建立英文基线 --- */
const scopeCfg = require(path.join(ROOT, 'data', 'scope.json'));
const hostWide = !scopeCfg.host || !scopeCfg.host.allowKinds || scopeCfg.host.allowKinds.length > 1;
const hostMin = hostWide ? 100 : 1;
const hostCjkMin = hostWide ? 2000 : 1;
const english = engine.englishFiles(info);
const englishWebview = english.files.webview;
const englishHost = english.files.host;
const englishPkg = english.files.pkg;
check('英文基线可取得', !!englishWebview && !!englishHost && !!englishPkg, `来源: ${english.from}`);
check('英文基线确实是英文', cjkCount(englishWebview) < 5000 && cjkCount(englishHost) < 2000,
    `webview ${cjkCount(englishWebview)} / host ${cjkCount(englishHost)} 个中文字符`);

/* --- 2. 应用汉化 --- */
const a1 = engine.apply();
const s1 = engine.status();
check('应用后状态为「已汉化」', s1.patched, `webview ${s1.cjkWebview} / host ${s1.cjkHost} 中文字符（宿主范围: ${hostWide ? 'wide' : 'api-only'}）`);
check('应用后有实际替换', a1.webview.changed > 1000 && a1.host.changed >= hostMin, `${a1.webview.changed} + ${a1.host.changed} 处`);
check('命令标题全部中文', s1.commands.translated === s1.commands.total, `${s1.commands.translated}/${s1.commands.total}`);
check('package.json 仍是合法 JSON', (() => { try { JSON.parse(fs.readFileSync(info.files.pkg, 'utf8')); return true; } catch (e) { return false; } })());
check('汉化后语法可解析', (() => { try { new Function(fs.readFileSync(info.files.webview, 'utf8')); new Function(fs.readFileSync(info.files.host, 'utf8')); return true; } catch (e) { return false; } })());

/* --- 3. 幂等：再应用一次结果不变 --- */
const before = fs.readFileSync(info.files.webview, 'utf8');
engine.apply();
check('重复应用结果不变（幂等）', fs.readFileSync(info.files.webview, 'utf8') === before);

/* --- 4. 还原 --- */
engine.restore();
const s2 = engine.status();
check('还原后回到英文原版', !s2.patched, `webview ${s2.cjkWebview} / host ${s2.cjkHost} 个中文字符`);
check('还原与英文基线逐字节一致', fs.readFileSync(info.files.webview, 'utf8') === englishWebview && fs.readFileSync(info.files.host, 'utf8') === englishHost);

/* --- 5. 再应用（可用性收尾，停在汉化状态） --- */
const a2 = engine.apply();
check('还原后可再次应用', engine.status().patched, `${a2.webview.changed} + ${a2.host.changed} 处`);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
