/**
 * 名称位置检测：字符串出现在这类位置时是"名字/键"，不是界面文案。
 * 一旦被翻译，模块导出名、属性名、事件名就会错位，导致运行时报错。
 *
 * 覆盖：
 *   Object.defineProperty(obj, "Name", ...)   ← ES 模块导出名重导出
 *   Object.getOwnPropertyDescriptor(obj, "x")
 *   obj["x"]                                  ← 计算成员访问
 *   obj?.["x"]
 *   "x" in obj                                ← 存在性判断
 *   delete obj["x"]
 *   ["A","B",...] 这类"名字列表"数组（兄弟元素多为单 token 标识符）
 */
const NAME_API = new Set(['defineProperty', 'getOwnPropertyDescriptor', 'hasOwnProperty', 'getOwnPropertyNames']);

function isNamePosition(toks, i) {
    const at = (k) => (k >= 0 && k < toks.length ? toks[k] : null);
    const isP = (t, v) => t && t.type === 'punct' && t.value === v;
    const isI = (t, v) => t && t.type === 'ident' && (v === undefined || t.value === v);

    const prev = at(i - 1), next = at(i + 1), prev2 = at(i - 2);

    // Object.defineProperty(obj, "Name", {...})  —— 第二个参数
    if (isP(prev, ',') && isI(prev2) && NAME_API.has(prev2.value) && isP(at(i - 3), '(')) return 'name-api';
    if (isP(prev, '(') && isI(prev2) && NAME_API.has(prev2.value)) return 'name-api';
    // 更宽松：往前 6 个 token 内出现 defineProperty( 且当前处于第 2 个实参
    for (let k = i - 1, n = 0; k >= 0 && n < 8; k--, n++) {
        const t = at(k);
        if (isP(t, '(') && isI(at(k - 1)) && NAME_API.has(at(k - 1).value)) {
            let commas = 0, depth = 0;
            for (let j = k + 1; j < i; j++) {
                const u = at(j);
                if (!u || u.type !== 'punct') continue;
                if (u.value === '(' || u.value === '[' || u.value === '{') depth++;
                else if (u.value === ')' || u.value === ']' || u.value === '}') depth--;
                else if (u.value === ',' && depth === 0) commas++;
            }
            if (commas === 1) return 'name-api';
        }
    }

    // obj["x"] / obj?.["x"]
    if (isP(prev, '[') && isP(next, ']')) {
        const before = at(i - 2);
        if (isI(before) || isP(before, ')') || isP(before, ']')) return 'computed-member';
    }

    // "x" in obj
    if (isI(next, 'in')) return 'in-operator';

    // 名字列表：["A","B","C",...] 里至少 2 个兄弟是单 token 标识符样式
    if (isP(prev, '[') || isP(prev, ',')) {
        const tokenish = (s) => /^[A-Za-z_$][\w$]*$/.test(s);
        let depth = 0, j = i - 1, l = -1, r = -1;
        for (; j >= 0; j--) {
            const t = at(j);
            if (!t || t.type !== 'punct') continue;
            if (t.value === ']') depth++;
            else if (t.value === '[') { if (depth === 0) { l = j; break; } depth--; }
        }
        if (l >= 0) {
            depth = 0;
            for (let k = l + 1; k < toks.length; k++) {
                const t = at(k);
                if (!t) break;
                if (t.type === 'punct') {
                    if (t.value === '[' || t.value === '(' || t.value === '{') depth++;
                    else if (t.value === ']' || t.value === ')' || t.value === '}') { if (depth === 0) { r = k; break; } depth--; }
                }
            }
        }
        if (l >= 0 && r > l) {
            let sibTotal = 0, sibTokenish = 0;
            for (let k = l + 1; k < r; k++) {
                const t = at(k);
                if (!t) continue;
                if (t.type === 'string' || t.type === 'template') {
                    sibTotal++;
                    if (tokenish(t.value)) sibTokenish++;
                }
            }
            if (sibTotal >= 2 && sibTokenish / sibTotal >= 0.6) return 'name-list';
        }
    }

    return null;
}

module.exports = { isNamePosition };
