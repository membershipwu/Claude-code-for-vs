/**
 * package.json / 演练 Markdown 的结构化本地化。
 * 只改"用户可见"字段，改完强制 JSON 校验。
 */
function localizeManifest(pkg, i18n) {
    const c = pkg.contributes || {};
    let n = 0;
    const bump = () => { n++; };

    if (i18n.description && pkg.description !== i18n.description) { pkg.description = i18n.description; bump(); }
    if (i18n.displayName && pkg.displayName !== i18n.displayName) { pkg.displayName = i18n.displayName; bump(); }

    for (const cmd of c.commands || []) {
        const zh = i18n.commands && i18n.commands[cmd.command];
        if (zh && cmd.title !== zh) { cmd.title = zh; bump(); }
    }

    const cfgs = Array.isArray(c.configuration) ? c.configuration : [c.configuration];
    for (const cfg of cfgs) {
        if (!cfg) continue;
        if (i18n.configurationTitle && cfg.title !== undefined) cfg.title = i18n.configurationTitle;
        for (const [key, prop] of Object.entries(cfg.properties || {})) {
            const tr = i18n.properties && i18n.properties[key];
            if (!tr) continue;
            if (tr.description !== undefined && prop.description !== undefined) { prop.description = tr.description; bump(); }
            if (tr.markdownDescription !== undefined && prop.markdownDescription !== undefined) { prop.markdownDescription = tr.markdownDescription; bump(); }
            if (tr.enumDescriptions && prop.enumDescriptions) { prop.enumDescriptions = tr.enumDescriptions; bump(); }
            if (tr.enumItemLabels && prop.enumItemLabels) { prop.enumItemLabels = tr.enumItemLabels; bump(); }
            if (tr.itemProperties && prop.items && prop.items.properties) {
                for (const [k2, v2] of Object.entries(tr.itemProperties)) {
                    const target = prop.items.properties[k2];
                    if (target && target.description !== undefined) { target.description = v2.description; bump(); }
                }
            }
            if (tr.properties && prop.properties) {
                for (const [k2, v2] of Object.entries(tr.properties)) {
                    const target = prop.properties[k2];
                    if (target && target.description !== undefined) { target.description = v2.description; bump(); }
                }
            }
        }
    }

    for (const group of Object.values(c.viewsContainers || {})) {
        for (const item of group) {
            const zh = i18n.viewsContainers && i18n.viewsContainers[item.id];
            if (zh) { item.title = zh; bump(); }
        }
    }
    for (const group of Object.values(c.views || {})) {
        for (const item of group) {
            const zh = i18n.views && i18n.views[item.id];
            if (zh && item.name !== undefined) { item.name = zh; bump(); }
        }
    }

    for (const wt of c.walkthroughs || []) {
        const tr = i18n.walkthroughs && i18n.walkthroughs[wt.id];
        if (!tr) continue;
        if (tr.title) { wt.title = tr.title; bump(); }
        if (tr.description) { wt.description = tr.description; bump(); }
        for (const step of wt.steps || []) {
            const st = tr.steps && tr.steps[step.id];
            if (!st) continue;
            if (st.title) { step.title = st.title; bump(); }
            if (st.description) { step.description = st.description; bump(); }
        }
    }

    const out = JSON.stringify(pkg, null, 2) + '\n';
    JSON.parse(out);
    return { text: out, changes: n };
}

module.exports = { localizeManifest };
