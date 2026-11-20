/**
 * 把 gap.js 的结果二次过滤：剔除明显的内嵌 Monaco / KaTeX / 第三方特征，
 * 只留下"可能是 Claude 自己的界面文案"，便于人工裁决。
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const raw = (() => {
    try {
        return execFileSync(process.execPath, [path.join(__dirname, 'gap.js'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
        // gap.js 在"存在缺口"时以退出码 1 结束，但 stdout 仍是完整 JSON
        if (e && e.stdout) return e.stdout;
        throw e;
    }
})();
const r = JSON.parse(raw);

const all = [];
for (const [kind, t] of Object.entries(r.targets)) for (const g of t.gaps) all.push({ ...g, target: kind });

const MONO = /editor|indent|cursor|selection|bracket|hover|fold|scroll|wrap|whitespace|token|syntax|theme|minimap|gutter|breadcrumb|suggest|peek|sticky|notebook|diff|Transform to|Reindent|Transpose|Trim |Quick Fix|Auto Fix|Fix All|Organize Imports|Go To|Page (Up|Down)|Change (All|Tab)|Detect Indentation|Developer:|Maps to |Reveal|Sort |Split|Join |Format |Toggle |Editor Font|Ctrl\+|Alt\+|mailto:|noopener|Size[0-9]|Infinite loop|KaTeX|LaTeX|macro|math|schema|definitions|JSON|zod|base64|^data:|px$|deg|https?:|font|color|Char|Escape|Insert |Paste|Copy|Cut|Undo|Redo|Duplicate|Revert|Comment|Selection|Anchor|Symbol|Marker|Problem|Diagnostic|#\/|Snippet|Convert Indentation|Editor Font Size|alwaysShowFoldIcons|noopener|Integers must|Size[0-9]|\\\$\\(unfold\\)|data:\\\$\\\{|Error generating stack|style=|viewBox|\^M[0-9]|KB of text|to have|mailto:|of 2$|\^\\\$\\\{E0\\\}|scope\)$|base64/i;

const rest = all.filter((g) => !MONO.test(g.body));
console.log(`总缺口 ${all.length}，剔除内嵌编辑器/排版库特征后剩余 ${rest.length}\n`);
for (const g of rest.sort((a, b) => b.occurrences - a.occurrences)) {
    console.log(`[${g.target}/${g.kinds.join(',')}] ×${g.occurrences}  ${JSON.stringify(g.body).slice(0, 150)}`);
}
fs.writeFileSync(path.join(ROOT, '.cache', 'gap-filtered.json'), JSON.stringify(rest, null, 2), 'utf8');
