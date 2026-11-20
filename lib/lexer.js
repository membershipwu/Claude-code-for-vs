/**
 * Minimal, correct JavaScript lexer for minified bundles.
 * Produces tokens: { type, start, end, value, quote }
 * types: 'string' | 'template' | 'number' | 'ident' | 'punct' | 'regex' | 'comment'
 *
 * Handles: escapes, template literals with ${...} nesting, regex-vs-divide
 * disambiguation via previous significant token, comments, unicode idents.
 */

const PUNCT = [
    '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
    '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
    '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
    '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%',
    '&', '|', '^', '!', '~', '?', ':', '=', '.', '@', '#',
];

// token types that may precede a regex literal
const REGEX_ALLOWED_AFTER_PUNCT = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '=>', '==', '===',
    '!=', '!==', '<=', '>=', '&&', '||', '??', '+=', '-=', '*=', '/=', '%=',
    '&=', '|=', '^=', '**', '<<', '>>', '>>>', '<<=', '>>=', '>>>=', '...',
    '++', '--', '~', '+', '-', '*', '%', '<', '>',
]);
const REGEX_ALLOWED_AFTER_WORD = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'do', 'else', 'case', 'yield', 'await', 'throw',
]);

function isIdentStart(c) {
    return /[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 127;
}
function isIdentPart(c) {
    return /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) > 127;
}

function tokenize(src) {
    const tokens = [];
    let i = 0;
    const n = src.length;
    let lastSignificant = null;

    // recursively scan a template literal starting at a backtick; returns index after closing backtick
    function scanTemplate(startIdx) {
        let j = startIdx + 1;
        while (j < n) {
            const ch = src[j];
            if (ch === '\\') { j += 2; continue; }
            if (ch === '`') return j + 1;
            if (ch === '$' && src[j + 1] === '{') { j = scanExpr(j + 2); continue; }
            j++;
        }
        return j;
    }
    // scan a ${ ... } expression body; returns index after the matching }
    function scanExpr(j) {
        let depth = 1;
        while (j < n) {
            const ch = src[j];
            if (ch === '\\') { j += 2; continue; }
            if (ch === '`') { j = scanTemplate(j); continue; }
            if (ch === '"' || ch === "'") {
                const q = ch; j++;
                while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
                continue;
            }
            if (ch === '/') {
                if (src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
                if (src[j + 1] === '*') { j += 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j += 2; continue; }
                // regex literal if previous significant char allows one
                let k = j - 1;
                while (k >= 0 && /\s/.test(src[k])) k--;
                const pc = k >= 0 ? src[k] : '';
                const allows = k < 0 || '(,=:[!&|?{};+-*%<>^~'.includes(pc) ||
                    /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await|throw)$/.test(src.slice(Math.max(0, k - 12), k + 1));
                if (allows) {
                    j++;
                    let inClass = false;
                    while (j < n) {
                        const r = src[j];
                        if (r === '\\') { j += 2; continue; }
                        if (r === '[') inClass = true;
                        else if (r === ']') inClass = false;
                        else if (r === '/' && !inClass) { j++; break; }
                        else if (r === '\n') break;
                        j++;
                    }
                    while (j < n && /[a-z]/i.test(src[j])) j++;
                    continue;
                }
            }
            if (ch === '{') { depth++; j++; continue; }
            if (ch === '}') { depth--; j++; if (depth === 0) return j; continue; }
            j++;
        }
        return j;
    }

    function prevAllowsRegex() {
        if (!lastSignificant) return true;
        if (lastSignificant.type === 'punct') return REGEX_ALLOWED_AFTER_PUNCT.has(lastSignificant.value);
        if (lastSignificant.type === 'ident') return REGEX_ALLOWED_AFTER_WORD.has(lastSignificant.value);
        return false;
    }

    while (i < n) {
        const c = src[i];
        // whitespace
        if (c === '\n' || c === '\r' || c === ' ' || c === '\t' || c === '\f' || c === '\v') { i++; continue; }

        // comments
        if (c === '/' && src[i + 1] === '/') {
            const s = i;
            i += 2;
            while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
            tokens.push({ type: 'comment', start: s, end: i, value: src.slice(s, i) });
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const s = i;
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i = Math.min(n, i + 2);
            tokens.push({ type: 'comment', start: s, end: i, value: src.slice(s, i) });
            continue;
        }

        // string literal
        if (c === '"' || c === "'") {
            const s = i;
            const q = c;
            i++;
            while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === q) { i++; break; }
                if (src[i] === '\n') break; // unterminated; stop at newline
                i++;
            }
            const tok = { type: 'string', start: s, end: i, quote: q, value: src.slice(s + 1, i - 1), raw: src.slice(s, i) };
            tokens.push(tok); lastSignificant = tok;
            continue;
        }

        // template literal (whole, including ${} parts; nested templates handled)
        if (c === '`') {
            const s = i;
            i = scanTemplate(i);
            const tok = { type: 'template', start: s, end: i, quote: '`', value: src.slice(s + 1, i - 1), raw: src.slice(s, i) };
            tokens.push(tok); lastSignificant = tok;
            continue;
        }

        // regex literal
        if (c === '/' && prevAllowsRegex()) {
            const s = i;
            i++;
            let inClass = false;
            while (i < n) {
                const ch = src[i];
                if (ch === '\\') { i += 2; continue; }
                if (ch === '[') inClass = true;
                else if (ch === ']') inClass = false;
                else if (ch === '/' && !inClass) { i++; break; }
                else if (ch === '\n') break;
                i++;
            }
            while (i < n && /[a-z]/i.test(src[i])) i++;
            const tok = { type: 'regex', start: s, end: i, value: src.slice(s, i) };
            tokens.push(tok); lastSignificant = tok;
            continue;
        }

        // number
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            const s = i;
            while (i < n && /[0-9a-fA-FxXoObBn._eE+\-]/.test(src[i])) {
                if ((src[i] === '+' || src[i] === '-') && !/[eE]/.test(src[i - 1])) break;
                i++;
            }
            const tok = { type: 'number', start: s, end: i, value: src.slice(s, i) };
            tokens.push(tok); lastSignificant = tok;
            continue;
        }

        // identifier / keyword
        if (isIdentStart(c)) {
            const s = i;
            i++;
            while (i < n && isIdentPart(src[i])) i++;
            const tok = { type: 'ident', start: s, end: i, value: src.slice(s, i) };
            tokens.push(tok); lastSignificant = tok;
            continue;
        }

        // punctuator
        let matched = null;
        for (const p of PUNCT) {
            if (src.startsWith(p, i)) { matched = p; break; }
        }
        if (matched) {
            const tok = { type: 'punct', start: i, end: i + matched.length, value: matched };
            tokens.push(tok); lastSignificant = tok;
            i += matched.length;
            continue;
        }

        // unknown char
        i++;
    }
    return tokens;
}

module.exports = { tokenize };
