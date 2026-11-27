/**
 * 汉化引擎：与宿主无关（可在 VS Code 扩展里跑，也可在 Node 里跑）。
 *
 * 设计要点：
 *  - 不内置 Anthropic 的 bundle。首次应用时把当前英文文件快照到本地存储
 *    （按版本号分目录），之后所有补丁都从快照出发 —— 幂等、可还原、升级自动失效。
 *  - 只改字面量内容，改完做 token 结构自证；package.json 走结构化改写并强制 JSON 校验。
 *  - 每次替换都要求落在同一个字面量内部，引号/反引号/`${}` 配平，否则跳过。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { tokenize } = require('./lexer');
const { planSource, editsFromPlan } = require('./planner');
const { localizeManifest } = require('./packageplan');
const { inspectSessionLabels } = require('./session-labels');

const CLAUDE_EXT_RE = /^anthropic\.claude-code-(\d+(?:\.\d+)*)(?:-(.+))?$/i;

/* ------------------------------------------------------------------ */
/* 发现已安装的 Claude Code                                            */
/* ------------------------------------------------------------------ */
function findInstalled(extensionsRoot) {
    let dirs = [];
    try { dirs = fs.readdirSync(extensionsRoot); } catch (e) { return null; }
    const scored = [];
    for (const name of dirs) {
        const m = name.match(CLAUDE_EXT_RE);
        if (!m) continue;
        const full = path.join(extensionsRoot, name);
        if (!fs.existsSync(path.join(full, 'package.json'))) continue;
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch (e) { mtime = 0; }
        scored.push({ name, dir: full, version: m[1], platform: m[2] || '', parts: m[1].split('.').map(Number), mtime });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => {
        const n = Math.max(a.parts.length, b.parts.length);
        for (let i = 0; i < n; i++) {
            const d = (b.parts[i] || 0) - (a.parts[i] || 0);
            if (d) return d;
        }
        return b.mtime - a.mtime;
    });
    return scored[0];
}

function targetFiles(dir) {
    return {
        webview: path.join(dir, 'webview', 'index.js'),
        host: path.join(dir, 'extension.js'),
        pkg: path.join(dir, 'package.json'),
        walkthroughDir: path.join(dir, 'resources', 'walkthrough'),
    };
}

function walkthroughFiles(dir) {
    try {
        return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')).sort();
    } catch (e) { return []; }
}

/* ------------------------------------------------------------------ */
/* 快照：英文原文的本地副本（按版本隔离）                                */
/* ------------------------------------------------------------------ */
function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

function cjkCount(text) { return (text.match(/[\u4e00-\u9fff]/g) || []).length; }

function snapshotDir(storageDir, version) {
    return path.join(storageDir, 'baseline', version);
}

const SNAPSHOT_FILES = new Map([
    ['webview', 'webview'],
    ['host', 'host'],
    ['pkg', 'pkg'],
]);

function snapshotFilename(key) {
    if (SNAPSHOT_FILES.has(key)) return SNAPSHOT_FILES.get(key);
    const match = key.match(/^walkthrough\/([A-Za-z0-9_.-]+\.md)$/);
    return match ? 'walkthrough_' + match[1] : null;
}

function readSnapshot(storageDir, version) {
    if (!/^[0-9]+(?:\.\d+)*$/.test(version)) throw new Error('无效的 Claude Code 版本号，拒绝读取英文快照。');
    const dir = snapshotDir(storageDir, version);
    let raw;
    try {
        raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw new Error('无法读取 ' + version + ' 的英文快照清单：' + e.message);
    }

    let manifest;
    try { manifest = JSON.parse(raw); } catch (e) {
        throw new Error(version + ' 的英文快照清单已损坏，已停止修改目标扩展。');
    }
    const keys = manifest && manifest.files && Object.keys(manifest.files);
    if (!manifest || typeof manifest !== 'object' || manifest.version !== version || !Array.isArray(keys) ||
        !keys.includes('webview') || !keys.includes('host') || !keys.includes('pkg') ||
        !manifest.sha256 || typeof manifest.sha256 !== 'object') {
        throw new Error(version + ' 的英文快照清单不完整或版本不匹配，已停止修改目标扩展。');
    }

    const out = {};
    for (const key of keys) {
        const expected = snapshotFilename(key);
        const filename = manifest.files[key];
        const expectedHash = manifest.sha256[key];
        if (!expected || filename !== expected || path.basename(filename) !== filename ||
            typeof expectedHash !== 'string' || !/^[a-f\d]{64}$/i.test(expectedHash)) {
            throw new Error(version + ' 的英文快照包含无效文件项（' + key + '），已停止修改目标扩展。');
        }
        let value;
        try { value = fs.readFileSync(path.join(dir, filename), 'utf8'); } catch (e) {
            throw new Error(version + ' 的英文快照文件缺失或无法读取（' + key + '），已停止修改目标扩展。');
        }
        if (sha256(value) !== expectedHash) {
            throw new Error(version + ' 的英文快照校验失败（' + key + '）。请先重装 Claude Code 以恢复官方文件；校验通过前不会覆盖现有文件。');
        }
        out[key] = value;
    }
    return { manifest, files: out };
}

