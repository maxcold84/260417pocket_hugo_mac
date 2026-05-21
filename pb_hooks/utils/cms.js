function syncCategoriesFromToml(app, tomlStr) {
    const activeApp = app || $app;
    // If tomlStr is not provided, read it from hugo/hugo.toml
    if (!tomlStr) {
        try {
            const tomlBytes = $os.readFile("hugo/hugo.toml");
            const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
            tomlStr = decodeURIComponent(escape(tomlBinaryStr));
        } catch (err) {
            console.error("[cms-util] Failed to read hugo.toml:", err);
            return;
        }
    }

    const parsedCategories = [];
    const parts = tomlStr.split(/\[\[params\.categories\]\]/);
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const nameMatch = part.match(/name\s*=\s*"([^"]+)"/);
        const nameEnMatch = part.match(/nameEn\s*=\s*"([^"]+)"/);
        const slugMatch = part.match(/slug\s*=\s*"([^"]+)"/);
        const iconMatch = part.match(/icon\s*=\s*"([^"]+)"/);
        
        if (nameMatch && slugMatch) {
            parsedCategories.push({
                name: nameMatch[1],
                nameEn: nameEnMatch ? nameEnMatch[1] : nameMatch[1],
                slug: slugMatch[1],
                icon: iconMatch ? iconMatch[1] : "lightning",
                sort_order: i
            });
        }
    }

    if (parsedCategories.length === 0) {
        return;
    }

    const categoriesCollection = activeApp.findCollectionByNameOrId("categories");
    const dbCategories = activeApp.findRecordsByFilter("categories", "1=1", "sort_order", 100, 0);
    const dbCatMap = {};
    for (let cat of dbCategories) {
        dbCatMap[cat.getString("slug")] = cat;
    }

    // Insert or update categories from TOML
    for (let pCat of parsedCategories) {
        let record = dbCatMap[pCat.slug];
        if (!record) {
            record = new Record(categoriesCollection);
        }
        record.set("name", pCat.name);
        record.set("slug", pCat.slug);
        record.set("sort_order", pCat.sort_order);
        activeApp.save(record);
    }
    console.log("[cms-util] Successfully synced " + parsedCategories.length + " categories to DB.");
}

function runHugo() {
    const paths = ["/opt/homebrew/bin/hugo", "/usr/local/bin/hugo", "hugo"];
    let lastErr = null;
    for (let p of paths) {
        try {
            const cmd = $os.cmd(p, "--ignoreCache");
            cmd.dir = "hugo";
            cmd.run();
            console.log("[runHugo] Successfully executed hugo using: " + p);
            return true;
        } catch (err) {
            lastErr = err;
            console.warn("[runHugo] Failed to run hugo with path '" + p + "': " + err);
        }
    }
    throw new Error("모든 경로에서 Hugo 실행에 실패했습니다. 마지막 오류: " + lastErr);
}

module.exports = {
    syncCategoriesFromToml: syncCategoriesFromToml,
    runHugo: runHugo
};
