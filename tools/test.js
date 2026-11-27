/** Dependency-free safety and regression tests. Run with node tools/test.js. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { Engine, readSnapshot, snapshotDir, atomicWriteFiles, patchSource } = require('../lib/engine');
const { tokenize } = require('../lib/lexer');
const { planSource, editsFromPlan } = require('../lib/planner');
const { inspectSessionLabels } = require('../lib/session-labels');

function makeFixture(t) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-zhcn-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const extensionDir = path.join(temp, 'extensions', 'anthropic.claude-code-2.1.329-win32-x64');
    const walkthroughDir = path.join(extensionDir, 'resources', 'walkthrough');
    fs.mkdirSync(walkthroughDir, { recursive: true });
    const files = {
        webview: path.join(extensionDir, 'webview', 'index.js'),
        host: path.join(extensionDir, 'extension.js'),
        pkg: path.join(extensionDir, 'package.json'),
        walkthrough: path.join(walkthroughDir, 'step1.md'),
    };
    fs.mkdirSync(path.dirname(files.webview), { recursive: true });
    const original = {
        webview: 'const status={open:"Open",closed:"Closed",working:"Working",finished:"Finished"};const view={title:"Cancel"};',
        host: 'function notify(){return vscode.window.showInformationMessage("Cancel");}',
        pkg: JSON.stringify({
            displayName: 'Claude Code for VS Code',
            description: 'Claude Code for VS Code: Harness the power of Claude Code without leaving your IDE',
            contributes: { commands: [{ command: 'claude-vscode.newConversation', title: 'Claude Code: New Conversation' }] },
        }, null, 2) + '\n',
        walkthrough: 'Welcome to Claude Code',
    };
    fs.writeFileSync(files.webview, original.webview);
    fs.writeFileSync(files.host, original.host);
    fs.writeFileSync(files.pkg, original.pkg);
    fs.writeFileSync(files.walkthrough, original.walkthrough);
    const storageDir = path.join(temp, 'storage');
    const engine = new Engine({ extensionsRoot: path.dirname(extensionDir), storageDir, dataDir: path.join(ROOT, 'data') });
    return { temp, files, original, storageDir, engine, extensionDir };
}

test('reported session-status labels are safely translated at UI call sites', () => {
    const engine = new Engine({ extensionsRoot: '', storageDir: '', dataDir: path.join(ROOT, 'data') });
    const source = 'const statusCounts={byStatus:{needs_input:0,working:0,completed:0}};const labels={needs_input:"Needs input",working:"Working",completed:"Completed"};const statuses={open:"Open",closed:"Closed"};';
    const tokens = tokenize(source).filter((token) => token.type !== 'comment');
    const plan = planSource(tokens, engine.bundle.dict, engine.bundle.normDict, engine.bundle.labels);
    const edits = editsFromPlan(plan, engine.bundle.dict, engine.bundle.normDict);
    let result = source;
    for (const [index, edit] of [...edits].sort((a, b) => tokens[b[0]].start - tokens[a[0]].start)) {
        const token = tokens[index];
        result = result.slice(0, token.start + 1) + edit.zh + result.slice(token.end - 1);
    }
    assert.match(result, /needs_input:"需要输入",working:"正在工作",completed:"已完成"/);
    assert.match(result, /open:"打开",closed:"已关闭"/);
    assert.equal(result.includes('"Open"'), false);
});

test('syntax validation accepts import.meta while preserving it and still rejects invalid JavaScript', () => {
    const engine = new Engine({ extensionsRoot: '', storageDir: '', dataDir: path.join(ROOT, 'data') });
    const source = 'const asset=new URL("monaco.js",import.meta.url);const button={title:"Cancel"};';
    const patched = patchSource(source, engine.bundle, 'webview');
    assert.match(patched.text, /import\.meta\.url/);
    assert.match(patched.text, /title:"取消"/);
    assert.throws(() => patchSource('const = ;', engine.bundle, 'webview'), /语法校验失败/);
});

test('apply and restore preserve the complete original install byte for byte', (t) => {
    const fixture = makeFixture(t);
    const applied = fixture.engine.apply();
    assert.ok(applied.webview.changed > 0);
    assert.ok(applied.host.changed > 0);
    assert.ok(JSON.parse(fs.readFileSync(fixture.files.pkg, 'utf8')).contributes.commands[0].title.includes('新建对话'));
    assert.notEqual(fs.readFileSync(fixture.files.walkthrough, 'utf8'), fixture.original.walkthrough);
    assert.doesNotThrow(() => readSnapshot(fixture.storageDir, '2.1.329'));
    fixture.engine.restore();
    for (const key of Object.keys(fixture.original)) {
        const file = key === 'walkthrough' ? fixture.files.walkthrough : fixture.files[key];
        assert.equal(fs.readFileSync(file, 'utf8'), fixture.original[key], 'restore did not reproduce ' + key);
    }
});

test('an older localized installation with an English Completed label needs reapplication', (t) => {
    const fixture = makeFixture(t);
    fixture.engine.apply();
    const source = '/* ' + '汉'.repeat(5100) + ' */' +
        'const changedName={completed:"Completed",working:"正在工作",needs_input:"需要输入"};';
    fs.writeFileSync(fixture.files.webview, source);
    const status = fixture.engine.status();
    assert.equal(status.patched, false, 'a partially localized installation must not show a completed checkmark');
    assert.equal(status.needsUpdate, true);
    assert.deepEqual(status.sessionLabels.missing, ['Completed']);
});

