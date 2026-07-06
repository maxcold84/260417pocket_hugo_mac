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

function readUtf8File(path) {
    const bytes = $os.readFile(path);
    const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return decodeURIComponent(escape(binaryStr));
}

const THEME_ROOT = "hugo/themes";
const DEFAULT_THEME_ID = "default";

function isValidThemeId(themeId) {
    return /^[a-z0-9][a-z0-9_-]*$/.test(String(themeId || ""));
}

function themePath(themeId) {
    return THEME_ROOT + "/" + themeId;
}

function themeTomlPath(themeId) {
    return themePath(themeId) + "/theme.toml";
}

function themeDirectoryExists(themeId) {
    if (!isValidThemeId(themeId)) return false;
    try {
        $os.readDir(themePath(themeId));
        return true;
    } catch (err) {
        return false;
    }
}

function tomlStringValue(tomlStr, key) {
    const lines = String(tomlStr || "").split("\n");
    const pattern = new RegExp("^\\s*" + key + "\\s*=\\s*\"([^\"]*)\"");
    for (const line of lines) {
        const match = line.match(pattern);
        if (match) return match[1];
    }
    return "";
}

function parseThemeMetadata(themeId) {
    let meta = "";
    try {
        meta = readUtf8File(themeTomlPath(themeId));
    } catch (err) {
        return null;
    }

    return {
        id: themeId,
        name: tomlStringValue(meta, "name") || themeId,
        description: tomlStringValue(meta, "description") || "",
        version: tomlStringValue(meta, "version") || "",
        minVersion: tomlStringValue(meta, "min_version") || ""
    };
}

function sortThemes(themes) {
    themes.sort(function(left, right) {
        if (left.id === DEFAULT_THEME_ID) return -1;
        if (right.id === DEFAULT_THEME_ID) return 1;
        return left.id.localeCompare(right.id);
    });
    return themes;
}

function listThemes() {
    const themes = [];
    let entries = [];
    try {
        entries = $os.readDir(THEME_ROOT);
    } catch (err) {
        return themes;
    }

    for (const entry of entries) {
        const id = entry.name();
        if (!isValidThemeId(id) || !themeDirectoryExists(id)) continue;
        const metadata = parseThemeMetadata(id);
        if (metadata) {
            themes.push(metadata);
        }
    }

    return sortThemes(themes);
}

function splitTopLevelToml(tomlStr) {
    const lines = String(tomlStr || "").split("\n");
    let firstTableIndex = lines.length;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*\[/.test(lines[i])) {
            firstTableIndex = i;
            break;
        }
    }
    return { lines: lines, firstTableIndex: firstTableIndex };
}

function parseThemeValue(rawValue) {
    const raw = String(rawValue || "").trim();
    if (raw.indexOf("[") === 0) {
        const themes = [];
        const matcher = /"([^"]+)"/g;
        let match = matcher.exec(raw);
        while (match) {
            themes.push(match[1]);
            match = matcher.exec(raw);
        }
        return themes;
    }

    const stringMatch = raw.match(/^"([^"]+)"/);
    return stringMatch ? [stringMatch[1]] : [];
}

function getActiveTheme(tomlStr) {
    const topLevel = splitTopLevelToml(tomlStr);
    for (let i = 0; i < topLevel.firstTableIndex; i++) {
        const match = topLevel.lines[i].match(/^\s*theme\s*=\s*(.+)$/);
        if (!match) continue;
        const themes = parseThemeValue(match[1]);
        if (themes.length > 0 && isValidThemeId(themes[0])) {
            return themes[0];
        }
    }
    return DEFAULT_THEME_ID;
}

function themeTomlLine(themeId) {
    const themes = themeId === DEFAULT_THEME_ID
        ? [DEFAULT_THEME_ID]
        : [themeId, DEFAULT_THEME_ID];
    return "theme = [" + themes.map(function(id) { return "\"" + id + "\""; }).join(", ") + "]";
}

