/**
 * 从旧开源汉化包（zstings/claude-code-zh-cn, MIT）的翻译记忆里提取可复用词条，
 * 生成 data/i18n-tm.json。
 *
 * 只保留"像界面文案"的键；像 `Rz($,J="From")` 这种把旧版压缩代码片段当键的条目一律丢弃
 * （那正是旧包随版本失效的根源）。
 *
 * 用法: node tools/import-tm.js <tm.json 路径>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('用法: node tools/import-tm.js <tm.json>'); process.exit(1); }

const INTERP = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
const tm = JSON.parse(fs.readFileSync(src, 'utf8'));

function stripLit(s) {
    let t = String(s).trim();
    if (t.length > 1) {
        const q = t[0];
        if ((q === '"' || q === "'" || q === '`') && t[t.length - 1] === q) t = t.slice(1, -1);
    }
    return t;
}

function plausible(key) {
    if (!key || typeof key !== 'string') return false;
    if (key.length < 2 || key.length > 400) return false;
    if (/[\u4e00-\u9fff]/.test(key)) return false;
    if (!/[A-Za-z]{2}/.test(key)) return false;
    if (key.includes('\\')) return false;

    const bare = key.replace(INTERP, '');

    // —— 只排除"明显是旧版代码片段"的键（它们正是旧包随版本失效的根源）——
    if (/=>/.test(bare)) return false;                          // 箭头函数
    if (/;\s*$/.test(bare)) return false;                       // 语句结尾
    if (/[A-Za-z_$][\w$]*\s*=\s*["'`]/.test(bare)) return false; // 赋值片段（k71="Set model to "）
    if (/^(?:var|let|const|return|function|if|else|case|switch)\b/.test(bare)) return false;
    if (/^(?:children|title|label|text|message|placeholder|description|detail|hint|content|value|name)\s*:/.test(bare)) return false; // 属性键前缀
    if (/^["'`][\s\S]*["'`]\s*,/.test(bare)) return false;      // 数组元素片段
    if (/[A-Za-z_$][\w$]*\s*\([^)]*\)\s*$/.test(bare) && !/\s/.test(bare.trim())) return false; // 单函数调用

    // 至少要像"一句话"，不能是光秃秃的标识符；
    // 但允许"单词型界面标签"（首字母大写、可带省略号/句号），如 Cancel / Available / Authenticating…
    if (!/\s/.test(bare.trim())) {
        const wordLabel = /^[A-Z][A-Za-z'’\-]{1,23}(?:…|\.{1,3})?$/.test(bare.trim());
        if (!wordLabel) return false;
    }
    return true;
}

const out = {};
let kept = 0, dropped = 0;
for (const [rawEn, rawZh] of Object.entries(tm)) {
    if (rawEn.startsWith('__')) { dropped++; continue; }
    const en = stripLit(rawEn);
    const zh = stripLit(rawZh);
    if (!plausible(en)) { dropped++; continue; }
    if (!/[\u4e00-\u9fff]/.test(zh)) { dropped++; continue; }
    if (out[en]) continue;
    out[en] = zh;
    kept++;
}

fs.writeFileSync(path.join(ROOT, 'data', 'i18n-tm.json'), JSON.stringify(out, null, 1), 'utf8');
console.log(`导入 ${kept} 条，丢弃 ${dropped} 条（含旧版代码片段键）`);
console.log('→ data/i18n-tm.json');
