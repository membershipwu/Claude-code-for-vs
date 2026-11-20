/**
 * 维护者工具：把 data/i18n-*.json 合并成运行时需要的
 *   data/merged-dict.json（精确词条）
 *   data/dict-norm.json （归一化词条，抗压缩变量名变动）
 *
 * 用法: node tools/build.js
 */
const fs = require('fs');
const path = require('path');
const { normalize } = require('../lib/norm');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const SOURCES = [
    'i18n-webview.json', 'i18n-webview-r3.json', 'i18n-webview-r4.json', 'i18n-webview-r5.json',
    'i18n-webview-r6.json', 'i18n-host.json', 'i18n-host-r2.json', 'i18n-host-r3.json',
    'i18n-host-r4.json', 'i18n-extra.json', 'i18n-delta-2.1.329.json', 'i18n-labels.json',
    'i18n-delta-labels.json', 'i18n-tm.json', 'i18n-gap-2.1.329.json', 'i18n-gap-2.1.329-b.json', 'i18n-gap-2.1.329-c.json',
];
// i18n-package.json / i18n-skip.json / i18n-outofscope.json / i18n-reviewed.json 不参与精确词典合并

function loadJson(f) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return null; }
}

const merged = new Map();
for (const f of SOURCES) {
    const j = loadJson(f);
    if (!j) { console.warn('  跳过（不存在或非 JSON）:', f); continue; }
    let n = 0;
    for (const [en, zh] of Object.entries(j)) {
        if (en.startsWith('_')) continue;
        if (typeof zh !== 'string') continue;
        if (en === zh) continue;                    // 空条目
        if (/[\u4e00-\u9fff]/.test(en)) continue;    // 源串已是中文
        merged.set(en, zh);
        n++;
    }
    console.log(`  ${f}: ${n} 条`);
}

const dict = {};
for (const [k, v] of merged) dict[k] = v;
fs.writeFileSync(path.join(DATA, 'merged-dict.json'), JSON.stringify(dict), 'utf8');

const norm = {};
let conflicts = 0;
for (const [en, zh] of Object.entries(dict)) {
    const a = normalize(en);
    const b = normalize(zh);
    if (a.exprs.length === 0 || a.exprs.length !== b.exprs.length) continue;
    if (norm[a.key] && norm[a.key].zh !== b.key) { conflicts++; continue; }
    norm[a.key] = { zh: b.key, from: en };
}
fs.writeFileSync(path.join(DATA, 'dict-norm.json'), JSON.stringify(norm), 'utf8');

console.log(`\nmerged-dict.json : ${Object.keys(dict).length} 条`);
console.log(`dict-norm.json   : ${Object.keys(norm).length} 条（冲突跳过 ${conflicts}）`);
