const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(os.homedir(), '.vscode', 'extensions');
const dir = fs.readdirSync(root).filter((n) => /^anthropic\.claude-code-/i.test(n)).sort().pop();
const h = fs.readFileSync(path.join(root, dir, 'extension.js'), 'utf8');
const w = fs.readFileSync(path.join(root, dir, 'webview', 'index.js'), 'utf8');
const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;

const re = /show(?:Information|Error|Warning)Message\(\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g;
let m, n = 0;
console.log('宿主侧已中文的通知（抽样）:');
while ((m = re.exec(h)) !== null && n < 8) { console.log('  ' + m[1].slice(0, 70)); n++; }
const total = (h.match(/show(?:Information|Error|Warning)Message\(\s*"[^"]*[\u4e00-\u9fff]/g) || []).length;
console.log('  通知类已中文条数:', total);

console.log('\n字符统计: webview', cjk(w), '/ host', cjk(h));

// 安全性检查：宿主里被翻译的位置是否都在 UI API 实参内
const suspicious = [];
for (const s of ['正在请求权限', '切换专注视图']) {
    if (h.includes(s)) suspicious.push(s + '（出现在宿主，需确认位置安全）');
}
console.log('可疑（不该出现在或需核对）:', suspicious.length ? suspicious.join(', ') : '无');