function setTopLevelTheme(tomlStr, themeId) {
    const topLevel = splitTopLevelToml(tomlStr);
    let replaced = false;
    const themeLine = themeTomlLine(themeId);

    for (let i = 0; i < topLevel.firstTableIndex; i++) {
        if (/^\s*theme\s*=/.test(topLevel.lines[i])) {
            topLevel.lines[i] = themeLine;
            replaced = true;
            break;
        }
    }

    if (!replaced) {
        let insertIndex = topLevel.firstTableIndex;
        for (let i = 0; i < topLevel.firstTableIndex; i++) {
            if (/^\s*title\s*=/.test(topLevel.lines[i])) {
                insertIndex = i + 1;
            }
        }
        topLevel.lines.splice(insertIndex, 0, themeLine);
    }

    return topLevel.lines.join("\n");
}

function withActiveTheme(themes, activeTheme) {
    return themes.map(function(theme) {
        return {
            id: theme.id,
            name: theme.name,
            description: theme.description,
            version: theme.version,
            minVersion: theme.minVersion,
            active: theme.id === activeTheme
        };
    });
}

function resolveThemeSettings() {
    const tomlStr = readUtf8File("hugo/hugo.toml");
    const activeTheme = getActiveTheme(tomlStr);
    return {
        toml: tomlStr,
        activeTheme: activeTheme,
        themes: withActiveTheme(listThemes(), activeTheme)
    };
}

function applyThemeSelection(themeId) {
    const selectedTheme = String(themeId || "").trim();
    if (!isValidThemeId(selectedTheme)) {
        throw new Error("유효하지 않은 테마 ID입니다.");
    }

    const themes = listThemes();
    let exists = false;
    for (const theme of themes) {
        if (theme.id === selectedTheme) {
            exists = true;
            break;
        }
    }

    if (!exists) {
        throw new Error("존재하지 않는 테마입니다: " + selectedTheme);
    }

    const updatedToml = setTopLevelTheme(readUtf8File("hugo/hugo.toml"), selectedTheme);
    $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);

    return {
        toml: updatedToml,
        activeTheme: selectedTheme,
        themes: withActiveTheme(themes, selectedTheme)
    };
}

function removeCategoryFromTomlBySlug(slug) {
    if (!slug) {
        return { changed: false, toml: "" };
    }

    const tomlStr = readUtf8File("hugo/hugo.toml");
    const parts = tomlStr.split("[[params.categories]]");
    if (parts.length <= 1) {
        return { changed: false, toml: tomlStr };
    }

    const header = parts[0];
    const remainingBlocks = [];
    let removed = false;

    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const slugMatch = block.match(/slug\s*=\s*"([^"]+)"/);
        if (slugMatch && slugMatch[1] === slug) {
            removed = true;
            continue;
        }
        remainingBlocks.push(block);
    }

    if (!removed) {
        return { changed: false, toml: tomlStr };
    }

    let updatedToml = header;
    if (remainingBlocks.length > 0) {
        updatedToml += "[[params.categories]]" + remainingBlocks.join("[[params.categories]]");
    }

    $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);
    return { changed: true, toml: updatedToml };
}

function pruneCategoryTomlToDb(app) {
    const activeApp = app || $app;
    const tomlStr = readUtf8File("hugo/hugo.toml");
    const parts = tomlStr.split("[[params.categories]]");
    if (parts.length <= 1) {
        return {
            changed: false,
            toml: tomlStr,
            kept: 0,
            removed: 0
        };
    }

    const dbCategories = activeApp.findRecordsByFilter("categories", "1=1", "sort_order", 1000, 0);
    const dbSlugMap = {};
    for (const cat of dbCategories) {
        const slug = cat.getString("slug");
        if (slug) {
            dbSlugMap[slug] = true;
        }
    }

    const header = parts[0];
    const remainingBlocks = [];
    let removedCount = 0;

    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const slugMatch = block.match(/slug\s*=\s*"([^"]+)"/);
        if (slugMatch && !dbSlugMap[slugMatch[1]]) {
            removedCount++;
            continue;
        }
        remainingBlocks.push(block);
    }

    let updatedToml = header;
    if (remainingBlocks.length > 0) {
        updatedToml += "[[params.categories]]" + remainingBlocks.join("[[params.categories]]");
    }

    const changed = updatedToml !== tomlStr;
    if (changed) {
        $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);
    }

    return {
        changed: changed,
        toml: updatedToml,
        kept: remainingBlocks.length,
        removed: removedCount
    };
}