test('session-label inspection handles mixed languages and quoted keys, ignoring protocol data', () => {
    const dict = { 'Needs input': '需要输入', Working: '正在工作', Completed: '已完成' };
    const source = 'const counts={completed:0,working:0,needs_input:0};' +
        'const protocol={completed:"completed",working:"working",needs_input:"needs_input"};' +
        'const renamed={"working":"正在工作","completed":"已完成","needs_input":"需要输入"};';
    assert.deepEqual(inspectSessionLabels(source, dict), { maps: 1, missing: [] });
});

test('a modified or truncated English backup never overwrites the installed extension', (t) => {
    const fixture = makeFixture(t);
    fixture.engine.apply();
    const before = Object.fromEntries(Object.entries(fixture.files).map(([key, file]) => [key, fs.readFileSync(file)]));
    fs.writeFileSync(path.join(snapshotDir(fixture.storageDir, '2.1.329'), 'host'), 'corrupted baseline');
    assert.throws(() => fixture.engine.apply(), /校验失败/);
    assert.throws(() => fixture.engine.restore(), /校验失败/);
    for (const [key, file] of Object.entries(fixture.files)) {
        assert.deepEqual(fs.readFileSync(file), before[key], 'corrupt backup modified ' + key);
    }
});

test('rejects a snapshot manifest that points outside its versioned directory', (t) => {
    const fixture = makeFixture(t);
    fixture.engine.apply();
    const manifestFile = path.join(snapshotDir(fixture.storageDir, '2.1.329'), 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.files.host = '../outside';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.throws(() => readSnapshot(fixture.storageDir, '2.1.329'), /无效文件项/);
});

test('does not delete the only English baseline while the installation is localized', (t) => {
    const fixture = makeFixture(t);
    fixture.engine.apply();
    assert.throws(() => fixture.engine.dropSnapshot('2.1.329'), /当前 Claude Code 文件与英文快照不同/);
    assert.ok(readSnapshot(fixture.storageDir, '2.1.329'));
    fixture.engine.restore();
    fixture.engine.dropSnapshot('2.1.329');
    assert.equal(readSnapshot(fixture.storageDir, '2.1.329'), null);
});

test('rolls all changed files back if a later atomic rename fails', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-zhcn-rollback-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const first = path.join(dir, 'first');
    const second = path.join(dir, 'second');
    fs.writeFileSync(first, 'original first');
    fs.writeFileSync(second, 'original second');
    const rename = fs.renameSync;
    let calls = 0;
    fs.renameSync = function (...args) {
        calls++;
        if (calls === 2) throw new Error('simulated filesystem error');
        return rename.apply(this, args);
    };
    try {
        assert.throws(() => atomicWriteFiles([{ file: first, text: 'new first' }, { file: second, text: 'new second' }]), /已回退本次写入/);
    } finally {
        fs.renameSync = rename;
    }
    assert.equal(fs.readFileSync(first, 'utf8'), 'original first');
    assert.equal(fs.readFileSync(second, 'utf8'), 'original second');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['first', 'second']);
});

test('manifest-localization strings never get translated into a dynamic schema or protocol value', () => {
    const engine = new Engine({ extensionsRoot: '', storageDir: '', dataDir: path.join(ROOT, 'data') });
    const source = 'const schema=z.object({message:z.string().describe("Working")});const protocol="Waiting for your permission";function tell(){return vscode.window.showInformationMessage("Cancel")}';
    const tokens = tokenize(source).filter((token) => token.type !== 'comment');
    const scope = engine.bundle.scope.host;
    const plan = planSource(tokens, engine.bundle.dict, engine.bundle.normDict, engine.bundle.labels, { allowKinds: scope.allowKinds });
    const edits = editsFromPlan(plan, engine.bundle.dict, engine.bundle.normDict);
    const selected = [...edits.values()].map((edit) => edit.en);
    assert.deepEqual(selected, ['Cancel']);
});

test('API-only host scope does not mistake unrelated neighboring calls for UI text', () => {
    const engine = new Engine({ extensionsRoot: '', storageDir: '', dataDir: path.join(ROOT, 'data') });
    const source = 'const id=(callback("Cancel"),vscode.commands.registerCommand("Cancel",()=>{}));function show(){return vscode.window.showInformationMessage("Cancel")}';
    const tokens = tokenize(source).filter((token) => token.type !== 'comment');
    const plan = planSource(tokens, engine.bundle.dict, engine.bundle.normDict, engine.bundle.labels, { allowKinds: ['api'] });
    const translated = editsFromPlan(plan, engine.bundle.dict, engine.bundle.normDict);
    const selected = [...translated].map(([index, edit]) => ({ value: edit.en, start: tokens[index].start }));
    assert.equal(selected.length, 1);
    assert.equal(selected[0].value, 'Cancel');
    assert.ok(selected[0].start > source.indexOf('function show'));
});

