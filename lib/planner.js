/**
 * 界面文案规划器（纯函数，不触碰文件系统）。
 *
 * 输入一段 JS 源码与词典，输出"哪些字面量出现位置是界面文案、应替换成什么"。
 * CLI 工具与 VS Code 扩展共用同一份实现，保证两边规则完全一致。
 *
 * 判定用的"界面锚点"：
 *   - UI 属性值        children:"…" / title:"…" / label:"…" / placeholder:"…" …
 *   - 宿主 API 实参    showInformationMessage("…") / showQuickPick(…) …
 *   - 三元或逻辑分支   return c ? "A" : "B"
 *   - 标签字典的值     {cwd:"Working folder", …}
 *   - 枚举标签映射     {open:"Open", accepted:"Accepted"}   ← 键小写、值首字母大写
 *   - 变量型标签       var A="Status" 且 A 之后作界面属性值
 *   - 已定译文案       词典里已人工复核过的句子，在所有"非比较/非键"位置一致替换
 *
 * 明确排除的位置（改了会坏事）：
 *   - 比较运算 / case 标签 / includes 参数
 *   - 对象键
 *   - 成员访问基址、计算成员 obj["x"]
 *   - Object.defineProperty 的导出名、in 判断、名字列表
 *   - 单 token 串（除非在界面位置或属白名单标签）
 */
const { normalize } = require('./norm');
const { isNamePosition } = require('./namepos');

const UI_PROPS = new Set([
    'children', 'title', 'label', 'placeholder', 'placeholderText', 'aria-label', 'ariaLabel',
    'alt', 'description', 'tooltip', 'message', 'text', 'prompt', 'detail', 'hint', 'heading',
    'subtitle', 'caption', 'body', 'emptyText', 'confirmLabel', 'cancelLabel', 'statusText',
    'helpText', 'errorText', 'summary', 'content', 'tooltipText', 'labelText', 'subtitleText',
    'descriptionText', 'valueText', 'messageText',
]);
const UI_APIS = new Set([
    'showInformationMessage', 'showErrorMessage', 'showWarningMessage', 'showQuickPick',
    'showInputBox', 'showOpenDialog', 'showSaveDialog', 'setStatusBarMessage',
]);
const CMP_OPS = new Set(['===', '!==', '==', '!=', '<=', '>=']);
const CMP_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'match', 'search', 'test']);

const CSSMOD = /^[a-zA-Z][A-Za-z0-9]*_[A-Za-z0-9_\-]{4,}$/;
const INTERP = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
const pureData = (b) => !/[A-Za-z]{2}/.test(b.replace(INTERP, ''));

function looksProse(t) {
    const s = String(t).trim();
    if (s.length < 2 || s.length > 500) return false;
    if (/[\u4e00-\u9fff]/.test(s)) return false;
    if (!/[A-Za-z]{2}/.test(s)) return false;
    if (s.includes('\\')) return false;
    if (CSSMOD.test(s)) return false;
    if (/^https?:/.test(s)) return false;
    if (/^[a-z0-9_.\-\/]+$/.test(s)) return false;
    if (pureData(s)) return false;
    return true;
}

/**
 * @param {Array} toks   词法 token 列表（已过滤注释）
 * @param {object} dict  精确词典 { english: chinese }
 * @param {object} normDict 归一化词典 { normKey: {zh} }
 * @param {object} labels 单词型界面标签白名单
 */