/**
 * 建立快照。若当前文件已被汉化（中文过多），拒绝把它当英文基线。
 */
function writeSnapshot(storageDir, version, files) {
    const dir = snapshotDir(storageDir, version);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { version, createdAt: new Date().toISOString(), files: {}, sha256: {} };
    for (const [key, text] of Object.entries(files)) {
        const name = key.replace(/[\\/:*?"<>|]/g, '_');
        fs.writeFileSync(path.join(dir, name), text, 'utf8');
        manifest.files[key] = name;
        manifest.sha256[key] = sha256(text);
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
}

/** Stage every file first and roll back files already replaced on error. */
function atomicWriteFiles(writes) {
    const staged = writes.map(({ file, text }, index) => ({
        file,
        text,
        tmp: file + '.zhcn-' + process.pid + '-' + index + '.tmp',
        original: fs.readFileSync(file),
        committed: false,
    }));
    try {
        for (const item of staged) fs.writeFileSync(item.tmp, item.text, 'utf8');
        for (const item of staged) {
            fs.renameSync(item.tmp, item.file);
            item.committed = true;
        }
    } catch (error) {
        const rollbackErrors = [];
        for (const item of staged.filter((entry) => entry.committed).reverse()) {
            const rollback = item.file + '.zhcn-' + process.pid + '-rollback.tmp';
            try {
                fs.writeFileSync(rollback, item.original);
                fs.renameSync(rollback, item.file);
            } catch (rollbackError) {
                rollbackErrors.push(path.basename(item.file) + ': ' + rollbackError.message);
                try { fs.rmSync(rollback, { force: true }); } catch (cleanupError) { /* best effort */ }
            }
        }
        const suffix = rollbackErrors.length ? '；部分文件回退失败：' + rollbackErrors.join('，') : '；已回退本次写入';
        throw new Error('写入汉化文件失败：' + error.message + suffix);
    } finally {
        for (const item of staged) {
            try { fs.rmSync(item.tmp, { force: true }); } catch (error) { /* best effort */ }
        }
    }
}

/**
 * 从"当前已被汉化的文件"反推英文原文。
 *
 * 场景：用户先用了别的汉化包（或本扩展的旧版本）把文件改成了中文，
 * 此时直接把它当英文基线会把中文永久固化。这里用 zh→en 反查把字面量还原，
 * 并用"再正向打一遍是否与磁盘内容逐字节一致"来自证还原是否正确。
 *
 * @returns {{text:string, ok:boolean, unresolvedCjk:number, roundTrip:boolean}}
 */
function revertSource(src, bundle) {
    const rev = new Map();
    const dup = new Set();
    for (const [en, zh] of Object.entries(bundle.dict)) {
        if (typeof zh !== 'string') continue;
        if (rev.has(zh) && rev.get(zh) !== en) dup.add(zh);
        rev.set(zh, en);
    }
    for (const d of dup) rev.delete(d);

    const toks = tokenize(src).filter((t) => t.type !== 'comment');
    const edits = [];
    for (const tk of toks) {
        if (tk.type !== 'string' && tk.type !== 'template') continue;
        const en = rev.get(tk.value);
        if (en === undefined) continue;
        edits.push({ start: tk.start + 1, end: tk.end - 1, to: en });
    }
    edits.sort((a, b) => a.start - b.start);
    let out = src;
    for (let k = edits.length - 1; k >= 0; k--) out = out.slice(0, edits[k].start) + edits[k].to + out.slice(edits[k].end);

    let roundTrip = false;
    try { roundTrip = patchSource(out, bundle, 'host').text === src || patchSource(out, bundle, 'webview').text === src; } catch (e) { roundTrip = false; }
    return { text: out, ok: edits.length > 0, unresolvedCjk: cjkCount(out), roundTrip };
}

/* ------------------------------------------------------------------ */
/* 数据装载                                                            */
/* ------------------------------------------------------------------ */
function loadJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function loadBundle(dataDir) {
    return {
        dict: loadJson(path.join(dataDir, 'merged-dict.json'), {}),
        normDict: loadJson(path.join(dataDir, 'dict-norm.json'), {}),
        labels: loadJson(path.join(dataDir, 'i18n-labels.json'), {}),
        skip: loadJson(path.join(dataDir, 'i18n-skip.json'), { patterns: [] }),
        outOfScope: loadJson(path.join(dataDir, 'i18n-outofscope.json'), { categories: [] }),
        reviewed: loadJson(path.join(dataDir, 'i18n-reviewed.json'), { exceptions: [] }),
        manifest: loadJson(path.join(dataDir, 'i18n-package.json'), {}),
        support: loadJson(path.join(dataDir, 'versions.json'), { versions: {} }),
        scope: loadJson(path.join(dataDir, 'scope.json'), {}),
    };
}

/* ------------------------------------------------------------------ */
/* 补丁应用                                                            */
/* ------------------------------------------------------------------ */
function isSafeReplacement(token, newBody) {
    const q = token.quote;
    if (q === '`') {
        let depth = 0, inStr = null;
        for (let i = 0; i < newBody.length; i++) {
            const c = newBody[i];
            if (c === '\\') { i++; continue; }
            if (inStr) { if (c === inStr) inStr = null; continue; }
            if (depth > 0 && (c === '"' || c === "'" || c === '`')) { inStr = c; continue; }
            if (c === '$' && newBody[i + 1] === '{') { depth++; i++; continue; }
            if (depth > 0 && c === '{') { depth++; continue; }
            if (depth > 0 && c === '}') { depth--; continue; }
            if (depth === 0 && c === '`') return 'literal backtick';
        }
        if (depth !== 0) return 'unbalanced ${...}';
        return null;
    }
    if (newBody.includes(q)) return 'contains quote ' + q;
    if (newBody.includes('\n')) return 'contains newline';
    if (/\\$/.test(newBody)) return 'ends with backslash';
    return null;
}

function syntaxCheckCopy(src, tokens) {
    const replacements = [];
    for (let i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].type !== 'ident' || tokens[i].value !== 'import' ||
            tokens[i + 1].type !== 'punct' || tokens[i + 1].value !== '.' ||
            tokens[i + 2].type !== 'ident' || tokens[i + 2].value !== 'meta') continue;
        const previous = tokens[i - 1];
        if (previous && previous.type === 'punct' && (previous.value === '.' || previous.value === '?.')) continue;
        replacements.push({ start: tokens[i].start, end: tokens[i + 2].end, text: '({})' });
        i += 2;
    }
    let checkSrc = src;
    for (let i = replacements.length - 1; i >= 0; i--) {
        const item = replacements[i];
        checkSrc = checkSrc.slice(0, item.start) + item.text + checkSrc.slice(item.end);
    }
    return checkSrc;
}

function validateJavaScriptSyntax(src) {
    const tokens = tokenize(src).filter((token) => token.type !== 'comment');
    new Function(syntaxCheckCopy(src, tokens));
}

/**
 * 对一段源码按计划做字面量替换，并返回结构自证结果。
 */
function patchSource(src, bundle, kind) {
    const toks = tokenize(src).filter((t) => t.type !== 'comment');
    const scope = (bundle.scope || {})[kind];
    const plan = planSource(toks, bundle.dict, bundle.normDict, bundle.labels, scope ? { allowKinds: scope.allowKinds } : undefined);
    const edits = editsFromPlan(plan, bundle.dict, bundle.normDict);

    const list = [];
    let skipped = 0;
    for (let i = 0; i < toks.length; i++) {
        if (!edits.has(i)) continue;
        const tk = toks[i];
        if (tk.type !== 'string' && tk.type !== 'template') continue;
        const e = edits.get(i);
        if (e.zh === tk.value) continue;
        if (isSafeReplacement(tk, e.zh)) { skipped++; continue; }
        list.push({ start: tk.start + 1, end: tk.end - 1, to: e.zh, tokenIndex: i });
    }
    list.sort((a, b) => a.start - b.start);

    let out = src;
    for (let k = list.length - 1; k >= 0; k--) out = out.slice(0, list[k].start) + list[k].to + out.slice(list[k].end);

    // 结构自证
    const after = tokenize(out).filter((t) => t.type !== 'comment');
    if (after.length !== toks.length) throw new Error(`token 数量变化 ${toks.length} → ${after.length}`);
    let changed = 0;
    for (let i = 0; i < toks.length; i++) {
        if (toks[i].type !== after[i].type) throw new Error(`token 类型变化 @${i}`);
        if (toks[i].value !== after[i].value) {
            changed++;
            if (!edits.has(i)) throw new Error(`非计划内位置被修改 @${i}`);
        }
    }
    try { validateJavaScriptSyntax(out); } catch (e) { throw new Error('语法校验失败: ' + e.message); }

    return { text: out, changed, skipped, planned: plan.items.length, stats: plan.stats };
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                             */
/* ------------------------------------------------------------------ */
class Engine {
    /**
     * @param {object} opts
     * @param {string} opts.extensionsRoot  ~/.vscode/extensions
     * @param {string} opts.storageDir      扩展的 globalStorage 目录
     * @param {string} opts.dataDir         本扩展 data/ 目录
     */
    constructor(opts) {
        this.extensionsRoot = opts.extensionsRoot;
        this.storageDir = opts.storageDir;
        this.dataDir = opts.dataDir;
        this.bundle = loadBundle(opts.dataDir);
    }

    installed() {
        const info = findInstalled(this.extensionsRoot);
        if (!info) return null;
        return { ...info, files: targetFiles(info.dir), version: info.version };
    }

    /** 读取英文原文：优先快照；没有快照则从当前安装文件建立 */
    englishFiles(info) {
        let snap = readSnapshot(this.storageDir, info.version);
        if (snap) return { files: snap.files, from: 'snapshot' };

        const files = {};
        files.webview = fs.readFileSync(info.files.webview, 'utf8');
        files.host = fs.readFileSync(info.files.host, 'utf8');
        files.pkg = fs.readFileSync(info.files.pkg, 'utf8');
        const md = walkthroughFiles(info.files.walkthroughDir);
        for (const name of md) files['walkthrough/' + name] = fs.readFileSync(path.join(info.files.walkthroughDir, name), 'utf8');

        // 防御：已经被汉化过的文件不能当基线。先尝试反推英文原文。
        if (cjkCount(files.webview) > 5000 || cjkCount(files.host) > 2000) {
            const w = revertSource(files.webview, this.bundle);
            const h = revertSource(files.host, this.bundle);
            // 理想情况：往返校验通过（说明磁盘内容就是本词典打出来的）。
            // 否则退一步：只要反推后剩下的中文很少（<200 字符），说明绝大部分中文确实是我们的译文，
            // 仍可采用，但标记为"重建基线"，供状态栏提示用户复核。
            const strict = w.roundTrip && h.roundTrip;
            const lenient = (w.unresolvedCjk + h.unresolvedCjk) < 200;
            if (!strict && !lenient) {
                throw new Error(
                    '当前安装的 Claude Code 已被汉化，且无法自动反推英文原文（残留中文过多）。' +
                    '请先在本扩展里执行「还原英文原版」，或用 VS Code 重装该扩展后再应用汉化。'
                );
            }
            files.webview = w.text;
            files.host = h.text;
            this.lastAdopt = { adopted: true, strict, unresolvedCjk: w.unresolvedCjk + h.unresolvedCjk };
        } else {
            this.lastAdopt = { adopted: false };
        }
        writeSnapshot(this.storageDir, info.version, files);
        return { files, from: 'live' };
    }

    /** 当前是否已应用汉化 */
    status() {
        const info = this.installed();
        if (!info) return { ok: false, reason: 'not-installed' };
        const webview = fs.readFileSync(info.files.webview, 'utf8');
        const host = fs.readFileSync(info.files.host, 'utf8');
        let pkgCmdZh = 0, pkgCmdAll = 0;
        try {
            const pkg = JSON.parse(fs.readFileSync(info.files.pkg, 'utf8'));
            const cmds = (pkg.contributes && pkg.contributes.commands) || [];
            pkgCmdAll = cmds.length;
            pkgCmdZh = cmds.filter((c) => /[\u4e00-\u9fff]/.test(c.title || '')).length;
        } catch (e) { /* ignore */ }
        const snap = readSnapshot(this.storageDir, info.version);
        const support = (this.bundle.support.versions || {})[info.version];
        const localized = cjkCount(webview) > 5000 && pkgCmdAll > 0 && pkgCmdZh === pkgCmdAll;
        const sessionLabels = inspectSessionLabels(webview, this.bundle.dict);
        return {
            ok: true,
            version: info.version,
            dir: info.dir,
            patched: localized && sessionLabels.missing.length === 0,
            needsUpdate: localized && sessionLabels.missing.length > 0,
            sessionLabels,
            cjkWebview: cjkCount(webview),
            cjkHost: cjkCount(host),
            commands: { translated: pkgCmdZh, total: pkgCmdAll },
            hasSnapshot: !!snap,
            supported: support ? support.status : 'untested',
            dictSize: Object.keys(this.bundle.dict).length,
        };
    }

    /** 应用汉化 */
    apply() {
        const info = this.installed();
        if (!info) throw new Error('未找到已安装的 Claude Code 扩展。');
        const { files } = this.englishFiles(info);

        const rw = patchSource(files.webview, this.bundle, 'webview');
        const rh = patchSource(files.host, this.bundle, 'host');
        const sessionLabels = inspectSessionLabels(rw.text, this.bundle.dict);
        if (sessionLabels.missing.length) {
            throw new Error('状态筛选文案校验未通过：' + sessionLabels.missing.join('、') + '。尚未写入任何汉化文件。');
        }

        const pkg = JSON.parse(files.pkg);
        const pm = localizeManifest(pkg, this.bundle.manifest);

        const mdWrites = [];
        for (const [key, text] of Object.entries(files)) {
            if (!key.startsWith('walkthrough/')) continue;
            const name = key.slice('walkthrough/'.length);
            const zh = (this.bundle.manifest.markdownFiles || {})[name];
            if (!zh) continue;
            mdWrites.push({ file: path.join(info.files.walkthroughDir, name), text: zh });
        }

        // 全部计算成功后才落盘（原子性：避免半途失败留下混合状态）
        const writes = [
            { file: info.files.webview, text: rw.text },
            { file: info.files.host, text: rh.text },
            { file: info.files.pkg, text: pm.text },
            ...mdWrites,
        ];
        atomicWriteFiles(writes);

        return {
            version: info.version,
            webview: { changed: rw.changed, skipped: rw.skipped },
            host: { changed: rh.changed, skipped: rh.skipped },
            manifestChanges: pm.changes,
            markdown: mdWrites.length,
        };
    }

    /** 还原英文原版 */
    restore() {
        const info = this.installed();
        if (!info) throw new Error('未找到已安装的 Claude Code 扩展。');
        const snap = readSnapshot(this.storageDir, info.version);
        if (!snap) throw new Error(`没有 ${info.version} 的英文快照，无法还原。请重装扩展或使用「重置快照」。`);
        const writes = [];
        for (const [key, text] of Object.entries(snap.files)) {
            let file;
            if (key === 'webview') file = info.files.webview;
            else if (key === 'host') file = info.files.host;
            else if (key === 'pkg') file = info.files.pkg;
            else if (key.startsWith('walkthrough/')) file = path.join(info.files.walkthroughDir, key.slice('walkthrough/'.length));
            else continue;
            writes.push({ file, text });
        }
        atomicWriteFiles(writes);
        const n = writes.length;
        return { version: info.version, restored: n };
    }

    /** 删除快照（下次应用会以当前安装文件重建） */
    dropSnapshot(version) {
        if (!/^\d+(?:\.\d+)*$/.test(version)) throw new Error('无效的 Claude Code 版本号，拒绝删除快照。');
        const installed = this.installed();
        if (installed && installed.version === version) {
            const snapshot = readSnapshot(this.storageDir, version);
            if (snapshot) {
                for (const [key, original] of Object.entries(snapshot.files)) {
                    let file;
                    if (key === 'webview') file = installed.files.webview;
                    else if (key === 'host') file = installed.files.host;
                    else if (key === 'pkg') file = installed.files.pkg;
                    else if (key.startsWith('walkthrough/')) file = path.join(installed.files.walkthroughDir, key.slice('walkthrough/'.length));
                    if (file && (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== original)) {
                        throw new Error('当前 Claude Code 文件与英文快照不同。请先运行 restore 并检查版本，再删除唯一可用的英文快照。');
                    }
                }
            }
        }
        const dir = snapshotDir(this.storageDir, version);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { Engine, findInstalled, revertSource, patchSource, validateJavaScriptSyntax, targetFiles, walkthroughFiles, readSnapshot, writeSnapshot, snapshotDir, cjkCount, sha256, atomicWriteFiles };