function clearRelationFieldReferences(app, collectionName, fieldName, relationId) {
    if (!collectionName || !fieldName || !relationId) {
        return 0;
    }

    const activeApp = app || $app;
    let offset = 0;
    let clearedCount = 0;

    while (true) {
        const records = activeApp.findRecordsByFilter(collectionName, "1=1", "", 1000, offset);
        if (!records || records.length === 0) {
            break;
        }

        for (const record of records) {
            if (record.getString(fieldName) === relationId) {
                record.set(fieldName, "");
                activeApp.save(record);
                clearedCount++;
            }
        }

        if (records.length < 1000) {
            break;
        }
        offset += records.length;
    }

    return clearedCount;
}

function clearProductsCategory(app, categoryId) {
    return clearRelationFieldReferences(app, "products", "category", categoryId);
}

function ensureDir(path, label) {
    try {
        $os.mkdirAll(path, 0o755);
    } catch (err) {
        const name = label || path;
        throw new Error("필수 디렉터리 생성 실패: " + name + " (" + path + "): " + String(err));
    }
}

function prepareHugoContentTree() {
    ensureDir("hugo/content/products", "상품 Markdown 디렉터리");
}

function isImageUsed(filename, usedImagePrefixes) {
    for (const prefix of usedImagePrefixes) {
        if (filename.indexOf(prefix) === 0) {
            return true;
        }
    }
    return false;
}

