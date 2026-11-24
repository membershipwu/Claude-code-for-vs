/** Repository, translation-build, regression, and package-manifest checks. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
function run(file) {
    execFileSync(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, stdio: 'inherit' });
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'claude-code-zhcn', 'unexpected VS Code extension identifier');
assert.ok(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(manifest.publisher), 'invalid VS Code extension publisher');
assert.ok(fs.existsSync(path.join(ROOT, manifest.main)), 'VS Code extension entry point is missing');
assert.ok(manifest.engines && manifest.engines.vscode, 'minimum VS Code version is missing');
const ids = manifest.contributes.commands.map((command) => command.command);
assert.equal(new Set(ids).size, ids.length, 'duplicate contributed command identifiers');
for (const required of ['lib/engine.js', 'data/merged-dict.json', 'data/dict-norm.json', 'LICENSE', 'README.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, required)), 'required distribution file missing: ' + required);
}

const dataDir = path.join(ROOT, 'data');
for (const entry of fs.readdirSync(dataDir).filter((name) => name.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, entry), 'utf8'));
    assert.ok(data && typeof data === 'object', 'invalid JSON data: ' + entry);
}
const dictionary = JSON.parse(fs.readFileSync(path.join(dataDir, 'merged-dict.json'), 'utf8'));
for (const [source, translation] of Object.entries(dictionary)) {
    assert.ok(typeof translation === 'string' && translation.length > 0, 'empty dictionary value: ' + source);
    assert.notEqual(source, translation, 'untranslated source entry: ' + source);
}
assert.equal(dictionary.Completed, '已完成', 'session status filter translation is missing');

const generatedBefore = ['merged-dict.json', 'dict-norm.json'].map((name) =>
    digest(fs.readFileSync(path.join(dataDir, name))));
console.log('PASS  VS Code manifest, package files, and translation catalog are valid');
run('tools/test.js');
run('tools/extension-smoke.js');
run('tools/build.js');
const generatedAfter = ['merged-dict.json', 'dict-norm.json'].map((name) =>
    digest(fs.readFileSync(path.join(dataDir, name))));
assert.deepEqual(generatedAfter, generatedBefore, 'generated translation dictionaries are out of date');
console.log('PASS  translation dictionary is current and reproducible');

