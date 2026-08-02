onRecordDeleteRequest((e) => {
    const cmsUtil = require(`${__hooks}/utils/cms.js`);
    const activeApp = e.app || $app;
    const categoryId = e.record.id;
    const categorySlug = e.record.getString("slug");

    let clearedProducts = 0;
    try {
        clearedProducts = cmsUtil.clearProductsCategory(activeApp, categoryId);
    } catch (err) {
        console.error("[category-delete-guard] Failed to clear product category relations before delete:", err);
        throw err;
    }

    e.next();

    try {
        const tomlResult = cmsUtil.removeCategoryFromTomlBySlug(categorySlug);
        console.log(
            "[category-delete-guard] Category deleted: " + categorySlug +
            ", clearedProducts=" + clearedProducts +
            ", tomlChanged=" + tomlResult.changed +
            ", staticRebuild=deferred"
        );
    } catch (err) {
        console.error("[category-delete-guard] Category was deleted, but deferred rebuild preparation failed:", err);
    }
}, "categories");