function syncProductsToMarkdown(app) {
    const activeApp = app || $app;

    prepareHugoContentTree();

    const products = activeApp.findRecordsByFilter("products", "1=1", "sort_order", 1000, 0);
    const dbSlugs = {};
    const usedImagePrefixes = [];

    for (const p of products) {
        const slug = p.getString("slug");
        if (slug) {
            dbSlugs[slug] = true;
        }

        const images = p.getStringSlice("images");
        if (images && images.length > 0) {
            for (const img of images) {
                const base = img.replace(/\.[^.]+$/, "");
                usedImagePrefixes.push(base);
            }
        }
    }

    let deletedProductCount = 0;
    try {
        const entries = $os.readDir("hugo/content/products");
        for (const entry of entries) {
            const filename = entry.name();
            if (!filename.endsWith(".md")) {
                continue;
            }
            const slug = filename.slice(0, -3);
            if (!dbSlugs[slug]) {
                try { $os.remove("hugo/content/products/" + filename); } catch (e) {}
                try { $os.removeAll("pb_public/products/" + slug); } catch (e) {}
                deletedProductCount++;
            }
        }
    } catch (err) {
        console.error("readDir (products) error:", err);
    }

    let deletedImageCount = 0;
    try {
        const resEntries = $os.readDir("hugo/resources/_gen/images");
        for (const entry of resEntries) {
            const filename = entry.name();
            if (!isImageUsed(filename, usedImagePrefixes)) {
                try { $os.remove("hugo/resources/_gen/images/" + filename); } catch (e) {}
                deletedImageCount++;
            }
        }
    } catch (err) {
        console.error("readDir (resources/_gen/images) error:", err);
    }

    try {
        const pubEntries = $os.readDir("pb_public");
        for (const entry of pubEntries) {
            const filename = entry.name();
            if (!filename.endsWith(".webp") && !filename.endsWith(".jpg") && !filename.endsWith(".png")) {
                continue;
            }
            if (!isImageUsed(filename, usedImagePrefixes)) {
                try { $os.remove("pb_public/" + filename); } catch (e) {}
                deletedImageCount++;
            }
        }
    } catch (err) {
        console.error("readDir (pb_public) error:", err);
    }

    let syncedCount = 0;
    let clearedBrokenCategoryCount = 0;
    for (const p of products) {
        const slug = p.getString("slug");
        if (!slug) {
            continue;
        }

        const name = p.getString("name").replace(/"/g, '\\"');
        const price = p.getInt("price");
        const description = p.getString("description");

        const images = p.getStringSlice("images");
        let imageLine = "";
        if (images && images.length > 0) {
            const collectionId = p.collection().id;
            const recordId = p.id;
            const imageUrls = [];
            for (const img of images) {
                imageUrls.push('"/api/files/' + collectionId + '/' + recordId + '/' + img + '"');
            }
            imageLine = '\nimages: [' + imageUrls.join(', ') + ']\nimage: ' + imageUrls[0];
        }

        const sortOrder = p.getInt("sort_order");
        const discountPrice = p.getInt("discount_price");
        const stock = p.getInt("stock");
        const ratingAverage = Number(p.get("rating_average") || 0);
        const ratingCount = p.getInt("rating_count");
        const categoryId = p.getString("category");
        let categorySlug = "";
        if (categoryId) {
            try {
                const catRec = activeApp.findRecordById("categories", categoryId);
                categorySlug = catRec.getString("slug");
            } catch (err) {
                console.error("[cms-util] Clearing missing category relation for product " + p.id + ":", err);
                try {
                    p.set("category", "");
                    activeApp.save(p);
                    clearedBrokenCategoryCount++;
                } catch (saveErr) {
                    console.error("[cms-util] Failed to clear missing category relation for product " + p.id + ":", saveErr);
                }
            }
        }

        const content = '---\nid: "' + p.id + '"\ntitle: "' + name + '"\nprice: ' + price + '\ndiscount_price: ' + discountPrice + '\nstock: ' + stock + '\nrating_average: ' + ratingAverage + '\nrating_count: ' + ratingCount + '\nweight: ' + sortOrder + '\ncategory: "' + categorySlug + '"' + imageLine + '\n---\n' + description + '\n';
        $os.writeFile("hugo/content/products/" + slug + ".md", content, 0o644);
        syncedCount++;
    }

    return {
        synced: syncedCount,
        deletedPages: deletedProductCount,
        deletedImages: deletedImageCount,
        clearedBrokenCategories: clearedBrokenCategoryCount
    };
}

function syncProductsAndRunHugo(app, e) {
    const syncResult = syncProductsToMarkdown(app);
    const hugoResult = runHugo(e);
    return {
        sync: syncResult,
        hugo: hugoResult
    };
}

function addCommandCandidate(candidates, value) {
    const candidate = String(value || "").trim();
    if (!candidate) return;
    for (const existing of candidates) {
        if (existing === candidate) return;
    }
    candidates.push(candidate);
}

function shellQuote(value) {
    return "'" + String(value || "").replace(/'/g, "'\\''") + "'";
}

function decodeOutput(outputBytes) {
    const binaryStr = Array.from(outputBytes).map(b => String.fromCharCode(b)).join('');
    try {
        return decodeURIComponent(escape(binaryStr));
    } catch (err) {
        return binaryStr;
    }
}

function buildHugoPaths(envUtil) {
    const paths = [];
    addCommandCandidate(paths, envUtil.get("HUGO_BIN"));
    addCommandCandidate(paths, envUtil.get("HUGO_PATH"));
    addCommandCandidate(paths, "/usr/local/bin/hugo");
    addCommandCandidate(paths, "/usr/bin/hugo");
    addCommandCandidate(paths, "/opt/homebrew/bin/hugo");
    addCommandCandidate(paths, "hugo");
    return paths;
}

function runHugo(e) {
    let baseURL = "";
    let internalURL = "";
    let envUtil = null;

    // 1. Resolve internal URL
    try {
        envUtil = require(`${__hooks}/utils/env.js`);
        internalURL = envUtil.get("POCKETBASE_INTERNAL_URL") || "http://127.0.0.1:8090/";
    } catch (err) {
        internalURL = "http://127.0.0.1:8090/";
    }

    // Ensure trailing slash for internalURL
    if (internalURL && !internalURL.endsWith("/")) {
        internalURL += "/";
    }

    // 2. Resolve external baseURL
    if (e && e.request) {
        try {
            let scheme = "http";
            const proto = e.request.header.get("X-Forwarded-Proto") || "";
            if (proto.indexOf("https") !== -1 || e.request.tls) {
                scheme = "https";
            }
            const host = e.request.host || "localhost:8090";
            baseURL = scheme + "://" + host + "/";
        } catch (err) {
            console.warn("[runHugo] Failed to parse request host:", err);
        }
    }

    // If still empty, fall back to environment variable or site default
    if (!baseURL) {
        try {
            if (!envUtil) envUtil = require(`${__hooks}/utils/env.js`);
            baseURL = envUtil.get("HUGO_BASEURL") || "http://localhost:8090/";
        } catch (err) {
            baseURL = "http://localhost:8090/";
        }
    }

    // Ensure trailing slash for baseURL
    if (baseURL && !baseURL.endsWith("/")) {
        baseURL += "/";
    }

    console.log("[runHugo] Building site with baseURL: " + baseURL + ", internalURL: " + internalURL);

    const envPrefix = [];
    envPrefix.push("HUGO_POCKETBASE_INTERNAL_URL=" + shellQuote(internalURL));
    envPrefix.push("POCKETBASE_INTERNAL_URL=" + shellQuote(internalURL));
    envPrefix.push("HUGO_BASEURL=" + shellQuote(baseURL));

    if (!envUtil) {
        envUtil = {
            get: function() { return ""; }
        };
    }

    const paths = buildHugoPaths(envUtil);
    let lastOutput = "";

    for (const p of paths) {
        try {
            const cmdStr = envPrefix.join(" ") + " " + shellQuote(p) + " --ignoreCache -b " + shellQuote(baseURL);
            const cmd = $os.cmd("sh", "-c", cmdStr);
            cmd.dir = "hugo";

            let outputBytes;
            try {
                outputBytes = cmd.output();
            } catch (outputErr) {
                cmd.run();
                console.log("[runHugo] Successfully executed (run): " + cmdStr);
                return { success: true, output: "" };
            }

            const outputStr = decodeOutput(outputBytes);
            console.log("[runHugo] Successfully executed: " + cmdStr);
            console.log("[runHugo] Hugo output:\n" + outputStr);
            return { success: true, output: outputStr };
        } catch (err) {
            const errStr = String(err);
            lastOutput = errStr;
            console.warn("[runHugo] Failed execution for '" + p + "': " + errStr);
        }
    }
    throw new Error("Hugo 빌드 실패. 마지막 오류:\n" + lastOutput);
}

module.exports = {
    syncCategoriesFromToml: syncCategoriesFromToml,
    removeCategoryFromTomlBySlug: removeCategoryFromTomlBySlug,
    pruneCategoryTomlToDb: pruneCategoryTomlToDb,
    clearRelationFieldReferences: clearRelationFieldReferences,
    clearProductsCategory: clearProductsCategory,
    prepareHugoContentTree: prepareHugoContentTree,
    syncProductsToMarkdown: syncProductsToMarkdown,
    syncProductsAndRunHugo: syncProductsAndRunHugo,
    listThemes: listThemes,
    getActiveTheme: getActiveTheme,
    resolveThemeSettings: resolveThemeSettings,
    applyThemeSelection: applyThemeSelection,
    runHugo: runHugo
};
