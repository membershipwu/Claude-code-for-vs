const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(os.homedir(), '.vscode', 'extensions');
const dir = fs.readdirSync(root).filter((n) => /^anthropic\.claude-code-/i.test(n)).sort().pop();
const w = fs.readFileSync(path.join(root, dir, 'webview', 'index.js'), 'utf8');
const h = fs.readFileSync(path.join(root, dir, 'extension.js'), 'utf8');
const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;

console.log('目录:', dir);
console.log('聊天界面中文字符:', cjk(w), '| 宿主界面:', cjk(h));

const probes = [
    ['侧栏：它启动的智能体仍在工作', ' · 它启动的智能体仍在工作', 'w'],
    ['侧栏：它启动的智能体失败了', ' · 它启动的智能体失败了', 'w'],
    ['会话状态：— 运行中', ' — 运行中', 'w'],
    ['语言服务器 无响应', '无响应。', 'w'],
    ['用量分配被管理员禁用', '你的用量额度已被管理员禁用', 'w'],
    ['五小时上限', '5 小时上限', 'w'],
    ['插件：对你仍然开启', '但对你仍然开启。', 'w'],
    ['反馈：感谢你的反馈', '感谢你的反馈！', 'w'],
    ['反馈：哪些地方做得好', '哪些地方做得好？', 'w'],
    ['终端输出前缀', '终端输出：', 'w'],
    ['环境变量格式校验', '环境变量必须写成 KEY=value', 'w'],
    ['继续暂扣消息', '仍在暂扣来自', 'w'],
];
let ok = 0;
for (const [label, needle, where] of probes) {
    const hay = where === 'w' ? w : h;
    const hit = hay.includes(needle);
    if (hit) ok++;
    console.log(`${hit ? 'OK  ' : 'MISS'}  ${label}`);
}
console.log(`\n${ok}/${probes.length} 命中`);
process.exitCode = ok === probes.length ? 0 : 1;