function planSource(toks, dict, normDict, labels, options) {
    const opts = options || {};
    // 宿主侧可以只允许"必经 vscode API 的实参"这类最窄的一类位置。
    // 这类字符串一定是在运行时传给人看的，不可能进入 zod 的代码生成。
    const allowKinds = opts.allowKinds || null;
    const at = (k) => (k >= 0 && k < toks.length ? toks[k] : null);
    const isP = (t, v) => t && t.type === 'punct' && t.value === v;
    const isI = (t, v) => t && t.type === 'ident' && (v === undefined || t.value === v);
    const has = Object.prototype.hasOwnProperty;
    const isLabel = (b) => has.call(labels || {}, b);

    /* ---------- 1. 不安全位置（逐处判定） ---------- */
    const isKey = (i) => {
        const prev = at(i - 1), next = at(i + 1);
        return isP(next, ':') && (isP(prev, '{') || isP(prev, ','));
    };
    const isUnsafe = (i) => {
        const prev = at(i - 1), next = at(i + 1), prev2 = at(i - 2);
        if (isP(next, '.') || isP(next, '?.')) return true;
        if (isP(prev, '.') || isP(prev, '?.')) return true;
        if (next && next.type === 'punct' && CMP_OPS.has(next.value)) return true;
        if (prev && prev.type === 'punct' && CMP_OPS.has(prev.value)) return true;
        if (isI(prev, 'case')) return true;
        if (isP(prev, '(') && isI(prev2) && CMP_METHODS.has(prev2.value)) return true;
        if (isKey(i)) return true;
        return false;
    };

    /* ---------- 2. 界面锚点 ---------- */
    const anchor = (i) => {
        let depth = 0;
        for (let k = i - 1, n = 0; k >= 0 && n < 120; k--, n++) {
            const t = toks[k];
            if (t.type === 'punct') {
                if (t.value === ';') return null;
                if (t.value === ')' || t.value === ']' || t.value === '}') depth++;
                else if (t.value === '(' || t.value === '[' || t.value === '{') depth--;
                if (t.value === ':' && depth <= 0) {
                    const name = at(k - 1);
                    if (isI(name) && UI_PROPS.has(name.value)) return { kind: 'prop' };
                }
            } else if (t.type === 'ident' && UI_APIS.has(t.value)) {
                if (isP(at(k + 1), '(')) return { kind: 'api' };
            }
        }
        return null;
    };

    /** 三元 / 逻辑分支：`return c ? "A" : "B"` 或 `x = c ? "A" : "B"` */
    const isBranch = (i) => {
        const prev = at(i - 1);
        if (!isP(prev, '?') && !isP(prev, ':')) return false;
        let depth = 0;
        for (let k = i - 1, n = 0; k >= 0 && n < 80; k--, n++) {
            const t = toks[k];
            if (t.type !== 'punct') continue;
            if (t.value === ')' || t.value === ']' || t.value === '}') depth++;
            else if (t.value === '(' || t.value === '[' || t.value === '{') { if (depth === 0) return true; depth--; }
            else if (depth === 0 && (t.value === '=' || t.value === ';' || t.value === ',')) return true;
        }
        return false;
    };

    /* ---------- 3. 全文比较值集合 ---------- */
    const cmpBodies = new Set();
    for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk.type !== 'string' && tk.type !== 'template') continue;
        const prev = at(i - 1), next = at(i + 1), prev2 = at(i - 2);
        let hit = false;
        if (next && next.type === 'punct' && CMP_OPS.has(next.value)) hit = true;
        if (prev && prev.type === 'punct' && CMP_OPS.has(prev.value)) hit = true;
        if (isI(prev, 'case')) hit = true;
        if (isP(prev, '(') && isI(prev2) && CMP_METHODS.has(prev2.value)) hit = true;
        if (hit) cmpBodies.add(tk.value);
    }

    /* ---------- 4. 标签字典 / 枚举映射 / 变量标签 ---------- */
    const labelMapValues = new Set();
    const enumLabelValues = new Set();
    for (let i = 0; i < toks.length; i++) {
        if (!isP(toks[i], '{')) continue;
        let depth = 0;
        const keys = [], vals = [], enumPairs = [];
        for (let j = i; j < toks.length; j++) {
            const t = toks[j];
            if (t.type === 'punct') {
                if (t.value === '{') depth++;
                else if (t.value === '}') { depth--; if (depth === 0) break; }
                continue;
            }
            if (depth !== 1) continue;
            const colon = at(j + 1), val = at(j + 2), after = at(j + 3);
            if (!isP(colon, ':') || !val || (val.type !== 'string' && val.type !== 'template')) continue;
            if (!isP(after, ',') && !isP(after, '}')) continue;
            if (t.type === 'string') keys.push(t.value);
            if (t.type === 'ident' || t.type === 'string') {
                const keyOk = t.type === 'ident' ? /^[a-z][a-z0-9_$]*$/.test(t.value) : /^[a-z][a-z0-9_]*$/.test(t.value);
                const v = val.value;
                if (keyOk && (/^[A-Z]/.test(v) || /\s/.test(v))) enumPairs.push(v);
            }
        }
        if (keys.filter((k) => /\s/.test(k.trim()) && /[A-Za-z]{3}/.test(k)).length >= 2) for (const v of vals) labelMapValues.add(v);
        if (enumPairs.length >= 2) for (const v of enumPairs) enumLabelValues.add(v);
    }

    const varUiIdentifiers = new Set();
    for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (!t || t.type !== 'ident' || !UI_PROPS.has(t.value)) continue;
        if (!isP(at(i + 1), ':')) continue;
        const v = at(i + 2);
        if (v && v.type === 'ident' && (isP(at(i + 3), ',') || isP(at(i + 3), '}') || isP(at(i + 3), ')'))) varUiIdentifiers.add(v.value);
    }

    const isVetted = (body) => {
        if (has.call(dict, body)) return true;
        const { key, exprs } = normalize(body);
        return exprs.length > 0 && has.call(normDict || {}, key);
    };
    const isVarUi = (i) => {
        const prev = at(i - 1), prev2 = at(i - 2);
        return isP(prev, '=') && prev2 && prev2.type === 'ident' && varUiIdentifiers.has(prev2.value);
    };

    /* ---------- 5. 主循环 ---------- */
    const items = new Map();
    const stats = { prop: 0, api: 0, branch: 0, labelmap: 0, enumlabel: 0, varui: 0, labelname: 0, vetted: 0, namePos: 0, schemadoc: 0 };
    const OK_SINGLE = new Set(['prop', 'api', 'enumlabel', 'varui', 'labelname', 'labelmap']);

    for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk.type !== 'string' && tk.type !== 'template') continue;
        if (!looksProse(tk.value)) continue;
        if (isUnsafe(i)) continue;
        if (isNamePosition(toks, i)) { stats.namePos++; continue; }
        // zod `.describe("…")` 是设置/插件清单的架构说明，属文档面，不是扩展界面
        if (isP(at(i - 1), '(') && isI(at(i - 2), 'describe')) { stats.schemadoc++; continue; }

        let kind = null;
        const a = anchor(i);
        if (a) kind = a.kind;
        else if (isBranch(i)) kind = 'branch';
        else if (labelMapValues.has(tk.value)) kind = 'labelmap';
        else if (enumLabelValues.has(tk.value)) kind = 'enumlabel';
        else if (isVarUi(i)) kind = 'varui';
        else if (isVetted(tk.value)) kind = 'vetted';
        if (!kind && isLabel(tk.value) && isP(at(i - 1), ':') && isI(at(i - 2), 'name')) kind = 'labelname';

        const single = !/\s/.test(tk.value.trim());
        if (kind && single && !OK_SINGLE.has(kind) && !isLabel(tk.value)) kind = null;
        if (kind && single && cmpBodies.has(tk.value) && !isLabel(tk.value)) kind = null;
        // 范围收紧（宿主安全模式）：只接受白名单内的锚点类型
        if (kind && allowKinds && !allowKinds.includes(kind)) kind = null;
        if (!kind) continue;

        stats[kind] = (stats[kind] || 0) + 1;
        if (!items.has(tk.value)) items.set(tk.value, { body: tk.value, occurrences: [], kinds: new Set() });
        const it = items.get(tk.value);
        it.occurrences.push({ i, kind });
        it.kinds.add(kind);
    }

    return {
        items: [...items.values()]
            .map((x) => ({ body: x.body, occurrences: x.occurrences, kinds: [...x.kinds] }))
            .sort((a, b) => (a.body > b.body ? 1 : -1)),
        stats,
    };
}

/** 取译文：先精确，再归一化回填 */
function translate(body, dict, normDict) {
    if (Object.prototype.hasOwnProperty.call(dict, body) && typeof dict[body] === 'string') return dict[body];
    if (normDict) {
        const { normalize: nz, fill } = require('./norm');
        const { key, exprs } = nz(body);
        if (exprs.length && Object.prototype.hasOwnProperty.call(normDict, key)) return fill(normDict[key].zh, exprs);
    }
    return null;
}

/** 计划 → 位置表 Map<tokenIndex, {en, zh}> */
function editsFromPlan(plan, dict, normDict) {
    const map = new Map();
    for (const it of plan.items) {
        const zh = translate(it.body, dict, normDict);
        if (!zh) continue;
        for (const o of it.occurrences) if (!map.has(o.i)) map.set(o.i, { en: it.body, zh });
    }
    return map;
}

module.exports = { planSource, translate, editsFromPlan, looksProse, UI_PROPS, UI_APIS, pureData };
