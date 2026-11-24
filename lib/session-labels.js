/** Inspect actual session-filter labels without depending on minified variable names. */
const { tokenize } = require('./lexer');

const SESSION_LABELS = { needs_input: 'Needs input', working: 'Working', completed: 'Completed' };

function inspectSessionLabels(source, dictionary) {
    const tokens = tokenize(source).filter((token) => token.type !== 'comment');
    const stack = [];
    const missing = new Set();
    let maps = 0;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'punct' && token.value === '{') stack.push(Object.create(null));
        else if (token.type === 'punct' && token.value === '}') {
            const labels = stack.pop();
            if (!labels || !Object.keys(SESSION_LABELS).every((key) => Object.hasOwn(labels, key))) continue;
            // Counts and protocol maps must not be mistaken for display labels.
            if (!Object.entries(SESSION_LABELS).every(([key, english]) =>
                labels[key] === english || labels[key] === dictionary[english])) continue;
            maps++;
            for (const [key, english] of Object.entries(SESSION_LABELS)) {
                if (labels[key] === english) missing.add(english);
            }
        } else if (stack.length && (token.type === 'ident' || token.type === 'string') &&
            Object.hasOwn(SESSION_LABELS, token.value) && tokens[i + 1]?.value === ':' &&
            tokens[i + 2]?.type === 'string' && ['{', ','].includes(tokens[i - 1]?.value)) {
            stack[stack.length - 1][token.value] = tokens[i + 2].value;
        }
    }
    return { maps, missing: [...missing] };
}

module.exports = { inspectSessionLabels };
