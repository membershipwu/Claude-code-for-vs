/**
 * 结构性缺口报告：列出"已被判定为界面文案、但还没有译文"的条目。
 *
 * 与 tools/audit.js 的区别：audit 用"是否含 Claude 领域词"来判重要性，
 * 本工具**不看关键词**，只看结构证据——凡是落在
 *   prop / api / enumlabel / varui / labelname / branch / labelmap
 * 这些界面锚点上的未译条目，就是真正的漏译候选。
 *
 * 这比关键词可靠：用户报过的 "Ungrouped" 就不含任何领域词。
 *
 * 用法:
 *   node tools/gap.js               按 kind 汇总 + 打印清单
 *   node tools/gap.js --kind prop   只看某一类
 *   node tools/gap.js --json        机器可读
 *   node tools/gap.js --write       把缺口写成 data/i18n-gap-<version>.json 模板（译文留空）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { tokenize } = require('../lib/lexer');
const { planSource, translate } = require('../lib/planner');
const { Engine } = require('../lib/engine');

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const asJson = process.argv.includes('--json');
const doWrite = process.argv.includes('--write');
const onlyKind = arg('--kind', null);

const engine = new Engine({
    extensionsRoot: arg('--extensions-root', path.join(os.homedir(), '.vscode', 'extensions')),
    storageDir: arg('--storage', path.join(ROOT, '.cache')),
    dataDir: path.join(ROOT, 'data'),
});

const info = engine.installed();
if (!info) { console.error('未找到已安装的 Claude Code 扩展。'); process.exit(2); }

const { files } = engine.englishFiles(info);
const { dict, normDict, labels, skip, outOfScope } = engine.bundle;

const skipRes = (skip.patterns || []).map((p) => new RegExp(p.re));
const oos = (outOfScope.categories || []).map((c) => ({ id: c.id, res: c.patterns.map((p) => new RegExp(p)) }));
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
const INTERP = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
const pureData = (b) => !/[A-Za-z]{2}/.test(b.replace(INTERP, ''));

// 只有这些 kind 才是"结构上确定的界面文案"
const STRONG_KINDS = new Set(['prop', 'api', 'enumlabel', 'varui', 'labelname', 'branch', 'labelmap']);

const report = { version: info.version, generatedAt: new Date().toISOString(), targets: {} };
const template = {};

for (const kind of ['webview', 'host']) {
    const src = files[kind];
    if (!src) continue;
    const toks = tokenize(src).filter((t) => t.type !== 'comment');
    const plan = planSource(toks, dict, normDict, labels);

    const gaps = [];
    const skipped = { registered: 0, outOfScope: 0, pureData: 0 };
    for (const it of plan.items) {
        const kinds = it.kinds.filter((k) => STRONG_KINDS.has(k));
        if (!kinds.length) continue;                       // 结构证据不足 → 不是漏译候选
        if (translate(it.body, dict, normDict)) continue;   // 已译
        if (CJK.test(it.body)) continue;
        if (pureData(it.body)) { skipped.pureData++; continue; }
        if (skipRes.some((re) => re.test(it.body))) { skipped.registered++; continue; }
        if (oos.some((c) => c.res.some((re) => re.test(it.body)))) { skipped.outOfScope++; continue; }
        if (onlyKind && !kinds.includes(onlyKind)) continue;
        gaps.push({ body: it.body, kinds, occurrences: it.occurrences.length });
    }
    gaps.sort((a, b) => b.occurrences - a.occurrences || (a.body > b.body ? 1 : -1));
    report.targets[kind] = { gapCount: gaps.length, skipped, gaps };
    for (const g of gaps) template[g.body] = '';
}

if (asJson) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(`Claude Code ${report.version} · 结构性漏译候选\n`);
    for (const [kind, r] of Object.entries(report.targets)) {
        console.log(`【${kind}】${r.gapCount} 条  (已登记跳过 ${r.skipped.registered} · 范围外 ${r.skipped.outOfScope} · 纯数据 ${r.skipped.pureData})`);
        for (const g of r.gaps.slice(0, 60)) {
            console.log(`   [${g.kinds.join(',')}] ×${g.occurrences}  ${JSON.stringify(g.body).slice(0, 120)}`);
        }
        if (r.gapCount > 60) console.log(`   … 其余 ${r.gapCount - 60} 条见 --json`);
        console.log('');
    }
}

if (doWrite) {
    const out = path.join(ROOT, 'data', `i18n-gap-${info.version}.json`);
    fs.writeFileSync(out, JSON.stringify(template, null, 2), 'utf8');
    console.log(`已写出模板（译文留空，填好后加入 tools/build.js 的 SOURCES）: ${path.relative(ROOT, out)}`);
}

const total = Object.values(report.targets).reduce((s, r) => s + r.gapCount, 0);
process.exitCode = total === 0 ? 0 : 1;
