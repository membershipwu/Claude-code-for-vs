/**
 * Placeholder / interpolation integrity analyzer.
 *
 * Extracts ${...} spans with proper brace matching. For every identifier used in
 * a source span it decides whether the identifier carries display data (and must
 * therefore survive translation) or only selects between English wordings, such
 * as `${n} item${n===1?"":"s"}` or `${c?"is":"are"}`.
 *
 * Characters inside string literals never count as identifiers, and an
 * identifier that appears only before the span's top-level `?` is treated as a
 * selector (its value is not displayed, only used to pick a branch).
 */

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

function stripStrings(t) {
    return t.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');
}

/** index (relative to bare text) of the first top-level '?' or -1 */
function firstQuestion(bare) {
    let depth = 0;
    for (let i = 0; i < bare.length; i++) {
        const c = bare[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === '?' && depth === 0) return i;
    }
    return -1;
}

const ID_RE = /[A-Za-z_$][\w$]*/g;

/** identifiers that must survive (display data) */
function requiredIdentifiers(inner) {
    const bare = stripStrings(inner);
    const q = firstQuestion(bare);
    const req = new Set();
    let m;
    ID_RE.lastIndex = 0;
    while ((m = ID_RE.exec(bare)) !== null) {
        // `${...}` start marker can leak a '$'
        if (m[0] === '$' && m.index === 0) continue;
        if (q >= 0 && m.index < q) continue;   // selector position: value not displayed
        req.add(m[0]);
    }
    return req;
}

function dstIdentifiers(text) {
    const set = new Set();
    for (const s of spans(text)) {
        const bare = stripStrings(s.inner);
        let m;
        ID_RE.lastIndex = 0;
        while ((m = ID_RE.exec(bare)) !== null) {
            if (m[0] === '$' && m.index === 0) continue;
            set.add(m[0]);
        }
    }
    return set;
}

function analyze(original, translated) {
    const req = new Set();
    for (const s of spans(original)) for (const id of requiredIdentifiers(s.inner)) req.add(id);
    const dst = dstIdentifiers(translated);
    const missing = [...req].filter((id) => !dst.has(id));
    return { required: [...req], missing, ok: missing.length === 0 };
}

module.exports = { spans, analyze, requiredIdentifiers, dstIdentifiers };
