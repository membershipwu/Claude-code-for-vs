/**
 * 归一化匹配：把字面量里的每个 ${...} 替换成占位符，得到"与压缩变量名无关"的键。
 *
 * 升级后 Claude Code 的 bundle 压缩变量名会整体改名（Cp→Ep、Ke→Je、wa→Sa …），
 * 若词典按原始文本匹配，数百条译文会在一夜之间全部失配。归一化后：
 *   `${Ke} may already be at the latest version…`  与
 *   `${Je} may already be at the latest version…`
 * 落到同一个键上，译文直接复用。
 *
 * 仅当源串与译文中的 ${...} 数量一致时才建立归一化条目，保证占位符可以按序回填。
 */
const SENT = '\u0000';

/** 扫描 `${...}`（含嵌套），返回 [{start,end,inner}] */
function spans(body) {
    const out = [];
    for (let i = 0; i < body.length; i++) {
        if (body[i] === '\\') { i++; continue; }
        if (body[i] === '$' && body[i + 1] === '{') {
            let depth = 1, j = i + 2, inStr = null;
            for (; j < body.length; j++) {
                const c = body[j];
                if (c === '\\') { j++; continue; }
                if (inStr) { if (c === inStr) inStr = null; continue; }
                if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
                if (c === '{') depth++;
                else if (c === '}') { depth--; if (depth === 0) break; }
            }
            out.push({ start: i, end: j + 1, inner: body.slice(i + 2, j) });
            i = j;
        }
    }
    return out;
}

/** 归一化：返回 { key, exprs } */
function normalize(body) {
    const sp = spans(body);
    if (!sp.length) return { key: body, exprs: [] };
    let key = '';
    let last = 0;
    const exprs = [];
    for (const s of sp) {
        key += body.slice(last, s.start) + SENT;
        exprs.push(body.slice(s.start, s.end));
        last = s.end;
    }
    key += body.slice(last);
    return { key, exprs };
}

/** 把归一化译文回填为真实文本；exprs 为源串中的 ${...} 列表 */
function fill(zhTemplate, exprs) {
    let i = 0;
    return zhTemplate.replace(/\u0000/g, () => (i < exprs.length ? exprs[i++] : ''));
}

module.exports = { normalize, fill, spans, SENT };
