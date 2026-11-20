const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(os.homedir(), '.vscode', 'extensions');
const dir = fs.readdirSync(root).filter((n) => /^anthropic\.claude-code-/i.test(n)).sort().pop();
const w = fs.readFileSync(path.join(root, dir, 'webview', 'index.js'), 'utf8');
const h = fs.readFileSync(path.join(root, dir, 'extension.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));

const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;
console.log('目录:', dir);
console.log('聊天界面中文字符:', cjk(w), '| 宿主界面:', cjk(h));
const cmds = pkg.contributes.commands;
console.log('命令标题中文:', cmds.filter((c) => /[\u4e00-\u9fff]/.test(c.title || '')).length + '/' + cmds.length);

const pairs = [
    ['未分组（左侧分组名）', 'name:"未分组"'],
    ['打开（状态列）', 'open:"打开"'],
    ['已关闭（状态列）', 'closed:"已关闭"'],
    ['正在工作（状态列）', 'working:"正在工作"'],
    ['已完成（状态列）', 'finished:"已完成"'],
    ['失败（状态列）', 'failed:"失败"'],
    ['已停止（状态列）', 'stopped:"已停止"'],
    ['等待你的许可（状态列）', 'waiting:"等待你的许可"'],
    ['状态（段标题）', '"状态"'],
    ['标签页（段标题）', '"标签页"'],
];
let ok = 0;
console.log('\n--- 用户报告的漏译点 ---');
for (const [label, needle] of pairs) {
    const hit = w.includes(needle);
    if (hit) ok++;
    console.log(`${hit ? 'OK  ' : 'MISS'}  ${label}`);
}
console.log(`\n${ok}/${pairs.length} 已汉化`);
process.exitCode = ok === pairs.length ? 0 : 1;
