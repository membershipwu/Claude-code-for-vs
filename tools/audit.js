/**
 * 覆盖率审计：针对"当前已安装的版本"，列出仍未被汉化的界面候选。
 *
 * 这是适配新版本时的主工具：扩展升级后跑一遍，把 NEW 段里的条目补进 data/i18n-*.json，
 * 再 node tools/build.js 重建词典即可。
 *
 * 用法:
 *   node tools/audit.js                 审计已安装版本（英文快照可由 .cache 提供）
 *   node tools/audit.js --json          输出机器可读结果
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
const oos = (outOfScope.categories || []).map((c) => ({ id: c.id, label: c.label, res: c.patterns.map((p) => new RegExp(p)) }));
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
const INTERP = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
const pureData = (b) => !/[A-Za-z]{2}/.test(b.replace(INTERP, ''));

const CLAUDE = ['claude', 'mcp', 'permission', 'subagent', 'artifact', 'sandbox', 'usage credit',
    'remote control', 'slash command', 'plan mode', 'worktree', 'session', 'conversation',
    'anthropic', 'gateway', 'marketplace', 'plugin', 'hook', 'skill', 'compact', 'rewind',
    'sign in', 'login', 'claude.ai', 'prompt', 'model', 'diff'];

const report = { version: info.version, generatedAt: new Date().toISOString(), targets: {} };

for (const [kind, key] of [['webview', 'webview'], ['host', 'host']]) {
    const src = files[key];
    if (!src) continue;
    const toks = tokenize(src).filter((t) => t.type !== 'comment');
    const plan = planSource(toks, dict, normDict, labels);

    let translated = 0, skipped = 0, outofscope = 0, pure = 0;
    const hot = [];
    const other = [];
    const catCount = {};

    for (const it of plan.items) {
        const zh = translate(it.body, dict, normDict);
        if (zh) { translated++; continue; }
        if (CJK.test(it.body)) continue;
        if (pureData(it.body)) { pure++; continue; }
        if (skipRes.some((re) => re.test(it.body))) { skipped++; continue; }
        const cat = oos.find((c) => c.res.some((re) => re.test(it.body)));
        if (cat) { outofscope++; catCount[cat.id] = (catCount[cat.id] || 0) + 1; continue; }
        if (CLAUDE.some((k) => it.body.toLowerCase().includes(k))) hot.push(it.body);
        else other.push(it.body);
    }

    report.targets[kind] = {
        candidates: plan.items.length,
        translated,
        skipped,
        outOfScope: outofscope,
        outOfScopeByCategory: catCount,
        pureData: pure,
        untranslatedClaude: hot.sort(),
        untranslatedOther: other.length,
    };
}

if (asJson) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(`Claude Code ${report.version} 覆盖率审计\n`);
    for (const [kind, r] of Object.entries(report.targets)) {
        const pct = r.candidates ? ((r.translated / r.candidates) * 100).toFixed(1) : '0.0';
        console.log(`【${kind}】候选 ${r.candidates} · 已汉化 ${r.translated} (${pct}%) · 登记跳过 ${r.skipped} · 范围外 ${r.outOfScope} · 纯数据 ${r.pureData}`);
        if (r.untranslatedClaude.length) {
            console.log(`   ⚠ 仍属 Claude 界面但未翻译（${r.untranslatedClaude.length} 条）：`);
            for (const s of r.untranslatedClaude.slice(0, 40)) console.log('     ' + JSON.stringify(s).slice(0, 130));
        } else {
            console.log('   ✓ 无遗留 Claude 界面文案');
        }
        if (r.untranslatedOther) console.log(`   · 其他未分类英文候选 ${r.untranslatedOther} 条（多为内嵌编辑器/第三方组件）`);
        console.log('');
    }
}
process.exitCode = Object.values(report.targets).every((r) => r.untranslatedClaude.length === 0) ? 0 : 1;
